// Streaming decisions for .glb assets: which assets to load next, which to release, which cached
// templates to evict. Pure logic (no three.js) so it is covered by node tests; render/assets.js
// feeds it frustum and distance facts every few frames.
//
// Policy (owner decision 07.11: load only what the player can currently see):
//   - an instance on screen and within its kind's load distance is wanted;
//   - an instance off screen is wanted only inside a small prefetch radius around the camera focus;
//   - wanted assets load in priority order (on screen first, then larger apparent size), with at most
//     `maxConcurrent` downloads at once;
//   - an asset unwanted for `releaseAfter` seconds is released: its instances fall back to the
//     greybox and its template moves to the cold part of an LRU cache;
//   - cold templates are evicted (GPU and CPU memory freed) least recently used first once the cache
//     exceeds its byte budget. Templates in use are never evicted.

/**
 * Priority of one placed instance. Returns -1 when the instance is not wanted.
 * Visible instances always outrank prefetch-only ones; among equals, larger apparent size wins.
 * @param {{inFrustum:boolean, distance:number, radius:number, loadDistance:number,
 *          focusDistance?:number, prefetchRadius?:number, bytes?:number}} f distance = camera to bounding-sphere surface
 */
export function instancePriority(f) {
  const apparent = Math.min(f.radius / Math.max(f.distance, 0.5), 10);
  if (f.inFrustum && f.distance <= f.loadDistance) return 100 + apparent * byteFactor(f.bytes);
  const focus = f.focusDistance ?? Infinity;
  if (focus <= (f.prefetchRadius ?? 0)) return 1 + Math.min(apparent, 10) * 0.01 * byteFactor(f.bytes);
  return -1;
}

/**
 * Bytes-aware weight for the first seconds (docs/first-seconds.md): among visible assets, a 20 MB hero should not
 * take the pipe before three 6 MB camps of similar apparent size. Files up to 4 MB keep their full weight; above,
 * the weight falls with the square root of the size (20 MB → 0.45), so a large asset that fills the screen still
 * wins over a small one that does not. Unknown sizes count as 4 MB.
 */
export function byteFactor(bytes) {
  const mb = (bytes ?? 4 * 1048576) / 1048576;
  return mb <= 4 ? 1 : Math.sqrt(4 / mb);
}

/**
 * How many queued GPU uploads fit in this frame (render/warmup.js). Takes items in order while they fit the byte
 * budget; with `atLeastOne` the first item is always taken, so one texture larger than the whole budget still moves.
 * @param {number[]} sizes bytes of the queued items, in order
 * @param {number} budget bytes left this frame
 */
export function takeFrameBatch(sizes, budget, { atLeastOne = true } = {}) {
  let n = 0, left = budget;
  for (const size of sizes) {
    if (size > left && !(atLeastOne && n === 0)) break;
    n++; left -= size;
  }
  return n;
}

/**
 * Judge-path pins on the archipelago (docs/hackathon-tz.md P0-A): the four Shell exteriors and the Shell
 * interior are wanted even when off screen, so the first flight into a Shell lands in the real hall. Their
 * priority sits under everything on screen (>= 100: the first view still comes first) and above the prefetch
 * class (about 1) and the light-first upgrades (which wait until nothing wanted is pending; on desktop that is
 * where the two 20 MB hero files load). A pinned asset is never released.
 */
export const JUDGE_PINS = Object.freeze({ shell_1: 96, shell_2: 95, shell_3: 95, shell_4: 95, shell_interior: 90 });

/** Priority of an asset with an optional pin: the better of what the camera says and the pin. */
export function pinnedPriority(base, pin) { return pin == null ? base : Math.max(base, pin); }

/**
 * The two heavy heroes (anchor, scroll_table) go last among what is on screen: they stay in the on-screen class
 * (the first view still waits for them, no greybox on the judge camera) but every other visible asset, the
 * Shells included, is fetched before them.
 */
export const HEAVY_HEROES = Object.freeze(['anchor', 'scroll_table']);
export function heroLast(name, priority) {
  return HEAVY_HEROES.includes(name) && priority >= 100 ? 100 + (priority - 100) * 0.001 : priority;
}

/**
 * A failed download is tried again while the asset is still wanted: after 2 s, 6 s and 15 s, then it stays
 * failed (a missing or broken file must not loop). One dropped connection no longer leaves a greybox for the
 * rest of the session (the Shell hall on the judge path, docs/hackathon-tz.md P0-A).
 * @returns {boolean} whether to put the asset back in the queue now
 */
export const RETRY_DELAYS = Object.freeze([2, 6, 15]);
export function shouldRetry({ failures = 0, sinceFailure = 0, priority = -1 } = {}) {
  if (priority < 0 || failures < 1 || failures > RETRY_DELAYS.length) return false;
  return sinceFailure >= RETRY_DELAYS[failures - 1];
}

/** An asset's priority is the best priority among its instances. */
export function assetPriority(instancePriorities) {
  let best = -1;
  for (const p of instancePriorities) if (p > best) best = p;
  return best;
}

/**
 * Plans one streaming tick.
 * @param {Array<{name:string, state:string, priority:number, unwantedFor:number}>} assets
 *   state: 'absent' (no file), 'idle' (file exists, not loaded), 'queued', 'loading', 'warming' (downloaded,
 *   textures and shaders going to the GPU ahead of the swap; holds no download slot), 'loaded'
 *   (template ready, instances real), 'cold' (template cached, instances greybox), 'failed'
 * @returns {{load:string[], attach:string[], release:string[]}}
 *   load: start downloading; attach: cached template becomes visible again; release: show greybox
 */
export function planStreaming(assets, { maxConcurrent = 2, releaseAfter = 8 } = {}) {
  const loading = assets.filter((a) => a.state === 'loading').length;
  const candidates = assets
    .filter((a) => (a.state === 'idle' || a.state === 'queued') && a.priority >= 0)
    .sort((a, b) => b.priority - a.priority || (a.name < b.name ? -1 : 1));
  const load = candidates.slice(0, Math.max(0, maxConcurrent - loading)).map((a) => a.name);
  const attach = assets.filter((a) => a.state === 'cold' && a.priority >= 0).map((a) => a.name);
  const release = assets.filter((a) => a.state === 'loaded' && a.priority < 0 && a.unwantedFor >= releaseAfter).map((a) => a.name);
  return { load, attach, release };
}

/**
 * Light-first loading (docs/smoothness.md): which shown asset gets its full-resolution file next, or null.
 * An upgrade starts only when the first pass is over (nothing wanted is still idle, loading or warming), one at
 * a time, for an asset that is on screen (priority >= 100) and still shows its light file; largest on screen first.
 * @param {Array<{name:string, state:string, priority:number, lite?:boolean, upgrading?:boolean}>} assets
 */
export function planUpgrade(assets, { maxConcurrent = 1 } = {}) {
  const busy = assets.some((a) => a.state === 'loading' || a.state === 'warming' || ((a.state === 'idle' || a.state === 'queued') && a.priority >= 0));
  if (busy) return null;
  if (assets.filter((a) => a.upgrading).length >= maxConcurrent) return null;
  const next = assets
    .filter((a) => a.state === 'loaded' && a.lite && !a.upgrading && a.priority >= 100)
    .sort((a, b) => b.priority - a.priority || (a.name < b.name ? -1 : 1))[0];
  return next ? next.name : null;
}

/**
 * Whether the light files go first on this device. Phones and the low tier already load only the light set
 * (`variant` '_m'); a visitor who asked the browser to save data, or sits on a 2G/3G-class link, keeps the light
 * set and never pays for the second download.
 * @returns {{liteFirst:boolean, upgrade:boolean}}
 */
export function liteFirstPolicy({ variant = '', param = null, saveData = false, effectiveType = '' } = {}) {
  if (variant || param === 'off') return { liteFirst: false, upgrade: false };
  const slow = saveData || /(^|-)(2g|3g)$/.test(effectiveType || '');
  return { liteFirst: true, upgrade: !slow && param !== 'only' };
}

/** LRU cache of loaded templates by byte size. Only cold (unused) entries can be evicted. */
export class LruCache {
  constructor(maxBytes) { this.maxBytes = maxBytes; this.map = new Map(); this.bytes = 0; }

  /** Adds or refreshes an entry; marks it hot (in use). */
  touch(key, bytes) {
    const e = this.map.get(key);
    if (e) { this.map.delete(key); e.hot = true; if (bytes != null) { this.bytes += bytes - e.bytes; e.bytes = bytes; } this.map.set(key, e); return; }
    this.map.set(key, { bytes: bytes || 0, hot: true });
    this.bytes += bytes || 0;
  }

  /** Marks an entry cold: it stays cached but may be evicted. */
  cool(key) { const e = this.map.get(key); if (e) e.hot = false; }

  has(key) { return this.map.has(key); }

  isHot(key) { const e = this.map.get(key); return !!(e && e.hot); }

  delete(key) { const e = this.map.get(key); if (!e) return false; this.bytes -= e.bytes; this.map.delete(key); return true; }

  /** Evicts cold entries, least recently touched first, until within budget. Returns evicted keys. */
  evict() {
    const out = [];
    for (const [key, e] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      if (e.hot) continue;
      this.map.delete(key); this.bytes -= e.bytes; out.push(key);
    }
    return out;
  }
}

/**
 * One shared download per key (QA-030): the heroine's model starts loading when the world module is created, before
 * the camps and props take the pipe, and the play layer later picks up the same promise instead of fetching again.
 * A failed download is forgotten so a later call may retry.
 * @param {(key:string) => Promise<any>} fetchFn
 */
export function createPrefetch(fetchFn) {
  const pending = new Map();
  return (key) => {
    if (!pending.has(key)) {
      const p = Promise.resolve().then(() => fetchFn(key));
      pending.set(key, p);
      p.catch(() => { if (pending.get(key) === p) pending.delete(key); });
    }
    return pending.get(key);
  };
}

/** Seconds the player waits for Iris's model before the greybox stand-in shows anyway (a slow network). */
export const IRIS_STANDIN_AFTER = 8;

/**
 * Whether Iris's greybox capsule is shown (QA-030): never while her model is on its way or downloaded and waiting for
 * the play layer to attach it; shown only without a model file, after a failure, or when the download itself has taken
 * longer than IRIS_STANDIN_AFTER seconds (a slow network); never once her model is in.
 * @param {{hasModel:boolean, fetched?:boolean, loaded?:boolean, failed?:boolean, waited?:number}} s
 *   fetched = the file is downloaded and parsed; waited = seconds since the world began; players = a production
 *   build (the loading screen covers the wait instead)
 */
export function irisStandInVisible({ hasModel, fetched = false, loaded = false, failed = false, waited = 0, players = false }) {
  if (loaded) return false;
  if (players) return !hasModel; // a player build never shows the greybox for a model that exists: it waits and retries
  if (!hasModel || failed) return true;
  return !fetched && waited >= IRIS_STANDIN_AFTER;
}
