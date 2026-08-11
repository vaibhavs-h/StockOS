// Shared types for the StockOS Research Assistant pipeline.
// See docs/ai-research-assistant-architecture.md for the design this implements.

export type Capability =
  | 'stock_research'
  | 'portfolio_analysis'
  | 'compare_stocks'
  | 'market_overview'
  | 'general_finance';

export type Intent =
  | 'stock_research'
  | 'portfolio_analysis'
  | 'compare'
  | 'market_overview'
  | 'general_finance';

export interface ResolvedEntities {
  symbols: string[]; // storage-form symbols, e.g. "RELIANCE.NS", "AAPL"
  portfolioId?: string;
}

export interface ClassifiedIntent {
  intent: Intent;
  confidence: number; // 0-1
  entities: ResolvedEntities;
}

export interface ConversationFocus {
  last_symbols: string[];
  last_portfolio_id: string | null;
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
