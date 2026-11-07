// Safe key-value storage: localStorage when it works, an in-memory map otherwise.
// Every access is wrapped in try/catch (private mode, blocked site data, quota).

/** A Storage-like object backed by a Map (tests, or when localStorage is unavailable). */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

/** @param {Storage|null|undefined} backend  undefined → globalThis.localStorage */
export function createSafeStorage(backend) {
  const mem = new Map();
  let store = null;
  try {
    store = backend !== undefined ? backend : globalThis.localStorage;
    if (store) { const probe = '__ftf_probe__'; store.setItem(probe, '1'); store.removeItem(probe); }
  } catch { store = null; }
  const api = {
    /** True when values survive a reload. */
    get persistent() { return !!store; },
    getItem(k) {
      try { if (store) { const v = store.getItem(k); if (v != null) return v; } } catch { /* fall through */ }
      return mem.has(k) ? mem.get(k) : null;
    },
    /** Returns true when the value was persisted, false when only kept in memory. */
    setItem(k, v) {
      mem.set(k, String(v));
      try { if (store) { store.setItem(k, String(v)); return true; } } catch { /* memory only */ }
      return false;
    },
    removeItem(k) { mem.delete(k); try { if (store) store.removeItem(k); } catch { /* ignore */ } },
    getJSON(k, fallback = null) {
      const raw = api.getItem(k);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    setJSON(k, v) { return api.setItem(k, JSON.stringify(v)); },
  };
  return api;
}

export const STORAGE_KEYS = {
  prefs: 'ftf.prefs.v1',
  guest: 'ftf.guest.v1',
  entitlement: 'ftf.entitlement.v1',
  flow: 'ftf.flow.v1',
  hologram: 'ftf.hologram.v1',
  tournament: 'ftf.tournament.v1',
};
