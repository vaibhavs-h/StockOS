import { supabase } from '../lib/supabase';
import { normalizeStorageSymbol } from '../constants/market-constants';
import { MarketRegion } from '../scheduler/core/types';
import { YahooProvider } from '../scheduler/providers/YahooProvider';
import { SymbolSyncStateService } from '../scheduler/core/SymbolSyncStateService';

// Extracted from the `/api/sync/burst` route (server.ts) so the same logic can be called
// directly, in-process, from the assistant's retrieval path (§ V2 plan, Phase 4) without an
// HTTP loopback — the route becomes a thin wrapper around this.

interface BurstSyncResult {
  success: boolean;
  price?: number;
}

const COOLDOWN_MS = 60 * 1000;
const lastAttempt = new Map<string, number>();

// Process-wide counters for the tracer (§ V2 plan, Phase 6) — same request-scoped-delta
// approximation as AssistantCache.getStats(), not exact under concurrency, fine for
// internal diagnostics.
let attemptCount = 0;
let successCount = 0;

export class BurstSyncService {
  static getStats(): { attempts: number; successes: number } {
    return { attempts: attemptCount, successes: successCount };
  }

  /** True if `symbol` was attempted within the cooldown window — callers should skip
   * re-triggering a sync (and just fall through to "no data") rather than hammer Yahoo on
   * repeated misses for the same symbol. Same Map-based-singleton shape AssistantCache
   * already uses, not a new pattern. */
  static isCoolingDown(symbol: string): boolean {
    const last = lastAttempt.get(symbol);
    return last !== undefined && Date.now() - last < COOLDOWN_MS;
  }

  static async syncQuote(symbol: string, region: MarketRegion): Promise<BurstSyncResult> {
    const storageSymbol = normalizeStorageSymbol(symbol);
    lastAttempt.set(storageSymbol, Date.now());
    attemptCount++;

    try {
      const quote = await YahooProvider.fetchQuote(symbol, region === MarketRegion.US ? 'US' : 'IN');
      if (!quote || quote.price === undefined) {
        await SymbolSyncStateService.recordSyncResult(storageSymbol, region === MarketRegion.US ? 'US' : 'IN', false, 'No quote found')
          .catch(() => {});
        return { success: false };
      }

      const tableName = region === MarketRegion.US ? 'us_market_assets' : 'market_assets';
      const payload = {
        symbol: storageSymbol,
        current_price: quote.price,
        day_change: quote.change,
        day_change_percentage: quote.changePercent,
        prev_close: quote.prevClose,
        premarket_price: (quote as any).preMarketPrice,
        premarket_change_pct: (quote as any).preMarketChangePercent,
        after_hours_price: (quote as any).postMarketPrice,
        after_hours_change_pct: (quote as any).postMarketChangePercent,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from(tableName).upsert(payload, { onConflict: 'symbol' });
      if (error) throw error;

      await SymbolSyncStateService.recordSyncResult(storageSymbol, region === MarketRegion.US ? 'US' : 'IN', true)
        .catch(e => console.error('[BURST-SYNC] Failed to record success:', e.message));

      successCount++;
      return { success: true, price: quote.price };
    } catch (err: any) {
      console.error(`[BURST-SYNC] Failed for ${symbol}:`, err.message);
      await SymbolSyncStateService.recordSyncResult(storageSymbol, region === MarketRegion.US ? 'US' : 'IN', false, err.message)
        .catch(e => console.error('[BURST-SYNC] Failed to record failure:', e.message));
      return { success: false };
    }
  }
}
