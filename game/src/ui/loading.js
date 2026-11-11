// The loading screen of the first seconds (docs/first-seconds.md), v3: index.html paints a dark terminal-style screen
// inline before any JavaScript (diagram, log, Iris, LOADING, a thin teal line); this module takes it over with real progress (chunks and the
// bytes of the first frame's models), never lets the line freeze (a trickle while a download is silent, capped
// below the end), and hands off to the lobby or the island with a cross-fade and no flash. Pure helpers are
// exported for the tests; the DOM part degrades to nothing when #boot is absent.
import { MOTION, exit, isReduced } from './motion/index.js';

export const LOG_LINES = 4;
/** English lines used before the locale chunk is in (the same text as the `loading.log.*` keys of play/locales/en.js). */
export const LOG_EN = Object.freeze({
  'loading.log.code': 'Reading the Guests\u2019 signs…', 'loading.log.terrain': 'Laying the town\u2019s stones…', 'loading.log.houses': 'Raising houses and streets…',
  'loading.log.shrine': 'Lighting the shrine…', 'loading.log.altar': 'Opening the altar…', 'loading.log.sky': 'Hanging the sky islands…',
  'loading.log.iris': 'Waking Iris…', 'loading.log.shaders': 'Warming the town…', 'loading.log.shadersIsland': 'Warming the archipelago…', 'loading.log.island': 'Raising the archipelago…',
  'loading.log.shells': 'Raising the Shells…', 'loading.log.camps': 'Pitching camps and bridges…', 'loading.log.ready': 'Ready',
});
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
 * What is happening now, from the streamer's stats: one key per asset in flight, shaders when something is warming
 * (the town's warming line, or the archipelago's when no town asset is in the list).
 * @param {{list: {name: string, state: string, priority: number}[]}} stats @param {(row: object) => boolean} [wanted]
 * @returns {string[]} keys, most important first, no duplicates
 */
export function logKeysFromStats(stats, wanted = (a) => a.priority >= 0) {
  const out = [];
  let warming = false, town = false;
  for (const a of [...(stats && stats.list || [])].sort((x, y) => (y.priority || 0) - (x.priority || 0))) {
    if (!wanted(a)) continue;
    if (String(a.name || '').startsWith('town_')) town = true;
    if (a.state === 'warming') { warming = true; continue; }
    if (a.state !== 'loading') continue;
    const k = logKeyFor(a.name);
    if (!out.includes(k)) out.push(k);
  }
  if (warming) out.push(town ? 'loading.log.shaders' : 'loading.log.shadersIsland');
  return out;
}

/** The terminal log of the screen: the newest line first, at most LOG_LINES, translated when the locale is in. */
function bootLog(root) {
  const list = root && root.querySelector ? root.querySelector('.boot-log') : null;
  let translate = null;
  const keys = [];
  const text = (k) => { const v = translate ? translate(k) : null; return v && v !== k ? v : LOG_EN[k] || k; };
  const paint = () => { if (!list) return; const doc = list.ownerDocument; list.replaceChildren(...keys.map((k) => { const li = doc.createElement('li'); li.textContent = text(k); return li; })); };
  return {
    log(k) { if (!k || keys[0] === k) return; keys.unshift(k); keys.length = Math.min(keys.length, LOG_LINES); paint(); },
    setTranslator(fn) { translate = fn; paint(); },
    get lines() { return keys.slice(); },
  };
}

let PRISTINE = null; // a clean copy of #boot for the altar cover (createVeil)

/**
 * The altar transition cover (\u201cThe Tournament begins\u201d): the same screen as the first load, cloned from the pristine
 * #boot, with its own subtitle. Returns {el, set(p), log(key), setSub(text), destroy()}; null without a DOM copy.
 */
export function createVeil(doc = globalThis.document, { sub = '', t = null } = {}) {
  const src = PRISTINE || (doc && doc.getElementById ? doc.getElementById('boot') : null);
  if (!src || typeof src.cloneNode !== 'function') return null;
  const el = src.cloneNode(true);
  el.removeAttribute('id');
  el.classList.remove('boot--live', 'boot--failed');
  const subEl = el.querySelector('.boot-sub'), pct = el.querySelector('.boot-pct'), bar = el.querySelector('.boot-line');
  if (subEl) subEl.textContent = sub;
  const lg = bootLog(el); if (t) lg.setTranslator(t);
  const api = {
    el,
    set(p) { const v = Math.max(0, Math.min(1, p || 0)); el.style.setProperty('--boot-p', v.toFixed(3)); if (pct) pct.textContent = Math.round(v * 100) + '%'; if (bar) bar.setAttribute('aria-valuenow', String(Math.round(v * 100))); },
    log: (k) => lg.log(k),
    setSub(text) { if (subEl) subEl.textContent = text; },
    destroy() { el.remove(); },
  };
  api.set(0.04);
  return api;
}

/** Weights of the two progress sources: the code chunks arrive first, then the first frame's model bytes. */
export const BOOT_WEIGHTS = Object.freeze({ chunks: 0.35, bytes: 0.65 });

/**
 * Aggregates progress 0..1 from the chunks loaded (count) and the model bytes received for the first frame.
 * Without a byte budget (the lobby path) the chunks are the whole progress.
 */
export function bootProgress({ chunksDone = 0, chunksTotal = 1, bytesGot = 0, bytesPlanned = 0 } = {}, w = BOOT_WEIGHTS) {
  const c = chunksTotal > 0 ? Math.min(1, chunksDone / chunksTotal) : 1;
  if (!(bytesPlanned > 0)) return c;
  const b = Math.min(1, bytesGot / bytesPlanned);
  return Math.min(1, w.chunks * c + w.bytes * b);
}

/**
 * Shown progress never goes backwards, never sits still: it eases toward the real value and, while the real
 * value is silent, trickles slowly toward `cap` (so a stalled download still breathes), then snaps to 1 on finish.
 * @returns {number} the new shown value
 */
export function trickle(shown, real, dtMs, { cap = 0.94, rate = 6, creep = 0.08 } = {}) {
  const dt = Math.max(0, dtMs) / 1000;
  const k = 1 - Math.exp(-rate * dt);
  let next = shown + (Math.max(real, shown) - shown) * k;           // ease toward the real value
  if (real <= shown && shown < cap) next += creep * dt * (cap - shown); // silent download: creep toward the cap
  return Math.max(shown, Math.min(1, next));
}

/**
 * Which bytes gate the first frame: the visible assets in priority order, skipping any single file above
 * `maxItemBytes` (a 20 MB hero streams in later behind its stand-in) and stopping at `maxBytes` / `maxItems`,
 * so the gate is a few seconds on a 4G link, never the whole island.
 */
export function firstFrameBudget(assets, { maxBytes = 16 * 1024 * 1024, maxItems = 6, maxItemBytes = 8 * 1024 * 1024 } = {}) {
  const wanted = assets.filter((a) => a.priority >= 100 && (a.bytes || 0) <= maxItemBytes).sort((a, b) => b.priority - a.priority);
  const out = []; let bytes = 0;
  for (const a of wanted) {
    if (out.length >= maxItems) break;
    if (bytes + (a.bytes || 0) > maxBytes) continue;
    out.push(a.name); bytes += a.bytes || 0;
  }
  return { names: out, bytes };
}

/** The boot plan: what to load first for a URL (pure; tested). */
export function bootPlan({ play = null, hash = '', coarse = false, lobby = null } = {}) {
  // Town first (owner, 11.11): every URL starts in the town; the lobby opens from the pause menu, or first with ?lobby=1.
  const direct = play === 'direct' || hash === '#play' || coarse || lobby !== '1';
  return direct
    ? { first: 'world', lobby: false, gate: 'firstFrame', background: [] }
    : { first: 'lobby', lobby: true, gate: 'lobby', background: ['world'] };
}

/**
 * Whether this URL starts in the town on the ground (docs/town.md) and how (pure; tested).
 * The town is the default, the lobby and the jury link (`?demo=judge`) included. `?skip=town` goes straight to
 * the archipelago. The dev and QA deep links keep their old meaning and skip the town too: `?play=direct`,
 * `?cinematic=`, `?view=`, `?film=`; adding `?town=1` to any of them enters the town after all
 * (`?play=direct&town=1` is the direct QA link into the town). `?town=altar` spawns at the altar stand,
 * `?town=flat` replaces the models with a flat dev ground; the two combine as `?town=altar,flat`.
 * @param {{skip?: string|null, town?: string|null, play?: string|null, cinematic?: string|null, view?: string|null, film?: string|null}} p
 * @returns {{town: boolean, spawn: 'gate'|'altar', flat: boolean}}
 */
export function townPlan({ skip = null, town = null, play = null, cinematic = null, view = null, film = null } = {}) {
  const flags = town == null ? [] : String(town).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const off = { town: false, spawn: 'gate', flat: false };
  if (skip === 'town' || flags.includes('0') || flags.includes('off')) return off;
  const asked = town != null;
  const deepLink = play === 'direct' || cinematic != null || view != null || film != null;
  if (deepLink && !asked) return off;
  return { town: true, spawn: flags.includes('altar') ? 'altar' : 'gate', flat: flags.includes('flat') };
}

/**
 * Binds to the inline screen (#boot in index.html). Returns a controller; all methods are safe without a DOM.
 * @param {Document} doc
 */
export function createLoadingScreen(doc = globalThis.document) {
  let root = doc && doc.getElementById ? doc.getElementById('boot') : null;
  let label = null, pct = null, bar = null, sub = null;
  const bind = () => { label = root ? root.querySelector('.boot-label') : null; pct = root ? root.querySelector('.boot-pct') : null; bar = root ? root.querySelector('.boot-line') : null; sub = root ? root.querySelector('.boot-sub') : null; };
  // A pristine copy for reopen() and for the altar cover (createVeil): the town may still be streaming when the player
  // leaves the lobby (docs/town.md), and the cover is the same screen.
  const spare = root && typeof root.cloneNode === 'function' ? root.cloneNode(true) : null;
  if (spare && !PRISTINE) PRISTINE = spare;
  // The terminal log of what is loading right now (`> ` lines, newest on top).
  let lg = null, translate = null;
  const attachLog = () => { lg = bootLog(root); if (translate) lg.setTranslator(translate); lg.log('loading.log.code'); };
  bind(); attachLog();
  let shown = 0.04, real = 0, last = 0, raf = 0, finished = false, done = null; // a visible start before any byte
  const win = (doc && doc.defaultView) || globalThis;
  const now = () => (win.performance ? win.performance.now() : Date.now());
  const paint = () => {
    if (!root) return;
    if (pct) pct.textContent = Math.round(shown * 100) + '%';
    if (bar) bar.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
    root.style.setProperty('--boot-p', shown.toFixed(3));
  };
  const frame = () => {
    raf = 0;
    const t = now(); const dt = last ? Math.min(100, t - last) : 16; last = t;
    shown = trickle(shown, real, dt);
    paint();
    if (!finished && root) raf = win.requestAnimationFrame ? win.requestAnimationFrame(frame) : setTimeout(frame, 50);
  };
  if (root) { root.classList.add('boot--live'); frame(); }
  return {
    get shown() { return shown; },
    get finished() { return finished; },
    /** Real progress 0..1 and an optional label. */
    set(p, text) { real = Math.max(real, Math.min(1, p || 0)); if (label && text != null) label.textContent = text; },
    /** A line for the log under the bar: a `loading.log.*` key (what is loading right now). */
    log(key) { if (lg) lg.log(key); },
    /** The locale arrived: the log's lines are shown in the player's language from now on. */
    setTranslator(fn) { translate = fn; if (lg) lg.setTranslator(fn); },
    /** The serif line over LOADING ("Forget to Foresee" on the first load). */
    setSub(text) { if (sub) sub.textContent = text; },
    /** Hands off: the ring completes, the screen cross-fades out over the screen duration; resolves when gone. */
    finish() {
      if (finished) return done;
      finished = true; real = 1; shown = 1; paint();
      if (!root) return (done = Promise.resolve());
      const reduced = isReduced(doc);
      done = new Promise((r) => (win.setTimeout || setTimeout)(r, reduced ? 60 : 140)) // let the full ring be seen
        .then(() => exit(root, { to: 'fade', duration: MOTION.duration.screen }))
        .then(() => { root.remove(); if (doc.body && doc.body.classList) doc.body.classList.remove('booting'); });
      return done;
    },
    /**
     * Shows the screen again after finish(), opaque at once and with its progress back at the start: the lobby is
     * done but the place the player is about to enter is not on the GPU yet. Follow with set() and finish().
     * @returns {boolean} whether a screen is up
     */
    reopen(text) {
      if (!finished) { if (label && text != null) label.textContent = text; return !!root; }
      if (!spare || !doc.body) return false;
      root = spare.cloneNode(true); bind(); attachLog();
      shown = 0.04; real = 0; last = 0; finished = false; done = null;
      if (label && text != null) label.textContent = text;
      doc.body.append(root);
      root.classList.add('boot--live');
      frame();
      return true;
    },
    /** A failure keeps the screen with a message (the page is not blank). */
    fail(text) { finished = true; if (label) label.textContent = text; if (sub) sub.textContent = text; if (root) root.classList.add('boot--failed'); },
    destroy() { finished = true; if (raf && win.cancelAnimationFrame) win.cancelAnimationFrame(raf); },
  };
}
