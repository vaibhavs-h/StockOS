import { HoldingWithMeta } from '../retrieval/PortfolioHoldingsRetriever';
import { ProvenancedField } from '../types';
import { PortfolioAnalytics } from './PortfolioAnalytics';

// Sits between retrievers and the Context Builder (§07). Only ever consumes fields the
// retrievers already fetched — it never issues its own DB queries.
export class AnalyticsEngine {
  static forPortfolio(holdings: HoldingWithMeta[]): ProvenancedField[] {
    return PortfolioAnalytics.computePortfolioAnalytics(holdings);
  }
}
