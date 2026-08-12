import { supabase } from '../../../lib/supabase';
import { ProvenancedField, ScreenerFilters } from '../types';
import { CURRENCY, currencyForSymbol, formatMoney } from './symbolTable';
import { resolveSectorName } from './SectorRetriever';

// The entire "turn user text into a query" risk is isolated here: every filter the model
// proposes is re-validated against this allowlist before touching Supabase — unknown keys
// are dropped (never passed through), and every value is clamped to a sane numeric range.
// No raw string interpolation anywhere; only .eq()/.gte()/.lte() chained off these fixed
// column names, confirmed to exist with identical names on both market_assets and
// us_market_assets (peg_ratio is the one exception, aliased below same as
// StockFundamentalsRetriever does for it).
interface NumericFilterSpec { column: string; op: 'gte' | 'lte'; min: number; max: number }

const NUMERIC_ALLOWLIST: Record<string, NumericFilterSpec> = {
  marketCapMin: { column: 'market_cap', op: 'gte', min: 0, max: 1e16 },
  marketCapMax: { column: 'market_cap', op: 'lte', min: 0, max: 1e16 },
  peMin: { column: 'pe_ratio', op: 'gte', min: -1000, max: 1000 },
  peMax: { column: 'pe_ratio', op: 'lte', min: -1000, max: 1000 },
  dividendYieldMin: { column: 'dividend_yield', op: 'gte', min: 0, max: 100 },
  priceMin: { column: 'current_price', op: 'gte', min: 0, max: 10000000 },
  priceMax: { column: 'current_price', op: 'lte', min: 0, max: 10000000 },
  roeMin: { column: 'return_on_equity', op: 'gte', min: -1000, max: 1000 },
  pegMax: { column: 'peg_ratio', op: 'lte', min: -100, max: 100 },
};

const RESULT_LIMIT = 15;

// Market cap is the one filter where a user's number is routinely stated in a scale word
// ("10000 crore", "500 billion") rather than an absolute figure — and doing that
// multiplication *inside the classifier LLM* is exactly the kind of arithmetic this codebase
// otherwise never delegates to a model (confirmed unreliable in testing: a small classifier
// model computed "10000 crore" as 1e10, not 1e11). So the classifier is only ever asked for
// the plain number plus a unit word; the multiplication itself happens here, deterministically.
const UNIT_MULTIPLIERS: Record<string, number> = {
  absolute: 1, unit: 1, ones: 1,
  thousand: 1e3, k: 1e3,
  lakh: 1e5, lac: 1e5,
  million: 1e6, m: 1e6,
  crore: 1e7, cr: 1e7,
  billion: 1e9, b: 1e9,
  trillion: 1e12, t: 1e12,
};

// Only lakh/crore are treated as an unambiguous INR signal — they're essentially never used
// for a dollar figure. "million"/"billion"/"trillion" are genuinely ambiguous (used for both
// currencies in ordinary English) so those stay unscoped rather than guessed at; that's a
// smaller, more honest residual gap than asserting a currency the wording didn't actually say.
const INR_ONLY_UNITS = new Set(['lakh', 'lac', 'crore', 'cr']);

function resolveMarketCapValue(rawValue: unknown, rawUnit: unknown): { value: number; currency?: 'INR' } | null {
  const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(num)) return null;
  const unitKey = typeof rawUnit === 'string' ? rawUnit.toLowerCase().trim() : 'absolute';
  const multiplier = UNIT_MULTIPLIERS[unitKey] ?? 1;
  return { value: num * multiplier, currency: INR_ONLY_UNITS.has(unitKey) ? 'INR' : undefined };
}

/** Re-validates model/heuristic-proposed filter values before they're trusted — every key
 * must be in the allowlist and every value numeric/in-range, same discipline
 * resolveProposedSymbols() applies to ticker text. Unknown/out-of-range keys are dropped, not
 * errored (fail gracefully, per the capability's stated scope), and reported so the tool can
 * tell the user what wasn't applied. */
export function resolveScreenerFilters(raw: Record<string, unknown>): { filters: ScreenerFilters; dropped: string[] } {
  const filters: ScreenerFilters = {};
  const dropped: string[] = [];

  if (typeof raw.sector === 'string') {
    const sector = resolveSectorName(raw.sector);
    if (sector) filters.sector = sector;
    else dropped.push('sector');
  }

  const marketCapMin = resolveMarketCapValue(raw.marketCapMinValue, raw.marketCapMinUnit);
  if (marketCapMin !== null) {
    const spec = NUMERIC_ALLOWLIST.marketCapMin;
    if (marketCapMin.value >= spec.min && marketCapMin.value <= spec.max) {
      filters.marketCapMin = marketCapMin.value;
      if (marketCapMin.currency) filters.marketCapMinCurrency = marketCapMin.currency;
    } else {
      dropped.push('marketCapMin');
    }
  }
  const marketCapMax = resolveMarketCapValue(raw.marketCapMaxValue, raw.marketCapMaxUnit);
  if (marketCapMax !== null) {
    const spec = NUMERIC_ALLOWLIST.marketCapMax;
    if (marketCapMax.value >= spec.min && marketCapMax.value <= spec.max) {
      filters.marketCapMax = marketCapMax.value;
      if (marketCapMax.currency) filters.marketCapMaxCurrency = marketCapMax.currency;
    } else {
      dropped.push('marketCapMax');
    }
  }

  for (const key of Object.keys(NUMERIC_ALLOWLIST) as (keyof typeof NUMERIC_ALLOWLIST)[]) {
    if (key === 'marketCapMin' || key === 'marketCapMax') continue; // handled above via value+unit
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const num = typeof value === 'number' ? value : Number(value);
    const spec = NUMERIC_ALLOWLIST[key];
    if (Number.isFinite(num) && num >= spec.min && num <= spec.max) {
      (filters as Record<string, number>)[key] = num;
    } else {
      dropped.push(key);
    }
  }

  return { filters, dropped };
}

function applyFilters(query: any, filters: ScreenerFilters, market: 'IN' | 'US'): any {
  let q = query;
  for (const key of Object.keys(NUMERIC_ALLOWLIST) as (keyof typeof NUMERIC_ALLOWLIST)[]) {
    const value = (filters as Record<string, number | undefined>)[key];
    if (value === undefined) continue;

    // An INR-scoped market cap bound ("10000 crore") only means something against
    // market_assets' own rupee-denominated column — applying that same raw number to
    // us_market_assets' dollar-denominated column would be off by the INR/USD exchange
    // rate (~83x), not a rounding difference. Skipped entirely for the other market rather
    // than converted, matching this codebase's existing rule of never blending/converting
    // between the two currencies (see PortfolioHoldingsRetriever).
    if ((key === 'marketCapMin' && filters.marketCapMinCurrency === 'INR' && market !== 'IN')
      || (key === 'marketCapMax' && filters.marketCapMaxCurrency === 'INR' && market !== 'IN')) {
      continue;
    }

    const spec = NUMERIC_ALLOWLIST[key];
    // peg_ratio's US column name is the canonical one used by NUMERIC_ALLOWLIST; the India
    // branch swaps it for trailing_peg_ratio below, mirroring StockFundamentalsRetriever.
    q = spec.op === 'gte' ? q.gte(spec.column, value) : q.lte(spec.column, value);
  }
  if (filters.sector) q = q.eq('sector', filters.sector);
  return q;
}

interface ScreenerRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  pe_ratio: number | null;
  market_cap: number | null;
  current_price: number | null;
  dividend_yield: number | null;
}

async function runMarket(table: 'market_assets' | 'us_market_assets', filters: ScreenerFilters): Promise<ScreenerRow[]> {
  const market: 'IN' | 'US' = table === 'market_assets' ? 'IN' : 'US';
  const select = table === 'market_assets'
    ? 'symbol, name, sector, pe_ratio, market_cap, current_price, dividend_yield, peg_ratio:trailing_peg_ratio'
    : 'symbol, name, sector, pe_ratio, market_cap, current_price, dividend_yield, peg_ratio';

  let query = supabase.from(table).select(select);
  query = applyFilters(query, filters, market);
  const { data, error } = await query.order('market_cap', { ascending: false, nullsFirst: false }).limit(RESULT_LIMIT);
  if (error) {
    console.error(`[ScreenerQueryBuilder] ${table} query failed: ${error.message}`);
    return [];
  }
  return (data as unknown as ScreenerRow[]) || [];
}

// Pre-formatted for prose the same way every other money/percentage field in this pipeline
// is (see formatMoney's own doc comment) — the raw filter numbers are either currency
// magnitudes far too large to read (1e11) or fractions that read wrong verbatim
// (dividendYieldMin: 0.02 is NOT "0.02%"), and asking the LLM to reconstruct "10000 crore"
// or "2%" from the raw values itself would be the same kind of unreliable inline arithmetic
// already fixed on the input/extraction side — so none of that conversion is left for
// synthesis to attempt.
function describeFilters(filters: ScreenerFilters): string {
  const parts: string[] = [];
  if (filters.sector) parts.push(`sector = ${filters.sector}`);
  if (filters.marketCapMin !== undefined) {
    const scoped = filters.marketCapMinCurrency === 'INR';
    parts.push(`market cap ≥ ${formatMoney(filters.marketCapMin, scoped ? CURRENCY.INR : CURRENCY.USD, 0)}${scoped ? ' (applied to India results only, since the currency was unambiguous)' : ' (applied to the same raw figure on both markets — treat cross-market comparisons with caution)'}`);
  }
  if (filters.marketCapMax !== undefined) {
    const scoped = filters.marketCapMaxCurrency === 'INR';
    parts.push(`market cap ≤ ${formatMoney(filters.marketCapMax, scoped ? CURRENCY.INR : CURRENCY.USD, 0)}${scoped ? ' (applied to India results only, since the currency was unambiguous)' : ' (applied to the same raw figure on both markets — treat cross-market comparisons with caution)'}`);
  }
  if (filters.peMin !== undefined) parts.push(`PE ≥ ${filters.peMin}`);
  if (filters.peMax !== undefined) parts.push(`PE ≤ ${filters.peMax}`);
  if (filters.dividendYieldMin !== undefined) parts.push(`dividend yield ≥ ${(filters.dividendYieldMin * 100).toFixed(2)}%`);
  if (filters.priceMin !== undefined) parts.push(`price ≥ ${filters.priceMin} (in each result's own currency)`);
  if (filters.priceMax !== undefined) parts.push(`price ≤ ${filters.priceMax} (in each result's own currency)`);
  if (filters.roeMin !== undefined) parts.push(`ROE ≥ ${(filters.roeMin * 100).toFixed(2)}%`);
  if (filters.pegMax !== undefined) parts.push(`PEG ≤ ${filters.pegMax}`);
  return parts.length > 0 ? parts.join(', ') : 'none — no supported filter could be extracted from the question';
}

export async function runScreener(filters: ScreenerFilters): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const [inRows, usRows] = await Promise.all([runMarket('market_assets', filters), runMarket('us_market_assets', filters)]);
  const asOf = new Date().toISOString();
  const fields: ProvenancedField[] = [
    { field: 'filters_applied', value: describeFilters(filters), source: 'computed:screener', kind: 'computed', asOf },
    { field: 'result_count', value: inRows.length + usRows.length, source: 'computed:screener', kind: 'computed', asOf },
  ];

  const pushRows = (label: 'IN' | 'US', table: string, rows: ScreenerRow[]) => {
    rows.forEach((r, i) => {
      const currency = currencyForSymbol(r.symbol);
      const parts = [
        r.pe_ratio !== null ? `PE ${r.pe_ratio.toFixed(1)}` : null,
        r.market_cap !== null ? `mkt cap ${formatMoney(r.market_cap, currency, 0)}` : null,
        r.current_price !== null ? `price ${formatMoney(r.current_price, currency)}` : null,
        // dividend_yield is stored as a fraction (0.03 = 3%), same as everywhere else this
        // column is read (see DividendRetriever) — must be scaled to a percentage for display.
        r.dividend_yield !== null ? `div yield ${(r.dividend_yield * 100).toFixed(2)}%` : null,
      ].filter(Boolean).join(', ');
      fields.push({
        field: `${label}_result_${i + 1}`,
        value: `${r.symbol} — ${r.name || ''} (${r.sector || 'Unclassified'}${parts ? `, ${parts}` : ''})`,
        source: table,
        kind: 'retrieved',
        asOf,
      });
    });
  };

  pushRows('IN', 'market_assets', inRows);
  pushRows('US', 'us_market_assets', usRows);

  return { fields, cacheKeys: [] };
}

export const ScreenerQueryBuilder = { resolveScreenerFilters, runScreener };
