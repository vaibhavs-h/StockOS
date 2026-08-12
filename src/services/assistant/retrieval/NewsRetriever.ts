import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';

interface NewsRow {
  title: string;
  published_at: string;
  sentiment_label: string | null;
}

interface RichNewsRow {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
  published_at: string;
  impact: string | null;
  sentiment_label: string | null;
}

export async function fetchRecentNews(symbol: string, limit = 3): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const cleanTicker = symbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
  const cacheKey = `news:${cleanTicker}`;
  const cacheKeys = [cacheKey];

  let rows = assistantCache.get<NewsRow[]>(cacheKey);
  if (!rows) {
    const { data } = await supabase
      .from('news')
      .select('title, published_at, sentiment_label')
      .or(`stocks.cs.{"${cleanTicker}"},stocks.cs.{"${cleanTicker}.NS"},stocks.cs.{"${cleanTicker}.BO"}`)
      .order('published_at', { ascending: false })
      .limit(limit);

    rows = data || [];
    assistantCache.set(cacheKey, rows, CACHE_TTL.NEWS_MS);
  }

  if (rows.length === 0) return { fields: [], cacheKeys };

  const fields: ProvenancedField[] = rows.map((item, i) => ({
    field: `recent_news_${i + 1}`,
    value: `${item.title}${item.sentiment_label ? ` (${item.sentiment_label})` : ''}`,
    source: 'news',
    kind: 'retrieved',
    asOf: item.published_at,
  }));

  return { fields, cacheKeys };
}

function formatRichItem(item: RichNewsRow): string {
  const summary = item.summary ? item.summary.slice(0, 240) : '';
  const parts = [item.source, item.impact ? `${item.impact} impact` : null, item.sentiment_label].filter(Boolean).join(', ');
  return `${item.title}${parts ? ` [${parts}]` : ''}${summary ? ` — ${summary}` : ''}`;
}

/** Richer per-item fields for capabilities that need more than a headline (investment_thesis,
 * news_analysis) — same `news` table `fetchRecentNews` already reads, just widening the
 * SELECT to columns AlphaVantageNewsSyncJob/IndianNewsSyncJob already populate but the plain
 * headline retriever above never surfaces. */
export async function fetchRecentNewsRich(symbol: string, limit = 5): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const cleanTicker = symbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
  const cacheKey = `news_rich:${cleanTicker}`;
  const cacheKeys = [cacheKey];

  let rows = assistantCache.get<RichNewsRow[]>(cacheKey);
  if (!rows) {
    const { data } = await supabase
      .from('news')
      .select('id, title, summary, source, published_at, impact, sentiment_label')
      .or(`stocks.cs.{"${cleanTicker}"},stocks.cs.{"${cleanTicker}.NS"},stocks.cs.{"${cleanTicker}.BO"}`)
      .order('published_at', { ascending: false })
      .limit(limit);

    rows = data || [];
    assistantCache.set(cacheKey, rows, CACHE_TTL.NEWS_MS);
  }

  if (rows.length === 0) return { fields: [], cacheKeys };

  const fields: ProvenancedField[] = rows.map((item, i) => ({
    field: `news_item_${i + 1}`,
    value: formatRichItem(item),
    source: 'news',
    kind: 'retrieved',
    asOf: item.published_at,
  }));

  return { fields, cacheKeys };
}

interface TickerSentimentEntry { ticker: string; relevance_score: string | number }

/** A multi-stock roundup article can legitimately have our target ticker in its `stocks`
 * array while really being about a different company that's just mentioned alongside it
 * (confirmed against real data: a "Citigroup raises MKS Instruments' price target" article
 * had BAC tagged at a real, non-trivial relevance_score purely because Citigroup and Bank of
 * America both appeared in its text). Requiring our ticker to be the *most* relevant one
 * tagged on that specific article — not just present — is what actually distinguishes "this
 * article is about our sector" from "our sector's ticker was incidentally mentioned." A
 * single-symbol query doesn't have this problem (the one ticker the user asked about is
 * relevant by definition), so this filter is specific to the fan-out-across-many-tickers case.
 */
function isPrimarySubject(tickerSentiment: TickerSentimentEntry[] | null | undefined, targetTickers: Set<string>): boolean {
  if (!tickerSentiment || tickerSentiment.length === 0) return true; // no sentiment data to judge by — don't over-filter
  const scores = tickerSentiment.map(e => ({ ticker: e.ticker, score: Number(e.relevance_score) || 0 }));
  const maxScore = Math.max(...scores.map(s => s.score));
  return scores.some(s => targetTickers.has(s.ticker) && s.score >= maxScore);
}

/** News across a sector's largest constituents — the `news` table has no sector column
 * itself (it's tagged by ticker), so this resolves the sector's top-cap symbols first, then
 * unions their recent news, deduped by id. */
export async function fetchForSector(sector: string, limit = 5): Promise<{ fields: ProvenancedField[]; cacheKeys: string[] }> {
  const cacheKey = `news_sector:${sector}`;
  const cacheKeys = [cacheKey];

  let rows = assistantCache.get<RichNewsRow[]>(cacheKey);
  if (!rows) {
    const [inTop, usTop] = await Promise.all([
      supabase.from('market_assets').select('symbol').eq('sector', sector).order('market_cap', { ascending: false, nullsFirst: false }).limit(5),
      supabase.from('us_market_assets').select('symbol').eq('sector', sector).order('market_cap', { ascending: false, nullsFirst: false }).limit(5),
    ]);
    const tickers = [...(inTop.data || []), ...(usTop.data || [])]
      .map((r: any) => (r.symbol as string).replace(/\.(NS|BO)$/i, '').toUpperCase());

    if (tickers.length === 0) {
      rows = [];
    } else {
      const targetTickers = new Set(tickers);
      const orClause = tickers.map(t => `stocks.cs.{"${t}"}`).join(',');
      const { data } = await supabase
        .from('news')
        .select('id, title, summary, source, published_at, impact, sentiment_label, ticker_sentiment')
        .or(orClause)
        .order('published_at', { ascending: false })
        .limit(limit * 4);

      const seen = new Set<string>();
      rows = ((data as (RichNewsRow & { ticker_sentiment: TickerSentimentEntry[] })[]) || [])
        .filter(r => isPrimarySubject(r.ticker_sentiment, targetTickers))
        .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
        .slice(0, limit);
    }
    assistantCache.set(cacheKey, rows, CACHE_TTL.NEWS_MS);
  }

  if (rows.length === 0) return { fields: [], cacheKeys };

  const fields: ProvenancedField[] = rows.map((item, i) => ({
    field: `sector_news_${i + 1}`,
    value: formatRichItem(item),
    source: 'news',
    kind: 'retrieved',
    asOf: item.published_at,
  }));

  return { fields, cacheKeys };
}

export const NewsRetriever = { fetchRecentNews, fetchRecentNewsRich, fetchForSector };
