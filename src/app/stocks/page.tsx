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
  Sparkles
} from "lucide-react"
import { supabase } from "@/services/DatabaseClient"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"

export default function StocksPage() {
  const [mounted, setMounted] = useState(false)
  const [indianStocks, setIndianStocks] = useState<any[]>([])
  const [usStocks, setUsStocks] = useState<any[]>([])
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
        supabase.from('market_assets').select('*').order('market_cap', { ascending: false }).limit(20),
        supabase.from('us_market_assets').select('*').order('market_cap', { ascending: false }).limit(20)
      ])

      setIndianStocks(inData || [])
      setUsStocks(usData || [])
    } catch (err) {
      console.error("Failed to fetch stocks:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredStocks = useMemo(() => {
    let combined = [
      ...indianStocks.map(s => ({ ...s, market: 'IN' as const })),
      ...usStocks.map(s => ({ ...s, market: 'US' as const }))
    ]

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

  const formatCurrency = (val: number, market: 'IN' | 'US') => {
    return new Intl.NumberFormat(market === 'US' ? 'en-US' : 'en-IN', {
      style: 'currency',
      currency: market === 'US' ? 'USD' : 'INR',
      maximumFractionDigits: market === 'US' ? 2 : 0
    }).format(val)
  }

  const formatCompact = (val: number) => {
    if (val >= 1e12) return (val / 1e12).toFixed(2) + 'T'
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B'
    if (val >= 1e7) return (val / 1e7).toFixed(2) + 'Cr'
    if (val >= 1e5) return (val / 1e5).toFixed(2) + 'L'
    return val.toLocaleString()
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-transparent text-white font-sans selection:bg-emerald-500/30 pt-[120px] pb-20 px-8 max-w-[1600px] mx-auto">
      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Globe className="w-5 h-5 text-emerald-500" />
          </div>
          <h2 className="font-headline font-black text-xs uppercase tracking-[0.3em] text-emerald-500/60">Global Market Explorer</h2>
        </div>
        <h1 className="font-headline font-black text-6xl md:text-7xl tracking-tighter text-white uppercase leading-none mb-6">
          Institutional <br /><span className="text-zinc-600">Intelligence</span>
        </h1>
        <p className="text-zinc-400 max-w-2xl text-lg font-medium leading-relaxed">
          Real-time access to the world's most critical assets. Cross-market data synchronized with institutional-grade precision.
        </p>
      </motion.div>

      {/* Control Bar */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col md:flex-row gap-6 mb-10 items-center justify-between"
      >
        <div className="flex gap-2 p-1 bg-white/[0.03] border border-white/5 rounded-2xl">
          {['ALL', 'IN', 'US'].map((m) => (
            <button
              key={m}
              onClick={() => setActiveMarket(m as any)}
              className={cn(
                "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeMarket === m 
                  ? "bg-white text-black shadow-[0_4px_15px_rgba(255,255,255,0.2)]" 
                  : "text-zinc-500 hover:text-white hover:bg-white/5"
              )}
            >
              {m === 'ALL' ? 'Global' : m === 'IN' ? 'NSE/BSE' : 'NASDAQ/NYSE'}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search Symbols or Companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-4 pl-12 pr-6 text-sm font-bold placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all"
          />
        </div>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-6 opacity-20">
            <Sparkles className="w-12 h-12 animate-pulse text-emerald-500" />
            <span className="font-headline font-black text-[10px] uppercase tracking-[0.5em]">Synchronizing Universal Assets...</span>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-panel border border-white/5 rounded-3xl overflow-hidden bg-white/[0.02] backdrop-blur-3xl"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Asset</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Market</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Price</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">24H Change</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Market Cap</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {filteredStocks.map((stock, idx) => (
                      <motion.tr 
                        key={stock.symbol}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className="group border-b border-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer"
                        onClick={() => {
                          const route = stock.market === 'US' ? `/us-stocks/${stock.symbol}` : `/stocks/${stock.symbol}`
                          router.push(route)
                        }}
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="size-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center font-black text-zinc-500 group-hover:border-white/10 group-hover:text-white transition-all">
                              {stock.symbol[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-headline font-black text-lg tracking-tight text-white">{stock.symbol}</span>
                                {idx < 3 && !searchQuery && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest">Top Asset</span>
                                )}
                              </div>
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest opacity-60 truncate w-48">{stock.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                            stock.market === 'US' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          )}>
                            {stock.market === 'US' ? 'NASDAQ/NYSE' : 'NSE/BSE'}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <span className="font-headline font-bold text-lg tabular-nums text-white">
                            {formatCurrency(stock.current_price, stock.market)}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className={cn(
                            "flex items-center gap-1.5 font-headline font-bold text-base tabular-nums",
                            stock.day_change_percentage >= 0 ? "text-emerald-500" : "text-red-500"
                          )}>
                            {stock.day_change_percentage >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {stock.day_change_percentage >= 0 ? "+" : ""}{stock.day_change_percentage?.toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="font-headline font-medium text-zinc-400 tabular-nums">
                            {stock.market === 'US' ? '$' : '₹'}{formatCompact(stock.market_cap || 0)}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <button className="p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white text-zinc-400 hover:text-black transition-all">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
