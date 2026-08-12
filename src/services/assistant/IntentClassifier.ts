import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { ClassifiedIntent, ConversationFocus, Intent } from './types';
import { ModelRegistry } from './ModelRegistry';
import { LLMClient } from './LLMClient';
import { resolveSectorName } from './retrieval/SectorRetriever';
import { resolveScreenerFilters } from './retrieval/ScreenerQueryBuilder';

// ── Deterministic symbol pre-pass ───────────────────────────────────────────
// Built once from SymbolUniverseManager so a real ticker or company name in the
// message is caught without spending a model call on it (§07 of the architecture doc).

interface SymbolLookupEntry {
  storageSymbol: string;
  matchText: string; // lowercased symbol or name, used for substring matching
  kind: 'ticker' | 'name';
}

let symbolLookup: SymbolLookupEntry[] | null = null;
let symbolSet: Set<string> | null = null;

export function knownSymbols(): Set<string> {
  if (symbolSet) return symbolSet;
  symbolSet = new Set<string>();
  SymbolUniverseManager.getUniqueIndianEquities().forEach(a => symbolSet!.add(normalizeStorageSymbol(a.s)));
  SymbolUniverseManager.getUniqueUsEquities().forEach(a => symbolSet!.add(normalizeStorageSymbol(a.s)));
  return symbolSet;
}

function buildSymbolLookup(): SymbolLookupEntry[] {
  if (symbolLookup) return symbolLookup;
  const entries: SymbolLookupEntry[] = [];
  const seen = new Set<string>();

  const add = (storageSymbol: string, matchText: string, kind: 'ticker' | 'name') => {
    const key = `${storageSymbol}|${matchText}`;
    if (seen.has(key) || matchText.length < 2) return;
    seen.add(key);
    entries.push({ storageSymbol, matchText, kind });
  };

  for (const asset of SymbolUniverseManager.getUniqueIndianEquities()) {
    const storage = normalizeStorageSymbol(asset.s);
    add(storage, storage.replace('.NS', '').replace('.BO', '').toLowerCase(), 'ticker');
    if (asset.n) add(storage, asset.n.toLowerCase(), 'name');
  }
  for (const asset of SymbolUniverseManager.getUniqueUsEquities()) {
    const storage = normalizeStorageSymbol(asset.s);
    add(storage, storage.toLowerCase(), 'ticker');
    if (asset.n) add(storage, asset.n.toLowerCase(), 'name');
  }

  // Longest match text first so "reliance industries" wins over "reliance" fragments, etc.
  entries.sort((a, b) => b.matchText.length - a.matchText.length);
  symbolLookup = entries;
  return entries;
}

/**
 * Short tickers (≤4 chars) routinely collide with ordinary English words — "ARE" (Alexandria
 * Real Estate Equities), "IT", "ON", "ALL", "GO", "SO" are all real tickers. A bare-ticker match
 * that short is only trusted if it appears in the message in the exact case a ticker is
 * conventionally written (ALL CAPS) — company-name matches stay case-insensitive since a full
 * name is long/specific enough that a collision is implausible.
 */
function extractSymbols(rawMessage: string, maxMatches = 4): string[] {
  const lower = ` ${rawMessage.toLowerCase()} `;
  const found: string[] = [];
  const consumed = new Set<string>();

  for (const entry of buildSymbolLookup()) {
    if (found.length >= maxMatches) break;
    if (consumed.has(entry.storageSymbol)) continue;

    const escaped = entry.matchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const requireUpper = entry.kind === 'ticker' && entry.matchText.length <= 4;
    const haystack = requireUpper ? ` ${rawMessage} ` : lower;
    const needle = requireUpper ? entry.matchText.toUpperCase() : escaped;
    const boundary = new RegExp(`[^a-zA-Z0-9]${requireUpper ? needle : escaped}[^a-zA-Z0-9]`, requireUpper ? '' : 'i');

    if (boundary.test(haystack)) {
      found.push(entry.storageSymbol);
      consumed.add(entry.storageSymbol);
    }
  }
  return found;
}

const PORTFOLIO_RE = /\bmy\s+(?:\w+\s+){0,3}(portfolio|portfolios|holdings|investments)\b|\bour\s+(?:\w+\s+){0,3}(portfolio|portfolios|holdings|investments)\b|portfolio (health|allocation)|how\s+(?:is|are)\s+(?:my|our)\s+.{0,30}?\bdoing\b/i;
const COMPARE_RE = /\bcompare\b|\bvs\.?\b|\bversus\b/i;
const MARKET_RE = /\b(market|nifty|sensex|banknifty|bank nifty|dow|nasdaq|s&p|vix|indices)\b/i;
// "exposure to"/"my exposure" catches phrasing like "what's my exposure to the IT sector" —
// only reached when symbols.length === 0 (see heuristicClassify), so within this branch it's
// reliably about the user's own portfolio, not a specific stock's exposure to something.
const RISK_RE = /\brisk|\brisky\b|\bvolatilit|\bvolatile\b|\bdiversif|\bsector exposure\b|\bmy exposure\b|\bexposure to\b/i;
const OPTIMIZATION_RE = /\brebalanc|\boptimi[sz]e|\ballocation change|\breallocat/i;
const WATCHLIST_RE = /\bwatchlist|\bmy list\b|\btracked stocks\b/i;
const MUTUAL_FUND_RE = /\bmutual fund|\bmf\b|\bscheme\b|\bnav\b|\bsip\b/i;
const SCREENER_RE = /\bscreen(er)?\b|\bwhich stocks\b|\bfind (me )?stocks\b|\bstocks (with|under|below|above|over)\b|\bfilter stocks\b/i;
const ETF_RE = /\betf\b|exchange[- ]traded fund/i;
const DIVIDEND_RE = /\bdividend|\bpayout\b|\bdiv\.? yield\b/i;
const TECHNICAL_RE = /\btechnical|\bmoving average|\btrend\b|\b52.week|\bsupport\b|\bresistance\b|\bma.?50\b|\bma.?200\b/i;
const NEWS_RE = /\bnews\b|\bheadlines?\b|\bannouncement/i;
const THESIS_RE = /\bthesis\b|should i (buy|invest)|\binvestment case\b|\bbull case\b|\bbear case\b|worth (buying|investing)/i;

function heuristicClassify(message: string, focus: ConversationFocus): ClassifiedIntent {
  const symbols = extractSymbols(message);
  const hasCompareKeyword = COMPARE_RE.test(message);

  if (hasCompareKeyword && (symbols.length >= 2 || (symbols.length >= 1 && focus.last_symbols.length > 0))) {
    const compareSymbols = symbols.length >= 2 ? symbols : Array.from(new Set([...focus.last_symbols.slice(0, 1), ...symbols]));
    return { intent: 'compare', confidence: 0.9, entities: { symbols: compareSymbols } };
  }

  // Portfolio/user-scoped intents, gated on having no explicit single stock symbol — "how
  // risky is my portfolio" should win here, but "is RELIANCE risky" should still fall
  // through to the stock_research path below. Checked (and PORTFOLIO_RE along with them)
  // before sector resolution runs, on purpose — "my portfolio's exposure to banking stocks"
  // names a sector word ("banking") but is unambiguously about the user's own portfolio, not
  // the banking sector at large; sector resolution running first would misroute it to
  // sector_analysis purely because a sector-alias word happened to appear in the sentence.
  if (symbols.length === 0) {
    if (RISK_RE.test(message)) return { intent: 'risk_analysis', confidence: 0.8, entities: { symbols: [] } };
    if (OPTIMIZATION_RE.test(message)) return { intent: 'portfolio_optimization', confidence: 0.8, entities: { symbols: [] } };
    if (WATCHLIST_RE.test(message)) return { intent: 'watchlist_review', confidence: 0.8, entities: { symbols: [] } };
    if (MUTUAL_FUND_RE.test(message)) return { intent: 'mutual_fund_analysis', confidence: 0.8, entities: { symbols: [] } };
    if (PORTFOLIO_RE.test(message)) return { intent: 'portfolio_analysis', confidence: 0.85, entities: { symbols: [] } };
  }

  if (SCREENER_RE.test(message)) {
    return { intent: 'screener', confidence: 0.6, entities: { symbols: [] } };
  }

  if (symbols.length > 0) {
    if (ETF_RE.test(message)) return { intent: 'etf_analysis', confidence: 0.85, entities: { symbols } };
    if (DIVIDEND_RE.test(message)) return { intent: 'dividend_analysis', confidence: 0.85, entities: { symbols } };
    if (TECHNICAL_RE.test(message)) return { intent: 'technical_analysis', confidence: 0.85, entities: { symbols } };
    if (THESIS_RE.test(message)) return { intent: 'investment_thesis', confidence: 0.85, entities: { symbols } };
    if (NEWS_RE.test(message)) return { intent: 'news_analysis', confidence: 0.8, entities: { symbols } };
  } else if (NEWS_RE.test(message)) {
    const sector = resolveSectorHeuristic(message);
    if (sector) return { intent: 'news_analysis', confidence: 0.6, entities: { symbols: [], sector } };
  }

  const sector = resolveSectorHeuristic(message);
  if (sector) return { intent: 'sector_analysis', confidence: 0.7, entities: { symbols: [], sector } };

  if (symbols.length > 0) {
    return { intent: 'stock_research', confidence: symbols.length === 1 ? 0.9 : 0.7, entities: { symbols } };
  }

  if (MARKET_RE.test(message)) {
    return { intent: 'market_overview', confidence: 0.8, entities: { symbols: [] } };
  }

  return { intent: 'general_finance', confidence: 0.5, entities: { symbols: [] } };
}

/** Cheap, no-model sector match for the heuristic pre-pass — only fires when the message
 * actually names a sector, never a bare guess. The LLM refinement pass below does the same
 * resolution more robustly when a model is configured. */
function resolveSectorHeuristic(message: string): string | undefined {
  return resolveSectorName(message) ?? undefined;
}

const VALID_INTENTS: Intent[] = [
  'stock_research', 'portfolio_analysis', 'compare', 'market_overview', 'general_finance',
  'dividend_analysis', 'technical_analysis', 'sector_analysis', 'etf_analysis', 'news_analysis',
  'investment_thesis', 'watchlist_review', 'mutual_fund_analysis', 'risk_analysis',
  'portfolio_optimization', 'screener',
];

const CLASSIFIER_SYSTEM_PROMPT = `You classify a user's message to a financial research assistant into exactly one intent, and extract any stock symbols mentioned.

Intents:
- stock_research: asking about one specific named company/stock in general.
- compare: asking to compare two or more specific named companies/stocks.
- portfolio_analysis: asking about the user's OWN portfolio, holdings, or investments in aggregate (value, allocation, sector exposure) — not a specific stock, and not specifically about risk or rebalancing (see risk_analysis / portfolio_optimization below).
- market_overview: asking about overall market/index levels (Nifty, Sensex, Dow, S&P, etc), not a specific company.
- general_finance: an educational/conceptual question, or anything that doesn't fit the above.
- dividend_analysis: asking about a specific stock's dividend history, payout, or yield.
- technical_analysis: asking about a specific stock's moving averages, 52-week range, or trend.
- sector_analysis: asking about a whole sector/industry in the market at large (e.g. "IT sector", "banking stocks"). If the sentence is actually about the user's OWN portfolio (mentions "my portfolio", "my holdings", "my exposure to", "my exposure", etc.) even though it also names a sector — e.g. "should I be worried about my portfolio's exposure to banking stocks" or "what's my exposure to the IT sector" — that is portfolio_analysis or risk_analysis, not sector_analysis; the sector word alone doesn't decide it. Extract the sector name into "sector" only when the intent really is sector_analysis.
- etf_analysis: asking about a specific named ETF.
- news_analysis: asking for recent news/headlines about a specific stock, or about a sector (extract "sector" if no stock is named).
- investment_thesis: asking whether to buy/invest in a specific stock, or for a bull/bear case — a longer research question about that one company, not a plain fact lookup.
- watchlist_review: asking about the user's OWN watchlist.
- mutual_fund_analysis: asking about the user's OWN mutual fund holdings, or general mutual fund/NAV/SIP questions tied to their holdings.
- risk_analysis: asking specifically about the user's OWN portfolio's risk, volatility, beta, or diversification. If a specific company is named instead (even with the word "risky"/"risk" in the sentence), that is NOT risk_analysis — StockOS has no per-stock risk rating, so treat it as whichever intent actually matches what's being asked about that company (its dividend, its trend, or — if nothing more specific applies — stock_research as the default for a single named company).
- portfolio_optimization: asking the user's OWN portfolio should be rebalanced or reallocated.
- screener: asking to find/filter stocks in the market matching criteria (sector, market cap, PE, dividend yield, price, ROE, PEG) — not about the user's own holdings. Extract any criteria mentioned into "filters" using only these keys, each only when the user's wording maps to it directly:
  - sector (string).
  - marketCapMinValue / marketCapMinUnit and marketCapMaxValue / marketCapMaxUnit: do NOT do the multiplication yourself — just output the plain number the user said as the Value, and the scale word they used as the Unit (one of: "absolute", "thousand", "lakh", "million", "crore", "billion", "trillion"). "market cap above 10000 crore" → marketCapMinValue: 10000, marketCapMinUnit: "crore". "500 billion" → Value: 500, Unit: "billion". If no scale word was said, use Unit: "absolute".
  - peMin / peMax, priceMin / priceMax: plain numbers as the user stated them.
  - dividendYieldMin, roeMin: a fraction, not a percentage — "yield above 3%" → 0.03, "ROE above 15%" → 0.15.
  - pegMax: plain number.
  - Only add a key the user's sentence actually implies a bound for — a one-sided request ("PE below 30") means ONLY peMax, never also add peMin just because a PE ratio happens to usually be positive. Omit any key you can't confidently extract — never guess a number or invent an unstated bound.

Rules:
- A short common English word ("are", "it", "on", "all", "go", "so", "for") is almost never meant as a stock ticker even if it happens to match one — only extract it as a symbol if the sentence is clearly asking about that specific company, not just using the word normally.
- If the user is asking about their own portfolio/holdings/watchlist/mutual funds in aggregate, that is the matching portfolio-scoped intent even if the sentence contains a word that coincidentally matches a ticker.
- Only extract symbols you are confident are genuinely being asked about.

Respond with ONLY a JSON object, no other text: {"intent": "<one of the intents above>", "symbols": ["<company name or ticker as written, if any>"], "sector": "<sector name, only for sector_analysis/news_analysis>", "filters": {<only for screener, only the allowlisted keys above>}, "confidence": <0-1>}`;

interface ModelClassification {
  intent: Intent;
  symbols: string[];
  sector?: string;
  filters?: Record<string, unknown>;
  confidence: number;
}

async function refineWithModel(message: string, candidateSymbols: string[]): Promise<ModelClassification | null> {
  try {
    const config = await ModelRegistry.get('intent_classification');
    const hint = candidateSymbols.length > 0
      ? `\n\n(A pre-scan found these possible ticker/name matches — confirm whether the message is really about them, or if it's a false-positive word match: ${candidateSymbols.join(', ')})`
      : '';

    const { content } = await LLMClient.chat(
      [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: `${message}${hint}` },
      ],
      config
    );

    const parsed = JSON.parse(content.trim().replace(/^```json\s*|\s*```$/g, ''));
    if (!VALID_INTENTS.includes(parsed.intent)) return null;

    return {
      intent: parsed.intent,
      symbols: Array.isArray(parsed.symbols) ? parsed.symbols.filter((s: unknown) => typeof s === 'string') : [],
      sector: typeof parsed.sector === 'string' ? parsed.sector : undefined,
      filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : undefined,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    };
  } catch {
    return null; // fail open to the heuristic result — never block the pipeline on the classifier
  }
}

// Small, deliberately incomplete alias table for well-known companies whose common name
// shares no substring with their registered legal name ("Google" → Alphabet, "Facebook" →
// Meta), or whose common name's naive uppercase-plus-suffix guess collides with a real but
// unrelated ticker ("Vedanta" → naively "VEDANTA.NS", which is a real row in market_assets
// but a data-quality mismatch — that row's actual company is "Grasim Industries", not
// Vedanta; the real Vedanta Ltd. is listed as VEDL.NS/VEDL.BO). String matching alone can
// never catch either case. Still validated against the real universe below before being
// trusted, same as every other proposed symbol; an alias to a ticker that isn't actually in
// StockOS's universe silently falls through rather than fabricating a match. Extend this
// list as real misses turn up — a curated table is the honest tool for genuine
// renames/nicknames/collisions; string-matching tricks can't substitute for it.
const SYMBOL_ALIASES: Record<string, string> = {
  google: 'GOOG',
  alphabet: 'GOOG',
  facebook: 'META',
  vedanta: 'VEDL.NS',
};

/** Resolves model-proposed symbol text (ticker or company name) against the real universe —
 * the classifier's own output is never trusted blindly, same discipline as everywhere else. */
function resolveProposedSymbols(proposed: string[]): string[] {
  const lookup = buildSymbolLookup();
  const known = knownSymbols();
  const resolved: string[] = [];

  for (const raw of proposed) {
    const lower = raw.toLowerCase().trim();
    if (!lower) continue;

    // Checked before the naive ticker-guess below on purpose: a curated alias is a human
    // judgment call about what the text actually means, so it should win over an automatic
    // uppercase-plus-suffix guess that happens to collide with a real but unrelated ticker.
    // The model routinely "helps" by proposing a symbol already suffixed ("VEDANTA.NS")
    // rather than the bare name it was actually given ("Vedanta") despite being asked for
    // the text "as written" — stripping a trailing .ns/.bo before the alias lookup (only)
    // means the alias still matches either way, without changing how the bare-name form is
    // used everywhere else below.
    const bareLower = lower.replace(/\.(ns|bo)$/, '');
    const alias = SYMBOL_ALIASES[bareLower];
    if (alias && known.has(alias)) { resolved.push(alias); continue; }

    const upper = normalizeStorageSymbol(raw);
    if (known.has(upper)) { resolved.push(upper); continue; }

    let match = lookup.find(e => e.matchText === lower);

    // Prefix match: people say "Alkyl Amines", the registered name is "Alkyl Amines
    // Chemicals Ltd." — accepted only when the prefix is unambiguous (matches exactly one
    // *company name* across the whole universe). A length floor alone would either block
    // short-but-unique names ("Apple", "Tesla" — both 5 chars) or, if raised to cover them,
    // risk a short *ambiguous* fragment ("Tata" prefixes several distinct Tata Group
    // companies) grabbing an arbitrary one; checking uniqueness instead handles both
    // correctly regardless of length. The boundary after the prefix is any non-alphanumeric
    // character, not just a space — "Tesla, Inc." needs the comma to count as a boundary too.
    // Uniqueness is judged by matchText (the company name), not storageSymbol: the same
    // company cross-listed as both `.NS` and `.BO` is one match, not two ambiguous ones.
    if (!match && lower.length >= 3) {
      const escapedLower = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prefixRe = new RegExp(`^${escapedLower}[^a-z0-9]`, 'i');
      const prefixMatches = lookup.filter(e => e.kind === 'name' && prefixRe.test(e.matchText));
      const distinctNames = new Set(prefixMatches.map(e => e.matchText));
      if (distinctNames.size === 1) match = prefixMatches[0];
    }

    if (match) resolved.push(match.storageSymbol);
  }
  return Array.from(new Set(resolved));
}

/**
 * Deterministic pre-pass always runs first (fast, free, works without an API key). When
 * OPENROUTER_API_KEY is configured, a cheap model call confirms or corrects it — the heuristic
 * alone is fast but brittle against phrasing it wasn't written for (see the "ARE" ticker vs.
 * "how are my portfolios doing" collision this caught in testing). Any model-proposed symbol is
 * re-validated against SymbolUniverseManager before being trusted, same as every other part of
 * this pipeline never trusts the LLM's own recall.
 */
const SYMBOL_SCOPED_INTENTS = new Set<Intent>([
  'compare', 'stock_research', 'dividend_analysis', 'technical_analysis', 'etf_analysis', 'news_analysis', 'investment_thesis',
]);
const SECTOR_SCOPED_INTENTS = new Set<Intent>(['sector_analysis', 'news_analysis']);

export async function classifyIntent(message: string, focus: ConversationFocus): Promise<ClassifiedIntent> {
  const heuristic = heuristicClassify(message, focus);

  const modelResult = await refineWithModel(message, heuristic.entities.symbols);
  if (!modelResult) return heuristic;

  const resolvedSymbols = resolveProposedSymbols(modelResult.symbols);
  const symbols = SYMBOL_SCOPED_INTENTS.has(modelResult.intent)
    ? (resolvedSymbols.length > 0 ? resolvedSymbols : heuristic.entities.symbols)
    : [];

  const entities: ClassifiedIntent['entities'] = { symbols };

  if (SECTOR_SCOPED_INTENTS.has(modelResult.intent)) {
    const sector = (modelResult.sector && resolveSectorName(modelResult.sector)) || heuristic.entities.sector;
    if (sector) entities.sector = sector;
  }

  if (modelResult.intent === 'screener') {
    const { filters } = resolveScreenerFilters(modelResult.filters || {});
    if (Object.keys(filters).length > 0) entities.filters = filters;
  }

  return {
    intent: modelResult.intent,
    confidence: modelResult.confidence,
    entities,
  };
}

export const IntentClassifier = { classifyIntent };
