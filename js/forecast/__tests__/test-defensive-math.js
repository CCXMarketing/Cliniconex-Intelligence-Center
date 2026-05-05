/**
 * Defensive math tests — ensures no code path produces NaN%, Infinity%, -1100%, etc.
 * Usage: node js/forecast/__tests__/test-defensive-math.js
 * Exit 0 on all pass, 1 on any failure.
 */

// Inline all result-producing functions
function conversionRate(current, prior) {
  if (prior == null || prior === 0) return null;
  if (prior < 0) return null;
  if (current == null) return null;
  if (current === 0) return 0;
  const rate = (current / prior) * 100;
  if (!isFinite(rate)) return null;
  return Math.round(rate * 10) / 10;
}

function attainmentPct(actual, forecast) {
  if (forecast == null || forecast === 0 || forecast < 0) return null;
  if (actual == null) return null;
  if (actual === 0) return 0;
  const pct = (actual / forecast) * 100;
  if (!isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
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

function formatDefensive(value, format) {
  if (value == null || (typeof value === 'number' && !isFinite(value))) return '\u2014';
  if (format === 'percent') return value.toFixed(1) + '%';
  if (format === 'currency') return '$' + Math.round(value).toLocaleString();
  return value.toLocaleString();
}

// Test harness
let pass = 0, fail = 0;
function assert(label, actual, expected) {
  const eq = actual === expected;
  if (eq) { console.log(`  PASS: ${label}`); pass++; }
  else { console.error(`  FAIL: ${label}\n    Expected: "${expected}"\n    Got:      "${actual}"`); fail++; }
}

function assertNot(label, actual, forbidden) {
  if (actual !== forbidden) { console.log(`  PASS: ${label}`); pass++; }
  else { console.error(`  FAIL: ${label} — got forbidden value "${forbidden}"`); fail++; }
}

console.log('Defensive Math — No NaN/Infinity/nonsense outputs:');
console.log('──────────────────────────────────────────────────');

// ATT.% column: the -1100% bug scenario
assert('ATT% forecast=0 → null', attainmentPct(22, 0), null);
assert('ATT% forecast=-2 → null', attainmentPct(22, -2), null);
assert('ATT% forecast=negative → null', attainmentPct(100, -50), null);
assert('ATT% both=0 → null', attainmentPct(0, 0), null);
assert('ATT% actual=0 forecast=100 → 0', attainmentPct(0, 100), 0);
assert('ATT% null actual → null', attainmentPct(null, 100), null);
assert('ATT% null forecast → null', attainmentPct(100, null), null);

// Conversion rates
assert('CR prior=0 → null', conversionRate(50, 0), null);
assert('CR prior=-1 → null', conversionRate(50, -1), null);
assert('CR both=0 → null', conversionRate(0, 0), null);
assert('CR current=0 prior=50 → 0', conversionRate(0, 50), 0);
assert('CR null inputs → null', conversionRate(null, null), null);

// Revenue derivations
assert('ARR null → null', computeARR(null), null);
assert('ARR 0 → 0', computeARR(0), 0);
assert('DGR null → null', computeDemandGenRevenue(null, 3), null);
assert('DGR Dec (idx=11) → 0', computeDemandGenRevenue(1000, 11), 0);

// formatDefensive — the final display layer
assert('format null → em-dash', formatDefensive(null, 'percent'), '\u2014');
assert('format NaN → em-dash', formatDefensive(NaN, 'percent'), '\u2014');
assert('format Infinity → em-dash', formatDefensive(Infinity, 'currency'), '\u2014');
assert('format -Infinity → em-dash', formatDefensive(-Infinity, 'currency'), '\u2014');
assert('format 0% → 0.0%', formatDefensive(0, 'percent'), '0.0%');
assert('format $0 → $0', formatDefensive(0, 'currency'), '$0');

// The specific -1100% scenario from the bug report
{
  const badForecast = -2;
  const actual = 22;
  const pct = attainmentPct(actual, badForecast);
  const display = formatDefensive(pct, 'percent');
  assert('-1100% bug: ATT% display is em-dash', display, '\u2014');
  assertNot('-1100% bug: no negative percentage', display, '-1100.0%');
}

// Ensure no function can produce "NaN%" or "Infinity%"
console.log('\nExhaustive nonsense check:');
const edgeCases = [0, -1, -100, null, undefined, NaN, Infinity, -Infinity];
let nonsenseFound = false;
for (const a of edgeCases) {
  for (const b of edgeCases) {
    const cr = conversionRate(a, b);
    const att = attainmentPct(a, b);
    const crStr = formatDefensive(cr, 'percent');
    const attStr = formatDefensive(att, 'percent');
    if (crStr.includes('NaN') || crStr.includes('Infinity') || attStr.includes('NaN') || attStr.includes('Infinity')) {
      console.error(`  NONSENSE: CR(${a}, ${b})="${crStr}" ATT(${a}, ${b})="${attStr}"`);
      nonsenseFound = true;
    }
  }
}
assert('No NaN/Infinity in 64 edge-case combinations', nonsenseFound, false);

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
