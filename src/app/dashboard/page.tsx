"use client"

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Terminal,
  Search,
  Newspaper,
  Cpu,
  TrendingUp,
  RefreshCcw,
  Send,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Menu,
  ChevronDown,
  Clock,
  ShieldAlert,
  Lightbulb,
  Percent,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Wallet,
  X,
  Key,
  ShieldCheck,
  Moon
} from "lucide-react"
import { supabase } from "@/services/DatabaseClient"
import axios from "axios"
import { WealthPerformanceChart as WealthChart } from "@/components/dashboard/WealthPerformanceChart"
import { getMarketStatus } from "@/constants/market-constants"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
  const router = useRouter()
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
  const [loading, setLoading] = useState(true)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [timeRange, setTimeRange] = useState("ALL")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isPortfolioDropdownOpen, setIsPortfolioDropdownOpen] = useState(false)
  const [syncLogs, setSyncLogs] = useState<any[]>([])
  const [showSyncConsole, setShowSyncConsole] = useState(false)

  useEffect(() => {
    setMounted(true);
  }, []);


  const portfolioId = process.env.NEXT_PUBLIC_PORTFOLIO_ID || "primary";

  const [marketIntelligence, setMarketIntelligence] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('stockos_market_intelligence');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) { return null; }
      }
    }
    return null;
  });
  const [lastIntelligenceFetch, setLastIntelligenceFetch] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('stockos_intelligence_timestamp');
    }
    return null;
  });
  const [intelligenceLoading, setIntelligenceLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('stockos_market_intelligence');
    }
    return true;
  });

  // AI Assistant State
  const [assistantMessages, setAssistantMessages] = useState<any[]>([])
  const [assistantLoading, setAssistantLoading] = useState(false)

  // Portfolio Linking State
  const [addPortfolioModalOpen, setAddPortfolioModalOpen] = useState(false)
  const [newPortfolioType, setNewPortfolioType] = useState<'GROWW' | 'ZERODHA' | ''>('')
  const [growwApiKey, setGrowwApiKey] = useState("")
  const [growwTotpSecret, setGrowwTotpSecret] = useState("")

  // Initialize welcome message on mount to avoid hydration mismatch
  useEffect(() => {
    if (mounted) {
      setAssistantMessages([
        {
          role: 'assistant',
          content: 'Hello! I am your research assistant. Ask me about any stock or portfolio risk.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          hideFeedback: true
        }
      ]);
    }
  }, [mounted]);
  const chatContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [assistantMessages]);

  const handleAssistantQuery = async (query: string) => {
    if (!query.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Add user message
    const userMsg = { role: 'user', content: query, timestamp };
    setAssistantMessages(prev => [...prev, userMsg]);
    setAssistantLoading(true);

    const assistantUrl = process.env.NEXT_PUBLIC_STOCK_ASSISTANT;

    if (!assistantUrl) {
      setAssistantMessages(prev => [...prev, {
        role: 'assistant',
        content: "Error: AI Assistant URL not found in .env file.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isError: true
      }]);
      setAssistantLoading(false);
      return;
    }

    try {
      const response = await axios.post(assistantUrl, {
        user_id: "vaibhav_s",
        user_query: query
      }, {
        timeout: 180000
      });

      const rawData = response.data;
      let analysisItem = null;

      // --- 0. Partial/Malformed JSON Extraction (The "n8n Truncation" Case) ---
      let processedData = rawData;

      // If we got a nested 'output' or 'raw_output' string, try to recover data from it
      const firstItem = Array.isArray(rawData) ? rawData[0] : rawData;
      const rawStr = firstItem?.output || firstItem?.raw_output;

      if (rawStr && typeof rawStr === 'string') {
        try {
          // Attempt 1: Try to fix trailing truncation by adding closing braces/brackets
          // We try multiple closing variations to be safe
          let repaired = rawStr.trim();
          if (!repaired.endsWith(']')) repaired += '"}]';
          processedData = JSON.parse(repaired);
        } catch (e) {
          // Attempt 2: Use regex to extract key fields if JSON is too broken
          const extractField = (field: string) => {
            const regex = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`, 'i');
            const match = rawStr.match(regex);
            return match ? match[1] : null;
          };

          analysisItem = {
            answer: extractField('answer') || "I analyzed your portfolio, but the response format was slightly different. Here is the partial insight:",
            portfolio: extractField('portfolio') || "Portfolio summary available.",
            analysis: extractField('analysis') || "Analysis details were partially retrieved.",
            risk: extractField('risk') || "Moderate (Inferred)",
            action: extractField('action') || "HOLD",
            confidence: { score: 50, reason: "Inferred from partial data" },
            isPartial: true
          };

          if (analysisItem.answer && analysisItem.answer.length > 20) {
            // Success!
          } else {
            analysisItem = null;
          }
        }
      }

      // --- 1. Standard Robust Extraction ---
      if (!analysisItem) {
        const dataToParse = Array.isArray(processedData) ? processedData : [processedData];
        if (dataToParse.length > 0) {
          const first = dataToParse[0];
          // Case: [{ analysis: [{ ... }] }]
          if (Array.isArray(first.analysis) && first.analysis.length > 0) {
            analysisItem = first.analysis[0];
          }
          // Case: [{ answer: "...", risk: "..." }]
          else if (first.answer) {
            analysisItem = {
              answer: first.answer,
              portfolio: first.portfolio || 'Analysis complete.',
              risk: first.risk || 'Unknown',
              action: first.action || 'HOLD',
              confidence: {
                score: (typeof first.confidence === 'object' && first.confidence !== null)
                  ? (first.confidence.score || 50)
                  : (first.confidence || 50),
                reason: (typeof first.confidence === 'object' && first.confidence !== null)
                  ? (first.confidence.reason || first.reason || 'Provided by AI.')
                  : (first.reason || 'Provided by AI.')
              },
              recommended_stocks: first.recommended_stocks || []
            };
          }
        }
      }

      if (analysisItem) {
        setAssistantMessages(prev => [...prev, {
          role: 'assistant',
          content: analysisItem.answer,
          analysisData: analysisItem,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      } else {
        // Ultimate fallback: display something useful
        const fallbackContent = typeof rawData === 'object' ? JSON.stringify(rawData, null, 2) : String(rawData);
        setAssistantMessages(prev => [...prev, {
          role: 'assistant',
          content: "I received the data but the format is a bit unusual. Here is the raw insight:\n\n" + fallbackContent,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }

    } catch (err) {
      console.error("Assistant error:", err);
      setAssistantMessages(prev => [...prev, {
        role: 'assistant',
        content: "Connection Error: Could not reach the AI server. Check if your ngrok tunnel is still active.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isError: true
      }]);
    } finally {
      setAssistantLoading(false);
    }
  };


  const fetchHoldings = async () => {
    try {
      const { data, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('market_value', { ascending: false });

      if (error) throw error;
      setHoldings(data || []);
    } catch (err) {
      console.error("[DASHBOARD] Fetch holdings failed:", err);
    } finally {
      setLoading(false);
    }
  }

  const fetchMarketIntelligence = async () => {
    if (intelligenceLoading) return;

    setIntelligenceLoading(true);
    try {
      const res = await fetch('/api/market-intelligence');
      const data = await res.json();

      const result = Array.isArray(data) ? data[0] : data;

      if (result && result.output) {
        const parsed = JSON.parse(result.output);

        // Only update if data is different from cache to preserve stable timestamps
        const currentDataStr = localStorage.getItem('stockos_market_intelligence');
        const newDataStr = JSON.stringify(parsed);

        if (newDataStr !== currentDataStr) {
          setMarketIntelligence(parsed);
          const now = new Date().toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          });
          setLastIntelligenceFetch(now);
          localStorage.setItem('stockos_market_intelligence', newDataStr);
          localStorage.setItem('stockos_intelligence_timestamp', now);
        }
      }
    } catch (err) {
      console.error("[DASHBOARD] Intelligence fetch failed:", err);
    } finally {
      setIntelligenceLoading(false);
    }
  }


  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('portfolio_history')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error("[DASHBOARD] Fetch history failed:", err);
    }
  }


  const fetchIndices = async () => {
    const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
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
          try { setIndices(JSON.parse(cached)); } catch (e) {}
        }
      }
    }
  }

  const refreshAll = async () => {
    setIsRefreshing(true);
    setShowSyncConsole(true);
    setSyncLogs([{ timestamp: new Date().toISOString(), message: ">>> INITIALIZING TACTICAL SYNC SEQUENCE", type: 'info' }]);
    
    const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';

    try {
      await axios.post(`${engineUrl}/api/sync`);
    } catch (err: any) {
      console.warn("[ERROR] Groww sync failed. Using cache.");
      setSyncLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "!!! SYNC DISPATCH FAILED: ENGINE UNREACHABLE", type: 'error' }]);
    }

    try {
      await Promise.all([
        fetchHoldings(),
        fetchIndices(),
        fetchMarketIntelligence()
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
          const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
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
    fetchHoldings();
    fetchHistory();
    fetchIndices();
    fetchMarketIntelligence();

    // Subscribe to Realtime Updates for Holdings & History
    const holdingsSubscription = supabase
      .channel('holdings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings' }, (payload) => {
        // Delay fetch by 1s to allow DB to settle after engine delete/insert cycle
        setTimeout(fetchHoldings, 1000);
      })
      .subscribe();

    const historySubscription = supabase
      .channel('history-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_history' }, (payload) => {
        // Delay fetch by 1s to allow DB to settle after engine delete/insert cycle
        setTimeout(fetchHistory, 1000);
      })
      .subscribe();

    // Initial fetch
    fetchMarketIntelligence();

    const interval = setInterval(fetchIndices, 60000); // Live update indices every 1 minute (was 30s)
    const intelligenceInterval = setInterval(fetchMarketIntelligence, 3600000); // Auto-refresh intelligence every 1 hour
    const syncInterval = setInterval(() => {
      fetchHoldings();
      fetchHistory();
    }, 120000); // Heartbeat fallback every 2 minutes (was 30s)

    return () => {
      clearInterval(interval);
      clearInterval(intelligenceInterval);
      clearInterval(syncInterval);
      supabase.removeChannel(holdingsSubscription);
      supabase.removeChannel(historySubscription);
    };
  }, [mounted]);


  const totalNetWorth = holdings.reduce((sum, h) => sum + (Number(h.market_value) || 0), 0);
  const totalInvested = holdings.reduce((sum, h) => sum + (Number(h.invested_value) || 0), 0);

  // Calculate Daily P/L by comparing current Net Worth with yesterday's historical snapshot
  const totalDayChange = useMemo(() => {
    if (!history || history.length === 0) return 0;

    const today = new Date().toISOString().split('T')[0];
    // Find the latest snapshot that is NOT from today
    const baselineSnapshot = [...history].reverse().find(h => {
      const snapshotDay = new Date(h.timestamp).toISOString().split('T')[0];
      return snapshotDay !== today;
    });

    // Fallback: If all history is from today, use the first ever snapshot or default to 0
    const baselineValue = baselineSnapshot
      ? Number(baselineSnapshot.total_market_value)
      : (history.length > 0 ? Number(history[0].total_market_value) : totalNetWorth);

    return totalNetWorth - baselineValue;
  }, [holdings, history, totalNetWorth]);

  const baselineForPerc = totalNetWorth - totalDayChange;
  const dayChangePerc = (totalNetWorth > 0 && baselineForPerc > 0)
    ? (totalDayChange / baselineForPerc) * 100
    : 0;

  const totalPL = totalNetWorth - totalInvested;
  const totalPLPerc = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const filteredHoldings = holdings.filter(h =>
    h.trading_symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    const now = new Date();
    let cutoff = new Date(0); // Default to ALL
    let filtered: any[] = [];

    if (timeRange === "1D") {
      const today = new Date().toISOString().split('T')[0];
      filtered = history.filter(h => h.timestamp.startsWith(today));
    } else {
      if (timeRange === "1W") {
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
      filtered = history.filter(h => new Date(h.timestamp) >= cutoff);
    }

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
        portfolio_id: lastPoint.portfolio_id
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
    // Use the very first point in our filtered range as the base
    return Number(filteredHistory[0].total_market_value) || 0;
  }, [filteredHistory, totalNetWorth, totalDayChange]);

  const rangeIsPositive = totalNetWorth >= startValue;
  const rangeChange = startValue > 0 ? ((totalNetWorth - startValue) / startValue) * 100 : 0;

  return (
    <div suppressHydrationWarning className={cn(
      "min-h-screen bg-transparent text-on-surface font-ui-body selection:bg-emerald-500/30 relative overflow-x-hidden transition-opacity duration-700",
      !mounted ? "opacity-0" : "opacity-100"
    )}>

      {/* Main Dashboard Grid */}
      <section
        className="pt-[130px] pb-6 px-12 max-w-full mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-x-10 gap-y-6 relative items-stretch"
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
              <h2 className="font-headline font-black text-7xl tracking-tighter text-white uppercase leading-none">VAIBHAV S.</h2>
              
              <div className="relative">
                <motion.div
                  whileHover={{ y: -1, scale: 1.02 }}
                  onClick={() => setIsPortfolioDropdownOpen(!isPortfolioDropdownOpen)}
                  className="flex items-center gap-2 group/portfolio cursor-pointer px-2.5 py-1 rounded-xl bg-white/[0.03] hover:bg-emerald-500/10 transition-all duration-300 border border-white/5 hover:border-emerald-500/20"
                >
                  <div className="flex flex-col">
                    <span className="text-[8px] font-terminal-label uppercase tracking-widest text-emerald-500/70 font-bold">Active Entity</span>
                    <span className="font-headline font-medium text-lg text-white tracking-tight">Groww Portfolio</span>
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
                        <div className="px-3 pt-1 pb-2">
                          <span className="text-[8px] font-terminal-label uppercase tracking-[0.2em] text-zinc-600 font-black">Connected Entities</span>
                        </div>
                        
                        <button className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 group/item transition-all">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center p-1.5">
                              <img src="/logos/groww.svg" alt="Groww" className="w-full h-full object-contain" />
                            </div>
                            <div className="flex flex-col items-start">
                              <span className="text-[13px] font-headline font-bold text-white">Groww Portfolio</span>
                              <span className="text-[10px] text-emerald-500/60 font-medium">Primary Entity</span>
                            </div>
                          </div>
                          <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        </button>

                        <div className="h-[1px] bg-white/5 mx-2 my-1" />

                        <button 
                          onClick={() => {
                            setIsPortfolioDropdownOpen(false);
                            setAddPortfolioModalOpen(true);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 group/add transition-all text-zinc-400 hover:text-white"
                        >
                          <div className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center group-hover/add:border-emerald-500/40 group-hover/add:bg-emerald-500/10 transition-all">
                            <Wallet className="w-4 h-4 transition-transform group-hover/add:scale-110" />
                          </div>
                          <span className="text-[13px] font-headline font-bold uppercase tracking-wider">Link New Entity</span>
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
            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-8 mb-0 items-end">
            {/* Metric 1: Total Net Worth */}
            <div className="relative group">
              <div className="absolute -inset-4 bg-emerald-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <span className="font-terminal-label uppercase tracking-wider text-[12px] text-emerald-400 block mb-1 font-bold relative z-10">Total Net Worth</span>
              <h1 className="font-headline font-bold text-4xl md:text-5xl tracking-tighter text-white tabular-nums leading-none relative z-10">
                {formatCurrency(totalNetWorth)}
              </h1>
            </div>

            {/* Metric 2: Daily P/L */}
            <div className="flex flex-col gap-1 border-l border-white/5 pl-6">
              <span className="font-terminal-label uppercase tracking-wider text-[12px] text-zinc-300 block mb-1 font-bold">Daily P/L</span>
              <div className="flex items-center gap-4">
                <span className={`font-headline font-bold text-2xl md:text-3xl tabular-nums ${
                  ((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0) ? 'text-zinc-500' : (totalDayChange > 0 ? 'text-emerald-500' : 'text-red-500')
                }`}>
                  {((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0) ? '₹0' : `${totalDayChange > 0 ? '+' : ''}${formatCurrency(totalDayChange)}`}
                </span>
                <span className={`font-terminal-label border px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${
                  ((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0) 
                    ? 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' 
                    : (totalDayChange > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')
                }`}>
                  {((timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0) ? '0.00%' : `${totalDayChange > 0 ? '+' : ''}${dayChangePerc.toFixed(2)}%`}
                </span>
              </div>
            </div>

            {/* Metric 3: Aggregate P/L */}
            <div className="flex flex-col gap-1 border-l border-white/5 pl-6">
              <span className="font-terminal-label uppercase tracking-wider text-[11px] text-zinc-400 block font-bold">Aggregate P/L</span>
              <div className="flex items-center gap-4">
                <span className={`font-headline font-bold text-xl md:text-2xl tabular-nums ${
                  totalPL === 0 ? 'text-zinc-500' : (totalPL > 0 ? 'text-emerald-500' : 'text-red-500')
                }`}>
                  {totalPL === 0 ? '₹0' : `${totalPL > 0 ? '+' : ''}${formatCurrency(totalPL)}`}
                </span>
                <span className={`font-terminal-label px-2 py-0.5 rounded-[4px] text-[10px] font-bold border transition-all duration-500 ${
                  totalPL === 0 ? 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' : (totalPL > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')
                }`}>
                  {totalPLPerc.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
          </div>

          {/* Performance Chart */}
          <motion.section
            className="glass-panel rounded-3xl pt-4 px-6 pb-4 relative group border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-gradient-to-b from-white/[0.04] to-transparent h-full transition-all duration-500"
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
                  <span className="font-headline font-bold text-4xl tracking-tighter text-white tabular-nums">{formatCurrency(totalNetWorth)}</span>
                  <span className={`font-terminal-label text-[10px] border px-2 py-0.5 rounded-[4px] uppercase tracking-widest font-bold ${
                    (timeRange === '1D' && getMarketStatus('IN') === 'CLOSED')
                      ? 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                      : (rangeIsPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20')
                  }`}>
                    {(timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') ? '0.00%' : `${rangeIsPositive ? '+' : ''}${rangeChange.toFixed(2)}%`}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 relative z-20">
                {['1D', '1W', '1M', '1Y', 'ALL'].map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
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
                {timeRange === '1D' && getMarketStatus('IN') === 'CLOSED' ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40 gap-4">
                  <div className="p-4 rounded-full bg-white/5 border border-white/10">
                    <Moon className="w-8 h-8 text-zinc-400" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-terminal-label text-[10px] uppercase tracking-[0.4em] text-white">Market is Closed Today</span>
                    <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">1D INTRA-DAY GRAPHS ARE NOT ACTIVE</span>
                  </div>
                </div>
              ) : filteredHistory.length > 0 ? (
                <WealthChart data={Object.values(
                  filteredHistory.reduce((acc: any, h) => {
                    if (!h.timestamp) return acc;
                    const dateParts = h.timestamp.split('T');
                    if (dateParts.length < 1) return acc;
                    const date = dateParts[0];
                    const ts = new Date(`${date}T15:30:00`).getTime();
                    if (isNaN(ts)) return acc;
                    const timestamp = Math.floor(ts / 1000);
                    acc[date] = { time: timestamp as any, value: h.total_market_value };
                    return acc;
                  }, {})
                ) as { time: string; value: number }[]} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
                  <Cpu className="w-12 h-12 animate-pulse" />
                  <span className="font-terminal-label text-[10px] uppercase tracking-[0.4em]">Synchronizing Market Data...</span>
                </div>
              )}
            </div>
        </motion.section>
        </motion.div>

        {/* TOP ROW RIGHT: Sidebar */}
        <motion.aside
          animate={{ 
            opacity: isPortfolioDropdownOpen ? 0.8 : 1,
            scale: isPortfolioDropdownOpen ? 0.995 : 1
          }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel rounded-3xl border border-white/10 bg-[#0a0d14]/80 backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.4)] group/sidebar overflow-hidden h-full flex flex-col transition-all duration-500 relative"
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

          <div className="flex flex-col h-full overflow-hidden">
            {/* Clean Header */}
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                <span className="font-headline text-[13px] uppercase tracking-[0.2em] text-white font-bold">
                  Research Assistant
                </span>
              </div>
              <motion.button
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.5 }}
                onClick={() => setAssistantMessages([{
                  role: 'assistant',
                  content: 'Hello! I am ready to help with your market research. Ask me about any stock or portfolio risk.',
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  hideFeedback: true
                }])}
                className="p-2 rounded-xl bg-white/5 hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-400 transition-all duration-300"
              >
                <RefreshCcw className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Chat Area - Bottom-Anchored */}
            <div
              ref={chatContainerRef}
              className="flex-grow p-8 overflow-y-auto custom-scrollbar flex flex-col gap-10 scroll-smooth"
            >
              <div className="flex-grow" />
              <AnimatePresence mode="popLayout" initial={false}>
                {assistantMessages.map((msg, i) => (
                  <motion.div
                    key={`${msg.timestamp}-${i}`}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 260,
                      damping: 20
                    }}
                    className={cn(
                      "flex flex-col gap-4",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        {msg.role === 'assistant' ? 'Assistant' : 'You'}
                      </span>
                      <span className="text-[10px] text-zinc-700 font-medium tabular-nums uppercase">{msg.timestamp}</span>
                    </div>

                    <div className={cn(
                      "relative p-6 rounded-3xl text-[15px] leading-[1.6] transition-all duration-500",
                      msg.role === 'user'
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-50 rounded-tr-sm"
                        : msg.isError
                          ? "bg-red-500/10 border border-red-500/20 text-red-200 rounded-tl-sm"
                          : "bg-white/[0.03] border border-white/10 text-zinc-200 rounded-tl-sm shadow-xl"
                    )}>
                      <span className="relative z-10 whitespace-pre-wrap">{msg.content}</span>

                      {/* Analysis Data */}
                      {msg.analysisData && (
                        <motion.div
                          initial="hidden"
                          animate="visible"
                          variants={{
                            hidden: { opacity: 0 },
                            visible: {
                              opacity: 1,
                              transition: { staggerChildren: 0.1, delayChildren: 0.4 }
                            }
                          }}
                          className="mt-8 space-y-4 pt-8 border-t border-white/5"
                        >
                          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                <Database className="w-3.5 h-3.5 text-emerald-500" />
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Portfolio Breakdown</span>
                            </div>
                            <p className="text-[14px] text-white/90 leading-relaxed font-medium">{msg.analysisData.portfolio}</p>
                          </motion.div>

                          <div className="grid grid-cols-2 gap-4">
                            <motion.div variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-red-500/10 transition-colors">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Risk Level</span>
                              </div>
                              <p className="text-[14px] text-white font-black tracking-tight">{msg.analysisData.risk}</p>
                            </motion.div>
                            <motion.div variants={{ hidden: { opacity: 0, x: 10 }, visible: { opacity: 1, x: 0 } }} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-amber-500/10 transition-colors">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Action</span>
                              </div>
                              <span className={cn(
                                "text-[12px] font-black px-4 py-1.5 rounded-xl border",
                                msg.analysisData.action === 'BUY' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                  msg.analysisData.action === 'SELL' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                    "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              )}>
                                {msg.analysisData.action}
                              </span>
                            </motion.div>
                          </div>

                          {/* Recommended Stocks Section */}
                          {msg.analysisData.recommended_stocks && msg.analysisData.recommended_stocks.length > 0 && (
                            <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Actionable Suggestions</span>
                              </div>
                              <div className="space-y-3">
                                {msg.analysisData.recommended_stocks.map((stock: any, sidx: number) => (
                                  <div key={sidx} className="flex justify-between items-center p-3 rounded-xl bg-black/20 border border-white/5">
                                    <div className="flex flex-col">
                                      <span className="text-[13px] font-black text-white">{stock.symbol}</span>
                                      <span className="text-[11px] text-zinc-500 line-clamp-1 italic">{stock.reason}</span>
                                    </div>
                                    <span className={cn(
                                      "text-[9px] font-black px-3 py-1 rounded-lg border",
                                      stock.action === 'BUY' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                                    )}>
                                      {stock.action}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}

                          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/[0.03] to-transparent border border-white/5">
                            <div className="flex justify-between items-center mb-5">
                              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">AI Confidence</span>
                              <span className="text-[16px] font-black text-emerald-400 tabular-nums">
                                {msg.analysisData.confidence.score}%
                              </span>
                            </div>
                            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden mb-5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${msg.analysisData.confidence.score}%` }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                              />
                            </div>
                            <p className="text-[13px] text-zinc-400 leading-relaxed italic border-l-2 border-emerald-500/20 pl-4 py-1">
                              "{msg.analysisData.confidence.reason}"
                            </p>
                          </motion.div>
                        </motion.div>
                      )}

                      {/* Interactive Feedback - Nice & Subtle */}
                      {msg.role === 'assistant' && !msg.isError && !msg.hideFeedback && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1 }}
                          className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between"
                        >
                          <span className="text-[11px] text-zinc-500 font-medium">Was this research helpful?</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setAssistantMessages(prev => prev.map((m, idx) =>
                                  idx === i ? { ...m, feedbackProvided: 'positive' } : m
                                ));
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-xl transition-all",
                                msg.feedbackProvided === 'positive' ? "bg-emerald-500 text-white" : "bg-white/5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                              )}
                            >
                              <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                Good <ThumbsUp className="w-3 h-3" />
                              </span>
                            </button>
                            <button
                              onClick={() => {
                                setAssistantMessages(prev => prev.map((m, idx) =>
                                  idx === i ? { ...m, feedbackProvided: 'negative' } : m
                                ));
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-xl transition-all",
                                msg.feedbackProvided === 'negative' ? "bg-red-500 text-white" : "bg-white/5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                              )}
                            >
                              <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                Bad <ThumbsDown className="w-3 h-3" />
                              </span>
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {msg.feedbackProvided && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mt-3 text-[11px] text-emerald-500 font-bold tracking-tight italic"
                        >
                          Thank you for your feedback!
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ))}

                {assistantLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col gap-4 items-start"
                  >
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500">Researching Portfolio...</span>
                    </div>
                    <motion.div
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="px-6 py-4 rounded-2xl bg-white/[0.02] border border-white/5 text-zinc-400 text-[14px] leading-relaxed italic"
                    >
                      Gathering market intelligence and analyzing your performance...
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-8 bg-black/40 border-t border-white/5 backdrop-blur-2xl shrink-0 mt-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const input = form.elements.namedItem('ticker') as HTMLInputElement;
                  const val = input.value.trim();
                  if (!val || assistantLoading) return;
                  handleAssistantQuery(val);
                  input.value = "";
                }}
                className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-2 focus-within:border-emerald-500/50 focus-within:bg-white/[0.05] transition-all group"
              >
                <input
                  name="ticker"
                  type="text"
                  placeholder="Ask a question or enter a ticker..."
                  autoComplete="off"
                  disabled={assistantLoading}
                  className="flex-grow bg-transparent py-2 text-[14px] text-white placeholder:text-zinc-600 focus:outline-none disabled:opacity-30"
                />
                <motion.button
                  type="submit"
                  disabled={assistantLoading}
                  whileHover={{ x: 3 }}
                  whileTap={{ x: -1 }}
                  className="p-2 rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition-all disabled:opacity-30 shrink-0"
                >
                  {assistantLoading ? (
                    <RefreshCcw className="w-4 h-4 animate-spin text-emerald-500/50" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </motion.button>
              </form>
            </div>
          </div>
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
            className="glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-gradient-to-b from-white/[0.02] to-transparent"
          >
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

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-6 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Stock Details</th>
                    <th className="px-5 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 text-right font-bold">Quantity</th>
                    <th className="px-5 py-3 font-terminal-label text-[9px] uppercase tracking-wider text-zinc-500 text-right font-bold">Avg. Cost</th>
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
                              {searchQuery ? "No Matching Assets" : "Portfolio Not Found"}
                            </span>
                            <span className="font-data-sm text-[11px] text-zinc-500 uppercase tracking-widest">
                              {searchQuery ? "Adjust your search query" : "Awaiting market data stream"}
                            </span>
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
                              <span className="font-headline font-bold text-sm text-white tracking-tight group-hover:text-emerald-400 transition-colors">{asset.trading_symbol}</span>
                              <span className="font-terminal-label text-[9px] text-zinc-600 uppercase tracking-widest mt-1">NSE:EQUITY</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right font-data-md text-xs text-white/50 tabular-nums">{asset.quantity}</td>
                          <td className="px-6 py-5 text-right font-data-md text-xs text-white/50 tabular-nums">{formatCurrency(Number(asset.invested_value) || 0)}</td>
                          <td className="px-6 py-5 text-right font-data-md text-xs text-white tabular-nums">{formatCurrency(Number(asset.market_value) || 0)}</td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-data-md text-sm font-bold tabular-nums ${Number(asset.p_l) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {Number(asset.p_l) >= 0 ? '+' : ''}{formatCurrency(Number(asset.p_l) || 0)}
                              </span>
                              <span className={`font-terminal-label text-[10px] font-bold tabular-nums mt-1 ${Number(asset.p_l) >= 0 ? 'text-emerald-500/40' : 'text-red-500/40'}`}>
                                {(Number(asset.p_l_percentage) || 0).toFixed(2)}%
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
                onClick={refreshAll}
                disabled={isRefreshing}
                className={`font-terminal-label text-[10px] uppercase tracking-[0.25em] font-bold flex items-center gap-2 transition-all ${isRefreshing ? 'text-emerald-500 animate-pulse' : 'text-emerald-500/60 hover:text-emerald-500'}`}
              >
                <RefreshCcw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Fetching Data..' : 'Refresh Data'}
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
          className="glass-panel rounded-3xl border border-white/10 bg-[#0a0d14]/80 backdrop-blur-3xl shadow-2xl overflow-hidden flex flex-col"
        >
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

      {/* Full-Width Market Intelligence Feed */}
      <div className="max-w-full mx-auto px-12 pb-16">
        <motion.section
          className="glass-panel rounded-3xl flex flex-col border border-white/10 shadow-[0_0_100px_rgba(16,185,129,0.05)] bg-gradient-to-br from-white/[0.02] to-transparent transition-all duration-500 relative"
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

          <div className="px-8 py-5 border-b border-emerald-500/10 bg-emerald-500/[0.03] flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Newspaper className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-terminal-label text-[11px] uppercase tracking-wider text-white font-black">Market Intelligence</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Activity className="w-2.5 h-2.5 text-emerald-500/40" />
                  <p className="text-[9px] text-emerald-500/40 uppercase tracking-wider font-bold">
                    LAST UPDATED: {(mounted && lastIntelligenceFetch) ? lastIntelligenceFetch : 'SYNCHRONIZING...'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {marketIntelligence?.overall_sentiment && (
                <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full animate-pulse",
                    marketIntelligence.overall_sentiment === "BULLISH" ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-red-500 shadow-[0_0_8px_#ef4444]"
                  )} />
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-wider",
                    marketIntelligence.overall_sentiment === "BULLISH" ? "text-emerald-400" : "text-red-400"
                  )}>
                    {marketIntelligence.overall_sentiment} SENTIMENT
                  </span>
                </div>
              )}
              {intelligenceLoading && marketIntelligence && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/10">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 animate-pulse">Updating Insights</span>
                </div>
              )}
              <button
                onClick={fetchMarketIntelligence}
                disabled={intelligenceLoading}
                className="p-2.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/30 transition-all disabled:opacity-50 group"
              >
                <RefreshCcw className={cn("w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-700", intelligenceLoading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
            <AnimatePresence mode="popLayout">
              {intelligenceLoading && !marketIntelligence ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="col-span-full py-48 flex flex-col items-center justify-center gap-8"
                >
                  <div className="relative">
                    <RefreshCcw className="w-16 h-16 animate-spin text-emerald-500" />
                    <div className="absolute inset-0 blur-3xl bg-emerald-500/40 animate-pulse" />
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <span className="font-terminal-label text-[11px] uppercase tracking-widest text-emerald-400 animate-pulse font-bold">Analyzing Market Trends</span>
                    <div className="w-80 h-[1px] bg-white/5 relative overflow-hidden">
                      <motion.div
                        initial={{ left: '-100%' }}
                        animate={{ left: '100%' }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                        className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : marketIntelligence?.sectors ? (
                marketIntelligence.sectors.map((sector: any, idx: number) => (
                  <motion.div
                    key={sector.sectorName || idx}
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: idx * 0.12, ease: [0.16, 1, 0.3, 1] }}
                    className="group"
                  >
                    <div className="glass-panel p-5 rounded-2xl border border-white/[0.03] group-hover:border-emerald-500/30 transition-all duration-500 flex flex-col gap-5 h-full bg-black/20 relative overflow-hidden">

                      {/* Background Accents */}
                      <div className="absolute -right-8 -top-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                        <TrendingUp className={cn(
                          "w-48 h-48 rotate-12",
                          sector.sentiment === "BULLISH" ? "text-emerald-500" : "text-red-500"
                        )} />
                      </div>

                      <div className="flex justify-between items-start relative z-10">
                        <div className="space-y-3">
                          <div className={cn(
                            "text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border w-fit shadow-2xl backdrop-blur-md",
                            sector.sentiment === "BULLISH" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              sector.sentiment === "BEARISH" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                "bg-zinc-800/40 text-zinc-400 border-zinc-700/50"
                          )}>
                            {sector.sectorName}
                          </div>
                          {sector.riskLevel && (
                            <div className="flex items-center gap-2 px-1">
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                sector.riskLevel === "Low" ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" :
                                  sector.riskLevel === "Medium" ? "bg-yellow-500 shadow-[0_0_8px_#f59e0b]" :
                                    "bg-red-500 shadow-[0_0_8px_#ef4444]"
                              )} />
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-black">
                                {sector.riskLevel} Risk
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[22px] font-black font-data tabular-nums text-white group-hover:text-emerald-400 transition-colors leading-none tracking-tight">
                            {typeof sector.confidence === 'object' ? sector.confidence.score : sector.confidence}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-black">Confidence</span>
                        </div>
                      </div>

                      <div className="relative flex-grow">
                        <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-emerald-500/40 via-emerald-500/5 to-transparent rounded-full" />
                        <p className="text-[13px] text-zinc-300 leading-relaxed group-hover:text-white transition-colors pl-5 font-medium">
                          {sector.reasoning}
                        </p>
                      </div>

                      {sector.topStocks && sector.topStocks.length > 0 && (
                        <div className="mt-auto space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-black whitespace-nowrap">Asset Flows</span>
                            <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {sector.topStocks.map((stock: any, sIdx: number) => (
                              <motion.div
                                key={stock.symbol || sIdx}
                                onClick={() => {
                                  const sym = stock.symbol.toUpperCase();
                                  // Institutional Heuristic: US symbols are typically <= 5 chars and alphabetic
                                  // Indian symbols in our DB are often longer or mapped differently
                                  const isUs = sym.length <= 5 && !sym.includes('.');
                                  const route = isUs ? `/us-stocks/${sym}` : `/stocks/${sym}`;
                                  router.push(route);
                                }}
                                className="bg-zinc-900/40 p-3 rounded-xl border border-white/[0.03] flex flex-col gap-2 transition-all duration-300 cursor-pointer group/stock"
                              >
                                <div className="flex justify-between items-start">
                                  <div className="flex flex-col">
                                    <span className="text-[12px] font-black text-white font-data group-hover/stock:text-emerald-400 transition-colors">{stock.symbol}</span>
                                    <span className={cn(
                                      "text-[8px] font-black px-1.5 py-0.5 rounded-md w-fit tracking-tighter uppercase mt-0.5",
                                      stock.rating === 'BUY' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                                    )}>{stock.rating || 'TRACK'}</span>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[12px] font-bold text-zinc-100 font-data tabular-nums">₹{stock.price}</div>
                                    <div className={cn(
                                      "text-[9px] font-black tabular-nums font-data",
                                      String(stock.change).startsWith('+') ? "text-emerald-400" : "text-red-400"
                                    )}>{stock.change}</div>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="col-span-full py-48 flex flex-col items-center justify-center gap-6 opacity-30">
                  <Database className="w-16 h-16 text-zinc-500" />
                  <span className="font-terminal-label text-[14px] uppercase tracking-widest">No Insights Available</span>
                </div>
              )}
            </AnimatePresence>
          </div>

          {(marketIntelligence?.actionableInsights || marketIntelligence?.marketRisks || marketIntelligence?.executiveSummary) && (
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="p-8 bg-emerald-500/[0.02] border-t border-white/5 grid grid-cols-1 lg:grid-cols-3 gap-10"
            >
              {marketIntelligence.executiveSummary && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Activity className="w-4 h-4 text-emerald-500" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Analysis Summary</h4>
                  </div>
                  <p className="text-[13px] text-zinc-400 leading-relaxed font-medium italic border-l-2 border-emerald-500/30 pl-6">
                    "{marketIntelligence.executiveSummary}"
                  </p>
                </div>
              )}
              {marketIntelligence.actionableInsights && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <Cpu className="w-4 h-4 text-blue-500" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-400">Recommendations</h4>
                  </div>
                  <ul className="space-y-3">
                    {(Array.isArray(marketIntelligence.actionableInsights) ? marketIntelligence.actionableInsights : [marketIntelligence.actionableInsights]).map((insight: string, i: number) => (
                      <li key={i} className="text-[12px] text-zinc-300 flex items-start gap-4 group/item">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] group-hover/item:scale-110 transition-transform" />
                        <span className="group-hover/item:text-white transition-colors">{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {marketIntelligence.marketRisks && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                      <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-red-400">Market Risks</h4>
                  </div>
                  <ul className="space-y-3">
                    {(Array.isArray(marketIntelligence.marketRisks) ? marketIntelligence.marketRisks : [marketIntelligence.marketRisks]).map((risk: string, i: number) => (
                      <li key={i} className="text-[12px] text-zinc-300 flex items-start gap-4 group/item">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] group-hover/item:scale-110 transition-transform" />
                        <span className="group-hover/item:text-white transition-colors">{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </motion.section>
        {/* Add Portfolio Modal - Portaled to Body to bypass transforms */}
      {mounted && addPortfolioModalOpen && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setAddPortfolioModalOpen(false); setNewPortfolioType(""); setGrowwApiKey(""); setGrowwTotpSecret(""); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-[420px] glass-panel border border-white/10 rounded-[24px] overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
            >
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <Wallet className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="font-headline font-bold text-lg text-white tracking-tight">Add Portfolio</h2>
                    <p className="text-[9px] font-terminal-label uppercase tracking-widest text-zinc-500 font-bold mt-0.5">Link Institutional Entity</p>
                  </div>
                </div>
                <button
                  onClick={() => { setAddPortfolioModalOpen(false); setNewPortfolioType(""); setGrowwApiKey(""); setGrowwTotpSecret(""); }}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-[9px] font-terminal-label uppercase tracking-widest text-zinc-600 font-bold px-1">Select Brokerage Provider</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { 
                        id: 'GROWW', 
                        name: 'Groww', 
                        node: (
                          <img 
                            src="/logos/groww.svg" 
                            alt="Groww" 
                            className="w-full h-full object-contain transition-all duration-500" 
                          />
                        )
                      },
                      { 
                        id: 'ZERODHA', 
                        name: 'Zerodha', 
                        node: (
                          <img 
                            src="/logos/zerodha.svg" 
                            alt="Zerodha" 
                            className="w-full h-full object-contain transition-all duration-500" 
                          />
                        )
                      }
                    ].map((broker) => (
                      <button
                        key={broker.id}
                        onClick={() => setNewPortfolioType(broker.id as any)}
                        className={cn(
                          "p-3 rounded-xl border transition-all duration-300 flex flex-col items-center gap-2 group relative overflow-hidden",
                          newPortfolioType === broker.id
                            ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                            : "bg-white/[0.01] border-white/5 hover:border-white/20 hover:bg-white/[0.04] hover:shadow-[0_0_40px_rgba(255,255,255,0.02)]"
                        )}
                      >
                        <div className="w-12 h-12 flex items-center justify-center p-1">
                          <div className={cn("w-full h-full transition-all duration-500", newPortfolioType === broker.id ? "scale-110 opacity-100" : "opacity-100 group-hover:scale-110")}>
                            {broker.node}
                          </div>
                        </div>
                        <span className={cn(
                          "font-headline text-[12px] font-black tracking-tight uppercase",
                          newPortfolioType === broker.id ? "text-emerald-400" : "text-zinc-300 group-hover:text-white"
                        )}>{broker.name}</span>
                        {newPortfolioType === broker.id && (
                          <motion.div layoutId="active-broker" className="absolute inset-0 border-2 border-emerald-500/20 rounded-xl" />
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
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <label className="text-[9px] font-terminal-label uppercase tracking-widest text-zinc-600 font-bold px-1">Groww API Key</label>
                        <div className="relative group">
                          <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" />
                          <input
                            type="password"
                            value={growwApiKey}
                            onChange={(e) => setGrowwApiKey(e.target.value)}
                            placeholder="Enter Groww API Key..."
                            className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-[13px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-terminal-label uppercase tracking-widest text-zinc-600 font-bold px-1">Groww TOTP Secret</label>
                        <div className="relative group">
                          <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" />
                          <input
                            type="password"
                            value={growwTotpSecret}
                            onChange={(e) => setGrowwTotpSecret(e.target.value)}
                            placeholder="Enter TOTP Secret..."
                            className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-[13px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 transition-all"
                          />
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
                      className="p-4 rounded-xl bg-white/[0.01] border border-white/5 flex flex-col items-center justify-center gap-3 text-center"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-zinc-600" />
                      </div>
                      <p className="text-[12px] text-zinc-500 leading-relaxed font-bold uppercase tracking-wider">Zerodha integration requires Kite Connect API access.</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="pt-2">
                  <button
                    disabled={!newPortfolioType || (newPortfolioType === 'GROWW' && (!growwApiKey || !growwTotpSecret))}
                    className="w-full py-3.5 rounded-xl bg-emerald-500 text-black font-headline font-black text-[12px] uppercase tracking-wider shadow-[0_10px_30px_rgba(16,185,129,0.2)] hover:shadow-[0_15px_40px_rgba(16,185,129,0.4)] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 disabled:shadow-none"
                  >
                    Link Portfolio Entity
                  </button>
                  <div className="flex items-center justify-center gap-2 mt-5">
                    <ShieldCheck className="w-3 h-3 text-zinc-700" />
                    <p className="text-[8px] font-terminal-label uppercase tracking-[0.25em] text-zinc-700 font-bold">
                      AES-256 Vault Encryption
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </div>

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
