import { Drilldown } from './drilldown.js';
import { wireKpiEdit } from './kpi-edit.js';
import { wireTargets } from './kpi-targets.js';
import { buildCard } from './kpi-card.js';
import { getGoogleAdsKPIs } from '../data/google-ads.js';
import { getACFunnelData } from '../data/ac-funnel.js';
import { formatPeriodLabel, formatPeriodLabelShort, formatPeriodLabelTitle } from '../utils/period-formatter.js';
import { CONFIG } from '../config.js';

export default {
  charts: [],
  _abortController: null,

  async init(containerEl, data) {
    this._data = data;
    this._containerEl = containerEl;

    // Show connection status
    const hasLive = Object.values(data.kpis || {}).some(k => k._dataSource === 'live');
    if (hasLive) {
      this._showLiveIndicator(containerEl);
    }

    this._renderKPICards(containerEl, data);
    this._renderSegmentChart(data);
    this._renderCampaignTable(data);
    this._renderACFunnel(containerEl, data);
    this._renderGoogleAds(containerEl, data);
    this._initROASCalculator(containerEl, data);

    wireKpiEdit(containerEl, 'marketing', data.kpis);

    const reRender = () => {
      this._renderKPICards(containerEl, data);
      wireKpiEdit(containerEl, 'marketing', data.kpis);
      wireTargets(containerEl, 'marketing', reRender);
    };
    wireTargets(containerEl, 'marketing', reRender);

    CIC.onScenarioChange(reRender);

    // Wire date range dropdown and fetch live data
    this._initDateRange(containerEl, data);

    // Initialize DG forecast & actual tables
    try {
      const forecastTables = await import('../forecast-tables.js');
      await forecastTables.init(containerEl);
      this._forecastTables = forecastTables;
    } catch (e) {
      console.warn('[CIC] Forecast tables not available:', e.message);
    }

    // Initialize demand generation forecast engine
    try {
      const forecastMod = await import('../forecast-section.js');
      await forecastMod.init(containerEl);
      this._forecastMod = forecastMod;
    } catch (e) {
      console.warn('[CIC] Forecast section not available:', e.message);
    }
  },

  destroy() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    if (this._forecastTables) {
      this._forecastTables.destroy();
      this._forecastTables = null;
    }
    if (this._forecastMod) {
      this._forecastMod.destroy();
      this._forecastMod = null;
    }
    Drilldown.close();
  },

  _showLiveIndicator(containerEl) {
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
    const time = new Date().toLocaleTimeString('en-CA', {
      hour: '2-digit', minute: '2-digit'
    });
    badge.innerHTML = `
      <span style="width:6px;height:6px;border-radius:50%;
        background:#4CAF50;display:inline-block;
        animation: pulse 2s infinite;"></span>
      Live data from API connectors \u2014 fetched ${time}
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
      { key: 'marketing_created_deals', label: k.marketing_created_deals.label, value: k.marketing_created_deals.value, target: k.marketing_created_deals.target, unit: 'count', status: k.marketing_created_deals.status, cadence: k.marketing_created_deals.cadence, trend: k.marketing_created_deals.trend, _catalog: k.marketing_created_deals._catalog, _kpi: k.marketing_created_deals },
      { key: 'marketing_captured_deals', label: k.marketing_captured_deals.label, value: k.marketing_captured_deals.value, target: k.marketing_captured_deals.target, unit: 'count', status: k.marketing_captured_deals.status, cadence: k.marketing_captured_deals.cadence, trend: k.marketing_captured_deals.trend, _catalog: k.marketing_captured_deals._catalog, _kpi: k.marketing_captured_deals },
      { key: 'hiro_conversion_rate', label: k.hiro_conversion_rate.label, value: k.hiro_conversion_rate.value, target: k.hiro_conversion_rate.target, unit: 'percent', status: k.hiro_conversion_rate.status, cadence: k.hiro_conversion_rate.cadence, trend: k.hiro_conversion_rate.trend, _catalog: k.hiro_conversion_rate._catalog, _kpi: k.hiro_conversion_rate },
      { key: 'pipeline_generated', label: k.pipeline_generated.label, value: k.pipeline_generated.value, target: k.pipeline_generated.target, unit: 'currency', status: k.pipeline_generated.status, cadence: k.pipeline_generated.cadence, trend: k.pipeline_generated.trend, _catalog: k.pipeline_generated._catalog, _kpi: k.pipeline_generated },
      { key: 'roas', label: k.roas.label, value: k.roas.value, target: k.roas.target, unit: 'multiplier', status: k.roas.status, cadence: k.roas.cadence, trend: k.roas.trend, _catalog: k.roas._catalog, _kpi: k.roas },
      { key: 'direct_channel_pipeline_pct', label: k.direct_channel_pipeline_pct.label, value: k.direct_channel_pipeline_pct.value, target: k.direct_channel_pipeline_pct.target, unit: 'percent', status: k.direct_channel_pipeline_pct.status, cadence: k.direct_channel_pipeline_pct.cadence, trend: k.direct_channel_pipeline_pct.trend, _catalog: k.direct_channel_pipeline_pct._catalog, _kpi: k.direct_channel_pipeline_pct }
    ];

    // Pipeline by Segment summary card
    const segments = k.pipeline_by_segment?.segments;
    if (segments) {
      const totalPipeline = segments.reduce((s, seg) => s + seg.value, 0);
      const totalTarget = segments.reduce((s, seg) => s + seg.target, 0);
      const segStatus = totalPipeline >= totalTarget ? 'green' : totalPipeline >= totalTarget * 0.8 ? 'yellow' : 'red';
      cards.push({ key: 'pipeline_by_segment', label: 'Pipeline by Segment', value: totalPipeline, target: totalTarget, unit: 'currency', status: segStatus, cadence: 'Monthly', source: 'ActiveCampaign', readiness: 'partial', note: 'New segments may need new campaign tags in AC', module: 'marketing' });
    }

    // Campaign/Program ROI summary card
    const campaignROI = k.campaign_roi;
    if (campaignROI?.campaigns) {
      const totalSpend = campaignROI.campaigns.reduce((s, c) => s + c.spend, 0);
      const totalRev = campaignROI.campaigns.reduce((s, c) => s + c.attributed_revenue, 0);
      const avgRoi = totalSpend > 0 ? totalRev / totalSpend : 0;
      cards.push({ key: 'campaign_roi', label: 'Campaign/Program ROI', value: avgRoi, target: 4.0, unit: 'multiplier', status: avgRoi >= 4 ? 'green' : avgRoi >= 3 ? 'yellow' : 'red', cadence: 'Quarterly', source: 'ActiveCampaign', readiness: 'partial', note: 'Requires closed-loop attribution model', module: 'marketing' });
    }

    grid.innerHTML = cards.map(card => {
      if (card.module) return buildCard(card);
      return this._buildKPICard(card);
    }).join('');
    this._wireClickHandlers(containerEl, data);
  },

  _buildKPICard({ key, label, value, target, unit, status, cadence, trend, _catalog, _kpi }) {
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

        // Wire period buttons to live AC refetch for MQL card
        if (key === 'marketing_created_deals') {
          setTimeout(() => {
            const btns = document.querySelectorAll('.dd-compare-btn');
            btns.forEach(btn => {
              btn.addEventListener('click', async () => {
                const period = btn.dataset.period;
                if (period === 'last-month' || period === 'custom') {
                  try {
                    const { getMarketingCreatedDeals } =
                      await import('../data/activecampaign.js');
                    const result = await getMarketingCreatedDeals({
                      mode: period
                    });
                    // Update comparison bar with last month vs current
                    const compBar = document.getElementById('dd-comparison-bar');
                    if (compBar && period === 'last-month') {
                      document.getElementById('dd-comp-period-a').textContent =
                        'Current Month';
                      document.getElementById('dd-comp-value-a').textContent =
                        result.current_month?.toString() || '\u2014';
                      document.getElementById('dd-comp-period-b').textContent =
                        result.period_label;
                      document.getElementById('dd-comp-value-b').textContent =
                        result.value.toString();
                      const delta = (result.current_month || 0) - result.value;
                      const pct = result.value > 0
                        ? ((delta / result.value) * 100).toFixed(1)
                        : 0;
                      const dir = delta >= 0 ? 'up' : 'down';
                      const varEl = document.getElementById('dd-comp-variance');
                      varEl.textContent = `${delta >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(pct)}%`;
                      varEl.className = `dd-comparison-variance dd-comparison-variance--${dir}`;
                      compBar.style.display = 'grid';
                    }
                  } catch(e) {
                    console.warn('Live comparison fetch failed:', e.message);
                  }
                }
              });
            });
          }, 100);
        }
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

      const ltv = CONFIG.marketing?.ltv || CONFIG.app?.ltv || 29000;
      const liveSpend = this._liveSpend;
      const months = this._liveSpendMonths || 1;
      const monthlySpend = liveSpend != null ? Math.round(liveSpend / months) : null;
      const periodLabel = this._currentRange
        ? formatPeriodLabelShort({ start: this._currentRange.startDate, end: this._currentRange.endDate, preset: this._currentRange.preset })
        : '';
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
            <label>Total Ad Spend (Monthly Avg)</label>
            <div class="roas-calc-input-wrap" style="background:#F5F5F5;">
              <span class="roas-calc-prefix">$</span>
              <input type="number" id="roas-spend" value="${monthlySpend || 0}" readonly
                style="background:#F5F5F5;color:#666;cursor:not-allowed;">
            </div>
            <div class="roas-calc-hint">(from Google Ads — ${periodLabel})</div>
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
        const s = parseFloat(document.getElementById('roas-spend').value) || 0;
        const c = parseFloat(document.getElementById('roas-customers').value) || 1;
        const cac  = s / c;
        const roas = cac > 0 ? l / cac : 0;
        await CIC.setData('marketing', 'ltv', l);
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

  // ── Date Range + Live Data Fetch ─────────────────────────────────

  _getDateRange(value) {
    const now = new Date();
    let startDate, endDate;
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    endDate = fmt(now);

    if (value === 'ytd') {
      startDate = `${now.getFullYear()}-01-01`;
    } else if (value === 'custom') {
      return null; // handled by custom picker
    } else {
      const days = parseInt(value);
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      startDate = fmt(start);
    }
    return { startDate, endDate };
  },

  _initDateRange(containerEl, data) {
    const select = containerEl.querySelector('#mkt-date-range-select');
    const customDates = containerEl.querySelector('#mkt-custom-dates');
    const applyBtn = containerEl.querySelector('#mkt-custom-apply');
    const label = containerEl.querySelector('#mkt-date-range-label');
    if (!select) return;

    // Restore persisted selection
    const saved = localStorage.getItem('cic_marketing_date_range');
    if (saved && select.querySelector(`option[value="${saved}"]`)) {
      select.value = saved;
    }

    const updateLabel = (range) => {
      if (label && range) {
        label.textContent = `${range.startDate} to ${range.endDate}`;
      }
    };

    const onChange = () => {
      const val = select.value;
      localStorage.setItem('cic_marketing_date_range', val);

      if (val === 'custom') {
        if (customDates) customDates.style.display = 'inline-flex';
        return;
      }
      if (customDates) customDates.style.display = 'none';

      const range = this._getDateRange(val);
      if (range) {
        range.preset = val;
        updateLabel(range);
        this._fetchLiveData(containerEl, data, range);
      }
    };

    select.addEventListener('change', onChange);

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const startInput = containerEl.querySelector('#mkt-date-start');
        const endInput = containerEl.querySelector('#mkt-date-end');
        if (startInput?.value && endInput?.value) {
          const range = { startDate: startInput.value, endDate: endInput.value, preset: 'custom' };
          updateLabel(range);
          this._fetchLiveData(containerEl, data, range);
        }
      });
    }

    // Trigger initial fetch with current selection
    const initialRange = this._getDateRange(select.value);
    if (initialRange) {
      initialRange.preset = select.value;
      updateLabel(initialRange);
      this._fetchLiveData(containerEl, data, initialRange);
    }
  },

  async _fetchLiveData(containerEl, data, { startDate, endDate, preset }) {
    // Store current range for comparison reference
    this._currentRange = { startDate, endDate, preset };

    // Cancel any in-flight requests
    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    // Show loading state on both sections
    this._showSectionLoading(containerEl, '#mkt-gads-kpis', 'Loading Google Ads data...');
    this._showSectionLoading(containerEl, '#mkt-funnel-stages', 'Loading funnel data...');

    // Fetch both in parallel
    const [gadsResult, funnelResult] = await Promise.allSettled([
      getGoogleAdsKPIs({ startDate, endDate, preset, signal }),
      getACFunnelData({ startDate, endDate, preset, signal }),
    ]);

    if (signal.aborted) return; // user changed range, discard stale results

    // ── Period label for headers ──
    const periodRange = { start: startDate, end: endDate, preset };
    const periodTitle = formatPeriodLabelTitle(periodRange);
    const perfTitle = containerEl.querySelector('#mkt-campaign-perf-title');
    if (perfTitle) perfTitle.textContent = `Campaign Performance \u2014 ${periodTitle}`;

    // ── Handle Google Ads result ──
    if (gadsResult.status === 'fulfilled') {
      const gads = gadsResult.value;
      if (gads._dataSource === 'error') {
        this._showNotConnected(containerEl, 'google_ads', gads._error, data);
        this._liveSpend = null;
      } else {
        data.kpis.google_ads = { ...data.kpis.google_ads, ...gads };
        data.kpis.google_ads._dataSource = 'live';
        this._destroyChartsFor('gads');
        this._renderGoogleAds(containerEl, data);

        // Store live spend for ROAS calculator
        this._liveSpend = gads.summary.total_spend;
        this._liveSpendMonths = gads.trend_labels?.length || 1;

        // Compute ROAS from live data + config LTV
        const ltv = CONFIG.marketing?.ltv || CONFIG.app?.ltv || 29000;
        const totalConversions = gads.summary.total_conversions;
        const totalSpend = gads.summary.total_spend;
        if (data.kpis.roas) {
          if (totalSpend > 0 && ltv > 0) {
            data.kpis.roas.value = parseFloat(((totalConversions * ltv) / totalSpend).toFixed(1));
            data.kpis.roas._dataSource = 'live';
          } else {
            data.kpis.roas.value = 0;
            data.kpis.roas._dataSource = 'live';
          }
          data.kpis.roas.status = data.kpis.roas.value >= 4.0 ? 'green'
            : data.kpis.roas.value >= 2.5 ? 'yellow' : 'red';
          // Re-render KPI cards to show updated ROAS
          this._renderKPICards(containerEl, data);
          wireKpiEdit(containerEl, 'marketing', data.kpis);
        }
      }
    } else {
      this._showNotConnected(containerEl, 'google_ads', gadsResult.reason?.message || 'Unknown error', data);
      this._liveSpend = null;
    }

    // ── Handle AC Funnel result ──
    if (funnelResult.status === 'fulfilled') {
      const funnel = funnelResult.value;
      if (funnel._dataSource === 'error') {
        this._showNotConnected(containerEl, 'ac_funnel', funnel._error, data);
      } else {
        data.kpis.ac_demand_funnel = { ...data.kpis.ac_demand_funnel, ...funnel };
        data.kpis.ac_demand_funnel._dataSource = 'live';
        this._destroyChartsFor('funnel');
        this._renderACFunnel(containerEl, data);
      }
    } else {
      this._showNotConnected(containerEl, 'ac_funnel', funnelResult.reason?.message || 'Unknown error', data);
    }

    // Update live indicator
    const hasLive = Object.values(data.kpis || {}).some(k => k._dataSource === 'live');
    if (hasLive) {
      this._showLiveIndicator(containerEl);
    }
  },

  _showSectionLoading(containerEl, selector, message) {
    const el = containerEl.querySelector(selector);
    if (!el) return;
    el.innerHTML = `
      <div style="text-align:center;padding:24px;color:#9E9E9E;font-family:'Nunito Sans',sans-serif;">
        <div style="display:inline-block;width:20px;height:20px;border:3px solid #D2D5DA;border-top-color:#02475A;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:8px;"></div>
        <div style="font-size:12px;font-weight:600;">${message}</div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      </div>`;
  },

  _showNotConnected(containerEl, section, reason, data) {
    const selectorMap = {
      google_ads: '#mkt-gads-kpis',
      ac_funnel: '#mkt-funnel-stages',
    };
    const el = containerEl.querySelector(selectorMap[section]);
    if (!el) return;

    const sectionLabel = section === 'google_ads' ? 'Google Ads' : 'AC Demand Funnel';

    el.innerHTML = `
      <div style="background:#FFF3E0;border:1px solid #FFE0B2;border-radius:8px;padding:20px;text-align:center;font-family:'Nunito Sans',sans-serif;">
        <div style="font-size:24px;margin-bottom:8px;color:#E65100;">&#x26A0;</div>
        <div style="font-size:14px;font-weight:700;color:#303030;margin-bottom:4px;">
          ${sectionLabel} — Not Connected
        </div>
        <div style="font-size:12px;color:#666;margin-bottom:12px;">
          ${reason || 'Unable to reach API'}
        </div>
        <button class="mkt-retry-btn" data-section="${section}"
          style="font-family:'Nunito Sans',sans-serif;font-size:12px;font-weight:700;
            padding:6px 16px;background:#02475A;color:#fff;border:none;border-radius:4px;
            cursor:pointer;margin-right:8px;">
          Retry
        </button>
        <a href="#" style="font-size:12px;color:#02475A;font-weight:600;" onclick="
          event.preventDefault();
          document.querySelector('[data-drilldown=\\'marketing_created_deals\\']')?.click();
        ">Manual Entry</a>
      </div>`;

    // Wire retry button
    const retryBtn = el.querySelector('.mkt-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        const select = containerEl.querySelector('#mkt-date-range-select');
        const range = select?.value === 'custom'
          ? { startDate: containerEl.querySelector('#mkt-date-start')?.value,
              endDate: containerEl.querySelector('#mkt-date-end')?.value }
          : this._getDateRange(select?.value || '365');
        if (range) {
          this._fetchLiveData(containerEl, data, range);
        }
      });
    }
  },

  _destroyChartsFor(prefix) {
    // Remove and destroy charts that will be re-created
    const canvasIds = prefix === 'gads'
      ? ['mkt-gads-spend-chart', 'mkt-gads-cpa-chart']
      : ['mkt-funnel-trend-chart'];
    this.charts = this.charts.filter(chart => {
      if (canvasIds.includes(chart.canvas?.id)) {
        chart.destroy();
        return false;
      }
      return true;
    });

    // Clean up dynamically inserted elements before funnel re-render
    if (prefix === 'funnel' && this._containerEl) {
      const stagesEl = this._containerEl.querySelector('#mkt-funnel-stages');
      if (stagesEl) {
        // Remove compare bar, maturation warning, and any other inserted siblings
        let prev = stagesEl.previousElementSibling;
        while (prev) {
          const el = prev;
          prev = prev.previousElementSibling;
          if (el.querySelector('#funnel-compare-toggle, #funnel-compare-result') ||
              el.classList?.contains('funnel-maturation-warning')) {
            el.remove();
          }
        }
      }
      // Remove cohort tooltip from section header
      const tooltip = this._containerEl.querySelector('h3 > span[title*="Cohort"]');
      if (tooltip) tooltip.remove();
    }
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
          <div id="funnel-compare-header" style="font-size:11px;font-weight:800;text-transform:uppercase;
            letter-spacing:0.06em;color:#02475A;margin-bottom:8px;">
            Comparison \u2014 HIRO Stage
          </div>
          <div style="display:flex;gap:24px;flex-wrap:wrap;">
            <div>
              <div id="funnel-comp-current-label" style="font-size:10px;color:#9E9E9E;font-weight:700;
                text-transform:uppercase;">Current</div>
              <div style="font-size:20px;font-weight:800;color:#303030"
                   id="funnel-comp-current">\u2014</div>
            </div>
            <div>
              <div id="funnel-comp-compare-label" style="font-size:10px;color:#9E9E9E;font-weight:700;
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

      // ── Cohort tooltip ──
      const tooltipEl = document.createElement('span');
      tooltipEl.style.cssText = `
        display:inline-flex;align-items:center;justify-content:center;
        width:18px;height:18px;border-radius:50%;background:#E0EEF2;
        color:#02475A;font-size:11px;font-weight:800;cursor:help;
        margin-left:8px;position:relative;font-family:'Nunito Sans',sans-serif;`;
      tooltipEl.textContent = '?';
      tooltipEl.title = 'Cohort view: Shows deals created within the selected date range, grouped by their current stage. A deal counts toward every stage it has reached or passed. This is a \u201Chow is this period\u2019s lead quality maturing?\u201D view, not a snapshot of currently-active deals.';
      const sectionHeader = stagesEl.closest('.chart-card')?.previousElementSibling;
      const headerH3 = sectionHeader?.querySelector('h3');
      if (headerH3) headerH3.appendChild(tooltipEl);

      // ── Maturation warning (when end date is within last 30 days) ──
      if (funnel._dateRange) {
        const endDate = new Date(funnel._dateRange.end + 'T00:00:00');
        const now = new Date();
        const daysSinceEnd = Math.floor((now - endDate) / (1000 * 60 * 60 * 24));
        if (daysSinceEnd < 30) {
          const warningEl = document.createElement('div');
          warningEl.className = 'funnel-maturation-warning';
          warningEl.style.cssText = `
            background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;
            padding:10px 16px;font-size:12px;color:#F57F17;font-weight:600;
            font-family:'Nunito Sans',sans-serif;margin-bottom:12px;`;
          warningEl.innerHTML = '\u26A0\uFE0F Recent cohorts haven\u2019t had time to fully mature \u2014 late-stage counts (MQL, HIRO) may be artificially low for the selected period. Compare to a fully-matured period (e.g., 60\u201390 days ago) for cleaner trend analysis.';
          stagesEl.parentNode.insertBefore(warningEl, stagesEl);
        }
      }

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

      // ── Wire funnel comparison toggle (REAL QUERIES, not mock math) ──
      const hiro = funnel.stages.find(s => s.name === 'HIRO');
      const self = this;

      const computeComparisonRange = (period) => {
        const now = new Date();
        const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (period === 'last-month') {
          const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          return {
            startDate: fmt(d),
            endDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`,
            preset: 'last-month'
          };
        }
        if (period === 'last-year') {
          const y = now.getFullYear() - 1;
          return { startDate: `${y}-01-01`, endDate: `${y}-12-31`, preset: 'last-year' };
        }
        return null; // custom handled separately
      };

      const showFunnelComparison = async (period, compRange) => {
        const resultEl = containerEl.querySelector('#funnel-compare-result');
        if (!resultEl) return;

        // Show loading
        resultEl.style.display = 'block';
        const headerEl = containerEl.querySelector('#funnel-compare-header');
        if (headerEl) headerEl.textContent = 'Comparison \u2014 HIRO Stage';

        containerEl.querySelector('#funnel-comp-current').textContent = '\u2026';
        containerEl.querySelector('#funnel-comp-compare').textContent = '\u2026';
        containerEl.querySelector('#funnel-comp-delta').textContent = '\u2026';
        containerEl.querySelector('#funnel-comp-rate').textContent = '\u2026';

        // Dynamic column labels
        const currentLabel = containerEl.querySelector('#funnel-comp-current-label');
        const compareLabel = containerEl.querySelector('#funnel-comp-compare-label');
        if (currentLabel && self._currentRange) {
          currentLabel.textContent = formatPeriodLabelShort({
            start: self._currentRange.startDate,
            end: self._currentRange.endDate,
            preset: self._currentRange.preset
          });
        }
        if (compareLabel && compRange) {
          compareLabel.textContent = formatPeriodLabelShort({
            start: compRange.startDate,
            end: compRange.endDate,
            preset: compRange.preset
          });
        }

        try {
          const compData = await getACFunnelData({
            startDate: compRange.startDate,
            endDate: compRange.endDate,
            preset: compRange.preset,
          });

          if (compData._dataSource === 'error') {
            containerEl.querySelector('#funnel-comp-current').textContent = '\u2014';
            containerEl.querySelector('#funnel-comp-compare').textContent = 'Comparison unavailable';
            containerEl.querySelector('#funnel-comp-delta').textContent = '\u2014';
            containerEl.querySelector('#funnel-comp-rate').textContent = '\u2014';
            return;
          }

          const currentHiro = hiro?.count || 0;
          const currentConv = hiro?.conversion_from_prev || 0;
          const compHiro = compData.stages.find(s => s.name === 'HIRO');
          const compVal = compHiro?.count || 0;
          const compConv = compHiro?.conversion_from_prev || 0;

          containerEl.querySelector('#funnel-comp-current').textContent =
            `${currentHiro} deals (${currentConv}%)`;
          containerEl.querySelector('#funnel-comp-compare').textContent =
            `${compVal} deals (${compConv}%)`;

          const delta = currentHiro - compVal;
          const deltaColor = delta >= 0 ? '#2E7D32' : '#C62828';
          const arrow = delta >= 0 ? '\u25B2' : '\u25BC';
          const deltaEl = containerEl.querySelector('#funnel-comp-delta');
          deltaEl.textContent = `${arrow} ${Math.abs(delta)} deals`;
          deltaEl.style.color = deltaColor;

          const convDelta = (currentConv - compConv).toFixed(1);
          const convDeltaEl = containerEl.querySelector('#funnel-comp-rate');
          convDeltaEl.textContent = `${convDelta >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(convDelta)}pp`;
          convDeltaEl.style.color = convDelta >= 0 ? '#2E7D32' : '#C62828';
        } catch (err) {
          containerEl.querySelector('#funnel-comp-compare').textContent = 'Comparison unavailable';
          console.warn('[Funnel comparison] Fetch failed:', err.message);
        }
      };

      const funnelToggle      = containerEl.querySelector('#funnel-compare-toggle');
      const funnelClear       = containerEl.querySelector('#funnel-compare-clear');
      const funnelCustomPicker = containerEl.querySelector('#funnel-custom-picker');
      const funnelMonthSel    = containerEl.querySelector('#funnel-custom-month');
      const funnelYearSel     = containerEl.querySelector('#funnel-custom-year');

      const onFunnelCustomChange = () => {
        const month = parseInt(funnelMonthSel.value);
        const year  = parseInt(funnelYearSel.value);
        const d = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0).getDate();
        const fmt = dd => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
        const compRange = {
          startDate: fmt(d),
          endDate: `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`,
          preset: 'custom'
        };
        showFunnelComparison('custom', compRange);
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
            const compRange = computeComparisonRange(btn.dataset.period);
            if (compRange) showFunnelComparison(btn.dataset.period, compRange);
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
