/**
 * Annual-to-Monthly Distribution
 * ===============================
 * Distributes an annual target across 12 monthly cells with locked-cell preservation.
 * Used only for the Demand Gen Revenue annual target row.
 *
 * Test: js/forecast/__tests__/test-distribution.js
 */

/**
 * Distribute annual target across 12 months with locked-cell preservation.
 *
 * @param {Object} params
 * @param {number} params.annual - Annual target (whole dollars)
 * @param {Array<{month: number, value: number}>} params.lockedCells - Manually-set cells (month is 0-11)
 * @returns {{ values: number[], warning?: string }}
 *   values: Array of 12 monthly values summing to params.annual
 *   warning: Present if all cells locked or locked sum exceeds annual
 */
export function distributeAnnualTarget({ annual, lockedCells = [] }) {
  if (annual < 0) {
    return { values: Array(12).fill(0), warning: 'Annual target must be non-negative' };
  }

  const result = Array(12).fill(0);
  const lockedMonths = new Set();
  let lockedSum = 0;

  // Apply locked cells
  for (const { month, value } of lockedCells) {
    if (month >= 0 && month < 12) {
      result[month] = value;
      lockedMonths.add(month);
      lockedSum += value;
    }
  }

  // All cells locked
  if (lockedMonths.size >= 12) {
    return {
      values: result,
      warning: lockedSum !== annual
        ? `All cells are manually locked. Locked sum: $${lockedSum.toLocaleString()}, annual target: $${annual.toLocaleString()}.`
        : undefined,
    };
  }

  const remainder = annual - lockedSum;
  const unlocked = 12 - lockedMonths.size;

  if (unlocked === 0) {
    return { values: result, warning: 'All cells are manually locked. Unlock at least one to redistribute, or update the annual target.' };
  }

  // Distribute remainder across unlocked cells
  const base = Math.floor(remainder / unlocked);
  let extra = Math.round(remainder - base * unlocked);

  for (let m = 0; m < 12; m++) {
    if (lockedMonths.has(m)) continue;
    result[m] = base;
    if (extra > 0) {
      result[m]++;
      extra--;
    } else if (extra < 0) {
      result[m]--;
      extra++;
    }
  }

  // Ensure exact sum (handle rounding edge)
  const actualSum = result.reduce((s, v) => s + v, 0);
  const diff = annual - actualSum;
  if (diff !== 0) {
    // Apply diff to first unlocked cell
    for (let m = 0; m < 12; m++) {
      if (!lockedMonths.has(m)) {
        result[m] += diff;
        break;
      }
    }
  }

  return { values: result };
}
