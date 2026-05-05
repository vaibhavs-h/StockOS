"use client"

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, AreaSeries } from 'lightweight-charts';
import { motion } from 'framer-motion';

interface WealthChartProps {
  data: { time: string; value: number }[];
}

export const WealthPerformanceChart: React.FC<WealthChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [displayData, setDisplayData] = React.useState(data);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  // Smooth "Dip & Rise" sync
  useEffect(() => {
    setIsTransitioning(true);

    // Swap data at the midpoint of the fade
    const timer = setTimeout(() => {
      setDisplayData(data);
      if (areaSeriesRef.current) {
        const validData = Array.isArray(data) ? data.filter(d => d && d.time) : [];
        if (validData.length > 0) {
          areaSeriesRef.current.setData(validData);
          chartRef.current?.timeScale().fitContent();
        }
      }
      setIsTransitioning(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    if (!chartContainerRef.current || !tooltipRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chartRef.current?.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    const isProfit = displayData.length >= 2 ? displayData[displayData.length - 1].value >= displayData[0].value : true;
    const color = isProfit ? '#10b981' : '#ef4444';
    const rgba = isProfit ? '16, 185, 129' : '239, 68, 68';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#71717a',
        fontSize: 10,
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      crosshair: {
        vertLine: {
          color: `rgba(${rgba}, 0.2)`,
          labelBackgroundColor: '#131722',
        },
        horzLine: {
          color: `rgba(${rgba}, 0.2)`,
          labelBackgroundColor: '#131722',
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      handleScroll: false,
      handleScale: false,
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
        autoScale: true,
      },
      localization: {
        priceFormatter: (price: number) => {
          return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
          }).format(price);
        },
        timeFormatter: (time: any) => {
          const isUnix = typeof time === 'number';
          const date = new Date(isUnix ? time * 1000 : time);
          if (isUnix) {
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
              date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
          }
          return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
        },
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `rgba(${rgba}, 0.15)`,
      bottomColor: `rgba(${rgba}, 0)`,
      lineWidth: 2,
      priceFormat: {
        type: 'volume',
        precision: 0,
        minMove: 1,
      },
      priceLineVisible: true,
      priceLineColor: `rgba(${rgba}, 0.3)`,
      priceLineWidth: 1,
      priceLineStyle: 2, // Dashed
    });

    // Filter out any invalid data points to prevent crash
    const validData = Array.isArray(displayData) ? displayData.filter(d => d && d.time) : [];
    if (validData.length > 0) {
      areaSeries.setData(validData);
    }

    chart.timeScale().fitContent();
    areaSeriesRef.current = areaSeries;

    // Tooltip Logic
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        tooltipRef.current!.style.display = 'none';
      } else {
        const isUnix = typeof param.time === 'number';
        const date = new Date(isUnix ? (param.time as number) * 1000 : (param.time as any));
        let dateStr = date.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        if (isUnix) {
          dateStr += ' | ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
        }

        tooltipRef.current!.style.display = 'block';
        tooltipRef.current!.style.borderColor = `rgba(${rgba}, 0.4)`;
        const data = param.seriesData.get(areaSeries);
        const price = (data as any)?.value !== undefined ? (data as any).value : (data as any)?.close;

        const formattedPrice = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2
        }).format(price);

        tooltipRef.current!.innerHTML = `
          <div class="flex flex-col gap-1">
            <div class="text-lg font-bold text-white font-mono tracking-tight">${formattedPrice}</div>
            <div class="text-[9px] text-${isProfit ? 'emerald' : 'red'}-400/60 font-medium tracking-[0.15em] uppercase border-t border-white/5 pt-1 mt-0.5">${dateStr}</div>
          </div>
        `;

        const tooltipWidth = 145;
        const tooltipHeight = 55;
        const padding = 12;

        let left = param.point.x + padding;
        if (left > chartContainerRef.current!.clientWidth - tooltipWidth) {
          left = param.point.x - tooltipWidth - padding;
        }

        let top = param.point.y + padding;
        if (top > chartContainerRef.current!.clientHeight - tooltipHeight) {
          top = param.point.y - tooltipHeight - padding;
        }

        tooltipRef.current!.style.left = left + 'px';
        tooltipRef.current!.style.top = top + 'px';
      }
    });

    chartRef.current = chart;
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [displayData]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: isTransitioning ? 0 : 1,
        y: isTransitioning ? 5 : 0
      }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="w-full h-full relative overflow-hidden group"
    >
      <style dangerouslySetInnerHTML={{
        __html: `
        [class*="tv-lightweight-charts-logo"],
        a[href*="tradingview.com"] { 
          display: none !important; 
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}} />
      <div
        ref={tooltipRef}
        className="absolute z-50 pointer-events-none p-2.5 rounded-xl bg-zinc-950/90 backdrop-blur-md border border-[#39FF14]/30 shadow-[0_5px_15px_rgba(0,0,0,0.5)] hidden min-w-[120px]"
      />
      <div ref={chartContainerRef} className="w-full h-full" />
    </motion.div>
  );
};
