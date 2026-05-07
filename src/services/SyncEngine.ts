import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { DOW_30, INDIAN_ASSETS } from '../constants/market-constants';
import { TOTP, generate } from 'otplib';
import cron from 'node-cron';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

// 1. Supabase Initialization
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

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
    const symbols = [
      { s: '^NSEI', n: 'NIFTY 50' },
      { s: '^BSESN', n: 'SENSEX' },
      { s: '^NSEBANK', n: 'BANK NIFTY' },
      { s: 'USDINR=X', n: 'USD / INR', type: 'currency' },
      { s: '^DJI', n: 'DOW JONES' },
      { s: '^GSPC', n: 'S&P 500' },
      { s: '^IXIC', n: 'NASDAQ 100' },
      { s: '^VIX', n: 'VIX' }
    ];

    const results = await Promise.all(symbols.map(async (item) => {
      try {
        const response = await axios.get(`https://query2.finance.yahoo.com/v8/finance/chart/${item.s}?interval=1m&range=1d`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          timeout: 5000
        });
        const meta = response.data.chart.result[0].meta;
        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose || meta.chartPreviousClose;

        return {
          label: item.n,
          type: item.type || 'index',
          value: price.toLocaleString('en-IN', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2
          }),
          change: (((price - prevClose) / prevClose) * 100).toFixed(2) + '%',
          positive: price >= prevClose
        };
      } catch (e: any) {
        console.warn(`[MARKET] Failed to fetch ${item.n}:`, e.message);
        return null;
      }
    }));

    res.json(results.filter(r => r !== null));
  } catch (e) {
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
    const s = symbol.toUpperCase().replace('.NS', '').replace('^', '');
    const isExplicitIndian = commonIndices.includes(s) || [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
      'LT', 'AXISBANK', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI', 'TITAN', 'ADANIENT', 'SUNPHARMA', 'ULTRACEMCO', 'WIPRO',
      'M&M', 'NTPC', 'POWERGRID', 'INDUSINDBK', 'NESTLEIND'
    ].includes(s);

    const isUsQuery = req.query.isUsStock === 'true';
    
    if (commonIndices.includes(s)) {
      yahooSymbol = `^${s}`;
    } else if (isUsExplicit || isUsQuery || (DOW_30.some(d => d.s === s) && !isExplicitIndian)) {
      yahooSymbol = s;
      isUsStock = true;
    } else if (isExplicitIndian) {
      yahooSymbol = `${s}.NS`;
    } else if (!symbol.includes('.') && !symbol.startsWith('^')) {
      const isLikelyUs = s.length <= 5;
      if (isLikelyUs) {
        yahooSymbol = s;
        isUsStock = true;
      } else {
        yahooSymbol = `${s}.NS`;
      }
    }

    // 2. Parse range and set time periods/intervals
    const range = (req.query.range as string) || '1Y';
    const period2 = new Date();
    const period1 = new Date();
    let interval: '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo' = '1d';

    if (range === '1D') {
      period1.setDate(period1.getDate() - 4); // Extra buffer for holidays
      interval = '15m';
    } else if (range === '1W') {
      period1.setDate(period1.getDate() - 14); // 1 week + 1 week lookback
      interval = '1h';
    } else if (range === '1M') {
      period1.setMonth(period1.getMonth() - 1);
      period1.setDate(period1.getDate() - 7); // 1 month + 1 week lookback
      interval = '1d';
    } else if (range === '1Y') {
      period1.setFullYear(period1.getFullYear() - 1);
      period1.setDate(period1.getDate() - 7);
      interval = '1d';
    } else if (range === 'ALL') {
      period1.setFullYear(period1.getFullYear() - 10);
      interval = '1wk';
    } else {
      period1.setFullYear(period1.getFullYear() - 1);
      interval = '1d';
    }

    // 3. Fetch historical data via yahoo-finance2
    const result = await yahooFinance.chart(yahooSymbol, {
      period1,
      period2,
      interval
    });

    // 4. Format for WealthChart { time, value }
    const isIntraday = interval.includes('m') || interval.includes('h');

    // Separate range target for slicing
    const rangeTarget = new Date();
    if (range === '1D') rangeTarget.setDate(rangeTarget.getDate() - 1);
    else if (range === '1W') rangeTarget.setDate(rangeTarget.getDate() - 7);
    else if (range === '1M') rangeTarget.setMonth(rangeTarget.getMonth() - 1);
    else if (range === '1Y') rangeTarget.setFullYear(rangeTarget.getFullYear() - 1);
    else if (range === 'ALL') rangeTarget.setFullYear(rangeTarget.getFullYear() - 10);

    const allQuotes = result.quotes.filter((c: any) => c.close !== null);

    // Find the "Anchor Point" (last quote BEFORE the range starts)
    const anchorQuote = allQuotes.filter((q: any) => new Date(q.date) < rangeTarget).pop();

    // Get actual quotes WITHIN the range
    let filteredQuotes = allQuotes.filter((q: any) => new Date(q.date) >= rangeTarget);

    // PREPEND anchor to ensure history[0] is the base for percentage
    if (anchorQuote && filteredQuotes.length > 0) {
      filteredQuotes = [anchorQuote, ...filteredQuotes];
    }

    const formatted = filteredQuotes.map((c: any) => {
      const time = isIntraday
        ? Math.floor(new Date(c.date).getTime() / 1000)
        : c.date.toISOString().split('T')[0];

      return {
        time,
        value: c.close
      };
    });

    // 5. UNIVERSAL LIVE-STITCHING: Ensure the final point ALWAYS matches the live database price
    if (formatted.length > 0) {
      try {
        const tableName = isUsStock ? 'us_market_assets' : 'market_assets';
        const searchSymbol = isUsStock ? symbol.toUpperCase() : symbol;
        
        console.log(`[STITCH] Fetching live price for ${searchSymbol} from ${tableName}`);
        
        const { data: liveData } = await supabase
          .from(tableName)
          .select('current_price')
          .eq('symbol', searchSymbol)
          .single();

        if (liveData && liveData.current_price) {
          if (!isIntraday) {
            // Macroscopic: Daily Dates
            const today = new Date().toISOString().split('T')[0];
            const lastCandleTime = formatted[formatted.length - 1].time;

            if (lastCandleTime !== today) {
              formatted.push({ time: today, value: liveData.current_price });
            } else {
              formatted[formatted.length - 1].value = liveData.current_price;
            }
          } else {
            // Intraday: Unix Timestamps
            // Append a synthetic "Live Tick" exactly 1 minute after the last Yahoo candle
            // This forces the graph to end at the correct live price without distorting history
            const lastCandleTime = formatted[formatted.length - 1].time;
            formatted.push({
              time: lastCandleTime + 60,
              value: liveData.current_price
            });
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
    await performSync();
    console.log("[SUCCESS] Manual sync completed successfully.");
    console.log("=".repeat(50) + "\n");
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[FATAL] Manual sync failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/market-seed', async (req, res) => {
  console.log("[INFO] Manual market deep-seed requested.");
  await syncMarketAssets(true);
  await syncUsMarketAssets(true);
  res.json({ success: true });
});

async function performSync() {
  const apiKey = process.env.GROWW_API_KEY;
  const totpSecret = process.env.GROWW_TOTP_SECRET;
  const portfolioId = process.env.PORTFOLIO_ID || 'primary';

  if (!apiKey || !totpSecret) {
    console.warn(`[WARN] Sync aborted: Missing GROWW_API_KEY or GROWW_TOTP_SECRET`);
    return;
  }

  let rawHoldings = [];
  try {
    const cleanSecret = totpSecret.trim();
    // 1. Generate TOTP
    const totpCode = await generate({ secret: cleanSecret });
    console.log(`[AUTH] Generated fresh TOTP for Groww login.`);

    // 2. Exchange for Access Token
    const authRes = await axios.post('https://api.groww.in/v1/token/api/access',
      { key_type: "totp", totp: totpCode },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-API-VERSION': '1.0'
        },
        timeout: 10000
      }
    );

    const token = authRes.data?.token;
    if (!token) throw new Error("Failed to obtain Groww access token");

    // 3. Fetch Raw Holdings
    const holdingsRes = await axios.get('https://api.groww.in/v1/holdings/user', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'X-API-VERSION': '1.0' }
    });
    rawHoldings = Array.isArray(holdingsRes.data) ? holdingsRes.data : (holdingsRes.data?.payload?.holdings || []);
    console.log(`[SUCCESS] Groww API: Fetched ${rawHoldings.length} live holdings.`);
  } catch (err: any) {
    const status = err.response?.status || 'Unknown';
    console.warn(`\n[FAILOVER] Groww API unreachable (${status}). Switching to Backup mode...`);

    // FALLBACK: Fetch last known holdings from our own DB
    const { data: dbHoldings, error: dbError } = await supabase
      .from('holdings')
      .select('*')
      .eq('portfolio_id', portfolioId);

    if (dbError || !dbHoldings || dbHoldings.length === 0) {
      console.error("[FATAL] Failover failed: No local backup data found in database.");
      return;
    }

    // Map DB format back to Groww-like format for the enrichment engine
    rawHoldings = dbHoldings.map(h => ({
      trading_symbol: h.trading_symbol,
      quantity: h.quantity,
      average_price: h.average_price,
      market_price: h.last_price
    }));
    console.log(`[BACKUP] Restored ${rawHoldings.length} assets from database backup.`);
  }

  if (rawHoldings.length === 0) {
    console.log("[INFO] No holdings available for sync.");
    return;
  }

  // 4. Enrich & Verify with Market Assets (Our Internal Source of Truth)
  const enriched = [];
  const holdingsSymbols = rawHoldings.map((h: any) => {
    const s = h.trading_symbol || h.symbol;
    const t = s.includes(':') ? s.split(':')[1] : s;
    return t.endsWith('.NS') ? t : `${t}.NS`;
  });

  console.log(`[BACKUP] Syncing prices for ${holdingsSymbols.length} holdings via Internal Market Data...`);

  // Fetch all market assets for fuzzy/normalized matching
  // (This ensures "RELIANCE.NS" matches "RELIANCE" and "Reliance (RELIANCE)")
  const { data: allMarketData } = await supabase
    .from('market_assets')
    .select('symbol, current_price, day_change, prev_close');

  // Create a hyper-compatible map with every possible key variant
  const marketMap = new Map();
  (allMarketData || []).forEach(m => {
    const raw = m.symbol;
    const dotNS = raw.endsWith('.NS') ? raw : `${raw}.NS`;
    const noNS = raw.endsWith('.NS') ? raw.replace('.NS', '') : raw;

    // Extract ticker from parentheses if present (e.g. "Reliance (RELIANCE)")
    const match = raw.match(/\(([^)]+)\)/);
    const parenTicker = match ? match[1] : null;

    const keys = [raw, dotNS, noNS];
    if (parenTicker) {
      keys.push(parenTicker);
      keys.push(`${parenTicker}.NS`);
    }

    keys.forEach(k => {
      if (k && !marketMap.has(k)) marketMap.set(k, m);
    });
  });

  // Identify symbols missing from our internal table to fetch from Yahoo
  const missingSymbols = holdingsSymbols.filter((s: string) => !marketMap.has(s));
  let yahooMap = new Map();

  if (missingSymbols.length > 0) {
    console.log(`[INFO] Fetching ${missingSymbols.length} niche assets from Yahoo Finance...`);
    const liveQuotes = await yahooFinance.quote(missingSymbols);
    yahooMap = new Map(liveQuotes.map((q: any) => [q.symbol, q]));
  }

  for (const item of rawHoldings) {
    try {
      const symbol = item.trading_symbol || item.symbol;
      const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      const yahooSymbol = ticker.endsWith('.NS') ? ticker : `${ticker}.NS`;

      // Priority: 1. Internal Market Table | 2. Yahoo Finance | 3. Groww Fallback
      const internal = marketMap.get(yahooSymbol) || marketMap.get(ticker);
      const external = yahooMap.get(yahooSymbol);

      const price = Number(internal?.current_price || external?.regularMarketPrice || item.market_price || item.last_traded_price || 0);
      const prevClose = Number(internal?.prev_close || external?.regularMarketPreviousClose || price || 0);
      const dayChangeVal = Number(internal?.day_change || (external ? (external.regularMarketPrice - external.regularMarketPreviousClose) : 0) || 0);

      const invested = (Number(item.quantity) || 0) * (Number(item.average_price) || 0);
      const marketValue = (Number(item.quantity) || 0) * price;
      const dayChange = dayChangeVal * (Number(item.quantity) || 0);

      // Generate a deterministic UUID from portfolioId-symbol to satisfy DB UUID constraint
      const hash = crypto.createHash('md5').update(`${portfolioId}-${symbol}`).digest('hex');
      const deterministicId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;

      enriched.push({
        id: deterministicId,
        portfolio_id: portfolioId,
        trading_symbol: symbol,
        quantity: Number(item.quantity) || 0,
        average_price: Number(item.average_price) || 0,
        last_price: price,
        close_price: prevClose, // Added for new schema compatibility
        invested_value: invested,
        market_value: marketValue,
        p_l: marketValue - invested,
        p_l_percentage: invested > 0 ? ((marketValue - invested) / invested) * 100 : 0,
        day_change: dayChange,
        day_change_percentage: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
        updated_at: new Date().toISOString()
      });
    } catch (e: any) {
      console.error(`[ERROR] Enrichment failed for ${item.trading_symbol}:`, e.message);
    }
  }

  // 5. Atomic Update: Deterministic Upsert
  console.log("\n==================================================");
  console.log(`[PORTFOLIO] Executing Verified Upsert for ${portfolioId}`);
  console.log("==================================================");

  try {
    const { error: insError } = await supabase.from('holdings').upsert(enriched, { onConflict: 'id' });
    if (insError) {
      console.error("[DB ERROR] Upsert failed:", insError.message);
      console.error("Details:", insError.details);
      console.error("Hint:", insError.hint);
      throw insError;
    }
  } catch (upsertErr: any) {
    console.error("[CRITICAL] Portfolio Upsert failed. Check RLS policies or Service Role Key.");
    throw upsertErr;
  }

  console.log(`[SUCCESS] Synchronized ${enriched.length} holdings:`);
  enriched.forEach(h => {
    console.log(`  → ${h.trading_symbol.padEnd(12)} | Qty: ${h.quantity.toString().padEnd(5)} | Price: ₹${h.last_price.toLocaleString('en-IN').padEnd(10)} | Day P/L: ${h.day_change >= 0 ? '+' : ''}₹${h.day_change.toLocaleString('en-IN')}`);
  });
  console.log("--------------------------------------------------");

  // 6. Portfolio History (One record per Financial Day)
  // 9 AM IST to 9 AM IST Logic (9 AM IST = 03:30 UTC)
  // We subtract 3.5 hours to determine the current "Financial Day"
  const now = new Date();
  const financialDate = new Date(now.getTime() - (3 * 60 + 30) * 60 * 1000);
  const logicalDay = financialDate.toISOString().split('T')[0];

  const totalInv = enriched.reduce((sum, h) => sum + h.invested_value, 0);
  const totalMkt = enriched.reduce((sum, h) => sum + h.market_value, 0);
  const totalPL = enriched.reduce((sum, h) => sum + h.p_l, 0);

  // Robust Purge: Remove ANY existing record for this financial day
  const { error: historyDelError } = await supabase
    .from('portfolio_history')
    .delete()
    .eq('portfolio_id', portfolioId)
    .gte('timestamp', `${logicalDay}T00:00:00.000Z`)
    .lte('timestamp', `${logicalDay}T23:59:59.999Z`);

  if (historyDelError) {
    console.error("[ERROR] Failed to purge old history for financial day:", historyDelError.message);
  }

  const { error: histError } = await supabase.from('portfolio_history').insert([{
    portfolio_id: portfolioId,
    total_investment: totalInv,
    total_market_value: totalMkt,
    total_p_l: totalPL,
    p_l_percentage: totalInv > 0 ? (totalPL / totalInv) * 100 : 0,
    timestamp: now.toISOString() // Record the actual real-world sync time
  }]);

  if (histError) {
    console.error("[ERROR] Failed to record history snapshot:", histError.message);
  } else {
    console.log(`[SUCCESS] Snapshot recorded for ${logicalDay}`);
  }


  console.log(`[INFO] Synchronized ${enriched.length} assets for user and recorded history snapshot.`);
}

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
  const assetList = INDIAN_ASSETS;

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
          const isIndex = item.t === 'INDEX';
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
            asset_type: item.t,
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
    const symbols = DOW_30.map(d => d.s);
    const quotes = await yahooFinance.quote(symbols);
    
    for (const q of quotes) {
      const assetInfo = DOW_30.find(d => d.s === q.symbol);
      
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
    
    console.log("--------------------------------------------------");
    console.log(`[US-ENGINE] Pulse complete at ${new Date().toLocaleTimeString()}`);
    console.log("==================================================\n");
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

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] StockOS Engine running on 0.0.0.0:${PORT}`);

  // 0. WARM START: Sync immediately on startup
  console.log("[WARM START] Initializing engine state...");
  await syncMarketAssets(false); // Update prices first
  await performSync();      // Then calculate portfolio value using new prices

  // 1. LIVE PULSE: Every 5 Minutes (Market Hours Only)
  cron.schedule('*/5 9-15 * * 1-5', async () => {
    if (isMarketOpen()) {
      console.log(`[PULSE] Live Market Pulse triggered.`);
      await syncMarketAssets(false);
    }
  }, { timezone: "Asia/Kolkata" });

  // 2. DEEP PULSE: Once per day at 3:45 PM IST (After Market Close)
  cron.schedule('45 15 * * 1-5', async () => {
    console.log("[ENGINE] Market closed. Executing deep fundamental enrichment...");
    await syncMarketAssets(true);
  }, { timezone: "Asia/Kolkata" });

  // 3. Portfolio Sync: Every 5 minutes (Market Hours Only)
  cron.schedule('*/5 9-15 * * 1-5', async () => {
    if (isMarketOpen()) {
      console.log(`[PULSE] Periodic portfolio sync triggered.`);
      await performSync();
    }
  }, { timezone: "Asia/Kolkata" });

  // 4. US MARKET PULSE: Every 5 Minutes (16-Hour Window)
  cron.schedule('*/5 13-23,0-5 * * 1-6', async () => {
    if (isUsMarketOpen()) {
      console.log(`[PULSE] US Market Pulse triggered.`);
      await syncUsMarketAssets(false);
    }
  }, { timezone: "Asia/Kolkata" });

  // 5. US DEEP PULSE: Once per day at 3:00 AM IST (After US Close)
  cron.schedule('0 3 * * 2-6', async () => {
    console.log("[ENGINE] US Market closed. Executing deep fundamental enrichment...");
    await syncUsMarketAssets(true);
  }, { timezone: "Asia/Kolkata" });

  // 6. INDIAN DEEP PULSE: Once per day at 4:00 PM IST (After Indian Close)
  cron.schedule('0 16 * * 1-5', async () => {
    console.log("[ENGINE] Indian Market closed. Executing deep fundamental enrichment...");
    await syncMarketAssets(true);
  }, { timezone: "Asia/Kolkata" });

  // 0. WARM START: Sync immediately on startup
  console.log("[WARM START] Initializing engine state...");
  try {
    await syncMarketAssets(false); 
    await syncUsMarketAssets(false);
    await performSync();     
  } catch (startupError: any) {
    console.error("[FATAL STARTUP ERROR] Sync failed:", startupError.message || startupError);
    if (startupError.details) console.error("Details:", startupError.details);
    if (startupError.hint) console.error("Hint:", startupError.hint);
  }
});

app.post('/api/us-market-seed', async (req, res) => {
  console.log("[MANUAL] US Market Deep Seed requested.");
  syncUsMarketAssets(true);
  res.json({ status: "US Deep Seed Initiated" });
});


