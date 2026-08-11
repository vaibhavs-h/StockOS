import { CACHE_TTL } from './AssistantCache';
import { Capability, ResolvedEntities, ToolResult } from './types';

// Conversation-scoped memoization of the *assembled* ToolResult — sits one level above
// AssistantCache (which already owns raw-field caching, entity-keyed, TTL-respecting).
// This layer's job is narrower and explicit: skip the tool-execution fan-out entirely for
// an exact repeat within the same short window, and give a conversation an inspectable
// record of what it's already retrieved. It deliberately can never outlive the freshness
// guarantee AssistantCache already enforces underneath it — TTLs here are pulled from the
// exact same CACHE_TTL constants, not a second policy to keep in sync (§ V2 plan, Phase 2).

interface CacheEntry {
  toolResult: ToolResult;
  fetchedAt: number;
  ttlMs: number;
}

// The tightest freshness constraint each capability's ToolResult could contain — an entry
// can never be trusted longer than the most time-sensitive field inside it would be.
const CAPABILITY_TTL_MS: Record<Capability, number> = {
  stock_research: CACHE_TTL.QUOTE_MARKET_HOURS_MS,
  compare_stocks: CACHE_TTL.QUOTE_MARKET_HOURS_MS,
  portfolio_analysis: CACHE_TTL.HOLDINGS_MS,
  market_overview: CACHE_TTL.INDICES_MS,
  general_finance: CACHE_TTL.ANALYTICS_MS,
};

function entityKeyFor(capability: Capability, entities: ResolvedEntities): string {
  if (capability === 'portfolio_analysis') return entities.portfolioId ? `portfolio:${entities.portfolioId}` : 'portfolio';
  if (entities.symbols.length > 0) return [...entities.symbols].sort().join(',');
  return 'global';
}

export class ConversationContextCache {
  private static instance: ConversationContextCache;
  private store: Map<string, CacheEntry> = new Map();

  public static getInstance(): ConversationContextCache {
    if (!ConversationContextCache.instance) {
      ConversationContextCache.instance = new ConversationContextCache();
    }
    return ConversationContextCache.instance;
  }

  private key(conversationId: string, capability: Capability, entities: ResolvedEntities): string {
    return `${conversationId}:${capability}:${entityKeyFor(capability, entities)}`;
  }

  public get(conversationId: string, capability: Capability, entities: ResolvedEntities): ToolResult | null {
    const entry = this.store.get(this.key(conversationId, capability, entities));
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > entry.ttlMs) return null; // lazy expiry, same as AssistantCache
    return entry.toolResult;
  }

  public set(conversationId: string, capability: Capability, entities: ResolvedEntities, toolResult: ToolResult): void {
    const ttlMs = CAPABILITY_TTL_MS[capability] ?? CACHE_TTL.ANALYTICS_MS;
    this.store.set(this.key(conversationId, capability, entities), { toolResult, fetchedAt: Date.now(), ttlMs });
  }
}

export const conversationContextCache = ConversationContextCache.getInstance();
