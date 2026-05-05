/**
 * Derived Row Calculations
 * ========================
 * Pure functions for computing conversion rates, ARR, and Demand Gen Revenue.
 * All functions apply defensive math: division-by-zero → null, never NaN/Infinity.
 *
 * Test: js/forecast/__tests__/test-derivations.js
 */

/**
 * Safe division with defensive math.
 * Returns null if divisor is 0, negative, or result would be NaN/Infinity.
 */
export function safeDivide(numerator, divisor) {
  if (divisor == null || divisor === 0) return null;
  if (divisor < 0) return null;
  if (numerator == null) return null;
  const result = numerator / divisor;
  if (!isFinite(result)) return null;
  return result;
}

/**
 * Compute conversion rate: (current / prior) × 100
 * Returns null for indeterminate cases (defensive).
 * Returns 0 when numerator is 0 with positive divisor (valid zero conversions).
 */
export function conversionRate(currentStage, priorStage) {
  if (priorStage == null || priorStage === 0) return null;
  if (priorStage < 0) return null;
  if (currentStage == null) return null;
  if (currentStage === 0) return 0;
  const rate = (currentStage / priorStage) * 100;
  if (!isFinite(rate)) return null;
  return Math.round(rate * 10) / 10;
}

/**
 * Compute ARR from MRR: MRR × 12
 * @param {number|null} mrr
 * @returns {number|null}
 */
export function computeARR(mrr) {
  if (mrr == null) return null;
  return mrr * 12;
}

/**
 * Compute Demand Gen Revenue for a single month.
 * Formula: MRR × (12 - monthIndex) where monthIndex is 0-based (Jan=0, Dec=11).
 *
 * Jan MRR contributes ×11 (not ×12 — the spec uses 12-monthIndex with Jan=0 giving ×12,
 * but the V4.2 spec explicitly states Jan=×11, Feb=×10, ..., Dec=×0).
 *
 * Wait — re-reading the spec: "MRR × (12 - month_index) where month_index is 0-based (Jan=0)"
 * So Jan: MRR × 12, Feb: MRR × 11, ..., Dec: MRR × 1. But then it says:
 * "Jan MRR contributes × 11, Feb MRR contributes × 10, ..., Dec MRR contributes × 0"
 *
 * These are contradictory. The "× 11" list with sum=66 matches: 11+10+9+...+0 = 66.
 * The formula "12 - month_index" with Jan=0 gives: 12+11+10+...+1 = 78.
 *
 * Going with the EXPLICIT LIST: Jan=×11, Feb=×10, ..., Nov=×1, Dec=×0.
 * This matches: MRR × (11 - monthIndex).
 *
 * @param {number|null} mrr
 * @param {number} monthIndex - 0-based (Jan=0, Dec=11)
 * @returns {number|null}
 */
export function computeDemandGenRevenue(mrr, monthIndex) {
  if (mrr == null) return null;
  const multiplier = 11 - monthIndex;
  if (multiplier < 0) return 0;
  return mrr * multiplier;
}

/**
 * Compute annual Demand Gen Revenue from 12 monthly MRR values.
 * @param {Array<number|null>} monthlyMRR - 12-element array (index 0=Jan)
 * @returns {number|null}
 */
export function annualDemandGenRevenue(monthlyMRR) {
  if (!monthlyMRR || monthlyMRR.length !== 12) return null;
  let sum = 0;
  let hasData = false;
  for (let i = 0; i < 12; i++) {
    const mrr = monthlyMRR[i];
    if (mrr != null && mrr !== 0) {
      hasData = true;
      sum += mrr * (11 - i);
    }
  }
  return hasData ? sum : null;
}

/**
 * Compute attainment percentage with defensive math.
 * @param {number|null} actual
 * @param {number|null} forecast
 * @returns {number|null} - percentage (e.g. 95.5), or null for indeterminate
 */
export function attainmentPct(actual, forecast) {
  if (forecast == null || forecast === 0 || forecast < 0) return null;
  if (actual == null) return null;
  if (actual === 0) return 0;
  const pct = (actual / forecast) * 100;
  if (!isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

/**
 * Format a defensive display value.
 * @param {number|null} value
 * @param {'percent'|'currency'|'count'} format
 * @param {(n: number) => string} [currencyFmt] - optional currency formatter
 * @returns {string}
 */
export function formatDefensive(value, format, currencyFmt) {
  if (value == null || (typeof value === 'number' && !isFinite(value))) return '\u2014';
  if (format === 'percent') return value.toFixed(1) + '%';
  if (format === 'currency') return currencyFmt ? currencyFmt(value) : '$' + Math.round(value).toLocaleString();
  return value.toLocaleString();
}
