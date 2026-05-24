import { BaseJob } from './BaseJob';
import { syncLockManager } from './LockManager';
import { SYNC_CONFIG } from '../config/sync.config';
import { JobMetadata, QueuePriority } from './types';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface QueueItem {
  jobId: string;
  job: BaseJob;
  metadata: JobMetadata;
  data?: any;
  status: JobStatus;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  resolve?: (value: { success: boolean; error?: any }) => void;
}

export interface QueueMetrics {
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  totalProcessed: number;
  skippedWrites: number;
  dirtyCheckHits: number;
  dirtyCheckMisses: number;
  avgPayloadReductionPct: number;
  totalPayloadReduction: number;
  totalFieldsProcessed: number;
  activeLocks: number;
  totalErrors: number;
  avgQueueLagMs: number;
}

/**
 * In-Memory Queue Orchestrator
 * Simulates a BullMQ/Redis setup. Dispatches jobs to simulated workers based on strict Priority queues.
 */
class SyncOrchestrator {
  private queue: QueueItem[] = [];
  private activeWorkers: number = 0;
  private logs: { timestamp: string, message: string, type: 'info' | 'success' | 'error' | 'warn' }[] = [];
  
  public addLog(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
    const log = { timestamp: new Date().toISOString(), message, type };
    this.logs.push(log);
    if (this.logs.length > 1000) this.logs.shift();
    return log;
  }

  public getLogs() {
    return this.logs;
  }
  
  // Lifetime metrics
  private metrics: QueueMetrics = {
    pendingCount: 0,
    runningCount: 0,
    completedCount: 0,
    failedCount: 0,
    totalProcessed: 0,
    skippedWrites: 0,
    dirtyCheckHits: 0,
    dirtyCheckMisses: 0,
    avgPayloadReductionPct: 0,
    totalPayloadReduction: 0,
    totalFieldsProcessed: 0,
    activeLocks: 0,
    totalErrors: 0,
    avgQueueLagMs: 0
  };

  private totalLagTimeMs: number = 0;

  // Snapshot cache for dirty checking (symbol -> { tier -> payloadHash })
  private snapshotCache: Map<string, Map<string, string>> = new Map();

  /**
   * Dispatches a job to the queue. 
   * Mimics `BullQueue.add()`
   */
  public dispatch(job: BaseJob, data?: any): Promise<{ success: boolean; error?: any }> {
    if (syncLockManager.isLocked(job.id)) {
      console.log(`[QUEUE SKIP] Job ${job.id} is already in the queue or running.`);
      return Promise.resolve({ success: false, error: new Error('Job is locked') });
    }

    // Acquire lock to prevent duplicate enqueues
    syncLockManager.acquire(job.id);
    this.metrics.activeLocks++;
    
    return new Promise<{ success: boolean; error?: any }>((resolve) => {
      this.queue.push({
        jobId: job.id,
        job,
        metadata: job.metadata,
        data,
        status: 'pending',
        addedAt: Date.now(),
        resolve
      });

      this.metrics.pendingCount++;

      const logMsg = `[ORCHESTRATOR] DISPATCH | ${job.id.padEnd(20)} | Priority: ${job.metadata.priority}`;
      this.addLog(logMsg, 'info');
      console.log(logMsg + ` | Queue: ${job.metadata.bullMqQueueName}`);
      
      // Sort queue strictly by priority (Lower number = Higher Priority)
      // BullMQ standard: 1 is highest priority.
      this.queue.sort((a, b) => {
        // Only sort pending items. Running items stay where they are.
        if (a.status !== 'pending') return -1;
        if (b.status !== 'pending') return 1;
        return a.metadata.priority - b.metadata.priority;
      });

      // Trigger worker loop
      this.processQueue();
    });
  }

  /**
   * The worker loop. Processes pending jobs up to the configured concurrency limit.
   */
  private async processQueue(): Promise<void> {
    if (this.activeWorkers >= SYNC_CONFIG.CONCURRENCY.MAX_CONCURRENT_JOBS) {
      return; // Max workers reached
    }

    const pendingItemIndex = this.queue.findIndex(item => item.status === 'pending');
    if (pendingItemIndex === -1) {
      return; // No pending jobs
    }

    this.activeWorkers++;
    this.metrics.pendingCount--;
    this.metrics.runningCount++;

    const item = this.queue[pendingItemIndex];
    item.status = 'running';
    item.startedAt = Date.now();
    
    // Track queue lag
    const lag = item.startedAt - item.addedAt;
    this.totalLagTimeMs += lag;
    this.metrics.avgQueueLagMs = this.totalLagTimeMs / (this.metrics.totalProcessed + 1) || 0;

    const logMsg = `[ORCHESTRATOR] RUNNING  | ${item.jobId.padEnd(20)} | Lag: ${lag}ms`;
    this.addLog(logMsg, 'info');
    console.log(logMsg);

    try {
      await item.job.execute(item.data);
      item.status = 'completed';
      this.metrics.completedCount++;
      const logMsg = `[ORCHESTRATOR] SUCCESS  | ${item.jobId.padEnd(20)} | Time: ${Date.now() - item.startedAt}ms`;
      this.addLog(logMsg, 'success');
      console.log(logMsg);
      if (item.resolve) {
        item.resolve({ success: true });
      }
    } catch (error) {
      item.status = 'failed';
      this.metrics.failedCount++;
      this.metrics.totalErrors++;
      const logMsg = `[ORCHESTRATOR] FAILED   | ${item.jobId.padEnd(20)} | Error: ${(error as any).message}`;
      this.addLog(logMsg, 'error');
      console.error(logMsg);
      if (item.resolve) {
        item.resolve({ success: false, error });
      }
    } finally {
      item.completedAt = Date.now();
      this.metrics.runningCount--;
      this.metrics.totalProcessed++;
      this.activeWorkers--;
      
      syncLockManager.release(item.jobId);
      this.metrics.activeLocks--;
      
      // Clean up the job from the queue array after a brief delay
      setTimeout(() => {
        const index = this.queue.findIndex(q => q.jobId === item.jobId);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
      }, 10000);

      // Stagger delays between batches for Yahoo API Safety
      setTimeout(() => {
        this.processQueue();
      }, SYNC_CONFIG.CONCURRENCY.DELAY_BETWEEN_BATCHES_MS);
    }
  }


  public getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Performs a dirty check against the last successfully processed payload.
   * Returns true if the payload has changed or is new for this tier.
   */
  public shouldUpdate(symbol: string, tier: string, payload: any): boolean {
    const symbolCache = this.snapshotCache.get(symbol) || new Map<string, string>();
    const currentHash = JSON.stringify(payload);
    const lastHash = symbolCache.get(tier);

    if (lastHash === currentHash) {
      this.metrics.dirtyCheckHits++;
      return false;
    }

    this.metrics.dirtyCheckMisses++;
    return true;
  }

  /**
   * Commits a successful update to the snapshot cache.
   */
  public commitSnapshot(symbol: string, tier: string, payload: any): void {
    let symbolCache = this.snapshotCache.get(symbol);
    if (!symbolCache) {
      symbolCache = new Map<string, string>();
      this.snapshotCache.set(symbol, symbolCache);
    }
    symbolCache.set(tier, JSON.stringify(payload));
  }

  /**
   * Clears the entire snapshot cache for a given region (filtering by symbol universe).
   * Used for daily session resets.
   */
  public clearSnapshots(region: string): void {
    console.log(`[ORCHESTRATOR] PURGE | Region: ${region}`);
    const symbols = Array.from(this.snapshotCache.keys());
    let count = 0;
    for (const symbol of symbols) {
      // In this architecture, we don't have a direct map of symbol -> region here, 
      // but we can clear everything or implement a simple check if needed.
      // For now, clearing all is safest to ensure no stale data remains across the engine.
      this.snapshotCache.delete(symbol);
      count++;
    }
    console.log(`[ORCHESTRATOR] SUCCESS | Purged ${count} snapshots.`);
  }

  public recordWriteSkip(): void {
    this.metrics.skippedWrites++;
  }

  public recordReduction(totalFields: number, reducedFields: number): void {
    this.metrics.totalFieldsProcessed += totalFields;
    this.metrics.totalPayloadReduction += (totalFields - reducedFields);
    if (this.metrics.totalFieldsProcessed > 0) {
      this.metrics.avgPayloadReductionPct = (this.metrics.totalPayloadReduction / this.metrics.totalFieldsProcessed) * 100;
    }
  }
}

export const syncOrchestrator = new SyncOrchestrator();
