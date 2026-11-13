// Sprint event bus and telemetry sink (sprint plan 3.2, 3.7). emit/on/once plus a tiny keyed store. Every emit is
// recorded in window.__ftfTelemetry (a ring of 500) for tests and the usability proxy; with ?debug=1 it is also
// printed. Nothing leaves the browser.
const RING = 500;
const handlers = new Map();
const values = new Map(), watchers = new Map();
const g = typeof globalThis !== 'undefined' ? globalThis : {};
const debug = (() => { try { return new URLSearchParams(g.location && g.location.search).get('debug') === '1'; } catch { return false; } })();

function record(name, payload) {
  const ring = g.__ftfTelemetry || (g.__ftfTelemetry = []);
  ring.push({ name, t: typeof performance !== 'undefined' ? performance.now() : Date.now(), payload });
  if (ring.length > RING) ring.splice(0, ring.length - RING);
  if (debug && g.console) g.console.log('[bus]', name, payload);
}

/** Emits `name`; a throwing handler is logged and never stops the others. */
export function emit(name, payload = {}) {
  record(name, payload);
  for (const key of [name, '*']) for (const fn of [...(handlers.get(key) || [])]) { try { fn(payload, name); } catch (e) { if (g.console) g.console.warn('[bus]', name, e); } }
}
/** Subscribes; returns `off`. `name` '*' receives every event. */
export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => { const s = handlers.get(name); if (s) s.delete(fn); };
}
export function once(name, fn) { const off = on(name, (p, n) => { off(); fn(p, n); }); return off; }

/** A keyed store: state.set(k, v), state.get(k), state.sub(k, fn) -> unsub (fn(v, k) on every change). */
export const state = {
  get: (k) => values.get(k),
  set(k, v) {
    if (values.get(k) === v) return;
    values.set(k, v);
    for (const fn of [...(watchers.get(k) || [])]) { try { fn(v, k); } catch (e) { if (g.console) g.console.warn('[state]', k, e); } }
  },
  sub(k, fn) { if (!watchers.has(k)) watchers.set(k, new Set()); watchers.get(k).add(fn); return () => watchers.get(k).delete(fn); },
};

/** Tests only: forget every handler, value and telemetry entry. */
export function _reset() { handlers.clear(); values.clear(); watchers.clear(); if (g.__ftfTelemetry) g.__ftfTelemetry.length = 0; }

export const bus = { emit, on, once, state };
