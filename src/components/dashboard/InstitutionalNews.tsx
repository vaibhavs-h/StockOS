'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Clock,
  Bookmark,
  Globe,
  Flag,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface NewsItem {
  _id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  impact: string;
  saved: boolean;
  summary?: string;
  thumbnail?: string;
}

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const InstitutionalNews: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id || 'guest';

  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const getISTDateString = (dateInput: Date | string) => {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  };

  const fetchNews = async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
      const response = await fetch(`${baseUrl}/api/news?category=all&userId=${userId}&limit=300&impact=HIGH`);
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.news || data.items || [];
      setNews(items);
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 300000);
    return () => clearInterval(interval);
  }, [userId]);

  const handleToggleSave = async (e: React.MouseEvent, item: NewsItem) => {
    e.stopPropagation();
    const id = item._id;
    if (!id || userId === 'guest') return;
    setSavingId(id);
    const isCurrentlySaved = item.saved;
    setNews(prev => prev.map(i => (i._id === id ? { ...i, saved: !isCurrentlySaved } : i)));
    try {
      const baseUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
      const res = await fetch(`${baseUrl}/api/news/save/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setNews(prev => prev.map(i => (i._id === id ? { ...i, saved: isCurrentlySaved } : i)));
    } finally {
      setSavingId(null);
    }
  };

  const handleCardClick = (id: string) => {
    router.push(`/journal?articleId=${id}`);
  };

  const todayIST = getISTDateString(new Date());
  const todayNews = news.filter(item => {
    return item.impact === 'HIGH' && getISTDateString(item.publishedAt) === todayIST;
  });

  return (
    <div className="flex flex-col h-full min-h-0 font-sans">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="relative px-6 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 overflow-hidden">
        {/* Emerald gradient wash */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.07] via-emerald-500/[0.02] to-transparent pointer-events-none" />

        <div className="flex items-center gap-3 relative z-10">
          <div className="relative shrink-0">
            <div className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
            <motion.div
              animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full bg-emerald-400"
            />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white">
            Intelligence Feed
          </span>
        </div>

        <div className="flex items-center gap-2 relative z-10">
          <span className="text-[9px] font-bold tabular-nums text-zinc-500 tracking-wider">
            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ── Feed List ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse space-y-2 px-1">
                <div className="flex gap-2">
                  <div className="h-4 bg-white/[0.04] rounded-full w-20" />
                  <div className="h-4 bg-white/[0.03] rounded-full w-14" />
                </div>
                <div className="h-3.5 bg-white/[0.04] rounded w-full" />
                <div className="h-3.5 bg-white/[0.03] rounded w-4/5" />
              </div>
            ))}
          </div>
        ) : todayNews.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="size-14 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
                <TrendingUp className="size-6 text-zinc-700" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">
                  Terminal Quiet
                </p>
                <p className="text-[11px] text-zinc-700 leading-relaxed max-w-[180px]">
                  No high-impact signals recorded for today's IST session.
                </p>
              </div>
            </motion.div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {todayNews.map((item, idx) => {
              const isIndia = item.category === 'india';
              const accentColor = isIndia
                ? 'bg-amber-400'
                : 'bg-cyan-400';
              const tagColor = isIndia
                ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                : 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
              const glowHover = isIndia
                ? 'hover:bg-amber-500/[0.03]'
                : 'hover:bg-cyan-500/[0.03]';
              const isSaved = item.saved;

              return (
                <motion.div
                  key={item._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                  onClick={() => handleCardClick(item._id)}
                  className={cn(
                    'group relative flex gap-0 cursor-pointer transition-colors duration-200',
                    'border-b border-white/[0.04] last:border-0',
                    glowHover
                  )}
                >
                  {/* Left accent bar */}
                  <div className={cn(
                    'w-[3px] shrink-0 rounded-r-full my-3 ml-0 transition-all duration-300 opacity-30 group-hover:opacity-100',
                    accentColor
                  )} />

                  <div className="flex-1 px-4 py-3.5 min-w-0">
                    {/* Top row: source + category tag + time + bookmark */}
                    <div className="flex items-center gap-2 mb-2">
                      {/* Source */}
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/80 bg-emerald-400/[0.07] px-2 py-0.5 rounded-md border border-emerald-400/10 truncate max-w-[110px]">
                        {item.source || 'Market'}
                      </span>

                      {/* India / Global tag */}
                      <span className={cn(
                        'flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0',
                        tagColor
                      )}>
                        {isIndia
                          ? <Flag className="size-2.5" />
                          : <Globe className="size-2.5" />}
                        {isIndia ? 'India' : 'Global'}
                      </span>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Time */}
                      <div className="flex items-center gap-1 text-zinc-600 shrink-0">
                        <Clock className="size-2.5" />
                        <span className="text-[9px] font-bold tabular-nums">
                          {formatTime(item.publishedAt)}
                        </span>
                      </div>

                      {/* Bookmark */}
                      {userId !== 'guest' && (
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={e => handleToggleSave(e, item)}
                          disabled={savingId === item._id}
                          className={cn(
                            'size-6 rounded-lg flex items-center justify-center border transition-all duration-300 shrink-0',
                            isSaved
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                              : 'text-zinc-700 bg-white/[0.03] border-white/[0.06] hover:text-zinc-400 hover:border-white/10'
                          )}
                        >
                          <motion.div
                            animate={isSaved ? { scale: [1, 1.35, 1], rotate: [0, 8, -8, 0] } : { scale: 1 }}
                            transition={{ duration: 0.4 }}
                          >
                            <Bookmark className={cn(
                              'size-3 transition-colors duration-200',
                              isSaved ? 'fill-emerald-400 stroke-emerald-400' : 'fill-none stroke-current'
                            )} />
                          </motion.div>
                        </motion.button>
                      )}
                    </div>

                    {/* Headline */}
                    <p className="text-[12.5px] font-semibold text-zinc-300 group-hover:text-white leading-snug tracking-tight transition-colors duration-200 line-clamp-2">
                      {item.title}
                    </p>

                    {/* High impact indicator dot row */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="size-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_4px_rgba(244,63,94,0.6)]" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-rose-400/70">
                        High Impact
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ── Footer count bar ──────────────────────────────── */}
      {!isLoading && todayNews.length > 0 && (
        <div className="shrink-0 px-5 py-2.5 border-t border-white/[0.04] bg-black/10 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-700">
            {todayNews.length} signal{todayNews.length !== 1 ? 's' : ''} today
          </span>
          <div className="flex items-center gap-1.5">
            <div className="size-1 rounded-full bg-emerald-500/60" />
            <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-widest">IST</span>
          </div>
        </div>
      )}
    </div>
  );
};
