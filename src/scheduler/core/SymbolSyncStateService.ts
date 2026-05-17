import { SupabaseProvider } from '../providers/SupabaseProvider';

/**
 * SymbolSyncStateService: The Health Ledger of StockOS.
 * Tracks freshness, failures, and cooldowns for every active symbol completely in-memory,
 * purging the database dependency on a separate health ledger table.
 */
export class SymbolSyncStateService {
  
  // In-memory ledger mapping: symbol -> { failureCount, cooldownUntil (timestamp) }
  private static memoryLedger = new Map<string, {
    failureCount: number;
    cooldownUntil: number | null;
  }>();

  /**
   * Updates the sync health for a symbol.
   * Tracks telemetry in active_market_symbols, and maintains the cooldown ledger in-memory.
   */
  public static async recordSyncResult(
    symbol: string, 
    market: 'IN' | 'US', 
    success: boolean,
    error?: string
  ) {
    const supabase = SupabaseProvider.getClient();
    const now = new Date().toISOString();

    // 1. Telemetry Persistence: Keep active_market_symbols registry in sync
    try {
      if (success) {
        await supabase
          .from('active_market_symbols')
          .update({
            last_synced_at: now,
            sync_error_count: 0
          })
          .eq('symbol', symbol);
      } else {
        const { data: activeSymbol } = await supabase
          .from('active_market_symbols')
          .select('sync_error_count')
          .eq('symbol', symbol)
          .single();
        const currentErrCount = (activeSymbol?.sync_error_count || 0) + 1;

        await supabase
          .from('active_market_symbols')
          .update({
            sync_error_count: currentErrCount
          })
          .eq('symbol', symbol);
      }
    } catch (err: any) {
      console.error(`[HEALTH] ❌ Failed to update active_market_symbols for ${symbol}:`, err.message);
    }

    // 2. In-Memory Cooldown Tracking: Lightweight & lightning-fast
    const record = this.memoryLedger.get(symbol) || { failureCount: 0, cooldownUntil: null };

    if (success) {
      record.failureCount = 0;
      record.cooldownUntil = null;
    } else {
      record.failureCount += 1;
      
      // Exponential Smart Cooldown: increases by 60 mins per failure (max 24h)
      const cooldownMinutes = Math.min(60 * record.failureCount, 24 * 60);
      record.cooldownUntil = Date.now() + cooldownMinutes * 60 * 1000;
    }

    this.memoryLedger.set(symbol, record);
  }

  /**
   * Identifies symbols that are actively in Cooldown and should be skipped during pulses.
   */
  public static async getCooldownSymbols(): Promise<Set<string>> {
    const now = Date.now();
    const cooldowns = new Set<string>();

    for (const [symbol, record] of this.memoryLedger.entries()) {
      if (record.cooldownUntil && record.cooldownUntil > now) {
        cooldowns.add(symbol);
      }
    }

    return cooldowns;
  }
}
