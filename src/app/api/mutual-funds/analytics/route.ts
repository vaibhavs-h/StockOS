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
    // 1. Fetch user holdings
    const { data: holdings, error: hErr } = await supabase
      .from('user_mutual_fund_holdings')
      .select('*')
      .eq('user_id', userId);

    if (hErr) throw hErr;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        assetAllocation: [],
        amcConcentration: [],
        subCategoryAllocation: [],
        riskAllocation: []
      });
    }

    // 2. Fetch master metadata to group holdings
    const schemeCodes = holdings.map(h => h.scheme_code);
    const { data: masters, error: mErr } = await supabase
      .from('mutual_funds_master')
      .select('scheme_code, name, amc_name, category, sub_category, risk_level')
      .in('scheme_code', schemeCodes);

    if (mErr) throw mErr;

    const masterMap = new Map<string, any>();
    masters?.forEach(m => masterMap.set(m.scheme_code, m));

    // 3. Aggregate allocations
    const assetAlloc: Record<string, number> = {};
    const amcAlloc: Record<string, number> = {};
    const subCatAlloc: Record<string, number> = {};
    const riskAlloc: Record<string, number> = {};
    
    let totalPortfolioVal = 0;

    holdings.forEach(h => {
      const master = masterMap.get(h.scheme_code) || {};
      const category = master.category || 'Other';
      const amc = master.amc_name || 'Other AMC';
      const subCat = master.sub_category || 'Other';
      const risk = master.risk_level || 'Moderate';
      
      const mVal = Number(h.market_value) || 0;
      totalPortfolioVal += mVal;

      assetAlloc[category] = (assetAlloc[category] || 0) + mVal;
      amcAlloc[amc] = (amcAlloc[amc] || 0) + mVal;
      subCatAlloc[subCat] = (subCatAlloc[subCat] || 0) + mVal;
      riskAlloc[risk] = (riskAlloc[risk] || 0) + mVal;
    });

    // Helper to format map records into charts data array sorted by value descending
    const formatAndSort = (records: Record<string, number>) => {
      return Object.entries(records)
        .map(([name, value]) => {
          const percentage = totalPortfolioVal > 0 ? (value / totalPortfolioVal) * 100 : 0;
          return {
            name,
            value: Number(value.toFixed(2)),
            percentage: Number(percentage.toFixed(2))
          };
        })
        .sort((a, b) => b.value - a.value);
    };

    return NextResponse.json({
      totalValue: Number(totalPortfolioVal.toFixed(2)),
      assetAllocation: formatAndSort(assetAlloc),
      amcConcentration: formatAndSort(amcAlloc),
      subCategoryAllocation: formatAndSort(subCatAlloc),
      riskAllocation: formatAndSort(riskAlloc)
    });

  } catch (error: any) {
    console.error("[API-MF-ANALYTICS] Error computing mutual fund analytics:", error);
    return NextResponse.json({ error: error.message || "Failed to calculate portfolio analytics" }, { status: 500 });
  }
}
