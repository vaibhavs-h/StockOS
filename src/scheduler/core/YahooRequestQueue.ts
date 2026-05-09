import { SYNC_CONFIG } from '../config/sync.config';

type Task = {
  id: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
};

/**
 * Centralized Yahoo Request Queue (Zero-Failure Ingestion Engine)
 * Enforces strict serialization, concurrency limits, and inter-request delays.
 */
class YahooRequestQueue {
  private queue: Task[] = [];
  private activeCount: number = 0;
  private maxConcurrency: number = 2;
  private delayBetweenRequests: number = 2000; // 2 seconds
  private lastRequestTime: number = 0;

  // Circuit Breaker State
  private failureCount: number = 0;
  private totalRequestsInWindow: number = 0;
  private isPaused: boolean = false;
  private pauseStartedAt: number = 0;
  private readonly FAILURE_THRESHOLD = 0.1; // 10%
  private readonly WINDOW_SIZE = 50;
  private readonly PAUSE_DURATION = 10 * 60 * 1000; // 10 minutes

  constructor() {
    console.log('[YAHOO-QUEUE] Ingestion Layer Initialized.');
  }

  /**
   * Enqueues a Yahoo Finance API request.
   */
  public async enqueue<T>(id: string, task: () => Promise<T>, priority: number = 10): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id,
        execute: task,
        resolve,
        reject,
        priority
      });

      // Sort by priority (Lower number = Higher Priority)
      this.queue.sort((a, b) => a.priority - b.priority);
      
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.isPaused) {
      if (Date.now() - this.pauseStartedAt > this.PAUSE_DURATION) {
        console.log('[YAHOO-QUEUE] Circuit Breaker: Resetting after cooldown.');
        this.isPaused = false;
        this.failureCount = 0;
        this.totalRequestsInWindow = 0;
      } else {
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

    try {
      const priorityLabel = task.priority <= 5 ? '🔴 HIGH' : task.priority <= 10 ? '🟠 MED' : '🟡 LOW';
      console.log(`[YAHOO-QUEUE] ⚡ EXEC | ${priorityLabel} | ID: ${task.id.padEnd(25)} | Pending: ${String(this.queue.length).padStart(3)}`);
      
      const result = await task.execute();
      this.recordSuccess();
      task.resolve(result);
    } catch (error) {
      console.error(`[YAHOO-QUEUE] ❌ FAIL | ID: ${task.id} | Error:`, (error as any).message);
      this.recordFailure();
      task.reject(error);
    } finally {
      this.activeCount--;
      // Small jitter to prevent synchronized bursts
      setTimeout(() => this.process(), Math.random() * 500);
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
        console.error(`\n[YAHOO-QUEUE] 🚨 CIRCUIT BREAKER TRIGGERED 🚨`);
        console.error(`[YAHOO-QUEUE] Error Rate: ${Math.round(errorRate * 100)}% | Window: ${this.WINDOW_SIZE}`);
        console.error(`[YAHOO-QUEUE] System paused for ${this.PAUSE_DURATION / 60000} mins.\n`);
        this.isPaused = true;
        this.pauseStartedAt = Date.now();
      }
      
      // Slide the window
      this.totalRequestsInWindow = 0;
      this.failureCount = 0;
    }
  }
}

export const yahooRequestQueue = new YahooRequestQueue();

