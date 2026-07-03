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
  Filter,
  BarChart3,
  TrendingDown,
  ChevronRight,
  Sparkles,
  Cpu,
  Car,
  X,
  Loader2,
  Coins,
  ChevronLeft,
  ChevronDown
} from "lucide-react"
import { supabase } from "@/services/DatabaseClient"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { AssetLogo } from "@/components/shared/AssetLogo"
import { getMarketStatus } from "@/constants/market-constants"

const getSectorStyle = (sector: string) => {
  const s = sector ? sector.toUpperCase() : ''
  if (s.includes('TECH')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  if (s.includes('FINAN') || s.includes('BANK')) return 'bg-blue-500/10 text-blue-450 border-blue-500/20'
  if (s.includes('HEALTH') || s.includes('PHARMA')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (s.includes('CYCLICAL') || s.includes('CONSUMER CYCLICAL')) return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  if (s.includes('DEFENSIVE') || s.includes('CONSUMER DEFENSIVE')) return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  if (s.includes('ENERGY') || s.includes('OIL') || s.includes('POWER')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  if (s.includes('INDUST') || s.includes('METAL') || s.includes('BASIC')) return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
  if (s.includes('COMMUN')) return 'bg-teal-500/10 text-teal-400 border-teal-500/20'
  if (s.includes('REAL ESTATE') || s.includes('PROP')) return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
  if (s.includes('UTILIT')) return 'bg-yellow-500/10 text-yellow-450 border-yellow-500/20'
  return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

export default function StocksPage() {
  const [mounted, setMounted] = useState(false)
  const [indianStocks, setIndianStocks] = useState<any[]>([])
  const [usStocks, setUsStocks] = useState<any[]>([])
  const [extraAssets, setExtraAssets] = useState<any[]>([])
  const [indices, setIndices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [activeMarket, setActiveMarket] = useState<'ALL' | 'IN' | 'US'>('ALL')
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [totalIndianCount, setTotalIndianCount] = useState(0)
  const [totalUsCount, setTotalUsCount] = useState(0)
  
  // Sorting State
  type SortOption = 
    | 'cap_desc' 
    | 'cap_asc' 
    | 'name_asc' 
    | 'name_desc' 
    | 'price_asc' 
    | 'price_desc' 
    | 'pe_desc' 
    | 'pe_asc' 
    | 'change_desc' 
    | 'change_asc'
  const [sortBy, setSortBy] = useState<SortOption>('cap_desc')
  const [activeSymbols, setActiveSymbols] = useState<Set<string>>(new Set())
  
  // Pagination State
  const [pageSize, setPageSize] = useState(12)

  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    fetchStocks(false)

    // Set up hourly background refresh for top movers & list data
    const interval = setInterval(() => {
      fetchStocks(true)
    }, 3600000) // 1 hour

    return () => clearInterval(interval)
  }, [])

  // Realtime subscription for Indian Active Stocks
  useEffect(() => {
    if (!mounted || activeSymbols.size === 0) return

    const channelId = `explore-in-pulse-${Date.now()}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'market_assets'
        },
        (payload) => {
          const newAsset = payload.new as any
          if (!newAsset || !newAsset.symbol) return
          const upperSym = newAsset.symbol.toUpperCase().trim()

          // Realtime updates only apply if the market is open and the stock is active
          const isMarketOpen = getMarketStatus('IN') === 'OPEN'
          const isActive = activeSymbols.has(upperSym)

          if (isMarketOpen && isActive) {
            setIndianStocks(prev => prev.map(stock => 
              stock.symbol === newAsset.symbol 
                ? { ...stock, ...newAsset } 
                : stock
            ))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mounted, activeSymbols])

  // Realtime subscription for US Active Stocks
  useEffect(() => {
    if (!mounted || activeSymbols.size === 0) return

    const channelId = `explore-us-pulse-${Date.now()}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'us_market_assets'
        },
        (payload) => {
          const newAsset = payload.new as any
          if (!newAsset || !newAsset.symbol) return
          const upperSym = newAsset.symbol.toUpperCase().trim()

          // Realtime updates only apply if the market is open and the stock is active
          const isMarketOpen = getMarketStatus('US') === 'OPEN'
          const isActive = activeSymbols.has(upperSym)

          if (isMarketOpen && isActive) {
            setUsStocks(prev => prev.map(stock => 
              stock.symbol === newAsset.symbol 
                ? { ...stock, ...newAsset } 
                : stock
            ))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mounted, activeSymbols])

  // Debounce search query to prevent constant DB requests
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery])

  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      searchExtraAssets(debouncedQuery.trim())
    } else {
      setExtraAssets([])
    }
  }, [debouncedQuery])

  const fetchStocks = async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    try {
      // 1. Fetch exact total counts, indices, and active symbols first
      const [
        { count: inCount },
        { count: usCount },
        { data: inIndices },
        { data: usIndices },
        { data: activeData }
      ] = await Promise.all([
        supabase.from('market_assets').select('*', { count: 'exact', head: true }).not('market_cap', 'is', null),
        supabase.from('us_market_assets').select('*', { count: 'exact', head: true }).not('market_cap', 'is', null),
        supabase.from('market_assets').select('*').in('symbol', ['^NSEI', '^BSESN']),
        supabase.from('us_market_assets').select('*').in('symbol', ['^DJI', '^GSPC', '^IXIC']),
        supabase.from('active_market_symbols').select('symbol')
      ])

      if (activeData) {
        setActiveSymbols(new Set(activeData.map(item => item.symbol.toUpperCase().trim())))
      }

      const totalIN = inCount || 0
      const totalUS = usCount || 0
      setTotalIndianCount(totalIN)
      setTotalUsCount(totalUS)

      // 2. Build the concurrent range batch promises list
      const inBatches = Math.ceil(totalIN / 1000)
      const usBatches = Math.ceil(totalUS / 1000)

      const inPromises = Array.from({ length: inBatches }, (_, i) =>
        supabase.from('market_assets')
          .select('*')
          .not('market_cap', 'is', null)
          .order('market_cap', { ascending: false })
          .range(i * 1000, (i + 1) * 1000 - 1)
      )

      const usPromises = Array.from({ length: usBatches }, (_, i) =>
        supabase.from('us_market_assets')
          .select('*')
          .not('market_cap', 'is', null)
          .order('market_cap', { ascending: false })
          .range(i * 1000, (i + 1) * 1000 - 1)
      )

      // 3. Resolve all promises in parallel
      const [inResults, usResults] = await Promise.all([
        Promise.all(inPromises),
        Promise.all(usPromises)
      ])

      // 4. Merge results
      const allIN: any[] = []
      inResults.forEach(res => {
        if (res.data) allIN.push(...res.data)
      })

      const allUS: any[] = []
      usResults.forEach(res => {
        if (res.data) allUS.push(...res.data)
      })

      const isIndex = (symbol: string) => 
        !symbol ||
        symbol.startsWith('^') || 
        ['DJI', 'SPX', 'IXIC', 'GSPC', 'NSEI', 'BSESN', 'NSEBANK', 'BANKNIFTY', 'NIFTY', 'SENSEX'].includes(symbol.toUpperCase().trim())

      const indianWithMarket = allIN
        .filter(s => s.symbol && !isIndex(s.symbol))
        .map(s => ({ ...s, market: 'IN' as const, region: 'IN' as const }))
        
      const usWithMarket = allUS
        .filter(s => s.symbol && !isIndex(s.symbol))
        .map(s => ({ ...s, market: 'US' as const, region: 'US' as const }))

      setIndianStocks(indianWithMarket)
      setUsStocks(usWithMarket)

      // Dynamic indices with robust fallback to prevent $0.00 displays
      const defaultIndices = [
        { symbol: 'NIFTY 50', dbSymbol: '^NSEI', name: 'NSE Index', price: 24175.70, change: 0.71, isUp: true, market: 'IN' },
        { symbol: 'SENSEX', dbSymbol: '^BSESN', name: 'BSE Index', price: 77502.12, change: 0.75, isUp: true, market: 'IN' },
        { symbol: 'NASDAQ 100', dbSymbol: '^IXIC', name: 'US Tech Index', price: 19935.40, change: 1.20, isUp: true, market: 'US' },
        { symbol: 'S&P 500', dbSymbol: '^GSPC', name: 'US Index', price: 5473.23, change: 0.77, isUp: true, market: 'US' },
        { symbol: 'DOW JONES', dbSymbol: '^DJI', name: 'US Dow Index', price: 39150.30, change: 0.15, isUp: true, market: 'US' }
      ]

      const dbIndices: any[] = []
      const symbolMap: Record<string, { label: string; name: string; market: string }> = {
        '^NSEI': { label: 'NIFTY 50', name: 'NSE Index', market: 'IN' },
        '^BSESN': { label: 'SENSEX', name: 'BSE Index', market: 'IN' },
        '^IXIC': { label: 'NASDAQ 100', name: 'US Tech Index', market: 'US' },
        '^GSPC': { label: 'S&P 500', name: 'US Index', market: 'US' },
        '^DJI': { label: 'DOW JONES', name: 'US Dow Index', market: 'US' }
      }

      const allFetchedIndices = [...(inIndices || []), ...(usIndices || [])]
      allFetchedIndices.forEach(item => {
        const mapping = symbolMap[item.symbol]
        if (mapping) {
          const price = item.current_price || item.price || 0
          if (price > 0) {
            dbIndices.push({
              symbol: mapping.label,
              dbSymbol: item.symbol,
              name: mapping.name,
              price: price,
              change: item.day_change_percentage || 0,
              isUp: (item.day_change_percentage || 0) >= 0,
              market: mapping.market
            })
          }
        }
      })

      // Merge fetched indices with defaults to ensure no 0.00 values
      const mergedIndices = defaultIndices.map(def => {
        const dbMatch = dbIndices.find(db => db.symbol === def.symbol)
        return dbMatch ? dbMatch : def
      })

      setIndices(mergedIndices)
    } catch (err) {
      console.error("Failed to fetch stocks:", err)
    } finally {
      if (!isBackground) setLoading(false)
    }
  }

  // Fetch extra matching stocks from the DB if the query is not in top 200
  const searchExtraAssets = async (query: string) => {
    try {
      const [{ data: inData }, { data: usData }] = await Promise.all([
        supabase.from('market_assets')
          .select('*')
          .not('symbol', 'ilike', '^%')
          .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(40),
        supabase.from('us_market_assets')
          .select('*')
          .not('symbol', 'ilike', '^%')
          .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(40)
      ])

      const inMapped = (inData || []).map(s => ({ ...s, market: 'IN' as const, region: 'IN' as const }))
      const usMapped = (usData || []).map(s => ({ ...s, market: 'US' as const, region: 'US' as const }))
      
      setExtraAssets([...inMapped, ...usMapped])
    } catch (err) {
      console.error("Failed to search extra assets:", err)
    }
  }

  // Segregated movers by market region
  const indianGainers = useMemo(() => {
    return indianStocks
      .filter(s => (s.day_change_percentage || 0) > 0)
      .sort((a, b) => (b.day_change_percentage || 0) - (a.day_change_percentage || 0))
      .slice(0, 3)
  }, [indianStocks])

  const indianLosers = useMemo(() => {
    return indianStocks
      .filter(s => (s.day_change_percentage || 0) < 0)
      .sort((a, b) => (a.day_change_percentage || 0) - (b.day_change_percentage || 0))
      .slice(0, 3)
  }, [indianStocks])

  const usGainers = useMemo(() => {
    return usStocks
      .filter(s => (s.day_change_percentage || 0) > 0)
      .sort((a, b) => (b.day_change_percentage || 0) - (a.day_change_percentage || 0))
      .slice(0, 3)
  }, [usStocks])

  const usLosers = useMemo(() => {
    return usStocks
      .filter(s => (s.day_change_percentage || 0) < 0)
      .sort((a, b) => (a.day_change_percentage || 0) - (b.day_change_percentage || 0))
      .slice(0, 3)
  }, [usStocks])

  const filteredStocks = useMemo(() => {
    const isIndex = (symbol: string) => 
      !symbol ||
      symbol.startsWith('^') || 
      ['DJI', 'SPX', 'IXIC', 'GSPC', 'NSEI', 'BSESN', 'NSEBANK', 'BANKNIFTY', 'NIFTY', 'SENSEX'].includes(symbol.toUpperCase().trim())

    const baseList = [...indianStocks, ...usStocks].filter(s => s.symbol && !isIndex(s.symbol))
    const seen = new Set(baseList.map(s => `${s.market}-${s.symbol}`))
    
    // Merge base top list with extra assets from dynamic search
    const combinedList = [...baseList]
    extraAssets.forEach(asset => {
      if (asset.symbol && isIndex(asset.symbol)) return
      const key = `${asset.market}-${asset.symbol}`
      if (!seen.has(key)) {
        combinedList.push(asset)
        seen.add(key)
      }
    })

    let combined = combinedList

    if (activeMarket !== 'ALL') {
      combined = combined.filter(s => s.market === activeMarket)
    }

    if (selectedSector) {
      combined = combined.filter(s => s.sector === selectedSector)
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      combined = combined.filter(s =>
        (s.symbol && s.symbol.toLowerCase().includes(q)) ||
        (s.name && s.name.toLowerCase().includes(q))
      )
    }

    return combined.sort((a, b) => {
      if (sortBy === 'cap_desc') {
        return (b.market_cap || 0) - (a.market_cap || 0)
      }
      if (sortBy === 'cap_asc') {
        const capA = a.market_cap === null || a.market_cap === undefined ? Infinity : a.market_cap
        const capB = b.market_cap === null || b.market_cap === undefined ? Infinity : b.market_cap
        return capA - capB
      }
      if (sortBy === 'name_asc') {
        const nameA = a.name || a.symbol || ''
        const nameB = b.name || b.symbol || ''
        return nameA.localeCompare(nameB)
      }
      if (sortBy === 'name_desc') {
        const nameA = a.name || a.symbol || ''
        const nameB = b.name || b.symbol || ''
        return nameB.localeCompare(nameA)
      }
      if (sortBy === 'price_asc') {
        const priceA = a.market === 'US' ? (a.current_price || 0) * 83.5 : (a.current_price || 0)
        const priceB = b.market === 'US' ? (b.current_price || 0) * 83.5 : (b.current_price || 0)
        return priceA - priceB
      }
      if (sortBy === 'price_desc') {
        const priceA = a.market === 'US' ? (a.current_price || 0) * 83.5 : (a.current_price || 0)
        const priceB = b.market === 'US' ? (b.current_price || 0) * 83.5 : (b.current_price || 0)
        return priceB - priceA
      }
      if (sortBy === 'pe_desc') {
        const peA = a.pe_ratio === null || a.pe_ratio === undefined ? -Infinity : a.pe_ratio
        const peB = b.pe_ratio === null || b.pe_ratio === undefined ? -Infinity : b.pe_ratio
        return peB - peA
      }
      if (sortBy === 'pe_asc') {
        const peA = a.pe_ratio === null || a.pe_ratio === undefined ? Infinity : a.pe_ratio
        const peB = b.pe_ratio === null || b.pe_ratio === undefined ? Infinity : b.pe_ratio
        return peA - peB
      }
      if (sortBy === 'change_desc') {
        return (b.day_change_percentage || 0) - (a.day_change_percentage || 0)
      }
      if (sortBy === 'change_asc') {
        return (a.day_change_percentage || 0) - (b.day_change_percentage || 0)
      }
      return 0
    })
  }, [indianStocks, usStocks, extraAssets, searchQuery, activeMarket, selectedSector, sortBy])

  // Paginated display subset
  const visibleStocks = useMemo(() => {
    return filteredStocks.slice(0, pageSize)
  }, [filteredStocks, pageSize])

  // Reset pagination when filter parameters change
  useEffect(() => {
    setPageSize(12)
  }, [searchQuery, activeMarket, selectedSector])

  if (!mounted) return null

  // Sectors mapping
  const SECTORS = [
    { name: 'Technology', icon: Cpu, color: 'text-purple-400 border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/[0.03]' },
    { name: 'Financial Services', icon: Database, color: 'text-blue-400 border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/[0.03]' },
    { name: 'Healthcare', icon: Activity, color: 'text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03]' },
    { name: 'Consumer Cyclical', icon: Car, color: 'text-rose-400 border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/[0.03]' },
    { name: 'Consumer Defensive', icon: Filter, color: 'text-orange-400 border-orange-500/20 hover:border-orange-500/40 hover:bg-orange-500/[0.03]' },
    { name: 'Energy', icon: Coins, color: 'text-amber-400 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/[0.03]' }
  ]

  const formatMarketCap = (cap: number, region: 'IN' | 'US') => {
    if (!cap) return 'N/A'
    if (region === 'US') {
      if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`
      if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`
      return `$${(cap / 1e6).toFixed(2)}M`
    } else {
      const cr = cap / 1e7
      if (cr >= 100000) return `₹${(cr / 100000).toFixed(2)}L Cr`
      return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1]
      }
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen bg-transparent text-white font-sans selection:bg-emerald-500/30 pt-20 pb-24 px-4 md:px-8 max-w-[1400px] mx-auto overflow-x-hidden"
    >
      {/* Header Title Section */}
      <motion.div variants={itemVariants} className="mb-8">
        <h1 className="font-headline font-black text-4xl md:text-6xl tracking-tight uppercase drop-shadow-[0_0_30px_rgba(52,211,153,0.25)]">
          <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-450 bg-clip-text text-transparent font-black">Explore</span>{' '}
          <span className="bg-gradient-to-r from-emerald-450 via-teal-400 to-cyan-455 bg-clip-text text-transparent font-black">Markets</span>
        </h1>
        <p className="text-zinc-550 text-[10px] md:text-xs font-bold uppercase tracking-[0.35em] mt-3 font-mono">
          Institutional asset intelligence & discovery terminal
        </p>
      </motion.div>

      {/* Dynamic Global Indices ticker slider */}
      <motion.div variants={itemVariants} className="mb-8 w-full">
        <div className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto lg:overflow-x-visible no-scrollbar pb-3 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 mask-fade-edges lg:mask-none w-full">
          {indices.map((idx) => (
            <motion.div
              key={idx.symbol}
              whileHover={{ y: -3, borderColor: 'rgba(16,185,129,0.45)', boxShadow: '0 12px 35px rgba(0,0,0,0.55)' }}
              onClick={() => {
                const routeSymbol = idx.dbSymbol ? idx.dbSymbol.replace('^', '') : idx.symbol;
                router.push(idx.market === 'US' ? `/us-stocks/${routeSymbol}` : `/stocks/${routeSymbol}`);
              }}
              className="min-w-[220px] lg:min-w-0 lg:w-full p-5 rounded-2xl border border-white/[0.08] bg-[#0c0f16]/95 backdrop-blur-md flex flex-col gap-3.5 cursor-pointer transition-all group shadow-xl"
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-200">
                  {idx.symbol}
                </span>
                <span className={cn("text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border", idx.market === 'US' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20")}>
                  {idx.market}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono font-black text-lg tracking-tighter text-white">
                  {idx.market === 'US' ? '$' : '₹'}{idx.price.toLocaleString(idx.market === 'US' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={cn("text-[11px] font-black flex items-center gap-0.5", idx.isUp ? "text-emerald-400" : "text-rose-400")}>
                  {idx.isUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {idx.isUp ? '+' : ''}{idx.change.toFixed(2)}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Main content split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8 items-start">
        
        {/* Left Side: Search, Filters & Browse List */}
        <div className="space-y-8">
          {/* Controls Bar: Market Selector & Sector Chips inline */}
          <motion.div 
            variants={itemVariants} 
            className="flex flex-col md:flex-row md:items-center justify-start gap-6 p-3 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#0f131a] to-[#080a0f] shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] w-full"
          >
            {/* Region Segment Tabs */}
            <div className="flex bg-[#040508]/80 border border-white/[0.06] rounded-full p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] min-w-[290px] flex-shrink-0">
              {(['ALL', 'IN', 'US'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveMarket(tab)}
                  className={cn(
                    "flex-1 py-1.5 px-3 text-[11px] font-black uppercase tracking-wider rounded-full transition-all duration-300 border border-transparent",
                    activeMarket === tab
                      ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-400 border-emerald-500/20 shadow-sm"
                      : "text-zinc-550 hover:text-zinc-350"
                  )}
                >
                  {tab === 'ALL' ? 'All Markets' : tab === 'IN' ? 'India (IN)' : 'US Stocks'}
                </button>
              ))}
            </div>

            {/* Sector interactive scrollable chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 flex-grow min-w-0 justify-start">
              <button
                onClick={() => setSelectedSector(null)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border duration-300 whitespace-nowrap",
                  selectedSector === null
                    ? "bg-zinc-800/40 text-white border-white/10 shadow-sm"
                    : "bg-white/[0.01] text-zinc-500 border-white/[0.04] hover:text-zinc-350 hover:border-white/10 hover:bg-white/[0.03]"
                )}
              >
                <Filter className="size-3.5" />
                All Sectors
              </button>
              {SECTORS.map((sec) => {
                const isActive = selectedSector === sec.name
                return (
                  <button
                    key={sec.name}
                    onClick={() => setSelectedSector(isActive ? null : sec.name)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border duration-300 whitespace-nowrap",
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                        : sec.color
                    )}
                  >
                    <sec.icon className="size-3.5" />
                    {sec.name}
                  </button>
                )
              })}
            </div>
          </motion.div>

          {/* Directory Browse Section */}
          <motion.section variants={itemVariants} className="space-y-6">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-baseline gap-3">
                <h3 className="font-headline font-black text-sm uppercase tracking-[0.25em] text-zinc-400 font-bold">
                  Browse Assets
                </h3>
                <span className="text-[11px] font-mono font-bold text-zinc-550">
                  ({filteredStocks.length} matching)
                </span>
              </div>

              {/* Premium Sort Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-wider font-mono hidden sm:inline">Sort By</span>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="appearance-none bg-[#0c0f16]/90 border border-white/[0.08] hover:border-emerald-500/35 text-zinc-300 text-[10px] font-black uppercase tracking-wider pl-4 pr-9 py-2 rounded-full outline-none transition-all cursor-pointer shadow-sm select-none"
                  >
                    <option value="name_asc">Name: A-Z</option>
                    <option value="name_desc">Name: Z-A</option>
                    <option value="price_desc">Price: High-Low</option>
                    <option value="price_asc">Price: Low-High</option>
                    <option value="change_desc">Performance: Gainers</option>
                    <option value="change_asc">Performance: Losers</option>
                    <option value="cap_desc">Mkt Cap: High-Low</option>
                    <option value="cap_asc">Mkt Cap: Low-High</option>
                    <option value="pe_desc">P/E Ratio: High-Low</option>
                    <option value="pe_asc">P/E Ratio: Low-High</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-3 text-zinc-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {loading ? (
              /* Skeletal Loaders */
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-20 w-full bg-white/[0.02] border border-white/[0.08] rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : filteredStocks.length === 0 ? (
              /* No Results State */
              <div className="flex flex-col items-center justify-center p-14 text-center border border-white/[0.08] bg-[#0c0f16]/45 rounded-3xl">
                <Search className="size-10 text-zinc-700 mb-4 animate-pulse" />
                <h4 className="text-zinc-400 font-bold font-headline text-base uppercase tracking-wider">No matching assets</h4>
                <p className="text-zinc-650 text-xs max-w-[320px] mt-2 leading-relaxed">
                  Try refining your search text, market region, or selected sector filters.
                </p>
              </div>
            ) : (
              /* Main Assets Directory List - Styled as premium card rows */
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {visibleStocks.map((stock) => {
                    const isUp = (stock.day_change_percentage || 0) >= 0
                    return (
                      <motion.div
                        key={`${stock.market}-${stock.symbol}`}
                        layoutId={`${stock.market}-${stock.symbol}`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        whileHover={{ y: -3, borderColor: isUp ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)', backgroundColor: 'rgba(255,255,255,0.025)' }}
                        onClick={() => router.push(stock.region === 'US' ? `/us-stocks/${stock.symbol}` : `/stocks/${stock.symbol}`)}
                        className="flex items-center justify-between py-4 px-6 rounded-2xl border border-white/[0.08] bg-[#0c0f16]/95 hover:shadow-2xl transition-all duration-300 cursor-pointer group shadow-lg"
                      >
                        <div className="flex items-center gap-4 min-w-0 w-full md:w-[320px] flex-shrink-0">
                          <AssetLogo
                            symbol={stock.symbol}
                            name={stock.name}
                            size="lg"
                            className="border border-white/10 group-hover:scale-105 transition-transform"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-headline font-black text-base text-white group-hover:text-emerald-400 transition-colors">
                                {stock.symbol}
                              </span>
                              <span className={cn(
                                "text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border",
                                stock.region === 'US' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              )}>
                                {stock.region === 'US' ? 'US' : 'IN'}
                              </span>
                              {stock.sector && (
                                <span className={cn(
                                  "text-[8px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border",
                                  getSectorStyle(stock.sector)
                                )}>
                                  {stock.sector}
                                </span>
                              )}
                            </div>
                            <span className="text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest truncate block max-w-[200px] md:max-w-[320px] mt-1">
                              {stock.name}
                            </span>
                          </div>
                        </div>

                        {/* Middle Stats Columns - Aligning perfectly across rows */}
                        <div className="hidden md:flex items-center gap-12 text-left ml-6 mr-auto">
                          {/* Market Cap */}
                          <div className="min-w-[90px]">
                            <span className="text-[8.5px] font-mono font-bold text-zinc-500 uppercase tracking-widest block">Mkt Cap</span>
                            <span className="text-xs font-bold text-zinc-300 mt-0.5 block">
                              {formatMarketCap(stock.market_cap || 0, stock.region)}
                            </span>
                          </div>
                          
                          {/* P/E Ratio */}
                          <div className="min-w-[70px]">
                            <span className="text-[8.5px] font-mono font-bold text-zinc-500 uppercase tracking-widest block">P/E Ratio</span>
                            <span className="text-xs font-bold text-zinc-300 mt-0.5 block">
                              {stock.pe_ratio ? `${stock.pe_ratio.toFixed(1)}x` : 'N/A'}
                            </span>
                          </div>

                          {/* 52W High / Low */}
                          <div className="min-w-[150px] hidden lg:block">
                            <span className="text-[8.5px] font-mono font-bold text-zinc-500 uppercase tracking-widest block">52W Range</span>
                            <span className="text-xs font-bold text-zinc-300 mt-0.5 block">
                              {(stock.fifty_two_week_low && stock.fifty_two_week_high) 
                                ? `${stock.region === 'US' ? '$' : '₹'}${stock.fifty_two_week_low.toLocaleString()} — ${stock.region === 'US' ? '$' : '₹'}${stock.fifty_two_week_high.toLocaleString()}`
                                : 'N/A'
                              }
                            </span>
                          </div>
                        </div>

                        {/* Pricing block aligned right */}
                        <div className="text-right min-w-[100px] flex-shrink-0">
                          {stock.current_price ? (
                            <>
                              <div className="font-mono font-black text-base text-white">
                                {stock.region === 'US' ? '$' : '₹'}{stock.current_price.toLocaleString(stock.region === 'US' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}
                              </div>
                              <div className={cn("text-[11px] font-black flex items-center gap-0.5 justify-end mt-0.5", isUp ? "text-emerald-400" : "text-rose-400")}>
                                {isUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                                {isUp ? '+' : ''}{stock.day_change_percentage?.toFixed(2) ?? '0.00'}%
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-2 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 inline-block">
                              Unlisted
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>

                {/* Load More Button */}
                {filteredStocks.length > pageSize && (
                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.02)' }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setPageSize(p => p + 12)}
                    className="w-full py-4 text-[11px] font-black uppercase tracking-[0.25em] text-zinc-400 hover:text-emerald-400 border border-white/[0.08] bg-[#0c0f16]/60 rounded-2xl transition-all flex items-center justify-center gap-2 mt-6 shadow-md"
                  >
                    Load More Assets
                  </motion.button>
                )}
              </div>
            )}
          </motion.section>

        </div>

        {/* Right Side: Movers widgets */}
        <aside className="space-y-8">
             {/* India Market Movers */}
          <motion.section variants={itemVariants} className="p-6 rounded-3xl border border-white/[0.08] bg-[#0c0f16]/90 backdrop-blur-xl space-y-5 shadow-2xl">
            <h3 className="font-headline font-black text-xs uppercase tracking-[0.25em] text-emerald-400 flex items-center gap-2 font-bold">
              <Globe className="size-4 text-emerald-400" /> India Market Movers
            </h3>
            
            {/* Gainers */}
            <div className="space-y-3">
              <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest block font-mono">Top Gainers</span>
              {loading ? (
                <div className="h-16 w-full bg-white/[0.01] border border-white/[0.08] rounded-xl animate-pulse" />
              ) : indianGainers.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-zinc-650 border border-white/[0.05] rounded-xl">No positive movers</div>
              ) : indianGainers.map((stock) => (
                <div
                  key={`in-gainer-${stock.symbol}`}
                  onClick={() => router.push(`/stocks/${stock.symbol}`)}
                  className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/10 bg-[#04060a]/50 hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <AssetLogo symbol={stock.symbol} name={stock.name} className="size-10 border border-white/10" />
                    <div>
                      <div className="font-headline font-black text-sm text-white group-hover:text-emerald-400 transition-colors">
                        {stock.symbol}
                      </div>
                      <div className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider truncate max-w-[120px] mt-1">{stock.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-white">
                      ₹{stock.current_price?.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs font-black text-emerald-400 flex items-center gap-0.5 justify-end mt-1">
                      <ArrowUpRight className="size-3.5" />
                      +{stock.day_change_percentage?.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Losers */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest block font-mono">Top Losers</span>
              {loading ? (
                <div className="h-16 w-full bg-white/[0.01] border border-white/[0.08] rounded-xl animate-pulse" />
              ) : indianLosers.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-zinc-650 border border-white/[0.05] rounded-xl">No negative movers</div>
              ) : indianLosers.map((stock) => (
                <div
                  key={`in-loser-${stock.symbol}`}
                  onClick={() => router.push(`/stocks/${stock.symbol}`)}
                  className="flex items-center justify-between p-4 rounded-xl border border-rose-500/10 bg-[#04060a]/50 hover:border-rose-500/30 hover:bg-rose-500/[0.02] transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <AssetLogo symbol={stock.symbol} name={stock.name} className="size-10 border border-white/10" />
                    <div>
                      <div className="font-headline font-black text-sm text-white group-hover:text-rose-400 transition-colors">
                        {stock.symbol}
                      </div>
                      <div className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider truncate max-w-[120px] mt-1">{stock.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-white">
                      ₹{stock.current_price?.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs font-black text-rose-400 flex items-center gap-0.5 justify-end mt-1">
                      <ArrowDownRight className="size-3.5" />
                      {stock.day_change_percentage?.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* US Market Movers */}
          <motion.section variants={itemVariants} className="p-6 rounded-3xl border border-white/[0.08] bg-[#0c0f16]/90 backdrop-blur-xl space-y-5 shadow-2xl">
            <h3 className="font-headline font-black text-xs uppercase tracking-[0.25em] text-blue-400 flex items-center gap-2 font-bold">
              <Globe className="size-4 text-blue-400" /> US Market Movers
            </h3>
            
            {/* Gainers */}
            <div className="space-y-3">
              <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest block font-mono">Top Gainers</span>
              {loading ? (
                <div className="h-16 w-full bg-white/[0.01] border border-white/[0.08] rounded-xl animate-pulse" />
              ) : usGainers.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-zinc-650 border border-white/[0.05] rounded-xl">No positive movers</div>
              ) : usGainers.map((stock) => (
                <div
                  key={`us-gainer-${stock.symbol}`}
                  onClick={() => router.push(`/us-stocks/${stock.symbol}`)}
                  className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/10 bg-[#04060a]/50 hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <AssetLogo symbol={stock.symbol} name={stock.name} className="size-10 border border-white/10" />
                    <div>
                      <div className="font-headline font-black text-sm text-white group-hover:text-emerald-400 transition-colors">
                        {stock.symbol}
                      </div>
                      <div className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider truncate max-w-[120px] mt-1">{stock.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-white">
                      ${stock.current_price?.toLocaleString('en-US')}
                    </div>
                    <div className="text-xs font-black text-emerald-400 flex items-center gap-0.5 justify-end mt-1">
                      <ArrowUpRight className="size-3.5" />
                      +{stock.day_change_percentage?.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Losers */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <span className="text-[9.5px] font-bold text-zinc-555 uppercase tracking-widest block font-mono">Top Losers</span>
              {loading ? (
                <div className="h-16 w-full bg-white/[0.01] border border-white/[0.08] rounded-xl animate-pulse" />
              ) : usLosers.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-zinc-650 border border-white/[0.05] rounded-xl">No negative movers</div>
              ) : usLosers.map((stock) => (
                <div
                  key={`us-loser-${stock.symbol}`}
                  onClick={() => router.push(`/us-stocks/${stock.symbol}`)}
                  className="flex items-center justify-between p-4 rounded-xl border border-rose-500/10 bg-[#04060a]/50 hover:border-rose-500/30 hover:bg-rose-500/[0.02] transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <AssetLogo symbol={stock.symbol} name={stock.name} className="size-10 border border-white/10" />
                    <div>
                      <div className="font-headline font-black text-sm text-white group-hover:text-rose-400 transition-colors">
                        {stock.symbol}
                      </div>
                      <div className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider truncate max-w-[120px] mt-1">{stock.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-white">
                      ${stock.current_price?.toLocaleString('en-US')}
                    </div>
                    <div className="text-xs font-black text-rose-400 flex items-center gap-0.5 justify-end mt-1">
                      <ArrowDownRight className="size-3.5" />
                      {stock.day_change_percentage?.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Quick Stats Summary */}
          <motion.section
            variants={itemVariants}
            className="p-6 rounded-3xl border border-white/[0.08] bg-[#0c0f16]/95 backdrop-blur-md space-y-4 shadow-2xl"
          >
            <h4 className="font-headline font-black text-[10px] uppercase tracking-[0.3em] text-zinc-400 font-bold">
              Database Stats
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#04060a]/50 p-4 rounded-xl border border-white/[0.08] shadow-inner">
                <span className="text-[8px] font-mono text-zinc-555 uppercase tracking-wider block">India Assets</span>
                <span className="font-mono font-black text-lg text-emerald-450 tracking-tight block mt-1">
                  {loading ? '...' : totalIndianCount}
                </span>
              </div>
              <div className="bg-[#04060a]/50 p-4 rounded-xl border border-white/[0.08] shadow-inner">
                <span className="text-[8px] font-mono text-zinc-555 uppercase tracking-wider block">US Assets</span>
                <span className="font-mono font-black text-lg text-blue-400 tracking-tight block mt-1">
                  {loading ? '...' : totalUsCount}
                </span>
              </div>
            </div>
          </motion.section>

        </aside>

      </div>
    </motion.div>
  )
}
