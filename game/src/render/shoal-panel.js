// The render panel for the Glass Shoal (?render=1): one slider per look parameter (shoal-look-data.js SHOAL_PARAMS),
// the presets, Copy JSON of the current look, Reset. A debug tool for the owner to tune the scene live; it never shows
// without ?render=1. Collapsible; Esc or a tap outside folds it (phones never get it open on its own).
import { SHOAL_PARAMS, SHOAL_PRESETS, SHOAL_DEFAULT, lookJson, clampParams } from './shoal-look-data.js';

const CSS = `
.shp { position: fixed; top: 12px; right: 12px; z-index: 60; width: min(320px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto;
  background: var(--ftf-panel-solid, #101f1a); color: var(--ftf-text, #eef0ea); border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); border-radius: 12px;
  font: 13px/1.35 var(--font-ui, system-ui, sans-serif); box-shadow: 0 8px 32px rgba(0,0,0,.55); }
.shp header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--ftf-line, rgba(197,164,105,.4)); }
.shp h2 { margin: 0; flex: 1; font: 600 20px var(--font-title, Georgia, serif); color: var(--ftf-gold-bright, #dcc08a); }
.shp[data-folded="1"] .body { display: none; }
.shp .body { padding: 8px 12px 12px; display: grid; gap: 6px; }
.shp label { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; }
.shp input[type=range] { grid-column: 1 / -1; width: 100%; accent-color: var(--ftf-gold, #c5a469); }
.shp output { font: 12px ui-monospace, monospace; color: var(--ftf-muted, #aab6b0); }
.shp select, .shp button { min-height: 32px; border-radius: 8px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); background: transparent; color: inherit; font: inherit; padding: 0 10px; cursor: pointer; }
.shp button.primary { background: var(--ftf-gold, #c5a469); color: #14110a; font-weight: 700; }
.shp .row { display: flex; gap: 6px; flex-wrap: wrap; }
.shp .fps { font: 12px ui-monospace, monospace; color: var(--ftf-muted, #aab6b0); }
`;

/**
 * @param {{look: {params: object, set(p: object): void, quality: object}, doc?: Document, onFps?: () => number}} o
 */
export function createShoalPanel({ look, doc = globalThis.document, fps = () => 0 }) {
  if (!doc.getElementById('shp-css')) { const s = doc.createElement('style'); s.id = 'shp-css'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = el('section', 'shp'); box.setAttribute('aria-label', 'Render panel');
  const head = el('header'), fold = el('button', null, '–'); fold.type = 'button'; fold.setAttribute('aria-label', 'Fold');
  head.append(el('h2', null, 'Render'), fold);
  const body = el('div', 'body');
  const preset = el('select'); preset.setAttribute('aria-label', 'Preset');
  for (const k of Object.keys(SHOAL_PRESETS)) { const o = el('option', null, k); o.value = k; preset.append(o); }
  const rows = {};
  for (const p of SHOAL_PARAMS) {
    const l = el('label'), r = el('input'), out = el('output');
    r.type = 'range'; r.min = p.min; r.max = p.max; r.step = p.step; r.dataset.key = p.key;
    r.addEventListener('input', () => { look.set({ [p.key]: Number(r.value) }); paint(); });
    l.append(el('span', null, p.label), out, r); rows[p.key] = { r, out }; body.append(l);
  }
  const copy = el('button', 'primary', 'Copy JSON'), reset = el('button', null, 'Reset'), info = el('div', 'fps'); copy.type = reset.type = 'button';
  const btns = el('div', 'row'); btns.append(copy, reset);
  body.prepend(preset); body.append(btns, info);
  box.append(head, body); doc.body.append(box);
  preset.addEventListener('change', () => { look.set(SHOAL_PRESETS[preset.value]); paint(); });
  reset.addEventListener('click', () => { look.set(SHOAL_DEFAULT); preset.value = 'lowSun'; paint(); });
  copy.addEventListener('click', async () => {
    const text = lookJson(look.params);
    try { await globalThis.navigator.clipboard.writeText(text); copy.textContent = 'Copied'; } catch { copy.textContent = 'See console'; globalThis.console.log(text); }
    setTimeout(() => { copy.textContent = 'Copy JSON'; }, 1400);
  });
  const setFold = (on) => { box.dataset.folded = on ? '1' : '0'; fold.textContent = on ? '+' : '–'; };
  fold.addEventListener('click', () => setFold(box.dataset.folded !== '1'));
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') setFold(true); });
  doc.addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) setFold(true); }, true);   // a tap outside folds it
  const coarse = (() => { try { return globalThis.matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  setFold(coarse);                                                         // phones: folded until asked
  function paint() {
    const P = clampParams(look.params);
    for (const p of SHOAL_PARAMS) { const { r, out } = rows[p.key]; r.value = P[p.key]; out.textContent = (+P[p.key]).toFixed(p.step < 0.01 ? 4 : p.step < 1 ? 2 : 0) + (p.unit || ''); }
    const q = look.quality; info.textContent = `${Math.round(fps())} fps · reflector ${q.reflector ? 'planar' : 'static'} · cascades ${q.cascades} · bloom ${q.bloom ? 'on' : 'off'} · rays ${q.rays ? 'on' : 'off'}`;
  }
  paint(); setInterval(() => { const q = look.quality; info.textContent = `${Math.round(fps())} fps · reflector ${q.reflector ? 'planar' : 'static'} · cascades ${q.cascades} · bloom ${q.bloom ? 'on' : 'off'} · rays ${q.rays ? 'on' : 'off'}`; }, 1000);
  return { el: box, paint, fold: setFold, dispose() { box.remove(); } };
}
