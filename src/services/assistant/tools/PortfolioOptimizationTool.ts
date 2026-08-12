import { PortfolioHoldingsRetriever } from '../retrieval/PortfolioHoldingsRetriever';
import { AnalyticsEngine } from '../analytics/AnalyticsEngine';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['holdings_count'];
// rebalancing_flag_N is a variable-length list (RebalancingHeuristics.evaluate) — declaring a
// handful covers the common case for the retrieval-budget/priority mechanism; any beyond this
// still pass through undeclared, same "bonus field" treatment as company_name elsewhere.
const OPTIONAL_FIELDS = ['rebalancing_flags', 'rebalancing_flag_1', 'rebalancing_flag_2', 'rebalancing_flag_3'];

export const PortfolioOptimizationTool: AssistantTool = {
  capability: 'portfolio_optimization',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, userId: string): Promise<ToolResult> {
    const { fields, cacheKeys, raw } = await PortfolioHoldingsRetriever.fetchHoldings(userId, entities.portfolioId);
    const computedFields = AnalyticsEngine.forRebalancing(raw);
    const presentFieldNames = new Set(fields.map(f => f.field));

    const missingOptional = raw.length === 0 ? OPTIONAL_FIELDS : [];

    return {
      fields,
      computedFields,
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: missingOptional,
      cacheKeys,
    };
  },
};
