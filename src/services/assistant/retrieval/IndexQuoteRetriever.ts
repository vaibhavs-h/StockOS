import { YahooProvider } from '../../../scheduler/providers/YahooProvider';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';

const INDICES = [
  { s: '^NSEI', n: 'NIFTY 50' },
  { s: '^BSESN', n: 'SENSEX' },
  { s: '^NSEBANK', n: 'BANK NIFTY' },
  { s: '^DJI', n: 'DOW JONES' },
  { s: '^GSPC', n: 'S&P 500' },
  { s: '^IXIC', n: 'NASDAQ' },
  { s: '^VIX', n: 'VIX' },
];

interface IndexSnapshot {
  n: string;
  price: number;
  changePct: number;
}

export async function fetchIndexLevels(): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const cacheKey = 'indices:global';
  const cacheKeys = [cacheKey];

  let snapshots = assistantCache.get<IndexSnapshot[]>(cacheKey);
  let asOf: string;

  if (snapshots) {
    asOf = new Date(Date.now() - (assistantCache.getAgeMs(cacheKey) ?? 0)).toISOString();
  } else {
    asOf = new Date().toISOString();
    try {
      const quotes = (await YahooProvider.fetchQuotes(INDICES.map(i => i.s), 'GLOBAL' as any)) || [];
      snapshots = INDICES.map(cfg => {
        const q = quotes.find((quote: any) => quote.symbol === cfg.s);
        if (!q || q.regularMarketPrice === undefined) return null;
        const price = q.regularMarketPrice;
        const prevClose = q.regularMarketPreviousClose;
        return { n: cfg.n, price, changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0 };
      }).filter((s): s is IndexSnapshot => s !== null);
    } catch {
      snapshots = [];
    }
    assistantCache.set(cacheKey, snapshots, CACHE_TTL.INDICES_MS);
  }

  const fields: ProvenancedField[] = snapshots.map(s => ({
    field: `index_${s.n.replace(/\s+/g, '_').toLowerCase()}`,
    value: `${s.price.toFixed(2)} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%)`,
    source: 'yahoo_finance_live',
    kind: 'retrieved',
    asOf,
  }));

  return { fields, cacheKeys };
}

export const IndexQuoteRetriever = { fetchIndexLevels };
