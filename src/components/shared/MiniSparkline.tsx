import React, { useMemo } from 'react';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}

/**
 * Ultra-lightweight SVG Sparkline for high-density Watchlist rows.
 * Uses pure SVG paths for maximum performance (60fps friendly).
 */
export const MiniSparkline: React.FC<MiniSparklineProps> = ({ 
  data, 
  width = 80, 
  height = 24, 
  strokeWidth = 1.5 
}) => {
  const pathData = useMemo(() => {
    if (!data || data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    
    // Normalize points to SVG coordinates
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = range === 0 ? height / 2 : height - ((val - min) / range) * height;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  }, [data, width, height]);

  if (!data || data.length < 2) return <div style={{ width, height }} />;

  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? '#10b981' : '#ef4444'; // Emerald-500 or Red-500

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        {/* Subtle Glow Effect */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-20 blur-[2px]"
        />
        {/* Core Path */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
