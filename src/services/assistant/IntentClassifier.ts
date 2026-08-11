import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { ClassifiedIntent, ConversationFocus, Intent } from './types';
import { ModelRegistry } from './ModelRegistry';
import { LLMClient } from './LLMClient';

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

const PORTFOLIO_RE = /\bmy\s+(?:\w+\s+){0,3}(portfolio|portfolios|holdings|investments)\b|\bour\s+(?:\w+\s+){0,3}(portfolio|portfolios|holdings|investments)\b|portfolio (health|risk|diversification|allocation)|how\s+(?:is|are)\s+(?:my|our)\s+.{0,30}?\bdoing\b|sector exposure/i;
const COMPARE_RE = /\bcompare\b|\bvs\.?\b|\bversus\b/i;
const MARKET_RE = /\b(market|nifty|sensex|banknifty|bank nifty|dow|nasdaq|s&p|vix|indices)\b/i;

function heuristicClassify(message: string, focus: ConversationFocus): ClassifiedIntent {
  const symbols = extractSymbols(message);
  const hasCompareKeyword = COMPARE_RE.test(message);

  if (hasCompareKeyword && (symbols.length >= 2 || (symbols.length >= 1 && focus.last_symbols.length > 0))) {
    const compareSymbols = symbols.length >= 2 ? symbols : Array.from(new Set([...focus.last_symbols.slice(0, 1), ...symbols]));
    return { intent: 'compare', confidence: 0.9, entities: { symbols: compareSymbols } };
  }

  if (PORTFOLIO_RE.test(message)) {
    return { intent: 'portfolio_analysis', confidence: 0.85, entities: { symbols: [] } };
  }

  if (symbols.length > 0) {
    return { intent: 'stock_research', confidence: symbols.length === 1 ? 0.9 : 0.7, entities: { symbols } };
  }

  if (MARKET_RE.test(message)) {
    return { intent: 'market_overview', confidence: 0.8, entities: { symbols: [] } };
  }

  return { intent: 'general_finance', confidence: 0.5, entities: { symbols: [] } };
}

const VALID_INTENTS: Intent[] = ['stock_research', 'portfolio_analysis', 'compare', 'market_overview', 'general_finance'];

const CLASSIFIER_SYSTEM_PROMPT = `You classify a user's message to a financial research assistant into exactly one intent, and extract any stock symbols mentioned.

Intents:
- stock_research: asking about one specific named company/stock.
- compare: asking to compare two or more specific named companies/stocks.
- portfolio_analysis: asking about the user's OWN portfolio, holdings, or investments in aggregate — not a specific stock. Phrases like "my portfolio", "my holdings", "how am I doing", "my overall equity" all mean this, even if a word in the sentence happens to also be a stock ticker.
- market_overview: asking about overall market/index levels (Nifty, Sensex, Dow, S&P, etc), not a specific company.
- general_finance: an educational/conceptual question, or anything that doesn't fit the above.

Rules:
- A short common English word ("are", "it", "on", "all", "go", "so", "for") is almost never meant as a stock ticker even if it happens to match one — only extract it as a symbol if the sentence is clearly asking about that specific company, not just using the word normally.
- If the user is asking about their own portfolio/holdings in aggregate, that is portfolio_analysis even if the sentence contains a word that coincidentally matches a ticker.
- Only extract symbols you are confident are genuinely being asked about.

Respond with ONLY a JSON object, no other text: {"intent": "<one of the 5 above>", "symbols": ["<company name or ticker as written, if any>"], "confidence": <0-1>}`;

interface ModelClassification {
  intent: Intent;
  symbols: string[];
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
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    };
  } catch {
    return null; // fail open to the heuristic result — never block the pipeline on the classifier
  }
}

// Small, deliberately incomplete alias table for well-known companies whose common name
// shares no substring with their registered legal name ("Google" → Alphabet, "Facebook" →
// Meta) — string matching alone can never catch these. Still validated against the real
// universe below before being trusted, same as every other proposed symbol; an alias to a
// ticker that isn't actually in StockOS's universe silently falls through rather than
// fabricating a match. Extend this list as real misses turn up — a curated table is the
// honest tool for genuine renames/nicknames; string-matching tricks can't substitute for it.
const SYMBOL_ALIASES: Record<string, string> = {
  google: 'GOOG',
  alphabet: 'GOOG',
  facebook: 'META',
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

    const upper = normalizeStorageSymbol(raw);
    if (known.has(upper)) { resolved.push(upper); continue; }

    const alias = SYMBOL_ALIASES[lower];
    if (alias && known.has(alias)) { resolved.push(alias); continue; }

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
export async function classifyIntent(message: string, focus: ConversationFocus): Promise<ClassifiedIntent> {
  const heuristic = heuristicClassify(message, focus);

  const modelResult = await refineWithModel(message, heuristic.entities.symbols);
  if (!modelResult) return heuristic;

  const resolvedSymbols = resolveProposedSymbols(modelResult.symbols);
  const symbols = modelResult.intent === 'compare' || modelResult.intent === 'stock_research'
    ? (resolvedSymbols.length > 0 ? resolvedSymbols : heuristic.entities.symbols)
    : [];

  return {
    intent: modelResult.intent,
    confidence: modelResult.confidence,
    entities: { symbols },
  };
}

export const IntentClassifier = { classifyIntent };
