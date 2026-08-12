import { ScreenerQueryBuilder } from '../retrieval/ScreenerQueryBuilder';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['result_count'];
// IN_result_N / US_result_N are variable-length (capped at 15 per market inside
// ScreenerQueryBuilder) — left undeclared/"bonus" rather than enumerated, same treatment as
// PortfolioOptimizationTool's overflow rebalancing flags.
const OPTIONAL_FIELDS: string[] = [];

// No filters resolved still runs the query (falls back to "largest by market cap, no
// filter") rather than refusing — filters_applied in the result tells the model exactly what
// was and wasn't applied, so it can say so plainly per the capability's "fail gracefully,
// don't hallucinate unsupported filters" scope.
export const ScreenerTool: AssistantTool = {
  capability: 'screener',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    const { fields, cacheKeys } = await ScreenerQueryBuilder.runScreener(entities.filters || {});
    const presentFieldNames = new Set(fields.map(f => f.field));

    return {
      fields,
      computedFields: [],
      missingRequiredFields: REQUIRED_FIELDS.filter(f => !presentFieldNames.has(f)),
      missingOptionalFields: [],
      cacheKeys,
    };
  },
};
