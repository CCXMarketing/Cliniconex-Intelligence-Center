// ── Connection Status Panel ──────────────────────────────────────
// Shows data source health, sync timestamps, and error log.
// Sources: AC, Google Ads, Gemini, Salesforce (stub), JIRA (stub).

const SOURCES = [
  { id: 'activecampaign', label: 'ActiveCampaign', path: '/ac/health',       canSync: true },
  { id: 'google_ads',     label: 'Google Ads',     path: '/google-ads/',      canSync: true },
  { id: 'gemini',         label: 'Gemini',         path: '/gemini/',          canSync: false, onDemand: true },
  { id: 'salesforce',     label: 'Salesforce',     path: '/salesforce/',      canSync: false },
  { id: 'jira',           label: 'JIRA',           path: '/jira/',            canSync: false },
];

const STATUS_COLORS = {
  connected:      { dot: '#22C55E', label: 'Connected' },
  configured:     { dot: '#22C55E', label: 'Configured' },
  degraded:       { dot: '#F59E0B', label: 'Degraded' },
  failing:        { dot: '#EF4444', label: 'Failing' },
  not_connected:  { dot: '#94A3B8', label: 'Not Connected' },
  not_configured: { dot: '#94A3B8', label: 'Not Configured' },
};

const LS_ERRORS = 'cic_status_errors';
const LS_SYNC   = 'cic_status_sync';

function loadErrors() {
  try { return JSON.parse(localStorage.getItem(LS_ERRORS)) || {}; } catch { return {}; }
}
function saveErrors(errors) { localStorage.setItem(LS_ERRORS, JSON.stringify(errors)); }

function loadSyncTimes() {
  try { return JSON.parse(localStorage.getItem(LS_SYNC)) || {}; } catch { return {}; }
}
function saveSyncTimes(times) { localStorage.setItem(LS_SYNC, JSON.stringify(times)); }

function logError(sourceId, status, message) {
  const errors = loadErrors();
  if (!errors[sourceId]) errors[sourceId] = [];
  errors[sourceId].unshift({ timestamp: new Date().toISOString(), status, message });
  errors[sourceId] = errors[sourceId].slice(0, 10); // keep last 10
  saveErrors(errors);
}

function getWorkerUrl() {
  try {
    // Dynamic import not possible in sync context; use hardcoded fallback
    return 'https://cic-ac-proxy.gerald-48c.workers.dev';
  } catch { return ''; }
}

export default {
  _container: null,
  _healthData: null,

  async init(containerEl) {
    this._container = containerEl;
    await this._fetchHealth();
    this._render();
  },

  destroy() {
    this._container = null;
    this._healthData = null;
  },

  getSummaryKPIs() {
    if (!this._healthData) return [];
    const sources = this._healthData.sources || {};
    const connected = Object.values(sources).filter(s => s.status === 'connected' || s.status === 'configured').length;
    return [
      { label: 'Data Sources', value: `${connected}/${Object.keys(sources).length}`, delta: '', status: connected >= 3 ? 'green' : connected >= 1 ? 'yellow' : 'red' }
    ];
  },

  async _fetchHealth() {
    const base = getWorkerUrl();
    try {
      const resp = await fetch(`${base}/health`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this._healthData = await resp.json();
    } catch (e) {
      this._healthData = {
        timestamp: new Date().toISOString(),
        sources: {
          activecampaign: { status: 'failing', error: e.message },
          google_ads: { status: 'not_configured' },
          gemini: { status: 'not_configured' },
          salesforce: { status: 'not_connected' },
          jira: { status: 'not_connected' },
        }
      };
    }
  },

  _render() {
    if (!this._container) return;
    const grid = this._container.querySelector('#status-grid');
    const errorLog = this._container.querySelector('#status-error-log');
    if (!grid) return;

    const syncTimes = loadSyncTimes();
    const errors = loadErrors();
    const sources = this._healthData?.sources || {};

    // Status grid
    grid.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Last Sync</th>
              <th class="col-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${SOURCES.map(src => {
              const health = sources[src.id] || { status: 'not_connected' };
              const sc = STATUS_COLORS[health.status] || STATUS_COLORS.not_connected;
              const lastSync = syncTimes[src.id] ? this._timeAgo(syncTimes[src.id]) : '\u2014';
              const actionHtml = src.canSync
                ? `<button class="btn btn--sm btn--secondary" data-sync="${src.id}">Force Sync</button>`
                : src.onDemand
                  ? `<button class="btn btn--sm btn--secondary" data-sync="${src.id}">Test</button>`
                  : '<span style="color:#94A3B8;font-size:12px;">\u2014</span>';

              return `
                <tr>
                  <td><strong>${src.label}</strong></td>
                  <td>
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                      <span style="width:8px;height:8px;border-radius:50%;background:${sc.dot};display:inline-block;"></span>
                      ${sc.label}
                    </span>
                  </td>
                  <td style="color:#9E9E9E;font-size:13px;">${lastSync}</td>
                  <td class="col-center">${actionHtml}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // Wire sync buttons
    grid.querySelectorAll('[data-sync]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sourceId = btn.dataset.sync;
        btn.disabled = true;
        btn.textContent = 'Syncing\u2026';
        await this._forceSync(sourceId);
        btn.disabled = false;
        btn.textContent = btn.dataset.sync === 'gemini' ? 'Test' : 'Force Sync';
        this._render();
      });
    });

    // Error log
    if (errorLog) {
      const allErrors = Object.entries(errors).filter(([, errs]) => errs.length > 0);
      if (allErrors.length === 0) {
        errorLog.innerHTML = '<div style="padding:16px;color:#9E9E9E;font-style:italic;font-size:13px;">No errors recorded</div>';
      } else {
        errorLog.innerHTML = allErrors.map(([sourceId, errs]) => {
          const src = SOURCES.find(s => s.id === sourceId) || { label: sourceId };
          return `
            <div class="table-wrapper" style="margin-bottom:16px;">
              <div class="table-title">${src.label}</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  ${errs.map(e => `
                    <tr>
                      <td style="white-space:nowrap;font-size:12px;color:#9E9E9E;">${new Date(e.timestamp).toLocaleString('en-CA')}</td>
                      <td><span class="badge badge--red">${e.status}</span></td>
                      <td style="font-size:12px;">${e.message || '\u2014'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`;
        }).join('');
      }
    }
  },

  async _forceSync(sourceId) {
    const base = getWorkerUrl();
    const src = SOURCES.find(s => s.id === sourceId);
    if (!src) return;

    // Clear cache for this source
    const cachePrefix = `cic_cache_${sourceId}`;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(cachePrefix)) localStorage.removeItem(key);
    }

    try {
      const resp = await fetch(`${base}${src.path}`);
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        logError(sourceId, resp.status, body || `HTTP ${resp.status}`);
        throw new Error(`HTTP ${resp.status}`);
      }

      const syncTimes = loadSyncTimes();
      syncTimes[sourceId] = new Date().toISOString();
      saveSyncTimes(syncTimes);

      // Re-fetch health
      await this._fetchHealth();
    } catch (e) {
      logError(sourceId, 'error', e.message);
    }
  },

  _timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
};
