import { Drilldown, wireEditableCards } from './drilldown.js';

export default {
  charts: [],
  _data: null,

  init(containerEl, data) {
    this._data = data;
    this._renderAIGrid(containerEl, data);
    this._renderRoadmap(containerEl, data);
    this._renderPilotsGrid(containerEl, data);
    this._renderDeliveryGrid(containerEl, data);
    this._renderAllocationChart(data);
    this._renderSayDoChart(data);
    this._renderRevenueGrid(containerEl, data);

    // ── Editable card attributes ──
    const editables = {
      'ai_skills_pilots':      { key: 'pilots_completed',   unit: 'count' },
      'say_do_ratio':          { key: 'say_do_pct',         unit: 'percent' },
      'customer_validations':  { key: 'validations_count',  unit: 'count' }
    };
    for (const [dd, cfg] of Object.entries(editables)) {
      const card = containerEl.querySelector(`[data-drilldown="${dd}"]`);
      if (card) {
        card.dataset.editable = 'true';
        card.dataset.entryKey = cfg.key;
        card.dataset.unit = cfg.unit;
      }
    }

    // ── Drilldown click handlers ──
    this._wireClickHandlers(containerEl, data);
    wireEditableCards(containerEl, 'product');
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
    if (key === 'strategic_allocation') {
      return this._data?.kpis?.strategic_allocation?.breakdown?.map(b => ({
        label: b.type, value: b.pct, target: b.target_pct
      })) || null;
    }
    return null;
  },

  _getBreakdownTitle(key) {
    if (key === 'strategic_allocation') return 'Allocation Breakdown';
    return 'Breakdown';
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
  },

  getSummaryKPIs() {
    return [
      { label: 'AI Products Launched', value: '1/3 this qtr', delta: '', status: 'yellow' },
      { label: 'Say/Do Ratio', value: '84%', delta: '+6pp QoQ', status: 'yellow' },
      { label: 'AI Revenue MRR', value: '$18.4K', delta: '', status: 'yellow' }
    ];
  },

  // ── AI Innovation KPI Grid ──

  _renderAIGrid(containerEl, data) {
    const grid = containerEl.querySelector('#product-ai-grid');
    if (!grid) return;
    const k = data.kpis;

    grid.innerHTML = [
      this._kpiCard('AI Products Launched', `${k.ai_products_launched.value} of ${k.ai_products_launched.target_per_quarter} this quarter`, null, 'yellow', 'Quarterly', null, 'ai_products_launched'),
      this._kpiCard('AI Skills Pilots', `${k.ai_skills_pilots.value} of ${k.ai_skills_pilots.target_annual} annual`, null, 'yellow', 'Quarterly',
        this._progressBar(k.ai_skills_pilots.value, k.ai_skills_pilots.target_annual, 'yellow'), 'ai_skills_pilots'),
      this._kpiCard('Customer Validations', `${k.customer_validations.value} of ${k.customer_validations.target} by Q3`, null, 'yellow', 'Quarterly', null, 'customer_validations'),
      this._kpiCard('AI-Specific Revenue MRR', CIC.formatCurrency(k.ai_specific_revenue.value),
        `Target: ${CIC.formatCurrency(k.ai_specific_revenue.monthly_target)}/mo`, 'yellow', 'Monthly', null, 'ai_specific_revenue'),
      this._kpiCard('AI Case Studies', `${k.ai_case_studies.value} of ${k.ai_case_studies.target} annual`, null, 'red', 'Quarterly', null, 'ai_case_studies')
    ].join('');
  },

  // ── Roadmap Table ──

  _renderRoadmap(containerEl, data) {
    const tbody = containerEl.querySelector('#product-roadmap-tbody');
    if (!tbody) return;
    const products = data.kpis.ai_products_launched.products;

    const statusBadge = (status) => {
      const color = status === 'Launched' ? 'green' : status === 'In Progress' ? 'blue' : 'grey';
      return `<span class="badge badge--${color}">${status}</span>`;
    };

    tbody.innerHTML = products.map(p => `
      <tr>
        <td>${p.name}</td>
        <td class="col-center">${p.quarter}</td>
        <td class="col-right">${p.mrr_attributed > 0 ? CIC.formatCurrency(p.mrr_attributed) : '$0'}</td>
        <td class="col-center">${statusBadge(p.status)}</td>
      </tr>
    `).join('');
  },

  // ── Pilots Grid ──

  _renderPilotsGrid(containerEl, data) {
    const grid = containerEl.querySelector('#product-pilots-grid');
    if (!grid) return;
    const k = data.kpis;

    const pilotPct = Math.round((k.ai_skills_pilots.value / k.ai_skills_pilots.target_annual) * 100);
    const valPct = Math.round((k.customer_validations.value / k.customer_validations.target) * 100);

    grid.innerHTML = `
      <div class="kpi-card kpi-card--yellow" data-drilldown="ai_skills_pilots">
        <div class="kpi-label">AI Skills Pilots</div>
        <div class="progress-labeled">
          <div class="progress-labeled__header">
            <span class="progress-labeled__label">${k.ai_skills_pilots.value} / ${k.ai_skills_pilots.target_annual}</span>
            <span class="progress-labeled__value">${pilotPct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--yellow" style="width: ${pilotPct}%;"></div>
          </div>
        </div>
      </div>
      <div class="kpi-card kpi-card--yellow" data-drilldown="customer_validations">
        <div class="kpi-label">Customer Validations</div>
        <div class="progress-labeled">
          <div class="progress-labeled__header">
            <span class="progress-labeled__label">${k.customer_validations.value} / ${k.customer_validations.target}</span>
            <span class="progress-labeled__value">${valPct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--yellow" style="width: ${valPct}%;"></div>
          </div>
        </div>
        <div class="kpi-note">Target by Q3</div>
      </div>
    `;
  },

  // ── Delivery Grid ──

  _renderDeliveryGrid(containerEl, data) {
    const grid = containerEl.querySelector('#product-delivery-grid');
    if (!grid) return;
    const k = data.kpis;

    grid.innerHTML = [
      this._kpiCard('Say/Do Ratio', k.say_do_ratio.value + '%',
        `Target: ${k.say_do_ratio.target}%`, 'yellow', 'Quarterly', null, 'say_do_ratio'),
      this._kpiCard('Customer-Facing Bug Reduction', k.bug_reduction.value + '%',
        `Target: ${k.bug_reduction.target}% QoQ`, 'red', 'Quarterly', null, 'bug_reduction'),
      this._kpiCard('Strategic Allocation', k.strategic_allocation.value + '%',
        `Target: ${k.strategic_allocation.target}%`, 'red', 'Quarterly', null, 'strategic_allocation')
    ].join('');
  },

  // ── Allocation Donut Chart ──

  _renderAllocationChart(data) {
    const canvas = document.getElementById('product-allocation-chart');
    if (!canvas) return;
    const breakdown = data.kpis.strategic_allocation.breakdown;

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: breakdown.map(b => b.type),
        datasets: [{
          data: breakdown.map(b => b.pct),
          backgroundColor: ['#ADC837', '#F57F17', '#E53935'],
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Nunito Sans', size: 12 } } },
          tooltip: {
            callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}%` }
          }
        }
      },
      plugins: [{
        id: 'doughnutLabels',
        afterDraw(chart) {
          const { ctx } = chart;
          chart.data.datasets[0].data.forEach((val, i) => {
            const meta = chart.getDatasetMeta(0).data[i];
            const { x, y } = meta.tooltipPosition();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 13px Nunito Sans';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(val + '%', x, y);
          });
        }
      }]
    });
    this.charts.push(chart);
  },

  // ── Say/Do Bar Chart ──

  _renderSayDoChart(data) {
    const canvas = document.getElementById('product-saydo-chart');
    if (!canvas) return;
    const quarters = data.kpis.say_do_ratio.by_quarter;

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: quarters.map(q => q.quarter),
        datasets: [{
          label: 'Say/Do %',
          data: quarters.map(q => q.ratio),
          backgroundColor: '#029FB5',
          borderRadius: 4,
          barPercentage: 0.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { callback: v => v + '%', font: { family: 'Nunito Sans', size: 11 } }
          },
          x: { ticks: { font: { family: 'Nunito Sans', size: 11 } } }
        },
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              targetLine: {
                type: 'line',
                yMin: 90, yMax: 90,
                borderColor: '#E53935',
                borderDash: [6, 3],
                borderWidth: 2,
                label: {
                  display: true,
                  content: 'Target 90%',
                  position: 'end',
                  backgroundColor: 'transparent',
                  color: '#E53935',
                  font: { size: 11, family: 'Nunito Sans' }
                }
              }
            }
          }
        }
      },
      plugins: [{
        id: 'targetLine',
        afterDraw(chart) {
          const yScale = chart.scales.y;
          const yPos = yScale.getPixelForValue(90);
          const { ctx } = chart;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([6, 3]);
          ctx.strokeStyle = '#E53935';
          ctx.lineWidth = 2;
          ctx.moveTo(chart.chartArea.left, yPos);
          ctx.lineTo(chart.chartArea.right, yPos);
          ctx.stroke();
          ctx.fillStyle = '#E53935';
          ctx.font = '11px Nunito Sans';
          ctx.textAlign = 'right';
          ctx.fillText('Target 90%', chart.chartArea.right, yPos - 6);
          ctx.restore();
        }
      }]
    });
    this.charts.push(chart);
  },

  // ── Revenue Grid ──

  _renderRevenueGrid(containerEl, data) {
    const grid = containerEl.querySelector('#product-revenue-grid');
    if (!grid) return;
    const k = data.kpis;

    const existPct = ((k.enhancement_revenue_existing.value / k.enhancement_revenue_existing.annual_target) * 100).toFixed(1);
    const newPct = ((k.enhancement_revenue_new_segments.value / k.enhancement_revenue_new_segments.annual_target) * 100).toFixed(1);

    grid.innerHTML = `
      <div class="kpi-card kpi-card--yellow" data-drilldown="enhancement_revenue_existing">
        <div class="kpi-cadence">Quarterly</div>
        <div class="kpi-label">Enhancement Revenue (Existing)</div>
        <div class="kpi-value kpi-value--sm">${CIC.formatCurrency(k.enhancement_revenue_existing.value)} YTD</div>
        <div class="kpi-target">Annual Target: ${CIC.formatCurrency(k.enhancement_revenue_existing.annual_target)}</div>
        <div style="margin-top: 8px;">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--yellow" style="width: ${existPct}%;"></div>
          </div>
          <div style="font-size: 10px; color: #9E9E9E; margin-top: 4px;">${existPct}% of annual</div>
        </div>
      </div>
      <div class="kpi-card kpi-card--yellow" data-drilldown="enhancement_revenue_new_segments">
        <div class="kpi-cadence">Quarterly</div>
        <div class="kpi-label">Enhancement Revenue (New Segments)</div>
        <div class="kpi-value kpi-value--sm">${CIC.formatCurrency(k.enhancement_revenue_new_segments.value)} YTD</div>
        <div class="kpi-target">Annual Target: ${CIC.formatCurrency(k.enhancement_revenue_new_segments.annual_target)}</div>
        <div style="margin-top: 8px;">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--yellow" style="width: ${newPct}%;"></div>
          </div>
          <div style="font-size: 10px; color: #9E9E9E; margin-top: 4px;">${newPct}% of annual</div>
        </div>
      </div>
    `;
  },

  // ── Helpers ──

  _kpiCard(label, value, target, status, cadence, extraHtml, key) {
    return `
      <div class="kpi-card kpi-card--${status}"${key ? ` data-drilldown="${key}"` : ''}>
        <div class="kpi-cadence">${cadence}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value kpi-value--sm">${value}</div>
        ${target ? `<div class="kpi-target">${target}</div>` : ''}
        ${extraHtml || ''}
      </div>`;
  },

  _progressBar(value, total, color) {
    const pct = Math.round((value / total) * 100);
    return `
      <div style="margin-top: 8px;">
        <div class="progress-bar">
          <div class="progress-bar__fill progress-bar__fill--${color}" style="width: ${pct}%;"></div>
        </div>
      </div>`;
  }
};
