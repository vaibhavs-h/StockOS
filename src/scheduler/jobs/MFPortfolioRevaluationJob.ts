import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';
import { getISTTimestamp, getNormalizedNoonTimestamp } from '../../lib/date';

/**
 * MFPortfolioRevaluationJob: Mutual Fund Portfolio Valuation maestro.
 * 1. Fetches all active holdings in user_mutual_fund_holdings.
 * 2. Reconciles quantities against official mutual_funds_master prices.
 * 3. Calculates EOD revalued market value, unrealized P&L, and day-change spreads.
 * 4. Saves a daily historical performance snapshot into mutual_fund_portfolio_history.
 */
export class MFPortfolioRevaluationJob extends BaseJob {
  public readonly id = 'MFPortfolioRevaluationJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_1_HOT,
    symbols: [],
    region: MarketRegion.GLOBAL,
    priority: QueuePriority.PORTFOLIO,
    bullMqQueueName: 'q-mf-portfolio-reval',
    retryCount: 0,
    maxRetries: 0
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    console.log('[MF-REVAL] Mutual Fund Portfolio Pulse Initiated...');

    // 1. Fetch all current mutual fund holdings from database
    const { data: holdings, error: hError } = await supabase
      .from('user_mutual_fund_holdings')
      .select('*');

    if (hError) {
      console.error('[MF-REVAL] Failed to fetch holdings:', hError.message);
      throw hError;
    }

    if (!holdings || holdings.length === 0) {
      console.log('[MF-REVAL] No active mutual fund holdings found. Ingestion skipped.');
      return 0;
    }

    // 2. Identify unique schemes to extract latest master details
    const uniqueSchemes = Array.from(new Set(holdings.map(h => h.scheme_code)));
    
    // Fetch master prices — chunking/in() to avoidSupabase's default limits
    const { data: masterFunds, error: mError } = await supabase
      .from('mutual_funds_master')
      .select('scheme_code, name, current_price, prev_close, amc_name, category, sub_category')
      .in('scheme_code', uniqueSchemes);

    if (mError) {
      console.error('[MF-REVAL] Failed to fetch master funds:', mError.message);
      throw mError;
    }

    const masterMap = new Map<string, any>();
    (masterFunds || []).forEach(f => masterMap.set(f.scheme_code, f));

    // 3. Group holdings by user_id AND portfolio_id to compute total valuations per portfolio
    const portfolioGroups = new Map<string, { userId: string; portfolioId: string; holdings: any[] }>();
    for (const h of holdings) {
      const key = `${h.user_id}_${h.portfolio_id || 'null'}`;
      if (!portfolioGroups.has(key)) {
        portfolioGroups.set(key, { userId: h.user_id, portfolioId: h.portfolio_id, holdings: [] });
      }
      portfolioGroups.get(key)!.holdings.push(h);
    }

    let totalProcessed = 0;
    const nowTimestamp = getISTTimestamp();
    const normalizedTimestamp = getNormalizedNoonTimestamp();

    for (const { userId, portfolioId, holdings: userHoldings } of Array.from(portfolioGroups.values())) {
      // Skip revaluation today if the portfolio was imported today with today's statement date
      const firstHolding = userHoldings[0];
      const lastStatementDate = firstHolding?.last_statement_date;
      const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      if (lastStatementDate === todayStr) {
        console.log(`[MF-REVAL] Skipping revaluation today for portfolio ${portfolioId} of user ${userId} (imported today with today's statement date).`);
        totalProcessed += userHoldings.length;
        continue;
      }

      const updatedHoldings = [];
      let totalInvestment = 0;
      let totalMarketValue = 0;

      for (const holding of userHoldings) {
        const master = masterMap.get(holding.scheme_code);

        if (!master) {
          // If no master data is found, preserve the existing holding snapshot
          updatedHoldings.push({
            ...holding,
            updated_at: nowTimestamp
          });
          totalInvestment += Number(holding.invested_value) || 0;
          totalMarketValue += Number(holding.market_value) || 0;
          continue;
        }

        const qty = Number(holding.quantity) || 0;
        const avgPrice = Number(holding.average_price) || 0;
        const currentPrice = Number(master.current_price) || avgPrice;
        const prevClose = Number(master.prev_close) || currentPrice;

        const investedValue = qty * avgPrice;
        const marketValue = qty * currentPrice;
        const p_l = marketValue - investedValue;
        const p_l_percentage = investedValue > 0 ? (p_l / investedValue) * 100 : 0.00;

        const dayChange = (currentPrice - prevClose) * qty;
        const dayChangePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0.00;

        updatedHoldings.push({
          ...holding,
          last_price: currentPrice,
          invested_value: investedValue,
          market_value: marketValue,
          p_l: p_l,
          p_l_percentage: p_l_percentage,
          day_change: dayChange,
          day_change_percentage: dayChangePct,
          updated_at: nowTimestamp
        });

        totalInvestment += investedValue;
        totalMarketValue += marketValue;
      }

      // 4. Batch update holdings for this user and portfolio
      if (updatedHoldings.length > 0) {
        const { error: upsertErr } = await supabase
          .from('user_mutual_fund_holdings')
          .upsert(updatedHoldings, { onConflict: 'user_id,folio_number,scheme_code' });

        if (upsertErr) {
          console.error(`[MF-REVAL] Failed to upsert holdings for user ${userId} / portfolio ${portfolioId}:`, upsertErr.message);
        }
      }

      // 5. Save daily performance snapshot in mutual_fund_portfolio_history per portfolio
      const totalPnL = totalMarketValue - totalInvestment;
      const totalPnLPct = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0.00;

      const { error: histErr } = await supabase
        .from('mutual_fund_portfolio_history')
        .upsert({
          user_id: userId,
          portfolio_id: portfolioId,
          timestamp: normalizedTimestamp,
          total_investment: totalInvestment,
          total_market_value: totalMarketValue,
          total_p_l: totalPnL,
          p_l_percentage: totalPnLPct
        }, { onConflict: 'user_id,portfolio_id,timestamp' });

      if (histErr) {
        console.error(`[MF-REVAL] Failed to upsert snapshot for user ${userId} / portfolio ${portfolioId}:`, histErr.message);
      }

      totalProcessed += updatedHoldings.length;
    }

    console.log(`[MF-REVAL] Portfolio revaluation completed successfully for ${totalProcessed} holdings.`);
    return totalProcessed;
  }
}
