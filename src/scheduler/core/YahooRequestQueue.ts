import { metricsService } from './OrchestrationMetricsService';

type Task = {
  id: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
  enqueuedAt: number;
};

/**
 * YahooRequestQueue v2: Institutional-Grade Request Orchestrator.
 * Enforces priority, concurrency, coalescing, and circuit-breaking.
 */
class YahooRequestQueue {
  private queue: Task[] = [];
  private activeCount: number = 0;
  private maxConcurrency: number = 5;
  private delayBetweenRequests: number = 500; 
  private lastRequestTime: number = 0;

  // Inflight Coalescing: id -> Promise
  private inflight: Map<string, Promise<any>> = new Map();

  // Circuit Breaker State
  private failureCount: number = 0;
  private totalRequestsInWindow: number = 0;
  private isPaused: boolean = false;
  private pauseStartedAt: number = 0;
  private readonly FAILURE_THRESHOLD = 0.3; 
  private readonly WINDOW_SIZE = 50;
  private readonly PAUSE_DURATION = 10 * 60 * 1000; 

  constructor() {
    console.log('[YAHOO-QUEUE] Pulse Engine Gateway v2 Initialized.');
  }

  /**
   * Enqueues a Yahoo Finance API request with priority and coalescing.
   */
  public async enqueue<T>(id: string, task: () => Promise<T>, priority: number = 10): Promise<T> {
    metricsService.recordRequest();

    // 1. Check for Inflight Coalescing
    const existing = this.inflight.get(id);
    if (existing) {
      metricsService.recordCoalesced();
      return existing;
    }

    // 2. Create the wrapper promise
    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        execute: task,
        resolve,
        reject,
        priority,
        enqueuedAt: Date.now()
      });

      // Sort by priority (Lower number = Higher Priority)
      this.queue.sort((a, b) => a.priority - b.priority);
      
      metricsService.updateQueueDepth(this.queue.length);
      this.process();
    });

    // Store in inflight map
    this.inflight.set(id, promise);
    // Chain .catch(() => {}) to prevent unhandled rejection warning, since the caller is already catching the returned main promise
    promise.finally(() => this.inflight.delete(id)).catch(() => {});

    return promise;
  }

  private async process(): Promise<void> {
    if (this.isPaused) {
      if (Date.now() - this.pauseStartedAt > this.PAUSE_DURATION) {
        console.log('[YAHOO-QUEUE] Circuit Breaker: Resetting after cooldown.');
        this.isPaused = false;
        this.failureCount = 0;
        this.totalRequestsInWindow = 0;
      } else {
        const remaining = this.PAUSE_DURATION - (Date.now() - this.pauseStartedAt);
        setTimeout(() => this.process(), Math.min(remaining + 1000, 30000));
        return;
      }
    }

    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    // Enforce inter-request delay
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.delayBetweenRequests) {
      setTimeout(() => this.process(), this.delayBetweenRequests - timeSinceLast);
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    this.lastRequestTime = Date.now();
    metricsService.updateQueueDepth(this.queue.length);

    const start = Date.now();
    try {
      const result = await task.execute();
      metricsService.recordYahooLatency(Date.now() - start);
      this.recordSuccess();
      task.resolve(result);
    } catch (error: any) {
      this.recordFailure();
      task.reject(error);
    } finally {
      this.activeCount--;
      // Small jitter to prevent synchronized bursts
      setTimeout(() => this.process(), Math.random() * 200);
    }
  }

  private recordSuccess() {
    this.totalRequestsInWindow++;
    this.checkCircuitBreaker();
  }

  private recordFailure() {
    this.totalRequestsInWindow++;
    this.failureCount++;
    this.checkCircuitBreaker();
  }

  private checkCircuitBreaker() {
    if (this.totalRequestsInWindow >= this.WINDOW_SIZE) {
      const errorRate = this.failureCount / this.totalRequestsInWindow;
      if (errorRate > this.FAILURE_THRESHOLD) {
        console.error(`[YAHOO-QUEUE] CIRCUIT BREAKER TRIGGERED: ${Math.round(errorRate * 100)}% failure rate.`);
        this.isPaused = true;
        this.pauseStartedAt = Date.now();
      }
      this.totalRequestsInWindow = 0;
      this.failureCount = 0;
    }
  }
}

export const yahooRequestQueue = new YahooRequestQueue();
