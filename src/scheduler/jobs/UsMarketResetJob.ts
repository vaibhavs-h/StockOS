import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { syncOrchestrator } from '../core/orchestrator';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class UsMarketResetJob extends BaseJob {
  public readonly id = 'UsMarketResetJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_3_EXTENDED, // Reusing high-level tier
    symbols: [], // Operates on global table
    region: MarketRegion.US,
    priority: QueuePriority.WATCHLIST,
    bullMqQueueName: 'q-extended-fundamentals',
    retryCount: 0,
    maxRetries: 3
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    
    console.log(`[UsMarketResetJob] Starting daily session reset (Zeroing out High/Low columns)...`);
    
    try {
      const { data, error, count } = await supabase
        .from('us_market_assets')
        .update({
          regularmarketdayhigh: 0,
          regularmarketdaylow: 0,
          updated_at: new Date().toISOString()
        }, { count: 'exact' })
        .not('symbol', 'is', null) // Target all rows
        .select('*');

      if (error) throw error;

      // 2. IMPORTANT: Clear the memory snapshots so the sync engine re-anchors
      console.log(`[UsMarketResetJob] Purging memory snapshots to prevent cache desync...`);
      syncOrchestrator.clearSnapshots(MarketRegion.US);

      console.log(`[UsMarketResetJob] Successfully reset ${count} US assets and cleared cache.`);
      return count || 0;
      
    } catch (error: any) {
      console.error(`[UsMarketResetJob] Failed to reset market data:`, error.message);
      throw error;
    }
  }
}
