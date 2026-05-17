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

export const AssetLogo: React.FC<AssetLogoProps> = ({
  symbol,
  name,
  className,
  size = 'md'
}) => {
  const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '').toLowerCase();
  const market = (symbol.endsWith('.NS') || symbol.endsWith('.BO')) ? 'in' : 'us';
  const colors = getAssetColors(symbol);
  const letter = symbol.replace('.NS', '').replace('.BO', '').charAt(0).toUpperCase() || name?.charAt(0) || 'S';

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
