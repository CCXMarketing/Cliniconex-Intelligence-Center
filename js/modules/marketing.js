import { Drilldown, wireEditableCards } from './drilldown.js';
import { renderInlineEntry } from './datepicker.js';

export default {
  charts: [],

  async init(containerEl, data) {
    // Try to get live data — fall back to passed-in mock data
    let liveData = data;
    try {
      const { getMarketingData } = await import('../data/mock-marketing.js');
      liveData = await getMarketingData();
      console.log('[Marketing] Data source:', liveData._live ? 'LIVE (AC)' : 'Mock');
    } catch (err) {
      console.warn('[Marketing] Could not load live data:', err.message);
    }

    this._data = liveData;

    // Show live data indicator if using real data
    if (liveData._live) {
      this._showLiveIndicator(containerEl, liveData._fetched_at);
    }

    // Show errors if any data failed to load
    if (liveData._errors?.length > 0) {
      this._showDataWarning(containerEl, liveData._errors);
    }

    this._renderKPICards(containerEl, liveData);
    this._renderSegmentChart(liveData);
    this._renderCampaignTable(liveData);
    this._renderACFunnel(containerEl, liveData);
    this._renderGoogleAds(containerEl, liveData);
    this._renderGoogleAnalytics(containerEl, liveData);
    this._renderSearchConsole(containerEl, liveData);

    this._initROASCalculator(containerEl, liveData);

    CIC.onScenarioChange(() => this._renderKPICards(containerEl, liveData));

    await renderInlineEntry(containerEl, {
      id: 'mkt-spend',
      title: 'Google Ads Spend Inputs — affects ROAS calculation',
      department: 'marketing',
      insertAfterSelector: '#mkt-gads-tbody',
      fields: [
        { key: 'ltv',           label: 'LTV (Lifetime Value)',    type: 'number', placeholder: '29000', unit: 'currency' },
        { key: 'spend_paid_search', label: 'Paid Search Spend',  type: 'number', placeholder: '8000',  unit: 'currency' },
        { key: 'spend_paid_social', label: 'Paid Social Spend',  type: 'number', placeholder: '4000',  unit: 'currency' },
        { key: 'spend_content',     label: 'Content / SEO',      type: 'number', placeholder: '2000',  unit: 'currency' },
        { key: 'spend_events',      label: 'Events Spend',       type: 'number', placeholder: '1500',  unit: 'currency' }
      ]
    });
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
  },

  _showLiveIndicator(containerEl, fetchedAt) {
    const existing = containerEl.querySelector('.live-data-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.className = 'live-data-badge';
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: #E8F5E9;
      color: #2E7D32;
      border: 1px solid #A5D6A7;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      font-family: 'Nunito Sans', sans-serif;
      margin-bottom: 16px;
    `;
    const time = new Date(fetchedAt).toLocaleTimeString('en-CA', {
      hour: '2-digit', minute: '2-digit'
    });
    badge.innerHTML = `
      <span style="width:6px;height:6px;border-radius:50%;
        background:#4CAF50;display:inline-block;
        animation: pulse 2s infinite;"></span>
      Live data from ActiveCampaign \u2014 updated ${time}
      <style>
        @keyframes pulse {
          0%,100%{opacity:1} 50%{opacity:0.4}
        }
      </style>`;

    const deptHeader = containerEl.querySelector('.dept-header');
    if (deptHeader) deptHeader.insertAdjacentElement('afterend', badge);
  },

  _showDataWarning(containerEl, errors) {
    const warning = document.createElement('div');
    warning.style.cssText = `
      background: #FFF8E1;
      border: 1px solid #FFE082;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 12px;
      color: #F57F17;
      font-weight: 600;
      font-family: 'Nunito Sans', sans-serif;
      margin-bottom: 12px;
    `;
    warning.innerHTML = '\u26A0 Some live data unavailable \u2014 showing mock data for: ' +
      errors.join(', ');

    const badge = containerEl.querySelector('.live-data-badge');
    const anchor = badge || containerEl.querySelector('.dept-header');
    if (anchor) anchor.insertAdjacentElement('afterend', warning);
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
      : unit === 'ratio' ? Math.round(value) + ':1'
      : unit === 'multiplier' ? value.toFixed(1) + ':1'
      : value.toLocaleString();

    const fmtTarget = unit === 'currency' ? CIC.formatCurrency(target)
      : unit === 'percent' ? CIC.formatPercent(target)
      : unit === 'ratio' ? Math.round(target) + ':1'
      : unit === 'multiplier' ? target.toFixed(1) + ':1'
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
        roasEl.textContent = Math.round(roas) + ':1';
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
        if (roasValueEl) roasValueEl.textContent = Math.round(roas) + ':1';
        const roasTargetEl = roasCard.querySelector('.kpi-target');
        if (roasTargetEl) roasTargetEl.textContent = `CAC: ${CIC.formatCurrency(cac)} \u00B7 Target: 4:1`;
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

  _renderACFunnel(containerEl, data) {
    const funnel = data.kpis.ac_demand_funnel;
    if (!funnel) return;

    // Inject comparison toggle bar before #mkt-funnel-stages
    const stagesEl = containerEl.querySelector('#mkt-funnel-stages');
    if (stagesEl) {
      const compareBar = document.createElement('div');
      compareBar.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;
          padding-bottom:14px;border-bottom:1px solid #E1E6EF;margin-bottom:16px;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;
            letter-spacing:0.06em;color:#9E9E9E;font-family:'Nunito Sans',sans-serif;
            white-space:nowrap;">Compare to</span>
          <div class="dd-compare-toggle" id="funnel-compare-toggle">
            <button class="dd-compare-btn" data-period="last-month">Last Month</button>
            <button class="dd-compare-btn" data-period="last-year">Last Year</button>
            <button class="dd-compare-btn" data-period="custom">Custom</button>
          </div>
          <div id="funnel-custom-picker" style="display:none;align-items:center;gap:6px;">
            <select id="funnel-custom-month" class="dd-inline-select">
              <option value="0">Jan</option>
              <option value="1" selected>Feb</option>
              <option value="2">Mar</option>
              <option value="3">Apr</option>
              <option value="4">May</option>
              <option value="5">Jun</option>
              <option value="6">Jul</option>
              <option value="7">Aug</option>
              <option value="8">Sep</option>
              <option value="9">Oct</option>
              <option value="10">Nov</option>
              <option value="11">Dec</option>
            </select>
            <select id="funnel-custom-year" class="dd-inline-select">
              <option value="2026">2026</option>
              <option value="2025" selected>2025</option>
              <option value="2024">2024</option>
            </select>
          </div>
          <button class="dd-compare-clear" id="funnel-compare-clear"
                  style="display:none">\u2715 Clear</button>
        </div>

        <!-- Comparison result row — shown when period selected -->
        <div id="funnel-compare-result" style="display:none;
          background:#E0EEF2;border-radius:8px;padding:12px 16px;
          margin-bottom:16px;font-family:'Nunito Sans',sans-serif;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;
            letter-spacing:0.06em;color:#02475A;margin-bottom:8px;">
            Comparison \u2014 HIRO Stage
          </div>
          <div style="display:flex;gap:24px;flex-wrap:wrap;">
            <div>
              <div style="font-size:10px;color:#9E9E9E;font-weight:700;
                text-transform:uppercase;">Current</div>
              <div style="font-size:20px;font-weight:800;color:#303030"
                   id="funnel-comp-current">\u2014</div>
            </div>
            <div>
              <div style="font-size:10px;color:#9E9E9E;font-weight:700;
                text-transform:uppercase;">Comparison</div>
              <div style="font-size:20px;font-weight:800;color:#303030"
                   id="funnel-comp-compare">\u2014</div>
            </div>
            <div>
              <div style="font-size:10px;color:#9E9E9E;font-weight:700;
                text-transform:uppercase;">Change</div>
              <div style="font-size:20px;font-weight:800"
                   id="funnel-comp-delta">\u2014</div>
            </div>
            <div>
              <div style="font-size:10px;color:#9E9E9E;font-weight:700;
                text-transform:uppercase;">Conversion Rate</div>
              <div style="font-size:20px;font-weight:800;color:#303030"
                   id="funnel-comp-rate">\u2014</div>
            </div>
          </div>
        </div>`;
      stagesEl.parentNode.insertBefore(compareBar, stagesEl);

      const maxCount = Math.max(...funnel.stages.map(s => s.count));
      stagesEl.innerHTML = funnel.stages.map((stage, i) => {
        const widthPct = Math.round((stage.count / maxCount) * 100);
        const convText = stage.conversion_from_prev != null
          ? `${stage.conversion_from_prev}% from previous`
          : 'Top of funnel';
        const isHIRO = stage.name === 'HIRO';
        const hiroStatus = isHIRO && stage.target_conversion
          ? stage.conversion_from_prev >= stage.target_conversion ? 'green' : 'red'
          : '';

        return `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:20px;height:20px;border-radius:50%;background:${stage.color};display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;">${i+1}</span>
                <strong style="font-family:'Nunito Sans',sans-serif;font-size:14px;color:#303030;">${stage.name}</strong>
                ${isHIRO && stage.target_conversion ? `<span class="badge badge--${hiroStatus}">Target: ${stage.target_conversion}%</span>` : ''}
              </div>
              <div style="text-align:right;">
                <span style="font-size:20px;font-weight:800;color:#303030;font-family:'Nunito Sans',sans-serif;">${stage.count.toLocaleString()}</span>
                <span style="font-size:12px;color:#9E9E9E;margin-left:8px;font-family:'Nunito Sans',sans-serif;">${convText}</span>
              </div>
            </div>
            <div style="background:#E1E6EF;border-radius:4px;height:12px;overflow:hidden;">
              <div style="width:${widthPct}%;height:100%;background:${stage.color};border-radius:4px;transition:width 0.6s ease;"></div>
            </div>
            ${i < funnel.stages.length - 1 ? `<div style="text-align:center;margin:4px 0;font-size:18px;color:#D2D5DA;">\u2193</div>` : ''}
          </div>`;
      }).join('');

      // Wire funnel comparison toggle
      const hiro = funnel.stages.find(s => s.name === 'HIRO');
      const hiroTrend = hiro?.trend || [];

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      let funnelCustomDate = new Date(2025, 1, 1); // default Feb 2025

      const showFunnelComparison = (period) => {
        const result = containerEl.querySelector('#funnel-compare-result');
        if (!result) return;

        const currentVal = hiroTrend[hiroTrend.length - 1];
        const currentConv = hiro?.conversion_from_prev || 0;

        let compVal, compConv, periodLabel;
        if (period === 'last-month') {
          compVal  = hiroTrend[hiroTrend.length - 2] || 0;
          compConv = (compVal / (funnel.stages[2]?.trend?.[hiroTrend.length - 2] || 1) * 100).toFixed(1);
          periodLabel = 'February 2026';
        } else if (period === 'last-year') {
          compVal  = Math.round(currentVal * 0.75);
          compConv = (currentConv * 0.85).toFixed(1);
          periodLabel = 'March 2025 (est.)';
        } else {
          compVal  = Math.round(currentVal * 0.8);
          compConv = (currentConv * 0.9).toFixed(1);
          periodLabel = funnelCustomDate
            ? monthNames[funnelCustomDate.getMonth()] + ' ' + funnelCustomDate.getFullYear() + ' (est.)'
            : 'Selected Period (est.)';
        }

        const delta = currentVal - compVal;
        const deltaColor = delta >= 0 ? '#2E7D32' : '#C62828';
        const arrow = delta >= 0 ? '\u25B2' : '\u25BC';

        document.getElementById('funnel-comp-current').textContent =
          `${currentVal} deals (${currentConv}%)`;
        document.getElementById('funnel-comp-compare').textContent =
          `${compVal} deals (${compConv}%)`;

        const deltaEl = document.getElementById('funnel-comp-delta');
        deltaEl.textContent = `${arrow} ${Math.abs(delta)} deals`;
        deltaEl.style.color = deltaColor;

        const convDelta = (currentConv - parseFloat(compConv)).toFixed(1);
        const convDeltaEl = document.getElementById('funnel-comp-rate');
        convDeltaEl.textContent = `${convDelta >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(convDelta)}pp`;
        convDeltaEl.style.color = convDelta >= 0 ? '#2E7D32' : '#C62828';

        result.style.display = 'block';

        // Add period label
        result.querySelector('div:first-child').textContent =
          `Comparison \u2014 HIRO Stage vs ${periodLabel}`;
      };

      const funnelToggle      = containerEl.querySelector('#funnel-compare-toggle');
      const funnelClear       = containerEl.querySelector('#funnel-compare-clear');
      const funnelCustomPicker = containerEl.querySelector('#funnel-custom-picker');
      const funnelMonthSel    = containerEl.querySelector('#funnel-custom-month');
      const funnelYearSel     = containerEl.querySelector('#funnel-custom-year');

      // Wire inline month/year selects for custom comparison
      const onFunnelCustomChange = () => {
        const month = parseInt(funnelMonthSel.value);
        const year  = parseInt(funnelYearSel.value);
        funnelCustomDate = new Date(year, month, 1);
        showFunnelComparison('custom');
      };
      if (funnelMonthSel) funnelMonthSel.addEventListener('change', onFunnelCustomChange);
      if (funnelYearSel)  funnelYearSel.addEventListener('change', onFunnelCustomChange);

      if (funnelToggle) {
        funnelToggle.addEventListener('click', e => {
          const btn = e.target.closest('.dd-compare-btn');
          if (!btn) return;
          const isActive = btn.classList.contains('active');
          funnelToggle.querySelectorAll('.dd-compare-btn')
            .forEach(b => b.classList.remove('active'));
          if (funnelCustomPicker) funnelCustomPicker.style.display = 'none';

          if (isActive) {
            containerEl.querySelector('#funnel-compare-result').style.display = 'none';
            funnelClear.style.display = 'none';
            return;
          }
          btn.classList.add('active');
          if (btn.dataset.period === 'custom') {
            if (funnelCustomPicker) funnelCustomPicker.style.display = 'inline-flex';
            onFunnelCustomChange();
          } else {
            showFunnelComparison(btn.dataset.period);
          }
          funnelClear.style.display = 'inline';
        });
      }

      if (funnelClear) {
        funnelClear.addEventListener('click', () => {
          funnelToggle?.querySelectorAll('.dd-compare-btn')
            .forEach(b => b.classList.remove('active'));
          containerEl.querySelector('#funnel-compare-result').style.display = 'none';
          if (funnelCustomPicker) funnelCustomPicker.style.display = 'none';
          funnelClear.style.display = 'none';
        });
      }
    }

    const kpiGrid = containerEl.querySelector('#mkt-funnel-kpis');
    if (kpiGrid) {
      const hiro = funnel.stages.find(s => s.name === 'HIRO');
      const hiroConv = hiro?.conversion_from_prev || 0;
      kpiGrid.innerHTML = `
        <div class="kpi-card kpi-card--${hiroConv >= 30 ? 'green' : 'yellow'}" data-drilldown="ac_demand_funnel">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">HIRO Conversion Rate</div>
          <div class="kpi-value">${hiroConv}%</div>
          <div class="kpi-target">Target: 30%</div>
        </div>
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Total Funnel Conversion</div>
          <div class="kpi-value">${funnel.total_funnel_conversion}%</div>
          <div class="kpi-target">Contact Created \u2192 HIRO</div>
        </div>
        <div class="kpi-card kpi-card--teal">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Active HIRO Deals</div>
          <div class="kpi-value">${funnel.stages.find(s => s.name === 'HIRO')?.count || 0}</div>
          <div class="kpi-target">Target: > 30% of MQLs</div>
        </div>`;
    }

    const canvas = document.getElementById('mkt-funnel-trend-chart');
    if (canvas) {
      const chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: funnel.stages[0].trend_labels,
          datasets: funnel.stages.map((stage) => ({
            label: stage.name,
            data: stage.trend,
            borderColor: stage.color,
            backgroundColor: 'transparent',
            tension: 0.4,
            pointRadius: 4,
            borderWidth: 2
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Nunito Sans', size: 11 } } }
          },
          scales: {
            y: { ticks: { font: { family: 'Nunito Sans', size: 11 } } },
            x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
          }
        }
      });
      this.charts.push(chart);
    }
  },

  _renderGoogleAds(containerEl, data) {
    const gads = data.kpis.google_ads;
    if (!gads) return;

    const kpiGrid = containerEl.querySelector('#mkt-gads-kpis');
    if (kpiGrid) {
      const s = gads.summary;
      const cpaStatus = s.avg_cpa <= gads.cpa_thresholds.excellent ? 'green'
        : s.avg_cpa <= gads.cpa_thresholds.warning ? 'yellow' : 'red';

      kpiGrid.innerHTML = `
        <div class="kpi-card kpi-card--teal">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Total Ad Spend</div>
          <div class="kpi-value">${CIC.formatCurrency(s.total_spend)}</div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Total Conversions</div>
          <div class="kpi-value">${s.total_conversions}</div>
          <div class="kpi-target">From ${s.total_clicks.toLocaleString()} clicks</div>
        </div>
        <div class="kpi-card kpi-card--${cpaStatus}">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Cost Per Acquisition</div>
          <div class="kpi-value">${CIC.formatCurrency(s.avg_cpa)}</div>
          <div class="kpi-target">Target: \u2264$75 excellent</div>
        </div>
        <div class="kpi-card kpi-card--yellow">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Avg CTR</div>
          <div class="kpi-value">${s.avg_ctr}%</div>
          <div class="kpi-target">Avg CPC: ${CIC.formatCurrency(s.avg_cpc)}</div>
        </div>`;
    }

    const spendCanvas = document.getElementById('mkt-gads-spend-chart');
    if (spendCanvas) {
      const chart = new Chart(spendCanvas, {
        type: 'bar',
        data: {
          labels: gads.trend_labels,
          datasets: [{
            label: 'Ad Spend',
            data: gads.spend_trend,
            backgroundColor: '#ADC837',
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
      this.charts.push(chart);
    }

    const cpaCanvas = document.getElementById('mkt-gads-cpa-chart');
    if (cpaCanvas) {
      const chart = new Chart(cpaCanvas, {
        type: 'line',
        data: {
          labels: gads.trend_labels,
          datasets: [
            {
              label: 'CPA',
              data: gads.cpa_trend,
              borderColor: '#02475A',
              backgroundColor: 'rgba(2,71,90,0.1)',
              fill: true, tension: 0.4,
              pointBackgroundColor: gads.cpa_trend.map(v =>
                v <= gads.cpa_thresholds.excellent ? '#4CAF50'
                : v <= gads.cpa_thresholds.warning ? '#FFC107' : '#F44336'),
              pointRadius: 6, borderWidth: 2
            },
            {
              label: 'Excellent (\u2264$75)',
              data: gads.cpa_trend.map(() => gads.cpa_thresholds.excellent),
              borderColor: '#4CAF50', borderDash: [4, 3],
              pointRadius: 0, fill: false, borderWidth: 1
            },
            {
              label: 'Warning ($200)',
              data: gads.cpa_trend.map(() => gads.cpa_thresholds.warning),
              borderColor: '#FFC107', borderDash: [4, 3],
              pointRadius: 0, fill: false, borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { font: { family: 'Nunito Sans', size: 11 } } } },
          scales: {
            y: { ticks: { callback: v => '$' + v, font: { family: 'Nunito Sans', size: 11 } } },
            x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
          }
        }
      });
      this.charts.push(chart);
    }

    const tbody = containerEl.querySelector('#mkt-gads-tbody');
    if (tbody) {
      tbody.innerHTML = gads.campaigns.map(c => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td class="col-right">${CIC.formatCurrency(c.spend)}</td>
          <td class="col-right">${c.clicks.toLocaleString()}</td>
          <td class="col-right">${c.ctr}%</td>
          <td class="col-right">${c.conversions}</td>
          <td class="col-right">
            <span style="color:${
              c.cpa <= gads.cpa_thresholds.excellent ? '#2E7D32'
              : c.cpa <= gads.cpa_thresholds.warning ? '#F57F17' : '#C62828'
            };font-weight:700;">${CIC.formatCurrency(c.cpa)}</span>
          </td>
          <td class="col-right">${Math.round(c.roas)}:1</td>
          <td class="col-center">
            <span class="badge badge--${c.status_badge}">${c.status_badge.toUpperCase()}</span>
          </td>
        </tr>`).join('');
    }
  },

  _renderGoogleAnalytics(containerEl, data) {
    const ga = data.kpis.google_analytics;
    if (!ga) return;
    const s = ga.summary;

    const kpiGrid = containerEl.querySelector('#mkt-ga-kpis');
    if (kpiGrid) {
      const fmtTime = sec => `${Math.floor(sec/60)}m ${sec%60}s`;
      kpiGrid.innerHTML = `
        <div class="kpi-card kpi-card--teal">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Sessions</div>
          <div class="kpi-value">${s.sessions.toLocaleString()}</div>
          <div class="kpi-target">${s.new_users.toLocaleString()} new users</div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Goal Completions</div>
          <div class="kpi-value">${s.goal_completions}</div>
          <div class="kpi-target">Conv. rate: ${s.goal_conversion_rate}%</div>
        </div>
        <div class="kpi-card kpi-card--yellow">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Bounce Rate</div>
          <div class="kpi-value">${s.bounce_rate}%</div>
          <div class="kpi-target">Avg session: ${fmtTime(s.avg_session_duration)}</div>
        </div>
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Pages / Session</div>
          <div class="kpi-value">${s.pages_per_session}</div>
        </div>`;
    }

    const sourcesTbody = containerEl.querySelector('#mkt-ga-sources-tbody');
    if (sourcesTbody) {
      sourcesTbody.innerHTML = ga.traffic_sources.map(src => `
        <tr>
          <td>${src.source}</td>
          <td class="col-right">${src.sessions.toLocaleString()}</td>
          <td class="col-right">${src.pct}%</td>
          <td class="col-right">${src.conversions}</td>
        </tr>`).join('');
    }

    const pagesTbody = containerEl.querySelector('#mkt-ga-pages-tbody');
    if (pagesTbody) {
      pagesTbody.innerHTML = ga.top_pages.map(p => `
        <tr>
          <td style="font-family:monospace;font-size:12px;">${p.page}</td>
          <td class="col-right">${p.sessions.toLocaleString()}</td>
          <td class="col-right" style="color:${p.bounce_rate > 50 ? '#C62828' : p.bounce_rate > 40 ? '#F57F17' : '#2E7D32'}">
            ${p.bounce_rate}%
          </td>
        </tr>`).join('');
    }
  },

  _renderSearchConsole(containerEl, data) {
    const gsc = data.kpis.google_search_console;
    if (!gsc) return;
    const s = gsc.summary;

    const kpiGrid = containerEl.querySelector('#mkt-gsc-kpis');
    if (kpiGrid) {
      kpiGrid.innerHTML = `
        <div class="kpi-card kpi-card--teal">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Organic Clicks</div>
          <div class="kpi-value">${s.total_clicks.toLocaleString()}</div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Total Impressions</div>
          <div class="kpi-value">${(s.total_impressions/1000).toFixed(0)}K</div>
        </div>
        <div class="kpi-card kpi-card--yellow">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Avg CTR</div>
          <div class="kpi-value">${s.avg_ctr}%</div>
        </div>
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-cadence">MONTHLY</div>
          <div class="kpi-label">Avg Position</div>
          <div class="kpi-value">${s.avg_position}</div>
          <div class="kpi-target">Lower is better</div>
        </div>`;
    }

    const tbody = containerEl.querySelector('#mkt-gsc-tbody');
    if (tbody) {
      tbody.innerHTML = gsc.top_queries.map(q => `
        <tr>
          <td>${q.query}</td>
          <td class="col-right">${q.clicks.toLocaleString()}</td>
          <td class="col-right">${q.impressions.toLocaleString()}</td>
          <td class="col-right">${q.ctr}%</td>
          <td class="col-right" style="color:${q.position <= 5 ? '#2E7D32' : q.position <= 15 ? '#F57F17' : '#9E9E9E'}">
            ${q.position}
          </td>
        </tr>`).join('');
    }
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
        <td class="col-right"><strong>${Math.round(c.roi)}:1</strong></td>
        <td class="col-center"><span class="badge badge--${c.status}">${c.status}</span></td>
      </tr>
    `).join('');
  }
};
