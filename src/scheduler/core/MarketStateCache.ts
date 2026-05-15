import { MarketRegion } from './types';

/**
 * MarketStateCache: The Memory-First Shield for StockOS Pulse Engine.
 * This service reduces Supabase write amplification by storing live snapshots,
 * heartbeat timestamps, and inflight states in RAM.
 */
export class MarketStateCache {
  private static instance: MarketStateCache;

  // Live Quote Snapshots: symbol -> data
  private snapshots: Map<string, any> = new Map();
  
  // Last Human Heartbeat: symbol -> timestamp
  private heartbeats: Map<string, number> = new Map();

  // Inflight Request Coalescing: symbol -> Promise
  private inflight: Map<string, Promise<any>> = new Map();

  // Dirty Flags: Track symbols that need a DB flush
  private dirty: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): MarketStateCache {
    if (!MarketStateCache.instance) {
      MarketStateCache.instance = new MarketStateCache();
    }
    return MarketStateCache.instance;
  }

  /**
   * Updates the heartbeat for a symbol, marking it as 'EPHEMERAL' or active.
   */
  public updateHeartbeat(symbol: string): void {
    this.heartbeats.set(symbol, Date.now());
  }

  /**
   * Gets symbols that have been viewed within the last X minutes.
   */
  public getActiveViews(timeoutMs: number = 2 * 60 * 1000): string[] {
    const now = Date.now();
    const active: string[] = [];
    for (const [symbol, timestamp] of Array.from(this.heartbeats.entries())) {
      if (now - timestamp < timeoutMs) {
        active.push(symbol);
      }
    }
    return active;
  }

  /**
   * Stores a new snapshot and checks for deltas.
   * Marks symbol as 'dirty' for the next periodic DB flush.
   */
  public setSnapshot(symbol: string, data: any): boolean {
    const old = this.snapshots.get(symbol);
    
    // Only mark dirty if price, volume, or change changed significantly
    const hasChanged = !old || 
                       old.price !== data.price || 
                       old.volume !== data.volume ||
                       old.changePercent !== data.changePercent;

    if (hasChanged) {
      this.snapshots.set(symbol, { ...old, ...data, last_synced_at: new Date() });
      this.dirty.add(symbol);
    }

    return hasChanged;
  }

  public getSnapshot(symbol: string): any | null {
    return this.snapshots.get(symbol) || null;
  }

  /**
   * Request Coalescing: Check if a fetch is already in progress for this symbol.
   */
  public getInflight(symbol: string): Promise<any> | null {
    return this.inflight.get(symbol) || null;
  }

  public setInflight(symbol: string, promise: Promise<any>): void {
    this.inflight.set(symbol, promise);
    // Cleanup once finished
    promise.finally(() => this.inflight.delete(symbol));
  }

  /**
   * Returns symbols that need to be flushed to the database.
   */
  public getDirtySymbols(): string[] {
    return Array.from(this.dirty);
  }

  public clearDirty(symbol: string): void {
    this.dirty.delete(symbol);
  }
}

export const marketStateCache = MarketStateCache.getInstance();
