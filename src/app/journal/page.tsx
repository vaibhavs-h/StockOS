"use client"

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  ExternalLink,
  Bookmark,
  Flame,
  Globe,
  Flag,
  Save,
  ChevronDown,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE_URL = "https://fnewsbackend.onrender.com";

const tabs = [
  { label: "Global", value: "global", icon: <Globe className="size-3" /> },
  { label: "India", value: "india", icon: <Flag className="size-3" /> },
  { label: "Saved", value: "saved", icon: <Save className="size-3" /> },
];

const impactMeta = {
  HIGH: {
    label: "High Impact",
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    dot: "bg-red-500",
    weight: 3,
  },
  MEDIUM: {
    label: "Medium Impact",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    dot: "bg-orange-500",
    weight: 2,
  },
  LOW: {
    label: "Low Impact",
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    dot: "bg-yellow-500",
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

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState("global");
  const [sortMode, setSortMode] = useState("newest");
  const [trendingMode, setTrendingMode] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSortOpen, setIsSortOpen] = useState(false);

  const fetchNewsCategory = async (category: string) => {
    const response = await fetch(`${API_BASE_URL}/api/news?category=${category}`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : data.news || data.items || data.data || data.articles || [];
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const items = await fetchNewsCategory(activeTab);
        if (!ignore) setNews(items);
      } catch (err: any) {
        if (!ignore) {
          setError(err.message || "Unable to load market news.");
          setNews([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [activeTab]);

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

  const handleToggleSave = async (item: any) => {
    const id = item._id;
    if (!id) return;

    const isCurrentlySaved = item.saved;
    const original = [...news];

    // Optimistic UI
    if (activeTab === "saved" && isCurrentlySaved) {
      setNews(prev => prev.filter(i => i._id !== id));
    } else {
      setNews(prev =>
        prev.map(i =>
          i._id === id ? { ...i, saved: !isCurrentlySaved } : i
        )
      );
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/news/save/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(text);
        throw new Error();
      }
    } catch (err) {
      setNews(original);
      setError(`Unable to ${isCurrentlySaved ? "unsave" : "save"} this story.`);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-white selection:bg-emerald-500/30 relative overflow-x-hidden">
      <main className="pt-24 pb-12 px-6 max-w-[1700px] mx-auto w-full relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8"
        >
          <div className="relative group flex-1">
            <div className="absolute -inset-4 bg-emerald-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <div className="flex items-center gap-3 mb-2 relative z-10">
              <span className="h-px w-8 bg-emerald-500/40" />
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-emerald-500 font-headline">Insight Desk</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-2 text-white relative z-10 font-headline">
              Journal
            </h1>
            <p className="text-zinc-500 max-w-xl text-base font-medium leading-snug relative z-10 mb-4 font-headline">
              Scanning the financial landscape for your next high-conviction trade.
            </p>

            <button
              onClick={() => setTrendingMode(!trendingMode)}
              className={cn(
                "relative z-10 flex items-center gap-2.5 px-6 py-3 rounded-[100px] text-[10px] font-black uppercase tracking-widest border transition-all duration-500 shadow-xl font-headline",
                trendingMode
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.15)]"
                  : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              )}
            >
              {trendingMode ? (
                <Flame className="size-3.5 animate-pulse" />
              ) : (
                <Activity className="size-3.5 animate-pulse" />
              )}
              {trendingMode ? "Trending View" : "Live Stream"}
            </button>
          </div>

          <div className="flex flex-col items-end gap-5 relative z-20">
            <div className="flex items-center gap-1 bg-zinc-950/60 backdrop-blur-xl p-1.5 rounded-[100px] border border-white/10 shadow-2xl relative">
              {tabs.map(tab => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "relative flex items-center gap-2 px-5 py-1.5 rounded-[100px] text-[14px] font-bold tracking-tight transition-colors duration-300 z-10 font-headline",
                      isActive ? "text-black" : "text-zinc-500 hover:text-white"
                    )}
                  >
                    {React.cloneElement(tab.icon as React.ReactElement, { className: "size-4" })}
                    {tab.label}
                    {isActive && (
                      <motion.div
                        layoutId="active-journal-tab"
                        className="absolute inset-0 bg-emerald-500 rounded-[100px] -z-10 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                        transition={{ type: "spring", stiffness: 400, damping: 33 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 relative">
              <div className="relative">
                <button
                  onClick={() => !trendingMode && setIsSortOpen(!isSortOpen)}
                  className={cn(
                    "flex items-center gap-3 px-5 py-2 rounded-[100px] text-[14px] font-bold tracking-tight border transition-all duration-300 min-w-[210px] justify-between font-headline",
                    trendingMode
                      ? "opacity-50 cursor-not-allowed border-white/5 text-zinc-600"
                      : "bg-zinc-950/60 backdrop-blur-xl border-white/10 text-zinc-400 hover:text-white hover:border-white/30 hover:bg-zinc-900/60"
                  )}
                >
                  <span>
                    Sort : <span className="text-emerald-500">{sortMode === 'impact' ? 'High Impact' : sortMode === 'newest' ? 'Newest First' : 'Oldest First'}</span>
                  </span>
                  <ChevronDown className={cn("size-4 transition-transform duration-300", isSortOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isSortOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-2 w-full bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-[20px] shadow-2xl overflow-hidden z-[100]"
                    >
                      {[
                        { label: "Newest First", value: "newest" },
                        { label: "Oldest First", value: "oldest" },
                        { label: "High Impact", value: "impact" }
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setSortMode(option.value);
                            setIsSortOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all duration-200 hover:bg-emerald-500/10 hover:text-emerald-400 border-b border-white/5 last:border-none font-headline",
                            sortMode === option.value ? "bg-emerald-500/5" : "text-zinc-500"
                          )}
                        >
                          <span className={sortMode === option.value ? "text-white/60" : "text-zinc-500"}>Sort : </span>
                          <span className={sortMode === option.value ? "text-emerald-500" : ""}>{option.label}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 p-4 rounded-[100px] bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black tracking-widest uppercase flex items-center gap-3 backdrop-blur-xl"
          >
            <div className="size-1.5 rounded-full bg-red-500 animate-pulse" />
            {error}
          </motion.div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-80 rounded-2xl bg-white/[0.02] animate-pulse border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent" />
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <div
              key={activeTab + sortMode + trendingMode}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10"
            >
              {sortedNews.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="col-span-full py-32 flex flex-col items-center justify-center text-center space-y-6"
                >
                  <div className="size-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center relative overflow-hidden group">
                    <Bookmark className="size-8 text-zinc-700 group-hover:text-emerald-500/50 transition-colors duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold tracking-tighter text-white/80 uppercase">No news saved</h3>
                    <p className="text-[10px] font-black tracking-widest text-zinc-500 max-w-[280px] mx-auto leading-snug uppercase">
                      Your saved list is empty. <br /> Bookmark news to track them here.
                    </p>
                  </div>
                </motion.div>
              ) : sortedNews.map((item, idx) => {
                const impact = normalizeImpact(item.impact);
                const meta = impactMeta[impact as keyof typeof impactMeta];
                return (
                  <motion.article
                    key={item._id || `news-${idx}`}
                    initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -20, scale: 0.95, filter: "blur(10px)" }}
                    transition={{
                      duration: 0.5,
                      delay: Math.min(idx * 0.03, 0.3),
                      ease: [0.23, 1, 0.32, 1]
                    }}
                    className="group relative rounded-[28px] p-6 flex flex-col bg-zinc-900/90 backdrop-blur-xl border border-white/5 hover:border-emerald-500/20 transition-all duration-500 overflow-hidden shadow-2xl"
                  >
                    <div className={cn("absolute left-0 top-0 bottom-0 w-0.5", meta.bg, "opacity-20 group-hover:opacity-100 transition-opacity")} />

                    <div className="flex justify-between items-center mb-4 relative z-10">
                      <span className={cn("px-2.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-[0.2em] border flex items-center gap-1.5 font-headline", meta.bg, meta.color, meta.border, "bg-opacity-5")}>
                        <div className={cn("size-1 rounded-full", meta.bg, "animate-pulse")} />
                        {meta.label}
                      </span>
                      <button
                        onClick={() => handleToggleSave(item)}
                        className={cn(
                          "size-7 rounded-full flex items-center justify-center transition-all duration-300 border",
                          item.saved ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-zinc-600 hover:text-white bg-white/5 border-white/5 hover:border-white/20"
                        )}
                      >
                        <Bookmark className={cn("size-3", item.saved && "fill-current")} />
                      </button>
                    </div>

                    <div className="flex-grow relative z-10 space-y-3">
                      <h3 className="text-lg font-bold leading-[1.1] group-hover:text-white transition-colors tracking-tighter font-headline text-white/90">
                        {item.title || "Untitled market update"}
                      </h3>

                      {Array.isArray(item.stocks) && item.stocks.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.stocks.map((stock: string) => (
                            <span key={stock} className="px-1.5 py-0.5 rounded bg-white/5 text-[7px] font-black text-white/40 uppercase tracking-widest border border-white/5 font-headline group-hover:text-emerald-400 group-hover:border-emerald-500/20 transition-colors">
                              {stock}
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-zinc-500 text-[10.5px] leading-relaxed line-clamp-2 font-medium font-headline">
                        {item.summary || "No AI summary available for this story yet."}
                      </p>

                      <div className="relative p-3 rounded-xl bg-white/[0.01] border border-white/5 group-hover:border-emerald-500/10 overflow-hidden transition-all">
                        <div className="absolute inset-0 bg-emerald-500/[0.01] opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="text-[7px] font-black uppercase tracking-[0.2em] text-emerald-500/60 block mb-1 relative z-10">Terminal Insight</span>
                        <p className="text-[10px] text-zinc-400 leading-relaxed italic font-medium relative z-10">
                          {item.why || "This item may influence market positioning and sector sentiment."}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between font-headline relative z-10">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-0.5">{item.source || "Terminal Feed"}</p>
                          <div className="flex items-center gap-1.5 opacity-30">
                            <Clock className="size-2.5 text-zinc-500" />
                            <span className="text-[7px] font-black text-zinc-500 tabular-nums uppercase tracking-widest">{formatDateTime(item.publishedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="size-7 rounded-full bg-white/5 flex items-center justify-center hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-all duration-300 border border-white/5 hover:border-emerald-500/30"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </main>
    </div>



  );
}
