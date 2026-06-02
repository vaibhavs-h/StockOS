import { SupabaseProvider } from '../providers/SupabaseProvider';
import { marketStateCache } from './MarketStateCache';

/**
 * ActiveRegistryService: The Dynamic Universe Orchestrator.
 * Reconciles holdings and heartbeats into the active sync universe.
 */
export class ActiveRegistryService {
  
  private static lastUniverse: Map<string, Set<string>> = new Map();

  /**
   * Identifies all unique symbols that need active syncing.
   * Logic: (Unique Holdings) + (Active Views in Cache)
   */
  public static async getActiveUniverse(region: 'IN' | 'US' = 'IN') {
    const supabase = SupabaseProvider.getClient();
    const table = region === 'IN' ? 'holdings' : 'holdings'; // Same table for both, filtered by symbol suffix or region if we added it

    // 1. Get unique holdings from DB
    const { data: holdings, error: hError } = await supabase
      .from('holdings')
      .select('trading_symbol');

    // 2. Get unique watchlist assets from DB
    const { data: watchAssets, error: wError } = await supabase
      .from('watchlist_assets')
      .select('symbol');

    if (hError || wError) {
      console.error(`[REGISTRY] DB Fetch Error:`, hError?.message || wError?.message);
    }

    // Filter holdings locally by universe and suffix for region
    const { SymbolUniverseManager } = require('../../constants/market-constants');
    const { MarketAsset } = require('./types');
    const indianAssets = SymbolUniverseManager.getUniqueIndianEquities();
    const usAssets = SymbolUniverseManager.getUniqueUsEquities();
    
    const indianTickers = new Set<string>();
    indianAssets.forEach((a: any) => {
      const s = a.s.toUpperCase();
      indianTickers.add(s);
      indianTickers.add(s.split('.')[0]);
    });

    const usTickers = new Set(usAssets.map((a: any) => a.s.toUpperCase()));

    const regionalHoldings = (holdings || []).filter(h => {
      const s = (h.trading_symbol || '').trim().toUpperCase();
      const ticker = s.includes(':') ? s.split(':')[1] : s;
      const rawTicker = ticker.split('.')[0];
      
      // 1. Explicit Indian Suffix
      if (s.endsWith('.NS') || s.endsWith('.BO')) return region === 'IN';
      
      // 2. Exists in Indian Universe
      if (indianTickers.has(rawTicker) || indianTickers.has(ticker)) return region === 'IN';

      // 3. Exists in US Universe
      if (usTickers.has(rawTicker) || usTickers.has(ticker)) return region === 'US';

      // 4. Default for unknown raw tickers (Mostly non-standard Indian broker symbols)
      return region === 'IN';
    });

    // Process Watchlist Assets
    const regionalWatchlist = (watchAssets || []).filter(wa => {
      const s = (wa.symbol || '').trim().toUpperCase();
      const ticker = s.includes(':') ? s.split(':')[1] : s;
      const rawTicker = ticker.split('.')[0];
      if (s.endsWith('.NS') || s.endsWith('.BO')) return region === 'IN';
      if (indianTickers.has(rawTicker) || indianTickers.has(ticker)) return region === 'IN';
      if (usTickers.has(rawTicker) || usTickers.has(ticker)) return region === 'US';
      return region === 'IN';
    });

    const hotSymbols = new Set([
      ...regionalHoldings.map(h => SymbolUniverseManager.resolveSymbol(h.trading_symbol.toUpperCase(), region)),
      ...regionalWatchlist.map(wa => SymbolUniverseManager.resolveSymbol(wa.symbol.toUpperCase(), region))
    ]);

    // Ephemeral views only stay active for 2 mins after last heartbeat
    // Query directly from Supabase to bridge Next.js API heartbeats with the separate Engine process
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: dbActiveViews } = await supabase
      .from('active_market_symbols')
      .select('symbol')
      .eq('market', region)
      .gt('last_viewed_at', twoMinutesAgo);

    const regionalViews = (dbActiveViews || []).map(d => 
      SymbolUniverseManager.resolveSymbol(d.symbol.toUpperCase(), region)
    );

    // Sync views into the local Engine process's marketStateCache to activate the 15s adaptive pacing loop
    regionalViews.forEach(s => marketStateCache.updateHeartbeat(s));

    // 3. Reconcile and Deduplicate
    // Force include global indices to ensure they are always live-pulsed
    const globalIndices = SymbolUniverseManager.getGlobalIndices()
      .filter((a: any) => region === 'IN' ? a.region === 'IN' : a.region === 'US')
      .map((a: any) => a.s);

    const universeArray = [...Array.from(hotSymbols), ...regionalViews, ...globalIndices];
    const universe = new Set(universeArray);
    const currentList = Array.from(universe);

    // 4. Change Detection Logging
    const prev = this.lastUniverse.get(region) || new Set();
    const added = currentList.filter(s => !prev.has(s));
    const removed = Array.from(prev).filter(s => !universe.has(s));

    if (added.length > 0) {
      console.log(`[REGISTRY] Added to ${region} Active List: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
      console.log(`[REGISTRY] Removed from ${region} Active List: ${removed.join(', ')}`);
    }

    this.lastUniverse.set(region, universe);

    return {
      hot: Array.from(hotSymbols),
      ephemeral: regionalViews.filter(s => !hotSymbols.has(s)),
      total: currentList
    };
  }

  /**
   * Updates the 'active_market_symbols' table in Supabase.
   */
  public static async persistActiveRegistry(symbols: string[], region: 'IN' | 'US') {
    const supabase = SupabaseProvider.getClient();
    
    // We need to know which are holdings vs ephemeral to set the state correctly
    const universe = await this.getActiveUniverse(region);
    const hotSet = new Set(universe.hot);
 
    const snapshots = universe.total.map(s => {
      const isHot = hotSet.has(s);
      const now = new Date().toISOString();
      return {
        symbol: s,
        market: region,
        state: isHot ? 'HOT' : 'EPHEMERAL',
        last_viewed_at: now,
        updated_at: now,
        is_live_enabled: isHot || s.startsWith('^'), // Holdings and Indices are always live-pulsed
        last_holding_seen_at: isHot ? now : null
      };
    });

    if (snapshots.length > 0) {
      const { error } = await supabase
        .from('active_market_symbols')
        .upsert(snapshots, { onConflict: 'symbol' });

      if (error) {
        console.error(`[REGISTRY] Failed to persist active registry:`, error.message);
      }
    }

    // --- SELF-CLEANING PRUNING ENGINE ---
    // Automatically delete obsolete symbols that are no longer present in the active universe (holdings, watchlists, indices, active views)
    try {
      const activeSet = new Set(universe.total);
      
      const { data: dbSymbols, error: fetchErr } = await supabase
        .from('active_market_symbols')
        .select('symbol')
        .eq('market', region);

      if (!fetchErr && dbSymbols) {
        const obsoleteSymbols = dbSymbols
          .map(d => d.symbol)
          .filter(s => !activeSet.has(s));

        if (obsoleteSymbols.length > 0) {
          console.log(`[REGISTRY] Pruning ${obsoleteSymbols.length} obsolete ${region} symbols from registry: ${obsoleteSymbols.join(', ')}`);
          
          const { error: deleteErr } = await supabase
            .from('active_market_symbols')
            .delete()
            .in('symbol', obsoleteSymbols);

          if (deleteErr) {
            console.error(`[REGISTRY] Failed to prune obsolete symbols:`, deleteErr.message);
          }
        }
      }
    } catch (err: any) {
      console.error(`[REGISTRY] Pruning engine error:`, err.message);
    }
  }
}
