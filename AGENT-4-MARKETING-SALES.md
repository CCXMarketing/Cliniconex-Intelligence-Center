# CIC Agent 4 — Marketing and Direct Sales Tabs

## Your Role
You are building the Marketing and Direct Sales department tabs for the
Cliniconex Intelligence Center. You own four files and four files only.

## Your Files (exclusive ownership)
- `tabs/marketing.html`
- `tabs/sales.html`
- `js/modules/marketing.js`
- `js/modules/sales.js`

## Prerequisites (must exist before you run)
- Agent 2 must have completed `css/tokens.css` and `css/components.css`
- Agent 3 must have completed `js/data/mock-marketing.js` and `js/data/mock-sales.js`
- Agent 1 must have completed `js/router.js` (provides the `CIC` global)

## How Your Files Work Together
The router (Agent 1) loads `tabs/marketing.html` as an HTML fragment into the
`#tab-viewport` container, then calls `marketing.js`'s `init()` method.
Your HTML provides the structure; your JS populates it with data.

---

## Critical Rules

1. **Do NOT import mock data files directly.** Use `CIC.getData('marketing')`
   and `CIC.getData('sales')`. The router provides data.
2. **Do NOT include `<html>`, `<head>`, `<body>` tags** in tab HTML files.
   They are fragments, not full pages.
3. **Use only CSS class names defined in `css/components.css`** (Agent 2).
4. **Export the standard module interface** from each JS file.
5. **Destroy all Chart.js instances** in `destroy()` to prevent memory leaks.

## Standard Module Interface
```javascript
export default {
  charts: [],  // store all Chart instances here for cleanup

  async init(containerEl, data) {
    // Render content into containerEl using data
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  },

  getSummaryKPIs() {
    // Returns 2–3 key KPIs for the Executive overview card
    return [
      { label: 'MQLs Created', value: '142', delta: '+12%', status: 'yellow' },
      { label: 'HIRO Conversion', value: '24.6%', delta: '+1.2pp', status: 'yellow' },
      { label: 'Pipeline Generated', value: '$1.2M', delta: '+11%', status: 'yellow' }
    ];
  }
}
```

---

## Chart.js Configuration Defaults
Use these colors and options consistently:

```javascript
const CHART_COLORS = {
  green:  '#ADC837',
  teal:   '#02475A',
  cyan:   '#029FB5',
  purple: '#522E76',
  red:    '#E53935',
  orange: '#F57C00',
  grey:   '#9E9E9E',
  greenAlpha: 'rgba(173, 200, 55, 0.15)',
  tealAlpha:  'rgba(2, 71, 90, 0.15)',
};

const CHART_DEFAULTS = {
  font: { family: 'Nunito Sans', size: 12, weight: '600' },
  plugins: {
    legend: { labels: { font: { family: 'Nunito Sans', size: 12 } } }
  }
};
```

---

## File 1: tabs/marketing.html

Structure only — no data values hardcoded. JS fills all values.

```html
<div class="dept-header">
  <div class="dept-header__left">
    <h2>Marketing</h2>
    <p>Demand generation, campaign performance, and pipeline contribution</p>
  </div>
  <div class="dept-header__right">
    <span class="dept-header__meta">Accountable</span>
    <span class="badge badge--green-solid">Ger</span>
    <span class="badge badge--teal">ActiveCampaign</span>
  </div>
</div>

<!-- KPI Overview -->
<div class="section-header">
  <h3>Key Performance Indicators</h3>
  <p>Monthly metrics — data source: ActiveCampaign</p>
</div>
<div class="kpi-grid" id="mkt-kpi-grid">
  <!-- Populated by marketing.js -->
</div>

<!-- Pipeline by Segment -->
<div class="section-header">
  <h3>Pipeline by Segment</h3>
  <p>Actual pipeline value vs. target by vertical segment</p>
</div>
<div class="chart-card">
  <div class="chart-container" style="height: 280px;">
    <canvas id="mkt-segment-chart"></canvas>
  </div>
</div>

<!-- HIRO Conversion Trend -->
<div class="section-header">
  <h3>MOFU-to-BOFU Conversion Trend (HIRO)</h3>
  <p>Monthly HIRO conversion rate — target: 30%</p>
</div>
<div class="chart-card">
  <div class="chart-container" style="height: 220px;">
    <canvas id="mkt-hiro-chart"></canvas>
  </div>
</div>

<!-- Campaign ROI Table -->
<div class="section-header">
  <h3>Campaign and Program ROI</h3>
  <p>Quarterly attribution — requires closed-loop model</p>
</div>
<div class="table-wrapper">
  <table class="data-table" id="mkt-campaign-table">
    <thead>
      <tr>
        <th>Campaign</th>
        <th class="col-right">Spend</th>
        <th class="col-right">Attributed Revenue</th>
        <th class="col-right">ROI</th>
        <th class="col-center">Status</th>
      </tr>
    </thead>
    <tbody id="mkt-campaign-tbody">
      <!-- Populated by marketing.js -->
    </tbody>
  </table>
</div>
```

---

## File 2: js/modules/marketing.js

```javascript
export default {
  charts: [],

  async init(containerEl, data) {
    this._data = data;
    this._renderKPICards(containerEl, data);
    this._renderSegmentChart(data);
    this._renderHIROChart(data);
    this._renderCampaignTable(data);

    // Re-render when scenario changes (some targets are scenario-aware)
    CIC.onScenarioChange(() => this._renderKPICards(containerEl, data));
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
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
        delta: this._calcDelta(k.hiro_conversion_rate.trend, true),
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

  _calcDelta(trend, isPercent = false) {
    if (!trend || trend.length < 2) return '';
    const prev = trend[trend.length - 2];
    const curr = trend[trend.length - 1];
    const pct = ((curr - prev) / prev * 100).toFixed(1);
    return (pct > 0 ? '▲' : '▼') + Math.abs(pct) + '%';
  },

  _renderKPICards(containerEl, data) {
    const grid = containerEl.querySelector('#mkt-kpi-grid');
    if (!grid) return;
    const k = data.kpis;

    const cards = [
      {
        key: 'marketing_created_deals',
        label: k.marketing_created_deals.label,
        value: k.marketing_created_deals.value,
        target: k.marketing_created_deals.target,
        unit: 'count',
        status: k.marketing_created_deals.status,
        cadence: k.marketing_created_deals.cadence,
        trend: k.marketing_created_deals.trend
      },
      {
        key: 'marketing_captured_deals',
        label: k.marketing_captured_deals.label,
        value: k.marketing_captured_deals.value,
        target: k.marketing_captured_deals.target,
        unit: 'count',
        status: k.marketing_captured_deals.status,
        cadence: k.marketing_captured_deals.cadence,
        trend: k.marketing_captured_deals.trend
      },
      {
        key: 'hiro_conversion_rate',
        label: k.hiro_conversion_rate.label,
        value: k.hiro_conversion_rate.value,
        target: k.hiro_conversion_rate.target,
        unit: 'percent',
        status: k.hiro_conversion_rate.status,
        cadence: k.hiro_conversion_rate.cadence,
        trend: k.hiro_conversion_rate.trend
      },
      {
        key: 'pipeline_generated',
        label: k.pipeline_generated.label,
        value: k.pipeline_generated.value,
        target: k.pipeline_generated.target,
        unit: 'currency',
        status: k.pipeline_generated.status,
        cadence: k.pipeline_generated.cadence,
        trend: k.pipeline_generated.trend
      },
      {
        key: 'roas',
        label: k.roas.label,
        value: k.roas.value,
        target: k.roas.target,
        unit: 'multiplier',
        status: k.roas.status,
        cadence: k.roas.cadence,
        trend: k.roas.trend
      },
      {
        key: 'direct_channel_pipeline_pct',
        label: k.direct_channel_pipeline_pct.label,
        value: k.direct_channel_pipeline_pct.value,
        target: k.direct_channel_pipeline_pct.target,
        unit: 'percent',
        status: k.direct_channel_pipeline_pct.status,
        cadence: k.direct_channel_pipeline_pct.cadence,
        trend: k.direct_channel_pipeline_pct.trend
      }
    ];

    grid.innerHTML = cards.map(card => this._buildKPICard(card)).join('');
  },

  _buildKPICard({ label, value, target, unit, status, cadence, trend }) {
    const formattedValue = unit === 'currency' ? CIC.formatCurrency(value)
      : unit === 'percent' ? CIC.formatPercent(value)
      : unit === 'multiplier' ? value.toFixed(1) + 'x'
      : value.toLocaleString();

    const formattedTarget = unit === 'currency' ? CIC.formatCurrency(target)
      : unit === 'percent' ? CIC.formatPercent(target)
      : unit === 'multiplier' ? target.toFixed(1) + 'x'
      : target?.toLocaleString();

    // Simple delta from last two trend points
    let deltaHtml = '';
    if (trend && trend.length >= 2) {
      const prev = trend[trend.length - 2];
      const curr = trend[trend.length - 1];
      const pct = ((curr - prev) / prev * 100).toFixed(1);
      const dir = pct >= 0 ? 'up' : 'down';
      deltaHtml = `<span class="kpi-delta kpi-delta--${dir}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month</span>`;
    }

    return `
      <div class="kpi-card kpi-card--${status}">
        <div class="kpi-cadence">${cadence}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${formattedValue}</div>
        ${deltaHtml}
        ${target != null ? `<div class="kpi-target">Target: ${formattedTarget}</div>` : ''}
      </div>`;
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
            callbacks: {
              label: ctx => CIC.formatCurrency(ctx.raw)
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: v => CIC.formatCurrency(v),
              font: { family: 'Nunito Sans', size: 11 }
            }
          },
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
          y: {
            min: 15,
            max: 35,
            ticks: {
              callback: v => v + '%',
              font: { family: 'Nunito Sans', size: 11 }
            }
          },
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
```

---

## File 3: tabs/sales.html

```html
<div class="dept-header">
  <div class="dept-header__left">
    <h2>Direct Sales</h2>
    <p>Revenue attainment, quota performance, pipeline health, and new segment growth</p>
  </div>
  <div class="dept-header__right">
    <span class="dept-header__meta">Accountable</span>
    <span class="badge badge--green-solid">Zach</span>
    <span class="badge badge--teal">Salesforce</span>
    <span class="badge badge--blue">ActiveCampaign</span>
  </div>
</div>

<!-- MRR Target Tracker -->
<div class="section-header">
  <h3>New MRR Added — Scenario Tracker</h3>
  <p>Current month actual vs. Threshold / Target / Overachieve scenarios</p>
</div>
<div class="target-tracker" id="sales-mrr-tracker">
  <!-- Populated by sales.js -->
</div>

<!-- KPI Cards -->
<div class="section-header">
  <h3>Key Performance Indicators</h3>
</div>
<div class="kpi-grid" id="sales-kpi-grid">
  <!-- Populated by sales.js -->
</div>

<!-- Quota Attainment by Rep -->
<div class="section-header">
  <h3>Quota Attainment by Rep</h3>
  <p>Individual performance vs. monthly quota</p>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Rep</th>
        <th class="col-right">Quota</th>
        <th class="col-right">Actual</th>
        <th>Attainment</th>
        <th class="col-center">Status</th>
      </tr>
    </thead>
    <tbody id="sales-quota-tbody">
      <!-- Populated by sales.js -->
    </tbody>
  </table>
</div>

<!-- Revenue Mix Chart -->
<div class="section-header">
  <h3>Revenue Mix — New Logo vs. Expansion</h3>
</div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
  <div class="chart-card">
    <div class="chart-card__title">Current Month Mix</div>
    <div class="chart-container" style="height: 220px;">
      <canvas id="sales-mix-chart"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <div class="chart-card__title">New MRR Trend</div>
    <div class="chart-container" style="height: 220px;">
      <canvas id="sales-mrr-trend-chart"></canvas>
    </div>
  </div>
</div>

<!-- New Segment Bookings -->
<div class="section-header">
  <h3>New Segment Bookings</h3>
  <p>Senior Living, US Medical, Hospital — actual vs. monthly target</p>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Segment</th>
        <th class="col-right">Actual MRR</th>
        <th class="col-right">Monthly Target</th>
        <th class="col-right">Annual Target</th>
        <th>Progress</th>
        <th class="col-center">Status</th>
      </tr>
    </thead>
    <tbody id="sales-segment-tbody">
      <!-- Populated by sales.js -->
    </tbody>
  </table>
</div>

<!-- Sales Cycle by Segment -->
<div class="section-header">
  <h3>Sales Cycle Length by Segment</h3>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Segment</th>
        <th class="col-right">Avg Days to Close</th>
        <th class="col-right">Target</th>
      </tr>
    </thead>
    <tbody id="sales-cycle-tbody">
      <!-- Populated by sales.js -->
    </tbody>
  </table>
</div>

<!-- Adjacent Vertical Deals -->
<div class="section-header">
  <h3>Adjacent Vertical Deals</h3>
  <p>Target: 5 deals in one adjacent vertical by year-end</p>
</div>
<div class="kpi-card kpi-card--red" style="max-width: 400px; margin-bottom: 16px;">
  <div class="kpi-label">Deals Closed YTD</div>
  <div class="kpi-value" id="sales-adj-value">—</div>
  <div class="kpi-target">Target: 5 cumulative by year-end</div>
</div>
<div class="table-wrapper" id="sales-adj-table-wrap">
  <!-- Populated by sales.js -->
</div>
```

---

## File 4: js/modules/sales.js

Build the full renderer for the Direct Sales tab. Follow the same pattern as
marketing.js with these specific requirements:

**MRR Target Tracker** — render a `.target-tracker` showing:
- Current actual new MRR added ($34,800)
- A horizontal bar with the actual fill
- Three vertical marker lines at threshold ($32,039), target ($39,334), overachieve ($46,629)
- Each marker labeled below the bar
- The bar width = actual / overachieve * 100%, capped at 100%
- Update marker positions and values when scenario changes via `CIC.onScenarioChange()`

**KPI Cards** — render cards for:
- Expansion Revenue (value, target, trend delta)
- New Logo Revenue (value, target, trend delta)
- Win Rate (value as %, target as %)
- Average Deal Size ACV (value in $, target in $)
- Pipeline Coverage Ratio (value as Xx, target 3.0x)
- Opportunities Created (value vs. scenario-aware target)

**Quota Attainment Table** — for each rep (Rebecca, Tanner, Chuk, Nathan):
- Name | Quota | Actual | Progress bar (attainment %) | Status badge
- Color the progress bar: ≥100% green, ≥80% yellow, <80% red

**Revenue Mix Chart** — Donut chart:
- Labels: ['New Logo', 'Expansion']
- Values: [new_logo_revenue.value, expansion_revenue.value]
- Colors: [green, teal]

**New MRR Trend Chart** — Line chart:
- Dataset: new_mrr_added.trend values
- Labels: new_mrr_added.trend_labels
- Target line at current scenario target value

**New Segment Bookings Table** — for each segment:
- Segment name | Actual MRR | Monthly target | Annual target | Progress bar (actual/annual*100%) | Status badge

**Sales Cycle Table** — for each segment from `sales_cycle_length.by_segment`:
- Segment | Days | Target (38 days overall) with color coding

**Adjacent Vertical Deals** — update the `#sales-adj-value` with count,
then if deals array is non-empty, render a table inside `#sales-adj-table-wrap`.

**getSummaryKPIs()** returns:
```javascript
[
  { label: 'New MRR Added', value: CIC.formatCurrency(34800), delta: '...', status: 'yellow' },
  { label: 'Win Rate', value: '31.2%', delta: '...', status: 'yellow' },
  { label: 'Quota Attainment', value: '90%', delta: '', status: 'yellow' }
  // 90% = average of all reps
]
```

---

## Validation
Before finishing:
- [ ] Both HTML files have no `<html>`, `<head>`, or `<body>` tags
- [ ] Both JS files export `{ init, destroy, getSummaryKPIs }`
- [ ] `destroy()` calls `.destroy()` on all Chart.js instances
- [ ] No direct imports of mock data files — all data comes through `init(containerEl, data)`
- [ ] `getSummaryKPIs()` returns an array with 2–3 items
- [ ] Scenario toggle on the MRR tracker updates when `CIC.onScenarioChange()` fires

## Constraints
- Only modify your four files
- Use only CSS classes from `css/components.css`
- No server calls, no fetch() to APIs — data comes from the `data` parameter in `init()`
