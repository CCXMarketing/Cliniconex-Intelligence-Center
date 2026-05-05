// ── CIC Data Layer — Period-Aware Storage ───────────────────────
//
// Unified data access for config-driven tabs.
// Three-tier fallback: live fetcher → manual entry (Sheets) → manual entry (localStorage) → empty.
// All reads/writes are scoped to a calendar period derived from each KPI's cadence.
//
// Exports:
//   getValue(kpiId, options)       — current period value (or options.period)
//   setValue(kpiId, value, options) — write to current period (or options.period)
//   getValueHistory(kpiId, options) — last N periods, oldest first
//   registerFetcher(kpiId, fn)     — register a live data fetcher
//
// ── Period key formats ──────────────────────────────────────────
//   monthly:   YYYY-MM   (e.g., 2026-05)
//   quarterly: YYYY-QN   (e.g., 2026-Q2)
//   weekly:    YYYY-WNN  (e.g., 2026-W18)  — ISO 8601 week numbering
//
// ── Storage key format ──────────────────────────────────────────
//   cic_manual_<deptId>_<kpiSuffix>_<periodKey>
//   Example: cic_manual_customer_support_ticket_volume_trend_2026-05
//
// ── Adding a live fetcher ───────────────────────────────────────
//   import { registerFetcher } from './data-layer.js';
//   registerFetcher('customer_support__ticket_volume_trend', async (kpiId, opts) => {
//     const resp = await fetch('api/salesforce/tickets?period=' + opts.period);
//     const data = await resp.json();
//     return { value: data.count, meta: { period: data.period } };
//   });

import { catalog } from './catalog.js';
import { storage } from './storage.js';

// ── Period Helpers (private) ────────────────────────────────────
//
// computeCurrentPeriod(cadence)            → period key string for today
// computePeriodLabel(cadence, periodKey)    → human label ("May 2026")
// computePeriodLabelShort(cadence, periodKey) → compact label ("May 2026" / "W18 2026")
// previousPeriods(cadence, count)           → array of period keys ending at current, oldest first
// isoWeek(date)                            → { year, week } using ISO 8601, local time

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function computeCurrentPeriod(cadence) {
  const now = new Date();
  if (cadence === 'quarterly') {
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}-Q${q}`;
  }
  if (cadence === 'weekly') {
    const { year, week } = isoWeek(now);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  // monthly (default)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function computePeriodLabel(cadence, periodKey) {
  if (cadence === 'monthly' || (!cadence && /^\d{4}-\d{2}$/.test(periodKey))) {
    const [y, m] = periodKey.split('-');
    return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
  }
  if (cadence === 'quarterly' || (!cadence && /^\d{4}-Q\d$/.test(periodKey))) {
    const [y, q] = periodKey.split('-');
    return `${q} ${y}`;
  }
  if (cadence === 'weekly' || (!cadence && /^\d{4}-W\d{2}$/.test(periodKey))) {
    const [y, w] = periodKey.split('-');
    return `Week ${w.replace('W', '')}, ${y}`;
  }
  return periodKey;
}

function computePeriodLabelShort(cadence, periodKey) {
  if (cadence === 'monthly' || (!cadence && /^\d{4}-\d{2}$/.test(periodKey))) {
    const [y, m] = periodKey.split('-');
    return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
  }
  if (cadence === 'quarterly' || (!cadence && /^\d{4}-Q\d$/.test(periodKey))) {
    const [y, q] = periodKey.split('-');
    return `${q} ${y}`;
  }
  if (cadence === 'weekly' || (!cadence && /^\d{4}-W\d{2}$/.test(periodKey))) {
    const [y, w] = periodKey.split('-');
    return `W${w.replace('W', '')} ${y}`;
  }
  return periodKey;
}

function previousPeriods(cadence, count) {
  const now = new Date();
  const periods = [];

  if (cadence === 'quarterly') {
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentY = now.getFullYear();
    for (let i = count - 1; i >= 0; i--) {
      let q = currentQ - i;
      let y = currentY;
      while (q <= 0) { q += 4; y--; }
      periods.push(`${y}-Q${q}`);
    }
    return periods;
  }

  if (cadence === 'weekly') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
      const { year, week } = isoWeek(d);
      periods.push(`${year}-W${String(week).padStart(2, '0')}`);
    }
    return periods;
  }

  // monthly (default)
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
}

/** ISO 8601 week number using local time. */
function isoWeek(date) {
  // Build a UTC date from the local date components so DST doesn't shift the day
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO weeks start Monday. Set to nearest Thursday (current date + 4 − day-of-week,
  // where Monday=1 … Sunday=7).
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

// ── Legacy Migration ────────────────────────────────────────────
// Phase A stored values without a period suffix (e.g., cic_manual_customer_support_ticket_volume_trend).
// These are now ambiguous — delete them on first load. Ger confirmed no production data exists.
// Runs synchronously before any reads so legacy data can't satisfy a getValue call.

const PERIOD_SUFFIX_RE = /_\d{4}-(0[1-9]|1[0-2]|Q[1-4]|W(0[1-9]|[1-4]\d|5[0-3]))$/;
const STORAGE_PREFIX = 'cic_manual_';

(function migrateLegacyKeys() {
  let deleted = 0;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      if (!PERIOD_SUFFIX_RE.test(key)) {
        localStorage.removeItem(key);
        deleted++;
      }
    }
  } catch {
    // localStorage inaccessible — skip migration
  }
  if (deleted > 0) {
    console.info(`[CIC Data] Migrated legacy unscoped storage keys (deleted ${deleted} entries)`);
  }
})();

// ── Internal State ──────────────────────────────────────────────

const _fetchers = {};

// Sheets API cache: one fetch per department per session.
const _sheetsCache = {};
let _sheetsInfoLogged = false;

const DEFAULT_HISTORY_COUNTS = { monthly: 12, quarterly: 8, weekly: 13 };

// ── Value Extraction Helpers ────────────────────────────────────

/** Extract numeric value from a storage record or raw JSON-parsed value. */
function extractStoredValue(stored) {
  if (stored == null) return null;
  if (typeof stored === 'object' && stored !== null) {
    const v = stored.value;
    if (v == null || v === '') return null;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return isNaN(n) ? null : n;
  }
  // Raw value (e.g., user did localStorage.setItem(key, '189'))
  const n = typeof stored === 'number' ? stored : parseFloat(String(stored));
  return isNaN(n) ? null : n;
}

function extractTimestamp(stored) {
  if (stored != null && typeof stored === 'object') return stored.updated || null;
  return null;
}

// ── Public API ──────────────────────────────────────────────────

export function registerFetcher(kpiId, fetchFn) {
  _fetchers[kpiId] = fetchFn;
}

/**
 * Read the value for a KPI in a specific period.
 * @param {string} kpiId — canonical KPI ID from the catalog
 * @param {Object} [options]
 * @param {string} [options.period] — explicit period key; defaults to current period per cadence
 * @returns {{ value, source, period, periodLabel, timestamp, meta }}
 */
export async function getValue(kpiId, options = {}) {
  const kpiMeta = await catalog.getKpi(kpiId);
  if (!kpiMeta) {
    throw new Error(
      `[DataLayer] Unknown KPI: "${kpiId}" — not found in catalog. ` +
      `Check that the ID in your tab config matches config/kpis.yaml exactly.`
    );
  }

  const cadence = kpiMeta.cadence || 'monthly';
  const deptId = kpiMeta.department;
  const suffix = kpiId.startsWith(deptId + '__')
    ? kpiId.slice(deptId.length + 2)
    : kpiId;

  const periodKey = options.period || computeCurrentPeriod(cadence);
  const periodLabel = computePeriodLabel(cadence, periodKey);
  const storageKey = suffix + '_' + periodKey;

  // 1. Try live fetcher
  const fetcher = _fetchers[kpiId];
  if (fetcher) {
    try {
      const result = await fetcher(kpiId, { ...options, period: periodKey });
      if (result && result.value != null) {
        return {
          value: result.value,
          source: 'live',
          period: periodKey,
          periodLabel,
          timestamp: new Date().toISOString(),
          meta: result.meta || {},
        };
      }
    } catch (err) {
      console.warn(`[DataLayer] Live fetcher failed for ${kpiId}:`, err.message);
    }
  }

  // 2. Try manual entry from Google Sheets API (cached per department)
  const deptName = kpiMeta.departmentName;
  if (!(deptName in _sheetsCache)) {
    _sheetsCache[deptName] = await storage.readFromSheets(deptName);
  }
  const sheetEntries = _sheetsCache[deptName];
  const sheetEntry = sheetEntries.find(
    e => (e.kpi_id === suffix || e.kpi_id === kpiId) &&
         (!e.period || e.period === periodKey)
  );
  if (sheetEntry && sheetEntry.value != null && sheetEntry.value !== '') {
    return {
      value: parseFloat(sheetEntry.value),
      source: 'manual',
      period: periodKey,
      periodLabel,
      timestamp: sheetEntry.updated || sheetEntry.period || null,
      enteredBy: sheetEntry.updated_by || '',
    };
  }

  // 3. Try localStorage (period-scoped key)
  try {
    const local = await storage.get(deptId, storageKey);
    const val = extractStoredValue(local);
    if (val != null) {
      if (!_sheetsInfoLogged && sheetEntries.length === 0) {
        _sheetsInfoLogged = true;
        console.info('[CIC Data] Sheets persistence unavailable in this environment — using localStorage fallback');
      }
      return {
        value: val,
        source: 'manual',
        period: periodKey,
        periodLabel,
        timestamp: extractTimestamp(local),
        enteredBy: '',
      };
    }
  } catch {
    // localStorage unavailable
  }

  // 4. No data for this period
  return { value: null, source: 'none', period: periodKey, periodLabel };
}

/**
 * Write a value for a KPI in a specific period.
 * @param {string} kpiId
 * @param {number} value
 * @param {Object} [options]
 * @param {string} [options.period] — explicit period key; defaults to current period
 * @param {string} [options.updatedBy]
 */
export async function setValue(kpiId, value, options = {}) {
  const kpiMeta = await catalog.getKpi(kpiId);
  if (!kpiMeta) {
    throw new Error(
      `[DataLayer] Unknown KPI: "${kpiId}" — cannot save value for unknown KPI.`
    );
  }

  const cadence = kpiMeta.cadence || 'monthly';
  const deptId = kpiMeta.department;
  const suffix = kpiId.startsWith(deptId + '__')
    ? kpiId.slice(deptId.length + 2)
    : kpiId;

  const periodKey = options.period || computeCurrentPeriod(cadence);
  const storageKey = suffix + '_' + periodKey;

  const entry = {
    kpi_id: storageKey,
    kpi_name: kpiMeta.name,
    department: deptId,
    period: periodKey,
    value: value.toString(),
    updated_by: options.updatedBy || '',
  };

  const result = await storage.saveAndSync(entry);

  // Invalidate Sheets cache so subsequent reads hit fresh localStorage
  delete _sheetsCache[kpiMeta.departmentName];

  return result;
}

/**
 * Return the last N periods of data for a KPI, oldest first.
 * Periods with no data are included with value: null, source: 'none'.
 * @param {string} kpiId
 * @param {Object} [options]
 * @param {number} [options.periods] — how many periods (default: 12/8/13 by cadence)
 * @returns {Array<{ period, periodLabel, periodLabelShort, value, source, timestamp }>}
 */
export async function getValueHistory(kpiId, options = {}) {
  const kpiMeta = await catalog.getKpi(kpiId);
  if (!kpiMeta) {
    throw new Error(`[DataLayer] Unknown KPI: "${kpiId}"`);
  }

  const cadence = kpiMeta.cadence || 'monthly';
  const deptId = kpiMeta.department;
  const suffix = kpiId.startsWith(deptId + '__')
    ? kpiId.slice(deptId.length + 2)
    : kpiId;
  const count = options.periods || DEFAULT_HISTORY_COUNTS[cadence] || 12;

  // Single getAll call — reads all department entries from localStorage at once
  let allEntries = {};
  try {
    allEntries = await storage.getAll(deptId);
  } catch {
    // localStorage unavailable
  }

  const periods = previousPeriods(cadence, count);
  return periods.map(periodKey => {
    const storageKey = suffix + '_' + periodKey;
    const stored = allEntries[storageKey] || null;
    const val = extractStoredValue(stored);
    return {
      period: periodKey,
      periodLabel: computePeriodLabel(cadence, periodKey),
      periodLabelShort: computePeriodLabelShort(cadence, periodKey),
      value: val,
      source: val != null ? 'manual' : 'none',
      timestamp: extractTimestamp(stored),
    };
  });
}
