# Cliniconex Intelligence Center (CIC) — Phase 1 Build Plan
## Multi-Agent Parallel Build Strategy

> **Phase 1 scope:** Full structural build with mock data. No live API calls.  
> **Target:** ToolHub-compatible ZIP (index.html at root, static only, CDN dependencies)  
> **Agents:** 6 simultaneous, zero file overlap  
> **Revenue targets:** Threshold $9.6M | Target $10M | Overachieve $10.4M | EBITDA $1.1M

---

## Project File Structure

```
CIC/
├── index.html                        ← AGENT 1 — Shell, nav, tab router
├── css/
│   ├── tokens.css                    ← AGENT 2 — Brand variables, typography scale
│   ├── components.css                ← AGENT 2 — Cards, tables, badges, KPI tiles
│   └── shell.css                     ← AGENT 1 — Nav bar, layout, tab chrome
├── js/
│   ├── router.js                     ← AGENT 1 — Tab switching, URL hash routing
│   ├── data/
│   │   ├── mock-marketing.js         ← AGENT 3 — Marketing mock data
│   │   ├── mock-sales.js             ← AGENT 3 — Direct Sales mock data
│   │   ├── mock-partnerships.js      ← AGENT 3 — Channel Partnerships mock data
│   │   ├── mock-customer-success.js  ← AGENT 3 — Customer Success mock data
│   │   ├── mock-support.js           ← AGENT 3 — Customer Support mock data
│   │   ├── mock-product.js           ← AGENT 3 — Product Management mock data
│   │   ├── mock-executive.js         ← AGENT 3 — Executive/Squad view mock data
│   │   ├── mock-revenue-targets.js   ← AGENT 3 — Monthly MRR targets (all 3 scenarios)
│   │   └── storage.js                ← AGENT 3 — Google Sheets read/write layer
│   └── modules/
│       ├── marketing.js              ← AGENT 4 — Marketing tab renderer
│       ├── sales.js                  ← AGENT 4 — Direct Sales tab renderer
│       ├── partnerships.js           ← AGENT 5 — Channel Partnerships tab renderer
│       ├── customer-success.js       ← AGENT 5 — Customer Success tab renderer
│       ├── support.js                ← AGENT 5 — Customer Support tab renderer
│       ├── product.js                ← AGENT 6 — Product Management tab renderer
│       ├── executive.js              ← AGENT 6 — Executive overview tab renderer
│       ├── squads.js                 ← AGENT 6 — Squad view tab renderer
│       └── manual-entry.js           ← AGENT 6 — Manual data entry (Finance/HR)
└── tabs/
    ├── marketing.html                ← AGENT 4 — Marketing tab HTML
    ├── sales.html                    ← AGENT 4 — Direct Sales tab HTML
    ├── partnerships.html             ← AGENT 5 — Channel Partnerships tab HTML
    ├── customer-success.html         ← AGENT 5 — Customer Success tab HTML
    ├── support.html                  ← AGENT 5 — Customer Support tab HTML
    ├── product.html                  ← AGENT 6 — Product Management tab HTML
    ├── executive.html                ← AGENT 6 — Executive overview tab HTML
    ├── squads.html                   ← AGENT 6 — Squad view tab HTML
    └── manual-entry.html             ← AGENT 6 — Manual entry tab HTML
```

---

## Shared Contracts (Read Before Building — All Agents)

All agents MUST follow these contracts. They are the integration layer between agents.

### CSS Class Naming Convention
```
.kpi-card           — standard metric card container
.kpi-card--green    — positive / on-track status
.kpi-card--yellow   — warning / at-risk status  
.kpi-card--red      — critical / off-track status
.kpi-value          — large primary number
.kpi-label          — metric name beneath value
.kpi-delta          — change indicator (▲ / ▼ + %)
.kpi-target         — target value shown below delta
.section-header     — department section title bar
.data-table         — standard sortable table
.data-table th      — table header cells
.data-table td      — table data cells
.badge              — inline status pill
.badge--green / --yellow / --red / --blue / --grey
.chart-container    — wrapper for Chart.js canvases
.tab-content        — injected tab wrapper (added by router)
.manual-entry-form  — manual data entry form container
.entry-field        — individual form field wrapper
.btn                — primary action button (pill, green)
.btn--secondary     — secondary action button (outlined)
.progress-bar       — horizontal progress bar wrapper
.progress-bar__fill — colored fill element
.scenario-toggle    — Threshold/Target/Overachieve switcher
```

### JavaScript Module Interface (ALL tab modules must export)
Each module in `js/modules/*.js` MUST export:
```javascript
export default {
  // Called by router when tab is activated
  // containerEl is the .tab-content div
  // data is the department's mock data object
  init(containerEl, data) { ... },

  // Called by router when tab is deactivated (cleanup charts, intervals)
  destroy() { ... },

  // Returns array of KPI card data for executive summary
  getSummaryKPIs() { return [{ label, value, delta, status }]; }
}
```

### Router API (provided by Agent 1 in router.js)
All modules can call these globals:
```javascript
CIC.navigate(tabId)           // Switch to tab by id
CIC.getData(department)       // Get mock data for a department
CIC.setData(department, key, value)  // Write to storage layer
CIC.getScenario()             // Returns 'threshold' | 'target' | 'overachieve'
CIC.onScenarioChange(fn)      // Subscribe to scenario changes
CIC.formatCurrency(n)         // Returns '$1.2M' / '$45K' formatted string
CIC.formatPercent(n)          // Returns '23.4%' formatted string
CIC.getStatusClass(value, thresholds) // Returns 'green'|'yellow'|'red'
```

### Tab IDs (used by router, nav, and modules)
```
executive       — Executive Overview
squads          — Squad View
marketing       — Marketing
sales           — Direct Sales
partnerships    — Channel Partnerships
customer-success — Customer Success
support         — Customer Support
product         — Product Management
manual-entry    — Manual Data Entry
```

---

## Agent Assignments

---

### AGENT 1 — Shell, Navigation and Router
**Files owned exclusively:**
- `index.html`
- `css/shell.css`
- `js/router.js`

**Responsibility:**
Build the application shell. This is the frame every other agent's work lives inside.

**index.html must:**
- Load all CSS files (tokens.css, components.css, shell.css) in `<head>`
- Load Chart.js from CDN: `https://cdn.jsdelivr.net/npm/chart.js`
- Load Nunito Sans from Google Fonts
- Render the top nav bar with all tab buttons (using Tab IDs above)
- Render the scenario toggle (Threshold / Target / Overachieve) in the nav
- Include a `<main id="tab-viewport">` container where tab content is injected
- Load all mock data files and all module files via `<script type="module">`
- Initialize the router on DOMContentLoaded

**router.js must:**
- Implement hash-based routing (`#executive`, `#marketing`, etc.)
- On tab change: fetch the tab's HTML file, inject into `#tab-viewport`, then call the module's `init()` method
- On tab deactivate: call the current module's `destroy()` method
- Default route: `#executive`
- Expose the `CIC` global object with all methods listed in the Router API above
- `CIC.getScenario()` reads from `localStorage` key `cic_scenario`, defaults to `'target'`
- `CIC.formatCurrency(n)`: formats numbers as $X.XM or $XXK with 1 decimal
- `CIC.getStatusClass(value, {green, yellow})`: returns color class based on thresholds

**shell.css must:**
- Style the nav bar: teal (#02475A) background, pill-shaped tab buttons
- Active tab button: green (#ADC837) background, dark grey (#404041) text
- Inactive tab buttons: white/70 text, no background
- Scenario toggle: three-button group, active state uses green
- `#tab-viewport`: full remaining viewport height, overflow-y auto
- Responsive: tabs scroll horizontally on narrow viewports
- Portal bar offset: `padding-top: 48px` on body to clear ToolHub injection

---

### AGENT 2 — Design System (Tokens and Components)
**Files owned exclusively:**
- `css/tokens.css`
- `css/components.css`

**Responsibility:**
Build the complete visual component library that all other agents' HTML uses.

**tokens.css must define:**
```css
/* All Cliniconex brand variables */
--green: #ADC837;
--green-light: #C6DC65;
--teal: #02475A;
--cyan: #029FB5;
--purple: #522E76;
--dgrey: #404041;
--dgrey-dark: #303030;
--lgrey: #F4F4F4;
--white: #FFFFFF;
--border: #D2D5DA;
--error: #F44336;
--success: #4CAF50;
--warning: #BF6A02;

/* Spacing scale */
--space-xs: 4px; --space-sm: 8px; --space-md: 16px;
--space-lg: 24px; --space-xl: 32px; --space-2xl: 48px;

/* Type scale */
--text-xs: 11px; --text-sm: 13px; --text-base: 15px;
--text-lg: 18px; --text-xl: 24px; --text-2xl: 32px; --text-3xl: 48px;

/* Radius */
--radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-pill: 20px;

/* Shadows */
--shadow-card: 0 2px 8px rgba(0,0,0,0.08);
--shadow-elevated: 0 4px 16px rgba(0,0,0,0.12);
```

**components.css must style ALL of the following:**

1. **KPI Cards** (`.kpi-card`) — glassmorphism style, white background, subtle border,
   8px radius, padding 20px. Green/yellow/red left border accent 4px wide.
   `.kpi-value` — 36px, weight 800, dark grey.
   `.kpi-label` — 12px, weight 600, uppercase, letter-spacing 0.08em, teal.
   `.kpi-delta` — 13px, green for positive, red for negative, with ▲/▼ prefix.
   `.kpi-target` — 12px, grey, "Target: $X" format.

2. **KPI Card Grid** (`.kpi-grid`) — CSS grid, auto-fill, minmax(200px, 1fr), gap 16px.

3. **Section Headers** (`.section-header`) — teal left border 4px, padding-left 12px,
   H3 in teal, subtitle in grey below.

4. **Data Tables** (`.data-table`) — full width, border-collapse. TH: teal background,
   white text, 12px uppercase. TD: 14px, alternating row #F9FAFB. Hover row highlight.

5. **Status Badges** (`.badge`) — pill shape, 11px, weight 700, uppercase.
   `--green`: #E8F5E9 bg / #2E7D32 text.
   `--yellow`: #FFF8E1 bg / #F57F17 text.
   `--red`: #FFEBEE bg / #C62828 text.
   `--blue`: #E3F2FD bg / #1565C0 text.
   `--grey`: #F5F5F5 bg / #616161 text.

6. **Progress Bars** (`.progress-bar`) — full width, 8px height, #E0E0E0 background,
   border-radius 4px. `.progress-bar__fill` — green fill with CSS transition.
   Thresholds: >80% green, 50–80% yellow, <50% red fill color.

7. **Chart Containers** (`.chart-container`) — white card, 8px radius, padding 20px,
   shadow. Canvas inside fills container.

8. **Scenario Toggle** (`.scenario-toggle`) — three-button group inline.
   Active: green bg, dark text. Inactive: white bg, teal border and text.

9. **Buttons** (`.btn`) — pill shape, 40px height, padding 0 24px, green bg, dark text,
   weight 700, 14px. Hover: lighter green. `.btn--secondary` — white bg, teal border.

10. **Manual Entry Forms** (`.manual-entry-form`) — white card, padding 24px,
    12px radius. `.entry-field` — label above input, 16px gap between fields.
    Inputs follow standard brand input style (40px, 1px border, 6px radius).

11. **Department Tab Header** (`.dept-header`) — full-width banner at top of each tab.
    Left-aligned dept name as H2 (dark grey), subtitle (grey), right-aligned
    accountable person badge and data source badge(s).

12. **Target Tracker** (`.target-tracker`) — horizontal bar showing actual vs target
    for revenue/MRR metrics. Shows threshold, target, overachieve markers.

---

### AGENT 3 — Data Layer (Mock Data and Storage)
**Files owned exclusively:**
- `js/data/mock-marketing.js`
- `js/data/mock-sales.js`
- `js/data/mock-partnerships.js`
- `js/data/mock-customer-success.js`
- `js/data/mock-support.js`
- `js/data/mock-product.js`
- `js/data/mock-executive.js`
- `js/data/mock-revenue-targets.js`
- `js/data/storage.js`

**Responsibility:**
Define the complete data schema for every department, populated with realistic
mock data. This is what Agents 4, 5, and 6 render. Phase 2 will replace these
with live API calls — the schema must not change, only the data source.

Every mock file must use `export const data = { ... }` and be importable as a module.

---

#### mock-revenue-targets.js
Exact monthly MRR targets from the KPI Framework:
```javascript
export const data = {
  scenarios: {
    threshold: {
      annual: 9600000,
      monthly: {
        jan: { eom_mrr: 710084, gross_needed: 32039, churn_budget: -6849 },
        feb: { eom_mrr: 733175, gross_needed: 30192, churn_budget: -7101 },
        mar: { eom_mrr: 756266, gross_needed: 30423, churn_budget: -7332 },
        apr: { eom_mrr: 777258, gross_needed: 28555, churn_budget: -7563 },
        may: { eom_mrr: 796151, gross_needed: 26666, churn_budget: -7773 },
        jun: { eom_mrr: 810845, gross_needed: 22656, churn_budget: -7962 },
        jul: { eom_mrr: 821341, gross_needed: 18604, churn_budget: -8108 },
        aug: { eom_mrr: 825539, gross_needed: 12411, churn_budget: -8213 },
        sep: { eom_mrr: 836035, gross_needed: 18751, churn_budget: -8255 },
        oct: { eom_mrr: 842333, gross_needed: 14658, churn_budget: -8360 },
        nov: { eom_mrr: 844432, gross_needed: 10522, churn_budget: -8423 },
        dec: { eom_mrr: 846541, gross_needed: 10553, churn_budget: -8444 }
      }
    },
    target: {
      annual: 10000000,
      monthly: {
        jan: { eom_mrr: 717379, gross_needed: 39334, churn_budget: -6849 },
        feb: { eom_mrr: 747157, gross_needed: 36952, churn_budget: -7174 },
        mar: { eom_mrr: 776935, gross_needed: 37250, churn_budget: -7472 },
        apr: { eom_mrr: 804006, gross_needed: 34840, churn_budget: -7769 },
        may: { eom_mrr: 828370, gross_needed: 32404, churn_budget: -8040 },
        jun: { eom_mrr: 847320, gross_needed: 27234, churn_budget: -8284 },
        jul: { eom_mrr: 860856, gross_needed: 22009, churn_budget: -8473 },
        aug: { eom_mrr: 866270, gross_needed: 14023, churn_budget: -8609 },
        sep: { eom_mrr: 879806, gross_needed: 22199, churn_budget: -8663 },
        oct: { eom_mrr: 887927, gross_needed: 16919, churn_budget: -8798 },
        nov: { eom_mrr: 890634, gross_needed: 11586, churn_budget: -8879 },
        dec: { eom_mrr: 893340, gross_needed: 11612, churn_budget: -8906 }
      }
    },
    overachieve: {
      annual: 10400000,
      monthly: {
        jan: { eom_mrr: 724674, gross_needed: 46629, churn_budget: -6849 },
        feb: { eom_mrr: 761139, gross_needed: 43712, churn_budget: -7247 },
        mar: { eom_mrr: 797604, gross_needed: 44076, churn_budget: -7611 },
        apr: { eom_mrr: 830754, gross_needed: 41126, churn_budget: -7976 },
        may: { eom_mrr: 860589, gross_needed: 38143, churn_budget: -8308 },
        jun: { eom_mrr: 883794, gross_needed: 31811, churn_budget: -8606 },
        jul: { eom_mrr: 900369, gross_needed: 25413, churn_budget: -8838 },
        aug: { eom_mrr: 906999, gross_needed: 15634, churn_budget: -9004 },
        sep: { eom_mrr: 923574, gross_needed: 25645, churn_budget: -9070 },
        oct: { eom_mrr: 933519, gross_needed: 19181, churn_budget: -9236 },
        nov: { eom_mrr: 936834, gross_needed: 12650, churn_budget: -9335 },
        dec: { eom_mrr: 940151, gross_needed: 12685, churn_budget: -9368 }
      }
    }
  },
  ebitda_target: 1100000,
  current_month: 'mar',
  current_year: 2026
};
```

---

#### mock-marketing.js schema
```javascript
export const data = {
  meta: { department: 'Marketing', accountable: 'Ger', squad: 'Growth',
          data_source: ['ActiveCampaign'], updated: '2026-03-01' },
  kpis: {
    marketing_created_deals: {
      label: 'Marketing-Created Deals (MQLs)',
      value: 142,         // mock: deals created this month
      target: 155,
      ytd: 387,
      ytd_target: 465,
      trend: [98, 112, 127, 142],  // last 4 months
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR3: Increase marketing-sourced leads 30%',
      note: 'Baseline needed from 2025 actuals'
    },
    marketing_captured_deals: {
      label: 'Marketing-Captured Deals (SQLs)',
      value: 89,
      target: 100,
      ytd: 241,
      ytd_target: 300,
      trend: [61, 74, 78, 89],
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR3: Increase marketing-sourced leads 30%',
      note: 'Baseline needed from 2025 actuals'
    },
    hiro_conversion_rate: {
      label: 'MOFU-to-BOFU Conversion (HIRO)',
      value: 24.6,        // percent
      target: 30.0,
      trend: [21.2, 22.8, 23.4, 24.6],
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR2: Improve MOFU-to-BOFU conversion to >30%',
      note: 'Requires consistent stage definitions AC + SF'
    },
    pipeline_generated: {
      label: 'Pipeline Generated (Total)',
      value: 1240000,     // dollars
      target: 1500000,
      ytd: 3420000,
      ytd_target: 4500000,
      trend: [980000, 1050000, 1120000, 1240000],
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase'
    },
    roas: {
      label: 'ROAS (Return on Ad Spend)',
      value: 3.2,
      target: 4.0,
      trend: [2.8, 3.0, 3.1, 3.2],
      status: 'yellow',
      cadence: 'Monthly',
      note: 'Requires marketing spend data linked to lead source'
    },
    direct_channel_pipeline_pct: {
      label: 'Direct-Channel Pipeline %',
      value: 18.4,        // percent
      target: 20.0,
      trend: [15.1, 16.2, 17.8, 18.4],
      status: 'yellow',
      cadence: 'Monthly',
      note: 'Requires source attribution tagging in AC'
    },
    pipeline_by_segment: {
      label: 'Pipeline by Segment',
      segments: [
        { name: 'Senior Care (LTC)', value: 540000, target: 600000 },
        { name: 'Medical CA (AMB)', value: 320000, target: 400000 },
        { name: 'Senior Living (SL)', value: 180000, target: 250000 },
        { name: 'US Medical', value: 120000, target: 150000 },
        { name: 'Hospital', value: 80000, target: 100000 }
      ],
      cadence: 'Monthly'
    },
    campaign_roi: {
      label: 'Campaign / Program ROI',
      campaigns: [
        { name: 'Q1 Demand Gen', spend: 18500, attributed_revenue: 62000, roi: 3.35 },
        { name: 'Webinar Series', spend: 4200, attributed_revenue: 19800, roi: 4.71 },
        { name: 'Content/SEO', spend: 6800, attributed_revenue: 28500, roi: 4.19 },
        { name: 'Partner Co-Marketing', spend: 3100, attributed_revenue: 8400, roi: 2.71 }
      ],
      cadence: 'Quarterly',
      note: 'Requires closed-loop attribution model'
    }
  }
};
```

---

#### mock-sales.js schema
```javascript
export const data = {
  meta: { department: 'Direct Sales', accountable: 'Zach', squad: 'Growth',
          data_source: ['Salesforce', 'ActiveCampaign'], updated: '2026-03-01' },
  kpis: {
    new_mrr_added: {
      label: 'New MRR Added (Total)',
      value: 34800,
      target_threshold: 32039,
      target_target: 39334,
      target_overachieve: 46629,
      ytd: 98200,
      trend: [28400, 31200, 33100, 34800],
      status: 'green',
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase'
    },
    quota_attainment: {
      label: 'Quota Attainment by Rep',
      reps: [
        { name: 'Rebecca', quota: 10000, actual: 11200, attainment: 112, status: 'green' },
        { name: 'Tanner',  quota: 9000,  actual: 7800,  attainment: 87,  status: 'yellow' },
        { name: 'Chuk',    quota: 8500,  actual: 8900,  attainment: 105, status: 'green' },
        { name: 'Nathan',  quota: 12000, actual: 6900,  attainment: 58,  status: 'red' }
      ],
      cadence: 'Monthly'
    },
    expansion_revenue: {
      label: 'Expansion Revenue',
      value: 12400,
      target: 12700,
      ytd: 36800,
      ytd_target: 38100,
      trend: [10200, 11400, 11900, 12400],
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR2: Expansion revenue = $1.2M total'
    },
    new_logo_revenue: {
      label: 'New Logo Revenue',
      value: 22400,
      target: 26634,
      trend: [18200, 19800, 20900, 22400],
      status: 'yellow',
      cadence: 'Monthly'
    },
    new_segment_bookings: {
      label: 'New Segment Bookings',
      segments: [
        { name: 'Senior Living (SL)', value: 3200, target: 5200, status: 'red' },
        { name: 'US Medical', value: 1800, target: 6500, status: 'red' },
        { name: 'Hospital', value: 800, target: 1200, status: 'yellow' }
      ],
      cadence: 'Monthly',
      okr: 'KR1: $82K SL + KR2: $385K US Medical'
    },
    win_rate: {
      label: 'Win Rate',
      value: 31.2,        // percent
      target: 35.0,
      trend: [28.4, 29.1, 30.6, 31.2],
      status: 'yellow',
      cadence: 'Monthly'
    },
    avg_deal_size_acv: {
      label: 'Average Deal Size (ACV)',
      value: 228,         // MRR dollars
      target: 240,
      trend: [215, 220, 224, 228],
      status: 'yellow',
      cadence: 'Monthly'
    },
    sales_cycle_length: {
      label: 'Sales Cycle Length (days)',
      value: 42,
      target: 38,
      by_segment: [
        { segment: 'LTC SNF', days: 38 },
        { segment: 'AMB CA', days: 45 },
        { segment: 'Enterprise', days: 67 }
      ],
      status: 'yellow',
      cadence: 'Monthly'
    },
    pipeline_coverage: {
      label: 'Pipeline Coverage Ratio',
      value: 2.8,         // x times quota
      target: 3.0,
      trend: [2.4, 2.5, 2.7, 2.8],
      status: 'yellow',
      note: 'Target: 3x minimum coverage',
      cadence: 'Monthly'
    },
    opportunities_created: {
      label: 'Opportunities Created',
      value: 412,
      target_threshold: 381,
      target_target: 468,
      trend: [344, 368, 391, 412],
      status: 'green',
      cadence: 'Monthly'
    },
    adjacent_vertical_deals: {
      label: 'Adjacent Vertical Deals',
      value: 1,           // YTD count
      target: 5,          // by year-end
      deals: [
        { vertical: 'Cosmetics', status: 'Closed Won', mrr: 180 }
      ],
      status: 'red',
      cadence: 'Quarterly'
    }
  }
};
```

---

#### mock-partnerships.js schema
```javascript
export const data = {
  meta: { department: 'Channel Partnerships', accountable: 'Bex/Ange',
          squad: 'Diversification',
          data_source: ['Salesforce', 'PRM'], updated: '2026-03-01' },
  kpis: {
    revenue_by_partner: {
      label: 'Revenue by Partner (% of Total)',
      partners: [
        { name: 'PCC',    mrr: 612000, pct: 74.2, trend: [75.8, 75.1, 74.8, 74.2] },
        { name: 'QHR',    mrr: 128000, pct: 15.5, trend: [14.9, 15.1, 15.3, 15.5] },
        { name: 'MxC',    mrr: 42000,  pct: 5.1,  trend: [1.2, 2.8, 4.1, 5.1] },
        { name: 'Direct', mrr: 32000,  pct: 3.9,  trend: [5.8, 4.9, 4.2, 3.9] },
        { name: 'Other',  mrr: 11000,  pct: 1.3,  trend: [2.3, 2.1, 1.6, 1.3] }
      ],
      concentration_target: 80.0,   // PCC+QHR combined target
      concentration_actual: 89.7,   // currently ~90%
      status: 'red',
      cadence: 'Monthly',
      okr: 'KR1: Decrease top-2 concentration from 90% to 80%'
    },
    mxc_revenue_ramp: {
      label: 'MatrixCare Revenue Ramp',
      value: 42000,       // current MRR
      target: 34083,      // ~$409K/12 at Target
      trend: [9800, 18400, 29200, 42000],
      status: 'green',
      cadence: 'Monthly',
      okr: 'KR1: Decrease concentration + KR2: New route-to-market',
      forecast_annual: 409000
    },
    non_reseller_deals: {
      label: 'Non-Reseller / Marketplace Deals',
      value: 0,           // no deals yet
      target_ytd: 3,
      deals: [],
      status: 'red',
      cadence: 'Quarterly',
      note: 'Needs new channel type field in SF Opportunity'
    },
    new_partner_activation: {
      label: 'New Partner Activation Rate',
      value: 0,
      target: 2,          // new partners with first deal within 6mo
      partners_in_pipeline: ['TBD Partner A', 'TBD Partner B'],
      status: 'red',
      cadence: 'Quarterly',
      note: 'Requires partner onboarding tracking — build in SF'
    },
    partner_pipeline_coverage: {
      label: 'Partner Pipeline Coverage',
      by_partner: [
        { partner: 'PCC',  pipeline: 820000, target: 900000, coverage: 2.7 },
        { partner: 'QHR',  pipeline: 185000, target: 200000, coverage: 2.8 },
        { partner: 'MxC',  pipeline: 68000,  target: 120000, coverage: 1.8 }
      ],
      status: 'yellow',
      cadence: 'Monthly'
    },
    sl_partner_revenue: {
      label: 'Senior Living Partner Revenue',
      value: 14200,
      target: 27141,      // ~$327K/12 at Target
      by_partner: [
        { partner: 'PCC SL', mrr: 12800, trend: [4200, 7800, 11200, 12800] },
        { partner: 'MxC SL', mrr: 1400,  trend: [0, 400, 900, 1400] }
      ],
      status: 'yellow',
      cadence: 'Monthly'
    },
    new_partner_outreach: {
      label: 'New Partner Outreach Volume',
      value: 18,
      target: 25,
      trend: [8, 12, 15, 18],
      status: 'yellow',
      cadence: 'Monthly'
    }
  }
};
```

---

#### mock-customer-success.js schema
```javascript
export const data = {
  meta: { department: 'Customer Success', accountable: 'Cathy', squad: 'Growth',
          data_source: ['Salesforce'], updated: '2026-03-01' },
  kpis: {
    gross_retention_rate: {
      label: 'Gross Retention Rate',
      value: 98.8,        // percent
      target: 99.0,
      trend: [98.4, 98.6, 98.7, 98.8],
      status: 'yellow',
      cadence: 'Monthly',
      note: 'Forecast assumes ~1% monthly churn'
    },
    nrr: {
      label: 'Net Revenue Retention (NRR)',
      value: 101.4,
      target: 103.0,
      trend: [100.2, 100.8, 101.1, 101.4],
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase'
    },
    churn_revenue: {
      label: 'Churn Revenue (Actual vs. Plan)',
      actual: 7200,
      budget: 7332,
      ytd_actual: 20900,
      ytd_budget: 21282,
      by_segment: [
        { segment: 'LTC', actual: 4800, budget: 4900 },
        { segment: 'AMB CA', actual: 2400, budget: 2432 }
      ],
      status: 'green',
      cadence: 'Monthly'
    },
    health_score_distribution: {
      label: 'Health Score Distribution',
      green: 68.2,        // percent of accounts
      yellow: 24.1,
      red: 7.7,
      trend: [
        { month: 'Dec', green: 64.1, yellow: 26.8, red: 9.1 },
        { month: 'Jan', green: 65.9, yellow: 25.4, red: 8.7 },
        { month: 'Feb', green: 67.0, yellow: 24.8, red: 8.2 },
        { month: 'Mar', green: 68.2, yellow: 24.1, red: 7.7 }
      ],
      status: 'green',
      cadence: 'Monthly'
    },
    at_risk_account_value: {
      label: 'At-Risk Account Value',
      value: 62400,       // MRR in red health
      accounts: [
        { name: 'Redacted Account A', mrr: 18200, segment: 'LTC', risk_reason: 'Low engagement' },
        { name: 'Redacted Account B', mrr: 12800, segment: 'AMB CA', risk_reason: 'Billing issue' },
        { name: 'Redacted Account C', mrr: 9800, segment: 'LTC', risk_reason: 'Champion left' }
      ],
      status: 'yellow',
      cadence: 'Weekly'
    },
    churn_rate_by_segment: {
      label: 'Churn Rate by Segment',
      segments: [
        { name: 'LTC SNF',   rate: 0.82, target: 0.99, status: 'green' },
        { name: 'LTC SL',    rate: 1.12, target: 0.99, status: 'red' },
        { name: 'AMB CA',    rate: 1.08, target: 1.01, status: 'yellow' },
        { name: 'AMB US',    rate: 0.64, target: 1.01, status: 'green' },
        { name: 'Hospital',  rate: 0.31, target: 0.99, status: 'green' }
      ],
      cadence: 'Monthly'
    },
    new_product_adoption: {
      label: 'New Product Adoption Rate',
      value: 34.2,        // percent
      target: 50.0,
      status: 'red',
      cadence: 'Quarterly',
      note: 'Requires product usage analytics'
    },
    time_to_value: {
      label: 'Time-to-Value (Implementation)',
      value: 34,          // days avg
      target: 28,
      trend: [42, 39, 37, 34],
      status: 'yellow',
      cadence: 'Monthly',
      note: 'Needs implementation milestone tracking in SF'
    },
    referral_influenced_pct: {
      label: 'Referral-Influenced Closed Won %',
      value: 2.8,
      target: 10.0,
      trend: [0, 1.2, 2.1, 2.8],
      status: 'red',
      cadence: 'Monthly',
      note: 'Referral source tracking needs to be built in SF'
    },
    csat: {
      label: 'CSAT (Customer Success)',
      value: 84,          // score out of 100
      target: 85,
      trend: [79, 81, 83, 84],
      status: 'yellow',
      cadence: 'Monthly'
    }
  }
};
```

---

#### mock-support.js schema
```javascript
export const data = {
  meta: { department: 'Customer Support', accountable: 'TBD', squad: 'Growth',
          data_source: ['Salesforce', 'JIRA'], updated: '2026-03-01' },
  kpis: {
    ticket_volume: {
      label: 'Ticket Volume and Trend',
      value: 284,
      trend: [312, 298, 291, 284],
      by_type: [
        { type: 'External (SF)', count: 184 },
        { type: 'Internal (JIRA)', count: 100 }
      ],
      status: 'green',   // trending down is good
      cadence: 'Monthly'
    },
    first_contact_resolution: {
      label: 'First-Contact Resolution Rate',
      value: 62.4,        // percent
      target: 75.0,
      trend: [55.1, 57.8, 60.2, 62.4],
      status: 'yellow',
      cadence: 'Monthly',
      note: 'May need field additions in SF Case object'
    },
    avg_resolution_time: {
      label: 'Average Resolution Time',
      value: 18.4,        // hours
      target: 16.0,
      by_priority: [
        { priority: 'P1 Critical', hours: 4.2 },
        { priority: 'P2 High', hours: 12.8 },
        { priority: 'P3 Medium', hours: 24.6 },
        { priority: 'P4 Low', hours: 48.2 }
      ],
      trend: [24.1, 21.8, 20.2, 18.4],
      status: 'yellow',
      cadence: 'Monthly'
    },
    escalation_rate: {
      label: 'Escalation Rate',
      value: 8.4,         // percent
      target: 6.0,
      trend: [12.1, 10.4, 9.2, 8.4],
      status: 'yellow',
      cadence: 'Monthly',
      note: 'Needs escalation workflow tracking'
    },
    support_cost_per_customer: {
      label: 'Support Cost Per Customer',
      value: 12.40,       // dollars per customer per month
      target: 11.00,
      trend: [14.20, 13.60, 12.90, 12.40],
      status: 'yellow',
      cadence: 'Quarterly',
      note: 'Requires finance data integration'
    },
    revenue_per_employee: {
      label: 'Revenue Per Employee (RPE)',
      value: 102400,      // annual
      target: 110000,
      headcount: 82,
      status: 'yellow',
      cadence: 'Quarterly',
      okr: 'KR3: Improve RPE via AI-driven motions'
    },
    ces: {
      label: 'Customer Effort Score (CES)',
      value: null,
      status: 'grey',
      cadence: 'Monthly',
      note: 'Not yet measurable — requires post-ticket survey implementation'
    }
  }
};
```

---

#### mock-product.js schema
```javascript
export const data = {
  meta: { department: 'Product Management', accountable: 'Kristi/Madison',
          squad: 'Innovation', data_source: ['JIRA', 'Salesforce'],
          updated: '2026-03-01' },
  kpis: {
    ai_products_launched: {
      label: 'AI Products Launched Per Quarter',
      value: 1,           // Q1 so far
      target: 3,          // per quarter
      ytd: 1,
      products: [
        { name: 'AI Appointment Reminder v2', status: 'Launched', quarter: 'Q1' },
        { name: 'AI Care Summary', status: 'In Progress', quarter: 'Q1' },
        { name: 'AI Discharge Follow-Up', status: 'Planned', quarter: 'Q2' }
      ],
      status: 'yellow',
      cadence: 'Quarterly',
      okr: 'KR1: Launch 3 AI-powered sellable products/features per quarter'
    },
    ai_skills_pilots: {
      label: 'AI Skills Pilots Completed',
      value: 12,
      target: 50,         // annual
      trend: [0, 4, 8, 12],
      status: 'yellow',
      cadence: 'Quarterly',
      note: 'Needs pilot tracking mechanism'
    },
    customer_validations: {
      label: 'Customer Validations (AI)',
      value: 2,
      target: 7,          // by Q3
      customers: [
        { name: 'Redacted Customer A', segment: 'LTC', validated: true },
        { name: 'Redacted Customer B', segment: 'AMB CA', validated: true }
      ],
      status: 'yellow',
      cadence: 'Quarterly',
      note: 'Define validation criteria, build tracking'
    },
    ai_specific_revenue: {
      label: 'AI-Specific Revenue',
      value: 18400,       // MRR attributed to AI solutions
      target: 33333,      // $400K/12
      ytd: 42000,
      status: 'yellow',
      cadence: 'Monthly',
      note: 'Requires product-level revenue tagging in SF'
    },
    say_do_ratio: {
      label: 'Say/Do Ratio',
      value: 84,          // percent of committed items delivered
      target: 90,
      by_quarter: [
        { quarter: 'Q4 2025', ratio: 78 },
        { quarter: 'Q1 2026', ratio: 84 }
      ],
      status: 'yellow',
      cadence: 'Quarterly',
      okr: 'Product OKR KR2: 90% say/do ratio'
    },
    bug_reduction: {
      label: 'Customer-Facing Bug Reduction',
      value: 8.2,         // percent QoQ reduction
      target: 15.0,
      bugs_this_quarter: 34,
      bugs_last_quarter: 37,
      status: 'red',
      cadence: 'Quarterly',
      okr: 'Product OKR KR3: Reduce customer-facing bugs 15% QoQ'
    },
    strategic_allocation: {
      label: 'Strategic Development Allocation',
      value: 72,          // percent
      target: 90,
      breakdown: [
        { type: 'Strategic initiatives', pct: 72 },
        { type: 'Maintenance', pct: 18 },
        { type: 'Ad-hoc / unplanned', pct: 10 }
      ],
      status: 'red',
      cadence: 'Quarterly',
      note: 'Needs JIRA tagging taxonomy'
    },
    enhancement_revenue_existing: {
      label: 'Enhancement Revenue (Existing Customers)',
      value: 42000,       // YTD
      target: 360000,     // annual
      status: 'yellow',
      cadence: 'Quarterly'
    },
    enhancement_revenue_new_segments: {
      label: 'Enhancement Revenue (New Segments)',
      value: 8400,        // YTD
      target: 158000,     // annual
      status: 'yellow',
      cadence: 'Quarterly'
    },
    ai_case_studies: {
      label: 'AI Champion Case Studies',
      value: 1,
      target: 10,
      status: 'red',
      cadence: 'Quarterly',
      okr: 'KR2: Convert 10 early-adopters into case studies'
    }
  }
};
```

---

#### mock-executive.js schema
```javascript
export const data = {
  meta: { updated: '2026-03-01', current_month: 'March 2026' },
  revenue: {
    current_mrr: 776935,
    mrr_target_threshold: 756266,
    mrr_target_target: 776935,
    mrr_target_overachieve: 797604,
    new_mrr_added_mtd: 34800,
    expansion_mrr_mtd: 12400,
    churn_mrr_mtd: 7200,
    net_new_mrr: 40000,
    ytd_revenue: 2261514,
    ytd_target: 2241471
  },
  company_health: {
    ebitda_ytd: 241000,
    ebitda_target_ytd: 275000,
    revenue_per_employee: 102400,
    rpe_target: 110000,
    active_customers: 3240,
    customer_growth_pct: 2.1
  },
  highlights: [
    { type: 'green', text: 'MxC ramp tracking above forecast — $42K MRR vs $29K target' },
    { type: 'green', text: 'New MRR added on track at Threshold scenario' },
    { type: 'yellow', text: 'HIRO conversion at 24.6% — target is 30%' },
    { type: 'yellow', text: 'New segment bookings (SL, US Medical) below plan' },
    { type: 'red', text: 'PCC+QHR concentration still at 89.7% — target is 80%' },
    { type: 'red', text: 'Nathan quota attainment at 58% — needs attention' }
  ]
};
```

---

#### storage.js
```javascript
// Google Sheets persistence layer for manual entry data
// Phase 1: localStorage fallback only
// Phase 2: replace with Google Sheets API calls

const STORAGE_KEY_PREFIX = 'cic_manual_';

export const storage = {
  async get(department, key) {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${department}_${key}`);
    return raw ? JSON.parse(raw) : null;
  },
  async set(department, key, value) {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${department}_${key}`,
      JSON.stringify({ value, updated: new Date().toISOString() })
    );
    return true;
  },
  async getAll(department) {
    const result = {};
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(`${STORAGE_KEY_PREFIX}${department}_`)) {
        const field = k.replace(`${STORAGE_KEY_PREFIX}${department}_`, '');
        result[field] = JSON.parse(localStorage.getItem(k));
      }
    }
    return result;
  },
  // Phase 2: replace body of these methods with Google Sheets API calls
  // Sheets API endpoint: https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}
  async syncToSheets(department) {
    console.log('[Phase 2] syncToSheets not yet implemented for', department);
    return false;
  }
};
```

---

### AGENT 4 — Marketing and Direct Sales Tabs
**Files owned exclusively:**
- `tabs/marketing.html`
- `tabs/sales.html`
- `js/modules/marketing.js`
- `js/modules/sales.js`

**Dependency:** Reads `CIC.getData('marketing')` and `CIC.getData('sales')` — do NOT import mock files directly. The router provides data.

**Responsibility:** Build the complete HTML template and JavaScript renderer for the Marketing and Direct Sales tabs.

**Each tab HTML file** (`tabs/marketing.html`, `tabs/sales.html`) must:
- Use only class names defined in components.css (Agent 2)
- Begin with `<div class="dept-header">` containing dept name, accountable, data sources
- Include skeleton layout (empty containers with correct IDs that JS fills)
- All dynamic content goes into elements with `data-kpi` attributes that the module JS targets
- Do NOT include `<html>`, `<head>`, or `<body>` tags — these are fragments injected by router

**Each module JS file** must:
- Export the standard interface `{ init(containerEl, data), destroy(), getSummaryKPIs() }`
- In `init()`: populate all KPI cards, render Chart.js charts, bind any filters
- In `destroy()`: call `chart.destroy()` on all Chart.js instances to prevent memory leaks
- For each KPI card: call `CIC.getStatusClass()` to determine the color class
- For currency values: use `CIC.formatCurrency()`
- For percentage values: use `CIC.formatPercent()`
- Subscribe to scenario changes: `CIC.onScenarioChange(() => this.refresh())`

**Marketing tab must render:**
- KPI card grid: MQLs created, SQLs captured, HIRO conversion %, pipeline generated, ROAS, direct channel %
- Segment pipeline bar chart (5 segments, actual vs target)
- Campaign ROI table (4 campaigns with spend, attributed revenue, ROI)
- Trend sparklines on key KPI cards (last 4 months)
- Cadence badge on each metric (Monthly / Quarterly)

**Sales tab must render:**
- New MRR added with scenario-aware target bar (threshold/target/overachieve)
- Quota attainment table: one row per rep (Rebecca, Tanner, Chuk, Nathan) with progress bars
- Expansion vs new logo MRR split donut chart
- New segment bookings table (SL, US Medical, Hospital — actual vs target)
- Pipeline coverage gauge or bar
- Win rate, avg deal size, sales cycle length KPI cards
- Adjacent vertical deals tracker (YTD count vs 5 deal target)

---

### AGENT 5 — Channel Partnerships, Customer Success, and Customer Support Tabs
**Files owned exclusively:**
- `tabs/partnerships.html`
- `tabs/customer-success.html`
- `tabs/support.html`
- `js/modules/partnerships.js`
- `js/modules/customer-success.js`
- `js/modules/support.js`

**Same dependency and interface rules as Agent 4.**

**Partnerships tab must render:**
- Partner concentration donut chart (PCC / QHR / MxC / Direct / Other) with
  current 89.7% vs 80% target prominently displayed as a risk indicator
- Revenue by partner trend chart (4 months, stacked area or grouped bars)
- MxC ramp chart — actual vs forecast trajectory to $409K
- New partner pipeline coverage table
- Senior Living partner revenue tracker (PCC SL + MxC SL vs target)
- Non-reseller deals tracker (0 of 3 YTD — red status with action note)
- New partner outreach volume KPI card

**Customer Success tab must render:**
- Health score distribution donut (Green 68.2% / Yellow 24.1% / Red 7.7%)
  with trend table below (4 months)
- At-risk account value prominently shown with top 3 at-risk accounts table
  (anonymized — "Account A", "Account B", etc.)
- Churn rate by segment table (5 segments — actual vs target with status badge)
- GRR and NRR KPI cards with trend sparklines
- Churn revenue actual vs budget (current month and YTD)
- Time-to-value trend chart (days, going down is good)
- Referral influenced % with progress bar (2.8% of 10% target)
- CSAT card with trend
- New product adoption rate (34.2% of 50% target — red status)

**Support tab must render:**
- Ticket volume trend chart with external vs internal split (SF vs JIRA)
- First-contact resolution rate KPI card with trend
- Resolution time by priority table (P1–P4)
- Escalation rate trend with target line
- Support cost per customer KPI card
- RPE card (company-wide metric, support efficiency context)
- CES card shown as "Not Yet Measurable" with grey badge and action note

---

### AGENT 6 — Product, Executive, Squad Views, and Manual Entry
**Files owned exclusively:**
- `tabs/product.html`
- `tabs/executive.html`
- `tabs/squads.html`
- `tabs/manual-entry.html`
- `js/modules/product.js`
- `js/modules/executive.js`
- `js/modules/squads.js`
- `js/modules/manual-entry.js`

**Same dependency and interface rules as Agents 4 and 5.**

**Product tab must render:**
- AI product roadmap tracker: 3 products for Q1, each with status badge
  (Launched / In Progress / Planned)
- AI skills pilots progress bar (12 of 50 annual target)
- Customer validations tracker (2 of 7 by Q3)
- Say/Do ratio gauge chart or large KPI card
- Strategic allocation breakdown doughnut (72% strategic / 18% maintenance / 10% ad-hoc)
- Bug reduction quarter-over-quarter bar chart
- AI-specific revenue MRR tracker with annual target progress
- Enhancement revenue cards (existing customers and new segments, both vs annual target)
- AI case studies tracker (1 of 10)

**Executive tab must render:**
- Top-row company health strip: current MRR vs scenario target, YTD revenue vs plan,
  EBITDA YTD vs plan, RPE vs target, Active customers
- Scenario toggle that affects all MRR target comparisons on this tab
- Monthly MRR actual vs target chart (all 3 scenarios as reference lines, 
  actuals as bars — Jan through current month)
- Department summary grid: one summary card per department showing 2–3 key KPIs
  each using `module.getSummaryKPIs()` — so exec sees all 6 departments at a glance
- Highlights/alerts section: the 6 highlights from mock-executive.js rendered as
  green/yellow/red callout rows

**Squads tab must render:**
Three squad sections, each collapsible:

*Growth Squad (PM: Madison)*
- KPIs: New MRR Added, Quota Attainment, Expansion Revenue, MOFU Conversion,
  Marketing-Sourced Leads, Gross Retention Rate, NRR, New Product Adoption
- Monthly target: ~$32K–$47K gross MRR added depending on scenario

*Diversification Squad (PM: Madison)*
- KPIs: PCC Revenue %, Revenue by Partner, MxC Ramp, Non-Reseller Deals,
  New Partner Activation, Referral Influenced %, New Segment Bookings
- Target: Partner concentration 90% → 80%

*Innovation Squad (PM: Kristi)*
- KPIs: AI Products Launched, AI Skills Pilots, Customer Validations,
  AI-Specific Revenue, AI Case Studies, RPE
- Target: $400K AI revenue (overachieve scenario), 10 case studies

Each squad section shows: squad PM name, contributing teams, accountable ELT member,
and a squad health score (auto-calculated as % of KPIs on track).

**Manual Entry tab must render:**
A form-based data entry interface for metrics that have no API source.
Organized into sections:

*Finance (manual — no system integration)*
- EBITDA actual vs plan (monthly input)
- Marketing spend by channel (monthly input: Paid Search, Paid Social, Content, Events, Other)
- Support department cost (monthly input)
- Total headcount (monthly input for RPE calculation)

*HR (manual — no HRIS)*
- Total FTE headcount (with department breakdown)
- New hires this month
- Departures this month

*Partner Data (limited external access)*
- PCC self-serve new customers (monthly — PCC doesn't share via API)
- PCC pipeline estimate (monthly estimate from partner)

Each field must:
- Show the last saved value and when it was saved
- Have a Save button that calls `CIC.setData(department, key, value)`
- Show a "Saved" confirmation for 3 seconds after save
- Pull saved values from `storage.js` on init

---

## Build Sequence

```
STEP 1 (run first, sequential):
  Agent 2 completes tokens.css and components.css
  — All other agents depend on CSS class names being defined

STEP 2 (can all run in parallel after Step 1):
  Agent 1  — index.html + shell.css + router.js
  Agent 3  — All mock data files + storage.js
  Agent 4  — Marketing + Sales tabs and modules
  Agent 5  — Partnerships + CS + Support tabs and modules
  Agent 6  — Product + Executive + Squads + Manual Entry tabs and modules

STEP 3 (integration — run after all Step 2 agents complete):
  Verify all tab IDs match between router.js nav and module exports
  Verify all CSS classes used in tab HTML exist in components.css
  Test ZIP bundle in browser before ToolHub submission
```

---

## ToolHub Submission Checklist

Before submitting the ZIP:
- [ ] `index.html` is at the ZIP root (not in a subfolder)
- [ ] All asset paths are relative (`./css/tokens.css`, not `/css/tokens.css`)
- [ ] No localhost references anywhere
- [ ] `<title>` tag reads: `Cliniconex Intelligence Center`
- [ ] Nunito Sans loaded from Google Fonts CDN
- [ ] Chart.js loaded from jsDelivr CDN
- [ ] Open `index.html` directly in browser and confirm all 9 tabs load
- [ ] Scenario toggle changes MRR targets on Sales and Executive tabs
- [ ] Manual entry saves and reloads correctly
- [ ] No console errors on any tab

---

## Phase 2 Preview (After Phase 1 is Live)

When data connectors are added in Phase 2, each mock data file becomes a thin
wrapper that fetches from the real API. The module JS and HTML do not change.

```javascript
// Phase 1 (mock):
export const data = { kpis: { ... static values ... } };

// Phase 2 (live):
export async function fetchData() {
  const ac = await activeCampaignConnector.fetch();
  const sf = await salesforceConnector.fetch();
  return transformToSchema(ac, sf);  // same schema shape as Phase 1
}
```

This is why the schema definition in Agent 3 is the most important architectural
deliverable in Phase 1. Every field name and data shape defined now becomes a
contract for Phase 2 API integration.
