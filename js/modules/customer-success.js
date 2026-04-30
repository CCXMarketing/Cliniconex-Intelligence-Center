import { Drilldown } from './drilldown.js';
import { wireKpiEdit } from './kpi-edit.js';
import { wireTargets } from './kpi-targets.js';
import { buildCard } from './kpi-card.js';

// ── Customer Success tab module ──

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
function fmtPct(n, d) { return CIC.formatPercent(n, d); }

export default {
  charts: [],
  _data: null,

  async init(containerEl, data) {
    this._data = data;
    const k = data.kpis;

    Chart.defaults.font.family = 'Nunito Sans';
    Chart.defaults.font.size = 12;

    this._buildRetentionGrid(containerEl, k);
    this._buildHealthDonut(containerEl, k.health_score_distribution, k.at_risk_account_value);
    this._buildHealthTrend(containerEl, k.health_score_distribution);
    this._buildAtRisk(containerEl, k.at_risk_account_value);
    this._buildChurnTable(containerEl, k.churn_rate_by_segment);
    this._buildChurnRevenueGrid(containerEl, k.churn_revenue);
    this._buildTTVChart(containerEl, k.time_to_value);
    this._buildAdditionalGrid(containerEl, k);

    // ── Missing spec cards ──
    this._renderSpecCards(containerEl, k);

    // ── Drilldown click handlers ──
    this._wireClickHandlers(containerEl, data);
    wireKpiEdit(containerEl, 'customer-success', data.kpis);

    const reRender = () => {
      this._buildRetentionGrid(containerEl, k);
      this._buildAdditionalGrid(containerEl, k);
      this._renderSpecCards(containerEl, k);
      this._wireClickHandlers(containerEl, data);
      wireKpiEdit(containerEl, 'customer-success', data.kpis);
      wireTargets(containerEl, 'customer-success', reRender);
    };
    wireTargets(containerEl, 'customer-success', reRender);
    CIC.onScenarioChange(reRender);
  },

  _renderSpecCards(el, k) {
    const grid = el.querySelector('#cs-additional-grid');
    if (!grid) return;
    // Append missing spec cards after existing cards
    let extra = '';
    // Health Score Distribution (summary)
    const hsd = k.health_score_distribution;
    if (hsd && !grid.querySelector('[data-drilldown="health_score_distribution"]')) {
      const greenPct = hsd.green || 0;
      extra += buildCard({ key: 'health_score_distribution', label: 'Health Score Distribution', value: greenPct, unit: 'percent', status: greenPct >= 70 ? 'green' : greenPct >= 50 ? 'yellow' : 'red', cadence: 'Monthly', source: 'Salesforce', module: 'customer-success' });
    }
    // Churn Rate by Segment (summary)
    const crs = k.churn_rate_by_segment;
    if (crs && !grid.querySelector('[data-drilldown="churn_rate_by_segment"]')) {
      const avgRate = crs.segments ? crs.segments.reduce((s, seg) => s + seg.rate, 0) / crs.segments.length : null;
      extra += buildCard({ key: 'churn_rate_by_segment', label: 'Churn Rate by Segment', value: avgRate, unit: 'percent', status: avgRate != null && avgRate <= 1 ? 'green' : 'yellow', cadence: 'Monthly', source: 'Salesforce', module: 'customer-success' });
    }
    // At-Risk Account Value
    const arv = k.at_risk_account_value;
    if (arv && !grid.querySelector('[data-drilldown="at_risk_account_value"]')) {
      extra += buildCard({ key: 'at_risk_account_value', label: 'At-Risk Account Value', value: arv.value, unit: 'currency', status: arv.status || 'red', cadence: 'Weekly', source: 'Salesforce', module: 'customer-success' });
    }
    if (extra) grid.insertAdjacentHTML('beforeend', extra);
  },

  // ── Retention Overview Grid ──
  _buildRetentionGrid(el, k) {
    const grid = el.querySelector('#cs-retention-grid');
    const grr = k.gross_retention_rate;
    const nrr = k.nrr;
    const churn = k.churn_revenue;
    const csat = k.csat;

    const _badge = (kpi) => {
      if (!kpi?._catalog && !kpi?._dataSource) return '';
      const b = CIC.catalog.dataSourceBadge(kpi);
      return `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
    };

    grid.innerHTML = `
      <div class="kpi-card kpi-card--${grr.status}" data-drilldown="gross_retention_rate">
        ${_badge(grr)}
        <div class="kpi-cadence">${grr.cadence}</div>
        <div class="kpi-label">${grr.label}</div>
        <div class="kpi-value">${fmtPct(grr.value)}</div>
        <div class="kpi-target">Target: ${fmtPct(grr.target)}</div>
        <div class="kpi-delta kpi-delta--up">+${(grr.trend[3] - grr.trend[2]).toFixed(1)}pp</div>
      </div>
      <div class="kpi-card kpi-card--${nrr.status}" data-drilldown="nrr">
        ${_badge(nrr)}
        <div class="kpi-cadence">${nrr.cadence}</div>
        <div class="kpi-label">${nrr.label}</div>
        <div class="kpi-value">${fmtPct(nrr.value)}</div>
        <div class="kpi-target">Target: ${fmtPct(nrr.target)}</div>
        <div class="kpi-delta kpi-delta--up">+${(nrr.trend[3] - nrr.trend[2]).toFixed(1)}pp</div>
      </div>
      <div class="kpi-card kpi-card--${churn.status}" data-drilldown="churn_revenue">
        ${_badge(churn)}
        <div class="kpi-cadence">${churn.cadence}</div>
        <div class="kpi-label">Churn Revenue MTD</div>
        <div class="kpi-value">${fmt$(churn.actual)}</div>
        <div class="kpi-target">Budget: ${fmt$(churn.budget)}</div>
        <div class="kpi-note">Under budget — on track</div>
      </div>
      <div class="kpi-card kpi-card--${csat.status}" data-drilldown="csat">
        ${_badge(csat)}
        <div class="kpi-cadence">${csat.cadence}</div>
        <div class="kpi-label">${csat.label}</div>
        <div class="kpi-value">${csat.value}/100</div>
        <div class="kpi-target">Target: ${csat.target}</div>
        <div class="kpi-delta kpi-delta--up">+${csat.trend[3] - csat.trend[2]}</div>
      </div>`;
  },

  // ── Health Donut ──
  _buildHealthDonut(el, hsd, arv) {
    const ctx = el.querySelector('#cs-health-donut').getContext('2d');
    const values = [hsd.green, hsd.yellow, hsd.red];
    const healthMeta = [
      { color: '#4CAF50', label: 'Green \u2014 Healthy' },
      { color: '#FFC107', label: 'Yellow \u2014 At Risk' },
      { color: '#F44336', label: 'Red \u2014 Critical' }
    ];

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Green', 'Yellow', 'Red'],
        datasets: [{
          data: values,
          backgroundColor: [CHART_COLORS.statusGreen, CHART_COLORS.statusYellow, CHART_COLORS.statusRed],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        cutout: '58%',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements.length === 0) return;
          const idx = elements[0].index;
          const trendKeys = ['green', 'yellow', 'red'];
          Drilldown.open({
            title:       healthMeta[idx].label,
            definition:  'Health score distribution segment',
            value:       values[idx],
            unit:        'percent',
            status:      trendKeys[idx],
            trend:       hsd.trend?.map(t => t[trendKeys[idx]]),
            trendLabels: hsd.trend?.map(t => t.month),
            cadence:     'Monthly',
            dataSource:  this._data?.meta?.data_source?.join(', '),
            accountable: this._data?.meta?.accountable,
            breakdown:   idx === 2 ? arv?.accounts?.map(a => ({ label: a.name, value: a.mrr })) : null,
            breakdownTitle: 'At-Risk Accounts'
          });
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: tip => ` ${tip.label}: ${tip.raw}%` } }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── Health Trend (Stacked Bar) ──
  _buildHealthTrend(el, hsd) {
    const ctx = el.querySelector('#cs-health-trend').getContext('2d');
    const labels = hsd.trend.map(t => t.month);

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Green',
            data: hsd.trend.map(t => t.green),
            backgroundColor: CHART_COLORS.statusGreen
          },
          {
            label: 'Yellow',
            data: hsd.trend.map(t => t.yellow),
            backgroundColor: CHART_COLORS.statusYellow
          },
          {
            label: 'Red',
            data: hsd.trend.map(t => t.red),
            backgroundColor: CHART_COLORS.statusRed
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: tip => ` ${tip.dataset.label}: ${tip.raw}%` } }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── At-Risk ──
  _buildAtRisk(el, arv) {
    el.querySelector('#cs-at-risk-value').textContent = fmt$(arv.value);

    const tbody = el.querySelector('#cs-at-risk-tbody');
    tbody.innerHTML = arv.accounts.map(a => `
      <tr>
        <td>${a.name}</td>
        <td>${a.segment}</td>
        <td class="col-right">${fmt$(a.mrr)}</td>
        <td>${a.risk_reason}</td>
        <td class="col-center"><span class="badge badge--red">${a.health}</span></td>
      </tr>`).join('');
  },

  // ── Churn Rate Table ──
  _buildChurnTable(el, crs) {
    const tbody = el.querySelector('#cs-churn-tbody');
    tbody.innerHTML = crs.segments.map(s => {
      return `<tr>
        <td>${s.name}</td>
        <td class="col-right">${s.rate.toFixed(2)}%</td>
        <td class="col-right">${s.target.toFixed(2)}%</td>
        <td class="col-center"><span class="badge badge--${s.status}">${s.status}</span></td>
      </tr>`;
    }).join('');
  },

  // ── Churn Revenue Grid ──
  _buildChurnRevenueGrid(el, cr) {
    const grid = el.querySelector('#cs-churn-revenue-grid');
    const mtdStatus = cr.actual <= cr.budget ? 'green' : 'red';
    const ytdStatus = cr.ytd_actual <= cr.ytd_budget ? 'green' : 'red';

    let segmentCards = '';
    if (cr.by_segment) {
      segmentCards = cr.by_segment.map(s => `
        <div class="kpi-card kpi-card--${s.status}">
          <div class="kpi-cadence">Monthly</div>
          <div class="kpi-label">${s.segment} Churn</div>
          <div class="kpi-value">${fmt$(s.actual)}</div>
          <div class="kpi-target">Budget: ${fmt$(s.budget)}</div>
        </div>`).join('');
    }

    grid.innerHTML = `
      <div class="kpi-card kpi-card--${mtdStatus}">
        <div class="kpi-cadence">Monthly</div>
        <div class="kpi-label">MTD Churn Actual</div>
        <div class="kpi-value">${fmt$(cr.actual)}</div>
        <div class="kpi-target">Budget: ${fmt$(cr.budget)}</div>
      </div>
      <div class="kpi-card kpi-card--${ytdStatus}">
        <div class="kpi-cadence">YTD</div>
        <div class="kpi-label">YTD Churn Actual</div>
        <div class="kpi-value">${fmt$(cr.ytd_actual)}</div>
        <div class="kpi-target">Budget: ${fmt$(cr.ytd_budget)}</div>
      </div>
      ${segmentCards}`;
  },

  // ── Time to Value Chart ──
  _buildTTVChart(el, ttv) {
    const ctx = el.querySelector('#cs-ttv-chart').getContext('2d');
    const target = ttv.target;

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ttv.trend_labels,
        datasets: [
          {
            label: 'Avg Days',
            data: ttv.trend,
            backgroundColor: ttv.trend.map(v => v <= target ? CHART_COLORS.statusGreen : v <= 35 ? CHART_COLORS.statusYellow : CHART_COLORS.statusRed),
            borderRadius: 4
          },
          {
            label: 'Target (28 days)',
            data: ttv.trend_labels.map(() => target),
            type: 'line',
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
          y: { beginAtZero: true, ticks: { callback: v => v + 'd' } }
        },
        plugins: {
          legend: { labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: tip => ` ${tip.dataset.label}: ${tip.raw} days` } }
        }
      }
    });
    this.charts.push(chart);
  },

  // ── Additional Grid ──
  _buildAdditionalGrid(el, k) {
    const grid = el.querySelector('#cs-additional-grid');
    const npa = k.new_product_adoption;
    const ref = k.referral_influenced_pct;
    const ttv = k.time_to_value;

    const _badge2 = (kpi) => {
      if (!kpi?._catalog && !kpi?._dataSource) return '';
      const b = CIC.catalog.dataSourceBadge(kpi);
      return `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
    };

    grid.innerHTML = `
      <div class="kpi-card kpi-card--${npa.status}" data-drilldown="new_product_adoption">
        ${_badge2(npa)}
        <div class="kpi-cadence">${npa.cadence}</div>
        <div class="kpi-label">${npa.label}</div>
        <div class="kpi-value">${fmtPct(npa.value)}</div>
        <div class="kpi-target">Target: ${fmtPct(npa.target)}</div>
        <div class="kpi-note">${npa.note}</div>
      </div>
      <div class="kpi-card kpi-card--${ref.status}" data-drilldown="referral_influenced_pct">
        ${_badge2(ref)}
        <div class="kpi-cadence">${ref.cadence}</div>
        <div class="kpi-label">${ref.label}</div>
        <div class="kpi-value">${fmtPct(ref.value)}</div>
        <div class="kpi-target">Target: ${fmtPct(ref.target)}</div>
        <div class="kpi-note">${ref.note}</div>
      </div>
      <div class="kpi-card kpi-card--${ttv.status}" data-drilldown="time_to_value">
        ${_badge2(ttv)}
        <div class="kpi-cadence">${ttv.cadence}</div>
        <div class="kpi-label">${ttv.label}</div>
        <div class="kpi-value">${ttv.value} days</div>
        <div class="kpi-target">Target: ${ttv.target} days</div>
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
          value:       kpi.value ?? kpi.actual,
          target:      kpi.target ?? kpi.budget,
          unit:        kpi.unit || 'percent',
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
    if (key === 'churn_rate_by_segment') {
      return this._data?.kpis?.churn_rate_by_segment?.segments?.map(s => ({
        label: s.name, value: s.rate, target: s.target
      })) || null;
    }
    if (key === 'at_risk_account_value') {
      return this._data?.kpis?.at_risk_account_value?.accounts?.map(a => ({
        label: a.name, value: a.mrr
      })) || null;
    }
    return null;
  },

  _getBreakdownTitle(key) {
    if (key === 'churn_rate_by_segment') return 'Churn by Segment';
    if (key === 'at_risk_account_value') return 'At-Risk Accounts';
    return 'Breakdown';
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
  },

  getSummaryKPIs() {
    return [
      { label: 'Gross Retention', value: '98.8%', delta: '+0.1pp', status: 'yellow' },
      { label: 'At-Risk MRR', value: '$62.4K', delta: '', status: 'yellow' },
      { label: 'NRR', value: '101.4%', delta: '+0.3pp', status: 'yellow' }
    ];
  }
};
