# CIC Agent 3 — Data Layer (Mock Data and Storage)

## Your Role
You are building the complete data layer for the Cliniconex Intelligence Center.
Every piece of data that appears in the CIC comes from your files.
The schemas you define are contracts — Phase 2 API connectors will replace
the static values with live data but will not change the field names or structure.

## Your Files (exclusive ownership)
- `js/data/mock-marketing.js`
- `js/data/mock-sales.js`
- `js/data/mock-partnerships.js`
- `js/data/mock-customer-success.js`
- `js/data/mock-support.js`
- `js/data/mock-product.js`
- `js/data/mock-executive.js`
- `js/data/mock-revenue-targets.js`
- `js/data/storage.js`

## IMPORTANT: Schema Discipline
Field names MUST NOT change after you create them. Agents 4, 5, and 6 will
build their rendering code against these exact field names. Add fields freely —
removing or renaming them breaks downstream code.

All files use ES module syntax: `export const data = { ... };`

---

## Business Context
- **Revenue targets:** Threshold $9.6M | Target $10M | Overachieve $10.4M
- **EBITDA target:** $1.1M
- **Fiscal year:** Jan 1 – Dec 31, 2026
- **Current month for mock data:** March 2026
- **Data sources:** ActiveCampaign (marketing/leads), Salesforce (revenue/CRM), JIRA (product)
- **Departments:** Marketing, Direct Sales, Channel Partnerships, Customer Success,
  Customer Support, Product Management, + Executive and Squad views

---

## File 1: js/data/mock-revenue-targets.js

These are the exact figures from the 2026 KPI Framework. Do not alter them.

```javascript
export const data = {
  scenarios: {
    threshold: {
      annual: 9600000,
      ebitda: 1100000,
      monthly: {
        jan: { eom_mrr: 710084,  gross_needed: 32039, churn_budget: -6849 },
        feb: { eom_mrr: 733175,  gross_needed: 30192, churn_budget: -7101 },
        mar: { eom_mrr: 756266,  gross_needed: 30423, churn_budget: -7332 },
        apr: { eom_mrr: 777258,  gross_needed: 28555, churn_budget: -7563 },
        may: { eom_mrr: 796151,  gross_needed: 26666, churn_budget: -7773 },
        jun: { eom_mrr: 810845,  gross_needed: 22656, churn_budget: -7962 },
        jul: { eom_mrr: 821341,  gross_needed: 18604, churn_budget: -8108 },
        aug: { eom_mrr: 825539,  gross_needed: 12411, churn_budget: -8213 },
        sep: { eom_mrr: 836035,  gross_needed: 18751, churn_budget: -8255 },
        oct: { eom_mrr: 842333,  gross_needed: 14658, churn_budget: -8360 },
        nov: { eom_mrr: 844432,  gross_needed: 10522, churn_budget: -8423 },
        dec: { eom_mrr: 846541,  gross_needed: 10553, churn_budget: -8444 }
      }
    },
    target: {
      annual: 10000000,
      ebitda: 1100000,
      monthly: {
        jan: { eom_mrr: 717379,  gross_needed: 39334, churn_budget: -6849 },
        feb: { eom_mrr: 747157,  gross_needed: 36952, churn_budget: -7174 },
        mar: { eom_mrr: 776935,  gross_needed: 37250, churn_budget: -7472 },
        apr: { eom_mrr: 804006,  gross_needed: 34840, churn_budget: -7769 },
        may: { eom_mrr: 828370,  gross_needed: 32404, churn_budget: -8040 },
        jun: { eom_mrr: 847320,  gross_needed: 27234, churn_budget: -8284 },
        jul: { eom_mrr: 860856,  gross_needed: 22009, churn_budget: -8473 },
        aug: { eom_mrr: 866270,  gross_needed: 14023, churn_budget: -8609 },
        sep: { eom_mrr: 879806,  gross_needed: 22199, churn_budget: -8663 },
        oct: { eom_mrr: 887927,  gross_needed: 16919, churn_budget: -8798 },
        nov: { eom_mrr: 890634,  gross_needed: 11586, churn_budget: -8879 },
        dec: { eom_mrr: 893340,  gross_needed: 11612, churn_budget: -8906 }
      }
    },
    overachieve: {
      annual: 10400000,
      ebitda: 1100000,
      monthly: {
        jan: { eom_mrr: 724674,  gross_needed: 46629, churn_budget: -6849 },
        feb: { eom_mrr: 761139,  gross_needed: 43712, churn_budget: -7247 },
        mar: { eom_mrr: 797604,  gross_needed: 44076, churn_budget: -7611 },
        apr: { eom_mrr: 830754,  gross_needed: 41126, churn_budget: -7976 },
        may: { eom_mrr: 860589,  gross_needed: 38143, churn_budget: -8308 },
        jun: { eom_mrr: 883794,  gross_needed: 31811, churn_budget: -8606 },
        jul: { eom_mrr: 900369,  gross_needed: 25413, churn_budget: -8838 },
        aug: { eom_mrr: 906999,  gross_needed: 15634, churn_budget: -9004 },
        sep: { eom_mrr: 923574,  gross_needed: 25645, churn_budget: -9070 },
        oct: { eom_mrr: 933519,  gross_needed: 19181, churn_budget: -9236 },
        nov: { eom_mrr: 936834,  gross_needed: 12650, churn_budget: -9335 },
        dec: { eom_mrr: 940151,  gross_needed: 12685, churn_budget: -9368 }
      }
    }
  },
  months_ordered: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
  month_labels:   ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  current_month:  'mar',
  current_month_index: 2,
  current_year:   2026
};
```

---

## File 2: js/data/mock-marketing.js

Data source: ActiveCampaign
Accountable: Ger | Squad: Growth

```javascript
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
```

---

## File 3: js/data/mock-sales.js

Data sources: Salesforce, ActiveCampaign
Accountable: Zach | Squad: Growth

```javascript
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
      okr: 'KR2: Expansion revenue = $1.2M total'
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
```

---

## File 4: js/data/mock-partnerships.js

Data sources: Salesforce, PRM
Accountable: Bex/Ange | Squad: Diversification

```javascript
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
```

---

## File 5: js/data/mock-customer-success.js

Data source: Salesforce
Accountable: Cathy | Squad: Growth

```javascript
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
```

---

## File 6: js/data/mock-support.js

Data sources: Salesforce (external), JIRA (internal)
Accountable: TBD | Squad: Growth

```javascript
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
```

---

## File 7: js/data/mock-product.js

Data sources: JIRA, Salesforce
Accountable: Kristi/Madison | Squad: Innovation

```javascript
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
      definition: '% of dev effort on strategic initiatives vs. maintenance/ad-hoc',
      value: 72,
      target: 90,
      breakdown: [
        { type: 'Strategic initiatives', pct: 72, target_pct: 90 },
        { type: 'Maintenance',           pct: 18, target_pct: 8 },
        { type: 'Ad-hoc / unplanned',    pct: 10, target_pct: 2 }
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
```

---

## File 8: js/data/mock-executive.js

Aggregated company-level view for Executive Overview and Squad tabs.

```javascript
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
    ytd_target:     2241471,   // sum of jan+feb+mar target EOM MRR
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
```

---

## File 9: js/data/storage.js

localStorage persistence layer — Phase 2 will replace internals with Google Sheets API.

```javascript
const STORAGE_KEY_PREFIX = 'cic_manual_';

export const storage = {
  async get(department, key) {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${department}_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[CIC Storage] get failed:', e);
      return null;
    }
  },

  async set(department, key, value) {
    try {
      const record = {
        value,
        updated: new Date().toISOString(),
        department,
        key
      };
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${department}_${key}`,
        JSON.stringify(record)
      );
      return record;
    } catch (e) {
      console.warn('[CIC Storage] set failed:', e);
      return null;
    }
  },

  async getAll(department) {
    const result = {};
    const prefix = `${STORAGE_KEY_PREFIX}${department}_`;
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(prefix)) {
          const field = k.replace(prefix, '');
          result[field] = JSON.parse(localStorage.getItem(k));
        }
      }
    } catch (e) {
      console.warn('[CIC Storage] getAll failed:', e);
    }
    return result;
  },

  async clearDepartment(department) {
    const prefix = `${STORAGE_KEY_PREFIX}${department}_`;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  },

  // Phase 2 stub — replace body with Google Sheets API write
  async syncToSheets(department, key, value) {
    console.log('[CIC Storage — Phase 2] syncToSheets not yet implemented');
    console.log('Would write:', { department, key, value });
    return false;
  }
};
```

---

## Validation
Before finishing:
- [ ] All 9 files created in `js/data/`
- [ ] All files use `export const data = { ... }` (ES module syntax)
- [ ] Revenue targets match exactly: Threshold $9.6M, Target $10M, Overachieve $10.4M
- [ ] March EOM MRR for Target scenario = 776,935
- [ ] Mock data uses realistic values (not round numbers everywhere)
- [ ] `storage.js` exports `{ storage }` with get, set, getAll methods
- [ ] No file imports from any other agent's files

## Constraints
- Do NOT modify any file outside `js/data/`
- Do NOT write any HTML or CSS
- Do NOT import from agent 1, 4, 5, or 6 files
- Field names and structure are the contract — choose them carefully
