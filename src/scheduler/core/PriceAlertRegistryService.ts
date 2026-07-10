import { SupabaseProvider } from '../providers/SupabaseProvider';
import { ActiveRegistryService } from './ActiveRegistryService';

export class PriceAlertRegistryService {
  private static alertCounts: Map<string, number> = new Map();
  private static isInitialized = false;

  /**
   * Reconstruct the in-memory count map from active database alerts.
   */
  public static async bootstrap(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('[ALERT-REGISTRY] Bootstrapping PriceAlertRegistryService...');
    const supabase = SupabaseProvider.getClient();

    try {
      // Query all active alerts (is_triggered = false) for EQUITY and US_EQUITY
      const { data: alerts, error } = await supabase
        .from('price_alerts')
        .select('symbol, asset_type')
        .eq('is_triggered', false)
        .in('asset_type', ['EQUITY', 'US_EQUITY']);

      if (error) throw error;

      this.alertCounts.clear();
      (alerts || []).forEach(alert => {
        const sym = alert.symbol.trim().toUpperCase();
        const currentCount = this.alertCounts.get(sym) || 0;
        this.alertCounts.set(sym, currentCount + 1);
      });

      // Synchronize sources with ActiveRegistryService for all loaded active alert symbols
      for (const symbol of this.alertCounts.keys()) {
        await ActiveRegistryService.registerSource(symbol, 'ALERT');
      }

      this.isInitialized = true;
      console.log(`[ALERT-REGISTRY] Bootstrap complete. Monitored symbols: ${this.alertCounts.size}`);
    } catch (err: any) {
      console.error('[ALERT-REGISTRY] Bootstrap failed:', err.message);
    }
  }

  /**
   * Get all symbols that currently have active alerts.
   */
  public static getActiveSymbols(): Set<string> {
    const symbols = new Set<string>();
    for (const [sym, count] of this.alertCounts.entries()) {
      if (count > 0) symbols.add(sym);
    }
    return symbols;
  }

  /**
   * Increment the active alert count for a symbol.
   */
  public static async incrementCount(symbol: string): Promise<void> {
    const sym = symbol.trim().toUpperCase();
    const prevCount = this.alertCounts.get(sym) || 0;
    const newCount = prevCount + 1;
    this.alertCounts.set(sym, newCount);

    console.log(`[ALERT-REGISTRY] Count incremented for ${sym}: ${prevCount} -> ${newCount}`);
    
    if (prevCount === 0) {
      // Transition 0 -> 1: Tell ActiveRegistryService to register the ALERT source
      await ActiveRegistryService.registerSource(sym, 'ALERT');
    }
  }

  /**
   * Decrement the active alert count for a symbol.
   */
  public static async decrementCount(symbol: string): Promise<void> {
    const sym = symbol.trim().toUpperCase();
    const prevCount = this.alertCounts.get(sym) || 0;
    if (prevCount === 0) return;

    const newCount = prevCount - 1;
    if (newCount === 0) {
      this.alertCounts.delete(sym);
    } else {
      this.alertCounts.set(sym, newCount);
    }

    console.log(`[ALERT-REGISTRY] Count decremented for ${sym}: ${prevCount} -> ${newCount}`);

    if (newCount === 0) {
      // Transition 1 -> 0: Tell ActiveRegistryService to remove the ALERT source
      await ActiveRegistryService.deregisterSource(sym, 'ALERT');
    }
  }
}
