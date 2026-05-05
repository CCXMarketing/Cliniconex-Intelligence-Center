// ── DG Forecast & Actual Tables (v4.2) ──────────────────────────
// Editable 12-month planning grid with derived rows, defensive math,
// annual target distribution with locked cells, and currency format toggle.
// Persists to localStorage; schema designed for future Sheets sync.

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEAR = 2026;
const LS_FORECAST = 'dg_forecast_2026';
const LS_ACTUAL   = 'dg_actual_2026';
const LS_ANNUAL_TARGET = 'cic_forecast_demand_gen_revenue_annual_target';
const LS_LOCKED_CELLS  = 'cic_forecast_locked_cells_2026';
const LS_CURRENCY_FMT  = 'cic_currency_format_preference';
const DEFAULT_ANNUAL_TARGET = 153000;

// ── Metric ID → storage path ────────────────────────────────────
const METRIC_PATH = {
  demand_created:   ['pipe', 'demand_created'],
  demand_engaged:   ['pipe', 'demand_engaged'],
  mql:              ['pipe', 'mql'],
  hiro:             ['pipe', 'hiro'],
  new_mrr_cad:      ['rev',  'new_mrr_cad'],
  marketing_spend:  ['spend','marketing_spend'],
};

// ── Conversion rate targets ─────────────────────────────────────
const CR_TARGETS = {
  engaged_rate:  80,
  captured_rate: 75,
  converted_rate: 25,
};

// ── Data Model ──────────────────────────────────────────────────

function createEmpty() {
  const monthObj = () => Object.fromEntries(MONTHS.map(m => [m, null]));
  return {
    pipe:  { demand_created: monthObj(), demand_engaged: monthObj(), mql: monthObj(), hiro: monthObj() },
    rev:   { new_mrr_cad: monthObj() },
    spend: { marketing_spend: monthObj() },
  };
}

function migrateData(parsed) {
  // Handle old key names from pre-v4.2
  if (parsed.pipe?.demand_captured && !parsed.pipe?.mql) {
    parsed.pipe.mql = parsed.pipe.demand_captured;
    delete parsed.pipe.demand_captured;
  }
  if (parsed.pipe?.demand_converted && !parsed.pipe?.hiro) {
    parsed.pipe.hiro = parsed.pipe.demand_converted;
    delete parsed.pipe.demand_converted;
  }
  // Remove recognized_revenue if present
  if (parsed.rev?.recognized_revenue) delete parsed.rev.recognized_revenue;
  return parsed;
}

function loadData(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return createEmpty();
    let parsed = JSON.parse(raw);
    parsed = migrateData(parsed);
    const empty = createEmpty();
    for (const group of Object.keys(empty)) {
      if (!parsed[group]) { parsed[group] = empty[group]; continue; }
      for (const metric of Object.keys(empty[group])) {
        if (!parsed[group][metric]) parsed[group][metric] = empty[group][metric];
      }
    }
    return parsed;
  } catch { return createEmpty(); }
}

function saveData(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

function getVal(data, metricId, month) {
  const path = METRIC_PATH[metricId];
  if (!path) return null;
  const [group, key] = path;
  return data[group]?.[key]?.[month] ?? null;
}

function setVal(data, metricId, month, value) {
  const path = METRIC_PATH[metricId];
  if (!path) return;
  const [group, key] = path;
  if (data[group] && data[group][key]) data[group][key][month] = value;
}

function sumMetric(data, metricId, months) {
  let sum = null;
  for (const m of months) {
    const v = getVal(data, metricId, m);
    if (v != null) sum = (sum || 0) + v;
  }
  return sum;
}

// ── Annual Target ───────────────────────────────────────────────

function loadAnnualTarget() {
  try {
    const raw = localStorage.getItem(LS_ANNUAL_TARGET);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.value ?? DEFAULT_ANNUAL_TARGET;
    }
  } catch {}
  return DEFAULT_ANNUAL_TARGET;
}

function saveAnnualTarget(value) {
  try {
    localStorage.setItem(LS_ANNUAL_TARGET, JSON.stringify({ value, edited: true }));
  } catch {}
}

// ── Locked Cells (for DG Revenue target distribution) ───────────

function loadLockedCells() {
  try {
    const raw = localStorage.getItem(LS_LOCKED_CELLS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLockedCells(locked) {
  try { localStorage.setItem(LS_LOCKED_CELLS, JSON.stringify(locked)); } catch {}
}

// ── Currency Format ─────────────────────────────────────────────

function loadCurrencyFormat() {
  return localStorage.getItem(LS_CURRENCY_FMT) || 'full';
}

function saveCurrencyFormat(fmt) {
  localStorage.setItem(LS_CURRENCY_FMT, fmt);
}

// ── Config ──────────────────────────────────────────────────────

let _avgLTV = 29000;

async function loadConfig() {
  try {
    const { CONFIG } = await import('./config.js');
    _avgLTV = CONFIG?.marketing?.ltv ?? CONFIG?.app?.avgLTV ?? CONFIG?.app?.ltv ?? 29000;
  } catch {}
}

// ── Formatting ──────────────────────────────────────────────────

function fmtCurrency(value, format) {
  if (value == null) return '\u2014';
  if (format === 'compact') {
    if (Math.abs(value) >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
    if (Math.abs(value) >= 1000) {
      const k = value / 1000;
      return '$' + (k === Math.floor(k) ? k.toFixed(0) : k.toFixed(1)) + 'K';
    }
    return '$' + Math.round(value).toLocaleString('en-CA');
  }
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
}

function fmtValue(value, format, currFmt) {
  if (value == null) return '\u2014';
  if (format === 'currency') return fmtCurrency(value, currFmt);
  if (format === 'percent') {
    if (!isFinite(value)) return '\u2014';
    return value.toFixed(1) + '%';
  }
  if (format === 'ratio') return Math.round(value) + ':1';
  return value.toLocaleString('en-CA');
}

// ── Current Month ───────────────────────────────────────────────

function getCurrentMonthIndex() {
  const now = new Date();
  return now.getFullYear() === YEAR ? now.getMonth() : -1;
}

function isFutureMonth(monthIndex) {
  const curMonth = getCurrentMonthIndex();
  return curMonth >= 0 && monthIndex > curMonth;
}

// ── Defensive Math ──────────────────────────────────────────────

function safeRate(numerator, denominator) {
  if (denominator == null || denominator === 0 || denominator < 0) return null;
  if (numerator == null) return null;
  if (numerator === 0) return 0;
  const r = (numerator / denominator) * 100;
  return isFinite(r) ? Math.round(r * 10) / 10 : null;
}

function safeAttainment(actual, forecast) {
  if (forecast == null || forecast === 0 || forecast < 0) return null;
  if (actual == null) return null;
  if (actual === 0) return 0;
  const pct = (actual / forecast) * 100;
  return isFinite(pct) ? Math.round(pct * 10) / 10 : null;
}

// ── Distribution ────────────────────────────────────────────────

function distributeAnnualTarget(annual, lockedCells) {
  const result = Array(12).fill(0);
  const lockedMonths = new Set();
  let lockedSum = 0;

  for (const [monthStr, value] of Object.entries(lockedCells)) {
    const m = parseInt(monthStr);
    if (m >= 0 && m < 12) {
      result[m] = value;
      lockedMonths.add(m);
      lockedSum += value;
    }
  }

  if (lockedMonths.size >= 12) return result;

  const remainder = annual - lockedSum;
  const unlocked = 12 - lockedMonths.size;
  const base = Math.floor(remainder / unlocked);
  let extra = Math.round(remainder - base * unlocked);

  for (let m = 0; m < 12; m++) {
    if (lockedMonths.has(m)) continue;
    result[m] = base;
    if (extra > 0) { result[m]++; extra--; }
    else if (extra < 0) { result[m]--; extra++; }
  }

  // Ensure exact sum
  const diff = annual - result.reduce((s, v) => s + v, 0);
  if (diff !== 0) {
    for (let m = 0; m < 12; m++) {
      if (!lockedMonths.has(m)) { result[m] += diff; break; }
    }
  }

  return result;
}

// ── Derived Row Computations ────────────────────────────────────

function computeDerivedValue(rowId, data, months) {
  switch (rowId) {
    case 'engaged_rate': {
      const n = sumMetric(data, 'demand_engaged', months);
      const d = sumMetric(data, 'demand_created', months);
      return safeRate(n, d);
    }
    case 'captured_rate': {
      const n = sumMetric(data, 'mql', months);
      const d = sumMetric(data, 'demand_engaged', months);
      return safeRate(n, d);
    }
    case 'converted_rate': {
      const n = sumMetric(data, 'hiro', months);
      const d = sumMetric(data, 'mql', months);
      return safeRate(n, d);
    }
    case 'arr': {
      const mrr = sumMetric(data, 'new_mrr_cad', months);
      return mrr != null ? mrr * 12 : null;
    }
    case 'demand_gen_revenue': {
      // Sum of MRR × (11 - monthIndex) for each month in set
      let sum = 0, hasData = false;
      for (const m of months) {
        const idx = MONTHS.indexOf(m);
        const mrr = getVal(data, 'new_mrr_cad', m);
        if (mrr != null && mrr !== 0) {
          hasData = true;
          const mult = 11 - idx;
          sum += mrr * (mult >= 0 ? mult : 0);
        }
      }
      return hasData ? sum : null;
    }
    default: return null;
  }
}

// ── Row Definitions ─────────────────────────────────────────────

function buildRowDefs(tableType) {
  const rows = [];

  // ── Pipeline ──
  rows.push({ type: 'group', label: 'Demand Generation Pipeline' });
  rows.push({ type: 'editable', id: 'demand_created',  label: 'Demand Created',  format: 'count' });
  rows.push({ type: 'derived',  id: 'engaged_rate',    label: 'Engaged Rate',    format: 'percent', target: CR_TARGETS.engaged_rate });
  rows.push({ type: 'editable', id: 'demand_engaged',  label: 'Demand Engaged',  format: 'count' });
  rows.push({ type: 'derived',  id: 'captured_rate',   label: 'Captured Rate',   format: 'percent', target: CR_TARGETS.captured_rate });
  rows.push({ type: 'editable', id: 'mql',             label: 'MQL',             format: 'count' });
  rows.push({ type: 'derived',  id: 'converted_rate',  label: 'Converted Rate',  format: 'percent', target: CR_TARGETS.converted_rate });
  rows.push({ type: 'editable', id: 'hiro',            label: 'HIRO',            format: 'count' });

  // ── Revenue ──
  rows.push({ type: 'group', label: 'Revenue' });
  rows.push({ type: 'editable', id: 'new_mrr_cad',        label: 'New MRR (CAD)',       format: 'currency' });
  rows.push({ type: 'derived',  id: 'arr',                 label: 'ARR',                 format: 'currency' });
  rows.push({ type: 'derived',  id: 'demand_gen_revenue',  label: 'Demand Gen Revenue',  format: 'currency' });

  // ── Spend & Efficiency ──
  rows.push({ type: 'group', label: 'Spend & Efficiency' });
  rows.push({ type: 'editable', id: 'marketing_spend', label: 'Marketing Spend', format: 'currency' });

  if (tableType === 'actual') {
    rows.push({ type: 'derived', id: 'roas', label: 'ROAS', format: 'ratio',
      customCompute: (data, months) => {
        const conv  = sumMetric(data, 'hiro', months);
        const spend = sumMetric(data, 'marketing_spend', months);
        return (conv && spend && spend > 0) ? (conv * _avgLTV) / spend : null;
      }
    });
  }

  return rows;
}

// ── Status indicator for CR rows ────────────────────────────────

function crStatusClass(value, target) {
  if (value == null) return '';
  if (value >= target) return 'dg-cr--green';
  if (value >= target - 5) return 'dg-cr--yellow';
  return 'dg-cr--red';
}

// ── Table HTML Builder ──────────────────────────────────────────

function buildTableHTML(tableType, data, forecastData, dgRevenueTargets) {
  const rows = buildRowDefs(tableType);
  const curMonth = getCurrentMonthIndex();
  const isActual = tableType === 'actual';
  const currFmt = loadCurrencyFormat();
  const locked = tableType === 'forecast' ? loadLockedCells() : {};
  const totalCols = 1 + 12 + 1 + (isActual ? 3 : 1);

  let html = '<thead><tr>';
  html += '<th class="dg-th dg-th--metric">Metric</th>';
  for (let i = 0; i < 12; i++) {
    const isCurrent = i === curMonth;
    html += `<th class="dg-th dg-th--month${isCurrent ? ' dg-th--current' : ''}">${MONTH_LABELS[i]}</th>`;
  }
  html += '<th class="dg-th dg-th--summary">Total</th>';
  html += '<th class="dg-th dg-th--summary">YTD</th>';
  if (isActual) {
    html += '<th class="dg-th dg-th--summary">Fcst YTD</th>';
    html += '<th class="dg-th dg-th--summary">Att.&nbsp;%</th>';
  }
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    if (row.type === 'group') {
      html += `<tr class="dg-group-row"><td colspan="${totalCols}">${row.label}</td></tr>`;
      continue;
    }

    const isDerived = row.type === 'derived';
    const isRate = isDerived && row.format === 'percent';
    const rowClass = isDerived ? 'dg-row--derived' : 'dg-row--editable';
    html += `<tr class="${rowClass}">`;

    // Metric label with tooltip for derived rows
    let labelExtra = '';
    if (isRate && row.target != null) {
      labelExtra = ` <span class="dg-target-hint" title="Target: ${row.target}%">(${row.target}%)</span>`;
    }
    html += `<td class="dg-td--metric">${isDerived ? '<span class="dg-derived-tag">\u0192</span> ' : ''}${row.label}${labelExtra}</td>`;

    // Month cells
    for (let i = 0; i < 12; i++) {
      const month = MONTHS[i];
      const isCurrent = i === curMonth;
      const isFuture = isActual && isFutureMonth(i);
      let value;

      if (isDerived) {
        if (row.customCompute) {
          value = isFuture ? null : row.customCompute(data, [month]);
        } else {
          value = isFuture ? null : computeDerivedValue(row.id, data, [month]);
        }
      } else {
        value = isFuture ? null : getVal(data, row.id, month);
      }

      // Status class for rate cells
      let statusClass = '';
      if (isRate && value != null && row.target != null) {
        statusClass = ' ' + crStatusClass(value, row.target);
      }

      // Lock indicator for DG Revenue target cells
      let lockIcon = '';
      if (tableType === 'forecast' && row.id === 'new_mrr_cad' && locked[String(i)] != null) {
        // MRR doesn't use locks — only the DG Revenue target row would, but that's derived.
        // Lock logic applies to the annual target distribution, which is displayed differently.
      }

      const cellClass = isDerived ? 'dg-cell--derived' : (isFuture ? 'dg-cell--future' : 'dg-cell--editable');
      const currentClass = isCurrent ? ' dg-cell--current' : '';
      const attrs = (isDerived || isFuture) ? '' : ` data-table="${tableType}" data-metric="${row.id}" data-month="${month}"`;

      html += `<td class="dg-cell ${cellClass}${currentClass}${statusClass}"${attrs}>${fmtValue(value, row.format, currFmt)}</td>`;
    }

    // Total column
    let total;
    if (isDerived) {
      total = row.customCompute ? row.customCompute(data, MONTHS) : computeDerivedValue(row.id, data, MONTHS);
    } else {
      total = sumMetric(data, row.id, MONTHS);
    }
    html += `<td class="dg-cell dg-cell--summary">${fmtValue(total, row.format, currFmt)}</td>`;

    // YTD column
    const ytdMonths = curMonth >= 0 ? MONTHS.slice(0, curMonth + 1) : [];
    let ytdVal;
    if (isDerived) {
      ytdVal = ytdMonths.length > 0 ? (row.customCompute ? row.customCompute(data, ytdMonths) : computeDerivedValue(row.id, data, ytdMonths)) : null;
    } else {
      ytdVal = ytdMonths.length > 0 ? sumMetric(data, row.id, ytdMonths) : null;
    }
    html += `<td class="dg-cell dg-cell--summary">${fmtValue(ytdVal, row.format, currFmt)}</td>`;

    // Actual-only: Forecast YTD + Attainment %
    if (isActual) {
      let fcstYtd;
      if (isDerived && forecastData) {
        fcstYtd = ytdMonths.length > 0 ? (row.customCompute ? row.customCompute(forecastData, ytdMonths) : computeDerivedValue(row.id, forecastData, ytdMonths)) : null;
      } else if (forecastData) {
        fcstYtd = ytdMonths.length > 0 ? sumMetric(forecastData, row.id, ytdMonths) : null;
      } else {
        fcstYtd = null;
      }
      html += `<td class="dg-cell dg-cell--summary">${fmtValue(fcstYtd, row.format, currFmt)}</td>`;

      const attPct = safeAttainment(ytdVal, fcstYtd);
      const attClass = attPct == null ? '' : attPct >= 100 ? ' dg-att--green' : attPct >= 90 ? ' dg-att--amber' : ' dg-att--red';
      html += `<td class="dg-cell dg-cell--summary dg-cell--att${attClass}">${attPct != null ? attPct.toFixed(1) + '%' : '\u2014'}</td>`;
    }

    html += '</tr>';
  }

  html += '</tbody>';
  return html;
}

// ── Full Render ─────────────────────────────────────────────────

let _container = null;
let _forecastData = null;
let _actualData = null;

function render() {
  if (!_container) return;
  _forecastData = loadData(LS_FORECAST);
  _actualData   = loadData(LS_ACTUAL);

  const annualTarget = loadAnnualTarget();
  const currFmt = loadCurrencyFormat();
  const currFmtLabel = currFmt === 'compact' ? 'Compact ($800K)' : 'Full ($800,000)';
  const dgTargets = distributeAnnualTarget(annualTarget, loadLockedCells());

  _container.innerHTML = `
    <style>
      .dg-tables { font-family: 'Nunito Sans', sans-serif; }
      .dg-table-section { margin-bottom: 24px; }
      .dg-table-label {
        font-size: 13px; font-weight: 800; text-transform: uppercase;
        letter-spacing: 0.08em; color: #02475A; margin-bottom: 10px;
        display: flex; align-items: center; gap: 8px;
      }
      .dg-table-label span {
        font-size: 11px; font-weight: 600; text-transform: none;
        letter-spacing: normal; color: #9E9E9E; font-style: italic;
      }
      .dg-controls {
        display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
        flex-wrap: wrap; font-family: 'Nunito Sans', sans-serif;
      }
      .dg-annual-target {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; font-weight: 700; color: #303030;
      }
      .dg-annual-target label { color: #666; font-weight: 600; }
      .dg-annual-value { font-size: 16px; font-weight: 800; color: #02475A; cursor: pointer; }
      .dg-annual-value:hover { text-decoration: underline; }
      .dg-currency-toggle {
        margin-left: auto; display: flex; align-items: center; gap: 6px;
        font-size: 11px; color: #9E9E9E; font-weight: 600;
      }
      .dg-currency-toggle select {
        font-family: 'Nunito Sans', sans-serif; font-size: 11px; font-weight: 600;
        padding: 3px 8px; border: 1px solid #D2D5DA; border-radius: 4px; color: #303030;
      }
      .dg-reset-btn {
        font-family: 'Nunito Sans', sans-serif; font-size: 11px; font-weight: 600;
        color: #C62828; background: none; border: none; cursor: pointer; text-decoration: underline;
      }
      .dg-scroll { overflow-x: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .dg-table {
        width: max-content; min-width: 100%; border-collapse: collapse;
        font-size: 13px; background: white;
      }
      .dg-th {
        background: #02475A; color: white; font-size: 11px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 12px;
        text-align: center; white-space: nowrap; position: sticky; top: 0; z-index: 1;
      }
      .dg-th--metric { text-align: left; min-width: 180px; position: sticky; left: 0; z-index: 2; background: #02475A; }
      .dg-th--month { min-width: 90px; }
      .dg-th--current { background: #036677; }
      .dg-th--summary { min-width: 90px; background: #03384a; }
      .dg-group-row td {
        background: #E0EEF2; color: #02475A; font-size: 11px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 12px;
        border-bottom: 1px solid #D2D5DA;
      }
      .dg-td--metric {
        font-weight: 700; color: #404041; padding: 8px 12px; white-space: nowrap;
        border-right: 1px solid #E1E6EF; position: sticky; left: 0;
        background: inherit; z-index: 1;
      }
      .dg-target-hint { font-size: 10px; color: #9E9E9E; font-weight: 600; font-style: italic; }
      .dg-row--editable .dg-td--metric { background: white; }
      .dg-row--derived .dg-td--metric { background: rgba(82, 46, 118, 0.04); }
      .dg-cell {
        padding: 6px 10px; text-align: right; border-bottom: 1px solid #E1E6EF;
        border-right: 1px solid #f0f0f0; color: #404041; font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .dg-cell--editable { cursor: text; }
      .dg-cell--editable:hover { background: rgba(2, 159, 181, 0.06); }
      .dg-cell--derived {
        background: rgba(82, 46, 118, 0.04); color: #666; font-weight: 600;
        cursor: default; font-style: italic;
      }
      .dg-cell--future { background: #FAFAFA; color: #D2D5DA; cursor: default; }
      .dg-cell--current { background: rgba(2, 159, 181, 0.08); }
      .dg-cell--current.dg-cell--derived { background: rgba(2, 159, 181, 0.08); }
      .dg-cell--summary { background: #F4F4F4; font-weight: 700; border-left: 2px solid #D2D5DA; }
      .dg-cell--att { font-weight: 800; }
      .dg-att--green { color: #2E7D32; background: #E8F5E9; }
      .dg-att--amber { color: #F57F17; background: #FFF8E1; }
      .dg-att--red   { color: #C62828; background: #FFEBEE; }
      .dg-cr--green { color: #2E7D32; }
      .dg-cr--yellow { color: #F57F17; }
      .dg-cr--red { color: #C62828; }
      .dg-derived-tag {
        display: inline-block; width: 16px; height: 16px; line-height: 16px;
        text-align: center; border-radius: 3px; background: rgba(82,46,118,0.1);
        color: #522E76; font-size: 11px; font-weight: 800; font-style: italic;
        vertical-align: middle; margin-right: 2px;
      }
      .dg-cell--editing { padding: 2px 4px; background: white !important; }
      .dg-cell--editing input {
        width: 100%; border: none; border-bottom: 2px solid #029FB5;
        outline: none; font-size: 13px; font-weight: 700; font-family: 'Nunito Sans', sans-serif;
        color: #303030; text-align: right; padding: 4px 6px; background: transparent;
        font-variant-numeric: tabular-nums; box-shadow: none; height: auto;
      }
      .dg-row--editable:nth-child(even) .dg-cell:not(.dg-cell--current):not(.dg-cell--summary) { background: #FAFBFC; }
      .dg-row--editable:hover .dg-cell:not(.dg-cell--summary) { background: rgba(2, 71, 90, 0.04); }
      .dg-row--editable:hover .dg-td--metric { background: rgba(2, 71, 90, 0.04); }
    </style>

    <div class="dg-tables">
      <div class="dg-controls">
        <div class="dg-annual-target">
          <label>DG Revenue Annual Target:</label>
          <span class="dg-annual-value" id="dg-annual-display">${fmtCurrency(annualTarget, currFmt)}</span>
        </div>
        <div class="dg-currency-toggle">
          <label>Currency:</label>
          <select id="dg-currency-select">
            <option value="full" ${currFmt === 'full' ? 'selected' : ''}>Full ($800,000)</option>
            <option value="compact" ${currFmt === 'compact' ? 'selected' : ''}>Compact ($800K)</option>
          </select>
        </div>
        <button class="dg-reset-btn" id="dg-reset-btn">Reset to defaults</button>
      </div>

      <div class="dg-table-section">
        <div class="dg-table-label">Forecast Targets <span>Click any cell to edit</span></div>
        <div class="dg-scroll">
          <table class="dg-table" id="dg-forecast-table">
            ${buildTableHTML('forecast', _forecastData, null, dgTargets)}
          </table>
        </div>
      </div>

      <div class="dg-table-section">
        <div class="dg-table-label">Monthly Actuals <span>Track progress against forecast</span></div>
        <div class="dg-scroll">
          <table class="dg-table" id="dg-actual-table">
            ${buildTableHTML('actual', _actualData, _forecastData, null)}
          </table>
        </div>
      </div>
    </div>`;

  wireEditing();
  wireControls();
}

// ── Controls wiring ─────────────────────────────────────────────

function wireControls() {
  if (!_container) return;

  // Annual target edit
  const display = _container.querySelector('#dg-annual-display');
  if (display) {
    display.addEventListener('click', () => {
      if (display.querySelector('input')) return;
      const current = loadAnnualTarget();
      display.innerHTML = `<input type="number" value="${current}" min="1000" max="10000000" style="
        font-size:16px;font-weight:800;color:#02475A;border:none;border-bottom:2px solid #029FB5;
        outline:none;width:120px;text-align:right;font-family:'Nunito Sans',sans-serif;background:transparent;">`;
      const input = display.querySelector('input');
      input.focus();
      input.select();
      const commit = () => {
        const v = parseFloat(input.value);
        if (!isNaN(v) && v >= 1000 && v <= 10000000) saveAnnualTarget(v);
        render();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { display.textContent = fmtCurrency(current, loadCurrencyFormat()); }
      });
    });
  }

  // Currency format toggle
  const currSelect = _container.querySelector('#dg-currency-select');
  if (currSelect) {
    currSelect.addEventListener('change', () => {
      saveCurrencyFormat(currSelect.value);
      render();
    });
  }

  // Reset button
  const resetBtn = _container.querySelector('#dg-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('This will delete all forecast targets and actuals for 2026. Continue?')) return;
      localStorage.removeItem(LS_FORECAST);
      localStorage.removeItem(LS_ACTUAL);
      localStorage.removeItem(LS_ANNUAL_TARGET);
      localStorage.removeItem(LS_LOCKED_CELLS);
      render();
    });
  }
}

// ── Inline Editing ──────────────────────────────────────────────

function wireEditing() {
  if (!_container) return;
  _container.querySelectorAll('.dg-cell--editable').forEach(td => {
    td.addEventListener('click', () => enterEdit(td));
  });
}

function enterEdit(td) {
  if (td.classList.contains('dg-cell--editing')) return;

  const tableType = td.dataset.table;
  const metricId  = td.dataset.metric;
  const month     = td.dataset.month;
  const data      = tableType === 'forecast' ? _forecastData : _actualData;
  const currentVal = getVal(data, metricId, month);

  const originalText = td.textContent;
  td.classList.add('dg-cell--editing');

  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = currentVal != null ? currentVal : '';
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    const raw = input.value.trim();
    const parsed = raw === '' ? null : parseFloat(raw);

    // Reject negative values
    if (parsed != null && parsed < 0) {
      td.classList.remove('dg-cell--editing');
      td.textContent = originalText;
      return;
    }

    const value = (parsed != null && !isNaN(parsed)) ? parsed : null;
    const lsKey = tableType === 'forecast' ? LS_FORECAST : LS_ACTUAL;
    setVal(data, metricId, month, value);
    saveData(lsKey, data);
    render();
  };

  const cancel = () => {
    td.classList.remove('dg-cell--editing');
    td.textContent = originalText;
  };

  const tabToNext = (reverse) => {
    save();
    requestAnimationFrame(() => {
      const allCells = Array.from(
        _container.querySelectorAll(`.dg-cell--editable[data-table="${tableType}"]`)
      );
      const current = _container.querySelector(
        `.dg-cell--editable[data-table="${tableType}"][data-metric="${metricId}"][data-month="${month}"]`
      );
      const idx = allCells.indexOf(current);
      const nextIdx = reverse ? idx - 1 : idx + 1;
      if (nextIdx >= 0 && nextIdx < allCells.length) {
        enterEdit(allCells[nextIdx]);
      }
    });
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Tab') { e.preventDefault(); tabToNext(e.shiftKey); }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (td.classList.contains('dg-cell--editing')) save();
    }, 100);
  });
}

// ── Public API ──────────────────────────────────────────────────

export async function init(containerEl) {
  _container = containerEl.querySelector('#dg-tables');
  if (!_container) return;
  await loadConfig();
  render();
}

export function destroy() {
  _container = null;
  _forecastData = null;
  _actualData = null;
}
