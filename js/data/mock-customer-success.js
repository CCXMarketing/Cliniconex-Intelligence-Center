export const data = {
  meta: {
    department: 'Customer Success',
    accountable: 'Cathy',
    squad: 'Growth',
    data_source: ['Salesforce'],
    updated: '2026-03-01'
  },
  kpis: {
    gross_retention_rate: {
      label: 'Gross Retention Rate',
      definition: '% of beginning-of-period MRR retained (excluding expansion)',
      value: 98.8,
      target: 99.0,
      trend: [98.4, 98.6, 98.7, 98.8],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Monthly',
      note: 'Forecast assumes ~1% monthly churn'
    },
    nrr: {
      label: 'Net Revenue Retention (NRR)',
      definition: 'MRR retained including expansion / beginning MRR',
      value: 101.4,
      target: 103.0,
      trend: [100.2, 100.8, 101.1, 101.4],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Monthly',
      okr: 'KR1: 25% YoY revenue increase'
    },
    churn_revenue: {
      label: 'Churn Revenue (Actual vs. Plan)',
      definition: '$ MRR lost to churn vs. forecast',
      actual: 7200,
      budget: 7332,
      ytd_actual: 20900,
      ytd_budget: 21282,
      by_segment: [
        { segment: 'LTC',    actual: 4800, budget: 4900, status: 'green' },
        { segment: 'AMB CA', actual: 2400, budget: 2432, status: 'green' }
      ],
      status: 'green',
      unit: 'currency',
      cadence: 'Monthly',
      note: 'Planned churn: $420K LTC + $190K AMB CA = $610K annual'
    },
    health_score_distribution: {
      label: 'Health Score Distribution',
      definition: '% of accounts in Green/Yellow/Red health status',
      green: 68.2,
      yellow: 24.1,
      red: 7.7,
      trend: [
        { month: 'Dec', green: 64.1, yellow: 26.8, red: 9.1 },
        { month: 'Jan', green: 65.9, yellow: 25.4, red: 8.7 },
        { month: 'Feb', green: 67.0, yellow: 24.8, red: 8.2 },
        { month: 'Mar', green: 68.2, yellow: 24.1, red: 7.7 }
      ],
      status: 'green',
      cadence: 'Monthly'
    },
    at_risk_account_value: {
      label: 'At-Risk Account Value',
      definition: 'Total MRR of accounts in Red health status',
      value: 62400,
      accounts: [
        { name: 'Account A', mrr: 18200, segment: 'LTC',    risk_reason: 'Low engagement',  health: 'Red' },
        { name: 'Account B', mrr: 12800, segment: 'AMB CA', risk_reason: 'Billing issue',    health: 'Red' },
        { name: 'Account C', mrr: 9800,  segment: 'LTC',    risk_reason: 'Champion left',    health: 'Red' },
        { name: 'Account D', mrr: 8600,  segment: 'LTC SL', risk_reason: 'Low utilization',  health: 'Red' },
        { name: 'Account E', mrr: 7200,  segment: 'AMB CA', risk_reason: 'Contract up Q2',   health: 'Red' }
      ],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Weekly'
    },
    churn_rate_by_segment: {
      label: 'Churn Rate by Segment',
      definition: 'Monthly churn rate per segment actual vs. target',
      segments: [
        { name: 'LTC SNF',  rate: 0.82, target: 0.99, status: 'green' },
        { name: 'LTC SL',   rate: 1.12, target: 0.99, status: 'red' },
        { name: 'AMB CA',   rate: 1.08, target: 1.01, status: 'yellow' },
        { name: 'AMB US',   rate: 0.64, target: 1.01, status: 'green' },
        { name: 'Hospital', rate: 0.31, target: 0.99, status: 'green' }
      ],
      unit: 'percent',
      cadence: 'Monthly'
    },
    new_product_adoption: {
      label: 'New Product Adoption Rate',
      definition: '% of existing customers actively using new products/features',
      value: 34.2,
      target: 50.0,
      status: 'red',
      unit: 'percent',
      cadence: 'Quarterly',
      okr: 'KR3: 50% adoption rate of new products within current base',
      note: 'Requires product usage analytics piped into SF'
    },
    time_to_value: {
      label: 'Time-to-Value (Implementation)',
      definition: 'Days from contract signed to customer live / first value milestone',
      value: 34,
      target: 28,
      higher_is_better: false,
      trend: [42, 39, 37, 34],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'days',
      cadence: 'Monthly',
      note: 'Needs implementation milestone tracking in SF'
    },
    referral_influenced_pct: {
      label: 'Referral-Influenced Closed Won %',
      definition: '% of closed-won deals where referral was an influenced source',
      value: 2.8,
      target: 10.0,
      trend: [0, 1.2, 2.1, 2.8],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'red',
      unit: 'percent',
      cadence: 'Monthly',
      okr: 'KR3: Build referral system to 10% of all closed-won deals',
      note: 'Referral source tracking needs to be built in SF'
    },
    csat: {
      label: 'CSAT (Customer Success)',
      definition: 'Customer satisfaction score from post-CS engagement',
      value: 84,
      target: 85,
      trend: [79, 81, 83, 84],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'score',
      cadence: 'Monthly'
    }
  }
};
