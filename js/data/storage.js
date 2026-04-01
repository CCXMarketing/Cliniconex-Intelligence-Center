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

  // Phase 2 stub — replace body with Google Sheets API write
  async syncToSheets(department, key, value) {
    console.log('[CIC Storage — Phase 2] syncToSheets not yet implemented');
    console.log('Would write:', { department, key, value });
    return false;
  }
};
