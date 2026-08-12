import { MutualFundRetriever } from '../retrieval/MutualFundRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['mf_holdings_count'];
const OPTIONAL_FIELDS = ['held_mf_schemes', 'total_mf_market_value', 'total_mf_invested_value', 'largest_mf_holding'];

export const MutualFundAnalysisTool: AssistantTool = {
  capability: 'mutual_fund_analysis',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, userId: string): Promise<ToolResult> {
    const { fields, cacheKeys } = await MutualFundRetriever.fetchMfHoldings(userId, entities.portfolioId);
    const presentFieldNames = new Set(fields.map(f => f.field));

    return {
      fields,
      computedFields: [],
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: OPTIONAL_FIELDS.filter(f => !presentFieldNames.has(f)),
      cacheKeys,
    };
  },
};
