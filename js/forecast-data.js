// ── Forecast Data — assembles 12-month actuals[] from connectors + manual entry

const CACHE_KEY = 'cic_forecast_actuals_cache';

/**
 * Build the 12-month actuals array for the forecast engine.
 * @param {number} year — forecast year
 * @param {Object} manualNewMRR — { 'YYYY-MM': number }
 * @returns {Promise<{actuals: Array, liveDataFetched: boolean}>}
 */
export async function buildActuals(year, manualNewMRR = {}) {
  const actuals = Array.from({ length: 12 }, () => ({
    leads: 0, wins: 0, newMRR: 0, adSpend: 0,
  }));

  // Hydrate manual newMRR
  for (let m = 0; m < 12; m++) {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    if (manualNewMRR[key] != null) {
      actuals[m].newMRR = manualNewMRR[key];
    }
  }

  let liveDataFetched = false;

  try {
    const [acResult, adsResult] = await Promise.allSettled([
      fetchACMonthlyData(year),
      fetchGoogleAdsMonthlySpend(year),
    ]);

    if (acResult.status === 'fulfilled' && acResult.value) {
      acResult.value.forEach(({ month, leads, wins }) => {
        if (month >= 1 && month <= 12) {
          actuals[month - 1].leads = leads;
          actuals[month - 1].wins = wins;
        }
      });
      liveDataFetched = true;
    }

    if (adsResult.status === 'fulfilled' && adsResult.value) {
      adsResult.value.forEach(({ month, spend }) => {
        if (month >= 1 && month <= 12) {
          actuals[month - 1].adSpend = spend;
        }
      });
      liveDataFetched = true;
    }

    if (liveDataFetched) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          year,
          actuals: actuals.map(a => ({ leads: a.leads, wins: a.wins, adSpend: a.adSpend })),
          fetchedAt: Date.now(),
        }));
      } catch { /* localStorage full */ }
    }
  } catch {
    // connectors unreachable
  }

  if (!liveDataFetched) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && cached.year === year && cached.actuals) {
        cached.actuals.forEach((c, i) => {
          actuals[i].leads   = c.leads   || 0;
          actuals[i].wins    = c.wins    || 0;
          actuals[i].adSpend = c.adSpend || 0;
        });
      }
    } catch { /* corrupted cache */ }
  }

  return { actuals, liveDataFetched };
}

/**
 * Fetch all Pipeline 1 deals for the year, group by month.
 */
async function fetchACMonthlyData(year) {
  const { CONFIG } = await import('./config.js');
  const PROXY   = CONFIG?.activecampaign?.proxy_url;
  const API_KEY = CONFIG?.activecampaign?.api_key;
  if (!PROXY || !API_KEY || API_KEY === 'YOUR_NEW_AC_KEY_HERE') return null;

  const startDate = `${year}-01-01`;
  const endDate   = `${year}-12-31`;
  const allDeals  = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({
      path: 'deals',
      api_key: API_KEY,
      'filters[group]': 1,
      'filters[created_after]':  startDate,
      'filters[created_before]': endDate,
      limit, offset,
    });
    const resp = await fetch(`${PROXY}?${params.toString()}`);
    if (!resp.ok) break;
    const data  = await resp.json();
    const deals = data.deals || [];
    allDeals.push(...deals);
    if (deals.length < limit) break;
    offset += limit;
    if (allDeals.length >= 5000) break;
    await new Promise(r => setTimeout(r, 210));
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, leads: 0, wins: 0,
  }));

  allDeals.forEach(deal => {
    const cdate = deal.cdate || deal.created_date;
    if (!cdate) return;
    const d = new Date(cdate);
    if (d.getFullYear() !== year) return;
    const m = d.getMonth();
    months[m].leads++;
    if (deal.status === '1' || deal.status === 1) {
      months[m].wins++;
    }
  });

  return months;
}

/**
 * Fetch monthly Google Ads spend via the live-connectors trends API.
 */
async function fetchGoogleAdsMonthlySpend(year) {
  try {
    const resp = await fetch(`api/trends?start_date=${year}-01-01&end_date=${year}-12-31`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const rows = data.months || data.days || [];
    return rows.map((r, i) => ({
      month: i + 1,
      spend: r.spend || r.cost || 0,
    }));
  } catch {
    return null;
  }
}

/**
 * Check if cached actuals exist (for banner display).
 */
export function isLiveDataCached() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return cached ? { cached: true, fetchedAt: cached.fetchedAt } : { cached: false };
  } catch {
    return { cached: false };
  }
}
