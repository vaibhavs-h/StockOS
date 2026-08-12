import { randomUUID } from 'crypto';
import { supabase } from '../../lib/supabase';
import { assistantCache } from './AssistantCache';
import { BurstSyncService } from '../BurstSyncService';
import { CapabilityPolicy } from './CapabilityPolicy';
import { CapabilityResolver } from './CapabilityResolver';
import { ConfidenceScorer } from './ConfidenceScorer';
import { ContextBuilder } from './ContextBuilder';
import { conversationContextCache } from './ConversationContextCache';
import { ConversationMemory } from './ConversationMemory';
import { IntentClassifier } from './IntentClassifier';
import { ModelRegistry } from './ModelRegistry';
import { ChatMessage, LLMClient, LLMNotConfiguredError, TokenUsage } from './LLMClient';
import { PromptLoader } from './PromptLoader';
import { PrioritizedField, RetrievalSpecService } from './RetrievalSpecService';
import { RequestTracer } from './Tracer';
import { registerAssistantTools } from './tools/registerTools';
import { ToolRegistry } from './tools/ToolRegistry';
import { AssistantQueryRequest, AssistantQueryResponse, SubscriptionTier, ToolResult } from './types';
import { checkResponseWellFormed, Verifier } from './Verifier';
import { DerivedFactsBuilder } from './verification/DerivedFactsBuilder';
import { checkFinancialConsistency } from './verification/FinancialConsistencyChecks';
import { Tier2Verifier } from './verification/Tier2Verifier';
import { withTimeout } from './withTimeout';

registerAssistantTools();

// §16 — soft daily caps tied to subscription tier. Deliberately sized (not the old
// placeholder), scaled roughly with what each tier pays: Free 5, Lite 25 (5x), Pro 75 (3x
// Lite). These are per-user ceilings only — the synthesis model itself runs on Groq's free
// tier (llama-3.3-70b-versatile, 1,000 requests/day, shared across the whole platform, not
// per-user) with a free OpenRouter fallback, and both were fully exhausted more than once
// during a single session of manual testing. No per-user cap here changes that shared
// ceiling; it only slows how fast a handful of active users can hit it. Sustaining Pro-tier
// usage at real scale will eventually need a paid Groq/OpenRouter plan.
const DAILY_MESSAGE_CAP: Record<SubscriptionTier, number> = { free: 5, lite: 25, pro: 75 };

async function checkAndIncrementUsage(userId: string, tier: SubscriptionTier): Promise<{ allowed: boolean }> {
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('assistant_usage_ledger')
    .select('requests_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  const cap = DAILY_MESSAGE_CAP[tier] ?? DAILY_MESSAGE_CAP.free;
  if (existing && existing.requests_count >= cap) return { allowed: false };

  await supabase
    .from('assistant_usage_ledger')
    .upsert(
      { user_id: userId, usage_date: today, tier, requests_count: (existing?.requests_count || 0) + 1 },
      { onConflict: 'user_id,usage_date' }
    );

  return { allowed: true };
}

// Adds this turn's token usage onto today's ledger row (§ V2 plan, Phase 6) — makes the
// pre-existing `tokens_used` column (previously always 0) real. Best-effort: a failure here
// never fails the turn, same as the rest of the ledger's read-then-upsert shape above (not
// atomic under concurrency, but that's the existing consistency level, not a new gap).
async function bumpTokenUsage(userId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  const today = new Date().toISOString().split('T')[0];
  try {
    const { data: existing } = await supabase
      .from('assistant_usage_ledger')
      .select('tokens_used')
      .eq('user_id', userId)
      .eq('usage_date', today)
      .maybeSingle();
    await supabase
      .from('assistant_usage_ledger')
      .update({ tokens_used: (existing?.tokens_used || 0) + tokens })
      .eq('user_id', userId)
      .eq('usage_date', today);
  } catch (err) {
    console.error('[ASSISTANT] Failed to record token usage:', (err as Error).message);
  }
}

/**
 * Weighted retrieval learning (Phase 5, V2 plan): drops any `fields` entry whose name is
 * declared optional by the tool but didn't make the priority/budget cut. Required fields,
 * computed fields (a separate array, untouched here), and any field the tool returned
 * that isn't declared optional at all (bonus context like `company_name`) are unaffected —
 * the budget only ever governs the set the learning job is allowed to reprioritize.
 * `SYMBOL.field`-prefixed names (compare_stocks) match against the bare field name.
 */
function applyRetrievalBudget(toolResult: ToolResult, declaredOptionalFields: string[], budgeted: PrioritizedField[]): ToolResult {
  const declaredOptionalSet = new Set(declaredOptionalFields);
  const budgetedSet = new Set(budgeted.map(f => f.field));

  const bareName = (fieldName: string): string => {
    const dot = fieldName.lastIndexOf('.');
    if (dot === -1) return fieldName;
    const candidate = fieldName.slice(dot + 1);
    return declaredOptionalSet.has(candidate) ? candidate : fieldName;
  };

  const fields = toolResult.fields.filter(f => {
    const name = bareName(f.field);
    if (!declaredOptionalSet.has(name)) return true; // required or undeclared bonus field
    return budgetedSet.has(name);
  });

  const presentNames = new Set(fields.map(f => bareName(f.field)));
  const missingOptionalFields = budgeted.map(f => f.field).filter(name => !presentNames.has(name));

  return { ...toolResult, fields, missingOptionalFields };
}

async function persistMessage(conversationId: string, role: 'user' | 'assistant', content: string, extra: Record<string, unknown> = {}) {
  // `trace` is written separately, after the primary insert, and never allowed to fail the
  // insert itself. Until the Phase 6 (V2 plan) migration adding `assistant_messages.trace`
  // is applied to the live DB, including it directly in this insert would make Postgrest
  // reject the entire row (an unknown column fails the whole insert, unlike a missing
  // table on a SELECT, which the rest of the pipeline already guards with try/catch) —
  // i.e. it would silently break persistence for every assistant turn, not just tracing.
  const { trace, ...rest } = extra;
  const { data, error } = await supabase
    .from('assistant_messages')
    .insert({ conversation_id: conversationId, role, content, ...rest })
    .select('id')
    .single();

  if (error) {
    console.error('[ASSISTANT] Failed to persist message:', error.message);
    return undefined as unknown as string;
  }

  const messageId = data?.id as string;
  if (trace !== undefined && messageId) {
    const { error: traceError } = await supabase.from('assistant_messages').update({ trace }).eq('id', messageId);
    if (traceError) console.error('[ASSISTANT] Failed to persist trace (has the Phase 6 migration been applied?):', traceError.message);
  }

  return messageId;
}

export class ResearchOrchestrator {
  static async handleQuery(request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    const startedAt = Date.now();
    const { userId, tier, message, conversationId: requestedConversationId } = request;
    const tracer = new RequestTracer(randomUUID());

    const { conversationId, focus } = await ConversationMemory.resolve(userId, requestedConversationId);
    await persistMessage(conversationId, 'user', message);
    tracer.mark('conversation_resolve');

    const usage = await checkAndIncrementUsage(userId, tier);
    if (!usage.allowed) {
      const content = `You've reached today's message limit for the ${tier} plan. It resets at midnight IST — upgrade your plan for a higher daily limit.`;
      const trace = tracer.finish();
      const messageId = await persistMessage(conversationId, 'assistant', content, {
        intent: null,
        capability: null,
        confidence_score: 0,
        confidence: 'low',
        trace,
      });
      return buildResponse(conversationId, messageId, content, 'general_finance', 'general_finance', ConfidenceScorer.forcedLow('rate_limited', 'general_finance'), [], startedAt, true);
    }

    const substituted = ConversationMemory.substitutePronouns(message, focus);
    const classified = await IntentClassifier.classifyIntent(substituted, focus);
    const capabilities = await CapabilityResolver.resolveCapabilities(classified.intent);
    const capability = capabilities[0];
    const tool = ToolRegistry.get(capability);
    tracer.mark('classification');
    tracer.set('capability', capability);
    tracer.set('intent', classified.intent);

    // Portfolio-flavored intents with no explicit symbol keep the focus stack's entities;
    // same idea for a sector-scoped follow-up that doesn't re-name the sector.
    const entities = {
      ...classified.entities,
      symbols: classified.entities.symbols.length > 0 ? classified.entities.symbols : focus.last_symbols,
      sector: classified.entities.sector ?? focus.last_sector ?? undefined,
    };

    const policy = await CapabilityPolicy.get(capability);
    tracer.set('policy', {
      verificationTier2Policy: policy.verificationTier2Policy,
      burstSyncAllowed: policy.burstSyncAllowed,
      conversationCacheEnabled: policy.conversationCacheEnabled,
      timeoutMs: policy.timeoutMs,
      retrievalBudget: policy.retrievalBudget,
    });

    // Conversation-level retrieval cache (§ V2 plan, Phase 2): memoizes the *assembled*
    // ToolResult per conversation+capability+entity, one level above AssistantCache's own
    // raw-field caching. Can never outlive AssistantCache's freshness guarantee — see
    // ConversationContextCache's TTL table — so this only ever skips redundant
    // orchestration work, never serves data staler than the configured TTLs allow.
    const cacheStatsBefore = assistantCache.getStats();
    const burstStatsBefore = BurstSyncService.getStats();
    let toolResult: ToolResult | null = policy.conversationCacheEnabled
      ? conversationContextCache.get(conversationId, capability, entities)
      : null;
    const conversationCacheHit = toolResult !== null;
    if (!toolResult) {
      toolResult = await tool.execute(entities, userId);
      if (policy.conversationCacheEnabled) {
        conversationContextCache.set(conversationId, capability, entities, toolResult);
      }
    }
    tracer.mark('retrieval');
    tracer.set('conversationCacheHit', conversationCacheHit);
    const cacheStatsAfter = assistantCache.getStats();
    tracer.set('assistantCache', { hits: cacheStatsAfter.hits - cacheStatsBefore.hits, misses: cacheStatsAfter.misses - cacheStatsBefore.misses });
    const burstStatsAfter = BurstSyncService.getStats();
    tracer.set('burstSync', { attempts: burstStatsAfter.attempts - burstStatsBefore.attempts, successes: burstStatsAfter.successes - burstStatsBefore.successes });

    // Non-negotiable trust rule (§07): a missing required field short-circuits before
    // the LLM ever sees the question — no guessing to fill the gap.
    if (toolResult.missingRequiredFields.length > 0) {
      const content = `StockOS doesn't have verified data for that yet (missing: ${toolResult.missingRequiredFields.join(', ')}). I won't estimate numbers I can't confirm from StockOS's own data.`;
      const confidence = ConfidenceScorer.forcedLow('missing_required_fields', capability);
      const trace = tracer.finish();
      const messageId = await persistMessage(conversationId, 'assistant', content, {
        intent: classified.intent,
        capability,
        confidence_score: confidence.score,
        confidence: confidence.level,
        confidence_breakdown: confidence.breakdown,
        provenance_summary: [],
        trace,
      });
      await ConversationMemory.updateFocus(conversationId, { symbols: entities.symbols, portfolioId: entities.portfolioId ?? null, sector: entities.sector ?? null, capability });
      return buildResponse(conversationId, messageId, content, classified.intent, capability, confidence, [], startedAt);
    }

    // Weighted retrieval learning (Phase 5, V2 plan): trim to the budget-capped,
    // priority-ordered optional fields RetrievalSpecService returns — required fields and
    // computed fields (analytics, derived facts) are never affected, only ever the
    // declared-optional set. Fields the tool returned that aren't declared optional at all
    // (e.g. `company_name`) are left alone too — the budget only governs fields the learning
    // job is actually allowed to reprioritize.
    const prioritizedOptional = await RetrievalSpecService.getPrioritizedOptionalFields(capability, policy.retrievalBudget);
    const trimmedToolResult = applyRetrievalBudget(toolResult, tool.optionalFields, prioritizedOptional);

    const context = ContextBuilder.build(classified.intent, capability, entities, trimmedToolResult);
    // Phase 1 (V2): derived facts (day-change %, portfolio return %, ...) computed once,
    // deterministically, and merged in as `computed` fields — the model is handed the
    // correct number rather than asked to work it out, so most arithmetic errors never
    // happen; the existing `checkNumbers` grounding check verifies these for free.
    context.fields.push(...DerivedFactsBuilder.build(context));
    tracer.mark('context_build');

    const { template, taskType } = await PromptLoader.loadActive(capability);
    const modelConfig = await ModelRegistry.get(taskType);
    const promptMessages: ChatMessage[] = [
      { role: 'system', content: template },
      { role: 'user', content: `Context (verified StockOS data, JSON):\n${ContextBuilder.toPromptBlock(context)}\n\nUser question: ${substituted}` },
    ];

    let synthesized: { content: string; modelUsed: string; usage?: TokenUsage };
    const usageTotals: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const addUsage = (u?: TokenUsage) => {
      if (!u) return;
      usageTotals.promptTokens += u.promptTokens;
      usageTotals.completionTokens += u.completionTokens;
      usageTotals.totalTokens += u.totalTokens;
    };
    try {
      synthesized = await withTimeout(LLMClient.chat(promptMessages, modelConfig), policy.timeoutMs, 'LLM synthesis');
      addUsage(synthesized.usage);
    } catch (err) {
      const isNotConfigured = err instanceof LLMNotConfiguredError;
      const content = isNotConfigured
        ? `The assistant's language model isn't configured yet — ${(err as Error).message} In the meantime, here's what StockOS retrieved and verified:\n\n` +
          ContextBuilder.citations(context).map(c => `• ${c.label}: see ${c.source} (updated ${c.asOf})`).join('\n')
        : "The assistant's language model is temporarily unavailable. Please try again in a moment.";

      const confidence = ConfidenceScorer.forcedLow(isNotConfigured ? 'not_configured' : 'model_error', capability);
      tracer.mark('llm_synthesis');
      const trace = tracer.finish((err as Error).message);
      const messageId = await persistMessage(conversationId, 'assistant', content, {
        intent: classified.intent,
        capability,
        confidence_score: confidence.score,
        confidence: confidence.level,
        confidence_breakdown: confidence.breakdown,
        provenance_summary: ContextBuilder.citations(context),
        cache_keys: context.cacheKeys,
        trace,
      });
      return buildResponse(conversationId, messageId, content, classified.intent, capability, confidence, ContextBuilder.citations(context), startedAt);
    }
    tracer.mark('llm_synthesis');
    tracer.set('modelUsed', synthesized.modelUsed);

    // Bounded corrective retry (Phase 1, V2 plan; well-formedness check added after live QA
    // surfaced two real failure shapes — a response truncated mid-sentence, and a raw
    // safety-classifier artifact leaking through as the "answer" — that no arithmetic check
    // would ever catch). Unlike the fuzzier ticker/citation heuristics, both an arithmetic
    // mismatch and a malformed response name something concretely correctable — worth a
    // single retry, never more than one.
    let arithmeticRetried = false;
    const preliminaryIssues = [...checkFinancialConsistency(synthesized.content, context), ...checkResponseWellFormed(synthesized.content)];
    if (preliminaryIssues.length > 0) {
      try {
        synthesized = await withTimeout(
          LLMClient.chat(
            [
              ...promptMessages,
              { role: 'assistant', content: synthesized.content },
              { role: 'user', content: `Your previous answer had an issue: ${preliminaryIssues.join(' ')} Please provide a complete, corrected answer using the exact figures from the Context. Write it as a normal, standalone answer to the original question — don't mention that this is a correction, a retry, or reference your previous answer in any way.` },
            ],
            modelConfig
          ),
          policy.timeoutMs,
          'LLM corrective-retry'
        );
        addUsage(synthesized.usage);
        arithmeticRetried = true;
      } catch {
        // keep the original response — a failed retry shouldn't fail the whole turn
      }
    }
    tracer.mark('arithmetic_retry');
    tracer.set('arithmeticRetried', arithmeticRetried);

    let verification = { ...Verifier.tier1(substituted, synthesized.content, context), arithmetic_retry: arithmeticRetried };
    const requestedFieldCounts = { required: tool.requiredFields.length, optional: prioritizedOptional.length };
    let confidence = ConfidenceScorer.score(context, verification, classified.confidence, requestedFieldCounts);

    // Still malformed after the one bounded retry (or the retry itself failed/timed out) —
    // never show the user a truncated fragment or a leaked safety-classifier tag. tier1Issues
    // already records the real diagnostic for the trace/full-snapshot persistence below; only
    // the user-facing text is replaced.
    if (checkResponseWellFormed(synthesized.content).length > 0) {
      synthesized = { ...synthesized, content: "I wasn't able to generate a complete answer for that — please try asking again, possibly rephrased." };
    }

    // Tier 2 (Phase 3, V2 plan): gated by capability policy, not run for every request.
    // 'auto' runs it when Tier 1 already flagged something, or the provisional (tier2:
    // not_run) confidence already came out MEDIUM/LOW — i.e. exactly the cases where a
    // second, more expensive opinion is actually worth its cost.
    const shouldRunTier2 =
      policy.verificationTier2Policy === 'always' ||
      (policy.verificationTier2Policy === 'auto' && (verification.tier1 === 'flagged' || confidence.level !== 'high'));

    if (shouldRunTier2) {
      const tier2Result = await Tier2Verifier.run(substituted, context, synthesized.content);
      verification = { ...verification, ...tier2Result };
      confidence = ConfidenceScorer.score(context, verification, classified.confidence, requestedFieldCounts);
    }
    tracer.mark('verification');
    tracer.set('tier2Ran', shouldRunTier2);
    tracer.set('verification', { tier1: verification.tier1, tier2: verification.tier2 });
    tracer.set('confidence', { score: confidence.score, level: confidence.level });
    tracer.set('tokenUsage', usageTotals);

    const citations = ContextBuilder.citations(context);
    const contextHash = ContextBuilder.hash(context);

    // §10 — full snapshot only persisted when verification flags something; the light
    // provenance_summary (== citations) is what every successful turn keeps.
    const persistFullSnapshot = verification.tier1 === 'flagged' || verification.tier2 === 'fail';

    const trace = tracer.finish();
    const messageId = await persistMessage(conversationId, 'assistant', synthesized.content, {
      intent: classified.intent,
      capability,
      confidence_score: confidence.score,
      confidence: confidence.level,
      confidence_breakdown: confidence.breakdown,
      model_used: synthesized.modelUsed,
      retrieval_version: 'v1',
      retrieval_spec_version: '1',
      context_hash: contextHash,
      cache_keys: context.cacheKeys,
      provenance_summary: citations,
      context_snapshot: persistFullSnapshot ? context : null,
      context_snapshot_persisted: persistFullSnapshot,
      verification,
      latency_ms: Date.now() - startedAt,
      trace,
    });

    await ConversationMemory.updateFocus(conversationId, {
      symbols: entities.symbols,
      portfolioId: entities.portfolioId ?? null,
      sector: entities.sector ?? null,
      capability,
    });

    await bumpTokenUsage(userId, usageTotals.totalTokens);

    return buildResponse(conversationId, messageId, synthesized.content, classified.intent, capability, confidence, citations, startedAt);
  }
}

function buildResponse(
  conversationId: string,
  messageId: string,
  content: string,
  intent: AssistantQueryResponse['intent'],
  capability: AssistantQueryResponse['capability'],
  confidence: AssistantQueryResponse['confidence'],
  citations: AssistantQueryResponse['citations'],
  startedAt: number,
  rateLimited?: boolean
): AssistantQueryResponse {
  return {
    conversationId,
    messageId,
    content,
    intent,
    capability,
    confidence,
    citations,
    latencyMs: Date.now() - startedAt,
    ...(rateLimited ? { rateLimited: true } : {}),
  };
}
