import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';
import { currencyForSymbol, formatMoney, tableForSymbol } from './symbolTable';

// market_assets (India) and us_market_assets (US) do NOT share a fundamentals schema —
// confirmed by a direct column dump against both tables while diagnosing a Phase 5 (V2 plan)
// regression. Indian equities store 50/200-day moving averages as ma_50/ma_200 (not
// fifty_day_average/two_hundred_day_average) and the PEG ratio as trailing_peg_ratio (not
// peg_ratio); neither table has promoter_holding, ev_ebitda, or roce under any name, and
// neither has recommendation_mean (only recommendation_key, which both tables do share) — so
// those four are genuine data-source gaps, not naming mismatches, and are not retrieved.
// The SELECT below is branched per table using PostgREST's `alias:column` syntax so both
// branches still emit the same canonical FundamentalsRow shape / ProvenancedField.field names
// that everything downstream (RetrievalSpecService, prompt, confidence scoring) depends on.
interface FundamentalsRow {
  symbol: string;
  sector: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  fifty_day_average: number | null;
  two_hundred_day_average: number | null;
  debt_to_equity: number | null;
  recommendation_key: string | null;
  peg_ratio: number | null;
  return_on_equity: number | null;
  updated_at: string | null;
}

const US_SELECT = 'symbol, sector, market_cap, pe_ratio, forward_pe, fifty_two_week_high, fifty_two_week_low, fifty_day_average, two_hundred_day_average, debt_to_equity, recommendation_key, peg_ratio, return_on_equity, updated_at';
const IN_SELECT = 'symbol, sector, market_cap, pe_ratio, forward_pe, fifty_two_week_high, fifty_two_week_low, fifty_day_average:ma_50, two_hundred_day_average:ma_200, debt_to_equity, recommendation_key, peg_ratio:trailing_peg_ratio, return_on_equity, updated_at';

export async function fetchFundamentals(symbol: string): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const table = tableForSymbol(symbol);
  const cacheKey = `fundamentals:${symbol}`;
  const cacheKeys = [cacheKey];

  let row = assistantCache.get<FundamentalsRow>(cacheKey);
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
      console.error(`[StockFundamentalsRetriever] ${table} query failed for ${symbol}: ${error.message}`);
      return { fields: [], cacheKeys };
    }
    if (!data) return { fields: [], cacheKeys };
    row = data as unknown as FundamentalsRow;
    asOf = row.updated_at || new Date().toISOString();
    assistantCache.set(cacheKey, row, CACHE_TTL.FUNDAMENTALS_MS);
  }

  const currency = currencyForSymbol(symbol);
  const fields: ProvenancedField[] = [];
  const push = (field: string, value: number | string | null) => {
    if (value !== null && value !== undefined) fields.push({ field, value, source: table, kind: 'retrieved', asOf });
  };
  // Same rule as StockQuoteRetriever: money fields carry their currency symbol baked in
  // (never left for the model to infer); pe_ratio/forward_pe are dimensionless ratios.
  const pushMoney = (field: string, value: number | null, decimals = 2) => {
    if (value !== null && value !== undefined) push(field, formatMoney(value, currency, decimals));
  };

  push('sector', row.sector);
  pushMoney('market_cap', row.market_cap, 0);
  push('pe_ratio', row.pe_ratio);
  push('forward_pe', row.forward_pe);
  push('debt_to_equity', row.debt_to_equity);
  push('recommendation_key', row.recommendation_key);
  push('peg_ratio', row.peg_ratio);
  push('return_on_equity', row.return_on_equity);
  pushMoney('fifty_two_week_high', row.fifty_two_week_high);
  pushMoney('fifty_two_week_low', row.fifty_two_week_low);
  pushMoney('fifty_day_average', row.fifty_day_average);
  pushMoney('two_hundred_day_average', row.two_hundred_day_average);

  return { fields, cacheKeys };
}

export const StockFundamentalsRetriever = { fetchFundamentals };
