// ── ActiveCampaign API Connector ─────────────────────────────────
// Phase 2: Live data connector for the CIC
// Falls back to mock data if API is unavailable or key is missing

import { CONFIG } from '../config.js';

const AC_BASE = CONFIG.activecampaign.api_url;
const AC_KEY  = CONFIG.activecampaign.api_key;

// ── Rate limiting ─────────────────────────────────────────────────
// AC allows 5 req/sec. Queue requests to stay under limit.
const requestQueue = [];
let isProcessing = false;

async function queuedFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ url, options, resolve, reject });
    if (!isProcessing) processQueue();
  });
}

async function processQueue() {
  isProcessing = true;
  while (requestQueue.length > 0) {
    const { url, options, resolve, reject } = requestQueue.shift();
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Api-Token': AC_KEY,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      if (response.status === 429 || response.status === 503) {
        // Rate limited — wait 500ms and retry
        await sleep(500);
        requestQueue.unshift({ url, options, resolve, reject });
        continue;
      }
      if (!response.ok) {
        reject(new Error(`AC API error: ${response.status} ${response.statusText}`));
        continue;
      }
      resolve(await response.json());
    } catch (err) {
      reject(err);
    }
    // 210ms between requests = ~4.7 req/sec (safely under 5/sec limit)
    await sleep(210);
  }
  isProcessing = false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Core fetch with pagination ────────────────────────────────────
async function fetchAll(endpoint, params = {}, dataKey) {
  const results = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const query = new URLSearchParams({
      limit,
      offset,
      ...params
    }).toString();

    const data = await queuedFetch(`${AC_BASE}/${endpoint}?${query}`);
    const items = data[dataKey] || [];
    results.push(...items);

    if (items.length < limit) break;
    offset += limit;

    // Safety cap — never fetch more than 5000 records
    if (results.length >= 5000) break;
  }

  return results;
}

// ── Pipeline Data ─────────────────────────────────────────────────

/**
 * Get all stages for a pipeline
 */
export async function getPipelineStages(pipelineId) {
  const data = await queuedFetch(
    `${AC_BASE}/dealStages?filters[d_groupid]=${pipelineId}`
  );
  return data.dealStages || [];
}

/**
 * Get deal counts and values per stage for a pipeline
 * Returns array of { stage_id, stage_name, order, count, value }
 */
export async function getPipelineMetrics(pipelineId) {
  const stages = await getPipelineStages(pipelineId);

  const stageMetrics = await Promise.all(
    stages.map(async stage => {
      const data = await queuedFetch(
        `${AC_BASE}/deals?filters[group]=${pipelineId}&filters[stage]=${stage.id}&limit=100`
      );
      const deals = data.deals || [];
      const totalValue = deals.reduce((sum, d) => {
        // AC returns value in cents — convert to dollars
        return sum + (parseInt(d.value) / 100);
      }, 0);

      return {
        stage_id:   stage.id,
        stage_name: stage.title,
        order:      parseInt(stage.order),
        count:      parseInt(data.meta?.total || deals.length),
        value:      totalValue
      };
    })
  );

  return stageMetrics.sort((a, b) => a.order - b.order);
}

/**
 * Get all open deals for a pipeline with their stage info
 */
export async function getPipelineDeals(pipelineId, options = {}) {
  const params = {
    'filters[group]': pipelineId,
    'filters[status]': 0  // 0 = open
  };
  if (options.startDate) params['filters[created_after]'] = options.startDate;
  if (options.endDate)   params['filters[created_before]'] = options.endDate;

  return fetchAll('deals', params, 'deals');
}

// ── Demand Pipeline (Pipeline 1) Funnel ──────────────────────────

/**
 * Build the AC demand funnel data matching the CIC schema
 * Maps Pipeline 1 stages to: Contact Created, Contact Engaged, MQL/PQM, HIRO
 */
export async function getDemandFunnel() {
  const PIPELINE_ID = 1;
  const metrics = await getPipelineMetrics(PIPELINE_ID);

  // Stage name mapping — adjust if AC stage names differ
  const STAGE_MAP = {
    'Contact Created':  { order: 1, color: '#9E9E9E' },
    'Contact Engaged':  { order: 2, color: '#029FB5' },
    'MQL':              { order: 3, color: '#ADC837' },
    'PQM':              { order: 3, color: '#ADC837' },
    'MQL/PQM':          { order: 3, color: '#ADC837' },
    'HIRO':             { order: 4, color: '#02475A' }
  };

  // Build ordered stages — try to match by name, fall back to order
  const orderedStages = metrics
    .map(s => {
      const mapped = Object.entries(STAGE_MAP).find(([name]) =>
        s.stage_name.toLowerCase().includes(name.toLowerCase())
      );
      return {
        name:                 s.stage_name,
        order:                mapped ? mapped[1].order : s.order,
        count:                s.count,
        value:                s.value,
        color:                mapped ? mapped[1].color : '#9E9E9E',
        conversion_from_prev: null,  // calculated below
        avg_days_in_stage:    null,  // Phase 3: from deal activities
        trend:                [s.count, s.count, s.count, s.count],  // Phase 3: historical
        trend_labels:         ['Dec', 'Jan', 'Feb', 'Mar']
      };
    })
    .sort((a, b) => a.order - b.order);

  // Calculate conversion rates between consecutive stages
  for (let i = 1; i < orderedStages.length; i++) {
    const prev = orderedStages[i - 1].count;
    const curr = orderedStages[i].count;
    if (prev > 0) {
      orderedStages[i].conversion_from_prev =
        parseFloat(((curr / prev) * 100).toFixed(1));
    }
  }

  // Add HIRO target
  const hiro = orderedStages.find(s =>
    s.name.toLowerCase().includes('hiro'));
  if (hiro) hiro.target_conversion = 30.0;

  // Total funnel conversion: first stage → HIRO
  const first = orderedStages[0]?.count || 1;
  const last  = orderedStages[orderedStages.length - 1]?.count || 0;
  const totalConversion = parseFloat(((last / first) * 100).toFixed(1));

  return {
    label:         'Demand Pipeline Funnel',
    definition:    'ActiveCampaign Pipeline 1 — live data',
    pipeline_id:   PIPELINE_ID,
    pipeline_name: 'Prospect Demand Pipeline',
    stages:        orderedStages,
    total_funnel_conversion: totalConversion,
    target_hiro_conversion:  30.0,
    status:        hiro?.conversion_from_prev >= 30 ? 'green' : 'yellow',
    cadence:       'Monthly',
    live:          true,
    fetched_at:    new Date().toISOString()
  };
}

// ── Marketing KPIs ────────────────────────────────────────────────

/**
 * Get marketing-created deals (MQLs) for current month
 */
export async function getMarketingCreatedDeals(options = {}) {
  const now   = new Date();
  const start = options.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = options.endDate   || now.toISOString();

  const deals = await getPipelineDeals(1, { startDate: start, endDate: end });
  return {
    value:       deals.length,
    ytd:         null,  // Phase 3: calculate from full year
    trend:       null,  // Phase 3: historical data
    live:        true,
    fetched_at:  new Date().toISOString()
  };
}

/**
 * Get pipeline total value (all open deals in Pipeline 1)
 */
export async function getPipelineValue(pipelineId = 1) {
  const deals = await getPipelineDeals(pipelineId);
  const totalValue = deals.reduce((sum, d) => {
    return sum + (parseInt(d.value || 0) / 100);
  }, 0);
  return {
    value:      totalValue,
    deal_count: deals.length,
    live:       true,
    fetched_at: new Date().toISOString()
  };
}

/**
 * Get HIRO conversion rate for Pipeline 1
 */
export async function getHIROConversionRate() {
  const metrics = await getPipelineMetrics(1);
  const stages  = metrics.sort((a, b) => a.order - b.order);

  if (stages.length < 2) return null;

  // Find MQL stage (third stage) and HIRO stage (last stage)
  const mqlStage  = stages[stages.length - 2];
  const hiroStage = stages[stages.length - 1];

  if (!mqlStage || !hiroStage || mqlStage.count === 0) return null;

  const rate = parseFloat(((hiroStage.count / mqlStage.count) * 100).toFixed(1));
  return {
    value:      rate,
    target:     30.0,
    status:     rate >= 30 ? 'green' : rate >= 20 ? 'yellow' : 'red',
    live:       true,
    fetched_at: new Date().toISOString()
  };
}

// ── Connection Test ───────────────────────────────────────────────

/**
 * Test the AC connection — returns { connected, error, account_name }
 */
export async function testConnection() {
  try {
    if (!AC_KEY || AC_KEY === 'YOUR_NEW_AC_KEY_HERE') {
      return { connected: false, error: 'No API key configured in config.js' };
    }
    const data = await queuedFetch(`${AC_BASE}/accounts?limit=1`);
    return {
      connected:    true,
      error:        null,
      record_count: data.meta?.total || 'unknown'
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

// ── Full Marketing Data Fetch ─────────────────────────────────────

/**
 * Fetch all live marketing data and return in CIC schema format
 * This replaces mock-marketing.js data when API is available
 */
export async function fetchMarketingData() {
  console.log('[AC] Fetching live marketing data...');

  const [
    funnelData,
    mqlData,
    pipelineData,
    hiroData
  ] = await Promise.allSettled([
    getDemandFunnel(),
    getMarketingCreatedDeals(),
    getPipelineValue(1),
    getHIROConversionRate()
  ]);

  const result = {
    _live:      true,
    _fetched_at: new Date().toISOString(),
    _errors:    []
  };

  if (funnelData.status === 'fulfilled') {
    result.ac_demand_funnel = funnelData.value;
  } else {
    result._errors.push('Funnel: ' + funnelData.reason?.message);
    console.warn('[AC] Funnel fetch failed:', funnelData.reason);
  }

  if (mqlData.status === 'fulfilled') {
    result.marketing_created_deals_live = mqlData.value;
  } else {
    result._errors.push('MQLs: ' + mqlData.reason?.message);
  }

  if (pipelineData.status === 'fulfilled') {
    result.pipeline_generated_live = pipelineData.value;
  } else {
    result._errors.push('Pipeline: ' + pipelineData.reason?.message);
  }

  if (hiroData.status === 'fulfilled') {
    result.hiro_conversion_live = hiroData.value;
  } else {
    result._errors.push('HIRO: ' + hiroData.reason?.message);
  }

  if (result._errors.length > 0) {
    console.warn('[AC] Some data failed to load:', result._errors);
  } else {
    console.log('[AC] All marketing data loaded successfully');
  }

  return result;
}
