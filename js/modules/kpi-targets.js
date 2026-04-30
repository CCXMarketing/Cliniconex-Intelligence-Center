// ── KPI Targets — scenario-aware annual targets ────────────────
// Three values per KPI: Threshold / Target / Overachieve
// Monthly derivation = annual ÷ 12, YTD = monthly × current_month
// Storage: targets_2026 in localStorage (Phase 2: Sheets sync)

const LS_KEY = 'targets_2026';

const CROSSHAIR_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';

// ── Data Access ─────────────────────────────────────────────────

function loadAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}

function saveAll(targets) {
  localStorage.setItem(LS_KEY, JSON.stringify(targets));
}

export function getTarget(module, kpiId) {
  return loadAll()[module]?.[kpiId] || { threshold: null, target: null, overachieve: null };
}

export function setTarget(module, kpiId, values) {
  const all = loadAll();
  if (!all[module]) all[module] = {};
  all[module][kpiId] = values;
  saveAll(all);
}

export function getActiveAnnual(module, kpiId) {
  const scenario = CIC.getScenario();
  return getTarget(module, kpiId)[scenario] ?? null;
}

export function getMonthlyTarget(module, kpiId) {
  const annual = getActiveAnnual(module, kpiId);
  return annual != null ? annual / 12 : null;
}

export function getYTDTarget(module, kpiId) {
  const monthly = getMonthlyTarget(module, kpiId);
  if (monthly == null) return null;
  return monthly * (new Date().getMonth() + 1);
}

// ── Attainment HTML ─────────────────────────────────────────────

export function attainmentHTML(value, module, kpiId) {
  const annual = getActiveAnnual(module, kpiId);
  if (annual == null) {
    return '<div class="kpi-set-targets-cta">Set targets \u2192</div>';
  }
  const monthly = annual / 12;
  if (value == null || monthly === 0) return '';
  const pct = (value / monthly) * 100;
  const cls = pct >= 100 ? 'green' : pct >= 90 ? 'yellow' : 'red';
  return `<div class="kpi-attainment kpi-attainment--${cls}">${Math.round(pct)}% of target</div>`;
}

// ── Wire Set-Targets Icons ──────────────────────────────────────

export function wireTargets(containerEl, module, onSave) {
  containerEl.querySelectorAll('.kpi-card[data-drilldown]').forEach(card => {
    if (card.querySelector('.kpi-targets-btn')) return;

    const key = card.dataset.drilldown;

    const btn = document.createElement('button');
    btn.className = 'kpi-targets-btn';
    btn.innerHTML = CROSSHAIR_SVG;
    btn.title = 'Set annual targets';
    card.appendChild(btn);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      openTargetForm(card, module, key, onSave);
    });

    // Also wire the "Set targets" CTA if present
    const cta = card.querySelector('.kpi-set-targets-cta');
    if (cta) {
      cta.style.cursor = 'pointer';
      cta.addEventListener('click', e => {
        e.stopPropagation();
        openTargetForm(card, module, key, onSave);
      });
    }
  });
}

function openTargetForm(card, module, kpiId, onSave) {
  // Close any existing form
  const existing = card.parentElement?.querySelector('.kpi-targets-form');
  if (existing) { existing.remove(); return; }

  const current = getTarget(module, kpiId);
  const label = card.querySelector('.kpi-label')?.textContent || kpiId;

  const form = document.createElement('div');
  form.className = 'kpi-targets-form';
  form.innerHTML = `
    <div class="kpi-targets-form__title">Annual Targets \u2014 ${label}</div>
    <div class="kpi-targets-form__grid">
      <div class="kpi-targets-form__field">
        <label>Threshold</label>
        <input type="number" step="any" class="tgt-input" data-scenario="threshold"
               value="${current.threshold ?? ''}" placeholder="\u2014">
      </div>
      <div class="kpi-targets-form__field">
        <label>Target</label>
        <input type="number" step="any" class="tgt-input" data-scenario="target"
               value="${current.target ?? ''}" placeholder="\u2014">
      </div>
      <div class="kpi-targets-form__field">
        <label>Overachieve</label>
        <input type="number" step="any" class="tgt-input" data-scenario="overachieve"
               value="${current.overachieve ?? ''}" placeholder="\u2014">
      </div>
    </div>
    <div class="kpi-targets-form__actions">
      <button class="kpi-targets-form__save">Save</button>
      <button class="kpi-targets-form__cancel">Cancel</button>
    </div>`;

  card.parentElement.insertBefore(form, card.nextSibling);
  form.querySelector('.tgt-input').focus();

  const save = () => {
    const parse = (scenario) => {
      const v = form.querySelector(`.tgt-input[data-scenario="${scenario}"]`).value.trim();
      return v === '' ? null : parseFloat(v);
    };
    setTarget(module, kpiId, {
      threshold:   parse('threshold'),
      target:      parse('target'),
      overachieve: parse('overachieve'),
    });
    form.remove();
    if (onSave) onSave();
  };

  form.querySelector('.kpi-targets-form__save').addEventListener('click', e => { e.stopPropagation(); save(); });
  form.querySelector('.kpi-targets-form__cancel').addEventListener('click', e => { e.stopPropagation(); form.remove(); });
  form.querySelectorAll('.tgt-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); form.remove(); }
    });
  });
  form.addEventListener('click', e => e.stopPropagation());
}
