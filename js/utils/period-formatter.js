/**
 * Period Label Formatter
 * ======================
 * Formats date ranges as human-readable labels for column headers and comparison rows.
 *
 * Used by: js/modules/marketing.js → _renderACFunnel() comparison block
 * Test script: js/data/__tests__/test-period-formatter.js
 *
 * Formatting rules:
 *   - Preset ranges use human names: "LAST MONTH", "LAST 90 DAYS", "YTD 2026"
 *   - Single calendar month: "MAR 2026"
 *   - Multiple months same year: "JAN-MAR 2026"
 *   - Cross-year: "OCT 2025 - MAR 2026"
 *   - Single quarter: "Q1 2026"
 *   - Single year: "2025"
 *   - Short spans (<=14 days): "MAR 1 - MAR 14"
 *   - Short variant truncates to <=12 chars where possible
 */

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                     'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

const PRESET_LABELS = {
  'last-month':     'LAST MONTH',
  'last-year':      'LAST YEAR',
  'last-30-days':   'LAST 30 DAYS',
  'last-90-days':   'LAST 90 DAYS',
  'last-6-months':  'LAST 6 MONTHS',
  'last-12-months': 'LAST 12 MONTHS',
};

const PRESET_LABELS_TITLE = {
  'last-month':     'Last Month',
  'last-year':      'Last Year',
  'last-30-days':   'Last 30 Days',
  'last-90-days':   'Last 90 Days',
  'last-6-months':  'Last 6 Months',
  'last-12-months': 'Last 12 Months',
};

// Map dropdown values (30, 90, 180, 365, ytd) to preset keys
const DROPDOWN_TO_PRESET = {
  '30':  'last-30-days',
  '90':  'last-90-days',
  '180': 'last-6-months',
  '365': 'last-12-months',
};

function parseDate(s) {
  // Parse YYYY-MM-DD without timezone issues
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function isSameMonth(start, end) {
  return start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === 1 &&
    end.getDate() === lastDayOfMonth(end.getFullYear(), end.getMonth());
}

function isQuarter(start, end) {
  const qStarts = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
  if (!qStarts.includes(start.getMonth())) return false;
  if (start.getDate() !== 1) return false;
  const expectedEndMonth = start.getMonth() + 2;
  if (end.getMonth() !== expectedEndMonth) return false;
  if (end.getFullYear() !== start.getFullYear()) return false;
  if (end.getDate() !== lastDayOfMonth(end.getFullYear(), end.getMonth())) return false;
  return true;
}

function isFullYear(start, end) {
  return start.getMonth() === 0 && start.getDate() === 1 &&
    end.getMonth() === 11 && end.getDate() === 31 &&
    start.getFullYear() === end.getFullYear();
}

function quarterNumber(month) {
  return Math.floor(month / 3) + 1;
}

function daySpan(start, end) {
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Format a date range as a human-readable label suitable for column headers.
 * @param {Object} range - { start: ISO8601, end: ISO8601, preset?: string }
 * @returns {string} Uppercase label
 */
export function formatPeriodLabel(range) {
  // Handle preset ranges
  const presetKey = range.preset && PRESET_LABELS[range.preset]
    ? range.preset
    : range.preset && DROPDOWN_TO_PRESET[range.preset]
      ? DROPDOWN_TO_PRESET[range.preset]
      : null;

  if (range.preset === 'ytd') {
    return `YTD ${new Date().getFullYear()}`;
  }

  if (presetKey && PRESET_LABELS[presetKey]) {
    return PRESET_LABELS[presetKey];
  }

  // Custom range — derive from dates
  if (!range.start || !range.end) return 'CUSTOM';

  const start = parseDate(range.start);
  const end = parseDate(range.end);
  const sameYear = start.getFullYear() === end.getFullYear();

  // Single year
  if (isFullYear(start, end)) {
    return `${start.getFullYear()}`;
  }

  // Single quarter
  if (isQuarter(start, end)) {
    return `Q${quarterNumber(start.getMonth())} ${start.getFullYear()}`;
  }

  // Single calendar month
  if (isSameMonth(start, end)) {
    return `${MONTH_SHORT[start.getMonth()]} ${start.getFullYear()}`;
  }

  // Short span (<=14 days)
  if (daySpan(start, end) <= 14) {
    if (sameYear) {
      return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} - ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;
    }
    return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} ${start.getFullYear()} - ${MONTH_SHORT[end.getMonth()]} ${end.getDate()} ${end.getFullYear()}`;
  }

  // Multiple months, same year
  if (sameYear) {
    return `${MONTH_SHORT[start.getMonth()]}-${MONTH_SHORT[end.getMonth()]} ${start.getFullYear()}`;
  }

  // Cross-year
  return `${MONTH_SHORT[start.getMonth()]} ${start.getFullYear()} - ${MONTH_SHORT[end.getMonth()]} ${end.getFullYear()}`;
}

/**
 * Returns short label suitable for narrow column headers (<=12 chars).
 * @param {Object} range - { start: ISO8601, end: ISO8601, preset?: string }
 * @returns {string} Uppercase short label
 */
export function formatPeriodLabelShort(range) {
  const full = formatPeriodLabel(range);

  // If already fits, use as-is
  if (full.length <= 12) return full;

  // For presets, abbreviate
  const SHORT_PRESETS = {
    'LAST 30 DAYS':   'LAST 30D',
    'LAST 90 DAYS':   'LAST 90D',
    'LAST 6 MONTHS':  'LAST 6M',
    'LAST 12 MONTHS': 'LAST 12M',
  };
  if (SHORT_PRESETS[full]) return SHORT_PRESETS[full];

  // Custom: try dropping year for same-year multi-month
  if (!range.start || !range.end) return full.slice(0, 12);

  const start = parseDate(range.start);
  const end = parseDate(range.end);
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameYear && full.includes('-') && !full.includes(' - ')) {
    // "JAN-MAR 2026" → "JAN-MAR" (header context provides year)
    const parts = full.split(' ');
    if (parts.length === 2) return parts[0];
  }

  // Cross-year: use abbreviated year format
  if (!sameYear) {
    const sy = String(start.getFullYear()).slice(2);
    const ey = String(end.getFullYear()).slice(2);
    return `${MONTH_SHORT[start.getMonth()]} '${sy} - ${MONTH_SHORT[end.getMonth()]} '${ey}`;
  }

  return full.slice(0, 12);
}

/**
 * Returns title-case label suitable for section headers.
 * Example: "March 2026", "Last 12 Months", "Year-to-Date 2026"
 * @param {Object} range - { start: ISO8601, end: ISO8601, preset?: string }
 * @returns {string} Title-case label
 */
export function formatPeriodLabelTitle(range) {
  const presetKey = range.preset && PRESET_LABELS_TITLE[range.preset]
    ? range.preset
    : range.preset && DROPDOWN_TO_PRESET[range.preset]
      ? DROPDOWN_TO_PRESET[range.preset]
      : null;

  if (range.preset === 'ytd') {
    return `Year-to-Date ${new Date().getFullYear()}`;
  }

  if (presetKey && PRESET_LABELS_TITLE[presetKey]) {
    return PRESET_LABELS_TITLE[presetKey];
  }

  if (!range.start || !range.end) return 'Custom Range';

  const start = parseDate(range.start);
  const end = parseDate(range.end);
  const sameYear = start.getFullYear() === end.getFullYear();

  if (isFullYear(start, end)) return `${start.getFullYear()}`;

  if (isQuarter(start, end)) return `Q${quarterNumber(start.getMonth())} ${start.getFullYear()}`;

  if (isSameMonth(start, end)) return `${MONTH_FULL[start.getMonth()]} ${start.getFullYear()}`;

  if (daySpan(start, end) <= 14) {
    if (sameYear && start.getMonth() === end.getMonth()) {
      return `${MONTH_FULL[start.getMonth()]} ${start.getDate()} \u2013 ${end.getDate()}, ${start.getFullYear()}`;
    }
    if (sameYear) {
      return `${MONTH_FULL[start.getMonth()]} ${start.getDate()} \u2013 ${MONTH_FULL[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${MONTH_FULL[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} \u2013 ${MONTH_FULL[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }

  if (sameYear) {
    return `${MONTH_FULL[start.getMonth()]} \u2013 ${MONTH_FULL[end.getMonth()]} ${start.getFullYear()}`;
  }

  return `${MONTH_FULL[start.getMonth()]} ${start.getFullYear()} \u2013 ${MONTH_FULL[end.getMonth()]} ${end.getFullYear()}`;
}
