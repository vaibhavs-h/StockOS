import { SupabaseProvider } from '../providers/SupabaseProvider';
import { AlertService } from '../../services/AlertService';

export class AlertTriggerService {
  /**
   * Evaluates price alerts against fresh market snapshots.
   * Eliminates database queries for pricing since the engine already has fresh snapshots in memory.
   */
  public static async checkPriceAlerts(updatedSnapshots: Array<{ symbol: string; price: number; region: string }>) {
    if (!updatedSnapshots || updatedSnapshots.length === 0) return;

    const supabase = SupabaseProvider.getClient();
    const symbolMap = new Map<string, number>();
    updatedSnapshots.forEach(snap => {
      if (snap.price && snap.price > 0) {
        symbolMap.set(snap.symbol.toUpperCase(), snap.price);
      }
    });

    const symbolsToQuery = Array.from(symbolMap.keys());
    if (symbolsToQuery.length === 0) return;

    try {
      // 1. Fetch active alerts for these symbols
      const { data: alerts, error } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('is_triggered', false)
        .in('symbol', symbolsToQuery);

      if (error) throw error;
      if (!alerts || alerts.length === 0) return;

      // 2. Evaluate triggers
      for (const alert of alerts) {
        const currentPrice = symbolMap.get(alert.symbol.toUpperCase());
        if (!currentPrice) continue;

        let isTriggered = false;
        if (alert.trigger_condition === 'ABOVE' && currentPrice >= Number(alert.target_value)) {
          isTriggered = true;
        } else if (alert.trigger_condition === 'BELOW' && currentPrice <= Number(alert.target_value)) {
          isTriggered = true;
        }

        if (isTriggered) {
          // Transactional trigger execution via AlertService
          await AlertService.triggerAlertTx(
            alert.id,
            alert.user_id,
            alert.symbol,
            alert.asset_type,
            currentPrice,
            alert.trigger_condition,
            Number(alert.target_value)
          ).catch(err => {
            console.error(`[ALERT-TRIGGER] Failed triggering alert ${alert.id}:`, err.message);
          });
        }
      }
    } catch (err: any) {
      console.error('[ALERT-TRIGGER] Error in checkPriceAlerts:', err.message);
    }
  }

  /**
   * Scans all users' active equity holdings at 12:02 PM.
   * Triggers alert if any holding moves > 2.0% absolute change.
   */
  public static async checkMidDayMovements() {
    console.log('[ALERT-TRIGGER] Running Mid-Day Stock Movement scans (12:02 PM)...');
    const supabase = SupabaseProvider.getClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
      // 1. Fetch all holdings
      const { data: holdings, error: hErr } = await supabase
        .from('holdings')
        .select('user_id, trading_symbol, quantity');

      if (hErr || !holdings || holdings.length === 0) return;

      // 2. Fetch market assets quotes
      const symbols = [...new Set(holdings.map(h => h.trading_symbol.toUpperCase()))];
      const [{ data: inAssets }, { data: usAssets }] = await Promise.all([
        supabase.from('market_assets').select('symbol, current_price, prev_close, day_change_percentage').in('symbol', symbols),
        supabase.from('us_market_assets').select('symbol, current_price, prev_close, day_change_percentage').in('symbol', symbols),
      ]);

      const assetMap = new Map<string, { current_price: number; prev_close: number; day_change_percentage: number }>();
      [...(inAssets || []), ...(usAssets || [])].forEach(a => {
        assetMap.set(a.symbol.toUpperCase(), {
          current_price: Number(a.current_price) || 0,
          prev_close: Number(a.prev_close) || 0,
          day_change_percentage: Number(a.day_change_percentage) || 0,
        });
      });

      // 3. Scan and trigger
      for (const h of holdings) {
        const sym = h.trading_symbol.toUpperCase();
        const asset = assetMap.get(sym);
        if (!asset || asset.current_price <= 0) continue;

        const changePct = asset.day_change_percentage;
        const absChange = Math.abs(changePct);

        if (absChange >= 2.0) {
          // Check for duplication today
          const { data: dup } = await supabase
            .from('user_notifications')
            .select('id')
            .eq('user_id', h.user_id)
            .eq('type', 'ALERT_MIDDAY')
            .gt('created_at', todayStart.toISOString())
            .filter('metadata->>symbol', 'eq', sym)
            .limit(1);

          if (dup && dup.length > 0) continue; // Already alerted today

          const direction = changePct >= 0 ? 'surged' : 'dropped';
          const directionEmoji = changePct >= 0 ? '📈' : '📉';
          const title = `Mid-day Movement Alert ${directionEmoji}`;
          const message = `Your holding in ${sym} has ${direction} ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% today by mid-day! Currently trading at ₹${asset.current_price.toFixed(2)}.`;
          const link = sym.endsWith('.NS') || sym.endsWith('.BO') ? `/stocks/${sym}` : `/us-stocks/${sym}`;

          await supabase.from('user_notifications').insert({
            user_id: h.user_id,
            title,
            message,
            type: 'ALERT_MIDDAY',
            link,
            metadata: {
              symbol: sym,
              current_price: asset.current_price,
              prev_close: asset.prev_close,
              change_percentage: changePct
            }
          });
          console.log(`[ALERT-TRIGGER] Mid-day movement logged for user ${h.user_id} on ${sym} (${changePct.toFixed(2)}%)`);
        }
      }
    } catch (err: any) {
      console.error('[ALERT-TRIGGER] Error in checkMidDayMovements:', err.message);
    }
  }

  /**
   * Computes daily overall portfolio performance EOD at 3:47 PM.
   * Logs consolidated total net worth, day change, and total return returns.
   */
  public static async checkEodSummary() {
    console.log('[ALERT-TRIGGER] Running End-of-Market summary generation (3:47 PM)...');
    const supabase = SupabaseProvider.getClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
      // 1. Fetch user portfolios
      const { data: portfolios, error: pErr } = await supabase
        .from('user_portfolios')
        .select('id, user_id, name');

      if (pErr || !portfolios || portfolios.length === 0) return;

      // Group portfolios by user
      const userPortfoliosMap = new Map<string, string[]>();
      portfolios.forEach(p => {
        const u = p.user_id;
        if (!userPortfoliosMap.has(u)) userPortfoliosMap.set(u, []);
        userPortfoliosMap.get(u)!.push(p.id);
      });

      for (const [userId, portfolioIds] of userPortfoliosMap.entries()) {
        // Prevent duplicate alerts today
        const { data: dup } = await supabase
          .from('user_notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'ALERT_EOD')
          .gt('created_at', todayStart.toISOString())
          .limit(1);

        if (dup && dup.length > 0) continue;

        // Fetch holdings for user's portfolios
        const { data: holdings } = await supabase
          .from('holdings')
          .select('trading_symbol, quantity, invested_value, market_value, day_change')
          .in('portfolio_id', portfolioIds);

        if (!holdings || holdings.length === 0) continue;

        let totalInvested = 0;
        let totalMarket = 0;
        let totalDayPL = 0;

        holdings.forEach(h => {
          totalInvested += Number(h.invested_value) || 0;
          totalMarket += Number(h.market_value) || 0;
          totalDayPL += Number(h.day_change) || 0;
        });

        const totalReturns = totalMarket - totalInvested;
        const totalReturnsPct = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;
        const baseline = totalMarket - totalDayPL;
        const dayChangePct = baseline > 0 ? (totalDayPL / baseline) * 100 : 0;

        const sign = totalDayPL >= 0 ? '+' : '';
        const title = 'End of Market Summary 🔔';
        const message = `Market Closed: You made ${sign}₹${totalDayPL.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${sign}${dayChangePct.toFixed(2)}%) today. Your total Net Worth is ₹${totalMarket.toLocaleString('en-IN', { maximumFractionDigits: 0 })}.`;
        
        await supabase.from('user_notifications').insert({
          user_id: userId,
          title,
          message,
          type: 'ALERT_EOD',
          link: '/dashboard',
          metadata: {
            total_net_worth: totalMarket,
            total_invested: totalInvested,
            day_change: totalDayPL,
            day_change_percentage: dayChangePct,
            total_returns: totalReturns,
            total_returns_percentage: totalReturnsPct
          }
        });
        console.log(`[ALERT-TRIGGER] EOD summary notification created for user ${userId}`);
      }
    } catch (err: any) {
      console.error('[ALERT-TRIGGER] Error in checkEodSummary:', err.message);
    }
  }

  /**
   * Scans mutual fund holdings EOD at 11:35 PM after AMFI NAV updates.
   * Also evaluates active MF price alerts since NAV updates occur only once daily.
   */
  public static async checkMfNightlySummary() {
    console.log('[ALERT-TRIGGER] Running Nightly Mutual Fund EOD summary & alert check (11:35 PM)...');
    const supabase = SupabaseProvider.getClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
      // --- PART 1: Process User Mutual Fund Summary Notifications ---
      // Get unique users with mutual fund holdings
      const { data: mfHoldings, error: mfErr } = await supabase
        .from('user_mutual_fund_holdings')
        .select('user_id, isin, scheme_name, quantity, average_price, market_value, day_change, p_l');

      if (mfErr || !mfHoldings || mfHoldings.length === 0) return;

      const userHoldingsMap = new Map<string, any[]>();
      mfHoldings.forEach(h => {
        const u = h.user_id;
        if (!userHoldingsMap.has(u)) userHoldingsMap.set(u, []);
        userHoldingsMap.get(u)!.push(h);
      });

      for (const [userId, holdings] of userHoldingsMap.entries()) {
        const { data: dup } = await supabase
          .from('user_notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'ALERT_MF_NIGHTLY')
          .gt('created_at', todayStart.toISOString())
          .limit(1);

        if (dup && dup.length > 0) continue;

        let totalInvested = 0;
        let totalMarket = 0;
        let totalDayPL = 0;

        holdings.forEach(h => {
          const qty = Number(h.quantity) || 0;
          const avg = Number(h.average_price) || 0;
          totalInvested += qty * avg;
          totalMarket += Number(h.market_value) || 0;
          totalDayPL += Number(h.day_change) || 0;
        });

        const totalReturns = totalMarket - totalInvested;
        const totalReturnsPct = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;
        
        const sign = totalDayPL >= 0 ? '+' : '';
        const title = 'Nightly Mutual Fund NAV Summary 📊';
        const message = `Your mutual fund NAVs updated: You gained ${sign}₹${totalDayPL.toLocaleString('en-IN', { maximumFractionDigits: 0 })} today. Total Mutual Fund value: ₹${totalMarket.toLocaleString('en-IN', { maximumFractionDigits: 0 })}.`;

        await supabase.from('user_notifications').insert({
          user_id: userId,
          title,
          message,
          type: 'ALERT_MF_NIGHTLY',
          link: '/dashboard',
          metadata: {
            mf_market_value: totalMarket,
            mf_invested_value: totalInvested,
            mf_day_change: totalDayPL,
            mf_total_returns: totalReturns,
            mf_total_returns_percentage: totalReturnsPct
          }
        });
        console.log(`[ALERT-TRIGGER] Nightly MF summary created for user ${userId}`);
      }

      // --- PART 2: Evaluate Mutual Fund Price Alerts (Runs strictly nightly) ---
      const { data: mfAlerts, error: alErr } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('is_triggered', false)
        .eq('asset_type', 'MF');

      if (alErr || !mfAlerts || mfAlerts.length === 0) return;

      const alertIsins = [...new Set(mfAlerts.map(a => a.symbol.toUpperCase()))];
      const { data: mfMaster } = await supabase
        .from('mutual_funds_master')
        .select('isin, current_price')
        .in('isin', alertIsins);

      if (!mfMaster || mfMaster.length === 0) return;

      const navMap = new Map<string, number>();
      mfMaster.forEach(m => {
        if (m.current_price) {
          navMap.set(m.isin.toUpperCase(), Number(m.current_price));
        }
      });

      for (const alert of mfAlerts) {
        const currentNav = navMap.get(alert.symbol.toUpperCase());
        if (!currentNav) continue;

        let isTriggered = false;
        if (alert.trigger_condition === 'ABOVE' && currentNav >= Number(alert.target_value)) {
          isTriggered = true;
        } else if (alert.trigger_condition === 'BELOW' && currentNav <= Number(alert.target_value)) {
          isTriggered = true;
        }

        if (isTriggered) {
          await AlertService.triggerAlertTx(
            alert.id,
            alert.user_id,
            alert.symbol,
            alert.asset_type,
            currentNav,
            alert.trigger_condition,
            Number(alert.target_value)
          ).catch(err => {
            console.error(`[ALERT-TRIGGER] Failed triggering MF alert ${alert.id}:`, err.message);
          });
        }
      }
    } catch (err: any) {
      console.error('[ALERT-TRIGGER] Error in checkMfNightlySummary:', err.message);
    }
  }
}
