import { NewsRetriever } from '../retrieval/NewsRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

// Field names vary by which path ran (symbol vs. sector) — both are declared optional so
// RetrievalSpecService's budget/priority logic can manage either shape.
const OPTIONAL_FIELDS = [
  'news_item_1', 'news_item_2', 'news_item_3', 'news_item_4', 'news_item_5',
  'sector_news_1', 'sector_news_2', 'sector_news_3', 'sector_news_4', 'sector_news_5',
];

export const NewsAnalysisTool: AssistantTool = {
  capability: 'news_analysis',
  requiredFields: [],
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    const symbol = entities.symbols[0];
    const result = symbol
      ? await NewsRetriever.fetchRecentNewsRich(symbol)
      : entities.sector
        ? await NewsRetriever.fetchForSector(entities.sector)
        : null;

    if (!result) {
      return { fields: [], computedFields: [], missingRequiredFields: [], missingOptionalFields: OPTIONAL_FIELDS, cacheKeys: [] };
    }

    const presentFieldNames = new Set(result.fields.map(f => f.field));
    return {
      fields: result.fields,
      computedFields: [],
      missingRequiredFields: [],
      missingOptionalFields: OPTIONAL_FIELDS.filter(f => !presentFieldNames.has(f)),
      cacheKeys: result.cacheKeys,
    };
  },
};
