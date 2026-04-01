export const data = {
  meta: {
    department: 'Marketing',
    accountable: 'Ger',
    squad: 'Growth',
    data_source: ['ActiveCampaign'],
    updated: '2026-03-01'
  },
  kpis: {
    marketing_created_deals: {
      label: 'Marketing-Created Deals (MQLs)',
      definition: 'Total new deals (MQLs) generated from marketing campaigns, content, events',
      value: 142,
      target: 155,
      ytd: 387,
      ytd_target: 465,
      trend: [98, 112, 127, 142],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR3: Increase marketing-sourced leads 30%',
      note: 'Baseline needed from 2025 actuals'
    },
    marketing_captured_deals: {
      label: 'Marketing-Captured Deals (SQLs)',
      definition: 'Total new deals (SQLs) generated from marketing campaigns, content, events',
      value: 89,
      target: 100,
      ytd: 241,
      ytd_target: 300,
      trend: [61, 74, 78, 89],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      cadence: 'Monthly',
      okr: 'KR3: Increase marketing-sourced leads 30%',
      note: 'Baseline needed from 2025 actuals'
    },
    hiro_conversion_rate: {
      label: 'MOFU-to-BOFU Conversion Rate (HIRO)',
      definition: '% of MQLs that progress to SQLs/Opportunities (target >30%)',
      value: 24.6,
      target: 30.0,
      trend: [21.2, 22.8, 23.4, 24.6],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Monthly',
      okr: 'KR2: Improve MOFU-to-BOFU conversion to >30%',
      note: 'Requires consistent stage definitions between AC and SF'
    },
    pipeline_generated: {
      label: 'Pipeline Generated (Total)',
      definition: 'Total $ pipeline value created from marketing-sourced or influenced leads',
      value: 1240000,
      target: 1500000,
      ytd: 3420000,
      ytd_target: 4500000,
      trend: [980000, 1050000, 1120000, 1240000],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase',
      note: 'Track sourced vs. influenced separately'
    },
    roas: {
      label: 'ROAS (Return on Ad Spend)',
      definition: 'Total ad spend / LTV',
      value: 3.2,
      target: 4.0,
      trend: [2.8, 3.0, 3.1, 3.2],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'multiplier',
      cadence: 'Monthly',
      okr: 'KR3: Maintain or reduce current CAC',
      note: 'Requires marketing spend data linked to lead source'
    },
    direct_channel_pipeline_pct: {
      label: 'Direct-Channel Pipeline %',
      definition: '% of total pipeline that is NOT reseller-sourced',
      value: 18.4,
      target: 20.0,
      trend: [15.1, 16.2, 17.8, 18.4],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Monthly',
      okr: 'KR1: Decrease top-2 partner concentration from 90% to 80%',
      note: 'Requires source attribution tagging in AC'
    },
    pipeline_by_segment: {
      label: 'Pipeline by Segment',
      definition: 'Pipeline $ broken out by vertical segment',
      segments: [
        { name: 'Senior Care (LTC)',  value: 540000, target: 600000, status: 'yellow' },
        { name: 'Medical CA (AMB)',   value: 320000, target: 400000, status: 'yellow' },
        { name: 'Senior Living (SL)',  value: 180000, target: 250000, status: 'red' },
        { name: 'US Medical',          value: 120000, target: 150000, status: 'red' },
        { name: 'Hospital',            value: 80000,  target: 100000, status: 'yellow' }
      ],
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: $409K Senior Living + KR2: $385K US Medical'
    },
    campaign_roi: {
      label: 'Campaign / Program ROI',
      definition: 'Revenue attributed to campaign / program cost',
      campaigns: [
        { name: 'Q1 Demand Gen',        spend: 18500, attributed_revenue: 62000, roi: 3.35, status: 'yellow' },
        { name: 'Webinar Series',        spend: 4200,  attributed_revenue: 19800, roi: 4.71, status: 'green' },
        { name: 'Content / SEO',         spend: 6800,  attributed_revenue: 28500, roi: 4.19, status: 'green' },
        { name: 'Partner Co-Marketing',  spend: 3100,  attributed_revenue: 8400,  roi: 2.71, status: 'yellow' }
      ],
      unit: 'multiplier',
      cadence: 'Quarterly',
      okr: 'KR1: Protect profit margins while scaling',
      note: 'Requires closed-loop attribution model'
    }
  }
};
