"use client"

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SearchIcon, XIcon, ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/services/DatabaseClient";
import { cn } from "@/lib/utils";

export function MarketSearch({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalAssets, setTotalAssets] = useState(0);
  const [indices, setIndices] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const fetchData = async () => {
      // Fetch Global Indices
      const indexSymbols = ["NSEI", "BSESN", "NSEBANK", "CNXPHARMA", "CNXMETAL", "GSPC", "IXIC", "DJI"];
      
      const [
        { data: inIndices }, 
        { data: usIndices },
        { count: inCount },
        { count: usCount }
      ] = await Promise.all([
        supabase.from("market_assets").select("*").in("symbol", indexSymbols),
        supabase.from("us_market_assets").select("*").in("symbol", indexSymbols),
        supabase.from("market_assets").select("*", { count: 'exact', head: true }),
        supabase.from("us_market_assets").select("*", { count: 'exact', head: true })
      ]);
      
      setIndices([
        ...(inIndices || []).map(i => ({ ...i, market: 'IN' })),
        ...(usIndices || []).map(i => ({ ...i, market: 'US' }))
      ]);

      setTotalAssets((inCount || 0) + (usCount || 0));
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (query.length > 0) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
      setResults([]);
    }

    const searchIndices = async () => {
      if (query.length < 1) return;

      try {
        const [{ data: inData }, { data: usData }] = await Promise.all([
          supabase.from("market_assets")
            .select("*")
            .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
            .limit(10),
          supabase.from("us_market_assets")
            .select("*")
            .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
            .limit(10)
        ]);

        const combined = [
          ...(inData || []).map(a => ({ ...a, market: 'IN' })),
          ...(usData || []).map(a => ({ ...a, market: 'US' }))
        ];
        
        setResults(combined);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      searchIndices();
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.documentElement.classList.add('search-open');
    } else {
      document.documentElement.classList.remove('search-open');
      setQuery(""); // Reset search on close
    }
  }, [isOpen]);

  const formatCurrency = (val: number, market: 'IN' | 'US' = 'IN') => {
    return new Intl.NumberFormat(market === 'US' ? 'en-US' : 'en-IN', {
      style: 'currency',
      currency: market === 'US' ? 'USD' : 'INR',
      maximumFractionDigits: 2
    }).format(val);
  }

  return (
    <>
      <div onClick={() => setIsOpen(true)} className="w-full">
        {children}
      </div>

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[250] flex items-start justify-center pt-[10vh] px-4 overflow-hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="absolute inset-0"
              />
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-[300] w-full max-w-lg bg-zinc-900/80 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.5),0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden"
              >
                <div className="flex items-center px-6 py-3 border-b border-white/5 bg-zinc-900/50 backdrop-blur-xl">
                  <SearchIcon className="size-3.5 text-emerald-500 mr-4" />
                  <input
                    autoFocus
                    placeholder="Search Market Intelligence..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-base font-normal text-white placeholder:text-white/20 font-headline tracking-tighter"
                  />
                  {isLoading && <Loader2 className="size-3.5 text-emerald-500 animate-spin mr-4" />}
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <XIcon className="size-3.5 text-zinc-500" />
                  </button>
                </div>

                <div className="p-1 max-h-[60vh] overflow-y-auto no-scrollbar bg-zinc-900">
                  {query.length > 0 ? (
                    <div className="p-1 space-y-0.5">
                      <p className="px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.3em] text-emerald-500/60 font-headline">
                        {results.length > 0 ? 'Search Results' : isLoading ? 'Searching...' : 'No results found'}
                      </p>
                      {results.map((stock) => (
                        <button
                          key={`${stock.market}-${stock.symbol}`}
                          onClick={() => {
                            const route = stock.market === 'US' ? `/us-stocks/${stock.symbol}` : `/stocks/${stock.symbol}`;
                            router.push(route);
                            setIsOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-xl transition-all border border-transparent backdrop-blur-md group relative overflow-hidden",
                            stock.day_change_percentage >= 0 
                              ? "hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:scale-[1.01]" 
                              : "hover:bg-rose-500/10 hover:border-rose-500/30 hover:scale-[1.01]"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-white/[0.03] flex items-center justify-center border border-white/5 font-black text-white/40 font-headline group-hover:border-white/10 transition-colors">
                              {stock.symbol[0]}
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className={cn(
                                  "text-sm font-black font-headline tracking-tighter transition-colors drop-shadow-[0_0_5px_rgba(255,255,255,0.05)]",
                                  stock.day_change_percentage >= 0 ? "group-hover:text-emerald-400" : "group-hover:text-rose-400"
                                )}>
                                  {stock.symbol}
                                </p>
                                <span className={cn(
                                  "text-[7px] font-black px-1 py-0.5 rounded uppercase tracking-tighter",
                                  stock.market === 'US' ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                                )}>
                                  {stock.market}
                                </span>
                              </div>
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-headline opacity-60 truncate w-32">
                                {stock.name}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold font-headline tabular-nums text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">
                              {formatCurrency(stock.current_price, stock.market)}
                            </p>
                            <div className="flex items-center justify-end gap-1">
                              <p className={cn(
                                "text-[10px] font-black font-headline drop-shadow-[0_0_5px_rgba(0,0,0,0.2)]",
                                stock.day_change_percentage >= 0 ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {stock.day_change_percentage >= 0 ? "+" : ""}{stock.day_change_percentage?.toFixed(2)}%
                              </p>
                              <ArrowRight className={cn(
                                "size-3 opacity-0 -translate-x-2 transition-all",
                                "group-hover:opacity-100 group-hover:translate-x-0",
                                stock.day_change_percentage >= 0 ? "text-emerald-400" : "text-rose-400"
                              )} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 px-4 flex flex-col items-center justify-center text-center">
                      <div className="grid grid-cols-3 gap-2 w-full mb-6">
                        {indices
                          .map(idx => (
                           <div 
                             key={`${idx.market}-${idx.symbol}`} 
                             onClick={() => {
                               const route = idx.market === 'US' ? `/us-stocks/${idx.symbol}` : `/stocks/${idx.symbol}`;
                               router.push(route);
                               setIsOpen(false);
                             }}
                             className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-xl p-3 text-left hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:scale-[1.02] hover:brightness-110 transition-all cursor-pointer group overflow-hidden"
                           >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <p className={cn("text-[9px] font-black uppercase tracking-widest font-headline drop-shadow-[0_0_5px_rgba(52,211,153,0.3)]", idx.market === 'US' ? 'text-blue-400' : 'text-emerald-400')}>{idx.symbol}</p>
                                <span className={cn("text-[6px] font-black px-1 rounded uppercase", idx.market === 'US' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400')}>{idx.market}</span>
                              </div>
                              <div className={cn("size-1 rounded-full animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]", idx.market === 'US' ? 'bg-blue-400' : 'bg-emerald-400')} />
                            </div>
                            <div className="space-y-0">
                              <p className="text-sm font-bold font-headline tabular-nums tracking-tighter text-white leading-none mb-1 drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">{formatCurrency(idx.current_price, idx.market)}</p>
                              <p className={cn("text-[9px] font-black font-headline drop-shadow-[0_0_5px_rgba(52,211,153,0.2)]", idx.day_change_percentage >= 0 ? "text-emerald-400" : "text-red-500")}>
                                {idx.day_change_percentage >= 0 ? "+" : ""}{idx.day_change_percentage?.toFixed(2)}%
                              </p>
                            </div>
                            <p className="mt-2 text-[8px] font-bold text-zinc-500 uppercase tracking-tighter truncate font-headline opacity-40 group-hover:opacity-60 transition-opacity">{idx.name}</p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] font-headline">Market Pulse Active</p>
                        <p className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest font-headline leading-relaxed">Find stocks, indices and more</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-3 bg-black/40 border-t border-white/5 flex items-center justify-center text-[9px] font-black text-zinc-600 tracking-[0.2em] uppercase font-headline">
                  <span>
                    Showing <span className="text-white">{results.length}</span> of <span className="text-white">{totalAssets}</span> Global Assets
                  </span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

