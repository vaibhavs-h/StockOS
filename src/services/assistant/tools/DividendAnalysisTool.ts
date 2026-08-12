import { StockQuoteRetriever } from '../retrieval/StockQuoteRetriever';
import { DividendRetriever } from '../retrieval/DividendRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['quote_price'];
const OPTIONAL_FIELDS = ['dividend_amount', 'dividend_yield_pct', 'dividend_date'];

export const DividendAnalysisTool: AssistantTool = {
  capability: 'dividend_analysis',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    const symbol = entities.symbols[0];
    if (!symbol) {
      return { fields: [], computedFields: [], missingRequiredFields: REQUIRED_FIELDS, missingOptionalFields: OPTIONAL_FIELDS, cacheKeys: [] };
    }

    const [quote, dividend] = await Promise.all([
      StockQuoteRetriever.fetchQuote(symbol),
      DividendRetriever.fetchDividend(symbol),
    ]);

    const fields = [...quote.fields, ...dividend.fields];
    const presentFieldNames = new Set(fields.map(f => f.field));

    return {
      fields,
      computedFields: [],
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: OPTIONAL_FIELDS.filter(f => !presentFieldNames.has(f)),
      cacheKeys: [...quote.cacheKeys, ...dividend.cacheKeys],
    };
  },
};
