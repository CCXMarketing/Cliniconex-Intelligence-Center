export const data = {
  meta: {
    department: 'Channel Partnerships',
    accountable: 'Bex / Ange',
    squad: 'Diversification',
    data_source: ['Salesforce', 'PRM'],
    updated: '2026-03-01'
  },
  kpis: {
    revenue_by_partner: {
      label: 'Revenue by Partner (% of Total)',
      definition: 'Revenue share by partner vs. total MRR',
      partners: [
        { name: 'PCC',    mrr: 612000, pct: 74.2, trend: [75.8, 75.1, 74.8, 74.2] },
        { name: 'QHR',    mrr: 128000, pct: 15.5, trend: [14.9, 15.1, 15.3, 15.5] },
        { name: 'MxC',    mrr: 42000,  pct: 5.1,  trend: [1.2,  2.8,  4.1,  5.1] },
        { name: 'Direct', mrr: 32000,  pct: 3.9,  trend: [5.8,  4.9,  4.2,  3.9] },
        { name: 'Other',  mrr: 11000,  pct: 1.3,  trend: [2.3,  2.1,  1.6,  1.3] }
      ],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      concentration_current: 89.7,
      concentration_target: 80.0,
      status: 'red',
      cadence: 'Monthly',
      okr: 'KR1: Decrease top-2 partner concentration from 90% to 80%'
    },
    mxc_revenue_ramp: {
      label: 'MatrixCare Revenue Ramp',
      definition: 'MatrixCare-sourced MRR growth month-over-month',
      value: 42000,
      monthly_target: 34083,
      annual_target: 409000,
      forecast_annual: 409000,
      trend: [9800, 18400, 29200, 42000],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'green',
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: Decrease concentration + KR2: New route-to-market'
    },
    non_reseller_deals: {
      label: 'Non-Reseller / Marketplace Deals',
      definition: '# and $ of deals closed through ISV, SI, MSP, consultant channels',
      value: 0,
      target_ytd: 3,
      deals: [],
      status: 'red',
      unit: 'count',
      cadence: 'Quarterly',
      okr: 'KR2: Close first deals through non-Reseller/Marketplace channels',
      note: 'Needs new channel type field in SF Opportunity'
    },
    new_partner_activation: {
      label: 'New Partner Activation Rate',
      definition: '# of new partners that close their first deal within 6 months of signing',
      value: 0,
      target: 2,
      partners_in_pipeline: ['TBD Partner A', 'TBD Partner B'],
      status: 'red',
      unit: 'count',
      cadence: 'Quarterly',
      okr: 'KR2: New route-to-market viability',
      note: 'Requires partner onboarding tracking — build in SF'
    },
    partner_pipeline_coverage: {
      label: 'Partner Pipeline Coverage',
      definition: 'Pipeline $ by partner vs. partner-specific targets',
      by_partner: [
        { partner: 'PCC', pipeline: 820000, target: 900000, coverage: 2.7, status: 'yellow' },
        { partner: 'QHR', pipeline: 185000, target: 200000, coverage: 2.8, status: 'yellow' },
        { partner: 'MxC', pipeline: 68000,  target: 120000, coverage: 1.8, status: 'red' }
      ],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly'
    },
    sl_partner_revenue: {
      label: 'Senior Living Partner Revenue',
      definition: 'MRR from SL segment through PCC and MxC',
      value: 14200,
      monthly_target: 27141,
      annual_target: 327000,
      by_partner: [
        { partner: 'PCC SL', mrr: 12800, trend: [4200, 7800, 11200, 12800] },
        { partner: 'MxC SL', mrr: 1400,  trend: [0, 400, 900, 1400] }
      ],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: $327K Senior Living new logo'
    },
    new_partner_outreach: {
      label: 'New Partner Outreach Volume',
      definition: '# of qualified new partner accounts contacted',
      value: 18,
      target: 25,
      trend: [8, 12, 15, 18],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'count',
      cadence: 'Monthly',
      okr: 'KR2: New route-to-market viability'
    }
  }
};
