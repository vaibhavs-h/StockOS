import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
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
      { s: '^GSPC', n: 'S&P 500' }
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

app.get('/api/stocks/:symbol/history', async (req, res) => {
  const { symbol } = req.params;
  try {
    // 1. Format symbol for Yahoo (assume .NS for Indian equities if not present)
    // Avoid appending .NS to indices like ^NSEI
    let yahooSymbol = symbol;
    if (!symbol.includes('.') && !symbol.startsWith('^')) {
      yahooSymbol = `${symbol}.NS`;
    }

    // 2. Parse range and set time periods/intervals
    const range = (req.query.range as string) || '1Y';
    const period2 = new Date();
    const period1 = new Date();
    let interval: '1m'|'2m'|'5m'|'15m'|'30m'|'60m'|'90m'|'1h'|'1d'|'5d'|'1wk'|'1mo'|'3mo' = '1d';

    if (range === '1D') {
      period1.setDate(period1.getDate() - 3); // 3 days to cover weekends
      interval = '15m';
    } else if (range === '1W') {
      period1.setDate(period1.getDate() - 7);
      interval = '60m';
    } else if (range === '1M') {
      period1.setMonth(period1.getMonth() - 1);
      interval = '1d';
    } else if (range === 'ALL') {
      period1.setFullYear(period1.getFullYear() - 10); // 10 years limit
      interval = '1wk';
    } else {
      // Default 1Y
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
    const formatted = result.quotes
      .filter((c: any) => c.close !== null)
      .map((c: any) => {
        // Lightweight Charts needs unix timestamp (seconds) for intraday, or 'YYYY-MM-DD' for daily
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
        const { data: liveData } = await supabase
          .from('market_assets')
          .select('current_price')
          .eq('symbol', symbol)
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
  console.log("[INFO] Manual portfolio sync requested.");
  await performSync();
  res.json({ success: true });
});

app.post('/api/market-seed', async (req, res) => {
  console.log("[INFO] Manual market deep-seed requested.");
  await syncMarketAssets(true);
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

        const price = internal?.current_price || external?.regularMarketPrice || parseFloat(item.market_price || item.last_traded_price || 0);
        const prevClose = internal?.prev_close || external?.regularMarketPreviousClose || price;
        const dayChangeVal = internal?.day_change || (external ? (external.regularMarketPrice - external.regularMarketPreviousClose) : 0);

        const invested = item.quantity * item.average_price;
        const marketValue = item.quantity * price;
        const dayChange = dayChangeVal * item.quantity;

        // Generate a deterministic UUID from portfolioId-symbol to satisfy DB UUID constraint
        const hash = crypto.createHash('md5').update(`${portfolioId}-${symbol}`).digest('hex');
        const deterministicId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;

        enriched.push({
          id: deterministicId,
          portfolio_id: portfolioId,
          trading_symbol: symbol,
          quantity: item.quantity,
          average_price: item.average_price,
          last_price: price,
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
    
    const { error: insError } = await supabase.from('holdings').upsert(enriched, { onConflict: 'id' });
    if (insError) throw insError;

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
  const assetList = [
    // Indices
    { s: '^NSEI', n: 'NIFTY 50', t: 'INDEX' },
    { s: '^BSESN', n: 'SENSEX', t: 'INDEX' },
    { s: '^NSEBANK', n: 'BANK NIFTY', t: 'INDEX' },
    { s: '^CNXIT', n: 'NIFTY IT', t: 'INDEX' },
    { s: '^CNXAUTO', n: 'NIFTY AUTO', t: 'INDEX' },
    { s: '^CNXMETAL', n: 'NIFTY METAL', t: 'INDEX' },
    { s: '^CNXPHARMA', n: 'NIFTY PHARMA', t: 'INDEX' },
    { s: '^CNXFMCG', n: 'NIFTY FMCG', t: 'INDEX' },
    { s: '^CNXREALTY', n: 'NIFTY REALTY', t: 'INDEX' },
    { s: '^CNXINFRA', n: 'NIFTY INFRA', t: 'INDEX' },
    { s: '^CNXENERGY', n: 'NIFTY ENERGY', t: 'INDEX' },
    
    // Nifty 50 Constituents
    { s: 'RELIANCE.NS', n: 'Reliance Industries', t: 'STOCK' },
    { s: 'TCS.NS', n: 'Tata Consultancy Services', t: 'STOCK' },
    { s: 'HDFCBANK.NS', n: 'HDFC Bank', t: 'STOCK' },
    { s: 'INFY.NS', n: 'Infosys', t: 'STOCK' },
    { s: 'ICICIBANK.NS', n: 'ICICI Bank', t: 'STOCK' },
    { s: 'HINDUNILVR.NS', n: 'Hindustan Unilever', t: 'STOCK' },
    { s: 'ITC.NS', n: 'ITC Limited', t: 'STOCK' },
    { s: 'SBIN.NS', n: 'State Bank of India', t: 'STOCK' },
    { s: 'BHARTIARTL.NS', n: 'Bharti Airtel', t: 'STOCK' },
    { s: 'KOTAKBANK.NS', n: 'Kotak Mahindra Bank', t: 'STOCK' },
    { s: 'LT.NS', n: 'Larsen & Toubro', t: 'STOCK' },
    { s: 'AXISBANK.NS', n: 'Axis Bank', t: 'STOCK' },
    { s: 'BAJFINANCE.NS', n: 'Bajaj Finance', t: 'STOCK' },
    { s: 'ASIANPAINT.NS', n: 'Asian Paints', t: 'STOCK' },
    { s: 'MARUTI.NS', n: 'Maruti Suzuki', t: 'STOCK' },
    { s: 'TITAN.NS', n: 'Titan Company', t: 'STOCK' },
    { s: 'ADANIENT.NS', n: 'Adani Enterprises', t: 'STOCK' },
    { s: 'SUNPHARMA.NS', n: 'Sun Pharmaceutical', t: 'STOCK' },
    { s: 'ULTRACEMCO.NS', n: 'UltraTech Cement', t: 'STOCK' },
    { s: 'WIPRO.NS', n: 'Wipro', t: 'STOCK' },
    { s: 'M&M.NS', n: 'Mahindra & Mahindra', t: 'STOCK' },
    { s: 'NTPC.NS', n: 'NTPC Limited', t: 'STOCK' },
    { s: 'POWERGRID.NS', n: 'Power Grid Corporation', t: 'STOCK' },
    { s: 'INDUSINDBK.NS', n: 'IndusInd Bank', t: 'STOCK' },
    { s: 'NESTLEIND.NS', n: 'Nestle India', t: 'STOCK' },
    { s: 'ADANIPORTS.NS', n: 'Adani Ports', t: 'STOCK' },
    { s: 'BAJAJ-AUTO.NS', n: 'Bajaj Auto', t: 'STOCK' },
    { s: 'TATASTEEL.NS', n: 'Tata Steel', t: 'STOCK' },
    { s: 'ONGC.NS', n: 'Oil & Natural Gas Corp', t: 'STOCK' },
    { s: 'JSWSTEEL.NS', n: 'JSW Steel', t: 'STOCK' },
    { s: 'TATAMOTORS.NS', n: 'Tata Motors', t: 'STOCK' },
    { s: 'GRASIM.NS', n: 'Grasim Industries', t: 'STOCK' },
    { s: 'TECHM.NS', n: 'Tech Mahindra', t: 'STOCK' },
    { s: 'HCLTECH.NS', n: 'HCL Technologies', t: 'STOCK' },
    { s: 'HDFCLIFE.NS', n: 'HDFC Life', t: 'STOCK' },
    { s: 'SBILIFE.NS', n: 'SBI Life Insurance', t: 'STOCK' },
    { s: 'BRITANNIA.NS', n: 'Britannia Industries', t: 'STOCK' },
    { s: 'EICHERMOT.NS', n: 'Eicher Motors', t: 'STOCK' },
    { s: 'COALINDIA.NS', n: 'Coal India', t: 'STOCK' },
    { s: 'CIPLA.NS', n: 'Cipla', t: 'STOCK' },
    { s: 'DIVISLAB.NS', n: 'Divi\'s Laboratories', t: 'STOCK' },
    { s: 'APOLLOHOSP.NS', n: 'Apollo Hospitals', t: 'STOCK' },
    { s: 'HEROMOTOCO.NS', n: 'Hero MotoCorp', t: 'STOCK' },
    { s: 'DRREDDY.NS', n: 'Dr. Reddy\'s Laboratories', t: 'STOCK' },
    { s: 'BPCL.NS', n: 'Bharat Petroleum', t: 'STOCK' },
    { s: 'LTIM.NS', n: 'LTIMindtree', t: 'STOCK' }
  ];

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
  return (hour === 9 && minute >= 15) || (hour > 9 && hour < 15) || (hour === 15 && minute <= 30);
}

const PORT = process.env.PORT || 3003;
app.listen(PORT, async () => {
  console.log(`[SERVER] StockOS Engine running on port ${PORT}`);

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
});
