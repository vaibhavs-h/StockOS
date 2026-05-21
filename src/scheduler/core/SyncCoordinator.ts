import { ActiveRegistryService } from './ActiveRegistryService';
import { BatchAggregationService } from './BatchAggregationService';
import { MarketSessionService } from './MarketSessionService';
import { marketStateCache } from './MarketStateCache';
import { metricsService } from './OrchestrationMetricsService';
import { SymbolSyncStateService } from './SymbolSyncStateService';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager } from '../../constants/market-constants';

/**
 * SyncCoordinator: The Maestro of the StockOS Pulse Engine.
 * Orchestrates the adaptive heartbeat, batching, and memory-to-DB flushing.
 */
export class SyncCoordinator {
  private static instance: SyncCoordinator;
  private isRunning: boolean = false;
  private loopInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): SyncCoordinator {
    if (!SyncCoordinator.instance) {
      SyncCoordinator.instance = new SyncCoordinator();
    }
    return SyncCoordinator.instance;
  }

  /**
   * Starts the global Pulse Engine loop.
   */
  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[MAESTRO] Pulse Engine v2 Awakening...');
    
    this.runLoop();
  }

  private async runLoop() {
    while (this.isRunning) {
      const start = Date.now();
      
      try {
        await this.pulse();
      } catch (error: any) {
        console.error('[MAESTRO] Pulse Error:', error.message);
      }

      // Adaptive Pacing: 
      // 1. 10s if any market is open
      // 2. 60s if market is closed BUT we have active views (Weekend Research mode)
      // 3. 15m if all closed and no active demand
      const isAnyOpen = MarketSessionService.isIndianMarketOpen() || MarketSessionService.isUsMarketOpen();
      const hasActiveViews = marketStateCache.getActiveViews(10 * 60 * 1000).length > 0;
      
      let delay = 15 * 60 * 1000; // 15m default
      if (isAnyOpen) {
        delay = 10000; // 10s high cadence
      } else if (hasActiveViews) {
        delay = 60000; // 60s weekend research mode
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * The core pulse logic: Identify demand, Batch, Sync, and Flush.
   */
  private async pulse() {
    // 1. Identify Active Universe
    const inUniverse = await ActiveRegistryService.getActiveUniverse('IN');
    const usUniverse = await ActiveRegistryService.getActiveUniverse('US');

    // 1b. Filter out Cooldown Symbols (Institutional Shielding)
    const cooldowns = await SymbolSyncStateService.getCooldownSymbols();
    const activeIn = inUniverse.total.filter(s => !cooldowns.has(s));
    const activeUs = usUniverse.total.filter(s => !cooldowns.has(s));

    if (activeIn.length > 0 || activeUs.length > 0) {
      console.log(`[MAESTRO] Pulse Wave | IN: ${activeIn.length} | US: ${activeUs.length} | Total: ${activeIn.length + activeUs.length}`);
    }

    // 2. Batch Sync Quotes (Greedy Aggregation)
    // Sync if market is open OR if we have active symbols (Holdings/Views) to revalue
    if (MarketSessionService.isIndianMarketOpen() || activeIn.length > 0) {
      await BatchAggregationService.fetchQuotesInBatches(activeIn, 'IN');
      await ActiveRegistryService.persistActiveRegistry(activeIn, 'IN');
    }

    if (MarketSessionService.isUsMarketOpen() || activeUs.length > 0) {
      await BatchAggregationService.fetchQuotesInBatches(activeUs, 'US');
      await ActiveRegistryService.persistActiveRegistry(activeUs, 'US');
    }


    // 3. Immediate DB Flush & Revaluation
    // We flush every time to ensure the revaluation job sees fresh data
    const updatedCount = await this.flushDirtySnapshots();
    
    if (updatedCount > 0) {
      // Trigger immediate portfolio revaluation
      const { syncOrchestrator } = require('./orchestrator');
      const { PortfolioRevaluationJob } = require('../jobs/PortfolioRevaluationJob');
      await syncOrchestrator.dispatch(new PortfolioRevaluationJob());
    }
  }

  /**
   * Flushes modified snapshots from RAM to Supabase.
   */
  private async flushDirtySnapshots(): Promise<number> {
    const dirtySymbols = marketStateCache.getDirtySymbols();
    if (dirtySymbols.length === 0) return 0;

    const supabase = SupabaseProvider.getClient();
    const usTickers = new Set(SymbolUniverseManager.getUniqueUsEquities().map((a: any) => a.s.toUpperCase()));
    
    const mapSnapshots = (symbols: string[], region: 'IN' | 'US') => {
      return symbols.map(s => {
        const resolved = SymbolUniverseManager.resolveSymbol(s, region);
        const data = marketStateCache.getSnapshot(s);
        
        // INSTITUTIONAL SHIELDING: Only include fields with high-fidelity data
        const update: any = {
          symbol: resolved,
          updated_at: new Date().toISOString()
        };

        if (data.price !== undefined && data.price !== null && data.price !== 0) update.current_price = data.price;
        if (data.change !== undefined && data.change !== null) update.day_change = data.change;
        if (data.changePercent !== undefined && data.changePercent !== null) update.day_change_percentage = data.changePercent;
        if (data.prevClose !== undefined && data.prevClose !== null && data.prevClose !== 0) update.prev_close = data.prevClose;

        if (region === 'IN') {
          if (data.volume !== undefined && data.volume !== null) update.volume = data.volume;
          if (data.dayHigh !== undefined && data.dayHigh !== null) update.high_price = data.dayHigh;
          if (data.dayLow !== undefined && data.dayLow !== null) update.low_price = data.dayLow;
        } else {
          if (data.volume !== undefined && data.volume !== null) update.regularmarketvolume = data.volume;
          if (data.dayHigh !== undefined && data.dayHigh !== null) update.regularmarketdayhigh = data.dayHigh;
          if (data.dayLow !== undefined && data.dayLow !== null) update.regularmarketdaylow = data.dayLow;
        }

        return update;
      });
    };

    const inSymbols = dirtySymbols.filter(s => {
      const ticker = s.split('.')[0].toUpperCase();
      return s.endsWith('.NS') || s.endsWith('.BO') || !usTickers.has(ticker);
    });
    
    const usSymbols = dirtySymbols.filter(s => {
      const ticker = s.split('.')[0].toUpperCase();
      return !s.endsWith('.NS') && !s.endsWith('.BO') && usTickers.has(ticker);
    });

    const inSnapshots = mapSnapshots(inSymbols, 'IN');
    const usSnapshots = mapSnapshots(usSymbols, 'US');

    const flush = async (table: string, data: any[], conflictColumn: string = 'symbol') => {
      if (data.length === 0) return;
      const { error } = await supabase.from(table).upsert(data, { onConflict: conflictColumn });
      if (error) console.error(`[MAESTRO] Flush failed for ${table}:`, error.message);
    };

    await Promise.all([
      flush('market_assets', inSnapshots),
      flush('us_market_assets', usSnapshots)
    ]);

    // Clear dirty flags
    dirtySymbols.forEach(s => marketStateCache.clearDirty(s));

    // Finalize: Update last_synced_at for the active registry
    const syncedSymbols = [...inSymbols, ...usSymbols];
    if (syncedSymbols.length > 0) {
      const now = new Date().toISOString();
      const updates = syncedSymbols.map(s => ({
        symbol: s,
        last_synced_at: now,
        sync_error_count: 0
      }));
      
      await supabase.from('active_market_symbols').upsert(updates, { onConflict: 'symbol' });
    }

    metricsService.recordDbFlush();
    const totalUpdated = inSnapshots.length + usSnapshots.length;
    console.log(`[MAESTRO] FLUSH | Updated ${totalUpdated} symbols in DB.`);
    
    return totalUpdated;
  }
}

export const syncCoordinator = SyncCoordinator.getInstance();
