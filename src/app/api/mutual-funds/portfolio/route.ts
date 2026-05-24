import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getDbUserId } from "@/lib/user";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUserId = (session.user as any).id;
  const userId = getDbUserId(sessionUserId);

  try {
    const url = new URL(req.url);
    const portfolioIdParam = url.searchParams.get('portfolio_id');

    // 1. Fetch user holdings
    let query = supabase
      .from('user_mutual_fund_holdings')
      .select('*')
      .eq('user_id', userId);

    if (portfolioIdParam && portfolioIdParam !== 'mf_overall') {
      query = query.eq('portfolio_id', portfolioIdParam);
    }

    const { data: holdings, error: hErr } = await query;

    if (hErr) throw hErr;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        summary: {
          total_market_value: 0,
          total_invested: 0,
          total_p_l: 0,
          total_p_l_percentage: 0,
          total_day_change: 0,
          total_day_change_percentage: 0,
          count: 0
        },
        holdings: []
      });
    }

    // 2. Fetch master fund details to enrich the response
    const schemeCodes = holdings.map(h => h.scheme_code);
    const { data: masters, error: mErr } = await supabase
      .from('mutual_funds_master')
      .select('scheme_code, name, amc_name, category, sub_category, logo_url, returns_1y, risk_level, isin, symbol')
      .in('scheme_code', schemeCodes);

    if (mErr) throw mErr;

    const masterMap = new Map<string, any>();
    masters?.forEach(m => masterMap.set(m.scheme_code, m));

    // 3. Enrich holdings and compute totals
    let totalMarketValue = 0;
    let totalInvested = 0;
    let totalDayChange = 0;

    const enrichedHoldings = holdings.map(h => {
      const master = masterMap.get(h.scheme_code) || {};
      
      const mVal = Number(h.market_value) || 0;
      const invVal = Number(h.invested_value) || 0;
      const dChg = Number(h.day_change) || 0;

      totalMarketValue += mVal;
      totalInvested += invVal;
      totalDayChange += dChg;

      return {
        ...h,
        fund_name: master.name || 'Unknown Fund',
        amc_name: master.amc_name || 'Other',
        category: master.category || 'Other',
        sub_category: master.sub_category || 'Other',
        logo_url: master.logo_url || null,
        risk_level: master.risk_level || 'Moderate',
        returns_1y: master.returns_1y || 0,
        isin: master.isin || null,
        symbol: master.symbol || null
      };
    });

    const totalPL = totalMarketValue - totalInvested;
    const totalPLPercentage = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
    const totalDayChangePercentage = (totalMarketValue - totalDayChange) > 0 
      ? (totalDayChange / (totalMarketValue - totalDayChange)) * 100 
      : 0;

    return NextResponse.json({
      summary: {
        total_market_value: totalMarketValue,
        total_invested: totalInvested,
        total_p_l: totalPL,
        total_p_l_percentage: totalPLPercentage,
        total_day_change: totalDayChange,
        total_day_change_percentage: totalDayChangePercentage,
        count: enrichedHoldings.length
      },
      holdings: enrichedHoldings
    });

  } catch (error: any) {
    console.error("[API-MF-PORTFOLIO] Error fetching mutual fund portfolio:", error);
    return NextResponse.json({ error: error.message || "Failed to retrieve portfolio" }, { status: 500 });
  }
}
