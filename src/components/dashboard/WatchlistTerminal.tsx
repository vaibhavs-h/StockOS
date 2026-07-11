
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { List as ListIcon, Trash2, Activity, Info, Crown } from 'lucide-react';
import { supabase } from '@/services/DatabaseClient';
import { cn } from '@/lib/utils';
import { WatchlistRow } from './WatchlistRow';

interface Watchlist {
  id: string;
  name: string;
  assets: any[];
}

interface WatchlistTerminalProps {
  userId: string;
  holdings?: any[];
}

export const WatchlistTerminal: React.FC<WatchlistTerminalProps> = ({ userId, holdings: propHoldings }) => {
  const { data: session } = useSession();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // Ghost Architecture: Track if we've ever successfully loaded data
  const hasLoadedOnce = useRef(false);

  const fetchWatchlists = useCallback(async () => {
    if (!userId || userId === 'guest') {
      setIsLoading(false);
      return;
    }

    try {
      // Only show skeleton on absolute first load
      if (!hasLoadedOnce.current) {
        setIsLoading(true);
      }

      const { data: lists, error: listsError } = await supabase
        .from('user_watchlists')
        .select(`
          id,
          name,
          watchlist_assets (symbol)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (listsError) throw listsError;

      if (lists && lists.length > 0) {
        const allSymbols = Array.from(new Set(lists.flatMap(l => l.watchlist_assets?.map((a: any) => a.symbol) || [])));

        // Fetch in parallel from both market_assets and mutual_funds_master
        const [marketAssetsRes, mfAssetsRes] = await Promise.all([
          supabase.from('market_assets').select('*').in('symbol', allSymbols),
          supabase.from('mutual_funds_master').select('isin, name, current_price, day_change_percentage, scheme_code, symbol').in('isin', allSymbols)
        ]);

        const marketMap = new Map(marketAssetsRes.data?.map(a => [a.symbol.trim().toUpperCase(), a]) || []);
        const mfMap = new Map(mfAssetsRes.data?.map(a => [a.isin.trim().toUpperCase(), a]) || []);

        const activeHoldings = propHoldings || [];
        const holdingsMap = new Map();
        activeHoldings.forEach(h => {
          if (!h) return;
          if (h.symbol) {
            const clean = h.symbol.trim().toUpperCase();
            const base = clean.split('.')[0];
            holdingsMap.set(clean, h);
            holdingsMap.set(base, h);
            holdingsMap.set(`${base}.NS`, h);
            holdingsMap.set(`${base}.BO`, h);
          }
          if (h.isin) {
            holdingsMap.set(h.isin.trim().toUpperCase(), h);
          }
          if (h.scheme_code) {
            holdingsMap.set(h.scheme_code.toString().trim(), h);
          }
        });

        const formattedLists = lists.map(l => ({
          id: l.id,
          name: l.name,
          assets: (l.watchlist_assets || []).map((wa: any) => {
            const sym = wa.symbol?.trim().toUpperCase();
            if (!sym) return null;

            const isMF = sym.startsWith('INF') || (sym.length === 12 && sym.startsWith('IN'));
            if (isMF) {
              const mfData = mfMap.get(sym);
              if (!mfData) return null;
              const holding = holdingsMap.get(sym) || holdingsMap.get(mfData.scheme_code);
              return {
                symbol: sym,
                displaySymbol: mfData.symbol || sym,
                name: mfData.name,
                current_price: mfData.current_price,
                day_change_percentage: mfData.day_change_percentage,
                market: 'MF',
                holding: holding || null
              };
            } else {
              const marketData = marketMap.get(sym);
              if (!marketData) return null;
              const holding = holdingsMap.get(sym) || holdingsMap.get(sym.split('.')[0]);
              return { ...marketData, holding: holding || null };
            }
          }).filter(Boolean)
        }));

        setWatchlists(formattedLists);

        // Initial Load Heartbeat: Instantly alert the active_market_symbols registry upon mount or full load
        const activeListIdToUse = activeListId || formattedLists[0]?.id;
        const currentActiveList = formattedLists.find(l => l.id === activeListIdToUse);
        if (currentActiveList && currentActiveList.assets) {
          const activeSymbols = currentActiveList.assets.map(a => a.symbol);
          const stockSymbols = activeSymbols.filter(sym => !sym.startsWith('INF') && !(sym.length === 12 && sym.startsWith('IN')));
          if (stockSymbols.length > 0) {
            const nowStr = new Date().toISOString();
            supabase
              .from('active_market_symbols')
              .update({ last_watchlist_seen_at: nowStr, last_viewed_at: nowStr })
              .in('symbol', stockSymbols)
              .then(() => { }); // Fire and forget
          }
        }

        if (!activeListId && formattedLists.length > 0) setActiveListId(formattedLists[0].id);

        // Mark as loaded to prevent future skeletons
        hasLoadedOnce.current = true;
      }
    } catch (err) {
      console.error('Watchlist error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, activeListId, propHoldings]);

  // Surgical Price Syncer: Queries only specific symbols and updates state without full list reload
  const syncAssetPrices = useCallback(async (symbolsToSync: string[]) => {
    if (symbolsToSync.length === 0) return;
    try {
      const [updatedAssetsRes, updatedMfRes] = await Promise.all([
        supabase.from('market_assets').select('*').in('symbol', symbolsToSync),
        supabase.from('mutual_funds_master').select('isin, name, current_price, day_change_percentage, scheme_code, symbol').in('isin', symbolsToSync)
      ]);

      const updatedAssets = updatedAssetsRes.data || [];
      const updatedMfs = updatedMfRes.data || [];

      if (updatedAssets.length > 0 || updatedMfs.length > 0) {
        const marketMap = new Map(updatedAssets.map(a => [a.symbol.trim().toUpperCase(), a]));
        const mfMap = new Map(updatedMfs.map(a => [a.isin.trim().toUpperCase(), a]));

        // Heartbeat: Notify active_market_symbols registry that these stocks are being actively viewed on a watchlist
        const stockSymbols = symbolsToSync.filter(sym => !sym.startsWith('INF') && !(sym.length === 12 && sym.startsWith('IN')));
        if (stockSymbols.length > 0) {
          const nowStr = new Date().toISOString();
          supabase
            .from('active_market_symbols')
            .update({ last_watchlist_seen_at: nowStr, last_viewed_at: nowStr })
            .in('symbol', stockSymbols)
            .then(() => { }); // Fire and forget
        }

        setWatchlists(prevLists => prevLists.map(list => ({
          ...list,
          assets: list.assets.map(asset => {
            if (!asset || !asset.symbol) return asset;
            const cleanSymbol = asset.symbol.trim().toUpperCase();

            const isMF = cleanSymbol.startsWith('INF') || (cleanSymbol.length === 12 && cleanSymbol.startsWith('IN'));
            if (isMF) {
              const updatedData = mfMap.get(cleanSymbol);
              if (updatedData) {
                return {
                  ...asset,
                  name: updatedData.name,
                  current_price: updatedData.current_price,
                  day_change_percentage: updatedData.day_change_percentage,
                  displaySymbol: updatedData.symbol || cleanSymbol
                };
              }
            } else {
              const updatedData = marketMap.get(cleanSymbol);
              if (updatedData) {
                return { ...asset, ...updatedData };
              }
            }
            return asset;
          }).filter(Boolean)
        })));
      }
    } catch (err) {
      console.error('Surgical sync error:', err);
    }
  }, []);

  useEffect(() => {
    fetchWatchlists();
  }, [fetchWatchlists]);

  const activeList = watchlists.find(l => l.id === activeListId);
  const activeSymbolsStr = activeList?.assets?.map(a => a.symbol).sort().join(',') || '';

  // Dual Market Scheduler: Runs separate, timezone-aware loops for Indian and US assets
  useEffect(() => {
    if (!activeListId || !activeList || !activeList.assets) return;

    const indianSymbols = activeList.assets
      .map(a => a.symbol)
      .filter(sym => sym.endsWith('.NS') || sym.endsWith('.BO'));

    const usSymbols = activeList.assets
      .map(a => a.symbol)
      .filter(sym => !sym.endsWith('.NS') && !sym.endsWith('.BO'));

    let indianTimeoutId: NodeJS.Timeout;
    let usTimeoutId: NodeJS.Timeout;

    const checkIndianMarketOpen = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const day = ist.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      if (day === 0 || day === 6) return false;
      const mins = ist.getHours() * 60 + ist.getMinutes();
      return mins >= 555 && mins <= 930; // 9:15 AM to 3:30 PM IST
    };

    const checkUsMarketOpen = () => {
      const now = new Date();
      const est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const day = est.getDay();
      if (day === 0 || day === 6) return false;
      const mins = est.getHours() * 60 + est.getMinutes();
      return mins >= 570 && mins <= 960; // 9:30 AM to 4:00 PM EST
    };

    // 🇮🇳 Indian Sync Loop
    const runIndianSync = () => {
      if (indianSymbols.length === 0) return;
      const delay = checkIndianMarketOpen() ? 10000 : 3600000; // 10s or 1h (off-market)
      indianTimeoutId = setTimeout(async () => {
        await syncAssetPrices(indianSymbols);
        runIndianSync();
      }, delay);
    };

    // 🇺🇸 US Sync Loop
    const runUsSync = () => {
      if (usSymbols.length === 0) return;
      const delay = checkUsMarketOpen() ? 10000 : 3600000; // 10s or 1h (off-market)
      usTimeoutId = setTimeout(async () => {
        await syncAssetPrices(usSymbols);
        runUsSync();
      }, delay);
    };

    runIndianSync();
    runUsSync();

    return () => {
      clearTimeout(indianTimeoutId);
      clearTimeout(usTimeoutId);
    };
  }, [activeListId, activeSymbolsStr, syncAssetPrices]);

  const isMainWatchlist = activeList?.name.toLowerCase() === 'main watchlist' || activeList?.name.toLowerCase() === 'default';

  const handleDeleteWatchlist = async () => {
    if (!activeListId) return;

    if (isMainWatchlist) {
      alert("System Protected: The Main Watchlist is a core component and cannot be purged.");
      return;
    }

    if (!confirm(`Are you sure you want to delete "${activeList?.name}"?`)) return;

    try {
      setIsDeleting(true);
      await supabase.from('watchlist_assets').delete().eq('watchlist_id', activeListId);
      const { error } = await supabase.from('user_watchlists').delete().eq('id', activeListId);
      if (error) throw error;
      setWatchlists(prev => prev.filter(l => l.id !== activeListId));
      setActiveListId(watchlists[0]?.id || null);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveAsset = async (symbol: string) => {
    if (!activeListId) return;

    try {
      const { error } = await supabase
        .from('watchlist_assets')
        .delete()
        .eq('watchlist_id', activeListId)
        .eq('symbol', symbol);

      if (error) throw error;

      setWatchlists(prev => prev.map(list => {
        if (list.id === activeListId) {
          return { ...list, assets: list.assets.filter(a => a.symbol !== symbol) };
        }
        return list;
      }));
    } catch (err) {
      console.error('Remove asset failed:', err);
    }
  };

  const tier = ((session?.user as any)?.subscription_tier || 'free').toLowerCase();

  if (tier === 'free') {
    return (
      <div className="flex flex-col h-full bg-[#0a0d14]/80 backdrop-blur-3xl overflow-hidden rounded-[40px] border border-white/10 shadow-2xl items-center justify-center p-8 text-center relative min-h-[440px]">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="absolute inset-0 bg-cyan-500/5 blur-[120px] size-64 rounded-full pointer-events-none" />
        
        <div className="size-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 shadow-[0_0_20px_rgba(245,158,11,0.15)] relative z-10">
          <Crown className="w-8 h-8 animate-pulse" />
        </div>
        
        <h3 className="text-sm font-black uppercase tracking-[0.25em] text-white mb-3 relative z-10">
          Watchlists Premium
        </h3>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 max-w-[280px] leading-relaxed mb-8 relative z-10">
          Watchlist tracking requires a LITE or PRO plan. Upgrade your account to link real-time watchlists!
        </p>
        
        <Link 
          href="/subscription"
          className="px-8 py-3.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-black text-[10px] font-black uppercase tracking-[0.25em] text-center shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_30px_rgba(245,158,11,0.45)] transition-all duration-300 relative z-10"
        >
          Upgrade Plan
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0d14]/80 backdrop-blur-3xl overflow-hidden rounded-[40px] border border-white/10 shadow-2xl">
      {/* Scalable Ultra-Rounded Header */}
      <div className="px-6 py-3 flex items-center justify-between shrink-0 border-b border-white/[0.05] bg-gradient-to-r from-white/[0.05] to-transparent backdrop-blur-3xl z-20 rounded-t-[39px]">
        <div className="flex items-center gap-10 flex-1 min-w-0">
          <div className="flex items-center gap-3 shrink-0 group">
            <div className="relative">
              <div className="size-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee,0_0_4px_#22d3ee] animate-pulse shrink-0" />
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-cyan-400"
              />
            </div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-white transition-colors duration-500">
              <span className="text-cyan-400/60 ml-1">Watchlists</span>
            </h2>
          </div>

          {/* Horizontal Navigator Track */}
          <div className="flex items-center gap-2 bg-white/[0.02] p-1 rounded-full border border-white/[0.05] shadow-inner overflow-x-auto no-scrollbar scroll-smooth flex-1 max-w-2xl">
            <div className="flex items-center gap-1 shrink-0">
              {watchlists.map(list => (
                <button
                  key={list.id}
                  onClick={() => setActiveListId(list.id)}
                  className={cn(
                    "px-5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all relative z-10 whitespace-nowrap",
                    activeListId === list.id
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <span className="max-w-[140px] truncate block">
                    {list.name}
                  </span>
                  {activeListId === list.id && (
                    <motion.div
                      layoutId="active-header-pill"
                      className="absolute inset-0 rounded-full bg-white/[0.05] border border-white/10 shadow-lg"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Persistent Action HUD */}
        <AnimatePresence mode="wait">
          <motion.button
            key={isMainWatchlist ? "main" : "custom"}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            onClick={handleDeleteWatchlist}
            disabled={isDeleting}
            className={cn(
              "group flex items-center gap-3 px-4 py-1.5 rounded-full border transition-all duration-300 shrink-0 ml-6",
              isMainWatchlist
                ? "border-white/5 bg-white/[0.02] text-zinc-500 cursor-help"
                : "border-rose-500/10 bg-rose-500/5 text-rose-500 hover:bg-rose-500 hover:text-white"
            )}
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100">Remove</span>
          </motion.button>
        </AnimatePresence>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 pt-4 pb-5 px-6 relative flex flex-col justify-between">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                className="relative h-[140px] rounded-[24px] border border-white/5 bg-white/[0.01] p-6 flex flex-col justify-between overflow-hidden"
              >
                <motion.div
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -skew-x-12"
                />
                <div className="flex justify-between items-start">
                  <div className="size-9 rounded-xl bg-white/[0.03] animate-pulse" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-20 bg-white/[0.03] rounded-md animate-pulse" />
                </div>
                <div className="flex justify-between items-end">
                  <div className="h-5 w-16 bg-white/[0.03] rounded-md animate-pulse" />
                  <div className="h-6 w-14 bg-white/[0.02] rounded-full animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : activeList?.assets && activeList.assets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {activeList.assets.slice(0, 6).map((asset) => (
                <WatchlistRow
                  key={asset.symbol}
                  asset={asset}
                  onRemove={handleRemoveAsset}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative flex flex-col items-center"
            >
              <div className="absolute inset-0 bg-cyan-500/10 blur-[80px] size-64 -translate-y-8" />
              <div className="size-16 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center relative mb-8">
                <motion.div
                  animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full border border-cyan-400/20"
                />
                <Activity className="w-6 h-6 text-zinc-700 stroke-[1.5px]" />
              </div>
              <div className="text-center z-10">
                <h3 className="text-[13px] font-black uppercase tracking-[0.25em] text-white/50 mb-3">
                  Watchlist is Empty...
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 max-w-[280px] leading-relaxed opacity-60">
                  Add Stocks for Live Tracking!!
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Institutional Advisory Footer */}
      <div className="px-6 py-2.5 border-t border-white/[0.03] bg-white/[0.01] flex items-center justify-center gap-3 rounded-b-[39px]">
        <Info className="w-3.5 h-3.5 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.4)]" />
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-300/80 drop-shadow-[0_0_5px_rgba(251,191,36,0.2)]">
          Guidance: To configure price alerts, navigate to the individual stock portal.
        </p>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};
