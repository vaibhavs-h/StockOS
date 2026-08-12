import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';
import { CURRENCY, formatMoney } from './symbolTable';

interface MfHolding {
  schemeCode: string;
  name: string | null;
  marketValue: number;
  investedValue: number;
}

// Mutual funds in StockOS are India-only (mutual_funds_master's symbols/ISINs are all Indian
// schemes), so unlike PortfolioHoldingsRetriever there's no INR/USD split to worry about.
export async function fetchMfHoldings(
  userId: string,
  portfolioId?: string
): Promise<{ fields: ProvenancedField[]; cacheKeys: string[]; raw: MfHolding[] }> {
  const cacheKey = `mf_holdings:${userId}:${portfolioId || 'all'}`;
  const cacheKeys = [cacheKey];

  let holdings = assistantCache.get<MfHolding[]>(cacheKey);
  if (!holdings) {
    let query = supabase.from('user_mutual_fund_holdings').select('scheme_code, market_value, invested_value').eq('user_id', userId);
    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    const { data: rows } = await query;

    if (!rows || rows.length === 0) {
      holdings = [];
    } else {
      const schemeCodes = Array.from(new Set(rows.map((r: any) => r.scheme_code)));
      const { data: master } = await supabase.from('mutual_funds_master').select('scheme_code, name').in('scheme_code', schemeCodes);
      const nameMap = new Map<string, string | null>();
      (master || []).forEach((m: any) => nameMap.set(m.scheme_code, m.name));

      holdings = rows.map((r: any) => ({
        schemeCode: r.scheme_code,
        name: nameMap.get(r.scheme_code) ?? null,
        marketValue: Number(r.market_value) || 0,
        investedValue: Number(r.invested_value) || 0,
      }));
    }
    assistantCache.set(cacheKey, holdings, CACHE_TTL.HOLDINGS_MS);
  }

  const asOf = new Date().toISOString();
  const fields: ProvenancedField[] = [
    { field: 'mf_holdings_count', value: holdings.length, source: 'user_mutual_fund_holdings', kind: 'retrieved', asOf },
  ];

  if (holdings.length > 0) {
    fields.push({ field: 'held_mf_schemes', value: holdings.map(h => h.name || h.schemeCode).join(', '), source: 'user_mutual_fund_holdings', kind: 'retrieved', asOf });

    const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalInvestedValue = holdings.reduce((sum, h) => sum + h.investedValue, 0);
    fields.push(
      { field: 'total_mf_market_value', value: formatMoney(totalMarketValue, CURRENCY.INR, 0), source: 'user_mutual_fund_holdings', kind: 'retrieved', asOf },
      { field: 'total_mf_invested_value', value: formatMoney(totalInvestedValue, CURRENCY.INR, 0), source: 'user_mutual_fund_holdings', kind: 'retrieved', asOf }
    );

    const largest = [...holdings].sort((a, b) => b.marketValue - a.marketValue)[0];
    fields.push({ field: 'largest_mf_holding', value: largest.name || largest.schemeCode, source: 'user_mutual_fund_holdings', kind: 'retrieved', asOf });
  }

  return { fields, cacheKeys, raw: holdings };
}

export const MutualFundRetriever = { fetchMfHoldings };
