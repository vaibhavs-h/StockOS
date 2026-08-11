// Shared helper: which physical table a storage-form symbol lives in.
// Storage symbols from SymbolUniverseManager keep .NS/.BO suffixes for Indian equities
// and have none for US equities (see CLAUDE.md → Symbol/asset model).
export function tableForSymbol(symbol: string): 'market_assets' | 'us_market_assets' {
  const upper = symbol.toUpperCase();
  return upper.endsWith('.NS') || upper.endsWith('.BO') ? 'market_assets' : 'us_market_assets';
}

export interface CurrencyInfo {
  code: 'INR' | 'USD';
  symbol: '₹' | '$';
  locale: 'en-IN' | 'en-US';
}

export const CURRENCY: Record<'INR' | 'USD', CurrencyInfo> = {
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
};

export function currencyForSymbol(symbol: string): CurrencyInfo {
  return tableForSymbol(symbol) === 'market_assets' ? CURRENCY.INR : CURRENCY.USD;
}

/**
 * Bakes the correct currency symbol directly into a monetary value at the retrieval
 * layer — the model is handed an already-unambiguous string ("₹1,327.30") rather than a
 * bare number it would have to guess the currency of. Grounding, not inference: this is
 * the same discipline as everywhere else in the pipeline, applied to currency specifically
 * because a wrong currency label is a materially misleading answer, not a cosmetic one.
 */
export function formatMoney(value: number, currency: CurrencyInfo, decimals = 2): string {
  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value).toLocaleString(currency.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // "-$2.05", not "$-2.05" — the sign belongs in front of the whole quantity, not
  // between the currency symbol and the digits.
  return `${sign}${currency.symbol}${magnitude}`;
}
