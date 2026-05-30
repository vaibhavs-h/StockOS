import { SupabaseProvider } from '../providers/SupabaseProvider';
import { marketStateCache } from './MarketStateCache';

export class MFActiveRegistryService {
  private static lastMFUniverse: Set<string> = new Set();

  /**
   * Adaptive active universe identifier.
   * Compiles the dynamic list of mutual funds requiring syncing:
   * (Unique Holdings) + (Unique Watchlists) + (Active Page Views)
   */
  public static async getActiveUniverse() {
    const supabase = SupabaseProvider.getClient();

    // 1. Fetch unique scheme codes from active user holdings
    const { data: holdings, error: hError } = await supabase
      .from('user_mutual_fund_holdings')
      .select('scheme_code');

    // 2. Fetch unique symbols from unified watchlist assets
    const { data: watchlists, error: wError } = await supabase
      .from('watchlist_assets')
      .select('symbol');

    if (hError || wError) {
      console.error(`[MF-REGISTRY] Database Fetch Error:`, hError?.message || wError?.message);
    }

    const heldSchemes = new Set((holdings || []).map(h => String(h.scheme_code)));
    const watchedSchemes = new Set<string>();

    if (watchlists && watchlists.length > 0) {
      const mfIsins = Array.from(new Set(
        watchlists
          .map(w => w.symbol?.trim().toUpperCase())
          .filter((sym): sym is string => !!sym && (sym.startsWith('INF') || (sym.length === 12 && sym.startsWith('IN'))))
      ));

      if (mfIsins.length > 0) {
        const { data: masterFunds, error: mError } = await supabase
          .from('mutual_funds_master')
          .select('scheme_code')
          .in('isin', mfIsins);

        if (mError) {
          console.error(`[MF-REGISTRY] Failed to resolve mutual fund ISINs to scheme codes:`, mError.message);
        } else if (masterFunds) {
          masterFunds.forEach(f => {
            if (f.scheme_code) {
              watchedSchemes.add(String(f.scheme_code));
            }
          });
        }
      }
    }

    const hotSchemes = new Set([...heldSchemes, ...watchedSchemes]);

    // 3. Extract active ephemeral viewed schemes from MarketStateCache
    // Ephemeral views only stay active for 2 mins after last heartbeat
    const activeViews = marketStateCache.getActiveViews(2 * 60 * 1000);
    const ephemeralSchemes = new Set<string>();

    activeViews.forEach(v => {
      let rawCode = '';
      if (v.startsWith('MF:')) {
        rawCode = v.slice(3); // Extract AMFI code from 'MF:120847'
      } else if (/^\d+$/.test(v)) {
        rawCode = v;          // If it is already purely numeric
      }

      if (rawCode && !hotSchemes.has(rawCode)) {
        ephemeralSchemes.add(rawCode);
      }
    });

    const totalSchemes = new Set([...hotSchemes, ...ephemeralSchemes]);
    const currentList = Array.from(totalSchemes);

    // Dynamic Change Detection Logging
    const prev = this.lastMFUniverse;
    const added = currentList.filter(s => !prev.has(s));
    const removed = Array.from(prev).filter(s => !totalSchemes.has(s));

    if (added.length > 0) {
      console.log(`[MF-REGISTRY] Added to MF Active List: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
      console.log(`[MF-REGISTRY] Removed from MF Active List: ${removed.join(', ')}`);
    }

    this.lastMFUniverse = totalSchemes;

    return {
      hot: Array.from(hotSchemes),
      held: Array.from(heldSchemes),
      watched: Array.from(watchedSchemes),
      ephemeral: Array.from(ephemeralSchemes),
      total: currentList
    };
  }

  /**
   * Persists the computed registry state into the active_mutual_funds table.
   * Auto-prunes obsolete funds no longer held, watched, or viewed.
   */
  public static async persistActiveRegistry(activeList: string[]) {
    const supabase = SupabaseProvider.getClient();
    const universe = await this.getActiveUniverse();
    
    if (universe.total.length === 0) {
      // If no active funds are registered, skip registry update
      return;
    }

    const heldSet = new Set(universe.held);
    const watchedSet = new Set(universe.watched);
    const now = new Date().toISOString();

    const snapshots = universe.total.map(schemeCode => {
      let state = 'EPHEMERAL';
      let priority = 3; // EPHEMERAL Page View
      let reason = 'VIEWED';

      if (heldSet.has(schemeCode)) {
        state = 'HOT';
        priority = 1;
        reason = 'PORTFOLIO';
      } else if (watchedSet.has(schemeCode)) {
        state = 'HOT';
        priority = 2;
        reason = 'WATCHLIST';
      }

      return {
        scheme_code: schemeCode,
        state,
        priority,
        reason,
        last_accessed: now,
        sync_enabled: true,
        updated_at: now
      };
    });

    // Bulk Upsert Snapshots into the active registry
    let { error } = await supabase
      .from('active_mutual_funds')
      .upsert(snapshots, { onConflict: 'scheme_code' });

    if (error && error.message.includes("reason")) {
      console.warn(`[MF-REGISTRY] Upsert failed due to missing 'reason' column in 'active_mutual_funds'.`);
      console.warn(`[MF-REGISTRY] Falling back to upserting without the 'reason' column...`);
      console.warn(`[MF-REGISTRY] Action Required: Please run the DDL migration in 'data/active_mf_trigger.sql' in your Supabase SQL Editor to add the missing 'reason' column and setup automated triggers.`);
      
      const fallbackSnapshots = snapshots.map(({ reason, ...rest }) => rest);
      const { error: retryError } = await supabase
        .from('active_mutual_funds')
        .upsert(fallbackSnapshots, { onConflict: 'scheme_code' });
      error = retryError;
    }

    if (error) {
      console.error(`[MF-REGISTRY] Failed to persist active registry symbols:`, error.message);
    }

    // --- SELF-CLEANING PRUNING ENGINE ---
    // Remove obsolete mutual funds that are no longer held, watched, or viewed
    try {
      const activeSet = new Set(universe.total);
      const { data: dbSchemes, error: fetchErr } = await supabase
        .from('active_mutual_funds')
        .select('scheme_code');

      if (!fetchErr && dbSchemes) {
        const obsoleteSchemes = dbSchemes
          .map(d => d.scheme_code)
          .filter(s => !activeSet.has(s));

        if (obsoleteSchemes.length > 0) {
          console.log(`[MF-REGISTRY] Pruning ${obsoleteSchemes.length} obsolete mutual funds: ${obsoleteSchemes.join(', ')}`);
          await supabase
            .from('active_mutual_funds')
            .delete()
            .in('scheme_code', obsoleteSchemes);
        }
      }
    } catch (err: any) {
      console.error(`[MF-REGISTRY] Pruning engine error:`, err.message);
    }
  }
}
