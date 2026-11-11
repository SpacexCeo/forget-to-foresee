// No synchronous GPU read-back on the play path (docs/hackathon-tz.md P0-F). A static check over the sources:
// the only read-backs are the capture runner (loaded with ?cinematic= only) and the sky LUT's one read per
// distinct atmosphere, which is cached; the Controls dialog opens before anything else runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
/** Source with comments removed, so prose about read-backs does not count. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const READBACK = /\b(readPixels|readRenderTargetPixels(Async)?|toDataURL|toBlob|getImageData)\s*\(/;

test('read-backs: outside the capture runner the only GPU read is the sky LUT, once per atmosphere', () => {
  const hits = walk(SRC).map((p) => relative(SRC, p).replace(/\\/g, '/')).filter((f) => READBACK.test(code(read(f))));
  // ui/postcard.js encodes its own 2D canvas (the share postcard) when Download is clicked: no WebGL, no frame loop
  const post = code(read('ui/postcard.js'));
  assert.match(post, /getContext\('2d'\)/);
  assert.doesNotMatch(post, /webgl|requestAnimationFrame/i);
  assert.match(post, /btn\('postcard\.download', \(\) => canvas\.toBlob/, 'encoded only from the Download button');
  // render/photo-mode.js (feature 9) copies one frame to a 2D canvas only when Save photo was pressed in photo mode
  const photo = code(read('render/photo-mode.js'));
  assert.match(photo, /btn\('ftf-photo-save', t\('photo\.save'\), \(\) => requestCapture\(\)\)/, 'a capture is asked only by the Save button');
  assert.match(photo, /function requestCapture\(\) \{ if \(state\.on\) state\.pending = true; \}/);
  assert.match(photo, /if \(!state\.pending\) return false;/, 'no pending capture: no read');
  assert.match(code(read('boot-world.js')), /if \(drawn && photo && photo\.pending\) photo\.capture\(\);/, 'the frame loop reads only a pending capture');
  const play = hits.filter((f) => !f.startsWith('cinematic/') && f !== 'ui/postcard.js' && f !== 'render/photo-mode.js');
  assert.deepEqual(play, ['render/sky.js'], 'no module on the play path reads the canvas or a render target back');
  const sky = code(read('render/sky.js'));
  assert.equal(sky.match(new RegExp(READBACK.source, 'g')).length, 1, 'one read-back site in sky.js');
  assert.match(sky, /let px = this\.lutCache\.get\(key\) \|\| null;\s*if \(!px\) \{[^}]*readRenderTargetPixels/, 'the read is skipped when this atmosphere was read before');
});

test('read-backs: the frame loop and the play layer never reach the capture runner', () => {
  for (const f of ['boot-world.js', 'play/game.js', 'play/hub-ui.js', 'play/world-hud.js', 'render/lookdev.js', 'render/post.js', 'render/warmup.js', 'render/hdr-guard.js', 'ui/scene-controls.js', 'ui/hologram/preview.js']) {
    const src = code(read(f));
    assert.ok(!/grabCanvas|regrab|ShotRunner/.test(src), `${f} does not call the capture grab`);
    assert.ok(!/from\s+['"][^'"]*cinematic\/(runner|index)\.js['"]/.test(src), `${f} does not import the capture runner`);
  }
  const main = code(read('main.js'));
  assert.match(main, /if \(params\.has\('cinematic'\)\) await import\('\.\/cinematic\/index\.js'\)/, 'the capture module loads only with ?cinematic=');
  assert.match(read('cinematic/runner.js'), /CAPTURE ONLY/);
});

test('read-backs: the sky LUT key covers exactly what the LUT depends on', async () => {
  const sky = read('render/sky.js');
  const body = sky.slice(sky.indexOf('export function lutKey'), sky.indexOf('}', sky.indexOf('export function lutKey')) + 1);
  for (const term of ['sun.x', 'sun.y', 'sun.z', 'preset.mie', 'preset.ozone', 'preset.altitude']) assert.ok(body.includes(term), `lutKey uses ${term}`);
  // the uniforms the LUT pass receives are the same inputs
  const set = sky.slice(sky.indexOf('  setAtmosphere(renderer, preset) {'), sky.indexOf('renderer.setRenderTarget(this.lut)'));
  assert.deepEqual([...set.matchAll(/u\.(u\w+)\.value/g)].map((m) => m[1]).sort(), ['uAlt', 'uMie', 'uOzone', 'uSunDir']);
});

test('Controls: the dialog is shown before the world transition runs, and waits on nothing', () => {
  const src = code(read('ui/scene-controls.js'));
  const open = src.slice(src.indexOf('function open()'), src.indexOf("dialog.addEventListener('close'"));
  assert.ok(open.indexOf('dialog.showModal()') >= 0 && open.indexOf('dialog.showModal()') < open.indexOf('onTransition()'), 'showModal comes first');
  assert.ok(!/await|requestAnimationFrame|renderer|lookdev/.test(open), 'open() touches neither the renderer nor a frame');
  assert.match(code(read('boot-world.js')), /onSettings: \(\) => controls\.open\(\)/);
  const clear = code(read('boot-world.js'));
  const body = clear.slice(clear.indexOf('function clearWorldInput()'), clear.indexOf('}', clear.indexOf('function clearWorldInput()')));
  assert.ok(!/render|readPixels/.test(body), 'the transition only clears input');
});
