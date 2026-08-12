import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';
import { currencyForSymbol, formatMoney, tableForSymbol } from './symbolTable';

// Confirmed by direct query against real data (Aug 2026), not just column-tier config —
// several columns that exist are effectively unpopulated in practice:
// - market_assets.payout_ratio and us_market_assets.payout_ratio: 0 rows populated, excluded.
// - us_market_assets.ex_dividend_date: 0 rows populated, excluded.
// - us_market_assets.dividend_rate: 0 rows populated; trailing_annual_dividend_rate is the
//   real US per-share figure (112 rows populated).
// - us_market_assets.dividend_yield: populated only on non-equity/index rows with value 0 —
//   not usable; trailing_annual_dividend_yield is the real US yield figure.
// Both tables store yield as a fraction (0.0801 = 8.01%), not a percentage — multiplied by
// 100 below before display, same principle as formatMoney baking in the currency symbol.
interface DividendRow {
  symbol: string;
  dividend_amount: number | null;
  dividend_date: string | null;
  dividend_yield: number | null;
  updated_at: string | null;
}

const US_SELECT = 'symbol, dividend_amount:trailing_annual_dividend_rate, dividend_yield:trailing_annual_dividend_yield, updated_at';
const IN_SELECT = 'symbol, dividend_amount:last_dividend_amount, dividend_date:last_dividend_date, dividend_yield, updated_at';

export async function fetchDividend(symbol: string): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const table = tableForSymbol(symbol);
  const cacheKey = `dividend:${symbol}`;
  const cacheKeys = [cacheKey];

  let row = assistantCache.get<DividendRow>(cacheKey);
  let asOf: string;

  if (row) {
    asOf = new Date(Date.now() - (assistantCache.getAgeMs(cacheKey) ?? 0)).toISOString();
  } else {
    const { data, error } = await supabase
      .from(table)
      .select(table === 'us_market_assets' ? US_SELECT : IN_SELECT)
      .eq('symbol', symbol)
      .maybeSingle();
    if (error) {
      console.error(`[DividendRetriever] ${table} query failed for ${symbol}: ${error.message}`);
      return { fields: [], cacheKeys };
    }
    if (!data) return { fields: [], cacheKeys };
    row = data as unknown as DividendRow;
    asOf = row.updated_at || new Date().toISOString();
    assistantCache.set(cacheKey, row, CACHE_TTL.FUNDAMENTALS_MS);
  }

  const currency = currencyForSymbol(symbol);
  const fields: ProvenancedField[] = [];
  if (row.dividend_amount !== null && row.dividend_amount !== undefined) {
    fields.push({ field: 'dividend_amount', value: formatMoney(row.dividend_amount, currency), source: table, kind: 'retrieved', asOf });
  }
  if (row.dividend_yield !== null && row.dividend_yield !== undefined) {
    fields.push({ field: 'dividend_yield_pct', value: Number((row.dividend_yield * 100).toFixed(2)), source: table, kind: 'retrieved', asOf });
  }
  if (row.dividend_date) {
    fields.push({ field: 'dividend_date', value: row.dividend_date, source: table, kind: 'retrieved', asOf });
  }

  return { fields, cacheKeys };
}

export const DividendRetriever = { fetchDividend };
