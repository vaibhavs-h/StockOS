import { SupabaseProvider } from '../providers/SupabaseProvider';

export type FreshnessStatus = 'LIVE' | 'RECENT' | 'STALE' | 'DELAYED' | 'FAILED';

/**
 * SymbolSyncStateService: The Health Ledger of StockOS.
 * Tracks freshness, failures, and cooldowns for every symbol.
 */
export class SymbolSyncStateService {
  
  private static lastRecordCache = new Map<string, number>();

  /**
   * Updates the sync health for a symbol in Supabase.
   * SMART LOGGING: Prevents excessive DB writes by throtteling success records.
   */
  public static async recordSyncResult(
    symbol: string, 
    market: 'IN' | 'US', 
    success: boolean,
    error?: string
  ) {
    const nowTs = Date.now();
    const lastRecord = this.lastRecordCache.get(symbol) || 0;
    
    // Only record if:
    // 1. It's a failure
    // 2. It's a success after a failure (recovery)
    // 3. 30 minutes have passed since last record
    const shouldRecord = !success || (nowTs - lastRecord > 30 * 60 * 1000);

    if (!shouldRecord) return;

    const supabase = SupabaseProvider.getClient();
    const now = new Date().toISOString();

    const update: any = {
      symbol,
      market,
      last_attempted_sync_at: now,
      updated_at: now,
      inflight_status: 'idle'
    };

    if (success) {
      update.last_success_at = now;
      update.failure_count = 0;
      update.freshness_status = 'LIVE';
      update.cooldown_until = null;
    } else {
      update.last_failure_at = now;
      update.freshness_status = 'FAILED';
      
      const cooldown = new Date();
      cooldown.setHours(cooldown.getHours() + 1);
      update.cooldown_until = cooldown.toISOString();
    }

    const { error: dbError } = await supabase
      .from('symbol_sync_state')
      .upsert(update, { onConflict: 'symbol' });

    if (!dbError) {
      this.lastRecordCache.set(symbol, nowTs);
    } else {
      console.error(`[HEALTH] ❌ Failed to record sync result for ${symbol}:`, dbError.message);
    }
  }


  /**
   * Identifies symbols that are in 'Cooldown' and should be skipped.
   */
  public static async getCooldownSymbols(): Promise<Set<string>> {
    const supabase = SupabaseProvider.getClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('symbol_sync_state')
      .select('symbol')
      .gt('cooldown_until', now);

    if (error) return new Set();
    return new Set(data.map(d => d.symbol));
  }
}
