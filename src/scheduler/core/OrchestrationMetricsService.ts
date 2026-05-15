/**
 * OrchestrationMetricsService: The Telemetry Brain of StockOS.
 * Tracks queue depth, Yahoo latency, cache hits, and coalescing efficiency
 * for the Admin Command Center.
 */
export class OrchestrationMetricsService {
  private static instance: OrchestrationMetricsService;

  private metrics = {
    yahooLatency: [] as number[],
    cacheHits: 0,
    cacheMisses: 0,
    coalescedRequests: 0,
    totalRequests: 0,
    failedSymbols: new Set<string>(),
    queueDepth: 0,
    dbFlushes: 0,
    startTime: Date.now(),
    activeRegistryCount: 0,
    tierCounts: {
      EPHEMERAL: 0,
      HOT: 0,
      WARM: 0,
    } as Record<string, number>,
  };

  private constructor() {}

  public static getInstance(): OrchestrationMetricsService {
    if (!OrchestrationMetricsService.instance) {
      OrchestrationMetricsService.instance = new OrchestrationMetricsService();
    }
    return OrchestrationMetricsService.instance;
  }

  public recordYahooLatency(ms: number): void {
    this.metrics.yahooLatency.push(ms);
    if (this.metrics.yahooLatency.length > 100) this.metrics.yahooLatency.shift();
  }

  public recordCacheHit(): void { this.metrics.cacheHits++; }
  public recordCacheMiss(): void { this.metrics.cacheMisses++; }
  public recordCoalesced(): void { this.metrics.coalescedRequests++; }
  public recordRequest(): void { this.metrics.totalRequests++; }
  
  public recordFailure(symbol: string): void {
    this.metrics.failedSymbols.add(symbol);
  }

  public recordSuccess(symbol: string): void {
    this.metrics.failedSymbols.delete(symbol);
  }

  public updateQueueDepth(depth: number): void {
    this.metrics.queueDepth = depth;
  }

  public recordDbFlush(): void {
    this.metrics.dbFlushes++;
  }

  public updateActiveRegistryCount(count: number): void {
    this.metrics.activeRegistryCount = count;
  }

  public updateTierCounts(counts: Record<string, number>): void {
    this.metrics.tierCounts = { ...this.metrics.tierCounts, ...counts };
  }

  public getSummary() {
    const avgLatency = this.metrics.yahooLatency.length > 0 
      ? this.metrics.yahooLatency.reduce((a, b) => a + b, 0) / this.metrics.yahooLatency.length 
      : 0;

    return {
      uptime: Math.floor((Date.now() - this.metrics.startTime) / 1000),
      avgYahooLatency: Math.round(avgLatency),
      cacheHitRatio: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheHits / this.metrics.totalRequests).toFixed(2) 
        : '0.00',
      coalescingEfficiency: this.metrics.totalRequests > 0 
        ? (this.metrics.coalescedRequests / this.metrics.totalRequests).toFixed(2) 
        : '0.00',
      failedSymbolsCount: this.metrics.failedSymbols.size,
      queueDepth: this.metrics.queueDepth,
      dbFlushes: this.metrics.dbFlushes,
      totalRequests: this.metrics.totalRequests,
      activeRegistryCount: this.metrics.activeRegistryCount,
      tierCounts: this.metrics.tierCounts,
    };
  }
}

export const metricsService = OrchestrationMetricsService.getInstance();
