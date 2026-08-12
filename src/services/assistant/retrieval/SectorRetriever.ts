import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';

// Confirmed by a direct column dump against both market_assets and us_market_assets (Aug
// 2026) — both markets share the same Yahoo-style sector taxonomy, so one list covers both.
// A blank-string sector also exists on a handful of market_assets rows (unclassified) and is
// deliberately excluded, same as any other genuinely-missing field elsewhere in this pipeline.
export const SECTOR_LIST = [
  'Basic Materials', 'Communication Services', 'Consumer Cyclical', 'Consumer Defensive',
  'Energy', 'Financial Services', 'Healthcare', 'Industrials', 'Real Estate', 'Technology',
  'Utilities',
] as const;

export type SectorName = (typeof SECTOR_LIST)[number];

// Curated table for how people actually phrase a sector, since the real column values are
// Yahoo's formal sector names — same "curated table, still validated against the real
// universe" discipline as IntentClassifier's SYMBOL_ALIASES. Extend as real misses turn up.
const SECTOR_ALIASES: Record<string, SectorName> = {
  it: 'Technology', tech: 'Technology', software: 'Technology',
  bank: 'Financial Services', banks: 'Financial Services', banking: 'Financial Services', finance: 'Financial Services', financial: 'Financial Services', nbfc: 'Financial Services',
  pharma: 'Healthcare', pharmaceutical: 'Healthcare', pharmaceuticals: 'Healthcare', health: 'Healthcare',
  auto: 'Consumer Cyclical', automobile: 'Consumer Cyclical', automotive: 'Consumer Cyclical', retail: 'Consumer Cyclical',
  fmcg: 'Consumer Defensive', staples: 'Consumer Defensive',
  oil: 'Energy', gas: 'Energy', 'oil and gas': 'Energy',
  power: 'Utilities', utility: 'Utilities',
  metals: 'Basic Materials', materials: 'Basic Materials', mining: 'Basic Materials', chemicals: 'Basic Materials',
  realty: 'Real Estate', 'real estate': 'Real Estate', reit: 'Real Estate', reits: 'Real Estate',
  telecom: 'Communication Services', media: 'Communication Services', entertainment: 'Communication Services',
  infra: 'Industrials', infrastructure: 'Industrials', engineering: 'Industrials', capital_goods: 'Industrials',
};

/** Resolves free text ("IT sector", "banking stocks") to a real sector column value, or null
 * if nothing matches — never guesses a sector that isn't real, same discipline as
 * resolveProposedSymbols() in IntentClassifier.ts. */
export function resolveSectorName(raw: string): SectorName | null {
  const lower = raw.toLowerCase().trim();
  if (!lower) return null;

  const exact = SECTOR_LIST.find(s => s.toLowerCase() === lower);
  if (exact) return exact;
  if (SECTOR_ALIASES[lower]) return SECTOR_ALIASES[lower];

  for (const s of SECTOR_LIST) {
    if (lower.includes(s.toLowerCase())) return s;
  }

  const aliasKeys = Object.keys(SECTOR_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of aliasKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) return SECTOR_ALIASES[key];
  }
  return null;
}

interface SectorRow {
  symbol: string;
  name: string | null;
  pe_ratio: number | null;
  market_cap: number | null;
  day_change_percentage: number | null;
}

interface MarketAggregate {
  totalCount: number;
  sampleSize: number;
  avgPe: number | null;
  avgDayChangePct: number | null;
  topGainer: { symbol: string; pct: number } | null;
  topLoser: { symbol: string; pct: number } | null;
}

function aggregate(rows: SectorRow[], totalCount: number): MarketAggregate {
  if (rows.length === 0) return { totalCount, sampleSize: 0, avgPe: null, avgDayChangePct: null, topGainer: null, topLoser: null };

  const pes = rows.map(r => r.pe_ratio).filter((v): v is number => v !== null && v > 0);
  const changes = rows.filter(r => r.day_change_percentage !== null);
  const sorted = [...changes].sort((a, b) => (b.day_change_percentage as number) - (a.day_change_percentage as number));

  return {
    totalCount,
    sampleSize: rows.length,
    avgPe: pes.length > 0 ? pes.reduce((s, v) => s + v, 0) / pes.length : null,
    avgDayChangePct: changes.length > 0 ? changes.reduce((s, r) => s + (r.day_change_percentage as number), 0) / changes.length : null,
    topGainer: sorted.length > 0 ? { symbol: sorted[0].symbol, pct: sorted[0].day_change_percentage as number } : null,
    topLoser: sorted.length > 0 ? { symbol: sorted[sorted.length - 1].symbol, pct: sorted[sorted.length - 1].day_change_percentage as number } : null,
  };
}

// PostgREST caps a single request at 1000 rows regardless of .limit() — for a sector larger
// than that (confirmed by direct query, Aug 2026: Basic Materials/Consumer Cyclical/
// Industrials all exceed it), the averages/movers below are computed over the 1000
// largest-cap constituents, not the full sector. `totalCount` is fetched separately via a
// head-only exact count so `{label}_constituent_count` is never silently capped at 1000 —
// the earlier version conflated the two, reporting the row-fetch limit as if it were the
// sector's real size.
async function fetchMarket(table: 'market_assets' | 'us_market_assets', sector: SectorName): Promise<MarketAggregate> {
  const [{ count }, { data }] = await Promise.all([
    supabase.from(table).select('symbol', { count: 'exact', head: true }).eq('sector', sector),
    supabase.from(table).select('symbol, name, pe_ratio, market_cap, day_change_percentage').eq('sector', sector).order('market_cap', { ascending: false, nullsFirst: false }).limit(1000),
  ]);
  return aggregate((data as SectorRow[] | null) || [], count || 0);
}

export async function fetchSectorAggregate(sector: SectorName): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const cacheKey = `sector:${sector}`;
  const cacheKeys = [cacheKey];

  let combined = assistantCache.get<{ in: MarketAggregate; us: MarketAggregate }>(cacheKey);
  if (!combined) {
    const [inAgg, usAgg] = await Promise.all([fetchMarket('market_assets', sector), fetchMarket('us_market_assets', sector)]);
    combined = { in: inAgg, us: usAgg };
    assistantCache.set(cacheKey, combined, CACHE_TTL.ANALYTICS_MS);
  }

  const asOf = new Date().toISOString();
  const fields: ProvenancedField[] = [{ field: 'sector_name', value: sector, source: 'market_assets', kind: 'retrieved', asOf }];

  const pushMarket = (label: 'IN' | 'US', table: string, agg: MarketAggregate) => {
    if (agg.totalCount === 0) return;
    fields.push({ field: `${label}_constituent_count`, value: agg.totalCount, source: table, kind: 'retrieved', asOf });
    // Only surfaced when the average/movers below are actually computed over a subset — a
    // sector under the 1000-row cap has sampleSize === totalCount, so this is omitted rather
    // than redundantly restating the same number under a second name.
    if (agg.sampleSize < agg.totalCount) {
      fields.push({ field: `${label}_averages_sample_size`, value: agg.sampleSize, source: `computed:sectorSampleCap`, kind: 'computed', asOf });
    }
    if (agg.avgPe !== null) fields.push({ field: `${label}_avg_pe_ratio`, value: Number(agg.avgPe.toFixed(2)), source: table, kind: 'retrieved', asOf });
    if (agg.avgDayChangePct !== null) fields.push({ field: `${label}_avg_day_change_pct`, value: Number(agg.avgDayChangePct.toFixed(2)), source: table, kind: 'retrieved', asOf });
    if (agg.topGainer) fields.push({ field: `${label}_top_gainer`, value: `${agg.topGainer.symbol} (${agg.topGainer.pct >= 0 ? '+' : ''}${agg.topGainer.pct.toFixed(2)}%)`, source: table, kind: 'retrieved', asOf });
    if (agg.topLoser) fields.push({ field: `${label}_top_loser`, value: `${agg.topLoser.symbol} (${agg.topLoser.pct >= 0 ? '+' : ''}${agg.topLoser.pct.toFixed(2)}%)`, source: table, kind: 'retrieved', asOf });
  };

  pushMarket('IN', 'market_assets', combined.in);
  pushMarket('US', 'us_market_assets', combined.us);

  return { fields, cacheKeys };
}

export const SectorRetriever = { fetchSectorAggregate };
