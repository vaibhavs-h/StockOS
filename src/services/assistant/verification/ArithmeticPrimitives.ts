// Pure, deterministic math — zero DB/context coupling, nothing here ever calls out to
// Supabase or an LLM. Used by DerivedFactsBuilder to compute the "truth" a response's
// financial claims get checked against (§ Phase 1 of the V2 plan).

/** Percentage change from `previous` to `current`, e.g. day-change % from prev close. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Absolute change from `previous` to `current`, e.g. day gain/loss in currency units. */
export function absoluteChange(current: number, previous: number): number {
  return current - previous;
}

/** What percent `part` is of `whole`, e.g. a holding's weight in a portfolio. */
export function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Strips a `formatMoney`-style string ("₹1,327.30", "$338.86") down to a plain number,
 * or passes a plain number through unchanged. Returns null for anything unparseable —
 * callers treat that as "this fact can't be computed from what's available," never as 0.
 */
export function parseMoneyOrNumber(value: number | string | null): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[₹$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}
