import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

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
      .select('*');

    if (hError || !currentHoldings || currentHoldings.length === 0) {
      return 0;
    }

    // 2. Fetch latest market prices
    const { data: dbAssets } = await supabase
      .from('market_assets')
      .select('symbol, current_price, prev_close, day_change');
    
    const marketMap = new Map((dbAssets || []).map(a => [a.symbol, a]));

    // 3. Revalue each holding
    const updatedHoldings = [];
    let totalMkt = 0;
    let totalInv = 0;
    let totalDayChange = 0;
    const portfolioId = currentHoldings[0].portfolio_id;

    for (const holding of currentHoldings) {
      const symbol = holding.trading_symbol;
      const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      const yahooSymbol = ticker.endsWith('.NS') ? ticker : `${ticker}.NS`;

      const asset = marketMap.get(ticker) || marketMap.get(yahooSymbol);
      
      const price = asset?.current_price || holding.last_price;
      const prevClose = asset?.prev_close || (price / (1 + (holding.day_change_percentage / 100)));

      const marketValue = holding.quantity * price;
      const dayChange = (price - prevClose) * holding.quantity;

      updatedHoldings.push({
        ...holding,
        last_price: price,
        market_value: marketValue,
        p_l: marketValue - holding.invested_value,
        p_l_percentage: holding.invested_value > 0 ? ((marketValue - holding.invested_value) / holding.invested_value) * 100 : 0,
        day_change: dayChange,
        day_change_percentage: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
        updated_at: new Date().toISOString()
      });

      totalMkt += marketValue;
      totalInv += holding.invested_value;
      totalDayChange += dayChange;
    }

    // 4. Batch update holdings
    const { error: upError } = await supabase.from('holdings').upsert(updatedHoldings);
    if (upError) throw upError;

    // 5. Update latest history entry for today (Virtual Update)
    const now = new Date();
    const financialDate = new Date(now.getTime() - (3 * 60 + 30) * 60 * 1000);
    const logicalDay = financialDate.toISOString().split('T')[0];

    await supabase.from('portfolio_history').upsert({
      portfolio_id: portfolioId,
      date: logicalDay,
      total_invested: totalInv,
      total_market_value: totalMkt,
      total_p_l: totalMkt - totalInv,
      day_change: totalDayChange,
      updated_at: new Date().toISOString()
    }, { onConflict: 'portfolio_id, date' });

    return updatedHoldings.length;
  }
}
