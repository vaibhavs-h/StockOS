import { ProvenancedField, StructuredContext } from '../types';
import { parseMoneyOrNumber } from './ArithmeticPrimitives';

// Narrow, labeled fallback — not the primary arithmetic-correctness mechanism. Once
// DerivedFactsBuilder has put the correct number in context, the existing `checkNumbers`
// grounding check already flags a wrong one, since it won't match anything in the grounded
// pool. What that generic pool-membership check *can't* catch: a stated number that
// coincidentally matches some unrelated grounded value (a PE ratio, a different symbol's
// figure) while still being the wrong answer to *this* specific claim. This module does the
// keyword-scoped, per-claim comparison that closes that gap — regex/keyword-window matching
// on purpose, per the V2 plan's explicit direction to keep it a narrow fallback rather than
// the long-term foundation.

interface ClaimSpec {
  keywords: RegExp;
  factSuffix: string; // resolved against context.fields by exact name (with optional "SYMBOL." prefix)
  label: string;
  toleranceAbs: number; // tighter than checkNumbers' 1% relative tolerance — we know the exact expected value here
}

const PERCENT_CLAIM_RE = /([\-+]?\d+(?:\.\d+)?)\s*%/g;

const CLAIMS: ClaimSpec[] = [
  { keywords: /\b(today|day|daily|up|down|gained|lost|rose|fell|climbed|dropped)\b/i, factSuffix: 'daily_change_percent', label: 'day change %', toleranceAbs: 0.15 },
  { keywords: /\b(return|overall|portfolio|gain|loss)\b/i, factSuffix: 'portfolio_return_percent', label: 'portfolio return %', toleranceAbs: 0.15 },
];

/** Natural phrasing puts the context word on either side of the number — "up 4.2% today"
 * has it after, "a 4.2% daily gain" has it before — so both windows need checking. */
function windowAround(text: string, index: number, matchLength: number, size = 40): string {
  const before = text.slice(Math.max(0, index - size), index);
  const after = text.slice(index + matchLength, index + matchLength + size);
  return `${before} ${after}`;
}

/** Resolves a fact field for the entity a percentage claim is most likely about — the single
 * entity in context for stock_research/portfolio_analysis, or (best-effort) the first
 * per-symbol-prefixed match for compare_stocks, since prose rarely disambiguates which side
 * of a comparison a bare "%" refers to as precisely as the citation-based checks already do. */
function resolveFact(context: StructuredContext, suffix: string): ProvenancedField | undefined {
  const exact = context.fields.find(f => f.field === suffix);
  if (exact) return exact;
  return context.fields.find(f => f.field.endsWith(`.${suffix}`));
}

export function checkFinancialConsistency(response: string, context: StructuredContext): string[] {
  const issues: string[] = [];
  let match: RegExpExecArray | null;

  PERCENT_CLAIM_RE.lastIndex = 0;
  while ((match = PERCENT_CLAIM_RE.exec(response)) !== null) {
    const stated = parseFloat(match[1]);
    if (Number.isNaN(stated)) continue;
    const window = windowAround(response, match.index, match[0].length);

    for (const claim of CLAIMS) {
      if (!claim.keywords.test(window)) continue;
      const fact = resolveFact(context, claim.factSuffix);
      if (!fact) continue;
      const expected = parseMoneyOrNumber(fact.value);
      if (expected === null) continue;

      // Compare magnitude, not signed value — prose routinely conveys direction through a
      // word ("fell 0.6%") rather than a literal minus sign, same convention checkNumbers
      // already uses for exactly this reason.
      if (Math.abs(Math.abs(stated) - Math.abs(expected)) > claim.toleranceAbs) {
        issues.push(`Financial consistency: response states ${claim.label} ≈ ${stated}%, but the retrieved/computed data gives ${expected}%.`);
      }
      break; // one claim label per matched number
    }
  }

  return issues;
}
