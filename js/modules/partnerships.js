import { Drilldown, PartnerPanel } from './drilldown.js';
import { renderInlineEntry } from './datepicker.js';
import { wireKpiEdit } from './kpi-edit.js';
import { wireTargets } from './kpi-targets.js';
import { buildCard } from './kpi-card.js';

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

  _SEGMENTS_KEY: 'partnerships_segments',
  _currentSegments: null,

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

    // ── Segment Revenue Tracker ──
    await this._renderSegments(containerEl, data);

    // ── New Channel Development Grid ──
    this._buildNewChannelGrid(containerEl, k);

    // ── Partner Detail Panel ──
    PartnerPanel.init(k.revenue_by_partner.partners);

    // ── KPI Overview Grid (spec-aligned 9 cards) ──
    this._renderKPIOverview(containerEl, k);

    // ── Drilldown click handlers ──
    this._wireClickHandlers(containerEl, data);
    wireKpiEdit(containerEl, 'partnerships', data.kpis);

    const reRender = () => {
      this._renderKPIOverview(containerEl, k);
      this._wireClickHandlers(containerEl, data);
      wireKpiEdit(containerEl, 'partnerships', data.kpis);
      wireTargets(containerEl, 'partnerships', reRender);
    };
    wireTargets(containerEl, 'partnerships', reRender);
    CIC.onScenarioChange(reRender);

    await renderInlineEntry(containerEl, {
      id: 'pcc-data',
      title: 'PCC and QHR Partner Data',
      department: 'partnerships',
      insertAfterSelector: '#partners-new-channel-grid',
      fields: [
        { key: 'pcc_self_serve_new',  label: 'PCC Self-Serve New Customers', type: 'number', placeholder: '0' },
        { key: 'pcc_pipeline_est',    label: 'PCC Pipeline Estimate ($)',     type: 'number', placeholder: '0', unit: 'currency' },
        { key: 'pcc_active_accounts', label: 'PCC Active Accounts',           type: 'number', placeholder: '0' },
        { key: 'qhr_new_customers',   label: 'QHR New Customers',             type: 'number', placeholder: '0' },
        { key: 'qhr_pipeline_est',    label: 'QHR Pipeline Estimate ($)',      type: 'number', placeholder: '0', unit: 'currency' }
      ]
    });
  },

  // ── KPI Overview Grid (spec: 9 cards) ──
  _renderKPIOverview(el, k) {
    const grid = el.querySelector('#partnerships-kpi-grid');
    if (!grid) return;
    const rbp = k.revenue_by_partner;
    const cards = [];

    // 1. Revenue by Partner (% of Total)
    if (rbp) cards.push({ key: 'revenue_by_partner', label: 'Revenue by Partner (% of Total)', value: rbp.partners?.[0]?.pct, unit: 'percent', status: 'yellow', cadence: 'Monthly', source: 'Salesforce', module: 'partnerships' });
    // 2. PCC/QHR Concentration
    if (rbp) cards.push({ key: 'pcc_qhr_concentration', label: 'PCC/QHR Revenue as % of Total', value: rbp.concentration_current, unit: 'percent', status: rbp.concentration_current <= 80 ? 'green' : 'red', cadence: 'Monthly', source: 'Salesforce', module: 'partnerships' });
    // 3. MxC Revenue Ramp
    const mxc = rbp?.partners?.find(p => p.name === 'MxC');
    if (mxc) cards.push({ key: 'mxc_revenue_ramp', label: 'MxC Revenue Ramp', value: mxc.mrr, unit: 'currency', status: 'yellow', cadence: 'Monthly', source: 'Salesforce', module: 'partnerships' });
    // 4. Non-Reseller Deals (Not Yet)
    cards.push({ key: 'non_reseller_deals', label: 'Non-Reseller/Marketplace Deals', value: null, unit: 'count', readiness: 'not_yet', definition: '# and $ of deals closed through ISV, SI, MSP, consultant channels.', cadence: 'Quarterly', source: 'PRM', module: 'partnerships' });
    // 5. New Partner Activation (Not Yet)
    cards.push({ key: 'new_partner_activation', label: 'New Partner Activation Rate', value: null, unit: 'percent', readiness: 'not_yet', definition: '# of new partners that close their first deal within 6 months.', cadence: 'Quarterly', source: 'PRM', module: 'partnerships' });
    // 6. Partner Pipeline Coverage
    if (k.partner_pipeline_coverage) {
      const ppc = k.partner_pipeline_coverage;
      const totalPipeline = ppc.partners?.reduce((s, p) => s + (p.pipeline || 0), 0) || 0;
      cards.push({ key: 'partner_pipeline_coverage', label: 'Partner Pipeline Coverage', value: totalPipeline, unit: 'currency', status: 'yellow', cadence: 'Monthly', source: 'PRM', readiness: 'partial', note: 'PCC pipeline visibility limited', module: 'partnerships' });
    }
    // 7. PCC/QHR Self-Serve
    cards.push({ key: 'pcc_qhr_self_serve', label: 'PCC/QHR Self-Serve Delivery', value: null, unit: 'count', readiness: 'partial', note: 'Depends entirely on PCC delivery', cadence: 'Monthly', source: 'Salesforce', module: 'partnerships' });
    // 8. Senior Living Partner Revenue
    cards.push({ key: 'sl_partner_revenue', label: 'Senior Living Partner Revenue', value: null, unit: 'currency', status: 'yellow', cadence: 'Monthly', source: 'Salesforce', module: 'partnerships' });
    // 9. New Partner Outreach
    if (k.new_partner_outreach) cards.push({ key: 'new_partner_outreach', label: 'New Partner Outreach Volume', value: k.new_partner_outreach.value, unit: 'count', status: k.new_partner_outreach.status || 'yellow', cadence: 'Monthly', source: 'PRM', module: 'partnerships' });

    grid.innerHTML = cards.map(c => buildCard(c)).join('');
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
            PartnerPanel.open(partners[elements[0].index]);
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
    const partners = rbp.partners;
    tbody.querySelectorAll('tr[data-partner]').forEach(row => {
      row.addEventListener('click', () => {
        const p = partners.find(pr => pr.name === row.dataset.partner);
        if (p) PartnerPanel.open(p);
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

  // ── Segment Revenue ──
  async _loadSegments(defaultSegments) {
    const { storage } = await import('../data/storage.js');
    const saved = await storage.get('partnerships', this._SEGMENTS_KEY);
    if (saved?.value) {
      try {
        const parsed = JSON.parse(saved.value);
        return defaultSegments.map(seg => {
          const edit = parsed.find(s => s.id === seg.id);
          return edit ? { ...seg, name: edit.name, annual_target: edit.annual_target, status: edit.status || seg.status } : seg;
        });
      } catch (e) { return defaultSegments; }
    }
    return defaultSegments;
  },

  async _saveSegments(segments) {
    const { storage } = await import('../data/storage.js');
    const toSave = segments.map(s => ({
      id: s.id, name: s.name, annual_target: s.annual_target, status: s.status
    }));
    await storage.set('partnerships', this._SEGMENTS_KEY, JSON.stringify(toSave));
  },

  async _renderSegments(containerEl, data) {
    const defaultSegments = data.kpis.segment_revenue?.segments || [];
    const segments = await this._loadSegments(defaultSegments);
    this._currentSegments = segments;

    this._renderSegmentCards(containerEl, segments);
    this._wireSegmentManagement(containerEl, segments, data);
  },

  _renderSegmentCards(containerEl, segments) {
    const grid = containerEl.querySelector('#partnerships-segments-grid');
    if (!grid) return;

    grid.innerHTML = segments.map(seg => {
      const pct = seg.annual_target > 0
        ? Math.min(100, Math.round((seg.total_mrr / seg.annual_target) * 100))
        : 0;
      const trendDelta = seg.trend?.length >= 2
        ? ((seg.trend[seg.trend.length - 1] - seg.trend[seg.trend.length - 2])
            / Math.abs(seg.trend[seg.trend.length - 2] || 1) * 100).toFixed(1)
        : 0;
      const trendDir = trendDelta >= 0 ? '▲' : '▼';
      const trendColor = trendDelta >= 0 ? '#2E7D32' : '#C62828';

      const partnerRows = (seg.by_partner || []).map(p => {
        const partnerPct = seg.total_mrr > 0
          ? ((p.mrr / seg.total_mrr) * 100).toFixed(1) : 0;
        return `
          <div class="segment-partner-row">
            <span style="font-weight:600;color:#404041">${p.partner}</span>
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="progress-bar" style="width:80px;">
                <div class="progress-bar__fill" style="width:${partnerPct}%;background:${seg.color}"></div>
              </div>
              <span style="font-weight:700;color:#303030;width:60px;text-align:right">
                ${fmt$(p.mrr)}
              </span>
              <span style="color:#9E9E9E;width:40px;text-align:right">
                ${partnerPct}%
              </span>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="segment-card" id="seg-card-${seg.id}"
             style="border-left-color:${seg.color}">
          <div class="segment-card__header"
               onclick="this.closest('.segment-card').querySelector('.segment-card__body').classList.toggle('open')">
            <div class="segment-card__left">
              <div class="segment-color-dot" style="background:${seg.color}"></div>
              <span class="segment-card__name">${seg.name}</span>
              ${seg.is_core
                ? '<span class="badge badge--teal" style="font-size:10px">Core</span>'
                : '<span class="badge badge--grey" style="font-size:10px">Growth</span>'}
            </div>
            <div class="segment-card__right">
              <span style="color:${trendColor};font-size:13px;font-weight:700">
                ${trendDir} ${Math.abs(trendDelta)}%
              </span>
              <span class="segment-card__mrr">${fmt$(seg.total_mrr)}</span>
              <span class="badge badge--${seg.status}">${seg.status.toUpperCase()}</span>
              <span style="color:#9E9E9E;font-size:18px">▾</span>
            </div>
          </div>
          <div class="segment-card__body">
            <div class="segment-progress-wrap">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:#9E9E9E;margin-bottom:6px;font-family:'Nunito Sans',sans-serif;font-weight:600;">
                <span>Annual Target Progress</span>
                <span>${fmt$(seg.total_mrr)} / ${fmt$(seg.annual_target)} (${pct}%)</span>
              </div>
              <div class="progress-bar progress-bar--lg">
                <div class="progress-bar__fill progress-bar__fill--${seg.status}"
                     style="width:${pct}%;background:${seg.color}"></div>
              </div>
            </div>
            ${partnerRows
              ? `<div style="margin-top:16px;">
                  <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#02475A;margin-bottom:8px;font-family:'Nunito Sans',sans-serif;">By Partner</div>
                  ${partnerRows}
                </div>`
              : ''}
          </div>
        </div>`;
    }).join('');
  },

  _wireSegmentManagement(containerEl, segments, data) {
    const manageBtn = containerEl.querySelector('#segments-manage-btn');
    const mgmtPanel = containerEl.querySelector('#segment-mgmt-panel');
    const mgmtList  = containerEl.querySelector('#segment-mgmt-list');
    if (!manageBtn || !mgmtPanel || !mgmtList) return;

    const renderMgmtList = (segs) => {
      mgmtList.innerHTML = segs.map((seg, i) => `
        <div class="segment-mgmt-row" data-index="${i}">
          <div class="segment-color-dot" style="background:${seg.color}"></div>
          <input type="text" class="segment-mgmt-input segment-name-input"
                 value="${seg.name}" placeholder="Segment name">
          <input type="number" class="segment-mgmt-input segment-target-input"
                 value="${seg.annual_target}" placeholder="Annual target $">
          <select class="segment-mgmt-input segment-status-input">
            <option value="green"  ${seg.status==='green'  ?'selected':''}>On Track</option>
            <option value="yellow" ${seg.status==='yellow' ?'selected':''}>At Risk</option>
            <option value="red"    ${seg.status==='red'    ?'selected':''}>Behind</option>
          </select>
          <button class="segment-delete-btn"
                  onclick="this.closest('.segment-mgmt-row').remove()"
                  title="Delete segment">✕</button>
        </div>`).join('');
    };

    manageBtn.addEventListener('click', () => {
      const isOpen = mgmtPanel.style.display !== 'none';
      mgmtPanel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) renderMgmtList(this._currentSegments);
    });

    containerEl.querySelector('#segment-add-btn')?.addEventListener('click', () => {
      const newSeg = {
        id: 'new_' + Date.now(),
        name: 'New Segment',
        color: '#9E9E9E',
        total_mrr: 0,
        annual_target: 100000,
        by_partner: [],
        trend: [0, 0, 0, 0],
        trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
        status: 'red',
        is_core: false
      };
      this._currentSegments.push(newSeg);
      renderMgmtList(this._currentSegments);
    });

    containerEl.querySelector('#segment-save-btn')?.addEventListener('click', async () => {
      // Collect remaining rows (deleted rows are removed from DOM)
      const rows = mgmtList.querySelectorAll('.segment-mgmt-row');
      const updatedSegments = [];
      rows.forEach(row => {
        const i = parseInt(row.dataset.index, 10);
        const seg = this._currentSegments[i];
        if (seg) {
          seg.name = row.querySelector('.segment-name-input')?.value || seg.name;
          seg.annual_target = parseFloat(row.querySelector('.segment-target-input')?.value) || seg.annual_target;
          seg.status = row.querySelector('.segment-status-input')?.value || seg.status;
          updatedSegments.push(seg);
        }
      });
      this._currentSegments = updatedSegments;

      await this._saveSegments(this._currentSegments);
      this._renderSegmentCards(containerEl, this._currentSegments);
      mgmtPanel.style.display = 'none';
    });

    containerEl.querySelector('#segment-cancel-btn')?.addEventListener('click', () => {
      mgmtPanel.style.display = 'none';
    });
  },

  // ── New Channel Development Grid ──
  _buildNewChannelGrid(el, k) {
    const grid = el.querySelector('#partners-new-channel-grid');
    const nrd = k.non_reseller_deals;
    const npa = k.new_partner_activation;
    const npo = k.new_partner_outreach;

    const _badge = (kpi) => {
      if (!kpi?._catalog && !kpi?._dataSource) return '';
      const b = CIC.catalog.dataSourceBadge(kpi);
      return `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
    };

    grid.innerHTML = `
      <div class="kpi-card kpi-card--red" data-drilldown="non_reseller_deals">
        ${_badge(nrd)}
        <div class="kpi-cadence">${nrd.cadence}</div>
        <div class="kpi-label">Non-Reseller Deals</div>
        <div class="kpi-value">${nrd.value}</div>
        <div class="kpi-target">Target: ${nrd.target_ytd} YTD</div>
        <div class="kpi-note">${nrd.note}</div>
      </div>
      <div class="kpi-card kpi-card--red" data-drilldown="new_partner_activation">
        ${_badge(npa)}
        <div class="kpi-cadence">${npa.cadence}</div>
        <div class="kpi-label">New Partner Activation</div>
        <div class="kpi-value">${npa.value}</div>
        <div class="kpi-target">Target: ${npa.target}</div>
        <div class="kpi-note">${npa.note}</div>
      </div>
      <div class="kpi-card kpi-card--yellow" data-drilldown="new_partner_outreach" data-unit="count">
        ${_badge(npo)}
        <div class="kpi-cadence">${npo.cadence}</div>
        <div class="kpi-label">New Partner Outreach</div>
        <div class="kpi-value">${npo.value}</div>
        <div class="kpi-target">Target: ${npo.target}</div>
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
    if (key === 'revenue_by_partner') {
      return this._data?.kpis?.revenue_by_partner?.partners?.map(p => ({
        label: p.name, value: p.mrr
      })) || null;
    }
    return null;
  },

  _getBreakdownTitle(key) {
    if (key === 'revenue_by_partner') return 'Revenue by Partner';
    return 'Breakdown';
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
    PartnerPanel.close();
    this._currentSegments = null;
  },

  getSummaryKPIs() {
    return [
      { label: 'PCC+QHR Concentration', value: '89.7%', delta: '▼0.4pp', status: 'red' },
      { label: 'MxC MRR', value: '$42K', delta: '▲44%', status: 'green' },
      { label: 'Segment Revenue', value: '$762.8K', delta: '▲5 segs', status: 'green' }
    ];
  }
};
