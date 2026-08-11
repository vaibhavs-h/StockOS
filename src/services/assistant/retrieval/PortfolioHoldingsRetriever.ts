import { supabase } from '../../../lib/supabase';
import { assistantCache, CACHE_TTL } from '../AssistantCache';
import { ProvenancedField } from '../types';
import { CURRENCY, currencyForSymbol, formatMoney } from './symbolTable';

export interface HoldingWithMeta {
  symbol: string;
  marketValue: number;
  investedValue: number;
  sector: string | null;
  beta: number | null;
  currency: 'INR' | 'USD';
}

interface HoldingsBundle {
  holdings: HoldingWithMeta[];
}

export async function fetchHoldings(
  userId: string,
  portfolioId?: string
): Promise<{ fields: ProvenancedField[]; cacheKeys: string[]; raw: HoldingWithMeta[] }> {
  const cacheKey = `holdings:${userId}:${portfolioId || 'all'}`;
  const cacheKeys = [cacheKey];

  let bundle = assistantCache.get<HoldingsBundle>(cacheKey);

  if (!bundle) {
    let query = supabase.from('holdings').select('trading_symbol, market_value, invested_value').eq('user_id', userId);
    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    const { data: holdingsRows } = await query;

    if (!holdingsRows || holdingsRows.length === 0) {
      bundle = { holdings: [] };
    } else {
      const inSymbols = holdingsRows.filter(h => /\.(NS|BO)$/i.test(h.trading_symbol)).map(h => h.trading_symbol);
      const usSymbols = holdingsRows.filter(h => !/\.(NS|BO)$/i.test(h.trading_symbol)).map(h => h.trading_symbol);

      const metaMap = new Map<string, { sector: string | null; beta: number | null }>();
      const [inMeta, usMeta] = await Promise.all([
        inSymbols.length > 0
          ? supabase.from('market_assets').select('symbol, sector, beta').in('symbol', inSymbols)
          : Promise.resolve({ data: [] as any[] }),
        usSymbols.length > 0
          ? supabase.from('us_market_assets').select('symbol, sector, beta_5y').in('symbol', usSymbols)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      (inMeta.data || []).forEach((m: any) => metaMap.set(m.symbol, { sector: m.sector, beta: m.beta }));
      (usMeta.data || []).forEach((m: any) => metaMap.set(m.symbol, { sector: m.sector, beta: m.beta_5y }));

      const holdings: HoldingWithMeta[] = holdingsRows.map(h => {
        const meta = metaMap.get(h.trading_symbol);
        return {
          symbol: h.trading_symbol,
          marketValue: Number(h.market_value) || 0,
          investedValue: Number(h.invested_value) || 0,
          sector: meta?.sector || null,
          beta: meta?.beta ?? null,
          currency: currencyForSymbol(h.trading_symbol).code,
        };
      });

      bundle = { holdings };
    }

    assistantCache.set(cacheKey, bundle, CACHE_TTL.HOLDINGS_MS);
  }

  const asOf = new Date().toISOString();
  const fields: ProvenancedField[] = [
    { field: 'holdings_count', value: bundle.holdings.length, source: 'holdings', kind: 'retrieved', asOf },
  ];

  // Without a full symbol list, the model's only per-holding fact is whichever one
  // PortfolioAnalytics computes as the *largest* holding — live QA caught it concluding a
  // symbol the user asked about ("my TCS shares") wasn't held at all, just because that
  // symbol didn't happen to be the largest one and so never appeared anywhere in context.
  // This lets the model correctly confirm or deny membership for any symbol, not just #1.
  if (bundle.holdings.length > 0) {
    fields.push({ field: 'held_symbols', value: bundle.holdings.map(h => h.symbol).join(', '), source: 'holdings', kind: 'retrieved', asOf });
  }

  // Never blend ₹ and $ into one "total" — a mixed portfolio's sum would be a meaningless
  // number (the currencies differ in magnitude by ~83x, so it isn't a rounding issue, it's
  // wrong). Single-currency (or empty) portfolios — the common case — keep the simple field.
  const byCurrency: Record<'INR' | 'USD', HoldingWithMeta[]> = { INR: [], USD: [] };
  bundle.holdings.forEach(h => byCurrency[h.currency].push(h));
  const activeCurrencies = (['INR', 'USD'] as const).filter(c => byCurrency[c].length > 0);

  if (activeCurrencies.length <= 1) {
    const currency = activeCurrencies[0] ? CURRENCY[activeCurrencies[0]] : CURRENCY.INR;
    const total = bundle.holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const invested = bundle.holdings.reduce((sum, h) => sum + h.investedValue, 0);
    fields.push(
      { field: 'total_market_value', value: bundle.holdings.length > 0 ? formatMoney(total, currency, 0) : 0, source: 'holdings', kind: 'retrieved', asOf },
      { field: 'total_invested_value', value: bundle.holdings.length > 0 ? formatMoney(invested, currency, 0) : 0, source: 'holdings', kind: 'retrieved', asOf }
    );
  } else {
    for (const code of activeCurrencies) {
      const currency = CURRENCY[code];
      const total = byCurrency[code].reduce((sum, h) => sum + h.marketValue, 0);
      const invested = byCurrency[code].reduce((sum, h) => sum + h.investedValue, 0);
      fields.push(
        { field: `total_market_value_${code.toLowerCase()}`, value: formatMoney(total, currency, 0), source: 'holdings', kind: 'retrieved', asOf },
        { field: `total_invested_value_${code.toLowerCase()}`, value: formatMoney(invested, currency, 0), source: 'holdings', kind: 'retrieved', asOf }
      );
    }
  }

  return { fields, cacheKeys, raw: bundle.holdings };
}

export const PortfolioHoldingsRetriever = { fetchHoldings };
