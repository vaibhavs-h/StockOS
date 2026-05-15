import { BaseJob } from '../core/BaseJob';
import { YahooProvider } from '../providers/YahooProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { RotationManager } from '../core/RotationManager';
import { syncOrchestrator } from '../core/orchestrator';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class UsDeepSyncJob extends BaseJob {
  public readonly id = 'UsDeepSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_3_EXTENDED,
    symbols: SymbolUniverseManager.getUniqueUsEquities().map(a => a.s),
    region: MarketRegion.US,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-extended-fundamentals',
    retryCount: 0,
    maxRetries: 3
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    const assets = [...SymbolUniverseManager.getUniqueUsEquities()];

    // 1. Bucket Rotation (5 Buckets: Day 0 is Priority/Weighted)
    const bucketIndex = RotationManager.getNextSectorIndex('US', 5);

    let bucket = [];
    if (bucketIndex === 0) {
      // Day A: Weighted Priority (S&P 100 / Nasdaq 100)
      bucket = assets.filter(a => a.isSP500 || a.isNASDAQ100 || a.isDOW30).slice(0, 150);
      console.log(`[UsDeepSyncJob] Day A: Priority Weighted Sync (${bucket.length} stocks)`);
    } else {
      // Day B-E: Tail Buckets
      const tail = assets.filter(a => !(a.isSP500 || a.isNASDAQ100 || a.isDOW30));
      const sliceSize = Math.ceil(tail.length / 4);
      const tailIndex = bucketIndex - 1;
      bucket = tail.slice(tailIndex * sliceSize, (tailIndex + 1) * sliceSize);
      console.log(`[UsDeepSyncJob] Day ${String.fromCharCode(65 + bucketIndex)}: Tail Rotation (${bucket.length} stocks)`);
    }

    let processedCount = 0;

    for (const item of bucket) {
      const symbol = normalizeStorageSymbol(item.s);

      try {
        const modules = ['financialData', 'defaultKeyStatistics', 'summaryProfile', 'calendarEvents', 'summaryDetail'];
        const summary = await YahooProvider.fetchQuoteSummary(item.s, modules, 'US');

        if (!summary) {
          console.warn(`[UsDeepSyncJob] No summary found for ${item.s}. Skipping.`);
          continue;
        }

        const fd = (summary.financialData || {}) as any;
        const ks = (summary.defaultKeyStatistics || {}) as any;
        const sp = (summary.summaryProfile || {}) as any;
        const ce = (summary.calendarEvents || {}) as any;
        const sd = (summary.summaryDetail || {}) as any;


        const fullPayload = {
          symbol,
          name: item.n,
          sector: sp.sector || null,
          industry: sp.industry || null,
          description: sp.longBusinessSummary || null,

          // Financial Statements (Tier 3)
          total_revenue: fd.totalRevenue || null,
          ebitda: fd.ebitda || null,
          free_cashflow: fd.freeCashflow || null,
          total_debt: fd.totalDebt || null,
          total_cash: fd.totalCash || null,
          book_value: ks.bookValue || null,

          // Margins & Ratios
          operating_margins: fd.operatingMargins || null,
          gross_margins: fd.grossMargins || null,
          profit_margins: fd.profitMargins || null,
          return_on_equity: fd.returnOnEquity || null,
          current_ratio: fd.currentRatio || null,
          quick_ratio: fd.quickRatio || null,
          debt_to_equity: fd.debtToEquity || null,

          // Growth & Analytical
          revenue_growth: fd.revenueGrowth || null,
          earnings_growth: fd.earningsGrowth || null,
          fifty_two_week_change_pct: ks['52WeekChange'] || null,
          beta_5y: ks.beta || sd.beta || null,
          peg_ratio: ks.pegRatio || null,

          // Analyst/Dividends
          target_price: fd.targetMeanPrice || null,
          recommendation_key: fd.recommendationKey || null,
          payout_ratio: ks.payoutRatio || null,
          dividend_rate: ks.dividendRate || null,
          ex_dividend_date: ks.exDividendDate || null,
          trailing_annual_dividend_rate: ks.trailingAnnualDividendRate || sd.trailingAnnualDividendRate || null,
          trailing_annual_dividend_yield: ks.trailingAnnualDividendYield || sd.trailingAnnualDividendYield || null,

          // Earnings & EPS
          earnings_timestamp: ce.earnings?.earningsDate?.[0] || null,
          earnings_timestamp_start: ce.earnings?.earningsDate?.[0] || null,
          earnings_timestamp_end: ce.earnings?.earningsDate?.[1] || null,
          eps_forward: ks.forwardEps || null,
          eps_current_year: ks.epsCurrentYear || null,

          // Profile (Static - only update on priority day or if missing)
          ...(bucketIndex === 0 ? {
            website: sp.website || null,
            full_time_employees: sp.fullTimeEmployees || null
          } : {}),

          updated_at: new Date().toISOString()
        };

        const diffPayload = this.getDiff(symbol, fullPayload);

        if (!diffPayload) {
          syncOrchestrator.recordWriteSkip();
        } else {
          const { error } = await supabase.from('us_market_assets').upsert(diffPayload, { onConflict: 'symbol' });
          if (error) throw error;
          this.commitSnapshot(symbol, fullPayload);
          processedCount++;
        }

      } catch (error: any) {
        console.warn(`[UsDeepSyncJob] Failed for ${symbol}: ${error.message}`);
      }
    }

    return processedCount;
  }
}
