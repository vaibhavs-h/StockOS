"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Terminal,
  Activity,
  Globe,
  ShieldCheck,
  Info,
  Briefcase,
  Landmark,
  Moon,
  ShoppingCart,
  BellRing,
  Zap,
  Target,
  Clock,
  BarChart3,
  Dna,
  Link,
  Plus
} from "lucide-react";
import { RollingNumber } from "@/components/shared/RollingNumber";
import { getMarketStatus, normalizeStorageSymbol } from "@/constants/market-constants";
import { WatchlistSelectorModal } from "@/components/dashboard/WatchlistSelectorModal";
import { useSession } from "next-auth/react";

import { WealthPerformanceChart as WealthChart } from "@/components/dashboard/WealthPerformanceChart";
import { supabase } from "@/services/DatabaseClient";
import { cn } from "@/lib/utils";

// --- HELPERS ---
function formatLargeNumber(num: number | null | undefined) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  const absNum = Math.abs(num);
  if (absNum >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (absNum >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (absNum >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  return num.toLocaleString('en-US');
}

function safeFormat(value: any, type: 'currency' | 'percent' | 'number' | 'large' = 'number', decimals = 2) {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return '-';

  if (type === 'large') return formatLargeNumber(value);

  const num = Number(value);
  if (type === 'percent') return `${(num * (num < 1 && num > -1 ? 100 : 1)).toFixed(decimals)}%`;
  if (type === 'currency') return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function PulseCard({ label, value, color = "text-white", subValue }: { label: string; value: string; color?: string; subValue?: string }) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.02 }}
      className="glass-panel rounded-xl p-4 bg-gradient-to-br from-white/[0.02] to-transparent border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/[0.05] transition-all duration-300 group shadow-lg"
    >
      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 group-hover:text-emerald-500/70 transition-colors">{label}</p>
      <div className="flex flex-col">
        <p className={cn("text-xl font-black font-mono tracking-tighter", value === '-' ? 'text-zinc-700' : color)}>{value}</p>
        {subValue && <p className="text-[10px] font-bold text-zinc-600 tracking-tight mt-0.5">{subValue}</p>}
      </div>
    </motion.div>
  );
}

function MarginBar({ label, value, color }: { label: string; value: number; color: string }) {
  const percentage = (value || 0) * (value < 1 && value > -1 ? 100 : 1);
  const displayValue = value !== null && value !== undefined ? `${percentage.toFixed(1)}%` : '-';

  return (
    <div className="space-y-2 group">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
        <span className="text-zinc-500 group-hover:text-zinc-400 transition-colors tracking-tight">{label}</span>
        <span className="text-white font-mono">{displayValue}</span>
      </div>
      <div className="relative h-2 w-full bg-white/[0.03] rounded-full overflow-hidden border border-white/5 backdrop-blur-sm">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(Math.max(percentage || 0, 0), 100)}%` }}
          transition={{ duration: 1.5, ease: "circOut" }}
          className={cn("absolute top-0 h-full rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)]", color)}
        >
          <div className="absolute inset-0 bg-white/10 animate-pulse" />
        </motion.div>
      </div>
    </div>
  );
}

function ProfileField({ label, value, isLink = false }: { label: string; value: any; isLink?: boolean }) {
  const displayValue = value || '-';
  return (
    <div className="group">
      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1 group-hover:text-zinc-500 transition-colors">{label}</p>
      {isLink && value ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-emerald-500 hover:text-emerald-400 hover:underline truncate block transition-colors flex items-center gap-1">
          <Link className="size-2.5" />
          {value.replace('https://', '').replace('http://', '').split('/')[0]}
        </a>
      ) : (
        <p className={cn("text-xs font-bold truncate", displayValue === '-' ? 'text-zinc-700' : 'text-zinc-200')}>{displayValue}</p>
      )}
    </div>
  );
}

function StatRow({ label, value, highlight = false, isNegative = false, type = 'number', decimals = 2 }: { label: string; value: any; highlight?: boolean; isNegative?: boolean; type?: 'currency' | 'percent' | 'number' | 'large'; decimals?: number }) {
  const formatted = safeFormat(value, type, decimals);
  return (
    <div className="flex justify-between items-center group/row py-1.5 border-b border-white/[0.02] last:border-0">
      <span className="text-xs font-bold text-zinc-500 group-hover/row:text-zinc-400 transition-colors tracking-tight uppercase">{label}</span>
      <span className={cn(
        "text-base font-mono font-black transition-all",
        formatted === '-' ? 'text-zinc-700' : (highlight ? (isNegative ? 'text-rose-400' : 'text-emerald-400') : 'text-zinc-100')
      )}>
        {formatted}
      </span>
    </div>
  );
}

// --- MAIN COMPONENT ---
export default function USStockPage() {
  const { symbol } = useParams();
  const { data: session } = useSession();
  const portfolioId = (session?.user as any)?.id || "guest";
  const [data, setData] = useState<any>(null);
  const [holding, setHolding] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState('1Y');
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'PRE' | 'AFTER'>('CLOSED');
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
  const [watchlistInfo, setWatchlistInfo] = useState<{ name: string; count: number } | null>(null);
  const isPositive = data?.day_change_percentage >= 0;

  // Database Heartbeat to register symbol as Active
  useEffect(() => {
    if (!symbol) return;
    
    const sendHeartbeat = () => {
      fetch('/api/market/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, market: 'US' })
      }).catch(err => console.error("[HEARTBEAT] Error:", err));
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000); // Pulse every 30 seconds

    return () => clearInterval(interval);
  }, [symbol]);

  // 1-Minute Live Burst Sync Logic
  useEffect(() => {
    if (!symbol) return;
    
    let burstCount = 0;
    const maxBursts = 6; // 60 seconds / 10 seconds = 6
    
    const triggerBurst = async () => {
      try {
        const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
        const baseUrl = isLocal ? 'http://localhost:3003' : (process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003');
        const region = 'US'; 
        await fetch(`${baseUrl}/api/sync/burst?symbol=${symbol}&region=${region}`);
      } catch (err) {
        console.error("[BURST] Sync failed:", err);
      }
    };

    // Initial burst
    triggerBurst();
    
    // Set interval for every 10 seconds
    const interval = setInterval(() => {
      burstCount++;
      if (burstCount >= maxBursts) {
        clearInterval(interval);
        return;
      }
      triggerBurst();
    }, 10000);

    return () => clearInterval(interval);
  }, [symbol]); // Restart burst when data is first loaded or symbol changes

  const fetchWatchlistInfo = async () => {
    const userId = (session?.user as any)?.id;
    if (!userId || !symbol) return;
    try {
      const { data: assets } = await supabase
        .from('watchlist_assets')
        .select(`
          watchlist_id,
          user_watchlists!inner (
            name
          )
        `)
        .eq('symbol', (symbol as string).toUpperCase())
        .eq('user_watchlists.user_id', userId);

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
    if ((session?.user as any)?.id) fetchWatchlistInfo();
  }, [symbol, (session?.user as any)?.id]);

  useEffect(() => {
    setStatus(getMarketStatus('US') as any);
    const interval = setInterval(() => setStatus(getMarketStatus('US') as any), 60000);
    return () => clearInterval(interval);
  }, [symbol]);


  useEffect(() => {
    async function fetchStock() {
      if (!symbol) return;
      const upperSymbol = (symbol as string).toUpperCase();

      // 1. Initial Fetch
      const { data: stocks, error: stockError } = await supabase.from("us_market_assets").select("*").ilike("symbol", upperSymbol);
      const { data: holdings, error: holdingError } = await supabase.from("holdings").select("*").ilike("trading_symbol", upperSymbol);

      if (!stockError && stocks && stocks.length > 0) setData(stocks[0]);
      if (!holdingError && holdings && holdings.length > 0) setHolding(holdings[0]);
      setIsLoading(false);

      const storageSymbol = normalizeStorageSymbol(upperSymbol);

      // 2. Realtime Subscription
      const channelId = `us-stock-pulse-${storageSymbol}-${Date.now()}`;
      const channel = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'us_market_assets',
            filter: `symbol=eq.${storageSymbol}`
          },
          (payload) => {
            setData((prev: any) => ({ ...prev, ...payload.new }));
          }
        )

        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[REALTIME] US Pulse Active: ${upperSymbol}`);
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }
    fetchStock();
  }, [symbol]);

  useEffect(() => {
    async function fetchHistory() {
      if (!data) return;
      try {
        const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
        const baseUrl = isLocal ? 'http://localhost:3003' : (process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003');
        const res = await fetch(`${baseUrl}/api/us-stocks/${symbol}/history?range=${timeRange}`);
        const historyData = await res.json();
        setHistory(historyData);
      } catch (e) { }
    }
    fetchHistory();
  }, [symbol, timeRange, data]);

  const latestValue = data?.current_price || (history.length > 0 ? history[history.length - 1].value : 0);
  const startValue = (timeRange === '1D' && data?.prev_close) ? data.prev_close : (history.length > 0 ? history[0].value : (data?.current_price - (data?.day_change || 0)));
  const rangeIsPositive = latestValue >= startValue;
  const rangeChange = startValue > 0 ? ((latestValue - startValue) / startValue) * 100 : 0;

  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen bg-transparent flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <div className="text-emerald-500 font-black tracking-[0.6em] uppercase text-xs animate-pulse">Scanning Global Fed...</div>
          </div>
        </motion.div>
      ) : !data ? (
        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-transparent flex items-center justify-center">
          <div className="text-zinc-500 font-bold uppercase tracking-widest text-xl">Asset Not In System</div>
        </motion.div>
      ) : (
        <motion.main key="content" initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }} className="relative min-h-screen w-full bg-transparent text-white pt-24 pb-10">
          <div className="relative z-10 max-w-[1700px] mx-auto px-6">
            {/* HERO SECTION */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }} className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black tracking-widest text-emerald-500 uppercase">
                    {data.quote_type || 'STOCK'} / {data.exchange || 'NYSE'}
                  </span>
                  <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all", status === 'OPEN' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-zinc-500/10 border-zinc-500/20 text-zinc-500")}>
                    <div className={cn("size-1.5 rounded-full animate-pulse", status === 'OPEN' ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-zinc-500")} />
                    {status === 'OPEN' ? 'MARKET LIVE' : status === 'PRE' ? 'PRE-MARKET' : status === 'AFTER' ? 'AFTER-HOURS' : 'MARKET CLOSED'}
                  </div>
                  {data.is_sp500 && <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[9px] font-black tracking-widest text-blue-400 uppercase">S&P 500</span>}
                  {data.is_nasdaq100 && <span className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[9px] font-black tracking-widest text-purple-400 uppercase">NASDAQ 100</span>}
                </div>
                <h1 className="text-7xl font-black tracking-tighter mb-4 flex items-baseline gap-6 group/symbol">
                  <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 drop-shadow-[0_0_30px_rgba(255,255,255,0.15)] group-hover/symbol:drop-shadow-[0_0_40px_rgba(255,255,255,0.25)] transition-all duration-700">
                    {data.symbol}
                  </span>
                  <span className="text-2xl font-medium text-zinc-500 tracking-tight">{data.name}</span>
                </h1>
                <div className="flex items-center gap-8 text-zinc-400">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-emerald-500/60" />
                    <span className="text-sm font-bold uppercase tracking-wider">{data.sector || '-'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-emerald-500/60" />
                    <span className="text-sm font-bold uppercase tracking-wider">{data.industry || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="text-right flex flex-col items-end gap-2">
                <div className="text-6xl font-mono font-black tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                  <RollingNumber value={data.current_price} currency prefix="$" />
                </div>
                <div className={cn("flex items-center gap-2 font-black text-2xl", isPositive ? 'text-emerald-400' : 'text-rose-400')}>
                  {isPositive ? <TrendingUp className="w-7 h-7" /> : <TrendingDown className="w-7 h-7" />}
                  {data.day_change_percentage?.toFixed(2)}%
                  <span className="text-zinc-600 font-medium ml-2 text-xl tracking-tight">
                    ({data.day_change >= 0 ? '+' : '-'}${Math.abs(data.day_change || 0).toFixed(2)})
                  </span>
                </div>

                {/* SESSION OVERLAY (PRE/AFTER) */}
                <AnimatePresence>
                  {(data.premarket_price || data.after_hours_price) && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mt-2 flex items-center gap-3 px-4 py-2 bg-white/[0.03] border border-white/5 rounded-2xl backdrop-blur-md">
                      <Clock className="size-3.5 text-amber-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        {data.after_hours_price ? 'After Hours:' : 'Pre-Market:'}
                      </span>
                      <span className="text-sm font-black font-mono text-white">
                        {safeFormat(data.after_hours_price || data.premarket_price, 'currency')}
                      </span>
                      <span className={cn("text-[10px] font-black", (data.after_hours_change_pct || data.premarket_change_pct) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {(data.after_hours_change_pct || data.premarket_change_pct)?.toFixed(2)}%
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* MAIN GRID - BENTO STYLE */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <motion.div variants={{ hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } } }} className="lg:col-span-2 space-y-3">
                <div className="glass-panel rounded-2xl pt-5 px-6 pb-4 shadow-2xl bg-gradient-to-br from-white/[0.05] via-transparent to-emerald-500/[0.02] relative overflow-hidden group border-white/5 backdrop-blur-2xl">
                  <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.3)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
                  <div className="flex justify-between items-center mb-3 relative z-10">
                    <div>
                      <h3 className="text-xs uppercase tracking-[0.4em] text-zinc-500 mb-2 font-black flex items-center gap-2">
                        Price Analytics
                      </h3>
                      <div className="flex items-baseline gap-4">
                        <span className="font-mono font-black text-4xl tracking-tighter text-white">{safeFormat(data.current_price, 'currency')}</span>
                        <div className={cn("px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter border", rangeIsPositive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>
                          {rangeIsPositive ? '▲' : '▼'} {Math.abs(rangeChange).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 relative z-20">
                      {['1D', '1W', '1M', '1Y', 'ALL'].map((p) => (
                        <button
                          key={p}
                          onClick={() => setTimeRange(p)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black transition-all duration-150 tracking-widest",
                            timeRange === p
                              ? (rangeIsPositive ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'text-rose-400 bg-rose-500/10 border border-rose-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]')
                              : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.03]'
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-full h-[380px]">
                    {history.length > 0 ? (
                      <WealthChart
                        data={history}
                        currency="USD"
                        locale="en-US"
                        timezoneLabel="EST"
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-40 gap-8">
                        {timeRange === '1D' && status === 'CLOSED' ? (
                          <>
                            <div className="relative">
                              <Moon className="w-16 h-16 text-zinc-500" />
                              <div className="absolute inset-0 bg-zinc-500/20 blur-2xl animate-pulse" />
                            </div>
                            <span className="font-mono text-xs uppercase tracking-[0.8em] text-zinc-500">Market is Currently Closed</span>
                          </>
                        ) : (
                          <>
                            <div className="relative">
                              <Activity className="w-16 h-16 text-emerald-500 animate-pulse" />
                              <div className="absolute inset-0 bg-emerald-500/30 blur-2xl animate-pulse" />
                            </div>
                            <span className="font-mono text-xs uppercase tracking-[0.8em] text-emerald-500 animate-pulse">Syncing Global Data...</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <PulseCard label="Session High" value={safeFormat(data.regularmarketdayhigh || data.current_price, 'currency')} color="text-emerald-400" />
                  <PulseCard label="Session Low" value={safeFormat(data.regularmarketdaylow || data.current_price, 'currency')} color="text-rose-400" />
                  <PulseCard label="Today Open" value={safeFormat(data.open_price, 'currency')} />
                  <PulseCard label="Yesterday" value={safeFormat(data.prev_close, 'currency')} />
                  <PulseCard label="Avg Volume" value={safeFormat(data.average_volume_3m, 'large')} />
                  <PulseCard label="Market Cap" value={safeFormat(data.market_cap, 'large')} subValue={data.market_cap_category} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <motion.div whileHover={{ scale: 1.01 }} className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-br from-white/[0.03] to-transparent border-white/5 backdrop-blur-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-1000">
                      <Landmark className="size-16" />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-[0.4em] text-zinc-500 mb-3 flex items-center gap-3">
                      <div className="size-1.5 rounded-full bg-emerald-500 shadow-lg" />
                      Balance Sheet
                    </h3>
                    <div className="space-y-4">
                      <StatRow label="Total Revenue" value={data.total_revenue} type="large" />
                      <StatRow label="EBITDA" value={data.ebitda} type="large" />
                      <StatRow label="Free Cash Flow" value={data.free_cashflow} type="large" />
                      <StatRow label="Total Cash" value={data.total_cash} type="large" />
                      <StatRow label="Total Debt" value={data.total_debt} type="large" />
                      <div className="h-px bg-white/5 my-1" />
                      <StatRow label="Current Ratio" value={data.current_ratio} decimals={2} />
                      <StatRow label="Quick Ratio" value={data.quick_ratio} decimals={2} />
                      <StatRow label="Debt / Equity" value={data.debt_to_equity} decimals={2} />
                    </div>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.01 }} className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-br from-white/[0.03] to-transparent border-white/5 backdrop-blur-xl group">
                    <h3 className="text-sm font-black uppercase tracking-[0.4em] text-zinc-500 mb-3 flex items-center gap-3">
                      <div className="size-1.5 rounded-full bg-amber-500 shadow-lg" />
                      Performance
                    </h3>
                    <div className="space-y-3">
                      <MarginBar label="Gross Margins" value={data.gross_margins} color="bg-gradient-to-r from-blue-600 to-cyan-400" />
                      <MarginBar label="Operating Margins" value={data.operating_margins} color="bg-gradient-to-r from-indigo-600 to-purple-400" />
                      <MarginBar label="Profit Margins" value={data.profit_margins} color="bg-gradient-to-r from-emerald-600 to-teal-400" />
                      <MarginBar label="ROE" value={data.return_on_equity} color="bg-gradient-to-r from-fuchsia-600 to-pink-400" />
                      <div className="pt-4 space-y-4 border-t border-white/10">
                        <StatRow label="Revenue Growth" value={data.revenue_growth} type="percent" highlight isNegative={data.revenue_growth < 0} />
                        <StatRow label="Earnings Growth" value={data.earnings_growth} type="percent" highlight isNegative={data.earnings_growth < 0} />
                        <StatRow label="52W Change" value={data.fifty_two_week_change_pct} type="percent" highlight isNegative={data.fifty_two_week_change_pct < 0} />
                      </div>
                    </div>
                  </motion.div>
                </div>

                <motion.div whileHover={{ scale: 1.005 }} className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-transparent border-emerald-500/10 backdrop-blur-xl relative group">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-2">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-[0.5em] text-emerald-500 mb-2">Institutional Consensus</h3>
                      <div className="flex items-center gap-6">
                        <div className={cn(
                          "text-4xl font-black tracking-tighter uppercase transition-colors duration-700",
                          data.recommendation_key?.includes('buy') ? "text-emerald-400" :
                            data.recommendation_key?.includes('sell') ? "text-rose-400" : "text-white"
                        )}>
                          {data.recommendation_key?.replace(/_/g, ' ') || 'NEUTRAL'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <div className="text-center">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Target Price</p>
                        <p className="text-xl font-black text-white tracking-tighter">{safeFormat(data.target_price, 'currency')}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Upside</p>
                        <p className={cn("text-xl font-black tracking-tighter", (data.target_price > data.current_price) ? 'text-emerald-400' : 'text-rose-400')}>
                          {safeFormat(((data.target_price - data.current_price) / data.current_price) * 100, 'number', 1)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3 p-3 bg-black/40 rounded-xl border border-white/5">
                    <Target className="size-4 text-emerald-500" />
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                      Institutional analysts are currently projecting a <span className="text-white font-black">{safeFormat(data.target_price, 'currency')}</span> price target.
                    </p>
                  </div>
                </motion.div>
              </motion.div>

              <div className="space-y-4">
                {holding ? (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-b from-blue-600/[0.1] to-transparent border-blue-500/20 backdrop-blur-2xl relative overflow-hidden">
                    <h3 className="text-sm font-black uppercase tracking-[0.4em] text-blue-400 mb-2 flex items-center gap-3">
                      <Briefcase className="size-3" />
                      Your Position
                    </h3>
                    <div className="space-y-3">
                      <StatRow label="Shares Owned" value={holding.quantity} />
                      <StatRow label="Avg Buy Price" value={holding.average_price} type="currency" />
                      <StatRow label="Market Value" value={holding.market_value} type="currency" highlight />
                      <div className="h-px bg-white/5 my-2" />
                      <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Your P&L</span>
                        <div className={cn("text-xl font-black font-mono tracking-tighter", (holding.p_l || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {(holding.p_l || 0) >= 0 ? '+' : ''}{safeFormat(holding.p_l, 'currency')}
                          <span className="text-[11px] ml-2 font-bold opacity-60">({(holding.p_l_percentage || 0) >= 0 ? '+' : ''}{holding.p_l_percentage?.toFixed(1)}%)</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="glass-panel rounded-2xl pt-4 px-5 pb-5 flex flex-col items-center justify-center text-center border-white/5 bg-white/[0.01] group opacity-60">
                    <Briefcase className="size-4 text-zinc-700 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-600">No Portfolio Data</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  <button className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-3 active:scale-95 group">
                    <ShoppingCart className="size-4 transition-transform group-hover:scale-110" />
                    Buy {data.symbol}
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
                  symbol={symbol as string}
                  userId={portfolioId}
                />

                <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-b from-white/[0.03] to-transparent border-white/5 backdrop-blur-xl">
                  <h3 className="text-sm font-black uppercase tracking-[0.4em] text-zinc-500 mb-2">Valuation Hub</h3>
                  <div className="space-y-3">
                    <StatRow label="P/E Ratio" value={data.pe_ratio} />
                    <StatRow label="Forward P/E" value={data.forward_pe} />
                    <StatRow label="PEG Ratio" value={data.peg_ratio} highlight />
                    <StatRow label="P/S Ratio" value={data.ps_ratio} />
                    <StatRow label="P/B Ratio" value={data.pb_ratio || data.price_to_book} />
                    <StatRow label="EPS (Trailing)" value={data.eps_trailing} type="currency" />
                    <StatRow label="Book Value" value={data.book_value} type="currency" />
                  </div>
                </motion.div>

                <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-b from-white/[0.03] to-transparent border-white/5 backdrop-blur-xl">
                  <h3 className="text-sm font-black uppercase tracking-[0.4em] text-zinc-500 mb-2 font-black">Technicals</h3>
                  <div className="space-y-3">
                    <StatRow label="50-Day Avg" value={data.fifty_day_average} type="currency" />
                    <StatRow label="200-Day Avg" value={data.two_hundred_day_average} type="currency" />
                    <StatRow label="Beta (5Y)" value={data.beta_5y || data.beta} />
                    <div className="h-px bg-white/5 my-2" />
                    <div className="pt-2 space-y-3">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        <span>52W L: {safeFormat(data.fifty_two_week_low, 'currency')}</span>
                        <span>52W H: {safeFormat(data.fifty_two_week_high, 'currency')}</span>
                      </div>
                      <div className="relative h-2 w-full bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
                        <motion.div
                          initial={{ left: 0 }}
                          animate={{ left: `${Math.min(Math.max(((data.current_price - data.fifty_two_week_low) / (data.fifty_two_week_high - data.fifty_two_week_low)) * 100, 0), 100)}%` }}
                          transition={{ duration: 2.5, ease: "circOut" }}
                          className="absolute top-[-2px] bottom-[-2px] w-1.5 bg-white shadow-[0_0_20px_white,0_0_10px_rgba(255,255,255,0.5)] z-10 rounded-full"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 via-white/5 to-emerald-500/10" />
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="glass-panel rounded-2xl pt-4 px-5 pb-5 bg-gradient-to-br from-purple-600/[0.08] to-transparent border-purple-500/10 backdrop-blur-xl">
                  <h3 className="text-sm font-black uppercase tracking-[0.4em] text-purple-400 mb-2 flex items-center gap-3">
                    <ShieldCheck className="size-3" />
                    Dividend Intelligence
                  </h3>
                  <div className="space-y-3">
                    <StatRow label="Dividend Yield" value={data.dividend_yield || data.trailing_annual_dividend_yield} type="percent" highlight />
                    <StatRow label="Annual Rate" value={data.dividend_rate || data.trailing_annual_dividend_rate} type="currency" />
                    <StatRow label="Payout Ratio" value={data.payout_ratio} type="percent" />
                    <div className="h-px bg-white/5 my-2" />
                    <ProfileField label="Ex-Dividend Date" value={data.ex_dividend_date} />
                    <StatRow label="Shares Outstanding" value={data.shares_outstanding} type="large" />
                  </div>
                </motion.div>
              </div>
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }} className="mt-5 glass-panel rounded-2xl p-8 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent border-white/5 backdrop-blur-xl relative group overflow-hidden">
              <div className="absolute -right-20 -bottom-20 size-80 bg-emerald-500/[0.02] blur-[100px] rounded-full" />
              <div className="flex items-center gap-3 mb-6">
                <div className="size-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Info className="size-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-[0.4em] text-white">Institutional Dossier</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8">
                  <p className="text-zinc-400 leading-[1.8] font-medium text-sm tracking-tight text-justify opacity-80 group-hover:opacity-100 transition-opacity duration-700">
                    {data.description || "The institutional profile for this asset is currently being hydrated from the global feed."}
                  </p>
                </div>
                <div className="lg:col-span-4 grid grid-cols-2 gap-y-8 gap-x-12 border-l border-white/5 pl-10">
                  <ProfileField label="Primary Exchange" value={data.primary_exchange} />
                  <ProfileField label="Market Region" value={data.market_region} />
                  <ProfileField label="Sector" value={data.sector} />
                  <ProfileField label="Industry" value={data.industry} />
                  <ProfileField label="Staffing" value={data.full_time_employees?.toLocaleString()} />
                  <ProfileField label="Website" value={data.website} isLink />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.main>
      )}
    </AnimatePresence>
  );
}
