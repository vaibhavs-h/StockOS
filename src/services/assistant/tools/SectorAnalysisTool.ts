import { SectorRetriever, SectorName } from '../retrieval/SectorRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['sector_name'];
const OPTIONAL_FIELDS = [
  'IN_constituent_count', 'IN_avg_pe_ratio', 'IN_avg_day_change_pct', 'IN_top_gainer', 'IN_top_loser',
  'US_constituent_count', 'US_avg_pe_ratio', 'US_avg_day_change_pct', 'US_top_gainer', 'US_top_loser',
];

export const SectorAnalysisTool: AssistantTool = {
  capability: 'sector_analysis',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(entities: ResolvedEntities, _userId: string): Promise<ToolResult> {
    if (!entities.sector) {
      return { fields: [], computedFields: [], missingRequiredFields: REQUIRED_FIELDS, missingOptionalFields: OPTIONAL_FIELDS, cacheKeys: [] };
    }

    const { fields, cacheKeys } = await SectorRetriever.fetchSectorAggregate(entities.sector as SectorName);
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
