import { AssistantTool, ProvenancedField, ResolvedEntities, ToolResult } from '../types';
import { StockResearchTool } from './StockResearchTool';

// Composes StockResearchTool per symbol instead of duplicating fetch logic — this also
// means it rides the same AssistantCache entries a prior stock_research turn would have
// populated (see the walkthrough in the architecture doc, §17).
export const CompareStocksTool: AssistantTool = {
  capability: 'compare_stocks',
  requiredFields: [],
  optionalFields: [],

  async execute(entities: ResolvedEntities, userId: string): Promise<ToolResult> {
    const symbols = entities.symbols.slice(0, 4); // keep the LLM's context bounded
    const perSymbol = await Promise.all(
      symbols.map(symbol => StockResearchTool.execute({ symbols: [symbol] }, userId))
    );

    const fields: ProvenancedField[] = [];
    const missingRequiredFields: string[] = [];
    const missingOptionalFields: string[] = [];
    const cacheKeys: string[] = [];

    perSymbol.forEach((result, i) => {
      const symbol = symbols[i];
      result.fields.forEach(f => fields.push({ ...f, field: `${symbol}.${f.field}` }));
      result.missingRequiredFields.forEach(f => missingRequiredFields.push(`${symbol}.${f}`));
      result.missingOptionalFields.forEach(f => missingOptionalFields.push(`${symbol}.${f}`));
      cacheKeys.push(...result.cacheKeys);
    });

    return { fields, computedFields: [], missingRequiredFields, missingOptionalFields, cacheKeys };
  },
};
