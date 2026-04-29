// ── Demand Generation Forecast Section ───────────────────────────────────────
// UI controller for the CIC Marketing tab forecast surface.
// Renders seven sub-blocks, wires editable assumptions, re-runs the engine
// on every change.

import { runForecast, BASELINE, MONTHS } from './forecast-engine.js';
import {
  loadConfig, saveConfig,
  loadChannels, saveChannels,
  loadNewMRR, saveNewMRR,
  DEFAULTS,
} from './forecast-config.js';
import { buildActuals, isLiveDataCached } from './forecast-data.js';

// ── State ────────────────────────────────────────────────────────────────────
let _container      = null;
let _chart          = null;
let _chartMode      = 'volume';
let _debounceTimer  = null;
let _cachedActuals  = null;
let _actualsYear    = null;
let _liveDataOk     = false;

// ── Chart.js plugin: vertical "Closed Through" line ─────────────────────────
const closedLinePlugin = {
  id: 'fcClosedLine',
  afterDraw(chart) {
    const cm = chart.options.plugins?.fcClosedLine?.month;
    if (!cm || cm <= 0 || cm >= 12) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data[cm - 1] || !meta.data[cm]) return;
    const x = (meta.data[cm - 1].x + meta.data[cm].x) / 2;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = '#9E9E9E';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '600 11px "Nunito Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Closed Through', x, chartArea.top - 8);
    ctx.restore();
  },
};

let _pluginRegistered = false;

// ── Public API ───────────────────────────────────────────────────────────────

export async function init(containerEl) {
  _container = containerEl.querySelector('#demand-forecast');
  if (!_container) return;

  if (!_pluginRegistered && typeof Chart !== 'undefined') {
    Chart.register(closedLinePlugin);
    _pluginRegistered = true;
  }

  _container.innerHTML = buildSkeleton();
  wireChartToggle();
  await refreshForecast(true);
}

export function destroy() {
  if (_chart) { _chart.destroy(); _chart = null; }
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _container = null;
  _cachedActuals = null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function lastClosedMonth() {
  const m = new Date().getMonth() + 1;
  return m === 1 ? 12 : m - 1;
}

function formatMoney(n) {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function formatPct(decimal) {
  if (decimal == null || isNaN(decimal)) return '0.0%';
  return (decimal * 100).toFixed(1) + '%';
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)  return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)  return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24)   return hr + 'h ago';
  const d = Math.floor(hr / 24);
  return d + ' day' + (d !== 1 ? 's' : '') + ' ago';
}

function formatScenarioName(name) {
  return name.replace(/&/g, 'and');
}

function q(sel) { return _container?.querySelector(sel); }

function makeStripePattern(hex) {
  const s = 10;
  const pc = document.createElement('canvas');
  pc.width = s; pc.height = s;
  const cx = pc.getContext('2d');
  cx.fillStyle = hex + '25';
  cx.fillRect(0, 0, s, s);
  cx.strokeStyle = hex + '80';
  cx.lineWidth = 2.5;
  cx.beginPath(); cx.moveTo(0, s); cx.lineTo(s, 0); cx.stroke();
  cx.beginPath(); cx.moveTo(-3, 3); cx.lineTo(3, -3); cx.stroke();
  cx.beginPath(); cx.moveTo(s - 3, s + 3); cx.lineTo(s + 3, s - 3); cx.stroke();
  const tmp = document.createElement('canvas').getContext('2d');
  return tmp.createPattern(pc, 'repeat');
}

// ── Core refresh ─────────────────────────────────────────────────────────────

function triggerImmediate() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  refreshForecast(false);
}

function triggerDebounced() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => refreshForecast(false), 250);
}

async function refreshForecast(fetchLive = false) {
  if (!_container) return;

  const cfg    = loadConfig();
  const newMRR = loadNewMRR();

  // Override engine BASELINE with user config (LTV override lives here)
  Object.assign(BASELINE, cfg.baseline);

  // Fetch or reuse actuals
  if (fetchLive || !_cachedActuals || _actualsYear !== cfg.year) {
    const res = await buildActuals(cfg.year, newMRR);
    _cachedActuals = res.actuals;
    _actualsYear   = cfg.year;
    _liveDataOk    = res.liveDataFetched;
  } else {
    for (let m = 0; m < 12; m++) {
      const key = `${cfg.year}-${String(m + 1).padStart(2, '0')}`;
      _cachedActuals[m].newMRR = newMRR[key] || 0;
    }
  }

  const channels     = loadChannels();
  const currentMonth = cfg.currentMonth === 'auto' ? lastClosedMonth() : cfg.currentMonth;

  const result = runForecast({
    target:       cfg.target,
    currentMonth,
    actuals:      _cachedActuals,
    mode:         cfg.mode,
    levers:       cfg.levers,
    channels,
  });

  // Save active focus so we can restore it after DOM update
  const focusId = _container.querySelector(':focus')?.id || null;

  renderBanner(_liveDataOk);
  renderTargetPace(result, cfg);
  renderAssumptions(result, cfg);
  renderRequiredPlan(result);
  renderPacingChart(result, currentMonth);
  renderPacingTable(result, _cachedActuals, newMRR, cfg.year, currentMonth);
  renderChannelMix(result, channels);
  renderScenarios(result);
  renderRisks(result);

  // Restore focus
  if (focusId) {
    const el = _container.querySelector('#' + focusId);
    if (el) el.focus();
  }
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function buildSkeleton() {
  return `
    <div id="fc-banner"></div>

    <div class="fc-pace-strip" id="fc-pace"></div>

    <div class="fc-sub-header"><h4>Active Assumptions</h4></div>
    <div class="fc-card-block" id="fc-assumptions"></div>

    <div class="fc-sub-header"><h4>Required Plan</h4></div>
    <div class="fc-plan" id="fc-plan"></div>

    <div class="fc-sub-header"><h4>Monthly Pacing</h4></div>
    <div id="fc-pacing">
      <div class="fc-toggle-row" id="fc-chart-toggle">
        <button class="fc-pill fc-pill--active" data-chart="volume">Volume (leads / wins)</button>
        <button class="fc-pill" data-chart="money">Money ($ spend / $ recognized)</button>
      </div>
      <div class="chart-card" style="margin-bottom:16px;">
        <div class="chart-container" style="height:320px;">
          <canvas id="fc-pacing-canvas"></canvas>
        </div>
      </div>
      <div id="fc-pacing-table"></div>
    </div>

    <div class="fc-sub-header"><h4>Channel Mix</h4></div>
    <div id="fc-channels"></div>

    <div class="fc-sub-header"><h4>Lever Scenarios</h4></div>
    <div id="fc-scenarios"></div>

    <div class="fc-sub-header"><h4>Risks</h4></div>
    <div id="fc-risks"></div>
  `;
}

// ── Wire: chart toggle (permanent) ──────────────────────────────────────────

function wireChartToggle() {
  const toggle = q('#fc-chart-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', e => {
    const btn = e.target.closest('.fc-pill');
    if (!btn || btn.dataset.chart === _chartMode) return;
    toggle.querySelectorAll('.fc-pill').forEach(b => b.classList.remove('fc-pill--active'));
    btn.classList.add('fc-pill--active');
    _chartMode = btn.dataset.chart;
    triggerImmediate();
  });
}

// ── Render 1: Connection Banner ─────────────────────────────────────────────

function renderBanner(isLive) {
  const el = q('#fc-banner');
  if (!el) return;
  if (isLive) { el.innerHTML = ''; return; }
  const cache = isLiveDataCached();
  const when  = cache.cached ? ` Last cached: ${formatRelativeTime(cache.fetchedAt)}.` : '';
  el.innerHTML = `
    <div class="fc-warning-banner">
      <span class="fc-warning-icon">\u26A0</span>
      Not connected \u2014 using last cached actuals. Manual newMRR entry still works.${when}
    </div>`;
}

// ── Render 2: Target and Pace strip ─────────────────────────────────────────

function renderTargetPace(result, cfg) {
  const el = q('#fc-pace');
  if (!el) return;

  const fc  = result.forecast;
  const pct = fc.pacePct.toFixed(1);
  const exp = fc.expectedPacePct.toFixed(1);
  const pillCls = fc.onTrack ? 'fc-status-pill--green' : 'fc-status-pill--amber';
  const pillTxt = fc.onTrack ? 'On Track' : 'Behind';

  el.innerHTML = `
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">Annual Target</div>
      <div class="fc-kpi-value fc-editable" id="fc-target-display">${formatMoney(cfg.target)}</div>
    </div>
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">YTD Recognized Revenue</div>
      <div class="fc-kpi-value">${formatMoney(result.ytd.revenue)}</div>
    </div>
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">Gap to Target</div>
      <div class="fc-kpi-value">${formatMoney(fc.gap)}</div>
    </div>
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">Pace</div>
      <div class="fc-kpi-value">${pct}%</div>
      <div class="fc-kpi-sub">vs expected ${exp}% <span class="fc-status-pill ${pillCls}">${pillTxt}</span></div>
    </div>`;

  // Editable target — click to edit
  const disp = el.querySelector('#fc-target-display');
  if (disp) {
    disp.addEventListener('click', () => {
      if (disp.querySelector('input')) return;
      const cur = cfg.target;
      disp.innerHTML = `<input type="number" class="fc-inline-input" value="${cur}" id="fc-target-input">`;
      const inp = disp.querySelector('input');
      inp.focus();
      inp.select();
      const commit = () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v > 0) saveConfig({ target: v });
        triggerImmediate();
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = cur; inp.blur(); }
      });
    });
  }
}

// ── Render 3: Active Assumptions bar ────────────────────────────────────────

function renderAssumptions(result, cfg) {
  const el = q('#fc-assumptions');
  if (!el) return;

  const { mode, levers } = cfg;
  const { active, rolling, tailMultiplier: tail } = result;
  const baseMRR  = mode === 'rolling' ? rolling.avgMRR  : DEFAULTS.baseline.avgMRR;
  const baseConv = mode === 'rolling' ? rolling.convRate : DEFAULTS.baseline.convRate;
  const baseCPL  = mode === 'rolling' ? rolling.cpl      : DEFAULTS.baseline.cpl;

  el.innerHTML = `
    <div class="fc-assumptions__row">
      <div class="fc-mode-toggle">
        <button class="fc-mode-btn ${mode === 'rolling'  ? 'fc-mode-btn--active' : ''}" data-mode="rolling">Rolling 3-Mo</button>
        <button class="fc-mode-btn ${mode === 'baseline' ? 'fc-mode-btn--active' : ''}" data-mode="baseline">Baseline</button>
      </div>
      <div class="fc-levers">
        ${leverHTML('mrr', 'MRR',  levers.mrr,  formatMoney(baseMRR),  formatMoney(active.avgMRR))}
        ${leverHTML('conv','Conv', levers.conv, formatPct(baseConv),   formatPct(active.convRate))}
        ${leverHTML('cpl', 'CPL',  levers.cpl,  formatMoney(baseCPL),  formatMoney(active.cpl))}
      </div>
    </div>
    <div class="fc-resolved-caption">
      Avg MRR: ${formatMoney(active.avgMRR)} \u00B7
      Conversion: ${formatPct(active.convRate)} \u00B7
      CPL: ${formatMoney(active.cpl)} \u00B7
      Tail Multiplier: ${tail.toFixed(2)}\u00D7
    </div>`;

  // Wire mode toggle
  el.querySelectorAll('.fc-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveConfig({ mode: btn.dataset.mode });
      triggerImmediate();
    });
  });

  // Wire lever +/- buttons
  el.querySelectorAll('.fc-lever__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.lever;
      const d = parseInt(btn.dataset.delta);
      const lv = loadConfig().levers;
      lv[f] = Math.max(-50, Math.min(50, (lv[f] || 0) + d));
      saveConfig({ levers: lv });
      triggerImmediate();
    });
  });

  // Wire lever inputs
  el.querySelectorAll('.fc-lever__input').forEach(inp => {
    inp.addEventListener('change', () => {
      const f  = inp.dataset.lever;
      const lv = loadConfig().levers;
      lv[f] = Math.max(-50, Math.min(50, parseInt(inp.value) || 0));
      saveConfig({ levers: lv });
      triggerDebounced();
    });
  });
}

function leverHTML(field, label, value, baseStr, activeStr) {
  return `
    <div class="fc-lever">
      <div class="fc-lever__label">${label} \u00B1%</div>
      <div class="fc-lever__control">
        <button class="fc-lever__btn" data-lever="${field}" data-delta="-5">\u2212</button>
        <input type="number" class="fc-lever__input" id="fc-lever-${field}"
               data-lever="${field}" value="${value}" min="-50" max="50" step="5">
        <button class="fc-lever__btn" data-lever="${field}" data-delta="5">+</button>
      </div>
      <div class="fc-lever__resolved">${baseStr} \u2192 ${activeStr}</div>
    </div>`;
}

// ── Render 4: Required Plan cards ───────────────────────────────────────────

function renderRequiredPlan(result) {
  const el = q('#fc-plan');
  if (!el) return;

  const fc  = result.forecast;
  const cac = BASELINE.cac;

  const ltvPill = fc.ltvCac >= 3
    ? 'fc-status-pill--green'
    : fc.ltvCac >= 1.5 ? 'fc-status-pill--amber' : 'fc-status-pill--red';

  el.innerHTML = `
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">Wins Required</div>
      <div class="fc-kpi-value">${Math.ceil(fc.winsNeeded).toLocaleString()}</div>
      <div class="fc-kpi-sub">to close gap</div>
    </div>
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">Leads Required</div>
      <div class="fc-kpi-value">${Math.ceil(fc.leadsNeeded).toLocaleString()}</div>
      <div class="fc-kpi-sub">at active conv rate</div>
    </div>
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">Budget Required</div>
      <div class="fc-kpi-value">${formatMoney(fc.budget)}</div>
      <div class="fc-kpi-sub">to acquire leads</div>
    </div>
    <div class="fc-kpi-card ${fc.cacImplied >= 3 * cac ? 'fc-card--danger' : ''}">
      <div class="fc-kpi-label">Implied CAC</div>
      <div class="fc-kpi-value">${formatMoney(fc.cacImplied)}</div>
      <div class="fc-kpi-sub">baseline: ${formatMoney(cac)}</div>
    </div>
    <div class="fc-kpi-card">
      <div class="fc-kpi-label">LTV:CAC</div>
      <div class="fc-kpi-value">${fc.ltvCac.toFixed(2)}:1</div>
      <div class="fc-kpi-sub"><span class="fc-status-pill ${ltvPill}">${fc.ltvCac >= 3 ? 'Healthy' : fc.ltvCac >= 1.5 ? 'Watch' : 'Critical'}</span></div>
    </div>
    <div class="fc-kpi-card ${fc.payback >= 24 ? 'fc-card--danger' : ''}">
      <div class="fc-kpi-label">Payback</div>
      <div class="fc-kpi-value">${fc.payback.toFixed(1)} mo</div>
      <div class="fc-kpi-sub">${fc.payback >= 24 ? 'Exceeds 24-month threshold' : ''}</div>
    </div>`;
}

// ── Render 5: Monthly Pacing chart ──────────────────────────────────────────

function renderPacingChart(result, currentMonth) {
  if (_chart) { _chart.destroy(); _chart = null; }
  const canvas = _container?.querySelector('#fc-pacing-canvas');
  if (!canvas) return;

  const pacing = result.pacing;
  const labels = pacing.map(p => p.month);

  const C = {
    leads: '#029FB5', wins: '#ADC837',
    spend: '#522E76', recognized: '#02475A',
  };

  // Build stripe patterns for future months
  const patterns = {};
  for (const [k, hex] of Object.entries(C)) {
    patterns[k] = makeStripePattern(hex);
  }

  let datasets;
  if (_chartMode === 'volume') {
    datasets = [
      {
        label: 'Leads',
        data: pacing.map(p => p.leads),
        backgroundColor: pacing.map(p => p.isPast ? C.leads : patterns.leads),
        borderColor: C.leads, borderWidth: 1, borderRadius: 4,
      },
      {
        label: 'Wins',
        data: pacing.map(p => p.wins),
        backgroundColor: pacing.map(p => p.isPast ? C.wins : patterns.wins),
        borderColor: C.wins, borderWidth: 1, borderRadius: 4,
      },
    ];
  } else {
    datasets = [
      {
        label: 'Ad Spend',
        data: pacing.map(p => p.spend),
        backgroundColor: pacing.map(p => p.isPast ? C.spend : patterns.spend),
        borderColor: C.spend, borderWidth: 1, borderRadius: 4,
      },
      {
        label: 'Recognized Revenue',
        data: pacing.map(p => p.recognized),
        backgroundColor: pacing.map(p => p.isPast ? C.recognized : patterns.recognized),
        borderColor: C.recognized, borderWidth: 1, borderRadius: 4,
      },
    ];
  }

  _chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Nunito Sans', size: 12 } } },
        fcClosedLine: { month: currentMonth },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              return ctx.dataset.label + ': ' + (_chartMode === 'money' ? formatMoney(v) : Math.round(v).toLocaleString());
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: v => _chartMode === 'money' ? formatMoney(v) : v,
            font: { family: 'Nunito Sans', size: 11 },
          },
        },
        x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } },
      },
    },
  });
}

// ── Render 5b: Pacing data table (editable newMRR) ──────────────────────────

function renderPacingTable(result, actuals, newMRR, year, currentMonth) {
  const el = q('#fc-pacing-table');
  if (!el) return;

  const pastMonths = result.pacing.filter(p => p.isPast);
  if (pastMonths.length === 0) {
    el.innerHTML = '<div class="fc-caption">No closed months yet.</div>';
    return;
  }

  const savedTs = localStorage.getItem('cic_forecast_newMRR_ts');
  const tsLabel = savedTs ? `Last saved: ${formatRelativeTime(parseInt(savedTs))}` : '';

  let rows = '';
  pastMonths.forEach((p, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const mrr = newMRR[key] != null ? newMRR[key] : '';
    rows += `
      <tr>
        <td><strong>${p.month}</strong></td>
        <td class="col-right">${Math.round(p.leads).toLocaleString()}</td>
        <td class="col-right">${Math.round(p.wins).toLocaleString()}</td>
        <td class="col-right">
          <input type="number" class="fc-table-input fc-newmrr-input"
                 id="fc-newmrr-${i + 1}" data-month="${key}"
                 value="${mrr}" placeholder="0" step="1">
        </td>
        <td class="col-right">${formatMoney(p.spend)}</td>
      </tr>`;
  });

  el.innerHTML = `
    <div class="table-wrapper">
      <div class="fc-table-header-row">
        <div class="table-title">YTD Actuals</div>
        <div class="fc-caption">${tsLabel}</div>
      </div>
      <table class="data-table fc-pacing-data">
        <thead>
          <tr>
            <th>Month</th>
            <th class="col-right">Leads</th>
            <th class="col-right">Wins</th>
            <th class="col-right">New MRR ($)</th>
            <th class="col-right">Ad Spend</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Wire newMRR inputs
  el.querySelectorAll('.fc-newmrr-input').forEach(inp => {
    const save = () => {
      const nm = loadNewMRR();
      const v  = parseFloat(inp.value);
      if (!isNaN(v)) {
        nm[inp.dataset.month] = v;
      } else {
        delete nm[inp.dataset.month];
      }
      saveNewMRR(nm);
      localStorage.setItem('cic_forecast_newMRR_ts', String(Date.now()));
      triggerDebounced();
    };
    inp.addEventListener('blur', save);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
}

// ── Render 6: Channel Mix table ─────────────────────────────────────────────

function renderChannelMix(result, channels) {
  const el = q('#fc-channels');
  if (!el) return;

  const mix = result.channelMix;
  if (!mix) { el.innerHTML = ''; return; }

  let rows = '';
  mix.rows.forEach((r, i) => {
    const edited = channels[i]?.lastEdited ? formatRelativeTime(channels[i].lastEdited) : '\u2014';
    rows += `
      <tr>
        <td><input type="text" class="fc-table-input fc-ch-input" id="fc-ch-${i}-name"
                   data-row="${i}" data-field="name" value="${r.name}"></td>
        <td class="col-right"><input type="number" class="fc-table-input fc-ch-input"
                   id="fc-ch-${i}-alloc" data-row="${i}" data-field="alloc"
                   value="${r.alloc}" step="1" min="0" max="100"></td>
        <td class="col-right"><input type="number" class="fc-table-input fc-ch-input"
                   id="fc-ch-${i}-cpl" data-row="${i}" data-field="cpl"
                   value="${r.cpl}" step="10" min="0"></td>
        <td class="col-right"><input type="number" class="fc-table-input fc-ch-input"
                   id="fc-ch-${i}-conv" data-row="${i}" data-field="convRate"
                   value="${r.convRate}" step="0.5" min="0" max="100"></td>
        <td class="col-right">${formatMoney(r.dollars)}</td>
        <td class="col-right">${Math.round(r.leads).toLocaleString()}</td>
        <td class="col-right">${r.wins.toFixed(1)}</td>
        <td class="col-center fc-caption">${edited}</td>
        <td class="col-center">
          <button class="fc-icon-btn fc-ch-dup" data-row="${i}" title="Duplicate">\u2398</button>
          <button class="fc-icon-btn fc-ch-del" data-row="${i}" title="Delete">\u2715</button>
        </td>
      </tr>`;
  });

  const allocCls = Math.abs(mix.totalAlloc - 100) > 0.5 ? 'fc-val--red' : '';
  const gapMsg   = mix.winsGap > 0
    ? `<span class="fc-gap-chip fc-gap-chip--amber">Channel mix delivers ${mix.totalWins.toFixed(1)} wins vs ${result.forecast.winsNeeded.toFixed(1)} required \u2014 gap of ${mix.winsGap.toFixed(1)}</span>`
    : `<span class="fc-gap-chip fc-gap-chip--green">Channel mix meets target</span>`;

  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Channel</th>
            <th class="col-right">Alloc %</th>
            <th class="col-right">CPL ($)</th>
            <th class="col-right">Conv %</th>
            <th class="col-right">Dollars</th>
            <th class="col-right">Leads</th>
            <th class="col-right">Wins</th>
            <th class="col-center">Last edited</th>
            <th class="col-center">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="fc-totals-row">
            <td><strong>Totals</strong></td>
            <td class="col-right ${allocCls}"><strong>${mix.totalAlloc.toFixed(0)}%</strong></td>
            <td></td><td></td>
            <td class="col-right"><strong>${formatMoney(result.forecast.budget)}</strong></td>
            <td class="col-right"><strong>${Math.round(mix.totalLeads).toLocaleString()}</strong></td>
            <td class="col-right"><strong>${mix.totalWins.toFixed(1)}</strong></td>
            <td></td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="fc-channel-meta">
      Blended CPL: ${formatMoney(mix.blendedCPL)} \u00B7 Blended Conv: ${formatPct(mix.blendedConv)}
    </div>
    <div class="fc-channel-meta" style="margin-top:8px;">${gapMsg}</div>
    <div class="fc-channel-actions">
      <button class="fc-btn-pill" id="fc-ch-add">+ Add Channel</button>
      <button class="fc-btn-link" id="fc-ch-reset">Reset to defaults</button>
    </div>`;

  wireChannelEvents(el);
}

function wireChannelEvents(el) {
  // Input changes
  el.querySelectorAll('.fc-ch-input').forEach(inp => {
    const commit = () => {
      const chs = loadChannels();
      const r   = parseInt(inp.dataset.row);
      const f   = inp.dataset.field;
      if (!chs[r]) return;
      chs[r][f] = f === 'name' ? inp.value : parseFloat(inp.value) || 0;
      chs[r].lastEdited = Date.now();
      saveChannels(chs);
      triggerDebounced();
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  // Duplicate
  el.querySelectorAll('.fc-ch-dup').forEach(btn => {
    btn.addEventListener('click', () => {
      const chs = loadChannels();
      const i   = parseInt(btn.dataset.row);
      const dup = { ...chs[i], name: chs[i].name + ' (copy)', lastEdited: Date.now() };
      chs.splice(i + 1, 0, dup);
      saveChannels(chs);
      triggerImmediate();
    });
  });

  // Delete
  el.querySelectorAll('.fc-ch-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const chs = loadChannels();
      chs.splice(parseInt(btn.dataset.row), 1);
      saveChannels(chs);
      triggerImmediate();
    });
  });

  // Add channel
  const addBtn = el.querySelector('#fc-ch-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const chs = loadChannels();
      chs.push({ name: 'New Channel', alloc: 0, cpl: 300, convRate: 10, lastEdited: Date.now() });
      saveChannels(chs);
      triggerImmediate();
    });
  }

  // Reset
  const resetBtn = el.querySelector('#fc-ch-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      saveChannels(DEFAULTS.channels.map(c => ({ ...c })));
      triggerImmediate();
    });
  }
}

// ── Render 7: Lever Scenarios table ─────────────────────────────────────────

function renderScenarios(result) {
  const el = q('#fc-scenarios');
  if (!el) return;

  const scen = result.scenarios;
  let rows = '';
  scen.forEach((s, i) => {
    const isCurrent = i === 0;
    const cls       = isCurrent ? 'fc-scenario-current' : (s.warn ? 'fc-scenario-warn' : '');
    const delta     = isCurrent ? '\u2014'
      : `${s.deltaBudget >= 0 ? '+' : ''}${formatMoney(s.deltaBudget)} (${s.deltaPct >= 0 ? '+' : ''}${s.deltaPct.toFixed(0)}%)`;

    rows += `
      <tr class="${cls}">
        <td>${formatScenarioName(s.name)}</td>
        <td class="col-right">${Math.ceil(s.wins).toLocaleString()}</td>
        <td class="col-right">${Math.ceil(s.leads).toLocaleString()}</td>
        <td class="col-right">${formatMoney(s.budget)}</td>
        <td class="col-right">${delta}</td>
      </tr>`;
  });

  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th class="col-right">Wins</th>
            <th class="col-right">Leads</th>
            <th class="col-right">Budget</th>
            <th class="col-right">\u0394 vs Plan</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Render 8: Risks panel ───────────────────────────────────────────────────

function renderRisks(result) {
  const el = q('#fc-risks');
  if (!el) return;

  const risks = result.risks;
  if (!risks || risks.length === 0) {
    el.innerHTML = `
      <div class="fc-risk-card fc-risk-card--success">
        <div class="fc-risk-title">No risks detected</div>
        <div class="fc-risk-body">Forecast assumptions and channel mix are within healthy ranges.</div>
      </div>`;
    return;
  }

  el.innerHTML = risks.map(r => {
    const cls  = r.level === 'high' ? 'fc-risk-card--high' : 'fc-risk-card--med';
    const pill = r.level === 'high' ? 'fc-status-pill--red' : 'fc-status-pill--amber';
    const lbl  = r.level === 'high' ? 'High' : 'Medium';
    return `
      <div class="fc-risk-card ${cls}">
        <span class="fc-status-pill ${pill} fc-risk-pill">${lbl}</span>
        <div class="fc-risk-title">${r.title}</div>
        <div class="fc-risk-body">${r.body}</div>
      </div>`;
  }).join('');
}
