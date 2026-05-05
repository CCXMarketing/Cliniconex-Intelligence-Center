// ── CIC Tab Renderer — config-driven tab rendering ─────────────
//
// Reads a tab config object and dispatches sections to registered widgets.
// Adding a new widget = one import + one registry entry below.
//
// Usage:
//   import { renderTab } from './tab-renderer.js';
//   const teardown = await renderTab(containerEl, tabConfig, catalog, dataLayer);
//   // later: teardown();

import * as kpiGrid from './widgets/kpi-grid.js';

const WIDGETS = {
  'kpi-grid': kpiGrid,
};

const DATA_SOURCE_BADGES = {
  salesforce:      { text: 'Salesforce',      cls: 'badge--teal' },
  jira:            { text: 'JIRA',            cls: 'badge--blue' },
  activecampaign:  { text: 'ActiveCampaign',  cls: 'badge--green' },
  manual:          { text: 'Manual',          cls: 'badge--grey' },
  finance:         { text: 'Finance',         cls: 'badge--grey' },
  survey_tool:     { text: 'Survey',          cls: 'badge--grey' },
};

// Generation counter — prevents stale renders from appending to the DOM.
// The router can call init() twice due to a hashchange race (the navigating
// flag resets before the async render completes, so hashchange re-fires
// navigateTo). Each renderTab call increments the counter; after every await,
// the loop checks whether a newer render has started and bails if so.
let _renderGen = 0;

export async function renderTab(containerEl, tabConfig, catalog, dataLayer) {
  const gen = ++_renderGen;
  const teardowns = [];

  containerEl.innerHTML = '';

  // 1. Render tab header
  containerEl.appendChild(buildHeader(tabConfig.tab));

  // 2. Render each section
  for (const section of tabConfig.sections) {
    // After any prior await, check if a newer render has started
    if (gen !== _renderGen) return () => {};

    if (section.title) {
      const header = document.createElement('div');
      header.className = 'section-header';
      header.innerHTML =
        `<h3>${section.title}</h3>` +
        (section.subtitle ? `<p>${section.subtitle}</p>` : '');
      containerEl.appendChild(header);
    }

    const widget = WIDGETS[section.type];
    if (!widget) {
      console.warn(`[TabRenderer] Unknown widget type: "${section.type}"`);
      continue;
    }

    const sectionEl = document.createElement('div');
    containerEl.appendChild(sectionEl);

    const teardown = await widget.render(sectionEl, section.kpis, section, dataLayer);
    if (teardown) teardowns.push(teardown);
  }

  // 3. Return composite teardown (reverse order)
  return () => {
    for (let i = teardowns.length - 1; i >= 0; i--) {
      try { teardowns[i](); } catch (e) { console.warn('[TabRenderer] teardown error:', e); }
    }
  };
}

function buildHeader(tab) {
  const el = document.createElement('div');
  el.className = 'dept-header';

  const sources = (tab.data_sources || []).map(src => {
    const info = DATA_SOURCE_BADGES[src] || { text: src, cls: 'badge--grey' };
    return `<span class="badge ${info.cls}">${info.text}</span>`;
  }).join('');

  el.innerHTML = `
    <div class="dept-header__left">
      <h2>${tab.name}</h2>
      <p>${tab.description}</p>
    </div>
    <div class="dept-header__right">
      <span class="dept-header__meta">Accountable</span>
      <span class="badge badge--grey">${tab.accountable}</span>
      ${sources}
    </div>`;

  return el;
}
