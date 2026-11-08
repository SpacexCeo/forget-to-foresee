// Motion design system (docs/motion.md): tokens, easings, springs, stagger, FLIP math, number tick-up, and the DOM
// helpers against a stub element (Web Animations API recorded, no layout properties ever animated), with and
// without reduced motion. Pure and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION, ease, createSpring, springSamples, springDuration, staggerDelay, flipDelta, tickValue, isReduced,
  enter, exit, stagger, crossfade, flip, tickNumber, press, seal, parallax, motionVars, MOTION_CSS, installMotionStyles, ringFlash, drawOn,
} from '../src/ui/motion/index.js';

/** A stub element: records animate() calls, has a style bag, a class set, listeners and a rect. */
function stub({ rect = { x: 0, y: 0, width: 100, height: 40 }, animate = true, doc = fakeDoc() } = {}) {
  const el = {
    style: {}, textContent: '', ownerDocument: doc, listeners: {}, calls: [], rect,
    classList: { set: new Set(), add(...c) { c.forEach((x) => this.set.add(x)); }, remove(...c) { c.forEach((x) => this.set.delete(x)); }, contains(c) { return this.set.has(c); } },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }, removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    fire(t, e = {}) { for (const fn of this.listeners[t] || []) fn(e); },
    getBoundingClientRect() { return this.rect; }, offsetWidth: 10,
  };
  el.style.setProperty = (k, v) => { el.style[k] = v; };
  if (animate) el.animate = (kf, opts) => { const a = { kf, opts, finished: Promise.resolve() }; el.calls.push(a); return a; };
  return el;
}
function fakeDoc(motion) {
  const head = { children: [], appendChild(n) { this.children.push(n); } };
  return { documentElement: { dataset: motion ? { motion } : {} }, head, createElement: (t) => ({ tag: t }), getElementById: (id) => head.children.find((c) => c.id === id) || null, defaultView: { requestAnimationFrame: (fn) => setTimeout(() => fn(), 0), performance: { now: () => Date.now() }, innerWidth: 1000, innerHeight: 500, matchMedia: () => ({ matches: false }) } };
}
const props = (kf) => new Set(kf.flatMap((k) => Object.keys(k).filter((p) => p !== 'offset' && p !== 'easing')));

test('tokens: UI durations within 120–400 ms, screens under 500 ms, easings are valid, distances small', () => {
  const d = MOTION.duration;
  for (const k of ['fast', 'base', 'slow']) assert.ok(d[k] >= 120 && d[k] <= 400, k);
  assert.ok(d.screen <= 500 && d.reduced <= 200 && d.instant === 0);
  for (const e of Object.values(MOTION.easing)) assert.match(e, /^(linear|cubic-bezier\(\s*[-\d.]+,\s*[-\d.]+,\s*[-\d.]+,\s*[-\d.]+\s*\))$/);
  assert.ok(MOTION.distance.rise <= 16 && MOTION.distance.lift <= 4 && MOTION.scale.press > 0.9 && MOTION.scale.press < 1);
  assert.ok(Object.isFrozen(MOTION) && Object.isFrozen(MOTION.duration));
});

test('easings: endpoints exact, monotonic (emphasized may overshoot by at most 4 %)', () => {
  for (const [name, f] of Object.entries(ease)) {
    assert.equal(f(0), 0, name); assert.equal(f(1), 1, name);
    let prev = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) { const v = f(t); assert.ok(v >= prev - 1e-9 || name === 'emphasized', name + ' monotonic at ' + t); prev = v; assert.ok(v <= 1.04 + 1e-9 && v >= -1e-9); }
    assert.equal(f(-1), 0); assert.equal(f(2), 1);
  }
  assert.ok(ease.out(0.3) > 0.7, 'expo-like out arrives fast');
});

test('springs: every token settles in under 1.2 s; snappy before gentle; settle overshoots once, gentle and snappy barely', () => {
  const dur = Object.fromEntries(Object.entries(MOTION.spring).map(([k, s]) => [k, springDuration(s)]));
  for (const v of Object.values(dur)) assert.ok(v > 0.2 && v < 1.2, JSON.stringify(dur));
  assert.ok(dur.snappy < dur.gentle);
  const peak = (s) => Math.max(...springSamples(s));
  assert.ok(peak(MOTION.spring.settle) > 1.08 && peak(MOTION.spring.settle) < 1.2, 'settle: one visible overshoot');
  assert.ok(peak(MOTION.spring.gentle) < 1.03 && peak(MOTION.spring.snappy) < 1.03);
  const sp = createSpring(MOTION.spring.snappy, 0, 10);
  let t = 0; while (!sp.done && t < 5) { sp.step(1 / 60); t += 1 / 60; }
  assert.ok(sp.done && sp.value === 10, 'stepper lands exactly on the target');
  sp.retarget(0); assert.equal(sp.done, false);
  const s = springSamples(MOTION.spring.gentle); assert.equal(s[0], 0); assert.equal(s[s.length - 1], 1);
});

test('stagger delays step per item and cap; FLIP delta; tick values ease to the exact end', () => {
  assert.equal(staggerDelay(0), 0); assert.equal(staggerDelay(3), 120); assert.equal(staggerDelay(50), MOTION.stagger.cap);
  assert.equal(staggerDelay(2, { step: 25 }), 50);
  const d = flipDelta({ x: 10, y: 20, width: 100, height: 50 }, { x: 30, y: 20, width: 200, height: 50 });
  assert.deepEqual([d.dx, d.dy, d.sx, d.sy, d.moved], [-20, 0, 0.5, 1, true]);
  assert.equal(flipDelta({ x: 1, y: 1, width: 10, height: 10 }, { x: 1.2, y: 1, width: 10, height: 10 }).moved, false);
  assert.equal(tickValue(0, 63, 1), 63); assert.equal(tickValue(0, 63, 0), 0);
  assert.ok(tickValue(0, 63, 0.5) > 31 && tickValue(0, 63, 0.5) < 63);
  assert.equal(tickValue(1, 2, 0.5, 2), Math.round((1 + ease.out(0.5)) * 100) / 100);
});

test('reduced motion resolves from the setting first, then the system', () => {
  assert.equal(isReduced(fakeDoc('reduce')), true);
  assert.equal(isReduced(fakeDoc('full')), false);
  assert.equal(isReduced(fakeDoc()), false, 'no matchMedia here: full');
  assert.equal(isReduced(null), false);
});

test('enter/exit: transforms and opacity only, fill backwards on enter, inline opacity 0 after exit, reduced = short fade', async () => {
  const el = stub();
  await enter(el, { from: 'rise' });
  assert.equal(el.calls.length, 1);
  const c = el.calls[0];
  assert.deepEqual([...props(c.kf)].sort(), ['opacity', 'transform']);
  assert.match(c.kf[0].transform, /translate3d\(0, 12px, 0\)/); assert.equal(c.kf[1].transform, 'none');
  assert.equal(c.opts.duration, MOTION.duration.base); assert.equal(c.opts.fill, 'backwards'); assert.equal(c.opts.easing, MOTION.easing.out);
  await exit(el, { to: 'drop' });
  assert.equal(el.calls[1].kf[1].transform, 'translate3d(0, 8px, 0)'); assert.equal(el.style.opacity, '0');
  await enter(el, { from: 'scale' });
  assert.equal(el.style.opacity, '', 'enter clears the inline exit state'); assert.match(el.calls[2].kf[0].transform, /scale\(0\.96\)/);
  const r = stub({ doc: fakeDoc('reduce') });
  await enter(r, { from: 'left', duration: 400 });
  assert.equal(r.calls[0].kf[0].transform, 'none', 'no movement under reduced motion'); assert.equal(r.calls[0].opts.duration, MOTION.duration.reduced);
  const none = stub({ animate: false });
  assert.equal(await enter(none), null, 'no WAAPI: resolves at once, final state is the stylesheet state');
  assert.equal(await enter(null), null);
});

test('stagger delays each item, crossfade pairs an exit with a delayed enter', async () => {
  const els = [stub(), stub(), stub(), stub()];
  await stagger(els, { from: 'drop' });
  assert.deepEqual(els.map((e) => e.calls[0].opts.delay), [0, 40, 80, 120]);
  await stagger(els, { delay: 100, step: 10 });
  assert.deepEqual(els.map((e) => e.calls[1].opts.delay), [100, 110, 120, 130]);
  const a = stub(), b = stub();
  await crossfade(a, b);
  assert.equal(a.calls[0].kf[1].opacity, 0); assert.equal(b.calls[0].opts.delay, 60); assert.equal(b.calls[0].kf[0].transform, 'none');
});

test('flip: applies the mutation, animates from the inverse transform, skips when nothing moved or motion is reduced', async () => {
  const el = stub();
  let mutated = false;
  await flip(el, () => { mutated = true; el.rect = { x: 40, y: 10, width: 100, height: 40 }; });
  assert.ok(mutated); assert.equal(el.calls.length, 1);
  assert.equal(el.calls[0].kf[0].transform, 'translate(-40px, -10px) scale(1, 1)'); assert.equal(el.calls[0].kf[1].transform, 'none');
  assert.equal(el.style.transformOrigin, '', 'origin restored');
  const still = stub(); await flip(still, () => {}); assert.equal(still.calls.length, 0);
  const red = stub({ doc: fakeDoc('reduce') }); let m2 = false;
  await flip(red, () => { m2 = true; red.rect = { x: 99, y: 0, width: 100, height: 40 }; }); assert.ok(m2); assert.equal(red.calls.length, 0);
});

test('tickNumber: eased, monotonic, lands on the exact value with the format; cancels a previous tick; reduced = instant', async () => {
  const el = stub(); el.textContent = '10';
  let clock = 0; const frames = [];
  const raf = (fn) => frames.push(fn); const now = () => clock;
  const p = tickNumber(el, 63, { duration: 300, raf, now, format: (n) => n + ' silk' });
  const seen = [el.textContent];
  while (frames.length) { clock += 50; const f = frames.shift(); f(); seen.push(el.textContent); }
  assert.equal(await p, '63 silk');
  const nums = seen.map((s) => parseInt(s, 10));
  for (let i = 1; i < nums.length; i++) assert.ok(nums[i] >= nums[i - 1], 'monotonic: ' + nums.join(','));
  assert.ok(nums.length >= 6 && nums[nums.length - 1] === 63);
  // a second call cancels the first
  const el2 = stub(); el2.textContent = '0';
  const frames2 = []; const p1 = tickNumber(el2, 100, { duration: 300, raf: (fn) => frames2.push(fn), now: () => 0 });
  const p2 = tickNumber(el2, 5, { duration: 0 });
  assert.equal(await p2, '5'); await p1; assert.equal(el2.textContent, '5');
  void frames2;
  const r = stub({ doc: fakeDoc('reduce') }); r.textContent = '1';
  assert.equal(await tickNumber(r, 9, { duration: 300 }), '9');
  const d = stub(); d.textContent = '1.5';
  assert.equal(await tickNumber(d, 2.25, { duration: 0, decimals: 2 }), '2.25');
});

test('press: toggles .mo-pressed on pointer and keyboard, unbinds cleanly', () => {
  const el = stub();
  const off = press(el);
  assert.ok(el.classList.contains('mo-press'));
  el.fire('pointerdown'); assert.ok(el.classList.contains('mo-pressed'));
  el.fire('pointerup'); assert.ok(!el.classList.contains('mo-pressed'));
  el.fire('keydown', { code: 'Space' }); assert.ok(el.classList.contains('mo-pressed'));
  el.fire('keyup'); assert.ok(!el.classList.contains('mo-pressed'));
  el.fire('keydown', { code: 'KeyA' }); assert.ok(!el.classList.contains('mo-pressed'));
  off(); el.fire('pointerdown'); assert.ok(!el.classList.contains('mo-pressed'));
  assert.equal(typeof press(null), 'function');
});

test('seal: a spring-sampled stamp with linear timing under 700 ms; reduced motion fades', async () => {
  const el = stub();
  await seal(el);
  const c = el.calls[0];
  assert.ok(c.kf.length > 10 && c.opts.easing === 'linear' && c.opts.duration <= MOTION.duration.seal);
  assert.match(c.kf[0].transform, /scale\(1\.35\)/); assert.equal(c.kf[c.kf.length - 1].transform, 'scale(1)');
  const r = stub({ doc: fakeDoc('reduce') }); await seal(r); assert.equal(r.calls[0].kf[0].transform, 'none');
});

test('parallax: moves layers by depth against the pointer (transform only), returns to rest, off under reduced motion', async () => {
  const doc = fakeDoc(); const cont = stub({ doc }); const a = stub({ doc }), b = stub({ doc });
  let frame = null; doc.defaultView.requestAnimationFrame = (fn) => { frame = fn; return 1; };
  const off = parallax(cont, [{ el: a, depth: 1 }, { el: b, depth: 0.5 }], { max: 10 });
  cont.fire('pointermove', { clientX: 1000, clientY: 250 }); // far right, middle
  for (let i = 0; i < 80 && frame; i++) { const f = frame; frame = null; f(); }
  assert.match(a.style.transform, /^translate3d\(-(9\.\d+|10\.00)px, (-?0\.0\d|0\.00)px, 0\)$/, a.style.transform);
  assert.match(b.style.transform, /^translate3d\(-(4\.\d+|5\.00)px/);
  cont.fire('pointerleave'); for (let i = 0; i < 80 && frame; i++) { const f = frame; frame = null; f(); }
  assert.match(a.style.transform, /^translate3d\((-?0\.0\d|0\.00)px/);
  off(); assert.equal(a.style.transform, '');
  const offR = parallax(stub({ doc: fakeDoc('reduce') }), [{ el: stub(), depth: 1 }]); assert.equal(typeof offR, 'function');
});

test('stylesheet: every token is a --mo-* variable, reduced-motion overrides exist, install is idempotent', () => {
  const vars = motionVars();
  for (const k of ['--mo-fast', '--mo-base', '--mo-slow', '--mo-screen', '--mo-ease-out', '--mo-ease-emphasized', '--mo-press', '--mo-lift']) assert.ok(vars.includes(k), k);
  assert.ok(MOTION_CSS.includes('html[data-motion="reduce"]') && MOTION_CSS.includes('prefers-reduced-motion'));
  assert.ok(!/\b(width|height|top|left|margin|padding):/.test(MOTION_CSS.replace(/inset: -6px;/, '')), 'no layout properties animated');
  const doc = fakeDoc();
  assert.equal(installMotionStyles(doc), true); assert.equal(installMotionStyles(doc), true);
  assert.equal(doc.head.children.length, 1); assert.equal(doc.head.children[0].id, 'ftf-motion-style');
  assert.equal(installMotionStyles(null), false);
  const el = stub(); ringFlash(el); assert.ok(el.classList.contains('mo-ring--on'));
  const path = stub(); path.getTotalLength = () => 120; drawOn(path); assert.equal(path.style['--mo-length'], '120'); assert.ok(path.classList.contains('mo-draw'));
});
