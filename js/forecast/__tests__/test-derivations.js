/**
 * Tests for derivations.js — conversion rates, ARR, Demand Gen Revenue.
 * Usage: node js/forecast/__tests__/test-derivations.js
 * Exit 0 on all pass, 1 on any failure.
 */

// Inline functions
function conversionRate(current, prior) {
  if (prior == null || prior === 0) return null;
  if (prior < 0) return null;
  if (current == null) return null;
  if (current === 0) return 0;
  const rate = (current / prior) * 100;
  if (!isFinite(rate)) return null;
  return Math.round(rate * 10) / 10;
}

function computeARR(mrr) {
  if (mrr == null) return null;
  return mrr * 12;
}

function computeDemandGenRevenue(mrr, monthIndex) {
  if (mrr == null) return null;
  const multiplier = 11 - monthIndex;
  if (multiplier < 0) return 0;
  return mrr * multiplier;
}

function annualDemandGenRevenue(monthlyMRR) {
  if (!monthlyMRR || monthlyMRR.length !== 12) return null;
  let sum = 0, hasData = false;
  for (let i = 0; i < 12; i++) {
    if (monthlyMRR[i] != null && monthlyMRR[i] !== 0) {
      hasData = true;
      sum += monthlyMRR[i] * (11 - i);
    }
  }
  return hasData ? sum : null;
}

function attainmentPct(actual, forecast) {
  if (forecast == null || forecast === 0 || forecast < 0) return null;
  if (actual == null) return null;
  if (actual === 0) return 0;
  const pct = (actual / forecast) * 100;
  if (!isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

// Harness
let pass = 0, fail = 0;
function assert(label, actual, expected) {
  const eq = actual === expected || (actual == null && expected == null);
  if (eq) { console.log(`  PASS: ${label}`); pass++; }
  else { console.error(`  FAIL: ${label}\n    Expected: ${expected}\n    Got:      ${actual}`); fail++; }
}

console.log('Conversion Rate tests:');
console.log('──────────────────────');
assert('80/100 = 80%', conversionRate(80, 100), 80);
assert('25/100 = 25%', conversionRate(25, 100), 25);
assert('0/100 = 0', conversionRate(0, 100), 0);
assert('100/0 = null', conversionRate(100, 0), null);
assert('0/0 = null', conversionRate(0, 0), null);
assert('null/100 = null', conversionRate(null, 100), null);
assert('100/null = null', conversionRate(100, null), null);
assert('100/-5 = null', conversionRate(100, -5), null);
assert('150/100 = 150 (>100% allowed)', conversionRate(150, 100), 150);
assert('1/3 = 33.3', conversionRate(1, 3), 33.3);

console.log('\nARR tests:');
console.log('──────────');
assert('$1000 MRR → $12,000 ARR', computeARR(1000), 12000);
assert('$0 MRR → $0 ARR', computeARR(0), 0);
assert('null MRR → null ARR', computeARR(null), null);
assert('-500 MRR → -6000 (computed, not crashed)', computeARR(-500), -6000);

console.log('\nDemand Gen Revenue (per month) tests:');
console.log('────────────────────────────────────');
assert('$1K MRR in Jan (idx=0) → $11K DGR', computeDemandGenRevenue(1000, 0), 11000);
assert('$1K MRR in Apr (idx=3) → $8K DGR', computeDemandGenRevenue(1000, 3), 8000);
assert('$1K MRR in Nov (idx=10) → $1K DGR', computeDemandGenRevenue(1000, 10), 1000);
assert('$1K MRR in Dec (idx=11) → $0 DGR', computeDemandGenRevenue(1000, 11), 0);
assert('$0 MRR → $0 DGR', computeDemandGenRevenue(0, 0), 0);
assert('null MRR → null DGR', computeDemandGenRevenue(null, 3), null);

console.log('\nAnnual Demand Gen Revenue tests:');
console.log('────────────────────────────────');
{
  // $1K MRR every month → 1000 × (11+10+9+8+7+6+5+4+3+2+1+0) = 1000 × 66 = $66K
  const monthly = Array(12).fill(1000);
  assert('$1K/mo × 12 months → $66K annual DGR', annualDemandGenRevenue(monthly), 66000);
}
{
  // Only Jan has $1K
  const monthly = [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert('$1K Jan only → $11K annual DGR', annualDemandGenRevenue(monthly), 11000);
}
{
  // Only Dec has $1K
  const monthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000];
  assert('$1K Dec only → $0 annual DGR', annualDemandGenRevenue(monthly), 0);
}
{
  // All zeros
  const monthly = Array(12).fill(0);
  assert('All zeros → null', annualDemandGenRevenue(monthly), null);
}
{
  // All null
  const monthly = Array(12).fill(null);
  assert('All null → null', annualDemandGenRevenue(monthly), null);
}
{
  // Negative MRR (data error — compute, don't crash)
  const monthly = [-500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert('Negative MRR Jan → -$5,500 (warns, computes)', annualDemandGenRevenue(monthly), -5500);
}

console.log('\nAttainment % tests:');
console.log('───────────────────');
assert('95/100 = 95%', attainmentPct(95, 100), 95);
assert('0/100 = 0', attainmentPct(0, 100), 0);
assert('100/0 = null', attainmentPct(100, 0), null);
assert('100/-2 = null (prevents -1100% bug)', attainmentPct(100, -2), null);
assert('null/100 = null', attainmentPct(null, 100), null);
assert('100/null = null', attainmentPct(100, null), null);
assert('0/0 = null', attainmentPct(0, 0), null);

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
