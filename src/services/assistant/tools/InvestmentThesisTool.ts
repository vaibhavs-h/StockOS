import { StockResearchTool } from './StockResearchTool';
import { NewsRetriever } from '../retrieval/NewsRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['quote_price'];
const OPTIONAL_FIELDS = [
  'pe_ratio', 'forward_pe', 'market_cap', 'sector', 'fifty_two_week_high', 'fifty_two_week_low',
  'fifty_day_average', 'two_hundred_day_average', 'debt_to_equity', 'recommendation_key', 'peg_ratio', 'return_on_equity',
  'news_item_1', 'news_item_2', 'news_item_3', 'news_item_4', 'news_item_5',
];

// Composes stock_research (quote + fundamentals + headline news) with the richer news
// retriever, same "compose instead of duplicate fetch logic" pattern CompareStocksTool uses —
// no new retrieval of its own. Single symbol, so field names aren't prefixed.
export const InvestmentThesisTool: AssistantTool = {
  capability: 'investment_thesis',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, userId: string): Promise<ToolResult> {
    const symbol = entities.symbols[0];
    if (!symbol) {
      return { fields: [], computedFields: [], missingRequiredFields: REQUIRED_FIELDS, missingOptionalFields: OPTIONAL_FIELDS, cacheKeys: [] };
    }

    const [research, richNews] = await Promise.all([
      StockResearchTool.execute({ symbols: [symbol] }, userId),
      NewsRetriever.fetchRecentNewsRich(symbol),
    ]);

    const fields = [...research.fields, ...richNews.fields];
    const presentFieldNames = new Set(fields.map(f => f.field));

    return {
      fields,
      computedFields: [],
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: OPTIONAL_FIELDS.filter(f => !presentFieldNames.has(f)),
      cacheKeys: [...research.cacheKeys, ...richNews.cacheKeys],
    };
  },
};
