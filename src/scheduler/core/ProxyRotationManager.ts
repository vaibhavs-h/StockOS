import { ProxyAgent } from 'undici';
import { getCrumbClear } from 'yahoo-finance2/lib/getCrumb';

export class ProxyRotationManager {
  private static instance: ProxyRotationManager;
  private proxies: string[] = [];
  private agents: ProxyAgent[] = [];
  private currentIndex: number = -1;
  private registeredClients: any[] = [];

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
   * Registers a YahooFinance instance to be proxied.
   */
  public registerClient(client: any) {
    this.registeredClients.push(client);
    this.applyProxyToClient(client).catch(err => {
      console.error('[PROXY-MANAGER] Failed to apply proxy to client:', err.message);
    });
  }

  /**
   * Applies the current active proxy to a client instance.
   */
  private async applyProxyToClient(client: any) {
    if (this.currentIndex < 0 || this.currentIndex >= this.agents.length) return;
    const activeAgent = this.agents[this.currentIndex];
    if (client && client._opts) {
      if (!client._opts.fetchOptions) {
        client._opts.fetchOptions = {};
      }
      client._opts.fetchOptions.dispatcher = activeAgent;

      // Clear the cookie and crumb cache so a new proxy doesn't use stale session credentials
      if (client._opts.cookieJar) {
        try {
          await getCrumbClear(client._opts.cookieJar);
        } catch (err: any) {
          console.warn('[PROXY-MANAGER] Failed to clear crumb cache on client:', err.message);
        }
      }
    }
  }

  /**
   * Applies the active proxy agent to all registered clients.
   */
  private async applyActiveProxy() {
    if (this.currentIndex < 0 || this.currentIndex >= this.agents.length) return;
    
    const activeUrl = this.proxies[this.currentIndex];

    // Mask username/password for safe logging
    const maskedUrl = activeUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[PROXY-MANAGER] Active Proxy Swapped to Index [${this.currentIndex}]: ${maskedUrl}`);

    for (const client of this.registeredClients) {
      await this.applyProxyToClient(client);
    }
  }

  /**
   * Rotates to the next proxy in the round-robin pool.
   */
  public async rotate(): Promise<boolean> {
    if (this.agents.length <= 1) {
      console.log('[PROXY-MANAGER] Single or zero proxy configured. Cannot rotate.');
      return false;
    }

    this.currentIndex = (this.currentIndex + 1) % this.agents.length;
    await this.applyActiveProxy();
    return true;
  }

  /**
   * Analyzes an error to determine if it is a rate limit, auth failure, or connection drop
   * and triggers failover rotation automatically.
   */
  public async handleRequestFailure(error: any, failedIndex?: number): Promise<boolean> {
    if (!error) return false;

    const messages: string[] = [];
    const statusCodes: number[] = [];
    const codes: string[] = [];

    let current = error;
    let depth = 0;
    while (current && depth < 5) {
      if (current.message) {
        messages.push(String(current.message).toLowerCase());
      }
      
      const status = current.status || (current.response ? current.response.status : null);
      if (status) {
        statusCodes.push(Number(status));
      }
      
      if (current.message) {
        const match4xx = String(current.message).match(/\b(4\d{2})\b/);
        if (match4xx) {
          statusCodes.push(parseInt(match4xx[1], 10));
        }
      }

      if (current.code) {
        codes.push(String(current.code).toLowerCase());
      }
      
      current = current.cause;
      depth++;
    }

    const fullMsg = messages.join(' | ');
    const fullCode = codes.join(' | ');

    const isProxyAuthErr = fullMsg.includes('407') || fullMsg.includes('proxy authentication') || statusCodes.includes(407);
    const isRateLimit = 
      fullMsg.includes('429') || 
      statusCodes.includes(429) || 
      fullMsg.includes('402') || 
      statusCodes.includes(402) || 
      fullMsg.includes('403') || 
      statusCodes.includes(403);
      
    const isTimeout = 
      fullMsg.includes('timeout') || 
      fullMsg.includes('time out') || 
      fullMsg.includes('etimedout') || 
      fullCode.includes('timeout') || 
      fullCode.includes('und_err_connect_timeout');
      
    const isConnectionDrop = 
      fullMsg.includes('econnrefused') || 
      fullMsg.includes('econnreset') || 
      fullMsg.includes('und_err_connect') || 
      fullCode.includes('econnrefused') || 
      fullCode.includes('econnreset') || 
      fullCode.includes('und_err_connect') || 
      fullMsg.includes('request was cancelled') || 
      fullCode.includes('und_err_aborted') || 
      fullMsg.includes('http tunneling') ||
      fullMsg.includes('tunneling socket could not be established');

    const isBadRequest =
      fullMsg.includes('400') ||
      statusCodes.includes(400) ||
      fullMsg.includes('bad request') ||
      fullMsg.includes('crumb');

    if (isProxyAuthErr || isRateLimit || isTimeout || isConnectionDrop || isBadRequest) {
      console.warn(`[PROXY-MANAGER] Proxy request failed. Error: ${error.message}. Cause Chain: "${fullMsg}". Triggering rotation failover.`);
      
      if (failedIndex !== undefined && this.currentIndex !== failedIndex) {
        console.log(`[PROXY-MANAGER] Proxy already rotated from index [${failedIndex}] to [${this.currentIndex}] by another request. Skipping duplicate rotation.`);
        return true;
      }
      
      return await this.rotate();
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
