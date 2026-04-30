// ── Shared KPI Card Builder ──────────────────────────────────────
// Renders Ready / Partial / Not Yet cards with consistent structure.
// Used for adding new spec-aligned cards; existing cards can opt in.

import { attainmentHTML } from './kpi-targets.js';

function fmtVal(value, unit) {
  if (value == null) return '\u2014';
  if (unit === 'currency')   return CIC.formatCurrency(value);
  if (unit === 'percent')    return CIC.formatPercent(value);
  if (unit === 'multiplier') return value.toFixed(1) + ':1';
  if (unit === 'ratio')      return Math.round(value) + ':1';
  return value.toLocaleString();
}

/**
 * Build a KPI card HTML string.
 * @param {Object} cfg
 * @param {string} cfg.key - data-drilldown key
 * @param {string} cfg.label - Display name
 * @param {number|null} cfg.value - Current value
 * @param {number|null} [cfg.target] - Active target (for display, not scenario-aware)
 * @param {string} [cfg.unit='count'] - count|currency|percent|multiplier|ratio
 * @param {string} [cfg.status='grey'] - green|yellow|red|blue|grey
 * @param {string} [cfg.cadence] - Monthly|Quarterly|Weekly
 * @param {string} [cfg.source] - "ActiveCampaign", "Salesforce + Manual", etc.
 * @param {string} [cfg.readiness='ready'] - ready|partial|not_yet
 * @param {string} [cfg.note] - Partial caveat or Not Yet explanation
 * @param {string} [cfg.definition] - Framework definition (shown on Not Yet cards)
 * @param {Array} [cfg.trend] - Historical values for delta calc
 * @param {string} [cfg.module] - Module id for targets lookup
 * @param {Object} [cfg._kpi] - Raw KPI object for data-source badge
 * @param {Object} [cfg._catalog] - Catalog entry for measurability badge
 */
export function buildCard(cfg) {
  const {
    key, label, value, target, unit = 'count', status = 'grey',
    cadence, source, readiness = 'ready', note, definition,
    trend, module, _kpi, _catalog
  } = cfg;

  const isNotYet  = readiness === 'not_yet';
  const isPartial = readiness === 'partial';

  // Format value
  const displayVal = isNotYet ? '\u2014' : fmtVal(value, unit);

  // Badge
  let badgeHtml = '';
  if (isNotYet) {
    badgeHtml = '<span class="kpi-badge badge-not-yet">Not Yet</span>';
  } else if (_kpi) {
    const b = CIC.catalog.dataSourceBadge(_kpi);
    badgeHtml = `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
  } else if (_catalog) {
    const b = CIC.catalog.measurabilityBadge(_catalog);
    badgeHtml = `<span class="kpi-badge ${b.cssClass}">${b.label}</span>`;
  } else if (isPartial) {
    badgeHtml = '<span class="kpi-badge badge-partial">Partial</span>';
  }

  // Cadence
  const cadenceHtml = cadence
    ? `<div class="kpi-cadence">${cadence.toUpperCase()}</div>` : '';

  // Delta
  let deltaHtml = '';
  if (trend && trend.length >= 2 && !isNotYet) {
    const prev = trend[trend.length - 2];
    const curr = trend[trend.length - 1];
    if (prev !== 0) {
      const pct = ((curr - prev) / Math.abs(prev) * 100).toFixed(1);
      const dir = pct >= 0 ? 'up' : 'down';
      deltaHtml = `<span class="kpi-delta kpi-delta--${dir}">${pct >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(pct)}% vs last month</span>`;
    }
  }

  // Target line
  const targetHtml = (target != null && !isNotYet)
    ? `<div class="kpi-target">Target: ${fmtVal(target, unit)}</div>` : '';

  // Attainment
  const attHtml = (module && !isNotYet) ? attainmentHTML(value, module, key) : '';

  // Source
  const sourceHtml = source
    ? `<div class="kpi-source">Source: ${source}</div>` : '';

  // Status note / placeholder
  let noteHtml = '';
  if (isNotYet && definition) {
    noteHtml = `<div class="kpi-placeholder-note">${definition}</div>`;
  } else if (isNotYet) {
    noteHtml = '<div class="kpi-placeholder-note">Data source pending</div>';
  } else if (isPartial && note) {
    noteHtml = `<div class="kpi-partial-note">\u26A0 ${note}</div>`;
  }

  const cardClass = isNotYet
    ? 'kpi-card kpi-card--grey kpi-card--placeholder'
    : `kpi-card kpi-card--${status}`;
  const valueClass = isNotYet ? 'kpi-value kpi-value--muted' : 'kpi-value';

  return `
    <div class="${cardClass}" data-drilldown="${key}" data-module="${module || ''}">
      ${badgeHtml}
      ${cadenceHtml}
      <div class="kpi-label">${label}</div>
      <div class="${valueClass}">${displayVal}</div>
      ${deltaHtml}
      ${targetHtml}
      ${attHtml}
      ${noteHtml}
      ${sourceHtml}
    </div>`;
}
