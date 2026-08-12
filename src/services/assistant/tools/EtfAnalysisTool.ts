import { StockQuoteRetriever } from '../retrieval/StockQuoteRetriever';
import { StockFundamentalsRetriever } from '../retrieval/StockFundamentalsRetriever';
import { NewsRetriever } from '../retrieval/NewsRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['quote_price'];
// No asset-type/quote-type column reliably distinguishes an ETF from an equity in either
// table (confirmed by direct query, Aug 2026 — every India row is tagged 'equity' and every
// US row 'EQUITY' regardless of actual fund type), so this tool is symbol-scoped exactly
// like stock_research rather than filtering a universe — the user names a specific ETF and
// this reuses the same quote/fundamentals/news retrievers, minus fields that rarely apply to
// a fund (debt_to_equity, recommendation_key, return_on_equity).
const OPTIONAL_FIELDS = ['pe_ratio', 'market_cap', 'fifty_two_week_high', 'fifty_two_week_low', 'recent_news_1', 'recent_news_2', 'recent_news_3'];

export const EtfAnalysisTool: AssistantTool = {
  capability: 'etf_analysis',
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

    const optionalSet = new Set(OPTIONAL_FIELDS);
    const relevantFundamentals = fundamentals.fields.filter(f => optionalSet.has(f.field));
    const fields = [...quote.fields, ...relevantFundamentals, ...news.fields];
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
