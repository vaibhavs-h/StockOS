import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

// No retrieval — educational/conceptual finance questions have nothing in StockOS to
// ground on. Confidence is capped at MEDIUM regardless of score (see ConfidenceScorer).
export const GeneralFinanceTool: AssistantTool = {
  capability: 'general_finance',
  requiredFields: [],
  optionalFields: [],

  async execute(_entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    return { fields: [], computedFields: [], missingRequiredFields: [], missingOptionalFields: [], cacheKeys: [] };
  },
};
