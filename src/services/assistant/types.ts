// Shared types for the StockOS Research Assistant pipeline.
// See docs/ai-research-assistant-architecture.md for the design this implements.

export type Capability =
  | 'stock_research'
  | 'portfolio_analysis'
  | 'compare_stocks'
  | 'market_overview'
  | 'general_finance'
  | 'dividend_analysis'
  | 'technical_analysis'
  | 'sector_analysis'
  | 'etf_analysis'
  | 'news_analysis'
  | 'investment_thesis'
  | 'watchlist_review'
  | 'mutual_fund_analysis'
  | 'risk_analysis'
  | 'portfolio_optimization'
  | 'screener';

export type Intent =
  | 'stock_research'
  | 'portfolio_analysis'
  | 'compare'
  | 'market_overview'
  | 'general_finance'
  | 'dividend_analysis'
  | 'technical_analysis'
  | 'sector_analysis'
  | 'etf_analysis'
  | 'news_analysis'
  | 'investment_thesis'
  | 'watchlist_review'
  | 'mutual_fund_analysis'
  | 'risk_analysis'
  | 'portfolio_optimization'
  | 'screener';

// Allowlisted screener filters only — see retrieval/ScreenerQueryBuilder.ts. Every key here
// must have a matching column mapping there; a filter that can't be mapped to a real,
// verified column on both market_assets and us_market_assets is not added as a key.
export interface ScreenerFilters {
  sector?: string;
  marketCapMin?: number;
  marketCapMax?: number;
  // Set only when the user's own wording ("crore"/"lakh") unambiguously named an Indian-rupee
  // scale — market_cap is stored in the position's own currency on each table, and INR/USD
  // differ by ~83x, so an unscoped threshold would silently misfilter whichever market the
  // user didn't mean. See retrieval/ScreenerQueryBuilder.ts.
  marketCapMinCurrency?: 'INR';
  marketCapMaxCurrency?: 'INR';
  peMax?: number;
  peMin?: number;
  dividendYieldMin?: number;
  priceMin?: number;
  priceMax?: number;
  roeMin?: number;
  pegMax?: number;
}

export interface ResolvedEntities {
  symbols: string[]; // storage-form symbols, e.g. "RELIANCE.NS", "AAPL"
  portfolioId?: string;
  sector?: string; // normalized against retrieval/SectorRetriever's SECTOR_LIST
  filters?: ScreenerFilters;
}

export interface ClassifiedIntent {
  intent: Intent;
  confidence: number; // 0-1
  entities: ResolvedEntities;
}

export interface ConversationFocus {
  last_symbols: string[];
  last_portfolio_id: string | null;
  last_sector: string | null;
  last_capability: Capability | null;
  updated_at: string;
}

export type ProvenanceKind = 'retrieved' | 'computed';

export interface ProvenancedField {
  field: string;
  value: number | string | null;
  source: string; // table name, or "computed:<method>"
  kind: ProvenanceKind;
  asOf: string; // ISO timestamp
}

export interface ToolResult {
  fields: ProvenancedField[];
  computedFields: ProvenancedField[];
  missingRequiredFields: string[];
  missingOptionalFields: string[];
  cacheKeys: string[];
}

export interface AssistantTool {
  capability: Capability;
  requiredFields: string[];
  optionalFields: string[];
  execute(entities: ResolvedEntities, userId: string): Promise<ToolResult>;
}

export interface StructuredContext {
  intent: Intent;
  capability: Capability;
  entities: ResolvedEntities;
  fields: ProvenancedField[];
  missingRequiredFields: string[];
  missingOptionalFields: string[];
  cacheKeys: string[];
}

export interface VerificationResult {
  tier1: 'pass' | 'flagged';
  tier1Issues: string[];
  tier2: 'not_run' | 'pass' | 'fail';
  tier2Detail?: { unsupported_claims: string[]; missing_aspects: string[]; consistent: boolean };
}

export interface ConfidenceBreakdown {
  dataCompleteness: { present: number; requested: number; ratio: number };
  freshness: { score: number; oldestFieldAgeS: number | null; newestFieldAgeS: number | null };
  verification: { tier1: 'pass' | 'flagged'; tier2: 'not_run' | 'pass' | 'fail'; score: number };
  classificationConfidence: number;
}

export interface ConfidenceResult {
  score: number; // 0-100
  level: 'high' | 'medium' | 'low';
  breakdown: ConfidenceBreakdown;
}

export interface Citation {
  field: string;
  label: string;
  source: string;
  kind: ProvenanceKind;
  asOf: string;
}

export type SubscriptionTier = 'free' | 'lite' | 'pro';

export interface AssistantQueryRequest {
  userId: string;
  tier: SubscriptionTier;
  message: string;
  conversationId?: string;
}

export interface AssistantQueryResponse {
  conversationId: string;
  messageId: string;
  content: string;
  intent: Intent;
  capability: Capability;
  confidence: ConfidenceResult;
  citations: Citation[];
  latencyMs: number;
}
