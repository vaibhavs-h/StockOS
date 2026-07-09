import { MFActiveRegistryService } from './MFActiveRegistryService';
import { syncOrchestrator } from './orchestrator';

export class MFSyncCoordinator {
  private static instance: MFSyncCoordinator;
  private isSyncing: boolean = false;

  private constructor() { }

  public static getInstance(): MFSyncCoordinator {
    if (!MFSyncCoordinator.instance) {
      MFSyncCoordinator.instance = new MFSyncCoordinator();
    }
    return MFSyncCoordinator.instance;
  }

  /**
   * Orchestrates the daily sync heartbeat for all active mutual funds.
   */
  public async syncActiveMutualFunds(): Promise<number> {
    if (this.isSyncing) {
      console.warn('[MF-MAESTRO] A mutual fund sync cycle is already in progress. Skipping...');
      return 0;
    }

    this.isSyncing = true;
    const startTime = Date.now();
    console.log('[MF-MAESTRO] Mutual Fund Daily Sync Sequence Initiated...');

    try {
      // 1. Identify active mutual funds from dynamic registry
      const universe = await MFActiveRegistryService.getActiveUniverse();
      const activeSchemes = universe.total;

      if (activeSchemes.length === 0) {
        console.log('[MF-MAESTRO] No active mutual funds found. Ingestion skipped.');
        this.isSyncing = false;
        return 0;
      }

      console.log(`[MF-MAESTRO] Syncing ${activeSchemes.length} Active Mutual Funds...`);

      // 2. Fetch and execute the Modular Ingestion Sync Job
      const { MutualFundSyncJob } = require('../jobs/MutualFundSyncJob');
      const syncJob = new MutualFundSyncJob();

      // Dispatch the job through our orchestrator so metrics and retries are recorded
      await syncOrchestrator.dispatch(syncJob, activeSchemes);

      // 3. Trigger immediate portfolio revaluations
      console.log('[MF-MAESTRO] NAV Ingestion succeeded. Starting portfolio revaluations...');
      const { MFPortfolioRevaluationJob } = require('../jobs/MFPortfolioRevaluationJob');
      const revalJob = new MFPortfolioRevaluationJob();
      await syncOrchestrator.dispatch(revalJob);

      // 3b. Trigger Yahoo Finance enrichment for active mutual funds
      console.log('[MF-MAESTRO] Portfolio revaluation succeeded. Starting Yahoo Finance enrichment...');
      try {
        const { MFYahooEnrichJob } = require('../jobs/internal/MFYahooEnrichJob');
        const enrichJob = new MFYahooEnrichJob(200, false);
        await syncOrchestrator.dispatch(enrichJob);
      } catch (enrichErr: any) {
        console.error('[MF-MAESTRO] Background Yahoo enrichment failed:', enrichErr.message);
      }

      // 4. Persist and prune the dynamic registry table
      await MFActiveRegistryService.persistActiveRegistry(activeSchemes);

      const duration = Date.now() - startTime;
      console.log(`[MF-MAESTRO] Sync sequence completed in ${duration}ms.`);
      this.isSyncing = false;
      return activeSchemes.length;

    } catch (error: any) {
      console.error('[MF-MAESTRO] Daily sync sequence crashed:', error.message || error);
      this.isSyncing = false;
      throw error;
    }
  }
}

export const mfSyncCoordinator = MFSyncCoordinator.getInstance();
