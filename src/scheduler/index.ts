import cron from 'node-cron';
import { syncOrchestrator } from './core/orchestrator';
import { IndianAnalyticsSyncJob } from './jobs/IndianAnalyticsSyncJob';
import { IndianDeepSyncJob } from './jobs/IndianDeepSyncJob';
import { UsAnalyticsSyncJob } from './jobs/UsAnalyticsSyncJob';
import { UsDeepSyncJob } from './jobs/UsDeepSyncJob';
import { UsMarketResetJob } from './jobs/UsMarketResetJob';
import { StartupRecoveryManager } from './core/StartupRecoveryManager';
import { IndianMasterSeedJob } from './jobs/internal/IndianMasterSeedJob';
import { PortfolioRevaluationJob } from './jobs/PortfolioRevaluationJob';
import { AlphaVantageNewsSyncJob } from './jobs/AlphaVantageNewsSyncJob';
import { IndianNewsSyncJob } from './jobs/IndianNewsSyncJob';
import { MFMasterSeedJob } from './jobs/internal/MFMasterSeedJob';
import { DailyMorningPriceSyncJob } from './jobs/DailyMorningPriceSyncJob';


/**
 * initializeScheduler: The Ignition Point for Pulse Engine v2.
 * Switches from static cron polling to demand-driven institutional orchestration.
 */
export function initializeScheduler() {
  console.log('[SCHEDULER] Initializing Pulse Engine v2 (Resilient Orchestration)...');

  // Bootstrap the Price Alerts Registry on startup
  const { PriceAlertRegistryService } = require('./core/PriceAlertRegistryService');
  PriceAlertRegistryService.bootstrap().catch((err: any) => {
    console.error('[SCHEDULER] PriceAlertRegistryService bootstrap failed:', err.message);
  });

  // 1. PHASED STARTUP: Hand over to Recovery Manager
  // This starts the SyncCoordinator pulse loop with jitter and safety offsets.
  StartupRecoveryManager.initiateRecovery();

  // 2. PORTFOLIO HEARTBEAT: Tier 1 (Every 3 Hours)
  // Ensures Total Value, Day Change, and History are recalculated periodically.
  cron.schedule('0 */3 * * *', () => {
    syncOrchestrator.dispatch(new PortfolioRevaluationJob());
  });

  // Automated Price Alerts - Mid-Day Scan (staggered to 12:02 PM Monday-Friday)
  cron.schedule('2 12 * * 1-5', () => {
    const { AlertTriggerService } = require('./core/AlertTriggerService');
    AlertTriggerService.checkMidDayMovements().catch((err: any) => {
      console.error('[SCHEDULER] Mid-Day movements check failed:', err.message);
    });
  }, { timezone: 'Asia/Kolkata' });

  // Automated Price Alerts - End of Market summary (staggered to 3:47 PM Monday-Friday)
  cron.schedule('47 15 * * 1-5', () => {
    const { AlertTriggerService } = require('./core/AlertTriggerService');
    AlertTriggerService.checkEodSummary().catch((err: any) => {
      console.error('[SCHEDULER] EOD summary check failed:', err.message);
    });
  }, { timezone: 'Asia/Kolkata' });

  // 2. BACKGROUND ANALYTICS: Tier 3 (Daily Post-Market)
  // Focused on Active Universe (Holdings + Active Views) to capture daily moving averages and valuations.
  // India Analytics (Fires daily at 4:00 PM IST - 30 minutes after market close)
  cron.schedule(`0 16 * * *`, () => {
    syncOrchestrator.dispatch(new IndianAnalyticsSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // US Analytics (Fires daily at 5:00 PM EST - 60 minutes after market close for final settlements)
  cron.schedule(`0 17 * * *`, () => {
    syncOrchestrator.dispatch(new UsAnalyticsSyncJob());
  }, { timezone: 'America/New_York' });

  // 3. POST-SESSION SETTLEMENT: Tier 4 (Deep Sync)
  // Fires 15 minutes after market close to capture final daily metrics.
  // India (Market closes 3:30 PM IST)
  cron.schedule('45 15 * * *', () => {
    syncOrchestrator.dispatch(new IndianDeepSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 3b. MUTUAL FUND EOD INGESTION: Ingests AMFI daily NAVs (Fires daily at 11:30 PM, 11:35 PM, 11:40 PM, and 11:45 PM IST)
  cron.schedule('30,35,40,45 23 * * *', async () => {
    console.log('[SCHEDULER] Dispatching Nightly Mutual Fund EOD Sync...');
    try {
      const { mfSyncCoordinator } = require('./core/MFSyncCoordinator');
      await mfSyncCoordinator.syncActiveMutualFunds();
      
      // Revalue all portfolios immediately after mutual fund records are updated at EOD
      console.log('[SCHEDULER] Mutual Fund Sync complete. Triggering EOD Portfolio Revaluation...');
      syncOrchestrator.dispatch(new PortfolioRevaluationJob());

      // Trigger nightly MF NAV summary & MF price alert checking
      const { AlertTriggerService } = require('./core/AlertTriggerService');
      AlertTriggerService.checkMfNightlySummary().catch((err: any) => {
        console.error('[SCHEDULER] Nightly MF summary check failed:', err.message);
      });
    } catch (err: any) {
      console.error('[SCHEDULER] Nightly Mutual Fund Sync failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // US (Market closes 4:00 PM EST)
  cron.schedule('15 16 * * *', () => {
    syncOrchestrator.dispatch(new UsDeepSyncJob());
  }, { timezone: 'America/New_York' });

  // 4. MAINTENANCE: Market Daily Reset (8:30 AM EST)
  cron.schedule('30 8 * * *', () => {
    syncOrchestrator.dispatch(new UsMarketResetJob());
  }, { timezone: 'America/New_York' });

  // 4b. DAILY EVENING REFRESH: Tier 3 (4:00 PM IST)
  // Fetch prices for all Indian & US stock assets to maintain high-fidelity listings
  cron.schedule('0 16 * * *', () => {
    syncOrchestrator.dispatch(new DailyMorningPriceSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 5. MASTER SEEDING: Tier 5 (Weekly discovery sweep)
  // Runs once weekly on Sundays at 1:00 AM IST to check for new discoverable symbols.
  cron.schedule('0 1 * * 0', () => {
    syncOrchestrator.dispatch(new IndianMasterSeedJob());
  }, { timezone: 'Asia/Kolkata' });

  // 5b. MUTUAL FUND SEEDING: Tier 5 (Weekly discovery sweep)
  // Runs once weekly on Sundays at 2:00 AM IST to check for new mutual fund schemes (very heavy, takes 15-25m).
  cron.schedule('0 2 * * 0', () => {
    syncOrchestrator.dispatch(new MFMasterSeedJob());
  }, { timezone: 'Asia/Kolkata' });

  // 6. INTELLIGENCE NEWS FEED: Alpha Vantage (global) + Indian RSS — every 3 hours
  //    Alpha Vantage: 8 calls/day — extremely safe, well within 25/day free tier limit
  //    Indian RSS: free, no key required
  cron.schedule('0 */3 * * *', () => {
    syncOrchestrator.dispatch(new AlphaVantageNewsSyncJob());
    syncOrchestrator.dispatch(new IndianNewsSyncJob());
  });

  console.log('[SCHEDULER] Institutional Orchestration Active.');
}

