export default {
  charts: [],
  _storage: null,

  async init(containerEl, data) {
    const { storage } = await import('../data/storage.js');
    this._storage = storage;

    // Expose save methods globally for onclick handlers
    window.manualEntry = this;

    this._buildFinanceFields(containerEl);
    this._buildHRFields(containerEl);
    this._buildPartnerFields(containerEl);
    await this._loadSavedValues();
    await this._renderSummaryTable(containerEl);
  },

  destroy() {
    window.manualEntry = null;
  },

  getSummaryKPIs() {
    return [
      { label: 'Manual Entry', value: 'Active', delta: '', status: 'green' }
    ];
  },

  // ── Field Definitions ──

  _financeFields: [
    { key: 'ebitda_actual',       label: 'EBITDA Actual (Month)',     type: 'number', placeholder: '91700' },
    { key: 'spend_paid_search',   label: 'Paid Search Spend',         type: 'number', placeholder: '8000' },
    { key: 'spend_paid_social',   label: 'Paid Social Spend',         type: 'number', placeholder: '4000' },
    { key: 'spend_content',       label: 'Content / SEO Spend',       type: 'number', placeholder: '2000' },
    { key: 'spend_events',        label: 'Events Spend',              type: 'number', placeholder: '1500' },
    { key: 'support_dept_cost',   label: 'Support Dept Cost (Month)', type: 'number', placeholder: '40000' }
  ],

  _hrFields: [
    { key: 'total_fte',           label: 'Total FTE Headcount',       type: 'number', placeholder: '82' },
    { key: 'new_hires_month',     label: 'New Hires This Month',      type: 'number', placeholder: '0' },
    { key: 'departures_month',    label: 'Departures This Month',     type: 'number', placeholder: '0' }
  ],

  _partnerFields: [
    { key: 'pcc_self_serve_new',  label: 'PCC Self-Serve New Customers', type: 'number', placeholder: '0' },
    { key: 'pcc_pipeline_est',    label: 'PCC Pipeline Estimate ($)',    type: 'number', placeholder: '0' }
  ],

  // ── Build Fields ──

  _buildFields(containerEl, sectionId, fields, dept) {
    const container = containerEl.querySelector(`#${sectionId}-fields`);
    if (!container) return;
    container.innerHTML = fields.map(f => `
      <div class="entry-field">
        <label for="field-${f.key}">${f.label}</label>
        <input
          type="${f.type}"
          id="field-${f.key}"
          data-key="${f.key}"
          data-dept="${dept}"
          placeholder="${f.placeholder}"
          style="height: 36px; padding: 0 12px; border: 1px solid #D2D5DA; border-radius: 6px; font-family: 'Nunito Sans', sans-serif; font-size: 14px; color: #404041; outline: none; transition: border-color 0.2s;"
          onfocus="this.style.borderColor='#029FB5'"
          onblur="this.style.borderColor='#D2D5DA'"
        >
        <div class="entry-field__last-saved" id="saved-${f.key}">No saved value</div>
      </div>
    `).join('');
  },

  _buildFinanceFields(containerEl) {
    this._buildFields(containerEl, 'finance', this._financeFields, 'finance');
  },

  _buildHRFields(containerEl) {
    this._buildFields(containerEl, 'hr', this._hrFields, 'hr');
  },

  _buildPartnerFields(containerEl) {
    this._buildFields(containerEl, 'partner', this._partnerFields, 'partner');
  },

  // ── Load Saved Values ──

  async _loadSavedValues() {
    const sections = [
      { dept: 'finance', fields: this._financeFields },
      { dept: 'hr',      fields: this._hrFields },
      { dept: 'partner', fields: this._partnerFields }
    ];

    for (const { dept, fields } of sections) {
      for (const f of fields) {
        const saved = await this._storage.get(dept, f.key);
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
    }
  },

  // ── Save Section ──

  async saveSection(sectionName) {
    const fieldMap = {
      finance: this._financeFields,
      hr:      this._hrFields,
      partner: this._partnerFields
    };
    const fields = fieldMap[sectionName];
    if (!fields) return;

    for (const f of fields) {
      const input = document.getElementById(`field-${f.key}`);
      if (input && input.value !== '') {
        await this._storage.set(sectionName, f.key, input.value);
        const meta = document.getElementById(`saved-${f.key}`);
        if (meta) {
          const date = new Date().toLocaleDateString('en-CA');
          meta.textContent = `Last saved: ${input.value} on ${date}`;
        }
      }
    }

    // Show confirmation
    const confirm = document.getElementById(`${sectionName}-save-confirm`);
    if (confirm) {
      confirm.classList.add('visible');
      setTimeout(() => confirm.classList.remove('visible'), 3000);
    }

    // Refresh summary table
    await this._renderSummaryTable(document.querySelector('#tab-viewport'));
  },

  // ── Summary Table ──

  async _renderSummaryTable(containerEl) {
    const tbody = document.getElementById('manual-summary-tbody');
    if (!tbody) return;

    const sections = [
      { dept: 'finance', label: 'Finance', fields: this._financeFields },
      { dept: 'hr',      label: 'HR',      fields: this._hrFields },
      { dept: 'partner', label: 'Partner', fields: this._partnerFields }
    ];

    const rows = [];
    for (const { dept, label, fields } of sections) {
      for (const f of fields) {
        const saved = await this._storage.get(dept, f.key);
        if (saved) {
          const date = new Date(saved.updated).toLocaleString('en-CA', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          rows.push({ section: label, field: f.label, value: saved.value, date });
        }
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="color: #9E9E9E; font-style: italic; padding: 24px 16px;">No saved values yet</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><span class="badge badge--blue">${r.section}</span></td>
        <td>${r.field}</td>
        <td class="col-right"><strong>${r.value}</strong></td>
        <td style="color: #9E9E9E; font-size: 12px;">${r.date}</td>
      </tr>
    `).join('');
  }
};
