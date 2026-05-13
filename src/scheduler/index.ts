import cron from 'node-cron';
import { syncOrchestrator } from './core/orchestrator';
import { IndianLiveSyncJob } from './jobs/IndianLiveSyncJob';
import { IndianAnalyticsSyncJob } from './jobs/IndianAnalyticsSyncJob';
import { IndianDeepSyncJob } from './jobs/IndianDeepSyncJob';
import { UsLiveSyncJob } from './jobs/UsLiveSyncJob';
import { UsAnalyticsSyncJob } from './jobs/UsAnalyticsSyncJob';
import { UsDeepSyncJob } from './jobs/UsDeepSyncJob';
import { UsMarketResetJob } from './jobs/UsMarketResetJob';
import { PortfolioRevaluationJob } from './jobs/PortfolioRevaluationJob';
import { SYNC_CONFIG } from './config/sync.config';
import { MarketStatusEngine } from './core/MarketStatusEngine';
import { MarketRegion, MarketSession } from './core/types';

export function initializeScheduler() {
  console.log('[SCHEDULER] Initializing Zero-Failure Ingestion Engine...');

  // 1. TIER 1: Live Indian Equities (10 Sec Heartbeat when Open, 15 Min when Closed)
  cron.schedule(`* * * * *`, () => {
    const status = MarketStatusEngine.isMarketOpen(MarketRegion.IN) || MarketStatusEngine.isPremarket(MarketRegion.IN);
    
    if (status) {
      // Fire at 0, 10, 20, 30, 40, 50 seconds
      [0, 10, 20, 30, 40, 50].forEach(offset => {
        setTimeout(() => syncOrchestrator.dispatch(new IndianLiveSyncJob()), offset * 1000);
      });
    } else {
      // Heartbeat for Closed Market (Every 15 mins to lock in final data)
      const min = new Date().getMinutes();
      if (min % 15 === 0) {
        syncOrchestrator.dispatch(new IndianLiveSyncJob());
      }
    }
  }, { timezone: 'Asia/Kolkata' });

  // 2. TIER 1: Live US Equities (Session-Aware 15 Sec Heartbeat)
  cron.schedule(`* * * * *`, () => {
    const session = MarketStatusEngine.getCurrentSession(MarketRegion.US);
    
    if (session === MarketSession.REGULAR) {
      // Fire at 0, 15, 30, 45 seconds (Balanced for safety)
      [0, 15, 30, 45].forEach(offset => {
        setTimeout(() => syncOrchestrator.dispatch(new UsLiveSyncJob()), offset * 1000);
      });
    } else if (session === MarketSession.PREMARKET || session === MarketSession.AFTER_HOURS) {
      const min = new Date().getMinutes();
      if (min % 15 === 0) {
        syncOrchestrator.dispatch(new UsLiveSyncJob());
      }
    }
  }, { timezone: 'America/New_York' });

  // 3. TIER 2: Indian Analytics & Valuation (15 Min Rolling Window)
  cron.schedule(`*/15 * * * *`, () => {
    syncOrchestrator.dispatch(new IndianAnalyticsSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 4. TIER 2: US Analytics & Valuation (15 Min Rolling Window)
  cron.schedule(`*/15 * * * *`, () => {
    const session = MarketStatusEngine.getCurrentSession(MarketRegion.US);
    if (session !== MarketSession.CLOSED) {
      syncOrchestrator.dispatch(new UsAnalyticsSyncJob());
    }
  }, { timezone: 'America/New_York' });

  // 5. TIER 3: Deep Indian Equities (Daily 00:00 IST - Midnight Settlement)
  cron.schedule('0 0 * * *', () => {
    syncOrchestrator.dispatch(new IndianDeepSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 6. TIER 3: Deep US Equities (Daily 05:00 IST / 19:30 EST - Post Market)
  cron.schedule('0 5 * * *', () => {
    syncOrchestrator.dispatch(new UsDeepSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 7. TIER 4: US Market Daily Reset (8:30 AM EST - 1 Hr before Open)
  cron.schedule('30 8 * * *', () => {
    syncOrchestrator.dispatch(new UsMarketResetJob());
  }, { timezone: 'America/New_York' });


  // 8. Virtual Portfolio Revaluation (Atomic Trigger via LiveSyncJobs)
  // No longer needed as a separate cron job. It is triggered directly by IndianLiveSyncJob and UsLiveSyncJob.


  // WARM START
  setTimeout(() => {
    console.log('[SCHEDULER] Injecting Warm Start Jobs...');
    syncOrchestrator.dispatch(new IndianLiveSyncJob());
    syncOrchestrator.dispatch(new UsLiveSyncJob());
    syncOrchestrator.dispatch(new UsAnalyticsSyncJob());
  }, 2000);
}



