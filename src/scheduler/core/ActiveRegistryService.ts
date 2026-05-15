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
    const { data: holdings, error } = await supabase
      .from('holdings')
      .select('trading_symbol');

    if (error) {
      console.error(`[REGISTRY] ❌ Failed to fetch holdings:`, error.message);
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

    const holdingSymbols = new Set(regionalHoldings.map(h => {
      const s = (h.trading_symbol || '').trim().toUpperCase();
      return SymbolUniverseManager.resolveSymbol(s, region);
    }));

    // 2. Get active views from MarketStateCache
    // Ephemeral views only stay active for 5 mins after last heartbeat
    const activeViewSymbols = marketStateCache.getActiveViews(5 * 60 * 1000);
    
    // Filter active views by region
    const regionalViews = activeViewSymbols.filter(s => {
      const ticker = s.includes(':') ? s.split(':')[1] : s;
      const rawTicker = ticker.split('.')[0];
      
      if (s.endsWith('.NS') || s.endsWith('.BO')) return region === 'IN';
      if (indianTickers.has(rawTicker) || indianTickers.has(ticker)) return region === 'IN';
      if (usTickers.has(rawTicker) || usTickers.has(ticker)) return region === 'US';
      
      return region === 'IN';
    }).map(s => SymbolUniverseManager.resolveSymbol(s, region));

    // 3. Reconcile and Deduplicate
    // Force include global indices to ensure they are always live-pulsed
    const globalIndices = SymbolUniverseManager.getGlobalIndices()
      .filter((a: any) => region === 'IN' ? a.region === 'IN' : a.region === 'US')
      .map((a: any) => a.s);

    const universeArray = [...Array.from(holdingSymbols), ...regionalViews, ...globalIndices];
    const universe = new Set(universeArray);
    const currentList = Array.from(universe);

    // 4. Change Detection Logging
    const prev = this.lastUniverse.get(region) || new Set();
    const added = currentList.filter(s => !prev.has(s));
    const removed = Array.from(prev).filter(s => !universe.has(s));

    if (added.length > 0) {
      console.log(`[REGISTRY] ➕ Added to ${region} Active List: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
      console.log(`[REGISTRY] ➖ Removed from ${region} Active List: ${removed.join(', ')}`);
    }

    this.lastUniverse.set(region, universe);

    return {
      hot: Array.from(holdingSymbols),
      ephemeral: regionalViews.filter(s => !holdingSymbols.has(s)),
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

    if (snapshots.length === 0) return;

    const { error } = await supabase
      .from('active_market_symbols')
      .upsert(snapshots, { onConflict: 'symbol' });

    if (error) {
      console.error(`[REGISTRY] ❌ Failed to persist active registry:`, error.message);
    }
  }
}
