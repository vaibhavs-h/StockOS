import { ModelRegistry } from '../ModelRegistry';
import { ChatMessage, LLMClient } from '../LLMClient';
import { StructuredContext, VerificationResult } from '../types';
import { ContextBuilder } from '../ContextBuilder';
import { withTimeout } from '../withTimeout';

// LLMClient.chat() can itself take up to ~60s worst case (a 30s primary attempt plus a full
// 30s fallback attempt) with no timeout of its own — every other LLM call in this pipeline
// (synthesis, its corrective retry) is bounded by the capability's own policy.timeoutMs via
// withTimeout, but this one wasn't, which matters more than it looks: three of this
// pipeline's capabilities (risk_analysis, portfolio_optimization, investment_thesis) run
// Tier 2 on *every* request via 'always', so an unbounded Tier 2 call directly adds to
// worst-case total request latency for them, not just an occasional 'auto' trigger.
const TIER2_TIMEOUT_MS = 15000;

// Tier 2 — conditional, LLM-based reasoning verification (§ V2 plan, Phase 3). The type
// this returns (`unsupported_claims`, `missing_aspects`, `consistent`) was already
// scaffolded in types.ts's VerificationResult.tier2Detail when Tier 1 shipped — this file
// is what actually fills it in. Gating on whether to call this at all lives in
// ResearchOrchestrator (driven by CapabilityPolicy), not here — this module only knows how
// to run the check once asked.

const TIER2_SYSTEM_PROMPT = `You are a strict reviewer checking a financial assistant's draft answer against the verified data it was given. You are not answering the question yourself — only judging the draft.

Check:
- Did the draft actually answer every part of the user's question?
- Is the draft's reasoning internally consistent (no contradictions within itself)?
- Does the draft contradict anything in the Context, or state something the Context doesn't support?
- Is anything important missing that the Context actually had available?

Respond with ONLY a JSON object, no other text: {"consistent": true|false, "unsupported_claims": ["..."], "missing_aspects": ["..."]}. "consistent" is false if the draft contradicts the Context or states something unsupported by it. Empty arrays are fine and expected for a good answer — don't invent issues to fill them.`;

interface Tier2Judgment {
  consistent: boolean;
  unsupported_claims: string[];
  missing_aspects: string[];
}

export class Tier2Verifier {
  static async run(question: string, context: StructuredContext, response: string): Promise<Pick<VerificationResult, 'tier2' | 'tier2Detail'>> {
    try {
      const config = await ModelRegistry.get('verification_tier2');
      const messages: ChatMessage[] = [
        { role: 'system', content: TIER2_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Context (verified StockOS data, JSON):\n${ContextBuilder.toPromptBlock(context)}\n\nUser question: ${question}\n\nDraft answer to review:\n${response}`,
        },
      ];

      const { content } = await withTimeout(LLMClient.chat(messages, config), TIER2_TIMEOUT_MS, 'Tier 2 verification');
      const parsed = JSON.parse(content.trim().replace(/^```json\s*|\s*```$/g, '')) as Partial<Tier2Judgment>;

      const detail: Tier2Judgment = {
        consistent: parsed.consistent !== false, // default to true (pass) on ambiguous/missing field, never fail-open the other way
        unsupported_claims: Array.isArray(parsed.unsupported_claims) ? parsed.unsupported_claims.filter(c => typeof c === 'string') : [],
        missing_aspects: Array.isArray(parsed.missing_aspects) ? parsed.missing_aspects.filter(c => typeof c === 'string') : [],
      };

      const passed = detail.consistent && detail.unsupported_claims.length === 0;
      return { tier2: passed ? 'pass' : 'fail', tier2Detail: detail };
    } catch {
      // A Tier 2 failure-to-run is not the same as a Tier 2 fail verdict — never block or
      // downgrade confidence just because the check itself couldn't execute.
      return { tier2: 'not_run' };
    }
  }
}
