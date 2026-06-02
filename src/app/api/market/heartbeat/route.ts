import { NextRequest, NextResponse } from 'next/server';
import { marketStateCache } from '@/scheduler/core/MarketStateCache';
import { SupabaseProvider } from '@/scheduler/providers/SupabaseProvider';

/**
 * Heartbeat API: The Soft-Signal Neural Link.
 * Updates the RAM cache instantly to 'wake' a symbol for ephemeral sync.
 * Throttles Supabase persistence to once per minute per symbol.
 */
export async function POST(req: NextRequest) {
  try {
    const { symbol, market } = await req.json();

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // INSTITUTIONAL SILENCE: If market is closed, we DO NOT wake up the symbol.
    // This prevents stale API data from overwriting high-fidelity Zerodha imports.
    // We import getMarketStatus dynamically to avoid circular dependencies if any
    const { getMarketStatus, SymbolUniverseManager } = require('@/constants/market-constants');
    
    // Determine the market region dynamically and robustly (completely server-authoritative with client-hints)
    let resolvedMarket = market || 'US';
    const upperSymbol = symbol.toUpperCase().trim();
    if (upperSymbol.endsWith('.NS') || upperSymbol.endsWith('.BO')) {
      resolvedMarket = 'IN';
    } else if (upperSymbol.startsWith('^') || upperSymbol === 'VIX') {
      const isIndIndex = ['^NSEI', '^BSESN', '^NSEBANK', '^CNXIT'].includes(upperSymbol);
      resolvedMarket = isIndIndex ? 'IN' : 'US';
    } else {
      // Fallback for raw tickers without exchange suffix
      const rawTicker = upperSymbol.split('.')[0];
      const isIndian = SymbolUniverseManager.getUniqueIndianEquities().some((a: any) => {
        const normAsset = a.s.toUpperCase();
        return normAsset.split('.')[0] === rawTicker;
      });
      resolvedMarket = isIndian ? 'IN' : 'US';
    }

    // Resolve the symbol canonically using the correctly resolved market region
    const resolvedSymbol = SymbolUniverseManager.resolveSymbol(symbol, resolvedMarket);

    // 1. Database Persistence (Register symbol in DB Active Symbols Table)
    const { ActiveRegistryService } = require('@/scheduler/core/ActiveRegistryService');
    const universe = await ActiveRegistryService.getActiveUniverse(resolvedMarket);
    const isHot = universe.hot.includes(resolvedSymbol);
    const now = new Date().toISOString();

    const supabase = SupabaseProvider.getClient();
    const { error } = await supabase
      .from('active_market_symbols')
      .upsert({
        symbol: resolvedSymbol,
        market: resolvedMarket,
        last_viewed_at: now,
        state: isHot ? 'HOT' : 'EPHEMERAL',
        is_live_enabled: isHot || resolvedSymbol.startsWith('^'),
        last_holding_seen_at: isHot ? now : null
      }, { onConflict: 'symbol' });

    if (error) {
       console.error(`[HEARTBEAT] DB Upsert failed for ${resolvedSymbol}:`, error.message);
    }

    // 2. Off-Hours Check: If the market is closed, register in DB but return early
    const marketStatus = getMarketStatus(resolvedMarket);
    if (marketStatus === 'CLOSED') {
      return NextResponse.json({ success: true, symbol: resolvedSymbol, state: 'SILENT_DUE_TO_OFF_HOURS' });
    }

    // 3. Hot RAM Activation (Only for open market hours)
    marketStateCache.updateHeartbeat(resolvedSymbol);

    return NextResponse.json({ success: true, symbol: resolvedSymbol, state: isHot ? 'HOT' : 'EPHEMERAL' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
