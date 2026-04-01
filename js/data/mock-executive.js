export const data = {
  meta: { updated: '2026-03-01', current_month: 'March 2026', current_month_key: 'mar' },

  revenue: {
    current_mrr: 776935,
    mrr_targets: {
      threshold:   756266,
      target:      776935,
      overachieve: 797604
    },
    new_mrr_added_mtd: 34800,
    expansion_mrr_mtd: 12400,
    churn_mrr_mtd: 7200,
    net_new_mrr_mtd: 40000,
    ytd_revenue:    2261514,
    ytd_target:     2241471,
    ytd_scenario:   'target',
    actuals_by_month: [
      { month: 'Jan', mrr: 718200 },
      { month: 'Feb', mrr: 748900 },
      { month: 'Mar', mrr: 776935 }
    ]
  },

  company_health: {
    ebitda_ytd:         241000,
    ebitda_target_ytd:  275000,
    revenue_per_employee: 102400,
    rpe_target:         110000,
    active_customers:   3240,
    customer_growth_pct: 2.1,
    gross_retention:    98.8,
    nrr:                101.4
  },

  highlights: [
    { type: 'green',  text: 'MxC ramp tracking above forecast — $42K MRR vs $34K target' },
    { type: 'green',  text: 'New MRR added on track at Threshold scenario ($34.8K vs $32K)' },
    { type: 'green',  text: 'Ticket volume trending down — 284 vs 312 in December' },
    { type: 'yellow', text: 'HIRO conversion at 24.6% — target is 30%' },
    { type: 'yellow', text: 'New segment bookings (SL, US Medical) below plan' },
    { type: 'yellow', text: 'Win rate at 31.2% — target is 35%' },
    { type: 'red',    text: 'PCC+QHR concentration still at 89.7% — target is 80%' },
    { type: 'red',    text: 'Nathan quota attainment at 58% — needs attention' }
  ],

  squads: {
    growth: {
      name: 'Growth',
      pm: 'Madison',
      accountable: 'Ange',
      teams: ['Sales', 'Marketing', 'Customer Success'],
      target: 'Revenue $9.6M–$10.4M and EBITDA $1.1M',
      kpi_refs: ['new_mrr_added', 'quota_attainment', 'expansion_revenue',
                 'hiro_conversion_rate', 'marketing_created_deals',
                 'gross_retention_rate', 'nrr', 'new_product_adoption']
    },
    diversification: {
      name: 'Diversification',
      pm: 'Madison',
      accountable: 'Ange',
      teams: ['Channel Partnerships', 'Sales', 'Marketing', 'Customer Success'],
      target: 'Partner Concentration -10% and New Segment Revenue $790K',
      kpi_refs: ['revenue_by_partner', 'mxc_revenue_ramp', 'non_reseller_deals',
                 'new_partner_activation', 'referral_influenced_pct',
                 'new_segment_bookings', 'sl_partner_revenue']
    },
    innovation: {
      name: 'Innovation',
      pm: 'Kristi',
      accountable: 'Ange',
      teams: ['Product', 'Sales', 'Marketing', 'Customer Success'],
      target: 'YoY Growth 30% (AI)',
      kpi_refs: ['ai_products_launched', 'ai_skills_pilots', 'customer_validations',
                 'ai_specific_revenue', 'ai_case_studies', 'revenue_per_employee']
    }
  }
};
