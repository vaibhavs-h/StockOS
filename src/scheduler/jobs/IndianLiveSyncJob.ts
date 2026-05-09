import { BaseJob } from '../core/BaseJob';
import { YahooProvider } from '../providers/YahooProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { syncOrchestrator } from '../core/orchestrator';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class IndianLiveSyncJob extends BaseJob {
  public readonly id = 'IndianLiveSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_1_HOT,
    symbols: SymbolUniverseManager.getUniqueIndianEquities().map(a => a.s),
    region: MarketRegion.IN,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-live-quotes',
    retryCount: 0,
    maxRetries: 1
  };

  protected async process(): Promise<number> {
    const startTime = Date.now();
    const supabase = SupabaseProvider.getClient();
    const symbols = this.metadata.symbols;
    const assets = SymbolUniverseManager.getUniqueIndianEquities();

    console.log(`[JOB START] ${this.id} | Symbols to process: ${symbols.length}`);
    
    // 1. Chunk symbols into batches of 15
    const batchSize = 15;
    const batches = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 2. Process batches sequentially
    for (const batch of batches) {
      try {
        const quotes = await YahooProvider.fetchQuotes(batch, 'IN');
        
        for (const q of quotes) {
          const symbol = normalizeStorageSymbol(q.symbol);
          
          if (!q.regularMarketPrice) continue;

          const fullPayload = {
            symbol,
            current_price: q.regularMarketPrice,
            day_change: q.regularMarketChange,
            day_change_percentage: q.regularMarketChangePercent,
            open_price: q.regularMarketOpen,
            high_price: q.regularMarketDayHigh,
            low_price: q.regularMarketDayLow,
            prev_close: q.regularMarketPreviousClose,
            volume: q.regularMarketVolume,
            updated_at: new Date().toISOString()
          };

          const diffPayload = this.getDiff(symbol, fullPayload);
          
          if (!diffPayload) {
            skippedCount++;
            syncOrchestrator.recordWriteSkip();
            continue;
          }

          const { error } = await supabase.from('market_assets').upsert(diffPayload, { onConflict: 'symbol' });

          if (error) {
            console.error(`[IndianLiveSyncJob] DB update failed for ${symbol}:`, error.message);
            errorCount++;
          } else {
            this.commitSnapshot(symbol, fullPayload);
            processedCount++;
          }
        }
      } catch (e: any) {
        console.error(`[IndianLiveSyncJob] Batch failed:`, e.message);
        errorCount += batch.length;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[JOB END] ${this.id} | Writes: ${processedCount} | Skips: ${skippedCount} | Errors: ${errorCount} | Time: ${duration}ms`);
    return processedCount;
  }
}

