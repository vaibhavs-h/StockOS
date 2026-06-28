import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';
import axios from 'axios';
import crypto from 'crypto';

const AV_BASE = 'https://www.alphavantage.co/query';
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Alpha Vantage sentiment label → our impact level
const sentimentToImpact = (label: string): string => {
  switch (label) {
    case 'Bullish':
    case 'Bearish':
      return 'HIGH';
    case 'Somewhat-Bullish':
    case 'Somewhat-Bearish':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
};

// Parse AV's compact timestamp: "20260520T143015" → ISO string
const parseAVTimestamp = (ts: string): string => {
  try {
    // Format: YYYYMMDDTHHmmss
    const year   = ts.slice(0, 4);
    const month  = ts.slice(4, 6);
    const day    = ts.slice(6, 8);
    const hour   = ts.slice(9, 11);
    const minute = ts.slice(11, 13);
    const second = ts.slice(13, 15);
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

// Detect India-relevant articles from tickers, topics, and text
const isIndiaRelated = (
  tickers: string[],
  topics: { topic: string; relevance_score: string }[],
  title: string,
  summary: string
): boolean => {
  const hasIndianTicker = tickers.some(t =>
    t.endsWith('.NS') || t.endsWith('.BO') || t.endsWith('.BSE')
  );
  if (hasIndianTicker) return true;

  const topicNames = topics.map(t => t.topic.toLowerCase());
  if (topicNames.some(t => t.includes('india'))) return true;

  const indiaRegex = /\bindia\b|\bindian\b|\bnifty\b|\bsensex\b|\bnse\b|\bbse\b|\brupee\b|\brbi\b|\bsebi\b|\breserve bank\b/i;
  return indiaRegex.test(`${title} ${summary}`);
};

export class AlphaVantageNewsSyncJob extends BaseJob {
  public readonly id = 'AlphaVantageNewsSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_3_EXTENDED,
    symbols: [],
    region: MarketRegion.GLOBAL,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-news-av-sync',
    retryCount: 0,
    maxRetries: 0,
    backoffDelayMs: 5000,
  };

  protected async process(): Promise<number> {
    if (!AV_KEY) {
      throw new Error('[AlphaVantageNewsSyncJob] ALPHA_VANTAGE_API_KEY is not set in environment.');
    }

    const supabase = SupabaseProvider.getClient();
    console.log('[AlphaVantageNewsSyncJob] Starting Alpha Vantage news fetch...');

    // AV returns up to 1000 articles per call — we cap at 200 for reasonable batch size
    const url = `${AV_BASE}?function=NEWS_SENTIMENT&limit=200&sort=LATEST&apikey=${AV_KEY}`;

    let articles: any[] = [];
    try {
      const response = await axios.get(url, { timeout: 30000 });
      const data = response.data;

      if (data?.Information) {
        // Rate limit message from AV
        console.error('[AlphaVantageNewsSyncJob] AV rate limit hit:', data.Information);
        throw new Error('Alpha Vantage rate limit reached.');
      }

      articles = Array.isArray(data?.feed) ? data.feed : [];
      console.log(`[AlphaVantageNewsSyncJob] Fetched ${articles.length} articles from Alpha Vantage.`);
    } catch (err: any) {
      console.error('[AlphaVantageNewsSyncJob] Failed to fetch from Alpha Vantage:', err.message);
      throw err;
    }

    if (articles.length === 0) {
      console.log('[AlphaVantageNewsSyncJob] No articles returned. Skipping upsert.');
      return 0;
    }

    const ingestedUrls = new Set<string>();
    const payloads: any[] = [];

    for (const article of articles) {
      const url = article.url || '';
      if (!url || ingestedUrls.has(url)) continue;
      ingestedUrls.add(url);

      // Stable dedupe ID
      const id = crypto.createHash('md5').update(url).digest('hex');

      const title       = String(article.title || '').trim();
      const summary     = String(article.summary || '').trim();
      const source      = String(article.source || 'Unknown').trim();
      const sourceDomain = String(article.source_domain || '').trim();
      const publishedAt = parseAVTimestamp(article.time_published || '');
      const thumbnail   = article.banner_image || null;

      // Authors
      const authors: string[] = Array.isArray(article.authors) ? article.authors : [];

      // Topics — array of { topic, relevance_score }
      const topics: { topic: string; relevance_score: string }[] =
        Array.isArray(article.topics) ? article.topics : [];

      // Ticker sentiment — array of { ticker, relevance_score, ticker_sentiment_score, ticker_sentiment_label }
      const tickerSentiment: any[] = Array.isArray(article.ticker_sentiment)
        ? article.ticker_sentiment
        : [];

      // Stock tickers — extracted from ticker_sentiment, sorted by relevance
      const stocks: string[] = tickerSentiment
        .sort((a, b) => parseFloat(b.relevance_score) - parseFloat(a.relevance_score))
        .map(t => String(t.ticker).toUpperCase())
        .filter(Boolean)
        .slice(0, 20); // cap

      // Overall sentiment
      const sentimentScore: number | null =
        typeof article.overall_sentiment_score === 'number'
          ? article.overall_sentiment_score
          : parseFloat(article.overall_sentiment_score) || null;

      const sentimentLabel = String(article.overall_sentiment_label || 'Neutral').trim();
      const impact         = sentimentToImpact(sentimentLabel);

      // Category detection
      const category = isIndiaRelated(stocks, topics, title, summary) ? 'india' : 'global';

      payloads.push({
        id,
        title,
        summary,
        url,
        source,
        source_domain: sourceDomain,
        published_at: publishedAt,
        category,
        stocks,
        impact,
        why: sentimentLabel, // human-readable sentiment label stored in why for backwards compat
        thumbnail,
        authors,
        topics,
        ticker_sentiment: tickerSentiment,
        sentiment_score: sentimentScore,
        sentiment_label: sentimentLabel,
      });
    }

    if (payloads.length === 0) {
      console.log('[AlphaVantageNewsSyncJob] No valid articles after parsing. Skipping upsert.');
      return 0;
    }

    // Batch upsert in chunks of 50 to avoid Supabase payload limits
    const CHUNK_SIZE = 50;
    let totalUpserted = 0;

    for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
      const chunk = payloads.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('news')
        .upsert(chunk, { onConflict: 'id' });

      if (error) {
        console.error(`[AlphaVantageNewsSyncJob] Upsert error on chunk ${i / CHUNK_SIZE + 1}:`, error.message);
        // Don't throw — continue with other chunks
      } else {
        totalUpserted += chunk.length;
      }
    }

    console.log(`[AlphaVantageNewsSyncJob] Successfully upserted ${totalUpserted} articles.`);

    // Prune articles older than 30 days, protecting bookmarks
    await this.pruneOldNews(supabase);

    return totalUpserted;
  }

  private async pruneOldNews(supabase: any): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: bookmarks } = await supabase
        .from('news_bookmarks')
        .select('news_id');

      const bookmarkedIds: string[] = (bookmarks || []).map((b: any) => b.news_id);

      let pruneQuery = supabase
        .from('news')
        .delete()
        .lt('published_at', thirtyDaysAgo.toISOString());

      if (bookmarkedIds.length > 0) {
        pruneQuery = pruneQuery.not('id', 'in', `(${bookmarkedIds.join(',')})`);
      }

      const { error } = await pruneQuery;
      if (error) {
        console.error('[AlphaVantageNewsSyncJob] Prune failed:', error.message);
      } else {
        console.log('[AlphaVantageNewsSyncJob] Old articles pruned successfully.');
      }
    } catch (e: any) {
      console.error('[AlphaVantageNewsSyncJob] Prune error:', e.message);
    }
  }
}
