import { HoldingWithMeta } from '../retrieval/PortfolioHoldingsRetriever';
import { ProvenancedField } from '../types';

// Server-side port of the cheap metrics already computed client-side in
// src/components/dashboard/PortfolioAnalyzer.tsx — same formulas, so the assistant's
// numbers agree with what the dashboard shows. Statistical metrics (Sharpe, expected
// return, performance attribution) are deferred — see architecture doc §07/§19.

/** Computes weights/beta/scores for a currency-homogeneous set of holdings. Must never be
 * called with holdings spanning more than one currency — a ₹ and a $ market value differ
 * in magnitude by ~83x, so a blended weight isn't a rounding error, it's simply wrong. */
function computeForGroup(holdings: HoldingWithMeta[]): ProvenancedField[] {
  const asOf = new Date().toISOString();
  const push = (field: string, method: string, value: number | string): ProvenancedField => ({
    field,
    value,
    source: `computed:${method}`,
    kind: 'computed',
    asOf,
  });

  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  if (totalValue === 0) return [];

  // Sector exposure
  const sectorMap: Record<string, number> = {};
  holdings.forEach(h => {
    const sector = h.sector || 'Unclassified';
    sectorMap[sector] = (sectorMap[sector] || 0) + h.marketValue;
  });
  const sectorAllocation = Object.entries(sectorMap)
    .map(([name, value]) => ({ name, weight: (value / totalValue) * 100 }))
    .sort((a, b) => b.weight - a.weight);

  // Concentration
  const holdingWeights = holdings
    .map(h => ({ symbol: h.symbol, weight: (h.marketValue / totalValue) * 100 }))
    .sort((a, b) => b.weight - a.weight);
  const largestHoldingWeight = holdingWeights[0]?.weight || 0;
  const top3Pct = holdingWeights.slice(0, 3).reduce((sum, h) => sum + h.weight, 0);
  const largestSectorWeight = sectorAllocation[0]?.weight || 0;

  // Beta
  let weightedBetaSum = 0;
  let betaWeightTotal = 0;
  holdings.forEach(h => {
    if (h.beta !== null) {
      const weight = h.marketValue / totalValue;
      weightedBetaSum += weight * h.beta;
      betaWeightTotal += weight;
    }
  });
  const portfolioBeta = betaWeightTotal > 0 ? weightedBetaSum / betaWeightTotal : 1.0;

  // Diversification score (0-100)
  let score = 100;
  if (largestHoldingWeight > 30) score -= 20;
  if (largestSectorWeight > 45) score -= 15;
  if (holdings.length < 5) score -= 15;
  if (portfolioBeta > 1.5) score -= 10;
  if (top3Pct > 60) score -= 10;
  const diversificationScore = Math.max(0, Math.min(100, score));

  // Volatility index
  const concentrationMult = 1 + (largestHoldingWeight / 100) * 0.5 + (largestSectorWeight / 100) * 0.3;
  const volatilityScore = portfolioBeta * 100 * concentrationMult;

  const fields: ProvenancedField[] = [
    push('portfolio_beta', 'portfolioBeta', Number(portfolioBeta.toFixed(2))),
    push('diversification_score', 'diversificationScore', diversificationScore),
    push('volatility_score', 'volatilityScore', Number(volatilityScore.toFixed(0))),
    push('largest_holding_weight_pct', 'concentration', Number(largestHoldingWeight.toFixed(1))),
    push('top3_holdings_weight_pct', 'concentration', Number(top3Pct.toFixed(1))),
    push('largest_sector', 'sectorExposure', sectorAllocation[0]?.name || 'Unclassified'),
    push('largest_sector_weight_pct', 'sectorExposure', Number(largestSectorWeight.toFixed(1))),
  ];

  sectorAllocation.slice(0, 3).forEach((s, i) => {
    fields.push(push(`sector_${i + 1}`, 'sectorExposure', `${s.name} (${s.weight.toFixed(1)}%)`));
  });

  return fields;
}

export function computePortfolioAnalytics(holdings: HoldingWithMeta[]): ProvenancedField[] {
  if (holdings.length === 0) return [];

  const byCurrency: Record<'INR' | 'USD', HoldingWithMeta[]> = { INR: [], USD: [] };
  holdings.forEach(h => byCurrency[h.currency].push(h));
  const activeCurrencies = (['INR', 'USD'] as const).filter(c => byCurrency[c].length > 0);

  if (activeCurrencies.length <= 1) {
    return computeForGroup(holdings); // common case — unprefixed field names, unchanged shape
  }

  // Mixed portfolio: compute each currency's weights against its own total, never a blended
  // one, and prefix field names by currency — same convention CompareStocksTool already uses
  // for per-symbol fields, so this isn't a new pattern for the Context Builder to handle.
  return activeCurrencies.flatMap(code =>
    computeForGroup(byCurrency[code]).map(f => ({ ...f, field: `${code}.${f.field}` }))
  );
}

export const PortfolioAnalytics = { computePortfolioAnalytics };
