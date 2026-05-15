"use client"

import React from "react"
import { motion } from "framer-motion"
import { 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  PieChart, 
  Activity,
  Target,
  Zap
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PortfolioAnalyzerProps {
  holdings: any[]
}

export function PortfolioAnalyzer({ holdings }: PortfolioAnalyzerProps) {
  // Mock analysis logic for high-fidelity UI
  const totalValue = holdings.reduce((acc, h) => acc + (h.market_value || 0), 0)
  const riskScore = 68 // Out of 100
  const diversification = 82
  
  const sectors = [
    { name: 'Technology', weight: 45, color: 'bg-blue-500' },
    { name: 'Finance', weight: 25, color: 'bg-emerald-500' },
    { name: 'Energy', weight: 15, color: 'bg-amber-500' },
    { name: 'Others', weight: 15, color: 'bg-zinc-500' }
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
          <span className="font-headline text-[13px] uppercase tracking-[0.2em] text-white font-bold">
            Portfolio Analyzer
          </span>
        </div>
        <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Deep Scan Active</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-grow p-6 overflow-y-auto no-scrollbar space-y-6">
        {/* Risk & Diversification Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/20 transition-all group">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Target className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Risk Score</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-white font-headline tracking-tighter">{riskScore}</span>
              <span className="text-[8px] font-bold text-emerald-500/60 uppercase tracking-widest">Moderate</span>
            </div>
            <div className="mt-3 h-1 w-full bg-black/40 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${riskScore}%` }}
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400"
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-blue-500/20 transition-all group">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                <PieChart className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Diversification</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-white font-headline tracking-tighter">{diversification}%</span>
              <span className="text-[8px] font-bold text-blue-500/60 uppercase tracking-widest">Optimal</span>
            </div>
            <div className="mt-3 h-1 w-full bg-black/40 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${diversification}%` }}
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Sector Allocation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">Sector Allocation</h4>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {sectors.map((sector) => (
              <div key={sector.name} className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                  <span className="text-zinc-500">{sector.name}</span>
                  <span className="text-white/80">{sector.weight}%</span>
                </div>
                <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${sector.weight}%` }}
                    className={cn("h-full", sector.color)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Intelligence Insight */}
        <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Zap className="w-8 h-8 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2 mb-2.5">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">AI Insight</span>
          </div>
          <p className="text-[12px] text-zinc-400 leading-relaxed italic">
            "Your portfolio shows high concentration in <span className="text-white font-bold not-italic">Technology</span>. Consider rebalancing towards <span className="text-white font-bold not-italic">Consumer Staples</span>."
          </p>
        </div>
      </div>
    </div>
  )
}
