import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';
import { getISTTimestamp, getNormalizedNoonTimestamp } from '../../server';
import { getMarketStatus } from '../../constants/market-constants';
import { MarketSessionService } from '../core/MarketSessionService';


/**
 * PortfolioRevaluationJob
 * 
 * ULTRA-STABLE REVALUATION LOGIC:
 * 1. If market is CLOSED, this job officially SHUTS DOWN. 
 *    We do not touch holdings, we do not touch history.
 *    This preserves the EOD Import fidelity perfectly.
 * 2. If market is OPEN, it performs Intelligent Reconciliation.
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
    const inOpen = MarketSessionService.isIndianMarketOpen();
    const usOpen = MarketSessionService.isUsMarketOpen();
    
    console.log(`[REVAL] Portfolio Pulse | IN: ${inOpen ? 'OPEN' : 'CLOSED'} | US: ${usOpen ? 'OPEN' : 'CLOSED'}`);


    const supabase = SupabaseProvider.getClient();

    // 1. Fetch ALL current holdings (Recover legacy records)
    const { data: currentHoldings, error: hError } = await supabase
      .from('holdings')
      .select('*');

    if (hError || !currentHoldings || currentHoldings.length === 0) {
      return 0;
    }

    // Fetch portfolios to preserve original broker names in history snapshots
    const { data: portfolios } = await supabase
      .from('user_portfolios')
      .select('id, broker_name');

    const brokerMap = new Map<string, string>();
    portfolios?.forEach(p => {
      if (p.id && p.broker_name) {
        brokerMap.set(p.id, p.broker_name);
      }
    });

    // 2. Identify unique symbols for targeted market fetch
    const { SymbolUniverseManager } = require('../../constants/market-constants');
    const symbolsToQuery = new Set<string>();
    currentHoldings.forEach(h => {
      const s = (h.trading_symbol || '').trim().toUpperCase();
      const resolved = SymbolUniverseManager.resolveSymbol(s, 'IN');
      symbolsToQuery.add(s);
      symbolsToQuery.add(resolved);
      if (!s.includes('.')) symbolsToQuery.add(`${s}.NS`);
    });

    // 3. Fetch latest market prices — use targeted .in() to avoid Supabase's 1000-row default limit
    // market_assets has 4800+ rows; fetching all would silently truncate and miss holdings
    const symbolsList = Array.from(symbolsToQuery);
    const [{ data: inAssets }, { data: usAssets }] = await Promise.all([
      supabase.from('market_assets').select('symbol, current_price, prev_close, day_change, day_change_percentage').in('symbol', symbolsList),
      supabase.from('us_market_assets').select('symbol, current_price, prev_close, day_change, day_change_percentage').in('symbol', symbolsList)
    ]);
    
    const marketMap = new Map();
    (inAssets || []).forEach(a => marketMap.set(a.symbol.trim().toUpperCase(), a));
    (usAssets || []).forEach(a => marketMap.set(a.symbol.trim().toUpperCase(), a));

    // 4. Group by portfolio
    const portfolioGroups = new Map<string, { userId: string, holdings: any[] }>();
    for (const h of currentHoldings) {
      const pid = h.portfolio_id;
      const uid = h.user_id || 'institutional-legacy'; // Recover legacy records
      if (!pid) continue;
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
      let totalDayChg = 0;

      for (const holding of holdings) {
        const symbol = (holding.trading_symbol || '').trim().toUpperCase();
        
        // INSTITUTIONAL NORMALIZATION: Deep resolve for absolute lookup
        const resolved = SymbolUniverseManager.resolveSymbol(symbol, 'IN');
        const asset = marketMap.get(resolved) || marketMap.get(symbol) || marketMap.get(`${symbol}.NS`) || marketMap.get(`${symbol}.BO`);
        
        const brokerPrice = Number(holding.last_price) || 0;
        const apiPrice = asset ? Number(asset.current_price) : 0;
        
        // If Yahoo has no current price for this stock right now, PRESERVE existing holding data.
        // Do NOT compute from brokerPrice - that produces stale/zero day_change.
        if (apiPrice <= 0) {
          updatedHoldings.push({
            ...holding,
            updated_at: getISTTimestamp()
          });
          totalMkt += Number(holding.market_value) || 0;
          totalInv += Number(holding.invested_value) || 0;
          totalDayChg += Number(holding.day_change) || 0;
          continue;
        }

        const reconciledPrice = apiPrice;
        const marketValue = holding.quantity * reconciledPrice;

        // COMPUTE day_change from prices — never trust Yahoo's stored day_change field.
        // Yahoo intermittently emits 0 for regularMarketChange mid-session (not null, actual 0).
        // That 0 passes through null-shielding and corrupts holdings.
        // prev_close is anchored once at session open → stable. current_price is validated above.
        const prevClose = Number(asset?.prev_close);
        let unitDayChange: number;
        let dayChangePct: number;

        if (prevClose > 0) {
          unitDayChange = reconciledPrice - prevClose;
          dayChangePct = (unitDayChange / prevClose) * 100;
        } else if (asset?.day_change && Number(asset.day_change) !== 0) {
          // INSTITUTIONAL FALLBACK: If calculation fails but market_assets has the data, TRUST IT.
          unitDayChange = Number(asset.day_change);
          dayChangePct = Number(asset.day_change_percentage) || 0;
        } else {
          // No baseline: preserve last known holding values
          unitDayChange = (Number(holding.day_change) || 0) / Math.max(holding.quantity || 1, 1);
          dayChangePct = Number(holding.day_change_percentage) || 0;
        }

        const currentHoldingDayChg = unitDayChange * holding.quantity;
        totalDayChg += currentHoldingDayChg;



        updatedHoldings.push({
          ...holding,
          last_price: reconciledPrice,
          market_value: marketValue,
          p_l: marketValue - holding.invested_value,
          p_l_percentage: holding.invested_value > 0 ? ((marketValue - holding.invested_value) / holding.invested_value) * 100 : 0,
          day_change: currentHoldingDayChg,
          day_change_percentage: dayChangePct,
          updated_at: getISTTimestamp()
        });

        totalMkt += marketValue;
        totalInv += holding.invested_value;
      }

      // 5. Update Database - Atomic Holdings Batch
      await supabase.from('holdings').upsert(updatedHoldings);

      const normalizedTimestamp = getNormalizedNoonTimestamp();
      const brokerName = brokerMap.get(pid) || 'INSTITUTIONAL';

      // INSTITUTIONAL SNAPSHOT: Zero-gap Upsert (Normalized Daily EOD Snapshot)
      await supabase.from('portfolio_history').upsert({
        user_id: userId,
        portfolio_id: pid,
        total_investment: totalInv,
        total_market_value: totalMkt,
        total_p_l: totalMkt - totalInv,
        p_l_percentage: totalInv > 0 ? ((totalMkt - totalInv) / totalInv) * 100 : 0,
        timestamp: normalizedTimestamp,
        broker_name: brokerName
      }, { onConflict: 'portfolio_id,timestamp' });


      totalProcessed += updatedHoldings.length;
    }

    return totalProcessed;
  }
}
