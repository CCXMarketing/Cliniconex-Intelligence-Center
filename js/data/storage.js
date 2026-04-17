const STORAGE_KEY_PREFIX = 'cic_manual_';

export const storage = {
  async get(department, key) {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${department}_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[CIC Storage] get failed:', e);
      return null;
    }
  },

  async set(department, key, value) {
    try {
      const record = {
        value,
        updated: new Date().toISOString(),
        department,
        key
      };
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${department}_${key}`,
        JSON.stringify(record)
      );
      return record;
    } catch (e) {
      console.warn('[CIC Storage] set failed:', e);
      return null;
    }
  },

  async getAll(department) {
    const result = {};
    const prefix = `${STORAGE_KEY_PREFIX}${department}_`;
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(prefix)) {
          const field = k.replace(prefix, '');
          result[field] = JSON.parse(localStorage.getItem(k));
        }
      }
    } catch (e) {
      console.warn('[CIC Storage] getAll failed:', e);
    }
    return result;
  },

  async clearDepartment(department) {
    const prefix = `${STORAGE_KEY_PREFIX}${department}_`;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  },

  async syncToSheets(entry) {
    try {
      const resp = await fetch('/api/manual-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      return data.written > 0;
    } catch (e) {
      console.warn('[CIC Storage] syncToSheets failed:', e);
      return false;
    }
  },

  async readFromSheets(department, period) {
    try {
      const params = new URLSearchParams();
      if (department) params.set('department', department);
      if (period) params.set('period', period);
      const resp = await fetch(`/api/manual-entries?${params}`);
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      return data.entries || [];
    } catch (e) {
      console.warn('[CIC Storage] readFromSheets failed:', e);
      return [];
    }
  },

  async saveAndSync(entry) {
    await this.set(entry.department, entry.kpi_id, entry.value);
    const synced = await this.syncToSheets(entry);
    return { local: true, synced };
  }
};
