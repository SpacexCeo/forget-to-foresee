// Deterministic frame-stepped clock for the cinematic capture (docs/submission/trailer.md). With
// ?cinematic=<name> the page's notion of time stops following the wall clock: performance.now(),
// Date.now(), requestAnimationFrame, setTimeout/setInterval and the Web Animations of CSS transitions
// all advance only when the capture harness (tools/capture) asks for the next frame. A frame then
// costs whatever a software renderer needs and the result is still a perfectly even 60 fps. Math.random
// is seeded too, so two runs of the same shot produce the same frames.
//
// The queue below is pure (node-tested in tests/client/cinematic.test.mjs); install() is browser-only.
// Nothing here touches game state: time is presentation (spec §2, "camera, skip and FPS never change state").

/** Ordered timer and animation-frame queue driven by an explicit clock. */
export class TimerQueue {
  constructor(startMs = 0) {
    this.now = startMs;
    this.timers = new Map();   // id -> {at, fn, args, every}
    this.frames = new Map();   // id -> fn
    this.nextId = 1;
    this.frameTime = startMs;  // timestamp handed to the last animation frame batch
  }

  setTimeout(fn, ms = 0, ...args) {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + Math.max(0, Number(ms) || 0), fn, args, every: null, seq: id });
    return id;
  }

  setInterval(fn, ms = 0, ...args) {
    const id = this.nextId++;
    const every = Math.max(1, Number(ms) || 0);
    this.timers.set(id, { at: this.now + every, fn, args, every, seq: id });
    return id;
  }

  clearTimer(id) { this.timers.delete(id); }

  requestAnimationFrame(fn) {
    const id = this.nextId++;
    this.frames.set(id, fn);
    return id;
  }

  cancelAnimationFrame(id) { this.frames.delete(id); }

  /**
   * Advances the clock by `dtMs`: every timer due in (now, now + dtMs] fires in time order (an interval
   * re-arms itself), then the animation frames registered before this step run once with the new time.
   * Frames and timers registered while running wait for the next step, as in a browser.
   */
  step(dtMs) {
    const target = this.now + dtMs;
    for (;;) {
      let next = null;
      for (const t of this.timers.values()) if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq))) next = t;
      if (!next) break;
      this.now = Math.max(this.now, next.at);
      if (next.every) { next.at += next.every; next.seq = this.nextId++; }
      else this.timers.delete([...this.timers].find(([, v]) => v === next)[0]);
      try { next.fn(...next.args); } catch (e) { report(e); }
    }
    this.now = target;
    this.frameTime = target;
    const batch = [...this.frames.values()];
    this.frames.clear();
    for (const fn of batch) { try { fn(target); } catch (e) { report(e); } }
    return target;
  }

  get pending() { return { timers: this.timers.size, frames: this.frames.size }; }
}

function report(e) { if (typeof console !== 'undefined') console.error('[cinematic] callback failed', e); }

/** mulberry32: small seeded PRNG that replaces Math.random for repeatable particle seeds and variants. */
export function seededRandom(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a of a string, for seeding from a shot name. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Patches the window's clocks and schedulers to the queue. Returns the controller the runner uses.
 * `real` keeps the original functions so the harness can still wait for network work in wall time.
 */
export function installVirtualClock(win, { fps = 60, startMs = 1_000, seed = 1 } = {}) {
  const q = new TimerQueue(startMs);
  const real = {
    setTimeout: win.setTimeout.bind(win), clearTimeout: win.clearTimeout.bind(win),
    setInterval: win.setInterval.bind(win), clearInterval: win.clearInterval.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    performanceNow: win.performance.now.bind(win.performance), dateNow: win.Date.now, random: Math.random,
  };
  const epoch = real.dateNow() - startMs;
  win.performance.now = () => q.now;
  win.Date.now = () => epoch + q.now;
  win.setTimeout = (fn, ms, ...a) => q.setTimeout(typeof fn === 'function' ? fn : () => {}, ms, ...a);
  win.setInterval = (fn, ms, ...a) => q.setInterval(typeof fn === 'function' ? fn : () => {}, ms, ...a);
  win.clearTimeout = (id) => q.clearTimer(id);
  win.clearInterval = (id) => q.clearTimer(id);
  win.requestAnimationFrame = (fn) => q.requestAnimationFrame(fn);
  win.cancelAnimationFrame = (id) => q.cancelAnimationFrame(id);
  Math.random = seededRandom(seed);
  const frameMs = 1000 / fps;
  // CSS transitions and animations run on the compositor clock; drive them by hand so a 0.45 s fade
  // takes 27 frames, whatever the wall clock does. Each animation is paused when first seen and its
  // currentTime set from the virtual clock; finished ones are let go so their end events still fire.
  const started = new Map();
  function driveAnimations() {
    const doc = win.document;
    if (!doc || typeof doc.getAnimations !== 'function') return;
    for (const a of doc.getAnimations()) {
      let s = started.get(a);
      if (s == null) {
        if (a.playState === 'finished' || a.playState === 'idle') continue;
        s = q.now - (Number(a.currentTime) || 0);
        started.set(a, s);
        try { a.pause(); } catch { /* read-only animations keep running */ }
      }
      const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
      const total = timing && Number.isFinite(timing.endTime) ? timing.endTime : Infinity;
      const t = q.now - s;
      if (t >= total) { started.delete(a); try { a.finish(); } catch { /* ok */ } continue; }
      try { a.currentTime = t; } catch { /* ok */ }
    }
    for (const a of [...started.keys()]) if (a.playState === 'finished' || a.playState === 'idle') started.delete(a);
  }
  return {
    queue: q, real, fps, frameMs,
    get now() { return q.now; },
    /** Advances exactly one captured frame. */
    step() { driveAnimations(); const t = q.step(frameMs); driveAnimations(); return t; },
    /** Lets promise chains and the network settle in wall time between frames. */
    settle(turns = 3) { return new Promise((resolve) => { let n = turns; const tick = () => (--n <= 0 ? resolve() : real.setTimeout(tick, 0)); real.setTimeout(tick, 0); }); },
  };
}
