# CIC Agent 6 — Product, Executive, Squad Views, and Manual Entry

## Your Role
You are building four tabs for the Cliniconex Intelligence Center:
the Product Management tab, the Executive Overview, the Squad View,
and the Manual Data Entry interface.

## Your Files (exclusive ownership)
- `tabs/product.html`
- `tabs/executive.html`
- `tabs/squads.html`
- `tabs/manual-entry.html`
- `js/modules/product.js`
- `js/modules/executive.js`
- `js/modules/squads.js`
- `js/modules/manual-entry.js`

## Prerequisites (must exist before you run)
- Agent 2 must have completed `css/tokens.css` and `css/components.css`
- Agent 3 must have completed `js/data/mock-product.js`, `js/data/mock-executive.js`,
  `js/data/mock-revenue-targets.js`, and `js/data/storage.js`
- Agent 1 must have completed `js/router.js` (provides `CIC` global)

## Critical Rules
Same as Agents 4 and 5:
1. No direct mock data imports — data through `init(containerEl, data)`
2. No `<html>`, `<head>`, `<body>` tags in HTML files
3. Only CSS classes from `css/components.css`
4. Export `{ init, destroy, getSummaryKPIs }` from every module
5. Destroy all Chart.js instances in `destroy()`

---

# TAB A: Product Management

## tabs/product.html

```html
<div class="dept-header">
  <div class="dept-header__left">
    <h2>Product Management</h2>
    <p>AI product launches, pilot programs, customer validations, and engineering delivery</p>
  </div>
  <div class="dept-header__right">
    <span class="dept-header__meta">Accountable</span>
    <span class="badge badge--green-solid">Kristi / Madison</span>
    <span class="badge badge--teal">JIRA</span>
    <span class="badge badge--blue">Salesforce</span>
  </div>
</div>

<!-- AI Innovation KPIs -->
<div class="section-header">
  <h3>AI Innovation</h3>
  <p>Squad: Innovation — OKR: YoY Growth 30% (AI)</p>
</div>
<div class="kpi-grid" id="product-ai-grid">
  <!-- Populated by product.js -->
</div>

<!-- AI Product Roadmap Tracker -->
<div class="section-header">
  <h3>AI Product Roadmap — Q1 2026</h3>
  <p>Target: 3 AI-powered sellable products/features per quarter</p>
</div>
<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        <th>Product / Feature</th>
        <th class="col-center">Quarter</th>
        <th class="col-right">MRR Attributed</th>
        <th class="col-center">Status</th>
      </tr>
    </thead>
    <tbody id="product-roadmap-tbody">
      <!-- Populated by product.js -->
    </tbody>
  </table>
</div>

<!-- AI Skills Progress -->
<div class="section-header">
  <h3>AI Skills Pilots and Customer Validations</h3>
</div>
<div id="product-pilots-grid" class="kpi-grid">
  <!-- Populated by product.js -->
</div>

<!-- Delivery and Quality KPIs -->
<div class="section-header">
  <h3>Delivery and Quality</h3>
  <p>Engineering performance metrics</p>
</div>
<div class="kpi-grid" id="product-delivery-grid">
  <!-- Populated by product.js -->
</div>

<!-- Strategic Allocation -->
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
  <div class="chart-card">
    <div class="chart-card__title">Development Effort Allocation</div>
    <div class="chart-card__subtitle">Target: >90% on strategic initiatives</div>
    <div class="chart-container" style="height: 240px;">
      <canvas id="product-allocation-chart"></canvas>
    </div>
  </div>
  <div class="chart-card">
    <div class="chart-card__title">Say / Do Ratio by Quarter</div>
    <div class="chart-card__subtitle">Target: 90% of committed items delivered</div>
    <div class="chart-container" style="height: 240px;">
      <canvas id="product-saydo-chart"></canvas>
    </div>
  </div>
</div>

<!-- Revenue Attribution -->
<div class="section-header">
  <h3>Enhancement Revenue Attribution</h3>
</div>
<div class="kpi-grid" id="product-revenue-grid">
  <!-- Populated by product.js -->
</div>
```

## js/modules/product.js

Key rendering requirements:

**AI Innovation KPIs Grid** (`#product-ai-grid`) — 4 cards:
- AI Products Launched: `1 of 3 this quarter`, status yellow
- AI Skills Pilots: `12 of 50 annual`, with progress bar below value, status yellow
- Customer Validations: `2 of 7 by Q3`, status yellow
- AI-Specific Revenue MRR: `$18.4K` vs `$33.3K` monthly target, status yellow
- AI Case Studies: `1 of 10 annual`, status red

**Roadmap Table** (`#product-roadmap-tbody`):
- One row per product from `ai_products_launched.products`
- Product name | Quarter | MRR Attributed ($0 for not launched) | Status badge
- Status badge colors: Launched=green, In Progress=blue, Planned=grey

**Pilots Grid** (`#product-pilots-grid`) — 2 cards:
- AI Skills Pilots with `.progress-labeled` showing 12/50 with progress bar fill at 24%
- Customer Validations with 2/7, progress at 29%, note "target by Q3"

**Delivery Grid** (`#product-delivery-grid`) — 3 cards:
- Say/Do Ratio: 84% vs 90% target, yellow, quarterly
- Customer-Facing Bug Reduction: 8.2% vs 15% target, red, quarterly
- Strategic Allocation: 72% vs 90% target, red, quarterly

**Strategic Allocation Donut** (`#product-allocation-chart`):
- 3 segments: Strategic (72%, green), Maintenance (18%, yellow), Ad-hoc (10%, red)
- Show percentage labels on each segment

**Say/Do Bar Chart** (`#product-saydo-chart`):
- Bar chart with Q4 2025 (78%) and Q1 2026 (84%)
- Horizontal target line at 90%
- Bars in teal, target line in red dashed

**Revenue Grid** (`#product-revenue-grid`) — 2 cards:
- Enhancement Revenue (Existing): $42K YTD vs $360K annual, progress bar at 11.7%, yellow
- Enhancement Revenue (New Segments): $8.4K YTD vs $158K annual, progress bar at 5.3%, yellow

**getSummaryKPIs()**:
```javascript
[
  { label: 'AI Products Launched', value: '1/3 this qtr', delta: '', status: 'yellow' },
  { label: 'Say/Do Ratio', value: '84%', delta: '+6pp QoQ', status: 'yellow' },
  { label: 'AI Revenue MRR', value: '$18.4K', delta: '', status: 'yellow' }
]
```

---

# TAB B: Executive Overview

## tabs/executive.html

```html
<!-- Company Health Strip -->
<div class="health-strip" id="exec-health-strip">
  <!-- Populated by executive.js -->
</div>

<!-- Scenario Toggle -->
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
  <h2 style="color: #404041; font-size: 18px;">Revenue Performance</h2>
  <div class="scenario-toggle" id="exec-scenario-toggle">
    <button data-scenario="threshold">Threshold</button>
    <button data-scenario="target">Target</button>
    <button data-scenario="overachieve">Overachieve</button>
  </div>
</div>

<!-- MRR Chart -->
<div class="chart-card" style="margin-bottom: 24px;">
  <div class="chart-card__title">Monthly MRR — Actual vs. Scenario Targets (2026)</div>
  <div class="chart-card__subtitle">Bars: actual MRR | Lines: Threshold / Target / Overachieve targets</div>
  <div class="chart-container" style="height: 300px;">
    <canvas id="exec-mrr-chart"></canvas>
  </div>
</div>

<!-- Highlights -->
<div class="section-header">
  <h3>Executive Highlights</h3>
  <p>Auto-generated from current KPI status</p>
</div>
<div class="highlights-list" id="exec-highlights">
  <!-- Populated by executive.js -->
</div>

<!-- Department Summary -->
<div class="section-header">
  <h3>Department Overview</h3>
  <p>Key metrics from each department — click a department name to navigate</p>
</div>
<div class="exec-summary-grid" id="exec-dept-grid">
  <!-- Populated by executive.js -->
</div>
```

## js/modules/executive.js

This is the most complex module. It aggregates summary data from all other
department modules and renders the company-level view.

**Health Strip** (`#exec-health-strip`) — 5 health metrics:
- Current MRR: `$776,935` with sub-label "vs Target $776,935 ✓"
- YTD Revenue: `$2.26M` with sub-label "vs Plan $2.24M ▲"
- EBITDA YTD: `$241K` with sub-label "vs Plan $275K — behind"
- Revenue Per Employee: `$102.4K` with sub-label "vs Target $110K"
- Active Customers: `3,240` with sub-label "+2.1% growth"
Use `.health-metric__status`, `.health-metric__status--warn`, `.health-metric__status--bad`
for coloring the sub-labels.

**Scenario Toggle** — wire the buttons in `#exec-scenario-toggle`:
- On click: call `CIC.setScenario(scenario)` and re-render the MRR chart
- Set initial active button from `CIC.getScenario()`

**MRR Chart** (`#exec-mrr-chart`):
- Bar chart for actual MRR (Jan-Mar only, greyed out remaining months)
- Three line datasets: Threshold, Target, Overachieve — all 12 months
- Active scenario line is solid and colored (green), others are dashed and grey
- Pull revenue targets from `CIC.getData('revenue-targets')` — async call
- Actuals from `data.revenue.actuals_by_month`
- On scenario change: update line styling (active = solid green, others = dashed grey)

```javascript
// Inside init(), load revenue targets too:
async init(containerEl, data) {
  this._data = data;
  const targets = await CIC.getData('revenue-targets');
  this._targets = targets;
  // ...render
}
```

**Highlights** (`#exec-highlights`):
- Render each item in `data.highlights` as a `.highlight-row--{type}` div
- Green rows get ✓ icon, yellow get ⚠ icon, red get ✕ icon

**Department Summary Grid** (`#exec-dept-grid`):
Import and call `getSummaryKPIs()` from each department module.
This requires dynamic imports:

```javascript
async _renderDeptGrid(containerEl, data) {
  const depts = [
    { id: 'marketing',        label: 'Marketing',           color: '#ADC837', module: '../modules/marketing.js' },
    { id: 'sales',            label: 'Direct Sales',         color: '#02475A', module: '../modules/sales.js' },
    { id: 'partnerships',     label: 'Partnerships',         color: '#029FB5', module: '../modules/partnerships.js' },
    { id: 'customer-success', label: 'Customer Success',     color: '#522E76', module: '../modules/customer-success.js' },
    { id: 'support',          label: 'Customer Support',     color: '#9E9E9E', module: '../modules/support.js' },
    { id: 'product',          label: 'Product',              color: '#F57C00', module: '../modules/product.js' }
  ];

  const grid = containerEl.querySelector('#exec-dept-grid');
  if (!grid) return;

  for (const dept of depts) {
    const mod = await import(dept.module);
    const deptData = await CIC.getData(dept.id);
    // Temporarily init the module to populate _data, then call getSummaryKPIs
    // (or just call getSummaryKPIs if module stores _data statically)
    const kpis = mod.default.getSummaryKPIs ? mod.default.getSummaryKPIs() : [];

    const card = document.createElement('div');
    card.className = 'exec-dept-card';
    card.style.borderTopColor = dept.color;
    card.innerHTML = `
      <div class="exec-dept-card__name">
        <a href="#${dept.id}" onclick="CIC.navigate('${dept.id}')" style="color: inherit; text-decoration: none;">
          ${dept.label} →
        </a>
      </div>
      <div class="exec-dept-card__kpis">
        ${kpis.map(k => `
          <div class="exec-kpi-row">
            <span class="exec-kpi-row__label">${k.label}</span>
            <span class="exec-kpi-row__value ${k.status === 'red' ? 'text-red' : k.status === 'green' ? 'text-green' : ''}">
              ${k.value}
            </span>
          </div>
        `).join('')}
      </div>`;
    grid.appendChild(card);
  }
}
```

Note: `getSummaryKPIs()` requires `_data` to be set on each module.
Since modules are singletons (ES module cache), if a dept tab has been visited,
`_data` will already be set. If not, the exec card will show placeholder "—" values —
this is acceptable Phase 1 behavior. Add a note comment in the code.

**getSummaryKPIs()**:
```javascript
[
  { label: 'Current MRR', value: '$776.9K', delta: 'On Target', status: 'green' },
  { label: 'YTD Revenue', value: '$2.26M', delta: '▲0.9%', status: 'green' },
  { label: 'EBITDA YTD', value: '$241K', delta: '▼12%', status: 'yellow' }
]
```

---

# TAB C: Squad View

## tabs/squads.html

```html
<div style="margin-bottom: 24px;">
  <h2>Squad View</h2>
  <p style="color: #9E9E9E; font-size: 13px; margin-top: 4px;">
    Cross-functional alignment — Growth, Diversification, and Innovation squads
  </p>
</div>

<div id="squads-container">
  <!-- Three squad sections, populated by squads.js -->
</div>
```

## js/modules/squads.js

Render three collapsible `.squad-section` blocks.

**For each squad** (Growth, Diversification, Innovation) from `data.squads`:

```javascript
_buildSquadSection(squad, squadKPIs) {
  // squadKPIs: array of { label, value, status, dept } pulled from relevant modules

  // Calculate squad health: % of KPIs that are 'green'
  const healthPct = Math.round(
    (squadKPIs.filter(k => k.status === 'green').length / squadKPIs.length) * 100
  );
  const healthClass = healthPct >= 70 ? 'text-green' : healthPct >= 40 ? 'text-yellow' : 'text-red';

  return `
    <div class="squad-section">
      <div class="squad-header" onclick="this.parentElement.querySelector('.squad-body').classList.toggle('hidden')">
        <div class="squad-header__left">
          <h3>Squad: ${squad.name}</h3>
          <p>PM: ${squad.pm} · Accountable: ${squad.accountable} · Teams: ${squad.teams.join(', ')}</p>
        </div>
        <div class="squad-header__right">
          <div>
            <div style="font-size: 11px; color: #9E9E9E; text-transform: uppercase; letter-spacing: 0.06em;">Squad Health</div>
            <div class="squad-health-score ${healthClass}">${healthPct}%</div>
          </div>
          <span style="font-size: 20px; color: #9E9E9E;">▾</span>
        </div>
      </div>
      <div class="squad-body">
        <p style="font-size: 13px; color: #9E9E9E; margin-bottom: 16px;">
          <strong>Target:</strong> ${squad.target}
        </p>
        <div class="squad-kpi-grid">
          ${squadKPIs.map(k => `
            <div class="kpi-card kpi-card--${k.status}">
              <div class="kpi-label">${k.label}</div>
              <div class="kpi-value kpi-value--sm">${k.value}</div>
              <div class="kpi-target">${k.dept}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}
```

**KPI data for each squad** — pull from department modules' `getSummaryKPIs()` 
and `_data` where available. Map each squad's `kpi_refs` to the actual values.

For Phase 1, if module data isn't available, show placeholder "—" with grey status.

**Growth Squad KPIs to display:**
New MRR Added, Quota Attainment avg, Expansion Revenue, HIRO Conversion Rate,
Marketing-Created Deals, Gross Retention Rate, NRR, New Product Adoption Rate

**Diversification Squad KPIs to display:**
PCC+QHR Concentration %, MxC Revenue, Non-Reseller Deals, New Partner Activation,
Referral Influenced %, New Segment Bookings (SL + US Med combined), SL Partner Revenue

**Innovation Squad KPIs to display:**
AI Products Launched, AI Skills Pilots, Customer Validations,
AI-Specific Revenue MRR, AI Case Studies, Revenue Per Employee

**getSummaryKPIs()** — returns overall health:
```javascript
[
  { label: 'Growth Health', value: '56%', delta: '', status: 'yellow' },
  { label: 'Diversification Health', value: '29%', delta: '', status: 'red' },
  { label: 'Innovation Health', value: '33%', delta: '', status: 'red' }
]
```

---

# TAB D: Manual Data Entry

## tabs/manual-entry.html

```html
<div class="dept-header" style="background: linear-gradient(135deg, #522E76 0%, #7B4FAA 100%);">
  <div class="dept-header__left">
    <h2>Manual Data Entry</h2>
    <p>Finance, HR, and partner data with no automated API source</p>
  </div>
  <div class="dept-header__right">
    <span class="badge badge--grey">Admin</span>
    <span class="badge badge--grey">Manual Input</span>
  </div>
</div>

<div style="background: #FFF8E1; border: 1px solid #FFE082; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 13px; color: #F57F17; font-weight: 600;">
  ⚠ Data entered here is saved to local storage and used to populate metrics with no API source.
  Phase 2 will sync this data to a shared Google Sheet.
</div>

<!-- Finance Section -->
<div class="manual-entry-form" id="finance-form">
  <div class="manual-entry-form__title">Finance — Monthly Inputs</div>
  <div class="entry-grid" id="finance-fields">
    <!-- Populated by manual-entry.js -->
  </div>
  <button class="btn btn--sm" onclick="window.manualEntry.saveSection('finance')">
    Save Finance Data
  </button>
  <span class="entry-field__save-confirm" id="finance-save-confirm">✓ Saved</span>
</div>

<!-- HR Section -->
<div class="manual-entry-form" id="hr-form">
  <div class="manual-entry-form__title">HR and Headcount — Monthly Inputs</div>
  <div class="entry-grid" id="hr-fields">
    <!-- Populated by manual-entry.js -->
  </div>
  <button class="btn btn--sm" onclick="window.manualEntry.saveSection('hr')">
    Save HR Data
  </button>
  <span class="entry-field__save-confirm" id="hr-save-confirm">✓ Saved</span>
</div>

<!-- Partner Data Section -->
<div class="manual-entry-form" id="partner-form">
  <div class="manual-entry-form__title">Partner Data — Monthly Inputs</div>
  <div class="entry-grid" id="partner-fields">
    <!-- Populated by manual-entry.js -->
  </div>
  <button class="btn btn--sm" onclick="window.manualEntry.saveSection('partner')">
    Save Partner Data
  </button>
  <span class="entry-field__save-confirm" id="partner-save-confirm">✓ Saved</span>
</div>

<!-- Saved Data Summary -->
<div class="section-header">
  <h3>Recently Saved Values</h3>
  <p>Last saved inputs across all sections</p>
</div>
<div class="table-wrapper">
  <table class="data-table" id="manual-summary-table">
    <thead>
      <tr>
        <th>Section</th>
        <th>Field</th>
        <th class="col-right">Value</th>
        <th>Saved At</th>
      </tr>
    </thead>
    <tbody id="manual-summary-tbody">
      <!-- Populated by manual-entry.js -->
    </tbody>
  </table>
</div>
```

## js/modules/manual-entry.js

```javascript
export default {
  charts: [],
  _storage: null,

  async init(containerEl, data) {
    // Load storage module
    const { storage } = await import('../data/storage.js');
    this._storage = storage;

    // Expose save methods globally for onclick handlers
    window.manualEntry = this;

    this._buildFinanceFields(containerEl);
    this._buildHRFields(containerEl);
    this._buildPartnerFields(containerEl);
    await this._loadSavedValues();
    await this._renderSummaryTable(containerEl);
  },

  destroy() {
    window.manualEntry = null;
  },

  getSummaryKPIs() {
    return [
      { label: 'Manual Entry', value: 'Active', delta: '', status: 'green' }
    ];
  },

  // Finance fields definition
  _financeFields: [
    { key: 'ebitda_actual',       label: 'EBITDA Actual (Month)',         type: 'number', prefix: '$',   placeholder: '91700' },
    { key: 'spend_paid_search',   label: 'Paid Search Spend',             type: 'number', prefix: '$',   placeholder: '8000' },
    { key: 'spend_paid_social',   label: 'Paid Social Spend',             type: 'number', prefix: '$',   placeholder: '4000' },
    { key: 'spend_content',       label: 'Content / SEO Spend',           type: 'number', prefix: '$',   placeholder: '2000' },
    { key: 'spend_events',        label: 'Events Spend',                  type: 'number', prefix: '$',   placeholder: '1500' },
    { key: 'support_dept_cost',   label: 'Support Dept Cost (Month)',     type: 'number', prefix: '$',   placeholder: '40000' }
  ],

  // HR fields
  _hrFields: [
    { key: 'total_fte',           label: 'Total FTE Headcount',           type: 'number', prefix: '',    placeholder: '82' },
    { key: 'new_hires_month',     label: 'New Hires This Month',          type: 'number', prefix: '',    placeholder: '0' },
    { key: 'departures_month',    label: 'Departures This Month',         type: 'number', prefix: '',    placeholder: '0' }
  ],

  // Partner data fields
  _partnerFields: [
    { key: 'pcc_self_serve_new',  label: 'PCC Self-Serve New Customers',  type: 'number', prefix: '',    placeholder: '0' },
    { key: 'pcc_pipeline_est',    label: 'PCC Pipeline Estimate ($)',      type: 'number', prefix: '$',   placeholder: '0' }
  ],

  _buildFields(containerEl, sectionId, fields, dept) {
    const container = containerEl.querySelector(`#${sectionId}-fields`);
    if (!container) return;
    container.innerHTML = fields.map(f => `
      <div class="entry-field">
        <label for="field-${f.key}">${f.label}</label>
        <input
          type="${f.type}"
          id="field-${f.key}"
          data-key="${f.key}"
          data-dept="${dept}"
          placeholder="${f.placeholder}"
          class="input-modern"
        >
        <div class="entry-field__last-saved" id="saved-${f.key}">No saved value</div>
      </div>
    `).join('');
  },

  _buildFinanceFields(containerEl) {
    this._buildFields(containerEl, 'finance', this._financeFields, 'finance');
  },

  _buildHRFields(containerEl) {
    this._buildFields(containerEl, 'hr', this._hrFields, 'hr');
  },

  _buildPartnerFields(containerEl) {
    this._buildFields(containerEl, 'partner', this._partnerFields, 'partner');
  },

  async _loadSavedValues() {
    const sections = [
      { dept: 'finance', fields: this._financeFields },
      { dept: 'hr', fields: this._hrFields },
      { dept: 'partner', fields: this._partnerFields }
    ];

    for (const { dept, fields } of sections) {
      for (const f of fields) {
        const saved = await this._storage.get(dept, f.key);
        if (saved) {
          const input = document.getElementById(`field-${f.key}`);
          if (input) input.value = saved.value;
          const meta = document.getElementById(`saved-${f.key}`);
          if (meta) {
            const date = new Date(saved.updated).toLocaleDateString('en-CA');
            meta.textContent = `Last saved: ${saved.value} on ${date}`;
          }
        }
      }
    }
  },

  async saveSection(sectionName) {
    const fieldMap = {
      finance: this._financeFields,
      hr: this._hrFields,
      partner: this._partnerFields
    };
    const fields = fieldMap[sectionName];
    if (!fields) return;

    for (const f of fields) {
      const input = document.getElementById(`field-${f.key}`);
      if (input && input.value !== '') {
        await this._storage.set(sectionName, f.key, input.value);
        const meta = document.getElementById(`saved-${f.key}`);
        if (meta) {
          const date = new Date().toLocaleDateString('en-CA');
          meta.textContent = `Last saved: ${input.value} on ${date}`;
        }
      }
    }

    // Show confirmation
    const confirm = document.getElementById(`${sectionName}-save-confirm`);
    if (confirm) {
      confirm.classList.add('visible');
      setTimeout(() => confirm.classList.remove('visible'), 3000);
    }

    // Refresh summary table
    await this._renderSummaryTable(document.querySelector('#tab-viewport'));
  },

  async _renderSummaryTable(containerEl) {
    const tbody = document.getElementById('manual-summary-tbody');
    if (!tbody) return;

    const sections = [
      { dept: 'finance', label: 'Finance', fields: this._financeFields },
      { dept: 'hr', label: 'HR', fields: this._hrFields },
      { dept: 'partner', label: 'Partner', fields: this._partnerFields }
    ];

    const rows = [];
    for (const { dept, label, fields } of sections) {
      for (const f of fields) {
        const saved = await this._storage.get(dept, f.key);
        if (saved) {
          const date = new Date(saved.updated).toLocaleString('en-CA', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          rows.push({ section: label, field: f.label, value: saved.value, date });
        }
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="color: #9E9E9E; font-style: italic; padding: 24px 16px;">No saved values yet</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><span class="badge badge--blue">${r.section}</span></td>
        <td>${r.field}</td>
        <td class="col-right"><strong>${r.value}</strong></td>
        <td style="color: #9E9E9E; font-size: 12px;">${r.date}</td>
      </tr>
    `).join('');
  }
};
```

---

## Validation
Before finishing:
- [ ] All 8 files created
- [ ] All HTML files are fragments (no `<html>`, `<head>`, `<body>` tags)
- [ ] All 4 JS modules export `{ init, destroy, getSummaryKPIs }`
- [ ] `destroy()` cleans up chart instances and global handlers (`window.manualEntry`)
- [ ] Executive tab loads revenue targets asynchronously (`CIC.getData('revenue-targets')`)
- [ ] Scenario toggle on executive tab updates the MRR chart
- [ ] Squad sections are collapsible on click
- [ ] Manual entry save shows "✓ Saved" for 3 seconds then hides
- [ ] Summary table populates with saved values on load
- [ ] No console errors when visiting any of the 4 tabs

## Constraints
- Only modify your 8 files
- Use only CSS classes from `css/components.css`
- No direct mock data imports — data through `init(containerEl, data)`
- The `window.manualEntry` global must be cleaned up in `destroy()`
