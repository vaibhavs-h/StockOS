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

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

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
    let isUsStock = false;
    let yahooSymbol = symbol.toUpperCase();
    
    // Unified Market Logic
    const isUsQuery = req.query.isUsStock === 'true';
    const s = normalizeDisplaySymbol(symbol);
    const rawStorage = normalizeStorageSymbol(symbol);

    // Resolve Canonical Asset
    const usAsset = SymbolUniverseManager.getUniqueUsEquities().find(d => normalizeDisplaySymbol(d.s) === s || normalizeStorageSymbol(d.s) === rawStorage);
    const indianAsset = SymbolUniverseManager.getUniqueIndianEquities().find(d => normalizeDisplaySymbol(d.s) === s || normalizeStorageSymbol(d.s) === rawStorage);
    const indexAsset = SymbolUniverseManager.getGlobalIndices().find(d => normalizeDisplaySymbol(d.s) === s || normalizeStorageSymbol(d.s) === rawStorage);

    if (indexAsset) {
      yahooSymbol = indexAsset.s;
      isUsStock = indexAsset.region === 'US';
    } else if (usAsset) {
      yahooSymbol = usAsset.s;
      isUsStock = true;
    } else if (indianAsset) {
      yahooSymbol = indianAsset.s;
    } else {
      if (isUsExplicit || isUsQuery) {
        yahooSymbol = rawStorage;
        isUsStock = true;
      } else {
        const isLikelyUs = s.length <= 5 && !s.includes('.NS') && !s.includes('.BO');
        yahooSymbol = isLikelyUs ? rawStorage : `${s}.NS`;
        isUsStock = isLikelyUs;
      }
    }

    const requestedRange = (req.query.range as string) || '1Y';
    const period2 = new Date();
    const period1 = new Date();
    let interval: '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo' = '1d';

    if (requestedRange === '1D') {
      period1.setHours(period2.getHours() - 24);
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
      period1.setFullYear(1970);
      interval = '1mo';
    }

    const result = await yahooFinance.chart(yahooSymbol, {
      period1,
      period2,
      interval
    });

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

    if (formatted.length > 0 && result.meta.chartPreviousClose) {
      const firstTime = formatted[0].time;
      let anchorTime: string | number = firstTime;

      if (typeof firstTime === 'number') {
        anchorTime = firstTime - 1;
      } else {
        const d = new Date(firstTime);
        d.setDate(d.getDate() - 1);
        anchorTime = d.toISOString().split('T')[0];
      }
      
      if (anchorTime !== firstTime) {
        formatted.unshift({
          time: anchorTime,
          value: result.meta.chartPreviousClose
        });
      }
    }

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
            const currentUnix = Math.floor(now.getTime() / 1000);
            const lastCandleTime = formatted[formatted.length - 1].time as number;
            if (currentUnix > lastCandleTime + 60) {
              formatted.push({ time: currentUnix, value: liveData.current_price });
            } else {
              formatted[formatted.length - 1].value = liveData.current_price;
            }
          }
        }
      } catch (stitchError) {}
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
  try {
    syncOrchestrator.dispatch(new IndianLiveSyncJob());
    syncOrchestrator.dispatch(new UsLiveSyncJob());
    res.json({ success: true, status: "queued" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/revalue', async (req, res) => {
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
  syncOrchestrator.dispatch(new IndianDeepSyncJob());
  syncOrchestrator.dispatch(new UsDeepSyncJob());
  res.json({ success: true, status: "queued" });
});

app.post('/api/admin/reset-cache', async (req, res) => {
  const region = (req.query.region as string) || 'GLOBAL';
  syncOrchestrator.clearSnapshots(region);
  res.json({ success: true, message: `Cache purged for region: ${region}` });
});

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

app.post('/api/broker/groww/import-excel', upload.single('file'), async (req, res) => {
  const { portfolioId, userId } = req.body;
  const file = req.file;
  if (!file || !portfolioId || !userId) return res.status(400).json({ error: "Missing file, portfolioId or userId" });

  try {
    console.log(`[EXCEL-IMPORT] 📊 Processing report for portfolio: ${portfolioId} (User: ${userId})`);
    const result = await ExcelImportService.importGrowwOrders(file.buffer, portfolioId, userId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[EXCEL-IMPORT] Failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/broker/zerodha/import-csv', upload.single('file'), async (req, res) => {
  const { portfolioId, userId } = req.body;
  const file = req.file;
  if (!file || !portfolioId || !userId) return res.status(400).json({ error: "Missing file, portfolioId or userId" });

  try {
    console.log(`[ZERODHA-IMPORT] 📊 Processing CSV for portfolio: ${portfolioId} (User: ${userId})`);
    const result = await ExcelImportService.importZerodhaCSV(file.buffer, portfolioId, userId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[ZERODHA-IMPORT] Failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] StockOS Engine running on 0.0.0.0:${PORT}`);
  initializeScheduler();
});
