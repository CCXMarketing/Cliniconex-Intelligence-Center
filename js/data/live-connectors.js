// Live data connectors — fetch from Flask API endpoints and transform
// responses to match mock data structures so modules render unchanged.

const STAGE_COLORS = {
  'contact created': '#9E9E9E',
  'contact engaged': '#029FB5',
  'mql': '#ADC837',
  'pqm': '#ADC837',
  'hiro': '#02475A',
};

function stageColor(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, color] of Object.entries(STAGE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#9E9E9E';
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return resp.json();
}

export async function fetchFunnel(pipelineId) {
  const params = pipelineId ? `?pipeline_id=${pipelineId}` : '';
  const data = await fetchJson(`api/funnel${params}`);
  if (!data || !data.stages) return null;

  let prevCount = null;
  const stages = data.stages.map((s, i) => {
    const conv = prevCount && prevCount > 0
      ? parseFloat(((s.count / prevCount) * 100).toFixed(1))
      : null;
    prevCount = s.count;
    return {
      name: s.name || s.stage,
      order: i + 1,
      count: s.count,
      value: s.value || 0,
      conversion_from_prev: conv,
      avg_days_in_stage: null,
      trend: null,
      trend_labels: null,
      color: stageColor(s.name || s.stage),
    };
  });

  const hiroStage = stages.find(s => s.name.toLowerCase().includes('hiro'));
  const totalConv = stages.length > 1 && stages[0].count > 0
    ? parseFloat(((stages.at(-1).count / stages[0].count) * 100).toFixed(1))
    : 0;

  return {
    label: 'Demand Pipeline Funnel',
    definition: 'ActiveCampaign pipeline — live data',
    pipeline_id: data.pipeline_id,
    pipeline_name: data.pipeline_name,
    stages,
    total_funnel_conversion: totalConv,
    target_hiro_conversion: 30.0,
    status: (hiroStage?.conversion_from_prev || 0) >= 30 ? 'green' : 'yellow',
    cadence: 'Monthly',
    _dataSource: 'live',
  };
}

export async function fetchCampaigns(startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const qs = params.toString() ? `?${params}` : '';
  const data = await fetchJson(`api/campaigns${qs}`);
  if (!data || !data.campaigns) return null;

  const campaigns = data.campaigns.map(c => ({
    name: c.name,
    status: c.status === 'ENABLED' ? 'Active' : c.status,
    spend: c.cost,
    clicks: c.clicks,
    impressions: c.impressions,
    conversions: c.conversions,
    cpc: c.clicks > 0 ? parseFloat((c.cost / c.clicks).toFixed(2)) : 0,
    ctr: c.ctr,
    cpa: c.cpa,
    roas: null,
    status_badge: c.cpa_status,
  }));

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImpr = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalConv = campaigns.reduce((s, c) => s + c.conversions, 0);

  return {
    label: 'Google Ads Performance',
    data_source: data.source || 'Google Ads',
    summary: {
      total_spend: totalSpend,
      total_clicks: totalClicks,
      total_impressions: totalImpr,
      total_conversions: totalConv,
      avg_cpc: totalClicks > 0 ? parseFloat((totalSpend / totalClicks).toFixed(2)) : 0,
      avg_ctr: totalImpr > 0 ? parseFloat(((totalClicks / totalImpr) * 100).toFixed(1)) : 0,
      avg_cpa: totalConv > 0 ? parseFloat((totalSpend / totalConv).toFixed(2)) : 0,
      roas: null,
      quality_score_avg: null,
    },
    campaigns,
    cpa_thresholds: data.thresholds || { excellent: 75, warning: 200, critical: 300 },
    spend_trend: [],
    conversions_trend: [],
    cpa_trend: [],
    trend_labels: [],
    _dataSource: 'live',
  };
}

export async function fetchMetrics(pipelineId) {
  const params = pipelineId ? `?pipeline_id=${pipelineId}` : '';
  const data = await fetchJson(`api/metrics${params}`);
  if (!data) return null;

  return {
    pipeline_value: data.pipeline_value,
    revenue_target: data.revenue_target,
    pct_complete: data.pct_complete,
    quarter: data.quarter,
    days_remaining: data.days_remaining,
    deals_count: data.deals,
    contacts_count: data.contacts,
    status: data.status,
    connections: data.connections,
    _dataSource: 'live',
  };
}

export async function fetchTrends(pipelineId, startDate, endDate) {
  const params = new URLSearchParams();
  if (pipelineId) params.set('pipeline_id', pipelineId);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const qs = params.toString() ? `?${params}` : '';
  const data = await fetchJson(`api/trends${qs}`);
  if (!data) return null;

  const rows = data.months || data.days || [];
  return {
    spend_trend: rows.map(r => r.spend || r.total_value || r.cost || 0),
    conversions_trend: rows.map(r => r.conversions || r.won_count || 0),
    cpa_trend: rows.map(r => r.cpa || 0),
    trend_labels: rows.map(r => r.label || r.date),
    source: data.source,
    _dataSource: 'live',
  };
}

export async function checkConnections() {
  const data = await fetchJson('api/metrics');
  if (!data) return { activecampaign: false, google_ads: false };
  return data.connections || { activecampaign: false, google_ads: false };
}

export async function fetchSayDoRatio(options = {}) {
  const params = new URLSearchParams();
  if (options.projectKey) params.set('project_key', options.projectKey);
  if (options.lookbackDays) params.set('lookback_days', String(options.lookbackDays));
  const qs = params.toString() ? `?${params}` : '';
  const data = await fetchJson(`api/jira/say-do-ratio${qs}`);
  if (!data || data.error || data.ratio == null) return null;

  return {
    value: parseFloat((data.ratio * 100).toFixed(1)),
    value_grace_1d: data.ratio_grace_1d == null
      ? null
      : parseFloat((data.ratio_grace_1d * 100).toFixed(1)),
    unit: '%',
    _meta: {
      on_time: data.on_time,
      resolved_late: data.resolved_late,
      overdue_open: data.overdue_open,
      late: data.late,
      total: data.total,
      on_time_grace_1d: data.on_time_grace_1d,
      resolved_late_grace_1d: data.resolved_late_grace_1d,
      late_grace_1d: data.late_grace_1d,
      period_days: data.period_days,
      project_key: data.project_key,
    },
    _dataSource: 'live',
  };
}

export async function fetchSayDoByQuarter(options = {}) {
  const params = new URLSearchParams();
  if (options.projectKey) params.set('project_key', options.projectKey);
  if (options.numQuarters) params.set('num_quarters', String(options.numQuarters));
  const qs = params.toString() ? `?${params}` : '';
  const data = await fetchJson(`api/jira/say-do-ratio-by-quarter${qs}`);
  if (!data || data.error || !Array.isArray(data.quarters)) return null;

  return data.quarters.map(q => ({
    quarter:   q.quarter,
    ratio:     q.ratio == null ? null : Math.round(q.ratio * 1000) / 10,
    ratio_grace_1d: q.ratio_grace_1d == null
      ? null
      : Math.round(q.ratio_grace_1d * 1000) / 10,
    committed: q.total,
    delivered: q.on_time,
    delivered_grace_1d: q.on_time_grace_1d,
    _meta: {
      resolved_late: q.resolved_late,
      overdue_open: q.overdue_open,
      resolved_late_grace_1d: q.resolved_late_grace_1d,
      late_grace_1d: q.late_grace_1d,
      window_start: q.window_start,
      window_end: q.window_end,
    },
  }));
}

export async function fetchNewMrrAdded(options = {}) {
  const params = new URLSearchParams();
  if (options.window) params.set('window', options.window);
  const qs = params.toString() ? `?${params}` : '';
  const data = await fetchJson(`api/sf/new-mrr-added${qs}`);
  if (!data || data.error || data.value == null) return null;

  return {
    value: data.value,
    won_count: data.won_count,
    window: data.window,
    _meta: {
      window_start: data.window_start,
      window_end: data.window_end,
      field: data.field,
    },
    _dataSource: 'live',
  };
}

export async function fetchStrategicAllocation(options = {}) {
  const params = new URLSearchParams();
  if (options.projectKey) params.set('project_key', options.projectKey);
  if (options.lookbackDays) params.set('lookback_days', String(options.lookbackDays));
  const qs = params.toString() ? `?${params}` : '';
  const data = await fetchJson(`api/jira/strategic-allocation${qs}`);
  if (!data || data.error) return null;

  // Prefer the time-weighted ratio; fall back to count-weighted when no
  // issue had loggable time data so the dashboard still renders.
  const timeRatio = data.ratio;
  const countRatio = data.ratio_by_count;
  const effective = timeRatio != null ? timeRatio : countRatio;
  if (effective == null) return null;

  return {
    value: parseFloat((effective * 100).toFixed(1)),
    value_by_count: countRatio == null
      ? null
      : parseFloat((countRatio * 100).toFixed(1)),
    weight_basis: timeRatio != null ? 'time' : 'count',
    unit: '%',
    _meta: {
      strategic: data.strategic,
      non_strategic: data.non_strategic,
      total: data.total,
      strategic_seconds: data.strategic_seconds,
      non_strategic_seconds: data.non_strategic_seconds,
      total_seconds: data.total_seconds,
      weight_sources: data.weight_sources,
      period_days: data.period_days,
      project_key: data.project_key,
      start_date_field: data.start_date_field,
    },
    _dataSource: 'live',
  };
}

export async function fetchStrategicAllocationByQuarter(options = {}) {
  const params = new URLSearchParams();
  if (options.projectKey) params.set('project_key', options.projectKey);
  if (options.numQuarters) params.set('num_quarters', String(options.numQuarters));
  const qs = params.toString() ? `?${params}` : '';
  const data = await fetchJson(`api/jira/strategic-allocation-by-quarter${qs}`);
  if (!data || data.error || !Array.isArray(data.quarters)) return null;

  return data.quarters.map(q => {
    const time = q.ratio;
    const count = q.ratio_by_count;
    const effective = time != null ? time : count;
    return {
      quarter: q.quarter,
      ratio: effective == null ? null : Math.round(effective * 1000) / 10,
      ratio_time_weighted: time == null ? null : Math.round(time * 1000) / 10,
      ratio_by_count: count == null ? null : Math.round(count * 1000) / 10,
      weight_basis: time != null ? 'time' : (count != null ? 'count' : 'none'),
      strategic: q.strategic,
      non_strategic: q.non_strategic,
      total: q.total,
      _meta: {
        strategic_seconds: q.strategic_seconds,
        non_strategic_seconds: q.non_strategic_seconds,
        total_seconds: q.total_seconds,
        weight_sources: q.weight_sources,
        window_start: q.window_start,
        window_end: q.window_end,
      },
    };
  });
}
