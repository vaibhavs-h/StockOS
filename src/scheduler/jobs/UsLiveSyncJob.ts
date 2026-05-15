import { BaseJob } from '../core/BaseJob';
import { BatchAggregationService } from '../core/BatchAggregationService';
import { ActiveRegistryService } from '../core/ActiveRegistryService';
import { syncOrchestrator } from '../core/orchestrator';
import { PortfolioRevaluationJob } from './PortfolioRevaluationJob';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

/**
 * UsLiveSyncJob: The Institutional US Live Sync.
 * Refactored for Pulse Engine v2: Demand-driven and Coalesced.
 */
export class UsLiveSyncJob extends BaseJob {
  public readonly id = 'UsLiveSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_1_HOT,
    symbols: [], // Populated dynamically
    region: MarketRegion.US,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-live-quotes-us',
    retryCount: 0,
    maxRetries: 1
  };

  protected async process(): Promise<number> {
    const startTime = Date.now();
    
    // 1. Identify Demand-Driven Universe
    const { total: symbols } = await ActiveRegistryService.getActiveUniverse('US');
    
    if (symbols.length === 0) {
      console.log(`[JOB] ${this.id} | No active US demand found. Skipping.`);
      return 0;
    }

    console.log(`[JOB START] ${this.id} | US Symbols to process: ${symbols.length}`);
    
    // 2. Batch Sync Quotes (Greedy Aggregation + Coalescing)
    const results = await BatchAggregationService.fetchQuotesInBatches(symbols, 'US');

    const duration = Date.now() - startTime;
    console.log(`[JOB END] ${this.id} | Processed US: ${results.length} | Time: ${duration}ms`);
    
    // 3. ATOMIC HANDSHAKE: Trigger revaluation
    if (results.length > 0) {
      syncOrchestrator.dispatch(new PortfolioRevaluationJob());
    }

    return results.length;
  }
}
