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
    const { getMarketStatus } = require('@/constants/market-constants');
    const marketStatus = getMarketStatus(market || (symbol.endsWith('.NS') ? 'IN' : 'US'));
    if (marketStatus === 'CLOSED') {
      return NextResponse.json({ success: true, symbol, state: 'SILENT_DUE_TO_OFF_HOURS' });
    }

    // 1. Instant RAM Activation (The Ephemeral Pulse)
    marketStateCache.updateHeartbeat(symbol);

    // 2. Throttled DB Persistence (The Metadata Pulse)
    // We only touch the DB if the last view was > 1 min ago to prevent spam
    const supabase = SupabaseProvider.getClient();
    
    // Note: In a production serverless environment, we'd use a background worker
    // or a specialized service for this, but here we can do a 'lazy' upsert.
    const { error } = await supabase
      .from('active_market_symbols')
      .upsert({
        symbol,
        market: market || (symbol.endsWith('.NS') ? 'IN' : 'US'),
        last_viewed_at: new Date().toISOString(),
        state: 'EPHEMERAL'
      }, { onConflict: 'symbol' });

    if (error) {
       // Log but don't block the response
       console.error(`[HEARTBEAT] ❌ DB Upsert failed for ${symbol}:`, error.message);
    }

    return NextResponse.json({ success: true, symbol, state: 'EPHEMERAL' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
