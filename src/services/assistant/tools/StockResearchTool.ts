import { StockQuoteRetriever } from '../retrieval/StockQuoteRetriever';
import { StockFundamentalsRetriever } from '../retrieval/StockFundamentalsRetriever';
import { NewsRetriever } from '../retrieval/NewsRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['quote_price', 'quote_day_change_pct'];
const OPTIONAL_FIELDS = [
  'pe_ratio', 'forward_pe', 'market_cap', 'sector',
  'fifty_two_week_high', 'fifty_two_week_low', 'fifty_day_average', 'two_hundred_day_average',
  'recent_news_1', 'recent_news_2', 'recent_news_3',
  // Widened in Phase 5 (V2 plan) alongside StockFundamentalsRetriever's SELECT — see
  // RetrievalSpecService for the prioritized/budgeted view of this list the orchestrator
  // actually uses for confidence scoring and prompt content. promoter_holding, ev_ebitda,
  // roce, and recommendation_mean are deliberately excluded — neither market_assets nor
  // us_market_assets has any column for them (confirmed via direct schema inspection), so
  // they're a genuine data-source gap, not a naming mismatch.
  'debt_to_equity', 'recommendation_key', 'peg_ratio', 'return_on_equity',
];

export const StockResearchTool: AssistantTool = {
  capability: 'stock_research',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    const symbol = entities.symbols[0];
    if (!symbol) {
      return { fields: [], computedFields: [], missingRequiredFields: REQUIRED_FIELDS, missingOptionalFields: OPTIONAL_FIELDS, cacheKeys: [] };
    }

    const [quote, fundamentals, news] = await Promise.all([
      StockQuoteRetriever.fetchQuote(symbol),
      StockFundamentalsRetriever.fetchFundamentals(symbol),
      NewsRetriever.fetchRecentNews(symbol),
    ]);

    const fields = [...quote.fields, ...fundamentals.fields, ...news.fields];
    const presentFieldNames = new Set(fields.map(f => f.field));

    return {
      fields,
      computedFields: [],
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: OPTIONAL_FIELDS.filter(f => !presentFieldNames.has(f)),
      cacheKeys: [...quote.cacheKeys, ...fundamentals.cacheKeys, ...news.cacheKeys],
    };
  },
};
