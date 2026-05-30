import { ProxyAgent, setGlobalDispatcher } from 'undici';

export class ProxyRotationManager {
  private static instance: ProxyRotationManager;
  private proxies: string[] = [];
  private agents: ProxyAgent[] = [];
  private currentIndex: number = -1;

  private constructor() {
    this.initializePool();
  }

  public static getInstance(): ProxyRotationManager {
    if (!ProxyRotationManager.instance) {
      ProxyRotationManager.instance = new ProxyRotationManager();
    }
    return ProxyRotationManager.instance;
  }

  /**
   * Initializes the proxy pool from environment variables.
   */
  private initializePool() {
    const rawUrls = process.env.PROXY_URLS || '';
    
    // Support comma-separated list of proxies
    this.proxies = rawUrls
      .split(',')
      .map(url => url.trim())
      .filter(Boolean);

    if (this.proxies.length === 0) {
      console.log('[PROXY-MANAGER] No proxies configured. Running on direct connection.');
      return;
    }

    // Build undici ProxyAgents
    this.agents = this.proxies.map(url => new ProxyAgent(url));
    this.currentIndex = 0;

    console.log(`[PROXY-MANAGER] Initialized pool with ${this.proxies.length} proxies.`);
    this.applyActiveProxy();
  }

  /**
   * Sets the global Undici dispatcher to the currently active proxy.
   */
  private applyActiveProxy() {
    if (this.currentIndex < 0 || this.currentIndex >= this.agents.length) return;
    
    const activeUrl = this.proxies[this.currentIndex];
    const activeAgent = this.agents[this.currentIndex];

    // Mask username/password for safe logging
    const maskedUrl = activeUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[PROXY-MANAGER] Active Proxy Swapped to Index [${this.currentIndex}]: ${maskedUrl}`);

    setGlobalDispatcher(activeAgent);
  }

  /**
   * Rotates to the next proxy in the round-robin pool.
   */
  public rotate(): boolean {
    if (this.agents.length <= 1) {
      console.log('[PROXY-MANAGER] Single or zero proxy configured. Cannot rotate.');
      return false;
    }

    this.currentIndex = (this.currentIndex + 1) % this.agents.length;
    this.applyActiveProxy();
    return true;
  }

  /**
   * Analyzes an error to determine if it is a rate limit, auth failure, or connection drop
   * and triggers failover rotation automatically.
   */
  public handleRequestFailure(error: any): boolean {
    if (!error) return false;

    const errMsg = String(error.message || '').toLowerCase();
    const statusCode = error.status || (error.response ? error.response.status : null);

    const isProxyAuthErr = errMsg.includes('407') || errMsg.includes('proxy authentication');
    const isRateLimit = errMsg.includes('429') || statusCode === 429;
    const isTimeout = errMsg.includes('timeout') || errMsg.includes('time out') || errMsg.includes('etimedout');
    const isConnectionDrop = errMsg.includes('econnrefused') || errMsg.includes('econnreset') || errMsg.includes('und_err_connect');

    if (isProxyAuthErr || isRateLimit || isTimeout || isConnectionDrop) {
      console.warn(`[PROXY-MANAGER] Proxy request failed. Error: ${error.message}. Triggering rotation failover.`);
      return this.rotate();
    }

    return false;
  }

  /**
   * Returns current proxy pool count.
   */
  public getPoolSize(): number {
    return this.agents.length;
  }

  /**
   * Returns active proxy index.
   */
  public getCurrentIndex(): number {
    return this.currentIndex;
  }
}

export const proxyRotationManager = ProxyRotationManager.getInstance();
