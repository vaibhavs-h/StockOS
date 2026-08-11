import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';

interface NewsRow {
  title: string;
  published_at: string;
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

export const NewsRetriever = { fetchRecentNews };
