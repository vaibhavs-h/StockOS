import { CurrencyInfo, CURRENCY, formatMoney } from '../retrieval/symbolTable';
import { ProvenancedField, StructuredContext } from '../types';
import { absoluteChange, parseMoneyOrNumber, percentChange } from './ArithmeticPrimitives';

// Runs right after ContextBuilder.build(), before synthesis. Computes deterministic
// "derived facts" (day-change %, portfolio return %, ...) from fields the retrievers
// already fetched, and returns them as ordinary `kind: 'computed'` ProvenancedFields —
// the same shape AnalyticsEngine already produces, merged straight into context.fields.
//
// This is the structural, long-term home for financial-consistency checking (V2 plan,
// Phase 1): the model is *handed* the correct number instead of being asked to compute
// one itself, so most arithmetic errors never happen in the first place, and the ones
// that do get caught for free by the existing `checkNumbers` grounding check — no
// prose-matching needed for anything that made it into this list.
// FinancialConsistencyChecks (regex-based) is the fallback for claims the model
// paraphrases or recomputes instead of quoting from here.

interface FieldPair {
  prefix: string; // '' for an unprefixed (single-stock) field, or e.g. "RELIANCE.NS" for compare_stocks
  a: ProvenancedField;
  b: ProvenancedField;
}

/** Finds fields named `nameA`/`nameB`, respecting CompareStocksTool's "SYMBOL.field" prefix
 * convention (symbols themselves can contain dots, e.g. "RELIANCE.NS", so this matches by
 * suffix rather than naively splitting on the first "."). */
function findPairs(fields: ProvenancedField[], nameA: string, nameB: string): FieldPair[] {
  const bySuffix = (suffix: string): Map<string, ProvenancedField> => {
    const map = new Map<string, ProvenancedField>();
    for (const f of fields) {
      if (f.field === suffix) map.set('', f);
      else if (f.field.endsWith(`.${suffix}`)) map.set(f.field.slice(0, f.field.length - suffix.length - 1), f);
    }
    return map;
  };

  const aMap = bySuffix(nameA);
  const bMap = bySuffix(nameB);
  const pairs: FieldPair[] = [];
  for (const [prefix, a] of aMap) {
    const b = bMap.get(prefix);
    if (b) pairs.push({ prefix, a, b });
  }
  return pairs;
}

function currencyOfFormatted(value: number | string | null): CurrencyInfo | null {
  if (typeof value !== 'string') return null;
  const unsigned = value.startsWith('-') ? value.slice(1) : value; // formatMoney puts the sign first
  if (unsigned.startsWith('₹')) return CURRENCY.INR;
  if (unsigned.startsWith('$')) return CURRENCY.USD;
  return null;
}

export class DerivedFactsBuilder {
  static build(context: StructuredContext): ProvenancedField[] {
    const facts: ProvenancedField[] = [];
    const asOf = new Date().toISOString();

    const pushPercent = (field: string, method: string, value: number | null) => {
      if (value === null) return;
      facts.push({ field, value: Math.round(value * 100) / 100, source: `computed:${method}`, kind: 'computed', asOf });
    };
    const pushMoneyFact = (field: string, method: string, value: number, currency: CurrencyInfo | null) => {
      const formatted = currency ? formatMoney(value, currency) : Math.round(value * 100) / 100;
      facts.push({ field, value: formatted, source: `computed:${method}`, kind: 'computed', asOf });
    };

    // Daily % change / absolute gain-loss — stock_research, compare_stocks (per-symbol
    // prefix aware).
    for (const { prefix, a: priceField, b: prevField } of findPairs(context.fields, 'quote_price', 'quote_prev_close')) {
      const price = parseMoneyOrNumber(priceField.value);
      const prev = parseMoneyOrNumber(prevField.value);
      if (price === null || prev === null) continue;

      const pctField = prefix ? `${prefix}.daily_change_percent` : 'daily_change_percent';
      const absField = prefix ? `${prefix}.daily_change_absolute` : 'daily_change_absolute';
      const currency = currencyOfFormatted(priceField.value);

      pushPercent(pctField, 'dailyChangePercent', percentChange(price, prev));
      pushMoneyFact(absField, 'dailyChangeAbsolute', absoluteChange(price, prev), currency);
    }

    // Portfolio return % / gain-loss — portfolio_analysis, single-currency only. A mixed
    // portfolio exposes `total_market_value_inr`/`_usd` instead of the plain field names,
    // so this naturally (and correctly) no-ops for it — same guard
    // PortfolioAnalytics.computeForGroup already enforces for weight/beta calculations.
    const totalValueField = context.fields.find(f => f.field === 'total_market_value');
    const investedField = context.fields.find(f => f.field === 'total_invested_value');
    if (totalValueField && investedField) {
      const totalValue = parseMoneyOrNumber(totalValueField.value);
      const invested = parseMoneyOrNumber(investedField.value);
      if (totalValue !== null && invested !== null && invested !== 0) {
        const currency = currencyOfFormatted(totalValueField.value);
        pushPercent('portfolio_return_percent', 'portfolioReturnPercent', percentChange(totalValue, invested));
        pushMoneyFact('portfolio_gain_loss', 'portfolioGainLoss', absoluteChange(totalValue, invested), currency);
      }
    }

    return facts;
  }
}
