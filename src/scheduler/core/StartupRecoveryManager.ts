import { syncCoordinator } from './SyncCoordinator';

/**
 * StartupRecoveryManager: Protects Yahoo during cold boots.
 * Ensures the Pulse Engine wakes up in phases to prevent request storms.
 */
export class StartupRecoveryManager {
  private static BOOT_DELAY_MS = 10000; // 10s delay for Live
  private static DEEP_DELAY_MS = 10 * 60 * 1000; // 10m delay for Deep Sync

  /**
   * Initializes the engine with staggered phases.
   */
  public static async initiateRecovery() {
    console.log('[RECOVERY] Cold Boot Detected. Initializing Phased Awakening...');

    // Phase 1: Live Pulse (The Heart)
    // Wait a few seconds to let network/DB stabilize, then start Live Sync
    setTimeout(() => {
      console.log('[RECOVERY] Phase 1: Awakening Live Pulse Engine...');
      syncCoordinator.start();
      
      // Trigger an immediate portfolio revaluation to ensure dashboard is fresh
      const { syncOrchestrator } = require('./orchestrator');
      const { PortfolioRevaluationJob } = require('../jobs/PortfolioRevaluationJob');
      syncOrchestrator.dispatch(new PortfolioRevaluationJob());

      // Trigger an immediate news sync to ensure caching feeds are seeded
      const { AlphaVantageNewsSyncJob } = require('../jobs/AlphaVantageNewsSyncJob');
      const { IndianNewsSyncJob } = require('../jobs/IndianNewsSyncJob');
      syncOrchestrator.dispatch(new AlphaVantageNewsSyncJob());
      syncOrchestrator.dispatch(new IndianNewsSyncJob());
    }, this.BOOT_DELAY_MS);

    // Phase 2: Analytics & Deep Sync (The Organs)
    // Delay heavy background jobs to prevent Yahoo pattern detection
    setTimeout(() => {
      console.log('[RECOVERY] Phase 2: Restoring Analytics & Deep Sync Jobs...');
      // This will be used by the SyncCoordinator to enable/disable specific job tiers
    }, this.DEEP_DELAY_MS);
  }

  /**
   * Helper to check if the system is still in 'Warm-up' phase.
   */
  public static isWarmingUp(): boolean {
    // Logic to determine if we should still be throttling
    return false; // For now, keep it simple
  }
}
