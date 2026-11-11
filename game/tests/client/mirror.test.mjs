// Asset mirror and the slow-link gate (owner, 11.11: a player in China saw the greybox): jsDelivr fallback with a
// sticky switch, China time zones start on the mirror, files over 20 MiB never use it; no Google Fonts; the town is
// never revealed half-loaded; players never see Iris's greybox capsule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMirrorFetch, mirrorUrl, preferMirrorAtStart, DEFAULT_MIRROR, MIRROR_MAX_BYTES, MIRROR_STICKY_KEY } from '../../src/render/mirror.js';
import { irisStandInVisible } from '../../src/render/streaming.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('mirror URLs and the start choice', () => {
  assert.equal(mirrorUrl('/forget-to-foresee/assets/models/town_inn_m.glb?v=12', '/forget-to-foresee/'), DEFAULT_MIRROR + 'assets/models/town_inn_m.glb?v=12');
  assert.equal(mirrorUrl('https://elsewhere.example/x.glb', '/forget-to-foresee/'), null);
  assert.equal(mirrorUrl('/other/x.glb', '/forget-to-foresee/'), null);
  assert.equal(preferMirrorAtStart({ timeZone: 'Asia/Shanghai' }), true);
  assert.equal(preferMirrorAtStart({ timeZone: 'Europe/Kyiv' }), false);
  assert.equal(preferMirrorAtStart({ timeZone: 'Asia/Shanghai', param: '0' }), false);
  assert.equal(preferMirrorAtStart({ param: '1' }), true);
  assert.equal(preferMirrorAtStart({ sticky: '1' }), true);
});

test('the page host first; an error switches to the mirror for good; big files never use it', async () => {
  const calls = [];
  let pagesUp = false;
  const fetch = async (url) => { calls.push(url); if (url.startsWith('https://cdn.jsdelivr.net/')) return { ok: true, status: 200 }; if (!pagesUp) throw new TypeError('network'); return { ok: true, status: 200 }; };
  const storage = memoryStorage();
  const m = createMirrorFetch({ base: '/b/', fetch, storage, timeoutMs: 1000 });
  assert.equal(m.onMirror, false);
  await m.fetch('/b/assets/models/a.glb', 1000);
  assert.deepEqual(calls, ['/b/assets/models/a.glb', DEFAULT_MIRROR + 'assets/models/a.glb']);
  assert.equal(m.onMirror, true); assert.equal(storage.getItem(MIRROR_STICKY_KEY), '1');
  calls.length = 0; pagesUp = true;
  await m.fetch('/b/assets/models/b.glb', 1000);
  assert.deepEqual(calls, [DEFAULT_MIRROR + 'assets/models/b.glb'], 'sticky: straight to the mirror');
  calls.length = 0;
  await m.fetch('/b/assets/models/huge.glb', MIRROR_MAX_BYTES + 1);
  assert.deepEqual(calls, ['/b/assets/models/huge.glb']);
  // a timeout counts as a failure
  const slow = createMirrorFetch({ base: '/b/', timeoutMs: 20, fetch: (url, init) => (url.startsWith('/b/') ? new Promise((_, rej) => init && init.signal && init.signal.addEventListener('abort', () => rej(new Error('aborted')))) : Promise.resolve({ ok: true, status: 200 })) });
  const r = await slow.fetch('/b/assets/models/c.glb', 10);
  assert.equal(r.ok, true); assert.equal(slow.onMirror, true);
  // no mirror configured: plain fetch
  const off = createMirrorFetch({ base: '/b/', mirror: null, fetch: async (u) => ({ ok: true, url: u }) });
  assert.equal((await off.fetch('/b/x.glb')).url, '/b/x.glb');
});

test('no Google Fonts, no half-loaded reveal, no greybox capsule for players', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
  const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /@fontsource\/cormorant-garamond/);
  assert.ok(!/waited > \(town \? 30000/.test(main), 'the town gate has no forced reveal');
  assert.match(main, /Slow connection: loading the light assets/);
  assert.equal(irisStandInVisible({ hasModel: true, failed: true, waited: 60, players: true }), false);
  assert.equal(irisStandInVisible({ hasModel: true, fetched: false, waited: 60, players: true }), false);
  assert.equal(irisStandInVisible({ hasModel: false, players: true }), true);
  assert.equal(irisStandInVisible({ hasModel: true, failed: true }), true, 'dev builds keep the old greybox');
  const assets = readFileSync(new URL('../../src/render/assets.js', import.meta.url), 'utf8');
  assert.match(assets, /mirrorFetch\.fetch\(url, MODEL_FILES\[name\]/);
});
