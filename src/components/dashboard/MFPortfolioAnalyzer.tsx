"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Compass,
  Activity,
  Layers,
  RefreshCw,
  Award
} from "lucide-react"
import { cn } from "@/lib/utils"

interface MFPortfolioAnalyzerProps {
  activePortfolioId: string;
  holdingsHash?: string;
}

interface HealthScoreData {
  score: number;
  diversification: number;
  overlap: number;
  amc: number;
  sector: number;
  cap: number;
  insights: string[];
}

interface AllocationItem {
  name: string;
  value: number;
  percentage: number;
}

interface SectorExposureItem {
  name: string;
  percentage: number;
}

interface OverlappingStockItem {
  name: string;
  symbol: string | null;
  combinedExposure: number;
  count: number;
  funds: Array<{ fundName: string; percent: number }>;
}

interface AnalyticsPayload {
  totalValue: number;
  totalInvested: number;
  totalPL: number;
  totalPLPercentage: number;
  healthScore: HealthScoreData;
  allocations: {
    category: AllocationItem[];
    amc: AllocationItem[];
    asset: AllocationItem[];
  };
  sectorExposures: SectorExposureItem[];
  stockOverlap: {
    overlapPercentage: number;
    topOverlappingStocks: OverlappingStockItem[];
  };
}

// Custom hook to track mouse coordinates relative to card bounds for premium hover glows
function useMouseGlow() {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };
  return { coords, handleMouseMove };
}

// Module-level persistent cache to avoid initial blocking recalculation spinners and provide instant loading
const analyticsCache: Record<string, AnalyticsPayload> = {};

export function MFPortfolioAnalyzer({ activePortfolioId, holdingsHash }: MFPortfolioAnalyzerProps) {
  const [data, setData] = useState<AnalyticsPayload | null>(() => {
    return analyticsCache[activePortfolioId] || null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Glow anchors for each of the 4 sections
  const sec1 = useMouseGlow();
  const sec2 = useMouseGlow();
  const sec3 = useMouseGlow();
  const sec4 = useMouseGlow();

  const fetchAnalytics = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      let url = `/api/mutual-funds/analyzer`;
      if (activePortfolioId && activePortfolioId !== 'mf_overall' && activePortfolioId !== 'total') {
        url += `?portfolio_id=${activePortfolioId}`;
      }
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`);
      const payload = await response.json();
      if (response.ok) {
        setData(payload);
        analyticsCache[activePortfolioId] = payload; // Save to persistent memory
      }
    } catch (err) {
      console.error("[MF-ANALYZER] Failed to fetch mutual fund analytics:", err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [activePortfolioId]);

  useEffect(() => {
    // Instantly load from persistent cache if available
    if (analyticsCache[activePortfolioId]) {
      setData(analyticsCache[activePortfolioId]);
    } else {
      setData(null);
    }

    // Silent background fetch if cached, otherwise show loading spinner
    const hasCache = !!analyticsCache[activePortfolioId];
    fetchAnalytics(!hasCache);
  }, [activePortfolioId, holdingsHash, fetchAnalytics]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchAnalytics(false),
        new Promise(resolve => setTimeout(resolve, 800))
      ]);
    } catch (err) {
      console.error("[MF-ANALYZER] Manual refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
        <Activity className="w-8 h-8 animate-spin opacity-30 text-emerald-500" />
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Recalculating Pulse...</span>
      </div>
    );
  }

  if (!data || data.totalValue === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4 p-8 text-center">
        <Layers className="w-8 h-8 opacity-20 text-emerald-400" />
        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest block text-zinc-400">Empty Portfolio HUD</span>
          <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider max-w-[200px] leading-relaxed">
            Import a CAS Mutual Fund statement to compute advanced portfolio diagnostics.
          </p>
        </div>
      </div>
    );
  }

  const { healthScore, allocations, sectorExposures, stockOverlap } = data;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring", stiffness: 120, damping: 18 }
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#07090e]/70 border border-white/[0.08] rounded-3xl backdrop-blur-3xl relative group/analyzer shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
      {/* Dynamic Deep Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 blur-[150px] pointer-events-none transition-all duration-700 group-hover/analyzer:bg-emerald-500/10" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 blur-[150px] pointer-events-none transition-all duration-700 group-hover/analyzer:bg-indigo-500/10" />

      {/* Premium Header HUD */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={cn(
              "size-2 rounded-full transition-colors duration-500 shadow-[0_0_15px_#10b981]",
              isRefreshing ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
            )} />
            {isRefreshing && <div className="absolute inset-0 size-2 rounded-full bg-amber-500/30 animate-ping" />}
          </div>
          <span className="font-headline text-[12px] uppercase tracking-[0.4em] text-white/95 font-black drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            MF Diagnostics
          </span>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className={cn(
            "group/refresh flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/10 hover:border-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_25px_rgba(0,0,0,0.3)]",
            isRefreshing && "bg-white/5"
          )}
        >
          <RefreshCw className={cn(
            "size-3 text-emerald-400 group-hover/refresh:text-emerald-300 transition-colors",
            isRefreshing && "animate-spin"
          )} />
          <span className="text-[9px] font-black text-white/70 group-hover/refresh:text-white uppercase tracking-tighter">
            {isRefreshing ? "Recalculating..." : "Refresh"}
          </span>
        </button>
      </div>

      {/* Main Single View Scrollable Container */}
      <motion.div
        key={activePortfolioId}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex-grow p-4 overflow-y-auto no-scrollbar relative z-10 flex flex-col justify-between py-5 gap-4"
      >

        {/* 1. PORTFOLIO HEALTH INDEX */}
        <motion.div
          variants={itemVariants}
          onMouseMove={sec1.handleMouseMove}
          style={{
            "--mouse-x": `${sec1.coords.x}px`,
            "--mouse-y": `${sec1.coords.y}px`
          } as React.CSSProperties}
          className="flex items-center gap-5 p-5 rounded-2xl bg-white/[0.01] border border-white/[0.06] backdrop-blur-xl relative overflow-hidden group/card shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/20 hover:bg-white/[0.03] transition-all duration-500 cursor-default"
        >
          {/* Dynamic Cursor Glow */}
          <div className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none bg-[radial-gradient(circle_at_var(--mouse-x)_var(--mouse-y),rgba(16,185,129,0.06)_0%,transparent_70%)]" />
          <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none group-hover/card:border-white/10 transition-colors" />

          {/* Circular Gauge */}
          <div className="relative size-20 shrink-0 flex items-center justify-center filter drop-shadow-[0_0_15px_rgba(16,185,129,0.2)] group-hover/card:drop-shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all duration-500">
            <svg className="size-full transform -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="34"
                className="stroke-zinc-800/80"
                strokeWidth="5.5"
                fill="transparent"
              />
              <motion.circle
                cx="40"
                cy="40"
                r="34"
                className={cn(
                  healthScore.score > 80 ? "stroke-emerald-500" : healthScore.score > 60 ? "stroke-emerald-400" : "stroke-rose-500"
                )}
                strokeWidth="5.5"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 34}
                initial={{ strokeDashoffset: 2 * Math.PI * 34 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - healthScore.score / 100) }}
                transition={{ type: "spring", stiffness: 60, damping: 15, delay: 0.1 }}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="font-headline font-black text-2xl text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">
                {healthScore.score}
              </span>
              <span className="text-[6px] font-black text-zinc-500 uppercase tracking-widest">Health</span>
            </div>
          </div>

          {/* Sub-Score Breakdown Matrix */}
          <div className="flex-grow grid grid-cols-2 gap-x-3 gap-y-2 text-left">
            {[
              { label: 'Diversification', val: healthScore.diversification },
              { label: 'AMC Concentration', val: healthScore.amc },
              { label: 'Overlap Risk', val: healthScore.overlap },
              { label: 'Sector Balance', val: healthScore.sector }
            ].map((sub, i) => (
              <div key={sub.label} className="flex flex-col group/sub">
                <span className="text-[7.5px] font-black text-zinc-500 uppercase tracking-wider group-hover/card:text-zinc-400 transition-colors">{sub.label}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="h-1 flex-1 bg-zinc-800/60 rounded-full overflow-hidden border border-white/[0.02] relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${sub.val}%` }}
                      transition={{ type: "spring", stiffness: 85, damping: 14, delay: i * 0.05 + 0.2 }}
                      className={cn(
                        "h-full rounded-full relative overflow-hidden",
                        sub.val > 80 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                          sub.val > 60 ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]" :
                            "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                      )}
                    >
                      {/* Sweeping Shimmer Highlight */}
                      <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: "linear", repeatDelay: 0.5 }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none"
                      />
                    </motion.div>
                  </div>
                  <span className="text-[8px] font-mono font-black text-white group-hover/card:scale-105 transition-transform">{sub.val}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 2. AGGREGATED SECTOR WEIGHTS */}
        <motion.div
          variants={itemVariants}
          onMouseMove={sec2.handleMouseMove}
          style={{
            "--mouse-x": `${sec2.coords.x}px`,
            "--mouse-y": `${sec2.coords.y}px`
          } as React.CSSProperties}
          className="space-y-3 p-4 rounded-xl bg-white/[0.01] border border-white/[0.05] backdrop-blur-xl relative overflow-hidden group/card shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/20 hover:bg-white/[0.03] transition-all duration-500 cursor-default"
        >
          {/* Dynamic Cursor Glow */}
          <div className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none bg-[radial-gradient(circle_at_var(--mouse-x)_var(--mouse-y),rgba(16,185,129,0.06)_0%,transparent_70%)]" />

          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <Compass className="size-3.5 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-[pulse_3s_infinite]" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80 group-hover/card:text-white transition-colors">Aggregate Sectors</h4>
            </div>
            <span className="text-[8px] font-mono text-zinc-500 font-bold tracking-widest">{sectorExposures.length} SECTORS</span>
          </div>

          <div className="relative h-2 w-full bg-black/40 rounded-lg overflow-hidden flex gap-1 border border-white/[0.05] p-0.5 shadow-inner">
            {sectorExposures.slice(0, 4).map((sector, i) => (
              <motion.div
                key={sector.name}
                initial={{ width: 0 }}
                animate={{ width: `${sector.percentage}%` }}
                transition={{ type: "spring", stiffness: 80, damping: 14, delay: i * 0.08 + 0.1 }}
                className={cn(
                  "h-full rounded-sm relative overflow-hidden",
                  i === 0 ? "bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.35)]" :
                    i === 1 ? "bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.35)]" :
                      i === 2 ? "bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.35)]" :
                        "bg-zinc-700"
                )}
              >
                {/* Sweeping Shimmer Highlight */}
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "linear", repeatDelay: 0.5 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
                />
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-1 pt-0.5">
            {sectorExposures.slice(0, 3).map((sector, i) => (
              <div key={sector.name} className="flex items-center justify-between group/row cursor-default p-1 rounded hover:bg-white/[0.02] transition-all duration-300">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "size-1.5 rounded-sm rotate-45 transition-transform duration-500 group-hover/row:rotate-[135deg]",
                    i === 0 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" :
                      i === 1 ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" :
                        "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                  )} />
                  <span className="text-[9.5px] font-bold text-zinc-400 group-hover/row:text-white transition-colors uppercase tracking-widest group-hover/row:translate-x-1 duration-300">
                    {sector.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-[1px] bg-white/[0.04] group-hover/row:bg-white/15 transition-all" />
                  <span className="text-[9.5px] font-mono font-black text-white group-hover/row:scale-105 transition-transform origin-right">{sector.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 3. AMC EXPOSURE MATRIX */}
        <motion.div
          variants={itemVariants}
          onMouseMove={sec3.handleMouseMove}
          style={{
            "--mouse-x": `${sec3.coords.x}px`,
            "--mouse-y": `${sec3.coords.y}px`
          } as React.CSSProperties}
          className="space-y-3 p-4 rounded-xl bg-white/[0.01] border border-white/[0.05] backdrop-blur-xl relative overflow-hidden group/card shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/20 hover:bg-white/[0.03] transition-all duration-500 cursor-default"
        >
          {/* Dynamic Cursor Glow */}
          <div className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none bg-[radial-gradient(circle_at_var(--mouse-x)_var(--mouse-y),rgba(16,185,129,0.06)_0%,transparent_70%)]" />

          <div className="flex items-center gap-2">
            <Award className="size-3.5 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80 group-hover/card:text-white transition-colors">AMC Exposure Matrix</h4>
          </div>

          <div className="space-y-2">
            {allocations.amc.slice(0, 3).map((amc, i) => (
              <div key={amc.name} className="flex justify-between items-center p-2.5 rounded-lg bg-black/40 border border-white/[0.03] hover:border-white/12 transition-all duration-300 group/amcrow">
                <div className="flex items-center gap-2.5 truncate pr-4 text-left">
                  <div className={cn(
                    "size-2 rounded-full transition-transform duration-500 group-hover/amcrow:scale-125",
                    i === 0 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                      i === 1 ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" :
                        "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  )} />
                  <span className="text-[9px] font-black text-zinc-300 group-hover/amcrow:text-white transition-colors uppercase tracking-wider truncate">
                    {amc.name.replace(/ mutual fund/i, '')}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-black text-white group-hover/amcrow:scale-105 transition-transform origin-right">{amc.percentage}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 4. HIDDEN STOCKS OVERLAP & COMBINED HOLDINGS */}
        <motion.div
          variants={itemVariants}
          onMouseMove={sec4.handleMouseMove}
          style={{
            "--mouse-x": `${sec4.coords.x}px`,
            "--mouse-y": `${sec4.coords.y}px`
          } as React.CSSProperties}
          className="space-y-3 p-4 rounded-xl bg-white/[0.01] border border-white/[0.05] backdrop-blur-xl relative overflow-hidden group/card shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/20 hover:bg-white/[0.03] transition-all duration-500 cursor-default"
        >
          {/* Dynamic Cursor Glow */}
          <div className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none bg-[radial-gradient(circle_at_var(--mouse-x)_var(--mouse-y),rgba(16,185,129,0.06)_0%,transparent_70%)]" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="size-3.5 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80 group-hover/card:text-white transition-colors">Overlaps & Top Holdings</h4>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Avg Overlap: {stockOverlap.overlapPercentage}%</span>
          </div>

          <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
            {stockOverlap.topOverlappingStocks.slice(0, 3).map((stock, idx) => (
              <div key={idx} className="flex justify-between items-center p-2 rounded-lg hover:bg-white/[0.02] border border-transparent hover:border-white/[0.04] transition-all duration-300 group/stockrow">
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] font-black text-white group-hover/stockrow:text-emerald-400 transition-colors">{stock.name}</span>
                    {stock.count > 1 && (
                      <span className="text-[6.5px] font-black px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest shrink-0 animate-[pulse_2s_infinite]">
                        {stock.count} Funds
                      </span>
                    )}
                  </div>
                  <span className="text-[7.5px] font-black text-zinc-600 uppercase tracking-widest mt-0.5 group-hover/stockrow:text-zinc-500 transition-colors">
                    {stock.funds.map(f => `${f.fundName.split(' ')[0]} (${f.percent}%)`).join(' • ')}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-black text-white group-hover/stockrow:scale-105 transition-transform origin-right">{stock.combinedExposure}%</span>
              </div>
            ))}
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
