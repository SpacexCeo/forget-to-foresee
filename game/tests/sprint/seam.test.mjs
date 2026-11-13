// Sprint seam (src/sprint, sprint plan 3.2, 8.11): bus + telemetry, markers, tooltip placement, first-seen queue and
// persistence, registry (flag off = not loaded; a throwing module does not break the others), retryImport (retries,
// reload guard), demo seed (only with the query, never fakes on-chain silk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { emit, on, once, state, _reset as resetBus } from '../../src/sprint/bus.js';
import { setMarkers, getMarkers, onMarkers, _reset as resetMarkers } from '../../src/sprint/markers.js';
import { placeTooltip } from '../../src/sprint/tooltip.js';
import { retryImport, canReload, RELOAD_KEY } from '../../src/sprint/retry-import.js';
import { seedFromQuery, SEEDS } from '../../src/sprint/demo-seed.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('bus: emit/on/once/off, * listener, telemetry ring of 500, keyed state', () => {
  resetBus(); const got = [];
  const off = on('a', (p) => got.push(['a', p.n])); once('a', (p) => got.push(['once', p.n])); on('*', (p, n) => got.push(['*', n]));
  emit('a', { n: 1 }); off(); emit('a', { n: 2 });
  assert.deepEqual(got, [['a', 1], ['once', 1], ['*', 'a'], ['*', 'a']]);
  for (let i = 0; i < 600; i++) emit('x', { i });
  assert.equal(globalThis.__ftfTelemetry.length, 500); assert.equal(globalThis.__ftfTelemetry.at(-1).payload.i, 599);
  const seen = []; const un = state.sub('k', (v) => seen.push(v)); state.set('k', 1); state.set('k', 1); state.set('k', 2); un(); state.set('k', 3);
  assert.deepEqual(seen, [1, 2]); assert.equal(state.get('k'), 3);
  on('boom', () => { throw new Error('x'); }); assert.doesNotThrow(() => emit('boom'));
});

test('markers: per-source lists, invalid dropped, pinned first, listeners', () => {
  resetMarkers(); const calls = []; onMarkers((l) => calls.push(l.length));
  setMarkers('quests', [{ id: 'q1', kind: 'quest-available', pos: [1, 2], label: 'Elder' }, { id: 'bad', kind: 'nope', pos: [0, 0], label: 'x' }]);
  setMarkers('portal', [{ id: 'p', kind: 'portal', pos: [5, 5], label: 'Gate-Loom', pinned: true }]);
  assert.deepEqual(getMarkers().map((m) => m.id), ['p', 'q1']); assert.deepEqual(calls, [1, 2]);
  setMarkers('quests', []); assert.deepEqual(getMarkers().map((m) => m.id), ['p']);
});

test('tooltip: stays inside the viewport, flips below when there is no room above', () => {
  const view = { width: 400, height: 300 };
  assert.deepEqual(placeTooltip({ left: 150, top: 200, bottom: 230, width: 100 }, { width: 120, height: 50 }, view), { left: 140, top: 142 });
  assert.equal(placeTooltip({ left: 10, top: 20, bottom: 40, width: 30 }, { width: 120, height: 50 }, view).top, 48);
  assert.equal(placeTooltip({ left: 380, top: 200, bottom: 220, width: 20 }, { width: 120, height: 50 }, view).left, 272);
});

test('first-seen: shows once, queue, Got it persists, Skip tips, reset, force', async () => {
  const { doc } = installDom(); resetBus();
  const fs = await import('../../src/sprint/first-seen.js'); fs._reset();
  const storage = memoryStorage(); fs._configure({ storage, doc });
  fs.registerTip({ id: 't1', trigger: 'quest.accepted', title: 'Your journal', body: 'Press J.' });
  fs.registerTip({ id: 't2', title: 'Second', body: 'B' });
  emit('quest.accepted', {});
  assert.equal(doc.body.querySelectorAll('.ftf-tip').length, 1);
  fs.showTip('t2'); assert.equal(doc.body.querySelectorAll('.ftf-tip').length, 1, 'queued behind t1');
  doc.body.querySelectorAll('.ftf-tip button').find((b) => b.textContent === 'Got it').click();
  assert.equal(doc.body.querySelectorAll('.ftf-tip')[0].textContent.includes('Second'), true, 't2 next');
  assert.equal(JSON.parse(storage.getItem(fs.TIPS_KEY)).seen.t1, true);
  assert.equal(fs.showTip('t1'), false, 'seen');
  doc.body.querySelectorAll('.ftf-tip button').find((b) => b.textContent === 'Skip tips').click();
  assert.equal(JSON.parse(storage.getItem(fs.TIPS_KEY)).off, true); assert.equal(fs.showTip('t2'), false);
  assert.equal(fs.showTip('t1', { force: true }), true, 'the ? handle');
  fs.resetTips(); assert.deepEqual(JSON.parse(storage.getItem(fs.TIPS_KEY)), { seen: {}, off: false });
  const tel = globalThis.__ftfTelemetry.map((e) => e.name); assert.ok(tel.includes('tip.shown') && tel.includes('tip.dismissed'));
});

test('registry: flag off = not loaded; a throwing module is reported and skipped', async () => {
  resetBus(); const loaded = [];
  const { mountSprint } = await import('../../src/sprint/index.js').catch(() => import('../../src/sprint/index.js'));
  const modules = [
    { id: 'a', flag: 'fa', load: async () => { loaded.push('a'); return { mount: () => ({ dispose() {} }) }; } },
    { id: 'b', flag: 'fb', load: async () => { loaded.push('b'); return { mount: () => { throw new Error('no'); } }; } },
    { id: 'c', flag: 'fc', load: async () => { loaded.push('c'); return { mount: () => ({ dispose() {}, update() { loaded.push('upd'); } }) }; } },
  ];
  const s = mountSprint({ flags: { on: (f) => f !== 'fa' } }, { modules, search: '', autoUpdate: false });
  assert.deepEqual(await s.ready, ['c']); assert.deepEqual(loaded, ['b', 'c']);
  s.update(0.016); assert.ok(loaded.includes('upd'));
  assert.ok(globalThis.__ftfTelemetry.some((e) => e.name === 'error.shown' && e.payload.area === 'b'));
  s.dispose();
});

test('retryImport: retries chunk errors, rethrows others at once, asks for the guarded reload', async () => {
  let n = 0, reloads = 0;
  const ok = await retryImport(async () => { if (++n < 3) throw new Error('Failed to fetch dynamically imported module'); return 'mod'; }, { wait: async () => {}, reload: () => reloads++ });
  assert.equal(ok, 'mod'); assert.equal(n, 3); assert.equal(reloads, 0);
  await assert.rejects(retryImport(async () => { throw new Error('Loading chunk 7 failed'); }, { wait: async () => {}, reload: () => reloads++ }));
  assert.equal(reloads, 1);
  let m = 0; await assert.rejects(retryImport(async () => { m++; throw new TypeError('x is not a function'); }, { wait: async () => {} })); assert.equal(m, 1);
  const s = memoryStorage(); assert.equal(canReload(s, 1e6), true); s.setItem(RELOAD_KEY, String(1e6)); assert.equal(canReload(s, 1e6 + 60_000), false); assert.equal(canReload(s, 1e6 + 6 * 60_000), true);
});

test('demo seed: only with the query; never fakes on-chain silk', () => {
  assert.equal(seedFromQuery(''), null); assert.equal(seedFromQuery('?demo=judge'), null); assert.equal(seedFromQuery('?demo=video'), 'video');
  assert.equal(SEEDS.video.level, 6); assert.equal(SEEDS.video.quests.active[0].count, 7);
  assert.ok(!JSON.stringify(SEEDS).includes('onChain'), 'the seed never sets on-chain silk');
});
