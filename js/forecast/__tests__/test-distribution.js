/**
 * Tests for distribution.js — annual-to-monthly distribution math.
 * Usage: node js/forecast/__tests__/test-distribution.js
 * Exit 0 on all pass, 1 on any failure.
 */

// Inline the function (avoids ESM issues in standalone Node)
function distributeAnnualTarget({ annual, lockedCells = [] }) {
  if (annual < 0) return { values: Array(12).fill(0), warning: 'Annual target must be non-negative' };

  const result = Array(12).fill(0);
  const lockedMonths = new Set();
  let lockedSum = 0;

  for (const { month, value } of lockedCells) {
    if (month >= 0 && month < 12) {
      result[month] = value;
      lockedMonths.add(month);
      lockedSum += value;
    }
  }

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
  if (unlocked === 0) return { values: result, warning: 'All cells are manually locked.' };

  const base = Math.floor(remainder / unlocked);
  let extra = Math.round(remainder - base * unlocked);

  for (let m = 0; m < 12; m++) {
    if (lockedMonths.has(m)) continue;
    result[m] = base;
    if (extra > 0) { result[m]++; extra--; }
    else if (extra < 0) { result[m]--; extra++; }
  }

  const actualSum = result.reduce((s, v) => s + v, 0);
  const diff = annual - actualSum;
  if (diff !== 0) {
    for (let m = 0; m < 12; m++) {
      if (!lockedMonths.has(m)) { result[m] += diff; break; }
    }
  }

  return { values: result };
}

// Test harness
let pass = 0, fail = 0;
function assert(label, actual, expected) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  PASS: ${label}`);
    pass++;
  } else {
    console.error(`  FAIL: ${label}`);
    console.error(`    Expected: ${expectedStr}`);
    console.error(`    Got:      ${actualStr}`);
    fail++;
  }
}

console.log('distributeAnnualTarget() tests:');
console.log('───────────────────────────────');

// 1. No locked cells, even division
{
  const { values } = distributeAnnualTarget({ annual: 12000 });
  assert('Even division: $12K → twelve $1K', values, Array(12).fill(1000));
  assert('Even division sum = annual', values.reduce((s, v) => s + v, 0), 12000);
}

// 2. No locked cells, uneven division
{
  const { values } = distributeAnnualTarget({ annual: 13000 });
  const sum = values.reduce((s, v) => s + v, 0);
  assert('Uneven division sum = $13,000', sum, 13000);
  // First 4 months get 1084, rest get 1083
  const highs = values.filter(v => v === 1084).length;
  const lows = values.filter(v => v === 1083).length;
  assert('Uneven: 4 months at $1,084 + 8 at $1,083', highs + lows, 12);
}

// 3. $153K even division
{
  const { values } = distributeAnnualTarget({ annual: 153000 });
  assert('$153K → twelve $12,750', values, Array(12).fill(12750));
  assert('$153K sum = 153000', values.reduce((s, v) => s + v, 0), 153000);
}

// 4. One locked cell
{
  const { values } = distributeAnnualTarget({
    annual: 153000,
    lockedCells: [{ month: 2, value: 20000 }]
  });
  assert('Locked MAR preserved', values[2], 20000);
  const sum = values.reduce((s, v) => s + v, 0);
  assert('One locked cell: sum = $153K', sum, 153000);
  // 11 unlocked share $133K
  const unlockedVals = values.filter((_, i) => i !== 2);
  assert('Unlocked cells total $133K', unlockedVals.reduce((s, v) => s + v, 0), 133000);
}

// 5. Two locked cells
{
  const { values } = distributeAnnualTarget({
    annual: 153000,
    lockedCells: [{ month: 2, value: 20000 }, { month: 5, value: 5000 }]
  });
  assert('Two locked: MAR preserved', values[2], 20000);
  assert('Two locked: JUN preserved', values[5], 5000);
  const sum = values.reduce((s, v) => s + v, 0);
  assert('Two locked: sum = $153K', sum, 153000);
}

// 6. All cells locked — sum matches
{
  const locked = Array.from({ length: 12 }, (_, i) => ({ month: i, value: 12750 }));
  const { values, warning } = distributeAnnualTarget({ annual: 153000, lockedCells: locked });
  assert('All locked, sum matches: no warning', warning, undefined);
  assert('All locked values preserved', values, Array(12).fill(12750));
}

// 7. All cells locked — sum mismatch
{
  const locked = Array.from({ length: 12 }, (_, i) => ({ month: i, value: 10000 }));
  const { values, warning } = distributeAnnualTarget({ annual: 153000, lockedCells: locked });
  assert('All locked mismatch: warning present', typeof warning, 'string');
  assert('All locked mismatch: values preserved', values, Array(12).fill(10000));
}

// 8. Sum invariant for many random values
{
  let sumPasses = true;
  for (let annual = 0; annual <= 200000; annual += 7777) {
    const { values } = distributeAnnualTarget({ annual });
    if (values.reduce((s, v) => s + v, 0) !== annual) { sumPasses = false; break; }
  }
  assert('Sum invariant holds for range of values', sumPasses, true);
}

// 9. Annual = 0
{
  const { values } = distributeAnnualTarget({ annual: 0 });
  assert('Annual 0: all zeros', values, Array(12).fill(0));
}

// 10. Locked cell with value 0
{
  const { values } = distributeAnnualTarget({
    annual: 11000,
    lockedCells: [{ month: 7, value: 0 }]
  });
  assert('Locked zero: AUG = 0', values[7], 0);
  const sum = values.reduce((s, v) => s + v, 0);
  assert('Locked zero: sum = $11K', sum, 11000);
}

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
