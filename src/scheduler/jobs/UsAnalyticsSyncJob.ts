import { BaseJob } from '../core/BaseJob';
import { YahooProvider } from '../providers/YahooProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { RotationManager } from '../core/RotationManager';
import { syncOrchestrator } from '../core/orchestrator';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class UsAnalyticsSyncJob extends BaseJob {
  public readonly id = 'UsAnalyticsSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_2_ACTIVE,
    symbols: SymbolUniverseManager.getUniqueUsEquities().map(d => d.s),
    region: MarketRegion.US,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-intelligence-valuation',
    retryCount: 0,
    maxRetries: 2
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    const assets = [...SymbolUniverseManager.getUniqueUsEquities()];
    
    // PRIORITY SORT: Tier A (SP500/NASDAQ100/DOW30) first
    assets.sort((a, b) => {
      const aPriority = (a.isSP500 || a.isNASDAQ100 || a.isDOW30) ? 0 : 1;
      const bPriority = (b.isSP500 || b.isNASDAQ100 || b.isDOW30) ? 0 : 1;
      return aPriority - bPriority;
    });

    const sliceSize = 50;
    const totalSlices = Math.ceil(assets.length / sliceSize);
    
    const sliceIndex = RotationManager.getNextSliceIndex('US', totalSlices);
    const start = sliceIndex * sliceSize;
    const end = Math.min(start + sliceSize, assets.length);
    const slice = assets.slice(start, end);

    console.log(`[UsAnalyticsSyncJob] Processing Slice ${sliceIndex + 1}/${totalSlices} (${slice.length} stocks)`);

    let processedCount = 0;

    for (const item of slice) {
      const symbol = normalizeStorageSymbol(item.s);
      
      try {
        // Fetch Intelligence + Valuation modules
        const modules = ['summaryDetail', 'defaultKeyStatistics'];
        const summary = await YahooProvider.fetchQuoteSummary(symbol, modules, 'US');

        const sd = (summary.summaryDetail || {}) as any;
        const ks = (summary.defaultKeyStatistics || {}) as any;

        const fullPayload = {
          symbol,
          // Technicals (Tier 2 Focus)
          fifty_day_average: sd.fiftyDayAverage || null,
          two_hundred_day_average: sd.twoHundredDayAverage || null,
          fifty_two_week_high: sd.fiftyTwoWeekHigh || null,
          fifty_two_week_low: sd.fiftyTwoWeekLow || null,
          average_volume_3m: sd.averageVolume3Month || null,
          
          // Valuation (Tier 2 Focus)
          market_cap: sd.marketCap || null,
          pe_ratio: sd.trailingPE || null,
          forward_pe: sd.forwardPE || null,
          peg_ratio: ks.pegRatio || null,
          ps_ratio: sd.priceToSalesTrailing12Months || null,
          price_to_book: sd.priceToBook || null,
          shares_outstanding: ks.sharesOutstanding || null,
          beta_5y: ks.beta || null,
          
          updated_at: new Date().toISOString()
        };

        const diffPayload = this.getDiff(symbol, fullPayload);

        if (!diffPayload) {
          syncOrchestrator.recordWriteSkip();
        } else {
          const { error } = await supabase.from('us_market_assets').upsert(diffPayload, { onConflict: 'symbol' });
          if (error) throw error;
          this.commitSnapshot(symbol, fullPayload);
          processedCount++;
        }

      } catch (error: any) {
        console.warn(`[UsAnalyticsSyncJob] Failed for ${symbol}: ${error.message}`);
      }
    }

    return processedCount;
  }
}
