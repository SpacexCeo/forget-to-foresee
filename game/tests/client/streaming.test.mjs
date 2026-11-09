// Asset streaming policy (src/render/streaming.js) and asset naming rules (src/render/asset-catalog.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instancePriority, assetPriority, planStreaming, LruCache } from '../../src/render/streaming.js';
import { ASSETS, classifyNodeName, classifyPath, isValidModelName, modelUrl, versionedModelUrl, socketRole, assetByName } from '../../src/render/asset-catalog.js';

test('on-screen instances outrank off-screen ones; larger apparent size first', () => {
  const near = instancePriority({ inFrustum: true, distance: 5, radius: 1, loadDistance: 70 });
  const far = instancePriority({ inFrustum: true, distance: 50, radius: 1, loadDistance: 70 });
  const bigFar = instancePriority({ inFrustum: true, distance: 50, radius: 20, loadDistance: 300 });
  const prefetch = instancePriority({ inFrustum: false, distance: 2, radius: 1, loadDistance: 70, focusDistance: 3, prefetchRadius: 12 });
  assert.ok(near > far, 'near before far');
  assert.ok(bigFar > far, 'a Shell 50 m away before a small prop 50 m away');
  assert.ok(far > prefetch, 'anything on screen before prefetch');
  assert.ok(prefetch >= 0, 'off-screen but around the player is prefetched');
});

test('not wanted: off screen and outside the prefetch radius, or beyond the load distance', () => {
  assert.equal(instancePriority({ inFrustum: false, distance: 5, radius: 1, loadDistance: 70, focusDistance: 30, prefetchRadius: 12 }), -1);
  assert.equal(instancePriority({ inFrustum: true, distance: 80, radius: 1, loadDistance: 70 }), -1);
  assert.equal(assetPriority([-1, -1]), -1);
  assert.equal(assetPriority([-1, 3, 101]), 101);
});

test('plan loads by priority within the concurrency limit', () => {
  const plan = planStreaming([
    { name: 'shard', state: 'idle', priority: 100.2, unwantedFor: 0 },
    { name: 'island', state: 'idle', priority: 105, unwantedFor: 0 },
    { name: 'anchor', state: 'idle', priority: 101, unwantedFor: 0 },
    { name: 'camp_moh', state: 'idle', priority: -1, unwantedFor: 0 },
    { name: 'shell_1', state: 'absent', priority: 120, unwantedFor: 0 },
  ], { maxConcurrent: 2 });
  assert.deepEqual(plan.load, ['island', 'anchor']);
  const busy = planStreaming([
    { name: 'island', state: 'loading', priority: 105, unwantedFor: 0 },
    { name: 'anchor', state: 'idle', priority: 101, unwantedFor: 0 },
    { name: 'shard', state: 'idle', priority: 100.2, unwantedFor: 0 },
  ], { maxConcurrent: 2 });
  assert.deepEqual(busy.load, ['anchor'], 'one slot left');
});

test('release only after the grace period; cached templates re-attach when wanted again', () => {
  const plan = planStreaming([
    { name: 'a', state: 'loaded', priority: -1, unwantedFor: 9 },
    { name: 'b', state: 'loaded', priority: -1, unwantedFor: 2 },
    { name: 'c', state: 'loaded', priority: 50, unwantedFor: 0 },
    { name: 'd', state: 'cold', priority: 100, unwantedFor: 0 },
    { name: 'e', state: 'cold', priority: -1, unwantedFor: 30 },
  ], { releaseAfter: 8 });
  assert.deepEqual(plan.release, ['a']);
  assert.deepEqual(plan.attach, ['d']);
});

test('LRU evicts cold templates least recently used first and never evicts hot ones', () => {
  const lru = new LruCache(100);
  lru.touch('island', 60); lru.touch('anchor', 40); lru.touch('shard', 30);
  assert.equal(lru.bytes, 130);
  assert.deepEqual(lru.evict(), [], 'all hot: over budget but nothing evictable');
  lru.cool('island'); lru.cool('shard');
  lru.touch('island');                       // used again: becomes hot and most recent
  assert.deepEqual(lru.evict(), ['shard']);
  assert.equal(lru.bytes, 100);
  lru.cool('anchor'); lru.cool('island');
  lru.maxBytes = 50;
  assert.deepEqual(lru.evict(), ['anchor', 'island'], 'anchor was touched before island');
  assert.equal(lru.bytes, 0);
});

test('catalog has the exact brief filenames', () => {
  const names = ASSETS.map((a) => a.name).sort();
  assert.deepEqual(names, ['anchor', 'camp_iney', 'camp_iris', 'camp_moh', 'camp_pepel', 'camp_sol', 'camp_yantar', 'island',
    'scroll_table', 'shard', 'shell_1', 'shell_2', 'shell_3', 'shell_4', 'shell_interior']);
  assert.equal(assetByName('anchor').kind, 'hero');
  assert.equal(assetByName('nope'), null);
});

test('model names are restricted to [a-z0-9_]', () => {
  for (const ok of ['anchor', 'shell_1', 'camp_iney']) assert.ok(isValidModelName(ok), ok);
  for (const bad of ['../secret', 'Anchor', 'a.glb', 'a/b', '', 'x'.repeat(65), 'a b', 'a%2e', null]) assert.equal(isValidModelName(bad), false, String(bad));
  assert.equal(modelUrl('anchor'), '/assets/models/anchor.glb');
  assert.throws(() => modelUrl('../x'));
  assert.equal(versionedModelUrl('agent_iris', '/x/', 8043676), '/x/assets/models/agent_iris.glb?v=8043676', 'a new build of a model gets a new URL');
  assert.equal(versionedModelUrl('anchor', '/', undefined), '/assets/models/anchor.glb');
});

test('node name conventions: runtime, _inspect, _col, socket_*', () => {
  assert.equal(classifyNodeName('anchor'), 'runtime');
  assert.equal(classifyNodeName('anchor_inspect'), 'inspect');
  assert.equal(classifyNodeName('anchor_fin_a_col'), 'collision');
  assert.equal(classifyNodeName('anchor_body_col001'), 'collision', 'three.js strips the dot of .001');
  assert.equal(classifyNodeName('anchor_body_col.002'), 'collision');
  assert.equal(classifyNodeName('socket_shell_front'), 'socket');
  assert.equal(classifyNodeName('collar'), 'runtime');
  assert.equal(classifyNodeName('anchor_column'), 'runtime');
  assert.equal(classifyPath(['anchor_inspect', 'anchor_inspect_1']), 'inspect', 'child primitive inherits');
  assert.equal(classifyPath(['anchor', 'anchor_cap_col']), 'collision');
});

test('socket roles come from glTF extras first, then from the name', () => {
  assert.equal(socketRole('socket_shell_front', { socket: 'shell_number', pad_size_m: [0.094, 0.112] }), 'shell_number');
  assert.equal(socketRole('socket_tick_back'), 'tick');
  assert.equal(socketRole('socket_shell_back'), 'shell_number');
  assert.equal(socketRole('socket_beacon'), 'beacon');
});
