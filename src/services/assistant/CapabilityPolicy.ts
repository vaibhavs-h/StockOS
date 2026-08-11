import { supabase } from '../../lib/supabase';
import { Capability } from './types';

export type VerificationTier2Policy = 'always' | 'auto' | 'never';

export interface CapabilityPolicyConfig {
  capability: Capability;
  verificationTier2Policy: VerificationTier2Policy;
  burstSyncAllowed: boolean;
  conversationCacheEnabled: boolean;
  cacheTtlOverrideMs: number | null;
  timeoutMs: number;
  maxCostUsdPerRequest: number | null;
  retrievalBudget: number;
}

// Static fallback so the pipeline boots even before assistant_capability_policies is
// seeded — same DB-row + in-process-cache + static-fallback shape as ModelRegistry.ts /
// CapabilityResolver.ts (§ V2 plan, Phase 2). Model choice is deliberately not part of
// this policy — that's already capability-driven via assistant_prompt_versions.task_type.
// retrieval_budget matches each capability's pre-Phase-5 optional-field count (11 for
// stock_research/compare_stocks, 9 for portfolio_analysis) — see assistant_schema.sql's
// matching seed comment for why that reproduces pre-Phase-5 behavior exactly.
const STATIC_DEFAULTS: Record<Capability, CapabilityPolicyConfig> = {
  stock_research: { capability: 'stock_research', verificationTier2Policy: 'auto', burstSyncAllowed: true, conversationCacheEnabled: true, cacheTtlOverrideMs: null, timeoutMs: 30000, maxCostUsdPerRequest: null, retrievalBudget: 11 },
  portfolio_analysis: { capability: 'portfolio_analysis', verificationTier2Policy: 'always', burstSyncAllowed: false, conversationCacheEnabled: true, cacheTtlOverrideMs: null, timeoutMs: 45000, maxCostUsdPerRequest: null, retrievalBudget: 10 },
  compare_stocks: { capability: 'compare_stocks', verificationTier2Policy: 'auto', burstSyncAllowed: true, conversationCacheEnabled: true, cacheTtlOverrideMs: null, timeoutMs: 35000, maxCostUsdPerRequest: null, retrievalBudget: 11 },
  market_overview: { capability: 'market_overview', verificationTier2Policy: 'never', burstSyncAllowed: false, conversationCacheEnabled: true, cacheTtlOverrideMs: null, timeoutMs: 20000, maxCostUsdPerRequest: null, retrievalBudget: 8 },
  general_finance: { capability: 'general_finance', verificationTier2Policy: 'never', burstSyncAllowed: false, conversationCacheEnabled: false, cacheTtlOverrideMs: null, timeoutMs: 20000, maxCostUsdPerRequest: null, retrievalBudget: 8 },
};

let cache: Map<Capability, CapabilityPolicyConfig> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAll(): Promise<Map<Capability, CapabilityPolicyConfig>> {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

  const map = new Map<Capability, CapabilityPolicyConfig>(
    Object.entries(STATIC_DEFAULTS) as [Capability, CapabilityPolicyConfig][]
  );
  try {
    const { data } = await supabase
      .from('assistant_capability_policies')
      .select('capability, verification_tier2_policy, burst_sync_allowed, conversation_cache_enabled, cache_ttl_override_ms, timeout_ms, max_cost_usd_per_request, retrieval_budget');

    (data || []).forEach(row => {
      map.set(row.capability as Capability, {
        capability: row.capability,
        verificationTier2Policy: row.verification_tier2_policy,
        burstSyncAllowed: row.burst_sync_allowed,
        conversationCacheEnabled: row.conversation_cache_enabled,
        cacheTtlOverrideMs: row.cache_ttl_override_ms,
        timeoutMs: row.timeout_ms,
        maxCostUsdPerRequest: row.max_cost_usd_per_request === null ? null : Number(row.max_cost_usd_per_request),
        retrievalBudget: row.retrieval_budget,
      });
    });
  } catch {
    // fall through to static defaults already in `map`
  }

  cache = map;
  cachedAt = Date.now();
  return map;
}

export class CapabilityPolicy {
  static async get(capability: Capability): Promise<CapabilityPolicyConfig> {
    const map = await loadAll();
    return map.get(capability) || STATIC_DEFAULTS[capability] || STATIC_DEFAULTS.general_finance;
  }
}
