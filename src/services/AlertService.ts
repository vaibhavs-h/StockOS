import { createClient } from '@supabase/supabase-js';
import { PriceAlertRegistryService } from '../scheduler/core/PriceAlertRegistryService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export class AlertService {
  /**
   * Create a new price alert.
   */
  public static async createAlert(
    userId: string,
    symbol: string,
    assetType: 'EQUITY' | 'US_EQUITY' | 'MF',
    triggerCondition: 'ABOVE' | 'BELOW',
    targetValue: number,
    name?: string
  ) {
    const sym = symbol.trim().toUpperCase();

    // Insert into DB
    const { data, error } = await supabase
      .from('price_alerts')
      .insert({
        user_id: userId,
        symbol: sym,
        asset_type: assetType,
        name: name || null,
        trigger_condition: triggerCondition,
        target_value: targetValue,
        is_triggered: false
      })
      .select()
      .single();

    if (error) {
      console.error('[ALERT-SERVICE] Failed to create alert:', error.message);
      throw error;
    }

    // Increment active count in PriceAlertRegistryService if it is equity
    if (assetType === 'EQUITY' || assetType === 'US_EQUITY') {
      await PriceAlertRegistryService.incrementCount(sym);
    }

    return data;
  }

  /**
   * Delete a price alert.
   */
  public static async deleteAlert(userId: string, alertId: string) {
    // 1. Fetch details of the alert first to get symbol and type
    const { data: alert, error: fError } = await supabase
      .from('price_alerts')
      .select('symbol, asset_type, is_triggered')
      .eq('id', alertId)
      .eq('user_id', userId)
      .single();

    if (fError || !alert) {
      console.error('[ALERT-SERVICE] Alert not found for deletion:', fError?.message);
      throw new Error(fError?.message || 'Alert not found');
    }

    // 2. Delete the alert
    const { error: dError } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', alertId)
      .eq('user_id', userId);

    if (dError) {
      console.error('[ALERT-SERVICE] Failed to delete alert:', dError.message);
      throw dError;
    }

    // 3. Decrement registry count if the deleted alert was active and is an equity
    if (!alert.is_triggered && (alert.asset_type === 'EQUITY' || alert.asset_type === 'US_EQUITY')) {
      await PriceAlertRegistryService.decrementCount(alert.symbol);
    }

    return { success: true };
  }

  /**
   * Fetch active and history alerts for a user.
   */
  public static async getUserAlerts(userId: string) {
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ALERT-SERVICE] Failed to fetch user alerts:', error.message);
      throw error;
    }

    return data || [];
  }

  /**
   * Transactional alert trigger execution.
   * Updates alert record and logs a user notification.
   */
  public static async triggerAlertTx(
    alertId: string,
    userId: string,
    symbol: string,
    assetType: 'EQUITY' | 'US_EQUITY' | 'MF',
    triggeredPrice: number,
    condition: 'ABOVE' | 'BELOW',
    targetValue: number
  ) {
    const title = 'Price Alert Triggered 🚨';
    const conditionText = condition === 'ABOVE' ? 'rises above' : 'falls below';
    const message = `${symbol} has touched ₹${triggeredPrice.toFixed(2)} (Target: ${conditionText} ₹${targetValue.toFixed(2)})`;
    const link = assetType === 'US_EQUITY' ? `/us-stocks/${symbol}` : `/stocks/${symbol}`;
    const metadata = {
      symbol,
      current_price: triggeredPrice,
      target_price: targetValue,
      alert_id: alertId
    };

    console.log(`[ALERT-SERVICE] Triggering alert ${alertId} for ${symbol}...`);

    // 1. Attempt using RPC transaction helper first
    const { data: rpcSuccess, error: rpcError } = await supabase.rpc('trigger_price_alert_tx', {
      p_alert_id: alertId,
      p_triggered_price: triggeredPrice,
      p_user_id: userId,
      p_title: title,
      p_message: message,
      p_link: link,
      p_metadata: metadata
    });

    if (rpcError) {
      console.warn('[ALERT-SERVICE] RPC transaction failed or not found. Falling back to manual sequence...');
      
      // Fallback: Perform sequential execution (DB client-side coordination)
      const { error: updateError } = await supabase
        .from('price_alerts')
        .update({
          is_triggered: true,
          triggered_at: new Date().toISOString(),
          last_checked_price: triggeredPrice,
          last_checked_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (updateError) {
        console.error('[ALERT-SERVICE] Fallback update failed:', updateError.message);
        throw updateError;
      }

      const { error: notifError } = await supabase
        .from('user_notifications')
        .insert({
          user_id: userId,
          title,
          message,
          type: 'ALERT_PRICE',
          link,
          metadata
        });

      if (notifError) {
        console.error('[ALERT-SERVICE] Fallback notification insert failed:', notifError.message);
        throw notifError;
      }
    }

    // 2. Only after successful DB commit, decrement registry active count if it's an equity
    if (assetType === 'EQUITY' || assetType === 'US_EQUITY') {
      await PriceAlertRegistryService.decrementCount(symbol);
    }

    return true;
  }
}
