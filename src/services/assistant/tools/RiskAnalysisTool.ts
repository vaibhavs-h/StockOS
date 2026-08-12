import { PortfolioHoldingsRetriever } from '../retrieval/PortfolioHoldingsRetriever';
import { AnalyticsEngine } from '../analytics/AnalyticsEngine';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['holdings_count'];
const OPTIONAL_FIELDS = [
  'portfolio_beta', 'diversification_score', 'volatility_score', 'risk_level',
  'largest_holding_weight_pct', 'largest_holding_symbol', 'top3_holdings_weight_pct',
  'largest_sector', 'largest_sector_weight_pct',
];

export const RiskAnalysisTool: AssistantTool = {
  capability: 'risk_analysis',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, userId: string): Promise<ToolResult> {
    const { fields, cacheKeys, raw } = await PortfolioHoldingsRetriever.fetchHoldings(userId, entities.portfolioId);
    const computedFields = AnalyticsEngine.forRisk(raw);
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
