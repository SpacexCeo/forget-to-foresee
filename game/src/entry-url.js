// One entry (owner, 12.11): there is no separate jury path any more. The default link opens the full game with the
// Expedition on; `?demo=judge` is a harmless alias of the default. This module runs first (main.js imports it before
// anything reads location.search) and drops `demo=judge` from the address, so no module can take a judge branch.
/** The entry's search string with the jury alias removed (pure). */
export function normalizeEntry(search = '') {
  const q = new URLSearchParams(search);
  if (q.get('demo') !== 'judge') return { search: search, changed: false };
  q.delete('demo');
  const s = q.toString();
  return { search: s ? '?' + s : '', changed: true };
}

try {
  if (typeof location !== 'undefined' && typeof history !== 'undefined' && history.replaceState) {
    const n = normalizeEntry(location.search);
    if (n.changed) history.replaceState(history.state, '', location.pathname + n.search + location.hash);
  }
} catch { /* no history API: the page still works, the alias only skips the rewrite */ }
