// ── DG Forecast & Actual Tables ─────────────────────────────────
// Editable 12-month planning grid: 7 metrics × 12 months × 2 tables
// Derived rows: funnel rates, ARR, ROAS. YTD attainment tracking.
// Persists to localStorage; schema designed for future Sheets sync.

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEAR = 2026;
const LS_FORECAST = 'dg_forecast_2026';
const LS_ACTUAL   = 'dg_actual_2026';

// Metric ID → storage path [group, key]
const METRIC_PATH = {
  demand_created:     ['pipe', 'demand_created'],
  demand_engaged:     ['pipe', 'demand_engaged'],
  demand_captured:    ['pipe', 'demand_captured'],
  demand_converted:   ['pipe', 'demand_converted'],
  new_mrr_cad:        ['rev',  'new_mrr_cad'],
  recognized_revenue: ['rev',  'recognized_revenue'],
  marketing_spend:    ['spend','marketing_spend'],
};

// ── Data Model ──────────────────────────────────────────────────

function createEmpty() {
  const monthObj = () => Object.fromEntries(MONTHS.map(m => [m, null]));
  return {
    pipe:  { demand_created: monthObj(), demand_engaged: monthObj(), demand_captured: monthObj(), demand_converted: monthObj() },
    rev:   { new_mrr_cad: monthObj(), recognized_revenue: monthObj() },
    spend: { marketing_spend: monthObj() },
  };
}

function loadData(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return createEmpty();
    const parsed = JSON.parse(raw);
    // Merge with empty to ensure all keys exist
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
  const [group, key] = METRIC_PATH[metricId];
  return data[group]?.[key]?.[month] ?? null;
}

function setVal(data, metricId, month, value) {
  const [group, key] = METRIC_PATH[metricId];
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

// ── Config ──────────────────────────────────────────────────────

let _avgLTV = 29000;

async function loadConfig() {
  try {
    const { CONFIG } = await import('./config.js');
    _avgLTV = CONFIG?.app?.avgLTV ?? CONFIG?.app?.ltv ?? 29000;
  } catch {}
}

// ── Formatting ──────────────────────────────────────────────────

const cadFmt = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

function fmtValue(value, format) {
  if (value == null) return '\u2014';
  if (format === 'currency') return cadFmt.format(value);
  if (format === 'percent')  return Math.round(value * 100) + '%';
  if (format === 'ratio')    return Math.round(value) + ':1';
  return value.toLocaleString('en-CA');
}

function fmtValueCompact(value, format) {
  if (value == null) return '\u2014';
  if (format === 'currency') {
    if (Math.abs(value) >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
    return cadFmt.format(value);
  }
  return fmtValue(value, format);
}

// ── Current Month ───────────────────────────────────────────────

function getCurrentMonthIndex() {
  const now = new Date();
  return now.getFullYear() === YEAR ? now.getMonth() : -1;
}

// ── Row Definitions ─────────────────────────────────────────────
// Ordered list of all rows for table rendering.

function buildRowDefs(tableType) {
  const rows = [];

  // ── Pipeline ──
  rows.push({ type: 'group', label: 'Demand Generation Pipeline' });
  rows.push({ type: 'editable', id: 'demand_created', label: 'Demand Created', format: 'count' });
  rows.push({ type: 'editable', id: 'demand_engaged', label: 'Demand Engaged', format: 'count' });
  rows.push({ type: 'derived',  id: 'engaged_rate',   label: 'Engaged Rate',   format: 'percent',
    compute: (data, months) => {
      const n = sumMetric(data, 'demand_engaged', months);
      const d = sumMetric(data, 'demand_created', months);
      return (d != null && d !== 0 && n != null) ? n / d : null;
    }
  });
  rows.push({ type: 'editable', id: 'demand_captured', label: 'Demand Captured', format: 'count' });
  rows.push({ type: 'derived',  id: 'captured_rate',   label: 'Captured Rate',   format: 'percent',
    compute: (data, months) => {
      const n = sumMetric(data, 'demand_captured', months);
      const d = sumMetric(data, 'demand_engaged', months);
      return (d != null && d !== 0 && n != null) ? n / d : null;
    }
  });
  rows.push({ type: 'editable', id: 'demand_converted', label: 'Demand Converted', format: 'count' });
  rows.push({ type: 'derived',  id: 'converted_rate',   label: 'Converted Rate',   format: 'percent',
    compute: (data, months) => {
      const n = sumMetric(data, 'demand_converted', months);
      const d = sumMetric(data, 'demand_captured', months);
      return (d != null && d !== 0 && n != null) ? n / d : null;
    }
  });

  // ── Revenue ──
  rows.push({ type: 'group', label: 'Revenue' });
  rows.push({ type: 'editable', id: 'new_mrr_cad', label: 'New MRR (CAD)', format: 'currency' });
  rows.push({ type: 'derived',  id: 'arr',          label: 'ARR',            format: 'currency',
    compute: (data, months) => {
      const mrr = sumMetric(data, 'new_mrr_cad', months);
      return mrr != null ? mrr * 12 : null;
    }
  });
  rows.push({ type: 'editable', id: 'recognized_revenue', label: 'Recognized Revenue', format: 'currency' });

  // ── Spend & Efficiency ──
  rows.push({ type: 'group', label: 'Spend & Efficiency' });
  rows.push({ type: 'editable', id: 'marketing_spend', label: 'Marketing Spend', format: 'currency' });

  if (tableType === 'actual') {
    rows.push({ type: 'derived', id: 'roas', label: 'ROAS', format: 'ratio',
      compute: (data, months) => {
        const conv  = sumMetric(data, 'demand_converted', months);
        const spend = sumMetric(data, 'marketing_spend', months);
        return (conv && spend) ? (conv * _avgLTV) / spend : null;
      }
    });
  }

  return rows;
}

// ── Table HTML Builder ──────────────────────────────────────────

function buildTableHTML(tableType, data, forecastData) {
  const rows = buildRowDefs(tableType);
  const curMonth = getCurrentMonthIndex();
  const isActual = tableType === 'actual';
  const extraCols = isActual ? 3 : 1; // YTD + (Forecast YTD + Att.%) for actual
  const totalCols = 1 + 12 + 1 + (isActual ? 3 : 1); // metric + months + total + ytd cols

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
    const rowClass = isDerived ? 'dg-row--derived' : 'dg-row--editable';
    html += `<tr class="${rowClass}">`;

    // Metric label
    html += `<td class="dg-td--metric">${isDerived ? '<span class="dg-derived-tag">\u0192</span> ' : ''}${row.label}</td>`;

    // Month cells
    for (let i = 0; i < 12; i++) {
      const month = MONTHS[i];
      const isCurrent = i === curMonth;
      let value;

      if (isDerived) {
        value = row.compute(data, [month]);
      } else {
        value = getVal(data, row.id, month);
      }

      const cellClass = isDerived ? 'dg-cell--derived' : 'dg-cell--editable';
      const currentClass = isCurrent ? ' dg-cell--current' : '';
      const attrs = isDerived ? '' : ` data-table="${tableType}" data-metric="${row.id}" data-month="${month}"`;

      html += `<td class="dg-cell ${cellClass}${currentClass}"${attrs}>${fmtValue(value, row.format)}</td>`;
    }

    // Total column
    let total;
    if (isDerived) {
      total = row.compute(data, MONTHS);
    } else {
      total = sumMetric(data, row.id, MONTHS);
    }
    html += `<td class="dg-cell dg-cell--summary">${fmtValueCompact(total, row.format)}</td>`;

    // YTD column (sum through current month)
    const ytdMonths = curMonth >= 0 ? MONTHS.slice(0, curMonth + 1) : [];
    let ytdVal;
    if (isDerived) {
      ytdVal = ytdMonths.length > 0 ? row.compute(data, ytdMonths) : null;
    } else {
      ytdVal = ytdMonths.length > 0 ? sumMetric(data, row.id, ytdMonths) : null;
    }
    html += `<td class="dg-cell dg-cell--summary">${fmtValueCompact(ytdVal, row.format)}</td>`;

    // Actual-only: Forecast YTD + Attainment %
    if (isActual) {
      let fcstYtd;
      if (isDerived && forecastData) {
        fcstYtd = ytdMonths.length > 0 ? row.compute(forecastData, ytdMonths) : null;
      } else if (forecastData) {
        fcstYtd = ytdMonths.length > 0 ? sumMetric(forecastData, row.id, ytdMonths) : null;
      } else {
        fcstYtd = null;
      }
      html += `<td class="dg-cell dg-cell--summary">${fmtValueCompact(fcstYtd, row.format)}</td>`;

      // Attainment %
      let attPct = null;
      if (ytdVal != null && fcstYtd != null && fcstYtd !== 0) {
        attPct = (ytdVal / fcstYtd) * 100;
      }
      const attClass = attPct == null ? '' : attPct >= 100 ? ' dg-att--green' : attPct >= 90 ? ' dg-att--amber' : ' dg-att--red';
      html += `<td class="dg-cell dg-cell--summary dg-cell--att${attClass}">${attPct != null ? Math.round(attPct) + '%' : '\u2014'}</td>`;
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
      .dg-th--metric { text-align: left; min-width: 160px; position: sticky; left: 0; z-index: 2; background: #02475A; }
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
      .dg-cell--current { background: rgba(2, 159, 181, 0.08); }
      .dg-cell--current.dg-cell--derived { background: rgba(2, 159, 181, 0.08); }
      .dg-cell--summary { background: #F4F4F4; font-weight: 700; border-left: 2px solid #D2D5DA; }
      .dg-cell--att { font-weight: 800; }
      .dg-att--green { color: #2E7D32; background: #E8F5E9; }
      .dg-att--amber { color: #F57F17; background: #FFF8E1; }
      .dg-att--red   { color: #C62828; background: #FFEBEE; }
      .dg-derived-tag {
        display: inline-block; width: 16px; height: 16px; line-height: 16px;
        text-align: center; border-radius: 3px; background: rgba(82,46,118,0.1);
        color: #522E76; font-size: 11px; font-weight: 800; font-style: italic;
        vertical-align: middle; margin-right: 2px;
      }
      .dg-cell--editing {
        padding: 2px 4px; background: white !important;
      }
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
      <div class="dg-table-section">
        <div class="dg-table-label">Forecast Targets <span>Click any cell to edit</span></div>
        <div class="dg-scroll">
          <table class="dg-table" id="dg-forecast-table">
            ${buildTableHTML('forecast', _forecastData, null)}
          </table>
        </div>
      </div>

      <div class="dg-table-section">
        <div class="dg-table-label">Monthly Actuals <span>Track progress against forecast</span></div>
        <div class="dg-scroll">
          <table class="dg-table" id="dg-actual-table">
            ${buildTableHTML('actual', _actualData, _forecastData)}
          </table>
        </div>
      </div>
    </div>`;

  wireEditing();
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
    const value = (parsed != null && !isNaN(parsed)) ? parsed : null;

    const lsKey = tableType === 'forecast' ? LS_FORECAST : LS_ACTUAL;
    setVal(data, metricId, month, value);
    saveData(lsKey, data);

    // Re-render both tables to update derived rows, totals, attainment
    render();
  };

  const cancel = () => {
    td.classList.remove('dg-cell--editing');
    td.textContent = originalText;
    td.removeChild(input);
  };

  const tabToNext = (reverse) => {
    save();
    // After re-render, find the next editable cell and click it
    requestAnimationFrame(() => {
      const allCells = Array.from(
        _container.querySelectorAll(`.dg-cell--editable[data-table="${tableType}"]`)
      );
      // Find the cell we just edited
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
    // Delay to allow Tab keydown to fire first
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
