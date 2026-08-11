import { ToolRegistry } from './ToolRegistry';
import { StockResearchTool } from './StockResearchTool';
import { PortfolioAnalysisTool } from './PortfolioAnalysisTool';
import { CompareStocksTool } from './CompareStocksTool';
import { MarketOverviewTool } from './MarketOverviewTool';
import { GeneralFinanceTool } from './GeneralFinanceTool';

let registered = false;

export function registerAssistantTools(): void {
  if (registered) return;
  ToolRegistry.register(StockResearchTool);
  ToolRegistry.register(PortfolioAnalysisTool);
  ToolRegistry.register(CompareStocksTool);
  ToolRegistry.register(MarketOverviewTool);
  ToolRegistry.register(GeneralFinanceTool);
  registered = true;
}
