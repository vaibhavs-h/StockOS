import cron from 'node-cron';
import { syncOrchestrator } from './core/orchestrator';
import { IndianLiveSyncJob } from './jobs/IndianLiveSyncJob';
import { IndianAnalyticsSyncJob } from './jobs/IndianAnalyticsSyncJob';
import { IndianDeepSyncJob } from './jobs/IndianDeepSyncJob';
import { UsLiveSyncJob } from './jobs/UsLiveSyncJob';
import { UsAnalyticsSyncJob } from './jobs/UsAnalyticsSyncJob';
import { UsDeepSyncJob } from './jobs/UsDeepSyncJob';
import { PortfolioSyncJob } from './jobs/PortfolioSyncJob';
import { SYNC_CONFIG } from './config/sync.config';
import { MarketStatusEngine } from './core/MarketStatusEngine';
import { MarketRegion, MarketSession } from './core/types';

export function initializeScheduler() {
  console.log('[SCHEDULER] Initializing Zero-Failure Ingestion Engine...');

  // 1. TIER 1: Live Indian Equities (1 Min Heartbeat)
  cron.schedule(`* * * * *`, () => {
    syncOrchestrator.dispatch(new IndianLiveSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 2. TIER 1: Live US Equities (Session-Aware Heartbeat)
  cron.schedule(`* * * * *`, () => {
    const session = MarketStatusEngine.getCurrentSession(MarketRegion.US);
    
    if (session === MarketSession.REGULAR) {
      // Full Speed during Market Hours
      syncOrchestrator.dispatch(new UsLiveSyncJob());
    } else if (session === MarketSession.PREMARKET || session === MarketSession.AFTER_HOURS) {
      // Reduced Frequency (Every 2 minutes) for Extended Hours
      const min = new Date().getMinutes();
      if (min % 2 === 0) {
        syncOrchestrator.dispatch(new UsLiveSyncJob());
      }
    }
    // CLOSED: No Tier 1 sync
  }, { timezone: 'America/New_York' });

  // 3. TIER 2: Indian Analytics & Valuation (15 Min Rolling Window)
  cron.schedule(`*/15 * * * *`, () => {
    syncOrchestrator.dispatch(new IndianAnalyticsSyncJob());
  }, { timezone: 'Asia/Kolkata' });

  // 4. TIER 2: US Analytics & Valuation (15 Min Rolling Window)
  cron.schedule(`*/15 * * * *`, () => {
    const session = MarketStatusEngine.getCurrentSession(MarketRegion.US);
    // Sync during all active sessions, including extended
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

  // 7. Portfolio Sync (5 Min - Market Hours Only)
  cron.schedule(`*/5 * * * *`, () => {
    if (MarketStatusEngine.isMarketOpen(MarketRegion.IN)) {
      syncOrchestrator.dispatch(new PortfolioSyncJob());
    }
  }, { timezone: 'Asia/Kolkata' });


  // WARM START
  setTimeout(() => {
    console.log('[SCHEDULER] Injecting Warm Start Jobs...');
    syncOrchestrator.dispatch(new PortfolioSyncJob());
    syncOrchestrator.dispatch(new IndianLiveSyncJob());
    syncOrchestrator.dispatch(new UsLiveSyncJob());
    syncOrchestrator.dispatch(new UsAnalyticsSyncJob());
  }, 2000);
}



