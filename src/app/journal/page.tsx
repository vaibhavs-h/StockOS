"use client";

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  ExternalLink,
  Bookmark,
  Flame,
  Globe,
  Flag,
  Save,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Cpu,
  SlidersHorizontal,
  RefreshCw,
  X,
  Search,
  User,
  Layers,
  Sparkles,
  BookOpen,
  ArrowUpRight,
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import StockOSPortal from "@/components/shared/Portal";

const API_BASE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:3003";

const tabs = [
  { label: "Global News", value: "global", icon: <Globe className="size-4" /> },
  { label: "India News", value: "india", icon: <Flag className="size-4" /> },
  { label: "Saved Articles", value: "saved", icon: <Save className="size-4" /> },
];

const DOW_30 = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'WMT', 'JPM', 'UNH', 'HD', 'PG', 'DIS',
  'VZ', 'KO', 'MCD', 'CRM', 'INTC', 'JNJ', 'AXP', 'MRK', 'GS', 'HON',
  'CAT', 'BA', 'CVX', 'CSCO', 'IBM', 'AMGN', 'NKE', 'TRV', 'MMM', 'DOW'
];

const NIFTY_50 = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 'LT',
  'BAJFINANCE', 'KOTAKBANK', 'HCLTECH', 'AXISBANK', 'SUNPHARMA', 'ASIANPAINT', 'TITAN', 'ULTRACEMCO', 'NTPC', 'ONGC',
  'TATASTEEL', 'ADANIENT', 'ADANIPORTS', 'POWERGRID', 'JSWSTEEL', 'COALINDIA', 'HINDALCO', 'MARUTI', 'INDUSINDBK', 'GRASIM',
  'TECHM', 'NESTLEIND', 'BAJAJFINSV', 'SBILIFE', 'EICHERMOT', 'BPCL', 'CIPLA', 'TATACONSUM', 'DRREDDY', 'BRITANNIA',
  'HEROMOTOCO', 'APOLLOHOSP', 'BEL', 'HAL', 'WIPRO', 'JIOFIN', 'SHRIRAMFIN'
];

const impactMeta = {
  HIGH: {
    label: "High Impact",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    glow: "shadow-[0_0_15px_rgba(244,63,94,0.15)]",
    dot: "bg-rose-500",
    weight: 3,
  },
  MEDIUM: {
    label: "Medium Impact",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    glow: "shadow-[0_0_15px_rgba(245,158,11,0.1)]",
    dot: "bg-amber-500",
    weight: 2,
  },
  LOW: {
    label: "Low Impact",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    glow: "shadow-[0_0_15px_rgba(6,182,212,0.05)]",
    dot: "bg-cyan-500",
    weight: 1,
  },
};

function normalizeImpact(impact: string) {
  const normalized = String(impact || "LOW").toUpperCase();
  return impactMeta[normalized as keyof typeof impactMeta] ? normalized : "LOW";
}

function formatDateTime(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Custom Premium Circular SVG Gauge
function CircularGauge({ score, size = 120 }: { score: number; size?: number }) {
  const radius = size * 0.4;
  const strokeWidth = size * 0.08;
  const circumference = 2 * Math.PI * radius;
  
  // Map -1..1 to 0..1 range
  const normalized = (score + 1) / 2;
  const strokeDashoffset = circumference - normalized * circumference;

  // Determine colors based on score
  let strokeColor = "stroke-cyan-500";
  let glowColor = "rgba(6, 182, 212, 0.4)";
  let labelText = "Neutral";
  
  if (score >= 0.35) {
    strokeColor = "stroke-emerald-500";
    glowColor = "rgba(16, 185, 129, 0.4)";
    labelText = "Bullish";
  } else if (score >= 0.1) {
    strokeColor = "stroke-emerald-400/80";
    glowColor = "rgba(52, 211, 153, 0.3)";
    labelText = "Somewhat Bullish";
  } else if (score <= -0.35) {
    strokeColor = "stroke-rose-500";
    glowColor = "rgba(244, 63, 94, 0.4)";
    labelText = "Bearish";
  } else if (score <= -0.1) {
    strokeColor = "stroke-rose-400/80";
    glowColor = "rgba(251, 113, 133, 0.3)";
    labelText = "Somewhat Bearish";
  }

  const sign = score > 0 ? "+" : "";

  return (
    <div className="flex flex-col items-center justify-center select-none" style={{ width: size, height: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background track circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="stroke-[#101524] fill-none"
            strokeWidth={strokeWidth}
          />
          {/* Neon progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className={cn("fill-none transition-all duration-1000", strokeColor)}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${glowColor})`
            }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-black tracking-tighter text-white tabular-nums">
            {sign}{score.toFixed(2)}
          </span>
          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500 max-w-[80px] truncate">
            {labelText}
          </span>
        </div>
      </div>
    </div>
  );
}

// Glowing Spotlight Card Component with dynamic sentiment borders
function SpotlightCard({
  children,
  className,
  sentimentScore,
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  sentimentScore?: number | null;
  onClick?: () => void;
}) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Determine spotlight color based on sentiment score
  let spotlightColor = "rgba(16, 185, 129, 0.08)"; // Emerald
  let spotlightBorder = "rgba(16, 185, 129, 0.22)";
  let activeBorder = "hover:border-emerald-500/30";

  if (sentimentScore !== undefined && sentimentScore !== null) {
    if (sentimentScore >= 0.1) {
      spotlightColor = "rgba(16, 185, 129, 0.08)";
      spotlightBorder = "rgba(16, 185, 129, 0.22)";
      activeBorder = "hover:border-emerald-500/30";
    } else if (sentimentScore <= -0.1) {
      spotlightColor = "rgba(244, 63, 94, 0.08)"; // Rose
      spotlightBorder = "rgba(244, 63, 94, 0.22)";
      activeBorder = "hover:border-rose-500/30";
    } else {
      spotlightColor = "rgba(6, 182, 212, 0.08)"; // Cyan
      spotlightBorder = "rgba(6, 182, 212, 0.22)";
      activeBorder = "hover:border-cyan-500/30";
    }
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={cn(
        "relative rounded-xl p-4 flex flex-col bg-[#080c14]/35 backdrop-blur-xl border border-white/[0.08] transition-all duration-500 overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] group",
        onClick && "cursor-pointer hover:shadow-black/40 hover:-translate-y-1",
        activeBorder,
        className
      )}
    >
      {/* Dynamic Hover Spotlight Background */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(450px circle at ${coords.x}px ${coords.y}px, ${spotlightColor}, transparent 45%)`,
        }}
      />
      {/* Spotlight Glow Border */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(100px circle at ${coords.x}px ${coords.y}px, ${spotlightBorder}, transparent 40%)`,
        }}
      />
      {children}
    </div>
  );
}

function JournalPageContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id || "guest";

  const searchParams = useSearchParams();
  const queryArticleId = searchParams.get("articleId");

  const [activeTab, setActiveTab] = useState("global");
  const [sortMode, setSortMode] = useState("newest");
  const [trendingMode, setTrendingMode] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [monthlyNews, setMonthlyNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Advanced Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [impactFilter, setImpactFilter] = useState<string>("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  // Selected article for detailed Drawer
  const [activeItem, setActiveItem] = useState<any | null>(null);
  const [closedArticleId, setClosedArticleId] = useState<string | null>(null);
  const openingArticleId = React.useRef<string | null>(null);

  // Lock body scroll when an article modal is open
  useEffect(() => {
    if (activeItem) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [activeItem]);

  const handleCloseModal = () => {
    openingArticleId.current = null;
    if (queryArticleId) {
      setClosedArticleId(queryArticleId);
    }
    setActiveItem(null);
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("articleId")) {
      params.delete("articleId");
      const newSearch = params.toString();
      const newPath = window.location.pathname + (newSearch ? `?${newSearch}` : "");
      router.replace(newPath, { scroll: false });
    }
  };

  const handleOpenArticle = (item: any) => {
    openingArticleId.current = item._id;
    setActiveItem(item);
    const params = new URLSearchParams(searchParams.toString());
    params.set("articleId", item._id);
    const newSearch = params.toString();
    const newPath = window.location.pathname + `?${newSearch}`;
    router.push(newPath, { scroll: false });
  };

  // Deep-link auto-expansion for single article routing
  useEffect(() => {
    let active = true;

    if (!queryArticleId) {
      if (openingArticleId.current) {
        return;
      }
      setClosedArticleId(null);
      setActiveItem(null);
      return;
    }

    if (queryArticleId === openingArticleId.current) {
      openingArticleId.current = null;
    }

    if (activeItem?._id === queryArticleId) return;
    if (closedArticleId === queryArticleId) return;

    // Search cache first
    const cachedItem = news.find(item => item._id === queryArticleId);
    if (cachedItem) {
      setActiveItem(cachedItem);
      return;
    }

    // Fetch from single article API endpoint
    const fetchSingleArticle = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/news/${queryArticleId}?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data && data._id) {
            setActiveItem(data);
          }
        }
      } catch (err) {
        console.error("Failed to load deep-linked news article:", err);
      }
    };
    fetchSingleArticle();

    return () => {
      active = false;
    };
  }, [queryArticleId, news, userId, activeItem?._id, closedArticleId]);

  // Pagination & Loading States
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Scroll anchor: remember scroll position before appending more news so we
  // can restore it after React re-renders and avoid the page jumping to the bottom.
  const scrollAnchorY = React.useRef<number>(0);

  const fetchNewsCategory = async (
    category: string,
    pageNum: number = 1,
    filters?: { ticker?: string | null; sentiment?: string; impact?: string; search?: string }
  ) => {
    const params = new URLSearchParams({
      category,
      userId,
      page: String(pageNum),
      limit: "30"
    });

    if (filters) {
      if (filters.ticker) params.append("ticker", filters.ticker);
      if (filters.sentiment && filters.sentiment !== "all") params.append("sentiment", filters.sentiment);
      if (filters.impact && filters.impact !== "all") params.append("impact", filters.impact);
      if (filters.search && filters.search.trim()) params.append("search", filters.search.trim());
    }

    const response = await fetch(`${API_BASE_URL}/api/news?${params.toString()}`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    
    return {
      news: data.news || [],
      hasMore: data.hasMore !== undefined ? data.hasMore : false
    };
  };

  // Reset all filters when the active tab changes
  useEffect(() => {
    setSelectedTicker(null);
    setSearchQuery("");
    setSentimentFilter("all");
    setImpactFilter("all");
  }, [activeTab]);

  // Load monthly news metrics (totals, composition, active stocks list) on tab change
  useEffect(() => {
    let ignore = false;
    const loadMonthlyNews = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/news/monthly-metrics?category=${activeTab}&userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (!ignore) {
            setMonthlyNews(data.news || []);
          }
        }
      } catch (err) {
        console.warn("[NEWS-METRICS] Failed to fetch monthly news metrics:", err);
      }
    };

    loadMonthlyNews();
    return () => { ignore = true; };
  }, [activeTab, userId]);

  // Load active news stream with limit/offset and filters applied on the server
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setPage(1);
      setHasMore(true);
      try {
        const { news: items, hasMore: more } = await fetchNewsCategory(activeTab, 1, {
          ticker: selectedTicker,
          sentiment: sentimentFilter,
          impact: impactFilter,
          search: searchQuery
        });
        if (!ignore) {
          setNews(items);
          setHasMore(more);
        }
      } catch (err: any) {
        if (!ignore) {
          setError(err.message || "Unable to load market news.");
          setNews([]);
          setHasMore(false);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => { ignore = true; };
  }, [activeTab, userId, selectedTicker, sentimentFilter, impactFilter, searchQuery]);
 
  // Real-time news updates: Poll page 1 every 10 seconds to merge newly synced articles
  useEffect(() => {
    // Only poll for 'global' and 'india' categories
    if (activeTab !== "global" && activeTab !== "india") return;

    const intervalId = setInterval(async () => {
      try {
        const { news: freshNews } = await fetchNewsCategory(activeTab, 1);
        if (freshNews && freshNews.length > 0) {
          setNews(prev => {
            const existingIds = new Set(prev.map((item: any) => item._id));
            const newItems = freshNews.filter((item: any) => !existingIds.has(item._id));
            if (newItems.length > 0) {
              console.log(`[REALTIME-NEWS] Prepending ${newItems.length} new articles in real-time.`);
              
              setMonthlyNews(mPrev => {
                const mExistingIds = new Set(mPrev.map((item: any) => item._id));
                const mNewItems = freshNews.filter((item: any) => !mExistingIds.has(item._id));
                return [...mNewItems, ...mPrev];
              });

              return [...newItems, ...prev];
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn("[REALTIME-NEWS] Failed to poll real-time news updates:", err);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(intervalId);
  }, [activeTab, userId]);

  const handleLoadMore = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).blur();
    }
    if (loadingMore || !hasMore) return;

    // Capture current scroll position BEFORE new items are appended
    scrollAnchorY.current = window.scrollY;

    setLoadingMore(true);
    setError("");
    const nextPage = page + 1;
    try {
      const { news: items, hasMore: more } = await fetchNewsCategory(activeTab, nextPage, {
        ticker: selectedTicker,
        sentiment: sentimentFilter,
        impact: impactFilter,
        search: searchQuery
      });
      // Append new items — React will re-render and the layout will grow downward
      setNews(prev => [...prev, ...items]);
      setPage(nextPage);
      setHasMore(more);
      // Restore scroll position after the DOM has settled (two rAF frames for safety)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollAnchorY.current, behavior: 'instant' });
        });
      });
    } catch (err: any) {
      setError(err.message || "Unable to load more news.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Aggregate Sentiment Score & Market Sentiment across all monthly news
  const aggregateSentiment = useMemo(() => {
    let sum = 0;
    let count = 0;

    monthlyNews.forEach(item => {
      const s = typeof item.sentimentScore === 'number' ? item.sentimentScore : parseFloat(item.sentimentScore);
      if (!Number.isNaN(s) && s !== null && s !== undefined) {
        sum += s;
        count += 1;
      }
    });

    const avg = count > 0 ? sum / count : 0;
    
    let label = "NEUTRAL SENTIMENT";
    let color = "text-cyan-400";
    let bg = "bg-cyan-500/10";
    let border = "border-cyan-500/20";
    let glow = "shadow-[0_0_20px_rgba(6,182,212,0.15)]";
    let description = "Global market news indicates balanced, steady, and relatively neutral outlooks.";

    if (avg >= 0.35) {
      label = "BULLISH SENTIMENT";
      color = "text-emerald-400";
      bg = "bg-emerald-500/10";
      border = "border-emerald-500/20";
      glow = "shadow-[0_0_25px_rgba(16,185,129,0.25)]";
      description = "Strong positive market news and positive sector trends indicate a bullish outlook.";
    } else if (avg >= 0.1) {
      label = "SOMEWHAT BULLISH";
      color = "text-emerald-400/80";
      bg = "bg-emerald-500/5";
      border = "border-emerald-500/10";
      glow = "shadow-[0_0_15px_rgba(52,211,153,0.15)]";
      description = "Mild positive momentum and optimistic outlooks across top stock sectors.";
    } else if (avg <= -0.35) {
      label = "BEARISH SENTIMENT";
      color = "text-rose-400";
      bg = "bg-rose-500/10";
      border = "border-rose-500/20";
      glow = "shadow-[0_0_25px_rgba(244,63,94,0.25)]";
      description = "High caution in the market and negative news flow indicate a bearish outlook.";
    } else if (avg <= -0.1) {
      label = "SOMEWHAT BEARISH";
      color = "text-rose-400/80";
      bg = "bg-rose-500/5";
      border = "border-rose-500/10";
      glow = "shadow-[0_0_15px_rgba(251,113,133,0.15)]";
      description = "Minor negative trends and cautious outlooks capping immediate stock growth.";
    }

    return { avg, label, color, bg, border, glow, description };
  }, [monthlyNews]);

  // Extract all tickers mentioned in monthly news and calculate their custom frequency & aggregate sentiment score
  const tickerMetrics = useMemo(() => {
    const isSaved = activeTab === "saved";
    const map: Record<string, { count: number; totalScore: number; scoreCount: number }> = {};

    if (isSaved) {
      // Dynamic Extraction: Only pull stocks actually mentioned inside Saved Articles
      news.forEach(item => {
        const itemScore = typeof item.sentimentScore === 'number' ? item.sentimentScore : parseFloat(item.sentimentScore);
        const stocks = Array.isArray(item.stocks) ? item.stocks : [];
        const tickSent = Array.isArray(item.tickerSentiment) ? item.tickerSentiment : [];

        stocks.forEach((s: string) => {
          const symbol = s.trim().toUpperCase();
          if (!symbol) return;
          const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
          
          if (!map[cleanSymbol]) {
            map[cleanSymbol] = { count: 0, totalScore: 0, scoreCount: 0 };
          }
          map[cleanSymbol].count += 1;

          const match = tickSent.find((t: any) => {
            const tSymbol = String(t.ticker).toUpperCase().replace(/\.(NS|BO)$/, '');
            return tSymbol === cleanSymbol;
          });
          if (match && match.ticker_sentiment_score) {
            const sScore = parseFloat(match.ticker_sentiment_score);
            if (!Number.isNaN(sScore)) {
              map[cleanSymbol].totalScore += sScore;
              map[cleanSymbol].scoreCount += 1;
              return;
            }
          }

          if (!Number.isNaN(itemScore) && itemScore !== null && itemScore !== undefined) {
            map[cleanSymbol].totalScore += itemScore;
            map[cleanSymbol].scoreCount += 1;
          }
        });
      });

      return Object.entries(map)
        .map(([symbol, data]) => {
          const avg = data.scoreCount > 0 ? data.totalScore / data.scoreCount : 0;
          return { symbol, count: data.count, avgSentiment: avg };
        })
        .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol));
    }

    const isIndia = activeTab === "india";
    const benchmarkList = isIndia ? NIFTY_50 : DOW_30;

    // Initialize benchmark list
    benchmarkList.forEach(symbol => {
      map[symbol] = { count: 0, totalScore: 0, scoreCount: 0 };
    });

    monthlyNews.forEach(item => {
      const itemScore = typeof item.sentimentScore === 'number' ? item.sentimentScore : parseFloat(item.sentimentScore);
      const stocks = Array.isArray(item.stocks) ? item.stocks : [];
      const tickSent = Array.isArray(item.tickerSentiment) ? item.tickerSentiment : [];

      stocks.forEach((s: string) => {
        const symbol = s.trim().toUpperCase();
        if (!symbol) return;
        
        // Strip suffixes like .NS / .BO for matching benchmarks
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        
        if (map[cleanSymbol] !== undefined) {
          map[cleanSymbol].count += 1;

          // Try to fetch precise ticker sentiment score
          const match = tickSent.find((t: any) => {
            const tSymbol = String(t.ticker).toUpperCase().replace(/\.(NS|BO)$/, '');
            return tSymbol === cleanSymbol;
          });
          if (match && match.ticker_sentiment_score) {
            const sScore = parseFloat(match.ticker_sentiment_score);
            if (!Number.isNaN(sScore)) {
              map[cleanSymbol].totalScore += sScore;
              map[cleanSymbol].scoreCount += 1;
              return;
            }
          }

          // Fallback to article overall score
          if (!Number.isNaN(itemScore) && itemScore !== null && itemScore !== undefined) {
            map[cleanSymbol].totalScore += itemScore;
            map[cleanSymbol].scoreCount += 1;
          }
        }
      });
    });

    return Object.entries(map)
      .map(([symbol, data]) => {
        const avg = data.scoreCount > 0 ? data.totalScore / data.scoreCount : 0;
        return { symbol, count: data.count, avgSentiment: avg };
      })
      .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol));
  }, [monthlyNews, activeTab, news]);

  // Extract top active macroeconomic topic matrices across monthly news
  const topicMetrics = useMemo(() => {
    const map: Record<string, { count: number; totalRelevance: number }> = {};
    monthlyNews.forEach(item => {
      const topics = Array.isArray(item.topics) ? item.topics : [];
      topics.forEach((t: any) => {
        const name = String(t.topic || '').trim();
        if (!name) return;
        const relevance = parseFloat(t.relevance_score) || 0;
        if (!map[name]) {
          map[name] = { count: 0, totalRelevance: 0 };
        }
        map[name].count += 1;
        map[name].totalRelevance += relevance;
      });
    });

    return Object.entries(map)
      .map(([topic, data]) => ({
        topic,
        count: data.count,
        avgRelevance: data.count > 0 ? data.totalRelevance / data.count : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4); // Top 4 categories
  }, [monthlyNews]);

  // Dynamic Impact Statistics across monthly news
  const impactStats = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    monthlyNews.forEach(item => {
      const imp = normalizeImpact(item.impact);
      if (imp === 'HIGH') high++;
      else if (imp === 'MEDIUM') medium++;
      else low++;
    });
    const total = monthlyNews.length || 1;
    return {
      high: Math.round((high / total) * 100),
      medium: Math.round((medium / total) * 100),
      low: Math.round((low / total) * 100),
      highCount: high,
      mediumCount: medium,
      lowCount: low
    };
  }, [monthlyNews]);

  // Base sorting logic
  const sortedNews = useMemo(() => {
    const sorted = [...news];
    if (trendingMode) {
      return sorted.sort((a, b) => {
        const getScore = (item: any) => {
          const impact = normalizeImpact(item.impact);
          const weight = impactMeta[impact as keyof typeof impactMeta].weight * 100;
          const age = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 36e5);
          const recency = (Math.max(0, 72 - age) / 72) * 100;
          const signals = Math.min(Array.isArray(item.stocks) ? item.stocks.length : 0, 6) * 4;
          return weight + recency + signals;
        };
        return getScore(b) - getScore(a);
      });
    }

    if (sortMode === "oldest") {
      return sorted.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    }

    if (sortMode === "impact") {
      return sorted.sort((a, b) => {
        const impactDiff = impactMeta[normalizeImpact(b.impact) as keyof typeof impactMeta].weight -
          impactMeta[normalizeImpact(a.impact) as keyof typeof impactMeta].weight;
        if (impactDiff !== 0) return impactDiff;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });
    }

    return sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [news, sortMode, trendingMode]);

  // Advanced Filtering (Sentiment, Impact, Search Query, and Ticker focus)
  const filteredSortedNews = useMemo(() => {
    return sortedNews.filter(item => {
      // 1. Ticker Filter
      if (selectedTicker) {
        const cleanSelected = selectedTicker.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
        const hasTicker = Array.isArray(item.stocks) &&
          item.stocks.some((s: string) => {
            const cleanS = s.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
            return cleanS === cleanSelected;
          });
        if (!hasTicker) return false;
      }

      // 2. Sentiment Filter
      const score = typeof item.sentimentScore === 'number' ? item.sentimentScore : parseFloat(item.sentimentScore);
      if (sentimentFilter === "bullish" && score < 0.1) return false;
      if (sentimentFilter === "bearish" && score > -0.1) return false;
      if (sentimentFilter === "neutral" && (score >= 0.1 || score <= -0.1)) return false;

      // 3. Impact Filter
      const itemImpact = normalizeImpact(item.impact);
      if (impactFilter !== "all" && itemImpact !== impactFilter) return false;

      // 4. Text Search
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        const titleMatch = (item.title || "").toLowerCase().includes(query);
        const summaryMatch = (item.summary || "").toLowerCase().includes(query);
        const sourceMatch = (item.source || "").toLowerCase().includes(query);
        const domainMatch = (item.sourceDomain || "").toLowerCase().includes(query);
        const tickerMatch = Array.isArray(item.stocks) && item.stocks.some((s: string) => s.toLowerCase().includes(query));
        const authorMatch = Array.isArray(item.authors) && item.authors.some((a: string) => a.toLowerCase().includes(query));

        if (!titleMatch && !summaryMatch && !sourceMatch && !domainMatch && !tickerMatch && !authorMatch) {
          return false;
        }
      }

      return true;
    });
  }, [sortedNews, selectedTicker, sentimentFilter, impactFilter, searchQuery]);

  const handleToggleSave = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation(); // Avoid triggering open detail drawer
    const id = item._id;
    if (!id) return;

    const isCurrentlySaved = item.saved;
    const original = [...news];
    const originalMonthly = [...monthlyNews];

    // Optimistic UI updates
    if (activeTab === "saved" && isCurrentlySaved) {
      setNews(prev => prev.filter(i => i._id !== id));
      setMonthlyNews(prev => prev.filter(i => i._id !== id));
      if (activeItem?._id === id) {
        handleCloseModal(); // Close drawer if we just unsaved from saved tab
      }
    } else {
      setNews(prev =>
        prev.map(i =>
          i._id === id ? { ...i, saved: !isCurrentlySaved } : i
        )
      );
      setMonthlyNews(prev =>
        prev.map(i =>
          i._id === id ? { ...i, saved: !isCurrentlySaved } : i
        )
      );
      if (activeItem?._id === id) {
        setActiveItem((prev: any) => ({ ...prev, saved: !isCurrentlySaved }));
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/news/save/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(text);
        throw new Error();
      }
    } catch (err) {
      setNews(original);
      setMonthlyNews(originalMonthly);
      if (activeItem?._id === id) {
        setActiveItem((prev: any) => ({ ...prev, saved: isCurrentlySaved }));
      }
      setError(`Unable to ${isCurrentlySaved ? "unsave" : "save"} this story.`);
    }
  };

  // Maps clean icons or labels for topics
  const getTopicStyle = (topic: string) => {
    const formatted = topic.toLowerCase().replace(/_/g, " ");
    let color = "text-zinc-500 border-zinc-500/20 bg-zinc-500/5";

    if (formatted.includes("technology")) {
      color = "text-violet-400 border-violet-500/20 bg-violet-500/5";
    } else if (formatted.includes("financial") || formatted.includes("earnings")) {
      color = "text-emerald-400 border-emerald-500/20 bg-emerald-500/5";
    } else if (formatted.includes("macro") || formatted.includes("monetary")) {
      color = "text-sky-400 border-sky-500/20 bg-sky-500/5";
    } else if (formatted.includes("mergers")) {
      color = "text-amber-400 border-amber-500/20 bg-amber-500/5";
    }

    return { label: formatted, class: color };
  };

  return (
    <div className="min-h-screen bg-transparent text-white selection:bg-emerald-500/30 relative overflow-x-clip">
      {/* Premium Dashboard Background Glowing Gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full filter blur-[120px] pointer-events-none z-0 animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/5 rounded-full filter blur-[140px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '8s' }} />

      {/* Futuristic Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015] pointer-events-none z-0"
        style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} 
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/20 pointer-events-none z-0" />

      <main className="pt-24 pb-24 px-4 sm:px-6 max-w-[1780px] mx-auto w-full relative z-10">

        {/* Dashboard Top Header Navigation Banner */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4 border-b border-white/5 pb-2.5 relative"
        >
          <div>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black tracking-[-0.04em] leading-[1.0] mb-2 text-white uppercase font-sans">
              Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-emerald-500 to-cyan-400">Intelligence</span>
            </h1>
            <p className="text-zinc-500 max-w-xl text-xs sm:text-sm font-medium leading-relaxed font-sans">
              Real-time global stock news, sector topics, and AI-powered sentiment analysis.
            </p>
          </div>

          {/* Quick HUD Metrics & Tabs */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Chronology / Trending toggle button */}
            <motion.button
              whileHover={{ scale: 1.03, y: -0.5 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={() => setTrendingMode(!trendingMode)}
              className={cn(
                "flex items-center gap-2.5 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors duration-500 shadow-xl font-sans relative overflow-hidden group min-w-[140px] justify-center h-[38px]",
                trendingMode
                  ? "bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.15)]"
                  : "bg-emerald-500/5 border-white/[0.08] backdrop-blur-xl text-zinc-400 hover:text-white hover:border-emerald-500/30"
              )}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={trendingMode ? "trending" : "latest"}
                  initial={{ y: 12, opacity: 0, filter: "blur(2px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: -12, opacity: 0, filter: "blur(2px)" }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="flex items-center gap-2"
                >
                  {trendingMode ? (
                    <>
                      <Flame className="size-3.5 text-orange-400 animate-pulse" />
                      Trending News
                    </>
                  ) : (
                    <>
                      <Activity className="size-3.5 text-emerald-400 animate-pulse" />
                      Latest News
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.button>

            {/* Custom Tab Selection Menu */}
            <div className="flex items-center gap-1 bg-[#080c14]/30 backdrop-blur-xl p-1 rounded-full border border-white/[0.08] shadow-2xl">
              {tabs.map(tab => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "relative flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all duration-500 z-10 font-sans",
                      isActive ? "text-[#03060a]" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="active-journal-tab"
                        className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full -z-10 shadow-[0_0_25px_rgba(16,185,129,0.2)]"
                        transition={{ type: "spring", stiffness: 400, damping: 33 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black tracking-widest uppercase flex items-center gap-3 backdrop-blur-xl shadow-lg"
          >
            <AlertTriangle className="size-4 text-rose-400 animate-bounce" />
            {error}
          </motion.div>
        )}

        {/* Global Market Sentiment Section (HUD Top Grid Deck) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          {/* Card 1: Aggregated Sentiment speedometer dial */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className={cn(
              "rounded-2xl p-4 bg-[#080c14]/30 backdrop-blur-xl border border-white/[0.08] relative overflow-hidden flex flex-col justify-between min-h-[115px] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]",
              aggregateSentiment.glow
            )}
          >
            <div className="absolute right-0 top-0 opacity-5 pointer-events-none translate-x-6 -translate-y-6">
              <div className="w-36 h-36 rounded-full border-4 border-dashed border-white animate-spin-slow" />
            </div>

            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">Market Sentiment</span>
                <h3 className={cn("text-xl font-black tracking-tight mt-0.5 uppercase", aggregateSentiment.color)}>
                  {aggregateSentiment.label}
                </h3>
              </div>
              <div className={cn("px-2 py-0.5 rounded text-[9px] font-black tabular-nums border", aggregateSentiment.bg, aggregateSentiment.color, aggregateSentiment.border)}>
                {aggregateSentiment.avg >= 0 ? "+" : ""}{aggregateSentiment.avg.toFixed(2)}
              </div>
            </div>

            <div className="space-y-1.5 mt-2">
              <div className="w-full bg-zinc-950 rounded-full h-1 overflow-hidden relative">
                {/* Horizontal heat bar from -1 (Extremely Bearish) to +1 (Extremely Bullish) */}
                <div
                  className={cn("h-full rounded-full transition-all duration-1000",
                    aggregateSentiment.avg >= 0.1 ? "bg-gradient-to-r from-emerald-500 to-teal-400" :
                    aggregateSentiment.avg <= -0.1 ? "bg-gradient-to-r from-rose-500 to-red-600" :
                    "bg-cyan-500"
                  )}
                  style={{ width: `${((aggregateSentiment.avg + 1) / 2) * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-zinc-400 leading-normal italic font-medium font-sans">
                {aggregateSentiment.description}
              </p>
            </div>
          </motion.div>

          {/* Card 2: Coverage Composition progress meters */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="rounded-2xl p-4 bg-[#080c14]/30 backdrop-blur-xl border border-white/[0.08] flex flex-col justify-between min-h-[115px] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
          >
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">News Impact Breakdown</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black tracking-tight">{monthlyNews.length}</span>
                <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">analyzed articles</span>
              </div>
            </div>

            <div className="space-y-1.5 mt-2">
              {/* High impact */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[8px] font-black uppercase tracking-wider">
                  <span className="text-rose-400">High Impact</span>
                  <span className="text-zinc-500 tabular-nums">{impactStats.highCount} ({impactStats.high}%)</span>
                </div>
                <div className="w-full bg-zinc-950 rounded-full h-0.5 overflow-hidden">
                  <div className="bg-rose-500 h-0.5 rounded-full shadow-[0_0_5px_#f43f5e]" style={{ width: `${impactStats.high}%` }} />
                </div>
              </div>
              {/* Med/Low impact combined summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-wider">
                    <span className="text-amber-400">Medium</span>
                    <span className="text-zinc-500 tabular-nums">{impactStats.mediumCount}</span>
                  </div>
                  <div className="w-full bg-zinc-950 rounded-full h-0.5 overflow-hidden">
                    <div className="bg-amber-500 h-0.5 rounded-full" style={{ width: `${impactStats.medium}%` }} />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-wider">
                    <span className="text-cyan-400">Low</span>
                    <span className="text-zinc-500 tabular-nums">{impactStats.lowCount}</span>
                  </div>
                  <div className="w-full bg-zinc-950 rounded-full h-0.5 overflow-hidden">
                    <div className="bg-cyan-500 h-0.5 rounded-full" style={{ width: `${impactStats.low}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 3: TOPIC HEATMAP */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="rounded-2xl p-4 bg-[#080c14]/30 backdrop-blur-xl border border-white/[0.08] flex flex-col justify-between min-h-[115px] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
          >
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">Top Topic</span>
              <h3 className="text-base font-black tracking-tight mt-0.5 text-zinc-200">
                {topicMetrics.length > 0 ? topicMetrics[0].topic.replace(/_/g, " ").toUpperCase() : "NO DATA"}
              </h3>
            </div>

            <div className="space-y-1.5 mt-2">
              {topicMetrics.length > 0 ? (
                topicMetrics.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between text-[7px] font-black uppercase tracking-wider text-zinc-400">
                      <span className="truncate max-w-[120px]">{item.topic.replace(/_/g, " ")}</span>
                      <span className="text-zinc-500 font-medium font-sans">
                        relevance: {(item.avgRelevance * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-950 rounded-full h-0.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-emerald-500/80 to-cyan-500/80 h-0.5 rounded-full" 
                        style={{ width: `${item.avgRelevance * 100}%` }} 
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-[8px] text-zinc-600 font-sans italic">Awaiting articles...</div>
              )}
            </div>
          </motion.div>

          {/* Card 4: Quick Active Tickers & Search HUD */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="rounded-2xl p-4 bg-[#080c14]/30 backdrop-blur-xl border border-white/[0.08] flex flex-col justify-between min-h-[115px] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
          >
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">Quick Filters</span>
              <div className="flex justify-between items-center mt-0.5">
                <span className="text-xl font-black tracking-tight">
                  {tickerMetrics.length} <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Active Stocks</span>
                </span>
                {selectedTicker && (
                  <button 
                    onClick={() => setSelectedTicker(null)} 
                    className="text-[8px] font-black uppercase tracking-wider text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 px-1.5 py-0.5 rounded"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5 mt-3 text-[10px] font-sans text-zinc-400">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span>Active Tab</span>
                <span className="text-white font-bold uppercase tracking-wider">{activeTab}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span>Selected Ticker</span>
                <span className="text-white font-bold">{selectedTicker || "None"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Filtered Articles</span>
                <span className="text-emerald-400 font-black tabular-nums">{filteredSortedNews.length} / {news.length}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Dynamic Filters refiner widget row */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="flex flex-col lg:flex-row gap-3.5 p-3 rounded-xl bg-[#080c14]/20 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] mb-4"
        >
          {/* 1. Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search news by title, summary, author, or stock symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-xl pl-12 pr-4 py-3 text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:bg-white/[0.04] focus:border-emerald-500/40 transition-all font-sans"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")} 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* 2. Sentiment Filter dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-2">Sentiment</span>
            <div className="flex bg-white/[0.02] backdrop-blur-xl p-1 border border-white/[0.08] rounded-xl gap-1">
              {[
                { label: "All", value: "all", activeClass: "bg-zinc-100 text-zinc-950 border-zinc-100 shadow-[0_0_12px_rgba(255,255,255,0.35)]" },
                { label: "Bullish", value: "bullish", activeClass: "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]" },
                { label: "Bearish", value: "bearish", activeClass: "bg-rose-500 text-zinc-950 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.35)]" },
                { label: "Neutral", value: "neutral", activeClass: "bg-zinc-400 text-zinc-950 border-zinc-400 shadow-[0_0_12px_rgba(161,161,170,0.35)]" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSentimentFilter(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 font-sans border",
                    sentimentFilter === opt.value
                      ? opt.activeClass
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.04] border-transparent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. AI Impact dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-2">Impact</span>
            <div className="flex bg-white/[0.02] backdrop-blur-xl p-1 border border-white/[0.08] rounded-xl gap-1">
              {[
                { label: "All", value: "all", activeClass: "bg-violet-500 text-zinc-950 border-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.35)]" },
                { label: "High", value: "HIGH", activeClass: "bg-rose-500 text-zinc-950 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.35)]" },
                { label: "Medium", value: "MEDIUM", activeClass: "bg-amber-500 text-zinc-950 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.35)]" },
                { label: "Low", value: "LOW", activeClass: "bg-cyan-500 text-zinc-950 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.35)]" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setImpactFilter(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 font-sans border",
                    impactFilter === opt.value
                      ? opt.activeClass
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.04] border-transparent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Dashboard Content split grid layout */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          
          {/* Column 1: Institutional Intelligence Sidebar HUD (Left side, 25% desktop) */}
          <div className="xl:col-span-1 space-y-3.5 xl:sticky xl:top-24 self-start max-h-[calc(100vh-140px)] overflow-y-auto pr-2 custom-scrollbar">

             {/* Widget: Ticker Focus Stream list with aggregate sentiments */}
             {activeTab === "saved" && tickerMetrics.length === 0 ? (
               <motion.div
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ duration: 0.6, delay: 0.1 }}
                 className="rounded-xl p-5 bg-[#080c14]/30 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] text-center relative overflow-hidden group"
               >
                 <div className="absolute -right-4 -top-4 w-12 h-12 bg-cyan-500/10 rounded-full filter blur-xl pointer-events-none group-hover:scale-150 transition-transform duration-700" />
                 <Bookmark className="size-8 text-cyan-400/60 mx-auto mb-3 animate-pulse" />
                 <h4 className="text-xs font-black uppercase tracking-wider text-zinc-300 mb-1.5 font-sans">
                   No Saved Tickers
                 </h4>
                 <p className="text-[10px] text-zinc-500 leading-normal font-sans font-medium">
                   Bookmark articles to dynamically extract and monitor specific stocks of interest here.
                 </p>
               </motion.div>
             ) : tickerMetrics.length > 0 && (
               <motion.div
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ duration: 0.6, delay: 0.1 }}
                 className="rounded-xl p-4 bg-[#080c14]/30 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
               >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="size-4 text-emerald-400" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">Active Stocks</span>
                  </div>
                </div>

                <p className="text-[10px] text-zinc-400 leading-normal mb-4 font-sans font-medium">
                  Stocks mentioned in this month's articles. Click a stock to filter.
                </p>

                {/* Ticker vertical stream with aggregate sentiments */}
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 no-scrollbar">
                  {tickerMetrics.map(item => {
                    const isSelected = selectedTicker === item.symbol;
                    
                    // Style ticker badge based on average sentiment
                    let avgColor = "text-cyan-400 bg-cyan-500/10";
                    let avgLabel = "N";
                    if (item.avgSentiment >= 0.1) {
                      avgColor = "text-emerald-400 bg-emerald-500/10";
                      avgLabel = `+${item.avgSentiment.toFixed(2)}`;
                    } else if (item.avgSentiment <= -0.1) {
                      avgColor = "text-rose-400 bg-rose-500/10";
                      avgLabel = item.avgSentiment.toFixed(2);
                    }

                    return (
                      <button
                        key={item.symbol}
                        onClick={() => setSelectedTicker(isSelected ? null : item.symbol)}
                        className={cn(
                          "w-full flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 font-sans",
                          isSelected
                            ? "bg-emerald-500/20 backdrop-blur-sm border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                            : "bg-white/[0.02] backdrop-blur-sm border-white/[0.08] text-zinc-400 hover:bg-white/[0.05] hover:border-white/20 hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black tracking-wider uppercase">{item.symbol}</span>
                          <span className="text-[9px] font-medium text-zinc-500 tabular-nums">({item.count})</span>
                        </div>
                        <span className={cn("text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md tabular-nums", avgColor)}>
                          {avgLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Widget: Macro Topics Relevance Breakdown */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="rounded-xl p-4 bg-[#080c14]/30 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
            >
              <div className="flex items-center gap-2 mb-3">
                <Layers className="size-4 text-cyan-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">News Categories</span>
              </div>

              <div className="space-y-4 pt-1">
                {topicMetrics.map((topicItem, idx) => {
                  const style = getTopicStyle(topicItem.topic);
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-sans font-bold">
                        <span className={cn("capitalize flex items-center gap-1.5", style.class.split(" ")[0])}>
                          <div className="size-1.5 rounded-full bg-current animate-pulse" />
                          {style.label}
                        </span>
                        <span className="text-zinc-500 tabular-nums">{topicItem.count} articles</span>
                      </div>
                      <div className="w-full bg-zinc-950 rounded-full h-1 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-1 rounded-full" 
                          style={{ width: `${topicItem.avgRelevance * 100}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Column 2: Rebuilt Intelligence News Stream Grid (Right side, 75% desktop) */}
          <div className="xl:col-span-3 space-y-4">



            {/* Articles feed grid */}
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
              >
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-80 rounded-xl bg-white/[0.01] border border-white/5 relative overflow-hidden animate-pulse">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
                    <div className="p-6 space-y-5">
                      <div className="h-6 w-24 bg-white/5 rounded-full" />
                      <div className="h-40 w-full bg-white/5 rounded-2xl" />
                      <div className="h-10 w-full bg-white/5 rounded-2xl" />
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                <div
                  key={activeTab + sortMode + trendingMode + (selectedTicker || '') + sentimentFilter + impactFilter + searchQuery}
                  className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 relative z-10"
                >
                  {filteredSortedNews.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="col-span-full py-20 flex flex-col items-center justify-center text-center bg-[#080b12]/30 rounded-xl border border-dashed border-white/5"
                    >
                      <div className="size-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6 relative overflow-hidden group">
                        <Bookmark className="size-8 text-zinc-700 group-hover:text-emerald-500/40 transition-colors duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold tracking-tight text-white/80 uppercase font-sans">No articles found</h3>
                        <p className="text-[10px] font-black tracking-widest text-zinc-500 max-w-[320px] mx-auto leading-relaxed uppercase font-sans">
                          No news matches your search or filter settings.
                        </p>
                      </div>
                    </motion.div>
                  ) : filteredSortedNews.map((item, idx) => {
                    const impact = normalizeImpact(item.impact);
                    const meta = impactMeta[impact as keyof typeof impactMeta];
                    const itemScore = typeof item.sentimentScore === 'number' ? item.sentimentScore : parseFloat(item.sentimentScore);
                    
                    // Determine visual indicators based on exact score
                    let scoreBadgeColor = "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
                    let sentimentText = "Neutral";
                    if (itemScore >= 0.35) {
                      scoreBadgeColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                      sentimentText = "Bullish";
                    } else if (itemScore >= 0.1) {
                      scoreBadgeColor = "text-emerald-400/80 bg-emerald-500/5 border-emerald-500/10";
                      sentimentText = "Somewhat Bullish";
                    } else if (itemScore <= -0.35) {
                      scoreBadgeColor = "text-rose-400 bg-rose-500/10 border-rose-500/20";
                      sentimentText = "Bearish";
                    } else if (itemScore <= -0.1) {
                      scoreBadgeColor = "text-rose-400/80 bg-rose-500/5 border-rose-500/10";
                      sentimentText = "Somewhat Bearish";
                    }

                    return (
                      <motion.article
                        key={item._id || `news-${idx}`}
                        initial={{ opacity: 0, y: 30, scale: 0.97, filter: "blur(8px)" }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -30, scale: 0.97, filter: "blur(8px)" }}
                        transition={{
                          duration: 0.6,
                          delay: Math.min(idx * 0.03, 0.35),
                          ease: [0.16, 1, 0.3, 1]
                        }}
                        className="h-full flex"
                      >
                        <SpotlightCard 
                          className="w-full flex flex-col justify-between" 
                          sentimentScore={itemScore}
                          onClick={() => handleOpenArticle(item)}
                        >
                          {/* Alert Side Accent Line */}
                          <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-500", 
                            itemScore >= 0.1 ? "bg-emerald-500" : itemScore <= -0.1 ? "bg-rose-500" : "bg-cyan-500", 
                            "opacity-30 group-hover:opacity-100"
                          )} />

                          <div>
                            {/* Card Top Actions Panel */}
                            <div className="flex justify-between items-center mb-2.5 relative z-10">
                              <div className="flex items-center gap-2">
                                <span className={cn("px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.2em] border flex items-center gap-1.5 font-sans bg-opacity-5", meta.bg, meta.color, meta.border)}>
                                  <div className={cn("size-1 rounded-full", meta.dot, "animate-pulse")} />
                                  {meta.label}
                                </span>
                              </div>

                              <motion.button
                                whileHover={{ scale: 1.1, y: -0.5 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => handleToggleSave(e, item)}
                                className={cn(
                                  "size-8 rounded-xl flex items-center justify-center border transition-all duration-500 relative overflow-hidden group/btn z-10",
                                  item.saved
                                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                                    : "text-zinc-500 hover:text-white bg-white/5 border-white/5 hover:border-white/20"
                                )}
                              >
                                {item.saved && (
                                  <span className="absolute inset-0 rounded-xl bg-emerald-400/10 blur-sm animate-pulse -z-10" />
                                )}
                                <motion.div
                                  animate={{
                                    scale: item.saved ? [1, 1.3, 0.95, 1] : 1,
                                    rotate: item.saved ? [0, 10, -10, 0] : 0
                                  }}
                                  transition={{ duration: 0.45, ease: "easeOut" }}
                                >
                                  <Bookmark className={cn("size-3.5 transition-colors duration-300", item.saved ? "fill-emerald-400 stroke-emerald-400" : "fill-none stroke-current")} />
                                </motion.div>
                              </motion.button>
                            </div>

                            {/* News Card Banner Cover Image */}
                            {item.thumbnail && (
                              <div className="relative w-full h-32 rounded-lg overflow-hidden border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm shadow-inner group-hover:border-emerald-500/20 transition-all duration-500 flex items-center justify-center mb-3">
                                <img
                                  src={item.thumbnail}
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-cover filter blur-xl opacity-[0.15] scale-110 pointer-events-none"
                                />
                                <img
                                  src={item.thumbnail}
                                  alt={item.title || 'News Cover'}
                                  className="relative w-full h-full object-contain z-10 group-hover:scale-[1.02] transition-transform duration-700 ease-out p-1"
                                  loading="lazy"
                                />
                              </div>
                            )}

                            {/* Main Details and Metadata */}
                            <div className="space-y-2 relative z-10">
                              
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">
                                  {item.source || "Insight Pulsar"}
                                </span>
                                <span className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border", scoreBadgeColor)}>
                                  {sentimentText} {!Number.isNaN(itemScore) ? (itemScore >= 0 ? `+${itemScore.toFixed(2)}` : itemScore.toFixed(2)) : ""}
                                </span>
                              </div>

                              <h3 className="text-sm font-bold leading-snug tracking-tight text-white/90 group-hover:text-white transition-colors font-sans line-clamp-2">
                                {item.title || "Untitled News Story"}
                              </h3>

                              {/* Tickers tag panel with inline stock sentiment colors */}
                              {Array.isArray(item.stocks) && item.stocks.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {item.stocks.slice(0, 3).map((stock: string) => {
                                    const symbol = stock.trim().toUpperCase();
                                    
                                    // Try to determine this specific ticker's sentiment color
                                    let tickClass = "bg-white/[0.02] backdrop-blur-sm border-white/[0.08] text-zinc-400 hover:bg-white/[0.05] hover:border-white/20 hover:text-white";
                                    const match = Array.isArray(item.tickerSentiment) && 
                                      item.tickerSentiment.find((t: any) => String(t.ticker).toUpperCase() === symbol);
                                    if (match && match.ticker_sentiment_score) {
                                      const score = parseFloat(match.ticker_sentiment_score);
                                      if (score >= 0.1) {
                                        tickClass = "bg-emerald-500/10 backdrop-blur-sm border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20";
                                      } else if (score <= -0.1) {
                                        tickClass = "bg-rose-500/10 backdrop-blur-sm border-rose-500/20 text-rose-400 hover:bg-rose-500/20";
                                      }
                                    }

                                    return (
                                      <span
                                        key={stock}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTicker(selectedTicker === symbol ? null : symbol);
                                        }}
                                        className={cn(
                                          "px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border font-sans cursor-pointer transition-all duration-300",
                                          selectedTicker === symbol
                                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                            : tickClass
                                        )}
                                      >
                                        {stock}
                                      </span>
                                    );
                                  })}
                                  {item.stocks.length > 3 && (
                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm text-zinc-500">
                                      +{item.stocks.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Executive summaries from Alpha Vantage */}
                              {item.summary && (
                                <p className="text-xs text-zinc-400 leading-relaxed font-sans line-clamp-3 group-hover:text-zinc-300 transition-colors duration-200">
                                  {item.summary}
                                </p>
                              )}

                              {/* Relevance topic pills */}
                              {Array.isArray(item.topics) && item.topics.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/[0.03]">
                                  {item.topics.slice(0, 2).map((t: { topic: string; relevance_score: string }) => {
                                    const style = getTopicStyle(t.topic);
                                    return (
                                      <span
                                        key={t.topic}
                                        className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border", style.class)}
                                      >
                                        {style.label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Card Footer Info Section */}
                          <div className="pt-2.5 mt-3.5 border-t border-white/[0.04] flex items-center justify-between font-sans relative z-10">
                            <div className="flex items-center gap-1.5 opacity-60 text-zinc-500">
                              <Clock className="size-3" />
                              <span className="text-[9px] font-bold tabular-nums uppercase tracking-widest">{formatDateTime(item.publishedAt)}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => {
                                  e.stopPropagation(); // Avoid opening drawer
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider transition-all duration-300 group/readmore shadow-[0_0_10px_rgba(16,185,129,0.02)] hover:shadow-[0_0_15px_rgba(16,185,129,0.12)] cursor-pointer"
                              >
                                <span>Read More</span>
                                <ArrowUpRight className="size-3 transition-transform duration-300 group-hover/readmore:translate-x-0.5 group-hover/readmore:-translate-y-0.5" />
                              </a>
                            </div>
                          </div>
                        </SpotlightCard>
                      </motion.article>
                    );
                  })}
                </div>

                {/* Read More button at the bottom of the news list */}
                {hasMore && activeTab !== 'saved' && filteredSortedNews.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="flex justify-center mt-6 mb-4 relative z-20 w-full"
                  >
                    <motion.button
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className={cn(
                        "px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 text-emerald-400 font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all duration-300 shadow-xl",
                        loadingMore ? "opacity-60 cursor-not-allowed" : "hover:border-emerald-500/40 hover:from-emerald-500/20 hover:to-cyan-500/20 hover:shadow-[0_0_25px_rgba(16,185,129,0.15)]"
                      )}
                    >
                      {loadingMore ? (
                        <>
                          <RefreshCw className="size-4 animate-spin text-emerald-400" />
                          <span>Analyzing Archives...</span>
                        </>
                      ) : (
                        <>
                          <BookOpen className="size-4 text-emerald-400" />
                          <span>Read More Stories</span>
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Rebuilt Premium Slide-Over Details Drawer Component */}
        <StockOSPortal>
          <AnimatePresence>
            {activeItem && (
              <>
                {/* Dim Backdrop Overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  exit={{ opacity: 0 }}
                  onClick={handleCloseModal}
                  className="fixed inset-0 bg-black/40 z-[190] backdrop-blur-lg"
                />

                {/* Centered Modal Container */}
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 md:p-8 pointer-events-none">
                  
                  {/* Modal panel */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-auto w-full max-w-4xl max-h-[88vh] bg-[#05080f]/45 border border-white/[0.08] rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-3xl flex flex-col justify-between overflow-hidden relative"
                  >
                    {/* Subtle Top Glow Border */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

                    {/* Drawer header panel (Fixed at top) */}
                    <div className="flex justify-between items-center px-4 md:px-6 py-4 border-b border-white/5 bg-[#05080f]/30 backdrop-blur-md shrink-0 z-10">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">Article Details</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <motion.button
                          whileHover={{ scale: 1.1, y: -0.5 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => handleToggleSave(e, activeItem)}
                          className={cn(
                            "size-9 rounded-xl flex items-center justify-center border transition-all duration-500 relative overflow-hidden group/btn",
                            activeItem.saved
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                              : "text-zinc-500 hover:text-white bg-white/5 border-white/5 hover:border-white/20"
                          )}
                        >
                          {activeItem.saved && (
                            <span className="absolute inset-0 rounded-xl bg-emerald-400/10 blur-sm animate-pulse -z-10" />
                          )}
                          <motion.div
                            animate={{
                              scale: activeItem.saved ? [1, 1.3, 0.95, 1] : 1,
                              rotate: activeItem.saved ? [0, 10, -10, 0] : 0
                            }}
                            transition={{ duration: 0.45, ease: "easeOut" }}
                          >
                            <Bookmark className={cn("size-4 transition-colors duration-300", activeItem.saved ? "fill-emerald-400 stroke-emerald-400" : "fill-none stroke-current")} />
                          </motion.div>
                        </motion.button>
                        <button
                          onClick={handleCloseModal}
                          className="size-8 rounded-lg bg-white/5 border border-white/5 text-zinc-500 hover:text-white flex items-center justify-center transition-colors"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* Scroll container wrapper */}
                    <div className="overflow-y-auto flex-1 custom-scrollbar p-4 md:p-6 space-y-4">

                      {/* Title, Source, and Metadata Header Block (Full Width, Centered/Balanced) */}
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] font-sans">
                            {activeItem.source || "Insight Pulsar"}
                          </span>
                          <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border flex items-center gap-1.5 font-sans bg-opacity-5", 
                            activeItem.impact === "HIGH" ? "text-rose-400 border-rose-500/20 bg-rose-500/5" :
                            activeItem.impact === "MEDIUM" ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                            "text-cyan-400 border-cyan-500/20 bg-cyan-500/5"
                          )}>
                            <div className={cn("size-1.5 rounded-full animate-pulse", 
                              activeItem.impact === "HIGH" ? "bg-rose-500" :
                              activeItem.impact === "MEDIUM" ? "bg-amber-500" :
                              "bg-cyan-500"
                            )} />
                            {activeItem.impact || "LOW"} IMPACT
                          </span>
                        </div>

                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight font-sans">
                          {activeItem.title}
                        </h2>

                        {/* Author profiles and dates */}
                        <div className="flex flex-wrap items-center gap-3.5 text-xs font-sans text-zinc-500 pb-3 border-b border-white/5">
                          {Array.isArray(activeItem.authors) && activeItem.authors.length > 0 && (
                            <div className="flex items-center gap-2">
                              <User className="size-3.5 text-zinc-500" />
                              <span className="font-bold text-zinc-400 truncate max-w-[200px]">
                                By {activeItem.authors.join(", ")}
                              </span>
                            </div>
                          )}
                          {activeItem.sourceDomain && (
                            <div className="flex items-center gap-1.5">
                              <Globe className="size-3.5 text-zinc-500" />
                              <span className="font-medium">{activeItem.sourceDomain}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Clock className="size-3.5 text-zinc-500" />
                            <span className="tabular-nums font-medium">{formatDateTime(activeItem.publishedAt)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Premium Hero Image (Full Width, Centered) */}
                      {activeItem.thumbnail && (
                        <div className="relative w-full h-48 sm:h-64 rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm shadow-inner group">
                          <img
                            src={activeItem.thumbnail}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover filter blur-2xl opacity-[0.25] scale-110 pointer-events-none transition-all duration-700 group-hover:scale-105"
                          />
                          <img
                            src={activeItem.thumbnail}
                            alt={activeItem.title}
                            className="relative w-full h-full object-contain z-10 p-2 transition-transform duration-700 group-hover:scale-[1.01]"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-15 pointer-events-none" />
                        </div>
                      )}

                      {/* Main Executive Summary (Full Width, Dossier Style) */}
                      {activeItem.summary && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <BookOpen className="size-4 text-cyan-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 font-sans">Executive Summary</span>
                          </div>
                          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-sans font-medium whitespace-pre-line bg-white/[0.02] backdrop-blur-md p-4 sm:p-5 rounded-xl border border-white/[0.08] shadow-inner">
                            {activeItem.summary}
                          </p>
                        </div>
                      )}

                      {/* Symmetric Institutional Analytics Grid Deck (Balanced bottom column metrics) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                                                {/* Box 1: Market Sentiment & circular gauge */}
                        <div className="p-4 rounded-xl bg-white/[0.02] backdrop-blur-md border border-white/[0.08] flex flex-col items-center justify-center text-center shadow-inner">
                          <CircularGauge 
                            score={typeof activeItem.sentimentScore === 'number' ? activeItem.sentimentScore : parseFloat(activeItem.sentimentScore) || 0} 
                            size={110} 
                          />
                          <div className="space-y-1 mt-4">
                            <p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em]">AI Sentiment Rating</p>
                            <p className="text-[11px] text-zinc-400 leading-normal font-sans font-bold">
                              Categorized as <span className="text-white font-black">{activeItem.sentimentLabel || "Neutral"}</span>
                            </p>
                          </div>
                        </div>

                        {/* Box 2: Mentioned Stocks list */}
                        <div className="p-4 rounded-xl bg-white/[0.02] backdrop-blur-md border border-white/[0.08] flex flex-col justify-between shadow-inner">
                          <div className="flex items-center gap-2 mb-2.5 border-b border-white/5 pb-1.5">
                            <Cpu className="size-4 text-emerald-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Mentioned Stocks</span>
                          </div>
                          
                          {Array.isArray(activeItem.tickerSentiment) && activeItem.tickerSentiment.length > 0 ? (
                            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                              {activeItem.tickerSentiment.map((t: any, idx: number) => {
                                const tickerScore = parseFloat(t.ticker_sentiment_score) || 0;
                                let signalText = "text-cyan-400 bg-cyan-500/10";
                                if (tickerScore >= 0.1) {
                                  signalText = "text-emerald-400 bg-emerald-500/10";
                                } else if (tickerScore <= -0.1) {
                                  signalText = "text-rose-400 bg-rose-500/10";
                                }

                                return (
                                  <div 
                                    key={idx} 
                                    className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] backdrop-blur-sm border border-white/[0.08] font-sans"
                                  >
                                    <span className="text-xs font-black tracking-wider text-white">{String(t.ticker).toUpperCase()}</span>
                                    <span className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded tabular-nums", signalText)}>
                                      {tickerScore >= 0 ? "+" : ""}{tickerScore.toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center justify-center py-6">
                              <span className="text-[10px] text-zinc-600 font-sans italic uppercase tracking-wider">No specific tickers</span>
                            </div>
                          )}
                        </div>

                        {/* Box 3: Related macro Topics hierarchy */}
                        <div className="p-4 rounded-xl bg-white/[0.02] backdrop-blur-md border border-white/[0.08] flex flex-col justify-between shadow-inner">
                          <div className="flex items-center gap-2 mb-2.5 border-b border-white/5 pb-1.5">
                            <Layers className="size-4 text-cyan-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Related Topics</span>
                          </div>

                          {Array.isArray(activeItem.topics) && activeItem.topics.length > 0 ? (
                            <div className="space-y-2.5 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                              {activeItem.topics.slice(0, 3).map((t: any, idx: number) => {
                                const rel = parseFloat(t.relevance_score) || 0;
                                const style = getTopicStyle(t.topic);
                                return (
                                  <div key={idx} className="space-y-1">
                                    <div className="flex justify-between items-center text-[9px] font-sans font-bold">
                                      <span className={cn("capitalize truncate max-w-[120px]", style.class.split(" ")[0])}>
                                        {style.label}
                                      </span>
                                      <span className="text-zinc-500 tabular-nums">{(rel * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-zinc-950 rounded-full h-1 overflow-hidden">
                                      <div 
                                        className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-1 rounded-full" 
                                        style={{ width: `${rel * 100}%` }} 
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center justify-center py-6">
                              <span className="text-[10px] text-zinc-600 font-sans italic uppercase tracking-wider">No topics defined</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Footer interactive panel */}
                    <div className="p-4 border-t border-white/[0.08] bg-[#05080f]/40 backdrop-blur-xl flex gap-3">
                      <a
                        href={activeItem.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-black text-xs uppercase tracking-widest text-center hover:opacity-90 hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all duration-300 flex items-center justify-center gap-2"
                      >
                        <span>Read Full Article</span>
                        <ArrowUpRight className="size-4 stroke-[2.5]" />
                      </a>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </StockOSPortal>

      </main>
    </div>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-transparent text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="size-8 animate-spin text-emerald-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Initializing Terminal...</span>
        </div>
      </div>
    }>
      <JournalPageContent />
    </Suspense>
  );
}
