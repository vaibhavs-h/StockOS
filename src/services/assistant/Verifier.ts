import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { ProvenancedField, StructuredContext, VerificationResult } from './types';
import { checkFinancialConsistency } from './verification/FinancialConsistencyChecks';

// Tier 1 — always runs, deterministic, no model call (§07).
// MVP scope defers Tier 2 (the conditional LLM-based check) per the rollout roadmap (§18) —
// tier2 always reports 'not_run' here; the field exists so ConfidenceScorer and the schema
// don't need to change when Tier 2 ships.

const SAFE_TOKEN_RE = /\b(NSE|BSE|NYSE|NASDAQ|SEC|GDP|CAGR|YTD|QOQ|YOY|TTM|IST|UTC|GMT|AM|PM|USD|INR|FY|CEO|IPO|ROE|ROI|ROA|ROCE|PE|EPS|ATH|ATL|ETF|MF|AMC|Q1|Q2|Q3|Q4|NS|BO|NIFTY|SENSEX|VIX|DOW|LTD|LIMITED|INC|CORP|PLC|CO|LLC|US|USA)\b/;

let symbolSet: Set<string> | null = null;
function knownSymbols(): Set<string> {
  if (symbolSet) return symbolSet;
  symbolSet = new Set<string>();
  SymbolUniverseManager.getUniqueIndianEquities().forEach(a => symbolSet!.add(normalizeStorageSymbol(a.s).replace('.NS', '').replace('.BO', '')));
  SymbolUniverseManager.getUniqueUsEquities().forEach(a => symbolSet!.add(normalizeStorageSymbol(a.s)));
  return symbolSet;
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d[\d,]*\.?\d*/g) || [];
  return matches
    .map(m => parseFloat(m.replace(/,/g, '')))
    .filter(n => !Number.isNaN(n));
}

function collectGroundedNumbers(context: StructuredContext): Set<number> {
  const grounded = new Set<number>();
  for (const field of context.fields) {
    if (typeof field.value === 'number') grounded.add(round2(field.value));
    if (typeof field.value === 'string') {
      for (const n of extractNumbers(field.value)) grounded.add(round2(n));
    }
  }
  return grounded;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isNumberGrounded(n: number, grounded: Set<number>): boolean {
  if (Math.abs(n) < 20 && Number.isInteger(n)) return true; // small counting numbers ("3 holdings") — not a grounding claim
  if (n >= 1900 && n <= 2100 && Number.isInteger(n)) return true; // years
  const rounded = round2(n);
  for (const g of grounded) {
    // Compare by magnitude, not sign — prose routinely drops a stored negative's sign
    // ("down 0.56%" for a field whose value is -0.56), so signed-only comparison false-flags it.
    if (Math.abs(Math.abs(g) - Math.abs(rounded)) <= Math.max(0.01, Math.abs(g) * 0.01)) return true;
    // A ratio field (return_on_equity, etc.) is often stored as a raw fraction (0.3401) but
    // naturally expressed as a percentage for the reader ("34.01%") — same fact, scaled by
    // 100, not a different claim — so check that relationship too before flagging it.
    const scaled = Math.abs(g) * 100;
    if (Math.abs(scaled - Math.abs(rounded)) <= Math.max(0.01, scaled * 0.01)) return true;
  }
  return false;
}

// Strips clock-time and calendar-date substrings before number extraction — the model
// routinely echoes a field's `asOf` timestamp in its own words ("updated 02:36 IST",
// "as of Aug 7"), and the digits inside those aren't a factual claim to verify.
// Models routinely reach for typographic dash variants (non-breaking hyphen U+2011, en dash
// U+2013, minus sign U+2212, ...) instead of a plain ASCII "-", especially in markdown tables
// ("52‑week high"). Every downstream regex here is written against a literal "-", so without
// this normalization those variants silently bypass the idiom-strip and get flagged as
// unverified numbers; it also protects extractNumbers' own negative-sign detection.
function normalizeDashes(text: string): string {
  return text.replace(/[‐‑‒–—−]/g, '-');
}

function stripTimeAndDateNoise(text: string): string {
  return normalizeDashes(text)
    // Full ISO timestamps, including a fractional-seconds tail and timezone offset the
    // model sometimes echoes verbatim from a field's `asOf` value ("...T10:31:49.41+00:00")
    // — every digit in that tail is a formatting artifact, not a claim to verify.
    .replace(/\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(AM|PM|IST|UTC|GMT)?\b/gi, ' ')
    // ContextBuilder's own relative-time citation format ("29d ago", "3m ago", "1h ago") —
    // the same "echoed asOf value" problem as the ISO/clock-time cases above, just in the
    // short form formatAsOf() produces instead of a raw timestamp.
    .replace(/\b\d+\s*[smhd]\s+ago\b/gi, ' ')
    // Standard financial phrases ("52-week high", "200-day average", "24-hour volume") —
    // the number is part of a fixed idiom, not a claim about this stock. Hyphen or space
    // both need covering: prose tends to hyphenate ("52-week high") but markdown tables the
    // model favors for compare_stocks respond with the space form ("**52 Week High**"), and
    // without both this idiom-strip misses the latter and flags it as an unverified number.
    .replace(/\b\d+[-\s](week|day|hour|month|year)s?\b/gi, ' ')
    // Index names that carry a number as part of the name itself ("Nifty 50", "S&P 500") —
    // the number identifies the index, it isn't a level being reported.
    .replace(/\b(nifty|s&p|sp)\s?\d+\b/gi, ' ')
    // Rounded magnitude restatements ("$4.5 trillion" for a stored 4,498,802,081,792) — a
    // deliberately-rounded human-friendly summary, not a literal figure meant to exactly
    // match the raw stored value, so it was never going to pass a literal-number check
    // either way; not worth a full unit-scale-aware conversion to verify precisely.
    .replace(/\b\d+(\.\d+)?\s*(trillion|billion|million|thousand|crore|lakh)s?\b/gi, ' ');
}

function checkNumbers(response: string, context: StructuredContext): string[] {
  const grounded = collectGroundedNumbers(context);
  const responseNumbers = extractNumbers(stripTimeAndDateNoise(response));
  const issues: string[] = [];
  for (const n of responseNumbers) {
    if (!isNumberGrounded(n, grounded)) issues.push(`Unverified number in response: ${n}`);
  }
  return issues;
}

/** Words drawn from any retrieved `company_name` or news-headline field (e.g. "TATA" out of
 * "TATA CONSULTANCY SERVICES LTD.", or "SBI" quoted from a news headline) — Indian equities are
 * frequently stored in this all-caps legal-name format, and news headlines routinely use an
 * informal abbreviation that isn't the canonical ticker (SBI vs SBIN), or mention several other
 * companies entirely (a "stocks to watch" roundup headline). Either way, a short word the model
 * is citing verbatim from grounded, retrieved text is not the model claiming an unrecognized
 * ticker of its own. Covers every news field shape this pipeline produces: `recent_news_N`
 * (stock_research/compare_stocks/etf_analysis), `news_item_N` (news_analysis/investment_thesis
 * symbol path), and `sector_news_N` (news_analysis sector path). */
function nameWordsFromContext(context: StructuredContext): Set<string> {
  const words = new Set<string>();
  const NEWS_FIELD_RE = /^(.*\.)?(recent_news|news_item|sector_news)_\d+$/;
  for (const f of context.fields) {
    const isNameOrNews = f.field === 'company_name' || f.field.endsWith('.company_name') || NEWS_FIELD_RE.test(f.field);
    if (!isNameOrNews) continue;
    String(f.value).toUpperCase().match(/[A-Z]+/g)?.forEach(w => words.add(w));
  }
  return words;
}

function checkTickers(response: string, context: StructuredContext): string[] {
  const known = knownSymbols();
  const entitySet = new Set(context.entities.symbols.map(s => s.replace('.NS', '').replace('.BO', '')));
  const nameWords = nameWordsFromContext(context);
  const candidates = response.match(/\b[A-Z]{2,10}\b/g) || [];
  const issues: string[] = [];
  for (const token of new Set(candidates)) {
    if (SAFE_TOKEN_RE.test(token)) continue;
    if (entitySet.has(token) || known.has(token) || nameWords.has(token)) continue;
    // Only flag tokens that look like they're being used as a ticker (all-caps, 2-6 chars is the common range)
    if (token.length >= 2 && token.length <= 6) {
      issues.push(`Unrecognized ticker-like token: ${token}`);
    }
  }
  return issues.slice(0, 5); // avoid noisy walls of false positives from acronyms we didn't stoplist
}

// A source token, per our own naming convention (tableForSymbol.ts / ProvenancedField.source):
// "market_assets", "us_market_assets", "news", "yahoo_finance_live", or "computed:<method>".
// Only tokens *shaped* like one of these are worth checking — this deliberately ignores
// ordinary prose parentheticals ("(e.g., ...)") and citations by field name (which the
// system prompt explicitly permits), so it only fires on a plausible-but-wrong source name.
// computed:<methodName> allows digits — several new methods (priceVsMa50, pctFrom52wHigh)
// have them, and a letters-only pattern would just silently skip validating those citations
// (SOURCE_SHAPED_RE gates whether a token is checked at all) rather than misflag them, but
// there's no reason to leave that class of citation unchecked.
const SOURCE_SHAPED_RE = /^([a-z_]+_assets|news|yahoo_finance_live|computed:[a-zA-Z0-9]+)$/;

function checkCitations(response: string, context: StructuredContext): string[] {
  const knownSources = new Set(context.fields.map(f => f.source));
  const issues: string[] = [];
  const parenGroups = response.match(/\(([^()]+)\)/g) || [];

  for (const group of parenGroups) {
    const tokens = group.slice(1, -1).split(',').map(t => t.trim());
    for (const token of tokens) {
      if (!SOURCE_SHAPED_RE.test(token)) continue;
      if (!knownSources.has(token)) issues.push(`Citation references an unrecognized source: ${token}`);
    }
  }
  return issues;
}

function checkQuestionCoverage(question: string, response: string): string[] {
  const clauses = question
    .split(/\?|\band\b/i)
    .map(c => c.trim())
    .filter(c => c.length > 8);
  if (clauses.length <= 1) return [];

  const responseLower = response.toLowerCase();
  const issues: string[] = [];
  for (const clause of clauses) {
    const keywords = clause.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const hasOverlap = keywords.some(k => responseLower.includes(k));
    if (!hasOverlap && keywords.length > 0) {
      issues.push(`Response may not address: "${clause.trim()}"`);
    }
  }
  return issues;
}

/** Catches a response that isn't actually complete prose — cut off mid-sentence (a slow
 * provider call or a stream that ended early) or a raw safety-classifier artifact leaking
 * through as the answer (seen from some providers on adversarial prompts) instead of a real
 * reply. Neither of those has a citation or a number to check against, so none of the checks
 * above would ever catch them — this is a narrow, final well-formedness net, not a content
 * check. Exported standalone (like `checkFinancialConsistency`) so the orchestrator can also
 * run it as a preliminary gate before Tier 1, to decide whether the bounded retry applies. */
// Some providers (seen from a free-tier fallback under load) emit a visible "thinking out
// loud" preamble — including, in one observed case, a near-verbatim recitation of this
// system's own prompt instructions — before ever reaching a real answer, and can burn the
// entire token budget doing it, leaving nothing but the preamble. None of that is meant for
// the end user. Matched only at the very start of the response, case-insensitively.
const REASONING_LEAK_RE = /^(here'?s (a |my )?(thinking|reasoning)|let me (think|analyze|work through)|step 1[:.]|<think(ing)?>|i need to (analyze|first)|analyz(e|ing) (the |user )?(input|question|context))/i;

export function checkResponseWellFormed(response: string): string[] {
  const trimmed = response.trim();
  if (trimmed.length === 0) return ['Response is empty.'];
  const issues: string[] = [];

  const opens = (trimmed.match(/[({]/g) || []).length;
  const closes = (trimmed.match(/[)}]/g) || []).length;
  if (opens !== closes) {
    issues.push('Response appears truncated: unbalanced brackets/parentheses.');
  }

  // A complete answer ends in sentence-terminal punctuation, a closing bracket/quote, or a
  // markdown table/list character — not mid-word. Applied regardless of length: a long
  // response cut off mid-sentence (seen from a verbose provider that exhausted its token
  // budget on a visible reasoning preamble before reaching the real answer) is exactly the
  // failure this exists to catch, not just short ones.
  const lastChar = trimmed.slice(-1);
  if (!/[.!?"'\)\]}|`]/.test(lastChar)) {
    issues.push('Response appears truncated: ends abruptly without terminal punctuation.');
  }

  if (REASONING_LEAK_RE.test(trimmed)) {
    issues.push('Response appears to be a visible reasoning/instruction-recitation preamble, not a real answer.');
  }

  return issues;
}

export class Verifier {
  static tier1(question: string, response: string, context: StructuredContext): VerificationResult {
    const issues = [
      ...checkNumbers(response, context),
      ...checkTickers(response, context),
      ...checkCitations(response, context),
      ...checkQuestionCoverage(question, response),
      ...checkFinancialConsistency(response, context),
      ...checkResponseWellFormed(response),
    ];

    return {
      tier1: issues.length > 0 ? 'flagged' : 'pass',
      tier1Issues: issues,
      tier2: 'not_run',
    };
  }
}
