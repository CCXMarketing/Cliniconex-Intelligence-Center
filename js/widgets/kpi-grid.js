// ── KPI Grid Widget — Period-Aware ──────────────────────────────
//
// Renders a grid of KPI cards driven by the catalog and data layer.
// Each card shows the current period's value (or empty state), plus
// a collapsible history panel for viewing/editing past periods.
//
// Export shape (shared by all widgets):
//   export async function render(containerEl, kpiIds, sectionConfig, dataLayer)
//   export function destroy()

import { catalog } from '../data/catalog.js';

const PENCIL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';

let _charts = [];

export async function render(containerEl, kpiIds, sectionConfig, dataLayer) {
  const grid = document.createElement('div');
  grid.className = 'kpi-grid';
  containerEl.appendChild(grid);

  for (const kpiId of kpiIds) {
    const meta = await catalog.getKpi(kpiId);
    if (!meta) {
      console.warn(`[KpiGrid] KPI "${kpiId}" not found in catalog — skipping.`);
      continue;
    }

    const result = await dataLayer.getValue(kpiId);
    const card = await buildCard(meta, result, kpiId, dataLayer);
    grid.appendChild(card);
  }

  return () => destroy();
}

export function destroy() {
  _charts.forEach(c => { try { c.destroy(); } catch {} });
  _charts = [];
}

// ── Card Building ───────────────────────────────────────────────

async function buildCard(meta, result, kpiId, dataLayer) {
  const card = document.createElement('div');
  card.className = 'kpi-card kpi-card--grey';
  card.dataset.kpiId = kpiId;

  const unit = inferUnit(meta);
  const cadence = (meta.cadence || 'monthly').toUpperCase();
  const periodLabel = result.periodLabel || '';
  const badgeText = `${cadence} \u00B7 ${periodLabel.toUpperCase()}`;

  if (result.source === 'none') {
    // ── Empty state ──
    let priorHintHtml = '';
    const lastEntry = await findLastEntry(kpiId, result.period, dataLayer);
    if (lastEntry) {
      priorHintHtml = `<div class="kpi-prior-hint">Last entered: ${formatValue(lastEntry.value, unit)} (${lastEntry.periodLabel})</div>`;
    }

    card.innerHTML = `
      <div class="kpi-cadence">${badgeText}</div>
      <div class="kpi-label">${meta.name}</div>
      <div class="kpi-empty-state">
        <div class="kpi-empty-text">No data yet for ${periodLabel}</div>
        <button class="kpi-add-btn">+ Add value</button>
        ${priorHintHtml}
      </div>`;

    card.querySelector('.kpi-add-btn').addEventListener('click', e => {
      e.stopPropagation();
      openEditor(card, kpiId, meta, unit, dataLayer, null, { period: result.period });
    });
  } else {
    // ── Has value ──
    const dotColor = result.source === 'live' ? '#4CAF50' : '#9E9E9E';
    const dotTitle = result.source === 'live'
      ? 'Live data'
      : `Manual entry${result.timestamp ? ' \u2014 ' + result.timestamp : ''}`;

    card.innerHTML = `
      <div class="kpi-cadence">${badgeText}</div>
      <div class="kpi-label">${meta.name}</div>
      <div class="kpi-value">${formatValue(result.value, unit)}</div>
      <div class="kpi-source-row">
        <span class="kpi-source-dot" style="background:${dotColor};" title="${dotTitle}"></span>
        <button class="kpi-edit-pencil" title="Edit this value">${PENCIL_SVG}</button>
      </div>`;

    card.querySelector('.kpi-edit-pencil').addEventListener('click', e => {
      e.stopPropagation();
      openEditor(card, kpiId, meta, unit, dataLayer, result.value, { period: result.period });
    });
  }

  // ── History toggle (always present) ──
  const toggle = document.createElement('div');
  toggle.className = 'kpi-history-toggle';
  toggle.textContent = 'Show history \u25BE';
  card.appendChild(toggle);

  let historyPanel = null;
  let expanded = false;

  toggle.addEventListener('click', async (e) => {
    e.stopPropagation();
    expanded = !expanded;

    if (expanded) {
      toggle.textContent = 'Hide history \u25B4';
      if (!historyPanel) {
        historyPanel = await buildHistoryPanel(kpiId, meta, unit, result.period, dataLayer, card);
        card.appendChild(historyPanel);
      }
      historyPanel.style.display = '';
    } else {
      toggle.textContent = 'Show history \u25BE';
      if (historyPanel) historyPanel.style.display = 'none';
    }
  });

  return card;
}

// ── Find last prior entry ───────────────────────────────────────

async function findLastEntry(kpiId, currentPeriod, dataLayer) {
  try {
    const history = await dataLayer.getValueHistory(kpiId);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].period !== currentPeriod && history[i].value != null) {
        return history[i];
      }
    }
  } catch {
    // History unavailable
  }
  return null;
}

// ── History Panel ───────────────────────────────────────────────

async function buildHistoryPanel(kpiId, meta, unit, currentPeriod, dataLayer, card) {
  const panel = document.createElement('div');
  panel.className = 'kpi-history-panel';

  const history = await dataLayer.getValueHistory(kpiId);
  // Show prior periods only (exclude current), most recent first
  const priorPeriods = history.filter(h => h.period !== currentPeriod).reverse();

  if (priorPeriods.length === 0) {
    panel.innerHTML = '<div class="kpi-history-empty-msg">No prior periods</div>';
    return panel;
  }

  for (const entry of priorPeriods) {
    const row = buildHistoryRow(entry, kpiId, meta, unit, dataLayer, card);
    panel.appendChild(row);
  }

  return panel;
}

function buildHistoryRow(entry, kpiId, meta, unit, dataLayer, card) {
  const row = document.createElement('div');
  row.className = 'kpi-history-row';

  const periodSpan = document.createElement('span');
  periodSpan.className = 'kpi-history-period';
  periodSpan.textContent = entry.periodLabelShort;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'kpi-history-value';

  const actionBtn = document.createElement('button');

  if (entry.value != null) {
    valueSpan.textContent = formatValue(entry.value, unit);
    actionBtn.className = 'kpi-history-edit';
    actionBtn.innerHTML = PENCIL_SVG;
    actionBtn.title = 'Edit';
  } else {
    valueSpan.textContent = '\u2014';
    valueSpan.classList.add('kpi-history-value--empty');
    actionBtn.className = 'kpi-history-add';
    actionBtn.textContent = '+ Add';
  }

  actionBtn.addEventListener('click', e => {
    e.stopPropagation();
    openHistoryEditor(row, kpiId, meta, unit, dataLayer, entry, card);
  });

  row.appendChild(periodSpan);
  row.appendChild(valueSpan);
  row.appendChild(actionBtn);
  return row;
}

// ── Inline Editors ──────────────────────────────────────────────

function openEditor(card, kpiId, meta, unit, dataLayer, currentValue, options = {}) {
  if (card.querySelector('.kpi-inline-editor')) return;

  const emptyState = card.querySelector('.kpi-empty-state');
  if (emptyState) emptyState.style.display = 'none';
  const sourceRow = card.querySelector('.kpi-source-row');
  if (sourceRow) sourceRow.style.display = 'none';

  const editor = document.createElement('div');
  editor.className = 'kpi-inline-editor';
  editor.innerHTML = `
    <input type="number" class="kpi-edit-input" step="any"
      value="${currentValue != null ? currentValue : ''}"
      placeholder="Enter value">
    <div class="kpi-edit-actions">
      <button class="kpi-edit-save">Save</button>
      <button class="kpi-edit-cancel">Cancel</button>
    </div>`;

  const insertAfter = card.querySelector('.kpi-value') || card.querySelector('.kpi-label');
  insertAfter.after(editor);

  const input = editor.querySelector('.kpi-edit-input');
  input.focus();
  if (currentValue != null) input.select();

  const save = async () => {
    const newVal = parseFloat(input.value);
    if (isNaN(newVal)) { cancel(); return; }

    await dataLayer.setValue(kpiId, newVal, { period: options.period });

    const freshResult = await dataLayer.getValue(kpiId);
    const newCard = await buildCard(meta, freshResult, kpiId, dataLayer);
    card.replaceWith(newCard);
    showSaved(newCard);
  };

  const cancel = () => {
    editor.remove();
    if (emptyState) emptyState.style.display = '';
    if (sourceRow) sourceRow.style.display = '';
  };

  editor.querySelector('.kpi-edit-save').addEventListener('click', e => { e.stopPropagation(); save(); });
  editor.querySelector('.kpi-edit-cancel').addEventListener('click', e => { e.stopPropagation(); cancel(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function openHistoryEditor(row, kpiId, meta, unit, dataLayer, entry, card) {
  if (row.querySelector('.kpi-history-editor')) return;

  // Hide the value and action button
  const valueSpan = row.querySelector('.kpi-history-value');
  const actionBtn = row.querySelector('.kpi-history-edit, .kpi-history-add');
  if (valueSpan) valueSpan.style.display = 'none';
  if (actionBtn) actionBtn.style.display = 'none';

  const editor = document.createElement('div');
  editor.className = 'kpi-history-editor';
  editor.innerHTML = `
    <input type="number" class="kpi-history-input" step="any"
      value="${entry.value != null ? entry.value : ''}"
      placeholder="Value">
    <button class="kpi-edit-save">Save</button>
    <button class="kpi-edit-cancel">\u2715</button>`;

  row.appendChild(editor);
  const input = editor.querySelector('.kpi-history-input');
  input.focus();
  if (entry.value != null) input.select();

  const save = async () => {
    const newVal = parseFloat(input.value);
    if (isNaN(newVal)) { cancel(); return; }

    await dataLayer.setValue(kpiId, newVal, { period: entry.period });

    // Update the row in-place
    editor.remove();
    if (valueSpan) {
      valueSpan.textContent = formatValue(newVal, unit);
      valueSpan.classList.remove('kpi-history-value--empty');
      valueSpan.style.display = '';
    }
    if (actionBtn) {
      // Convert "Add" to "Edit" if needed
      if (actionBtn.classList.contains('kpi-history-add')) {
        actionBtn.className = 'kpi-history-edit';
        actionBtn.innerHTML = PENCIL_SVG;
        actionBtn.title = 'Edit';
      }
      actionBtn.style.display = '';
    }
    entry.value = newVal;

    // If the edited period is the current period, refresh the main card
    const currentResult = await dataLayer.getValue(kpiId);
    if (entry.period === currentResult.period) {
      const newCard = await buildCard(meta, currentResult, kpiId, dataLayer);
      card.replaceWith(newCard);
    }
  };

  const cancel = () => {
    editor.remove();
    if (valueSpan) valueSpan.style.display = '';
    if (actionBtn) actionBtn.style.display = '';
  };

  editor.querySelector('.kpi-edit-save').addEventListener('click', e => { e.stopPropagation(); save(); });
  editor.querySelector('.kpi-edit-cancel').addEventListener('click', e => { e.stopPropagation(); cancel(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function showSaved(card) {
  const el = document.createElement('div');
  el.className = 'kpi-edit-saved visible';
  el.textContent = '\u2713 Saved';
  card.appendChild(el);
  setTimeout(() => el.classList.remove('visible'), 3000);
}

// ── Value Formatting ────────────────────────────────────────────

function inferUnit(meta) {
  const def = (meta.definition || '').toLowerCase();
  const name = (meta.name || '').toLowerCase();
  if (def.startsWith('%') || def.includes('% of') || name.includes('rate')) return 'percent';
  if (name.includes('cost') || name.includes('revenue per') || def.includes('total revenue /')) return 'currency';
  return 'count';
}

function formatValue(value, unit) {
  if (value == null) return '\u2014';
  if (unit === 'currency') return CIC.formatCurrency(value);
  if (unit === 'percent') return CIC.formatPercent(value);
  return value.toLocaleString();
}
