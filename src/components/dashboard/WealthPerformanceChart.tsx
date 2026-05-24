"use client"

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, AreaSeries, Time } from 'lightweight-charts';
import { motion } from 'framer-motion';

interface WealthChartProps {
  data: { time: Time; value: number }[];
  currency?: string;
  locale?: string;
  timezoneLabel?: string;
  isProfitOverride?: boolean;
  theme?: 'emerald' | 'purple';
}

export const WealthPerformanceChart: React.FC<WealthChartProps> = ({ 
  data, 
  currency = 'INR', 
  locale = 'en-IN',
  timezoneLabel = 'IST',
  isProfitOverride,
  theme = 'emerald'
}) => {

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [displayData, setDisplayData] = React.useState(data);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Detect if this is a "Pulse" update (only the last point changed or length grew slightly)
    const isPulse = displayData.length > 0 && 
                  data.length >= displayData.length && 
                  data[0]?.time === displayData[0]?.time;

    if (!isPulse) {
      setIsTransitioning(true);
    }

    const timer = setTimeout(() => {
      setDisplayData(data);
      if (areaSeriesRef.current) {
        const validData = Array.isArray(data) ? data.filter(d => d && d.time) : [];
        if (validData.length > 0) {
          areaSeriesRef.current.setData(validData);
        }
      }
      if (!isPulse) {
        setIsTransitioning(false);
      }
    }, isPulse ? 0 : 150);

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

    const isProfit = isProfitOverride !== undefined 
      ? isProfitOverride 
      : (displayData.length >= 2 ? displayData[displayData.length - 1].value >= displayData[0].value : true);
      
    const color = theme === 'purple'
      ? '#a855f7'
      : (isProfit ? '#10b981' : '#ef4444');
      
    const rgba = theme === 'purple'
      ? '168, 85, 247'
      : (isProfit ? '16, 185, 129' : '239, 68, 68');


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
          return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
          }).format(price);
        },
        timeFormatter: (time: any) => {
          const isUnix = typeof time === 'number';
          const date = new Date(isUnix ? time * 1000 : time);
          if (isUnix) {
            return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' }) + ' ' +
              date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
          }
          return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' });
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
        
        // 1. Format the Date
        let dateStr = date.toLocaleDateString(locale, {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });

        // 2. Handle Intraday Labels (1D/1W only)
        let sessionLabel = "";
        let sessionColor = "text-zinc-500";
        
        if (isUnix) {
          const estDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
          const estHours = estDate.getHours();
          const estMinutes = estDate.getMinutes();
          const estTotal = estHours * 60 + estMinutes;

          if (timezoneLabel === 'EST') {
            if (estTotal >= 240 && estTotal < 570) {
              sessionLabel = "Pre-Market";
              sessionColor = "text-amber-400";
            }
            else if (estTotal >= 570 && estTotal < 960) {
              sessionLabel = "Regular Market";
              sessionColor = "text-emerald-400";
            }
            else if (estTotal >= 960 && estTotal <= 1200) {
              sessionLabel = "After Hours";
              sessionColor = "text-purple-400";
            }
          }
          dateStr += ' | ' + date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + timezoneLabel;
        }

        // 3. Render the Tooltip
        tooltipRef.current!.style.display = 'block';
        tooltipRef.current!.style.borderColor = `rgba(${rgba}, 0.4)`;
        
        const data = param.seriesData.get(areaSeries);
        const price = (data as any)?.value !== undefined ? (data as any).value : (data as any)?.close;

        if (price !== undefined) {
          const formattedPrice = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 2
          }).format(price);

          tooltipRef.current!.innerHTML = `
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-6">
                <div class="text-xl font-black text-white font-mono tracking-tighter">${formattedPrice}</div>
                ${sessionLabel ? `<div class="text-[7px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded bg-white/5 border border-white/10 ${sessionColor}">${sessionLabel}</div>` : ''}
              </div>
              <div class="text-[9px] text-zinc-500 font-bold tracking-widest uppercase border-t border-white/5 pt-2">
                ${dateStr}
              </div>
            </div>
          `;
        } else {
          tooltipRef.current!.style.display = 'none';
        }

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
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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
