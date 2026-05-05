// ── Customer Support tab — config-driven via tab-renderer ──────
//
// This is the proof-of-concept for config-driven tabs.
// The tab config (config/tabs/customer-support.yaml) defines sections and KPIs.
// The renderer + kpi-grid widget handle all rendering and editing.
// No live fetchers in this phase — all KPIs use manual entry or empty state.

import { renderTab } from '../tab-renderer.js';
import { catalog } from '../data/catalog.js';
import * as dataLayer from '../data/data-layer.js';
import { loadTabConfig } from '../utils/tab-config-loader.js';

let teardown = null;

export default {
  async init(containerEl /*, data, scenario — unused in config-driven tabs */) {
    const tabConfig = await loadTabConfig('customer-support');
    teardown = await renderTab(containerEl, tabConfig, catalog, dataLayer);
  },

  destroy() {
    if (teardown) teardown();
    teardown = null;
  },
};
