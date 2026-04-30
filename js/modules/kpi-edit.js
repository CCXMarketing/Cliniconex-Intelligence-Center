// ── CIC KPI Inline Edit — universal per-card pencil editing ──────
//
// Adds a pencil icon to every .kpi-card[data-drilldown] element.
// On click: inline input + Save/Cancel. Persists via storage.saveAndSync.
// For API-sourced KPIs with manual overrides, shows purple pill + Revert link.
//
// Usage:  import { wireKpiEdit } from './kpi-edit.js';
//         wireKpiEdit(containerEl, 'marketing', data.kpis);

const PENCIL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';

let _storage = null;

async function getStorage() {
  if (_storage) return _storage;
  const mod = await import('../data/storage.js');
  _storage = mod.storage;
  return _storage;
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function inferUnit(text) {
  if (!text) return 'count';
  const t = text.trim();
  if (t.startsWith('$')) return 'currency';
  if (t.endsWith('%')) return 'percent';
  if (t.includes(':1')) return 'multiplier';
  return 'count';
}

function formatValue(n, unit) {
  if (unit === 'currency') return CIC.formatCurrency(n);
  if (unit === 'percent') return CIC.formatPercent(n);
  if (unit === 'multiplier') return n.toFixed(1) + ':1';
  if (unit === 'ratio') return Math.round(n) + ':1';
  return n.toLocaleString();
}

/**
 * Wire pencil-edit icons onto every KPI card in the container.
 * @param {HTMLElement} containerEl - Tab viewport element
 * @param {string} department - Department key for storage (e.g. 'marketing')
 * @param {Object} kpiData - data.kpis object from the module's data
 */
export async function wireKpiEdit(containerEl, department, kpiData) {
  const storage = await getStorage();

  containerEl.querySelectorAll('.kpi-card[data-drilldown]').forEach(card => {
    // Skip if already wired
    if (card.querySelector('.kpi-edit-pencil')) return;

    const valueEl = card.querySelector('.kpi-value');
    if (!valueEl) return;

    const key = card.dataset.drilldown;
    const kpi = kpiData?.[key];
    const unit = kpi?.unit || card.dataset.unit || inferUnit(valueEl.textContent);
    const isLive = kpi?._dataSource === 'live';
    const isOverride = kpi?._dataSource === 'manual_override';

    // Store live value for revert
    if (isLive && kpi.value != null) {
      card.dataset.liveValue = kpi.value;
      card.dataset.dataSource = 'live';
    }
    if (isOverride && kpi._liveValue != null) {
      card.dataset.liveValue = kpi._liveValue;
      card.dataset.dataSource = 'live';
      // Override was already applied by router — show pill immediately
      showOverridePill(card, key, department, unit, storage);
    }

    // Check for existing manual override on a live KPI (not yet applied by router)
    const overrideKey = `cic_override_${department}_${key}`;
    if (isLive && localStorage.getItem(overrideKey)) {
      applyOverrideFromStorage(card, key, department, unit, kpi, storage);
    }

    // Add pencil icon
    const pencil = document.createElement('button');
    pencil.className = 'kpi-edit-pencil';
    pencil.innerHTML = PENCIL_SVG;
    pencil.title = 'Edit this value';
    card.appendChild(pencil);

    pencil.addEventListener('click', e => {
      e.stopPropagation();
      enterEditMode(card, valueEl, key, department, unit, storage);
    });
  });
}

async function applyOverrideFromStorage(card, key, department, unit, kpi, storage) {
  try {
    const entries = await storage.readFromSheets(department);
    const entry = entries.find(e => e.kpi_id === key && e.value);
    if (entry) {
      const val = parseFloat(entry.value);
      if (!isNaN(val)) {
        const valueEl = card.querySelector('.kpi-value');
        if (valueEl) valueEl.textContent = formatValue(val, unit);
        showOverridePill(card, key, department, unit, storage);
      }
    }
  } catch {
    // Storage read failed — show live value without override
  }
}

function enterEditMode(card, valueEl, key, department, unit, storage) {
  if (card.classList.contains('kpi-editing')) return;
  card.classList.add('kpi-editing');

  // Parse current displayed value
  const raw = valueEl.textContent.replace(/[^0-9.\-]/g, '');

  // Create input
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'kpi-edit-input';
  input.value = raw;
  input.step = 'any';

  // Create action buttons
  const actions = document.createElement('div');
  actions.className = 'kpi-edit-actions';
  actions.innerHTML =
    '<button class="kpi-edit-save">Save</button>' +
    '<button class="kpi-edit-cancel">Cancel</button>';

  // Insert after value element
  valueEl.after(input, actions);
  input.focus();
  input.select();

  const save = async () => {
    const newVal = parseFloat(input.value);
    if (isNaN(newVal)) { cancel(); return; }

    // Update display immediately
    valueEl.textContent = formatValue(newVal, unit);

    // Build entry for storage
    const label = card.querySelector('.kpi-label')?.textContent || key;
    const entry = {
      kpi_id: key,
      kpi_name: label,
      department,
      period: currentPeriod(),
      value: newVal.toString(),
      updated_by: ''
    };
    await storage.saveAndSync(entry);

    // If overriding a live KPI, show the override pill
    if (card.dataset.dataSource === 'live') {
      localStorage.setItem(`cic_override_${department}_${key}`, 'true');
      showOverridePill(card, key, department, unit, storage);
    }

    exitEditMode(card, input, actions);
    showSavedIndicator(card);
  };

  const cancel = () => {
    exitEditMode(card, input, actions);
  };

  const saveBtn = actions.querySelector('.kpi-edit-save');
  const cancelBtn = actions.querySelector('.kpi-edit-cancel');

  saveBtn.addEventListener('click', e => { e.stopPropagation(); save(); });
  cancelBtn.addEventListener('click', e => { e.stopPropagation(); cancel(); });

  // Keyboard: Enter saves, Esc cancels, Tab moves between controls
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); saveBtn.focus(); }
  });
  saveBtn.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); cancelBtn.focus(); }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); input.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  });
  cancelBtn.addEventListener('keydown', e => {
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); saveBtn.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter') { e.preventDefault(); cancel(); }
  });
}

function exitEditMode(card, input, actions) {
  card.classList.remove('kpi-editing');
  input.remove();
  actions.remove();
}

function showSavedIndicator(card) {
  let indicator = card.querySelector('.kpi-edit-saved');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'kpi-edit-saved';
    indicator.textContent = '\u2713 Saved';
    card.appendChild(indicator);
  }
  indicator.classList.add('visible');
  setTimeout(() => indicator.classList.remove('visible'), 3000);
}

function showOverridePill(card, key, department, unit, storage) {
  // Remove existing override UI if present
  card.querySelector('.kpi-override-pill')?.remove();
  card.querySelector('.kpi-override-revert')?.remove();

  const pill = document.createElement('span');
  pill.className = 'kpi-override-pill';
  pill.textContent = 'Manual override';

  const revert = document.createElement('a');
  revert.className = 'kpi-override-revert';
  revert.href = '#';
  revert.textContent = 'Revert to API';

  revert.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();

    // Restore live value
    const liveVal = parseFloat(card.dataset.liveValue);
    if (!isNaN(liveVal)) {
      const valueEl = card.querySelector('.kpi-value');
      if (valueEl) valueEl.textContent = formatValue(liveVal, unit);
    }

    // Remove override flag
    localStorage.removeItem(`cic_override_${department}_${key}`);

    // Remove override UI
    pill.remove();
    revert.remove();
  });

  // Insert after the value element
  const valueEl = card.querySelector('.kpi-value');
  if (valueEl) {
    // Insert after delta if present, otherwise after value
    const delta = card.querySelector('.kpi-delta');
    const insertAfter = delta || valueEl;
    insertAfter.after(pill, revert);
  }
}
