// The loading screen of the first seconds (docs/first-seconds.md). index.html paints the screen inline before any
// JavaScript (title, an ink ring that breathes); this module takes it over with real progress (chunks and the
// bytes of the first frame's models), never lets the ring freeze (a trickle while a download is silent, capped
// below the end), and hands off to the lobby or the island with a cross-fade and no flash. Pure helpers are
// exported for the tests; the DOM part degrades to nothing when #boot is absent.
import { MOTION, exit, isReduced } from './motion/index.js';

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
export function bootPlan({ play = null, hash = '', coarse = false } = {}) {
  const direct = play === 'direct' || hash === '#play' || coarse;
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
  const root = doc && doc.getElementById ? doc.getElementById('boot') : null;
  const ring = root ? root.querySelector('.boot-ring-fg') : null;
  const label = root ? root.querySelector('.boot-label') : null;
  const pct = root ? root.querySelector('.boot-pct') : null;
  const circumference = 2 * Math.PI * 54; // r = 54 in the inline SVG
  let shown = 0.04, real = 0, last = 0, raf = 0, finished = false, done = null; // a visible start before any byte
  const win = (doc && doc.defaultView) || globalThis;
  const now = () => (win.performance ? win.performance.now() : Date.now());
  const paint = () => {
    if (!root) return;
    if (ring) ring.style.strokeDashoffset = String(circumference * (1 - shown));
    if (pct) pct.textContent = Math.round(shown * 100) + '%';
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
    /** A failure keeps the screen with a message (the page is not blank). */
    fail(text) { finished = true; if (label) label.textContent = text; if (root) root.classList.add('boot--failed'); },
    destroy() { finished = true; if (raf && win.cancelAnimationFrame) win.cancelAnimationFrame(raf); },
  };
}
