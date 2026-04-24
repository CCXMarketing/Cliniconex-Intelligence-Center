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
    this._renderProductBreakdown(containerEl, data);
    this._wirePipelineSelector(containerEl, data);

    CIC.onScenarioChange((scenario) => {
      this._renderMRRTracker(containerEl, data);
      this._renderKPICards(containerEl, data);
      this._refreshScenarioTargets(containerEl, data, scenario);

      const oppCard = containerEl.querySelector('[data-drilldown="opportunities_created"]');
      if (oppCard) {
        const target = data.kpis.opportunities_created.targets[scenario];
        const targetEl = oppCard.querySelector('.kpi-target');
        if (targetEl) targetEl.textContent = `Target: ${target?.toLocaleString() || '\u2014'}`;
      }
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
      { key: 'expansion_revenue', label: k.expansion_revenue.label, value: k.expansion_revenue.value, target: k.expansion_revenue.target, unit: 'currency', status: k.expansion_revenue.status, cadence: k.expansion_revenue.cadence, trend: k.expansion_revenue.trend, _catalog: k.expansion_revenue._catalog, _kpi: k.expansion_revenue },
      { key: 'new_logo_revenue', label: k.new_logo_revenue.label, value: k.new_logo_revenue.value, target: k.new_logo_revenue.target, unit: 'currency', status: k.new_logo_revenue.status, cadence: k.new_logo_revenue.cadence, trend: k.new_logo_revenue.trend, _catalog: k.new_logo_revenue._catalog, _kpi: k.new_logo_revenue },
      { key: 'win_rate', label: k.win_rate.label, value: k.win_rate.value, target: k.win_rate.target, unit: 'percent', status: k.win_rate.status, cadence: k.win_rate.cadence, trend: k.win_rate.trend, _catalog: k.win_rate._catalog, _kpi: k.win_rate },
      { key: 'avg_deal_size_acv', label: k.avg_deal_size_acv.label, value: k.avg_deal_size_acv.value, target: k.avg_deal_size_acv.target, unit: 'currency', status: k.avg_deal_size_acv.status, cadence: k.avg_deal_size_acv.cadence, trend: k.avg_deal_size_acv.trend, _catalog: k.avg_deal_size_acv._catalog, _kpi: k.avg_deal_size_acv },
      { key: 'pipeline_coverage', label: k.pipeline_coverage.label, value: k.pipeline_coverage.value, target: k.pipeline_coverage.target, unit: 'multiplier', status: k.pipeline_coverage.status, cadence: k.pipeline_coverage.cadence, trend: k.pipeline_coverage.trend, _catalog: k.pipeline_coverage._catalog, _kpi: k.pipeline_coverage },
      { key: 'opportunities_created', label: k.opportunities_created.label, value: k.opportunities_created.value, target: oppsTarget, unit: 'count', status: k.opportunities_created.status, cadence: k.opportunities_created.cadence, trend: k.opportunities_created.trend, _catalog: k.opportunities_created._catalog, _kpi: k.opportunities_created }
    ];

    grid.innerHTML = cards.map(card => this._buildKPICard(card)).join('');
    this._wireClickHandlers(containerEl, data);
  },

  _buildKPICard({ key, label, value, target, unit, status, cadence, trend, _catalog, _kpi }) {
    const fmtVal = unit === 'currency' ? CIC.formatCurrency(value)
      : unit === 'percent' ? CIC.formatPercent(value)
      : unit === 'multiplier' ? value.toFixed(1) + ':1'
      : value.toLocaleString();

    const fmtTarget = unit === 'currency' ? CIC.formatCurrency(target)
      : unit === 'percent' ? CIC.formatPercent(target)
      : unit === 'multiplier' ? target.toFixed(1) + ':1'
      : target?.toLocaleString();

    let badgeHtml = '';
    if (_kpi || _catalog) {
      const badge = _kpi ? CIC.catalog.dataSourceBadge(_kpi) : CIC.catalog.measurabilityBadge(_catalog);
      badgeHtml = `<span class="kpi-badge ${badge.cssClass}">${badge.label}</span>`;
    }

    let deltaHtml = '';
    if (trend && trend.length >= 2) {
      const prev = trend[trend.length - 2];
      const curr = trend[trend.length - 1];
      const pct = ((curr - prev) / prev * 100).toFixed(1);
      const dir = pct >= 0 ? 'up' : 'down';
      deltaHtml = `<span class="kpi-delta kpi-delta--${dir}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month</span>`;
    }

    // Pipeline Coverage — enhanced display with context
    if (key === 'pipeline_coverage') {
      const pipelineVal = CIC.formatCurrency(Math.round(value * 10000) / 10);
      const quotaVal = CIC.formatCurrency(Math.round(value * 10000 / value) / 10);
      return `
        <div class="kpi-card kpi-card--${status}" data-drilldown="${key}">
          ${badgeHtml}
          <div class="kpi-cadence">${cadence}</div>
          <div class="kpi-label">Pipeline Coverage</div>
          <div class="kpi-value">${fmtVal}</div>
          ${deltaHtml}
          ${target != null ? `<div class="kpi-target">Target: ${fmtTarget} minimum</div>` : ''}
          <div class="kpi-note">
            ${value}x coverage means your open pipeline
            is ${value}x your remaining quota.
            Target is 3x minimum — below 3x signals risk of missing quota.
          </div>
        </div>`;
    }

    return `
      <div class="kpi-card kpi-card--${status}" data-drilldown="${key}">
        ${badgeHtml}
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

  _refreshScenarioTargets(containerEl, data, scenario) {
    const s = scenario || CIC.getScenario();

    // Update Opportunities Created target label
    const oppTargets = data.kpis.opportunities_created.targets;
    const oppTarget = oppTargets[s] || oppTargets.target;
    const oppCard = containerEl.querySelector('[data-drilldown="opportunities_created"]');
    if (oppCard) {
      const targetEl = oppCard.querySelector('.kpi-target');
      if (targetEl) targetEl.textContent = `Target: ${oppTarget.toLocaleString()}`;
      const status = data.kpis.opportunities_created.value >= oppTarget ? 'green' : 'yellow';
      oppCard.className = oppCard.className.replace(/kpi-card--\w+/, `kpi-card--${status}`);
    }
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
        onClick: (evt, elements) => {
          if (elements.length === 0) return;
          const idx = elements[0].index;
          const kpiKey = idx === 0 ? 'new_logo_revenue' : 'expansion_revenue';
          const kpi = k[kpiKey];
          if (!kpi) return;
          Drilldown.open({
            title:       kpi.label,
            definition:  kpi.definition || '',
            value:       kpi.value,
            target:      kpi.target,
            unit:        kpi.unit || 'currency',
            status:      kpi.status,
            trend:       kpi.trend,
            trendLabels: kpi.trend_labels,
            ytd:         kpi.ytd,
            ytdTarget:   kpi.ytd_target,
            okr:         kpi.okr,
            cadence:     kpi.cadence,
            dataSource:  data.meta?.data_source?.join(', '),
            accountable: data.meta?.accountable,
            note:        kpi.note
          });
        },
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

  // ── Expansion Revenue Product Breakdown ──

  _renderProductBreakdown(containerEl, data) {
    const products = data.kpis.expansion_revenue.products || [];
    const totalMRR = products.reduce((s, p) => s + p.mrr, 0);

    // Suite toggle wiring
    const toggle = containerEl.querySelector('#sales-suite-toggle');
    if (toggle) {
      toggle.addEventListener('click', e => {
        const btn = e.target.closest('button[data-suite]');
        if (!btn) return;
        toggle.querySelectorAll('button').forEach(b =>
          b.classList.remove('active-suite'));
        btn.classList.add('active-suite');
        this._renderProductTable(containerEl, products, btn.dataset.suite, totalMRR);
      });
    }

    this._renderProductTable(containerEl, products, 'all', totalMRR);
    this._renderSuiteChart(products, totalMRR);
    this._renderSuiteKPIs(containerEl, products, totalMRR);
  },

  _renderProductTable(containerEl, products, suiteFilter, totalMRR) {
    const tbody = containerEl.querySelector('#sales-products-tbody');
    if (!tbody) return;

    const filtered = suiteFilter === 'all'
      ? products
      : products.filter(p => p.suite === suiteFilter);

    tbody.innerHTML = filtered.map(p => {
      const pct = totalMRR > 0 ? ((p.mrr / totalMRR) * 100).toFixed(1) : 0;
      const trendDir = p.trend.length >= 2
        ? p.trend[p.trend.length - 1] >= p.trend[p.trend.length - 2]
          ? '▲' : '▼'
        : '—';
      const trendColor = trendDir === '▲' ? '#2E7D32' : '#C62828';

      return `<tr>
        <td><strong>${p.name}</strong></td>
        <td><span class="badge badge--${p.suite === 'ACM' ? 'teal' : 'blue'}">${p.suite}</span></td>
        <td class="col-right">${CIC.formatCurrency(p.mrr)}</td>
        <td class="col-right">${p.accounts}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-bar" style="width:120px;">
              <div class="progress-bar__fill" style="width:${pct}%"></div>
            </div>
            <span style="font-size:12px;font-weight:700;color:#404041">${pct}%</span>
          </div>
        </td>
        <td class="col-center" style="color:${trendColor};font-weight:700">${trendDir}</td>
        <td class="col-center">
          <span class="badge badge--${p.status}">${p.status.toUpperCase()}</span>
        </td>
      </tr>`;
    }).join('');
  },

  _renderSuiteChart(products, totalMRR) {
    const canvas = document.getElementById('sales-suite-chart');
    if (!canvas) return;

    const acmMRR = products.filter(p => p.suite === 'ACM').reduce((s, p) => s + p.mrr, 0);
    const acsMRR = products.filter(p => p.suite === 'ACS').reduce((s, p) => s + p.mrr, 0);

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['ACM Suite', 'ACS Suite'],
        datasets: [{
          data: [acmMRR, acsMRR],
          backgroundColor: ['#02475A', '#029FB5'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: 'Nunito Sans', size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${CIC.formatCurrency(ctx.raw)} (${((ctx.raw/totalMRR)*100).toFixed(1)}%)`
            }
          }
        }
      }
    });
    this.charts.push(chart);
  },

  _renderSuiteKPIs(containerEl, products, totalMRR) {
    const grid = containerEl.querySelector('#sales-suite-kpis');
    if (!grid) return;

    const suites = [
      { name: 'ACM Suite', key: 'ACM', color: '#02475A' },
      { name: 'ACS Suite', key: 'ACS', color: '#029FB5' }
    ];

    grid.innerHTML = suites.map(s => {
      const sProducts = products.filter(p => p.suite === s.key);
      const sMRR = sProducts.reduce((sum, p) => sum + p.mrr, 0);
      const sAccounts = sProducts.reduce((sum, p) => sum + p.accounts, 0);
      const pct = totalMRR > 0 ? ((sMRR / totalMRR) * 100).toFixed(1) : 0;
      return `
        <div class="kpi-card" style="border-left-color:${s.color}">
          <div class="kpi-label">${s.name}</div>
          <div class="kpi-value">${CIC.formatCurrency(sMRR)}</div>
          <div class="kpi-target">${sAccounts} accounts · ${pct}% of expansion MRR</div>
        </div>`;
    }).join('');
  },

  // ── Pipeline Selector ──

  _wirePipelineSelector(containerEl, data) {
    const toggle = containerEl.querySelector('#sales-pipeline-toggle');
    const note   = containerEl.querySelector('#sales-pipeline-note');
    if (!toggle) return;

    const pipelineNotes = {
      demand:        'Pipeline 1 — Marketing-generated leads through MQL/HIRO stages',
      opportunities: 'Pipeline 15 — Qualified opportunities through close'
    };

    toggle.addEventListener('click', e => {
      const btn = e.target.closest('.pipeline-btn');
      if (!btn) return;

      toggle.querySelectorAll('.pipeline-btn').forEach(b =>
        b.classList.remove('active'));
      btn.classList.add('active');

      const pipeline = btn.dataset.pipeline;
      if (note) note.textContent = pipelineNotes[pipeline] || '';

      // Phase 2: reload data for selected pipeline
      // Phase 1: show a banner indicating which pipeline is active
      this._showPipelineBanner(containerEl, pipeline);
    });
  },

  _showPipelineBanner(containerEl, pipeline) {
    const existing = containerEl.querySelector('.pipeline-active-banner');
    if (existing) existing.remove();

    if (pipeline === 'opportunities') {
      const banner = document.createElement('div');
      banner.className = 'pipeline-active-banner';
      banner.style.cssText = `
        background: #E0EEF2;
        border: 1px solid #02475A;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
        color: #02475A;
        font-family: 'Nunito Sans', sans-serif;
        margin-bottom: 16px;
      `;
      banner.innerHTML = `
        📊 <strong>Prospect Opportunities Pipeline (Pipeline 15)</strong> —
        Showing qualified opportunity data.
        <em>Phase 2: live Salesforce data will populate automatically.</em>`;

      const pipelineBar = containerEl.querySelector('#sales-pipeline-bar');
      if (pipelineBar) {
        pipelineBar.insertAdjacentElement('afterend', banner);
      }
    }
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
