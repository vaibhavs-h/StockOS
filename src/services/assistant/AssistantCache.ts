// In-process, entity-keyed cache for the assistant pipeline.
// Mirrors the shape of src/scheduler/core/MarketStateCache.ts (singleton, Map-backed)
// rather than extending it — that class's dirty-check logic is hard-coded to price fields.
// See docs/ai-research-assistant-architecture.md §09.

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  ttlMs: number;
}

export class AssistantCache {
  private static instance: AssistantCache;
  private store: Map<string, CacheEntry<unknown>> = new Map();
  // Process-wide hit/miss counters for the tracer (§ V2 plan, Phase 6). A request-scoped
  // *approximation* under concurrency — two simultaneous requests each see the combined
  // delta — acceptable for internal diagnostics; exact per-request attribution would mean
  // threading a tracer reference into every retriever call, which isn't worth it here.
  private hits = 0;
  private misses = 0;

  public static getInstance(): AssistantCache {
    if (!AssistantCache.instance) {
      AssistantCache.instance = new AssistantCache();
    }
    return AssistantCache.instance;
  }

  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() - entry.fetchedAt > entry.ttlMs) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.data as T;
  }

  public getStats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }

  /** Returns the entry's age in ms if present and unexpired, else null. */
  public getAgeMs(key: string): number | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.fetchedAt;
    if (age > entry.ttlMs) return null;
    return age;
  }

  public set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, fetchedAt: Date.now(), ttlMs });
  }

  public invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

export const assistantCache = AssistantCache.getInstance();

// TTL policy (§09) — kept centralized so retrievers agree on freshness rules.
export const CACHE_TTL = {
  QUOTE_MARKET_HOURS_MS: 30 * 1000,
  QUOTE_AFTER_HOURS_MS: 30 * 60 * 1000,
  FUNDAMENTALS_MS: 24 * 60 * 60 * 1000,
  NEWS_MS: 15 * 60 * 1000,
  HOLDINGS_MS: 5 * 60 * 1000, // no write-hook into the import/broker pipeline yet, so a short TTL stands in for invalidate-on-write
  INDICES_MS: 30 * 1000,
  ANALYTICS_MS: 5 * 60 * 1000,
} as const;
