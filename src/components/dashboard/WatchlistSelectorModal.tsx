import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Plus, Loader2, List as ListIcon, ShieldCheck, Activity, AlertTriangle, Sparkles, Crown } from 'lucide-react';
import { supabase } from '@/services/DatabaseClient';
import { cn } from '@/lib/utils';
import StockOSPortal from '../shared/Portal';

interface WatchlistSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  userId: string;
}

interface WatchlistWithStatus {
  id: string;
  name: string;
  isInList: boolean;
}

export const WatchlistSelectorModal: React.FC<WatchlistSelectorModalProps> = ({
  isOpen,
  onClose,
  symbol,
  userId
}) => {
  const { data: session } = useSession();
  const [watchlists, setWatchlists] = useState<WatchlistWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [assetName, setAssetName] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<{
    type: 'limit' | 'subscription';
    title: string;
    message: string;
  } | null>(null);

  const fetchWatchlistStatus = useCallback(async () => {
    if (!userId || userId === 'guest') return;

    try {
      const isMF = symbol.startsWith('INF') || (symbol.length === 12 && symbol.startsWith('IN'));
      if (isMF) {
        const { data: mfData } = await supabase
          .from('mutual_funds_master')
          .select('name')
          .eq('isin', symbol.toUpperCase())
          .maybeSingle();
        if (mfData) setAssetName(mfData.name);
      } else {
        const { data: stockData } = await supabase
          .from('market_assets')
          .select('name')
          .eq('symbol', symbol.toUpperCase())
          .maybeSingle();
        if (stockData) setAssetName(stockData.name);
      }

      // 1. Fetch all user watchlists
      const { data: lists } = await supabase
        .from('user_watchlists')
        .select('id, name')
        .eq('user_id', userId);

      if (lists) {
        // 2. Fetch which of these lists contain the current symbol
        const { data: activeLinks } = await supabase
          .from('watchlist_assets')
          .select('watchlist_id')
          .eq('symbol', symbol.toUpperCase());

        const activeIds = new Set(activeLinks?.map(link => link.watchlist_id) || []);

        const formatted = lists.map(list => ({
          ...list,
          isInList: activeIds.has(list.id)
        }));

        setWatchlists(formatted);
      }
    } catch (err) {
      console.error('Error fetching watchlist status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, symbol]);

  useEffect(() => {
    if (isOpen) {
      fetchWatchlistStatus();
    }
  }, [isOpen, fetchWatchlistStatus]);

  const toggleAsset = async (listId: string, currentlyIn: boolean) => {
    setIsProcessing(listId);
    try {
      if (currentlyIn) {
        await supabase
          .from('watchlist_assets')
          .delete()
          .eq('watchlist_id', listId)
          .eq('symbol', symbol.toUpperCase());
      } else {
        // Fetch exact count of assets in this watchlist
        const { count, error } = await supabase
          .from('watchlist_assets')
          .select('*', { count: 'exact', head: true })
          .eq('watchlist_id', listId);

        if (error) throw error;

        if (count !== null && count >= 6) {
          setErrorBanner({
            type: 'limit',
            title: 'Radar Limit Exceeded',
            message: 'Every watchlist is restricted to a maximum of 6 stocks for optimal dashboard layout and performance. Please remove an existing stock before adding a new one.'
          });
          return;
        }

        await supabase
          .from('watchlist_assets')
          .insert({
            watchlist_id: listId,
            symbol: symbol.toUpperCase()
          });
      }
      // Refresh local state
      await fetchWatchlistStatus();
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  const createAndAdd = async () => {
    const tier = ((session?.user as any)?.subscription_tier || 'free').toLowerCase();
    if (tier !== 'lite' && tier !== 'pro') {
      setErrorBanner({
        type: 'subscription',
        title: 'Premium Feature',
        message: 'Creating custom watchlists requires a LITE or PRO plan. Upgrade your account to unlock unlimited custom watchlists!'
      });
      return;
    }

    const name = prompt('Watchlist Name:');
    if (!name) return;

    try {
      const { data: newList } = await supabase
        .from('user_watchlists')
        .insert({ user_id: userId, name })
        .select()
        .single();

      if (newList) {
        await toggleAsset(newList.id, false);
      }
    } catch (err) {
      console.error('Creation failed:', err);
    }
  };

  const displayLabel = assetName
    ? (assetName.length > 25 ? `${assetName.slice(0, 25).trim()}...` : assetName)
    : symbol;

  return (
    <StockOSPortal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-[6px] pointer-events-auto"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-[#03060b] border border-white/10 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,1)] overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="px-8 pt-8 pb-4 flex items-start justify-between">
                <div className="flex items-start gap-5">
                  <div className="size-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/5 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                    <ListIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-[0.25em] text-white leading-none mb-2">Add to Watchlist</h3>
                    <div className="flex items-center gap-2">
                      <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">{displayLabel}</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="size-10 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* List Content */}
              <div className="px-8 pb-8 max-h-[480px] overflow-y-auto no-scrollbar">
                {isLoading && userId !== 'guest' ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-6">
                    <div className="relative size-12">
                      <div className="absolute inset-0 border-2 border-blue-500/10 rounded-full" />
                      <div className="absolute inset-0 border-2 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                    <span className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.4em] animate-pulse">Syncing Pulse...</span>
                  </div>
                ) : userId === 'guest' ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="size-14 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-6">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-black uppercase tracking-[0.15em] text-white mb-3">Sign In Required</h4>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide leading-relaxed">
                      Watchlists can only be saved for registered users. Please sign in to save and sync your stocks!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {watchlists.map(list => (
                      <button
                        key={list.id}
                        disabled={isProcessing === list.id}
                        onClick={() => toggleAsset(list.id, list.isInList)}
                        className={cn(
                          "w-full flex items-center justify-between px-6 py-5 rounded-3xl border transition-all duration-500 group relative overflow-hidden",
                          list.isInList
                            ? "bg-emerald-500/[0.04] border-emerald-500/40 text-emerald-400"
                            : "bg-white/[0.02] border-white/5 text-zinc-500 hover:border-white/20 hover:text-white hover:bg-white/[0.04]"
                        )}
                      >
                        {list.isInList && (
                          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.05] to-transparent pointer-events-none" />
                        )}
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] relative z-10 truncate max-w-[240px]">{list.name}</span>
                        <div className={cn(
                          "size-7 rounded-xl flex items-center justify-center transition-all duration-500 relative z-10",
                          list.isInList
                            ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                            : "bg-white/[0.03] text-transparent border border-white/10 group-hover:border-white/20"
                        )}>
                          {isProcessing === list.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className={cn("w-4 h-4 stroke-[3.5] transition-transform duration-500", list.isInList ? "scale-100" : "scale-0")} />
                          )}
                        </div>
                      </button>
                    ))}

                    <button
                      onClick={createAndAdd}
                      className="w-full flex items-center gap-4 px-6 py-5 rounded-3xl border border-dashed border-white/10 text-zinc-600 hover:border-white/30 hover:text-zinc-300 hover:bg-white/[0.02] transition-all duration-500 group"
                    >
                      <div className="size-7 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center group-hover:bg-white/10 group-hover:scale-110 transition-all duration-500">
                        <Plus className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-[0.2em]">Create New Watchlist</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Screen-level Premium Alert Overlay */}
            <AnimatePresence>
              {errorBanner && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-transparent backdrop-blur-[24px] z-[10000] flex items-center justify-center p-6 pointer-events-auto"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 30, opacity: 0 }}
                    animate={{ 
                      scale: 1, 
                      y: 0, 
                      opacity: 1,
                      borderColor: errorBanner.type === 'limit' 
                        ? ["rgba(239,68,68,0.2)", "rgba(239,68,68,0.35)", "rgba(239,68,68,0.2)"]
                        : ["rgba(245,158,11,0.25)", "rgba(147,51,234,0.4)", "rgba(59,130,246,0.4)", "rgba(245,158,11,0.25)"]
                    }}
                    exit={{ scale: 0.9, y: 30, opacity: 0 }}
                    transition={{ 
                      scale: { type: "spring", damping: 20, stiffness: 300 },
                      y: { type: "spring", damping: 20, stiffness: 300 },
                      borderColor: { repeat: Infinity, duration: 6, ease: "linear" }
                    }}
                    className={cn(
                      "w-full max-w-sm bg-white/[0.08] backdrop-blur-[40px] border border-white/[0.18] p-9 flex flex-col items-center text-center relative overflow-hidden rounded-[2.5rem] shadow-[0_0_80px_rgba(255,255,255,0.03)]"
                    )}
                  >
                    {/* Cosmic Rotating Ambient Glow */}
                    <motion.div
                      animate={{
                        scale: [1, 1.25, 0.95, 1.15, 1],
                        rotate: [0, 90, 180, 270, 360],
                        opacity: [0.35, 0.55, 0.4, 0.6, 0.35]
                      }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 10, 
                        ease: "linear" 
                      }}
                      className={cn(
                        "absolute -top-24 size-64 rounded-full blur-[50px] pointer-events-none",
                        errorBanner.type === 'limit' 
                          ? "bg-gradient-to-br from-red-500 via-purple-500/25 to-red-600" 
                          : "bg-gradient-to-br from-amber-500 via-purple-500/35 to-blue-500"
                      )}
                    />

                    {/* Interactive Floating Badge Container */}
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 4, 
                        ease: "easeInOut" 
                      }}
                      className={cn(
                        "relative z-10 size-18 rounded-[1.25rem] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]",
                        errorBanner.type === 'limit'
                          ? "bg-gradient-to-b from-red-500/20 to-red-950/5 border border-red-500/30 text-red-400 shadow-red-500/10"
                          : "bg-gradient-to-b from-amber-400/25 to-amber-950/5 border border-amber-400/30 text-amber-400 shadow-amber-500/15"
                      )}
                    >
                      {errorBanner.type === 'limit' ? (
                        <>
                          <AlertTriangle className="w-8 h-8" />
                          <motion.div
                            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                            className="absolute -top-1 -right-1 size-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/30"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                          </motion.div>
                        </>
                      ) : (
                        <>
                          <Crown className="w-8 h-8 text-amber-400" />
                          <motion.div
                            animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.4, 1, 0.4] }}
                            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                            className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-300 border border-amber-400/30"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                          </motion.div>
                        </>
                      )}
                    </motion.div>

                    {/* Staggered Title */}
                    <motion.h4
                      initial={{ y: 15, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.15 }}
                      className={cn(
                        "text-[17px] font-black uppercase tracking-[0.25em] mb-4 relative z-10 text-center text-transparent bg-clip-text",
                        errorBanner.type === 'limit'
                          ? "bg-gradient-to-r from-red-400 via-zinc-100 to-red-400"
                          : "bg-gradient-to-r from-amber-300 via-zinc-100 to-amber-300"
                      )}
                    >
                      {errorBanner.title}
                    </motion.h4>

                    {/* Staggered Description */}
                    <motion.p
                      initial={{ y: 15, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: "spring", damping: 15, stiffness: 180, delay: 0.25 }}
                      className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider leading-relaxed mb-8 max-w-[280px] relative z-10 text-center"
                    >
                      {errorBanner.message}
                    </motion.p>

                    {/* Staggered Actions */}
                    <div className="flex flex-col gap-3 w-full max-w-[280px] relative z-10">
                      {errorBanner.type === 'subscription' ? (
                        <>
                          <motion.a
                            href="/subscription"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: "spring", damping: 15, stiffness: 150, delay: 0.35 }}
                            whileHover={{ scale: 1.03, y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-black text-[10px] font-black uppercase tracking-[0.25em] text-center shadow-[0_0_30px_rgba(245,158,11,0.25)] hover:shadow-[0_0_40px_rgba(245,158,11,0.45)] transition-all duration-300"
                          >
                            Upgrade Plan
                          </motion.a>
                          <motion.button
                            onClick={() => setErrorBanner(null)}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: "spring", damping: 15, stiffness: 150, delay: 0.45 }}
                            whileHover={{ backgroundColor: "rgba(255,255,255,0.06)", scale: 1.01 }}
                            className="w-full py-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300"
                          >
                            Maybe Later
                          </motion.button>
                        </>
                      ) : (
                        <motion.button
                          onClick={() => setErrorBanner(null)}
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ type: "spring", damping: 15, stiffness: 150, delay: 0.35 }}
                          whileHover={{ backgroundColor: "rgba(255,255,255,0.06)", scale: 1.01 }}
                          className="w-full py-4 rounded-2xl bg-white/[0.02] border border-white/5 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300"
                        >
                          Acknowledge
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>
    </StockOSPortal>
  );
};
