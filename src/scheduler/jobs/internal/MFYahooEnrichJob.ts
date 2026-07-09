import { BaseJob } from '../../core/BaseJob';
import { SupabaseProvider } from '../../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../../core/types';
import YahooFinance from 'yahoo-finance2';
import { proxyRotationManager } from '../../core/ProxyRotationManager';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  fetchOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0'
    }
  }
});
proxyRotationManager.registerClient(yahooFinance);


/**
 * MFYahooEnrichJob: Yahoo Finance Symbol Matcher & Enricher.
 *
 * Iterates through mutual_funds_master rows where symbol IS NULL and attempts
 * to find the corresponding Yahoo Finance symbol using two strategies:
 *
 * Strategy A — ISIN Search via Yahoo search API:
 *   Searches Yahoo by ISIN (e.g., "INF179K01XQ0") → extracts the 0P...BO symbol.
 *
 * Strategy B — Fund Name Fuzzy Search:
 *   Falls back to searching by the fund name + "mutual fund" and picks the
 *   first result whose symbol ends with ".BO".
 *
 * Also enriches: returns_1y, returns_3y, returns_5y, expense_ratio, aum, logo_url.
 * Processes up to `batchSize` records per run to stay within rate limits.
 */
export class MFYahooEnrichJob extends BaseJob<void> {
  public readonly id = 'MFYahooEnrichJob';
  private batchSize: number;
  private continuous: boolean;

  constructor(batchSize = 200, continuous = false) {
    super();
    this.batchSize = batchSize;
    this.continuous = continuous;
  }

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_3_EXTENDED,
    symbols: [],
    region: MarketRegion.GLOBAL,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-mf-enrich',
    retryCount: 0,
    maxRetries: 1
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();

    // 1. Fetch active mutual funds from the active registry
    const { data: activeRegistry, error: activeErr } = await supabase
      .from('active_mutual_funds')
      .select('scheme_code');

    if (activeErr) throw activeErr;
    if (!activeRegistry || activeRegistry.length === 0) {
      this.log('No active mutual funds in the registry to sync.');
      return 0;
    }

    const activeCodes = activeRegistry.map(a => a.scheme_code);

    // 2. Fetch master records for these active schemes
    const { data: activeFunds, error } = await supabase
      .from('mutual_funds_master')
      .select('scheme_code, isin, name, amc_name, symbol, updated_at, aum, current_price, prev_close')
      .in('scheme_code', activeCodes)
      .order('scheme_code', { ascending: true });

    if (error) throw error;
    if (!activeFunds || activeFunds.length === 0) {
      this.log('No active mutual fund records found in master table.');
      return 0;
    }

    // Filter down to the ones that need syncing in this batch
    // - Unmatched (symbol is null)
    // - Matched but unenriched (aum is null)
    // - Matched but stale (updated_at < 24h ago)
    const oneDayAgoTime = Date.now() - 24 * 60 * 60 * 1000;
    const toSync = activeFunds.filter(fund => {
      if (fund.symbol === null) return true;
      if (fund.symbol === '') return false; // skip permanently unmatched
      if (fund.aum === null) return true;

      const updatedAt = fund.updated_at ? new Date(fund.updated_at).getTime() : 0;
      return updatedAt < oneDayAgoTime;
    }).slice(0, this.batchSize);

    if (toSync.length === 0) {
      this.log('All active funds are already matched, enriched, and up to date.');
      return 0;
    }

    this.log(`Starting Yahoo enrichment for ${toSync.length} active funds...`);

    let enriched = 0;
    let failed = 0;
    const DELAY_MS = 250; // Polite delay

    for (const fund of toSync) {
      try {
        let symbol = fund.symbol;
        if (!symbol) {
          symbol = await this.findYahooSymbol(fund.isin, fund.name);
        }

        if (symbol) {
          // Fetch summary modules for enrichment
          const enrichData = await this.fetchEnrichmentData(symbol);

          // Reconcile AMFI price (fund.current_price) with Yahoo quote prices
          const amfiPrice = Number(fund.current_price) || 0;
          const yahooPrice = Number(enrichData.current_price) || 0;
          const yahooPrevClose = Number(enrichData.prev_close) || 0;

          let currentPrice = amfiPrice || yahooPrice;
          let prevClose = Number(fund.prev_close) || currentPrice;

          if (yahooPrice && amfiPrice) {
            if (Math.abs(amfiPrice - yahooPrice) > 0.01) {
              // Yahoo price is from a previous day. So it is the prev_close for AMFI's new price
              prevClose = yahooPrice;
              currentPrice = amfiPrice;
            } else {
              // Yahoo is fully synced, so prev_close is Yahoo's previous close
              prevClose = yahooPrevClose || yahooPrice;
              currentPrice = amfiPrice;
            }
          } else if (yahooPrice) {
            currentPrice = yahooPrice;
            prevClose = yahooPrevClose || yahooPrice;
          }

          const dayChange = currentPrice - prevClose;
          const dayChangePct = prevClose > 0 ? (dayChange / prevClose) * 100 : 0.00;

          await supabase
            .from('mutual_funds_master')
            .update({
              symbol,
              returns_1y: enrichData.returns_1y ?? null,
              returns_3y: enrichData.returns_3y ?? null,
              returns_5y: enrichData.returns_5y ?? null,
              expense_ratio: enrichData.expense_ratio ?? null,
              aum: enrichData.aum ?? null,
              logo_url: enrichData.logo_url ?? null,
              min_initial_investment: enrichData.min_initial_investment ?? null,
              min_subsequent_investment: enrichData.min_subsequent_investment ?? null,
              rating: enrichData.rating ?? null,
              style_box_url: enrichData.style_box_url ?? null,
              manager_name: enrichData.manager_name ?? null,
              manager_start_date: enrichData.manager_start_date ?? null,
              asset_allocation: enrichData.asset_allocation ?? null,
              sector_allocations: enrichData.sector_allocations ?? null,
              credit_ratings: enrichData.credit_ratings ?? null,
              top_holdings: enrichData.top_holdings ?? null,
              risk_statistics: enrichData.risk_statistics ?? null,
              performance_history: enrichData.performance_history ?? null,
              current_price: currentPrice,
              prev_close: prevClose,
              day_change: dayChange,
              day_change_percentage: dayChangePct,
              updated_at: new Date().toISOString()
            })
            .eq('scheme_code', fund.scheme_code);

          this.log(`✅ ${fund.scheme_code} → ${symbol} (Fully Enriched/Refreshed)`);
          enriched++;
        } else {
          // Mark with empty string to avoid infinite loops on unmatched funds
          await supabase
            .from('mutual_funds_master')
            .update({ symbol: '', updated_at: new Date().toISOString() })
            .eq('scheme_code', fund.scheme_code);
          failed++;
        }
      } catch (e: any) {
        this.log(`⚠️  ${fund.scheme_code} (${fund.name}): ${e.message}`, 'warn');
        failed++;
      }

      // Polite delay between requests
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    this.log(`Completed: ${enriched} enriched/refreshed, ${failed} unmatched.`);

    // If continuous mode is on and we processed some, queue another batch
    if (this.continuous && enriched > 0) {
      this.log('Continuous mode: Dispatching next batch...');
      const nextJob = new MFYahooEnrichJob(this.batchSize, true);
      const { syncOrchestrator } = require('../../core/orchestrator');
      syncOrchestrator.dispatch(nextJob);
    }

    return enriched;
  }

  /**
   * Helper to execute a Yahoo search query with proxy rotation and retries.
   */
  private async executeSearch(query: string): Promise<any> {
    let attempts = 0;
    const maxAttempts = Math.max(2, proxyRotationManager.getPoolSize());

    while (attempts < maxAttempts) {
      const activeProxyIndex = proxyRotationManager.getCurrentIndex();
      try {
        return await yahooFinance.search(query, {}, { validateResult: false } as any);
      } catch (error: any) {
        attempts++;
        const wasRotated = await proxyRotationManager.handleRequestFailure(error, activeProxyIndex);
        if (wasRotated && attempts < maxAttempts) {
          this.log(`[MFYahooEnrichJob] Proxy rotated during search for "${query}". Retrying (attempt ${attempts + 1}/${maxAttempts})...`);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Failed to search Yahoo Finance for "${query}" after ${maxAttempts} attempts`);
  }

  /**
   * Strategy A: Search by ISIN first, fall back to name search.
   */
  private async findYahooSymbol(isin: string, name: string): Promise<string | null> {
    // Strategy A — ISIN search
    if (isin && isin.startsWith('INF')) {
      try {
        const searchResult = await this.executeSearch(isin);
        const hit = (searchResult.quotes || []).find(
          (q: any) => q.symbol && (q.symbol.endsWith('.BO') || q.symbol.startsWith('0P'))
        );
        if (hit) return hit.symbol as string;
      } catch (err: any) {
        // Rethrow network/proxy errors so we do not write symbol: '' in the DB
        throw err;
      }
    }

    // Strategy B — Fund name search
    try {
      const query = name.length > 60 ? name.substring(0, 60) : name;
      const searchResult = await this.executeSearch(query);
      const hit = (searchResult.quotes || []).find(
        (q: any) => q.symbol && (q.symbol.endsWith('.BO') || q.symbol.startsWith('0P'))
      );
      if (hit) return hit.symbol as string;
    } catch (err: any) {
      throw err;
    }

    return null;
  }

  /**
   * Helper to execute a Yahoo quote fetch with proxy rotation and retries.
   */
  private async executeQuote(symbol: string): Promise<any> {
    let attempts = 0;
    const maxAttempts = Math.max(2, proxyRotationManager.getPoolSize());

    while (attempts < maxAttempts) {
      const activeProxyIndex = proxyRotationManager.getCurrentIndex();
      try {
        return await yahooFinance.quote(symbol);
      } catch (error: any) {
        attempts++;
        const wasRotated = await proxyRotationManager.handleRequestFailure(error, activeProxyIndex);
        if (wasRotated && attempts < maxAttempts) {
          this.log(`[MFYahooEnrichJob] Proxy rotated during quote fetch for "${symbol}". Retrying (attempt ${attempts + 1}/${maxAttempts})...`);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Failed to fetch quote for "${symbol}" after ${maxAttempts} attempts`);
  }

  /**
   * Helper to execute a Yahoo quoteSummary fetch with proxy rotation and retries.
   */
  private async executeQuoteSummary(symbol: string): Promise<any> {
    let attempts = 0;
    const maxAttempts = Math.max(2, proxyRotationManager.getPoolSize());

    while (attempts < maxAttempts) {
      const activeProxyIndex = proxyRotationManager.getCurrentIndex();
      try {
        return await yahooFinance.quoteSummary(symbol, {
          modules: [
            'defaultKeyStatistics',
            'summaryDetail',
            'price',
            'fundProfile',
            'topHoldings',
            'fundPerformance'
          ]
        }, { validateResult: false } as any);
      } catch (error: any) {
        attempts++;
        const wasRotated = await proxyRotationManager.handleRequestFailure(error, activeProxyIndex);
        if (wasRotated && attempts < maxAttempts) {
          this.log(`[MFYahooEnrichJob] Proxy rotated during quoteSummary fetch for "${symbol}". Retrying (attempt ${attempts + 1}/${maxAttempts})...`);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Failed to fetch quoteSummary for "${symbol}" after ${maxAttempts} attempts`);
  }

  /**
   * Fetches 1Y/3Y/5Y returns, expense ratio, AUM, holdings, manager info, risk metrics, and ratings from Yahoo.
   */
  private async fetchEnrichmentData(symbol: string): Promise<{
    returns_1y?: number | null;
    returns_3y?: number | null;
    returns_5y?: number | null;
    expense_ratio?: number | null;
    aum?: number | null;
    logo_url?: string | null;
    min_initial_investment?: number | null;
    min_subsequent_investment?: number | null;
    rating?: number | null;
    style_box_url?: string | null;
    manager_name?: string | null;
    manager_start_date?: string | null;
    asset_allocation?: any | null;
    sector_allocations?: any | null;
    credit_ratings?: any | null;
    top_holdings?: any | null;
    risk_statistics?: any | null;
    performance_history?: any | null;
    current_price?: number | null;
    prev_close?: number | null;
    day_change?: number | null;
    day_change_percentage?: number | null;
  }> {
    let quote: any = null;
    try {
      quote = await this.executeQuote(symbol);
    } catch (err: any) {
      console.warn(`Failed to fetch live quote for ${symbol}: ${err.message}`);
    }

    const summary = await this.executeQuoteSummary(symbol);

    if (!summary || Object.keys(summary).length === 0) {
      throw new Error('Yahoo Finance returned empty quote summary or request failed');
    }

    const ks = (summary as any).defaultKeyStatistics;
    const price = (summary as any).price;
    const sd = (summary as any).summaryDetail;
    const fp = (summary as any).fundProfile;
    const th = (summary as any).topHoldings;
    const perf = (summary as any).fundPerformance;

    // AUM in Crores (prefer summaryDetail.totalAssets over price.marketCap)
    const rawAssets = sd?.totalAssets ?? price?.marketCap;
    const aum = rawAssets != null ? Number(rawAssets) / 1e7 : null;

    // Expense ratio percentage (look at fp.annualReportExpenseRatio first)
    const expense_ratio = fp?.annualReportExpenseRatio != null
      ? Number(fp.annualReportExpenseRatio) * 100
      : (fp?.feesExpensesInvestment?.annualReportExpenseRatio != null
        ? Number(fp.feesExpensesInvestment.annualReportExpenseRatio) * 100
        : null);

    // Logo url
    const logo_url = price?.symbol
      ? `https://s.yimg.com/cv/apiv2/default/20181211/${encodeURIComponent(price.symbol)}.png`
      : null;

    // Minimum investments
    const min_initial_investment = fp?.initInvestment ?? null;
    const min_subsequent_investment = fp?.subsequentInvestment ?? null;

    // Ratings (prefer riskOverviewStatistics.riskRating or defaultKeyStatistics.morningStarOverallRating)
    const rating = perf?.riskOverviewStatistics?.riskRating ?? ks?.morningStarOverallRating ?? null;

    // Style box visual URL
    const style_box_url = fp?.styleBoxUrl ?? null;

    // Manager information
    let manager_name = null;
    let manager_start_date = null;
    const managers = fp?.managementInfo?.managers;
    if (Array.isArray(managers) && managers.length > 0) {
      manager_name = managers[0]?.name || null;
      manager_start_date = managers[0]?.startDate ? new Date(managers[0].startDate).toISOString() : null;
    }

    // Asset Allocation
    let asset_allocation = null;
    if (th && (th.cashPosition != null || th.stockPosition != null || th.bondPosition != null)) {
      asset_allocation = {
        cash: th.cashPosition != null ? Number(th.cashPosition) * 100 : 0,
        equity: th.stockPosition != null ? Number(th.stockPosition) * 100 : 0,
        debt: th.bondPosition != null ? Number(th.bondPosition) * 100 : 0,
        preferred: th.preferredPosition != null ? Number(th.preferredPosition) * 100 : 0,
        convertible: th.convertiblePosition != null ? Number(th.convertiblePosition) * 100 : 0,
        other: th.otherPosition != null ? Number(th.otherPosition) * 100 : 0
      };
    }

    // Sector weight allocations
    let sector_allocations = null;
    if (th && Array.isArray(th.sectorWeightings)) {
      const sectors: Record<string, number> = {};
      th.sectorWeightings.forEach((sw: any) => {
        const key = Object.keys(sw)[0];
        if (key) {
          sectors[key] = sw[key] != null ? Number(sw[key]) * 100 : 0;
        }
      });
      sector_allocations = sectors;
    }

    // Bond credit ratings
    let credit_ratings = null;
    if (th && Array.isArray(th.bondRatings)) {
      const ratings: Record<string, number> = {};
      th.bondRatings.forEach((br: any) => {
        const key = Object.keys(br)[0];
        if (key) {
          ratings[key] = br[key] != null ? Number(br[key]) * 100 : 0;
        }
      });
      credit_ratings = ratings;
    }

    // Top 10 Holdings (weight is converted to percentage)
    let top_holdings = null;
    if (th && Array.isArray(th.holdings)) {
      top_holdings = th.holdings.map((h: any) => ({
        symbol: h.symbol || null,
        name: h.holdingName || null,
        percent: h.holdingPercent != null ? Number(h.holdingPercent) * 100 : 0
      }));
    }

    // Rolling Risk Ratios
    let risk_statistics = null;
    if (perf && Array.isArray(perf.riskOverviewStatistics?.riskStatistics)) {
      const risks: Record<string, any> = {};
      perf.riskOverviewStatistics.riskStatistics.forEach((rs: any) => {
        if (rs.year) {
          risks[rs.year] = {
            meanAnnualReturn: rs.meanAnnualReturn ?? null,
            stdDev: rs.stdDev ?? null,
            sharpeRatio: rs.sharpeRatio ?? null,
            alpha: rs.alpha ?? null,
            beta: rs.beta ?? null
          };
        }
      });
      risk_statistics = risks;
    }

    // Calendar performance history (normalized)
    let performance_history = null;
    if (perf && (perf.annualTotalReturns?.returns || perf.pastQuarterlyReturns?.returns)) {
      performance_history = {
        annual: (perf.annualTotalReturns?.returns || []).map((r: any) => ({
          year: r.year,
          value: r.annualValue != null ? Number(r.annualValue) * 100 : null
        })),
        quarterly: (perf.pastQuarterlyReturns?.returns || []).map((r: any) => ({
          year: r.year,
          q1: r.q1 != null ? Number(r.q1) * 100 : null,
          q2: r.q2 != null ? Number(r.q2) * 100 : null,
          q3: r.q3 != null ? Number(r.q3) * 100 : null,
          q4: r.q4 != null ? Number(r.q4) * 100 : null
        }))
      };
    }

    return {
      returns_1y: ks?.trailingAnnualReturnRate != null ? Number(ks.trailingAnnualReturnRate) * 100 : null,
      returns_3y: ks?.threeYearAverageReturn != null ? Number(ks.threeYearAverageReturn) * 100 : null,
      returns_5y: ks?.fiveYearAverageReturn != null ? Number(ks.fiveYearAverageReturn) * 100 : null,
      expense_ratio,
      aum,
      logo_url,
      min_initial_investment,
      min_subsequent_investment,
      rating,
      style_box_url,
      manager_name,
      manager_start_date,
      asset_allocation,
      sector_allocations,
      credit_ratings,
      top_holdings,
      risk_statistics,
      performance_history,
      current_price: quote?.regularMarketPrice ?? null,
      prev_close: quote?.regularMarketPreviousClose ?? null,
      day_change: quote?.regularMarketChange ?? null,
      day_change_percentage: quote?.regularMarketChangePercent ?? null
    };
  }
}
