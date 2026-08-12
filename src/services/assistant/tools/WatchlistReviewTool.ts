import { WatchlistRetriever } from '../retrieval/WatchlistRetriever';
import { AssistantTool, ResolvedEntities, ToolResult } from '../types';

const REQUIRED_FIELDS = ['watchlist_count'];
const OPTIONAL_FIELDS = ['watchlist_symbol_count', 'held_watchlist_symbols', 'watchlist_top_gainer', 'watchlist_top_loser'];

export const WatchlistReviewTool: AssistantTool = {
  capability: 'watchlist_review',
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,

  async execute(_entities: ResolvedEntities, userId: string): Promise<ToolResult> {
    const { fields, cacheKeys } = await WatchlistRetriever.fetchWatchlist(userId);
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
