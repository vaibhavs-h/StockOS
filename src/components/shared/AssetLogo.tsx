import React from 'react';
import { cn } from '@/lib/utils';
import { getAssetColors } from '@/utils/logo-utils';
import logoMapping from '../../../public/stock-icons/mapping.json';

interface AssetLogoProps {
  symbol: string;
  name?: string;
  logoUrl?: string | null;
  website?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const resolveMFKey = (name: string): string | null => {
  const nameLower = name.toLowerCase();
  const keywords = [
    'hdfc', 'sbi', 'icici', 'prudential', 'axis', 'kotak', 'tata', 
    'aditya', 'birla', 'uti', 'lic', 'motilal', 'groww', 'franklin', 
    'dsp', 'mirae', 'ppfas', 'parag', 'quant', 'canara', 'edelweiss', 
    'sundaram', 'hsbc', 'bandhan', 'invesco', 'zerodha', 'nippon', 
    'reliance', 'jm', 'whiteoak', 'navi', 'pgim', 'union', 'bajaj', 
    'samco', 'helios', '360', 'iifl', 'baroda', 'bnp', 'shriram', 
    'mahindra', 'taurus', 'angel', 'capitalmind', 'abakkus'
  ];
  for (const key of keywords) {
    if (nameLower.includes(key)) {
      if (key === 'prudential') return 'icici';
      if (key === 'aditya' || key === 'birla') return 'birla';
      if (key === 'parag') return 'ppfas';
      if (key === 'reliance') return 'nippon';
      if (key === 'iifl' || key === '360') return '360_one';
      if (key === 'bnp') return 'baroda';
      return key;
    }
  }
  return null;
};

export const AssetLogo: React.FC<AssetLogoProps> = ({
  symbol,
  name,
  className,
  size = 'md'
}) => {
  // Determine if it is a mutual fund or ETF
  const isEquity = symbol.endsWith('.NS') || symbol.endsWith('.BO');
  const amcKey = (!isEquity && name) ? resolveMFKey(name) : null;
  
  // 12-character ISIN check or matching an AMC keyword or symbol/name containing mutual fund clues
  const isMF = (symbol.length === 12 && (symbol.toUpperCase().startsWith('INF') || /^[A-Z0-9]{12}$/.test(symbol.toUpperCase()))) ||
               !!amcKey ||
               (!isEquity && name && (name.toUpperCase().includes('MUTUAL FUND') || name.toUpperCase().includes('ETF') || name.toUpperCase().includes('INDEX FUND')));

  const cleanSymbol = isMF && amcKey 
    ? amcKey 
    : symbol.replace('.NS', '').replace('.BO', '').toLowerCase();

  const market = isMF ? 'mf' : (symbol.endsWith('.NS') || symbol.endsWith('.BO')) ? 'in' : 'us';
  const colors = getAssetColors(symbol);
  
  // Fallback monogram letter
  const letter = isMF
    ? (name ? name.trim().charAt(0).toUpperCase() : amcKey?.charAt(0).toUpperCase() || 'M')
    : (symbol.replace('.NS', '').replace('.BO', '').charAt(0).toUpperCase() || name?.charAt(0) || 'S');

  const sizeClasses = {
    sm: 'size-7 rounded-lg text-[11px] min-w-[28px]',
    md: 'size-10 rounded-xl text-[16px] min-w-[40px]',
    lg: 'size-12 rounded-2xl text-[18px] min-w-[48px]',
    xl: 'size-16 rounded-[18px] text-[22px] min-w-[64px]'
  };

  // 1. Resolve local static logo asset using deterministic mapping JSON
  const mapping = logoMapping as Record<string, boolean>;
  const hasLogo = !!mapping[cleanSymbol];
  
  const activeSrc = hasLogo ? `/stock-icons/${market}/${cleanSymbol}.svg` : null;
  const isImageLoaded = !!activeSrc;

  return (
    <div
      style={{
        backgroundColor: isImageLoaded ? 'transparent' : colors.bg,
        borderColor: isImageLoaded ? 'transparent' : colors.border,
        color: isImageLoaded ? '#000000' : colors.text,
        boxShadow: isImageLoaded 
          ? 'none' 
          : `inset 0 1px 1px rgba(255,255,255,0.05), 0 0 12px ${colors.glow}`
      }}
      className={cn(
        "flex items-center justify-center font-black select-none transition-all duration-500 overflow-hidden relative group-hover:scale-105 shadow-inner",
        isImageLoaded ? "border-0" : "border",
        sizeClasses[size],
        className
      )}
    >
      {isImageLoaded ? (
        <img
          src={activeSrc}
          alt={`${symbol} Logo`}
          className="size-full object-contain transition-opacity duration-500 rounded-[inherit]"
        />
      ) : (
        <span className="uppercase font-headline tracking-tighter drop-shadow-md">
          {letter}
        </span>
      )}
    </div>
  );
};
