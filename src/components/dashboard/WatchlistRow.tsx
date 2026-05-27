
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Trash2, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { AssetLogo } from '../shared/AssetLogo';

interface WatchlistRowProps {
  asset: any;
  onRemove: (symbol: string) => void;
}

export const WatchlistRow: React.FC<WatchlistRowProps> = ({ asset, onRemove }) => {
  const [isHovered, setIsHovered] = useState(false);
  const isUp = (asset.day_change_percentage || 0) >= 0;
  const holding = asset.holding;
  const hasHolding = !!holding;

  const isMF = asset.market === 'MF' || asset.symbol.startsWith('INF') || (asset.symbol.length === 12 && asset.symbol.startsWith('IN'));

  const terminalLink = isMF
    ? `/mutual-funds/${asset.symbol}`
    : (asset.symbol.endsWith('.NS') || asset.symbol.endsWith('.BO')
      ? `/stocks/${asset.symbol}`
      : `/us-stocks/${asset.symbol}`);

  // Get first letter for avatar
  const displayChar = asset.symbol.charAt(0).toUpperCase();

  const displaySymbolStr = isMF
    ? (asset.displaySymbol || asset.symbol)
    : asset.symbol.split('.')[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.8, filter: "blur(12px)", transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group"
    >
      <Link href={terminalLink} className="block">
        <motion.div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          whileHover={{ y: -4, scale: 1.015 }}
          className={cn(
            "relative p-4 rounded-[24px] border transition-all duration-500 overflow-hidden flex flex-col justify-between h-[140px] backdrop-blur-3xl",
            "bg-white/[0.01] border-white/[0.05] group-hover:border-white/20 group-hover:bg-white/[0.03] shadow-xl",
            isHovered && (isUp ? "shadow-emerald-500/10" : "shadow-rose-500/10")
          )}
        >
          {/* Dynamic Atmospheric Glow */}
          <div className={cn(
            "absolute -bottom-10 -right-10 size-36 blur-[45px] transition-all duration-700 opacity-0 group-hover:opacity-20",
            isUp ? "bg-emerald-500" : "bg-rose-500"
          )} />

          {/* Top Section: Identity & Action HUD */}
          <div className="flex justify-between items-start z-10 relative">
            <div className="flex items-center gap-3.5">
              <AssetLogo
                symbol={asset.symbol}
                name={asset.name}
                size="md"
                className="shrink-0"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 w-full">
                  <h3 className={cn(
                    "text-[16px] font-black text-white tracking-tighter uppercase leading-none drop-shadow-2xl truncate flex-1",
                    isMF && "max-w-[140px]"
                  )} title={isMF ? asset.name : displaySymbolStr}>
                    {isMF ? asset.name : displaySymbolStr}
                  </h3>
                  {hasHolding && <div className="size-1 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)] animate-pulse shrink-0" />}
                </div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.15em] truncate max-w-[110px] opacity-60 mt-1.5" title={isMF ? displaySymbolStr : asset.name}>
                  {isMF ? displaySymbolStr : asset.name}
                </p>
              </div>
            </div>

            {/* Action Overlay */}
            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove(asset.symbol);
                }}
                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:text-white transition-all border border-rose-500/30 hover:bg-rose-500 hover:shadow-[0_0_15px_rgba(244,63,94,0.4)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bottom Section: Market Hero Rail */}
          <div className="flex justify-between items-end z-10">
            <div className="flex flex-col">
              {isMF ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 shrink-0">NAV</span>
                  <span className="text-[19px] font-black text-white font-mono tracking-tighter tabular-nums leading-none">
                    ₹{asset.current_price != null ? Number(asset.current_price).toFixed(2) : '-'}
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 shrink-0">LTP</span>
                  <span className="text-[19px] font-black text-white font-mono tracking-tighter tabular-nums leading-none">
                    ₹{asset.current_price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {hasHolding && (
                <span className="text-[8px] text-zinc-500 font-black uppercase tracking-[0.15em] mt-1.5 opacity-80">
                  {isMF ? `${Number(holding.quantity).toFixed(2)} UNITS` : `${holding.quantity} SHARES`}
                </span>
              )}
            </div>

            <div className={cn(
              "px-2.5 py-0.5 rounded-full border text-[10px] font-black tabular-nums tracking-tighter transition-all duration-500 shadow-md",
              isUp
                ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                : "text-rose-400 border-rose-500/20 bg-rose-500/10"
            )}>
              {isUp ? '+' : ''}{asset.day_change_percentage?.toFixed(2)}%
            </div>
          </div>

          {/* Subtle Refractive Shine */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        </motion.div>
      </Link>
    </motion.div>
  );
};
