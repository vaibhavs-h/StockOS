import { ToolRegistry } from './ToolRegistry';
import { StockResearchTool } from './StockResearchTool';
import { PortfolioAnalysisTool } from './PortfolioAnalysisTool';
import { CompareStocksTool } from './CompareStocksTool';
import { MarketOverviewTool } from './MarketOverviewTool';
import { GeneralFinanceTool } from './GeneralFinanceTool';
import { DividendAnalysisTool } from './DividendAnalysisTool';
import { TechnicalAnalysisTool } from './TechnicalAnalysisTool';
import { SectorAnalysisTool } from './SectorAnalysisTool';
import { EtfAnalysisTool } from './EtfAnalysisTool';
import { NewsAnalysisTool } from './NewsAnalysisTool';
import { InvestmentThesisTool } from './InvestmentThesisTool';
import { WatchlistReviewTool } from './WatchlistReviewTool';
import { MutualFundAnalysisTool } from './MutualFundAnalysisTool';
import { RiskAnalysisTool } from './RiskAnalysisTool';
import { PortfolioOptimizationTool } from './PortfolioOptimizationTool';
import { ScreenerTool } from './ScreenerTool';

let registered = false;

export function registerAssistantTools(): void {
  if (registered) return;
  ToolRegistry.register(StockResearchTool);
  ToolRegistry.register(PortfolioAnalysisTool);
  ToolRegistry.register(CompareStocksTool);
  ToolRegistry.register(MarketOverviewTool);
  ToolRegistry.register(GeneralFinanceTool);
  ToolRegistry.register(DividendAnalysisTool);
  ToolRegistry.register(TechnicalAnalysisTool);
  ToolRegistry.register(SectorAnalysisTool);
  ToolRegistry.register(EtfAnalysisTool);
  ToolRegistry.register(NewsAnalysisTool);
  ToolRegistry.register(InvestmentThesisTool);
  ToolRegistry.register(WatchlistReviewTool);
  ToolRegistry.register(MutualFundAnalysisTool);
  ToolRegistry.register(RiskAnalysisTool);
  ToolRegistry.register(PortfolioOptimizationTool);
  ToolRegistry.register(ScreenerTool);
  registered = true;
}
