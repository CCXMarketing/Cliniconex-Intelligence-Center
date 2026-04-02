import { Drilldown } from './drilldown.js';

export default {
  charts: [],
  _data: null,
  _targets: null,
  _scenarioUnsub: null,

  async init(containerEl, data) {
    this._data = data;

    // Load revenue targets
    const targets = await CIC.getData('revenue-targets');
    this._targets = targets;

    this._renderHealthStrip(containerEl, data);
    this._renderScenarioToggle(containerEl);
    this._renderHighlights(containerEl, data);
    this._renderMRRChart(data, targets);
    await this._renderDeptGrid(containerEl);

    // Subscribe to scenario changes
    this._scenarioUnsub = (scenario) => {
      this._updateMRRChart(scenario);
      this._updateToggleButtons(containerEl, scenario);
      this._updateHealthStripTarget(scenario);
    };
    CIC.onScenarioChange(this._scenarioUnsub);
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    Drilldown.close();
    // Note: CIC.onScenarioChange does not provide an unsubscribe mechanism,
    // but the listener becomes a no-op once charts are destroyed.
    this._scenarioUnsub = null;
  },

  getSummaryKPIs() {
    return [
      { label: 'Current MRR', value: '$776.9K', delta: 'On Target', status: 'green' },
      { label: 'YTD Revenue', value: '$2.26M', delta: '+0.9%', status: 'green' },
      { label: 'EBITDA YTD', value: '$241K', delta: '-12%', status: 'yellow' }
    ];
  },

  // ── Health Strip ──

  _renderHealthStrip(containerEl, data) {
    const strip = containerEl.querySelector('#exec-health-strip');
    if (!strip) return;

    const r = data.revenue;
    const h = data.company_health;

    strip.innerHTML = `
      <div class="health-metric">
        <div class="health-metric__label">Current MRR</div>
        <div class="health-metric__value">${CIC.formatCurrency(r.current_mrr)}</div>
        <div class="health-metric__sub health-metric__status" id="exec-mrr-sub">vs Target ${CIC.formatCurrency(r.mrr_targets.target)} &#10003;</div>
      </div>
      <div class="health-metric">
        <div class="health-metric__label">YTD Revenue</div>
        <div class="health-metric__value">${CIC.formatCurrency(r.ytd_revenue)}</div>
        <div class="health-metric__sub health-metric__status">vs Plan ${CIC.formatCurrency(r.ytd_target)} &#9650;</div>
      </div>
      <div class="health-metric">
        <div class="health-metric__label">EBITDA YTD</div>
        <div class="health-metric__value">${CIC.formatCurrency(h.ebitda_ytd)}</div>
        <div class="health-metric__sub health-metric__status--warn">vs Plan ${CIC.formatCurrency(h.ebitda_target_ytd)} — behind</div>
      </div>
      <div class="health-metric">
        <div class="health-metric__label">Revenue Per Employee</div>
        <div class="health-metric__value">${CIC.formatCurrency(h.revenue_per_employee)}</div>
        <div class="health-metric__sub health-metric__status--warn">vs Target ${CIC.formatCurrency(h.rpe_target)}</div>
      </div>
      <div class="health-metric">
        <div class="health-metric__label">Active Customers</div>
        <div class="health-metric__value">${h.active_customers.toLocaleString()}</div>
        <div class="health-metric__sub health-metric__status">+${h.customer_growth_pct}% growth</div>
      </div>
    `;
  },

  // ── Scenario Toggle ──

  _renderScenarioToggle(containerEl) {
    const current = CIC.getScenario();
    const toggle = containerEl.querySelector('#exec-scenario-toggle');
    if (!toggle) return;

    const buttons = toggle.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scenario === current);
      btn.addEventListener('click', () => {
        CIC.setScenario(btn.dataset.scenario);
      });
    });
  },

  _updateToggleButtons(containerEl, scenario) {
    const buttons = containerEl.querySelectorAll('#exec-scenario-toggle button');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scenario === scenario);
    });
  },

  _updateHealthStripTarget(scenario) {
    if (!this._targets || !this._data) return;
    const monthKey = this._targets.current_month;
    const scenarioData = this._targets.scenarios[scenario];
    if (!scenarioData) return;
    const mrrTarget = scenarioData.monthly[monthKey].eom_mrr;
    const mrrSub = document.getElementById('exec-mrr-sub');
    if (mrrSub) {
      const actual = this._data.revenue.current_mrr;
      const label = scenario.charAt(0).toUpperCase() + scenario.slice(1);
      const diff = actual >= mrrTarget ? '\u2713' : '\u2014 behind';
      mrrSub.textContent = `vs ${label} ${CIC.formatCurrency(mrrTarget)} ${diff}`;
      mrrSub.className = actual >= mrrTarget
        ? 'health-metric__sub health-metric__status'
        : 'health-metric__sub health-metric__status--warn';
    }
  },

  // ── Highlights ──

  _renderHighlights(containerEl, data) {
    const list = containerEl.querySelector('#exec-highlights');
    if (!list) return;

    const iconMap = { green: '&#10003;', yellow: '&#9888;', red: '&#10005;' };

    list.innerHTML = data.highlights.map(h => `
      <div class="highlight-row highlight-row--${h.type}">
        <span class="highlight-row__icon">${iconMap[h.type] || ''}</span>
        <span>${h.text}</span>
      </div>
    `).join('');
  },

  // ── MRR Chart ──

  _renderMRRChart(data, targets) {
    const canvas = document.getElementById('exec-mrr-chart');
    if (!canvas || !targets || !targets.scenarios) return;

    const months = targets.month_labels;
    const currentIdx = targets.current_month_index;
    const ordered = targets.months_ordered;
    const scenario = CIC.getScenario();

    // Actuals: only months with data
    const actuals = months.map((_, i) => {
      const entry = data.revenue.actuals_by_month[i];
      return entry ? entry.mrr : null;
    });

    // Build scenario line datasets
    const scenarioConfigs = [
      { key: 'threshold',   label: 'Threshold',   color: '#9E9E9E' },
      { key: 'target',      label: 'Target',       color: '#9E9E9E' },
      { key: 'overachieve', label: 'Overachieve',  color: '#9E9E9E' }
    ];

    const lineDatasets = scenarioConfigs.map(sc => {
      const lineData = ordered.map(m => targets.scenarios[sc.key].monthly[m].eom_mrr);
      const isActive = sc.key === scenario;
      return {
        type: 'line',
        label: sc.label,
        data: lineData,
        borderColor: isActive ? '#ADC837' : '#9E9E9E',
        borderDash: isActive ? [] : [6, 3],
        borderWidth: isActive ? 3 : 1.5,
        pointRadius: isActive ? 3 : 0,
        pointBackgroundColor: isActive ? '#ADC837' : '#9E9E9E',
        fill: false,
        tension: 0.3,
        order: isActive ? 0 : 1
      };
    });

    // Bar colors: teal for actuals, light grey for future
    const barColors = months.map((_, i) => i <= currentIdx ? '#02475A' : '#E1E6EF');

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            type: 'bar',
            label: 'Actual MRR',
            data: actuals,
            backgroundColor: barColors,
            borderRadius: 4,
            barPercentage: 0.6,
            order: 2
          },
          ...lineDatasets
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            ticks: {
              callback: v => CIC.formatCurrency(v),
              font: { family: 'Nunito Sans', size: 11 }
            }
          },
          x: {
            ticks: { font: { family: 'Nunito Sans', size: 11 } }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'Nunito Sans', size: 12 } }
          },
          tooltip: {
            callbacks: { label: ctx => `${ctx.dataset.label}: ${CIC.formatCurrency(ctx.raw)}` }
          }
        }
      }
    });
    this.charts.push(chart);
    this._mrrChart = chart;
  },

  _updateMRRChart(scenario) {
    const chart = this._mrrChart;
    if (!chart) return;

    // Datasets: index 0 = bars, 1-3 = scenario lines
    const scenarioKeys = ['threshold', 'target', 'overachieve'];
    for (let i = 0; i < scenarioKeys.length; i++) {
      const ds = chart.data.datasets[i + 1];
      const isActive = scenarioKeys[i] === scenario;
      ds.borderColor = isActive ? '#ADC837' : '#9E9E9E';
      ds.borderDash = isActive ? [] : [6, 3];
      ds.borderWidth = isActive ? 3 : 1.5;
      ds.pointRadius = isActive ? 3 : 0;
      ds.pointBackgroundColor = isActive ? '#ADC837' : '#9E9E9E';
      ds.order = isActive ? 0 : 1;
    }
    chart.update();
  },

  // ── Department Summary Grid ──
  // Note: getSummaryKPIs() requires _data to be set on each module.
  // Since modules are ES module singletons, if a dept tab has been visited,
  // _data will already be set. If not visited yet, the card shows placeholder values.

  async _renderDeptGrid(containerEl) {
    const depts = [
      { id: 'marketing',        label: 'Marketing',         color: '#ADC837', module: '../modules/marketing.js' },
      { id: 'sales',            label: 'Direct Sales',       color: '#02475A', module: '../modules/sales.js' },
      { id: 'partnerships',     label: 'Partnerships',       color: '#029FB5', module: '../modules/partnerships.js' },
      { id: 'customer-success', label: 'Customer Success',   color: '#522E76', module: '../modules/customer-success.js' },
      { id: 'support',          label: 'Customer Support',   color: '#9E9E9E', module: '../modules/support.js' },
      { id: 'product',          label: 'Product',            color: '#F57C00', module: '../modules/product.js' }
    ];

    const grid = containerEl.querySelector('#exec-dept-grid');
    if (!grid) return;

    for (const dept of depts) {
      let kpis = [];
      try {
        const mod = await import(dept.module);
        if (mod.default && typeof mod.default.getSummaryKPIs === 'function') {
          kpis = mod.default.getSummaryKPIs();
        }
      } catch {
        // Module not yet built — show empty card
      }

      // If module has no data loaded yet, show placeholder
      if (!kpis || kpis.length === 0) {
        kpis = [{ label: 'Data', value: '—', delta: '', status: 'grey' }];
      }

      const card = document.createElement('div');
      card.className = 'exec-dept-card';
      card.style.borderTopColor = dept.color;
      card.innerHTML = `
        <div class="exec-dept-card__name">
          <a href="#${dept.id}" onclick="CIC.navigate('${dept.id}')" style="color: inherit; text-decoration: none;">
            ${dept.label} &rarr;
          </a>
        </div>
        <div class="exec-dept-card__kpis">
          ${kpis.map(k => `
            <div class="exec-kpi-row">
              <span class="exec-kpi-row__label">${k.label}</span>
              <span class="exec-kpi-row__value ${k.status === 'red' ? 'text-red' : k.status === 'green' ? 'text-green' : ''}">${k.value}</span>
            </div>
          `).join('')}
        </div>`;
      grid.appendChild(card);
    }
  }
};
