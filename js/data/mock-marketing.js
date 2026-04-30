// ── Live AC connector (lazy-loaded) ──────────────────────────────
let _liveConnector = null;

async function getLiveConnector() {
  if (_liveConnector) return _liveConnector;
  try {
    _liveConnector = await import('./activecampaign.js');
    return _liveConnector;
  } catch (e) {
    console.warn('[CIC] AC connector not available — using mock data:', e.message);
    return null;
  }
}

/**
 * Get marketing data — live AC data merged over mock data.
 * Mock data is always the fallback if API is unavailable.
 */
export async function getMarketingData() {
  // Always start with mock data as the base
  const base = { ...data };

  const connector = await getLiveConnector();
  if (!connector) return base;

  try {
    const live = await connector.fetchMarketingData();

    // Merge live funnel data
    if (live.ac_demand_funnel) {
      base.kpis.ac_demand_funnel = live.ac_demand_funnel;
    }

    // Merge live MQL count
    if (live.marketing_created_deals_live?.value != null) {
      base.kpis.marketing_created_deals = {
        ...base.kpis.marketing_created_deals,
        value: live.marketing_created_deals_live.value,
        _live: true
      };
    }

    // Merge live pipeline value
    if (live.pipeline_generated_live?.value != null) {
      base.kpis.pipeline_generated = {
        ...base.kpis.pipeline_generated,
        value: live.pipeline_generated_live.value,
        _live: true
      };
    }

    // Merge live HIRO conversion
    if (live.hiro_conversion_live?.value != null) {
      base.kpis.hiro_conversion_rate = {
        ...base.kpis.hiro_conversion_rate,
        value:  live.hiro_conversion_live.value,
        status: live.hiro_conversion_live.status,
        _live:  true
      };
    }

    base._live       = true;
    base._fetched_at = live._fetched_at;
    base._errors     = live._errors;

  } catch (err) {
    console.warn('[CIC] Live data merge failed — using mock data:', err.message);
    base._live  = false;
    base._error = err.message;
  }

  return base;
}

export const data = {
  meta: {
    department: 'Marketing',
    accountable: 'Ger',
    squad: 'Growth',
    data_source: ['ActiveCampaign', 'Google Ads'],
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
      unit: 'ratio',
      cadence: 'Monthly',
      okr: 'KR3: Maintain or reduce current CAC',
      note: 'Displayed as X:1 ratio (e.g. 3.2:1 means $3.20 return per $1 spent)'
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
    }
  }
};
