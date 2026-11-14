// Dynamic import retry (sprint plan 8.3): a deploy must never leave "Something went wrong while loading". A chunk that
// fails to load is retried with backoff; a failed dynamic import can stay cached for the same URL, so the last resort
// is ONE guarded page reload with a cache-busting query (at most one per 5 minutes, sessionStorage ftf.reload.v1).
// When that reload was already used, a non-blocking banner offers Reload and the game keeps running without the module.
export const CHUNK_ERROR = /dynamically imported module|Failed to fetch|Loading chunk|Importing a module script failed|error loading dynamically/i;
export const RELOAD_KEY = 'ftf.reload.v1';
export const RELOAD_WINDOW_MS = 5 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pure: may we reload now? (the guard) */
export function canReload(store, now = Date.now()) {
  try { const v = Number(store && store.getItem(RELOAD_KEY)); return !(v && now - v < RELOAD_WINDOW_MS); } catch { return true; }
}

function banner(doc, text, withButton) {
  if (!doc || !doc.body) return null;
  let b = doc.getElementById && doc.getElementById('ftf-update-banner');
  if (!b) { b = doc.createElement('div'); b.id = 'ftf-update-banner'; b.setAttribute('role', 'status'); doc.body.append(b); }
  b.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:80;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 16px;border-radius:10px;background:#0e1018;border:1px solid #f6c860;color:#eef0f6;font:600 14px/1.3 system-ui,sans-serif;display:flex;gap:12px;align-items:center';
  b.textContent = text;
  if (withButton) { const r = doc.createElement('button'); r.type = 'button'; r.textContent = 'Reload'; r.style.cssText = 'min-height:36px;padding:0 14px;border-radius:8px;border:0;background:#f6c860;color:#1b1608;font-weight:700;cursor:pointer'; r.addEventListener('click', () => doc.defaultView.location.reload()); b.append(r); }
  return b;
}

/** The guarded reload (also used by the vite:preloadError handler). Returns true when it reloads. */
export function guardedReload({ win = globalThis.window, store = (() => { try { return globalThis.sessionStorage; } catch { return null; } })(), now = Date.now(), delayMs = 1200 } = {}) {
  const doc = win && win.document;
  if (!canReload(store, now)) { banner(doc, 'Some parts could not load. Check your connection and', true); return false; }
  try { if (store) store.setItem(RELOAD_KEY, String(now)); } catch { /* blocked storage: reload anyway, once */ }
  banner(doc, 'A new version is available. Reloading…', false);
  try { win.__ftfReloadPending = true; } catch { /* */ }
  setTimeout(() => { try { const u = new URL(win.location.href); u.searchParams.set('v', String(now)); win.location.replace(u.toString()); } catch { win.location.reload(); } }, delayMs);
  return true;
}

/**
 * retryImport(fn, {retries: 3, delaysMs: [300, 900, 2000]}): retries chunk-load failures; any other error rejects at
 * once. After the last retry it asks for the guarded reload and rejects (the caller skips the module).
 */
export async function retryImport(fn, { retries = 3, delaysMs = [300, 900, 2000], reload = guardedReload, wait = sleep } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!CHUNK_ERROR.test(String(e && e.message || e))) throw e;
      if (i < retries) await wait(delaysMs[Math.min(i, delaysMs.length - 1)]);
    }
  }
  try { reload(); } catch { /* the banner is best effort */ }
  throw last;
}

/**
 * The boot's last catch (main.js): a chunk that failed to load (a Pages redeploy swapped the hashed chunks) gets ONE
 * guarded page reload before the "Something went wrong" screen; the sessionStorage guard (canReload) means it never
 * loops. Returns 'reload' (a reload is scheduled or already pending: keep the loading screen) or 'fail' (show it).
 */
export function bootFailure(err, { win = globalThis.window, reload = guardedReload, store, now } = {}) {
  if (!CHUNK_ERROR.test(String((err && err.message) || err))) return 'fail';
  if (win && win.__ftfReloadPending) return 'reload';
  try { return reload({ win, store, now }) ? 'reload' : 'fail'; } catch { return 'fail'; } // undefined -> guardedReload's defaults
}

/** Installs the vite:preloadError handler once (main.js). */
export function installPreloadGuard(win = globalThis.window) {
  if (!win || win.__ftfPreloadGuard) return;
  win.__ftfPreloadGuard = true;
  win.addEventListener('vite:preloadError', (e) => { if (e && e.preventDefault) e.preventDefault(); guardedReload({ win }); });
}
