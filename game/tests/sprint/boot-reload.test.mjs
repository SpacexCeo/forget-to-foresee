// Boot robustness: a chunk that failed to load during boot (a Pages redeploy swapped the hashed chunks) reloads the
// page once before the "Something went wrong" screen; the sessionStorage guard means a second failure never loops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootFailure, guardedReload, RELOAD_KEY, RELOAD_WINDOW_MS } from '../../src/sprint/retry-import.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const fakeWin = () => {
  const w = { replaced: [], document: null };
  w.location = { href: 'https://x.test/forget-to-foresee/?lang=en', replace: (u) => w.replaced.push(u), reload: () => w.replaced.push('reload') };
  return w;
};
const CHUNK = new TypeError('Failed to fetch dynamically imported module: https://x.test/assets/boot-world-abc123.js');
const fast = (o) => guardedReload({ ...o, delayMs: 0 });
const tick = () => new Promise((r) => setTimeout(r, 5));

test('boot reload guard: a chunk error reloads once, a second boot failure shows the error screen', async () => {
  const store = memStore(), now = 1_000_000;
  const w1 = fakeWin();
  assert.equal(bootFailure(CHUNK, { win: w1, store, now, reload: fast }), 'reload');
  assert.equal(store.getItem(RELOAD_KEY), String(now));
  await tick();
  assert.equal(w1.replaced.length, 1);
  assert.match(w1.replaced[0], /[?&]v=1000000/);
  // the reloaded page fails again inside the guard window: no second reload, the caller shows the screen
  const w2 = fakeWin();
  assert.equal(bootFailure(CHUNK, { win: w2, store, now: now + 10_000, reload: fast }), 'fail');
  await tick();
  assert.equal(w2.replaced.length, 0);
  // a later deploy, after the window, may reload once more
  assert.equal(bootFailure(CHUNK, { win: fakeWin(), store, now: now + RELOAD_WINDOW_MS + 1, reload: fast }), 'reload');
  await tick();
});

test('boot reload guard: other errors fail at once; a pending reload keeps the loading screen', () => {
  let calls = 0;
  const reload = () => { calls++; return true; };
  assert.equal(bootFailure(new Error('WebGL context lost'), { win: fakeWin(), reload }), 'fail');
  assert.equal(calls, 0);
  const w = fakeWin(); w.__ftfReloadPending = true;
  assert.equal(bootFailure(CHUNK, { win: w, reload }), 'reload');
  assert.equal(calls, 0);
  assert.equal(bootFailure(CHUNK, { win: fakeWin(), reload: () => { throw new Error('boom'); } }), 'fail');
});
