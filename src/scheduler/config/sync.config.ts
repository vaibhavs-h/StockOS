import 'dotenv/config';
import { RefreshTier, MarketSession } from '../core/types';

export const SYNC_CONFIG = {
  // Safe Yahoo Scaling Strategy
  CONCURRENCY: {
    MAX_CONCURRENT_JOBS: 2,           // For Render free-tier
    DELAY_BETWEEN_BATCHES_MS: 3000,   // Stagger window to prevent 429s
    BULLMQ_WORKER_CONCURRENCY: 5      // Future-proofing
  },
  
  TIERS: {
    [RefreshTier.TIER_1_HOT]: {
      baseIntervalMs: 60000, // 1 minute base tick
      sessionMultipliers: {
        [MarketSession.REGULAR]: 2,     // Every 2 mins (widened from 1 min — Render free-tier bandwidth budget; see MFMasterSeedJob fix + Aug 2026 bandwidth investigation)
        [MarketSession.PREMARKET]: 3,   // Every 3 mins
        [MarketSession.AFTER_HOURS]: 5, // Every 5 mins
        [MarketSession.CLOSED]: 0       // 0 = Disabled
      },
      batchSize: 100, // Safe for simple quote endpoints
      lockDurationMs: 60000,
      bullMqQueue: 'q-live-quotes',
      maxRetries: 1
    },
    [RefreshTier.TIER_2_ACTIVE]: {
      baseIntervalMs: 300000, // 5 minute base tick
      sessionMultipliers: {
        [MarketSession.REGULAR]: 2,     // Every 10 mins
        [MarketSession.PREMARKET]: 6,   // Every 30 mins
        [MarketSession.AFTER_HOURS]: 6, // Every 30 mins
        [MarketSession.CLOSED]: 12      // Every 60 mins (keep some updates flowing)
      },
      batchSize: 50,
      lockDurationMs: 300000,
      bullMqQueue: 'q-active-stats',
      maxRetries: 2
    },
    [RefreshTier.TIER_3_EXTENDED]: {
      baseIntervalMs: 3600000, // 1 hour base tick
      sessionMultipliers: {
        [MarketSession.REGULAR]: 0,     // NEVER run during market hours (protect live quote bandwidth)
        [MarketSession.PREMARKET]: 6,   // Every 6 hours
        [MarketSession.AFTER_HOURS]: 6, // Every 6 hours
        [MarketSession.CLOSED]: 12      // Every 12 hours
      },
      batchSize: 20, // Heavy modules: financialData, recommendationTrend
      lockDurationMs: 1800000, // 30 mins lock
      bullMqQueue: 'q-extended-fundamentals',
      maxRetries: 3
    },
    [RefreshTier.TIER_4_DAILY]: {
      baseIntervalMs: 86400000, // 24 hour base tick
      sessionMultipliers: {
        [MarketSession.REGULAR]: 0,     // Strictly closed hours only
        [MarketSession.PREMARKET]: 0,
        [MarketSession.AFTER_HOURS]: 0,
        [MarketSession.CLOSED]: 1       // Once daily
      },
      batchSize: 10, // Very heavy: SEC filings, Holders
      lockDurationMs: 3600000,
      bullMqQueue: 'q-daily-deep',
      maxRetries: 3
    },
    [RefreshTier.TIER_5_STATIC]: {
      baseIntervalMs: 604800000, // 7 days base tick
      sessionMultipliers: {
        [MarketSession.REGULAR]: 0,
        [MarketSession.PREMARKET]: 0,
        [MarketSession.AFTER_HOURS]: 0,
        [MarketSession.CLOSED]: 1       // Once weekly
      },
      batchSize: 50, // Profile data
      lockDurationMs: 86400000,
      bullMqQueue: 'q-static-meta',
      maxRetries: 3
    }
  }
};
