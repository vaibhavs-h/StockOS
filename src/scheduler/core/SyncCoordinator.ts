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
  private lastIndexSyncTimes: Map<string, number> = new Map();

  private constructor() { }

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

    this.runIndianLoop();
    this.runUsLoop();
  }

  private async runIndianLoop() {
    while (this.isRunning) {
      try {
        await this.pulseRegion('IN');
      } catch (error: any) {
        console.error('[MAESTRO] Indian Pulse Error:', error.message);
      }

      const isOpen = MarketSessionService.isIndianMarketOpen();
      const inUniverse = await ActiveRegistryService.getActiveUniverse('IN');
      const hasActiveViews = inUniverse.ephemeral.length > 0;

      let delay = 15 * 60 * 1000; // 15m default (closed)
      if (isOpen) {
        if (hasActiveViews) {
          delay = 15000; // 15s high cadence for active users
        } else {
          delay = 5 * 60 * 1000; // 5m idle background pacing
        }
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private async runUsLoop() {
    while (this.isRunning) {
      try {
        await this.pulseRegion('US');
      } catch (error: any) {
        console.error('[MAESTRO] US Pulse Error:', error.message);
      }

      const isOpen = MarketSessionService.isUsMarketOpen();
      const usUniverse = await ActiveRegistryService.getActiveUniverse('US');
      const hasActiveViews = usUniverse.ephemeral.length > 0;

      let delay = 15 * 60 * 1000; // 15m default (closed)
      if (isOpen) {
        if (hasActiveViews) {
          delay = 15000; // 15s high cadence for active users
        } else {
          delay = 5 * 60 * 1000; // 5m idle background pacing
        }
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * The core pulse logic for a specific region.
   */
  private async pulseRegion(region: 'IN' | 'US') {
    // 1. Identify Active Universe
    const universe = await ActiveRegistryService.getActiveUniverse(region);

    // 1b. Filter out Cooldown Symbols (Institutional Shielding)
    const cooldowns = await SymbolSyncStateService.getCooldownSymbols();

    // 2. Batch Sync Quotes (Greedy Aggregation)
    const isOpen = region === 'IN' ? MarketSessionService.isIndianMarketOpen() : MarketSessionService.isUsMarketOpen();
    const hasViews = universe.ephemeral.length > 0;

    const now = Date.now();
    const activeSymbols = universe.total.filter(s => {
      if (cooldowns.has(s)) return false;

      // If the symbol is an index and the market is open, throttle to 1 minute
      if (s.startsWith('^') && isOpen) {
        const lastSync = this.lastIndexSyncTimes.get(s) || 0;
        if (now - lastSync < 60000) {
          return false;
        }
      }
      return true;
    });

    if ((isOpen || hasViews) && activeSymbols.length > 0) {
      console.log(`[MAESTRO] Pulse Wave [${region}] | Symbols: ${activeSymbols.length}`);
      await BatchAggregationService.fetchQuotesInBatches(activeSymbols, region);

      // Record sync time for indices
      const syncTime = Date.now();
      for (const s of activeSymbols) {
        if (s.startsWith('^')) {
          this.lastIndexSyncTimes.set(s, syncTime);
        }
      }

      await ActiveRegistryService.persistActiveRegistry(activeSymbols, region);
    }

    // 3. Immediate DB Flush & Revaluation
    const updatedCount = await this.flushDirtySnapshotsForRegion(region);

    if (updatedCount > 0) {
      // Trigger immediate portfolio revaluation
      const { syncOrchestrator } = require('./orchestrator');
      const { PortfolioRevaluationJob } = require('../jobs/PortfolioRevaluationJob');
      await syncOrchestrator.dispatch(new PortfolioRevaluationJob());
    }
  }

  /**
   * Flushes modified snapshots for a region from RAM to Supabase.
   */
  public async flushDirtySnapshotsForRegion(region: 'IN' | 'US'): Promise<number> {
    const dirtySymbols = marketStateCache.getDirtySymbols();
    if (dirtySymbols.length === 0) return 0;

    const supabase = SupabaseProvider.getClient();
    const usTickers = new Set(SymbolUniverseManager.getUniqueUsEquities().map((a: any) => a.s.toUpperCase()));

    const regionSymbols = dirtySymbols.filter(s => {
      const upper = s.toUpperCase().trim();
      
      // 1. Check global indices list dynamically
      if (upper.startsWith('^') || upper === 'VIX') {
        const indexAsset = SymbolUniverseManager.getGlobalIndices().find(
          idx => idx.s.toUpperCase() === upper
        );
        if (indexAsset) {
          const isIN = indexAsset.region === 'IN';
          return region === 'IN' ? isIN : !isIN;
        }
        // Fallback for indices
        const isIndIndex = ['^NSEI', '^BSESN', '^NSEBANK', '^CNXIT'].includes(upper);
        return region === 'IN' ? isIndIndex : !isIndIndex;
      }

      // 2. Suffix check
      if (upper.endsWith('.NS') || upper.endsWith('.BO')) {
        return region === 'IN';
      }

      // 3. Equities match
      const ticker = upper.split('.')[0];
      const isUS = usTickers.has(ticker) || usTickers.has(upper);
      return region === 'IN' ? !isUS : isUS;
    });

    if (regionSymbols.length === 0) return 0;

    const mapSnapshots = (symbols: string[], reg: 'IN' | 'US') => {
      return symbols.map(s => {
        const resolved = SymbolUniverseManager.resolveSymbol(s, reg);
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

        // Fundamentals — updated every morning sync
        if (data.marketCap !== undefined && data.marketCap !== null && data.marketCap !== 0) update.market_cap = data.marketCap;
        if (data.peRatio !== undefined && data.peRatio !== null) update.pe_ratio = data.peRatio;
        if (data.fiftyTwoWeekHigh !== undefined && data.fiftyTwoWeekHigh !== null && data.fiftyTwoWeekHigh !== 0) update.fifty_two_week_high = data.fiftyTwoWeekHigh;
        if (data.fiftyTwoWeekLow !== undefined && data.fiftyTwoWeekLow !== null && data.fiftyTwoWeekLow !== 0) update.fifty_two_week_low = data.fiftyTwoWeekLow;

        if (reg === 'IN') {
          if (data.volume !== undefined && data.volume !== null) update.volume = data.volume;
          if (data.dayHigh !== undefined && data.dayHigh !== null) update.high_price = data.dayHigh;
          if (data.dayLow !== undefined && data.dayLow !== null) update.low_price = data.dayLow;
        } else {
          if (data.volume !== undefined && data.volume !== null) update.average_volume = data.volume;
          if (data.dayHigh !== undefined && data.dayHigh !== null) update.regularmarketdayhigh = data.dayHigh;
          if (data.dayLow !== undefined && data.dayLow !== null) update.regularmarketdaylow = data.dayLow;
        }

        return update;
      });
    };

    const rawSnapshots = mapSnapshots(regionSymbols, region);
    const table = region === 'IN' ? 'market_assets' : 'us_market_assets';

    // Deduplicate by symbol to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time"
    // This can happen when concurrent sync jobs both dirty the same symbol in the same flush window.
    const seen = new Map<string, any>();
    for (const snap of rawSnapshots) {
      seen.set(snap.symbol, snap);
    }
    const snapshots = Array.from(seen.values());

    // Chunk upserts in batches of 200 to avoid payload size limits
    const CHUNK_SIZE = 200;
    let totalFlushed = 0;
    for (let i = 0; i < snapshots.length; i += CHUNK_SIZE) {
      const chunk = snapshots.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'symbol' });
      if (error) {
        console.error(`[MAESTRO] Flush failed for ${table} (chunk ${i / CHUNK_SIZE + 1}):`, error.message);
      } else {
        totalFlushed += chunk.length;
      }
    }

    // Clear dirty flags
    regionSymbols.forEach(s => marketStateCache.clearDirty(s));

    // Finalize: Update last_synced_at for the active registry
    const now = new Date().toISOString();
    const updates = regionSymbols.map(s => ({
      symbol: s,
      last_synced_at: now,
      sync_error_count: 0
    }));

    await supabase.from('active_market_symbols').upsert(updates, { onConflict: 'symbol' });

    // Dispatch price alerts check asynchronously
    const { AlertTriggerService } = require('./AlertTriggerService');
    const alertSnapshots = snapshots
      .filter(s => s.current_price !== undefined && s.current_price !== null)
      .map(s => ({
        symbol: s.symbol,
        price: Number(s.current_price),
        region
      }));
    
    AlertTriggerService.checkPriceAlerts(alertSnapshots).catch((err: any) => {
      console.error('[ALERT-TRIGGER] Async check price alerts failed:', err.message);
    });

    metricsService.recordDbFlush();
    console.log(`[MAESTRO] FLUSH [${region}] | Updated ${totalFlushed} symbols in DB.`);

    return totalFlushed;
  }
}

export const syncCoordinator = SyncCoordinator.getInstance();
