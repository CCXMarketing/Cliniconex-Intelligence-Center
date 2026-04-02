import { Drilldown, wireEditableCards } from './drilldown.js';

export default {
  charts: [],

  async init(containerEl, data) {
    this._data = data;
    this._renderKPICards(containerEl, data);
    this._renderSegmentChart(data);
    this._renderHIROChart(data);
    this._renderCampaignTable(data);

    this._initROASCalculator(containerEl, data);

    CIC.onScenarioChange(() => this._renderKPICards(containerEl, data));
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
  },

  getSummaryKPIs() {
    if (!this._data) return [];
    const k = this._data.kpis;
    return [
      {
        label: 'MQLs Created',
        value: k.marketing_created_deals.value.toString(),
        delta: this._calcDelta(k.marketing_created_deals.trend),
        status: k.marketing_created_deals.status
      },
      {
        label: 'HIRO Conversion',
        value: CIC.formatPercent(k.hiro_conversion_rate.value),
        delta: this._calcDelta(k.hiro_conversion_rate.trend),
        status: k.hiro_conversion_rate.status
      },
      {
        label: 'Pipeline Generated',
        value: CIC.formatCurrency(k.pipeline_generated.value),
        delta: this._calcDelta(k.pipeline_generated.trend),
        status: k.pipeline_generated.status
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

  _renderKPICards(containerEl, data) {
    const grid = containerEl.querySelector('#mkt-kpi-grid');
    if (!grid) return;
    const k = data.kpis;

    const cards = [
      { key: 'marketing_created_deals', label: k.marketing_created_deals.label, value: k.marketing_created_deals.value, target: k.marketing_created_deals.target, unit: 'count', status: k.marketing_created_deals.status, cadence: k.marketing_created_deals.cadence, trend: k.marketing_created_deals.trend },
      { key: 'marketing_captured_deals', label: k.marketing_captured_deals.label, value: k.marketing_captured_deals.value, target: k.marketing_captured_deals.target, unit: 'count', status: k.marketing_captured_deals.status, cadence: k.marketing_captured_deals.cadence, trend: k.marketing_captured_deals.trend },
      { key: 'hiro_conversion_rate', label: k.hiro_conversion_rate.label, value: k.hiro_conversion_rate.value, target: k.hiro_conversion_rate.target, unit: 'percent', status: k.hiro_conversion_rate.status, cadence: k.hiro_conversion_rate.cadence, trend: k.hiro_conversion_rate.trend },
      { key: 'pipeline_generated', label: k.pipeline_generated.label, value: k.pipeline_generated.value, target: k.pipeline_generated.target, unit: 'currency', status: k.pipeline_generated.status, cadence: k.pipeline_generated.cadence, trend: k.pipeline_generated.trend },
      { key: 'roas', label: k.roas.label, value: k.roas.value, target: k.roas.target, unit: 'multiplier', status: k.roas.status, cadence: k.roas.cadence, trend: k.roas.trend },
      { key: 'direct_channel_pipeline_pct', label: k.direct_channel_pipeline_pct.label, value: k.direct_channel_pipeline_pct.value, target: k.direct_channel_pipeline_pct.target, unit: 'percent', status: k.direct_channel_pipeline_pct.status, cadence: k.direct_channel_pipeline_pct.cadence, trend: k.direct_channel_pipeline_pct.trend }
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
    if (key === 'pipeline_by_segment' || key === 'pipeline_generated') {
      return this._data?.kpis?.pipeline_by_segment?.segments?.map(s => ({
        label: s.name, value: s.value, target: s.target
      })) || null;
    }
    return null;
  },

  _getBreakdownTitle(key) {
    if (key === 'pipeline_by_segment' || key === 'pipeline_generated') return 'Pipeline by Segment';
    return 'Breakdown';
  },

  _initROASCalculator(containerEl, data) {
    const roasCard = containerEl.querySelector('[data-drilldown="roas"]');
    if (!roasCard) return;

    const editBtn = document.createElement('button');
    editBtn.className = 'kpi-card__edit-btn';
    editBtn.textContent = '\u270E';
    editBtn.title = 'Open ROAS Calculator';
    roasCard.appendChild(editBtn);

    editBtn.addEventListener('click', async e => {
      e.stopPropagation();

      const existing = document.getElementById('roas-calc-panel');
      if (existing) { existing.remove(); return; }

      const ltv   = 29000;
      const spend = 18500;
      const cust  = data.kpis.marketing_created_deals?.value || 142;

      const calc = document.createElement('div');
      calc.className = 'roas-calculator';
      calc.id = 'roas-calc-panel';
      calc.innerHTML = `
        <div class="roas-calc-title">ROAS Calculator</div>
        <div class="roas-calc-grid">
          <div class="roas-calc-field">
            <label>LTV (Lifetime Value)</label>
            <div class="roas-calc-input-wrap">
              <span class="roas-calc-prefix">$</span>
              <input type="number" id="roas-ltv" value="${ltv}" step="500">
            </div>
            <div class="roas-calc-hint">Config value — update quarterly</div>
          </div>
          <div class="roas-calc-field">
            <label>Total Ad Spend (Month)</label>
            <div class="roas-calc-input-wrap">
              <span class="roas-calc-prefix">$</span>
              <input type="number" id="roas-spend" value="${spend}" step="100">
            </div>
            <div class="roas-calc-hint">Monthly marketing spend</div>
          </div>
          <div class="roas-calc-field">
            <label>New Customers Acquired</label>
            <div class="roas-calc-input-wrap">
              <span class="roas-calc-prefix">#</span>
              <input type="number" id="roas-customers" value="${cust}" step="1">
            </div>
            <div class="roas-calc-hint">Phase 2: auto-filled from ActiveCampaign</div>
          </div>
        </div>
        <div class="roas-calc-result">
          <div class="roas-calc-result-item">
            <div class="roas-calc-result-label">CAC</div>
            <div class="roas-calc-result-value" id="roas-cac-out">\u2014</div>
          </div>
          <div class="roas-calc-result-divider"></div>
          <div class="roas-calc-result-item roas-calc-result-item--main">
            <div class="roas-calc-result-label">ROAS</div>
            <div class="roas-calc-result-value" id="roas-out">\u2014</div>
          </div>
        </div>
        <div class="roas-calc-actions">
          <button class="kpi-card__save-btn" id="roas-save-btn">Save and Update Card</button>
          <button class="kpi-card__cancel-btn" id="roas-cancel-btn">Cancel</button>
        </div>`;

      roasCard.parentNode.insertBefore(calc, roasCard.nextSibling);

      const recalc = () => {
        const l = parseFloat(document.getElementById('roas-ltv').value) || 0;
        const s = parseFloat(document.getElementById('roas-spend').value) || 0;
        const c = parseFloat(document.getElementById('roas-customers').value) || 1;
        const cac  = s / c;
        const roas = cac > 0 ? l / cac : 0;
        document.getElementById('roas-cac-out').textContent = CIC.formatCurrency(cac);
        const roasEl = document.getElementById('roas-out');
        roasEl.textContent = roas.toFixed(2) + 'x';
        roasEl.style.color = roas >= 4.0 ? '#ADC837' : roas >= 2.5 ? '#FFC107' : '#E53935';
      };
      recalc();
      calc.querySelectorAll('input').forEach(i => i.addEventListener('input', recalc));

      document.getElementById('roas-save-btn').addEventListener('click', async () => {
        const l = parseFloat(document.getElementById('roas-ltv').value);
        const s = parseFloat(document.getElementById('roas-spend').value);
        const c = parseFloat(document.getElementById('roas-customers').value) || 1;
        const cac  = s / c;
        const roas = cac > 0 ? l / cac : 0;
        await CIC.setData('marketing', 'ltv', l);
        await CIC.setData('marketing', 'ad_spend_total', s);
        await CIC.setData('marketing', 'customers_acquired', c);
        const roasValueEl = roasCard.querySelector('.kpi-value');
        if (roasValueEl) roasValueEl.textContent = roas.toFixed(2) + 'x';
        const roasTargetEl = roasCard.querySelector('.kpi-target');
        if (roasTargetEl) roasTargetEl.textContent = `CAC: ${CIC.formatCurrency(cac)} \u00B7 Target: 4.0x`;
        calc.remove();
      });

      document.getElementById('roas-cancel-btn').addEventListener('click', () => calc.remove());
    });
  },

  _renderSegmentChart(data) {
    const canvas = document.getElementById('mkt-segment-chart');
    if (!canvas) return;
    const segments = data.kpis.pipeline_by_segment.segments;

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: segments.map(s => s.name),
        datasets: [
          {
            label: 'Actual',
            data: segments.map(s => s.value),
            backgroundColor: '#ADC837',
            borderRadius: 4
          },
          {
            label: 'Target',
            data: segments.map(s => s.target),
            backgroundColor: 'rgba(2, 71, 90, 0.2)',
            borderRadius: 4
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

  _renderHIROChart(data) {
    const canvas = document.getElementById('mkt-hiro-chart');
    if (!canvas) return;
    const kpi = data.kpis.hiro_conversion_rate;

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: kpi.trend_labels,
        datasets: [
          {
            label: 'HIRO Conversion %',
            data: kpi.trend,
            borderColor: '#ADC837',
            backgroundColor: 'rgba(173, 200, 55, 0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#ADC837',
            pointRadius: 5
          },
          {
            label: 'Target (30%)',
            data: kpi.trend.map(() => kpi.target),
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
          legend: { position: 'top', labels: { font: { family: 'Nunito Sans', size: 12 } } }
        },
        scales: {
          y: { min: 15, max: 35, ticks: { callback: v => v + '%', font: { family: 'Nunito Sans', size: 11 } } },
          x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
        }
      }
    });
    this.charts.push(chart);
  },

  _renderCampaignTable(data) {
    const tbody = document.getElementById('mkt-campaign-tbody');
    if (!tbody) return;
    const campaigns = data.kpis.campaign_roi.campaigns;

    tbody.innerHTML = campaigns.map(c => `
      <tr>
        <td>${c.name}</td>
        <td class="col-right">${CIC.formatCurrency(c.spend)}</td>
        <td class="col-right">${CIC.formatCurrency(c.attributed_revenue)}</td>
        <td class="col-right"><strong>${c.roi.toFixed(2)}x</strong></td>
        <td class="col-center"><span class="badge badge--${c.status}">${c.status}</span></td>
      </tr>
    `).join('');
  }
};
