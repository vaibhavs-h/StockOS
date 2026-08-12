import { StockQuoteRetriever } from '../retrieval/StockQuoteRetriever';
import { StockFundamentalsRetriever } from '../retrieval/StockFundamentalsRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['quote_price'];
const OPTIONAL_FIELDS = ['fifty_day_average', 'two_hundred_day_average', 'fifty_two_week_high', 'fifty_two_week_low'];

// ath/atl/ma_20 are deliberately not retrieved here — confirmed by direct query (Aug 2026)
// that neither is actually populated by IndianDeepSyncJob/UsDeepSyncJob despite existing as
// columns on market_assets. Only what's real is surfaced; DerivedFactsBuilder computes the
// trend/percent-from-range facts from these once quote_price is also in context.
export const TechnicalAnalysisTool: AssistantTool = {
  capability: 'technical_analysis',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    const symbol = entities.symbols[0];
    if (!symbol) {
      return { fields: [], computedFields: [], missingRequiredFields: REQUIRED_FIELDS, missingOptionalFields: OPTIONAL_FIELDS, cacheKeys: [] };
    }

    const [quote, fundamentals] = await Promise.all([
      StockQuoteRetriever.fetchQuote(symbol),
      StockFundamentalsRetriever.fetchFundamentals(symbol),
    ]);

    const optionalSet = new Set(OPTIONAL_FIELDS);
    const technicalFields = fundamentals.fields.filter(f => optionalSet.has(f.field));
    const fields = [...quote.fields, ...technicalFields];
    const presentFieldNames = new Set(fields.map(f => f.field));

    return {
      fields,
      computedFields: [],
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: OPTIONAL_FIELDS.filter(f => !presentFieldNames.has(f)),
      cacheKeys: [...quote.cacheKeys, ...fundamentals.cacheKeys],
    };
  },
};
