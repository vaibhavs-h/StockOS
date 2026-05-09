import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { YahooProvider } from '../providers/YahooProvider';
import axios from 'axios';
import crypto from 'crypto';
import { generate } from 'otplib';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class PortfolioSyncJob extends BaseJob {
  public readonly id = 'PortfolioSyncJob';
  
  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_1_HOT,
    symbols: [],
    region: MarketRegion.IN, // Predominantly Indian market for Groww
    priority: QueuePriority.PORTFOLIO,
    bullMqQueueName: 'q-portfolio-sync',
    retryCount: 0,
    maxRetries: 1
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    let processedCount = 0;

    const apiKey = process.env.GROWW_API_KEY;
    const totpSecret = process.env.GROWW_TOTP_SECRET;
    const portfolioId = process.env.NEXT_PUBLIC_PORTFOLIO_ID || 'primary';

    if (!apiKey || !totpSecret) {
      console.warn("[PortfolioSyncJob] GROWW_API_KEY or GROWW_TOTP_SECRET missing, skipping sync.");
      return 0;
    }

    // 1. Generate TOTP
    const cleanSecret = totpSecret.trim();
    const totpCode = await generate({ secret: cleanSecret });

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

    // 3. Fetch Portfolio
    const portRes = await axios.get('https://api.groww.in/v1/holdings/user', {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json', 
        'X-API-VERSION': '1.0' 
      },
      timeout: 10000
    });

    const rawHoldings = Array.isArray(portRes.data) ? portRes.data : (portRes.data?.payload?.holdings || []);
    console.log(`[PortfolioSyncJob] Fetched ${rawHoldings.length} raw holdings from Groww.`);

    if (rawHoldings.length === 0) {
      console.log("[PortfolioSyncJob] No holdings found in Groww account.");
      return 0;
    }

    // 4. Pre-fetch Market Maps
    console.log(`[PortfolioSyncJob] Fetching market asset maps for enrichment...`);
    const { data: dbAssets } = await supabase.from('market_assets').select('symbol, current_price, prev_close, day_change');
    const marketMap = new Map((dbAssets || []).map(a => [a.symbol, a]));


    const yahooSymbols = rawHoldings.map((h: any) => {
      const sym = h.trading_symbol || h.symbol;
      const t = sym.includes(':') ? sym.split(':')[1] : sym;
      return t.endsWith('.NS') ? t : `${t}.NS`;
    });

    const yahooQuotes = await YahooProvider.fetchQuotes(yahooSymbols);
    const yahooMap = new Map(yahooQuotes.map((q: any) => [q.symbol, q]));

    // 5. Enrich Data
    const enriched = [];
    for (const item of rawHoldings) {
      try {
        const symbol = item.trading_symbol || item.symbol;
        const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol;
        const yahooSymbol = ticker.endsWith('.NS') ? ticker : `${ticker}.NS`;

        const internal = marketMap.get(yahooSymbol) || marketMap.get(ticker);
        const external = yahooMap.get(yahooSymbol);

        const price = internal?.current_price || external?.regularMarketPrice || parseFloat(item.market_price || item.last_traded_price || 0);
        const prevClose = internal?.prev_close || external?.regularMarketPreviousClose || price;
        const dayChangeVal = internal?.day_change || (external ? (external.regularMarketPrice - external.regularMarketPreviousClose) : 0);

        const invested = item.quantity * item.average_price;
        const marketValue = item.quantity * price;
        const dayChange = dayChangeVal * item.quantity;

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
        processedCount++;
      } catch (e: any) {
        console.error(`[PortfolioSyncJob] Enrichment failed for ${item.trading_symbol}:`, e.message);
      }
    }

    // 6. DB Upsert
    console.log(`[PortfolioSyncJob] Persisting ${enriched.length} enriched holdings to Supabase...`);
    await supabase.from('holdings').delete().eq('portfolio_id', portfolioId);
    const { error: insError } = await supabase.from('holdings').upsert(enriched, { onConflict: 'id' });
    if (insError) throw insError;
    console.log(`[PortfolioSyncJob] Successfully updated holdings table.`);

    // 7. Snapshot History
    console.log(`[PortfolioSyncJob] Recording portfolio history snapshot...`);

    const now = new Date();
    const financialDate = new Date(now.getTime() - (3 * 60 + 30) * 60 * 1000);
    const logicalDay = financialDate.toISOString().split('T')[0];

    const totalInv = enriched.reduce((sum, h) => sum + h.invested_value, 0);
    const totalMkt = enriched.reduce((sum, h) => sum + h.market_value, 0);
    const totalPL = enriched.reduce((sum, h) => sum + h.p_l, 0);

    await supabase.from('portfolio_history').delete().eq('portfolio_id', portfolioId)
      .gte('timestamp', `${logicalDay}T00:00:00.000Z`)
      .lte('timestamp', `${logicalDay}T23:59:59.999Z`);

    const { error: histError } = await supabase.from('portfolio_history').insert([{
      portfolio_id: portfolioId,
      total_investment: totalInv,
      total_market_value: totalMkt,
      total_p_l: totalPL,
      p_l_percentage: totalInv > 0 ? (totalPL / totalInv) * 100 : 0,
      timestamp: now.toISOString()
    }]);

    if (histError) console.error("[PortfolioSyncJob] Failed to record history snapshot:", histError.message);

    return processedCount;
  }
}
