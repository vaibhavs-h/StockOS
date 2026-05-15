"use client"

import React, { useEffect, useState } from "react";
import axios from "axios";
import { TrendingUp, TrendingDown, Globe } from "lucide-react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getMarketStatus } from "@/constants/market-constants";
import { FloatingAssistant } from "../dashboard/FloatingAssistant";

interface IndexData {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  type?: string;
}

export function MarketTicker() {
  const [mounted, setMounted] = useState(false);
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('stockos_indices_cache');
      if (cached) {
        try { 
          setIndices(JSON.parse(cached));
          setIsLoading(false);
        } catch (e) {
          console.error("Failed to parse indices cache", e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted || pathname === '/' || pathname === '/auth/login') return;
    const fetchIndices = async () => {
      try {
        const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
        const res = await axios.get(`${engineUrl}/api/indices`);
        setIndices(res.data);
        if (typeof window !== 'undefined') {
          localStorage.setItem('stockos_indices_cache', JSON.stringify(res.data));
        }
      } catch (err) {
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('stockos_indices_cache');
          if (cached) {
            try { setIndices(JSON.parse(cached)); } catch (e) {}
          } else {
            // Last resort: hardcoded values
            setIndices([
              { label: "NIFTY 50", value: "₹24,032.80", change: "-0.36%", positive: false },
              { label: "SENSEX", value: "₹77,017.79", change: "-0.33%", positive: false },
              { label: "BANK NIFTY", value: "₹54,547.05", change: "-0.60%", positive: false },
              { label: "USD / INR", value: "95.26", change: "0.20%", positive: true, type: 'currency' },
              { label: "DOW JONES", value: "₹48,941.90", change: "-1.13%", positive: false },
              { label: "S&P 500", value: "₹7,200.75", change: "-0.41%", positive: false },
            ]);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Heartbeat Neural Link: Activates Ephemeral Sync for Indices
    const sendIndicesHeartbeat = async () => {
      if (!mounted || document.hidden || indices.length === 0) return;
      
      const symbolMap: Record<string, { symbol: string; market: string }> = {
        'NIFTY 50': { symbol: '^NSEI', market: 'IN' },
        'SENSEX': { symbol: '^BSESN', market: 'IN' },
        'BANK NIFTY': { symbol: '^NSEBANK', market: 'IN' },
        'DOW JONES': { symbol: '^DJI', market: 'US' },
        'S&P 500': { symbol: '^GSPC', market: 'US' },
        'NASDAQ': { symbol: '^IXIC', market: 'US' }
      };

      try {
        // Pulse each index to the coordinator
        const pulses = indices
          .map(idx => symbolMap[idx.label.toUpperCase()])
          .filter(Boolean);

        for (const pulse of pulses) {
          fetch('/api/market/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: pulse!.symbol, market: pulse!.market })
          }).catch(() => {});
        }
      } catch (e) {}
    };

    fetchIndices();
    const interval = setInterval(fetchIndices, 30000);
    const heartbeatInterval = setInterval(sendIndicesHeartbeat, 30000);
    
    // Initial heartbeat after a short delay to ensure indices state is populated
    setTimeout(sendIndicesHeartbeat, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(heartbeatInterval);
    };
  }, [mounted, pathname, indices.length]);

  if (!mounted || pathname === '/' || pathname === '/auth/login') return null;

  // Duplicate indices for seamless marquee
  const marqueeItems = [...indices, ...indices, ...indices];

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-[160] h-auto border-t border-white/5 bg-zinc-950/90 backdrop-blur-xl py-3 flex items-center justify-between">
      <div className="relative flex-grow overflow-hidden mask-fade-edges">
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
      </div>

      {/* Institutional Assistant Slot - Ticker Peer */}
      <div className="px-6 border-l border-white/5 flex items-center shrink-0 relative z-20 bg-zinc-950/90 backdrop-blur-xl">
        <FloatingAssistant />
      </div>

      <style jsx>{`
        .mask-fade-edges {
          mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
        }
      `}</style>
    </footer>
  );
}

