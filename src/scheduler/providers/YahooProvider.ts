import YahooFinance from 'yahoo-finance2';
import { yahooRequestQueue } from '../core/YahooRequestQueue';

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

/**
 * YahooProvider: The Institutional Data Gateway.
 * Interfaces with yahoo-finance2 via the prioritized YahooRequestQueue.
 */
export class YahooProvider {
  /**
   * Fetches lightweight quote data (Live Sync / Ephemeral Pulse)
   * Priority: P1 (High)
   */
  static async fetchQuotes(symbols: string[], region: 'IN' | 'US' = 'IN') {
    return yahooRequestQueue.enqueue(
      `quotes-${region}-${symbols.length}-${symbols[0]}`, // ID includes first symbol for basic uniqueness
      async () => {
        try {
          const results = await yahooFinance.quote(symbols, {}, { validateResult: false } as any);
          return results;
        } catch (error: any) {
          throw error;
        }
      },
      1 // Priority P1: High priority for live market data
    );
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
        try {
          // Note: yahoo-finance2 uses 'validateResult' for quoteSummary as well
          const result = await yahooFinance.quoteSummary(symbol, { modules: modules as any }, { validateResult: false } as any);
          return result;
        } catch (error: any) {
          console.error(`[YahooProvider] Failed fetchQuoteSummary for ${symbol}:`, error.message);
          // Return null instead of throwing to prevent global crash
          return null;
        }
      },
      4 // Priority P4: Low priority for deep enrichment
    );
  }
}
