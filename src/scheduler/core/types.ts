export enum RefreshTier {
  TIER_1_HOT = 'TIER_1_HOT',         // 1-3 min: Live quotes, volume, bid/ask
  TIER_2_ACTIVE = 'TIER_2_ACTIVE',     // 10-30 min: Market cap, PE, basic moving averages
  TIER_3_EXTENDED = 'TIER_3_EXTENDED', // 6-24 hours: Financials, deep stats, targets
  TIER_4_DAILY = 'TIER_4_DAILY',       // 24 hours: Holders, SEC, dividends, ATH/ATL
  TIER_5_STATIC = 'TIER_5_STATIC'      // Weekly: Metadata, descriptions, industry
}

export enum QueuePriority {
  CRITICAL = 5,    // Absolute Priority: Broker Sync (Main)
  PORTFOLIO = 10,   // Highest: Directly owned assets revaluation
  WATCHLIST = 20,   // High: User tracking
  TRENDING = 30,    // Medium: Market movers / Homepage
  DEFAULT = 40      // Lowest: Standard background sweep
}

export enum MarketSession {
  PREMARKET = 'PREMARKET',
  REGULAR = 'REGULAR',
  AFTER_HOURS = 'AFTER_HOURS',
  CLOSED = 'CLOSED'
}

export enum MarketRegion {
  US = 'US',
  IN = 'IN'
}

export enum AssetType {
  STOCK = 'STOCK',
  ETF = 'ETF',
  INDEX = 'INDEX',
  MUTUAL_FUND = 'MUTUAL_FUND',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY',
  CURRENCY = 'CURRENCY',
  FOREX = 'FOREX'
}

export interface MarketAsset {
  s: string;
  n: string;
  assetType: AssetType;
  region: MarketRegion;
  exchange?: string;
  currency?: string;
  indexMemberships?: string[];
  priorityGroup?: string;
  isSP500?: boolean;
  isNASDAQ100?: boolean;
  isDOW30?: boolean;
  isNIFTY50?: boolean;
  isNIFTYTOTAL?: boolean;
}

export interface JobMetadata {
  id: string; // Unique BullMQ Job ID equivalent
  tier: RefreshTier;
  symbols: string[];
  region: MarketRegion;
  priority: QueuePriority;
  bullMqQueueName: string;
  retryCount: number;
  maxRetries: number;
  
  // Future BullMQ Migration Metadata
  backoffDelayMs?: number;    // Retry metadata
  lockDurationMs?: number;    // Lock metadata
  repeatCron?: string;        // Scheduling metadata
  batchSize?: number;         // Batching metadata
  cacheTtlMs?: number;        // Cache TTL metadata
}

export interface BatchMetadata {
  batchId: string;
  totalItems: number;
  processedCount: number;
  failedCount: number;
  createdAt: number;
}
