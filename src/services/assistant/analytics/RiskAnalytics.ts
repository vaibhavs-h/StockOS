import { HoldingWithMeta } from '../retrieval/PortfolioHoldingsRetriever';
import { ProvenancedField } from '../types';
import { PortfolioAnalytics } from './PortfolioAnalytics';

// No per-stock governance-risk columns exist on either market_assets or us_market_assets
// (confirmed by direct schema query, Aug 2026 — audit_risk/board_risk/overall_risk etc. are
// simply not columns on this DB) — risk_analysis is portfolio-level only, built entirely on
// top of PortfolioAnalytics' existing beta/diversification/volatility/concentration math
// rather than duplicating it. The one genuinely new piece is a qualitative risk_level band,
// which nothing upstream computes today.
function riskLevelFrom(diversificationScore: number, volatilityScore: number, beta: number): 'Low' | 'Moderate' | 'High' {
  if (diversificationScore >= 75 && volatilityScore < 90 && beta < 1.1) return 'Low';
  if (diversificationScore < 50 || volatilityScore > 130 || beta > 1.4) return 'High';
  return 'Moderate';
}

/** Reads back PortfolioAnalytics' own output (rather than recomputing) to stay correct for
 * both the single-currency and INR./USD.-prefixed mixed-portfolio shapes it already handles. */
function computeRiskLevels(base: ProvenancedField[]): ProvenancedField[] {
  const asOf = new Date().toISOString();
  const byPrefix = new Map<string, { diversification?: number; volatility?: number; beta?: number }>();

  base.forEach(f => {
    const dot = f.field.lastIndexOf('.');
    const prefix = dot === -1 ? '' : f.field.slice(0, dot);
    const name = dot === -1 ? f.field : f.field.slice(dot + 1);
    const entry = byPrefix.get(prefix) || {};
    if (name === 'diversification_score') entry.diversification = Number(f.value);
    if (name === 'volatility_score') entry.volatility = Number(f.value);
    if (name === 'portfolio_beta') entry.beta = Number(f.value);
    byPrefix.set(prefix, entry);
  });

  const levels: ProvenancedField[] = [];
  for (const [prefix, v] of byPrefix) {
    if (v.diversification === undefined || v.volatility === undefined || v.beta === undefined) continue;
    levels.push({
      field: prefix ? `${prefix}.risk_level` : 'risk_level',
      value: riskLevelFrom(v.diversification, v.volatility, v.beta),
      source: 'computed:RiskAnalytics',
      kind: 'computed',
      asOf,
    });
  }
  return levels;
}

export function computeRiskAnalytics(holdings: HoldingWithMeta[]): ProvenancedField[] {
  const base = PortfolioAnalytics.computePortfolioAnalytics(holdings);
  if (base.length === 0) return base;
  return [...base, ...computeRiskLevels(base)];
}

export const RiskAnalytics = { computeRiskAnalytics };
