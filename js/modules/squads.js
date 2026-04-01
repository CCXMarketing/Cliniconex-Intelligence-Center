export default {
  charts: [],
  _data: null,

  init(containerEl, data) {
    this._data = data;
    this._renderSquads(containerEl, data);
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  },

  getSummaryKPIs() {
    if (!this._data || !this._data.squads) return [];

    const squads = this._data.squads;
    const calcHealth = (squad) => {
      const kpis = squad.kpi_refs || [];
      if (kpis.length === 0) return 0;
      return Math.round((kpis.filter(k => k.status === 'green').length / kpis.length) * 100);
    };

    // Squads can be an object or array — handle the mock-executive format (object with keys)
    const squadList = Array.isArray(squads) ? squads : Object.values(squads);

    return squadList.map(sq => {
      const kpis = sq.kpi_refs || [];
      const health = kpis.length > 0
        ? Math.round((kpis.filter(k => k.status === 'green').length / kpis.length) * 100)
        : 0;
      const status = health >= 70 ? 'green' : health >= 40 ? 'yellow' : 'red';
      return { label: `${sq.name} Health`, value: health + '%', delta: '', status };
    });
  },

  // ── Render All Squads ──

  _renderSquads(containerEl, data) {
    const container = containerEl.querySelector('#squads-container');
    if (!container) return;

    const squads = data.squads;
    if (!squads) {
      container.innerHTML = '<div class="not-measurable">Squad data not available</div>';
      return;
    }

    // Handle object-keyed squads from mock-executive.js
    const squadList = Array.isArray(squads) ? squads : Object.values(squads);

    container.innerHTML = squadList.map((squad, idx) => {
      // kpi_refs may be full objects (with value/status) or just string references
      // The mock-executive.js provides kpi_refs as string arrays — we use fallback KPIs
      const kpis = this._resolveKPIs(squad);
      return this._buildSquadSection(squad, kpis, idx);
    }).join('');
  },

  // ── Resolve KPIs ──
  // If kpi_refs are strings (references), use hardcoded Phase 1 fallback values.
  // If kpi_refs are objects with {label, value, status}, use directly.

  _resolveKPIs(squad) {
    const refs = squad.kpi_refs || [];
    if (refs.length === 0) return [];

    // If refs are already objects with label/value/status, use them directly
    if (typeof refs[0] === 'object' && refs[0].label) {
      return refs;
    }

    // Phase 1 fallback: map string refs to known KPI values
    return refs.map(ref => this._fallbackKPI(ref, squad.name)).filter(Boolean);
  },

  _fallbackKPI(ref, squadName) {
    // Hardcoded Phase 1 KPI lookup — matches values from department mock data
    const lookup = {
      // Growth Squad
      new_mrr_added:            { label: 'New MRR Added',             value: '$34.8K',  status: 'yellow', dept: 'Sales' },
      quota_attainment:         { label: 'Quota Attainment Avg',      value: '88%',     status: 'yellow', dept: 'Sales' },
      expansion_revenue:        { label: 'Expansion Revenue',         value: '$12.4K',  status: 'yellow', dept: 'CS' },
      hiro_conversion_rate:     { label: 'HIRO Conversion Rate',      value: '24.1%',   status: 'yellow', dept: 'Marketing' },
      marketing_created_deals:  { label: 'Marketing-Created Deals',   value: '142',     status: 'yellow', dept: 'Marketing' },
      gross_retention_rate:     { label: 'Gross Retention Rate',       value: '91.2%',   status: 'yellow', dept: 'CS' },
      nrr:                      { label: 'NRR',                        value: '103.8%',  status: 'green',  dept: 'CS' },
      new_product_adoption:     { label: 'New Product Adoption Rate',  value: '18%',     status: 'red',    dept: 'CS' },

      // Diversification Squad
      revenue_by_partner:       { label: 'PCC+QHR Concentration %',    value: '88%',     status: 'red',    dept: 'Partnerships' },
      mxc_revenue_ramp:         { label: 'MxC Revenue',                value: '$18.2K',  status: 'yellow', dept: 'Partnerships' },
      non_reseller_deals:       { label: 'Non-Reseller Deals',         value: '4',       status: 'yellow', dept: 'Partnerships' },
      new_partner_activation:   { label: 'New Partner Activation',     value: '1',       status: 'red',    dept: 'Partnerships' },
      referral_influenced_pct:  { label: 'Referral Influenced %',      value: '14%',     status: 'yellow', dept: 'Partnerships' },
      new_segment_bookings:     { label: 'New Segment Bookings (SL+US)', value: '$5.0K', status: 'red',    dept: 'Sales' },
      sl_partner_revenue:       { label: 'SL Partner Revenue',         value: '$1.1K',   status: 'red',    dept: 'Partnerships' },

      // Innovation Squad
      ai_products_launched:     { label: 'AI Products Launched',       value: '1/3',     status: 'yellow', dept: 'Product' },
      ai_skills_pilots:         { label: 'AI Skills Pilots',           value: '12/50',   status: 'yellow', dept: 'Product' },
      customer_validations:     { label: 'Customer Validations',       value: '2/7',     status: 'yellow', dept: 'Product' },
      ai_specific_revenue:      { label: 'AI-Specific Revenue MRR',    value: '$18.4K',  status: 'yellow', dept: 'Product' },
      ai_case_studies:          { label: 'AI Case Studies',             value: '1/10',    status: 'red',    dept: 'Product' },
      revenue_per_employee:     { label: 'Revenue Per Employee',       value: '$102.4K', status: 'yellow', dept: 'Executive' }
    };

    return lookup[ref] || { label: ref, value: '—', status: 'grey', dept: '—' };
  },

  // ── Build Squad Section HTML ──

  _buildSquadSection(squad, squadKPIs, idx) {
    const healthPct = squadKPIs.length > 0
      ? Math.round((squadKPIs.filter(k => k.status === 'green').length / squadKPIs.length) * 100)
      : 0;
    const healthClass = healthPct >= 70 ? 'text-green' : healthPct >= 40 ? 'text-yellow' : 'text-red';
    const teams = squad.teams ? squad.teams.join(', ') : '';

    return `
      <div class="squad-section">
        <div class="squad-header" onclick="this.parentElement.querySelector('.squad-body').style.display = this.parentElement.querySelector('.squad-body').style.display === 'none' ? 'block' : 'none'">
          <div class="squad-header__left">
            <h3>Squad: ${squad.name}</h3>
            <p>PM: ${squad.pm || '—'} · Accountable: ${squad.accountable || '—'} · Teams: ${teams}</p>
          </div>
          <div class="squad-header__right">
            <div>
              <div style="font-size: 11px; color: #9E9E9E; text-transform: uppercase; letter-spacing: 0.06em;">Squad Health</div>
              <div class="squad-health-score ${healthClass}">${healthPct}%</div>
            </div>
            <span style="font-size: 20px; color: #9E9E9E;">&#9662;</span>
          </div>
        </div>
        <div class="squad-body">
          <p style="font-size: 13px; color: #9E9E9E; margin-bottom: 16px;">
            <strong>Target:</strong> ${squad.target || '—'}
          </p>
          <div class="squad-kpi-grid">
            ${squadKPIs.map(k => `
              <div class="kpi-card kpi-card--${k.status}">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value kpi-value--sm">${k.value}</div>
                <div class="kpi-target">${k.dept}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  }
};
