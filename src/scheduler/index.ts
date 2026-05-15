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

/**
 * initializeScheduler: The Ignition Point for Pulse Engine v2.
 * Switches from static cron polling to demand-driven institutional orchestration.
 */
export function initializeScheduler() {
  console.log('[SCHEDULER] 🚀 Initializing Pulse Engine v2 (Resilient Orchestration)...');

  // 1. PHASED STARTUP: Hand over to Recovery Manager
  // This starts the SyncCoordinator pulse loop with jitter and safety offsets.
  StartupRecoveryManager.initiateRecovery();

  // 2. PORTFOLIO HEARTBEAT: Tier 1 (1 Min)
  // Ensures Total Value, Day Change, and History are recalculated every minute.
  cron.schedule('* * * * *', () => {
    syncOrchestrator.dispatch(new PortfolioRevaluationJob());
  });

  // 2. BACKGROUND ANALYTICS: Tier 3 (1 Hour)
  // Focused exclusively on the Active Universe (Holdings + Active Views)
  cron.schedule(`0 * * * *`, () => {
    syncOrchestrator.dispatch(new IndianAnalyticsSyncJob());
    syncOrchestrator.dispatch(new UsAnalyticsSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 3. POST-SESSION SETTLEMENT: Tier 4 (Deep Sync)
  // Fires 15 minutes after market close to capture final daily metrics.
  // India (Market closes 3:30 PM IST)
  cron.schedule('45 15 * * *', () => {
    syncOrchestrator.dispatch(new IndianDeepSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // US (Market closes 4:00 PM EST)
  cron.schedule('15 16 * * *', () => {
    syncOrchestrator.dispatch(new UsDeepSyncJob());
  }, { timezone: 'America/New_York' });

  // 4. MAINTENANCE: Market Daily Reset (8:30 AM EST)
  cron.schedule('30 8 * * *', () => {
    syncOrchestrator.dispatch(new UsMarketResetJob());
  }, { timezone: 'America/New_York' });

  // 5. MASTER SEEDING: Tier 5 (Low-Priority Discovery Sweep)
  // Runs every hour to check for unseeded symbols at lowest P5 priority.
  cron.schedule('0 * * * *', () => {
    syncOrchestrator.dispatch(new IndianMasterSeedJob());
  }, { timezone: 'Asia/Kolkata' });

  console.log('[SCHEDULER] ✅ Institutional Orchestration Active.');
}
