"use client"

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Terminal,
  Search,
  FileUp,
  User as UserIcon,
  Key,
  ShieldCheck,
  Newspaper,
  Cpu,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Activity,
  PieChart,
  Target,
  Zap,
  LayoutGrid,
  Filter,
  RefreshCcw,
  Plus,
  Trash2,
  AlertCircle,
  Clock,
  History,
  Download,
  Share2,
  Calendar,
  Globe,
  Settings,
  MoreHorizontal,
  ChevronRight,
  ShieldAlert,
  Lightbulb,
  Database,
  ThumbsUp,
  ThumbsDown,
  Send,
  Sparkles,
  Menu,
  ChevronDown,
  Percent,
  X,
  Moon,
  Info
} from "lucide-react"

import { supabase } from "@/services/DatabaseClient"
import axios from "axios"
import { WealthPerformanceChart as WealthChart } from "@/components/dashboard/WealthPerformanceChart"
import { getMarketStatus } from "@/constants/market-constants"
import { UTCTimestamp } from 'lightweight-charts'
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"
import { GrowwImportGuide } from "@/components/dashboard/GrowwImportGuide"
import { ZerodhaImportGuide } from "@/components/dashboard/ZerodhaImportGuide"
import { RollingNumber } from "@/components/shared/RollingNumber"
import { PortfolioAnalyzer } from "@/components/dashboard/PortfolioAnalyzer"
import { FloatingAssistant } from "@/components/dashboard/FloatingAssistant"

export default function DashboardPage() {
  const router = useRouter()
  const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
  const [mounted, setMounted] = useState(false)
  const [holdings, setHoldings] = useState<any[]>([])
  const [indices, setIndices] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('stockos_indices_cache');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) { return []; }
      }
    }
    return [];
  })
  const [history, setHistory] = useState<any[]>([])
  const [portfolios, setPortfolios] = useState<any[]>([])
  const [activePortfolio, setActivePortfolio] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [importStatus, setImportStatus] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [timeRange, setTimeRange] = useState("ALL")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isPortfolioDropdownOpen, setIsPortfolioDropdownOpen] = useState(false)
  const [syncLogs, setSyncLogs] = useState<any[]>([])
  const [showSyncConsole, setShowSyncConsole] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string>('SYNCHRONIZING...')

  // Stable daily P/L from server-side aggregate (avoids frontend partial-read race condition)
  const [dailyPLData, setDailyPLData] = useState<{ total_day_change: number; day_change_percentage: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);


  const { data: session, status } = useSession()
  const portfolioId = (session?.user as any)?.id || process.env.NEXT_PUBLIC_PORTFOLIO_ID || "guest";

  const formattedName = useMemo(() => {
    if (status === 'loading') return "Fetching User's Name...";

    const rawName = session?.user?.name || "GUEST";
    const parts = rawName.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return "GUEST";
    if (parts.length === 1) return parts[0].toUpperCase();

    const firstName = parts[0];
    const secondPart = parts[1];
    return `${firstName} ${secondPart[0]}.`.toUpperCase();
  }, [session?.user?.name, status]);

  // Portfolio Linking State
  const [addPortfolioModalOpen, setAddPortfolioModalOpen] = useState(false)
  const [newPortfolioType, setNewPortfolioType] = useState<'GROWW' | 'ZERODHA' | ''>('')
  const [newPortfolioName, setNewPortfolioName] = useState('')
  const [showGrowwGuide, setShowGrowwGuide] = useState(false)
  const [showZerodhaGuide, setShowZerodhaGuide] = useState(false)


  // Debounce ref: prevents partial-read flicker when revaluation job batch-upserts holdings
  const holdingsFetchTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchHoldings = async () => {
    if (!activePortfolio) return;
    try {
      const { data, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('portfolio_id', activePortfolio.id)
        .order('market_value', { ascending: false });

      if (error) throw error;
      setHoldings(data || []);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error("[DASHBOARD] Fetch holdings failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced version: waits 3s for all batch upsert rows to settle before fetching
  const debouncedFetchHoldings = () => {
    if (holdingsFetchTimer.current) clearTimeout(holdingsFetchTimer.current);
    holdingsFetchTimer.current = setTimeout(() => {
      fetchHoldings();
      if (activePortfolio) fetchDailyPL(activePortfolio.id);
    }, 3000);
  };




  const fetchHistory = async () => {
    if (!activePortfolio) return;
    try {
      const { data, error } = await supabase
        .from('portfolio_history')
        .select('*')
        .eq('portfolio_id', activePortfolio.id)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error("[DASHBOARD] Fetch history failed:", err);
    }
  }


  const fetchPortfolios = async () => {
    if (!portfolioId) return;
    try {
      const { data, error } = await supabase
        .from('user_portfolios')
        .select('*')
        .eq('user_id', portfolioId)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      setPortfolios(data || []);
      if (data && data.length > 0 && !activePortfolio) {
        setActivePortfolio(data.find(p => p.is_primary) || data[0]);
      }
    } catch (err) {
      console.error("[DASHBOARD] Fetch portfolios failed:", err);
    }
  }

  const fetchIndices = async () => {
    try {
      const res = await axios.get(`${engineUrl}/api/indices`);
      setIndices(res.data);
      if (typeof window !== 'undefined') {
        localStorage.setItem('stockos_indices_cache', JSON.stringify(res.data));
      }
    } catch (err) {
      console.warn("[DASHBOARD] Fetch indices failed, using local cache:", err);
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('stockos_indices_cache');
        if (cached) {
          try { setIndices(JSON.parse(cached)); } catch (e) { }
        }
      }
    }
  }

  const refreshAll = async () => {
    setIsRefreshing(true);
    setShowSyncConsole(true);
    setSyncLogs([{ timestamp: new Date().toISOString(), message: ">>> INITIALIZING TACTICAL SYNC SEQUENCE", type: 'info' }]);

    try {
      await axios.post(`${engineUrl}/api/sync`);
    } catch (err: any) {
      console.warn("[ERROR] Groww sync failed. Using cache.");
      setSyncLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "!!! SYNC DISPATCH FAILED: ENGINE UNREACHABLE", type: 'error' }]);
    }

    try {
      await Promise.all([
        fetchHoldings(),
        fetchIndices()
      ]);
    } catch (err) {
      console.error("Refresh failed", err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // 1. Search Indian Market Assets
      const { data: indianAssets } = await supabase
        .from('market_assets')
        .select('symbol, name, asset_type')
        .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(5);

      // 2. Search US Market Assets
      const { data: usAssets } = await supabase
        .from('us_market_assets')
        .select('symbol, name')
        .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(5);

      const combined = [
        ...(indianAssets || []).map(a => ({ ...a, market: 'IN' })),
        ...(usAssets || []).map(a => ({ ...a, market: 'US', asset_type: 'EQUITY' }))
      ];

      setSearchResults(combined);
    } catch (err) {
      console.error("[SEARCH] Global search failed:", err);
    } finally {
      setIsSearching(false);
    }
  }

  // LIVE HEARTBEAT: Force a re-render every second to keep the chart "ticking"
  const [heartbeat, setHeartbeat] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setHeartbeat(h => h + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isPortfolioDropdownOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isPortfolioDropdownOpen]);

  // Polling logs during refresh
  useEffect(() => {
    let interval: any;
    if (showSyncConsole) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${engineUrl}/api/sync/logs`);
          setSyncLogs(res.data);
        } catch (err) {
          console.error("Failed to fetch logs");
        }
      }, 1000);

      // Auto-hide after 30 seconds or when idle
      const timer = setTimeout(() => {
        if (!isRefreshing) setShowSyncConsole(false);
      }, 30000);
      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }
  }, [showSyncConsole, isRefreshing]);

  useEffect(() => {
    if (!mounted) return;

    window.scrollTo(0, 0);
    fetchPortfolios();
    fetchIndices();

    // Subscribe to Realtime Updates for Holdings & History
    if (activePortfolio) {
      const holdingsSubscription = supabase
        .channel('holdings-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'holdings',
          filter: `portfolio_id=eq.${activePortfolio.id}`
        }, () => debouncedFetchHoldings())
        .subscribe();

      const historySubscription = supabase
        .channel('history-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'portfolio_history',
          filter: `portfolio_id=eq.${activePortfolio.id}`
        }, () => setTimeout(fetchHistory, 1000))
        .subscribe();

      return () => {
        supabase.removeChannel(holdingsSubscription);
        supabase.removeChannel(historySubscription);
      };
    }
  }, [mounted, portfolioId, activePortfolio]);

  useEffect(() => {
    if (!mounted || !activePortfolio) return;

    // INSTANT FETCH: Don't wait for heartbeat
    fetchHoldings();
    fetchHistory();
    fetchDailyPL(activePortfolio.id);

    // Dashboard Heartbeat: Pulse all active holdings to the engine
    const sendDashboardHeartbeat = async () => {
      if (!mounted || document.hidden || holdings.length === 0) return;

      try {
        const uniqueSymbols = Array.from(new Set(holdings.map(h => h.trading_symbol.toUpperCase())));
        for (const symbol of uniqueSymbols) {
          // Heuristic for market: .NS means Indian market
          const market = symbol.endsWith('.NS') ? 'IN' : 'US';
          fetch('/api/market/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, market })
          }).catch(() => { });
        }
      } catch (e) { }
    };

    const interval = setInterval(fetchIndices, 10000); // 10s Indices refresh
    // Poll daily P/L via server-side aggregate every 8s — atomic SUM, no partial-read risk
    const dailyPLInterval = setInterval(() => fetchDailyPL(activePortfolio.id), 8000);
    // Holdings poll every 30s as backup; realtime subscription handles live updates
    const syncInterval = setInterval(() => { fetchHoldings(); fetchHistory(); }, 30000);

    const pulseInterval = setInterval(sendDashboardHeartbeat, 30000);
    setTimeout(sendDashboardHeartbeat, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(dailyPLInterval);
      clearInterval(syncInterval);
      clearInterval(pulseInterval);
    };
  }, [mounted, activePortfolio, holdings.length]);


  const totalNetWorth = holdings.reduce((sum, h) => sum + (Number(h.market_value) || 0), 0);
  const totalInvested = holdings.reduce((sum, h) => sum + (Number(h.invested_value) || 0), 0);

  // INSTITUTIONAL METRIC PERSISTENCE: Freeze the latest high-fidelity snapshot to end flickering
  const lastGoodSnapshot = useRef<any>(null);

  const latestSnapshot = useMemo(() => {
    if (!history || history.length === 0) return lastGoodSnapshot.current;
    
    // 1. PRIMARY: Filter by active portfolio ID for absolute symmetry
    const portfolioHistory = activePortfolio 
      ? history.filter(h => h.portfolio_id === activePortfolio.id)
      : [];
      
    let latest = portfolioHistory.length > 0 
      ? portfolioHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[portfolioHistory.length - 1]
      : null;

    // 2. FALLBACK: If active filter is empty, use the absolute latest snapshot for this user
    if (!latest && history.length > 0) {
      latest = history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[history.length - 1];
    }
    
    if (latest) {
      lastGoodSnapshot.current = latest;
    }
    
    return latest || lastGoodSnapshot.current;
  }, [history, activePortfolio]);

  // SERVER-SIDE AGGREGATE: Single atomic SUM query avoids frontend partial-read race conditions
  const fetchDailyPL = async (portfolioId: string) => {
    try {
      const res = await fetch(`/api/portfolio/daily-pl?portfolio_id=${portfolioId}`);
      if (!res.ok) return;
      const data = await res.json();
      setDailyPLData(data);
    } catch (e) {
      console.error('[DASHBOARD] fetchDailyPL failed:', e);
    }
  };

  const totalDayChange = dailyPLData?.total_day_change ?? holdings.reduce((sum, h) => sum + (Number(h.day_change) || 0), 0);

  const dayChangePerc = dailyPLData?.day_change_percentage ?? (() => {
    const baseline = totalNetWorth - totalDayChange;
    return (totalNetWorth > 0 && baseline > 0) ? (totalDayChange / baseline) * 100 : 0;
  })();


  const totalPL = totalNetWorth - totalInvested;
  const totalPLPerc = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const filteredHoldings = holdings.filter(h =>
    h.trading_symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);

    let cutoff = new Date(0);
    let filtered: any[] = [];

    if (timeRange === "1D") {
      // Day starts at 6:00 AM IST
      const dayReset = new Date(istNow);
      dayReset.setHours(6, 0, 0, 0);

      // If currently before 6AM, today's "financial day" actually started yesterday at 6AM
      if (istNow < dayReset) {
        dayReset.setTime(dayReset.getTime() - 24 * 60 * 60 * 1000);
      }

      // Convert back to UTC for filtering
      cutoff = new Date(dayReset.getTime() - istOffset);
    } else if (timeRange === "1W") {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "1M") {
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "3M") {
      cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "6M") {
      cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "1Y") {
      cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    }

    // Any record before 6 AM IST is counted as previous day
    // We filter by cutoff (which is already 6 AM of the selected range start)
    filtered = history.filter(h => new Date(h.timestamp) >= cutoff);

    // Only perform date-dependent logic on client
    if (!mounted || filtered.length === 0) return filtered;

    // Stitch live point at the end for visual consistency
    const lastPoint = filtered[filtered.length - 1];
    const nowStr = now.toISOString();

    // Only append if the last snapshot isn't already from "now"
    if (new Date(lastPoint.timestamp).getTime() < now.getTime() - 60000) {
      return [...filtered, {
        timestamp: nowStr,
        total_market_value: totalNetWorth,
        total_invested: lastPoint.total_invested, // Best guess
        user_id: lastPoint.user_id
      }];
    }

    return filtered;
  }, [history, timeRange, totalNetWorth, mounted]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  }

  const startValue = useMemo(() => {
    if (filteredHistory.length === 0) return Number(totalNetWorth - totalDayChange) || 0;

    // For 1D view, the "start" is the value at the 6AM reset point
    // We try to find the very last record BEFORE the current cutoff if possible
    if (timeRange === "1D") {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const dayReset = new Date(istNow);
      dayReset.setHours(6, 0, 0, 0);
      if (istNow < dayReset) dayReset.setTime(dayReset.getTime() - 24 * 60 * 60 * 1000);
      const cutoff = new Date(dayReset.getTime() - istOffset);

      // Find the last record in full history that happened before our cutoff
      const previousPoint = [...history]
        .reverse()
        .find(h => new Date(h.timestamp) < cutoff);

      if (previousPoint) return Number(previousPoint.total_market_value) || 0;
    }

    // Default: Use the very first point in our filtered range as the base
    return Number(filteredHistory[0].total_market_value) || 0;
  }, [filteredHistory, history, timeRange, totalNetWorth, totalDayChange]);

  const rangeIsPositive = totalNetWorth >= startValue;
  const rangeChange = startValue > 0 ? ((totalNetWorth - startValue) / startValue) * 100 : 0;

  return (
    <div suppressHydrationWarning className={cn(
      "min-h-screen bg-transparent text-on-surface font-ui-body selection:bg-emerald-500/30 relative overflow-x-hidden transition-opacity duration-700",
      !mounted ? "opacity-0" : "opacity-100"
    )}>

      {/* Main Dashboard Grid */}
      <section
        className="pt-[130px] pb-12 px-12 max-w-full mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-x-6 gap-y-6 relative items-stretch"
      >
        {/* TOP ROW LEFT: Header + Metrics + Chart */}
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
          className="flex flex-col gap-6"
        >
          {/* Header Section */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative group -mt-8 -mb-4 transition-all duration-300",
              isPortfolioDropdownOpen ? "z-[200]" : "z-10"
            )}
          >
            <div className="flex items-end gap-4">
              <h2 className={cn(
                "font-headline font-black tracking-tighter text-white uppercase leading-none transition-all duration-300",
                formattedName.length > 15 ? "text-4xl" :
                  formattedName.length > 12 ? "text-5xl" :
                    formattedName.length > 10 ? "text-6xl" : "text-7xl"
              )}>
                {formattedName}
              </h2>

              <div className="relative">
                <motion.div
                  whileHover={{ y: -1, scale: 1.02 }}
                  onClick={() => setIsPortfolioDropdownOpen(!isPortfolioDropdownOpen)}
                  className="flex items-center gap-2 group/portfolio cursor-pointer px-2.5 py-1 rounded-xl bg-white/[0.03] hover:bg-emerald-500/10 transition-all duration-300 border border-white/5 hover:border-emerald-500/20"
                >
                  <div className="flex flex-col">
                    <span className="text-[8px] font-terminal-label uppercase tracking-widest text-emerald-500/70 font-bold">
                      {activePortfolio ? "Active Entity" : "Quick Start"}
                    </span>
                    <span className="font-headline font-medium text-lg text-white tracking-tight">
                      {activePortfolio ? activePortfolio.name : "Link Portfolio"}
                    </span>
                  </div>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-emerald-500 transition-all duration-500 ml-1",
                    isPortfolioDropdownOpen ? "rotate-180" : "rotate-0"
                  )} />
                </motion.div>

                <AnimatePresence>
                  {isPortfolioDropdownOpen && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsPortfolioDropdownOpen(false)}
                        className="fixed inset-0 bg-black/20 z-[90]"
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute top-full left-0 mt-3 w-72 bg-zinc-950 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[100] backdrop-blur-xl"
                      >
                        <div className="p-2 space-y-1">
                          <div className="px-3 pt-2 pb-3 flex items-center justify-between">
                            <span className="text-[10px] font-terminal-label uppercase tracking-[0.2em] text-zinc-500 font-black">Account Selection</span>
                            <div className="flex gap-1">
                              <div className="w-1 h-1 rounded-full bg-emerald-500/20" />
                              <div className="w-1 h-1 rounded-full bg-emerald-500/20" />
                            </div>
                          </div>

                          {portfolios.length > 0 ? (
                            <div className="space-y-1.5">
                              {portfolios.map((p) => (
                                <div
                                  key={p.id}
                                  onClick={() => {
                                    setActivePortfolio(p);
                                    setIsPortfolioDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-all duration-500 group/item cursor-pointer relative overflow-hidden",
                                    activePortfolio?.id === p.id
                                      ? "bg-emerald-500/10 border border-emerald-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_20px_rgba(0,0,0,0.2)]"
                                      : "bg-white/[0.02] border border-white/[0.03] hover:border-white/10 hover:bg-white/[0.05]"
                                  )}
                                >
                                  {/* Gloss Effect */}
                                  {activePortfolio?.id === p.id && (
                                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent pointer-events-none" />
                                  )}

                                  <div className="flex items-center gap-3 relative z-10">
                                    <div className={cn(
                                      "size-10 rounded-xl flex items-center justify-center p-2 border transition-all duration-500",
                                      activePortfolio?.id === p.id
                                        ? "bg-zinc-950 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                                        : "bg-white/5 border-white/10 group-hover/item:border-white/20"
                                    )}>
                                      <img src={p.broker_name === 'GROWW' ? "/Icons/groww.svg" : "/Icons/zerodha.svg"} alt="Broker" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex flex-col items-start">
                                      <div className="flex items-center gap-2">
                                        <span className={cn(
                                          "text-[15px] font-headline font-black tracking-tight transition-colors",
                                          activePortfolio?.id === p.id ? "text-white" : "text-zinc-400 group-hover/item:text-zinc-200"
                                        )}>{p.name}</span>
                                        {activePortfolio?.id === p.id && (
                                          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                                        )}
                                      </div>
                                      <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider",
                                        activePortfolio?.id === p.id ? "text-emerald-500/60" : "text-zinc-600"
                                      )}>
                                        {p.is_primary ? "Main Account" : "Connected"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 relative z-10">
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm(`Delete "${p.name}"? All holdings and history for this specific portfolio will be lost.`)) {
                                          try {
                                            await supabase.from('holdings').delete().eq('portfolio_id', p.id);
                                            await supabase.from('portfolio_history').delete().eq('portfolio_id', p.id);
                                            await supabase.from('user_portfolios').delete().eq('id', p.id);

                                            const remaining = portfolios.filter(x => x.id !== p.id);
                                            setPortfolios(remaining);
                                            if (remaining.length > 0) {
                                              setActivePortfolio(remaining.find(r => r.is_primary) || remaining[0]);
                                            } else {
                                              setActivePortfolio(null);
                                              setHoldings([]);
                                              setHistory([]);
                                            }
                                          } catch (err) {
                                            console.error("Delete error:", err);
                                          }
                                        }
                                      }}
                                      className="size-8 rounded-lg bg-red-500/5 border border-red-500/10 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/30 transition-all"
                                      title="Delete Portfolio"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-red-500/60 group-hover/item:text-red-500 transition-colors" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-white/[0.02] border border-white/5 opacity-60">
                              <div className="flex items-center gap-3">
                                <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-2">
                                  <Wallet className="w-5 h-5 text-zinc-600" />
                                </div>
                                <div className="flex flex-col items-start">
                                  <span className="text-[15px] font-headline font-black text-zinc-500">No Portfolio</span>
                                  <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Import Required</span>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="h-[1px] bg-white/5 mx-2 my-2" />

                          <button
                            onClick={() => {
                              setNewPortfolioName(`Portfolio ${portfolios.length + 1}`);
                              setIsPortfolioDropdownOpen(false);
                              setAddPortfolioModalOpen(true);
                            }}
                            className="w-full flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-white/5 group/add transition-all text-zinc-400 hover:text-white"
                          >
                            <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover/add:border-emerald-500/40 group-hover/add:bg-emerald-500/10 transition-all shadow-sm">
                              <Plus className="w-5 h-5 transition-transform duration-500 group-hover/add:rotate-90 group-hover/add:text-emerald-400" />
                            </div>
                            <span className="text-[12px] font-headline font-black uppercase tracking-[0.2em]">Link Another</span>
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* Metrics Section */}
          <div className="relative transition-all duration-500">
            <AnimatePresence>
              {isPortfolioDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute -inset-4 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
                />
              )}
            </AnimatePresence>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.2fr] gap-6 lg:gap-10 mb-0 items-end">
              {/* Metric 1: Total Net Worth */}
              <div className="relative group min-w-[240px]">
                <div className="absolute -inset-4 bg-emerald-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                <span className="font-terminal-label uppercase tracking-wider text-[12px] text-emerald-400 block mb-1 font-bold relative z-10">Total Net Worth</span>
                <h1 className="font-headline font-bold text-4xl md:text-5xl tracking-tighter text-white tabular-nums leading-none relative z-10 whitespace-nowrap">
                  <RollingNumber value={totalNetWorth} currency prefix="₹" decimals={0} />
                </h1>
              </div>

              {/* Metric 2: Daily P/L */}
              <div className="flex flex-col gap-1 border-l border-white/5 pl-6 min-w-[210px]">
                <span className="font-terminal-label uppercase tracking-wider text-[12px] text-zinc-300 block mb-1 font-bold">Daily P/L</span>
                <div className="flex items-center gap-4 flex-nowrap">
                  <span className={`font-headline font-bold text-2xl md:text-3xl tabular-nums whitespace-nowrap flex items-center ${((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0) ? 'text-zinc-500' : (totalDayChange > 0 ? 'text-emerald-500' : 'text-red-500')
                    }`}>
                    {((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0) ? (
                      <RollingNumber value={0} currency prefix="₹" decimals={0} />
                    ) : (
                      <RollingNumber value={totalDayChange} currency prefix="₹" showSign decimals={0} />
                    )}
                  </span>
                  <span className={`font-terminal-label border px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0)
                    ? 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                    : (totalDayChange > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')
                    }`}>
                    {((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0) ? (
                      <RollingNumber value={0} suffix="%" decimals={2} />
                    ) : (
                      <RollingNumber value={dayChangePerc} suffix="%" decimals={2} showSign />
                    )}
                  </span>
                </div>
              </div>

              {/* Metric 3: Aggregate P/L */}
              <div className="flex flex-col gap-1 border-l border-white/5 pl-6 min-w-[210px]">
                <span className="font-terminal-label uppercase tracking-wider text-[11px] text-zinc-400 block font-bold">Aggregate P/L</span>
                <div className="flex items-center gap-4 flex-nowrap">
                  <span className={`font-headline font-bold text-xl md:text-2xl tabular-nums whitespace-nowrap flex items-center ${totalPL === 0 ? 'text-zinc-500' : (totalPL > 0 ? 'text-emerald-500' : 'text-red-500')
                    }`}>
                    <RollingNumber value={totalPL} currency prefix="₹" showSign decimals={0} />
                  </span>
                  <span className={`font-terminal-label px-2 py-0.5 rounded-[4px] text-[10px] font-bold border transition-all duration-500 ${totalPL === 0 ? 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' : (totalPL > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')
                    }`}>
                    <RollingNumber value={totalPLPerc} suffix="%" decimals={2} prefix={totalPLPerc >= 0 ? "+" : ""} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Chart */}
          <motion.section
            className="glass-panel rounded-3xl pt-4 px-6 pb-4 relative group border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-gradient-to-b from-white/[0.04] to-transparent relative transition-all duration-500"
          >
            <AnimatePresence>
              {isPortfolioDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
                />
              )}
            </AnimatePresence>

            <div className="flex justify-between items-center mb-4 relative z-10">
              <div>
                <h3 className="font-terminal-label text-[12px] uppercase tracking-wider text-zinc-300 mb-1 font-bold">Historical Performance</h3>
                <div className="flex items-baseline gap-4">
                  <span className="font-headline font-bold text-4xl tracking-tighter text-white tabular-nums"><RollingNumber value={totalNetWorth} currency prefix="₹" decimals={0} /></span>
                  <span className={`font-terminal-label text-[10px] border px-2 py-0.5 rounded-[4px] uppercase tracking-widest font-bold ${totalPLPerc >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                    }`}>
                    <RollingNumber value={totalPLPerc} suffix="%" decimals={2} prefix={totalPLPerc >= 0 ? "+" : ""} />
                  </span>
                </div>
              </div>
              <div className="flex gap-2 relative z-20">
                {['1W', '1M', '1Y', 'ALL'].map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range as any)}
                    className={`px-4 py-1.5 rounded-lg font-terminal-label text-[11px] font-bold tracking-widest border transition-all duration-300 ${timeRange === range
                      ? (range === '1D' && getMarketStatus('IN') === 'CLOSED'
                        ? 'bg-zinc-500/20 border-zinc-500/60 text-zinc-400 shadow-[0_0_25px_rgba(113,113,122,0.15)]'
                        : (rangeIsPositive ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.15)]' : 'bg-red-500/20 border-red-500/60 text-red-400 shadow-[0_0_25px_rgba(239,68,68,0.15)]')
                      )
                      : 'border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/5'
                      }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[340px] w-full pt-0 transition-all duration-500">
              {filteredHistory.length > 0 ? (
                <WealthChart data={(() => {
                  const _ = heartbeat; // Depend on heartbeat for live updates

                  const map = new Map<string | number, { time: string | number; value: number; ts: number }>();
                  filteredHistory.forEach((h: { timestamp: string; total_market_value: number }) => {
                    if (!h.timestamp) return;

                    const dateObj = new Date(h.timestamp);
                    const financialDayDate = new Date(dateObj.getTime() - (6 * 60 * 60 * 1000));

                    const dateKey = new Intl.DateTimeFormat('en-CA', {
                      timeZone: 'Asia/Kolkata',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    }).format(financialDayDate);

                    const ts = Math.floor(dateObj.getTime() / 1000);
                    const key = timeRange === '1D' ? ts : dateKey;

                    const existing = map.get(key);
                    if (!existing || ts > existing.ts) {
                      map.set(key, {
                        time: timeRange === '1D' ? (ts as UTCTimestamp) : dateKey,
                        value: Number(h.total_market_value) || 0,
                        ts: ts
                      });
                    }
                  });

                  const results = Array.from(map.values()).sort((a, b) => a.ts - b.ts);

                  const now = new Date();
                  const nowTs = Math.floor(now.getTime() / 1000);
                  const financialDayNow = new Date(now.getTime() - (6 * 60 * 60 * 1000));

                  const nowKey = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  }).format(financialDayNow);

                  const currentChartKey = timeRange === '1D' ? (nowTs as UTCTimestamp) : nowKey;

                  if (results.length > 0) {
                    const lastResult = results[results.length - 1];
                    if (lastResult.time === currentChartKey) {
                      lastResult.value = Number(totalNetWorth) || 0;
                      lastResult.ts = nowTs;
                    } else if (nowTs > lastResult.ts) {
                      results.push({
                        time: currentChartKey,
                        value: Number(totalNetWorth) || 0,
                        ts: nowTs
                      });
                    }
                  } else {
                    results.push({
                      time: currentChartKey,
                      value: Number(totalNetWorth) || 0,
                      ts: nowTs
                    });
                  }

                  return results.map(item => ({
                    time: item.time as any,
                    value: item.value
                  }));
                })()} 
                isProfitOverride={totalPL >= 0}
                />

              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-6">
                  {holdings.length > 0 ? (
                    <div className="flex flex-col items-center gap-3 opacity-30">
                      <Cpu className="w-12 h-12 animate-pulse" />
                      <span className="font-terminal-label text-[10px] uppercase tracking-[0.4em]">Initializing Performance Map...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col items-center gap-3 opacity-30">
                        <Cpu className="w-12 h-12 animate-pulse" />
                        <span className="font-terminal-label text-[10px] uppercase tracking-[0.4em]">No Data Found</span>
                      </div>
                      <button
                        onClick={() => setAddPortfolioModalOpen(true)}
                        className="px-6 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-terminal-label text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 transition-all hover:scale-105"
                      >
                        Add Portfolio
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>

        {/* TOP ROW RIGHT: Portfolio Analyzer */}
        <motion.aside
          animate={{
            opacity: isPortfolioDropdownOpen ? 0.8 : 1,
            scale: isPortfolioDropdownOpen ? 0.995 : 1
          }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel rounded-3xl border border-white/10 bg-[#0a0d14]/80 backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.4)] group/sidebar overflow-hidden transition-all duration-500 relative flex flex-col h-full"
        >
          <AnimatePresence>
            {isPortfolioDropdownOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
              />
            )}
          </AnimatePresence>

          <PortfolioAnalyzer holdings={holdings} />
        </motion.aside>

        {/* BOTTOM ROW: Asset Allocation Console */}
        <motion.div
          className="lg:col-span-1"
        >
          <motion.section
            variants={{
              hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
              visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-gradient-to-b from-white/[0.02] to-transparent relative"
          >
            <AnimatePresence>
              {isPortfolioDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
                />
              )}
            </AnimatePresence>
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
              <h3 className="font-terminal-label text-[11px] uppercase tracking-wider text-zinc-300 font-bold">Current Holdings</h3>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500/30 group-focus-within:text-emerald-500 transition-colors w-3 h-3" />
                <input
                  type="text"
                  placeholder="FILTER HOLDINGS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-black/60 border border-white/5 text-[9px] tracking-wider font-terminal-label pl-8 pr-4 py-2 w-64 rounded-full focus:ring-1 focus:ring-emerald-500/40 focus:outline-none placeholder:text-white/10 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[440px] custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-6 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Stock Details</th>
                    <th className="px-5 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 text-right font-bold">Quantity</th>
                    <th className="px-5 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 text-right font-bold">Avg. Cost</th>
                    <th className="px-5 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 text-right font-bold">Invested</th>
                    <th className="px-5 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 text-right font-bold">Market Value</th>
                    <th className="px-6 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 text-right font-bold">Returns (%)</th>
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
                              {searchQuery ? "No Matching Stocks" : "Portfolio Not Found"}
                            </span>
                            <span className="font-data-sm text-[11px] text-zinc-500 uppercase tracking-widest">
                              {searchQuery ? "Try a different search term" : "Upload your Excel statement to start"}
                            </span>
                            {!searchQuery && (
                              <button
                                onClick={() => setAddPortfolioModalOpen(true)}
                                className="mt-4 px-6 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-terminal-label text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                              >
                                Import Excel
                              </button>
                            )}
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
                              <span className="font-headline font-bold text-sm text-white tracking-tight group-hover:text-emerald-400 transition-colors">
                                {asset.trading_symbol.replace('.NS', '')}
                              </span>
                              <span className="font-terminal-label text-[9px] text-zinc-600 uppercase tracking-widest mt-1">NSE:EQUITY</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right font-data-md text-xs text-white/50 tabular-nums"><RollingNumber value={asset.quantity || 0} decimals={0} /></td>
                          <td className="px-6 py-5 text-right font-data-md text-xs text-white/50 tabular-nums"><RollingNumber value={Number(asset.average_price) || 0} currency prefix="₹" decimals={2} /></td>
                          <td className="px-6 py-5 text-right font-data-md text-xs text-white/50 tabular-nums"><RollingNumber value={Number(asset.invested_value) || 0} currency prefix="₹" decimals={0} /></td>
                          <td className="px-6 py-5 text-right font-data-md text-xs text-white tabular-nums"><RollingNumber value={Number(asset.market_value) || 0} currency prefix="₹" decimals={0} /></td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-data-md text-sm font-bold tabular-nums ${Number(asset.p_l) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                <RollingNumber value={Math.abs(Number(asset.p_l)) || 0} currency prefix={Number(asset.p_l) >= 0 ? "+₹" : "-₹"} decimals={0} />
                              </span>
                              <span className={`font-terminal-label text-[10px] font-bold tabular-nums mt-1 ${Number(asset.p_l) >= 0 ? 'text-emerald-500/40' : 'text-red-500/40'}`}>
                                <RollingNumber value={Number(asset.p_l_percentage) || 0} suffix="%" decimals={2} />
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
                onClick={() => { console.log("ADD_NEW_HOLDING_TRIGGERED") }}
                className="font-terminal-label text-[10px] uppercase tracking-[0.25em] font-bold flex items-center gap-2 transition-all text-emerald-500/60 hover:text-emerald-500"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Holding
              </button>
            </div>
          </motion.section>
        </motion.div>
        {/* BOTTOM ROW RIGHT: Market Watchlist */}
        <motion.div
          variants={{
            hidden: { opacity: 0, x: 20 },
            visible: { opacity: 1, x: 0 }
          }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="glass-panel rounded-3xl border border-white/10 bg-[#0a0d14]/80 backdrop-blur-3xl shadow-2xl overflow-hidden flex flex-col relative"
        >
          <AnimatePresence>
            {isPortfolioDropdownOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
              />
            )}
          </AnimatePresence>
          <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
              <span className="font-headline text-[13px] uppercase tracking-[0.2em] text-white font-bold">
                Market Watchlist
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2 py-1 bg-white/5 rounded-md">3 Assets</span>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto no-scrollbar p-6">
            <div className="space-y-4">
              {[
                { symbol: 'RELIANCE', price: '2,942.10', change: '+1.2%', isUp: true, sentiment: 'BULLISH' },
                { symbol: 'TCS', price: '4,102.45', change: '-0.4%', isUp: false, sentiment: 'NEUTRAL' },
                { symbol: 'ZOMATO', price: '194.20', change: '+4.8%', isUp: true, sentiment: 'EXTREME BULL' },
              ].map((item, idx) => (
                <motion.div
                  key={item.symbol}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + (idx * 0.1) }}
                  className="group cursor-pointer"
                >
                  <div className="glass-panel p-4 rounded-2xl border border-white/[0.03] group-hover:border-white/10 group-hover:bg-white/[0.02] transition-all duration-300 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-1 h-10 rounded-full",
                        item.isUp ? "bg-emerald-500/40" : "bg-red-500/40"
                      )} />
                      <div>
                        <div className="font-headline font-bold text-white tracking-tight">{item.symbol}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                            item.isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                          )}>
                            {item.sentiment}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-data-md font-bold text-white">₹{item.price}</div>
                      <div className={cn(
                        "text-[11px] font-bold mt-1",
                        item.isUp ? "text-emerald-500" : "text-red-500"
                      )}>
                        {item.change}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-black/40 border-t border-white/5 mt-auto">
            <button className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-300">
              Manage Watchlist
            </button>
          </div>
        </motion.div>
      </section>


      {/* Add Portfolio Modal - Portaled to Body to bypass transforms */}
      {mounted && addPortfolioModalOpen && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setAddPortfolioModalOpen(false); setNewPortfolioType(""); setShowGrowwGuide(false); setShowZerodhaGuide(false); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                width: (showGrowwGuide || showZerodhaGuide) ? "1100px" : "400px",
                height: "auto",
                maxWidth: "95vw"
              }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{
                layout: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.2 },
                scale: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }
              }}
              className="relative bg-zinc-950 border border-white/10 rounded-[28px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.9)] flex flex-col"
            >
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                    <Wallet className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-sans font-bold text-lg text-white tracking-tight">
                      {(showGrowwGuide || showZerodhaGuide) ? "Sync Guide" : "Link Account"}
                    </h2>
                    <p className="text-[10px] font-sans uppercase tracking-[0.2em] text-zinc-500 font-black mt-0.5">
                      {(showGrowwGuide || showZerodhaGuide) ? "Follow the steps below" : "Import your current holdings"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setAddPortfolioModalOpen(false); setNewPortfolioType(""); setNewPortfolioName(""); setShowGrowwGuide(false); setShowZerodhaGuide(false); }}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {showGrowwGuide ? (
                  <motion.div
                    key="groww-guide"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 min-h-0"
                  >
                    <GrowwImportGuide
                      embedded={true}
                      onClose={() => setShowGrowwGuide(false)}
                    />
                  </motion.div>
                ) : showZerodhaGuide ? (
                  <motion.div
                    key="zerodha-guide"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 min-h-0"
                  >
                    <ZerodhaImportGuide
                      embedded={true}
                      onClose={() => setShowZerodhaGuide(false)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="p-4 space-y-4"
                  >
                    <div className="space-y-2">
                      <label className="text-[10px] font-sans uppercase tracking-[0.3em] text-zinc-600 font-black px-1">Portfolio Name</label>
                      <div className="relative group">
                        <input
                          type="text"
                          value={newPortfolioName}
                          onChange={(e) => setNewPortfolioName(e.target.value)}
                          placeholder="e.g. Tactical Assets"
                          className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-[14px] font-headline font-bold text-white focus:outline-none focus:border-emerald-500/30 focus:bg-emerald-500/[0.02] transition-all duration-500 placeholder:text-zinc-700 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]"
                        />
                        <div className="absolute inset-0 rounded-2xl border border-emerald-500/0 group-focus-within:border-emerald-500/20 transition-all duration-500 pointer-events-none shadow-[0_0_20px_rgba(16,185,129,0)] group-focus-within:shadow-[0_0_20px_rgba(16,185,129,0.05)]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="px-1">
                        <label className="text-[10px] font-sans uppercase tracking-[0.3em] text-zinc-600 font-black">Choose your broker</label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { id: 'GROWW', name: 'Groww', icon: '/Icons/groww.svg' },
                          { id: 'ZERODHA', name: 'Zerodha', icon: '/Icons/zerodha.svg' }
                        ].map((broker) => (
                          <button
                            key={broker.id}
                            onClick={() => setNewPortfolioType(broker.id as any)}
                            className={cn(
                              "p-3 rounded-2xl border transition-all duration-500 flex flex-col items-center gap-2 group relative overflow-hidden",
                              newPortfolioType === broker.id
                                ? "bg-emerald-500/5 border-emerald-500/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.2)]"
                                : "bg-white/[0.01] border-white/5 hover:border-white/20 hover:bg-white/[0.03] hover:shadow-[0_10px_20px_rgba(0,0,0,0.1)]"
                            )}
                          >
                            {/* Selection Glow */}
                            {newPortfolioType === broker.id && (
                              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                            )}

                            <div className={cn(
                              "size-11 flex items-center justify-center p-1 transition-all duration-700 relative z-10",
                              newPortfolioType === broker.id ? "scale-110" : "opacity-40 group-hover:opacity-100 group-hover:scale-110"
                            )}>
                              <img src={broker.icon} alt={broker.name} className="w-full h-full object-contain" />
                            </div>
                            <span className={cn(
                              "font-sans text-[11px] font-bold tracking-[0.2em] uppercase relative z-10 transition-colors duration-500",
                              newPortfolioType === broker.id ? "text-emerald-400" : "text-zinc-600 group-hover:text-zinc-300"
                            )}>{broker.name}</span>

                            {newPortfolioType === broker.id && (
                              <motion.div layoutId="active-broker-glow" className="absolute inset-0 border-2 border-emerald-500/10 rounded-2xl pointer-events-none" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <AnimatePresence mode="wait">
                      {newPortfolioType === 'GROWW' && (
                        <motion.div
                          key="groww-fields"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="space-y-6 pt-2"
                        >
                          <div className="p-4 bg-white/[0.02] rounded-[24px] border border-white/5 text-center space-y-3 relative overflow-hidden group/upload">
                            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.02] to-transparent opacity-0 group-hover/upload:opacity-100 transition-opacity duration-700" />

                            <div className="size-10 flex items-center justify-center mx-auto transition-transform duration-500 group-hover/upload:scale-110 relative z-10">
                              <FileUp className="w-6 h-6 text-emerald-500/60" />
                            </div>
                            <div className="relative z-10">
                              <h3 className="text-white font-headline font-black text-lg tracking-tight">Upload Statement</h3>
                              <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mt-1">Select the .xlsx file from Groww</p>
                            </div>

                            <input
                              type="file"
                              id="excel-upload"
                              className="hidden"
                              accept=".xlsx"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                setIsRefreshing(true);
                                setImportStatus("Analyzing Statement...");
                                let pData: any;
                                try {
                                  // 1. Create the portfolio record first
                                  setImportStatus("Registering Portfolio...");
                                  const { data: createdPortfolio, error: pErr } = await supabase
                                    .from('user_portfolios')
                                    .insert({
                                      user_id: portfolioId,
                                      name: newPortfolioName || "New Portfolio",
                                      broker_name: 'GROWW',
                                      is_primary: portfolios.length === 0
                                    })
                                    .select()
                                    .single();
                                  pData = createdPortfolio;

                                  if (pErr) throw pErr;

                                  setImportStatus("Ingesting Excel Data...");
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  formData.append('portfolioId', pData.id); // Explicit Portfolio UUID
                                  formData.append('userId', portfolioId || ""); // Explicit User UUID

                                  const res = await axios.post(`${engineUrl}/api/broker/groww/import-excel`, formData, {
                                    headers: { 'Content-Type': 'multipart/form-data' }
                                  });

                                  if (res.data.success) {
                                    setImportStatus("Synchronizing Dashboard...");
                                    await fetchPortfolios();
                                    setActivePortfolio(pData);
                                    setAddPortfolioModalOpen(false);
                                  }
                                } catch (err: any) {
                                  // ROLLBACK: Delete the empty portfolio if ingestion failed
                                  if (typeof pData !== 'undefined' && pData?.id) {
                                    await supabase.from('user_portfolios').delete().eq('id', pData.id);
                                  }
                                  const errorMsg = err.response?.data?.error || err.message || "Unknown Error";
                                  alert(`Import Failed: ${errorMsg}`);
                                } finally {
                                  setIsRefreshing(false);
                                  setImportStatus("");
                                }
                              }}
                            />

                            <button
                              onClick={() => document.getElementById('excel-upload')?.click()}
                              disabled={isRefreshing}
                              className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-white font-headline font-black text-[11px] uppercase tracking-[0.25em] rounded-xl border border-white/10 group-hover/upload:border-white/20 transition-all duration-500 disabled:opacity-50 relative z-10 shadow-sm"
                            >
                              {isRefreshing ? (
                                <div className="flex items-center justify-center gap-3">
                                  <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                    className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full"
                                  />
                                  <span className="text-emerald-400">{importStatus || "Processing..."}</span>
                                </div>
                              ) : "Choose Local File"}
                            </button>

                            <div className="pt-2 border-t border-white/5 mt-2 relative z-10">
                              <button
                                onClick={() => setShowGrowwGuide(true)}
                                className="w-full py-3 px-4 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 text-emerald-400 font-terminal-label font-bold text-[10px] uppercase tracking-[0.2em] transition-all duration-500 flex items-center justify-between group/btn"
                              >
                                <span className="flex items-center gap-2 text-zinc-500 group-hover/btn:text-zinc-200 transition-colors">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                  Need fetching guide?
                                </span>
                                <span className="text-emerald-400 flex items-center gap-1 group-hover/btn:translate-x-1 transition-transform">
                                  View steps &rarr;
                                </span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      {newPortfolioType === 'ZERODHA' && (
                        <motion.div
                          key="zerodha-fields"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="space-y-6 pt-2"
                        >
                          <div className="p-4 bg-white/[0.02] rounded-[24px] border border-white/5 text-center space-y-3 relative overflow-hidden group/upload">
                            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.02] to-transparent opacity-0 group-hover/upload:opacity-100 transition-opacity duration-700" />

                            <div className="size-10 flex items-center justify-center mx-auto transition-transform duration-500 group-hover/upload:scale-110 relative z-10">
                              <FileUp className="w-6 h-6 text-indigo-500/60" />
                            </div>
                            <div className="relative z-10">
                              <h3 className="text-white font-headline font-black text-lg tracking-tight">Upload CSV</h3>
                              <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mt-1">Select the .csv file from Zerodha Console</p>
                            </div>

                            <input
                              type="file"
                              id="zerodha-upload"
                              className="hidden"
                              accept=".csv"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                setIsRefreshing(true);
                                setImportStatus("Analyzing CSV...");
                                let pData: any;
                                try {
                                  setImportStatus("Registering Portfolio...");
                                  const { data: createdPortfolio, error: pErr } = await supabase
                                    .from('user_portfolios')
                                    .insert({
                                      user_id: portfolioId,
                                      name: newPortfolioName || "Zerodha Portfolio",
                                      broker_name: 'ZERODHA',
                                      is_primary: portfolios.length === 0
                                    })
                                    .select()
                                    .single();
                                  pData = createdPortfolio;

                                  if (pErr) throw pErr;

                                  setImportStatus("Ingesting Zerodha Data...");
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  formData.append('portfolioId', pData.id);
                                  formData.append('userId', portfolioId || "");

                                  const res = await axios.post(`${engineUrl}/api/broker/zerodha/import-csv`, formData, {
                                    headers: { 'Content-Type': 'multipart/form-data' }
                                  });

                                  if (res.data.success) {
                                    setImportStatus("Synchronizing Dashboard...");
                                    await fetchPortfolios();
                                    setActivePortfolio(pData);
                                    setAddPortfolioModalOpen(false);
                                  }
                                } catch (err: any) {
                                  // ROLLBACK: Delete the empty portfolio if ingestion failed
                                  if (typeof pData !== 'undefined' && pData?.id) {
                                    await supabase.from('user_portfolios').delete().eq('id', pData.id);
                                  }
                                  const errorMsg = err.response?.data?.error || err.message || "Unknown Error";
                                  alert(`Import Failed: ${errorMsg}`);
                                } finally {
                                  setIsRefreshing(false);
                                  setImportStatus("");
                                }
                              }}
                            />

                            <button
                              onClick={() => document.getElementById('zerodha-upload')?.click()}
                              disabled={isRefreshing}
                              className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-white font-headline font-black text-[11px] uppercase tracking-[0.25em] rounded-xl border border-white/10 group-hover/upload:border-white/20 transition-all duration-500 disabled:opacity-50 relative z-10 shadow-sm"
                            >
                              {isRefreshing ? (
                                <div className="flex items-center justify-center gap-3">
                                  <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                    className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full"
                                  />
                                  <span className="text-indigo-400">{importStatus || "Processing..."}</span>
                                </div>
                              ) : "Choose Local CSV"}
                            </button>

                              <div className="pt-2 border-t border-white/5 mt-2 relative z-10">
                                <button
                                  onClick={() => setShowZerodhaGuide(true)}
                                  className="w-full py-3 px-4 rounded-xl bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 text-indigo-400 font-terminal-label font-bold text-[10px] uppercase tracking-[0.2em] transition-all duration-500 flex items-center justify-between group/btn"
                                >
                                  <span className="flex items-center gap-2 text-zinc-500 group-hover/btn:text-zinc-200 transition-colors">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                    Need fetching guide?
                                  </span>
                                  <span className="text-indigo-400 flex items-center gap-1 group-hover/btn:translate-x-1 transition-transform">
                                    View steps &rarr;
                                  </span>
                                </button>
                              </div>

                              <div className="mt-4 p-4 rounded-2xl bg-amber-500/[0.03] border border-amber-500/10 flex gap-4 items-start text-left relative z-10">
                                <Info className="w-5 h-5 text-amber-500/40 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  <h4 className="text-[10px] font-sans uppercase tracking-[0.2em] text-amber-500/60 font-black">Data Fidelity Advisory</h4>
                                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                                    For <span className="text-zinc-300">100% settlement accuracy</span>, we recommend uploading after <span className="text-amber-500/60">4:00 PM IST</span>. Always download a <span className="text-zinc-200 underline underline-offset-4 decoration-amber-500/30">fresh statement</span> from your broker console immediately before uploading.
                                  </p>
                                </div>
                              </div>

                            </div>

                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="pt-4">
                      <button
                        onClick={() => {
                          if (newPortfolioType === 'GROWW') {
                            document.getElementById('excel-upload')?.click();
                          } else if (newPortfolioType === 'ZERODHA') {
                            document.getElementById('zerodha-upload')?.click();
                          }
                        }}
                        disabled={!newPortfolioType || (newPortfolioType === 'GROWW' && isRefreshing) || (newPortfolioType === 'ZERODHA' && isRefreshing)}
                        className="w-full py-4 rounded-[20px] bg-emerald-500 text-black font-headline font-black text-[14px] uppercase tracking-[0.15em] shadow-[0_10px_40px_rgba(16,185,129,0.2)] hover:shadow-[0_15px_50px_rgba(16,185,129,0.4)] hover:scale-[1.01] active:scale-[0.98] transition-all duration-500 disabled:opacity-10 disabled:grayscale disabled:scale-100 disabled:shadow-none"
                      >
                        {isRefreshing ? "Syncing Account..." : (newPortfolioType === 'GROWW' ? "Select Statement & Sync" : newPortfolioType === 'ZERODHA' ? "Select CSV & Sync" : "Connect Broker")}
                      </button>
                    </div>
                  </motion.div>

                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* SYNC CONSOLE */}
      <AnimatePresence>
        {showSyncConsole && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            className="fixed bottom-24 right-12 w-[450px] h-[300px] bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[200] overflow-hidden flex flex-col font-mono"
          >
            {/* Console Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="size-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
                  <div className="size-2.5 rounded-full bg-amber-500/20 border border-amber-500/40" />
                  <div className="size-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
                </div>
                <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">System Sync Console</span>
              </div>
              <button
                onClick={() => setShowSyncConsole(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Console Output */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
              {syncLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-20 italic text-xs">
                  Awaiting engine heartbeat...
                </div>
              ) : (
                syncLogs.map((log, i) => (
                  <div key={i} className="flex gap-3 text-[11px] leading-relaxed group">
                    <span className="text-zinc-600 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                    <span className={cn(
                      "font-medium",
                      log.type === 'success' ? "text-emerald-400" :
                        log.type === 'error' ? "text-red-400" :
                          log.type === 'warn' ? "text-amber-400" :
                            "text-zinc-300"
                    )}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              {isRefreshing && (
                <div className="flex items-center gap-2 pt-2 opacity-50">
                  <div className="size-1 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-emerald-500 uppercase tracking-widest animate-pulse">Sync in progress...</span>
                </div>
              )}
            </div>

            {/* Console Footer */}
            <div className="px-4 py-2 bg-black/40 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-zinc-600">v2.4.0-tactical-engine</span>
              <div className="flex items-center gap-2">
                <div className={cn("size-1.5 rounded-full", isRefreshing ? "bg-emerald-500 animate-pulse" : "bg-zinc-700")} />
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                  {isRefreshing ? "Active" : "Idle"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FloatingAssistant />
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
