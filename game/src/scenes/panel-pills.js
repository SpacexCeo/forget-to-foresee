// Collapsible town panels (owner, 11.11): any non-modal talk panel (a townsperson's hire card or dialogue, the
// Exchange board with the trade log, the Inn's open trades, the notice board, a quest talk) can be minimised with
// the chevron at its top-right corner. A minimised panel becomes a small pill at the right edge with its name and
// live progress ("Innkeeper · 3/5 · 6 s · +0.06"); click, tap or O expands it again. Several pills stack. The set of
// pills is remembered in storage (quest talks excepted). 40 px targets; reduced motion: no transitions.
export const PILLS_KEY = 'ftf.pills.v1';

const CSS = `
.ftf-pills { position: fixed; right: calc(12px + env(safe-area-inset-right, 0px)); top: 120px; z-index: 6; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
.ftf-pill { pointer-events: auto; min-height: 40px; max-width: min(70vw, 340px); padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(233, 180, 76, .55); background: rgba(20, 24, 26, .86); color: #f3ead6; font: 600 14px/1.2 system-ui, sans-serif; cursor: pointer; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 2px 10px rgba(0,0,0,.35); transition: transform .15s ease, opacity .15s ease; }
.ftf-pill:hover { transform: translateX(-3px); }
.ftf-pill:focus-visible { outline: 2px solid #e9b44c; outline-offset: 2px; }
.ftf-panel-min { position: absolute; top: 6px; right: 6px; width: 40px; height: 40px; min-height: 40px; padding: 0; border-radius: 10px; border: 0; background: rgba(233, 180, 76, .14); color: #f3ead6; font: 700 18px/1 system-ui, sans-serif; cursor: pointer; }
.ftf-panel-min:focus-visible { outline: 2px solid #e9b44c; }
@media (prefers-reduced-motion: reduce) { .ftf-pill { transition: none; } .ftf-pill:hover { transform: none; } }
html[data-motion="reduce"] .ftf-pill { transition: none; }
`;

/** Panel key <-> parts: 'folk:innkeeper', 'spot:exchange', 'quest:baker'. */
export const pillKey = (kind, id) => `${kind}:${id}`;
export const parsePillKey = (key) => { const i = String(key).indexOf(':'); return i < 0 ? null : { kind: key.slice(0, i), id: key.slice(i + 1) }; };

/**
 * @param {{doc?: Document, storage?: object, label: (key: string) => string, onExpand: (key: string) => void, expandLabel?: (text: string) => string}} o
 */
export function createPillStack({ doc = globalThis.document, storage = null, label, onExpand, expandLabel = (s) => s }) {
  if (!(doc.getElementById && doc.getElementById('ftf-pills-style'))) { const st = doc.createElement('style'); st.id = 'ftf-pills-style'; st.textContent = CSS; doc.head.append(st); }
  const root = doc.createElement('div'); root.className = 'ftf-pills'; root.setAttribute('role', 'region');
  doc.body.append(root);
  const keys = [];
  try { const raw = storage && storage.getItem(PILLS_KEY); for (const k of raw ? JSON.parse(raw) : []) if (typeof k === 'string' && parsePillKey(k) && !keys.includes(k)) keys.push(k); } catch { /* none */ }
  const save = () => { try { if (storage) storage.setItem(PILLS_KEY, JSON.stringify(keys.filter((k) => !k.startsWith('quest:')))); } catch { /* memory only */ } };
  const buttons = new Map();
  function render() {
    for (const [k, b] of buttons) if (!keys.includes(k)) { b.remove(); buttons.delete(k); }
    for (const k of keys) {
      let b = buttons.get(k);
      if (!b) {
        b = doc.createElement('button'); b.type = 'button'; b.className = 'ftf-pill'; b.dataset.pill = k;
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', () => api.expand(k));
        buttons.set(k, b); root.append(b);
      }
      const text = label(k);
      if (b.textContent !== text) { b.textContent = text; b.setAttribute('aria-label', expandLabel(text)); }
    }
    root.hidden = !keys.length;
  }
  const api = {
    get keys() { return keys.slice(); },
    has: (k) => keys.includes(k),
    add(k) { if (!keys.includes(k)) { keys.push(k); save(); } render(); },
    remove(k) { const i = keys.indexOf(k); if (i >= 0) { keys.splice(i, 1); save(); } render(); },
    expand(k) { if (!keys.includes(k)) return false; api.remove(k); onExpand(k); return true; },
    /** O: expands the newest pill. */
    expandLatest() { return keys.length ? api.expand(keys[keys.length - 1]) : false; },
    refresh: render,
    setVisible(on) { root.style.display = on ? '' : 'none'; },
    dispose() { root.remove(); },
    element: root,
  };
  render();
  return api;
}
