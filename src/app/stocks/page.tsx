"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Search, 
  TrendingUp, 
  Activity, 
  Globe, 
  ArrowUpRight, 
  ArrowDownRight, 
  Database, 
  SearchIcon, 
  Filter,
  BarChart3,
  TrendingDown,
  ChevronRight,
  Sparkles,
  Cpu,
  Car
} from "lucide-react"
import { supabase } from "@/services/DatabaseClient"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"

export default function StocksPage() {
  const [mounted, setMounted] = useState(false)
  const [indianStocks, setIndianStocks] = useState<any[]>([])
  const [usStocks, setUsStocks] = useState<any[]>([])
  const [indices, setIndices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeMarket, setActiveMarket] = useState<'ALL' | 'IN' | 'US'>('ALL')

  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    fetchStocks()
  }, [])

  const fetchStocks = async () => {
    setLoading(true)
    try {
      const [{ data: inData }, { data: usData }] = await Promise.all([
        supabase.from('market_assets').select('*').order('market_cap', { ascending: false }).limit(50),
        supabase.from('us_market_assets').select('*').order('market_cap', { ascending: false }).limit(50)
      ])

      const indianWithMarket = (inData || []).map(s => ({ ...s, market: 'IN' as const, region: 'IN' as const }))
      const usWithMarket = (usData || []).map(s => ({ ...s, market: 'US' as const, region: 'US' as const }))

      setIndianStocks(indianWithMarket)
      setUsStocks(usWithMarket)
      
      // Filter for indices if they exist, or just use top stocks as placeholders for now
      setIndices([
        { symbol: 'NIFTY 50', name: 'NSE Index', price: 23532.70, change: 0.45, isUp: true, market: 'IN' },
        { symbol: 'SENSEX', name: 'BSE Index', price: 77337.59, change: 0.38, isUp: true, market: 'IN' },
        { symbol: 'NASDAQ 100', name: 'US Index', price: 19935.40, change: 1.20, isUp: true, market: 'US' },
        { symbol: 'S&P 500', name: 'US Index', price: 5473.23, change: 0.77, isUp: true, market: 'US' },
      ])
    } catch (err) {
      console.error("Failed to fetch stocks:", err)
    } finally {
      setLoading(false)
    }
  }

  const topGainers = useMemo(() => {
    return [...indianStocks, ...usStocks]
      .filter(s => (s.day_change_percentage || 0) > 0)
      .sort((a, b) => (b.day_change_percentage || 0) - (a.day_change_percentage || 0))
      .slice(0, 4)
  }, [indianStocks, usStocks])

  const topLosers = useMemo(() => {
    return [...indianStocks, ...usStocks]
      .filter(s => (s.day_change_percentage || 0) < 0)
      .sort((a, b) => (a.day_change_percentage || 0) - (b.day_change_percentage || 0))
      .slice(0, 4)
  }, [indianStocks, usStocks])

  const mostBought = useMemo(() => {
    return [...indianStocks, ...usStocks]
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
      .slice(0, 8)
  }, [indianStocks, usStocks])

  const filteredStocks = useMemo(() => {
    let combined = [...indianStocks, ...usStocks]

    if (activeMarket !== 'ALL') {
      combined = combined.filter(s => s.market === activeMarket)
    }

    if (searchQuery) {
      combined = combined.filter(s => 
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    return combined.sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
  }, [indianStocks, usStocks, searchQuery, activeMarket])

  if (!mounted) return null

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1]
      }
    }
  }

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen bg-transparent text-white font-sans selection:bg-emerald-500/30 pt-[100px] pb-20 px-8 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="mb-10">
        <h1 className="font-headline font-black text-4xl tracking-tighter text-white uppercase mb-8">Explore <span className="text-emerald-500">Markets</span></h1>

        {/* Indices Bar */}
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4">
          {indices.map((idx, i) => (
            <motion.div 
              key={idx.symbol}
              variants={{
                hidden: { opacity: 0, scale: 0.9, x: -20 },
                visible: { 
                  opacity: 1, 
                  scale: 1, 
                  x: 0,
                  transition: { delay: 0.3 + (i * 0.1), duration: 0.8, ease: "circOut" }
                }
              }}
              whileHover={{ y: -4, border: '1px solid rgba(16,185,129,0.3)' }}
              className="min-w-[240px] p-5 rounded-2xl border border-white/10 bg-[#0d1117] flex flex-col gap-2 cursor-pointer transition-all group shadow-xl"
            >
              <div className="flex justify-between items-center">
                <span className="font-terminal-label text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300">{idx.symbol}</span>
                <div className={cn("size-2 rounded-full", idx.isUp ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-red-500")} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-black text-xl tracking-tighter text-white">
                  {idx.market === 'US' ? '$' : '₹'}{idx.price.toLocaleString(idx.market === 'US' ? 'en-US' : 'en-IN')}
                </span>
                <span className={cn("text-[10px] font-bold", idx.isUp ? "text-emerald-500" : "text-red-500")}>
                  {idx.isUp ? '+' : ''}{idx.change}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-12">
        <div className="space-y-12">
          {/* Most Bought Section */}
          <motion.section variants={itemVariants}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-headline font-black text-xs uppercase tracking-[0.4em] text-emerald-500/60 font-bold">Most Bought on StockOS</h2>
              <button className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">View All</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {mostBought.slice(0, 4).map((stock, i) => (
                <motion.div
                  key={stock.symbol}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { 
                      opacity: 1, 
                      y: 0,
                      transition: { delay: 0.5 + (i * 0.1), duration: 0.8, ease: [0.16, 1, 0.3, 1] }
                    }
                  }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  onClick={() => router.push(stock.region === 'US' ? `/us-stocks/${stock.symbol}` : `/stocks/${stock.symbol}`)}
                  className="p-5 rounded-2xl border border-white/10 bg-[#0d1117] hover:bg-emerald-500/[0.05] hover:border-emerald-500/30 transition-all cursor-pointer group shadow-xl"
                >
                  <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-zinc-500 group-hover:text-white mb-4">
                    {stock.symbol[0]}
                  </div>
                  <div className="font-headline font-black text-base text-white mb-1 group-hover:text-emerald-400 transition-colors">{stock.symbol}</div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 truncate">{stock.name}</div>
                  <div className="flex justify-between items-end">
                    <span className="font-mono font-black text-sm text-white">
                      {stock.region === 'US' ? '$' : '₹'}{stock.current_price?.toLocaleString()}
                    </span>
                    <span className={cn("text-[10px] font-black tabular-nums", stock.day_change_percentage >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {stock.day_change_percentage >= 0 ? '+' : ''}{stock.day_change_percentage?.toFixed(2)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Market Movers: Gainers & Losers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.section variants={itemVariants}>
              <h2 className="font-headline font-black text-xs uppercase tracking-[0.4em] text-emerald-400 mb-6 flex items-center gap-3 font-bold drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Top Gainers
              </h2>
              <div className="space-y-4">
                {topGainers.map((stock, i) => (
                  <motion.div 
                    key={stock.symbol}
                    variants={{
                      hidden: { opacity: 0, x: -20 },
                      visible: { 
                        opacity: 1, 
                        x: 0,
                        transition: { delay: 0.6 + (i * 0.1), duration: 0.5 }
                      }
                    }}
                    whileHover={{ scale: 1.02, y: -2 }}
                    onClick={() => router.push(stock.region === 'US' ? `/us-stocks/${stock.symbol}` : `/stocks/${stock.symbol}`)}
                    className="flex items-center justify-between p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-500/[0.03] to-emerald-500/[0.01] hover:from-emerald-500/[0.07] hover:to-emerald-500/[0.02] hover:border-emerald-500/30 hover:shadow-[0_8px_32px_rgba(16,185,129,0.12)] transition-all duration-300 cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.01] to-transparent pointer-events-none" />
                    
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="size-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-headline font-black text-lg group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 transition-all duration-300">
                        {stock.symbol[0]}
                      </div>
                      <div>
                        <div className="font-headline font-black text-sm text-white group-hover:text-emerald-400 transition-colors duration-300 flex items-center gap-2">
                          {stock.symbol}
                          <span className="text-[7px] font-terminal-label font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/5 border border-white/5 text-zinc-500 group-hover:text-emerald-400/70 group-hover:border-emerald-500/20 transition-colors">
                            {stock.region === 'US' ? 'US' : 'IN'}
                          </span>
                        </div>
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest truncate max-w-[150px]">{stock.name}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 relative z-10">
                      {/* Animated SVG Sparkline */}
                      <div className="hidden sm:block">
                        <svg className="w-14 h-6 text-emerald-500/40 group-hover:text-emerald-400 transition-colors duration-300" viewBox="0 0 50 20">
                          <path d="M0,16 Q15,4 25,12 T50,2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          <circle cx="50" cy="2" r="2" fill="currentColor" className="animate-pulse" />
                        </svg>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-black text-sm text-white group-hover:scale-105 transition-transform duration-300 origin-right">
                          {stock.market === 'US' ? '$' : '₹'}{stock.current_price?.toLocaleString(stock.market === 'US' ? 'en-US' : 'en-IN')}
                        </div>
                        <div className="text-[11px] font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)] flex items-center gap-0.5 justify-end">
                          <ArrowUpRight className="size-3" />
                          +{stock.day_change_percentage?.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <motion.section variants={itemVariants}>
              <h2 className="font-headline font-black text-xs uppercase tracking-[0.4em] text-rose-400 mb-6 flex items-center gap-3 font-bold drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]">
                <TrendingDown className="w-4 h-4 text-rose-400" /> Top Losers
              </h2>
              <div className="space-y-4">
                {topLosers.map((stock, i) => (
                  <motion.div 
                    key={stock.symbol}
                    variants={{
                      hidden: { opacity: 0, x: 20 },
                      visible: { 
                        opacity: 1, 
                        x: 0,
                        transition: { delay: 0.6 + (i * 0.1), duration: 0.5 }
                      }
                    }}
                    whileHover={{ scale: 1.02, y: -2 }}
                    onClick={() => router.push(stock.region === 'US' ? `/us-stocks/${stock.symbol}` : `/stocks/${stock.symbol}`)}
                    className="flex items-center justify-between p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-rose-500/[0.03] to-rose-500/[0.01] hover:from-rose-500/[0.07] hover:to-rose-500/[0.02] hover:border-rose-500/30 hover:shadow-[0_8px_32px_rgba(244,63,94,0.12)] transition-all duration-300 cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-rose-500/[0.01] to-transparent pointer-events-none" />

                    <div className="flex items-center gap-4 relative z-10">
                      <div className="size-11 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-headline font-black text-lg group-hover:scale-110 group-hover:bg-rose-500/20 group-hover:border-rose-500/30 transition-all duration-300">
                        {stock.symbol[0]}
                      </div>
                      <div>
                        <div className="font-headline font-black text-sm text-white group-hover:text-rose-400 transition-colors duration-300 flex items-center gap-2">
                          {stock.symbol}
                          <span className="text-[7px] font-terminal-label font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/5 border border-white/5 text-zinc-500 group-hover:text-rose-400/70 group-hover:border-rose-500/20 transition-colors">
                            {stock.region === 'US' ? 'US' : 'IN'}
                          </span>
                        </div>
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest truncate max-w-[150px]">{stock.name}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 relative z-10">
                      {/* Animated SVG Sparkline */}
                      <div className="hidden sm:block">
                        <svg className="w-14 h-6 text-rose-500/40 group-hover:text-rose-400 transition-colors duration-300" viewBox="0 0 50 20">
                          <path d="M0,4 Q15,16 25,8 T50,18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          <circle cx="50" cy="18" r="2" fill="currentColor" className="animate-pulse" />
                        </svg>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-black text-sm text-white group-hover:scale-105 transition-transform duration-300 origin-right">
                          {stock.market === 'US' ? '$' : '₹'}{stock.current_price?.toLocaleString(stock.market === 'US' ? 'en-US' : 'en-IN')}
                        </div>
                        <div className="text-[11px] font-black text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)] flex items-center gap-0.5 justify-end">
                          <ArrowDownRight className="size-3" />
                          {stock.day_change_percentage?.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          </div>
        </div>

        {/* Sidebar: Categories & Tools */}
        <aside className="space-y-12">
          <motion.section variants={itemVariants}>
            <h2 className="font-headline font-black text-xs uppercase tracking-[0.4em] text-zinc-500 mb-6 font-bold">Stocks by Sector</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'Energy', icon: Activity, color: 'text-amber-500' },
                { name: 'Banking', icon: Database, color: 'text-blue-500' },
                { name: 'Tech', icon: Cpu, color: 'text-purple-500' },
                { name: 'Auto', icon: Car, color: 'text-rose-500' },
                { name: 'Pharma', icon: Activity, color: 'text-emerald-500' },
                { name: 'FMCG', icon: Filter, color: 'text-orange-500' },
              ].map((sector, i) => (
                <motion.button
                  key={sector.name}
                  variants={{
                    hidden: { opacity: 0, scale: 0.9 },
                    visible: { 
                      opacity: 1, 
                      scale: 1,
                      transition: { delay: 0.8 + (i * 0.05) }
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-[#0d1117] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all group shadow-lg"
                >
                  <sector.icon className={cn("w-6 h-6 opacity-40 group-hover:opacity-100 transition-all", sector.color)} />
                  <span className="font-terminal-label text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-white">{sector.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.section>

          <motion.section variants={itemVariants}>
            <h2 className="font-headline font-black text-xs uppercase tracking-[0.4em] text-zinc-500 mb-6 font-bold">Market Tools</h2>
            <div className="space-y-3">
              {[
                { name: 'F&O Trading', desc: 'Future & Options', icon: BarChart3 },
                { name: 'IPO Center', desc: 'New Listings', icon: Sparkles },
                { name: 'Screener', desc: 'Custom Filters', icon: Filter },
              ].map((tool, i) => (
                <motion.button
                  key={tool.name}
                  variants={{
                    hidden: { opacity: 0, x: 20 },
                    visible: { 
                      opacity: 1, 
                      x: 0,
                      transition: { delay: 1 + (i * 0.1) }
                    }
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#0d1117] border border-white/10 hover:border-emerald-500/20 transition-all group shadow-lg"
                >
                  <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <tool.icon className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <div className="font-headline font-black text-xs text-white uppercase tracking-wider">{tool.name}</div>
                    <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em]">{tool.desc}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.section>
        </aside>
      </div>
    </motion.div>
  )
}
