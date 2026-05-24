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
import { mfSyncCoordinator } from './scheduler/core/MFSyncCoordinator';
import { IndianLiveSyncJob } from './scheduler/jobs/IndianLiveSyncJob';
import { UsLiveSyncJob } from './scheduler/jobs/UsLiveSyncJob';
import { IndianDeepSyncJob } from './scheduler/jobs/IndianDeepSyncJob';
import { UsDeepSyncJob } from './scheduler/jobs/UsDeepSyncJob';
import { PortfolioRevaluationJob } from './scheduler/jobs/PortfolioRevaluationJob';
import multer from 'multer';
import { ExcelImportService } from './services/ExcelImportService';
import { CASImportService } from './services/CASImportService';
import { YahooProvider } from './scheduler/providers/YahooProvider';
import { SymbolSyncStateService } from './scheduler/core/SymbolSyncStateService';
import { getDbUserId } from './lib/user';

const upload = multer({ storage: multer.memoryStorage() });


// ---------------------------------------------------------
// IST HELPER (Imported and re-exported from src/lib/date)
// ---------------------------------------------------------
import { getISTTimestamp, getNormalizedNoonTimestamp } from './lib/date';
export { getISTTimestamp, getNormalizedNoonTimestamp };


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
    console.log(`[HEARTBEAT] Self-pulse sent to ${url}`);
  } catch (err: any) {
    console.warn(`[HEARTBEAT] Self-pulse failed: ${err.message}`);
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
      } catch (stitchError) { }
    }

    res.json(formatted);
  } catch (e: any) {
    console.error(`[HISTORY] Failed for ${symbol}:`, e.message);
    res.json([]);
  }
});

// ---------------------------------------------------------
// TARGETED SYNC (Burst Mode)
// ---------------------------------------------------------
app.get('/api/sync/burst', async (req, res) => {
  const symbol = req.query.symbol as string;
  const region = (req.query.region as string || 'IN') as MarketRegion;

  if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

  try {
    console.log(`[BURST-SYNC] Targeted Burst for ${symbol} (${region})`);
    const quote = await YahooProvider.fetchQuote(symbol, region === MarketRegion.US ? 'US' : 'IN');

    if (!quote || quote.price === undefined) {
      console.warn(`[BURST-SYNC] No quote found for ${symbol}`);
      return res.status(404).json({ error: 'Quote not found' });
    }

    // Upsert to DB
    const tableName = region === MarketRegion.US ? 'us_market_assets' : 'market_assets';
    const payload = {
      symbol: normalizeStorageSymbol(symbol),
      current_price: quote.price,
      day_change: quote.change,
      day_change_percentage: quote.changePercent,
      prev_close: quote.prevClose,
      premarket_price: (quote as any).preMarketPrice,
      premarket_change_pct: (quote as any).preMarketChangePercent,
      after_hours_price: (quote as any).postMarketPrice,
      after_hours_change_pct: (quote as any).postMarketChangePercent,
      updated_at: new Date().toISOString()
    };


    const { error } = await supabase.from(tableName).upsert(payload, { onConflict: 'symbol' });
    if (error) {
      console.error(`[BURST-SYNC] DB Upsert failed for ${symbol}:`, error.message);
      throw error;
    }

    // Update active market symbols last_synced_at & sync_error_count
    await SymbolSyncStateService.recordSyncResult(
      normalizeStorageSymbol(symbol),
      region === MarketRegion.US ? 'US' : 'IN',
      true
    ).catch(e => console.error(`[BURST-SYNC] Failed to record success:`, e.message));

    console.log(`[BURST-SYNC] Successfully synced ${symbol} | Price: ${quote.price} | AfterHours: ${(quote as any).postMarketPrice}`);
    res.json({ success: true, price: quote.price, afterHoursPrice: (quote as any).postMarketPrice });

  } catch (err: any) {
    console.error(`[BURST-SYNC] FATAL ERROR for ${symbol}:`, err.message);

    // Record sync failure in active_market_symbols table
    await SymbolSyncStateService.recordSyncResult(
      normalizeStorageSymbol(symbol),
      region === MarketRegion.US ? 'US' : 'IN',
      false,
      err.message
    ).catch(e => console.error(`[BURST-SYNC] Failed to record failure:`, e.message));

    res.status(500).json({ error: err.message });
  }
});


// ---------------------------------------------------------
// TARGETED MUTUAL FUND SYNC (Burst Mode)
// ---------------------------------------------------------
app.get('/api/sync/burst/mf', async (req, res) => {
  const schemeCode = req.query.scheme_code as string;

  if (!schemeCode) return res.status(400).json({ error: 'scheme_code is required' });

  try {
    console.log(`[BURST-SYNC] Targeted Mutual Fund Burst for ${schemeCode}`);

    // 1. Run AMFI NAV Ingestion for this specific scheme code
    try {
      const { MutualFundSyncJob } = require('./scheduler/jobs/MutualFundSyncJob');
      const navSyncJob = new MutualFundSyncJob();
      await (navSyncJob as any).process([schemeCode]);
      console.log(`[BURST-SYNC] Completed AMFI NAV sync for MF ${schemeCode}`);
    } catch (navErr: any) {
      console.error(`[BURST-SYNC] AMFI NAV sync failed for MF ${schemeCode}:`, navErr.message);
    }

    // 2. Fetch scheme record from DB
    const { data: fund, error: fundErr } = await supabase
      .from('mutual_funds_master')
      .select('scheme_code, isin, name, symbol')
      .eq('scheme_code', schemeCode)
      .single();

    if (fundErr || !fund) {
      console.warn(`[BURST-SYNC] Fund not found in DB after AMFI sync: ${schemeCode}`);
      return res.status(404).json({ error: 'Fund not found' });
    }

    // 3. Find Yahoo Symbol if not already matched
    let symbol = fund.symbol;
    const { MFYahooEnrichJob } = await import('./scheduler/jobs/internal/MFYahooEnrichJob');
    const enrichJob = new MFYahooEnrichJob(1, false);

    if (!symbol) {
      symbol = await (enrichJob as any).findYahooSymbol(fund.isin, fund.name);
    }

    if (!symbol) {
      console.warn(`[BURST-SYNC] Yahoo symbol not found for fund: ${fund.name}. Syncing NAV only.`);
      return res.json({ success: true, message: 'AMFI NAV synced successfully, Yahoo symbol not found.' });
    }

    // 4. Fetch summary modules for enrichment using MFYahooEnrichJob's method
    const enrichData = await (enrichJob as any).fetchEnrichmentData(symbol);

    // 5. Update the DB with Yahoo enrichment data
    const { error: updateErr } = await supabase
      .from('mutual_funds_master')
      .update({
        symbol,
        returns_1y:                 enrichData.returns_1y                 ?? null,
        returns_3y:                 enrichData.returns_3y                 ?? null,
        returns_5y:                 enrichData.returns_5y                 ?? null,
        expense_ratio:              enrichData.expense_ratio              ?? null,
        aum:                        enrichData.aum                        ?? null,
        logo_url:                   enrichData.logo_url                   ?? null,
        min_initial_investment:     enrichData.min_initial_investment     ?? null,
        min_subsequent_investment:  enrichData.min_subsequent_investment  ?? null,
        rating:                     enrichData.rating                     ?? null,
        style_box_url:              enrichData.style_box_url              ?? null,
        manager_name:               enrichData.manager_name               ?? null,
        manager_start_date:         enrichData.manager_start_date         ?? null,
        asset_allocation:           enrichData.asset_allocation           ?? null,
        sector_allocations:         enrichData.sector_allocations         ?? null,
        credit_ratings:             enrichData.credit_ratings             ?? null,
        top_holdings:               enrichData.top_holdings               ?? null,
        risk_statistics:            enrichData.risk_statistics            ?? null,
        performance_history:        enrichData.performance_history        ?? null,
        updated_at:                 new Date().toISOString()
      })
      .eq('scheme_code', schemeCode);

    if (updateErr) {
      console.error(`[BURST-SYNC] DB Update failed for mutual fund ${schemeCode}:`, updateErr.message);
      throw updateErr;
    }

    console.log(`[BURST-SYNC] Successfully synced MF ${schemeCode} | Yahoo Symbol: ${symbol}`);
    res.json({ success: true, symbol });
  } catch (err: any) {
    console.error(`[BURST-SYNC] FATAL ERROR for mutual fund ${schemeCode}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});


// ---------------------------------------------------------
// PORTFOLIO SYNC ENGINE
// ---------------------------------------------------------

app.post('/api/sync', async (req, res) => {
  try {
    console.log('[SERVER] Global Dashboard Sync triggered: Dispatching Equities & Mutual Funds sync...');
    syncOrchestrator.dispatch(new IndianLiveSyncJob());
    syncOrchestrator.dispatch(new UsLiveSyncJob());
    
    // Proactively trigger Mutual Fund Sync & Revaluation in the background
    mfSyncCoordinator.syncActiveMutualFunds().catch(err => {
      console.error('[SERVER] Background Mutual Fund Active Sync failed:', err.message);
    });

    res.json({ success: true, status: "queued" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/mf', async (req, res) => {
  try {
    console.log('[SERVER] Manual Mutual Fund Active Sync triggered via API.');
    const count = await mfSyncCoordinator.syncActiveMutualFunds();
    res.json({ success: true, count, message: `Active mutual funds sync completed for ${count} funds.` });
  } catch (err: any) {
    console.error('[SERVER] Manual MF Sync failed:', err.message);
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

// ─── Mutual Fund Universe Seeding ─────────────────────────────────────────────

/**
 * POST /api/mf-seed
 * Wipes the existing mutual_funds_master and re-seeds the full AMFI universe.
 * Ingests all ~10,000+ Indian mutual fund schemes from the official AMFI NAV feed.
 */
app.post('/api/mf-seed', async (req, res) => {
  try {
    console.log('[SERVER] MF full-universe seed triggered via API.');

    // Optional: wipe existing rows so re-seeding is clean
    const clearFirst = req.query.clear !== 'false'; // default true
    if (clearFirst) {
      console.log('[SERVER] Clearing mutual_funds_master before re-seeding...');
      await supabase.from('active_mutual_funds').delete().neq('scheme_code', '');
      await supabase.from('user_mutual_fund_watchlists').delete().neq('scheme_code', '');
      // Holdings are user data — we do NOT delete those
      await supabase.from('mutual_funds_master').delete().neq('scheme_code', '');
      console.log('[SERVER] mutual_funds_master cleared.');
    }

    const { MFMasterSeedJob } = await import('./scheduler/jobs/internal/MFMasterSeedJob');
    const seedJob = new MFMasterSeedJob(req.query.force === 'true');
    syncOrchestrator.dispatch(seedJob);

    res.json({ success: true, status: 'queued', message: 'AMFI full-universe seeding started. Check /api/sync/logs for progress.' });
  } catch (err: any) {
    console.error('[SERVER] MF seed trigger failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mf-enrich
 * Matches unenriched mutual fund schemes to Yahoo Finance symbols,
 * then fetches 1Y/3Y/5Y returns, expense ratio, and AUM.
 * Processes up to `batch` schemes per call (default 50).
 */
app.post('/api/mf-enrich', async (req, res) => {
  try {
    const batchSize = Number(req.query.batch) || 200;
    const continuous = req.query.continuous === 'true';
    console.log(`[SERVER] MF Yahoo enrichment triggered (batch=${batchSize}, continuous=${continuous}).`);

    const { MFYahooEnrichJob } = await import('./scheduler/jobs/internal/MFYahooEnrichJob');
    const enrichJob = new MFYahooEnrichJob(batchSize, continuous);
    syncOrchestrator.dispatch(enrichJob);

    res.json({ success: true, status: 'queued', message: `Yahoo enrichment started for up to ${batchSize} funds. Continuous: ${continuous}` });
  } catch (err: any) {
    console.error('[SERVER] MF enrich trigger failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/reset-cache', async (req, res) => {
  const region = (req.query.region as string) || 'GLOBAL';
  syncOrchestrator.clearSnapshots(region);
  res.json({ success: true, message: `Cache purged for region: ${region}` });
});

// ---------------------------------------------------------
// MARKET INTELLIGENCE NEWS FEED
// ---------------------------------------------------------
app.get('/api/news/monthly-metrics', async (req, res) => {
  const category = (req.query.category as string) || 'all';
  const userId = req.query.userId as string;

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const startISO = startOfMonth.toISOString();
    const endISO = endOfMonth.toISOString();

    console.log(`[NEWS-METRICS] Fetching all monthly news. Category: ${category}, User: ${userId || 'guest'}, Range: ${startISO} to ${endISO}`);

    let newsItems: any[] = [];
    const CHUNK_SIZE = 1000;

    if (category === 'saved') {
      if (!userId) {
        return res.status(400).json({ error: 'userId is required for saved category' });
      }

      // Fetch user's bookmarked news ids in pages of 1000 to bypass default Supabase limit
      let allBookmarks: any[] = [];
      let bFrom = 0;
      let bHasMore = true;

      while (bHasMore) {
        const { data: bookmarks, error: bookmarkErr } = await supabase
          .from('news_bookmarks')
          .select('news_id')
          .eq('user_id', userId)
          .range(bFrom, bFrom + CHUNK_SIZE - 1);

        if (bookmarkErr) {
          console.error('[NEWS-METRICS] Failed to fetch bookmarks:', bookmarkErr.message);
          throw bookmarkErr;
        }

        if (bookmarks && bookmarks.length > 0) {
          allBookmarks = allBookmarks.concat(bookmarks);
          bFrom += CHUNK_SIZE;
          if (bookmarks.length < CHUNK_SIZE) {
            bHasMore = false;
          }
        } else {
          bHasMore = false;
        }
      }

      if (allBookmarks.length === 0) {
        return res.json({ news: [] });
      }

      const bookmarkedIds = allBookmarks.map((b: any) => b.news_id);

      // Fetch news items matching bookmarked ids within current month, chunking to bypass 1000 row limits
      let allSavedNews: any[] = [];
      let sFrom = 0;
      let sHasMore = true;

      while (sHasMore) {
        const { data: items, error: newsErr } = await supabase
          .from('news')
          .select('*')
          .in('id', bookmarkedIds)
          .gte('published_at', startISO)
          .lte('published_at', endISO)
          .order('published_at', { ascending: false })
          .range(sFrom, sFrom + CHUNK_SIZE - 1);

        if (newsErr) {
          console.error('[NEWS-METRICS] Failed to fetch saved news items:', newsErr.message);
          throw newsErr;
        }

        if (items && items.length > 0) {
          allSavedNews = allSavedNews.concat(items);
          sFrom += CHUNK_SIZE;
          if (items.length < CHUNK_SIZE) {
            sHasMore = false;
          }
        } else {
          sHasMore = false;
        }
      }

      newsItems = allSavedNews;
    } else {
      // General categories (all, global, india) within current month - paginated to bypass default 1000 limit
      let allItems: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('news')
          .select('*')
          .gte('published_at', startISO)
          .lte('published_at', endISO)
          .order('published_at', { ascending: false })
          .range(from, from + CHUNK_SIZE - 1);

        if (category === 'global' || category === 'india') {
          query = query.eq('category', category);
        }

        const { data: items, error: newsErr } = await query;

        if (newsErr) {
          console.error('[NEWS-METRICS] Failed to fetch news items:', newsErr.message);
          throw newsErr;
        }

        if (items && items.length > 0) {
          allItems = allItems.concat(items);
          from += CHUNK_SIZE;
          if (items.length < CHUNK_SIZE) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      newsItems = allItems;
    }

    // Determine which items are bookmarked if userId is provided, paginated as well
    let bookmarkedIds = new Set<string>();
    if (userId) {
      let allUserBookmarks: any[] = [];
      let ubFrom = 0;
      let ubHasMore = true;

      while (ubHasMore) {
        const { data: bookmarks, error: bookmarkErr } = await supabase
          .from('news_bookmarks')
          .select('news_id')
          .eq('user_id', userId)
          .range(ubFrom, ubFrom + CHUNK_SIZE - 1);

        if (bookmarkErr) {
          console.error('[NEWS-METRICS] Failed to fetch user bookmarks for mapping:', bookmarkErr.message);
          break;
        }

        if (bookmarks && bookmarks.length > 0) {
          allUserBookmarks = allUserBookmarks.concat(bookmarks);
          ubFrom += CHUNK_SIZE;
          if (bookmarks.length < CHUNK_SIZE) {
            ubHasMore = false;
          }
        } else {
          ubHasMore = false;
        }
      }

      bookmarkedIds = new Set(allUserBookmarks.map((b: any) => b.news_id));
    }

    // Format DB snake_case to camelCase expected by frontend
    const formattedNews = newsItems.map((item: any) => ({
      _id: item.id,
      title: item.title,
      summary: item.summary || null,
      url: item.url,
      source: item.source || 'Unknown Source',
      sourceDomain: item.source_domain || null,
      publishedAt: item.published_at,
      category: item.category || 'global',
      stocks: Array.isArray(item.stocks) ? item.stocks : [],
      impact: item.impact || 'LOW',
      why: item.why || null,
      thumbnail: item.thumbnail || null,
      authors: Array.isArray(item.authors) ? item.authors : [],
      topics: Array.isArray(item.topics) ? item.topics : [],
      tickerSentiment: Array.isArray(item.ticker_sentiment) ? item.ticker_sentiment : [],
      sentimentScore: item.sentiment_score ?? null,
      sentimentLabel: item.sentiment_label || null,
      saved: bookmarkedIds.has(item.id) || category === 'saved'
    }));

    res.json({ news: formattedNews });
  } catch (err: any) {
    console.error('[NEWS-METRICS] Route failed:', err.message);
    res.status(500).json({ error: 'Internal news engine offline' });
  }
});

app.get('/api/news', async (req, res) => {
  const category = (req.query.category as string) || 'all';
  const userId = req.query.userId as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 30;
  const offset = (page - 1) * limit;
  const impact = req.query.impact as string;

  try {
    console.log(`[NEWS] Fetching news. Category: ${category}, User: ${userId || 'guest'}, Page: ${page}, Limit: ${limit}, Impact: ${impact || 'all'}`);

    let newsItems: any[] = [];

    if (category === 'saved') {
      if (!userId) {
        return res.status(400).json({ error: 'userId is required for saved category' });
      }

      // Fetch user's bookmarked news ids
      const { data: bookmarks, error: bookmarkErr } = await supabase
        .from('news_bookmarks')
        .select('news_id')
        .eq('user_id', userId);

      if (bookmarkErr) {
        console.error('[NEWS] Failed to fetch bookmarks:', bookmarkErr.message);
        throw bookmarkErr;
      }

      if (!bookmarks || bookmarks.length === 0) {
        return res.json({ news: [], hasMore: false });
      }

      const bookmarkedIds = bookmarks.map((b: any) => b.news_id);

      // Fetch news items matching bookmarked ids
      let query = supabase
        .from('news')
        .select('*')
        .in('id', bookmarkedIds)
        .order('published_at', { ascending: false });

      if (impact) {
        query = query.eq('impact', impact);
      }

      const { data: items, error: newsErr } = await query;

      if (newsErr) {
        console.error('[NEWS] Failed to fetch saved news items:', newsErr.message);
        throw newsErr;
      }

      newsItems = items || [];
    } else {
      // General categories (all, global, india)
      let query = supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false });

      if (category === 'global' || category === 'india') {
        query = query.eq('category', category);
      }

      if (impact) {
        query = query.eq('impact', impact);
      }

      // Add pagination range
      query = query.range(offset, offset + limit - 1);

      const { data: items, error: newsErr } = await query;

      if (newsErr) {
        console.error('[NEWS] Failed to fetch news items:', newsErr.message);
        throw newsErr;
      }

      newsItems = items || [];
    }

    // Determine which items are bookmarked if userId is provided
    let bookmarkedIds = new Set<string>();
    if (userId) {
      const { data: bookmarks, error: bookmarkErr } = await supabase
        .from('news_bookmarks')
        .select('news_id')
        .eq('user_id', userId);

      if (!bookmarkErr && bookmarks) {
        bookmarkedIds = new Set(bookmarks.map((b: any) => b.news_id));
      }
    }

    // Bridge: transform DB snake_case → camelCase frontend fields
    const formattedNews = newsItems.map((item: any) => ({
      _id: item.id,
      title: item.title,
      summary: item.summary || null,
      url: item.url,
      source: item.source || 'Unknown Source',
      sourceDomain: item.source_domain || null,
      publishedAt: item.published_at,
      category: item.category || 'global',
      stocks: Array.isArray(item.stocks) ? item.stocks : [],
      impact: item.impact || 'LOW',
      why: item.why || null,
      thumbnail: item.thumbnail || null,
      authors: Array.isArray(item.authors) ? item.authors : [],
      topics: Array.isArray(item.topics) ? item.topics : [],
      tickerSentiment: Array.isArray(item.ticker_sentiment) ? item.ticker_sentiment : [],
      sentimentScore: item.sentiment_score ?? null,
      sentimentLabel: item.sentiment_label || null,
      saved: bookmarkedIds.has(item.id) || category === 'saved'
    }));

    res.json({
      news: formattedNews,
      hasMore: category === 'saved' ? false : newsItems.length === limit
    });
  } catch (err: any) {
    console.error('[NEWS] Route failed:', err.message);
    res.status(500).json({ error: 'Internal news engine offline' });
  }
});

app.get('/api/news/:id', async (req, res) => {
  const newsId = req.params.id;
  const userId = req.query.userId as string;

  try {
    console.log(`[NEWS] Fetching single news item: ${newsId}, User: ${userId || 'guest'}`);

    const { data: item, error: newsErr } = await supabase
      .from('news')
      .select('*')
      .eq('id', newsId)
      .maybeSingle();

    if (newsErr) {
      console.error('[NEWS] Failed to fetch single news item:', newsErr.message);
      throw newsErr;
    }

    if (!item) {
      return res.status(404).json({ error: 'News article not found' });
    }

    let isSaved = false;
    if (userId) {
      const { data: bookmark, error: bookmarkErr } = await supabase
        .from('news_bookmarks')
        .select('id')
        .eq('user_id', userId)
        .eq('news_id', newsId)
        .maybeSingle();

      if (!bookmarkErr && bookmark) {
        isSaved = true;
      }
    }

    const formatted = {
      _id: item.id,
      title: item.title,
      summary: item.summary || null,
      url: item.url,
      source: item.source || 'Unknown Source',
      sourceDomain: item.source_domain || null,
      publishedAt: item.published_at,
      category: item.category || 'global',
      stocks: Array.isArray(item.stocks) ? item.stocks : [],
      impact: item.impact || 'LOW',
      why: item.why || null,
      thumbnail: item.thumbnail || null,
      authors: Array.isArray(item.authors) ? item.authors : [],
      topics: Array.isArray(item.topics) ? item.topics : [],
      tickerSentiment: Array.isArray(item.ticker_sentiment) ? item.ticker_sentiment : [],
      sentimentScore: item.sentiment_score ?? null,
      sentimentLabel: item.sentiment_label || null,
      saved: isSaved
    };

    res.json(formatted);
  } catch (err: any) {
    console.error('[NEWS] Single route failed:', err.message);
    res.status(500).json({ error: 'Internal news engine offline' });
  }
});

app.post('/api/news/save/:id', async (req, res) => {
  const newsId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    console.log(`[NEWS-SAVE] Toggle save. News ID: ${newsId}, User: ${userId}`);

    // Check if the bookmark already exists
    const { data: existing, error: checkErr } = await supabase
      .from('news_bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('news_id', newsId)
      .maybeSingle();

    if (checkErr) {
      console.error('[NEWS-SAVE] Failed to query existing bookmark:', checkErr.message);
      throw checkErr;
    }

    if (existing) {
      // Bookmark exists, so delete it (toggle off)
      const { error: deleteErr } = await supabase
        .from('news_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('news_id', newsId);

      if (deleteErr) {
        console.error('[NEWS-SAVE] Failed to delete bookmark:', deleteErr.message);
        throw deleteErr;
      }

      console.log(`[NEWS-SAVE] Bookmark removed successfully for user ${userId}`);

      // CHECK RETENTION POLICY:
      // If the news article is already 1 month or older, AND no one else has bookmarked it, remove it directly!
      try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        // 1. Check article age
        const { data: article } = await supabase
          .from('news')
          .select('published_at')
          .eq('id', newsId)
          .single();

        if (article && new Date(article.published_at) < oneMonthAgo) {
          // 2. Check if anyone else has bookmarked it
          const { data: otherBookmarks } = await supabase
            .from('news_bookmarks')
            .select('news_id')
            .eq('news_id', newsId)
            .limit(1);

          if (!otherBookmarks || otherBookmarks.length === 0) {
            // 3. Delete it from news directly
            await supabase
              .from('news')
              .delete()
              .eq('id', newsId);
            console.log(`[NEWS-SAVE] Old news article ${newsId} was deleted directly because save was removed and it is > 1 month old.`);
          }
        }
      } catch (cleanupErr: any) {
        console.error('[NEWS-SAVE] Direct cleanup on unsave failed:', cleanupErr.message);
      }

      return res.json({ success: true, saved: false });
    } else {
      // Bookmark doesn't exist, so insert it (toggle on)
      const { error: insertErr } = await supabase
        .from('news_bookmarks')
        .insert({
          user_id: userId,
          news_id: newsId
        });

      if (insertErr) {
        console.error('[NEWS-SAVE] Failed to insert bookmark:', insertErr.message);
        throw insertErr;
      }

      console.log(`[NEWS-SAVE] Bookmark created successfully for user ${userId}`);
      return res.json({ success: true, saved: true });
    }
  } catch (err: any) {
    console.error('[NEWS-SAVE] Toggle save failed:', err.message);
    res.status(500).json({ error: 'Internal news engine unable to update dossier' });
  }
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

function isMarketRestricted(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0 = Sunday, 6 = Saturday
  const mins = ist.getHours() * 60 + ist.getMinutes();

  // Restricted on Weekdays (Mon-Fri) between 9:00 AM (540 mins) and 4:00 PM (960 mins) IST
  return day >= 1 && day <= 5 && mins >= 540 && mins < 960;
}

app.post('/api/broker/groww/import-excel', upload.single('file'), async (req, res) => {
  const { portfolioId, userId } = req.body;
  const file = req.file;
  if (!file || !portfolioId || !userId) return res.status(400).json({ error: "Missing file, portfolioId or userId" });

  if (isMarketRestricted()) {
    console.warn(`[EXCEL-IMPORT] Rejecting Groww import: Request made during active weekday market hours.`);
    return res.status(403).json({
      error: "Portfolio imports are suspended during active market hours (9:00 AM - 4:00 PM IST on weekdays) to prevent asset valuation mismatches. Please try again after 4:00 PM IST."
    });
  }

  try {
    const dbUserId = getDbUserId(userId);
    console.log(`[EXCEL-IMPORT] Processing report for portfolio: ${portfolioId} (User: ${dbUserId})`);
    const result = await ExcelImportService.importGrowwOrders(file.buffer, portfolioId, dbUserId);
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

  if (isMarketRestricted()) {
    console.warn(`[ZERODHA-IMPORT] Rejecting Zerodha import: Request made during active weekday market hours.`);
    return res.status(403).json({
      error: "Portfolio imports are suspended during active market hours (9:00 AM - 4:00 PM IST on weekdays) to prevent asset valuation mismatches. Please try again after 4:00 PM IST."
    });
  }

  try {
    const dbUserId = getDbUserId(userId);
    console.log(`[ZERODHA-IMPORT] Processing CSV for portfolio: ${portfolioId} (User: ${dbUserId})`);
    const result = await ExcelImportService.importZerodhaCSV(file.buffer, portfolioId, dbUserId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[ZERODHA-IMPORT] Failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/portfolio/import-cas', upload.single('file'), async (req, res) => {
  const { password, portfolioName, userId } = req.body;
  const file = req.file;

  if (!file || !userId) {
    return res.status(400).json({ error: "Missing file or userId" });
  }

  try {
    const dbUserId = getDbUserId(userId);
    console.log(`[API-IMPORT-CAS] Processing CAS PDF statement for user: ${dbUserId}`);
    const result = await CASImportService.importCAS(file.buffer, password || '', dbUserId, portfolioName || 'Unified CAS Folio');
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[API-IMPORT-CAS] Ingestion crash:", error.message || error);
    
    // Check specific decryption failure
    if (error.message && error.message.includes('DECRYPTION_FAILED')) {
      return res.status(400).json({ 
        error: "Decryption failed. The password provided is incorrect for this CAS PDF." 
      });
    }

    if (error.message && error.message.includes('NO_HOLDINGS_FOUND')) {
      return res.status(400).json({ 
        error: "No holdings found. The uploaded PDF might not be a valid CAMS/KFintech CAS statement." 
      });
    }

    res.status(500).json({ 
      error: error.message || "An unexpected error occurred during statement ingestion." 
    });
  }
});

// News Retention Policy: Clean up unbookmarked articles older than 1 month
export const runNewsRetentionCleanup = async () => {
  try {
    console.log('[CLEANUP] Running news retention policy cleanup...');
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString();

    // 1. Fetch all bookmarked news IDs
    const { data: bookmarks, error: bookmarkErr } = await supabase
      .from('news_bookmarks')
      .select('news_id');

    if (bookmarkErr) {
      console.error('[CLEANUP] Failed to fetch bookmarks for cleanup:', bookmarkErr.message);
      return;
    }

    const bookmarkedIds = bookmarks ? bookmarks.map((b: any) => b.news_id).filter(Boolean) : [];

    // 2. Perform deletion of unsaved news older than 1 month
    let query = supabase
      .from('news')
      .delete()
      .lt('published_at', oneMonthAgoStr);

    if (bookmarkedIds.length > 0) {
      query = query.not('id', 'in', `(${bookmarkedIds.join(',')})`);
    }

    const { error: deleteErr } = await query;
    if (deleteErr) {
      console.error('[CLEANUP] News retention deletion failed:', deleteErr.message);
    } else {
      console.log(`[CLEANUP] News retention cleanup completed.`);
    }
  } catch (err: any) {
    console.error('[CLEANUP] News retention task failed:', err.message);
  }
};

// Daily midnight cleanup schedule
cron.schedule('0 0 * * *', runNewsRetentionCleanup);

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] StockOS Engine running on 0.0.0.0:${PORT}`);
  initializeScheduler();
  // Execute boot cleanup
  runNewsRetentionCleanup().catch(e => console.error('[CLEANUP] Initial boot cleanup failed:', e.message));
});
