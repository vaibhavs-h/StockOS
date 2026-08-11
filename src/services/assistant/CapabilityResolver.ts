import { supabase } from '../../lib/supabase';
import { Capability, Intent } from './types';

// Static MVP mapping mirrors assistant_intent_capability_map's seed rows (§06/§11) —
// used as the immediate fallback so the pipeline works before/without a DB round trip,
// and if the table is ever empty. The DB table is still the source of truth once loaded,
// so a capability can be added there without a code change.
const STATIC_MAP: Record<Intent, Capability[]> = {
  stock_research: ['stock_research'],
  portfolio_analysis: ['portfolio_analysis'],
  compare: ['compare_stocks'],
  market_overview: ['market_overview'],
  general_finance: ['general_finance'],
};

let cachedMap: Record<string, Capability[]> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadMap(): Promise<Record<string, Capability[]>> {
  if (cachedMap && Date.now() - cachedAt < CACHE_TTL_MS) return cachedMap;

  try {
    const { data, error } = await supabase
      .from('assistant_intent_capability_map')
      .select('intent, capability, priority')
      .order('priority', { ascending: true });

    if (error || !data || data.length === 0) {
      cachedMap = STATIC_MAP as unknown as Record<string, Capability[]>;
    } else {
      const map: Record<string, Capability[]> = {};
      for (const row of data) {
        (map[row.intent] ||= []).push(row.capability);
      }
      cachedMap = map;
    }
  } catch {
    cachedMap = STATIC_MAP as unknown as Record<string, Capability[]>;
  }

  cachedAt = Date.now();
  return cachedMap;
}

export async function resolveCapabilities(intent: Intent): Promise<Capability[]> {
  const map = await loadMap();
  return map[intent] ?? STATIC_MAP[intent] ?? ['general_finance'];
}

export const CapabilityResolver = { resolveCapabilities };
