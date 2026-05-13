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
    region: MarketRegion.GLOBAL,
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

    // 2. Fetch latest market prices (IN & US)
    const [{ data: inAssets }, { data: usAssets }] = await Promise.all([
      supabase.from('market_assets').select('symbol, current_price, prev_close, day_change, day_change_percentage'),
      supabase.from('us_market_assets').select('symbol, current_price, prev_close, day_change, day_change_percentage')
    ]);
    
    const marketMap = new Map();
    (inAssets || []).forEach(a => marketMap.set(a.symbol.trim().toUpperCase(), a));
    (usAssets || []).forEach(a => marketMap.set(a.symbol.trim().toUpperCase(), a));

    // 3. Group holdings by portfolio_id
    const portfolioGroups = new Map<string, { userId: string, holdings: any[] }>();
    for (const h of currentHoldings) {
      const pid = h.portfolio_id;
      const uid = h.user_id;
      
      if (!pid || !uid) continue;

      if (!portfolioGroups.has(pid)) {
        portfolioGroups.set(pid, { userId: uid, holdings: [] });
      }
      portfolioGroups.get(pid)!.holdings.push(h);
    }

    let totalProcessed = 0;

    for (const [pid, group] of Array.from(portfolioGroups.entries())) {
      const { userId, holdings } = group;
      const updatedHoldings = [];
      let totalMkt = 0;
      let totalInv = 0;
      let totalDayChange = 0;

      for (const holding of holdings) {
        const symbol = (holding.trading_symbol || '').trim().toUpperCase();
        const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol;
        
        // Try direct ticker, then .NS fallback for Indian stocks
        const yahooInSymbol = ticker.endsWith('.NS') ? ticker : `${ticker}.NS`;
        const asset = marketMap.get(ticker) || marketMap.get(yahooInSymbol);
        
        if (!asset) {
          console.warn(`[Reval] No market asset found for holding: ${symbol} (Ticker: ${ticker})`);
        }

        // LIVE PRICE from internal market engine
        let price = asset ? asset.current_price : holding.last_price;
        
        // Fallback if market asset is somehow missing
        if (!price || isNaN(price)) {
          price = holding.last_price || holding.average_price || 0;
        }

        const marketValue = holding.quantity * price;
        
        // Calculate Daily Move: Use (Price - PrevClose) for maximum reliability after-hours
        const unitDayChange = (asset && asset.current_price && asset.prev_close) 
          ? (asset.current_price - asset.prev_close) 
          : (asset?.day_change || 0);

        const unitDayChangePct = (asset && asset.current_price && asset.prev_close && asset.prev_close !== 0)
          ? ((asset.current_price - asset.prev_close) / asset.prev_close) * 100
          : (asset?.day_change_percentage || 0);

        updatedHoldings.push({
          ...holding,
          last_price: price,
          market_value: marketValue,
          p_l: marketValue - holding.invested_value,
          p_l_percentage: holding.invested_value > 0 ? ((marketValue - holding.invested_value) / holding.invested_value) * 100 : 0,
          day_change: unitDayChange * holding.quantity,
          day_change_percentage: unitDayChangePct,
          updated_at: getISTTimestamp()
        });

        totalMkt += marketValue;
        totalInv += holding.invested_value;
        totalDayChange += (unitDayChange * holding.quantity);
      }

      // 4. Batch update holdings for this portfolio
      const { error: upError } = await supabase.from('holdings').upsert(updatedHoldings);
      if (upError) console.error(`[Reval] Failed to update holdings for portfolio ${pid}:`, upError.message);

      // 5. Update latest history entry for today (Virtual Update)
      const istTimestamp = getISTTimestamp();
      const logicalDay = istTimestamp.split('T')[0];

      // Delete any existing snapshots for today for THIS SPECIFIC PORTFOLIO to ensure only 1 record per day
      await supabase
        .from('portfolio_history')
        .delete()
        .eq('portfolio_id', pid)
        .gte('timestamp', `${logicalDay}T00:00:00+05:30`);

      // Insert the new updated snapshot for today
      await supabase.from('portfolio_history').insert({
        user_id: userId,
        portfolio_id: pid,
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
