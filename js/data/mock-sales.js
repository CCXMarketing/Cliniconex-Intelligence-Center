export const data = {
  meta: {
    department: 'Direct Sales',
    accountable: 'Zach',
    squad: 'Growth',
    data_source: ['Salesforce', 'ActiveCampaign'],
    updated: '2026-03-01'
  },
  kpis: {
    new_mrr_added: {
      label: 'New MRR Added (Total)',
      definition: 'Gross new MRR booked in month vs. forecast plan',
      value: 34800,
      targets: { threshold: 32039, target: 39334, overachieve: 46629 },
      ytd: 98200,
      ytd_targets: { threshold: 92654, target: 113536, overachieve: 134417 },
      trend: [28400, 31200, 33100, 34800],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase'
    },
    quota_attainment: {
      label: 'Quota Attainment by Rep',
      definition: 'Actual MRR added vs. individual quota plan',
      reps: [
        { name: 'Rebecca', quota: 10000, actual: 11200, attainment: 112, status: 'green' },
        { name: 'Tanner',  quota: 9000,  actual: 7800,  attainment: 87,  status: 'yellow' },
        { name: 'Chuk',    quota: 8500,  actual: 8900,  attainment: 105, status: 'green' },
        { name: 'Nathan',  quota: 12000, actual: 6900,  attainment: 58,  status: 'red' }
      ],
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase'
    },
    expansion_revenue: {
      label: 'Expansion Revenue',
      definition: 'MRR from upsell/cross-sell into existing accounts (target: $1.2M total)',
      value: 12400,
      target: 12700,
      ytd: 36800,
      ytd_target: 38100,
      annual_target: 152400,
      trend: [10200, 11400, 11900, 12400],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR2: Expansion revenue = $1.2M total',
      // Product breakdown — ACP suite
      products: [
        {
          name: 'ACM Messenger',
          suite: 'ACM',
          mrr: 4200,
          accounts: 38,
          trend: [3100, 3500, 3900, 4200],
          status: 'green'
        },
        {
          name: 'ACM Alerts',
          suite: 'ACM',
          mrr: 2800,
          accounts: 24,
          trend: [2200, 2400, 2600, 2800],
          status: 'green'
        },
        {
          name: 'ACM Vault',
          suite: 'ACM',
          mrr: 1900,
          accounts: 18,
          trend: [1600, 1700, 1800, 1900],
          status: 'yellow'
        },
        {
          name: 'ACM Concierge',
          suite: 'ACM',
          mrr: 1400,
          accounts: 12,
          trend: [900, 1100, 1200, 1400],
          status: 'yellow'
        },
        {
          name: 'ACS Booking',
          suite: 'ACS',
          mrr: 1100,
          accounts: 9,
          trend: [800, 900, 1000, 1100],
          status: 'yellow'
        },
        {
          name: 'ACS Forms',
          suite: 'ACS',
          mrr: 600,
          accounts: 6,
          trend: [400, 500, 550, 600],
          status: 'yellow'
        },
        {
          name: 'ACS Surveys',
          suite: 'ACS',
          mrr: 400,
          accounts: 4,
          trend: [200, 300, 350, 400],
          status: 'red'
        }
      ]
    },
    new_logo_revenue: {
      label: 'New Logo Revenue',
      definition: 'MRR from net-new customer logos',
      value: 22400,
      target: 26634,
      trend: [18200, 19800, 20900, 22400],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase'
    },
    new_segment_bookings: {
      label: 'New Segment Bookings',
      definition: 'MRR booked in Senior Living, US Medical, Hospital segments',
      segments: [
        { name: 'Senior Living (SL)',  value: 3200, target: 5200, annual_target: 82000, status: 'red' },
        { name: 'US Medical',          value: 1800, target: 6500, annual_target: 385000, status: 'red' },
        { name: 'Hospital',            value: 800,  target: 1200, annual_target: 14400, status: 'yellow' }
      ],
      unit: 'currency',
      cadence: 'Monthly',
      okr: 'KR1: $82K Senior Living + KR2: $385K US Medical'
    },
    win_rate: {
      label: 'Win Rate',
      definition: '% of qualified opportunities that close won',
      value: 31.2,
      target: 35.0,
      trend: [28.4, 29.1, 30.6, 31.2],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Monthly',
      okr: 'KR2: Improve MOFU-to-BOFU conversion >30%'
    },
    avg_deal_size_acv: {
      label: 'Average Deal Size (ACV)',
      definition: 'Average MRR of closed-won deals',
      value: 228,
      target: 240,
      trend: [215, 220, 224, 228],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Monthly',
      note: 'Forecast assumes $240 MRR ACV'
    },
    sales_cycle_length: {
      label: 'Sales Cycle Length',
      definition: 'Average days from Opportunity creation to close',
      value: 42,
      target: 38,
      higher_is_better: false,
      by_segment: [
        { segment: 'LTC SNF',    days: 38 },
        { segment: 'AMB CA',     days: 45 },
        { segment: 'Enterprise', days: 67 }
      ],
      trend: [48, 46, 44, 42],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'days',
      cadence: 'Monthly'
    },
    pipeline_coverage: {
      label: 'Pipeline Coverage Ratio',
      definition: 'Total pipeline $ / quota remaining for period',
      value: 2.8,
      target: 3.0,
      trend: [2.4, 2.5, 2.7, 2.8],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'multiplier',
      cadence: 'Monthly',
      note: 'Target: 3x minimum coverage'
    },
    opportunities_created: {
      label: 'Opportunities Created',
      definition: '# new qualified opportunities entering pipeline',
      value: 412,
      targets: { threshold: 381, target: 468, overachieve: 554 },
      trend: [344, 368, 391, 412],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'green',
      unit: 'count',
      cadence: 'Monthly'
    },
    adjacent_vertical_deals: {
      label: 'Adjacent Vertical Deals',
      definition: '# deals closed in verticals outside core',
      value: 1,
      target_ytd: 5,
      deals: [
        { vertical: 'Cosmetics', status: 'Closed Won', mrr: 180, quarter: 'Q1' }
      ],
      status: 'red',
      unit: 'count',
      cadence: 'Quarterly',
      okr: 'KR3: Close 5 deals in one additional adjacent vertical'
    }
  }
};
