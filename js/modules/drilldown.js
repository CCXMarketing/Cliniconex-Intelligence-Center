import { CICDatePicker } from './datepicker.js';

// ── CIC Drilldown Modal Engine ──────────────────────────────────
// Called by any tab module: Drilldown.open({ title, data, type })

export const Drilldown = {
  _overlay: null,
  _chart: null,

  init() {
    // Create overlay and panel DOM once
    if (document.getElementById('drilldown-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'drilldown-overlay';
    overlay.id = 'drilldown-overlay';
    overlay.innerHTML = `
      <div class="drilldown-panel" id="drilldown-panel">
        <div class="drilldown-header">
          <div class="drilldown-header__left">
            <div class="drilldown-title" id="dd-title"></div>
            <div class="drilldown-subtitle" id="dd-subtitle"></div>
          </div>
          <button class="drilldown-close" id="drilldown-close">\u2715</button>
        </div>
        <div class="drilldown-meta" id="dd-meta"></div>
        <div class="drilldown-body" id="dd-body"></div>
      </div>`;

    document.body.appendChild(overlay);
    this._overlay = overlay;

    // Close on overlay click or close button
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    document.getElementById('drilldown-close').addEventListener('click', () => this.close());

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  open(config) {
    this.init();

    // Set title and subtitle
    document.getElementById('dd-title').textContent = config.title || '';
    document.getElementById('dd-subtitle').textContent = config.definition || '';

    // Meta bar: cadence, data source, accountable, OKR
    const meta = document.getElementById('dd-meta');
    meta.innerHTML = [
      config.cadence    ? `<div class="drilldown-meta-item">\uD83D\uDCC5 Cadence <span>${config.cadence}</span></div>` : '',
      config.dataSource ? `<div class="drilldown-meta-item">\uD83D\uDD0C Source <span>${config.dataSource}</span></div>` : '',
      config.accountable? `<div class="drilldown-meta-item">\uD83D\uDC64 Accountable <span>${config.accountable}</span></div>` : '',
      config.status     ? `<div class="drilldown-meta-item">\u25CF Status <span class="badge badge--${config.status}">${config.status.toUpperCase()}</span></div>` : '',
    ].join('');

    // Build body content
    const body = document.getElementById('dd-body');
    body.innerHTML = '';

    // Destroy previous chart
    if (this._chart) { this._chart.destroy(); this._chart = null; }

    // Period comparison toggle
    body.innerHTML += `
      <div class="dd-compare-bar">
        <span class="dd-compare-label">Compare to</span>
        <div class="dd-compare-toggle">
          <button class="dd-compare-btn" data-period="last-month">Last Month</button>
          <button class="dd-compare-btn" data-period="last-year">Last Year</button>
          <button class="dd-compare-btn" data-period="custom">Custom</button>
        </div>
        <div class="dd-custom-picker" id="dd-custom-picker" style="display:none">
          <button class="cic-datepicker-trigger" id="dd-datepicker-trigger">
            <span class="cic-datepicker-trigger__icon">📅</span>
            <span class="cic-datepicker-trigger__text">Select month</span>
            <span class="cic-datepicker-trigger__arrow">▾</span>
          </button>
        </div>
        <button class="dd-compare-clear" id="dd-compare-clear" style="display:none">\u2715 Clear</button>
      </div>
      <div class="dd-comparison-bar" id="dd-comparison-bar" style="display:none">
        <div class="dd-comparison-item">
          <div class="dd-comparison-period" id="dd-comp-period-a">Current</div>
          <div class="dd-comparison-value" id="dd-comp-value-a">\u2014</div>
        </div>
        <div class="dd-comparison-divider">
          <div class="dd-comparison-variance" id="dd-comp-variance">\u2014</div>
          <div class="dd-comparison-variance-label">vs selected period</div>
        </div>
        <div class="dd-comparison-item dd-comparison-item--compare">
          <div class="dd-comparison-period" id="dd-comp-period-b">\u2014</div>
          <div class="dd-comparison-value" id="dd-comp-value-b">\u2014</div>
        </div>
      </div>`;

    // Primary value
    if (config.value != null) {
      const formattedVal = this._format(config.value, config.unit);
      const formattedTarget = config.target != null ? this._format(config.target, config.unit) : null;

      let deltaHtml = '';
      if (config.trend && config.trend.length >= 2) {
        const prev = config.trend[config.trend.length - 2];
        const curr = config.trend[config.trend.length - 1];
        const pct = ((curr - prev) / Math.abs(prev) * 100).toFixed(1);
        const dir = pct >= 0 ? 'up' : 'down';
        deltaHtml = `<div class="drilldown-primary__delta drilldown-primary__delta--${dir}">
          ${pct >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(pct)}% vs previous month
        </div>`;
      }

      body.innerHTML += `
        <div class="drilldown-primary">
          <div class="drilldown-primary__value">${formattedVal}</div>
          <div class="drilldown-primary__meta">
            ${deltaHtml}
            ${formattedTarget ? `<div class="drilldown-primary__target">Target: ${formattedTarget}</div>` : ''}
          </div>
        </div>`;
    }

    // OKR context
    if (config.okr) {
      body.innerHTML += `
        <div class="drilldown-context-box">
          <div class="drilldown-context-box__label">OKR / Key Result</div>
          <div class="drilldown-context-box__text">${config.okr}</div>
        </div>`;
    }

    // Trend chart
    if (config.trend && config.trend.length > 1) {
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">Trend (Last ${config.trend.length} Months)</div>
          <div class="drilldown-chart-container">
            <canvas id="dd-chart"></canvas>
          </div>
        </div>`;

      // Render chart after DOM update
      setTimeout(() => {
        const canvas = document.getElementById('dd-chart');
        if (!canvas) return;
        this._chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: config.trendLabels || config.trend.map((_, i) => `M-${config.trend.length - 1 - i}`),
            datasets: [{
              label: config.title,
              data: config.trend,
              borderColor: '#ADC837',
              backgroundColor: 'rgba(173,200,55,0.1)',
              fill: true,
              tension: 0.4,
              pointBackgroundColor: '#ADC837',
              pointRadius: 5,
              borderWidth: 2
            },
            ...(config.target != null ? [{
              label: 'Target',
              data: config.trend.map(() => config.target),
              borderColor: '#E53935',
              borderDash: [5, 3],
              pointRadius: 0,
              fill: false,
              borderWidth: 1.5
            }] : [])
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { font: { family: 'Nunito Sans', size: 11 } } }
            },
            scales: {
              y: {
                ticks: {
                  callback: v => this._format(v, config.unit),
                  font: { family: 'Nunito Sans', size: 11 }
                }
              },
              x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
            }
          }
        });
      }, 50);
    }

    // Trend table
    if (config.trend && config.trendLabels) {
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">Monthly Detail</div>
          <table class="drilldown-trend-table">
            <thead>
              <tr>
                <th>Month</th>
                <th class="col-right">Value</th>
                ${config.target != null ? '<th class="col-right">Target</th><th class="col-right">vs Target</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${config.trend.map((v, i) => {
                const label = config.trendLabels[i];
                const fmt = this._format(v, config.unit);
                const isCurrent = i === config.trend.length - 1;
                const vsTarget = config.target != null
                  ? ((v / config.target - 1) * 100).toFixed(1) + '%'
                  : '';
                return `<tr ${isCurrent ? 'style="font-weight:700"' : ''}>
                  <td>${label}${isCurrent ? ' \u2190' : ''}</td>
                  <td class="col-right">${fmt}</td>
                  ${config.target != null ? `
                    <td class="col-right">${this._format(config.target, config.unit)}</td>
                    <td class="col-right" style="color:${v >= config.target ? '#2E7D32' : '#C62828'}">${vsTarget}</td>
                  ` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Breakdown rows (segments, reps, partners etc.)
    if (config.breakdown && config.breakdown.length > 0) {
      const maxVal = Math.max(...config.breakdown.map(b => b.value || 0));
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">${config.breakdownTitle || 'Breakdown'}</div>
          <div class="drilldown-breakdown">
            ${config.breakdown.map(b => `
              <div class="drilldown-breakdown-row">
                <div class="drilldown-breakdown-row__label">${b.label}</div>
                <div class="drilldown-breakdown-row__bar">
                  <div class="drilldown-breakdown-row__fill" style="width:${maxVal > 0 ? Math.round((b.value/maxVal)*100) : 0}%"></div>
                </div>
                <div class="drilldown-breakdown-row__value">${this._format(b.value, config.unit)}</div>
                ${b.target != null ? `<div style="font-size:11px;color:#9E9E9E;width:80px;text-align:right">/ ${this._format(b.target, config.unit)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    // YTD section
    if (config.ytd != null) {
      body.innerHTML += `
        <div class="drilldown-section">
          <div class="drilldown-section-title">Year-to-Date</div>
          <div class="drilldown-breakdown">
            <div class="drilldown-breakdown-row">
              <div class="drilldown-breakdown-row__label">YTD Actual</div>
              <div class="drilldown-breakdown-row__bar">
                <div class="drilldown-breakdown-row__fill" style="width:${config.ytdTarget ? Math.min(100, Math.round(config.ytd/config.ytdTarget*100)) : 50}%"></div>
              </div>
              <div class="drilldown-breakdown-row__value">${this._format(config.ytd, config.unit)}</div>
              ${config.ytdTarget ? `<div style="font-size:11px;color:#9E9E9E;width:80px;text-align:right">/ ${this._format(config.ytdTarget, config.unit)}</div>` : ''}
            </div>
          </div>
        </div>`;
    }

    // Note / gap
    if (config.note) {
      body.innerHTML += `<div class="drilldown-note">\u26A0 ${config.note}</div>`;
    }

    // Wire period comparison
    this._wirePeriodComparison(config);

    // Show modal
    requestAnimationFrame(() => {
      this._overlay.classList.add('visible');
    });
  },

  close() {
    if (this._overlay) this._overlay.classList.remove('visible');
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  },

  _wirePeriodComparison(config) {
    const btns         = document.querySelectorAll('.dd-compare-btn');
    const customPicker = document.getElementById('dd-custom-picker');
    const clearBtn     = document.getElementById('dd-compare-clear');
    const compBar      = document.getElementById('dd-comparison-bar');

    // Wire up the date picker for custom comparison
    let dpInstance = null;
    let customSelectedDate = null;
    const triggerEl = document.getElementById('dd-datepicker-trigger');
    if (triggerEl) {
      dpInstance = new CICDatePicker(triggerEl, {
        mode: 'month',
        showQuickRanges: false,
        maxDate: new Date()
      });
      dpInstance.onChange = (sel) => {
        customSelectedDate = sel.start;
        showComparison('custom');
      };
    }

    const getComparisonValue = (period) => {
      const trend = config.trend || [];
      const curr  = trend[trend.length - 1] ?? config.value;
      if (period === 'last-month') {
        return trend.length >= 2 ? trend[trend.length - 2] : null;
      }
      if (period === 'last-year') {
        return Math.round(curr * 0.80);
      }
      if (period === 'custom') {
        return Math.round(curr * 0.75);
      }
      return null;
    };

    const getPeriodLabel = (period) => {
      const labels = config.trendLabels || [];
      if (period === 'last-month') {
        return labels.length >= 2 ? labels[labels.length - 2] + ' 2026' : 'Last Month';
      }
      if (period === 'last-year') return 'March 2025 (est.)';
      if (period === 'custom') {
        if (!customSelectedDate) return 'Custom Period';
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return monthNames[customSelectedDate.getMonth()] + ' ' + customSelectedDate.getFullYear();
      }
      return '\u2014';
    };

    const showComparison = (period) => {
      const compVal = getComparisonValue(period);
      if (compVal == null) return;
      const currVal = config.trend?.[config.trend.length - 1] ?? config.value;
      const change  = currVal - compVal;
      const pct     = compVal !== 0 ? ((change / Math.abs(compVal)) * 100).toFixed(1) : 0;
      const dir     = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
      const arrow   = change > 0 ? '\u25B2' : change < 0 ? '\u25BC' : '\u2014';
      const currLabel = config.trendLabels?.[config.trendLabels.length - 1]
        ? config.trendLabels[config.trendLabels.length - 1] + ' 2026 (Current)' : 'Current';

      document.getElementById('dd-comp-period-a').textContent = currLabel;
      document.getElementById('dd-comp-value-a').textContent  = this._format(currVal, config.unit);
      document.getElementById('dd-comp-period-b').textContent = getPeriodLabel(period);
      document.getElementById('dd-comp-value-b').textContent  = this._format(compVal, config.unit);
      const varianceEl = document.getElementById('dd-comp-variance');
      varianceEl.textContent = `${arrow} ${Math.abs(pct)}%`;
      varianceEl.className   = `dd-comparison-variance dd-comparison-variance--${dir}`;
      compBar.style.display  = 'grid';
      clearBtn.style.display = 'inline';

      const existingNote = document.querySelector('.dd-phase2-note');
      if (existingNote) existingNote.remove();
      if (period === 'last-year' || period === 'custom') {
        const note = document.createElement('div');
        note.className = 'dd-phase2-note';
        note.textContent = '* Estimated value \u2014 live historical data available in Phase 2';
        compBar.insertAdjacentElement('afterend', note);
      }
    };

    const clearComparison = () => {
      compBar.style.display  = 'none';
      clearBtn.style.display = 'none';
      customPicker.style.display = 'none';
      btns.forEach(b => b.classList.remove('active'));
      if (dpInstance) dpInstance.close();
      const note = document.querySelector('.dd-phase2-note');
      if (note) note.remove();
    };

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const period   = btn.dataset.period;
        const isActive = btn.classList.contains('active');
        btns.forEach(b => b.classList.remove('active'));
        customPicker.style.display = 'none';
        if (dpInstance) dpInstance.close();
        if (isActive) { clearComparison(); return; }
        btn.classList.add('active');
        if (period === 'custom') {
          customPicker.style.display = 'flex';
          showComparison('custom');
        } else {
          showComparison(period);
        }
      });
    });

    clearBtn.addEventListener('click', clearComparison);
  },

  _format(n, unit) {
    if (n == null) return '\u2014';
    if (unit === 'currency') return CIC.formatCurrency(n);
    if (unit === 'percent')  return CIC.formatPercent(n);
    if (unit === 'multiplier') return n.toFixed(1) + ':1';
    if (unit === 'ratio')  return Math.round(n) + ':1';
    if (unit === 'days')    return n + ' days';
    if (unit === 'hours')   return n + ' hrs';
    if (unit === 'score')   return n.toString();
    return n.toLocaleString();
  }
};


/* ════════════════════════════════════
   FEATURE 2: PARTNER DETAIL PANEL
════════════════════════════════════ */

const PARTNER_COLORS = {
  'PCC':    '#02475A',
  'QHR':    '#029FB5',
  'MxC':    '#ADC837',
  'Direct': '#522E76',
  'Other':  '#9E9E9E'
};

export const PartnerPanel = {
  _panel: null,
  _chart: null,
  _currentPartner: null,
  _allPartners: null,

  init(partners) {
    this._allPartners = partners;
    if (document.getElementById('partner-panel')) return;

    const panel = document.createElement('div');
    panel.className = 'partner-panel';
    panel.id = 'partner-panel';
    panel.innerHTML = `
      <div class="partner-panel__header">
        <h3 id="pp-name">Partner</h3>
        <p id="pp-meta"></p>
        <button class="partner-panel__close" id="pp-close">\u2715</button>
      </div>
      <div class="partner-panel__body">
        <div class="partner-period-toggle" id="pp-toggle">
          <button data-period="quarter" class="active">This Quarter</button>
          <button data-period="last-quarter">Last Quarter</button>
          <button data-period="year">Last 12 Months</button>
        </div>
        <div class="partner-stat-grid" id="pp-stats"></div>
        <div class="partner-chart-wrap"><canvas id="pp-chart"></canvas></div>
        <div id="pp-target-section"></div>
      </div>`;
    document.body.appendChild(panel);
    this._panel = panel;

    document.getElementById('pp-close').addEventListener('click', () => this.close());
    document.getElementById('pp-toggle').addEventListener('click', e => {
      const btn = e.target.closest('button[data-period]');
      if (!btn) return;
      document.querySelectorAll('#pp-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (this._currentPartner) this._render(this._currentPartner, btn.dataset.period);
    });
  },

  open(partner) {
    this._currentPartner = partner;
    this._panel.classList.add('open');

    // Apply partner color
    const color = PARTNER_COLORS[partner.name] || '#02475A';
    document.querySelector('.partner-panel__header').style.background = color;
    this._panel.style.borderLeft = `4px solid ${color}`;
    this._currentColor = color;

    // Reset toggle to This Quarter
    document.querySelectorAll('#pp-toggle button').forEach(b => b.classList.remove('active'));
    document.querySelector('#pp-toggle button[data-period="quarter"]').classList.add('active');
    this._render(partner, 'quarter');
  },

  close() {
    if (this._panel) this._panel.classList.remove('open');
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  },

  _render(partner, period) {
    document.getElementById('pp-name').textContent = partner.name;
    document.getElementById('pp-meta').textContent =
      `${CIC.formatCurrency(partner.mrr)} MRR \u00B7 ${partner.pct}% of total`;

    // Convert pct trend to MRR trend, then extrapolate to 12 months
    const currentPct = partner.trend[partner.trend.length - 1];
    const mrrTrend = partner.trend.map(pct =>
      currentPct > 0 ? Math.round(partner.mrr * (pct / currentPct)) : partner.mrr
    );
    const avgChange = mrrTrend.length >= 2
      ? (mrrTrend[mrrTrend.length - 1] - mrrTrend[0]) / (mrrTrend.length - 1)
      : 0;
    const base = [...mrrTrend];
    while (base.length < 12) {
      base.unshift(Math.max(0, Math.round(base[0] - avgChange)));
    }
    const months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

    const slices = {
      'quarter':      { data: base.slice(9, 12),  labels: months.slice(9, 12) },
      'last-quarter': { data: base.slice(6, 9),   labels: months.slice(6, 9) },
      'year':         { data: base,                labels: months }
    };
    const { data, labels } = slices[period] || slices['quarter'];

    // Stats
    const avg     = Math.round(data.reduce((a, b) => a + b, 0) / data.length);
    const peak    = Math.max(...data);
    const peakIdx = data.indexOf(peak);
    const growth  = data.length >= 2 && data[0] > 0
      ? ((data[data.length - 1] - data[0]) / Math.abs(data[0]) * 100).toFixed(1)
      : '0.0';

    document.getElementById('pp-stats').innerHTML = `
      <div class="partner-stat">
        <div class="partner-stat__label">Avg MRR</div>
        <div class="partner-stat__value">${CIC.formatCurrency(avg)}</div>
      </div>
      <div class="partner-stat">
        <div class="partner-stat__label">Peak Month</div>
        <div class="partner-stat__value">${labels[peakIdx]}</div>
      </div>
      <div class="partner-stat">
        <div class="partner-stat__label">Growth</div>
        <div class="partner-stat__value" style="color:${growth >= 0 ? '#2E7D32' : '#C62828'}">
          ${growth >= 0 ? '\u25B2' : '\u25BC'}${Math.abs(growth)}%
        </div>
      </div>
      <div class="partner-stat">
        <div class="partner-stat__label">% of Total</div>
        <div class="partner-stat__value">${partner.pct}%</div>
      </div>`;

    // Apply partner color accent to stat cards
    const color = this._currentColor || '#02475A';
    document.querySelectorAll('.partner-stat').forEach(s => {
      s.style.borderTop = `3px solid ${color}`;
    });

    // Chart
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    const canvas = document.getElementById('pp-chart');
    this._chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `${partner.name} MRR`,
          data,
          backgroundColor: color,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: v => CIC.formatCurrency(v), font: { family: 'Nunito Sans', size: 11 } } },
          x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
        }
      }
    });

    // MxC annual target bar
    const targetSection = document.getElementById('pp-target-section');
    if (partner.name === 'MxC') {
      const annualTarget = 409000;
      const pctOfTarget  = Math.min(100, Math.round(partner.mrr / annualTarget * 100));
      targetSection.innerHTML = `
        <div class="partner-target-bar">
          <div class="partner-target-bar__label">Annual Target Progress ($409K)</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#9E9E9E;margin-bottom:6px;font-family:'Nunito Sans',sans-serif;">
            <span>${CIC.formatCurrency(partner.mrr)} current MRR</span>
            <span>${pctOfTarget}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pctOfTarget}%"></div>
          </div>
        </div>`;
    } else {
      targetSection.innerHTML = '';
    }
  }
};


/* ════════════════════════════════════
   FEATURE 3: INLINE CARD EDITING
════════════════════════════════════ */

export function wireEditableCards(containerEl, department) {
  containerEl.querySelectorAll('.kpi-card[data-editable="true"]').forEach(card => {
    const key     = card.dataset.entryKey;
    const unit    = card.dataset.unit || 'number';
    const valueEl = card.querySelector('.kpi-value, .kpi-value--sm');
    if (!valueEl) return;

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'kpi-card__edit-btn';
    editBtn.title = 'Edit this value';
    editBtn.textContent = '\u270E';
    card.appendChild(editBtn);

    // Input
    const input = document.createElement('input');
    input.className = 'kpi-card__edit-input';
    input.type = 'number';
    card.insertBefore(input, valueEl.nextSibling);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'kpi-card__edit-actions';
    actions.innerHTML = `
      <button class="kpi-card__save-btn">\u2713 Save</button>
      <button class="kpi-card__cancel-btn">\u2715 Cancel</button>`;
    card.appendChild(actions);

    // Saved indicator
    const savedMsg = document.createElement('div');
    savedMsg.className = 'kpi-card__saved-indicator';
    savedMsg.textContent = '\u2713 Saved';
    card.appendChild(savedMsg);

    // Enter edit mode
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      const raw = valueEl.textContent.replace(/[^0-9.]/g, '');
      input.value = raw;
      card.classList.add('editing');
      input.focus();
      input.select();
    });

    // Save
    actions.querySelector('.kpi-card__save-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const newVal = parseFloat(input.value);
      if (!isNaN(newVal)) {
        const display = unit === 'currency'    ? CIC.formatCurrency(newVal)
                      : unit === 'percent'     ? CIC.formatPercent(newVal)
                      : unit === 'multiplier'  ? newVal.toFixed(1) + ':1'
                      : newVal.toLocaleString();
        valueEl.textContent = display;
        await CIC.setData(department, key, newVal);
        savedMsg.classList.add('visible');
        setTimeout(() => savedMsg.classList.remove('visible'), 3000);
      }
      card.classList.remove('editing');
    });

    // Cancel
    actions.querySelector('.kpi-card__cancel-btn').addEventListener('click', e => {
      e.stopPropagation();
      card.classList.remove('editing');
    });
  });
}
