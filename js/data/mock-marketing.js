export const data = {
  meta: {
    department: 'Marketing',
    accountable: 'Ger',
    squad: 'Growth',
    data_source: ['ActiveCampaign', 'Google Ads', 'Google Analytics', 'Google Search Console'],
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
    },

    // ── ActiveCampaign Demand Pipeline Funnel ──
    ac_demand_funnel: {
      label: 'Demand Pipeline Funnel',
      definition: 'ActiveCampaign Pipeline 1 — full stage breakdown',
      pipeline_id: 1,
      pipeline_name: 'Prospect Demand Pipeline',
      stages: [
        {
          name: 'Contact Created',
          order: 1,
          count: 842,
          value: 0,
          conversion_from_prev: null,
          avg_days_in_stage: 2.1,
          trend: [680, 720, 790, 842],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          color: '#9E9E9E'
        },
        {
          name: 'Contact Engaged',
          order: 2,
          count: 521,
          value: 0,
          conversion_from_prev: 61.9,
          avg_days_in_stage: 5.4,
          trend: [398, 432, 476, 521],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          color: '#029FB5'
        },
        {
          name: 'MQL / PQM',
          order: 3,
          count: 189,
          value: 0,
          conversion_from_prev: 36.3,
          avg_days_in_stage: 8.2,
          trend: [142, 158, 171, 189],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          color: '#ADC837'
        },
        {
          name: 'HIRO',
          order: 4,
          count: 46,
          value: 1240000,
          conversion_from_prev: 24.3,
          avg_days_in_stage: 12.6,
          trend: [30, 35, 40, 46],
          trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
          color: '#02475A',
          target_conversion: 30.0
        }
      ],
      total_funnel_conversion: 5.5,
      target_hiro_conversion: 30.0,
      status: 'yellow',
      cadence: 'Monthly'
    },

    // ── Google Ads ──
    google_ads: {
      label: 'Google Ads Performance',
      data_source: 'Google Ads',
      customer_id: '4135262293',
      period: 'March 2026',
      summary: {
        total_spend: 18500,
        total_clicks: 4280,
        total_impressions: 142000,
        total_conversions: 142,
        avg_cpc: 4.32,
        avg_ctr: 3.01,
        avg_cpa: 130.28,
        roas: 3.2,
        quality_score_avg: 7.2
      },
      campaigns: [
        {
          name: 'Senior Care — Brand',
          status: 'Active',
          spend: 4200,
          clicks: 1240,
          impressions: 28400,
          conversions: 48,
          cpc: 3.39,
          ctr: 4.37,
          cpa: 87.50,
          roas: 4.1,
          status_badge: 'green'
        },
        {
          name: 'Senior Care — Non-Brand',
          status: 'Active',
          spend: 5800,
          clicks: 980,
          impressions: 42000,
          conversions: 38,
          cpc: 5.92,
          ctr: 2.33,
          cpa: 152.63,
          roas: 2.8,
          status_badge: 'yellow'
        },
        {
          name: 'Senior Living — Awareness',
          status: 'Active',
          spend: 3100,
          clicks: 620,
          impressions: 31000,
          conversions: 22,
          cpc: 5.00,
          ctr: 2.00,
          cpa: 140.91,
          roas: 3.1,
          status_badge: 'yellow'
        },
        {
          name: 'US Medical — Prospecting',
          status: 'Active',
          spend: 2800,
          clicks: 840,
          impressions: 22000,
          conversions: 18,
          cpc: 3.33,
          ctr: 3.82,
          cpa: 155.56,
          roas: 2.9,
          status_badge: 'yellow'
        },
        {
          name: 'Remarketing — All Visitors',
          status: 'Active',
          spend: 1600,
          clicks: 600,
          impressions: 18600,
          conversions: 16,
          cpc: 2.67,
          ctr: 3.23,
          cpa: 100.00,
          roas: 4.4,
          status_badge: 'green'
        }
      ],
      spend_trend: [14200, 16800, 17200, 18500],
      conversions_trend: [98, 112, 128, 142],
      cpa_trend: [144.90, 150.00, 134.38, 130.28],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar'],
      cpa_thresholds: { excellent: 75, warning: 200, critical: 300 }
    },

    // ── Google Analytics ──
    google_analytics: {
      label: 'Google Analytics',
      data_source: 'Google Analytics 4',
      period: 'March 2026',
      summary: {
        sessions: 18420,
        users: 14280,
        new_users: 9840,
        bounce_rate: 42.1,
        avg_session_duration: 185,
        pages_per_session: 3.4,
        goal_completions: 284,
        goal_conversion_rate: 1.54
      },
      top_pages: [
        { page: '/home', sessions: 4820, bounce_rate: 38.2, avg_time: 142 },
        { page: '/products/acm', sessions: 2940, bounce_rate: 34.8, avg_time: 218 },
        { page: '/solutions/senior-care', sessions: 2180, bounce_rate: 41.2, avg_time: 196 },
        { page: '/demo', sessions: 1840, bounce_rate: 22.4, avg_time: 284 },
        { page: '/pricing', sessions: 1620, bounce_rate: 45.1, avg_time: 168 }
      ],
      traffic_sources: [
        { source: 'Organic Search', sessions: 6840, pct: 37.1, conversions: 98 },
        { source: 'Paid Search', sessions: 4280, pct: 23.2, conversions: 142 },
        { source: 'Direct', sessions: 3420, pct: 18.6, conversions: 24 },
        { source: 'Referral', sessions: 2180, pct: 11.8, conversions: 12 },
        { source: 'Email', sessions: 1120, pct: 6.1, conversions: 6 },
        { source: 'Social', sessions: 580, pct: 3.2, conversions: 2 }
      ],
      sessions_trend: [14200, 15800, 17100, 18420],
      conversions_trend: [198, 224, 256, 284],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar']
    },

    // ── Google Search Console ──
    google_search_console: {
      label: 'Google Search Console',
      data_source: 'Google Search Console',
      period: 'March 2026',
      summary: {
        total_clicks: 6840,
        total_impressions: 284000,
        avg_ctr: 2.41,
        avg_position: 18.4
      },
      top_queries: [
        { query: 'automated care messaging', clicks: 842, impressions: 4200, ctr: 20.0, position: 2.1 },
        { query: 'senior care communication software', clicks: 624, impressions: 8400, ctr: 7.4, position: 4.8 },
        { query: 'cliniconex', clicks: 584, impressions: 1840, ctr: 31.7, position: 1.2 },
        { query: 'patient appointment reminders', clicks: 420, impressions: 12000, ctr: 3.5, position: 8.4 },
        { query: 'ltc communication platform', clicks: 384, impressions: 6800, ctr: 5.6, position: 6.2 },
        { query: 'acm messenger software', clicks: 298, impressions: 2400, ctr: 12.4, position: 3.8 },
        { query: 'care home automated messaging', clicks: 242, impressions: 9200, ctr: 2.6, position: 11.4 }
      ],
      clicks_trend: [4820, 5400, 6100, 6840],
      impressions_trend: [218000, 242000, 264000, 284000],
      position_trend: [22.1, 20.8, 19.6, 18.4],
      trend_labels: ['Dec', 'Jan', 'Feb', 'Mar']
    }
  }
};
