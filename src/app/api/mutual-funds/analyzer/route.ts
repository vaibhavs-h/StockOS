import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getDbUserId } from "@/lib/user";

export const dynamic = 'force-dynamic';

// Helper to format raw db sector names into human readable labels
const formatSectorName = (sec: string): string => {
  if (!sec) return 'Unclassified';
  return sec
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

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

    // 1. Fetch user mutual fund holdings
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
        totalValue: 0,
        totalInvested: 0,
        totalPL: 0,
        totalPLPercentage: 0,
        healthScore: { score: 100, diversification: 100, overlap: 100, amc: 100, sector: 100, insights: [] },
        allocations: { category: [], amc: [], asset: [] },
        sectorExposures: [],
        stockOverlap: { overlapPercentage: 0, topOverlappingStocks: [], pairwiseOverlap: [] }
      });
    }

    // 2. Fetch master metadata to enrich the holdings
    const schemeCodes = holdings.map(h => h.scheme_code);
    const { data: masters, error: mErr } = await supabase
      .from('mutual_funds_master')
      .select('scheme_code, name, amc_name, category, sub_category, asset_allocation, sector_allocations, top_holdings, risk_statistics, returns_1y')
      .in('scheme_code', schemeCodes);

    if (mErr) throw mErr;

    const masterMap = new Map<string, any>();
    masters?.forEach(m => masterMap.set(m.scheme_code, m));

    // 3. Compute aggregate portfolio metrics
    let totalPortfolioVal = 0;
    let totalInvestedVal = 0;

    holdings.forEach(h => {
      totalPortfolioVal += Number(h.market_value) || 0;
      totalInvestedVal += Number(h.invested_value) || 0;
    });

    if (totalPortfolioVal === 0) {
      return NextResponse.json({ error: "Portfolio value is zero" }, { status: 400 });
    }

    const totalPL = totalPortfolioVal - totalInvestedVal;
    const totalPLPercentage = totalInvestedVal > 0 ? (totalPL / totalInvestedVal) * 100 : 0;

    // --- ALLOCATION INTELLIGENCE ---
    const categoryAlloc: Record<string, number> = {};
    const amcAlloc: Record<string, number> = {};
    const assetAllocSum = { cash: 0, equity: 0, debt: 0, preferred: 0, other: 0 };

    // --- SECTOR EXPOSURE ---
    const sectorAllocSum: Record<string, number> = {};

    // --- STOCK OVERLAP DATA STRUCTURES ---
    const fundStockWeights: Record<string, Record<string, { percent: number; symbol?: string }>> = {};
    const stockAbsoluteValue: Record<string, { value: number; symbol?: string; name: string; occurrences: number }> = {};
    const schemeNames: Record<string, string> = {};

    holdings.forEach(h => {
      const val = Number(h.market_value) || 0;
      const weightInPortfolio = val / totalPortfolioVal;
      const master = masterMap.get(h.scheme_code) || {};

      const fundName = master.name || `Scheme ${h.scheme_code}`;
      schemeNames[h.scheme_code] = fundName;

      // A. Category allocation
      const cat = master.category || 'Other';
      categoryAlloc[cat] = (categoryAlloc[cat] || 0) + val;

      // B. AMC allocation
      const amc = master.amc_name || 'Other AMC';
      amcAlloc[amc] = (amcAlloc[amc] || 0) + val;

      // C. Weighted Asset Allocation (Cash vs Equity vs Debt)
      const asset = master.asset_allocation || {};
      assetAllocSum.cash += (Number(asset.cash) || 0) * weightInPortfolio;
      assetAllocSum.equity += (Number(asset.equity) || 0) * weightInPortfolio;
      assetAllocSum.debt += (Number(asset.debt) || 0) * weightInPortfolio;
      assetAllocSum.preferred += (Number(asset.preferred) || 0) * weightInPortfolio;
      assetAllocSum.other += (Number(asset.other) || 0) * weightInPortfolio;

      // D. Weighted Sector Allocation
      const sectorWeights = master.sector_allocations || {};
      Object.entries(sectorWeights).forEach(([sec, pct]) => {
        const readableSec = formatSectorName(sec);
        sectorAllocSum[readableSec] = (sectorAllocSum[readableSec] || 0) + (Number(pct) * weightInPortfolio);
      });

      // E. Setup stock weights mapping for overlap calculations
      const holdingsArray = master.top_holdings || [];
      const stockWeights: Record<string, { percent: number; symbol?: string }> = {};

      holdingsArray.forEach((sh: any) => {
        if (!sh.name) return;
        const sName = sh.name.trim();
        stockWeights[sName] = {
          percent: Number(sh.percent) || 0,
          symbol: sh.symbol || undefined
        };

        // Track combined portfolio absolute exposure for this stock
        const stockAbsoluteVal = val * (Number(sh.percent) / 100);
        if (!stockAbsoluteValue[sName]) {
          stockAbsoluteValue[sName] = { value: 0, symbol: sh.symbol || undefined, name: sName, occurrences: 0 };
        }
        stockAbsoluteValue[sName].value += stockAbsoluteVal;
        stockAbsoluteValue[sName].occurrences += 1;
      });

      fundStockWeights[h.scheme_code] = stockWeights;
    });

    // Helper to format record maps to charts array
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

    const allocations = {
      category: formatAndSort(categoryAlloc),
      amc: formatAndSort(amcAlloc),
      asset: [
        { name: 'Equity', percentage: Number(assetAllocSum.equity.toFixed(2)) },
        { name: 'Debt', percentage: Number(assetAllocSum.debt.toFixed(2)) },
        { name: 'Cash', percentage: Number(assetAllocSum.cash.toFixed(2)) },
        { name: 'Preferred', percentage: Number(assetAllocSum.preferred.toFixed(2)) },
        { name: 'Other', percentage: Number(assetAllocSum.other.toFixed(2)) }
      ].filter(a => a.percentage > 0).sort((a, b) => b.percentage - a.percentage)
    };

    const sectorExposures = Object.entries(sectorAllocSum)
      .map(([name, pct]) => ({
        name,
        percentage: Number(pct.toFixed(2))
      }))
      .filter(s => s.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage);

    // --- PAIRWISE OVERLAP CALCULATION ---
    const pairwiseOverlap: Array<{ fundA: string; fundB: string; overlapPercentage: number }> = [];
    const activeSchemeCodes = Object.keys(fundStockWeights);
    let totalOverlapSum = 0;
    let pairwiseCount = 0;

    for (let i = 0; i < activeSchemeCodes.length; i++) {
      for (let j = i + 1; j < activeSchemeCodes.length; j++) {
        const codeA = activeSchemeCodes[i];
        const codeB = activeSchemeCodes[j];
        const stocksA = fundStockWeights[codeA];
        const stocksB = fundStockWeights[codeB];

        let overlapPct = 0;
        // Sum minimum weight for matching stocks
        Object.keys(stocksA).forEach(stockName => {
          if (stocksB[stockName]) {
            overlapPct += Math.min(stocksA[stockName].percent, stocksB[stockName].percent);
          }
        });

        const overlapVal = Number(overlapPct.toFixed(2));
        pairwiseOverlap.push({
          fundA: schemeNames[codeA],
          fundB: schemeNames[codeB],
          overlapPercentage: overlapVal
        });

        totalOverlapSum += overlapVal;
        pairwiseCount++;
      }
    }

    const averageOverlap = pairwiseCount > 0 ? (totalOverlapSum / pairwiseCount) : 0;

    // --- REPEATED STOCKS & COMBINED HOLDINGS EXPOSURE ---
    const topOverlappingStocks = Object.values(stockAbsoluteValue)
      .map(stock => {
        const combinedPct = (stock.value / totalPortfolioVal) * 100;
        
        // Find which funds contain this stock and what their percentage is
        const fundsList: Array<{ fundName: string; percent: number }> = [];
        holdings.forEach(h => {
          const sWeights = fundStockWeights[h.scheme_code];
          if (sWeights && sWeights[stock.name]) {
            fundsList.push({
              fundName: schemeNames[h.scheme_code],
              percent: Number(sWeights[stock.name].percent.toFixed(2))
            });
          }
        });

        return {
          name: stock.name,
          symbol: stock.symbol || null,
          combinedExposure: Number(combinedPct.toFixed(2)),
          count: stock.occurrences,
          funds: fundsList.sort((a, b) => b.percent - a.percent)
        };
      })
      .sort((a, b) => b.combinedExposure - a.combinedExposure)
      .slice(0, 15); // Top 15 overlapping/combined holdings

    const stockOverlap = {
      overlapPercentage: Number(averageOverlap.toFixed(2)),
      topOverlappingStocks: topOverlappingStocks.filter(s => s.count > 1 || s.combinedExposure > 1), // Only repeated or high exposure
      pairwiseOverlap: pairwiseOverlap.sort((a, b) => b.overlapPercentage - a.overlapPercentage).slice(0, 8)
    };

    // --- PROPRIETARY HEALTH SCORE ---
    let divScore = 100;
    // Penalty if too few funds (<3)
    if (holdings.length === 1) divScore -= 40;
    else if (holdings.length === 2) divScore -= 20;

    // Penalty if a single fund constitutes >45%
    const largestFundPct = allocations.category.length > 0 ? (allocations.category[0].value / totalPortfolioVal) * 100 : 0;
    const largestFundWeight = holdings.length > 0 ? Math.max(...holdings.map(h => (Number(h.market_value) || 0) / totalPortfolioVal * 100)) : 0;
    if (largestFundWeight > 45) {
      divScore -= Math.min(25, (largestFundWeight - 45) * 0.8);
    }
    const finalDivScore = Math.max(10, Math.min(100, divScore));

    // AMC Concentration Score
    let amcScore = 100;
    const largestAMCPct = allocations.amc.length > 0 ? allocations.amc[0].percentage : 0;
    if (largestAMCPct > 40) {
      amcScore -= Math.min(50, (largestAMCPct - 40) * 1.0);
    }
    const finalAmcScore = Math.max(10, Math.min(100, amcScore));

    // Sector Exposure Balance Score
    let sectorScore = 100;
    const largestSectorPct = sectorExposures.length > 0 ? sectorExposures[0].percentage : 0;
    if (largestSectorPct > 35) {
      sectorScore -= Math.min(45, (largestSectorPct - 35) * 1.2);
    }
    const finalSectorScore = Math.max(10, Math.min(100, sectorScore));

    // Overlap Risk Score
    let overlapScore = 100;
    if (averageOverlap > 10) {
      overlapScore -= Math.min(50, (averageOverlap - 10) * 1.8);
    }
    const finalOverlapScore = Math.max(10, Math.min(100, overlapScore));

    // Market Cap Balance Score (Estimated)
    let capScore = 100;
    const isEquityHeavy = allocations.asset.find(a => a.name === 'Equity')?.percentage || 0;
    if (isEquityHeavy > 30) {
      // If equity-heavy, check category diversity
      const categoryNamesLower = allocations.category.map(c => c.name.toLowerCase());
      const hasSmallCap = categoryNamesLower.some(c => c.includes('small cap') || c.includes('smallcap'));
      const hasMidCap = categoryNamesLower.some(c => c.includes('mid cap') || c.includes('midcap'));
      const hasLargeCap = categoryNamesLower.some(c => c.includes('large cap') || c.includes('largecap') || c.includes('bluechip') || c.includes('index'));
      
      let categoriesMissingCount = 0;
      if (!hasSmallCap) categoriesMissingCount++;
      if (!hasMidCap) categoriesMissingCount++;
      if (!hasLargeCap) categoriesMissingCount++;

      capScore -= categoriesMissingCount * 20;
    }
    const finalCapScore = Math.max(40, Math.min(100, capScore));

    // Aggregate score weighted:
    // Diversification: 25%
    // AMC Concentration: 20%
    // Sector Balance: 20%
    // Overlap Risk: 20%
    // Cap Balance: 15%
    const aggregateScore = (
      (finalDivScore * 0.25) +
      (finalAmcScore * 0.20) +
      (finalSectorScore * 0.20) +
      (finalOverlapScore * 0.20) +
      (finalCapScore * 0.15)
    );

    // Diagnostics / Analytical Insights
    const insights: string[] = [];
    if (holdings.length < 3) {
      insights.push("DIVERSIFICATION ALERT: Portfolio contains fewer than 3 funds. Consider spreading capital across 3-5 distinct schemes to mitigate fund manager concentration.");
    } else {
      insights.push("DIVERSIFICATION OPTIMAL: Capital is distributed cleanly across multiple fund managers, keeping manager risk low.");
    }

    if (averageOverlap > 15) {
      const worstOverlap = stockOverlap.pairwiseOverlap[0];
      insights.push(`HIGH OVERLAP RISK: Underlying stock duplication is elevated. ${worstOverlap.fundA} & ${worstOverlap.fundB} share a high overlap index (${worstOverlap.overlapPercentage}%). Consider consolidating.`);
    } else {
      insights.push("LOW STOCK DUPLICATION: Underlaying equity overlap index is highly optimal, indicating high capitalization and low redundancy.");
    }

    if (largestSectorPct > 30) {
      const topSector = sectorExposures[0]?.name || 'N/A';
      insights.push(`CONCENTRATED SECTOR BIAS: Exposure to ${topSector} is elevated (${largestSectorPct}%). Consider blending mid-cap or value-focused schemes to distribute sector weightings.`);
    } else {
      insights.push("BALANCED SECTORS: Sector exposures are well-balanced with no single industry representing more than 30% of total assets.");
    }

    return NextResponse.json({
      totalValue: Number(totalPortfolioVal.toFixed(2)),
      totalInvested: Number(totalInvestedVal.toFixed(2)),
      totalPL: Number(totalPL.toFixed(2)),
      totalPLPercentage: Number(totalPLPercentage.toFixed(2)),
      healthScore: {
        score: Number(aggregateScore.toFixed(0)),
        diversification: Number(finalDivScore.toFixed(0)),
        overlap: Number(finalOverlapScore.toFixed(0)),
        amc: Number(finalAmcScore.toFixed(0)),
        sector: Number(finalSectorScore.toFixed(0)),
        cap: Number(finalCapScore.toFixed(0)),
        insights
      },
      allocations,
      sectorExposures,
      stockOverlap
    });

  } catch (error: any) {
    console.error("[API-MF-ANALYZER] Error computing advanced mutual fund analytics:", error);
    return NextResponse.json({ error: error.message || "Failed to calculate mutual fund portfolio analysis" }, { status: 500 });
  }
}
