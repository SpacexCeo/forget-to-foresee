// The first seconds (docs/first-seconds.md): the boot plan, the loading screen's progress model and the
// byte-aware streaming priority. Pure and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlan, bootProgress, trickle, firstFrameBudget, BOOT_WEIGHTS, createLoadingScreen } from '../../src/ui/loading.js';
import { instancePriority, byteFactor, planStreaming } from '../../src/render/streaming.js';
import { chunkFor, ENTRY_MODULES } from '../../build/chunks.js';

const MB = 1048576;

test('boot plan: the lobby first unless the URL or a touch device goes straight into the world', () => {
  assert.deepEqual(bootPlan({}), { first: 'lobby', lobby: true, gate: 'lobby', background: ['world'] });
  assert.equal(bootPlan({ play: 'direct' }).first, 'world');
  assert.equal(bootPlan({ hash: '#play' }).first, 'world');
  assert.equal(bootPlan({ coarse: true }).gate, 'firstFrame');
  assert.equal(bootPlan({ play: 'direct' }).lobby, false);
});

test('boot progress: chunks alone on the lobby path, chunks 35 % + bytes 65 % on the direct path, clamped', () => {
  assert.equal(bootProgress({ chunksDone: 1, chunksTotal: 2 }), 0.5);
  assert.equal(bootProgress({ chunksDone: 3, chunksTotal: 2 }), 1);
  assert.equal(bootProgress({ chunksDone: 0, chunksTotal: 0 }), 1, 'nothing to load is done');
  const p = bootProgress({ chunksDone: 2, chunksTotal: 2, bytesGot: 5 * MB, bytesPlanned: 10 * MB });
  assert.ok(Math.abs(p - (BOOT_WEIGHTS.chunks + BOOT_WEIGHTS.bytes * 0.5)) < 1e-9);
  assert.equal(bootProgress({ chunksDone: 2, chunksTotal: 2, bytesGot: 99 * MB, bytesPlanned: 10 * MB }), 1);
  assert.ok(BOOT_WEIGHTS.chunks + BOOT_WEIGHTS.bytes === 1);
});

test('trickle: never goes back, breathes while a download is silent, tracks real progress within a second, holds the cap', () => {
  let s = 0.04; const seen = [s];
  for (let i = 0; i < 60; i++) { s = trickle(s, 0, 50); seen.push(s); }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
  assert.ok(s > 0.15 && s < 0.35, 'visible movement after 3 s of silence: ' + s.toFixed(3));
  for (let i = 0; i < 2000; i++) s = trickle(s, 0, 50);
  assert.ok(s <= 0.94 + 1e-9 && s > 0.9, 'silent forever stops at the cap: ' + s.toFixed(3));
  let r = 0.04; for (let i = 0; i < 20; i++) r = trickle(r, 0.8, 50);
  assert.ok(Math.abs(r - 0.8) < 0.01, 'reaches a real 0.8 within a second: ' + r.toFixed(3));
  assert.equal(trickle(0.5, 0.2, 50) >= 0.5, true, 'a lower real value never pulls the ring back');
  assert.equal(trickle(1, 1, 50), 1);
});

test('first-frame budget: the cheap visible set in priority order, no single file above 8 MB, capped at 16 MB and 6 items', () => {
  const rows = [
    { name: 'scroll_table', priority: 106, bytes: 19.9 * MB }, { name: 'island', priority: 105, bytes: 6.6 * MB },
    { name: 'camp_iris', priority: 104, bytes: 6.7 * MB }, { name: 'anchor', priority: 103, bytes: 18.9 * MB },
    { name: 'shell_1', priority: 102, bytes: 5 * MB }, { name: 'prop_a', priority: 101, bytes: 0.4 * MB },
    { name: 'prop_b', priority: 100.5, bytes: 0.3 * MB }, { name: 'prop_c', priority: 100.2, bytes: 0.2 * MB }, { name: 'prop_d', priority: 100.1, bytes: 0.1 * MB },
    { name: 'far', priority: 1, bytes: 1 * MB }, { name: 'hidden', priority: -1, bytes: 0 },
  ];
  const b = firstFrameBudget(rows);
  assert.ok(!b.names.includes('scroll_table') && !b.names.includes('anchor'), 'the 20 MB heroes stream behind their stand-ins');
  assert.deepEqual(b.names.slice(0, 2), ['island', 'camp_iris']);
  assert.ok(b.names.length <= 6 && b.bytes <= 16 * MB, JSON.stringify(b));
  assert.ok(!b.names.includes('far') && !b.names.includes('hidden'));
  assert.deepEqual(firstFrameBudget([]), { names: [], bytes: 0 });
});

test('byte-aware priority: visible first, then apparent size weighted by size; a 20 MB hero yields to a 6 MB camp of similar size on screen', () => {
  assert.equal(byteFactor(2 * MB), 1); assert.equal(byteFactor(undefined), 1);
  assert.ok(Math.abs(byteFactor(16 * MB) - 0.5) < 1e-9 && byteFactor(20 * MB) < 0.5 && byteFactor(20 * MB) > 0.4);
  const base = { inFrustum: true, distance: 40, loadDistance: 110 };
  const hero = instancePriority({ ...base, radius: 8, bytes: 20 * MB });
  const camp = instancePriority({ ...base, radius: 7, bytes: 6.6 * MB });
  const tiny = instancePriority({ ...base, radius: 0.5, bytes: 0.2 * MB });
  assert.ok(camp > hero, `camp ${camp.toFixed(2)} before the hero ${hero.toFixed(2)}`);
  assert.ok(hero > tiny, 'but a hero that fills the screen still beats a pebble');
  assert.ok(hero >= 100 && camp >= 100 && tiny >= 100, 'all visible');
  const off = instancePriority({ ...base, inFrustum: false, radius: 8, bytes: 20 * MB, focusDistance: 5, prefetchRadius: 14 });
  assert.ok(off > 0 && off < 100, 'off screen inside the prefetch radius stays below every visible asset');
  assert.equal(instancePriority({ ...base, inFrustum: false, radius: 8, focusDistance: 50, prefetchRadius: 14 }), -1);
});

test('three downloads at once: the plan fills the free slots by priority', () => {
  const rows = [
    { name: 'a', state: 'idle', priority: 105, unwantedFor: 0 }, { name: 'b', state: 'loading', priority: 104, unwantedFor: 0 },
    { name: 'c', state: 'idle', priority: 103, unwantedFor: 0 }, { name: 'd', state: 'idle', priority: 102, unwantedFor: 0 }, { name: 'e', state: 'idle', priority: 101, unwantedFor: 0 },
  ];
  assert.deepEqual(planStreaming(rows, { maxConcurrent: 3 }).load, ['a', 'c']);
  assert.deepEqual(planStreaming(rows, { maxConcurrent: 2 }).load, ['a']);
});

test('loading screen controller: safe without a DOM, finishes once, progress never decreases', async () => {
  const s = createLoadingScreen(null);
  assert.equal(s.shown > 0, true);
  s.set(0.5, 'x'); s.set(0.2);
  assert.equal(s.finished, false);
  await s.finish(); assert.equal(s.finished, true); assert.equal(s.shown, 1);
  await s.finish(); s.fail('boom'); s.destroy();
});

test('chunk plan: entry modules never join a shared chunk (the UI preview mounted its own lobby inside the game)', () => {
  const root = '/repo/game';
  for (const e of ENTRY_MODULES) assert.equal(chunkFor(root + e), undefined, e);
  assert.equal(chunkFor(root + '/src/ui/preview.js?v=1'), undefined);
  assert.equal(chunkFor(root + '/src/ui/lobby.js'), 'ui');
  assert.equal(chunkFor(root + '/src/ui/world-hud/index.js'), 'play');
});

test('chunk plan: the graph stays acyclic (rules with ui, logogram with client-core, loading with boot)', () => {
  const root = '/repo/game';
  assert.equal(chunkFor(root + '/src/game/engine.js'), 'ui'); // ui modules read engine tables at module level
  assert.equal(chunkFor(root + '/src/play/logogram.js'), 'client-core'); // scenes draw logograms
  assert.equal(chunkFor(root + '/src/play/game.js'), 'play');
  assert.equal(chunkFor(root + '/src/ui/loading.js'), 'boot');
  assert.equal(chunkFor(root + '/src/ui/motion/index.js'), 'boot');
  assert.equal(chunkFor(root + '/node_modules/vite/preload-helper.js'), 'boot');
  assert.equal(chunkFor(root + '/src/ui/styles.css'), undefined);
  assert.equal(chunkFor(root + '/src/play/locales/en.js'), 'locales');
  assert.equal(chunkFor(root + '/src/render/streaming.js'), 'client-core');
  assert.equal(chunkFor(root + '/node_modules/three/build/three.module.js'), 'three');
});
