import { BaseJob } from '../core/BaseJob';
import { YahooProvider } from '../providers/YahooProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { SymbolUniverseManager, normalizeStorageSymbol } from '../../constants/market-constants';
import { RotationManager } from '../core/RotationManager';
import { syncOrchestrator } from '../core/orchestrator';

import { JobMetadata, RefreshTier, MarketRegion, QueuePriority, AssetType } from '../core/types';

export class IndianDeepSyncJob extends BaseJob {
  public readonly id = 'IndianDeepSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_3_EXTENDED,
    symbols: SymbolUniverseManager.getUniqueIndianEquities().map(a => a.s),
    region: MarketRegion.IN,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-extended-fundamentals',
    retryCount: 0,
    maxRetries: 3
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    const assets = SymbolUniverseManager.getUniqueIndianEquities();
    
    // Split universe into 5 buckets for rotation (Mon-Fri)
    const bucketSize = Math.ceil(assets.length / 5);
    const bucketIndex = RotationManager.getNextSectorIndex('IN', 5);
    
    const start = bucketIndex * bucketSize;
    const end = Math.min(start + bucketSize, assets.length);
    const bucket = assets.slice(start, end);

    console.log(`[IndianDeepSyncJob] Bucket Rotation: Day ${bucketIndex + 1}/5 | Syncing ${bucket.length} stocks`);

    let processedCount = 0;

    for (const item of bucket) {
      const symbol = normalizeStorageSymbol(item.s);
      const isIndex = item.assetType === AssetType.INDEX;

      try {
        const modules = isIndex
          ? ['summaryDetail']
          : ['summaryProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'earnings', 'calendarEvents'];

        const summary = await YahooProvider.fetchQuoteSummary(item.s, modules, 'IN');

        const sp = (summary.summaryProfile || {}) as any;
        const sd = (summary.summaryDetail || {}) as any;
        const ks = (summary.defaultKeyStatistics || {}) as any;
        const fd = (summary.financialData || {}) as any;
        const earnings = (summary.earnings || {}) as any;
        const ce = (summary.calendarEvents || {}) as any;

        // Extract Earnings Chart data safely
        const quarterlyEarnings = earnings.earningsChart?.quarterly || [];
        const lastQuarter = quarterlyEarnings[quarterlyEarnings.length - 1];

        const fullPayload = {
          symbol,
          // Financial Statements (Tier 3)
          revenue_ttm: fd.totalRevenue || null,
          net_income_ttm: fd.netIncomeToCommon || null,
          ebitda: fd.ebitda || null,
          free_cash_flow: fd.freeCashflow || null,
          cash_on_hand: fd.totalCash || null,
          total_debt: fd.totalDebt || null,
          shareholder_equity: ks.bookValue ? (ks.bookValue * ks.sharesOutstanding) : null,

          // Profitability & Ratios
          net_margin: fd.profitMargins || null,
          operating_margin: fd.operatingMargins || null,
          gross_margin: fd.grossMargins || null,
          return_on_equity: fd.returnOnEquity || null,
          debt_to_equity: fd.debtToEquity || null,

          // Growth
          revenue_growth: fd.revenueGrowth || null,
          earnings_growth: fd.earningsGrowth || null,

          // Analyst Layer
          recommendation_score: fd.recommendationMean || null,
          target_high: fd.targetHighPrice || null,
          target_low: fd.targetLowPrice || null,
          target_mean: fd.targetMeanPrice || null,
          
          // Earnings & Dividends (New)
          next_earnings_date: ce.earnings?.earningsDate?.[0] || null,
          last_earnings_surprise_pct: earnings.earningsChart?.earningsSurprise?.[earnings.earningsChart?.earningsSurprise?.length - 1]?.pct || null,
          actual_eps_last_quarter: lastQuarter?.actual || null,
          est_eps_next_quarter: ce.earnings?.earningsAverage || null,
          last_dividend_amount: sd.dividendRate || sd.lastDividendValue || null,
          last_dividend_date: sd.exDividendDate || null,

          // Profile (Static-ish)
          website: sp.website || null,
          full_time_employees: sp.fullTimeEmployees || null,
          ceo_name: sp.companyOfficers?.[0]?.name || null,

          updated_at: new Date().toISOString()
        };

        const diffPayload = this.getDiff(symbol, fullPayload);
        
        if (!diffPayload) {
          syncOrchestrator.recordWriteSkip();
        } else {
          const { error } = await supabase.from('market_assets').upsert(diffPayload, { onConflict: 'symbol' });
          if (error) throw error;
          this.commitSnapshot(symbol, fullPayload);
          processedCount++;
        }
        
      } catch (error: any) {
        console.warn(`[IndianDeepSyncJob] Failed for ${symbol}: ${error.message}`);
      }
    }

    return processedCount;
  }
}
