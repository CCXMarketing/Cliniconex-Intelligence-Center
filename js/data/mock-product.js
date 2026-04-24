export const data = {
  meta: {
    department: 'Product Management',
    accountable: 'Kristi / Madison',
    squad: 'Innovation',
    data_source: ['JIRA', 'Salesforce'],
    updated: '2026-03-01'
  },
  kpis: {
    ai_products_launched: {
      label: 'AI Products Launched Per Quarter',
      definition: '# of AI-powered sellable products/features released to market',
      value: 1,
      target_per_quarter: 3,
      ytd: 1,
      products: [
        { name: 'AI Appointment Reminder v2',   status: 'Launched',     quarter: 'Q1', mrr_attributed: 8400 },
        { name: 'AI Care Summary',               status: 'In Progress',  quarter: 'Q1', mrr_attributed: 0 },
        { name: 'AI Discharge Follow-Up',        status: 'Planned',      quarter: 'Q2', mrr_attributed: 0 }
      ],
      status: 'yellow',
      unit: 'count',
      cadence: 'Quarterly',
      okr: 'KR1: Launch 3 AI-powered sellable products/features per quarter'
    },
    ai_skills_pilots: {
      label: 'AI Skills Pilots Completed',
      definition: '# of AI-powered skills pilots run with customers',
      value: 12,
      target_annual: 50,
      trend: [0, 4, 8, 12],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'count',
      cadence: 'Quarterly',
      okr: 'KR2: Complete 50 AI-powered skills pilots',
      note: 'Needs pilot tracking mechanism'
    },
    customer_validations: {
      label: 'Customer Validations (AI)',
      definition: '# of customers that validate AI product-market fit',
      value: 2,
      target: 7,
      target_by: 'Q3 2026',
      customers: [
        { name: 'Customer A', segment: 'LTC',    validated: true,  quarter: 'Q1' },
        { name: 'Customer B', segment: 'AMB CA', validated: true,  quarter: 'Q1' }
      ],
      status: 'yellow',
      unit: 'count',
      cadence: 'Quarterly',
      okr: 'KR3: Achieve 7 customer validations by Q3',
      note: 'Define validation criteria, build tracking'
    },
    ai_specific_revenue: {
      label: 'AI-Specific Revenue (MRR)',
      definition: 'MRR directly attributable to AI-integrated product solutions',
      value: 18400,
      monthly_target: 33333,
      annual_target: 400000,
      ytd: 42000,
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: Generate $400K in new revenue from AI solutions',
      note: 'Requires product-level revenue tagging in SF'
    },
    say_do_ratio: {
      label: 'Say / Do Ratio',
      definition: '% of committed sprint/quarter deliverables actually shipped',
      value: 84,
      target: 90,
      by_quarter: [
        { quarter: 'Q4 2025', ratio: 78, committed: 32, delivered: 25 },
        { quarter: 'Q1 2026', ratio: 84, committed: 25, delivered: 21 }
      ],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Quarterly',
      okr: 'Product OKR KR2: 90% say/do ratio'
    },
    bug_reduction: {
      label: 'Customer-Facing Bug Reduction',
      definition: 'QoQ reduction in customer-reported bugs (target: 15% reduction)',
      value: 8.2,
      target: 15.0,
      bugs_this_quarter: 34,
      bugs_last_quarter: 37,
      status: 'red',
      unit: 'percent',
      cadence: 'Quarterly',
      okr: 'Product OKR KR3: Reduce customer-facing bugs 15% QoQ'
    },
    strategic_allocation: {
      label: 'Strategic Development Allocation',
      definition: '% of dev effort on strategic initiatives vs. maintenance (KTLO/KILO)',
      value: 72,
      target: 90,
      breakdown: [
        { type: 'Strategic',   pct: 72, target_pct: 90 },
        { type: 'Maintenance', pct: 28, target_pct: 10 }
      ],
      status: 'red',
      unit: 'percent',
      cadence: 'Quarterly',
      okr: 'Product OKR KR3: >90% effort on strategic initiatives',
      note: 'Needs JIRA tagging taxonomy for strategic vs. non-strategic'
    },
    enhancement_revenue_existing: {
      label: 'Enhancement Revenue (Existing Customers)',
      definition: 'Revenue from enhancements supporting growth with existing customers',
      value: 42000,
      annual_target: 360000,
      ytd_target: 90000,
      status: 'yellow',
      unit: 'currency',
      cadence: 'Quarterly',
      okr: 'Product OKR KR1: $360K from existing-customer enhancements'
    },
    enhancement_revenue_new_segments: {
      label: 'Enhancement Revenue (New Segments)',
      definition: 'Revenue from enhancements supporting new segments and partners',
      value: 8400,
      annual_target: 158000,
      ytd_target: 39500,
      status: 'yellow',
      unit: 'currency',
      cadence: 'Quarterly',
      okr: 'Product OKR KR2: $158K from new-segment enhancements'
    },
    ai_case_studies: {
      label: 'AI Champion Case Studies',
      definition: '# of early-adopter customers converted to published case studies',
      value: 1,
      target: 10,
      status: 'red',
      unit: 'count',
      cadence: 'Quarterly',
      okr: 'KR2: Convert 10 early-adopters into case studies'
    }
  }
};
