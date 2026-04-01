# CIC Agent 5 — Channel Partnerships, Customer Success, and Customer Support Tabs

## Your Role
You are building three department tabs for the Cliniconex Intelligence Center.

## Your Files (exclusive ownership)
- `tabs/partnerships.html`
- `tabs/customer-success.html`
- `tabs/support.html`
- `js/modules/partnerships.js`
- `js/modules/customer-success.js`
- `js/modules/support.js`

## Prerequisites (must exist before you run)
- Agent 2 must have completed `css/tokens.css` and `css/components.css`
- Agent 3 must have completed the relevant mock data files
- Agent 1 must have completed `js/router.js` (provides `CIC` global)

## Critical Rules
Same as Agent 4:
1. Do NOT import mock data files directly — use `CIC.getData()` via `init(containerEl, data)`
2. No `<html>`, `<head>`, `<body>` tags in HTML files (they are fragments)
3. Only use CSS classes from `css/components.css`
4. Export `{ init, destroy, getSummaryKPIs }` from every module
5. Destroy all Chart.js instances in `destroy()`

## Standard Module Interface
```javascript
export default {
  charts: [],
  _data: null,

  async init(containerEl, data) { ... },
  destroy() { this.charts.forEach(c => c.destroy()); this.charts = []; },
  getSummaryKPIs() { return [...]; }
}
```

---

# TAB A: Channel Partnerships

## tabs/partnerships.html

```html
<div class="dept-header">
  <div class="dept-header__left">
    <h2>Channel Partnerships</h2>
    <p>Partner revenue concentration, MxC ramp, new channel development, and Senior Living growth</p>
  </div>
  <div class="dept-header__right">
    <span class="dept-header__meta">Accountable</span>
    <span class="badge badge--green-solid">Bex / Ange</span>
    <span class="badge badge--teal">Salesforce</span>
    <span class="badge badge--blue">PRM</span>
  </div>
</div>

<!-- Concentration Risk Alert -->
<div class="highlights-list" id="partnerships-alerts">
  <!-- Populated by partnerships.js -->
</div>

<!-- Partner Revenue Mix -->
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
  <div class="chart-card">
    <div class="chart-card__title">Partner Revenue Mix (Current Month)</div>
    <div class="chart-card__subtitle">Target: PCC + QHR below 80%</div>
    <div class="chart-container" style="height: 260px;">
      <canvas id="partners-donut-chart"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <div class="chart-card__title">Partner Concentration Trend</div>
    <div class="chart-card__subtitle">PCC + QHR combined % of total MRR</div>
    <div class="chart-container" style="height: 260px;">
      <canvas id="partners-concentration-chart"></canvas>
    </div>
  </div>
</div>

<!-- Partner MRR Table -->
<div class="section-header">
  <h3>Revenue by Partner</h3>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Partner</th>
        <th class="col-right">Current MRR</th>
        <th class="col-right">% of Total</th>
        <th>Trend (4 mo)</th>
      </tr>
    </thead>
    <tbody id="partners-mrr-tbody">
      <!-- Populated by partnerships.js -->
    </tbody>
  </table>
</div>

<!-- MxC Ramp -->
<div class="section-header">
  <h3>MatrixCare Revenue Ramp</h3>
  <p>Actual MRR growth vs. trajectory to $409K annual target</p>
</div>
<div class="chart-card">
  <div class="chart-container" style="height: 220px;">
    <canvas id="partners-mxc-chart"></canvas>
  </div>
</div>

<!-- Partner Pipeline Coverage -->
<div class="section-header">
  <h3>Partner Pipeline Coverage</h3>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Partner</th>
        <th class="col-right">Pipeline</th>
        <th class="col-right">Target</th>
        <th class="col-right">Coverage</th>
        <th class="col-center">Status</th>
      </tr>
    </thead>
    <tbody id="partners-pipeline-tbody">
      <!-- Populated by partnerships.js -->
    </tbody>
  </table>
</div>

<!-- SL Partner Revenue -->
<div class="section-header">
  <h3>Senior Living Partner Revenue</h3>
  <p>PCC SL and MxC SL — target: $327K annual</p>
</div>
<div id="partners-sl-grid" class="kpi-grid">
  <!-- Populated by partnerships.js -->
</div>

<!-- New Channel Development -->
<div class="section-header">
  <h3>New Channel Development</h3>
  <p>Non-reseller deals, new partner activation, outreach volume</p>
</div>
<div id="partners-new-channel-grid" class="kpi-grid">
  <!-- Populated by partnerships.js -->
</div>
```

## js/modules/partnerships.js

Build the full renderer. Key requirements:

**Concentration Alert** — inject into `#partnerships-alerts` a red highlight row:
`"PCC + QHR concentration at 89.7% — target is 80% by year-end. Trend is improving."`

**Partner Donut Chart** (`#partners-donut-chart`):
- Labels from `revenue_by_partner.partners` array (PCC, QHR, MxC, Direct, Other)
- Data: each partner's `pct` value
- Colors: [teal, cyan, green, purple, grey]
- Show concentration % in center using a custom plugin or subtitle

**Concentration Trend Line Chart** (`#partners-concentration-chart`):
- Calculate combined PCC+QHR % from the `trend` arrays for each of the 4 months
- Single line, red color
- Dashed horizontal line at target 80%
- Labels from trend_labels ('Dec', 'Jan', 'Feb', 'Mar')

**Partner MRR Table** — rows from `revenue_by_partner.partners`:
- Partner | MRR (formatted $) | % (with color: >15% = yellow or red, <10% = fine) | 
  Mini trend arrow (▲/▼ based on first vs last trend value)

**MxC Ramp Chart** (`#partners-mxc-chart`):
- Line chart using `mxc_revenue_ramp.trend` data
- Show a projected "forecast" line extending to $409K at month 12
- Actual line in green, forecast dotted in grey

**Partner Pipeline Coverage Table** — from `partner_pipeline_coverage.by_partner`:
- Partner | Pipeline ($) | Target ($) | Coverage (Xx) | Status badge
- Color coverage: ≥3.0x green, ≥2.0x yellow, <2.0x red

**Senior Living Grid** — two KPI cards:
- PCC SL: current MRR, trend delta
- MxC SL: current MRR, trend delta
- Pull from `sl_partner_revenue.by_partner`

**New Channel Development Grid** — three KPI cards:
- Non-Reseller Deals: `non_reseller_deals.value` of `target_ytd` with red status
- New Partner Activation: `new_partner_activation.value` of `target` with red status
- New Partner Outreach: `new_partner_outreach.value` vs `target` with yellow status

**getSummaryKPIs()**:
```javascript
[
  { label: 'PCC+QHR Concentration', value: '89.7%', delta: '▼0.4pp', status: 'red' },
  { label: 'MxC MRR', value: '$42K', delta: '▲44%', status: 'green' },
  { label: 'SL Partner Revenue', value: '$14.2K', delta: '▲27%', status: 'yellow' }
]
```

---

# TAB B: Customer Success

## tabs/customer-success.html

```html
<div class="dept-header">
  <div class="dept-header__left">
    <h2>Customer Success</h2>
    <p>Retention, health scores, at-risk accounts, churn prevention, and expansion</p>
  </div>
  <div class="dept-header__right">
    <span class="dept-header__meta">Accountable</span>
    <span class="badge badge--green-solid">Cathy</span>
    <span class="badge badge--teal">Salesforce</span>
  </div>
</div>

<!-- Key Retention Metrics -->
<div class="section-header">
  <h3>Retention Overview</h3>
</div>
<div class="kpi-grid" id="cs-retention-grid">
  <!-- Populated by customer-success.js -->
</div>

<!-- Health Score Distribution -->
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
  <div class="chart-card">
    <div class="chart-card__title">Health Score Distribution</div>
    <div class="chart-card__subtitle">Current month — % of accounts by health status</div>
    <div class="chart-container" style="height: 240px;">
      <canvas id="cs-health-donut"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <div class="chart-card__title">Health Score Trend</div>
    <div class="chart-card__subtitle">Monthly evolution — Green / Yellow / Red %</div>
    <div class="chart-container" style="height: 240px;">
      <canvas id="cs-health-trend"></canvas>
    </div>
  </div>
</div>

<!-- At-Risk Accounts -->
<div class="section-header">
  <h3>At-Risk Account Value</h3>
  <p>Accounts in Red health status — weekly priority list</p>
</div>
<div class="kpi-card kpi-card--red" style="max-width: 360px; margin-bottom: 16px;">
  <div class="kpi-cadence">Weekly</div>
  <div class="kpi-label">Total At-Risk MRR</div>
  <div class="kpi-value" id="cs-at-risk-value">—</div>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Account</th>
        <th>Segment</th>
        <th class="col-right">MRR</th>
        <th>Risk Reason</th>
        <th class="col-center">Health</th>
      </tr>
    </thead>
    <tbody id="cs-at-risk-tbody">
      <!-- Populated by customer-success.js -->
    </tbody>
  </table>
</div>

<!-- Churn Rate by Segment -->
<div class="section-header">
  <h3>Churn Rate by Segment</h3>
  <p>Monthly churn rate actual vs. target</p>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Segment</th>
        <th class="col-right">Actual Churn %</th>
        <th class="col-right">Target</th>
        <th class="col-center">Status</th>
      </tr>
    </thead>
    <tbody id="cs-churn-tbody">
      <!-- Populated by customer-success.js -->
    </tbody>
  </table>
</div>

<!-- Churn Revenue Tracker -->
<div class="section-header">
  <h3>Churn Revenue — Actual vs. Budget</h3>
</div>
<div class="kpi-grid" id="cs-churn-revenue-grid">
  <!-- Populated by customer-success.js -->
</div>

<!-- Time to Value Chart -->
<div class="section-header">
  <h3>Time-to-Value (Implementation)</h3>
  <p>Average days from contract signed to customer live — target: 28 days</p>
</div>
<div class="chart-card">
  <div class="chart-container" style="height: 200px;">
    <canvas id="cs-ttv-chart"></canvas>
  </div>
</div>

<!-- Additional KPIs -->
<div class="section-header">
  <h3>Additional Metrics</h3>
</div>
<div class="kpi-grid" id="cs-additional-grid">
  <!-- Populated by customer-success.js -->
</div>
```

## js/modules/customer-success.js

Build the full renderer. Key requirements:

**Retention Overview Grid** (`#cs-retention-grid`) — 4 KPI cards:
- Gross Retention Rate: value%, target%, trend delta, status
- Net Revenue Retention (NRR): value%, target%, trend delta, status
- Churn Revenue MTD: actual $ vs. budget $, status green (under budget is good)
- CSAT: score/100, target, status

**Health Donut Chart** (`#cs-health-donut`):
- Colors: green (#4CAF50), yellow (#FFC107), red (#F44336)
- Data: [68.2, 24.1, 7.7] from `health_score_distribution`
- Legend below chart

**Health Trend Chart** (`#cs-health-trend`):
- Stacked area chart or grouped bar (4 months)
- Three datasets: Green, Yellow, Red percentages
- Data from `health_score_distribution.trend`

**At-Risk Value** — populate `#cs-at-risk-value` with formatted currency
**At-Risk Table** — rows from `at_risk_account_value.accounts`:
- Account name | Segment | MRR ($) | Risk reason | Health badge (red)

**Churn Rate Table** (`#cs-churn-tbody`) — rows from `churn_rate_by_segment.segments`:
- Segment | Actual % | Target % | Status badge
- Color: actual < target = green, within 0.2pp = yellow, over = red

**Churn Revenue Grid** (`#cs-churn-revenue-grid`) — 4 KPI cards:
- MTD Churn Actual vs. Budget
- YTD Churn Actual vs. YTD Budget
- LTC Segment churn vs. budget
- AMB CA churn vs. budget

**Time to Value Chart** (`#cs-ttv-chart`):
- Bar chart, 4 months, with target line at 28 days
- Bars colored: ≤28 green, ≤35 yellow, >35 red

**Additional Grid** (`#cs-additional-grid`) — 3 KPI cards:
- New Product Adoption: 34.2% of 50% target, red, quarterly
- Referral Influenced %: 2.8% of 10% target, red, with progress bar note
- Time-to-Value: 34 days vs 28 target, yellow

**getSummaryKPIs()**:
```javascript
[
  { label: 'Gross Retention', value: '98.8%', delta: '+0.1pp', status: 'yellow' },
  { label: 'At-Risk MRR', value: '$62.4K', delta: '', status: 'yellow' },
  { label: 'NRR', value: '101.4%', delta: '+0.3pp', status: 'yellow' }
]
```

---

# TAB C: Customer Support

## tabs/support.html

```html
<div class="dept-header">
  <div class="dept-header__left">
    <h2>Customer Support</h2>
    <p>Ticket volume, resolution time, escalation rates, and operational efficiency</p>
  </div>
  <div class="dept-header__right">
    <span class="dept-header__meta">Accountable</span>
    <span class="badge badge--grey">TBD</span>
    <span class="badge badge--teal">Salesforce</span>
    <span class="badge badge--blue">JIRA</span>
  </div>
</div>

<!-- KPI Overview -->
<div class="kpi-grid" id="support-kpi-grid">
  <!-- Populated by support.js -->
</div>

<!-- Ticket Volume Chart -->
<div class="section-header">
  <h3>Ticket Volume Trend</h3>
  <p>External (Salesforce) vs. Internal (JIRA) — lower is better</p>
</div>
<div class="chart-card">
  <div class="chart-container" style="height: 240px;">
    <canvas id="support-volume-chart"></canvas>
  </div>
</div>

<!-- Resolution Time by Priority -->
<div class="section-header">
  <h3>Average Resolution Time by Priority</h3>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Priority</th>
        <th class="col-right">Actual (hours)</th>
        <th class="col-right">Target</th>
        <th class="col-center">Status</th>
      </tr>
    </thead>
    <tbody id="support-resolution-tbody">
      <!-- Populated by support.js -->
    </tbody>
  </table>
</div>

<!-- FCR and Escalation -->
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
  <div class="chart-card">
    <div class="chart-card__title">First-Contact Resolution Trend</div>
    <div class="chart-container" style="height: 200px;">
      <canvas id="support-fcr-chart"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <div class="chart-card__title">Escalation Rate Trend</div>
    <div class="chart-container" style="height: 200px;">
      <canvas id="support-escalation-chart"></canvas>
    </div>
  </div>
</div>

<!-- Efficiency Metrics -->
<div class="section-header">
  <h3>Operational Efficiency</h3>
</div>
<div class="kpi-grid" id="support-efficiency-grid">
  <!-- Populated by support.js -->
</div>

<!-- Not Yet Measurable -->
<div class="section-header">
  <h3>Pending Implementation</h3>
</div>
<div id="support-pending-grid" class="kpi-grid">
  <!-- CES card rendered by support.js -->
</div>
```

## js/modules/support.js

Build the full renderer. Key requirements:

**KPI Overview Grid** (`#support-kpi-grid`) — 4 cards:
- Ticket Volume: 284, trend delta (↓ is good — note "lower is better"), green status
- First-Contact Resolution: 62.4% vs 75% target, yellow
- Average Resolution Time: 18.4 hrs vs 16.0 target, yellow
- Escalation Rate: 8.4% vs 6.0% target, yellow

**Ticket Volume Chart** (`#support-volume-chart`):
- Stacked bar chart showing External + Internal by month
- Colors: teal (External), cyan (Internal)
- Note trend going down (positive)
- Use `ticket_volume.by_type` for current month split,
  extrapolate the split proportionally for trend months

**Resolution Time Table** (`#support-resolution-tbody`):
- P1–P4 rows from `avg_resolution_time.by_priority`
- Status: actual ≤ target = green, within 20% = yellow, >20% over = red

**FCR Trend Chart** (`#support-fcr-chart`):
- Line chart, 4 months, `first_contact_resolution.trend`
- Target line at 75%
- Green line, green fill

**Escalation Rate Chart** (`#support-escalation-chart`):
- Line chart, 4 months, `escalation_rate.trend`
- Target line at 6.0%
- Orange line (higher = worse)

**Efficiency Grid** (`#support-efficiency-grid`) — 2 cards:
- Support Cost Per Customer: $12.40 vs $11.00 target, quarterly, yellow
- Revenue Per Employee: $102,400 vs $110,000 target, quarterly, yellow

**Pending Implementation** (`#support-pending-grid`):
- CES card rendered with `.kpi-card--grey`
- Value shows "—" with a `.not-measurable` div below: 
  "Not yet measurable — requires post-ticket survey implementation"
- Status badge: grey / "Planned"

**getSummaryKPIs()**:
```javascript
[
  { label: 'Ticket Volume', value: '284', delta: '▼9%', status: 'green' },
  { label: 'FCR Rate', value: '62.4%', delta: '▲2.2pp', status: 'yellow' },
  { label: 'Escalation Rate', value: '8.4%', delta: '▼0.8pp', status: 'yellow' }
]
```

---

## Shared Chart.js Defaults (use in all three modules)
```javascript
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

Chart.defaults.font.family = 'Nunito Sans';
Chart.defaults.font.size = 12;
```

---

## Validation
Before finishing:
- [ ] All 6 files created
- [ ] All HTML files are fragments (no `<html>`, `<head>`, `<body>` tags)
- [ ] All 3 JS modules export `{ init, destroy, getSummaryKPIs }`
- [ ] `destroy()` clears all chart instances
- [ ] The at-risk accounts table is anonymized ("Account A", "Account B")
- [ ] CES card shows "Not yet measurable" clearly
- [ ] All Chart.js canvases have unique IDs (no duplicates across all tabs)

## Constraints
- Only modify your six files
- Use only CSS classes from `css/components.css`
- No direct mock data imports — data comes through `init(containerEl, data)`
