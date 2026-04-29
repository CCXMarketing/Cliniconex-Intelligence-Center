/* =============================================================================
 * CLINICONEX DEMAND GENERATION FORECAST ENGINE
 * v1.0 · April 2026
 *
 * Reverse-engineers the marketing demand plan required to hit an annual
 * recognized-revenue target. Implements seven calculation engines:
 *
 *   1. Recognized Revenue      — newMRR × in-year months remaining
 *   2. YTD Aggregates          — totals through the closed-through month
 *   3. Rolling 3-Mo Metrics    — empirical CPL / conv / Avg MRR / CAC
 *   4. Time-Adjusted Tail      — average in-year months for remaining wins
 *   5. Forecast                — wins → leads → budget required to close gap
 *   6. Monthly Pacing          — distributes wins/leads/spend across remaining months
 *   7. Channel Mix             — splits budget across channels with blended outputs
 *   8. Risk Detection          — auto-flags compression, regression, gaps
 *   9. Lever Scenarios         — what-if comparison for pricing / conversion / CPL
 *
 * All money is in dollars. All conversion rates are stored as decimals (0.10
 * not 10%) inside calculations. The BASELINE object holds the only place
 * where conversion appears as a percent number — it is normalized on entry.
 *
 * USAGE:
 *   const result = runForecast({
 *     target: 153000,
 *     currentMonth: 3,                  // 1-12; "closed through" month
 *     actuals: [...12 months...],
 *     mode: 'rolling' | 'baseline',
 *     levers: { mrr: 0, conv: 0, cpl: 0 },   // % adjustments
 *     channels: [...]
 *   });
 * ============================================================================= */


// =============================================================================
// SECTION 1 · BASELINE CONSTANTS
// =============================================================================
// Empirical 2025 actuals. These are the "static baseline" used when mode is
// 'baseline'. In 'rolling' mode the engine uses last-3-months actuals instead.

export const BASELINE = {
  avgMRR:        447.64,   // $ — average monthly recurring revenue per win
  cpl:           360.53,   // $ — cost per lead
  convRate:      0.1078,   // decimal — lead-to-win conversion (10.78%)
  cac:         3345.70,    // $ — customer acquisition cost
  ltv:        26201.00,    // $ — customer lifetime value
  mrrMultiplier: 6.67,     // unitless — uniform-distribution Y1 cash multiplier
                           //            avg of (12,11,10,...,1)/12 ≈ 6.5; user
                           //            uses 6.67 to reflect early-month bias
};

export const MONTHS = [
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
];


// =============================================================================
// SECTION 2 · CORE FORMULAS
// =============================================================================

/**
 * Recognized in-year revenue from a single month's New MRR.
 *
 *   recognized(m) = newMRR(m) × (12 − m + 1)
 *
 * where m is 1-indexed (Jan=1, Dec=12). A January win recognizes 12 months of
 * cash, a December win recognizes 1 month.
 *
 * Implementation uses 0-indexed array position i, so:
 *   recognized = newMRR × (12 − i)
 *
 * @param {Array<{newMRR: number}>} actuals — 12-month array
 * @returns {number[]} recognized revenue per month, indexed 0–11
 */
export function recognizedByMonth(actuals) {
  return actuals.map((a, i) => (a.newMRR || 0) * (12 - i));
}


/**
 * YTD aggregates through the closed-through month.
 *
 * @param {Array} actuals — 12-month array of {leads, wins, newMRR, adSpend}
 * @param {number} currentMonth — 1-indexed; e.g. 3 means Jan-Mar are closed
 * @returns {{revenue, wins, leads, newMRR, adSpend}}
 */
export function ytdAggregates(actuals, currentMonth) {
  const closed = actuals.slice(0, currentMonth);
  const recognized = recognizedByMonth(actuals).slice(0, currentMonth);
  return {
    revenue: recognized.reduce((s, v) => s + v, 0),
    wins:    closed.reduce((s, m) => s + (m.wins    || 0), 0),
    leads:   closed.reduce((s, m) => s + (m.leads   || 0), 0),
    newMRR:  closed.reduce((s, m) => s + (m.newMRR  || 0), 0),
    adSpend: closed.reduce((s, m) => s + (m.adSpend || 0), 0),
  };
}


/**
 * Rolling 3-month empirical metrics. Uses the trailing 3 closed months
 * (or fewer if fewer months are closed).
 *
 * @returns {{cpl, convRate, avgMRR, cac}}
 *   cpl       — total spend / total leads
 *   convRate  — total wins / total leads (decimal)
 *   avgMRR    — total newMRR / total wins
 *   cac       — total spend / total wins
 */
export function rollingMetrics(actuals, currentMonth) {
  const start = Math.max(0, currentMonth - 3);
  const slice = actuals.slice(start, currentMonth);
  const L = slice.reduce((s, m) => s + (m.leads   || 0), 0);
  const W = slice.reduce((s, m) => s + (m.wins    || 0), 0);
  const M = slice.reduce((s, m) => s + (m.newMRR  || 0), 0);
  const S = slice.reduce((s, m) => s + (m.adSpend || 0), 0);
  return {
    cpl:      L > 0 ? S / L : 0,
    convRate: L > 0 ? W / L : 0,
    avgMRR:   W > 0 ? M / W : 0,
    cac:      W > 0 ? S / W : 0,
  };
}


/**
 * Time-Adjusted MRR Multiplier for remaining months.
 *
 * Each future-month win recognizes (12 − m + 1) months of in-year cash.
 * The average across remaining months is the multiplier for revenue/win:
 *
 *   tailMultiplier(currentMonth) = Σ_{m=currentMonth+1}^{12} (12 − m + 1)  /  (12 − currentMonth)
 *
 * Examples (currentMonth = end-of-month index):
 *   end of Q1 (3)  → (9+8+7+6+5+4+3+2+1) / 9 = 45/9 = 5.00
 *   end of Q2 (6)  → (6+5+4+3+2+1)       / 6 = 21/6 = 3.50
 *   end of Q3 (9)  → (3+2+1)             / 3 = 6/3  = 2.00
 *
 * This dynamically replaces the static 6.67 baseline multiplier as the year progresses.
 *
 * @param {number} currentMonth — 1-indexed
 * @returns {number}
 */
export function tailMultiplier(currentMonth) {
  const remaining = 12 - currentMonth;
  if (remaining <= 0) return 0;
  let sum = 0;
  for (let m = currentMonth + 1; m <= 12; m++) sum += (12 - m + 1);
  return sum / remaining;
}


/**
 * Active assumptions = base assumption × (1 + lever%).
 *
 * @param {'rolling'|'baseline'} mode
 * @param {{cpl, convRate, avgMRR}} rolling
 * @param {{mrr, conv, cpl}} levers — each is a percent adjustment, e.g. 20 = +20%
 * @returns {{avgMRR, convRate, cpl}}
 */
export function activeAssumptions(mode, rolling, levers = { mrr: 0, conv: 0, cpl: 0 }) {
  const baseAvgMRR  = mode === 'rolling' ? rolling.avgMRR  : BASELINE.avgMRR;
  const baseConv    = mode === 'rolling' ? rolling.convRate: BASELINE.convRate;
  const baseCPL     = mode === 'rolling' ? rolling.cpl     : BASELINE.cpl;
  return {
    avgMRR:   baseAvgMRR * (1 + (levers.mrr  || 0) / 100),
    convRate: baseConv   * (1 + (levers.conv || 0) / 100),
    cpl:      baseCPL    * (1 + (levers.cpl  || 0) / 100),
  };
}


// =============================================================================
// SECTION 3 · FORECAST
// =============================================================================

/**
 * Reverse-engineer wins, leads, and budget from gap-to-target.
 *
 *   gap         = max(0, target − ytdRevenue)
 *   revPerWin   = activeAvgMRR × tailMultiplier
 *   winsNeeded  = gap / revPerWin
 *   leadsNeeded = winsNeeded / activeConvRate
 *   budget      = leadsNeeded × activeCPL
 *   cacImplied  = budget / winsNeeded
 *   ltvCac      = LTV / cacImplied
 *   payback     = cacImplied / activeAvgMRR  (months)
 *
 * @returns {{
 *   gap, revPerWin, winsNeeded, leadsNeeded, budget,
 *   cacImplied, ltvCac, payback, monthsRemaining,
 *   pacePct, expectedPacePct, onTrack
 * }}
 */
export function forecast(target, ytd, active, tail, currentMonth) {
  const monthsRemaining = 12 - currentMonth;
  const revPerWin       = active.avgMRR * tail;
  const gap             = Math.max(0, target - ytd.revenue);
  const winsNeeded      = revPerWin > 0 ? gap / revPerWin : 0;
  const leadsNeeded     = active.convRate > 0 ? winsNeeded / active.convRate : 0;
  const budget          = leadsNeeded * active.cpl;
  const cacImplied      = winsNeeded > 0 ? budget / winsNeeded : 0;
  const ltvCac          = cacImplied > 0 ? BASELINE.ltv / cacImplied : 0;
  const payback         = active.avgMRR > 0 ? cacImplied / active.avgMRR : 0;
  const pacePct         = target > 0 ? (ytd.revenue / target) * 100 : 0;
  const expectedPacePct = (currentMonth / 12) * 100;
  const onTrack         = pacePct >= expectedPacePct;
  return {
    gap, revPerWin, winsNeeded, leadsNeeded, budget,
    cacImplied, ltvCac, payback, monthsRemaining,
    pacePct, expectedPacePct, onTrack,
  };
}


/**
 * What-if scenarios. Returns a comparison set including the current plan
 * plus standard pricing/conversion/CPL adjustments and a defensive case.
 *
 * @returns {Array<{name, wins, leads, budget, deltaBudget, warn?}>}
 */
export function leverScenarios(target, ytd, base, tail) {
  const calc = (avgMRR, convRate, cpl) => {
    const revPerWin   = avgMRR * tail;
    const gap         = Math.max(0, target - ytd.revenue);
    const wins        = revPerWin > 0 ? gap / revPerWin : 0;
    const leads       = convRate > 0 ? wins / convRate : 0;
    const budget      = leads * cpl;
    return { wins, leads, budget };
  };
  const baseline = calc(base.avgMRR, base.convRate, base.cpl);
  const scenarios = [
    { name: 'Current Plan',           ...baseline },
    { name: 'MRR +20%',               ...calc(base.avgMRR * 1.20, base.convRate,        base.cpl) },
    { name: 'Conversion +20%',        ...calc(base.avgMRR,        base.convRate * 1.20, base.cpl) },
    { name: 'CPL −15%',               ...calc(base.avgMRR,        base.convRate,        base.cpl * 0.85) },
    { name: 'MRR +20% & Conv +20%',   ...calc(base.avgMRR * 1.20, base.convRate * 1.20, base.cpl) },
    { name: 'Conv −30% (regression)', ...calc(base.avgMRR,        base.convRate * 0.70, base.cpl), warn: true },
  ];
  return scenarios.map(s => ({
    ...s,
    deltaBudget: s.budget - baseline.budget,
    deltaPct:    baseline.budget > 0 ? ((s.budget - baseline.budget) / baseline.budget) * 100 : 0,
  }));
}


// =============================================================================
// SECTION 4 · MONTHLY PACING
// =============================================================================

/**
 * Distribute required wins / leads / spend evenly across remaining months.
 * Past months retain their actuals.
 *
 * Recognized revenue per future month uses the actual month index for its
 * cash tail, so April plans recognize 9 months while December plans recognize 1.
 *
 * @returns {Array<{month, isPast, leads, wins, spend, recognized}>}
 */
export function monthlyPacing(actuals, currentMonth, forecastResult, active) {
  const r = forecastResult.monthsRemaining;
  const recognized = recognizedByMonth(actuals);
  const winsPerMonth  = r > 0 ? forecastResult.winsNeeded  / r : 0;
  const leadsPerMonth = r > 0 ? forecastResult.leadsNeeded / r : 0;
  const spendPerMonth = r > 0 ? forecastResult.budget      / r : 0;

  return MONTHS.map((m, i) => {
    const isPast = i < currentMonth;
    return {
      month:      m,
      isPast,
      leads:      isPast ? (actuals[i].leads   || 0) : leadsPerMonth,
      wins:       isPast ? (actuals[i].wins    || 0) : winsPerMonth,
      spend:      isPast ? (actuals[i].adSpend || 0) : spendPerMonth,
      recognized: isPast ? recognized[i]              : active.avgMRR * winsPerMonth * (12 - i),
    };
  });
}


// =============================================================================
// SECTION 5 · CHANNEL MIX
// =============================================================================

/**
 * Channel allocation model. Each channel has its own CPL and conversion rate;
 * the engine computes allocated dollars, leads generated, wins generated,
 * and the blended portfolio metrics.
 *
 * Channel input shape:
 *   { name: string, alloc: number (%), cpl: number ($), convRate: number (%) }
 *
 * @param {Array} channels
 * @param {number} totalBudget — typically the forecast.budget
 * @returns {{
 *   rows: Array<{...channel, dollars, leads, wins}>,
 *   totalAlloc, totalLeads, totalWins,
 *   blendedCPL, blendedConv,
 *   winsGap   // (forecastWinsNeeded − totalWins); positive = under-deliver
 * }}
 */
export function channelMix(channels, totalBudget, forecastWinsNeeded = 0) {
  const rows = channels.map(c => {
    const dollars = ((c.alloc || 0) / 100) * totalBudget;
    const leads   = c.cpl > 0 ? dollars / c.cpl : 0;
    const wins    = leads * ((c.convRate || 0) / 100);
    return { ...c, dollars, leads, wins };
  });
  const totalAlloc = rows.reduce((s, r) => s + (r.alloc || 0), 0);
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const totalWins  = rows.reduce((s, r) => s + r.wins, 0);
  return {
    rows,
    totalAlloc,
    totalLeads,
    totalWins,
    blendedCPL:  totalLeads > 0 ? totalBudget / totalLeads : 0,
    blendedConv: totalLeads > 0 ? totalWins / totalLeads   : 0,
    winsGap:     forecastWinsNeeded - totalWins,
  };
}


// =============================================================================
// SECTION 6 · RISK DETECTION
// =============================================================================

/**
 * Auto-detect risks from current state. Returns an array of risk objects
 * with severity, title, and an explanation.
 */
export function detectRisks(rolling, forecastResult, channelMixResult) {
  const risks = [];

  if (rolling.avgMRR > 0 && rolling.avgMRR < BASELINE.avgMRR * 0.85) {
    const pct = ((1 - rolling.avgMRR / BASELINE.avgMRR) * 100).toFixed(0);
    risks.push({
      level: 'high',
      title: 'Deal-size compression',
      body:  `Rolling Avg MRR ($${rolling.avgMRR.toFixed(0)}) is ${pct}% below baseline. ` +
             `Each win recognizes less in-year cash, inflating the wins required.`,
    });
  }

  if (rolling.convRate > 0 && rolling.convRate > BASELINE.convRate * 1.5) {
    risks.push({
      level: 'med',
      title: 'Conversion rate likely unsustainable',
      body:  `Rolling conversion (${(rolling.convRate * 100).toFixed(1)}%) is well above ` +
             `baseline (${(BASELINE.convRate * 100).toFixed(1)}%). Plan for regression as ` +
             `lead volume scales — high conversion often reflects a small, high-intent funnel.`,
    });
  }

  if (rolling.cpl > 0 && rolling.cpl > BASELINE.cpl * 1.10) {
    const pct = ((rolling.cpl / BASELINE.cpl - 1) * 100).toFixed(0);
    risks.push({
      level: 'med',
      title: 'CPL inflation',
      body:  `Rolling CPL ($${rolling.cpl.toFixed(0)}) is ${pct}% above baseline. ` +
             `Budget required will exceed plan if trend continues.`,
    });
  }

  if (forecastResult.budget > forecastResult.gap) {
    risks.push({
      level: 'high',
      title: 'Year 1 cash gap',
      body:  `Required spend ($${Math.round(forecastResult.budget).toLocaleString()}) exceeds ` +
             `remaining revenue gap ($${Math.round(forecastResult.gap).toLocaleString()}). ` +
             `The model only wins on multi-year retention. Confirm runway covers the lag.`,
    });
  }

  if (channelMixResult && channelMixResult.winsGap > forecastResult.winsNeeded * 0.05) {
    risks.push({
      level: 'high',
      title: 'Channel mix under-delivers',
      body:  `Current channel allocation produces ${channelMixResult.totalWins.toFixed(1)} wins ` +
             `vs. ${forecastResult.winsNeeded.toFixed(1)} required. ` +
             `Reweight toward higher-converting channels or expand budget.`,
    });
  }

  if (channelMixResult && Math.abs(channelMixResult.totalAlloc - 100) > 0.5) {
    risks.push({
      level: 'med',
      title: 'Channel allocations don\'t sum to 100%',
      body:  `Current total: ${channelMixResult.totalAlloc.toFixed(1)}%. Adjust channel weights so they reconcile.`,
    });
  }

  if (forecastResult.ltvCac < 3 && forecastResult.ltvCac > 0) {
    risks.push({
      level: 'high',
      title: 'LTV:CAC below 3:1',
      body:  `Implied LTV:CAC of ${forecastResult.ltvCac.toFixed(2)}:1 falls below the SaaS ` +
             `health threshold. Either CAC is too high or LTV needs validation.`,
    });
  }

  return risks;
}


// =============================================================================
// SECTION 7 · ORCHESTRATOR
// =============================================================================

/**
 * Run the full forecast pipeline. Single entry point for downstream consumers.
 *
 * Input shape:
 *   {
 *     target:       number,         // annual revenue target ($)
 *     currentMonth: number,         // 1-12, "closed through" month
 *     actuals:      Array<{leads, wins, newMRR, adSpend}>,  // 12 entries
 *     mode:         'rolling' | 'baseline',
 *     levers?:      { mrr, conv, cpl },                     // % adjustments
 *     channels?:    Array<{name, alloc, cpl, convRate}>,
 *   }
 *
 * Output: a complete forecast bundle suitable for rendering or further analysis.
 */
export function runForecast(input) {
  const {
    target,
    currentMonth,
    actuals,
    mode     = 'rolling',
    levers   = { mrr: 0, conv: 0, cpl: 0 },
    channels = [],
  } = input;

  const ytd     = ytdAggregates(actuals, currentMonth);
  const rolling = rollingMetrics(actuals, currentMonth);
  const active  = activeAssumptions(mode, rolling, levers);
  const tail    = tailMultiplier(currentMonth);
  const fc      = forecast(target, ytd, active, tail, currentMonth);
  const pacing  = monthlyPacing(actuals, currentMonth, fc, active);
  const mix     = channels.length > 0
                    ? channelMix(channels, fc.budget, fc.winsNeeded)
                    : null;
  const scenarios = leverScenarios(target, ytd, active, tail);
  const risks   = detectRisks(rolling, fc, mix);

  return {
    inputs:       { target, currentMonth, mode, levers },
    ytd,
    rolling,
    active,
    tailMultiplier: tail,
    forecast:     fc,
    pacing,
    channelMix:   mix,
    scenarios,
    risks,
  };
}


// =============================================================================
// EXAMPLE INVOCATION
// =============================================================================
// Uncomment to run from Node:
//   node forecast-engine.js
// =============================================================================

const EXAMPLE_INPUT = {
  target:       153000,
  currentMonth: 3,            // end of Q1 (Jan, Feb, Mar closed)
  mode:         'rolling',
  levers:       { mrr: 0, conv: 0, cpl: 0 },
  actuals: [
    { month: 'Jan', leads: 22, wins: 9, newMRR: 1900, adSpend: 7270.50 },
    { month: 'Feb', leads: 25, wins: 1, newMRR:  750, adSpend: 7693.64 },
    { month: 'Mar', leads:  8, wins: 3, newMRR:  753, adSpend: 7733.48 },
    { month: 'Apr', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'May', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'Jun', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'Jul', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'Aug', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'Sep', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'Oct', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'Nov', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
    { month: 'Dec', leads: 0, wins: 0, newMRR: 0, adSpend: 0 },
  ],
  channels: [
    { name: 'Paid Search',        alloc: 30, cpl: 320, convRate: 12 },
    { name: 'Paid Social',        alloc: 25, cpl: 480, convRate:  9 },
    { name: 'Content / SEO',      alloc: 15, cpl: 180, convRate: 14 },
    { name: 'Events / Webinars',  alloc: 15, cpl: 550, convRate: 18 },
    { name: 'Outbound / SDR',     alloc: 10, cpl: 420, convRate:  8 },
    { name: 'Referral / Partner', alloc:  5, cpl: 120, convRate: 25 },
  ],
};

// Run if invoked directly (Node)
if (typeof require !== 'undefined' && require.main === module) {
  const out = runForecast(EXAMPLE_INPUT);
  console.log('\n=== EXECUTIVE SUMMARY ===');
  console.log(`Target:           $${out.inputs.target.toLocaleString()}`);
  console.log(`YTD Revenue:      $${Math.round(out.ytd.revenue).toLocaleString()}`);
  console.log(`Gap:              $${Math.round(out.forecast.gap).toLocaleString()}`);
  console.log(`Months remaining: ${out.forecast.monthsRemaining}`);
  console.log(`Tail multiplier:  ${out.tailMultiplier.toFixed(2)}×`);
  console.log('\n=== ACTIVE ASSUMPTIONS ===');
  console.log(`Avg MRR:          $${out.active.avgMRR.toFixed(2)}`);
  console.log(`Conversion:       ${(out.active.convRate * 100).toFixed(2)}%`);
  console.log(`CPL:              $${out.active.cpl.toFixed(2)}`);
  console.log('\n=== REQUIRED PLAN ===');
  console.log(`Wins required:    ${out.forecast.winsNeeded.toFixed(1)}`);
  console.log(`Leads required:   ${Math.round(out.forecast.leadsNeeded)}`);
  console.log(`Budget required:  $${Math.round(out.forecast.budget).toLocaleString()}`);
  console.log(`Implied CAC:      $${Math.round(out.forecast.cacImplied).toLocaleString()}`);
  console.log(`LTV:CAC:          ${out.forecast.ltvCac.toFixed(2)}:1`);
  console.log(`Payback:          ${out.forecast.payback.toFixed(1)} months`);
  console.log(`\n=== RISKS (${out.risks.length}) ===`);
  out.risks.forEach(r => console.log(`  [${r.level.toUpperCase()}] ${r.title}`));
  console.log('\n=== CHANNEL MIX ===');
  console.log(`Total wins delivered: ${out.channelMix.totalWins.toFixed(1)} ` +
              `(vs ${out.forecast.winsNeeded.toFixed(1)} required)`);
  console.log(`Blended CPL: $${out.channelMix.blendedCPL.toFixed(0)} · ` +
              `Blended conv: ${(out.channelMix.blendedConv * 100).toFixed(1)}%`);
  console.log('\n=== SCENARIO COMPARISON ===');
  out.scenarios.forEach(s => {
    const delta = s.deltaPct >= 0 ? `+${s.deltaPct.toFixed(0)}%` : `${s.deltaPct.toFixed(0)}%`;
    console.log(`  ${s.name.padEnd(28)} ` +
                `wins=${s.wins.toFixed(0).padStart(4)} ` +
                `leads=${Math.round(s.leads).toString().padStart(4)} ` +
                `budget=$${Math.round(s.budget).toLocaleString().padStart(8)} (${delta})`);
  });
}
