import { supabase } from '../../lib/supabase';

export interface ModelConfig {
  taskType: string;
  modelId: string;
  fallbackModelId: string | null;
  temperature: number;
  maxTokens: number;
}

// Static fallback so the pipeline boots even before assistant_model_registry is seeded.
//
// Zero-cost by default, tiered by task on Groq's free tier (see LLMClient's "groq:<model>"
// provider-prefix convention):
//   - llama-3.1-8b-instant: 30 req/min, 14,400 req/day — used for intent_classification and
//     verification_tier2, since both run on every message and neither needs deep reasoning.
//   - llama-3.3-70b-versatile: much better reasoning, but only 1,000 req/day on Groq's free
//     tier — reserved for the synthesis tasks (once per turn, and where output quality
//     actually matters) so the higher-frequency, lower-stakes calls don't burn through it.
// Fallback on every task is OpenRouter's "openrouter/free" auto-router, which always resolves
// to *some* currently-working free model — deliberately not a specific id, so it can't go
// stale the way a hardcoded one can (see the Claude 3.5 Sonnet deprecation this caught in
// testing). Swap any of these via assistant_model_registry with no deploy — that's the whole
// point of this table (architecture doc §07/§19).
const STATIC_DEFAULTS: Record<string, ModelConfig> = {
  intent_classification: { taskType: 'intent_classification', modelId: 'groq:llama-3.1-8b-instant', fallbackModelId: 'openrouter/free', temperature: 0, maxTokens: 300 },
  synthesis_stock_research: { taskType: 'synthesis_stock_research', modelId: 'groq:llama-3.3-70b-versatile', fallbackModelId: 'openrouter/free', temperature: 0.3, maxTokens: 900 },
  synthesis_portfolio: { taskType: 'synthesis_portfolio', modelId: 'groq:llama-3.3-70b-versatile', fallbackModelId: 'openrouter/free', temperature: 0.3, maxTokens: 900 },
  synthesis_general: { taskType: 'synthesis_general', modelId: 'groq:llama-3.3-70b-versatile', fallbackModelId: 'openrouter/free', temperature: 0.4, maxTokens: 700 },
  verification_tier2: { taskType: 'verification_tier2', modelId: 'groq:llama-3.1-8b-instant', fallbackModelId: 'openrouter/free', temperature: 0, maxTokens: 400 },
};

let cache: Map<string, ModelConfig> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAll(): Promise<Map<string, ModelConfig>> {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

  const map = new Map<string, ModelConfig>(Object.entries(STATIC_DEFAULTS));
  try {
    const { data } = await supabase
      .from('assistant_model_registry')
      .select('task_type, model_id, fallback_model_id, temperature, max_tokens, is_active')
      .eq('is_active', true);

    (data || []).forEach(row => {
      map.set(row.task_type, {
        taskType: row.task_type,
        modelId: row.model_id,
        fallbackModelId: row.fallback_model_id,
        temperature: Number(row.temperature),
        maxTokens: row.max_tokens,
      });
    });
  } catch {
    // fall through to static defaults already in `map`
  }

  cache = map;
  cachedAt = Date.now();
  return map;
}

export class ModelRegistry {
  static async get(taskType: string): Promise<ModelConfig> {
    const map = await loadAll();
    return map.get(taskType) || STATIC_DEFAULTS[taskType] || STATIC_DEFAULTS.synthesis_general;
  }
}
