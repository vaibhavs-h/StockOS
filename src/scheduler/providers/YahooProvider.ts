import YahooFinance from 'yahoo-finance2';
import { yahooRequestQueue } from '../core/YahooRequestQueue';
import axios from 'axios';
import { proxyRotationManager } from '../core/ProxyRotationManager';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  fetchOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0'
    }
  }
});
proxyRotationManager.registerClient(yahooFinance);


function toTwelveDataSymbol(symbol: string): string {
  // If it's an Indian stock
  if (symbol.endsWith('.NS')) {
    return `${symbol.slice(0, -3)}:NSE`;
  }
  if (symbol.endsWith('.BO')) {
    return `${symbol.slice(0, -3)}:BSE`;
  }
  // US indices, currencies, general mapping
  if (symbol === '^GSPC') return 'SPX';
  if (symbol === '^IXIC') return 'IXIC';
  if (symbol === '^DJI') return 'DJI';
  if (symbol === '^VIX') return 'VIX';
  if (symbol === '^RUT') return 'RUT';
  if (symbol === '^NSEI') return 'NIFTY';
  if (symbol === 'USDINR=X') return 'USD/INR';
  
  return symbol;
}

/**
 * YahooProvider: The Institutional Data Gateway.
 * Interfaces with yahoo-finance2 via the prioritized YahooRequestQueue.
 * Falling back seamlessly to Twelve Data API if Yahoo rate limits or errors.
 */
// Every current caller of fetchQuotes/fetchQuote (BatchAggregationService's Tier-1 hot poll,
// BurstSyncService, /api/indices, IndexQuoteRetriever) only reads these fields off the result.
// Yahoo's `fields` param is applied server-side, so restricting it shrinks the actual response
// body — not just what we keep after receiving it — which matters most here because this is the
// highest-frequency outbound call in the engine (every ~2 min per active symbol during market hours).
const QUOTE_FIELDS = [
  'symbol', 'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
  'regularMarketPreviousClose', 'regularMarketVolume', 'regularMarketDayHigh', 'regularMarketDayLow',
  'marketState', 'marketCap', 'trailingPE', 'fiftyTwoWeekHigh', 'fiftyTwoWeekLow'
];

export class YahooProvider {
  /**
   * Fetches lightweight quote data (Live Sync / Ephemeral Pulse)
   * Priority: P1 (High)
   */
  static async fetchQuotes(symbols: string[], region: 'IN' | 'US' = 'IN') {
    return yahooRequestQueue.enqueue(
      `quotes-${region}-${symbols.length}-${symbols[0]}`, // ID includes first symbol for basic uniqueness
      async () => {
        let attempts = 0;
        const maxAttempts = Math.max(2, proxyRotationManager.getPoolSize());

        while (attempts < maxAttempts) {
          const activeProxyIndex = proxyRotationManager.getCurrentIndex();
          try {
            const results = await yahooFinance.quote(symbols, { fields: QUOTE_FIELDS }, { validateResult: false } as any);
            return results;
          } catch (error: any) {
            attempts++;
            const wasRotated = await proxyRotationManager.handleRequestFailure(error, activeProxyIndex);
            if (wasRotated && attempts < maxAttempts) {
              console.log(`[YahooProvider] Proxy rotated. Retrying quote fetch (attempt ${attempts + 1}/${maxAttempts})...`);
              continue;
            }

            // If we get here, all proxies failed. Try a direct connection as a last resort before Twelve Data.
            console.log(`[YahooProvider] All proxies failed. Attempting direct connection (no proxy)...`);
            const clientOpts = (yahooFinance as any)._opts;
            const oldDispatcher = clientOpts?.fetchOptions?.dispatcher;
            if (clientOpts?.fetchOptions) {
              clientOpts.fetchOptions.dispatcher = undefined;
            }
            try {
              const results = await yahooFinance.quote(symbols, { fields: QUOTE_FIELDS }, { validateResult: false } as any);
              console.log(`[YahooProvider] Direct connection fallback succeeded.`);
              return results;
            } catch (directError: any) {
              console.warn(`[YahooProvider] Direct connection fallback failed: ${directError.message}`);
            } finally {
              // Restore proxy dispatcher for subsequent requests
              if (clientOpts?.fetchOptions) {
                clientOpts.fetchOptions.dispatcher = oldDispatcher;
              }
            }

            console.warn(`[YahooProvider] Yahoo Finance quote fetch failed. Attempting Twelve Data fallback... Reason: ${error.message}`);
            
            const apiKey = process.env.TWELVE_DATA_API_KEY;
            if (!apiKey) {
              console.error('[YahooProvider] Twelve Data fallback failed: TWELVE_DATA_API_KEY is not configured in environment variables.');
              throw error;
            }

            try {
              return await this.fetchQuotesFromTwelveData(symbols, apiKey);
            } catch (tdError: any) {
              console.error('[YahooProvider] Twelve Data fallback failed entirely:', tdError.message);
              throw error; // throw original Yahoo error if fallback also fails
            }
          }
        }
      },
      1 // Priority P1: High priority for live market data
    );
  }

  /**
   * Helper to fetch and map quotes from Twelve Data
   */
  private static async fetchQuotesFromTwelveData(symbols: string[], apiKey: string) {
    const symbolMap = new Map<string, string>();
    const mappedSymbols = symbols.map(s => {
      const tdSym = toTwelveDataSymbol(s);
      symbolMap.set(tdSym.toLowerCase(), s);
      // Map base ticker as backup
      const base = tdSym.split(':')[0].toLowerCase();
      if (!symbolMap.has(base)) {
        symbolMap.set(base, s);
      }
      return tdSym;
    });

    const symbolString = mappedSymbols.join(',');
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolString)}&apikey=${apiKey}`;
    
    console.log(`[TwelveData] Fetching quotes for symbols: ${symbolString}`);
    const response = await axios.get(url);
    const data = response.data;

    if (data.status === 'error') {
      throw new Error(data.message || 'Twelve Data API returned error status');
    }

    const results: any[] = [];
    const parseItem = (item: any, queryKey?: string) => {
      if (!item || item.status === 'error') return;

      const responseSym = item.symbol || '';
      // Find matching Yahoo symbol
      let originalSymbol = '';
      if (queryKey) {
        originalSymbol = symbolMap.get(queryKey.toLowerCase()) || '';
      }
      if (!originalSymbol) {
        originalSymbol = symbolMap.get(responseSym.toLowerCase()) || symbolMap.get(responseSym.split(':')[0].toLowerCase()) || responseSym;
      }

      const price = parseFloat(item.close);
      if (isNaN(price)) return;

      results.push({
        symbol: originalSymbol,
        regularMarketPrice: price,
        regularMarketChange: parseFloat(item.change || '0'),
        regularMarketChangePercent: parseFloat(item.percent_change || '0'),
        regularMarketPreviousClose: parseFloat(item.previous_close || '0'),
        regularMarketVolume: parseInt(item.volume || '0', 10),
        regularMarketDayHigh: parseFloat(item.high || '0'),
        regularMarketDayLow: parseFloat(item.low || '0'),
        marketState: item.is_market_open ? 'REGULAR' : 'CLOSED',
        // Fallbacks for detail pages
        displayName: item.name,
        shortName: item.name
      });
    };

    if (data.symbol) {
      // Single symbol response
      parseItem(data, mappedSymbols[0]);
    } else {
      // Multi-symbol response
      for (const [key, value] of Object.entries(data)) {
        parseItem(value, key);
      }
    }

    console.log(`[TwelveData] Successfully resolved ${results.length}/${symbols.length} quotes.`);
    return results;
  }

  /**
   * Fetches a single quote and normalizes the data structure.
   * Useful for targeted syncs and pulse updates.
   */
  static async fetchQuote(symbol: string, region: 'IN' | 'US' = 'IN') {
    const results = await this.fetchQuotes([symbol], region);
    if (!results || results.length === 0) return null;

    const q = results[0];
    return {
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      prevClose: q.regularMarketPreviousClose,
      symbol: q.symbol,
      // Extended Hours
      preMarketPrice: q.preMarketPrice,
      preMarketChangePercent: q.preMarketChangePercent,
      postMarketPrice: q.postMarketPrice,
      postMarketChangePercent: q.postMarketChangePercent
    };
  }

  /**
   * Fetches heavy quote summary modules (Deep Sync / Fundamentals)
   * Priority: P4 (Low)
   */
  static async fetchQuoteSummary(symbol: string, modules: string[], region: 'IN' | 'US' = 'IN') {
    return yahooRequestQueue.enqueue(
      `summary-${region}-${symbol}`,
      async () => {
        let attempts = 0;
        const maxAttempts = Math.max(2, proxyRotationManager.getPoolSize());

        while (attempts < maxAttempts) {
          const activeProxyIndex = proxyRotationManager.getCurrentIndex();
          try {
            // Note: yahoo-finance2 uses 'validateResult' for quoteSummary as well
            const result = await yahooFinance.quoteSummary(symbol, { modules: modules as any }, { validateResult: false } as any);
            return result;
          } catch (error: any) {
            attempts++;
            const wasRotated = await proxyRotationManager.handleRequestFailure(error, activeProxyIndex);
            if (wasRotated && attempts < maxAttempts) {
              console.log(`[YahooProvider] Proxy rotated. Retrying quoteSummary fetch for ${symbol} (attempt ${attempts + 1}/${maxAttempts})...`);
              continue;
            }

            // If all proxies failed, try a direct connection as a last resort
            console.log(`[YahooProvider] All proxies failed. Attempting direct connection for quoteSummary (no proxy)...`);
            const clientOpts = (yahooFinance as any)._opts;
            const oldDispatcher = clientOpts?.fetchOptions?.dispatcher;
            if (clientOpts?.fetchOptions) {
              clientOpts.fetchOptions.dispatcher = undefined;
            }
            try {
              const result = await yahooFinance.quoteSummary(symbol, { modules: modules as any }, { validateResult: false } as any);
              console.log(`[YahooProvider] Direct connection fallback for quoteSummary succeeded.`);
              return result;
            } catch (directError: any) {
              console.warn(`[YahooProvider] Direct connection fallback for quoteSummary failed: ${directError.message}`);
            } finally {
              // Restore proxy dispatcher for subsequent requests
              if (clientOpts?.fetchOptions) {
                clientOpts.fetchOptions.dispatcher = oldDispatcher;
              }
            }

            console.error(`[YahooProvider] Failed fetchQuoteSummary for ${symbol}:`, error.message);
            // Return null instead of throwing to prevent global crash
            return null;
          }
        }
      },
      4 // Priority P4: Low priority for deep enrichment
    );
  }
}
