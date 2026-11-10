// The hand-drawn progress bar and the loading log shared by the loading screen (#boot) and the altar transition
// cover (docs/first-seconds.md). The bar is a sprite atlas rendered in Blender (art/ui/loading_bar/build_bar.py):
// rows are progress steps, columns the same drawing redrawn by another hand, so the row follows real progress and
// cycling the column gives the line boil of pencil animation. Under reduced motion the column holds still.
// The log shows what is loading right now: the last three lines, older ones fading upward.
import { isReduced } from './motion/index.js';

/** Must match ATLAS in art/ui/loading_bar/build_bar.py. */
export const INK_ATLAS = Object.freeze({ steps: 25, boil: 3, cell: Object.freeze([448, 64]), url: 'assets/ui/loading_bar.webp', boilMs: 190 });
export const LOG_LINES = 3;

/** English lines used before the locale chunk is in (the same text as the `loading.log.*` keys of play/locales/en.js). */
export const LOG_EN = Object.freeze({
  'loading.log.code': 'Game code…', 'loading.log.terrain': 'Town terrain…', 'loading.log.houses': 'Houses and streets…',
  'loading.log.shrine': 'Shrine…', 'loading.log.altar': 'Tournament altar…', 'loading.log.sky': 'Sky islands…',
  'loading.log.iris': 'Iris…', 'loading.log.shaders': 'Warming shaders…', 'loading.log.island': 'Archipelago…',
  'loading.log.shells': 'Shells…', 'loading.log.camps': 'Camps and bridges…', 'loading.log.ready': 'Ready',
});

/** The atlas row for a progress 0..1 (pure). */
export function inkRow(p, steps = INK_ATLAS.steps) { return Math.max(0, Math.min(steps - 1, Math.round((Number(p) || 0) * (steps - 1)))); }

/** Which log line an asset belongs to (pure). */
export function logKeyFor(name) {
  const n = String(name || '');
  if (n === 'town_terrain') return 'loading.log.terrain';
  if (n === 'town_temple') return 'loading.log.shrine';
  if (n === 'town_altar') return 'loading.log.altar';
  if (n === 'town_sky') return 'loading.log.sky';
  if (n.startsWith('town_')) return 'loading.log.houses';
  if (/iris/.test(n)) return 'loading.log.iris';
  if (/shell/.test(n)) return 'loading.log.shells';
  if (/camp|bridge|tent/.test(n)) return 'loading.log.camps';
  return 'loading.log.island';
}

/**
 * What is happening now, from the streamer's stats: one key per asset in flight, shaders when something is warming.
 * @param {{list: {name: string, state: string, priority: number}[]}} stats @param {(row: object) => boolean} [wanted]
 * @returns {string[]} keys, most important first, no duplicates
 */
export function logKeysFromStats(stats, wanted = (a) => a.priority >= 0) {
  const out = [];
  let warming = false;
  for (const a of [...(stats && stats.list || [])].sort((x, y) => (y.priority || 0) - (x.priority || 0))) {
    if (!wanted(a)) continue;
    if (a.state === 'warming') { warming = true; continue; }
    if (a.state !== 'loading') continue;
    const k = logKeyFor(a.name);
    if (!out.includes(k)) out.push(k);
  }
  if (warming) out.push('loading.log.shaders');
  return out;
}

const CSS = `
.ftf-ink { display: grid; justify-items: center; gap: 10px; width: min(336px, 78vw); }
.ftf-ink-bar { width: 100%; aspect-ratio: ${INK_ATLAS.cell[0]} / ${INK_ATLAS.cell[1]}; background-repeat: no-repeat; background-size: ${INK_ATLAS.boil * 100}% ${INK_ATLAS.steps * 100}%; }
.ftf-ink.is-dark .ftf-ink-bar { background-color: #f3e3bd; border-radius: 12px; box-shadow: 0 0 0 1px rgba(74, 50, 20, .35), 0 6px 22px rgba(0, 0, 0, .45); }
.ftf-ink-log { position: relative; width: 100%; height: 4.2em; overflow: hidden; font: italic 400 14px/1.4 "Libre Caslon Text", "Cormorant Garamond", "WH Cyrillic", "Palatino Linotype", Palatino, Georgia, serif; letter-spacing: .01em; text-transform: none; text-align: center; color: #4a3214; }
.ftf-ink.is-dark .ftf-ink-log { color: rgba(236, 230, 218, .82); }
.ftf-ink-log span { position: absolute; left: 0; right: 0; bottom: 0; opacity: 0; transform: translateY(1.4em); transition: transform .45s ease, opacity .45s ease; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ftf-ink-log span[data-age="0"] { opacity: 1; transform: translateY(0); }
.ftf-ink-log span[data-age="1"] { opacity: .55; transform: translateY(-1.4em); }
.ftf-ink-log span[data-age="2"] { opacity: .25; transform: translateY(-2.8em); }
.ftf-ink-log span[data-age="3"] { opacity: 0; transform: translateY(-4.2em); }
html[data-motion="reduce"] .ftf-ink-log span { transition: none; }
@media (prefers-reduced-motion: reduce) { .ftf-ink-log span { transition: none; } }
`;

/**
 * @param {Document} doc
 * @param {{dark?: boolean, t?: (key: string) => string, base?: string}} [o] `dark`: on the dark loading screen the bar
 *   sits on a parchment plaque (its ink is the game's warm brown); `t` translates a log key
 * @returns {{el: HTMLElement, set(p: number): void, log(key: string): void, setTranslator(t: Function): void, destroy(): void, lines: string[]}}
 */
export function createInkBar(doc = globalThis.document, { dark = false, t = null, base = (import.meta.env && import.meta.env.BASE_URL) || '/' } = {}) {
  if (!doc.getElementById('ftf-ink-style')) { const st = doc.createElement('style'); st.id = 'ftf-ink-style'; st.textContent = CSS; doc.head.append(st); }
  const el = doc.createElement('div'); el.className = 'ftf-ink' + (dark ? ' is-dark' : '');
  const bar = doc.createElement('div'); bar.className = 'ftf-ink-bar'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
  bar.style.backgroundImage = `url("${base}${INK_ATLAS.url}")`;
  const log = doc.createElement('div'); log.className = 'ftf-ink-log'; log.setAttribute('aria-hidden', 'true');
  el.append(bar, log);
  const win = doc.defaultView || globalThis;
  let row = 0, col = 0, translate = t, lastKey = null, timer = 0;
  const keys = []; // newest first
  const place = () => { bar.style.backgroundPosition = `${INK_ATLAS.boil > 1 ? (col / (INK_ATLAS.boil - 1)) * 100 : 0}% ${(row / (INK_ATLAS.steps - 1)) * 100}%`; };
  const text = (key) => { let s = null; try { s = translate ? translate(key) : null; } catch { s = null; } return s && s !== key ? s : LOG_EN[key] || key; };
  place();
  if (!isReduced(doc) && win.setInterval) timer = win.setInterval(() => { col = (col + 1) % INK_ATLAS.boil; place(); }, INK_ATLAS.boilMs);
  return {
    el,
    get lines() { return keys.slice(); },
    /** Real progress 0..1: picks the atlas row. */
    set(p) { const r = inkRow(p); bar.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(1, p || 0)) * 100))); if (r !== row) { row = r; place(); } },
    /** Adds a line to the log (a repeat of the newest line is ignored). */
    log(key) {
      if (!key || key === lastKey) return;
      lastKey = key; keys.unshift(key);
      const line = doc.createElement('span'); line.dataset.key = key; line.textContent = text(key);
      log.append(line);
      const all = [...log.children].reverse();
      all.forEach((n, i) => { if (i > LOG_LINES) n.remove(); });
      void line.offsetWidth; // the newest line eases in from below
      all.forEach((n, i) => { n.dataset.age = String(Math.min(i, LOG_LINES)); });
      keys.length = Math.min(keys.length, LOG_LINES);
    },
    setTranslator(fn) { translate = fn; for (const n of log.children) n.textContent = text(n.dataset.key); },
    destroy() { if (timer) win.clearInterval(timer); timer = 0; el.remove(); },
  };
}
