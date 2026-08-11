import { IndexQuoteRetriever } from '../retrieval/IndexQuoteRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['index_levels'];

export const MarketOverviewTool: AssistantTool = {
  capability: 'market_overview',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: [],

  async execute(_entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    const { fields, cacheKeys } = await IndexQuoteRetriever.fetchIndexLevels();
    return {
      fields,
      computedFields: [],
      missingRequiredFields: fields.length === 0 ? REQUIRED_FIELDS : [],
      missingOptionalFields: [],
      cacheKeys,
    };
  },
};
