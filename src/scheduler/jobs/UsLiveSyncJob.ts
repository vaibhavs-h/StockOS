import { BaseJob } from '../core/BaseJob';
import { YahooProvider } from '../providers/YahooProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager, normalizeStorageSymbol, getMarketStatus } from '../../constants/market-constants';
import { syncOrchestrator } from '../core/orchestrator';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class UsLiveSyncJob extends BaseJob {
  public readonly id = 'UsLiveSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_1_HOT,
    symbols: SymbolUniverseManager.getUniqueUsEquities().map(d => d.s),
    region: MarketRegion.US,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-live-quotes',
    retryCount: 0,
    maxRetries: 1
  };

  protected async process(): Promise<number> {
    const startTime = Date.now();
    const supabase = SupabaseProvider.getClient();
    const symbols = this.metadata.symbols;
    const assets = SymbolUniverseManager.getUniqueUsEquities();

    const status = getMarketStatus('US');
    console.log(`[UsLiveSyncJob] Market Status: ${status} | Total Symbols: ${symbols.length}`);

    // Priority Filtering: In extended hours, only sync Tier A (S&P/Nasdaq/Dow) every minute
    let targetSymbols = symbols;
    if (status === 'PRE' || status === 'AFTER') {
      const tierA = assets.filter(a => a.isSP500 || a.isNASDAQ100 || a.isDOW30).map(a => a.s);
      // During extended hours, we only process Tier A every minute. 
      // Tier B will be handled by a different frequency or every N-th cycle (for simplicity here, we filter).
      targetSymbols = symbols.filter(s => tierA.includes(s));
      console.log(`[UsLiveSyncJob] Extended Hours: Throttling to ${targetSymbols.length} Tier A stocks.`);
    }

    // 1. Chunk symbols into batches of 15
    const batchSize = 15;
    const batches = [];
    for (let i = 0; i < targetSymbols.length; i += batchSize) {
      batches.push(targetSymbols.slice(i, i + batchSize));
    }

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 2. Process batches sequentially via Queue
    for (const batch of batches) {
      try {
        const quotes = await YahooProvider.fetchQuotes(batch, 'US');
        
        for (const q of quotes) {
          const symbol = normalizeStorageSymbol(q.symbol);
          
          if (!q.regularMarketPrice && !q.preMarketPrice && !q.postMarketPrice) continue;

          const fullPayload = {
            symbol,
            current_price: q.regularMarketPrice || q.postMarketPrice || q.preMarketPrice,
            day_change: q.regularMarketChange || 0,
            day_change_percentage: q.regularMarketChangePercent || 0,
            prev_close: q.regularMarketPreviousClose,
            
            // Extended Hours Capture
            premarket_price: q.preMarketPrice || null,
            premarket_change: q.preMarketChange || null,
            after_hours_price: q.postMarketPrice || null,
            after_hours_change: q.postMarketChange || null,

            regularmarketdayhigh: q.regularMarketDayHigh || null,
            regularmarketdaylow: q.regularMarketDayLow || null,
            updated_at: new Date().toISOString()
          };

          const diffPayload = this.getDiff(symbol, fullPayload);

          if (!diffPayload) {
            skippedCount++;
            syncOrchestrator.recordWriteSkip();
            continue;
          }

          const { error } = await supabase.from('us_market_assets').upsert(diffPayload, { onConflict: 'symbol' });

          if (error) {
            console.error(`[UsLiveSyncJob] DB update failed for ${symbol}:`, error.message);
            errorCount++;
          } else {
            this.commitSnapshot(symbol, fullPayload);
            processedCount++;
          }
        }
      } catch (e: any) {
        console.error(`[UsLiveSyncJob] Batch failed:`, e.message);
        errorCount += batch.length;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[JOB END] ${this.id} | Writes: ${processedCount} | Skips: ${skippedCount} | Errors: ${errorCount} | Time: ${duration}ms`);
    return processedCount;
  }
}

