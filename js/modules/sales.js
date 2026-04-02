import { Drilldown } from './drilldown.js';

export default {
  charts: [],

  async init(containerEl, data) {
    this._data = data;
    this._containerEl = containerEl;

    this._renderMRRTracker(containerEl, data);
    this._renderKPICards(containerEl, data);
    this._renderQuotaTable(data);
    this._renderMixChart(data);
    this._renderMRRTrendChart(data);
    this._renderSegmentTable(data);
    this._renderCycleTable(data);
    this._renderAdjacentDeals(containerEl, data);

    CIC.onScenarioChange(() => {
      this._renderMRRTracker(containerEl, data);
      this._renderKPICards(containerEl, data);
    });
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
  },

  getSummaryKPIs() {
    if (!this._data) return [];
    const k = this._data.kpis;
    const reps = k.quota_attainment.reps;
    const avgAttainment = Math.round(reps.reduce((s, r) => s + r.attainment, 0) / reps.length);

    return [
      {
        label: 'New MRR Added',
        value: CIC.formatCurrency(k.new_mrr_added.value),
        delta: this._calcDelta(k.new_mrr_added.trend),
        status: k.new_mrr_added.status
      },
      {
        label: 'Win Rate',
        value: CIC.formatPercent(k.win_rate.value),
        delta: this._calcDelta(k.win_rate.trend),
        status: k.win_rate.status
      },
      {
        label: 'Quota Attainment',
        value: avgAttainment + '%',
        delta: '',
        status: avgAttainment >= 100 ? 'green' : avgAttainment >= 80 ? 'yellow' : 'red'
      }
    ];
  },

  _calcDelta(trend) {
    if (!trend || trend.length < 2) return '';
    const prev = trend[trend.length - 2];
    const curr = trend[trend.length - 1];
    const pct = ((curr - prev) / prev * 100).toFixed(1);
    return (pct >= 0 ? '▲' : '▼') + Math.abs(pct) + '%';
  },

  // ── MRR Target Tracker ──

  _renderMRRTracker(containerEl, data) {
    const tracker = containerEl.querySelector('#sales-mrr-tracker');
    if (!tracker) return;
    const mrr = data.kpis.new_mrr_added;
    const actual = mrr.value;
    const t = mrr.targets;
    const max = t.overachieve;
    const fillPct = Math.min((actual / max) * 100, 100);

    const markerPos = (val) => ((val / max) * 100).toFixed(1);

    tracker.innerHTML = `
      <div class="target-tracker__title">New MRR Added — ${CIC.formatCurrency(actual)}</div>
      <div class="target-tracker__bar-wrap">
        <div class="target-tracker__fill" style="width: ${fillPct.toFixed(1)}%;"></div>
        <div class="target-tracker__marker" style="left: ${markerPos(t.threshold)}%;">
          <span class="target-tracker__marker-label">Threshold<br>${CIC.formatCurrency(t.threshold)}</span>
        </div>
        <div class="target-tracker__marker" style="left: ${markerPos(t.target)}%;">
          <span class="target-tracker__marker-label">Target<br>${CIC.formatCurrency(t.target)}</span>
        </div>
        <div class="target-tracker__marker" style="left: ${markerPos(t.overachieve)}%;">
          <span class="target-tracker__marker-label">Overachieve<br>${CIC.formatCurrency(t.overachieve)}</span>
        </div>
      </div>
      <div class="target-tracker__values">
        <span>$0</span>
        <span>${CIC.formatCurrency(max)}</span>
      </div>`;
  },

  // ── KPI Cards ──

  _renderKPICards(containerEl, data) {
    const grid = containerEl.querySelector('#sales-kpi-grid');
    if (!grid) return;
    const k = data.kpis;
    const scenario = CIC.getScenario();
    const oppsTarget = k.opportunities_created.targets[scenario] || k.opportunities_created.targets.target;

    const cards = [
      { key: 'expansion_revenue', label: k.expansion_revenue.label, value: k.expansion_revenue.value, target: k.expansion_revenue.target, unit: 'currency', status: k.expansion_revenue.status, cadence: k.expansion_revenue.cadence, trend: k.expansion_revenue.trend },
      { key: 'new_logo_revenue', label: k.new_logo_revenue.label, value: k.new_logo_revenue.value, target: k.new_logo_revenue.target, unit: 'currency', status: k.new_logo_revenue.status, cadence: k.new_logo_revenue.cadence, trend: k.new_logo_revenue.trend },
      { key: 'win_rate', label: k.win_rate.label, value: k.win_rate.value, target: k.win_rate.target, unit: 'percent', status: k.win_rate.status, cadence: k.win_rate.cadence, trend: k.win_rate.trend },
      { key: 'avg_deal_size_acv', label: k.avg_deal_size_acv.label, value: k.avg_deal_size_acv.value, target: k.avg_deal_size_acv.target, unit: 'currency', status: k.avg_deal_size_acv.status, cadence: k.avg_deal_size_acv.cadence, trend: k.avg_deal_size_acv.trend },
      { key: 'pipeline_coverage', label: k.pipeline_coverage.label, value: k.pipeline_coverage.value, target: k.pipeline_coverage.target, unit: 'multiplier', status: k.pipeline_coverage.status, cadence: k.pipeline_coverage.cadence, trend: k.pipeline_coverage.trend },
      { key: 'opportunities_created', label: k.opportunities_created.label, value: k.opportunities_created.value, target: oppsTarget, unit: 'count', status: k.opportunities_created.status, cadence: k.opportunities_created.cadence, trend: k.opportunities_created.trend }
    ];

    grid.innerHTML = cards.map(card => this._buildKPICard(card)).join('');
    this._wireClickHandlers(containerEl, data);
  },

  _buildKPICard({ key, label, value, target, unit, status, cadence, trend }) {
    const fmtVal = unit === 'currency' ? CIC.formatCurrency(value)
      : unit === 'percent' ? CIC.formatPercent(value)
      : unit === 'multiplier' ? value.toFixed(1) + 'x'
      : value.toLocaleString();

    const fmtTarget = unit === 'currency' ? CIC.formatCurrency(target)
      : unit === 'percent' ? CIC.formatPercent(target)
      : unit === 'multiplier' ? target.toFixed(1) + 'x'
      : target?.toLocaleString();

    let deltaHtml = '';
    if (trend && trend.length >= 2) {
      const prev = trend[trend.length - 2];
      const curr = trend[trend.length - 1];
      const pct = ((curr - prev) / prev * 100).toFixed(1);
      const dir = pct >= 0 ? 'up' : 'down';
      deltaHtml = `<span class="kpi-delta kpi-delta--${dir}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month</span>`;
    }

    return `
      <div class="kpi-card kpi-card--${status}" data-drilldown="${key}">
        <div class="kpi-cadence">${cadence}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${fmtVal}</div>
        ${deltaHtml}
        ${target != null ? `<div class="kpi-target">Target: ${fmtTarget}</div>` : ''}
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
    if (key === 'quota_attainment') {
      return this._data?.kpis?.quota_attainment?.reps?.map(r => ({
        label: r.name, value: r.actual, target: r.quota
      })) || null;
    }
    if (key === 'new_segment_bookings') {
      return this._data?.kpis?.new_segment_bookings?.segments?.map(s => ({
        label: s.name, value: s.value, target: s.target
      })) || null;
    }
    return null;
  },

  _getBreakdownTitle(key) {
    if (key === 'quota_attainment') return 'Rep Attainment';
    if (key === 'new_segment_bookings') return 'Segment Bookings';
    return 'Breakdown';
  },

  // ── Quota Attainment Table ──

  _renderQuotaTable(data) {
    const tbody = document.getElementById('sales-quota-tbody');
    if (!tbody) return;
    const reps = data.kpis.quota_attainment.reps;

    tbody.innerHTML = reps.map(r => {
      const barColor = r.attainment >= 100 ? 'green' : r.attainment >= 80 ? 'yellow' : 'red';
      const barWidth = Math.min(r.attainment, 120);
      return `
        <tr>
          <td>${r.name}</td>
          <td class="col-right">${CIC.formatCurrency(r.quota)}</td>
          <td class="col-right">${CIC.formatCurrency(r.actual)}</td>
          <td>
            <div class="progress-labeled">
              <div class="progress-labeled__header">
                <span class="progress-labeled__value">${r.attainment}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-bar__fill progress-bar__fill--${barColor}" style="width: ${barWidth}%;"></div>
              </div>
            </div>
          </td>
          <td class="col-center"><span class="badge badge--${r.status}">${r.status}</span></td>
        </tr>`;
    }).join('');
  },

  // ── Revenue Mix Donut Chart ──

  _renderMixChart(data) {
    const canvas = document.getElementById('sales-mix-chart');
    if (!canvas) return;
    const k = data.kpis;

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['New Logo', 'Expansion'],
        datasets: [{
          data: [k.new_logo_revenue.value, k.expansion_revenue.value],
          backgroundColor: ['#ADC837', '#02475A'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Nunito Sans', size: 12 } } },
          tooltip: {
            callbacks: { label: ctx => ctx.label + ': ' + CIC.formatCurrency(ctx.raw) }
          }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── New MRR Trend Line Chart ──

  _renderMRRTrendChart(data) {
    const canvas = document.getElementById('sales-mrr-trend-chart');
    if (!canvas) return;
    const mrr = data.kpis.new_mrr_added;
    const scenario = CIC.getScenario();
    const targetVal = mrr.targets[scenario] || mrr.targets.target;

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: mrr.trend_labels,
        datasets: [
          {
            label: 'New MRR Added',
            data: mrr.trend,
            borderColor: '#ADC837',
            backgroundColor: 'rgba(173, 200, 55, 0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#ADC837',
            pointRadius: 5
          },
          {
            label: 'Target',
            data: mrr.trend.map(() => targetVal),
            borderColor: '#E53935',
            borderDash: [6, 3],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Nunito Sans', size: 12 } } },
          tooltip: {
            callbacks: { label: ctx => ctx.dataset.label + ': ' + CIC.formatCurrency(ctx.raw) }
          }
        },
        scales: {
          y: { ticks: { callback: v => CIC.formatCurrency(v), font: { family: 'Nunito Sans', size: 11 } } },
          x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── New Segment Bookings Table ──

  _renderSegmentTable(data) {
    const tbody = document.getElementById('sales-segment-tbody');
    if (!tbody) return;
    const segments = data.kpis.new_segment_bookings.segments;

    tbody.innerHTML = segments.map(s => {
      const pct = Math.min((s.value / s.annual_target) * 100, 100).toFixed(1);
      const barColor = s.status === 'green' ? 'green' : s.status === 'yellow' ? 'yellow' : 'red';
      return `
        <tr>
          <td>${s.name}</td>
          <td class="col-right">${CIC.formatCurrency(s.value)}</td>
          <td class="col-right">${CIC.formatCurrency(s.target)}</td>
          <td class="col-right">${CIC.formatCurrency(s.annual_target)}</td>
          <td>
            <div class="progress-labeled">
              <div class="progress-labeled__header">
                <span class="progress-labeled__value">${pct}%</span>
              </div>
              <div class="progress-bar progress-bar--sm">
                <div class="progress-bar__fill progress-bar__fill--${barColor}" style="width: ${pct}%;"></div>
              </div>
            </div>
          </td>
          <td class="col-center"><span class="badge badge--${s.status}">${s.status}</span></td>
        </tr>`;
    }).join('');
  },

  // ── Sales Cycle Table ──

  _renderCycleTable(data) {
    const tbody = document.getElementById('sales-cycle-tbody');
    if (!tbody) return;
    const cycle = data.kpis.sales_cycle_length;
    const target = cycle.target;

    tbody.innerHTML = cycle.by_segment.map(s => {
      const color = s.days <= target ? 'text-green' : s.days <= target * 1.25 ? 'text-yellow' : 'text-red';
      return `
        <tr>
          <td>${s.segment}</td>
          <td class="col-right"><span class="${color} font-bold">${s.days} days</span></td>
          <td class="col-right">${target} days</td>
        </tr>`;
    }).join('');
  },

  // ── Adjacent Vertical Deals ──

  _renderAdjacentDeals(containerEl, data) {
    const adj = data.kpis.adjacent_vertical_deals;
    const valueEl = containerEl.querySelector('#sales-adj-value');
    if (valueEl) valueEl.textContent = adj.value;

    const wrap = containerEl.querySelector('#sales-adj-table-wrap');
    if (!wrap || !adj.deals || adj.deals.length === 0) {
      if (wrap) wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Vertical</th>
            <th class="col-right">MRR</th>
            <th class="col-center">Quarter</th>
            <th class="col-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${adj.deals.map(d => `
            <tr>
              <td>${d.vertical}</td>
              <td class="col-right">${CIC.formatCurrency(d.mrr)}</td>
              <td class="col-center">${d.quarter}</td>
              <td class="col-center"><span class="badge badge--green">${d.status}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
};
