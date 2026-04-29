// ── Forecast Config — mutable BASELINE + localStorage persistence ────────────

const KEYS = {
  target:       'cic_forecast_target',
  currentMonth: 'cic_forecast_currentMonth',
  mode:         'cic_forecast_mode',
  levers:       'cic_forecast_levers',
  channels:     'cic_forecast_channels',
  baseline:     'cic_forecast_baseline',
  newMRR:       'cic_forecast_newMRR',
};

export const DEFAULTS = {
  target:       9_600_000,
  currentMonth: 'auto',
  mode:         'rolling',
  levers:       { mrr: 0, conv: 0, cpl: 0 },
  baseline: {
    avgMRR:        447.64,
    cpl:           360.53,
    convRate:      0.1078,
    cac:         3345.70,
    ltv:        29000,
    mrrMultiplier: 6.67,
  },
  channels: [
    { name: 'Paid Search',        alloc: 30, cpl: 320, convRate: 12 },
    { name: 'Paid Social',        alloc: 25, cpl: 480, convRate:  9 },
    { name: 'Content / SEO',      alloc: 15, cpl: 180, convRate: 14 },
    { name: 'Events / Webinars',  alloc: 15, cpl: 550, convRate: 18 },
    { name: 'Outbound / SDR',     alloc: 10, cpl: 420, convRate:  8 },
    { name: 'Referral / Partner', alloc:  5, cpl: 120, convRate: 25 },
  ],
  newMRR: {},
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadConfig() {
  return {
    target:       load(KEYS.target, DEFAULTS.target),
    currentMonth: load(KEYS.currentMonth, DEFAULTS.currentMonth),
    mode:         load(KEYS.mode, DEFAULTS.mode),
    levers:       load(KEYS.levers, { ...DEFAULTS.levers }),
    baseline:     load(KEYS.baseline, { ...DEFAULTS.baseline }),
    year:         new Date().getFullYear(),
  };
}

export function saveConfig(partial) {
  if (partial.target !== undefined)       save(KEYS.target, partial.target);
  if (partial.currentMonth !== undefined) save(KEYS.currentMonth, partial.currentMonth);
  if (partial.mode !== undefined)         save(KEYS.mode, partial.mode);
  if (partial.levers !== undefined)       save(KEYS.levers, partial.levers);
  if (partial.baseline !== undefined)     save(KEYS.baseline, partial.baseline);
}

export function loadChannels() {
  return load(KEYS.channels, DEFAULTS.channels.map(c => ({ ...c })));
}

export function saveChannels(channels) {
  save(KEYS.channels, channels);
}

export function loadNewMRR() {
  return load(KEYS.newMRR, { ...DEFAULTS.newMRR });
}

export function saveNewMRR(newMRR) {
  save(KEYS.newMRR, newMRR);
}
