import { PortfolioHoldingsRetriever } from '../retrieval/PortfolioHoldingsRetriever';
import { AnalyticsEngine } from '../analytics/AnalyticsEngine';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

// 'total_market_value' isn't listed here: for a portfolio that spans both INR and USD
// holdings, the retriever deliberately replaces it with 'total_market_value_inr' /
// '_usd' rather than blending two currencies into one meaningless number (see
// PortfolioHoldingsRetriever) — so it can't be a hard requirement under one fixed name.
const REQUIRED_FIELDS = ['holdings_count'];
const OPTIONAL_FIELDS = [
  'total_market_value', 'total_market_value_inr', 'total_market_value_usd',
  'sector_exposure', 'allocation', 'concentration', 'portfolio_beta',
  'diversification_score', 'volatility_score',
];

export const PortfolioAnalysisTool: AssistantTool = {
  capability: 'portfolio_analysis',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, userId: string): Promise<ToolResult> {
    const { fields, cacheKeys, raw } = await PortfolioHoldingsRetriever.fetchHoldings(userId, entities.portfolioId);
    const computedFields = AnalyticsEngine.forPortfolio(raw);
    const presentFieldNames = new Set(fields.map(f => f.field));

    const missingOptional = raw.length === 0 ? OPTIONAL_FIELDS : []; // computed fields cover the rest when holdings exist

    return {
      fields,
      computedFields,
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: missingOptional,
      cacheKeys,
    };
  },
};
