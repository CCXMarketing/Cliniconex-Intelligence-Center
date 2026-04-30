import { Drilldown } from './drilldown.js';
import { renderInlineEntry } from './datepicker.js';
import { wireKpiEdit } from './kpi-edit.js';
import { wireTargets } from './kpi-targets.js';

// ── Customer Support tab module ──

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

    this._buildKPIGrid(containerEl, k);
    this._buildVolumeChart(containerEl, k.ticket_volume);
    this._buildResolutionTable(containerEl, k.avg_resolution_time);
    this._buildFCRChart(containerEl, k.first_contact_resolution);
    this._buildEscalationChart(containerEl, k.escalation_rate);
    this._buildEfficiencyGrid(containerEl, k);
    this._buildPendingGrid(containerEl, k.ces);

    // ── Drilldown click handlers ──
    this._wireClickHandlers(containerEl, data);
    wireKpiEdit(containerEl, 'support', data.kpis);
    wireTargets(containerEl, 'support', () => {
      this._buildKPIGrid(containerEl, data.kpis);
      this._wireClickHandlers(containerEl, data);
      wireKpiEdit(containerEl, 'support', data.kpis);
    });

    await renderInlineEntry(containerEl, {
      id: 'support-ops',
      title: 'Operations Data',
      department: 'support',
      insertAfterSelector: '#support-efficiency-grid',
      fields: [
        { key: 'support_dept_cost', label: 'Support Dept Cost (Month)', type: 'number', placeholder: '40000', unit: 'currency' },
        { key: 'total_headcount',   label: 'Total FTE Headcount',       type: 'number', placeholder: '82' },
        { key: 'new_hires',         label: 'New Hires This Month',      type: 'number', placeholder: '0' },
        { key: 'departures',        label: 'Departures This Month',     type: 'number', placeholder: '0' }
      ]
    });
  },

  // ── KPI Overview Grid ──
  _buildKPIGrid(el, k) {
    const grid = el.querySelector('#support-kpi-grid');
    const tv = k.ticket_volume;
    const fcr = k.first_contact_resolution;
    const art = k.avg_resolution_time;
    const esc = k.escalation_rate;

    const tvDelta = Math.round(((tv.trend[3] - tv.trend[0]) / tv.trend[0]) * 100);

    const _badge = (kpi) => {
      if (!kpi?._catalog && !kpi?._dataSource) return '';
      const b = CIC.catalog.dataSourceBadge(kpi);
      return `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
    };

    grid.innerHTML = `
      <div class="kpi-card kpi-card--${tv.status}" data-drilldown="ticket_volume">
        ${_badge(tv)}
        <div class="kpi-cadence">${tv.cadence}</div>
        <div class="kpi-label">${tv.label}</div>
        <div class="kpi-value">${tv.value}</div>
        <div class="kpi-delta kpi-delta--down">▼${Math.abs(tvDelta)}%</div>
        <div class="kpi-note">Lower is better</div>
      </div>
      <div class="kpi-card kpi-card--${fcr.status}" data-drilldown="first_contact_resolution">
        ${_badge(fcr)}
        <div class="kpi-cadence">${fcr.cadence}</div>
        <div class="kpi-label">First-Contact Resolution</div>
        <div class="kpi-value">${fmtPct(fcr.value)}</div>
        <div class="kpi-target">Target: ${fmtPct(fcr.target)}</div>
      </div>
      <div class="kpi-card kpi-card--${art.status}" data-drilldown="avg_resolution_time">
        ${_badge(art)}
        <div class="kpi-cadence">${art.cadence}</div>
        <div class="kpi-label">Avg Resolution Time</div>
        <div class="kpi-value">${art.value} hrs</div>
        <div class="kpi-target">Target: ${art.target} hrs</div>
      </div>
      <div class="kpi-card kpi-card--${esc.status}" data-drilldown="escalation_rate">
        ${_badge(esc)}
        <div class="kpi-cadence">${esc.cadence}</div>
        <div class="kpi-label">Escalation Rate</div>
        <div class="kpi-value">${fmtPct(esc.value)}</div>
        <div class="kpi-target">Target: ${fmtPct(esc.target)}</div>
      </div>`;
  },

  // ── Ticket Volume Chart (Stacked Bar) ──
  _buildVolumeChart(el, tv) {
    const ctx = el.querySelector('#support-volume-chart').getContext('2d');
    const labels = tv.trend_labels;
    const totals = tv.trend;

    // Proportional split based on current month ratio
    const extRatio = tv.by_type[0].count / tv.value;
    const intRatio = tv.by_type[1].count / tv.value;
    const extData = totals.map(t => Math.round(t * extRatio));
    const intData = totals.map(t => Math.round(t * intRatio));

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'External (Salesforce)',
            data: extData,
            backgroundColor: CHART_COLORS.teal,
            borderRadius: 4
          },
          {
            label: 'Internal (JIRA)',
            data: intData,
            backgroundColor: CHART_COLORS.cyan,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── Resolution Time Table ──
  _buildResolutionTable(el, art) {
    const tbody = el.querySelector('#support-resolution-tbody');
    tbody.innerHTML = art.by_priority.map(p => {
      const ratio = p.hours / p.target;
      const status = ratio <= 1.0 ? 'green' : ratio <= 1.2 ? 'yellow' : 'red';
      return `<tr>
        <td>${p.priority}</td>
        <td class="col-right">${p.hours.toFixed(1)}</td>
        <td class="col-right">${p.target.toFixed(1)}</td>
        <td class="col-center"><span class="badge badge--${status}">${status}</span></td>
      </tr>`;
    }).join('');
  },

  // ── FCR Trend Chart ──
  _buildFCRChart(el, fcr) {
    const ctx = el.querySelector('#support-fcr-chart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: fcr.trend_labels,
        datasets: [
          {
            label: 'FCR %',
            data: fcr.trend,
            borderColor: CHART_COLORS.statusGreen,
            backgroundColor: 'rgba(76,175,80,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: CHART_COLORS.statusGreen
          },
          {
            label: 'Target (75%)',
            data: fcr.trend_labels.map(() => fcr.target),
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
          y: { min: 40, max: 90, ticks: { callback: v => v + '%' } }
        },
        plugins: {
          legend: { labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: tip => ` ${tip.dataset.label}: ${tip.raw}%` } }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── Escalation Rate Chart ──
  _buildEscalationChart(el, esc) {
    const ctx = el.querySelector('#support-escalation-chart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: esc.trend_labels,
        datasets: [
          {
            label: 'Escalation %',
            data: esc.trend,
            borderColor: CHART_COLORS.orange,
            backgroundColor: 'rgba(245,124,0,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: CHART_COLORS.orange
          },
          {
            label: 'Target (6%)',
            data: esc.trend_labels.map(() => esc.target),
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
          y: { min: 0, max: 16, ticks: { callback: v => v + '%' } }
        },
        plugins: {
          legend: { labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: tip => ` ${tip.dataset.label}: ${tip.raw}%` } }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── Efficiency Grid ──
  _buildEfficiencyGrid(el, k) {
    const grid = el.querySelector('#support-efficiency-grid');
    const scpc = k.support_cost_per_customer;
    const rpe = k.revenue_per_employee;

    const _badge2 = (kpi) => {
      if (!kpi?._catalog && !kpi?._dataSource) return '';
      const b = CIC.catalog.dataSourceBadge(kpi);
      return `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
    };

    grid.innerHTML = `
      <div class="kpi-card kpi-card--${scpc.status}" data-drilldown="support_cost_per_customer" data-unit="currency">
        ${_badge2(scpc)}
        <div class="kpi-cadence">${scpc.cadence}</div>
        <div class="kpi-label">${scpc.label}</div>
        <div class="kpi-value">$${scpc.value.toFixed(2)}</div>
        <div class="kpi-target">Target: $${scpc.target.toFixed(2)}</div>
      </div>
      <div class="kpi-card kpi-card--${rpe.status}" data-drilldown="revenue_per_employee" data-unit="count">
        ${_badge2(rpe)}
        <div class="kpi-cadence">${rpe.cadence}</div>
        <div class="kpi-label">${rpe.label}</div>
        <div class="kpi-value">${fmt$(rpe.value)}</div>
        <div class="kpi-target">Target: ${fmt$(rpe.target)}</div>
      </div>`;
  },

  // ── Pending Implementation (CES) ──
  _buildPendingGrid(el, ces) {
    const grid = el.querySelector('#support-pending-grid');
    const _badge3 = (kpi) => {
      if (!kpi?._catalog && !kpi?._dataSource) return '';
      const b = CIC.catalog.dataSourceBadge(kpi);
      return `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
    };

    grid.innerHTML = `
      <div class="kpi-card kpi-card--grey" data-drilldown="ces">
        ${_badge3(ces)}
        <div class="kpi-cadence">${ces.cadence}</div>
        <div class="kpi-label">${ces.label}</div>
        <div class="kpi-value">—</div>
        <span class="badge badge--grey">Planned</span>
        <div class="not-measurable">${ces.note}</div>
      </div>`;
  },

  _wireClickHandlers(containerEl, data) {
    const k = data.kpis;
    containerEl.querySelectorAll('.kpi-card[data-drilldown]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.kpi-card__edit-btn')) return;
        if (card.classList.contains('editing')) return;
        const key = card.dataset.drilldown;
        const kpi = k[key];
        if (!kpi) return;
        const cat = kpi._catalog;
        Drilldown.open({
          title:       kpi.label,
          definition:  cat?.definition || kpi.definition || '',
          value:       kpi.value,
          target:      kpi.target,
          unit:        kpi.unit || 'count',
          status:      kpi.status,
          trend:       kpi.trend,
          trendLabels: kpi.trend_labels,
          ytd:         kpi.ytd,
          ytdTarget:   kpi.ytd_target,
          okr:         cat?.key_result_raw || kpi.okr,
          cadence:     cat?.cadence || kpi.cadence,
          dataSource:  cat?.data_source_raw || data.meta?.data_source?.join(', '),
          accountable: cat?.accountable || data.meta?.accountable,
          note:        cat?.notes || kpi.note,
          measurability: cat ? CIC.catalog.measurabilityBadge(cat) : null,
          dataSourceBadge: kpi._dataSource ? CIC.catalog.dataSourceBadge(kpi) : null,
          breakdown:   this._getBreakdown(key, kpi),
          breakdownTitle: this._getBreakdownTitle(key)
        });
      });
    });
  },

  _getBreakdown(key, kpi) {
    if (key === 'avg_resolution_time') {
      return this._data?.kpis?.avg_resolution_time?.by_priority?.map(p => ({
        label: p.priority, value: p.hours, target: p.target
      })) || null;
    }
    if (key === 'ticket_volume') {
      return this._data?.kpis?.ticket_volume?.by_type?.map(t => ({
        label: t.type, value: t.count
      })) || null;
    }
    return null;
  },

  _getBreakdownTitle(key) {
    if (key === 'avg_resolution_time') return 'Resolution by Priority';
    if (key === 'ticket_volume') return 'Tickets by Type';
    return 'Breakdown';
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
  },

  getSummaryKPIs() {
    return [
      { label: 'Ticket Volume', value: '284', delta: '▼9%', status: 'green' },
      { label: 'FCR Rate', value: '62.4%', delta: '▲2.2pp', status: 'yellow' },
      { label: 'Escalation Rate', value: '8.4%', delta: '▼0.8pp', status: 'yellow' }
    ];
  }
};
