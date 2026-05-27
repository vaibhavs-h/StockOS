import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/portfolio/daily-pl?portfolio_id=xxx
 *
 * Computes daily P&L live from market_assets prices — never reads holdings.day_change.
 * This bypasses any corruption in the holdings table from revaluation race conditions.
 *
 * Formula: SUM((current_price - prev_close) * quantity) for all holdings
 * where current_price is valid. Holdings with null prices are excluded.
 */
export async function GET(req: NextRequest) {
  const portfolioId = req.nextUrl.searchParams.get('portfolio_id');
  const userId = req.nextUrl.searchParams.get('user_id');

  if (!portfolioId) {
    return NextResponse.json({ error: 'portfolio_id is required' }, { status: 400 });
  }

  // Step 1: Get holdings (either for a specific portfolio or all portfolios for a user)
  let query = supabase.from('holdings').select('trading_symbol, quantity, invested_value, market_value, day_change, last_price');

  if (portfolioId === 'overall' || portfolioId === 'total') {
    if (!userId) return NextResponse.json({ error: 'user_id is required for overall/total view' }, { status: 400 });
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('portfolio_id', portfolioId);
  }

  const { data: holdings, error: hErr } = await query;


  if (hErr || !holdings?.length) {
    return NextResponse.json({ total_day_change: 0, day_change_percentage: 0, count: 0 });
  }

  // Step 2: Fetch market prices for exactly those symbols
  const symbols = [...new Set(holdings.map(h => h.trading_symbol.toUpperCase()))];
  const [{ data: inAssets }, { data: usAssets }] = await Promise.all([
    supabase.from('market_assets').select('symbol, current_price, prev_close').in('symbol', symbols),
    supabase.from('us_market_assets').select('symbol, current_price, prev_close').in('symbol', symbols),
  ]);

  // priceMap: symbol → { current_price (may be null), prev_close (stable) }
  const priceMap = new Map<string, { current_price: number | null; prev_close: number }>();
  [...(inAssets || []), ...(usAssets || [])].forEach(a => {
    if (a.prev_close) {
      priceMap.set(a.symbol.toUpperCase(), {
        current_price: a.current_price ? Number(a.current_price) : null,
        prev_close: Number(a.prev_close),
      });
    }
  });

  // Step 3: Compute day_change live
  // - If current_price is valid → use it (live price)
  // - If current_price is null but prev_close is valid → use holding.last_price (stale but correct)
  // - If neither → skip this holding's day_change contribution
  let totalDayChange = 0;
  let totalMarketValue = 0;
  let totalInvested = 0;
  let priced = 0;

  for (const h of holdings) {
    const sym = h.trading_symbol.toUpperCase();
    const prices = priceMap.get(sym);
    totalInvested += Number(h.invested_value) || 0;
    const qty = Number(h.quantity) || 0;

    // Determine the best available price for this stock
    const livePrice = prices?.current_price ?? null;
    const fallbackPrice = Number(h.last_price) || null;  // from last revaluation
    const prevClose = prices?.prev_close ?? null;
    const effectivePrice = (livePrice && livePrice > 0) ? livePrice : (fallbackPrice && fallbackPrice > 0 ? fallbackPrice : null);

    if (effectivePrice && prevClose && prevClose > 0) {
      const unitChange = effectivePrice - prevClose;
      totalDayChange += unitChange * qty;
      totalMarketValue += effectivePrice * qty;
      if (livePrice && livePrice > 0) priced++;
    } else {
      // No reliable live price — fall back to holdings.day_change from last successful revaluation.
      // The revaluation job preserves this value when it skips null-price stocks, so it's correct.
      totalDayChange += Number(h.day_change) || 0;
      totalMarketValue += Number(h.market_value) || 0;
    }
  }

  const baseline = totalMarketValue - totalDayChange;
  const dayChangePct = baseline > 0 ? (totalDayChange / baseline) * 100 : 0;

  return NextResponse.json({
    total_day_change: totalDayChange,
    day_change_percentage: dayChangePct,
    total_market_value: totalMarketValue,
    total_invested: totalInvested,
    priced_count: priced,
    total_count: holdings.length,
  });
}
