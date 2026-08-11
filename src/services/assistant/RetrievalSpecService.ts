import { supabase } from '../../lib/supabase';
import { Capability } from './types';

export interface PrioritizedField {
  field: string;
  priority: number;
}

// Static fallback so the pipeline boots even before assistant_retrieval_specs /
// assistant_retrieval_field_priority are seeded — same DB-row + in-process-cache +
// static-fallback shape as ModelRegistry / CapabilityPolicy. These lists mirror what was
// already hardcoded per-tool before Phase 5 (§ V2 plan) — the tools themselves are
// unchanged (they still fetch everything cheaply available in one query); this service is
// what the *orchestrator* consults to decide what counts as "expected" for confidence
// scoring and what actually makes it into the prompt, which is where a budget has real
// effect (prompt size / token cost), not at the retrieval layer.
const STATIC_REQUIRED: Record<Capability, string[]> = {
  stock_research: ['quote_price', 'quote_day_change_pct'],
  portfolio_analysis: ['holdings_count'],
  compare_stocks: [],
  market_overview: ['index_levels'],
  general_finance: [],
};

// The 11 pre-Phase-5 fields keep the neutral baseline (5); the 8 fields Phase 5 added
// alongside StockFundamentalsRetriever's widened SELECT start below it (2) — fetched
// already (cheap), but not surfaced until real feedback promotes a specific one. Matches
// assistant_schema.sql's seed exactly, which is what actually governs behavior once the DB
// is reachable — this is only the boot-before-seeded fallback.
const STATIC_OPTIONAL: Record<Capability, PrioritizedField[]> = {
  stock_research: [
    { field: 'pe_ratio', priority: 5 }, { field: 'forward_pe', priority: 5 }, { field: 'market_cap', priority: 5 }, { field: 'sector', priority: 5 },
    { field: 'fifty_two_week_high', priority: 5 }, { field: 'fifty_two_week_low', priority: 5 },
    { field: 'fifty_day_average', priority: 5 }, { field: 'two_hundred_day_average', priority: 5 },
    { field: 'recent_news_1', priority: 5 }, { field: 'recent_news_2', priority: 5 }, { field: 'recent_news_3', priority: 5 },
    // promoter_holding, ev_ebitda, roce, recommendation_mean omitted — no column for any of
    // them on either market_assets or us_market_assets (see StockFundamentalsRetriever).
    { field: 'debt_to_equity', priority: 2 }, { field: 'recommendation_key', priority: 2 },
    { field: 'peg_ratio', priority: 2 }, { field: 'return_on_equity', priority: 2 },
  ],
  portfolio_analysis: [
    { field: 'total_market_value', priority: 5 }, { field: 'total_market_value_inr', priority: 5 }, { field: 'total_market_value_usd', priority: 5 },
    { field: 'held_symbols', priority: 5 },
    { field: 'sector_exposure', priority: 5 }, { field: 'allocation', priority: 5 }, { field: 'concentration', priority: 5 },
    { field: 'portfolio_beta', priority: 5 }, { field: 'diversification_score', priority: 5 }, { field: 'volatility_score', priority: 5 },
  ],
  compare_stocks: [], // delegates to stock_research's list — see getPrioritizedOptionalFields
  market_overview: [],
  general_finance: [],
};

let requiredCache: Map<Capability, string[]> | null = null;
let requiredCachedAt = 0;
let priorityCache: Map<Capability, PrioritizedField[]> | null = null;
let priorityCachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadRequired(): Promise<Map<Capability, string[]>> {
  if (requiredCache && Date.now() - requiredCachedAt < CACHE_TTL_MS) return requiredCache;

  const map = new Map<Capability, string[]>(Object.entries(STATIC_REQUIRED) as [Capability, string[]][]);
  try {
    const { data } = await supabase.from('assistant_retrieval_specs').select('capability, required_fields');
    (data || []).forEach(row => {
      if (Array.isArray(row.required_fields)) map.set(row.capability as Capability, row.required_fields);
    });
  } catch {
    // fall through to static defaults already in `map`
  }

  requiredCache = map;
  requiredCachedAt = Date.now();
  return requiredCache;
}

async function loadPriorities(): Promise<Map<Capability, PrioritizedField[]>> {
  if (priorityCache && Date.now() - priorityCachedAt < CACHE_TTL_MS) return priorityCache;

  const map = new Map<Capability, PrioritizedField[]>(Object.entries(STATIC_OPTIONAL) as [Capability, PrioritizedField[]][]);

  try {
    const { data } = await supabase
      .from('assistant_retrieval_field_priority')
      .select('capability, field, priority')
      .order('priority', { ascending: false });

    const byCapability = new Map<Capability, PrioritizedField[]>();
    (data || []).forEach(row => {
      const cap = row.capability as Capability;
      if (!byCapability.has(cap)) byCapability.set(cap, []);
      byCapability.get(cap)!.push({ field: row.field, priority: row.priority });
    });
    for (const [cap, fields] of byCapability) map.set(cap, fields);
  } catch {
    // fall through to static defaults already in `map`
  }

  priorityCache = map;
  priorityCachedAt = Date.now();
  return priorityCache;
}

export class RetrievalSpecService {
  static async getRequiredFields(capability: Capability): Promise<string[]> {
    const map = await loadRequired();
    return map.get(capability) || STATIC_REQUIRED[capability] || [];
  }

  /** Returns optional fields ordered by priority (descending), capped at `budget`. Required
   * fields are never part of this list or affected by it — learning only ever touches
   * optional-field priority (§ V2 plan, Phase 5). `compare_stocks` has no priority rows of
   * its own — it inherits `stock_research`'s, since it delegates to that tool per symbol. */
  static async getPrioritizedOptionalFields(capability: Capability, budget: number): Promise<PrioritizedField[]> {
    const map = await loadPriorities();
    const effectiveCapability: Capability = capability === 'compare_stocks' ? 'stock_research' : capability;
    const fields = map.get(effectiveCapability) || STATIC_OPTIONAL[effectiveCapability] || [];
    return [...fields].sort((a, b) => b.priority - a.priority).slice(0, budget);
  }
}
