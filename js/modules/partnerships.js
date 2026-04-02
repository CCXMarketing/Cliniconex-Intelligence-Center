import { Drilldown } from './drilldown.js';

// ── Channel Partnerships tab module ──

const CHART_COLORS = {
  green:  '#ADC837',
  teal:   '#02475A',
  cyan:   '#029FB5',
  purple: '#522E76',
  red:    '#E53935',
  orange: '#F57C00',
  grey:   '#9E9E9E',
  statusGreen:  '#4CAF50',
  statusYellow: '#FFC107',
  statusRed:    '#F44336'
};

function fmt$(n) { return CIC.formatCurrency(n); }
function fmtPct(n) { return CIC.formatPercent(n); }

export default {
  charts: [],
  _data: null,

  async init(containerEl, data) {
    this._data = data;
    const k = data.kpis;

    Chart.defaults.font.family = 'Nunito Sans';
    Chart.defaults.font.size = 12;

    // ── Concentration Alert ──
    const alertsEl = containerEl.querySelector('#partnerships-alerts');
    const conc = k.revenue_by_partner;
    alertsEl.innerHTML = `
      <div class="highlight-row highlight-row--red">
        <span class="highlight-row__icon">⚠</span>
        PCC + QHR concentration at ${conc.concentration_current}% — target is ${conc.concentration_target}% by year-end. Trend is improving.
      </div>`;

    // ── Partner Donut Chart ──
    this._buildDonut(containerEl, k.revenue_by_partner);

    // ── Concentration Trend Chart ──
    this._buildConcentrationTrend(containerEl, k.revenue_by_partner);

    // ── Partner MRR Table ──
    this._buildMRRTable(containerEl, k.revenue_by_partner);

    // ── Partner Pipeline Coverage Table ──
    this._buildPipelineTable(containerEl, k.partner_pipeline_coverage);

    // ── Senior Living Grid ──
    this._buildSLGrid(containerEl, k.sl_partner_revenue);

    // ── New Channel Development Grid ──
    this._buildNewChannelGrid(containerEl, k);

    // ── Drilldown click handlers ──
    this._wireClickHandlers(containerEl, data);
  },

  // ── Partner Donut ──
  _buildDonut(el, rbp) {
    const ctx = el.querySelector('#partners-donut-chart').getContext('2d');
    const partners = rbp.partners;
    const colors = [CHART_COLORS.teal, CHART_COLORS.cyan, CHART_COLORS.green, CHART_COLORS.purple, CHART_COLORS.grey];
    const concPct = rbp.concentration_current;

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: partners.map(p => p.name),
        datasets: [{
          data: partners.map(p => p.pct),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        cutout: '62%',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            this._openPartnerPanel(partners[idx].name);
          }
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (tip) => ` ${tip.label}: ${tip.raw}%`
            }
          }
        }
      },
      plugins: [{
        id: 'centerText',
        afterDraw(chart) {
          const { ctx, chartArea: { top, bottom, left, right } } = chart;
          const cx = (left + right) / 2;
          const cy = (top + bottom) / 2;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '700 22px Nunito Sans';
          ctx.fillStyle = CHART_COLORS.red;
          ctx.fillText(concPct + '%', cx, cy - 8);
          ctx.font = '600 11px Nunito Sans';
          ctx.fillStyle = '#666';
          ctx.fillText('PCC+QHR', cx, cy + 12);
          ctx.restore();
        }
      }]
    });
    this.charts.push(chart);
  },

  // ── Concentration Trend ──
  _buildConcentrationTrend(el, rbp) {
    const ctx = el.querySelector('#partners-concentration-chart').getContext('2d');
    const labels = rbp.trend_labels;
    const pcc = rbp.partners.find(p => p.name === 'PCC');
    const qhr = rbp.partners.find(p => p.name === 'QHR');
    const combined = pcc.trend.map((v, i) => +(v + qhr.trend[i]).toFixed(1));

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'PCC+QHR %',
            data: combined,
            borderColor: CHART_COLORS.red,
            backgroundColor: 'rgba(229,57,53,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: CHART_COLORS.red
          },
          {
            label: 'Target (80%)',
            data: labels.map(() => rbp.concentration_target),
            borderColor: CHART_COLORS.grey,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 70, max: 100, ticks: { callback: v => v + '%' } }
        },
        plugins: {
          legend: { display: true, labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: tip => ` ${tip.dataset.label}: ${tip.raw}%` } }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── Partner MRR Table ──
  _buildMRRTable(el, rbp) {
    const tbody = el.querySelector('#partners-mrr-tbody');
    tbody.innerHTML = rbp.partners.map(p => {
      const pctClass = p.pct >= 15 ? 'text-red' : '';
      const first = p.trend[0];
      const last = p.trend[p.trend.length - 1];
      const arrow = last > first ? '▲' : last < first ? '▼' : '—';
      const arrowClass = last > first
        ? (p.name === 'PCC' || p.name === 'QHR' ? 'text-red' : 'text-green')
        : (p.name === 'PCC' || p.name === 'QHR' ? 'text-green' : 'text-red');
      return `<tr data-partner="${p.name}">
        <td>${p.name}</td>
        <td class="col-right">${fmt$(p.mrr)}</td>
        <td class="col-right ${pctClass}">${fmtPct(p.pct)}</td>
        <td class="${arrowClass}">${arrow} ${first}% → ${last}%</td>
      </tr>`;
    }).join('');

    // Wire click handlers on rows
    tbody.querySelectorAll('tr[data-partner]').forEach(row => {
      row.addEventListener('click', () => {
        this._openPartnerPanel(row.dataset.partner);
      });
    });
  },

  // ── Pipeline Coverage Table ──
  _buildPipelineTable(el, ppc) {
    const tbody = el.querySelector('#partners-pipeline-tbody');
    tbody.innerHTML = ppc.by_partner.map(p => {
      const coverageColor = p.coverage >= 3.0 ? 'green' : p.coverage >= 2.0 ? 'yellow' : 'red';
      return `<tr>
        <td>${p.partner}</td>
        <td class="col-right">${fmt$(p.pipeline)}</td>
        <td class="col-right">${fmt$(p.target)}</td>
        <td class="col-right">${p.coverage.toFixed(1)}x</td>
        <td class="col-center"><span class="badge badge--${coverageColor}">${p.status}</span></td>
      </tr>`;
    }).join('');
  },

  // ── Senior Living Grid ──
  _buildSLGrid(el, sl) {
    const grid = el.querySelector('#partners-sl-grid');
    grid.innerHTML = sl.by_partner.map(p => {
      const trend = p.trend;
      const first = trend[0];
      const last = trend[trend.length - 1];
      const delta = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;
      const status = last >= sl.monthly_target ? 'green' : last >= sl.monthly_target * 0.5 ? 'yellow' : 'red';
      return `
        <div class="kpi-card kpi-card--${status}" data-drilldown="sl_partner_revenue">
          <div class="kpi-cadence">Monthly</div>
          <div class="kpi-label">${p.partner}</div>
          <div class="kpi-value">${fmt$(p.mrr)}</div>
          <div class="kpi-delta kpi-delta--up">▲${delta}%</div>
        </div>`;
    }).join('');
  },

  // ── New Channel Development Grid ──
  _buildNewChannelGrid(el, k) {
    const grid = el.querySelector('#partners-new-channel-grid');
    const nrd = k.non_reseller_deals;
    const npa = k.new_partner_activation;
    const npo = k.new_partner_outreach;

    grid.innerHTML = `
      <div class="kpi-card kpi-card--red" data-drilldown="non_reseller_deals">
        <div class="kpi-cadence">${nrd.cadence}</div>
        <div class="kpi-label">Non-Reseller Deals</div>
        <div class="kpi-value">${nrd.value}</div>
        <div class="kpi-target">Target: ${nrd.target_ytd} YTD</div>
        <div class="kpi-note">${nrd.note}</div>
      </div>
      <div class="kpi-card kpi-card--red" data-drilldown="new_partner_activation">
        <div class="kpi-cadence">${npa.cadence}</div>
        <div class="kpi-label">New Partner Activation</div>
        <div class="kpi-value">${npa.value}</div>
        <div class="kpi-target">Target: ${npa.target}</div>
        <div class="kpi-note">${npa.note}</div>
      </div>
      <div class="kpi-card kpi-card--yellow" data-drilldown="new_partner_outreach">
        <div class="kpi-cadence">${npo.cadence}</div>
        <div class="kpi-label">New Partner Outreach</div>
        <div class="kpi-value">${npo.value}</div>
        <div class="kpi-target">Target: ${npo.target}</div>
      </div>`;
  },

  _wireClickHandlers(containerEl, data) {
    const k = data.kpis;
    containerEl.querySelectorAll('.kpi-card[data-drilldown]').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.drilldown;
        const kpi = k[key];
        if (!kpi) return;
        Drilldown.open({
          title:       kpi.label,
          definition:  kpi.definition || '',
          value:       kpi.value,
          target:      kpi.target,
          unit:        kpi.unit || 'count',
          status:      kpi.status,
          trend:       kpi.trend,
          trendLabels: kpi.trend_labels,
          ytd:         kpi.ytd,
          ytdTarget:   kpi.ytd_target,
          okr:         kpi.okr,
          cadence:     kpi.cadence,
          dataSource:  data.meta?.data_source?.join(', '),
          accountable: data.meta?.accountable,
          note:        kpi.note,
          breakdown:   this._getBreakdown(key, kpi),
          breakdownTitle: this._getBreakdownTitle(key)
        });
      });
    });
  },

  _getBreakdown(key, kpi) {
    if (key === 'revenue_by_partner') {
      return this._data?.kpis?.revenue_by_partner?.partners?.map(p => ({
        label: p.name, value: p.mrr
      })) || null;
    }
    if (key === 'sl_partner_revenue') {
      return this._data?.kpis?.sl_partner_revenue?.by_partner?.map(p => ({
        label: p.partner, value: p.mrr, target: this._data?.kpis?.sl_partner_revenue?.monthly_target
      })) || null;
    }
    return null;
  },

  _getBreakdownTitle(key) {
    if (key === 'revenue_by_partner') return 'Revenue by Partner';
    if (key === 'sl_partner_revenue') return 'SL Partner Revenue';
    return 'Breakdown';
  },

  // ── Partner Detail Panel ──
  _panelEl: null,
  _panelChart: null,
  _currentPartner: null,
  _currentPeriod: 'quarter',

  _initPanel() {
    if (this._panelEl) return;
    const panel = document.createElement('div');
    panel.className = 'partner-panel';
    panel.id = 'partner-panel';
    panel.innerHTML = `
      <div class="partner-panel__header">
        <h3 id="pp-name"></h3>
        <p id="pp-subtitle"></p>
        <button class="partner-panel__close" id="pp-close">\u2715</button>
      </div>
      <div class="partner-panel__body" id="pp-body"></div>`;
    document.body.appendChild(panel);
    this._panelEl = panel;

    document.getElementById('pp-close').addEventListener('click', () => this._closePanel());
  },

  _openPartnerPanel(partnerName) {
    this._initPanel();
    this._currentPartner = partnerName;
    this._currentPeriod = 'quarter';
    this._renderPanel();
    requestAnimationFrame(() => this._panelEl.classList.add('open'));
  },

  _closePanel() {
    if (this._panelEl) this._panelEl.classList.remove('open');
    if (this._panelChart) { this._panelChart.destroy(); this._panelChart = null; }
  },

  _renderPanel() {
    const name = this._currentPartner;
    const rbp = this._data.kpis.revenue_by_partner;
    const partner = rbp.partners.find(p => p.name === name);
    if (!partner) return;

    document.getElementById('pp-name').textContent = name;
    document.getElementById('pp-subtitle').textContent =
      `${fmt$(partner.mrr)} MRR \u00B7 ${partner.pct}% of total`;

    const body = document.getElementById('pp-body');
    if (this._panelChart) { this._panelChart.destroy(); this._panelChart = null; }

    // Generate MRR data for all periods
    const mrrData = this._generateMRRData(partner);
    const periodData = this._getPeriodData(mrrData, this._currentPeriod);

    // Period toggle
    const toggleHtml = `
      <div class="partner-period-toggle" id="pp-toggle">
        <button data-period="quarter" class="${this._currentPeriod === 'quarter' ? 'active' : ''}">This Quarter</button>
        <button data-period="last-quarter" class="${this._currentPeriod === 'last-quarter' ? 'active' : ''}">Last Quarter</button>
        <button data-period="12-months" class="${this._currentPeriod === '12-months' ? 'active' : ''}">Last 12 Months</button>
      </div>`;

    // Summary stats
    const avgMRR = periodData.values.reduce((s, v) => s + v, 0) / periodData.values.length;
    const peakVal = Math.max(...periodData.values);
    const peakIdx = periodData.values.indexOf(peakVal);
    const firstVal = periodData.values[0];
    const lastVal = periodData.values[periodData.values.length - 1];
    const growthPct = firstVal > 0 ? (((lastVal - firstVal) / firstVal) * 100).toFixed(1) : '0.0';

    const statsHtml = `
      <div class="partner-stat-grid">
        <div class="partner-stat">
          <div class="partner-stat__label">Avg MRR</div>
          <div class="partner-stat__value">${fmt$(Math.round(avgMRR))}</div>
        </div>
        <div class="partner-stat">
          <div class="partner-stat__label">Peak Month</div>
          <div class="partner-stat__value">${periodData.labels[peakIdx]}</div>
        </div>
        <div class="partner-stat">
          <div class="partner-stat__label">Growth Rate</div>
          <div class="partner-stat__value">${growthPct >= 0 ? '+' : ''}${growthPct}%</div>
        </div>
        <div class="partner-stat">
          <div class="partner-stat__label">% of Revenue</div>
          <div class="partner-stat__value">${partner.pct}%</div>
        </div>
      </div>`;

    // MxC target progress bar
    let mxcHtml = '';
    if (name === 'MxC') {
      const mxc = this._data.kpis.mxc_revenue_ramp;
      const pct = ((mxc.value / mxc.annual_target) * 100).toFixed(1);
      mxcHtml = `
        <div class="drilldown-section">
          <div class="drilldown-section-title">Annual Target Progress</div>
          <div class="drilldown-breakdown">
            <div class="drilldown-breakdown-row">
              <div class="drilldown-breakdown-row__label">${fmt$(mxc.value)} of ${fmt$(mxc.annual_target)}</div>
              <div class="drilldown-breakdown-row__bar">
                <div class="drilldown-breakdown-row__fill" style="width:${Math.min(100, parseFloat(pct))}%"></div>
              </div>
              <div class="drilldown-breakdown-row__value">${pct}%</div>
            </div>
          </div>
        </div>`;
    }

    body.innerHTML = toggleHtml + `
      <div style="position:relative;height:200px;margin-bottom:16px;">
        <canvas id="pp-chart"></canvas>
      </div>` + statsHtml + mxcHtml;

    // Wire toggle buttons
    body.querySelectorAll('#pp-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        this._currentPeriod = btn.dataset.period;
        this._renderPanel();
      });
    });

    // Render chart
    setTimeout(() => {
      const canvas = document.getElementById('pp-chart');
      if (!canvas) return;

      // MoM growth rates
      const growthRates = periodData.values.map((v, i) => {
        if (i === 0) return 0;
        const prev = periodData.values[i - 1];
        return prev > 0 ? +((v - prev) / prev * 100).toFixed(1) : 0;
      });

      this._panelChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: periodData.labels,
          datasets: [
            {
              type: 'bar',
              label: 'MRR',
              data: periodData.values,
              backgroundColor: CHART_COLORS.teal,
              borderRadius: 4,
              barPercentage: 0.6,
              order: 2,
              yAxisID: 'y'
            },
            {
              type: 'line',
              label: 'MoM Growth %',
              data: growthRates,
              borderColor: CHART_COLORS.green,
              pointBackgroundColor: CHART_COLORS.green,
              pointRadius: 3,
              borderWidth: 2,
              fill: false,
              tension: 0.3,
              order: 1,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: {
              position: 'left',
              ticks: { callback: v => fmt$(v), font: { size: 10 } }
            },
            y1: {
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { callback: v => v + '%', font: { size: 10 } }
            },
            x: { ticks: { font: { size: 10 } } }
          },
          plugins: {
            legend: { labels: { font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.yAxisID === 'y'
                  ? `MRR: ${fmt$(ctx.raw)}`
                  : `Growth: ${ctx.raw}%`
              }
            }
          }
        }
      });
    }, 50);
  },

  _generateMRRData(partner) {
    // We have 4 months of pct trend data. Derive MRR from pct relative to current.
    const currentPct = partner.trend[partner.trend.length - 1];
    const knownMRR = partner.trend.map(pct =>
      currentPct > 0 ? Math.round(partner.mrr * (pct / currentPct)) : partner.mrr
    );
    const knownLabels = [...this._data.kpis.revenue_by_partner.trend_labels];

    // Extrapolate backwards to get 12 months total
    // Calculate average monthly MRR change from the 4 known months
    const avgChange = (knownMRR[knownMRR.length - 1] - knownMRR[0]) / (knownMRR.length - 1);
    const monthNames = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
    // Known months are Dec,Jan,Feb,Mar (indices 8-11 in the fiscal year)
    // We need to extrapolate backwards: Apr,May,Jun,Jul,Aug,Sep,Oct,Nov
    const extraCount = 12 - knownMRR.length;
    const extraMRR = [];
    const extraLabels = [];
    for (let i = extraCount; i > 0; i--) {
      const val = Math.max(0, Math.round(knownMRR[0] - avgChange * i));
      extraMRR.push(val);
      extraLabels.push(monthNames[extraCount - i]);
    }

    return {
      labels: [...extraLabels, ...knownLabels],
      values: [...extraMRR, ...knownMRR]
    };
  },

  _getPeriodData(fullData, period) {
    const len = fullData.labels.length;
    if (period === 'quarter') {
      // Last 3 months (current quarter)
      return {
        labels: fullData.labels.slice(len - 3),
        values: fullData.values.slice(len - 3)
      };
    }
    if (period === 'last-quarter') {
      // Months 7-9 (the quarter before current)
      return {
        labels: fullData.labels.slice(len - 6, len - 3),
        values: fullData.values.slice(len - 6, len - 3)
      };
    }
    // 12-months: all data
    return fullData;
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    this._closePanel();
    Drilldown.close();
  },

  getSummaryKPIs() {
    return [
      { label: 'PCC+QHR Concentration', value: '89.7%', delta: '▼0.4pp', status: 'red' },
      { label: 'MxC MRR', value: '$42K', delta: '▲44%', status: 'green' },
      { label: 'SL Partner Revenue', value: '$14.2K', delta: '▲27%', status: 'yellow' }
    ];
  }
};
