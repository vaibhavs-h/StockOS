import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';
import { CURRENCY, currencyForSymbol, formatMoney } from './symbolTable';

// ISIN-like mutual-fund identifiers stored in watchlist_assets (12 chars, "IN" country
// prefix) vs. plain equity tickers ("RELIANCE.NS", "AAPL") — same disambiguation
// WatchlistTerminal.tsx already uses client-side for the same table.
const MF_ISIN_RE = /^IN[A-Z0-9]{10}$/i;

interface WatchlistItem {
  symbol: string;
  name: string | null;
  price: number | null;
  dayChangePct: number | null;
  currency: 'INR' | 'USD';
  isMutualFund: boolean;
}

// A ticker ("RELIANCE.NS", "AAPL") is itself recognizable, so that's shown for equities —
// but a bare ISIN ("INF179K01XQ0") means nothing to a user, so a mutual fund is shown by its
// scheme name instead, falling back to the ISIN only if the name lookup somehow came back
// empty (never silently drop the item because of a missing label).
function displayLabel(item: WatchlistItem): string {
  return item.isMutualFund ? (item.name || item.symbol) : item.symbol;
}

async function resolveEquities(symbols: string[]): Promise<Map<string, { name: string | null; price: number | null; dayChangePct: number | null }>> {
  const inSymbols = symbols.filter(s => /\.(NS|BO)$/i.test(s));
  const usSymbols = symbols.filter(s => !/\.(NS|BO)$/i.test(s));

  const [inRows, usRows] = await Promise.all([
    inSymbols.length > 0
      ? supabase.from('market_assets').select('symbol, name, current_price, day_change_percentage').in('symbol', inSymbols)
      : Promise.resolve({ data: [] as any[] }),
    usSymbols.length > 0
      ? supabase.from('us_market_assets').select('symbol, name, current_price, day_change_percentage').in('symbol', usSymbols)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const map = new Map<string, { name: string | null; price: number | null; dayChangePct: number | null }>();
  [...(inRows.data || []), ...(usRows.data || [])].forEach((r: any) => {
    map.set(r.symbol, { name: r.name, price: r.current_price, dayChangePct: r.day_change_percentage });
  });
  return map;
}

async function resolveMutualFunds(isins: string[]): Promise<Map<string, { name: string | null; price: number | null; dayChangePct: number | null }>> {
  if (isins.length === 0) return new Map();
  const { data } = await supabase
    .from('mutual_funds_master')
    .select('isin, name, current_price, day_change_percentage')
    .in('isin', isins);

  const map = new Map<string, { name: string | null; price: number | null; dayChangePct: number | null }>();
  (data || []).forEach((r: any) => map.set(r.isin, { name: r.name, price: r.current_price, dayChangePct: r.day_change_percentage }));
  return map;
}

/** Aggregates across every watchlist the user has (no per-watchlist disambiguation entity
 * exists yet — same "no filter = everything" default portfolio_analysis already uses for
 * portfolioId). */
export async function fetchWatchlist(userId: string): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const cacheKey = `watchlist:${userId}`;
  const cacheKeys = [cacheKey];

  let items = assistantCache.get<{ listCount: number; items: WatchlistItem[] }>(cacheKey);
  if (!items) {
    const { data: lists } = await supabase.from('user_watchlists').select('id').eq('user_id', userId);
    const listIds = (lists || []).map((l: any) => l.id);

    if (listIds.length === 0) {
      items = { listCount: 0, items: [] };
    } else {
      const { data: assets } = await supabase.from('watchlist_assets').select('symbol').in('watchlist_id', listIds);
      const symbols = Array.from(new Set((assets || []).map((a: any) => a.symbol as string)));
      const mfIsins = symbols.filter(s => MF_ISIN_RE.test(s));
      const equitySymbols = symbols.filter(s => !MF_ISIN_RE.test(s));

      const [equityMap, mfMap] = await Promise.all([resolveEquities(equitySymbols), resolveMutualFunds(mfIsins)]);

      // Every symbol actually in watchlist_assets is kept, even if the quote/name lookup
      // finds nothing for it (a delisted stock, a data sync gap) — same discipline
      // PortfolioHoldingsRetriever already applies to holdings (null out the missing
      // metadata, never drop the row), so watchlist_symbol_count can't silently under-count
      // what a "no filter" query into WatchlistTerminal.tsx would show as still present.
      const resolved: WatchlistItem[] = [];
      equitySymbols.forEach(s => {
        const meta = equityMap.get(s);
        resolved.push({ symbol: s, name: meta?.name ?? null, price: meta?.price ?? null, dayChangePct: meta?.dayChangePct ?? null, currency: currencyForSymbol(s).code, isMutualFund: false });
      });
      mfIsins.forEach(isin => {
        const meta = mfMap.get(isin);
        resolved.push({ symbol: isin, name: meta?.name ?? null, price: meta?.price ?? null, dayChangePct: meta?.dayChangePct ?? null, currency: 'INR', isMutualFund: true });
      });

      items = { listCount: listIds.length, items: resolved };
    }
    assistantCache.set(cacheKey, items, CACHE_TTL.HOLDINGS_MS);
  }

  const asOf = new Date().toISOString();
  const fields: ProvenancedField[] = [
    { field: 'watchlist_count', value: items.listCount, source: 'user_watchlists', kind: 'retrieved', asOf },
    { field: 'watchlist_symbol_count', value: items.items.length, source: 'watchlist_assets', kind: 'retrieved', asOf },
  ];

  if (items.items.length > 0) {
    fields.push({
      field: 'held_watchlist_symbols',
      value: items.items.map(displayLabel).join(', '),
      source: 'watchlist_assets',
      kind: 'retrieved',
      asOf,
    });

    const withChange = items.items.filter(i => i.dayChangePct !== null);
    const sorted = [...withChange].sort((a, b) => (b.dayChangePct as number) - (a.dayChangePct as number));
    if (sorted.length > 0) {
      const fmt = (i: WatchlistItem) => `${displayLabel(i)}${i.price !== null ? ` (${formatMoney(i.price, CURRENCY[i.currency])}, ${(i.dayChangePct as number) >= 0 ? '+' : ''}${(i.dayChangePct as number).toFixed(2)}%)` : ''}`;
      fields.push({ field: 'watchlist_top_gainer', value: fmt(sorted[0]), source: 'watchlist_assets', kind: 'retrieved', asOf });
      fields.push({ field: 'watchlist_top_loser', value: fmt(sorted[sorted.length - 1]), source: 'watchlist_assets', kind: 'retrieved', asOf });
    }
  }

  return { fields, cacheKeys };
}

export const WatchlistRetriever = { fetchWatchlist };
