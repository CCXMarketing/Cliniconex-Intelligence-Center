import { catalog } from '../data/catalog.js';

const DEPT_ORDER = [
  'marketing', 'sales', 'partnerships',
  'customer-success', 'support', 'product'
];

export default {
  charts: [],
  _storage: null,
  _entries: {},

  async init(containerEl) {
    const { storage } = await import('../data/storage.js');
    this._storage = storage;
    window.manualEntry = this;

    const cat = await catalog.load();
    const period = this._currentPeriod();

    this._renderHeader(containerEl, period);
    await this._renderDepartmentForms(containerEl, cat, period);
    await this._loadSheetData(period);
    await this._renderSummaryTable(containerEl);
  },

  destroy() {
    window.manualEntry = null;
  },

  getSummaryKPIs() {
    const count = Object.values(this._entries).filter(e => e.value).length;
    return [
      { label: 'Manual Entries', value: `${count} KPIs`, delta: '', status: count > 0 ? 'green' : 'grey' }
    ];
  },

  _currentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  _renderHeader(containerEl, period) {
    const header = containerEl.querySelector('.dept-header');
    if (header) {
      header.querySelector('h2').textContent = 'KPI Manual Entry';
      header.querySelector('p').textContent =
        'Enter monthly values for KPIs without automated data sources';
    }

    const banner = containerEl.querySelector('.manual-entry-banner');
    if (banner) {
      banner.innerHTML = `
        <strong>Period:</strong> ${this._formatPeriod(period)} &nbsp;·&nbsp;
        Values are saved to Google Sheets and shared across the team.
        KPIs with automated sources are pre-filled — only manual entries are editable.`;
    }
  },

  async _renderDepartmentForms(containerEl, cat, period) {
    const formArea = containerEl.querySelector('#manual-entry-forms');
    if (!formArea) return;

    let html = '';
    for (const tabId of DEPT_ORDER) {
      const dept = cat.departments[tabId];
      if (!dept) continue;

      const manualKpis = Object.values(dept.kpis).filter(
        k => k.measurable_today !== 'yes'
      );
      if (manualKpis.length === 0) continue;

      html += `
        <div class="manual-dept-section" data-dept="${tabId}">
          <div class="manual-dept-section__header" data-toggle="${tabId}">
            <h3>${dept.name}</h3>
            <span class="manual-dept-section__count">${manualKpis.length} KPIs need manual entry</span>
            <span class="manual-dept-section__chevron">▾</span>
          </div>
          <div class="manual-dept-section__body" id="dept-body-${tabId}">
            <div class="entry-grid">
              ${manualKpis.map(kpi => this._renderKpiField(kpi, period)).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:16px;">
              <button class="btn btn--sm" onclick="window.manualEntry.saveDepartment('${tabId}')">
                Save ${dept.name}
              </button>
              <span class="entry-field__save-confirm" id="save-confirm-${tabId}">✓ Saved</span>
            </div>
          </div>
        </div>`;
    }

    formArea.innerHTML = html;

    formArea.querySelectorAll('[data-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const body = document.getElementById(`dept-body-${header.dataset.toggle}`);
        const chevron = header.querySelector('.manual-dept-section__chevron');
        if (body.style.display === 'none') {
          body.style.display = '';
          chevron.textContent = '▾';
        } else {
          body.style.display = 'none';
          chevron.textContent = '▸';
        }
      });
    });
  },

  _renderKpiField(kpi, period) {
    const badge = catalog.measurabilityBadge(kpi);
    const fieldId = `entry-${kpi.id}`;

    return `
      <div class="entry-field" data-kpi-id="${kpi.id}">
        <label for="${fieldId}">
          ${kpi.name}
          <span class="kpi-badge ${badge.cssClass}" style="position:static;margin-left:8px;">${badge.label}</span>
        </label>
        <input
          type="number"
          id="${fieldId}"
          data-kpi-id="${kpi.id}"
          data-kpi-name="${kpi.name}"
          data-department="${kpi.departmentName}"
          placeholder="Enter value"
          class="input-modern"
          step="any"
        >
        <div class="entry-field__meta">
          ${kpi.definition || ''}
          ${kpi.accountable ? ` · Owner: ${kpi.accountable}` : ''}
          ${kpi.data_source_raw ? ` · Source: ${kpi.data_source_raw}` : ''}
        </div>
        <div class="entry-field__last-saved" id="saved-${kpi.id}">
          No saved value
        </div>
      </div>`;
  },

  async _loadSheetData(period) {
    const entries = await this._storage.readFromSheets(null, period);
    for (const entry of entries) {
      if (entry.value) {
        this._entries[entry.kpi_id] = entry;
        const input = document.querySelector(`[data-kpi-id="${entry.kpi_id}"]`);
        if (input) input.value = entry.value;
        const saved = document.getElementById(`saved-${entry.kpi_id}`);
        if (saved && entry.updated_at) {
          const date = new Date(entry.updated_at).toLocaleDateString('en-CA');
          const who = entry.updated_by ? ` by ${entry.updated_by}` : '';
          saved.textContent = `Last saved: ${entry.value}${who} on ${date}`;
        }
      }
    }
  },

  async saveDepartment(tabId) {
    const section = document.querySelector(`[data-dept="${tabId}"]`);
    if (!section) return;

    const inputs = section.querySelectorAll('input[data-kpi-id]');
    const period = this._currentPeriod();
    let savedCount = 0;

    for (const input of inputs) {
      if (input.value === '') continue;

      const entry = {
        kpi_id: input.dataset.kpiId,
        kpi_name: input.dataset.kpiName,
        department: input.dataset.department,
        period,
        value: input.value,
        updated_by: '',
      };

      const result = await this._storage.saveAndSync(entry);
      this._entries[entry.kpi_id] = entry;

      const saved = document.getElementById(`saved-${entry.kpi_id}`);
      if (saved) {
        const date = new Date().toLocaleDateString('en-CA');
        const syncIcon = result.synced ? '☁' : '💾';
        saved.textContent = `${syncIcon} Saved: ${input.value} on ${date}`;
      }
      savedCount++;
    }

    const confirm = document.getElementById(`save-confirm-${tabId}`);
    if (confirm && savedCount > 0) {
      confirm.classList.add('visible');
      setTimeout(() => confirm.classList.remove('visible'), 3000);
    }

    await this._renderSummaryTable(document.querySelector('#tab-viewport'));
  },

  async _renderSummaryTable(containerEl) {
    const tbody = document.getElementById('manual-summary-tbody');
    if (!tbody) return;

    const rows = Object.values(this._entries).filter(e => e.value);

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="color:#9E9E9E;font-style:italic;padding:24px 16px;">
            No saved values yet — enter data above and click Save
          </td>
        </tr>`;
      return;
    }

    rows.sort((a, b) => (a.department || '').localeCompare(b.department || ''));

    tbody.innerHTML = rows.map(r => {
      const date = r.updated_at
        ? new Date(r.updated_at).toLocaleDateString('en-CA')
        : '';
      return `
        <tr>
          <td>${r.department || ''}</td>
          <td style="font-weight:600">${r.kpi_name || r.kpi_id}</td>
          <td class="col-right"><strong>${Number(r.value).toLocaleString()}</strong></td>
          <td>${r.updated_by || ''}</td>
          <td style="color:#9E9E9E;font-size:12px;">${date}</td>
        </tr>`;
    }).join('');
  },

  _formatPeriod(period) {
    const [y, m] = period.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
};
