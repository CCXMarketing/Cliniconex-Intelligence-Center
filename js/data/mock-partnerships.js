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
    segment_revenue: {
      label: 'Revenue by Segment',
      definition: 'Partner MRR broken out by vertical segment — editable segments',
      segments: [
        {
          id: 'ltc',
          name: 'Senior Care (LTC)',
          color: '#02475A',
          total_mrr: 612000,
          annual_target: 6500000,
          by_partner: [
            { partner: 'PCC', mrr: 480000, trend: [460000, 468000, 474000, 480000] },
            { partner: 'QHR', mrr: 98000,  trend: [92000, 94000, 96000, 98000] },
            { partner: 'Direct', mrr: 34000, trend: [30000, 31000, 32000, 34000] }
          ],
          trend: [582000, 593000, 602000, 612000],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          status: 'green',
          is_core: true
        },
        {
          id: 'amb_ca',
          name: 'Medical CA (Ambulatory)',
          color: '#029FB5',
          total_mrr: 128000,
          annual_target: 1400000,
          by_partner: [
            { partner: 'QHR', mrr: 84000, trend: [78000, 80000, 82000, 84000] },
            { partner: 'Direct', mrr: 44000, trend: [40000, 41000, 42000, 44000] }
          ],
          trend: [118000, 121000, 124000, 128000],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          status: 'green',
          is_core: true
        },
        {
          id: 'sl',
          name: 'Senior Living (SL)',
          color: '#ADC837',
          total_mrr: 14200,
          annual_target: 327000,
          monthly_target: 27250,
          by_partner: [
            { partner: 'PCC SL', mrr: 12800, trend: [4200, 7800, 11200, 12800] },
            { partner: 'MxC SL', mrr: 1400,  trend: [0, 400, 900, 1400] }
          ],
          trend: [4200, 8200, 12100, 14200],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          status: 'yellow',
          is_core: false
        },
        {
          id: 'us_medical',
          name: 'US Medical',
          color: '#522E76',
          total_mrr: 5400,
          annual_target: 385000,
          monthly_target: 32083,
          by_partner: [
            { partner: 'Direct', mrr: 3600, trend: [0, 1200, 2400, 3600] },
            { partner: 'MxC', mrr: 1800, trend: [0, 600, 1200, 1800] }
          ],
          trend: [0, 1800, 3600, 5400],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          status: 'red',
          is_core: false
        },
        {
          id: 'hospital',
          name: 'Hospital',
          color: '#F57C00',
          total_mrr: 3200,
          annual_target: 120000,
          monthly_target: 10000,
          by_partner: [
            { partner: 'Direct', mrr: 3200, trend: [1800, 2200, 2800, 3200] }
          ],
          trend: [1800, 2200, 2800, 3200],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          status: 'red',
          is_core: false
        }
      ],
      storage_key: 'partnerships_segments',
      cadence: 'Monthly'
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
