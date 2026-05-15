import { BaseJob } from '../core/BaseJob';
import { YahooProvider } from '../providers/YahooProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { RotationManager } from '../core/RotationManager';
import { syncOrchestrator } from '../core/orchestrator';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class IndianAnalyticsSyncJob extends BaseJob {
  public readonly id = 'IndianAnalyticsSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_2_ACTIVE, // Using TIER_2 for the 15-min warm sync
    symbols: SymbolUniverseManager.getUniqueIndianEquities().map(a => a.s),
    region: MarketRegion.IN,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-intelligence-valuation',
    retryCount: 0,
    maxRetries: 2
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    
    // Target only the active universe (Holdings + Active Views) for hourly analytics
    const { ActiveRegistryService } = require('../core/ActiveRegistryService');
    const universe = await ActiveRegistryService.getActiveUniverse('IN');
    const symbols = universe.total;

    if (symbols.length === 0) return 0;

    console.log(`[IndianAnalyticsSyncJob] Processing ${symbols.length} active symbols for hourly analytics.`);

    let processedCount = 0;

    for (const symbol of symbols) {
      
      try {
        // Fetch Intelligence + Valuation modules
        const modules = ['summaryDetail', 'defaultKeyStatistics'];
        const summary = await YahooProvider.fetchQuoteSummary(symbol, modules, 'IN');

        if (!summary) {
           console.warn(`[IndianAnalyticsSyncJob] Skipping ${symbol}: No summary data returned.`);
           continue;
        }

        const sd = (summary.summaryDetail || {}) as any;
        const ks = (summary.defaultKeyStatistics || {}) as any;

        const fullPayload = {
          symbol,
          // Technicals (Tier 2 Focus)
          ma_50: sd.fiftyDayAverage || null,
          ma_200: sd.twoHundredDayAverage || null,
          fifty_two_week_high: sd.fiftyTwoWeekHigh || null,
          fifty_two_week_low: sd.fiftyTwoWeekLow || null,
          avg_volume_10d: sd.averageDailyVolume10Day || null,
          
          // Valuation (Moved from Tier 3)
          market_cap: sd.marketCap || null,
          pe_ratio: sd.trailingPE || null,
          forward_pe: sd.forwardPE || null,
          trailing_peg_ratio: ks.pegRatio || null,
          beta: ks.beta || null,
          
          // Returns
          return_1m: ks['52WeekChange'] || null, // Best proxy for return performance in summary
          
          updated_at: new Date().toISOString()
        };

        const diffPayload = this.getDiff(symbol, fullPayload);

        if (!diffPayload) {
          syncOrchestrator.recordWriteSkip();
        } else {
          const { error } = await supabase.from('market_assets').upsert(diffPayload, { onConflict: 'symbol' });
          if (error) throw error;
          this.commitSnapshot(symbol, fullPayload);
          processedCount++;
        }

      } catch (error: any) {
        console.warn(`[IndianAnalyticsSyncJob] Failed for ${symbol}: ${error.message}`);
      }
    }

    return processedCount;
  }
}
