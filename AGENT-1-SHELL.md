# CIC Agent 1 — Shell, Navigation and Router

## Your Role
You are building the application shell for the Cliniconex Intelligence Center (CIC).
This is the frame that every other agent's work lives inside. You own three files
and three files only. Do not create or modify any other files.

## Your Files (exclusive ownership)
- `index.html`
- `css/shell.css`
- `js/router.js`

## Project Context
The CIC is a multi-department business intelligence dashboard built as a static
HTML/ZIP application for deployment in CCX ToolHub (Tailscale-secured internal portal).
It covers 6 departments + executive and squad views. All data is mock in Phase 1.

**Revenue targets:** Threshold $9.6M | Target $10M | Overachieve $10.4M
**Brand font:** Nunito Sans (Google Fonts)
**Brand colors:** Green #ADC837 | Teal #02475A | Cyan #029FB5 | Dark Grey #404041

## Step 1 — Create the directory structure
Run these commands first:
```bash
mkdir -p css js/data js/modules tabs
```

## Step 2 — Build js/router.js

Create `js/router.js` as an ES module. It must:

### Tab registry
```javascript
const TABS = [
  { id: 'executive',        label: 'Executive',           file: 'tabs/executive.html',        module: './modules/executive.js' },
  { id: 'squads',           label: 'Squads',              file: 'tabs/squads.html',           module: './modules/squads.js' },
  { id: 'marketing',        label: 'Marketing',           file: 'tabs/marketing.html',        module: './modules/marketing.js' },
  { id: 'sales',            label: 'Direct Sales',        file: 'tabs/sales.html',            module: './modules/sales.js' },
  { id: 'partnerships',     label: 'Partnerships',        file: 'tabs/partnerships.html',     module: './modules/partnerships.js' },
  { id: 'customer-success', label: 'Customer Success',    file: 'tabs/customer-success.html', module: './modules/customer-success.js' },
  { id: 'support',          label: 'Customer Support',    file: 'tabs/support.html',          module: './modules/support.js' },
  { id: 'product',          label: 'Product',             file: 'tabs/product.html',          module: './modules/product.js' },
  { id: 'manual-entry',     label: 'Manual Entry',        file: 'tabs/manual-entry.html',     module: './modules/manual-entry.js' },
];
```

### Mock data registry
```javascript
const DATA_MODULES = {
  marketing:        () => import('./data/mock-marketing.js'),
  sales:            () => import('./data/mock-sales.js'),
  partnerships:     () => import('./data/mock-partnerships.js'),
  'customer-success': () => import('./data/mock-customer-success.js'),
  support:          () => import('./data/mock-support.js'),
  product:          () => import('./data/mock-product.js'),
  executive:        () => import('./data/mock-executive.js'),
  squads:           () => import('./data/mock-executive.js'),  // squads uses executive data
  'manual-entry':   () => Promise.resolve({ data: {} }),
  'revenue-targets': () => import('./data/mock-revenue-targets.js'),
};
```

### Global CIC object
Expose `window.CIC` with:

```javascript
window.CIC = {
  // Navigate to a tab by id
  navigate(tabId) { ... },

  // Get mock data for a department (returns the data object)
  async getData(department) {
    const mod = await DATA_MODULES[department]();
    return mod.data;
  },

  // Write to storage layer
  async setData(department, key, value) {
    const { storage } = await import('./data/storage.js');
    return storage.set(department, key, value);
  },

  // Returns 'threshold' | 'target' | 'overachieve'
  getScenario() {
    return localStorage.getItem('cic_scenario') || 'target';
  },

  // Set scenario and notify subscribers
  setScenario(scenario) {
    localStorage.setItem('cic_scenario', scenario);
    this._scenarioListeners.forEach(fn => fn(scenario));
  },

  // Subscribe to scenario changes
  onScenarioChange(fn) {
    this._scenarioListeners.push(fn);
  },

  _scenarioListeners: [],

  // Format number as currency: 1200000 → '$1.2M', 45000 → '$45K', 240 → '$240'
  formatCurrency(n) {
    if (n == null) return '—';
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString();
  },

  // Format as percentage: 24.6 → '24.6%'
  formatPercent(n, decimals = 1) {
    if (n == null) return '—';
    return n.toFixed(decimals) + '%';
  },

  // Returns CSS status class: 'green' | 'yellow' | 'red'
  // thresholds: { green: value, yellow: value } — above green = green, between = yellow, below = red
  // Set higherIsBetter: false for metrics where lower is better (e.g. churn, resolution time)
  getStatusClass(value, thresholds, higherIsBetter = true) {
    if (value == null) return 'grey';
    if (higherIsBetter) {
      if (value >= thresholds.green) return 'green';
      if (value >= thresholds.yellow) return 'yellow';
      return 'red';
    } else {
      if (value <= thresholds.green) return 'green';
      if (value <= thresholds.yellow) return 'yellow';
      return 'red';
    }
  },
};
```

### Router logic
- On `DOMContentLoaded`: read `window.location.hash`, navigate to that tab or default to `#executive`
- On `hashchange` event: navigate to new tab
- `navigate(tabId)`:
  1. Call `currentModule.destroy()` if a module is currently active
  2. Fetch the tab's HTML file with `fetch(tab.file)`
  3. Inject HTML into `<main id="tab-viewport">`
  4. Dynamically import the tab's module: `const mod = await import(tab.module)`
  5. Get department data: `const data = await CIC.getData(tabId)`
  6. Call `mod.default.init(document.querySelector('#tab-viewport'), data)`
  7. Store as `currentModule`
  8. Update active state on nav buttons
  9. Update `window.location.hash` without triggering hashchange loop

## Step 3 — Build css/shell.css

Style the nav bar and application chrome:

### Nav bar
- Fixed to top of viewport, full width
- Background: `#02475A` (teal)
- Height: 52px
- Display: flex, align-items center
- Left side: Cliniconex wordmark text (Nunito Sans, 700, 16px, white)
- Center: scrollable tab button row (flex, gap 4px, overflow-x auto, hide scrollbar)
- Right side: scenario toggle group

### Tab buttons
- Height: 34px, padding 0 14px, border-radius 17px (pill)
- Inactive: no background, white text at 70% opacity, no border
- Active (`.nav-tab.active`): background #ADC837, color #404041, font-weight 700
- Hover (not active): white at 90% opacity
- Font: Nunito Sans 13px, weight 600
- Transition: background 0.15s, color 0.15s

### Scenario toggle
- Three buttons: Threshold | Target | Overachieve
- Grouped together with 1px teal-light borders between
- Active scenario button: #ADC837 bg, #404041 text, weight 700
- Inactive: white/20 bg, white text
- 12px font, height 28px, padding 0 10px
- Border-radius: 4px on outer buttons only (left rounds left, right rounds right)

### Main content area
- `#tab-viewport`: position fixed (or absolute), top 52px, left 0, right 0, bottom 0
- overflow-y: auto
- background: #F4F4F4
- padding: 24px

### Portal bar offset
```css
body {
  margin: 0;
  padding-top: 0; /* ToolHub injects its bar, our nav sits at top */
  font-family: 'Nunito Sans', sans-serif;
  background: #F4F4F4;
}
```

### Loading state
```css
.tab-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #02475A;
  font-size: 14px;
  font-weight: 600;
}
.tab-loading::after {
  content: '';
  width: 20px; height: 20px;
  border: 2px solid #ADC837;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin-left: 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

## Step 4 — Build index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cliniconex Intelligence Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/shell.css">
</head>
<body>

  <nav id="main-nav">
    <div class="nav-brand">Cliniconex Intelligence Center</div>
    <div class="nav-tabs" id="nav-tabs">
      <!-- Tabs injected by router -->
    </div>
    <div class="scenario-toggle" id="scenario-toggle">
      <button data-scenario="threshold">Threshold</button>
      <button data-scenario="target" class="active">Target</button>
      <button data-scenario="overachieve">Overachieve</button>
    </div>
  </nav>

  <main id="tab-viewport">
    <div class="tab-loading">Loading</div>
  </main>

  <script type="module" src="js/router.js"></script>

</body>
</html>
```

The router.js module must:
1. Generate and inject the `<button>` elements into `#nav-tabs` for each tab in the registry
2. Wire up the scenario toggle buttons to `CIC.setScenario()`
3. Highlight the active scenario button matching `CIC.getScenario()`

## Validation
Before finishing, verify:
- [ ] Open index.html in browser — nav bar appears with all 9 tab buttons
- [ ] Clicking a tab updates the URL hash and loads the tab skeleton
  (tabs/executive.html won't exist yet — show a "Coming soon" message gracefully, not an error)
- [ ] Scenario toggle changes active button and persists to localStorage
- [ ] `CIC.formatCurrency(1200000)` returns `'$1.2M'` in console
- [ ] `CIC.formatCurrency(45000)` returns `'$45.0K'` in console
- [ ] `CIC.getScenario()` returns `'target'` by default
- [ ] No console errors on load

## Constraints
- Do NOT touch any file outside your three files
- Do NOT hardcode any KPI data — that is Agent 3's responsibility
- Do NOT build any tab content — that is Agents 4, 5, and 6
- Do NOT define any component CSS — that is Agent 2
