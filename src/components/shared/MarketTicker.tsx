"use client"

import React, { useEffect, useState } from "react";
import axios from "axios";
import { TrendingUp, TrendingDown, Globe } from "lucide-react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getMarketStatus } from "@/constants/market-constants";

interface IndexData {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  type?: string;
}

export function MarketTicker() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/') return;
    const fetchIndices = async () => {
      try {
        const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
        const res = await axios.get(`${engineUrl}/api/indices`);
        setIndices(res.data);
      } catch (err) {
        setIndices([
          { label: "NIFTY 50", value: "₹24,032.80", change: "-0.36%", positive: false },
          { label: "SENSEX", value: "₹77,017.79", change: "-0.33%", positive: false },
          { label: "BANK NIFTY", value: "₹54,547.05", change: "-0.60%", positive: false },
          { label: "USD / INR", value: "95.26", change: "0.20%", positive: true, type: 'currency' },
          { label: "DOW JONES", value: "₹48,941.90", change: "-1.13%", positive: false },
          { label: "S&P 500", value: "₹7,200.75", change: "-0.41%", positive: false },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchIndices();
    const interval = setInterval(fetchIndices, 30000);
    return () => clearInterval(interval);
  }, [pathname]);

  if (pathname === '/') return null;

  // Duplicate indices for seamless marquee
  const marqueeItems = [...indices, ...indices, ...indices];

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-[160] h-auto border-t border-white/5 bg-zinc-950/90 backdrop-blur-xl py-3 overflow-hidden">
      <div className="relative flex items-center">
        {isLoading ? (
          <div className="flex justify-center gap-4 px-6 w-full">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="animate-pulse h-8 w-32 bg-white/5 rounded-full"></div>
            ))}
          </div>
        ) : (
          <motion.div 
            className="flex items-center gap-3 pr-3"
            animate={{
              x: [0, "-33.33%"],
            }}
            transition={{
              x: {
                repeat: Infinity,
                repeatType: "loop",
                duration: 20,
                ease: "linear",
              },
            }}
          >
            {marqueeItems.map((item, idx) => {
              const isCurrency = item.type === 'currency';
              const isPositive = item.positive;
              const isUsMarket = item.label.includes('DOW') || item.label.includes('S&P') || item.label.includes('NASDAQ');
              const market = isUsMarket ? 'US' : 'IN';
              const status = isCurrency ? 'OPEN' : getMarketStatus(market);
              
              return (
                <div 
                  key={idx}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full hover:brightness-125 transition-all cursor-default group border whitespace-nowrap shadow-sm ${
                    isCurrency 
                      ? 'bg-amber-400/10 border-amber-400/30' 
                      : isPositive 
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "size-1 rounded-full",
                      status === 'OPEN' ? "bg-emerald-400 animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.8)]" : 
                      status === 'CLOSED' ? "bg-zinc-600" :
                      "bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]"
                    )} title={`Market ${status}`} />
                    <span className={`font-terminal-label text-[10px] font-black uppercase tracking-[0.1em] ${
                      isCurrency ? 'text-amber-400' : isPositive ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {item.label}
                    </span>
                  </div>
                  
                  <span className="font-headline font-bold text-[11px] text-white/90 tabular-nums">
                    {item.value}
                  </span>
                  
                  <div className={`flex items-center gap-1 ${
                    isCurrency ? 'text-amber-400/90' : isPositive ? 'text-emerald-400/90' : 'text-red-400/90'
                  }`}>
                    {isCurrency ? (
                      <Globe className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                    ) : isPositive ? (
                      <TrendingUp className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                    ) : (
                      <TrendingDown className="w-3 h-3 group-hover:-rotate-12 transition-transform" />
                    )}
                    <span className="font-terminal-label font-bold text-[9px] tabular-nums tracking-tight">
                      {item.change}
                    </span>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </div>

      <style jsx>{`
        footer {
          mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
        }
      `}</style>
    </footer>
  );
}

