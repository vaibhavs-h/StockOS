import { SYNC_CONFIG } from '../config/sync.config';
import { JobMetadata } from './types';
import { syncOrchestrator } from './orchestrator';

export interface JobMetrics {
  durationMs: number;
  retries: number;
  failed: boolean;
  recordsProcessed: number;
  startTime: number | null;
  endTime: number | null;
}

/**
 * Base Worker Job
 * Abstract class designed to mimic a BullMQ worker processor.
 */
export abstract class BaseJob<T = any> {
  public abstract readonly id: string;
  public abstract readonly metadata: JobMetadata;
  public metrics: JobMetrics = {
    durationMs: 0,
    retries: 0,
    failed: false,
    recordsProcessed: 0,
    startTime: null,
    endTime: null,
  };

  /**
   * The actual business logic to be implemented by child classes.
   * Returns the number of records processed.
   */
  protected abstract process(data?: T): Promise<number>;

  /**
   * Executes the job with exponential backoff retries and metric tracking.
   */
  public async execute(data?: T): Promise<void> {
    this.metrics.startTime = Date.now();
    let attempt = 0;
    const maxRetries = this.metadata.maxRetries || 1;

    while (attempt <= maxRetries) {
      try {
        const recordsProcessed = await this.process(data);
        
        this.metrics.recordsProcessed = recordsProcessed || 0;
        this.metrics.endTime = Date.now();
        this.metrics.durationMs = this.metrics.endTime - this.metrics.startTime;
        this.metrics.failed = false;
        
        console.log(`\n[SYNC COMPLETED] ${this.id}`);
        console.log(`  Duration:  ${this.metrics.durationMs}ms`);
        console.log(`  Processed: ${this.metrics.recordsProcessed} records`);
        console.log(`  Status:    SUCCESS \n`);
        return;
      } catch (error: any) {
        attempt++;
        this.metrics.retries = attempt;
        
        if (attempt > maxRetries) {
          this.metrics.failed = true;
          this.metrics.endTime = Date.now();
          this.metrics.durationMs = this.metrics.endTime - this.metrics.startTime;
          console.error(`[JOB FAILED] ${this.id} exhausted retries. Final Error: ${error.message}`);
          throw error;
        }

        console.warn(`[JOB RETRY] ${this.id} failed (Attempt ${attempt}/${maxRetries}): ${error.message}`);
        
        // Wait before next attempt (Exponential Backoff with Jitter)
        const baseDelay = this.metadata.backoffDelayMs || 2000;
        const jitter = Math.random() * 1000; // 0-1s jitter
        const delay = (baseDelay * Math.pow(2, attempt - 1)) + jitter;
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Helper for sub-classes to perform dirty-checks against the orchestrator's snapshot cache.
   */
  protected shouldUpdate(symbol: string, payload: any): boolean {
    return syncOrchestrator.shouldUpdate(symbol, this.metadata.tier, payload);
  }

  /**
   * Commits a successful update to the snapshot cache.
   */
  protected commitSnapshot(symbol: string, payload: any): void {
    syncOrchestrator.commitSnapshot(symbol, this.metadata.tier, payload);
  }

  /**
   * Retrieves the previously committed snapshot for a given symbol.
   */
  protected getSnapshot(symbol: string): any | null {
    const symbolCache = (syncOrchestrator as any).snapshotCache.get(symbol);
    const lastPayloadJson = symbolCache?.get(this.metadata.tier);
    if (!lastPayloadJson) return null;
    try {
      return JSON.parse(lastPayloadJson);
    } catch {
      return null;
    }
  }

  /**
   * Compares the current payload with the cached snapshot and returns only the changed fields.
   * If no snapshot exists, returns the full payload.
   */
  protected getDiff(symbol: string, currentPayload: any): any {
    const symbolCache = (syncOrchestrator as any).snapshotCache.get(symbol);
    const lastPayloadJson = symbolCache?.get(this.metadata.tier);
    
    if (!lastPayloadJson) return currentPayload;

    try {
      const lastPayload = JSON.parse(lastPayloadJson);
      const diff: any = { symbol }; // Symbol is required for upsert onConflict
      let changed = false;

      const keys = Object.keys(currentPayload);
      for (const key of keys) {
        if (key === 'symbol' || key === 'updated_at') continue;
        if (currentPayload[key] !== lastPayload[key]) {
          diff[key] = currentPayload[key];
          changed = true;
        }
      }

      if (changed) {
        diff.updated_at = currentPayload.updated_at;
        syncOrchestrator.recordReduction(keys.length, Object.keys(diff).length);
        return diff;
      }
      
      return null; // No changes
    } catch {
      return currentPayload;
    }
  }
}
