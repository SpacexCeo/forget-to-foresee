// The WebGL guard (src/ui/webgl-guard.js, audit QW-5): software renderers are recognised, a missing WebGL 2 context
// fails cleanly, ?forceNoGL forces it, and the boot screen gets the three no-GPU links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSoftwareRenderer, detectWebGL, appendNoGpuLinks, NO_GPU_LINKS } from '../../src/ui/webgl-guard.js';
import { installDom } from '../lib/mini-dom.mjs';

test('software renderer detection', () => {
  for (const r of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver']) assert.equal(isSoftwareRenderer(r), true, r);
  for (const r of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11)', 'Apple M2', '', null]) assert.equal(isSoftwareRenderer(r), false, String(r));
});

test('detectWebGL: no context, a GPU context, a software context, forced off', () => {
  const docWith = (ctx) => ({ createElement: () => ({ getContext: () => ctx }) });
  assert.deepEqual(detectWebGL(docWith(null)), { ok: false, renderer: null, software: false });
  assert.equal(detectWebGL({ createElement: () => ({ getContext: () => { throw new Error('blocked'); } }) }).ok, false);
  const gl = (name) => ({ RENDERER: 1, getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 7 } : null), getParameter: (k) => (k === 7 ? name : 'WebKit WebGL') });
  assert.deepEqual(detectWebGL(docWith(gl('Apple M2'))), { ok: true, renderer: 'Apple M2', software: false });
  assert.equal(detectWebGL(docWith(gl('llvmpipe (LLVM 15)'))).software, true);
  assert.equal(detectWebGL(docWith(gl('Apple M2')), { force: true }).ok, false);
});

test('the boot screen gets the no-GPU links; main.js checks before the world chunk', () => {
  const { doc } = installDom();
  const root = doc.createElement('div');
  const ul = appendNoGpuLinks(doc, root);
  assert.equal(ul.childNodes.length, 3);
  assert.equal(NO_GPU_LINKS.length, 3);
  const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.indexOf('detectWebGL(document') < main.indexOf("import('./boot-world.js')"), 'the check runs before the heavy import');
  assert.match(main, /forceNoGL/);
});

// Title and premise in the first seconds (src/ui/premise.js, audit QW-11).
import { premisePolicy } from '../../src/ui/premise.js';
import en from '../../src/locales/en.js';
test('premise lower-third: shown once on a normal load, off in captures, still with reduced motion', () => {
  const P = (q, o) => premisePolicy(new URLSearchParams(q), o);
  assert.deepEqual(P('demo=judge&mode=walk'), { show: true, animate: true });
  assert.deepEqual(P('demo=judge', { reducedMotion: true }), { show: true, animate: false });
  for (const q of ['films=a', 'cinematic=1', 'capture=1', 'replay=r1.x', 'premise=0']) assert.equal(P(q).show, false, q);
  assert.equal(P('', { shown: true }).show, false);
  assert.match(en['premise.line'], /prophecy/);
  assert.ok(en['premise.hint']);
  const src = readFileSync(new URL('../../src/ui/premise.js', import.meta.url), 'utf8');
  assert.match(src, /pointer-events:none/, 'never takes input');
});

test('dev-only review models stay out of the production build (audit QW-8)', () => {
  const cfg = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  assert.match(cfg, /dropDevOnlyModelsPlugin\(\)/);
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /import\.meta\.env\.DEV && params\.get\('shells'\) === 'r2'/);
});
