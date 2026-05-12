import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';
import { getISTTimestamp } from '../../server';

/**
 * PortfolioRevaluationJob
 * 
 * Runs every 1 minute between Broker Syncs.
 * Uses existing holdings (quantities) and updates their market value 
 * using the latest prices from the 'market_assets' table.
 */
export class PortfolioRevaluationJob extends BaseJob {
  public readonly id = 'PortfolioRevaluationJob';
  
  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_1_HOT,
    symbols: [],
    region: MarketRegion.IN,
    priority: QueuePriority.PORTFOLIO,
    bullMqQueueName: 'q-portfolio-reval',
    retryCount: 0,
    maxRetries: 0
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();

    // 1. Fetch current holdings (to get quantities)
    const { data: currentHoldings, error: hError } = await supabase
      .from('holdings')
      .select('*')
      .not('user_id', 'is', null);

    if (hError || !currentHoldings || currentHoldings.length === 0) {
      return 0;
    }

    // 2. Fetch latest market prices
    const { data: dbAssets } = await supabase
      .from('market_assets')
      .select('symbol, current_price, prev_close, day_change, day_change_percentage');
    
    const marketMap = new Map((dbAssets || []).map(a => [a.symbol.trim().toUpperCase(), a]));

    // 3. Group holdings by portfolio_id
    const portfolioGroups = new Map<string, any[]>();
    for (const h of currentHoldings) {
      const pid = h.user_id;
      if (!portfolioGroups.has(pid)) portfolioGroups.set(pid, []);
      portfolioGroups.get(pid)!.push(h);
    }

    let totalProcessed = 0;

    for (const [pid, holdings] of Array.from(portfolioGroups.entries())) {
      const updatedHoldings = [];
      let totalMkt = 0;
      let totalInv = 0;
      let totalDayChange = 0;

      for (const holding of holdings) {
        const symbol = (holding.trading_symbol || '').trim().toUpperCase();
        const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol;
        const yahooSymbol = ticker.endsWith('.NS') ? ticker : `${ticker}.NS`;

        const asset = marketMap.get(ticker) || marketMap.get(yahooSymbol);
        
        if (!asset) {
          console.warn(`[Reval] No market asset found for holding: ${symbol} (Ticker: ${ticker}, Yahoo: ${yahooSymbol})`);
        }

        // LIVE PRICE from internal market engine
        let price = asset ? asset.current_price : holding.last_price;
        
        // Fallback if market asset is somehow missing
        if (!price || isNaN(price)) {
          price = holding.last_price || holding.average_price || 0;
        }

        const marketValue = holding.quantity * price;
        
        // Use the exact day change from the asset, multiplied by quantity
        const dayChange = asset ? (asset.day_change * holding.quantity) : 0;
        const dayChangePct = asset ? asset.day_change_percentage : 0;

        updatedHoldings.push({
          ...holding,
          last_price: price,
          market_value: marketValue,
          p_l: marketValue - holding.invested_value,
          p_l_percentage: holding.invested_value > 0 ? ((marketValue - holding.invested_value) / holding.invested_value) * 100 : 0,
          day_change: dayChange,
          day_change_percentage: dayChangePct,
          updated_at: getISTTimestamp()
        });

        totalMkt += marketValue;
        totalInv += holding.invested_value;
        totalDayChange += dayChange;
      }

      // 4. Batch update holdings for this portfolio
      const { error: upError } = await supabase.from('holdings').upsert(updatedHoldings);
      if (upError) console.error(`[Reval] Failed to update holdings for ${pid}:`, upError.message);

      // 5. Update latest history entry for today (Virtual Update)
      const istTimestamp = getISTTimestamp();
      const logicalDay = istTimestamp.split('T')[0];

      // Delete any existing snapshots for today to ensure only 1 record per day
      await supabase
        .from('portfolio_history')
        .delete()
        .eq('user_id', pid)
        .gte('timestamp', `${logicalDay}T00:00:00+05:30`);

      // Insert the new updated snapshot for today
      await supabase.from('portfolio_history').insert({
        user_id: pid,
        total_investment: totalInv,
        total_market_value: totalMkt,
        total_p_l: totalMkt - totalInv,
        p_l_percentage: totalInv > 0 ? ((totalMkt - totalInv) / totalInv) * 100 : 0,
        timestamp: istTimestamp,
        broker_name: 'GROWW'
      });

      totalProcessed += updatedHoldings.length;
    }

    return totalProcessed;
  }
}
