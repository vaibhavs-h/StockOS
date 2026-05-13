import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { supabase } from './lib/supabase';
import { SymbolUniverseManager, normalizeStorageSymbol, normalizeDisplaySymbol } from './constants/market-constants';
import { TOTP, generate } from 'otplib';
import cron from 'node-cron';
import crypto from 'crypto';
import { MarketStatusEngine } from './scheduler/core/MarketStatusEngine';
import { MarketRegion } from './scheduler/core/types';
import { initializeScheduler } from './scheduler/index';
import { syncOrchestrator } from './scheduler/core/orchestrator';
import { IndianLiveSyncJob } from './scheduler/jobs/IndianLiveSyncJob';
import { UsLiveSyncJob } from './scheduler/jobs/UsLiveSyncJob';
import { IndianDeepSyncJob } from './scheduler/jobs/IndianDeepSyncJob';
import { UsDeepSyncJob } from './scheduler/jobs/UsDeepSyncJob';
import { PortfolioRevaluationJob } from './scheduler/jobs/PortfolioRevaluationJob';
import multer from 'multer';
import { ExcelImportService } from './services/ExcelImportService';

const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------
// IST HELPER
// ---------------------------------------------------------
export const getISTTimestamp = () => {
  const now = new Date();
  const offset = 5.5 * 60 * 60 * 1000; // IST is UTC + 5:30
  const istTime = new Date(now.getTime() + offset);
  return istTime.toISOString().replace('Z', '+05:30');
};

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// HEARTBEAT & HEALTH (Keep-Alive for Render Free Tier)
// ---------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    region: process.env.RENDER_REGION || 'local',
    version: '1.0.0'
  });
});

// Self-Ping Task: Pings itself every 10 minutes to stay awake on Render
// Note: This only works if the server is already running. 
// For waking up from "cold sleep", use Cron-Job.org pointing to /api/health.
cron.schedule('*/10 * * * *', async () => {
  const url = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3003}`;
  try {
    await axios.get(`${url}/api/health`);
    console.log(`[HEARTBEAT] ❤️  Self-pulse sent to ${url}`);
  } catch (err: any) {
    console.warn(`[HEARTBEAT] 💔 Self-pulse failed: ${err.message}`);
  }
});


// 1. Supabase Initialization
// Supabase is now imported from ./lib/supabase

const axiosConfig = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/'
  },
  timeout: 10000
};

// ---------------------------------------------------------
// MARKET INTELLIGENCE (Indices & Stock History)
// ---------------------------------------------------------
app.get('/api/indices', async (req, res) => {
  try {
    const indicesConfig = [
      { s: '^NSEI', n: 'NIFTY 50' },
      { s: '^BSESN', n: 'SENSEX' },
      { s: '^NSEBANK', n: 'BANK NIFTY' },
      { s: 'USDINR=X', n: 'USD / INR', type: 'currency' },
      { s: '^DJI', n: 'DOW JONES' },
      { s: '^GSPC', n: 'S&P 500' },
      { s: '^IXIC', n: 'NASDAQ 100' },
      { s: '^VIX', n: 'VIX' }
    ];

    const symbols = indicesConfig.map(item => item.s);
    const quotes = await yahooFinance.quote(symbols);

    const results = indicesConfig.map(config => {
      const q = quotes.find(quote => quote.symbol === config.s);
      if (!q || q.regularMarketPrice === undefined) return null;

      const price = q.regularMarketPrice;
      const prevClose = q.regularMarketPreviousClose;

      return {
        label: config.n,
        type: config.type || 'index',
        value: price.toLocaleString('en-IN', {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2
        }),
        change: (((price - prevClose) / prevClose) * 100).toFixed(2) + '%',
        positive: price >= prevClose
      };
    }).filter(r => r !== null);

    res.json(results);
  } catch (e) {
    console.error("[MARKET] Indices Batch Fetch Failed:", e);
    res.status(500).json({ error: 'Market Intelligence Offline' });
  }
});

app.get(['/api/stocks/:symbol/history', '/api/us-stocks/:symbol/history'], async (req, res) => {
  const symbol = req.params.symbol as string;
  const isUsExplicit = req.path.includes('/us-stocks/');
  try {
    // 1. Format symbol for Yahoo
    // Auto-detect indices if prefix is missing
    let isUsStock = false;
    let yahooSymbol = symbol.toUpperCase();
    const commonIndices = ['NSEI', 'BSESN', 'NSEBANK', 'CNXIT', 'CNXAUTO', 'CNXMETAL', 'CNXPHARMA', 'CNXFMCG', 'CNXREALTY', 'CNXINFRA', 'CNXENERGY'];

    // Unified Market Logic
    const isUsQuery = req.query.isUsStock === 'true';
    const s = normalizeDisplaySymbol(symbol);
    const rawStorage = normalizeStorageSymbol(symbol);

    // Resolve Canonical Asset
    const usAsset = SymbolUniverseManager.getUniqueUsEquities().find(d => normalizeDisplaySymbol(d.s) === s || normalizeStorageSymbol(d.s) === rawStorage);
    const indianAsset = SymbolUniverseManager.getUniqueIndianEquities().find(d => normalizeDisplaySymbol(d.s) === s || normalizeStorageSymbol(d.s) === rawStorage);
    const indexAsset = SymbolUniverseManager.getGlobalIndices().find(d => normalizeDisplaySymbol(d.s) === s || normalizeStorageSymbol(d.s) === rawStorage);

    if (indexAsset) {
      yahooSymbol = indexAsset.s; // Use canonical (e.g., ^NSEI)
      isUsStock = indexAsset.region === 'US';
    } else if (usAsset) {
      yahooSymbol = usAsset.s;
      isUsStock = true;
    } else if (indianAsset) {
      yahooSymbol = indianAsset.s; // Use canonical (e.g., RELIANCE.NS)
    } else {
      // Fallback for custom assets not in universe
      if (isUsExplicit || isUsQuery) {
        yahooSymbol = rawStorage;
        isUsStock = true;
      } else {
        const isLikelyUs = s.length <= 5 && !s.includes('.NS') && !s.includes('.BO');
        yahooSymbol = isLikelyUs ? rawStorage : `${s}.NS`;
        isUsStock = isLikelyUs;
      }
    }

    // 2. Map frontend range to Yahoo periods and interval
    const requestedRange = (req.query.range as string) || '1Y';
    const period2 = new Date();
    const period1 = new Date();
    let interval: '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo' = '1d';

    if (requestedRange === '1D') {
      period1.setHours(0, 0, 0, 0);
      interval = '15m';
    } else if (requestedRange === '1W') {
      period1.setDate(period1.getDate() - 7);
      interval = '1h';
    } else if (requestedRange === '1M') {
      period1.setMonth(period1.getMonth() - 1);
      interval = '1d';
    } else if (requestedRange === '1Y') {
      period1.setFullYear(period1.getFullYear() - 1);
      interval = '1d';
    } else if (requestedRange === 'ALL') {
      period1.setFullYear(1970); // Fetch maximum possible history
      interval = '1mo';
    }

    // 3. Fetch historical data via yahoo-finance2
    const result = await yahooFinance.chart(yahooSymbol, {
      period1,
      period2,
      interval
    });

    // 4. Format for WealthChart { time, value }
    const isIntraday = interval.includes('m') || interval.includes('h');
    const filteredQuotes = result.quotes.filter((c: any) => c.close !== null);

    const formatted = filteredQuotes.map((c: any) => {
      const time = isIntraday
        ? Math.floor(new Date(c.date).getTime() / 1000)
        : c.date.toISOString().split('T')[0];

      return {
        time,
        value: c.close
      };
    });

    // 5. ANCHORING: Prepend the "Chart Previous Close" as the true baseline for the period
    // This ensures the % calculation includes the gap from the previous session.
    if (formatted.length > 0 && result.meta.chartPreviousClose) {
      const firstTime = formatted[0].time;
      let anchorTime: string | number = firstTime;

      if (typeof firstTime === 'number') {
        anchorTime = firstTime - 1; // 1s before
      } else {
        // For YYYY-MM-DD strings, we need to subtract one calendar day
        const d = new Date(firstTime);
        d.setDate(d.getDate() - 1);
        anchorTime = d.toISOString().split('T')[0];
      }
      
      // Only prepend if it's not already the same as the first point
      if (anchorTime !== firstTime) {
        formatted.unshift({
          time: anchorTime,
          value: result.meta.chartPreviousClose
        });
      }
    }

    // 6. UNIVERSAL LIVE-STITCHING: Ensure the final point ALWAYS matches the live database price
    if (formatted.length > 0) {
      try {
        const tableName = isUsStock ? 'us_market_assets' : 'market_assets';
        const searchSymbol = isUsStock ? symbol.toUpperCase() : symbol;

        const { data: liveData } = await supabase
          .from(tableName)
          .select('current_price')
          .eq('symbol', searchSymbol)
          .single();

        if (liveData && liveData.current_price) {
          const now = new Date();
          if (!isIntraday) {
            const today = now.toISOString().split('T')[0];
            const lastCandleTime = formatted[formatted.length - 1].time;

            if (lastCandleTime !== today) {
              formatted.push({ time: today, value: liveData.current_price });
            } else {
              formatted[formatted.length - 1].value = liveData.current_price;
            }
          } else {
            // Intraday: Append a synthetic point at the ACTUAL current time
            const currentUnix = Math.floor(now.getTime() / 1000);
            const lastCandleTime = formatted[formatted.length - 1].time as number;

            // Only add if 'now' is at least 1 minute ahead of last candle
            if (currentUnix > lastCandleTime + 60) {
              formatted.push({
                time: currentUnix,
                value: liveData.current_price
              });
            } else {
              formatted[formatted.length - 1].value = liveData.current_price;
            }
          }
        }
      } catch (stitchError) {
        console.warn(`[STITCH] Failed to inject live price for ${symbol}`);
      }
    }

    res.json(formatted);
  } catch (e: any) {
    console.error(`[HISTORY] Failed for ${symbol}:`, e.message);
    res.json([]);
  }
});


// ---------------------------------------------------------
// PORTFOLIO SYNC ENGINE
// ---------------------------------------------------------
app.post('/api/sync', async (req, res) => {
  console.log("\n" + "=".repeat(50));
  console.log(`[TACTICAL] MANUAL SYNC TRIGGERED AT ${new Date().toLocaleTimeString()}`);
  console.log("=".repeat(50));

  try {
    syncOrchestrator.dispatch(new IndianLiveSyncJob());
    syncOrchestrator.dispatch(new UsLiveSyncJob());
    console.log("[SUCCESS] Manual sync queued successfully.");
    console.log("=".repeat(50) + "\n");
    res.json({ success: true, status: "queued" });
  } catch (err: any) {
    console.error(`[FATAL] Manual sync queue failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/revalue', async (req, res) => {
  console.log("\n[TACTICAL] MANUAL REVALUATION TRIGGERED");
  try {
    syncOrchestrator.dispatch(new PortfolioRevaluationJob());
    res.json({ success: true, status: "queued" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sync/logs', (req, res) => {
  res.json(syncOrchestrator.getLogs());
});

app.post('/api/market-seed', async (req, res) => {
  console.log("[INFO] Manual market deep-seed requested.");
  syncOrchestrator.dispatch(new IndianDeepSyncJob());
  syncOrchestrator.dispatch(new UsDeepSyncJob());
  res.json({ success: true, status: "queued" });
});

app.post('/api/admin/reset-cache', async (req, res) => {
  console.log("[ADMIN] Manual cache purge requested.");
  const region = (req.query.region as string) || 'GLOBAL';
  syncOrchestrator.clearSnapshots(region);
  res.json({ success: true, message: `Cache purged for region: ${region}` });
});


import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

// ---------------------------------------------------------
// MARKET DISCOVERY ENGINE
// ---------------------------------------------------------

/**
 * syncMarketAssets: Discovery Engine
 * @param fullSync - If true, fetches Deep Stats (Analyst targets, Financials). If false, only fetches Live Stats (Price/Vol).
 */
async function syncMarketAssets(fullSync = false) {
  const assetList = SymbolUniverseManager.getUniqueIndianEquities();

  console.log(`[MARKET] ${fullSync ? 'DEEP' : 'LIVE'} sync via yahoo-finance2...`);

  try {
    if (!fullSync) {
      // BATCH LIVE QUOTES
      const symbols = assetList.map(a => a.s);
      const quotes = await yahooFinance.quote(symbols);

      for (const q of quotes) {
        const symbol = q.symbol.replace('.NS', '').replace('^', '').toUpperCase();
        const assetInfo = assetList.find(a => a.s.replace('.NS', '').replace('^', '').toUpperCase() === symbol);

        if (!q.regularMarketPrice) {
          console.warn(`[WARN] Skipping index update for ${symbol}: No live price returned.`);
          continue;
        }

        const payload = {
          symbol,
          name: assetInfo?.n || symbol,
          current_price: q.regularMarketPrice,
          day_change: q.regularMarketChange,
          day_change_percentage: q.regularMarketChangePercent,
          open_price: q.regularMarketOpen,
          high_price: q.regularMarketDayHigh,
          low_price: q.regularMarketDayLow,
          prev_close: q.regularMarketPreviousClose,
          volume: q.regularMarketVolume,
          pe_ratio: q.trailingPE || null,
          eps_trailing: q.epsTrailingTwelveMonths || null,
          updated_at: new Date().toISOString()
        };

        // Surgical update: only provided columns will be updated, existing deep data is preserved.
        const { error } = await supabase.from('market_assets').upsert(payload, { onConflict: 'symbol' });

        if (error) {
          console.error(`[ERROR] DB update failed for ${symbol}:`, error.message);
        } else {
          console.log(`  ✓ Updated ${assetInfo?.n || symbol} (${symbol}): ₹${q.regularMarketPrice.toLocaleString('en-IN')}`);
        }
      }
      console.log("--------------------------------------------------");
      console.log(`[MARKET] Live sync complete at ${new Date().toLocaleTimeString()}`);
      console.log("==================================================\n");
    } else {
      // DEEP ENRICHMENT (One by one)
      console.log("\n==================================================");
      console.log(`[DEEP] Starting Daily Fundamental Enrichment...`);
      console.log("==================================================");
      for (const item of assetList) {
        try {
          const isIndex = item.assetType === 'INDEX';
          const symbol = item.s.replace('.NS', '').replace('^', '');

          // Indices use fewer modules
          const modules = isIndex
            ? ['summaryDetail']
            : ['summaryProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'recommendationTrend'];

          const q = await yahooFinance.quote(item.s);
          const summary = await yahooFinance.quoteSummary(item.s, { modules: modules as any });

          const sp = (summary.summaryProfile || {}) as any;
          const sd = (summary.summaryDetail || {}) as any;
          const ks = (summary.defaultKeyStatistics || {}) as any;
          const fd = (summary.financialData || {}) as any;
          const rt = (summary.recommendationTrend?.trend?.[0] || {}) as any;

          // 3. HYBRID ENRICHMENT: Fallback to Groww for missing Indian balance sheet data
          if (!isIndex && (!fd.ebitda || !fd.totalDebt || !fd.freeCashflow)) {
            try {
              // Convert symbol/name to Groww Search ID (Slug)
              const slug = item.n.toLowerCase()
                .replace(/ (ltd|limited|corp|corporation|inc|incorporated)/g, '')
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '') + '-ltd';

              // Groww Public API for deep fundamentals
              const growwRes = await axios.get(`https://groww.in/v1/api/stocks_data/v1/company/search_id/${slug}`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'application/json'
                },
                timeout: 5000
              });

              const gData = growwRes.data;
              if (gData && gData.stats) {
                const gs = gData.stats;
                // Map Groww values if Yahoo is missing them
                if (!fd.ebitda) fd.ebitda = gs.ebitda || null;
                if (!fd.totalDebt) fd.totalDebt = gs.totalDebt || null;
                if (!fd.freeCashflow) fd.freeCashflow = gs.freeCashFlow || null;
                if (!fd.returnOnEquity) fd.returnOnEquity = (gs.roe || 0) / 100;
                if (!fd.quickRatio) fd.quickRatio = gs.quickRatio || null;
                if (!fd.currentRatio) fd.currentRatio = gs.currentRatio || null;

                if (!sp.sector) sp.sector = gData.header?.sectorName || null;
                if (!sp.industry) sp.industry = gData.header?.industryName || null;
                if (!sp.longBusinessSummary) sp.longBusinessSummary = gData.header?.description || null;
              }
            } catch (e) {
              // Silently fail Groww fallback
            }
          }

          // Manual descriptions for Indices to avoid NULLs
          let description = sp.longBusinessSummary || null;
          if (isIndex && !description) {
            if (symbol === 'NSEI') description = "The NIFTY 50 is a benchmark Indian stock market index that represents the weighted average of 50 of the largest Indian companies listed on the National Stock Exchange.";
            if (symbol === 'BSESN') description = "The S&P BSE SENSEX is a free-float market-weighted stock market index of 30 well-established and financially sound companies listed on the Bombay Stock Exchange.";
            if (symbol === 'NSEBANK') description = "The NIFTY Bank Index comprises the most liquid and large capitalised Indian banking stocks which provide a benchmark for the banking sector.";
          }

          const payload = {
            symbol,
            name: item.n,
            asset_type: item.assetType,
            sector: isIndex ? 'Benchmark Index' : sp.sector,
            industry: isIndex ? 'Financial Markets' : sp.industry,
            description: description || sp.longBusinessSummary,
            current_price: q.regularMarketPrice,
            day_change: q.regularMarketChange,
            day_change_percentage: q.regularMarketChangePercent,
            open_price: q.regularMarketOpen,
            high_price: q.regularMarketDayHigh,
            low_price: q.regularMarketDayLow,
            prev_close: q.regularMarketPreviousClose,
            volume: q.regularMarketVolume,
            avg_volume_10d: q.averageDailyVolume10Day,
            market_cap: q.marketCap || sd.marketCap || null,
            pe_ratio: sd.trailingPE || q.trailingPE || null,
            pb_ratio: sd.priceToBook || q.priceToBook || null,
            dividend_yield: sd.trailingAnnualDividendYield || q.trailingAnnualDividendYield || null,
            trailing_peg_ratio: ks.pegRatio || null,
            target_high: fd.targetHighPrice || null,
            target_low: fd.targetLowPrice || null,
            target_mean: fd.targetMeanPrice || null,
            recommendation_key: fd.recommendationKey || null,
            number_of_analysts: (rt.strongBuy || 0) + (rt.buy || 0) + (rt.hold || 0) + (rt.sell || 0) + (rt.strongSell || 0),
            eps_trailing: ks.trailingEps || q.epsTrailingTwelveMonths || null,
            profit_margin: fd.profitMargins || null,
            revenue_growth: fd.revenueGrowth || null,
            ebitda: fd.ebitda || null,
            free_cash_flow: fd.freeCashflow || null,
            total_debt: fd.totalDebt || null,
            quick_ratio: fd.quickRatio || null,
            current_ratio: fd.currentRatio || null,
            return_on_equity: fd.returnOnEquity || null,
            beta: ks.beta || null,
            held_percent_institutions: ks.heldPercentInstitutions || null,
            held_percent_insiders: ks.heldPercentInsiders || null,
            fifty_two_week_high: q.fiftyTwoWeekHigh,
            fifty_two_week_low: q.fiftyTwoWeekLow,
            ma_50: q.fiftyDayAverage,
            ma_200: q.twoHundredDayAverage,
            updated_at: new Date().toISOString()
          };

          const { error } = await supabase.from('market_assets').upsert(payload, { onConflict: 'symbol' });
          if (error) console.error(`[DB ERROR] ${symbol}:`, error.message);

          // Wait 2000ms (Stealth Mode) to avoid rate limits
          await new Promise(r => setTimeout(r, 2000));
        } catch (e: any) {
          console.warn(`[MARKET] Failed ${item.s}:`, e.message);
        }
      }
    }
  } catch (e: any) {
    console.error("[MARKET] Fatal Engine Failure:", e.message);
  }
  console.log(`[MARKET] ${fullSync ? 'Deep' : 'Live'} sync complete.`);
}

// Helper to check if current time is within Indian Market Hours (9:15 AM - 3:30 PM IST)
function isMarketOpen() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hour = istTime.getUTCHours();
  const minute = istTime.getUTCMinutes();
  return (hour === 9 && minute >= 15) || (hour > 9 && hour < 16);
}

// ---------------------------------------------------------
// US MARKET ENGINE (DOW 30)
// ---------------------------------------------------------

/**
 * syncUsMarketAssets: The US Heartbeat
 * @param deepSearch - If true, uses Alpha Vantage for Sentiment/Overview
 */
async function syncUsMarketAssets(deepSearch = false) {
  console.log(`[US-ENGINE] Starting ${deepSearch ? 'DEEP' : 'LIVE'} pulse for Dow 30...`);

  try {
    const usAssets = SymbolUniverseManager.getUniqueUsEquities();
    const symbols = usAssets.map(d => d.s);
    const quotes = await yahooFinance.quote(symbols);

    for (const q of quotes) {
      const assetInfo = usAssets.find(d => normalizeStorageSymbol(d.s) === normalizeStorageSymbol(q.symbol));

      // Session-Aware Price Detection
      let price = q.regularMarketPrice;
      let change = q.regularMarketChange;
      let changePercent = q.regularMarketChangePercent;

      if (q.marketState === 'PRE' && q.preMarketPrice) {
        price = q.preMarketPrice;
        change = q.preMarketChange;
        changePercent = q.preMarketChangePercent;
      } else if (q.marketState === 'POST' && q.postMarketPrice) {
        price = q.postMarketPrice;
        change = q.postMarketChange;
        changePercent = q.postMarketChangePercent;
      }

      const payload: any = {
        symbol: q.symbol,
        name: assetInfo?.n || q.symbol,
        current_price: price,
        day_change: change,
        day_change_percentage: changePercent,
        prev_close: q.regularMarketPreviousClose,
        market_cap: q.marketCap || 0,
        average_volume: q.averageDailyVolume10Day || q.regularMarketVolume || 0,
        pe_ratio: q.trailingPE || 0,
        forward_pe: q.forwardPE || 0,
        eps_trailing: q.epsTrailingTwelveMonths || 0,
        regularmarketdayhigh: q.regularMarketDayHigh,
        regularmarketdaylow: q.regularMarketDayLow,
        updated_at: new Date().toISOString()
      };

      // 2. DEEP ENRICHMENT (Only when deepSearch is true)
      if (deepSearch) {
        try {
          let success = false;
          const avKey = process.env.ALPHA_VANTAGE_API_KEY;
          const tdKey = process.env.TWELVE_DATA_API_KEY;

          // --- STEP 1: ALPHA VANTAGE ---
          if (avKey && !success) {
            try {
              const avRes = await axios.get(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${q.symbol}&apikey=${avKey}`);
              const av = avRes.data;

              if (av && av.Symbol) {
                payload.description = av.Description || payload.description;
                payload.sector = av.Sector || payload.sector;
                payload.industry = av.Industry || payload.industry;
                payload.pe_ratio = parseFloat(av.PERatio) || payload.pe_ratio;
                payload.forward_pe = parseFloat(av.ForwardPE) || payload.forward_pe;
                payload.price_to_book = parseFloat(av.PriceToBookRatio) || payload.price_to_book;
                payload.dividend_yield = parseFloat(av.DividendYield) || payload.dividend_yield;
                payload.eps_trailing = parseFloat(av.EPS) || payload.eps_trailing;
                payload.revenue_growth = parseFloat(av.QuarterlyRevenueGrowthYOY) || payload.revenue_growth;
                payload.profit_margins = parseFloat(av.ProfitMargin) || payload.profit_margins;
                payload.target_price = parseFloat(av.AnalystTargetPrice) || payload.target_price;
                success = true;
              }
            } catch (e: any) {
              console.warn(`[DEEP-US] Alpha Vantage FAILED for ${q.symbol}`);
            }
          }

          // --- STEP 2: YAHOO FINANCE (Primary or Fallback) ---
          if (!success) {
            try {
              const summary = await yahooFinance.quoteSummary(q.symbol, {
                modules: ['summaryProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
              });

              if (summary) {
                const sp = (summary.summaryProfile || {}) as any;
                const sd = (summary.summaryDetail || {}) as any;
                const ks = (summary.defaultKeyStatistics || {}) as any;
                const fd = (summary.financialData || {}) as any;

                payload.description = sp.longBusinessSummary || payload.description;
                payload.sector = sp.sector || payload.sector;
                payload.industry = sp.industry || payload.industry;
                payload.pe_ratio = sd.trailingPE || q.trailingPE || payload.pe_ratio;
                payload.forward_pe = sd.forwardPE || q.forwardPE || payload.forward_pe;
                payload.price_to_book = sd.priceToBook || payload.price_to_book;
                payload.eps_trailing = ks.trailingEps || q.epsTrailingTwelveMonths || payload.eps_trailing;
                payload.dividend_yield = sd.dividendYield || sd.trailingAnnualDividendYield || payload.dividend_yield;
                payload.total_debt = fd.totalDebt || payload.total_debt;
                payload.total_cash = fd.totalCash || payload.total_cash;
                payload.revenue_growth = fd.revenueGrowth || payload.revenue_growth;
                payload.earnings_growth = ks.earningsQuarterlyGrowth || payload.earnings_growth;
                payload.profit_margins = fd.profitMargins || payload.profit_margins;
                payload.held_percent_institutions = ks.heldPercentInstitutions || payload.held_percent_institutions;
                payload.target_price = fd.targetMeanPrice || payload.target_price;
                success = true;
              }
            } catch (e: any) {
              console.warn(`[DEEP-US] Yahoo Finance FAILED for ${q.symbol}`);
            }
          }

          // --- STEP 3: TWELVE DATA (Final Fallback) ---
          if (!success && tdKey) {
            try {
              const tdRes = await axios.get(`https://api.twelvedata.com/statistics?symbol=${q.symbol}&apikey=${tdKey}`);
              const td = tdRes.data;

              if (td && td.statistics) {
                const ts = td.statistics;
                payload.pe_ratio = ts.valuations_measures?.forward_pe || payload.pe_ratio;
                payload.profit_margins = ts.financials?.profit_margin || payload.profit_margins;
                payload.revenue_growth = ts.financials?.revenue_growth || payload.revenue_growth;
                success = true;
              }
            } catch (e: any) {
              console.warn(`[DEEP-US] Twelve Data FAILED for ${q.symbol}`);
            }
          }

        } catch (enrichErr: any) {
          console.error(`[DEEP-US] GLOBAL ENRICH ERROR for ${q.symbol}`);
        }
      }

      const { error } = await supabase.from('us_market_assets').upsert(payload, { onConflict: 'symbol' });

      if (error) {
        console.error(`[DB ERROR] US ${q.symbol}: ${error.message}`);
      } else {
        console.log(`  ✓ Updated ${assetInfo?.n || q.symbol} (${q.symbol}): $${q.regularMarketPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      }
    }

    // console.log("--------------------------------------------------");
    // console.log(`[US-ENGINE] Pulse complete at ${new Date().toLocaleTimeString()}`);
    // console.log("==================================================\n");
  } catch (e: any) {
    console.error(`[US-ENGINE] Fatal Error:`, e.message);
  }
}

// Helper to check if current time is within US Market Hours
function isUsMarketOpen() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hour = istTime.getUTCHours();
  const minute = istTime.getUTCMinutes();

  const isAfternoonIST = (hour === 13 && minute >= 30) || (hour > 13);
  const isEarlyMorningIST = (hour < 5) || (hour === 5 && minute <= 30);

  return isAfternoonIST || isEarlyMorningIST;
}

// --- HEALTH & OBSERVABILITY ENDPOINTS ---

app.get('/api/health/scheduler', (req, res) => {
  const metrics = syncOrchestrator.getMetrics();
  const memory = process.memoryUsage();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memory.external / 1024 / 1024)}MB`,
      },
      nodeVersion: process.version,
      platform: process.platform
    },
    metrics
  });
});

app.get('/api/health/markets', (req, res) => {
  res.json({
    india: {
      status: MarketStatusEngine.getCurrentSession(MarketRegion.IN),
      isOpen: MarketStatusEngine.isMarketOpen(MarketRegion.IN)
    },
    us: {
      status: MarketStatusEngine.getCurrentSession(MarketRegion.US),
      isOpen: MarketStatusEngine.isMarketOpen(MarketRegion.US)
    }
  });
});

app.get('/api/health/universe', (req, res) => {
  res.json({
    usCount: SymbolUniverseManager.getUniqueUsEquities().length,
    indiaCount: SymbolUniverseManager.getUniqueIndianEquities().length,
    indicesCount: SymbolUniverseManager.getGlobalIndices().length
  });
});

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] StockOS Engine running on 0.0.0.0:${PORT}`);

  // Initialize the new modular queue-ready scheduler
  initializeScheduler();
});

app.post('/api/us-market-seed', async (req, res) => {
  console.log("[MANUAL] US Market Deep Seed requested.");
  syncOrchestrator.dispatch(new UsDeepSyncJob());
  res.json({ status: "US Deep Seed queued" });
});

// ---------------------------------------------------------
// EXCEL IMPORT ENGINE
// ---------------------------------------------------------

app.post('/api/broker/groww/import-excel', upload.single('file'), async (req, res) => {
  const { portfolioId, userId } = req.body;
  const file = req.file;

  if (!file || !portfolioId || !userId) {
    return res.status(400).json({ error: "Missing file, portfolioId or userId" });
  }

  try {
    console.log(`[EXCEL-IMPORT] 📊 Processing report for portfolio: ${portfolioId} (User: ${userId})`);
    const result = await ExcelImportService.importGrowwOrders(file.buffer, portfolioId, userId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[EXCEL-IMPORT] Failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});
