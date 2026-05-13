import { BaseJob } from '../core/BaseJob';
import { YahooProvider } from '../providers/YahooProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { syncOrchestrator } from '../core/orchestrator';
import { MarketStatusEngine } from '../core/MarketStatusEngine';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority, MarketSession } from '../core/types';

export class UsLiveSyncJob extends BaseJob {
  public readonly id = 'UsLiveSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_1_HOT,
    symbols: SymbolUniverseManager.getUniqueUsEquities().map(a => a.s),
    region: MarketRegion.US,
    priority: QueuePriority.WATCHLIST,
    bullMqQueueName: 'q-live-quotes',
    retryCount: 0,
    maxRetries: 3
  };

  protected async process(): Promise<number> {
    const assets = [
      ...SymbolUniverseManager.getUniqueUsEquities(),
      ...SymbolUniverseManager.getGlobalIndices().filter(a => a.region === 'US')
    ];

    const symbols = assets.map(a => a.s);
    const targetSymbols = symbols; 

    let processedCount = 0;
    const supabase = SupabaseProvider.getClient();

    // 1. PRE-SYNC: Fetch existing High/Low from DB to prevent NULL overwrites
    const { data: dbState } = await supabase
      .from('us_market_assets')
      .select('symbol, regularmarketdayhigh, regularmarketdaylow')
      .in('symbol', targetSymbols.map(s => normalizeStorageSymbol(s).replace('^', '')));

    const dbLookup = new Map(dbState?.map(s => [s.symbol, s]) || []);

    try {
      const quotes = await YahooProvider.fetchQuotes(targetSymbols, 'US');
      const allUpdates = [];

      for (const q of quotes) {
        const symbol = normalizeStorageSymbol(q.symbol).replace('^', '');
        const assetInfo = assets.find(a => normalizeStorageSymbol(a.s).replace('^', '') === symbol);
        
        const regularPrice = q.regularMarketPrice || q.postMarketPrice || q.preMarketPrice;
        if (!regularPrice) continue;

        // --- DYNAMIC SESSION HIGHS/LOWS (TRIPLE-GUARD) ---
        const prevSnapshot = this.getSnapshot(symbol);
        const dbSnapshot = dbLookup.get(symbol);

        // Fallback chain: Yahoo -> Memory Cache -> Live Database -> Current Price (Initial Anchor)
        const currentHigh = q.regularMarketDayHigh || prevSnapshot?.regularmarketdayhigh || dbSnapshot?.regularmarketdayhigh || null;
        const currentLow = q.regularMarketDayLow || prevSnapshot?.regularmarketdaylow || dbSnapshot?.regularmarketdaylow || null;

        // Logic: Keep the highest/lowest seen today
        const finalHigh = (regularPrice && (!currentHigh || regularPrice > currentHigh)) ? regularPrice : currentHigh;
        const finalLow = (regularPrice && (!currentLow || regularPrice < currentLow)) ? regularPrice : currentLow;

        const fullPayload: any = {
          symbol,
          name: assetInfo?.n || q.shortName || q.longName || symbol,
          current_price: regularPrice,
          day_change: q.regularMarketChange || 0,
          day_change_percentage: q.regularMarketChangePercent || 0,
          prev_close: q.regularMarketPreviousClose,
          
          // Institutional Metrics (Session Peaks)
          regularmarketdayhigh: finalHigh,
          regularmarketdaylow: finalLow,
          
          updated_at: new Date().toISOString()
        };

        // 2. DIRTY CHECK (MANDATORY HYDRATION)
        const diffPayload = this.getDiff(symbol, fullPayload);
        
        // We ALWAYS push a write if we have a valid High/Low, bypassing the dirty check logic 
        // to ensure the database stays perfectly synchronized with session action.
        const updatePayload = diffPayload || { symbol };
        
        // Inject mandatory fields
        updatePayload.regularmarketdayhigh = finalHigh;
        updatePayload.regularmarketdaylow = finalLow;
        updatePayload.current_price = regularPrice;
        updatePayload.updated_at = fullPayload.updated_at;
        
        allUpdates.push(updatePayload);
        this.commitSnapshot(symbol, fullPayload);
      }

      if (allUpdates.length > 0) {
        const { error } = await supabase.from('us_market_assets').upsert(allUpdates, { onConflict: 'symbol' });
        if (error) throw error;
        processedCount = allUpdates.length;
      }

    } catch (error: any) {
      console.warn(`[UsLiveSyncJob] Batch pulse failed: ${error.message}`);
    }

    return processedCount;
  }
}
