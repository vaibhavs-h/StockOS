import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { ProvenancedField, ResolvedEntities, StructuredContext, VerificationResult } from './types';
import { checkFinancialConsistency } from './verification/FinancialConsistencyChecks';

// Tier 1 — always runs, deterministic, no model call (§07).
// MVP scope defers Tier 2 (the conditional LLM-based check) per the rollout roadmap (§18) —
// tier2 always reports 'not_run' here; the field exists so ConfidenceScorer and the schema
// don't need to change when Tier 2 ships.

const SAFE_TOKEN_RE = /\b(NSE|BSE|NYSE|NASDAQ|SEC|GDP|CAGR|YTD|QOQ|YOY|IST|UTC|GMT|AM|PM|USD|INR|FY|CEO|IPO|ROE|ROI|ROA|ROCE|PE|EPS|ATH|ATL|ETF|MF|AMC|Q1|Q2|Q3|Q4|NS|BO|NIFTY|SENSEX|VIX|DOW|LTD|LIMITED|INC|CORP|PLC|CO|LLC|US|USA)\b/;

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
  }
  return false;
}

// Strips clock-time and calendar-date substrings before number extraction — the model
// routinely echoes a field's `asOf` timestamp in its own words ("updated 02:36 IST",
// "as of Aug 7"), and the digits inside those aren't a factual claim to verify.
function stripTimeAndDateNoise(text: string): string {
  return text
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
    // the number is part of a fixed idiom, not a claim about this stock.
    .replace(/\b\d+-(week|day|hour|month|year)s?\b/gi, ' ')
    // Index names that carry a number as part of the name itself ("Nifty 50", "S&P 500") —
    // the number identifies the index, it isn't a level being reported.
    .replace(/\b(nifty|s&p|sp)\s?\d+\b/gi, ' ');
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

function checkTickers(response: string, entities: ResolvedEntities): string[] {
  const known = knownSymbols();
  const entitySet = new Set(entities.symbols.map(s => s.replace('.NS', '').replace('.BO', '')));
  const candidates = response.match(/\b[A-Z]{2,10}\b/g) || [];
  const issues: string[] = [];
  for (const token of new Set(candidates)) {
    if (SAFE_TOKEN_RE.test(token)) continue;
    if (entitySet.has(token) || known.has(token)) continue;
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
const SOURCE_SHAPED_RE = /^([a-z_]+_assets|news|yahoo_finance_live|computed:[a-zA-Z]+)$/;

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

export class Verifier {
  static tier1(question: string, response: string, context: StructuredContext): VerificationResult {
    const issues = [
      ...checkNumbers(response, context),
      ...checkTickers(response, context.entities),
      ...checkCitations(response, context),
      ...checkQuestionCoverage(question, response),
      ...checkFinancialConsistency(response, context),
    ];

    return {
      tier1: issues.length > 0 ? 'flagged' : 'pass',
      tier1Issues: issues,
      tier2: 'not_run',
    };
  }
}
