export default {
  charts: [],
  _storage: null,

  async init(containerEl, data) {
    const { storage } = await import('../data/storage.js');
    this._storage = storage;
    window.manualEntry = this;

    this._buildPartnerFields(containerEl);
    await this._loadSavedValues();
    await this._renderSummaryTable(containerEl);
  },

  destroy() {
    window.manualEntry = null;
  },

  getSummaryKPIs() {
    return [
      { label: 'Partner Data Entry', value: 'Active', delta: '', status: 'green' }
    ];
  },

  _partnerFields: [
    {
      key: 'pcc_self_serve_new',
      label: 'PCC Self-Serve New Customers',
      type: 'number',
      placeholder: '0',
      hint: 'New customers onboarded by PCC without CCX sales involvement'
    },
    {
      key: 'pcc_pipeline_est',
      label: 'PCC Pipeline Estimate ($)',
      type: 'number',
      placeholder: '0',
      hint: 'Estimated pipeline value reported by PCC (monthly)'
    },
    {
      key: 'pcc_active_accounts',
      label: 'PCC Active Accounts (Total)',
      type: 'number',
      placeholder: '0',
      hint: 'Total active customer accounts via PCC channel'
    },
    {
      key: 'qhr_new_customers',
      label: 'QHR New Customers',
      type: 'number',
      placeholder: '0',
      hint: 'New customers onboarded through QHR channel'
    },
    {
      key: 'qhr_pipeline_est',
      label: 'QHR Pipeline Estimate ($)',
      type: 'number',
      placeholder: '0',
      hint: 'Estimated pipeline value reported by QHR (monthly)'
    }
  ],

  _buildPartnerFields(containerEl) {
    const container = containerEl.querySelector('#partner-fields');
    if (!container) return;

    container.innerHTML = this._partnerFields.map(f => `
      <div class="entry-field">
        <label for="field-${f.key}">${f.label}</label>
        <input
          type="${f.type}"
          id="field-${f.key}"
          data-key="${f.key}"
          placeholder="${f.placeholder}"
          class="input-modern"
        >
        ${f.hint ? `<div class="entry-field__meta">${f.hint}</div>` : ''}
        <div class="entry-field__last-saved" id="saved-${f.key}">
          No saved value
        </div>
      </div>
    `).join('');
  },

  async _loadSavedValues() {
    for (const f of this._partnerFields) {
      const saved = await this._storage.get('partner', f.key);
      if (saved) {
        const input = document.getElementById(`field-${f.key}`);
        if (input) input.value = saved.value;
        const meta = document.getElementById(`saved-${f.key}`);
        if (meta) {
          const date = new Date(saved.updated).toLocaleDateString('en-CA');
          meta.textContent = `Last saved: ${saved.value} on ${date}`;
        }
      }
    }
  },

  async saveSection(sectionName) {
    if (sectionName !== 'partner') return;

    for (const f of this._partnerFields) {
      const input = document.getElementById(`field-${f.key}`);
      if (input && input.value !== '') {
        await this._storage.set('partner', f.key, input.value);
        const meta = document.getElementById(`saved-${f.key}`);
        if (meta) {
          const date = new Date().toLocaleDateString('en-CA');
          meta.textContent = `Last saved: ${input.value} on ${date}`;
        }
      }
    }

    const confirm = document.getElementById('partner-save-confirm');
    if (confirm) {
      confirm.classList.add('visible');
      setTimeout(() => confirm.classList.remove('visible'), 3000);
    }

    await this._renderSummaryTable(document.querySelector('#tab-viewport'));
  },

  async _renderSummaryTable(containerEl) {
    const tbody = document.getElementById('manual-summary-tbody');
    if (!tbody) return;

    const rows = [];
    for (const f of this._partnerFields) {
      const saved = await this._storage.get('partner', f.key);
      if (saved) {
        const date = new Date(saved.updated).toLocaleString('en-CA', {
          month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
        rows.push({ field: f.label, value: saved.value, date });
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="color:#9E9E9E;font-style:italic;padding:24px 16px;">
            No saved values yet — enter data above and click Save
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td style="font-weight:600">${r.field}</td>
        <td class="col-right"><strong>${Number(r.value).toLocaleString()}</strong></td>
        <td style="color:#9E9E9E;font-size:12px;">${r.date}</td>
      </tr>
    `).join('');
  }
};
