import { HoldingWithMeta } from '../retrieval/PortfolioHoldingsRetriever';
import { ProvenancedField } from '../types';

// Heuristic MVP, deliberately not a real optimizer (no mean-variance, no efficient frontier,
// no Monte Carlo) — flags computed from the user's real numbers, which the prompt then turns
// into observations, never directives. The thresholds below are StockOS's own guideline
// constants, not a claim about any individual holding, and the prompt is required to frame
// them that way. Swappable later for a real optimizer without touching the tool/prompt
// contract — this module's only job is to produce ProvenancedField[].
const SINGLE_STOCK_CONCENTRATION_THRESHOLD = 30;
const SECTOR_CONCENTRATION_THRESHOLD = 45;
const MIN_HOLDINGS_FOR_DIVERSIFICATION = 5;

function computeForGroup(holdings: HoldingWithMeta[], prefix: string): ProvenancedField[] {
  const asOf = new Date().toISOString();
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  if (totalValue === 0) return [];

  const weights = holdings
    .map(h => ({ symbol: h.symbol, weight: (h.marketValue / totalValue) * 100 }))
    .sort((a, b) => b.weight - a.weight);

  const sectorMap: Record<string, number> = {};
  holdings.forEach(h => {
    const sector = h.sector || 'Unclassified';
    sectorMap[sector] = (sectorMap[sector] || 0) + h.marketValue;
  });
  const sectorWeights = Object.entries(sectorMap)
    .map(([name, value]) => ({ name, weight: (value / totalValue) * 100 }))
    .sort((a, b) => b.weight - a.weight);

  const flags: string[] = [];

  if (weights[0] && weights[0].weight > SINGLE_STOCK_CONCENTRATION_THRESHOLD) {
    flags.push(`${weights[0].symbol} is ${weights[0].weight.toFixed(1)}% of this group of holdings, above StockOS's ${SINGLE_STOCK_CONCENTRATION_THRESHOLD}% single-stock concentration guideline.`);
  }
  if (sectorWeights[0] && sectorWeights[0].weight > SECTOR_CONCENTRATION_THRESHOLD) {
    flags.push(`${sectorWeights[0].name} is ${sectorWeights[0].weight.toFixed(1)}% of this group of holdings, above StockOS's ${SECTOR_CONCENTRATION_THRESHOLD}% sector concentration guideline.`);
  }
  if (holdings.length < MIN_HOLDINGS_FOR_DIVERSIFICATION) {
    flags.push(`Only ${holdings.length} distinct holding(s) here — below StockOS's ${MIN_HOLDINGS_FOR_DIVERSIFICATION}-holding baseline for basic diversification.`);
  }

  const symbolCounts: Record<string, number> = {};
  holdings.forEach(h => { symbolCounts[h.symbol] = (symbolCounts[h.symbol] || 0) + 1; });
  const duplicates = Object.entries(symbolCounts).filter(([, count]) => count > 1).map(([symbol]) => symbol);
  if (duplicates.length > 0) {
    flags.push(`${duplicates.join(', ')} each appear as more than one separate holding entry.`);
  }

  if (flags.length === 0) {
    return [{
      field: prefix ? `${prefix}.rebalancing_flags` : 'rebalancing_flags',
      value: "No concentration or diversification flags against StockOS's current guidelines.",
      source: 'computed:RebalancingHeuristics',
      kind: 'computed',
      asOf,
    }];
  }

  return flags.map((detail, i) => ({
    field: prefix ? `${prefix}.rebalancing_flag_${i + 1}` : `rebalancing_flag_${i + 1}`,
    value: detail,
    source: 'computed:RebalancingHeuristics',
    kind: 'computed',
    asOf,
  }));
}

export function evaluate(holdings: HoldingWithMeta[]): ProvenancedField[] {
  if (holdings.length === 0) return [];

  const byCurrency: Record<'INR' | 'USD', HoldingWithMeta[]> = { INR: [], USD: [] };
  holdings.forEach(h => byCurrency[h.currency].push(h));
  const activeCurrencies = (['INR', 'USD'] as const).filter(c => byCurrency[c].length > 0);

  if (activeCurrencies.length <= 1) return computeForGroup(holdings, '');
  return activeCurrencies.flatMap(code => computeForGroup(byCurrency[code], code));
}

export const RebalancingHeuristics = { evaluate };
