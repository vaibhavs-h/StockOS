import { Capability, ConfidenceBreakdown, ConfidenceResult, StructuredContext, VerificationResult } from './types';

// §07 — numeric score the HIGH/MEDIUM/LOW bucket is derived from. Weights are a starting
// point to tune empirically post-launch, not a final formula (per the architecture doc's
// critique of self-reported LLM confidence).

// How old a field can be before it starts dragging confidence down — a staleness SLA for
// scoring, deliberately separate from AssistantCache's TTLs (which govern re-fetching, not
// "is this too old to trust"). A stock quote and a news headline age at very different rates:
// a quote an hour old is going stale, a news item three days old is still the latest news.
function estimateStalenessSlaMs(fieldName: string): number {
  if (fieldName.startsWith('quote_') || fieldName.startsWith('index_')) return 10 * 60 * 1000; // 10 min
  if (fieldName.startsWith('holdings') || fieldName.startsWith('total_')) return 15 * 60 * 1000; // 15 min
  if (fieldName.startsWith('recent_news')) return 72 * 60 * 60 * 1000; // 72h — news stays relevant for days
  return 24 * 60 * 60 * 1000; // fundamentals / computed analytics
}

function freshnessScore(context: StructuredContext): { score: number; oldestFieldAgeS: number | null; newestFieldAgeS: number | null } {
  if (context.fields.length === 0) return { score: 1, oldestFieldAgeS: null, newestFieldAgeS: null };

  const now = Date.now();
  let totalScore = 0;
  let oldest = 0;
  let newest = Infinity;

  for (const field of context.fields) {
    const ageMs = Math.max(0, now - new Date(field.asOf).getTime());
    const ageS = ageMs / 1000;
    oldest = Math.max(oldest, ageS);
    newest = Math.min(newest, ageS);
    const ttl = estimateStalenessSlaMs(field.field);
    totalScore += Math.max(0, Math.min(1, 1 - ageMs / (2 * ttl)));
  }

  return {
    score: totalScore / context.fields.length,
    oldestFieldAgeS: Math.round(oldest),
    newestFieldAgeS: Number.isFinite(newest) ? Math.round(newest) : null,
  };
}

export class ConfidenceScorer {
  static score(
    context: StructuredContext,
    verification: VerificationResult,
    classificationConfidence: number,
    requestedFieldCounts: { required: number; optional: number }
  ): ConfidenceResult {
    // Phase 5 (V2): callers pass the *resolved* counts — required fields from the tool
    // (never learned) plus the budget-capped, priority-ordered optional-field count from
    // RetrievalSpecService (learned) — rather than reading a static list off the tool
    // directly, so a growing/reprioritized optional-field set is reflected here for free.
    const requested = requestedFieldCounts.required + requestedFieldCounts.optional;
    const present = requested === 0 ? 0 : context.fields.length;
    const dataCompleteness = {
      present,
      requested,
      ratio: requested === 0 ? 1 : Math.min(1, present / requested),
    };

    const freshness = freshnessScore(context);
    // Phase 3 (V2): a Tier 2 fail is a semantic/reasoning failure — the model actually
    // contradicted or misread the data — which is worse than a Tier 1 heuristic flag
    // (a plausible-but-unconfirmed number or ticker), so it scores lower regardless of
    // what Tier 1 found.
    const verificationScore = verification.tier2 === 'fail' ? 0.2 : verification.tier1 === 'pass' ? 1 : 0.5;

    const breakdown: ConfidenceBreakdown = {
      dataCompleteness,
      freshness,
      verification: { tier1: verification.tier1, tier2: verification.tier2, score: verificationScore },
      classificationConfidence,
    };

    let rawScore = Math.round(
      40 * dataCompleteness.ratio +
      25 * freshness.score +
      25 * verificationScore +
      10 * classificationConfidence
    );

    // general_finance has no StockOS data to ground on by design — never let it read as HIGH.
    if (context.capability === 'general_finance') {
      rawScore = Math.min(rawScore, 79);
    }

    rawScore = Math.max(0, Math.min(100, rawScore));

    return { score: rawScore, level: bucketFor(rawScore), breakdown };
  }

  static forcedLow(_reason: string, _capability: Capability): ConfidenceResult {
    return {
      score: 20,
      level: 'low',
      breakdown: {
        dataCompleteness: { present: 0, requested: 0, ratio: 0 },
        freshness: { score: 0, oldestFieldAgeS: null, newestFieldAgeS: null },
        verification: { tier1: 'pass', tier2: 'not_run', score: 0 },
        classificationConfidence: 0,
      },
    };
  }
}

function bucketFor(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}
