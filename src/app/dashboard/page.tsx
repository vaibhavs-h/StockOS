"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Terminal,
  Search,
  Newspaper,
  Cpu,
  TrendingUp,
  RefreshCcw,
  Send,
  Database
} from "lucide-react"
import { supabase } from "@/services/DatabaseClient"
import axios from "axios"
import { WealthPerformanceChart as WealthChart } from "@/components/dashboard/WealthPerformanceChart"
import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const router = useRouter()
  const [holdings, setHoldings] = useState<any[]>([])
  const [indices, setIndices] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [timeRange, setTimeRange] = useState("ALL")


  const portfolioId = "primary";

  const fetchHoldings = async () => {
    try {
      const { data, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('market_value', { ascending: false });

      if (error) throw error;
      setHoldings(data || []);
    } catch (err) {
      console.error("[DASHBOARD] Fetch holdings failed:", err);
    } finally {
      setLoading(false);
    }
  }


  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('portfolio_history')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error("[DASHBOARD] Fetch history failed:", err);
    }
  }


  const fetchIndices = async () => {
    try {
      const res = await axios.get('http://localhost:3003/api/indices');
      setIndices(res.data);
    } catch (err) {
      console.warn("[DASHBOARD] Fetch indices failed:", err);
    }
  }

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      // Trigger a manual backend sync to get fresh data from Groww
      await axios.post('http://localhost:3003/api/sync');
    } catch (err: any) {
      // Silent fail, rely on local cache
    }
    await Promise.all([fetchHoldings(), fetchHistory(), fetchIndices()]);
    setTimeout(() => setIsRefreshing(false), 800); // Visual polish delay
  }

  useEffect(() => {
    fetchHoldings();
    fetchHistory();
    fetchIndices();
    
    // Subscribe to Realtime Updates for Holdings & History
    const holdingsSubscription = supabase
      .channel('holdings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings' }, (payload) => {
        // Delay fetch by 1s to allow DB to settle after engine delete/insert cycle
        setTimeout(fetchHoldings, 1000);
      })
      .subscribe();

    const historySubscription = supabase
      .channel('history-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_history' }, (payload) => {
        // Delay fetch by 1s to allow DB to settle after engine delete/insert cycle
        setTimeout(fetchHistory, 1000);
      })
      .subscribe();

    const interval = setInterval(fetchIndices, 30000); // Live update indices every 30s
    const syncInterval = setInterval(() => {
      fetchHoldings();
      fetchHistory();
    }, 30000); // Bulletproof heartbeat fallback every 30s
    
    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
      supabase.removeChannel(holdingsSubscription);
      supabase.removeChannel(historySubscription);
    };
  }, []);


  const totalNetWorth = holdings.reduce((sum, h) => sum + h.market_value, 0);
  const totalDayChange = holdings.reduce((sum, h) => sum + h.day_change, 0);
  const totalInvested = holdings.reduce((sum, h) => sum + h.invested_value, 0);
  const dayChangePerc = totalNetWorth > 0 ? (totalDayChange / (totalNetWorth - totalDayChange)) * 100 : 0;
  const totalPL = totalNetWorth - totalInvested;
  const totalPLPerc = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const filteredHoldings = holdings.filter(h =>
    h.trading_symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    const now = new Date();
    let cutoff = new Date(0); // Default to ALL

    if (timeRange === "1W") {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "1M") {
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "3M") {
      cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "6M") {
      cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    }

    const filtered = history.filter(h => new Date(h.timestamp) >= cutoff);
    
    // Stitch live point at the end for visual consistency
    if (filtered.length > 0) {
      const lastPoint = filtered[filtered.length - 1];
      const nowStr = new Date().toISOString();
      
      // Only append if the last snapshot isn't already from "now"
      if (new Date(lastPoint.timestamp).getTime() < now.getTime() - 60000) {
        return [...filtered, {
          timestamp: nowStr,
          total_market_value: totalNetWorth,
          total_invested: lastPoint.total_invested, // Best guess
          portfolio_id: lastPoint.portfolio_id
        }];
      }
    }
    
    return filtered;
  }, [history, timeRange, totalNetWorth]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  }

  const startValue = useMemo(() => {
    if (filteredHistory.length === 0) return totalNetWorth - totalDayChange;
    // Use the very first point in our filtered range as the base
    return filteredHistory[0].total_market_value;
  }, [filteredHistory, totalNetWorth, totalDayChange]);

  const rangeIsPositive = totalNetWorth >= startValue;
  const rangeChange = startValue > 0 ? ((totalNetWorth - startValue) / startValue) * 100 : 0;

  return (
    <div className="min-h-screen bg-transparent text-on-surface font-ui-body selection:bg-emerald-500/30 relative overflow-x-hidden">

      {/* Main Dashboard Content */}
      <main
        className="pt-24 pb-16 px-6 max-w-[1700px] mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 relative z-10"
      >
        {/* Left Section: Dashboard Content */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1,
                delayChildren: 0.6
              }
            }
          }}
          className="flex flex-col gap-8"
        >
          {/* Zen Hero Section: Net Worth Overview */}
          <motion.section
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-8 mb-4 items-end"
          >
            <div className="relative group">
              <div className="absolute -inset-4 bg-emerald-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <span className="font-terminal-label uppercase tracking-wider text-[12px] text-emerald-400 block mb-3 font-bold relative z-10">Total Net Worth</span>
              <h1 className="font-headline font-bold text-5xl md:text-6xl tracking-tighter text-white tabular-nums leading-none relative z-10">
                {formatCurrency(totalNetWorth)}
              </h1>
            </div>
            <div className="flex flex-col gap-1 border-l border-white/5 pl-6">
              <span className="font-terminal-label uppercase tracking-wider text-[12px] text-zinc-300 block mb-2 font-bold">Daily P/L</span>
              <div className="flex items-center gap-4">
                <span className={`font-headline font-bold text-2xl md:text-3xl tabular-nums ${totalDayChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {totalDayChange >= 0 ? '+' : ''}{formatCurrency(totalDayChange)}
                </span>
                <span className={`font-terminal-label border px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${totalDayChange >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                  {totalDayChange >= 0 ? '+' : ''}{dayChangePerc.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1 border-l border-white/5 pl-6">
              <span className="font-terminal-label uppercase tracking-wider text-[12px] text-zinc-300 block mb-2 font-bold">Aggregate P/L</span>
              <div className="flex items-center gap-4">
                <span className={`font-headline font-bold text-2xl md:text-3xl tabular-nums ${totalPL >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL)}
                </span>
                <span className="font-terminal-label bg-white/5 border border-white/10 text-white/60 px-2 py-0.5 rounded-[4px] text-[10px] font-bold">
                  {totalPLPerc.toFixed(1)}%
                </span>
              </div>
            </div>
          </motion.section>

          {/* Performance Chart */}
          <motion.section
            variants={{
              hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
              visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="glass-panel rounded-3xl p-8 pb-4 relative overflow-hidden group border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-gradient-to-b from-white/[0.04] to-transparent"
          >
            <div className="flex justify-between items-center mb-8 relative z-10">
              <div>
                <h3 className="font-terminal-label text-[12px] uppercase tracking-wider text-zinc-300 mb-3 font-bold">Historical Performance</h3>
                <div className="flex items-baseline gap-4">
                  <span className="font-headline font-bold text-4xl tracking-tighter text-white tabular-nums">{formatCurrency(totalNetWorth)}</span>
                  <span className={`font-terminal-label text-[10px] border px-2 py-0.5 rounded-[4px] uppercase tracking-widest font-bold ${rangeIsPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                    {rangeIsPositive ? '+' : ''}{rangeChange.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="flex gap-2 relative z-20">
                {['1W', '1M', '3M', '6M', 'ALL'].map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-4 py-1.5 rounded-lg font-terminal-label text-[11px] font-bold tracking-widest border transition-all duration-300 ${
                      timeRange === range 
                        ? (rangeIsPositive ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.15)]' : 'bg-red-500/20 border-red-500/60 text-red-400 shadow-[0_0_25px_rgba(239,68,68,0.15)]')
                        : 'border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[340px] w-full pt-0">
              {filteredHistory.length > 0 ? (
                <WealthChart data={Object.values(
                  filteredHistory.reduce((acc: any, h) => {
                    if (!h.timestamp) return acc;
                    const dateParts = h.timestamp.split('T');
                    if (dateParts.length < 1) return acc;
                    const date = dateParts[0];
                    const ts = new Date(`${date}T15:30:00`).getTime();
                    if (isNaN(ts)) return acc;
                    const timestamp = Math.floor(ts / 1000);
                    acc[date] = { time: timestamp as any, value: h.total_market_value };
                    return acc;
                  }, {})
                ) as { time: string; value: number }[]} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
                  <Cpu className="w-12 h-12 animate-pulse" />
                  <span className="font-terminal-label text-[10px] uppercase tracking-[0.4em]">Synchronizing Market Data...</span>
                </div>
              )}
            </div>
          </motion.section>

          {/* Asset Allocation Console */}
          <motion.section
            variants={{
              hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
              visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="glass-panel rounded-2xl overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-gradient-to-b from-white/[0.02] to-transparent"
          >
            <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
              <h3 className="font-terminal-label text-[12px] uppercase tracking-wider text-zinc-300 font-bold">Current Holdings</h3>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500/30 group-focus-within:text-emerald-500 transition-colors w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="FILTER ASSETS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-black/60 border border-white/5 text-[10px] tracking-[0.2em] font-terminal-label pl-10 pr-4 py-2.5 w-64 rounded-xl focus:ring-1 focus:ring-emerald-500/40 focus:outline-none placeholder:text-white/10 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-8 py-5 font-terminal-label text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-bold">Stock Details</th>
                    <th className="px-6 py-5 font-terminal-label text-[9px] uppercase tracking-[0.3em] text-zinc-500 text-right font-bold">Quantity</th>
                    <th className="px-6 py-5 font-terminal-label text-[9px] uppercase tracking-[0.3em] text-zinc-500 text-right font-bold">Avg. Cost</th>
                    <th className="px-6 py-5 font-terminal-label text-[9px] uppercase tracking-[0.3em] text-zinc-500 text-right font-bold">Market Value</th>
                    <th className="px-8 py-5 font-terminal-label text-[9px] uppercase tracking-[0.3em] text-zinc-500 text-right font-bold">Returns (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">

                  {filteredHoldings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-40">
                          <div className="w-12 h-12 rounded-full border border-emerald-500/20 flex items-center justify-center animate-pulse">
                            <Database className="w-5 h-5 text-emerald-500/50" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="font-terminal-label text-[10px] uppercase tracking-[0.4em] text-emerald-500">
                              {searchQuery ? "No Matching Assets" : "Portfolio Not Found"}
                            </span>
                            <span className="font-data-sm text-[11px] text-zinc-500 uppercase tracking-widest">
                              {searchQuery ? "Adjust your search query" : "Awaiting market data stream"}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence>
                      {filteredHoldings.map((asset, idx) => (
                        <motion.tr
                          key={asset.id || asset.trading_symbol}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.5, delay: idx * 0.05, ease: "easeInOut" }}
                          onClick={() => router.push(`/stocks/${asset.trading_symbol}`)}
                          className="hover:bg-emerald-500/[0.05] transition-all group cursor-pointer border-b border-white/[0.03]"
                        >
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <span className="font-headline font-bold text-sm text-white tracking-tight group-hover:text-emerald-400 transition-colors">{asset.trading_symbol}</span>
                            <span className="font-terminal-label text-[9px] text-zinc-600 uppercase tracking-widest mt-1">NSE:EQUITY</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right font-data-md text-xs text-white/50 tabular-nums">{asset.quantity}</td>
                        <td className="px-6 py-5 text-right font-data-md text-xs text-white/50 tabular-nums">{formatCurrency(asset.invested_value)}</td>
                        <td className="px-6 py-5 text-right font-data-md text-xs text-white tabular-nums">{formatCurrency(asset.market_value)}</td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-data-md text-sm font-bold tabular-nums ${asset.p_l >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {asset.p_l >= 0 ? '+' : ''}{formatCurrency(asset.p_l)}
                            </span>
                            <span className={`font-terminal-label text-[10px] font-bold tabular-nums mt-1 ${asset.p_l >= 0 ? 'text-emerald-500/40' : 'text-red-500/40'}`}>
                              {asset.p_l_percentage.toFixed(2)}%
                            </span>
                          </div>
                        </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}

                </tbody>
              </table>
            </div>

            <div className="px-8 py-5 bg-black/40 flex justify-between items-center border-t border-white/5">
              <span className="font-terminal-label text-[10px] text-white/30 uppercase tracking-[0.2em]">Showing {filteredHoldings.length} of {holdings.length} holdings</span>
              <button
                onClick={refreshAll}
                disabled={isRefreshing}
                className={`font-terminal-label text-[10px] uppercase tracking-[0.25em] font-bold flex items-center gap-2 transition-all ${isRefreshing ? 'text-emerald-500 animate-pulse' : 'text-emerald-500/60 hover:text-emerald-500'}`}
              >
                <RefreshCcw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Fetching Data..' : 'Refresh Data'}
              </button>
            </div>
          </motion.section>

          {/* News Feed Panel */}
          <motion.section
            variants={{
              hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
              visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="glass-panel rounded-xl overflow-hidden flex flex-col border border-white/5 hover:border-emerald-500/20"
          >
            <div className="px-6 py-5 border-b border-emerald-500/10 bg-emerald-500/[0.02] flex justify-between items-center">
              <h3 className="font-terminal-label text-[12px] uppercase tracking-[0.2em] text-white font-bold flex items-center gap-3">
                <Newspaper className="w-5 h-5 text-emerald-500" />
                News Insights
              </h3>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <NewsItem tag="Top Story" time="2m ago" title="RBI keeps repo rate unchanged at 6.5%; maintains neutral stance" color="text-emerald-400" />
              <NewsItem tag="Tech Sector" time="15m ago" title="NVIDIA reaches record high as AI chip demand surges globally" color="text-blue-400" />
              <NewsItem tag="Global" time="1h ago" title="Crude oil prices stabilize amid easing geopolitical tensions in energy corridors" color="text-zinc-400" />
              <NewsItem tag="Alert" time="2h ago" title="Retail inflation cooling faster than projected; consumer spending data awaited" color="text-red-400" />
            </div>
          </motion.section>
        </motion.div>

        {/* Right Section: AI Terminal Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, delay: 1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-8 h-full min-h-[700px]"
        >
          <div className="glass-panel rounded-xl flex flex-col h-full overflow-hidden border border-white/5 shadow-[0_0_100px_rgba(16,185,129,0.05)]">
            {/* Terminal Header */}
            <div className="px-6 py-5 border-b border-emerald-500/10 bg-emerald-500/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_#10b981]" />
                <span className="font-terminal-label text-[12px] uppercase tracking-[0.2em] text-white font-black flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  AI RESEARCH ASSISTANT
                </span>
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-grow p-6 overflow-y-auto custom-scrollbar font-data-sm text-[13px] flex flex-col gap-8 selection:bg-emerald-500/40">
              <div className="flex flex-col gap-2 opacity-40">
                <div className="flex items-center gap-2">
                  <div className="h-[1px] flex-grow bg-emerald-500/20" />
                </div>
              </div>

              {/* AI Insight Block */}
              <div className="flex flex-col gap-4 group">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                    <Cpu className="w-3.5 h-3.5" />
                    INSIGHT
                  </span>
                  <span className="text-[10px] text-zinc-600 font-data-sm">09:42:15</span>
                </div>
                <div className="p-5 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10 text-emerald-50 leading-relaxed font-data-md group-hover:bg-emerald-500/[0.05] transition-colors">
                  <span className="text-emerald-400 font-bold underline decoration-emerald-500/30 underline-offset-4">HDFCBANK</span> analysis complete. Strong accumulation detected. Support confirmed at ₹1,520.
                </div>
              </div>

              {/* Forecast Block */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/30 flex items-center gap-2">
                    FORECAST
                  </span>
                </div>
                <div className="p-5 rounded-xl bg-blue-500/[0.03] border border-blue-500/10 text-blue-50 leading-relaxed font-data-md">
                  <span className="text-blue-400 font-bold underline decoration-blue-500/30 underline-offset-4">RELIANCE</span> resistance at ₹2,840 remains unbroken. Expected consolidation before breakout.
                </div>
              </div>
            </div>

            {/* Terminal Input */}
            <div className="p-6 bg-zinc-950/40 border-t border-emerald-500/10 backdrop-blur-xl">
              <div className="relative group">
                <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/50 group-focus-within:text-emerald-400 transition-colors w-5 h-5" />
                <input
                  type="text"
                  placeholder="Ask AI about your portfolio or stocks..."
                  className="w-full bg-emerald-950/10 border border-emerald-500/20 rounded-xl pl-12 pr-12 py-4 text-[13px] font-data-md text-white outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-emerald-500/20"
                />
                <button className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500/50 hover:text-emerald-400 transition-colors">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      </main>

    </div>
  )
}

function NewsItem({ tag, time, title, color }: { tag: string; time: string; title: string; color: string }) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl hover:bg-emerald-500/[0.05] transition-all cursor-pointer group border border-transparent hover:border-emerald-500/10">
      <div className="flex justify-between items-center">
        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${color} px-2 py-0.5 rounded bg-emerald-500/5`}>{tag}</span>
        <span className="text-[10px] text-zinc-600 font-data-sm">{time}</span>
      </div>
      <p className="text-[14px] text-zinc-300 leading-relaxed group-hover:text-white transition-colors">{title}</p>
    </div>
  )
}
