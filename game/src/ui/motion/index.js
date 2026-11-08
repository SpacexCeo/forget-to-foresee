// Motion design system (docs/motion.md): one dependency-free module with the tokens (durations, easings,
// springs, distances) and the helpers every screen uses: enter / exit, stagger, FLIP layout moves, number
// tick-up, press feedback, the "Verified" seal, parallax, cross-fades. Transforms and opacity only on the
// DOM (no layout properties are animated), the Web Animations API where it exists, and a reduced-motion
// fallback everywhere: movement becomes a short cross-fade, nothing is skipped and nothing blocks input.
// Pure math (easings, springs, stagger, FLIP deltas) is exported for tests and for the 3D side.

/** Tokens. UI motion is fast and purposeful: 120–400 ms; screens take up to 480 ms; springs settle in under a second. */
export const MOTION = Object.freeze({
  duration: Object.freeze({ instant: 0, fast: 120, base: 200, slow: 320, screen: 480, seal: 640, reduced: 160 }),
  easing: Object.freeze({
    out: 'cubic-bezier(.16, 1, .3, 1)',          // expo-out: arrives fast, settles like nacre
    inOut: 'cubic-bezier(.65, 0, .35, 1)',       // symmetric, for things that move from A to B
    in: 'cubic-bezier(.7, 0, .84, 0)',           // exits accelerate away
    emphasized: 'cubic-bezier(.2, .9, .2, 1)',   // overshoots a hair: reveals, seals
    linear: 'linear',
  }),
  spring: Object.freeze({
    gentle: Object.freeze({ stiffness: 120, damping: 20, mass: 1 }),  // panels, camera-like follows
    snappy: Object.freeze({ stiffness: 260, damping: 28, mass: 1 }),  // buttons, chips, markers
    settle: Object.freeze({ stiffness: 170, damping: 14, mass: 1 }),  // the seal: one visible overshoot
  }),
  distance: Object.freeze({ rise: 12, drop: 8, lift: 2, nudge: 6, parallax: 10 }), // px
  scale: Object.freeze({ press: 0.97, pop: 1.04, enterFrom: 0.96, exitTo: 0.98, sealFrom: 1.35 }),
  stagger: Object.freeze({ step: 40, cap: 320 }), // ms
});

/* ---------- pure math ---------- */

/** Easing functions (JS counterparts of the CSS tokens; monotonic, 0 → 0 and 1 → 1). */
export const ease = Object.freeze({
  out: (t) => 1 - Math.pow(1 - clamp01(t), 4),
  in: (t) => Math.pow(clamp01(t), 3),
  inOut: (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  emphasized: (t) => { t = clamp01(t); const o = 1 - Math.pow(1 - t, 3); return o + Math.sin(t * Math.PI) * 0.04 * (1 - t); },
  linear: (t) => clamp01(t),
});
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A damped spring stepper: `step(dt)` advances and returns the value; `done` when at rest.
 * @param {{stiffness:number, damping:number, mass?:number}} s @param {number} from @param {number} to
 */
export function createSpring(s, from = 0, to = 1, velocity = 0) {
  const { stiffness: k, damping: c, mass: m = 1 } = s;
  const st = { value: from, velocity, target: to, done: from === to && velocity === 0 };
  st.step = (dt) => {
    // semi-implicit Euler in sub-steps of at most 4 ms: stable for any stiffness we use
    let left = Math.max(0, dt);
    while (left > 0) {
      const h = Math.min(left, 0.004); left -= h;
      const a = (-k * (st.value - st.target) - c * st.velocity) / m;
      st.velocity += a * h; st.value += st.velocity * h;
    }
    if (Math.abs(st.value - st.target) < 0.0005 && Math.abs(st.velocity) < 0.005) { st.value = st.target; st.velocity = 0; st.done = true; }
    return st.value;
  };
  st.retarget = (t) => { st.target = t; st.done = false; };
  return st;
}

/** Samples a spring from 0 to 1 at `hz` into an array of values (for WAAPI keyframes with linear easing). */
export function springSamples(s, { hz = 60, maxSeconds = 2 } = {}) {
  const sp = createSpring(s, 0, 1), out = [0];
  for (let i = 0; i < hz * maxSeconds && !sp.done; i++) out.push(sp.step(1 / hz));
  if (out[out.length - 1] !== 1) out.push(1);
  return out;
}

/** Seconds a spring takes to settle (sampled). */
export function springDuration(s, hz = 60) { return (springSamples(s, { hz }).length - 1) / hz; }

/** Follow rate (per second) of eased pursuits such as the parallax: 0.12 of the gap per frame at 60 Hz. */
export const FOLLOW_RATE = -Math.log(1 - 0.12) * 60;

/**
 * Share of the remaining gap an exponential follow closes in `dt` seconds (QA-032: wall-clock, not per frame, so a
 * 30 fps phone or a 5 fps software renderer settles in the same time as a 60 fps desktop; two half steps equal one).
 */
export function followFactor(dt, rate = FOLLOW_RATE) { return 1 - Math.exp(-rate * Math.max(0, dt)); }

/** Delay of the i-th item in a staggered list: step per item, capped so long lists finish together. */
export function staggerDelay(i, { step = MOTION.stagger.step, cap = MOTION.stagger.cap } = {}) { return Math.min(i * step, cap); }

/** FLIP: the inverse transform that makes `last` look like `first` (rects with x, y, width, height). */
export function flipDelta(first, last) {
  const sx = first.width && last.width ? first.width / last.width : 1, sy = first.height && last.height ? first.height / last.height : 1;
  return { dx: first.x - last.x, dy: first.y - last.y, sx, sy, moved: Math.abs(first.x - last.x) > 0.5 || Math.abs(first.y - last.y) > 0.5 || Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01 };
}

/** Value of a number tick-up at normalized time t (eased), rounded to `decimals`. */
export function tickValue(from, to, t, decimals = 0) {
  const v = from + (to - from) * ease.out(t);
  const p = Math.pow(10, decimals);
  return t >= 1 ? to : Math.round(v * p) / p;
}

/* ---------- reduced motion ---------- */

/** True when movement must become cross-fades: `html[data-motion="reduce"]` (the setting), else the system query. */
export function isReduced(doc = globalThis.document) {
  try {
    const root = doc && doc.documentElement;
    const m = root && root.dataset ? root.dataset.motion : null;
    if (m === 'reduce') return true;
    if (m === 'full') return false;
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch { return false; }
}

/* ---------- DOM helpers (transforms and opacity only) ---------- */

const FROM = {
  rise: (d) => `translate3d(0, ${d}px, 0)`,
  drop: (d) => `translate3d(0, ${-d}px, 0)`,
  left: (d) => `translate3d(${-d}px, 0, 0)`,
  right: (d) => `translate3d(${d}px, 0, 0)`,
  scale: () => `scale(${MOTION.scale.enterFrom})`,
  pop: () => `scale(${MOTION.scale.sealFrom})`,
  fade: () => 'none',
};

function run(el, keyframes, { duration, delay = 0, easing = MOTION.easing.out, fill = 'none', composite } = {}) {
  if (!el || typeof el.animate !== 'function' || duration <= 0) return Promise.resolve(null);
  try {
    const a = el.animate(keyframes, { duration, delay, easing, fill, ...(composite ? { composite } : {}) });
    // Resolve on the animation's own finish, or on the clock a little after its end: a background tab, a throttled
    // or software-rendered frame must never hold up what follows (hiding a panel, mounting the next screen).
    const byClock = new Promise((r) => setTimeout(() => r(a), duration + delay + 80));
    return Promise.race([(a.finished || Promise.resolve(a)).then(() => a, () => a), byClock]);
  } catch { return Promise.resolve(null); }
}

/**
 * Enters an element: from a short offset (rise / drop / left / right), a scale, or a fade, to its resting place.
 * Reduced motion: an opacity fade of `MOTION.duration.reduced`. Resolves when done; never blocks input.
 * @param {Element} el @param {{from?: 'rise'|'drop'|'left'|'right'|'scale'|'fade', distance?: number, duration?: number, delay?: number, easing?: string, doc?: Document}} [o]
 */
export function enter(el, o = {}) {
  if (!el) return Promise.resolve(null);
  if (el.style) { el.style.opacity = ''; el.style.transform = ''; }
  const reduced = isReduced(o.doc || el.ownerDocument);
  const from = reduced ? 'fade' : (o.from || 'rise');
  const duration = reduced ? Math.min(o.duration ?? MOTION.duration.base, MOTION.duration.reduced) : (o.duration ?? MOTION.duration.base);
  const t = FROM[from] ? FROM[from](o.distance ?? MOTION.distance.rise) : 'none';
  return run(el, [{ opacity: 0, transform: t }, { opacity: 1, transform: 'none' }], { duration, delay: o.delay || 0, easing: o.easing || MOTION.easing.out, fill: 'backwards' });
}

/**
 * Exits an element (to a small drop / rise / scale, or a fade) and leaves it at opacity 0 (inline) for the caller
 * to hide or remove. Reduced motion: a fade. Resolves when done.
 */
export function exit(el, o = {}) {
  if (!el) return Promise.resolve(null);
  const reduced = isReduced(o.doc || el.ownerDocument);
  const to = reduced ? 'fade' : (o.to || 'fade');
  const duration = reduced ? Math.min(o.duration ?? MOTION.duration.fast, MOTION.duration.reduced) : (o.duration ?? MOTION.duration.fast);
  const d = o.distance ?? MOTION.distance.drop;
  const t = to === 'drop' ? `translate3d(0, ${d}px, 0)` : to === 'rise' ? `translate3d(0, ${-d}px, 0)` : to === 'scale' ? `scale(${MOTION.scale.exitTo})` : 'none';
  return run(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: t }], { duration, delay: o.delay || 0, easing: o.easing || MOTION.easing.in })
    .then((a) => { if (el.style) el.style.opacity = '0'; return a; });
}

/** Enters a list with a per-item delay (capped). `fn` defaults to `enter`. Resolves when the last one is done. */
export function stagger(els, o = {}, fn = enter) {
  const list = Array.from(els || []);
  return Promise.all(list.map((el, i) => fn(el, { ...o, delay: (o.delay || 0) + staggerDelay(i, o) })));
}

/** Exit the old element and enter the new one at the same spot (both fades by default; pass `from`/`to`). */
export function crossfade(outEl, inEl, o = {}) {
  return Promise.all([outEl ? exit(outEl, { to: o.to || 'fade', duration: o.outDuration ?? MOTION.duration.fast }) : null,
    inEl ? enter(inEl, { from: o.from || 'fade', duration: o.duration ?? MOTION.duration.base, delay: o.delay ?? 60 }) : null]);
}

/**
 * FLIP: measure, apply `mutate()` (a class change, a reorder, a resize), measure again, then animate the element
 * from its old place/size to the new one with transforms only. Reduced motion: the change is applied without the move.
 */
export function flip(el, mutate, o = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function') { if (mutate) mutate(); return Promise.resolve(null); }
  const first = el.getBoundingClientRect();
  if (mutate) mutate();
  const last = el.getBoundingClientRect();
  const d = flipDelta(first, last);
  if (!d.moved || isReduced(o.doc || el.ownerDocument)) return Promise.resolve(null);
  const prevOrigin = el.style ? (el.style.transformOrigin || '') : '';
  if (el.style) el.style.transformOrigin = '0 0';
  return run(el, [{ transform: `translate(${d.dx}px, ${d.dy}px) scale(${d.sx}, ${d.sy})` }, { transform: 'none' }], { duration: o.duration ?? MOTION.duration.slow, easing: o.easing || MOTION.easing.out })
    .then((a) => { if (el.style) el.style.transformOrigin = prevOrigin; return a; });
}

const ticks = new WeakMap();
/**
 * Counts an element's text from its current (or `from`) value to `to` with an eased tick-up; a new call cancels
 * the previous one. Reduced motion or `duration` 0 writes the final value at once. `format(n)` renders the text.
 * `raf`/`now` can be injected (tests). Resolves with the final text.
 */
export function tickNumber(el, to, o = {}) {
  if (!el) return Promise.resolve('');
  const format = o.format || ((n) => String(n));
  const decimals = o.decimals ?? 0;
  const doc = o.doc || el.ownerDocument;
  const prev = ticks.get(el); if (prev) prev.cancel();
  const from = o.from ?? (Number.isFinite(parseFloat(el.textContent)) ? parseFloat(el.textContent) : to);
  const duration = isReduced(doc) ? 0 : (o.duration ?? MOTION.duration.slow);
  if (duration <= 0 || from === to) { el.textContent = format(to); return Promise.resolve(el.textContent); }
  const win = (doc && doc.defaultView) || globalThis;
  const raf = o.raf || (win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : (fn) => setTimeout(() => fn(Date.now()), 16));
  const now = o.now || (() => (win.performance ? win.performance.now() : Date.now()));
  return new Promise((resolve) => {
    const t0 = now();
    const state = { cancel: () => { state.dead = true; resolve(el.textContent); } };
    ticks.set(el, state);
    const frame = () => {
      if (state.dead) return;
      const t = Math.min(1, (now() - t0) / duration);
      el.textContent = format(tickValue(from, to, t, decimals));
      if (t < 1) raf(frame); else { ticks.delete(el); resolve(el.textContent); }
    };
    frame();
  });
}

/**
 * Press feedback: `.mo-pressed` while a pointer or Space/Enter is down (the stylesheet scales it to 0.97; reduced
 * motion dims it instead). Adds `.mo-press`. Returns an unbind function.
 */
export function press(el) {
  if (!el || !el.addEventListener) return () => {};
  el.classList && el.classList.add('mo-press');
  const on = () => el.classList && el.classList.add('mo-pressed');
  const off = () => el.classList && el.classList.remove('mo-pressed');
  const key = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter') on(); };
  const pairs = [['pointerdown', on], ['pointerup', off], ['pointercancel', off], ['pointerleave', off], ['keydown', key], ['keyup', off], ['blur', off]];
  for (const [t, fn] of pairs) el.addEventListener(t, fn);
  return () => { for (const [t, fn] of pairs) el.removeEventListener(t, fn); off(); };
}

/** The "Verified ✓" seal: stamps down from 1.35× with one visible overshoot (spring `settle`), reduced: a fade. */
export function seal(el, o = {}) {
  if (!el) return Promise.resolve(null);
  if (isReduced(o.doc || el.ownerDocument)) return enter(el, { from: 'fade' });
  const s = springSamples(MOTION.spring.settle, { hz: 60 });
  const kf = s.map((v) => ({ transform: `scale(${MOTION.scale.sealFrom + (1 - MOTION.scale.sealFrom) * v})`, opacity: Math.min(1, 0.2 + v) }));
  return run(el, kf, { duration: o.duration ?? Math.min(MOTION.duration.seal, s.length * 1000 / 60), easing: 'linear', fill: 'backwards' });
}

/**
 * Pointer parallax: layers move against the pointer by `depth × max` px (transform only, eased over wall-clock time,
 * not per frame: QA-032). Off under reduced motion and for coarse pointers. `layers` = [{el, depth}]. `now` can be
 * injected (tests). Returns an unbind function.
 */
export function parallax(container, layers, o = {}) {
  if (!container || !container.addEventListener || !layers || !layers.length) return () => {};
  const doc = o.doc || container.ownerDocument;
  const win = (doc && doc.defaultView) || globalThis;
  let coarse = false; try { coarse = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches); } catch { /* no media queries */ }
  if (coarse || isReduced(doc)) return () => {};
  const max = o.max ?? MOTION.distance.parallax;
  const now = o.now || (() => (win.performance ? win.performance.now() : Date.now()));
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, last = 0, alive = true;
  const schedule = () => {
    if (raf) return;
    if (!last) last = now();
    raf = win.requestAnimationFrame ? win.requestAnimationFrame(frame) : setTimeout(frame, 16);
  };
  const frame = () => {
    raf = 0;
    const t = now(), k = followFactor((t - last) / 1000); last = t;
    cx += (tx - cx) * k; cy += (ty - cy) * k;
    for (const { el, depth = 1 } of layers) if (el && el.style) el.style.transform = `translate3d(${(cx * depth).toFixed(2)}px, ${(cy * depth).toFixed(2)}px, 0)`;
    if (alive && (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05)) schedule(); else last = 0;
  };
  const move = (e) => {
    const w = win.innerWidth || 1, h = win.innerHeight || 1;
    tx = -((e.clientX / w) * 2 - 1) * max; ty = -((e.clientY / h) * 2 - 1) * max;
    schedule();
  };
  const leave = () => { tx = 0; ty = 0; schedule(); };
  container.addEventListener('pointermove', move);
  container.addEventListener('pointerleave', leave);
  return () => { alive = false; container.removeEventListener('pointermove', move); container.removeEventListener('pointerleave', leave); for (const { el } of layers) if (el && el.style) el.style.transform = ''; };
}

/* ---------- stylesheet ---------- */

/** The tokens as CSS custom properties (`--mo-*`) for stylesheets that transition on their own. */
export function motionVars() {
  const d = MOTION.duration, e = MOTION.easing;
  return `--mo-fast: ${d.fast}ms; --mo-base: ${d.base}ms; --mo-slow: ${d.slow}ms; --mo-screen: ${d.screen}ms; --mo-reduced: ${d.reduced}ms; ` +
    `--mo-ease-out: ${e.out}; --mo-ease-in-out: ${e.inOut}; --mo-ease-in: ${e.in}; --mo-ease-emphasized: ${e.emphasized}; ` +
    `--mo-rise: ${MOTION.distance.rise}px; --mo-lift: ${MOTION.distance.lift}px; --mo-press: ${MOTION.scale.press}; --mo-pop: ${MOTION.scale.pop};`;
}

export const MOTION_CSS = `
:root { ${motionVars()} }
.mo-press { transition: transform var(--mo-fast) var(--mo-ease-out), opacity var(--mo-fast) var(--mo-ease-out); }
.mo-press.mo-pressed { transform: scale(var(--mo-press)); }
.mo-lift { transition: transform var(--mo-base) var(--mo-ease-out), box-shadow var(--mo-base) var(--mo-ease-out), border-color var(--mo-fast) var(--mo-ease-out), background-color var(--mo-fast) var(--mo-ease-out), color var(--mo-fast) var(--mo-ease-out); }
.mo-lift:hover:not([disabled]), .mo-lift:focus-visible { transform: translateY(calc(-1 * var(--mo-lift))); }
.mo-lift.mo-pressed { transform: scale(var(--mo-press)); }
.mo-hidden { opacity: 0; }
.mo-will-move { will-change: transform, opacity; }
@keyframes mo-ring { from { transform: scale(.6); opacity: .9; } to { transform: scale(1.6); opacity: 0; } }
.mo-ring::after { content: ""; position: absolute; inset: -6px; border-radius: inherit; border: 1.5px solid currentColor; opacity: 0; pointer-events: none; }
.mo-ring.mo-ring--on::after { animation: mo-ring var(--mo-slow) var(--mo-ease-out) 1; }
@keyframes mo-dash { to { stroke-dashoffset: 0; } }
.mo-draw { stroke-dasharray: var(--mo-length, 1000); stroke-dashoffset: var(--mo-length, 1000); animation: mo-dash var(--mo-screen) var(--mo-ease-in-out) forwards; }
html[data-motion="reduce"] .mo-press.mo-pressed, html[data-motion="reduce"] .mo-lift.mo-pressed { transform: none; opacity: .82; }
html[data-motion="reduce"] .mo-lift:hover, html[data-motion="reduce"] .mo-lift:focus-visible { transform: none; }
html[data-motion="reduce"] .mo-ring.mo-ring--on::after { animation: none; }
html[data-motion="reduce"] .mo-draw { animation: none; stroke-dashoffset: 0; }
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion="full"]) .mo-press.mo-pressed, html:not([data-motion="full"]) .mo-lift.mo-pressed { transform: none; opacity: .82; }
  html:not([data-motion="full"]) .mo-lift:hover, html:not([data-motion="full"]) .mo-lift:focus-visible { transform: none; }
  html:not([data-motion="full"]) .mo-ring.mo-ring--on::after { animation: none; }
  html:not([data-motion="full"]) .mo-draw { animation: none; stroke-dashoffset: 0; }
}
`;

/** Injects the motion stylesheet once per document. Safe without a DOM (returns false). */
export function installMotionStyles(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return false;
  if (doc.getElementById && doc.getElementById('ftf-motion-style')) return true;
  const style = doc.createElement('style');
  style.id = 'ftf-motion-style';
  style.textContent = MOTION_CSS;
  doc.head.appendChild(style);
  return true;
}

/** A ring flash on an element (the seal, a placed stake, a confirmed button). Needs `position: relative` or similar. */
export function ringFlash(el, o = {}) {
  if (!el || !el.classList) return;
  el.classList.add('mo-ring'); el.classList.remove('mo-ring--on');
  // restart the animation on repeated flashes
  void (el.offsetWidth);
  el.classList.add('mo-ring--on');
  const doc = o.doc || el.ownerDocument; const win = (doc && doc.defaultView) || globalThis;
  (win.setTimeout || setTimeout)(() => el.classList.remove('mo-ring--on'), MOTION.duration.slow + 50);
}

/** Prepares an SVG path/line for a draw-on (`.mo-draw` animates its dash offset to 0). */
export function drawOn(pathEl, length) {
  if (!pathEl) return;
  const len = length ?? (typeof pathEl.getTotalLength === 'function' ? pathEl.getTotalLength() : 1000);
  if (pathEl.style) pathEl.style.setProperty('--mo-length', String(len));
  if (pathEl.classList) { pathEl.classList.remove('mo-draw'); void (pathEl.getBBox && pathEl.getBBox()); pathEl.classList.add('mo-draw'); }
}
