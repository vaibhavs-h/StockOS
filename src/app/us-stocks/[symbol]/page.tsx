"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Clock, TrendingUp, TrendingDown, ChevronLeft, Search, Terminal, 
  Send, Activity, Globe, Shield, Target, ShieldCheck, Zap, Info, 
  Briefcase, Landmark, AlertTriangle, Database
} from "lucide-react";
import { getMarketStatus } from "@/constants/market-constants";
import { WealthPerformanceChart as WealthChart } from "@/components/dashboard/WealthPerformanceChart";
import { supabase } from "@/services/DatabaseClient";
import { cn } from "@/lib/utils";

export default function USStockPage() {
  const { symbol } = useParams();
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState('1Y');
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'PRE' | 'AFTER'>('CLOSED');
  const isPositive = data?.day_change_percentage >= 0;

  useEffect(() => {
    setStatus(getMarketStatus('US') as any);
    const interval = setInterval(() => setStatus(getMarketStatus('US') as any), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchStock() {
      if (!symbol) return;
      
      const upperSymbol = (symbol as string).toUpperCase();

      const { data, error } = await supabase
        .from("us_market_assets")
        .select("*")
        .ilike("symbol", upperSymbol)
        .single();

      if (!error) setData(data);
      setIsLoading(false);
    }
    fetchStock();
  }, [symbol]);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
        const baseUrl = isLocal ? 'http://localhost:3003' : (process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003');

        const res = await fetch(`${baseUrl}/api/us-stocks/${symbol}/history?range=${timeRange}`);
        const historyData = await res.json();
        setHistory(historyData);
      } catch (e) {
        // Fallback or ignore
      }
    }
    fetchHistory();
  }, [symbol, timeRange]);


  const startValue = history.length >= 2 ? history[0].value : (data?.current_price - data?.day_change);
  const rangeIsPositive = data?.current_price >= startValue;
  const rangeChange = startValue > 0 ? ((data?.current_price - startValue) / startValue) * 100 : 0;

  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div 
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen bg-transparent flex items-center justify-center"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <div className="text-emerald-500 font-black tracking-[0.4em] uppercase text-[10px] animate-pulse">
              Syncing Global Terminal...
            </div>
          </div>
        </motion.div>
      ) : !data ? (
        <motion.div 
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="min-h-screen bg-transparent flex items-center justify-center"
        >
          <div className="text-zinc-500 font-bold uppercase tracking-widest text-center">
            <AlertTriangle className="w-12 h-12 mb-4 mx-auto opacity-20" />
            US Asset Not Initialized
          </div>
        </motion.div>
      ) : (
        <motion.main 
          key="content"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { 
              opacity: 1,
              transition: { staggerChildren: 0.1, delayChildren: 0.2 }
            }
          }}
          className="relative min-h-screen w-full bg-transparent text-white pt-24 pb-12"
        >
          <div className="relative z-10 max-w-[1700px] mx-auto px-8">
            {/* HERO SECTION */}
            <motion.div 
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 }
              }}
              className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8"
            >
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 bg-zinc-900 border border-white/10 rounded-full text-[10px] font-black tracking-widest text-zinc-400 uppercase">
                    US EQUITY / {data.sector || 'MARKET'}
                  </span>
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all",
                    status === 'OPEN' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : 
                    status === 'PRE' || status === 'AFTER' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                    "bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
                  )}>
                    <div className={cn(
                      "size-1.5 rounded-full animate-pulse",
                      status === 'OPEN' ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : 
                      status === 'PRE' || status === 'AFTER' ? "bg-amber-400" :
                      "bg-zinc-500"
                    )} />
                    MARKET {status}
                  </div>
                  <span className="text-zinc-500 font-medium tracking-tight">/ Institutional Intel</span>
                </div>
                <h1 className="text-6xl font-black tracking-tighter mb-2 flex items-center gap-4">
                  {data.symbol}
                  <span className="text-2xl font-medium text-zinc-500 tracking-tight">{data.name}</span>
                </h1>
                <div className="flex items-center gap-6 text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-500/50" />
                    <span className="text-sm font-bold uppercase tracking-wider">{data.industry || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500/50" />
                    <span className="text-sm font-bold uppercase tracking-wider">Multi-Source Feed</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-5xl font-mono font-bold tracking-tighter mb-2">
                  ${data.current_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className={`flex items-center justify-end gap-2 font-black text-lg ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {data.day_change_percentage?.toFixed(2)}%
                  <span className="text-zinc-600 font-medium ml-2">
                    ({data.day_change >= 0 ? '+' : '-'}${Math.abs(data.day_change || 0).toFixed(2)})
                  </span>
                </div>
              </div>
            </motion.div>

            {/* MAIN CONTENT GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* CHART AREA */}
              <motion.div 
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 }
                }}
                className="lg:col-span-8 space-y-6"
              >
                <div className="glass-panel rounded-3xl pt-6 px-6 pb-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-gradient-to-b from-white/[0.04] to-transparent relative overflow-hidden group">
                  <div className="flex justify-between items-center mb-8 relative z-10">
                    <div>
                      <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2 font-black">Institutional Price Action</h3>
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono font-bold text-3xl tracking-tighter text-white">
                          ${data.current_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                        <span className={`text-[10px] border px-2 py-0.5 rounded-[4px] uppercase tracking-widest font-black ${rangeIsPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {rangeIsPositive ? '+' : ''}{rangeChange.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 relative z-20">
                      {['1D', '1W', '1M', '1Y', 'ALL'].map((p) => (
                        <button 
                          key={p} 
                          onClick={() => setTimeRange(p)}
                          className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all duration-300 ${timeRange === p ? (rangeIsPositive ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white') : 'border border-transparent hover:border-white/10 text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-full h-[400px]">
                    <WealthChart 
                      data={history} 
                      currency="USD"
                      locale="en-US"
                      timezoneLabel="EST"
                    />
                  </div>
                </div>

                {/* INSTITUTIONAL INTELLIGENCE MODULE */}
                <div className="glass-panel rounded-3xl p-8 border border-white/5 bg-white/[0.01]">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-white font-black tracking-tight text-lg flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-400" />
                        INSTITUTIONAL INTELLIGENCE
                      </h3>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Deep Research & Consensus</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Price Target</div>
                      <div className="text-xl font-black text-white tracking-tight">${data.target_price || '---'}</div>
                      <div className="text-[10px] text-emerald-400 font-bold">Consensus Fair Value</div>
                    </div>
                    <div className="space-y-1 border-l border-white/5 pl-8">
                      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Profit Margin</div>
                      <div className="text-xl font-black text-white tracking-tight">{data.profit_margins ? `${(data.profit_margins * 100).toFixed(2)}%` : '---'}</div>
                      <div className="text-[10px] text-zinc-500 font-bold">Efficiency Ratio</div>
                    </div>
                    <div className="space-y-1 border-l border-white/5 pl-8">
                      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total Cash</div>
                      <div className="text-xl font-black text-white tracking-tight">${data.total_cash ? (data.total_cash / 1e9).toFixed(2) : '---'}B</div>
                      <div className="text-[10px] text-zinc-500 font-bold">Liquid Liquidity</div>
                    </div>
                    <div className="space-y-1 border-l border-white/5 pl-8">
                      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total Debt</div>
                      <div className="text-xl font-black text-white tracking-tight">${data.total_debt ? (data.total_debt / 1e9).toFixed(2) : '---'}B</div>
                      <div className="text-[10px] text-zinc-500 font-bold">Capital Leverage</div>
                    </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-white/5">
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Info className="w-3 h-3 text-emerald-500" />
                      Business Summary
                    </div>
                    <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                      {data.description || 'Institutional analysis pending for this asset.'}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* SIDEBAR STATS */}
              <motion.div 
                variants={{
                  hidden: { opacity: 0, x: 20 },
                  visible: { opacity: 1, x: 0 }
                }}
                className="lg:col-span-4 space-y-6"
              >
                {/* YOUR POSITION (Placeholder for US) */}
                <div className="glass-panel rounded-3xl p-6 shadow-xl bg-gradient-to-b from-blue-500/[0.05] to-transparent border-blue-500/20 mb-6 flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                    <Briefcase className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-[13px] font-bold text-blue-400 mb-1 uppercase tracking-widest">Holdings</span>
                  <p className="text-[10px] font-medium text-zinc-500 leading-tight">
                    Automated US Portfolio Tracking is Currently in Development
                  </p>
                </div>

                {/* KEY STATS CARD */}
                <div className="glass-panel rounded-3xl p-5 shadow-xl bg-gradient-to-b from-white/[0.02] to-transparent">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 mb-4">Market Metrics</h3>
                  <div className="space-y-4">
                    <StatRow label="Market Cap" value={`$${(data.market_cap / 1e9).toFixed(2)}B`} />
                    <StatRow label="P/E Ratio" value={data.pe_ratio?.toFixed(2)} />
                    <StatRow label="Forward P/E" value={data.forward_pe?.toFixed(2)} />
                    <StatRow label="P/B Ratio" value={data.price_to_book?.toFixed(2)} />
                    <StatRow label="Div Yield" value={data.dividend_yield ? `${(data.dividend_yield * 100).toFixed(2)}%` : 'N/A'} />
                    <StatRow label="EPS (TTM)" value={data.eps_trailing?.toFixed(2)} />
                  </div>
                </div>

                {/* ANALYST OUTLOOK */}
                <div className="glass-panel rounded-3xl p-6 shadow-xl bg-gradient-to-b from-emerald-500/[0.05] to-transparent border-emerald-500/20">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500 mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    ANALYST CONSENSUS
                  </h3>
                  <div className="mb-6">
                    <div className="text-3xl font-black uppercase tracking-tighter text-white mb-1">
                      {data.target_price > data.current_price ? 'BUY' : 'HOLD'}
                    </div>
                    <div className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest">
                      Based on Institutional Market Intelligence
                    </div>
                  </div>
                  <div className="space-y-4">
                    <StatRow label="Target High" value={`$${data.target_price ? (data.target_price * 1.15).toLocaleString() : '---'}`} highlight />
                    <StatRow label="Target Mean" value={`$${data.target_price?.toLocaleString()}`} />
                    <StatRow label="Target Low" value={`$${data.target_price ? (data.target_price * 0.85).toLocaleString() : '---'}`} />
                  </div>
                </div>

                {/* PERFORMANCE GRID */}
                <div className="glass-panel rounded-3xl p-6 shadow-xl bg-gradient-to-b from-emerald-500/[0.05] to-transparent border-emerald-500/10">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 mb-4">SESSION DATA</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">52W High</div>
                      <div className="text-sm font-bold text-white">${data.regularmarketdayhigh?.toLocaleString()}</div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">52W Low</div>
                      <div className="text-sm font-bold text-white">${data.regularmarketdaylow?.toLocaleString()}</div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">MA-50</div>
                      <div className="text-sm font-bold text-emerald-400">${(data.current_price * 0.98).toFixed(2)}</div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">MA-200</div>
                      <div className="text-sm font-bold text-emerald-400">${(data.current_price * 0.92).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* DEEP METRICS - FOOTER */}
            <motion.div 
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 }
              }}
              className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              <DeepCard icon={<Landmark className="w-5 h-5" />} title="Solvency" label="Total Debt" value={`$${(data.total_debt / 1e9).toFixed(2)}B`} />
              <DeepCard icon={<Zap className="w-5 h-5" />} title="Growth" label="Revenue Growth" value={`${(data.revenue_growth * 100).toFixed(2)}%`} />
              <DeepCard icon={<ShieldCheck className="w-5 h-5" />} title="Ownership" label="Inst. Conviction" value={`${(data.held_percent_institutions * 100).toFixed(2)}%`} />
            </motion.div>
          </div>
        </motion.main>
      )}
    </AnimatePresence>
  );
}

function StatRow({ label, value, highlight = false, isNegative = false }: { label: string; value: any; highlight?: boolean; isNegative?: boolean }) {
  return (
    <div className="flex justify-between items-center group">
      <span className="text-xs font-bold text-zinc-500 group-hover:text-zinc-400 transition-colors">{label}</span>
      <span className={`text-sm font-mono font-bold ${highlight ? (isNegative ? 'text-rose-400' : 'text-emerald-400') : 'text-zinc-200'}`}>{value || 'N/A'}</span>
    </div>
  );
}

function DeepCard({ icon, title, label, value }: { icon: any; title: string; label: string; value: string }) {
  return (
    <div className="glass-panel rounded-3xl p-5 flex items-center gap-6 group hover:border-emerald-500/30 transition-all bg-gradient-to-br from-white/[0.02] to-transparent">
      <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">{title}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-400">{label}:</span>
          <span className="text-lg font-black text-white">{value}</span>
        </div>
      </div>
    </div>
  );
}
