import { YahooProvider } from '../providers/YahooProvider';
import { marketStateCache } from './MarketStateCache';
import { SymbolSyncStateService } from './SymbolSyncStateService';

/**
 * BatchAggregationService: The Efficiency Engine of StockOS.
 * Aggregates multiple symbol requests into optimized bulk Yahoo calls.
 */
export class BatchAggregationService {
  private static MAX_BATCH_SIZE = 50;

  /**
   * Bundles a list of symbols into optimized quote requests.
   * Multi-casts the results back to individual caches.
   */
  public static async fetchQuotesInBatches(symbols: string[], region: 'IN' | 'US' = 'IN') {
    if (symbols.length === 0) return [];

    // Deduplicate and filter out symbols already being fetched (In-RAM coalescing)
    const uniqueSymbols = Array.from(new Set(symbols));
    const batches: string[][] = [];

    for (let i = 0; i < uniqueSymbols.length; i += this.MAX_BATCH_SIZE) {
      batches.push(uniqueSymbols.slice(i, i + this.MAX_BATCH_SIZE));
    }

    const results: any[] = [];

    // Execute batches in parallel (Respecting YahooRequestQueue concurrency)
    console.log(`[BATCH] Starting sync for ${uniqueSymbols.length} ${region} symbols in ${batches.length} batches...`);
    
    await Promise.all(batches.map(async (batch, index) => {
      try {
        const quoteBatch = await YahooProvider.fetchQuotes(batch, region);
        console.log(`[BATCH] Batch ${index + 1}/${batches.length} complete (${batch.length} stocks)`);
        
        // Populate MarketStateCache with fresh data
        if (Array.isArray(quoteBatch)) {
          quoteBatch.forEach(quote => {
            if (quote && quote.symbol) {
              marketStateCache.setSnapshot(quote.symbol, {
                price: quote.regularMarketPrice,
                change: quote.regularMarketChange,
                changePercent: quote.regularMarketChangePercent,
                prevClose: quote.regularMarketPreviousClose,
                volume: quote.regularMarketVolume,
                dayHigh: quote.regularMarketDayHigh,
                dayLow: quote.regularMarketDayLow,
                marketState: quote.marketState,
                // Extra fundamentals — synced daily alongside price
                marketCap: quote.marketCap,
                peRatio: quote.trailingPE,
                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                fiftyTwoWeekLow: quote.fiftyTwoWeekLow
              });

              // RECORD HEALTH: Success
              SymbolSyncStateService.recordSyncResult(quote.symbol, region, true);
            }
          });
          results.push(...quoteBatch);
        }
      } catch (error: any) {
        console.error(`[BATCH-SERVICE] Batch failed for ${batch.length} symbols:`, error.message);
        
        // RECORD HEALTH: Batch Failure
        batch.forEach(symbol => {
          SymbolSyncStateService.recordSyncResult(symbol, region, false, error.message);
        });
      }
    }));

    return results;
  }
}

