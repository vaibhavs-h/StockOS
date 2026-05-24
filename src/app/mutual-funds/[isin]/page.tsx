"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Globe,
  Shield,
  Info,
  Calendar,
  Layers,
  User,
  Percent,
  Star,
  ArrowLeft,
  DollarSign,
  TrendingUp as AlphaIcon,
  Zap,
  Plus,
  ShoppingCart,
  BellRing
} from "lucide-react";
import { RollingNumber } from "@/components/shared/RollingNumber";
import { WealthPerformanceChart as WealthChart } from "@/components/dashboard/WealthPerformanceChart";
import { supabase } from "@/services/DatabaseClient";
import { cn } from "@/lib/utils";
import { AssetLogo } from "@/components/shared/AssetLogo";
import { useSession } from "next-auth/react";
import { getDbUserId } from "@/lib/user";
import { WatchlistSelectorModal } from "@/components/dashboard/WatchlistSelectorModal";

// --- HELPERS ---
function formatLargeNumber(num: number | null | undefined) {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '-';
  const absNum = Math.abs(num);
  if (absNum >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (absNum >= 1e7) return (num / 1e7).toFixed(1) + 'Cr';
  if (absNum >= 1e5) return (num / 1e5).toFixed(1) + 'L';
  return num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function safeFormat(value: any, type: 'currency' | 'percent' | 'number' | 'large' = 'number', decimals = 2) {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return '-';

  if (type === 'large') return formatLargeNumber(value);

  const num = Number(value);
  if (type === 'percent') return `${num.toFixed(decimals)}%`;
  if (type === 'currency') return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: decimals })}`;

  return num.toLocaleString('en-IN', { maximumFractionDigits: decimals });
}

// Clean Yahoo ticker NS/BO to local standard ticker if matching
function cleanHoldingTicker(symbol: string | null) {
  if (!symbol) return null;
  const clean = symbol.replace('.NS', '').replace('.BO', '');
  return clean;
}

export default function MutualFundDetailPage() {
  const { isin } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const rawUserId = (session?.user as any)?.id;
  const userId = rawUserId ? getDbUserId(rawUserId) : null;
  
  const [data, setData] = useState<any>(null);
  const [holding, setHolding] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [fullHistory, setFullHistory] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState('1Y');
  const [isLoading, setIsLoading] = useState(true);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState<'3y' | '5y' | '10y'>('3y');
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
  const [watchlistInfo, setWatchlistInfo] = useState<{ name: string; count: number } | null>(null);

  const fetchWatchlistInfo = async () => {
    const dbUserId = (session?.user as any)?.id;
    if (!dbUserId || !isin) return;
    try {
      const { data: assets } = await supabase
        .from('watchlist_assets')
        .select(`
          watchlist_id,
          user_watchlists!inner (
            name
          )
        `)
        .eq('symbol', (isin as string).toUpperCase())
        .eq('user_watchlists.user_id', dbUserId);

      if (assets && assets.length > 0) {
        const listData = assets[0].user_watchlists as any;
        setWatchlistInfo({
          name: Array.isArray(listData) ? listData[0]?.name : listData?.name,
          count: assets.length
        });
      } else {
        setWatchlistInfo(null);
      }
    } catch (err) {
      console.error('Watchlist fetch failed:', err);
    }
  };

  useEffect(() => {
    const dbUserId = (session?.user as any)?.id;
    if (dbUserId && isin) {
      fetchWatchlistInfo();
    } else {
      setWatchlistInfo(null);
    }
  }, [isin, (session?.user as any)?.id]);

  const isPositive = data?.day_change_percentage >= 0;

  // 1. Fetch Mutual Fund Master Profile and User Holdings
  const fetchMFDetails = async () => {
    if (!isin) return;
    try {
      const uppercaseIsin = (isin as string).toUpperCase();
      let { data: mfList, error: mfError } = await supabase
        .from("mutual_funds_master")
        .select("*")
        .eq("isin", uppercaseIsin);

      // Fallback to scheme_code query if isin query yielded 0 results
      if ((!mfList || mfList.length === 0) && !isNaN(Number(isin))) {
        const { data: fallbackList, error: fbError } = await supabase
          .from("mutual_funds_master")
          .select("*")
          .eq("scheme_code", isin);
        if (!fbError && fallbackList && fallbackList.length > 0) {
          mfList = fallbackList;
        }
      }

      if (!mfError && mfList && mfList.length > 0) {
        setData(mfList[0]);
      }
    } catch (err) {
      console.error("Error loading mutual fund details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMFDetails();
  }, [isin]);

  // 1b. Fetch User Holdings for this mutual fund
  useEffect(() => {
    async function fetchHolding() {
      if (!data?.scheme_code || !userId) return;
      try {
        const { data: holdings, error } = await supabase
          .from("user_mutual_fund_holdings")
          .select("*")
          .eq("scheme_code", data.scheme_code)
          .eq("user_id", userId);
        
        if (!error && holdings && holdings.length > 0) {
          setHolding(holdings[0]);
        } else {
          setHolding(null);
        }
      } catch (err) {
        console.error("Error fetching MF holding:", err);
      }
    }
    fetchHolding();
  }, [data?.scheme_code, userId]);

  // 1c. 1-Minute Live Burst Sync Logic on mount/scheme change
  useEffect(() => {
    if (!data?.scheme_code) return;

    let burstCount = 0;
    const maxBursts = 6; // 10s * 6 = 60s total sync window

    const triggerBurst = async () => {
      console.log(`[BURST] Triggering targeted MF sync for ${data.scheme_code}...`);
      try {
        const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
        const baseUrl = isLocal ? 'http://localhost:3003' : (process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003');
        const res = await fetch(`${baseUrl}/api/sync/burst/mf?scheme_code=${data.scheme_code}`);
        const result = await res.json();
        console.log(`[BURST] Targeted MF sync result for ${data.scheme_code}:`, result);
        
        // Re-fetch details immediately to update page state dynamically
        if (result.success) {
          console.log("[BURST] Sync succeeded, re-fetching latest details from database...");
          await fetchMFDetails();
        }
      } catch (err) {
        console.error(`[BURST] Targeted MF sync failed for ${data.scheme_code}:`, err);
      }
    };

    // Initial burst on mount
    triggerBurst();

    // Loop for 1 minute
    const interval = setInterval(() => {
      burstCount++;
      if (burstCount >= maxBursts) {
        clearInterval(interval);
        return;
      }
      triggerBurst();
    }, 10000);

    return () => clearInterval(interval);
  }, [data?.scheme_code]);

  // 1d. PostgreSQL Realtime Websocket Listener to update UI dynamically on master updates
  useEffect(() => {
    if (!data?.scheme_code) return;

    const channelId = `mf-detail-pulse-${data.scheme_code}-${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mutual_funds_master',
          filter: `scheme_code=eq.${data.scheme_code}`
        },
        (payload) => {
          setData((prev: any) => {
            if (!prev) return payload.new;
            return { ...prev, ...payload.new };
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[REALTIME] MF Detail Pulse Subscribed: ${data.scheme_code}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data?.scheme_code]);

  // 2. Fetch Historical Price NAV data client-side from mfapi.in
  useEffect(() => {
    if (!data?.scheme_code) return;

    async function fetchHistoricalNAV() {
      setIsChartLoading(true);
      try {
        const res = await fetch(`https://api.mfapi.in/mf/${data.scheme_code}`);
        const json = await res.json();
        
        if (json && Array.isArray(json.data)) {
          // mfapi.in returns reverse chronological (newest first).
          // We need chronological (oldest first) for lightweight-charts.
          const rawHistory = [...json.data].reverse();

          // Map to WealthChart coordinates { time: "YYYY-MM-DD", value: number }
          const formattedHistory = rawHistory.map((pt: any) => {
            const [day, month, year] = pt.date.split('-');
            return {
              time: `${year}-${month}-${day}`,
              value: parseFloat(pt.nav)
            };
          });

          // Filter history according to range
          const cutoff = new Date();
          if (timeRange === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
          else if (timeRange === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
          else if (timeRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
          else if (timeRange === '3Y') cutoff.setFullYear(cutoff.getFullYear() - 3);
          else if (timeRange === '5Y') cutoff.setFullYear(cutoff.getFullYear() - 5);

          let filtered = formattedHistory;
          if (timeRange !== 'ALL') {
            const cutoffStr = cutoff.toISOString().split('T')[0];
            filtered = formattedHistory.filter(pt => pt.time >= cutoffStr);
          }

          setHistory(filtered);
          setFullHistory(formattedHistory);
        }
      } catch (e) {
        console.error("Error loading historical NAV:", e);
      } finally {
        setIsChartLoading(false);
      }
    }

    fetchHistoricalNAV();
  }, [data?.scheme_code, timeRange]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <div className="text-emerald-500 font-black tracking-[0.2em] uppercase text-xs animate-pulse">Syncing Fund Intelligence...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="text-zinc-500 font-bold uppercase tracking-widest text-xl">Mutual Fund Not Found</div>
      </div>
    );
  }

  const latestValue = data.current_price || (history.length > 0 ? history[history.length - 1].value : 0);
  const startValue = history.length > 0 ? history[0].value : (data.current_price - (data.day_change || 0));
  const rangeIsPositive = latestValue >= startValue;
  const rangeChange = startValue > 0 ? ((latestValue - startValue) / startValue) * 100 : 0;

  // Failsafe JSON parsing
  const parseJSON = (val: any) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error("Failed to parse JSON column:", e);
      return null;
    }
  };

  const performanceHistory = parseJSON(data?.performance_history);
  const topHoldings = parseJSON(data?.top_holdings);
  const sectorAllocations = parseJSON(data?.sector_allocations);
  const assetAllocation = parseJSON(data?.asset_allocation);
  const riskStatistics = parseJSON(data?.risk_statistics);

  // Helper to compute yields/CAGR dynamically from entire historical NAV coordinates
  const calculateYieldFromHistory = (years: number, isCagr: boolean = false): number | null => {
    if (!fullHistory || fullHistory.length < 10) return null;
    
    const latestItem = fullHistory[fullHistory.length - 1];
    const latestDate = new Date(latestItem.time);
    
    const targetDate = new Date(latestDate);
    targetDate.setFullYear(targetDate.getFullYear() - years);
    
    // Find closest coordinate in fullHistory to targetDate
    let closestPoint = fullHistory[0];
    let minDiff = Math.abs(new Date(fullHistory[0].time).getTime() - targetDate.getTime());
    
    for (let i = 1; i < fullHistory.length; i++) {
      const diff = Math.abs(new Date(fullHistory[i].time).getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = fullHistory[i];
      }
    }
    
    // Ensure data exists within a reasonable boundary (e.g. 15 days from target date)
    const diffDays = minDiff / (1000 * 60 * 60 * 24);
    if (diffDays > 15) return null;
    
    const begVal = closestPoint.value;
    const endVal = latestItem.value;
    
    if (begVal <= 0 || endVal <= 0) return null;
    
    if (isCagr) {
      return (Math.pow(endVal / begVal, 1 / years) - 1) * 100;
    } else {
      return ((endVal - begVal) / begVal) * 100;
    }
  };

  const raw1y = data.returns_1y ?? calculateYieldFromHistory(1, false);
  const raw3y = data.returns_3y ?? calculateYieldFromHistory(3, true);
  const raw5y = data.returns_5y ?? calculateYieldFromHistory(5, true);

  // Formulate Asset Allocation percentages
  const allocations = assetAllocation || { equity: 0, debt: 0, cash: 0, other: 0 };
  const totalAlloc = (allocations.equity || 0) + (allocations.debt || 0) + (allocations.cash || 0) + (allocations.other || 0);

  // Volatility Diagnostics for selected rolling timeframe
  const selectedRiskStats = riskStatistics?.[selectedHorizon];

  return (
    <motion.main
      initial="hidden"
      animate="visible"
      variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
      className="relative min-h-screen w-full bg-transparent text-white pt-12 pb-28"
    >
      <div className="relative z-10 max-w-[1700px] mx-auto px-6">
        
        {/* HERO HEADER PANELS */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black tracking-widest text-emerald-500 uppercase">
                {data.sub_category || data.category || 'MUTUAL FUND'}
              </span>
              {data.risk_level && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest bg-rose-500/10 border-rose-500/20 text-rose-400">
                  <div className="size-1.5 rounded-full bg-rose-400 animate-pulse shadow-[0_0_8px_#f87171]" />
                  {data.risk_level} Risk
                </div>
              )}
              <span className="px-3 py-1 bg-zinc-500/10 border border-white/5 rounded-full text-[9px] font-black tracking-widest text-zinc-400 uppercase">
                ISIN: {data.isin}
              </span>
              {data.scheme_code && (
                <span className="px-3 py-1 bg-zinc-500/10 border border-white/5 rounded-full text-[9px] font-black tracking-widest text-zinc-400 uppercase">
                  AMFI: {data.scheme_code}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4 mb-4">
              <AssetLogo
                symbol={data.isin || data.symbol || 'MF'}
                name={data.name || data.amc_name}
                size="xl"
                className="shrink-0 border border-white/10"
              />
              
              <div className="space-y-1">
                <h1 className="text-4xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70">
                  {data.name}
                </h1>
                <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{data.amc_name}</p>
              </div>
            </div>

            {/* STAR RATING PANEL */}
            {data.rating != null && data.rating > 0 && (
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-500/15 via-amber-500/[0.03] to-transparent border border-amber-500/30 px-4 py-2 rounded-xl w-fit shadow-[0_0_25px_rgba(245,158,11,0.06)] backdrop-blur-md relative overflow-hidden group transition-all duration-300"
              >
                <span className="text-[9px] font-black text-amber-400/80 uppercase tracking-[0.25em] mr-1">Fund Rating:</span>
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={i < data.rating ? { scale: [1, 1.05, 1] } : {}}
                      transition={i < data.rating ? { repeat: Infinity, duration: 3, delay: i * 0.4, ease: "easeInOut" } : {}}
                    >
                      <Star
                        className={cn(
                          "w-4 h-4 transition-all duration-300",
                          i < data.rating
                            ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)] group-hover:scale-110"
                            : "text-zinc-800"
                        )}
                      />
                    </motion.div>
                  ))}
                </div>
                <span className="text-[10px] font-black font-mono text-amber-400 ml-2 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  {data.rating}.0 / 5.0
                </span>
              </motion.div>
            )}
          </div>

          <div className="text-left md:text-right">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Current NAV</p>
            <div className="text-5xl font-mono font-black tracking-tighter mb-2 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              ₹{safeFormat(data.current_price, 'number', 4)}
            </div>
            <div className={cn("flex items-center md:justify-end gap-2 font-black text-xl", isPositive ? 'text-emerald-400' : 'text-rose-400')}>
              {isPositive ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              {data.day_change_percentage?.toFixed(2)}%
              <span className="text-zinc-600 font-medium ml-2 text-lg">
                ({data.day_change >= 0 ? '+' : ''}₹{data.day_change?.toFixed(4)})
              </span>
            </div>
            {data.nav_date && (
              <span className="text-[10px] font-bold text-zinc-600 tracking-wider">NAV Date: {data.nav_date}</span>
            )}
          </div>
        </div>

        {/* MAIN BENTO GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          
          {/* LEFT COLUMN: CHARTS, HOLDINGS, CALENDAR */}
          <div className="lg:col-span-2 space-y-3">
            
            {/* CHART CONTAINER */}
            <div className={cn(
              "glass-panel rounded-2xl pt-4 px-5 pb-3 shadow-2xl relative overflow-hidden group backdrop-blur-2xl transition-all duration-500",
              rangeIsPositive 
                ? "bg-gradient-to-br from-white/[0.04] via-transparent to-emerald-500/[0.02] border-emerald-500/10 hover:border-emerald-500/20" 
                : "bg-gradient-to-br from-white/[0.04] via-transparent to-rose-500/[0.02] border-rose-500/10 hover:border-rose-500/20"
            )}>
              <div className="flex justify-between items-center mb-2 relative z-10">
                <div>
                  <h3 className="text-xs uppercase tracking-[0.4em] text-zinc-500 mb-1 font-black">NAV Performance</h3>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono font-black text-4xl tracking-tighter text-white">₹{safeFormat(latestValue, 'number', 2)}</span>
                    <div className={cn("px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter border", rangeIsPositive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>
                      {rangeIsPositive ? '▲' : '▼'} {Math.abs(rangeChange).toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 relative z-20">
                  {['1M', '6M', '1Y', '3Y', '5Y', 'ALL'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setTimeRange(p)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-150 tracking-wider",
                        timeRange === p
                          ? (rangeIsPositive ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border border-rose-500/20')
                          : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.03]'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full h-[380px] relative">
                {isChartLoading && (
                  <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] z-30 flex items-center justify-center rounded-xl">
                    <div className="w-8 h-8 border-2 border-zinc-500/20 border-t-zinc-500 rounded-full animate-spin" />
                  </div>
                )}
                {history.length > 0 ? (
                  <WealthChart data={history} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-40 gap-4">
                    <Activity className="w-12 h-12 text-zinc-500 animate-pulse" />
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Retrieving AMFI Historical Coordinates...</span>
                  </div>
                )}
              </div>
            </div>

            {/* PERFORMANCE HORIZON CARDS */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-panel p-3 bg-white/[0.01] border-white/5 rounded-xl">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">1 Year Yield</p>
                <p className={cn("text-xl font-black font-mono tracking-tight", raw1y == null ? 'text-zinc-500' : raw1y >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {raw1y != null ? `${raw1y >= 0 ? '+' : ''}${raw1y.toFixed(2)}%` : '—'}
                </p>
              </div>
              <div className="glass-panel p-3 bg-white/[0.01] border-white/5 rounded-xl">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">3 Year CAGR</p>
                <p className={cn("text-xl font-black font-mono tracking-tight", raw3y == null ? 'text-zinc-500' : raw3y >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {raw3y != null ? `${raw3y >= 0 ? '+' : ''}${raw3y.toFixed(2)}%` : '—'}
                </p>
              </div>
              <div className="glass-panel p-3 bg-white/[0.01] border-white/5 rounded-xl">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">5 Year CAGR</p>
                <p className={cn("text-xl font-black font-mono tracking-tight", raw5y == null ? 'text-zinc-500' : raw5y >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {raw5y != null ? `${raw5y >= 0 ? '+' : ''}${raw5y.toFixed(2)}%` : '—'}
                </p>
              </div>
            </div>

            {/* TOP 10 HOLDINGS TABLE */}
            <div className="glass-panel rounded-2xl p-4 bg-gradient-to-br from-white/[0.02] to-transparent border-white/5 space-y-3 shadow-xl">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <div>
                  <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-500/60" /> Top Holdings Portfolio
                  </h3>
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mt-0.5">Underlying equities weight exposure</p>
                </div>
                {Array.isArray(topHoldings) && (
                  <div className="bg-white/5 px-2 py-0.5 rounded text-[9px] font-bold text-zinc-400 uppercase tracking-widest border border-white/5 font-mono">
                    {topHoldings.length} Assets
                  </div>
                )}
              </div>
              
              {Array.isArray(topHoldings) && topHoldings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500 uppercase tracking-widest text-[9px] font-black">
                        <th className="pb-2 pl-2">Asset Name</th>
                        <th className="pb-2">Symbol</th>
                        <th className="pb-2 text-right pr-2">Exposure Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topHoldings.map((h: any, i: number) => {
                        const cleanTicker = cleanHoldingTicker(h.symbol);
                        return (
                          <tr key={i} className="border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-all group/row">
                            <td className="py-2.5 pl-2 font-bold text-zinc-200 flex items-center gap-3">
                              <AssetLogo
                                symbol={h.symbol || 'STK'}
                                name={h.name}
                                size="sm"
                                className="shrink-0 border border-white/5 group-hover/row:border-emerald-500/20 transition-all duration-300"
                              />
                              {cleanTicker ? (
                                <button
                                  onClick={() => router.push(`/stocks/${cleanTicker.toLowerCase()}`)}
                                  className="text-zinc-200 hover:text-emerald-400 text-left font-black transition-colors"
                                >
                                  {h.name}
                                </button>
                              ) : (
                                <span>{h.name}</span>
                              )}
                            </td>
                            <td className="py-2.5">
                              {cleanTicker ? (
                                <span 
                                  onClick={() => router.push(`/stocks/${cleanTicker.toLowerCase()}`)}
                                  className="font-mono text-zinc-500 cursor-pointer hover:text-emerald-400 hover:underline transition-colors font-bold"
                                >
                                  {cleanTicker}
                                </span>
                              ) : (
                                <span className="font-mono text-zinc-600">{h.symbol || '-'}</span>
                              )}
                            </td>
                            <td className="py-2.5 font-mono font-black text-right pr-2">
                              <div className="flex items-center justify-end gap-3">
                                <span className="text-zinc-100">{h.percent != null ? `${h.percent.toFixed(2)}%` : '-'}</span>
                                {h.percent != null && (
                                  <div className="w-12 h-1.5 bg-white/[0.02] rounded-full overflow-hidden hidden sm:block">
                                    <div 
                                      style={{ width: `${Math.min(h.percent * 3, 100)}%` }}
                                      className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-400"
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center opacity-30">
                  <span className="text-xs uppercase tracking-widest font-black text-zinc-500">Holdings data not matched by job</span>
                </div>
              )}
            </div>

            {/* PERFORMANCE HEATMAP TAB */}
            {performanceHistory && (
              <div className="glass-panel rounded-2xl p-4 bg-gradient-to-br from-white/[0.02] to-transparent border-white/5 space-y-4 shadow-xl">
                <div className="border-b border-white/5 pb-2">
                  <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-500/60" /> Calendar Performance Yields
                  </h3>
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mt-0.5">Granular historical yield audit</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Annual Returns Table */}
                  <div>
                    <h4 className="text-xs uppercase tracking-widest font-black text-zinc-400 mb-3 border-b border-white/5 pb-1.5">Annual Total Returns</h4>
                    {Array.isArray(performanceHistory.annual) && performanceHistory.annual.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {performanceHistory.annual.slice(0, 10).map((r: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 rounded-xl bg-[#090d16]/80 border border-white/[0.04] hover:border-emerald-500/20 hover:bg-emerald-500/[0.02] transition-all duration-300 group shadow-md hover:shadow-[0_0_15px_rgba(16,185,129,0.03)]">
                            <span className="text-xs font-bold text-zinc-500 font-mono tracking-wider group-hover:text-zinc-400 transition-colors">{r.year}</span>
                            <span className={cn("text-xs font-mono font-black px-2 py-0.5 rounded-md border", r.value >= 0 ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/10" : "text-rose-400 bg-rose-500/5 border-rose-500/10")}>
                              {r.value != null ? `${r.value >= 0 ? '+' : ''}${r.value.toFixed(2)}%` : '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-600 text-xs">No annual performance statistics available.</p>
                    )}
                  </div>

                  {/* Quarterly Returns Table */}
                  <div>
                    <h4 className="text-xs uppercase tracking-widest font-black text-zinc-400 mb-3 border-b border-white/5 pb-1.5">Quarterly Yield Breakdowns</h4>
                    {Array.isArray(performanceHistory.quarterly) && performanceHistory.quarterly.length > 0 ? (
                      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-2 no-scrollbar">
                        {performanceHistory.quarterly.slice(0, 6).map((q: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-[#090d16]/60 border border-white/[0.04] hover:bg-white/[0.01] hover:border-white/10 transition-all duration-300">
                            <div className="flex flex-col">
                              <span className="text-xs font-black font-mono text-zinc-400 tracking-wider mb-0.5">{q.year}</span>
                              <span className="text-[8px] font-black uppercase text-zinc-600 tracking-[0.2em]">CALENDAR</span>
                            </div>
                            
                            <div className="flex-1 grid grid-cols-4 gap-3 text-center ml-6">
                              {['q1', 'q2', 'q3', 'q4'].map((quarterKey) => {
                                const val = q[quarterKey];
                                const quarterLabel = quarterKey.toUpperCase();
                                const isValPositive = val >= 0;
                                
                                return (
                                  <div key={quarterKey} className="group">
                                    <span className="block text-[8px] font-black uppercase text-zinc-600 tracking-widest mb-1.5 group-hover:text-zinc-500 transition-colors">{quarterLabel}</span>
                                    <div className={cn(
                                      "font-mono text-[10px] font-black py-1.5 rounded-lg border transition-all duration-300",
                                      val == null
                                        ? "bg-zinc-900/20 border-zinc-900/10 text-zinc-700"
                                        : isValPositive
                                          ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.02)] group-hover:bg-emerald-500/10 group-hover:shadow-[0_0_15px_rgba(16,185,129,0.06)]"
                                          : "bg-rose-500/5 border-rose-500/10 text-rose-400 shadow-[0_0_10px_rgba(239,68,68,0.02)] group-hover:bg-rose-500/10 group-hover:shadow-[0_0_15px_rgba(239,68,68,0.06)]"
                                    )}>
                                      {val != null ? `${isValPositive ? '+' : ''}${val.toFixed(1)}%` : '-'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-600 text-xs">No quarterly performance statistics available.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: SIDEBAR BENTO CARDS */}
          <div className="space-y-3">
            {/* YOUR POSITION CARD */}
            {holding ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-b from-emerald-500/[0.08] to-transparent border-emerald-500/20 backdrop-blur-2xl relative overflow-hidden shadow-2xl"
              >
                <div className="absolute -right-16 -top-16 w-32 h-32 bg-emerald-500/15 blur-2xl rounded-full" />
                
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-emerald-400 mb-3 flex items-center gap-2">
                  <Activity className="size-3.5 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  Your Position
                </h3>
                
                <div className="space-y-3">
                  <div className="bg-white/[0.02] p-3 rounded-xl border border-white/5 flex justify-between items-center">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Current Balance</span>
                      <div className="text-2xl font-black font-mono tracking-tighter text-white">
                        ₹{safeFormat(holding.market_value, 'number', 2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Folio</span>
                      <div className="text-xs font-black font-mono tracking-tight text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 max-w-[120px] truncate">
                        {holding.folio_number || 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Units Owned</p>
                      <p className="text-sm font-black text-zinc-100 font-mono">
                        {safeFormat(holding.quantity, 'number', 3)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Avg. Purchase NAV</p>
                      <p className="text-sm font-black text-zinc-100 font-mono">
                        ₹{safeFormat(holding.average_price, 'number', 4)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Total Cost Basis</p>
                      <p className="text-sm font-black text-zinc-100 font-mono">
                        ₹{safeFormat(holding.invested_value, 'number', 2)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Current NAV</p>
                      <p className="text-sm font-black text-emerald-400 font-mono">
                        ₹{safeFormat(holding.last_price || data.current_price, 'number', 4)}
                      </p>
                    </div>
                  </div>

                  <hr className="border-white/5 my-1" />

                  <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Unrealized P&L</span>
                    <div className={cn("text-lg font-black font-mono tracking-tighter", holding.p_l >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {holding.p_l >= 0 ? '+' : ''}{safeFormat(holding.p_l, 'currency')}
                      <span className="text-[11px] ml-2 font-bold opacity-75">
                        ({holding.p_l_percentage >= 0 ? '+' : ''}{holding.p_l_percentage?.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="glass-panel rounded-2xl pt-5 px-5 pb-5 flex flex-col items-center justify-center text-center border-white/[0.05] bg-gradient-to-br from-white/[0.01] to-transparent group transition-all duration-300 hover:border-white/[0.08]">
                <Activity className="w-5 h-5 text-zinc-500/50 group-hover:text-emerald-500/50 transition-colors duration-500 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 group-hover:text-zinc-200 transition-colors duration-500 mb-1">
                  No Position
                </p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-400 transition-colors duration-500 max-w-[200px] leading-relaxed">
                  You do not currently hold any units of this mutual fund scheme.
                </p>
              </div>
            )}

            {/* SCHEME PROFILE CARD */}
            <div className="glass-panel rounded-2xl p-4 bg-gradient-to-br from-white/[0.03] to-transparent border-white/5 space-y-3">
              <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-black mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500/60" /> Scheme Profile
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">AUM (Assets)</p>
                  <p className="text-lg font-black text-zinc-100 font-mono">
                    {data.aum != null ? `₹${data.aum.toFixed(2)} Cr` : '-'}
                  </p>
                </div>
                
                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">Expense Ratio</p>
                  <p className="text-lg font-black text-emerald-400 font-mono">
                    {data.expense_ratio != null ? `${data.expense_ratio.toFixed(2)}%` : '-'}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">Min Lump-sum</p>
                  <p className="text-lg font-black text-zinc-100 font-mono">
                    {data.min_initial_investment != null ? `₹${data.min_initial_investment.toLocaleString('en-IN')}` : '-'}
                  </p>
                </div>
                
                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">Min SIP/Subseq</p>
                  <p className="text-lg font-black text-zinc-100 font-mono">
                    {data.min_subsequent_investment != null ? `₹${data.min_subsequent_investment.toLocaleString('en-IN')}` : '-'}
                  </p>
                </div>
              </div>

              <hr className="border-white/5 my-2" />

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Fund Manager</span>
                  <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    {data.manager_name || 'Active Manager'}
                  </span>
                </div>
                {data.manager_start_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tenure Start</span>
                    <span className="text-xs font-bold font-mono text-zinc-400">
                      {new Date(data.manager_start_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ACTION HUD */}
            <div className="flex flex-col gap-3">
              <button className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-3 active:scale-95 group">
                <ShoppingCart className="size-4 transition-transform group-hover:scale-110" />
                Buy {data?.name ? (data.name.length > 25 ? `${data.name.slice(0, 25).trim()}...` : data.name) : (data?.symbol || (isin as string).toUpperCase())}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl border border-white/10 transition-all flex items-center justify-center gap-3 active:scale-95 group">
                  <BellRing className="size-3.5 text-zinc-500 group-hover:text-amber-400 transition-colors" />
                  Set Alert
                </button>
                <button
                  onClick={() => setIsWatchlistModalOpen(true)}
                  className={cn(
                    "w-full py-4 font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl border transition-all flex items-center justify-center gap-3 active:scale-95 group",
                    watchlistInfo
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                  )}
                >
                  {watchlistInfo ? (
                    <>
                      <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                      <span className="truncate max-w-[100px]">{watchlistInfo.name}</span>
                      {watchlistInfo.count > 1 && <span className="opacity-50 shrink-0">+{watchlistInfo.count - 1}</span>}
                    </>
                  ) : (
                    <>
                      <Plus className="size-3.5 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                      Watchlist
                    </>
                  )}
                </button>
              </div>
            </div>

            <WatchlistSelectorModal
              isOpen={isWatchlistModalOpen}
              onClose={() => {
                setIsWatchlistModalOpen(false);
                fetchWatchlistInfo();
              }}
              symbol={(isin as string).toUpperCase()}
              userId={(session?.user as any)?.id || "guest"}
            />

            {/* ASSET ALLOCATION RING CARD */}
            <div className="glass-panel rounded-2xl p-4 bg-gradient-to-br from-white/[0.03] to-transparent border-white/5 space-y-3">
              <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-black mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500/60" /> Asset Allocation
              </h3>

              {totalAlloc > 0 ? (
                <div className="flex items-center gap-6">
                  <div className="relative size-24 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="size-full overflow-visible">
                      <defs>
                        <linearGradient id="equityGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                        <linearGradient id="debtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#1d4ed8" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="transparent"
                        stroke="rgba(255, 255, 255, 0.03)"
                        strokeWidth="3.5"
                      />
                      
                      {/* Equity Glow Layer */}
                      {allocations.equity > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="url(#equityGrad)"
                          strokeWidth="3.5"
                          strokeDasharray={`${allocations.equity} ${100 - allocations.equity}`}
                          strokeDashoffset="25"
                          strokeLinecap="round"
                          className="blur-[1.5px] opacity-75"
                        />
                      )}
                      
                      {/* Equity Crisp Foreground */}
                      {allocations.equity > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="url(#equityGrad)"
                          strokeWidth="3.5"
                          strokeDasharray={`${allocations.equity} ${100 - allocations.equity}`}
                          strokeDashoffset="25"
                          strokeLinecap="round"
                        />
                      )}

                      {/* Debt Glow Layer */}
                      {allocations.debt > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="url(#debtGrad)"
                          strokeWidth="3.5"
                          strokeDasharray={`${allocations.debt} ${100 - allocations.debt}`}
                          strokeDashoffset={`${25 - (allocations.equity || 0)}`}
                          strokeLinecap="round"
                          className="blur-[1.5px] opacity-75"
                        />
                      )}

                      {/* Debt Crisp Foreground */}
                      {allocations.debt > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="transparent"
                          stroke="url(#debtGrad)"
                          strokeWidth="3.5"
                          strokeDasharray={`${allocations.debt} ${100 - allocations.debt}`}
                          strokeDashoffset={`${25 - (allocations.equity || 0)}`}
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/20 rounded-full backdrop-blur-[0.5px]">
                      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-0.5">Equity</span>
                      <span className="text-base font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                        {allocations.equity?.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-zinc-400 font-bold">
                        <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                        Equity Weight
                      </div>
                      <span className="font-mono font-bold text-zinc-200">{allocations.equity?.toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-zinc-400 font-bold">
                        <div className="size-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                        Debt Weight
                      </div>
                      <span className="font-mono font-bold text-zinc-200">{allocations.debt?.toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-zinc-400 font-bold">
                        <div className="size-2 rounded-full bg-zinc-600" />
                        Cash & Liquid
                      </div>
                      <span className="font-mono font-bold text-zinc-200">{allocations.cash?.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center opacity-30">
                  <span className="text-xs uppercase tracking-widest font-black text-zinc-500">Allocation splits unavailable</span>
                </div>
              )}
            </div>

            {/* VOLATILITY DIAGNOSTICS BENTO */}
            {selectedRiskStats && (
              <div className="glass-panel rounded-2xl p-4 bg-gradient-to-br from-white/[0.02] to-transparent border-white/5 space-y-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-500/60" /> Volatility Diagnostics
                  </h3>
                  
                  <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/5">
                    {(['3y', '5y'] as const).map((hor) => (
                      <button
                        key={hor}
                        onClick={() => setSelectedHorizon(hor)}
                        className={cn(
                          "px-2 py-1 rounded text-[9px] uppercase tracking-wider font-black transition-colors",
                          selectedHorizon === hor
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {hor}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center group py-1.5 border-b border-white/[0.02]">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Mean Annual Return</span>
                    <span className="text-sm font-mono font-black text-zinc-100">{selectedRiskStats.meanAnnualReturn != null ? `${selectedRiskStats.meanAnnualReturn}%` : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center group py-1.5 border-b border-white/[0.02]">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Standard Deviation</span>
                    <span className="text-sm font-mono font-black text-zinc-100">{selectedRiskStats.stdDev != null ? `${selectedRiskStats.stdDev}%` : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center group py-1.5 border-b border-white/[0.02]">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Sharpe Ratio</span>
                    <span className="text-sm font-mono font-black text-emerald-400">{selectedRiskStats.sharpeRatio ?? '-'}</span>
                  </div>
                  <div className="flex justify-between items-center group py-1.5 border-b border-white/[0.02]">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Alpha (Jensen's)</span>
                    <span className="text-sm font-mono font-black text-zinc-100">{selectedRiskStats.alpha ?? '-'}</span>
                  </div>
                  <div className="flex justify-between items-center group py-1.5 last:border-0">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Beta (vs Benchmark)</span>
                    <span className="text-sm font-mono font-black text-zinc-100">{selectedRiskStats.beta ?? '-'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* SECTORS WEIGHT GRID */}
            {sectorAllocations && Object.keys(sectorAllocations).length > 0 && (
              <div className="glass-panel rounded-2xl p-4 bg-gradient-to-br from-white/[0.02] to-transparent border-white/5 space-y-3 shadow-xl">
                <h3 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-500/60" /> Industry Sectors
                </h3>
                
                <div className="space-y-3">
                  {Object.entries(sectorAllocations)
                    .sort(([, a]: any, [, b]: any) => b - a)
                    .slice(0, 6)
                    .map(([secName, weight]: any, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-zinc-400 uppercase tracking-tight capitalize">{secName.replace('_', ' ')}</span>
                          <span className="font-mono font-black text-zinc-200">{Number(weight).toFixed(1)}%</span>
                        </div>
                        <div className="h-2.5 w-full bg-zinc-950/60 border border-white/[0.04] p-0.5 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] relative overflow-hidden">
                          <div
                            style={{ width: `${Math.min(Number(weight), 100)}%` }}
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)] relative overflow-hidden transition-all duration-1000 ease-out"
                          >
                            {/* Micro-animated shimmer sweep */}
                            <div 
                              className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.18)_50%,transparent_100%)] -translate-x-full" 
                              style={{ animation: 'shimmer-sweep 3s infinite' }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes shimmer-sweep {
                      0% { transform: translateX(-100%) skewX(-15deg); }
                      50% { transform: translateX(100%) skewX(-15deg); }
                      100% { transform: translateX(100%) skewX(-15deg); }
                    }
                  ` }} />
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </motion.main>
  );
}
