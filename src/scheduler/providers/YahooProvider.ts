import YahooFinance from 'yahoo-finance2';
import { yahooRequestQueue } from '../core/YahooRequestQueue';

const yahooFinance = new YahooFinance();

export class YahooProvider {
  /**
   * Fetches lightweight quote data (Live Sync)
   */
  static async fetchQuotes(symbols: string[], region: 'IN' | 'US' = 'IN') {
    return yahooRequestQueue.enqueue(
      `quotes-${region}-${symbols.length}`,
      async () => {
        const start = Date.now();
        try {
          const results = await yahooFinance.quote(symbols);
          const latency = Date.now() - start;
          console.log(`[YAHOO] 📦 BATCH  | ${region} | Symbols: ${String(symbols.length).padStart(3)} | Latency: ${latency}ms`);
          return results;
        } catch (error: any) {
          throw error;
        }
      },
      5 // Higher priority for live quotes
    );
  }

  /**
   * Fetches heavy quote summary modules (Deep Sync)
   */
  static async fetchQuoteSummary(symbol: string, modules: string[], region: 'IN' | 'US' = 'IN') {
    return yahooRequestQueue.enqueue(
      `summary-${region}-${symbol}`,
      async () => {
        const start = Date.now();
        try {
          const result = await yahooFinance.quoteSummary(symbol, { modules: modules as any });
          const latency = Date.now() - start;
          console.log(`[YAHOO] 📑 SUMMARY| ${region} | Symbol: ${symbol.padEnd(10)} | Latency: ${latency}ms`);
          return result;
        } catch (error: any) {
          throw error;
        }
      },
      20 // Lower priority for deep sync
    );
  }
}



