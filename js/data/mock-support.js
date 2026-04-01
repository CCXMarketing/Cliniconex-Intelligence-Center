export const data = {
  meta: {
    department: 'Customer Support',
    accountable: 'TBD',
    squad: 'Growth',
    data_source: ['Salesforce', 'JIRA'],
    updated: '2026-03-01'
  },
  kpis: {
    ticket_volume: {
      label: 'Ticket Volume and Trend',
      definition: 'Total external and internal support tickets opened per month',
      value: 284,
      higher_is_better: false,
      trend: [312, 298, 291, 284],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      by_type: [
        { type: 'External (Salesforce)', count: 184 },
        { type: 'Internal (JIRA)',        count: 100 }
      ],
      status: 'green',
      unit: 'count',
      cadence: 'Monthly'
    },
    first_contact_resolution: {
      label: 'First-Contact Resolution Rate',
      definition: '% of tickets resolved on first interaction without escalation',
      value: 62.4,
      target: 75.0,
      trend: [55.1, 57.8, 60.2, 62.4],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Monthly',
      note: 'May need field additions in SF Case object'
    },
    avg_resolution_time: {
      label: 'Average Resolution Time',
      definition: 'Mean hours from ticket open to resolution',
      value: 18.4,
      target: 16.0,
      higher_is_better: false,
      by_priority: [
        { priority: 'P1 Critical', hours: 4.2,  target: 4.0 },
        { priority: 'P2 High',     hours: 12.8, target: 12.0 },
        { priority: 'P3 Medium',   hours: 24.6, target: 24.0 },
        { priority: 'P4 Low',      hours: 48.2, target: 48.0 }
      ],
      trend: [24.1, 21.8, 20.2, 18.4],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'hours',
      cadence: 'Monthly'
    },
    escalation_rate: {
      label: 'Escalation Rate',
      definition: '% of tickets escalated to Tier 2/3 or engineering',
      value: 8.4,
      target: 6.0,
      higher_is_better: false,
      trend: [12.1, 10.4, 9.2, 8.4],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'percent',
      cadence: 'Monthly',
      note: 'Needs escalation workflow tracking'
    },
    support_cost_per_customer: {
      label: 'Support Cost Per Customer',
      definition: 'Total support department cost / active customer count',
      value: 12.40,
      target: 11.00,
      higher_is_better: false,
      trend: [14.20, 13.60, 12.90, 12.40],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Quarterly',
      note: 'Requires finance data integration'
    },
    revenue_per_employee: {
      label: 'Revenue Per Employee (RPE)',
      definition: 'Total revenue / total FTE headcount (company-wide)',
      value: 102400,
      target: 110000,
      headcount: 82,
      trend: [96000, 98200, 100400, 102400],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      status: 'yellow',
      unit: 'currency',
      cadence: 'Quarterly',
      okr: 'KR3: Improve RPE by deploying AI-driven motions without increasing headcount'
    },
    ces: {
      label: 'Customer Effort Score (CES)',
      definition: 'Customer satisfaction score from post-ticket surveys',
      value: null,
      target: null,
      measurable: false,
      status: 'grey',
      unit: 'score',
      cadence: 'Monthly',
      note: 'Not yet measurable — requires post-ticket survey implementation'
    }
  }
};
