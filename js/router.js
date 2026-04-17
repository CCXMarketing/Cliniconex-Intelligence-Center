// ── CIC Router — tab navigation, scenario management, shared utilities ──

import { catalog } from './data/catalog.js';

const TABS = [
  { id: 'executive',        label: 'Executive',        file: 'tabs/executive.html',        module: './modules/executive.js' },
  { id: 'squads',           label: 'Squads',           file: 'tabs/squads.html',           module: './modules/squads.js' },
  { id: 'marketing',        label: 'Marketing',        file: 'tabs/marketing.html',        module: './modules/marketing.js' },
  { id: 'sales',            label: 'Direct Sales',     file: 'tabs/sales.html',            module: './modules/sales.js' },
  { id: 'partnerships',     label: 'Partnerships',     file: 'tabs/partnerships.html',     module: './modules/partnerships.js' },
  { id: 'customer-success', label: 'Customer Success', file: 'tabs/customer-success.html', module: './modules/customer-success.js' },
  { id: 'support',          label: 'Customer Support', file: 'tabs/support.html',          module: './modules/support.js' },
  { id: 'product',          label: 'Product',          file: 'tabs/product.html',          module: './modules/product.js' },
  { id: 'manual-entry',     label: 'Manual Entry',     file: 'tabs/manual-entry.html',     module: './modules/manual-entry.js' },
];

const DATA_MODULES = {
  marketing:          () => import('./data/mock-marketing.js'),
  sales:              () => import('./data/mock-sales.js'),
  partnerships:       () => import('./data/mock-partnerships.js'),
  'customer-success': () => import('./data/mock-customer-success.js'),
  support:            () => import('./data/mock-support.js'),
  product:            () => import('./data/mock-product.js'),
  executive:          () => import('./data/mock-executive.js'),
  squads:             () => import('./data/mock-executive.js'),
  'manual-entry':     () => Promise.resolve({ data: {} }),
  'revenue-targets':  () => import('./data/mock-revenue-targets.js'),
};

// ── Global CIC object ──

window.CIC = {
  navigate(tabId) {
    navigateTo(tabId);
  },

  catalog,

  async getData(department) {
    const loader = DATA_MODULES[department];
    if (!loader) return {};
    try {
      const mod = await loader();
      const mockData = mod.data || {};
      const catalogKpis = await catalog.getKpisForTab(department);

      if (!mockData.kpis || Object.keys(catalogKpis).length === 0) {
        return mockData;
      }

      const merged = { ...mockData, _catalog: catalogKpis };

      const reversedAliases = {};
      for (const [catalogId, catKpi] of Object.entries(catalogKpis)) {
        const deptPrefix = catKpi.department + '__';
        const shortKey = catalogId.startsWith(deptPrefix)
          ? catalogId.slice(deptPrefix.length)
          : catalogId;
        reversedAliases[shortKey] = catKpi;
      }

      for (const mockKey of Object.keys(mockData.kpis)) {
        const catalogSuffix = catalog.resolveMockKey(mockKey);
        if (reversedAliases[catalogSuffix]) {
          mockData.kpis[mockKey]._catalog = reversedAliases[catalogSuffix];
        } else if (reversedAliases[mockKey]) {
          mockData.kpis[mockKey]._catalog = reversedAliases[mockKey];
        }
      }

      // Mark all KPIs as mock-sourced by default
      for (const kpi of Object.values(mockData.kpis)) {
        kpi._dataSource = 'mock';
      }

      // Overlay manual entries from Google Sheets
      try {
        const { storage } = await import('./data/storage.js');
        const dept = catalog.tabIdToDeptId(department);
        const deptName = reversedAliases[Object.keys(reversedAliases)[0]]?.departmentName;
        if (deptName) {
          const sheetEntries = await storage.readFromSheets(deptName);
          for (const entry of sheetEntries) {
            if (!entry.value) continue;
            const kpiId = entry.kpi_id;
            const suffix = kpiId.startsWith(dept + '__') ? kpiId.slice(dept.length + 2) : kpiId;
            for (const [mockKey, kpi] of Object.entries(mockData.kpis)) {
              const resolved = catalog.resolveMockKey(mockKey);
              if (resolved === suffix || mockKey === suffix) {
                if (!kpi._manualEntry) {
                  const parsed = parseFloat(entry.value);
                  if (!isNaN(parsed)) {
                    kpi._mockValue = kpi.value;
                    kpi.value = parsed;
                    kpi._dataSource = 'manual';
                    kpi._manualEntry = entry;
                  }
                }
              }
            }
          }
        }
      } catch {
        // Sheet data not available — continue with mock + catalog only
      }

      return merged;
    } catch {
      return {};
    }
  },

  async setData(department, key, value) {
    const { storage } = await import('./data/storage.js');
    return storage.set(department, key, value);
  },

  getScenario() {
    return localStorage.getItem('cic_scenario') || 'target';
  },

  setScenario(scenario) {
    localStorage.setItem('cic_scenario', scenario);
    this._scenarioListeners.forEach(fn => fn(scenario));
  },

  onScenarioChange(fn) {
    this._scenarioListeners.push(fn);
  },

  _scenarioListeners: [],

  formatCurrency(n) {
    if (n == null) return '—';
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString();
  },

  formatPercent(n, decimals = 1) {
    if (n == null) return '—';
    return n.toFixed(decimals) + '%';
  },

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

// ── Router internals ──

let currentModule = null;
let navigating = false;

async function navigateTo(tabId) {
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;

  const viewport = document.getElementById('tab-viewport');

  // Destroy previous module
  if (currentModule && typeof currentModule.destroy === 'function') {
    currentModule.destroy();
  }
  currentModule = null;

  // Show loading state
  viewport.innerHTML = '<div class="tab-loading">Loading</div>';

  // Update active nav button
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update hash without re-triggering navigation
  navigating = true;
  window.location.hash = tabId;
  navigating = false;

  // Fetch tab HTML
  let html;
  try {
    const resp = await fetch(tab.file);
    if (!resp.ok) throw new Error(resp.status);
    html = await resp.text();
  } catch {
    viewport.innerHTML = `
      <div style="padding:48px;text-align:center;color:#02475A;">
        <h2 style="margin:0 0 8px;">${tab.label}</h2>
        <p style="color:#666;font-size:14px;">Coming soon — this tab is under construction.</p>
      </div>`;
    return;
  }

  viewport.innerHTML = html;

  // Import and init the tab module
  try {
    const mod = await import(tab.module);
    const data = await CIC.getData(tabId);
    if (mod.default && typeof mod.default.init === 'function') {
      mod.default.init(viewport, data, CIC.getScenario());
      currentModule = mod.default;
    }
  } catch {
    // Module not yet built — tab HTML is still shown, no error
  }
}

// ── Initialization ──

function buildNav() {
  const container = document.getElementById('nav-tabs');
  TABS.forEach(tab => {
    if (tab.hidden) return;
    const btn = document.createElement('button');
    btn.className = 'nav-tab';
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => CIC.navigate(tab.id));
    container.appendChild(btn);
  });
}

function initScenarioToggle() {
  const current = CIC.getScenario();
  const buttons = document.querySelectorAll('#scenario-toggle button');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scenario === current);
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CIC.setScenario(btn.dataset.scenario);
    });
  });
}

function updateScenarioBanner(scenario) {
  const labels = {
    threshold:   'Threshold Scenario \u2014 $9.6M Annual Revenue Target',
    target:      'Target Scenario \u2014 $10M Annual Revenue Target',
    overachieve: 'Overachieve Scenario \u2014 $10.4M Annual Revenue Target'
  };
  const banner = document.getElementById('scenario-banner');
  if (banner) banner.textContent = 'Viewing: ' + (labels[scenario] || labels.target);
}

document.addEventListener('DOMContentLoaded', () => {
  buildNav();
  initScenarioToggle();
  updateScenarioBanner(CIC.getScenario());
  CIC.onScenarioChange(updateScenarioBanner);

  const hash = window.location.hash.replace('#', '') || 'executive';
  navigateTo(hash);
});

window.addEventListener('hashchange', () => {
  if (navigating) return;
  const hash = window.location.hash.replace('#', '') || 'executive';
  navigateTo(hash);
});
