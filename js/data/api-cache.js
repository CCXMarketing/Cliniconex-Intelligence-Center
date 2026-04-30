// ── API Response Cache ──────────────────────────────────────────
// localStorage cache with TTL for Worker API responses.
// Default 5-minute TTL. Force sync bypasses cache.
// Cache version key bumps invalidate all entries.

const CACHE_VERSION = 1;
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const PREFIX = 'cic_cache_';

function cacheKey(source, path, params) {
  const paramStr = params ? JSON.stringify(params) : '';
  return `${PREFIX}${source}_${path}_${paramStr}_v${CACHE_VERSION}`;
}

export function getCached(source, path, params) {
  try {
    const key = cacheKey(source, path, params);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > (entry.ttl || DEFAULT_TTL)) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch { return null; }
}

export function setCache(source, path, params, data, ttl) {
  try {
    const key = cacheKey(source, path, params);
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
      ttl: ttl || DEFAULT_TTL,
    }));
  } catch {}
}

export function clearSourceCache(source) {
  const prefix = `${PREFIX}${source}_`;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
}

export function clearAllCache() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
