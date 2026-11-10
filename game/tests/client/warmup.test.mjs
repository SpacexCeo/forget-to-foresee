// GPU warm-up before a streamed model replaces its greybox (render/warmup.js, docs/smoothness.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeFrameBatch, planStreaming } from '../../src/render/streaming.js';
import { GpuWarmup, collectTextures, textureBytes, warmModel, setActiveWarmup } from '../../src/render/warmup.js';

const MB = 1024 * 1024;
const tex = (bytes) => ({ isTexture: true, isCompressedTexture: true, image: { width: 4, height: 4 }, mipmaps: [{ data: { byteLength: bytes } }] });
const model = (...textures) => {
  const meshes = textures.map((t) => ({ material: { map: t, color: {} } }));
  return { traverse: (fn) => meshes.forEach(fn) };
};
function fakeRenderer({ compileMs = 0, parallel = true } = {}) {
  const r = { uploads: [], compiled: [], targets: [], current: 'screen', extensions: { has: (name) => parallel && name === 'KHR_parallel_shader_compile' } };
  r.initTexture = (t) => r.uploads.push(t);
  r.getRenderTarget = () => r.current;
  r.setRenderTarget = (t) => { r.current = t; };
  r.compileAsync = (root) => { r.compiled.push(root); r.targets.push(r.current); return new Promise((res) => setTimeout(res, compileMs)); };
  return r;
}

test('takeFrameBatch: fills the byte budget in order and always moves at least one item', () => {
  assert.equal(takeFrameBatch([8, 8, 8, 8], 24), 3);
  assert.equal(takeFrameBatch([30, 1], 24), 1, 'an item above the whole budget still goes alone');
  assert.equal(takeFrameBatch([30, 1], 24, { atLeastOne: false }), 0);
  assert.equal(takeFrameBatch([10, 20, 1], 24), 1, 'order is kept: no skipping ahead to a smaller item');
  assert.equal(takeFrameBatch([], 24), 0);
});

test('collectTextures: unique textures across materials; textureBytes: compressed mip chain or RGBA estimate', () => {
  const a = tex(5 * MB), b = tex(3 * MB);
  assert.deepEqual(collectTextures(model(a, b, a)), [a, b]);
  assert.equal(textureBytes(a), 5 * MB);
  assert.equal(textureBytes({ image: { width: 1024, height: 1024 } }), Math.round(1024 * 1024 * 4 * 1.34));
});

test('GpuWarmup: textures upload within the frame budget, then programs compile, then the promise resolves', async () => {
  const r = fakeRenderer();
  const w = new GpuWarmup({ renderer: r, camera: {}, scene: {}, target: () => 'post-target', frameBytes: 16 * MB });
  const root = model(tex(8 * MB), tex(8 * MB), tex(8 * MB), tex(8 * MB), tex(8 * MB));
  let done = false;
  const p = w.warm(root).then(() => { done = true; });
  assert.equal(r.uploads.length, 0, 'nothing happens outside a frame');
  w.update(); assert.equal(r.uploads.length, 2);
  w.update(); assert.equal(r.uploads.length, 4);
  assert.equal(r.compiled.length, 0, 'programs wait for the last texture');
  w.update(); assert.equal(r.uploads.length, 5);
  assert.deepEqual(r.compiled, [root]);
  assert.deepEqual(r.targets, ['post-target'], 'compiled for the render target the scene is drawn into');
  assert.equal(r.current, 'screen', 'the previous render target is restored');
  assert.equal(done, false);
  await p;
  assert.equal(done, true);
  assert.equal(w.pending, 0);
  assert.equal(w.stats.warmed, 1);
});

test('GpuWarmup: one frame budget is shared between queued models, in arrival order', async () => {
  const r = fakeRenderer();
  const w = new GpuWarmup({ renderer: r, camera: {}, scene: {}, frameBytes: 10 * MB });
  const a = model(tex(6 * MB)), b = model(tex(6 * MB)), c = model();
  const order = [];
  const all = Promise.all([w.warm(a).then(() => order.push('a')), w.warm(b).then(() => order.push('b')), w.warm(c).then(() => order.push('c'))]);
  w.update();
  assert.equal(r.uploads.length, 1, 'the second 6 MB texture does not fit this frame');
  assert.deepEqual(r.compiled, [a]);
  w.update();
  assert.deepEqual(r.compiled, [a, b, c], 'a model without textures follows in the same frame');
  await all;
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('GpuWarmup: a compile that never finishes or throws does not hold the model back', async () => {
  const r = fakeRenderer();
  r.compileAsync = () => new Promise(() => {});
  const w = new GpuWarmup({ renderer: r, camera: {}, scene: {}, compileTimeout: 20 });
  const p = w.warm(model(tex(MB)));
  w.update();
  await p;
  r.compileAsync = () => { throw new Error('context lost'); };
  const warn = console.warn; console.warn = () => {};
  try { const q = w.warm(model()); w.update(); await q; } finally { console.warn = warn; }
  assert.equal(r.current, 'screen');
  assert.equal(w.stats.warmed, 2);
});

test('GpuWarmup: without parallel shader compile only the textures are staged (a compile would block all the same)', async () => {
  const r = fakeRenderer({ parallel: false });
  const w = new GpuWarmup({ renderer: r, camera: {}, scene: {} });
  const p = w.warm(model(tex(MB)));
  w.update();
  await p;
  assert.equal(r.uploads.length, 1);
  assert.equal(r.compiled.length, 0);
});

test('warmModel: resolves at once without a queue, goes through the active queue otherwise', async () => {
  setActiveWarmup(null);
  await warmModel(model());
  const r = fakeRenderer();
  const w = new GpuWarmup({ renderer: r, camera: {}, scene: {} });
  setActiveWarmup(w);
  const root = model(tex(MB));
  const p = warmModel(root);
  w.update();
  await p;
  assert.deepEqual(r.compiled, [root]);
  setActiveWarmup(null);
});

test('planStreaming: a warming asset holds no download slot and is neither reloaded, attached nor released', () => {
  const plan = planStreaming([
    { name: 'camp', state: 'warming', priority: 120, unwantedFor: 0 },
    { name: 'gone', state: 'warming', priority: -1, unwantedFor: 30 },
    { name: 'a', state: 'idle', priority: 110, unwantedFor: 0 },
    { name: 'b', state: 'idle', priority: 105, unwantedFor: 0 },
    { name: 'c', state: 'loading', priority: 101, unwantedFor: 0 },
  ], { maxConcurrent: 3 });
  assert.deepEqual(plan, { load: ['a', 'b'], attach: [], release: [] });
});
