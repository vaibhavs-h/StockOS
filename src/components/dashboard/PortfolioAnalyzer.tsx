"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Target,
  Briefcase,
  Scan,
  Compass,
  Globe2,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/services/DatabaseClient"

interface PortfolioAnalyzerProps {
  holdings: any[];
  onRefresh?: () => Promise<void>;
}

interface AssetMetadata {
  sector: string | null;
  beta: number | null;
  market_cap: number | null;
}

export function PortfolioAnalyzer({ holdings, onRefresh }: PortfolioAnalyzerProps) {
  const [metadata, setMetadata] = useState<Record<string, AssetMetadata>>({});
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. DATA LAYER: Metadata Bridge
  const fetchMetadata = useCallback(async (showLoading = true) => {
    if (holdings.length === 0) return;
    if (showLoading) setIsLoadingMetadata(true);

    try {
      const inSymbols = holdings.filter(h => h.trading_symbol.endsWith('.NS') || h.trading_symbol.endsWith('.BO')).map(h => h.trading_symbol);
      const usSymbols = holdings.filter(h => !h.trading_symbol.endsWith('.NS') && !h.trading_symbol.endsWith('.BO')).map(h => h.trading_symbol);

      const newMetadata: Record<string, AssetMetadata> = {};

      if (inSymbols.length > 0) {
        const { data: inData } = await supabase
          .from('market_assets')
          .select('symbol, sector, beta, market_cap')
          .in('symbol', inSymbols);

        inData?.forEach(item => {
          newMetadata[item.symbol] = {
            sector: item.sector,
            beta: item.beta,
            market_cap: item.market_cap
          };
        });
      }

      if (usSymbols.length > 0) {
        const { data: usData } = await supabase
          .from('us_market_assets')
          .select('symbol, sector, beta_5y, market_cap')
          .in('symbol', usSymbols);

        usData?.forEach(item => {
          newMetadata[item.symbol] = {
            sector: item.sector,
            beta: item.beta_5y,
            market_cap: item.market_cap
          };
        });
      }

      setMetadata(newMetadata);
    } catch (err) {
      console.error("[ANALYZER] Metadata fetch failed:", err);
    } finally {
      if (showLoading) setIsLoadingMetadata(false);
    }
  }, [holdings]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      await Promise.all([
        fetchMetadata(false),
        new Promise(resolve => setTimeout(resolve, 800))
      ]);
    } catch (err) {
      console.error("[ANALYZER] Manual refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 2. LOGIC LAYER: Mathematical Recomputation
  const analytics = useMemo(() => {
    if (holdings.length === 0) return null;

    const totalPortfolioValue = holdings.reduce((sum, h) => sum + (Number(h.market_value) || 0), 0);
    if (totalPortfolioValue === 0) return null;

    // --- ALLOCATION ANALYSIS ---
    const sectorMap: Record<string, number> = {};
    const capBuckets = { large: 0, mid: 0, small: 0 };
    let usValue = 0;

    holdings.forEach(h => {
      const val = Number(h.market_value) || 0;
      const meta = metadata[h.trading_symbol];

      // Sector
      const sector = meta?.sector || 'Unclassified';
      sectorMap[sector] = (sectorMap[sector] || 0) + val;

      // Market Cap (Bucketing logic - Currency Aware)
      const mCap = meta?.market_cap || 0;
      const isUS = !h.trading_symbol.endsWith('.NS') && !h.trading_symbol.endsWith('.BO');
      if (isUS) usValue += val;

      // Thresholds: Large (> $10B / ₹80k Cr), Mid (> $2B / ₹16k Cr)
      const largeThreshold = isUS ? 10000000000 : 800000000000;
      const midThreshold = isUS ? 2000000000 : 160000000000;

      if (mCap > largeThreshold) capBuckets.large += val;
      else if (mCap > midThreshold) capBuckets.mid += val;
      else capBuckets.small += val;

    });

    const sectorAllocation = Object.entries(sectorMap)
      .map(([name, value]) => ({ name, weight: (value / totalPortfolioValue) * 100 }))
      .sort((a, b) => b.weight - a.weight);

    const capWeights = {
      large: (capBuckets.large / totalPortfolioValue) * 100,
      mid: (capBuckets.mid / totalPortfolioValue) * 100,
      small: (capBuckets.small / totalPortfolioValue) * 100
    };

    const usExposure = (usValue / totalPortfolioValue) * 100;

    const topHoldings = [...holdings]
      .sort((a, b) => (Number(b.market_value) || 0) - (Number(a.market_value) || 0))
      .slice(0, 5)
      .map(h => ({
        symbol: h.trading_symbol.split('.')[0],
        weight: ((Number(h.market_value) || 0) / totalPortfolioValue) * 100,
        value: Number(h.market_value) || 0
      }));

    // --- RISK ENGINE ---
    let weightedBetaSum = 0;
    let betaWeightTotal = 0;

    holdings.forEach(h => {
      const meta = metadata[h.trading_symbol];
      if (meta && meta.beta !== null) {
        const weight = (Number(h.market_value) || 0) / totalPortfolioValue;
        weightedBetaSum += weight * meta.beta;
        betaWeightTotal += weight;
      }
    });

    const portfolioBeta = betaWeightTotal > 0 ? (weightedBetaSum / betaWeightTotal) : 1.0;
    const largestHoldingWeight = topHoldings[0]?.weight || 0;
    const largestSectorWeight = sectorAllocation[0]?.weight || 0;
    const top3HoldingsPct = topHoldings.slice(0, 3).reduce((sum, h) => sum + h.weight, 0);

    // Diversification Score
    let score = 100;
    if (largestHoldingWeight > 30) score -= 20;
    if (largestSectorWeight > 45) score -= 15;
    if (holdings.length < 5) score -= 15;
    if (portfolioBeta > 1.5) score -= 10;
    if (top3HoldingsPct > 60) score -= 10;
    const diversificationScore = Math.max(0, Math.min(100, score));

    // Volatility Indicator
    const baseVol = portfolioBeta * 100;
    const concentrationMult = 1 + (largestHoldingWeight / 100 * 0.5) + (largestSectorWeight / 100 * 0.3);
    const volatilityScore = baseVol * concentrationMult;

    // Risk Profile
    let riskProfile = 'Moderate';
    if (portfolioBeta < 0.9 && diversificationScore > 75) riskProfile = 'Conservative';
    else if (portfolioBeta > 1.3 || largestHoldingWeight > 35) riskProfile = 'Aggressive';
    else if (portfolioBeta > 1.1) riskProfile = 'Moderately Aggressive';

    return {
      sectorAllocation,
      capWeights,
      topHoldings,
      portfolioBeta,
      diversificationScore,
      volatilityScore,
      riskProfile,
      largestHoldingWeight,
      largestSectorWeight,
      totalHoldings: holdings.length,
      totalSectors: Object.keys(sectorMap).length,
      usExposure,
      topAsset: topHoldings[0]?.symbol || 'N/A'
    };
  }, [holdings, metadata]);

  if (!analytics) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
        <Briefcase className="w-8 h-8 opacity-20" />
        <span className="text-[10px] font-bold uppercase tracking-widest">No Portfolio Data Detected</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0a0d14]/40 backdrop-blur-3xl relative group/analyzer">
      {/* 0. Ambient Glow Effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 blur-[120px] pointer-events-none" />

      {/* 1. PREMIUM HEADER: Replaced Live Scan with Interactive Refresh */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/[0.05] bg-white/[0.02] backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={cn(
              "size-2 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.9)] transition-colors duration-500",
              isRefreshing ? "bg-amber-500" : "bg-blue-500 animate-pulse"
            )} />
            {isRefreshing && <div className="absolute inset-0 size-2 rounded-full bg-amber-500/30 animate-ping" />}
          </div>
          <span className="font-headline text-[13px] uppercase tracking-[0.4em] text-white/90 font-black drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
            Portfolio Analytics
          </span>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className={cn(
            "group/refresh flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/10 hover:border-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(0,0,0,0.2)]",
            isRefreshing && "bg-white/5"
          )}
        >
          <RefreshCw className={cn(
            "size-3 text-blue-400 group-hover/refresh:text-blue-300 transition-colors",
            isRefreshing && "animate-spin"
          )} />
          <span className="text-[9px] font-black text-white/70 group-hover/refresh:text-white uppercase tracking-tighter">
            {isRefreshing ? "Recalculating..." : "Refresh"}
          </span>
        </button>
      </div>

      <div className="flex-grow p-4 overflow-y-auto no-scrollbar flex flex-col justify-between relative z-10 py-5">

        {/* 2. TOP METRICS */}
        <div className="flex items-center justify-between py-3 px-2 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 group/metrics">
          <div className="flex flex-col gap-0.5 px-3 border-r border-white/[0.05] flex-1">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Diversification</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-headline font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] transition-transform group-hover/metrics:scale-105 origin-left">
                {analytics.diversificationScore}
              </span>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter">Optimal</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 px-3 border-r border-white/[0.05] flex-1">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Beta</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-headline font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] transition-transform group-hover/metrics:scale-105 origin-left">
                {analytics.portfolioBeta.toFixed(2)}
              </span>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-tighter",
                analytics.portfolioBeta > 1 ? "text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.4)]"
              )}>
                {analytics.portfolioBeta > 1 ? 'High' : 'Low'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 px-3 flex-1">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Risk Profile</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-headline font-black text-white uppercase tracking-tighter truncate drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-transform group-hover/metrics:scale-105
              origin-left">
                {analytics.riskProfile}
              </span>
            </div>
          </div>
        </div>

        {/* 3. ALLOCATION */}
        <div className="space-y-4 p-4 rounded-xl bg-white/[0.01] border border-white/[0.03] backdrop-blur-md hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 group/helix">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <Compass className="size-3.5 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/70">Sector Allocation</h4>
            </div>
            <span className="text-[9px] font-mono text-zinc-500 font-bold tracking-widest">{analytics.totalSectors} CORE SECTORS</span>
          </div>

          <div className="relative h-2.5 w-full bg-black/40 rounded-lg overflow-hidden flex gap-1 border border-white/[0.05] p-0.5 shadow-inner">
            {analytics.sectorAllocation.slice(0, 5).map((sector, i) => (
              <motion.div
                key={sector.name}
                initial={{ width: 0 }}
                animate={{ width: `${sector.weight}%` }}
                whileHover={{ flexGrow: 1.2, transition: { duration: 0.2 } }}
                className={cn(
                  "h-full transition-all duration-1000 relative cursor-pointer rounded-sm",
                  i === 0 ? 'bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.4)]' :
                    i === 1 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]' :
                      i === 2 ? 'bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]' :
                        i === 3 ? 'bg-indigo-600' : 'bg-zinc-700'
                )}
              >
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/helix:opacity-10 transition-opacity" />
                <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30" />
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-1.5 pt-1">
            {analytics.sectorAllocation.slice(0, 3).map((sector, i) => (
              <div key={sector.name} className="flex items-center justify-between group cursor-default p-1 rounded-lg hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "size-2 rounded-sm rotate-45",
                    i === 0 ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6]' :
                      i === 1 ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' :
                        'bg-amber-500 shadow-[0_0_8px_#f59e0b]'
                  )} />
                  <span className="text-[10px] font-bold text-zinc-400 group-hover:text-white transition-all uppercase tracking-widest group-hover:translate-x-1 duration-300">
                    {sector.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-[1px] bg-white/[0.05] group-hover:bg-white/20 transition-all" />
                  <span className="text-[10px] font-mono font-black text-white group-hover:scale-110 transition-transform origin-right">{sector.weight.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. MARKET CAP */}
        <div className="space-y-4 p-4 rounded-xl bg-white/[0.01] border border-white/[0.03] backdrop-blur-md hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300">
          <div className="flex items-center gap-2">
            <Target className="size-3.5 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/80">Capitalization Spread</h4>
          </div>

          <div className="flex gap-3">
            {[
              { label: 'Large Cap', val: analytics.capWeights.large, color: 'from-blue-600 to-blue-400', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.3)]' },
              { label: 'Mid Cap', val: analytics.capWeights.mid, color: 'from-emerald-600 to-emerald-400', shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]' },
              { label: 'Small Cap', val: analytics.capWeights.small, color: 'from-zinc-600 to-zinc-400', shadow: 'shadow-[0_0_15px_rgba(113,113,122,0.3)]' }
            ].map((cap) => (
              <div key={cap.label} className="flex-1 space-y-2.5 p-3 rounded-xl bg-black/40 border border-white/[0.05] hover:border-white/20 transition-all group/cap shadow-lg">
                <div className="flex justify-between items-end">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest group-hover/cap:text-white transition-colors">{cap.label}</span>
                  <span className="text-[11px] font-mono font-black text-white group-hover/cap:scale-110 transition-transform">{cap.val.toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full bg-black/60 rounded-full overflow-hidden border border-white/[0.05] p-[1px]">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: cap.val / 100 }}
                    className={cn("h-full origin-left transition-all duration-1000 rounded-full bg-gradient-to-r", cap.color, cap.shadow)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. DIAGNOSTICS */}
        <div className="space-y-3.5">
          <div className="flex items-center gap-2">
            <Scan className="size-3.5 text-zinc-500 animate-pulse" />
            <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/80">System Diagnostics</h4>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <motion.div
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl group/diag overflow-hidden relative cursor-default"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none group-hover/diag:from-blue-500/10 transition-colors" />
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] relative z-10">Volatility Index</span>
              <div className="flex items-baseline justify-between relative z-10 mt-1">
                <span className="text-2xl font-headline font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                  {analytics.volatilityScore.toFixed(0)}
                </span>
                <div className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter transition-all",
                  analytics.volatilityScore > 140 ? "text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)] bg-rose-500/10" : "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)] bg-emerald-500/10"
                )}>
                  {analytics.volatilityScore > 160 ? 'Extreme' : 'Stable'}
                </div>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl group/sync overflow-hidden relative cursor-default"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none group-hover/sync:from-emerald-500/10 transition-colors" />
              <div className="flex justify-between items-start relative z-10">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Market Exposure</span>
                <div className="flex items-center gap-1.5">
                  <Globe2 className="size-2.5 text-blue-400" />
                  <span className="text-[11px] font-headline font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                    {analytics.usExposure > 0 ? 'Hybrid' : 'Domestic'}
                  </span>
                </div>
              </div>

              {/* Exposure Breakdown */}
              <div className="mt-2.5 space-y-1.5 relative z-10">
                <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">
                  <span>NSE/BSE (India)</span>
                  <span className="text-zinc-200">{(100 - analytics.usExposure).toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">
                  <span>NYSE/NAS (USA)</span>
                  <span className="text-zinc-200">{analytics.usExposure.toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">
                  <span className="flex items-center gap-1">Top Asset</span>
                  <span className="text-blue-400">{analytics.topAsset}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

      </div>
    </div>
  )
}
