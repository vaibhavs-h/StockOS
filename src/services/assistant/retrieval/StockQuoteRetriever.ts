import { supabase } from '../../../lib/supabase';
import { BurstSyncService } from '../../BurstSyncService';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { MarketStatusEngine } from '../../../scheduler/core/MarketStatusEngine';
import { MarketRegion } from '../../../scheduler/core/types';
import { ProvenancedField } from '../types';
import { withTimeout } from '../withTimeout';
import { currencyForSymbol, formatMoney, tableForSymbol } from './symbolTable';

interface QuoteRow {
  symbol: string;
  name: string | null;
  current_price: number | null;
  prev_close: number | null;
  day_change: number | null;
  day_change_percentage: number | null;
  updated_at?: string | null;
}

// Configurable freshness threshold (§ V2 plan, Phase 4) — a row older than this during
// market hours is treated the same as a missing one: worth one burst-sync attempt before
// falling back to "no data." Kept separate from AssistantCache's TTLs, which govern
// re-fetching, not "is this stale enough to actively refresh."
const STALE_THRESHOLD_MS = 15 * 60 * 1000;
const BURST_SYNC_TIMEOUT_MS = 4000;

function isStale(row: QuoteRow, isMarketOpen: boolean): boolean {
  if (row.current_price === null) return true;
  if (!isMarketOpen) return false; // a closed-market quote doesn't get staler by waiting
  if (!row.updated_at) return false;
  return Date.now() - new Date(row.updated_at).getTime() > STALE_THRESHOLD_MS;
}

async function readRow(table: 'market_assets' | 'us_market_assets', symbol: string): Promise<QuoteRow | null> {
  const { data } = await supabase
    .from(table)
    .select('symbol, name, current_price, prev_close, day_change, day_change_percentage, updated_at')
    .eq('symbol', symbol)
    .maybeSingle();
  return data;
}

export async function fetchQuote(symbol: string): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const table = tableForSymbol(symbol);
  const cacheKey = `quote:${symbol}`;
  const cacheKeys = [cacheKey];
  const region = table === 'market_assets' ? MarketRegion.IN : MarketRegion.US;

  let row = assistantCache.get<QuoteRow>(cacheKey);
  let asOf: string;

  if (row) {
    asOf = new Date(Date.now() - (assistantCache.getAgeMs(cacheKey) ?? 0)).toISOString();
  } else {
    let data = await readRow(table, symbol);
    const isOpen = MarketStatusEngine.isMarketOpen(region);

    // Missing or stale — try a burst sync (bounded by timeout, rate-limited per symbol)
    // before giving up. Any failure or timeout falls straight through to today's existing
    // "no data" behavior — never blocks or throws up to the orchestrator.
    if ((!data || isStale(data, isOpen)) && !BurstSyncService.isCoolingDown(symbol)) {
      try {
        const result = await withTimeout(BurstSyncService.syncQuote(symbol, region), BURST_SYNC_TIMEOUT_MS, 'Burst sync');
        if (result.success) {
          data = await readRow(table, symbol);
        }
      } catch {
        // timed out or failed — proceed with whatever `data` already holds (possibly null/stale)
      }
    }

    if (!data) return { fields: [], cacheKeys };

    row = data;
    asOf = data.updated_at || new Date().toISOString();

    const ttl = isOpen ? CACHE_TTL.QUOTE_MARKET_HOURS_MS : CACHE_TTL.QUOTE_AFTER_HOURS_MS;
    assistantCache.set(cacheKey, row, ttl);
  }

  const currency = currencyForSymbol(symbol);
  const fields: ProvenancedField[] = [];
  if (row.name) fields.push({ field: 'company_name', value: row.name, source: table, kind: 'retrieved', asOf });
  // Currency is baked into the value itself (not left for the model to infer) — see
  // formatMoney's doc comment. quote_day_change_pct is a percentage, not money, so it's
  // left as a plain number.
  if (row.current_price !== null) fields.push({ field: 'quote_price', value: formatMoney(row.current_price, currency), source: table, kind: 'retrieved', asOf });
  if (row.day_change_percentage !== null) fields.push({ field: 'quote_day_change_pct', value: Math.round(row.day_change_percentage * 100) / 100, source: table, kind: 'retrieved', asOf });
  if (row.prev_close !== null) fields.push({ field: 'quote_prev_close', value: formatMoney(row.prev_close, currency), source: table, kind: 'retrieved', asOf });

  return { fields, cacheKeys };
}

export const StockQuoteRetriever = { fetchQuote };
