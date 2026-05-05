// Tab Config Loader — fetches tab configuration JSON files.
// Mirrors the catalog.js pattern: YAML is source of truth, JSON is loaded at runtime.
// Path pattern: config/tabs/<tab-name>.json

export async function loadTabConfig(tabName) {
  const resp = await fetch(`config/tabs/${tabName}.json`);
  if (!resp.ok) {
    throw new Error(`[TabConfig] Failed to load config for "${tabName}" (HTTP ${resp.status})`);
  }
  return resp.json();
}
