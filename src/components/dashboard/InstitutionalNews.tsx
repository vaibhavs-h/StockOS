
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, ExternalLink, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewsItem {
  _id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  thumbnail?: string;
}

export const InstitutionalNews: React.FC = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('https://fnewsbackend.onrender.com/api/news?category=all');
        const data = await response.json();
        const items = Array.isArray(data) ? data : data.news || data.items || [];
        setNews(items.slice(0, 10));
      } catch (error) {
        console.error('Failed to fetch news:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNews();
    const interval = setInterval(fetchNews, 300000); // 5 mins
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#05080c] border-l border-white/5">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <Newspaper className="w-4 h-4" />
          </div>
          <span className="font-headline text-[13px] uppercase tracking-[0.2em] text-white font-bold">
            Intelligence Feed
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Live</span>
        </div>
      </div>

      {/* News List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 bg-white/5 rounded w-3/4" />
                <div className="h-3 bg-white/5 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {news.map((item) => (
              <a 
                key={item._id} 
                href={item.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="group block p-5 hover:bg-white/[0.02] transition-all"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest px-1.5 py-0.5 bg-blue-400/10 rounded">
                      {item.source || 'Market'}
                    </span>
                    <div className="flex items-center gap-2 text-zinc-600">
                      <Clock className="w-3 h-3" />
                      <span className="text-[9px] font-bold">
                        {new Date(item.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-[13px] font-bold text-zinc-200 group-hover:text-white transition-colors line-clamp-2 leading-snug tracking-tight">
                    {item.title}
                  </h3>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-zinc-600 font-medium italic">
                      {item.category || 'Institutional'}
                    </span>
                    <ExternalLink className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
