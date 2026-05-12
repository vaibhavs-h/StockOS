import cron from 'node-cron';
import { syncOrchestrator } from './core/orchestrator';
import { IndianLiveSyncJob } from './jobs/IndianLiveSyncJob';
import { IndianAnalyticsSyncJob } from './jobs/IndianAnalyticsSyncJob';
import { IndianDeepSyncJob } from './jobs/IndianDeepSyncJob';
import { UsLiveSyncJob } from './jobs/UsLiveSyncJob';
import { UsAnalyticsSyncJob } from './jobs/UsAnalyticsSyncJob';
import { UsDeepSyncJob } from './jobs/UsDeepSyncJob';
import { PortfolioRevaluationJob } from './jobs/PortfolioRevaluationJob';
import { SYNC_CONFIG } from './config/sync.config';
import { MarketStatusEngine } from './core/MarketStatusEngine';
import { MarketRegion, MarketSession } from './core/types';

export function initializeScheduler() {
  console.log('[SCHEDULER] Initializing Zero-Failure Ingestion Engine...');

  // 1. TIER 1: Live Indian Equities (30 Sec Heartbeat)
  cron.schedule(`* * * * *`, () => {
    if (MarketStatusEngine.isMarketOpen(MarketRegion.IN) || MarketStatusEngine.isPremarket(MarketRegion.IN)) {
      syncOrchestrator.dispatch(new IndianLiveSyncJob());
      // Schedule the 30s offset
      setTimeout(() => syncOrchestrator.dispatch(new IndianLiveSyncJob()), 30000);
    }
  }, { timezone: 'Asia/Kolkata' });

  // 2. TIER 1: Live US Equities (Session-Aware Heartbeat)
  cron.schedule(`* * * * *`, () => {
    const session = MarketStatusEngine.getCurrentSession(MarketRegion.US);
    
    if (session === MarketSession.REGULAR) {
      syncOrchestrator.dispatch(new UsLiveSyncJob());
      setTimeout(() => syncOrchestrator.dispatch(new UsLiveSyncJob()), 30000);
    } else if (session === MarketSession.PREMARKET || session === MarketSession.AFTER_HOURS) {
      const min = new Date().getMinutes();
      if (min % 2 === 0) {
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

  // 5. TIER 3: Deep Indian Equities (Daily 18:00 IST)
  cron.schedule('0 18 * * *', () => {
    syncOrchestrator.dispatch(new IndianDeepSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 6. TIER 3: Deep US Equities (Daily 05:00 IST / 19:30 EST - Post Market)
  cron.schedule('0 5 * * *', () => {
    syncOrchestrator.dispatch(new UsDeepSyncJob());
  }, { timezone: 'Asia/Kolkata' });


  // 8. Virtual Portfolio Revaluation (30 Sec - High Frequency Virtual Update)
  cron.schedule(`* * * * *`, () => {
    const istTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const totalMinutes = istTime.getHours() * 60 + istTime.getMinutes();
    
    // 9:15 AM (555) to 3:30 PM (930)
    // We strictly stop revaluation at 3:30 PM to ensure broker data is the final truth.
    if (totalMinutes >= 555 && totalMinutes < 930) {
      syncOrchestrator.dispatch(new PortfolioRevaluationJob());
      setTimeout(() => {
        // Re-check time for the 30s offset to avoid running past 3:30:00
        const nowIst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const nowMins = nowIst.getHours() * 60 + nowIst.getMinutes();
        if (nowMins >= 555 && nowMins < 930) {
          syncOrchestrator.dispatch(new PortfolioRevaluationJob());
        }
      }, 30000);
    }
  }, { timezone: 'Asia/Kolkata' });


  // WARM START
  setTimeout(() => {
    console.log('[SCHEDULER] Injecting Warm Start Jobs...');
    syncOrchestrator.dispatch(new IndianLiveSyncJob());
    syncOrchestrator.dispatch(new UsLiveSyncJob());
    syncOrchestrator.dispatch(new UsAnalyticsSyncJob());
  }, 2000);
}



