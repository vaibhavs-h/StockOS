import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';
import axios from 'axios';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// RSS feeds — all free, no API key required
// ---------------------------------------------------------------------------
const INDIAN_RSS_FEEDS: { url: string; source: string; domain: string }[] = [
  {
    url: 'https://economictimes.indiatimes.com/markets/rss.cms',
    source: 'Economic Times',
    domain: 'economictimes.indiatimes.com',
  },
  {
    url: 'https://www.livemint.com/rss/markets',
    source: 'Livemint',
    domain: 'livemint.com',
  },
  {
    url: 'https://www.moneycontrol.com/rss/marketreports.xml',
    source: 'MoneyControl',
    domain: 'moneycontrol.com',
  },
  {
    url: 'https://www.business-standard.com/rss/markets-106.rss',
    source: 'Business Standard',
    domain: 'business-standard.com',
  },
  {
    url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss',
    source: 'BusinessLine',
    domain: 'thehindubusinessline.com',
  },
  {
    url: 'https://bqprime.com/markets/rss',
    source: 'BQ Prime',
    domain: 'bqprime.com',
  },
];

// ---------------------------------------------------------------------------
// Simple keyword-based sentiment heuristic
// (Alpha Vantage does this via ML; we approximate it for RSS articles)
// ---------------------------------------------------------------------------
const BULLISH_TERMS = [
  'surge', 'surged', 'rally', 'rallied', 'gain', 'gained', 'rise', 'rose', 'soar', 'soared',
  'jump', 'jumped', 'record high', 'all-time high', 'outperform', 'strong', 'positive',
  'upgrade', 'upgraded', 'beat', 'beats', 'profit', 'growth', 'upside', 'buy', 'bullish',
];

const BEARISH_TERMS = [
  'fall', 'fell', 'drop', 'dropped', 'decline', 'declined', 'slump', 'slumped', 'crash',
  'crashed', 'plunge', 'plunged', 'downgrade', 'downgraded', 'miss', 'missed', 'loss',
  'losses', 'weak', 'bearish', 'sell', 'downside', 'concern', 'risk', 'warning', 'cut',
];

function scoreText(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of BULLISH_TERMS) {
    if (lower.includes(term)) score += 0.08;
  }
  for (const term of BEARISH_TERMS) {
    if (lower.includes(term)) score -= 0.08;
  }
  return Math.max(-1, Math.min(1, score));
}

function scoreToLabel(score: number): string {
  if (score >= 0.35) return 'Bullish';
  if (score >= 0.1) return 'Somewhat-Bullish';
  if (score <= -0.35) return 'Bearish';
  if (score <= -0.1) return 'Somewhat-Bearish';
  return 'Neutral';
}

function scoreToImpact(score: number): string {
  const abs = Math.abs(score);
  if (abs >= 0.35) return 'HIGH';
  if (abs >= 0.1) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Minimal XML/RSS parser — avoids pulling in a heavy XML parser dependency
// ---------------------------------------------------------------------------
function extractTagContent(xml: string, tag: string): string {
  // Handles both <tag>value</tag> and CDATA: <tag><![CDATA[value]]></tag>
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i');
  const m = re.exec(xml);
  if (!m) return '';
  return (m[1] ?? m[2] ?? '').trim();
}

function parseRSS(xml: string, feedSource: string, feedDomain: string): {
  title: string; url: string; summary: string;
  source: string; sourceDomain: string; publishedAt: string;
}[] {
  const results: any[] = [];

  // Split on <item> tags
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractTagContent(itemXml, 'title').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    const link  = extractTagContent(itemXml, 'link') || extractTagContent(itemXml, 'guid');
    const desc  = extractTagContent(itemXml, 'description').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    const pubDate = extractTagContent(itemXml, 'pubDate') || extractTagContent(itemXml, 'dc:date') || '';

    if (!title || !link) continue;

    let publishedAt: string;
    try {
      publishedAt = new Date(pubDate || Date.now()).toISOString();
    } catch {
      publishedAt = new Date().toISOString();
    }

    results.push({
      title,
      url: link.trim(),
      summary: desc.slice(0, 800), // cap summary length
      source: feedSource,
      sourceDomain: feedDomain,
      publishedAt,
    });
  }

  return results;
}

function extractIndianTopics(title: string, summary: string): { topic: string; relevance_score: string }[] {
  const combined = `${title} ${summary}`.toLowerCase();
  const topics: { topic: string; relevance_score: string }[] = [];

  const mappings = [
    {
      topic: 'Financial_Markets',
      keywords: ['stock', 'market', 'share', 'nifty', 'sensex', 'ipo', 'trade', 'trading', 'bse', 'nse', 'index', 'equity', 'bond', 'yield']
    },
    {
      topic: 'Economy_Macro',
      keywords: ['inflation', 'gdp', 'rbi', 'interest rate', 'policy', 'economic', 'budget', 'growth', 'fiscal', 'macro', 'deficit', 'rupee', 'regulation']
    },
    {
      topic: 'Earnings',
      keywords: ['earnings', 'q1', 'q2', 'q3', 'q4', 'profit', 'revenue', 'quarterly', 'dividend', 'ebitda', 'loss']
    },
    {
      topic: 'Mergers_Acquisitions',
      keywords: ['acquisition', 'acquire', 'merger', 'merged', 'buyout', 'takeover', 'stake', 'selloff', 'divestment']
    },
    {
      topic: 'Technology',
      keywords: ['tech', 'software', 'ai', 'semiconductor', 'telecom', '5g', 'digital', 'cloud', 'internet']
    }
  ];

  for (const m of mappings) {
    let matches = 0;
    for (const kw of m.keywords) {
      if (combined.includes(kw)) {
        matches++;
      }
    }
    if (matches > 0) {
      const relevance = Math.min(0.5 + matches * 0.15, 0.95).toFixed(2);
      topics.push({ topic: m.topic, relevance_score: relevance });
    }
  }

  if (topics.length === 0) {
    topics.push({ topic: 'Financial_Markets', relevance_score: '0.60' });
  }

  return topics.sort((a, b) => parseFloat(b.relevance_score) - parseFloat(a.relevance_score));
}

// ---------------------------------------------------------------------------
// Known NSE/BSE ticker keywords for basic stock extraction from headlines
// (Not exhaustive — just catches common Nifty50 names in headlines)
// ---------------------------------------------------------------------------
const KNOWN_INDIAN_TICKERS: Record<string, string> = {
  reliance: 'RELIANCE.NS', tcs: 'TCS.NS', infosys: 'INFY.NS', hdfc: 'HDFCBANK.NS',
  icici: 'ICICIBANK.NS', 'state bank': 'SBIN.NS', sbi: 'SBIN.NS', wipro: 'WIPRO.NS',
  itc: 'ITC.NS', 'bajaj finance': 'BAJFINANCE.NS', maruti: 'MARUTI.NS', nestle: 'NESTLEIND.NS',
  hul: 'HINDUNILVR.NS', 'titan': 'TITAN.NS', adani: 'ADANIENT.NS', bharti: 'BHARTIARTL.NS',
  airtel: 'BHARTIARTL.NS', 'larsen': 'LT.NS', kotak: 'KOTAKBANK.NS',
  'axis bank': 'AXISBANK.NS', 'tech mahindra': 'TECHM.NS', 'dr reddy': 'DRREDDY.NS',
  sunpharma: 'SUNPHARMA.NS', 'sun pharma': 'SUNPHARMA.NS', ongc: 'ONGC.NS', ntpc: 'NTPC.NS',
  powergrid: 'POWERGRID.NS', 'power grid': 'POWERGRID.NS', ultratech: 'ULTRACEMCO.NS',
  'jsw steel': 'JSWSTEEL.NS', tata: 'TATAMOTORS.NS',
};

function extractIndianTickers(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [keyword, ticker] of Object.entries(KNOWN_INDIAN_TICKERS)) {
    if (lower.includes(keyword)) found.add(ticker);
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// The Job
// ---------------------------------------------------------------------------
export class IndianNewsSyncJob extends BaseJob {
  public readonly id = 'IndianNewsSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_3_EXTENDED,
    symbols: [],
    region: MarketRegion.IN,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-news-india-rss',
    retryCount: 0,
    maxRetries: 2,
    backoffDelayMs: 5000,
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    console.log('[IndianNewsSyncJob] Starting Indian RSS news fetch from', INDIAN_RSS_FEEDS.length, 'feeds...');

    const allArticles: {
      title: string; url: string; summary: string;
      source: string; sourceDomain: string; publishedAt: string;
    }[] = [];

    // Fetch all feeds concurrently
    await Promise.allSettled(
      INDIAN_RSS_FEEDS.map(async (feed) => {
        try {
          const resp = await axios.get(feed.url, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockOS/1.0)' },
            responseType: 'text',
          });
          const parsed = parseRSS(resp.data, feed.source, feed.domain);
          console.log(`[IndianNewsSyncJob] ${feed.source}: ${parsed.length} articles`);
          allArticles.push(...parsed);
        } catch (err: any) {
          console.warn(`[IndianNewsSyncJob] Failed to fetch ${feed.source}: ${err.message}`);
        }
      })
    );

    if (allArticles.length === 0) {
      console.log('[IndianNewsSyncJob] No articles fetched from any RSS feed. Skipping.');
      return 0;
    }

    const seenUrls = new Set<string>();
    const payloads: any[] = [];

    for (const article of allArticles) {
      const url = article.url.trim();
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);

      // Stable dedup ID — same strategy as AlphaVantageNewsSyncJob
      const id = crypto.createHash('md5').update(url).digest('hex');

      const combined = `${article.title} ${article.summary}`;
      const sentimentScore = scoreText(combined);
      const sentimentLabel = scoreToLabel(sentimentScore);
      const impact = scoreToImpact(sentimentScore);
      const stocks = extractIndianTickers(combined);

      payloads.push({
        id,
        title:          article.title,
        summary:        article.summary || null,
        url,
        source:         article.source,
        source_domain:  article.sourceDomain,
        published_at:   article.publishedAt,
        category:       'india',           // always India for this job
        stocks,
        impact,
        why:            sentimentLabel,
        thumbnail:      null,
        authors:        [],
        topics:         extractIndianTopics(article.title, article.summary || ""),
        ticker_sentiment: [],
        sentiment_score:  sentimentScore,
        sentiment_label:  sentimentLabel,
      });
    }

    if (payloads.length === 0) {
      console.log('[IndianNewsSyncJob] No valid payloads after dedup. Skipping upsert.');
      return 0;
    }

    // Batch upsert in chunks of 50
    const CHUNK_SIZE = 50;
    let totalUpserted = 0;

    for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
      const chunk = payloads.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('news')
        .upsert(chunk, { onConflict: 'id' });

      if (error) {
        console.error(`[IndianNewsSyncJob] Upsert error on chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, error.message);
      } else {
        totalUpserted += chunk.length;
      }
    }

    console.log(`[IndianNewsSyncJob] Successfully upserted ${totalUpserted} Indian articles.`);
    return totalUpserted;
  }
}
