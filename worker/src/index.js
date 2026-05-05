// ── CIC API Proxy Worker ────────────────────────────────────────
// Routes all CIC data-source API calls through Cloudflare Workers.
// Credentials stored in Worker Secrets — never in frontend code.
// CORS-locked to ToolHub origin; GitHub Pages mirror is blocked.

// ── CORS ────────────────────────────────────────────────────────

const TOOLHUB_ORIGINS = [
  // Production: Tailscale-served ToolHub
  /^https:\/\/ccx-toolhub\..+/,
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000',
];

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  // ToolHub origins always allowed
  if (TOOLHUB_ORIGINS.some(re => re.test(origin))) return true;
  // Dev origins only in development
  if (env.ENVIRONMENT === 'development' && DEV_ORIGINS.includes(origin)) return true;
  // Check custom allowed origins from env var
  const custom = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (custom.includes(origin)) return true;
  return false;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// ── Rate Limiting ───────────────────────────────────────────────

const rateLimits = {
  ac: { max: 4, window: 1000 },          // 4 req/sec (AC limit: 5)
  'google-ads': { max: 10, window: 1000 }, // 10 req/sec
  gemini: { max: 10, window: 1000 },       // conservative default
};

// In-memory counters (reset per Worker instance lifetime)
const counters = {};

function checkRateLimit(source) {
  const limit = rateLimits[source];
  if (!limit) return true;

  const now = Date.now();
  if (!counters[source]) counters[source] = { count: 0, windowStart: now };

  const c = counters[source];
  if (now - c.windowStart > limit.window) {
    c.count = 0;
    c.windowStart = now;
  }

  c.count++;
  if (c.count > limit.max) {
    return false;
  }
  return true;
}

// ── Route Handlers ──────────────────────────────────────────────

async function handleAC(request, env, path) {
  const token = env.AC_API_TOKEN;
  if (!token) return jsonError('AC_API_TOKEN not configured', 500);

  const acBase = 'https://cliniconexmarketing.api-us1.com/api/3';
  const url = new URL(request.url);
  const acPath = path.replace(/^\/ac\/?/, '');
  const acUrl = `${acBase}/${acPath}${url.search}`;

  const resp = await fetch(acUrl, {
    method: request.method,
    headers: {
      'Api-Token': token,
      'Content-Type': 'application/json',
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGoogleAds(request, env, path) {
  // Stub: Google Ads API proxy
  // Full implementation requires OAuth token refresh flow
  const clientId = env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_ADS_REFRESH_TOKEN;
  const devToken = env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!clientId || !refreshToken) {
    return jsonError('Google Ads credentials not configured', 500);
  }

  // Refresh access token
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!tokenResp.ok) {
    return jsonError('Google Ads token refresh failed', 502);
  }

  const { access_token } = await tokenResp.json();
  const url = new URL(request.url);
  const adsPath = path.replace(/^\/google-ads\/?/, '');

  // Proxy to Google Ads REST API
  const adsUrl = `https://googleads.googleapis.com/v23/customers/${env.GOOGLE_ADS_CUSTOMER_ID || '4135262293'}/${adsPath}${url.search}`;

  const resp = await fetch(adsUrl, {
    method: request.method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'developer-token': devToken || '',
      'Content-Type': 'application/json',
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGemini(request, env, path) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return jsonError('GEMINI_API_KEY not configured', 500);

  const url = new URL(request.url);
  const geminiPath = path.replace(/^\/gemini\/?/, '');
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${geminiPath}?key=${apiKey}${url.search ? '&' + url.search.slice(1) : ''}`;

  const resp = await fetch(geminiUrl, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleStub(source) {
  return new Response(JSON.stringify({
    error: `${source} integration not yet implemented`,
    status: 501,
    see: 'PHASE_2B_SALESFORCE.md',
  }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleHealth(env) {
  const checks = {};

  // AC health check
  try {
    if (env.AC_API_TOKEN) {
      const resp = await fetch('https://cliniconexmarketing.api-us1.com/api/3/users/me', {
        headers: { 'Api-Token': env.AC_API_TOKEN },
      });
      checks.activecampaign = { status: resp.ok ? 'connected' : 'failing', code: resp.status };
    } else {
      checks.activecampaign = { status: 'not_configured' };
    }
  } catch (e) {
    checks.activecampaign = { status: 'failing', error: e.message };
  }

  // Google Ads check
  checks.google_ads = {
    status: env.GOOGLE_ADS_CLIENT_ID ? 'configured' : 'not_configured',
  };

  // Gemini check
  checks.gemini = {
    status: env.GEMINI_API_KEY ? 'configured' : 'not_configured',
  };

  // Stubs
  checks.salesforce = { status: 'not_connected' };
  checks.jira = { status: 'not_connected' };

  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    sources: checks,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Main Router ─────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, env)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Origin check (skip for health endpoint)
    if (path !== '/health' && !isAllowedOrigin(origin, env)) {
      return jsonError('Origin not allowed', 403);
    }

    // Route to source handler
    let source = 'unknown';
    let response;

    try {
      if (path === '/health') {
        response = await handleHealth(env);
      } else if (path.startsWith('/ac/')) {
        source = 'ac';
        if (!checkRateLimit(source)) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders(origin), 'Retry-After': '1', 'Content-Type': 'application/json' },
          });
        }
        response = await handleAC(request, env, path);
      } else if (path.startsWith('/google-ads/')) {
        source = 'google-ads';
        if (!checkRateLimit(source)) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders(origin), 'Retry-After': '1', 'Content-Type': 'application/json' },
          });
        }
        response = await handleGoogleAds(request, env, path);
      } else if (path.startsWith('/gemini/')) {
        source = 'gemini';
        if (!checkRateLimit(source)) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders(origin), 'Retry-After': '1', 'Content-Type': 'application/json' },
          });
        }
        response = await handleGemini(request, env, path);
      } else if (path.startsWith('/salesforce/')) {
        response = handleStub('Salesforce');
      } else if (path.startsWith('/jira/')) {
        response = handleStub('JIRA');
      } else {
        response = jsonError('Unknown route', 404);
      }
    } catch (e) {
      response = jsonError(`Upstream error: ${e.message}`, 502);
    }

    // Attach CORS headers to response
    const headers = new Headers(response.headers);
    if (origin) {
      for (const [k, v] of Object.entries(corsHeaders(origin))) {
        headers.set(k, v);
      }
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
};
