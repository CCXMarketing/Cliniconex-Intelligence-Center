// KPI Catalog — loads kpis.yaml via /api/catalog, provides lookup by department and KPI id

let _catalog = null;
let _loading = null;

const DEPT_TAB_MAP = {
  marketing: 'marketing',
  direct_sales: 'sales',
  channel_partnerships: 'partnerships',
  customer_success: 'customer-success',
  customer_support: 'support',
  product_management: 'product',
};

const TAB_DEPT_MAP = Object.fromEntries(
  Object.entries(DEPT_TAB_MAP).map(([k, v]) => [v, k])
);

const MOCK_KEY_ALIASES = {
  // Direct Sales
  new_mrr_added: 'new_mrr_added_total',
  quota_attainment: 'quota_attainment_by_rep',
  avg_deal_size_acv: 'average_deal_size_acv',
  pipeline_coverage: 'pipeline_coverage_ratio',
  // Marketing
  marketing_created_deals: 'marketing_created_deals_demand_created',
  marketing_captured_deals: 'marketing_captured_deals_demand_captured',
  hiro_conversion_rate: 'mofu_to_bofu_conversion_rate_hiro',
  pipeline_generated: 'pipeline_generated_total',
  direct_channel_pipeline_pct: 'direct_channel_pipeline',
  campaign_roi: 'campaignprogram_roi',
  // Channel Partnerships
  revenue_by_partner: 'revenue_by_partner_of_total',
  non_reseller_deals: 'non_resellermarketplace_deals',
  new_partner_activation: 'new_partner_activation_rate',
  new_partner_outreach: 'new_partner_outreach_volume',
  // Customer Success
  nrr: 'net_revenue_retention_nrr',
  churn_revenue: 'churn_revenue_actual_vs_plan',
  new_product_adoption: 'new_product_adoption_rate',
  time_to_value: 'time_to_value_implementation',
  referral_influenced_pct: 'referral_influenced_closed_won',
  csat: 'csat_success',
  // Customer Support
  ticket_volume: 'ticket_volume_trend',
  first_contact_resolution: 'first_contact_resolution_rate',
  avg_resolution_time: 'average_resolution_time',
  revenue_per_employee: 'revenue_per_employee_rpe',
  ces: 'ces_support',
  // Product Management
  ai_products_launched: 'ai_products_launched_per_quarter',
  ai_skills_pilots: 'ai_skills_pilots_completed',
  customer_validations: 'customer_validations_ai',
  say_do_ratio: 'saydo_ratio',
  bug_reduction: 'customer_facing_bug_reduction',
  strategic_allocation: 'strategic_development_allocation',
  ai_case_studies: 'ai_champion_case_studies',
};

async function load() {
  if (_catalog) return _catalog;
  if (_loading) return _loading;

  _loading = fetch('/api/catalog')
    .then(r => {
      if (!r.ok) throw new Error(`API ${r.status}`);
      return r.json();
    })
    .catch(() => fetch('config/kpis.json').then(r => {
      if (!r.ok) throw new Error(`Static ${r.status}`);
      return r.json();
    }))
    .then(data => {
      _catalog = _index(data);
      _loading = null;
      return _catalog;
    })
    .catch(err => {
      console.warn('[CIC Catalog] Failed to load:', err);
      _catalog = { departments: {}, kpis: {}, corporateTargets: {}, squads: {}, squadKeyResults: [], dataSourceReadiness: [], monthlyRevenueTargets: {} };
      _loading = null;
      return _catalog;
    });

  return _loading;
}

function _index(raw) {
  const kpis = {};
  const departments = {};

  for (const dept of (raw.departments || [])) {
    const tabId = DEPT_TAB_MAP[dept.id] || dept.id;
    const deptKpis = {};

    for (const kpi of (dept.kpis || [])) {
      const entry = {
        ...kpi,
        department: dept.id,
        departmentName: dept.name,
        tabId,
      };
      kpis[kpi.id] = entry;
      deptKpis[kpi.id] = entry;
    }

    departments[tabId] = {
      id: dept.id,
      name: dept.name,
      tabId,
      kpis: deptKpis,
    };
  }

  return {
    departments,
    kpis,
    corporateTargets: raw.corporate_targets || {},
    squads: raw.squads || {},
    squadKeyResults: raw.squad_key_results || [],
    monthlyRevenueTargets: raw.monthly_revenue_targets || {},
    dataSourceReadiness: raw.data_source_readiness || [],
    meta: raw.meta || {},
  };
}

export const catalog = {
  load,

  async getDepartment(tabId) {
    const cat = await load();
    return cat.departments[tabId] || null;
  },

  async getKpi(kpiId) {
    const cat = await load();
    return cat.kpis[kpiId] || null;
  },

  async getKpisForTab(tabId) {
    const cat = await load();
    const dept = cat.departments[tabId];
    return dept ? dept.kpis : {};
  },

  async getCorporateTargets() {
    const cat = await load();
    return cat.corporateTargets;
  },

  async getMonthlyRevenueTargets() {
    const cat = await load();
    return cat.monthlyRevenueTargets;
  },

  async getSquadKeyResults() {
    const cat = await load();
    return cat.squadKeyResults;
  },

  async getDataSourceReadiness() {
    const cat = await load();
    return cat.dataSourceReadiness;
  },

  async getReadinessSummary() {
    const cat = await load();
    const summary = { total: 0, yes: 0, partial: 0, no: 0, byDepartment: {} };

    for (const [tabId, dept] of Object.entries(cat.departments)) {
      const deptSummary = { total: 0, yes: 0, partial: 0, no: 0 };
      for (const kpi of Object.values(dept.kpis)) {
        summary.total++;
        deptSummary.total++;
        const m = (kpi.measurable_today || '').toLowerCase();
        if (m === 'yes') { summary.yes++; deptSummary.yes++; }
        else if (m === 'partial') { summary.partial++; deptSummary.partial++; }
        else { summary.no++; deptSummary.no++; }
      }
      summary.byDepartment[tabId] = deptSummary;
    }

    return summary;
  },

  measurabilityBadge(kpi) {
    const m = (kpi.measurable_today || '').toLowerCase();
    if (m === 'yes') return { label: 'Live', cssClass: 'badge-live' };
    if (m === 'partial') return { label: 'Partial', cssClass: 'badge-partial' };
    return { label: 'Manual', cssClass: 'badge-manual' };
  },

  tabIdToDeptId(tabId) {
    return TAB_DEPT_MAP[tabId] || tabId;
  },

  deptIdToTabId(deptId) {
    return DEPT_TAB_MAP[deptId] || deptId;
  },

  resolveMockKey(mockKey) {
    return MOCK_KEY_ALIASES[mockKey] || mockKey;
  },
};
