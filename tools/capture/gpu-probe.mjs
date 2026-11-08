#!/usr/bin/env node
// Finds Chromium flags that give hardware WebGL on this machine. Tries a few ANGLE back ends in order, prints
// the WebGL renderer string of each, and writes the first set that is not a software renderer to
// tools/capture/.gpu-args.json (read by capture.mjs --gpu). Exit code 0 when a GPU path was found, 1 when every
// candidate fell back to SwiftShader / llvmpipe (the capture then still works, slowly).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright/index.js'].filter(Boolean)) { try { return require(p); } catch { /* next */ } } throw new Error('playwright not installed (set PLAYWRIGHT_PATH to its package directory)'); })();
const COMMON = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
const CANDIDATES = [
  // gl-egl is what the owner's RTX 4090 box answered with (08.11): "ANGLE (NVIDIA GeForce RTX 4090, OpenGL ES 3.2)".
  { name: 'angle-gl-egl', args: ['--use-angle=gl-egl', '--use-gl=angle', '--enable-gpu'] },
  { name: 'angle-vulkan', args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan'] },
  { name: 'egl', args: ['--use-gl=egl'] },
  { name: 'angle-gl', args: ['--use-angle=gl'] },
  { name: 'angle-default', args: ['--use-angle=default'] },
  { name: 'swiftshader', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
];
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software/i;

async function probe(args) {
  const browser = await chromium.launch({ args: [...args, ...COMMON], headless: true, timeout: 60_000 });
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return { ok: false, renderer: 'no webgl2' };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      // a tiny draw + readback so a broken context fails here, not mid-capture
      gl.clearColor(0.2, 0.4, 0.6, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { ok: px[2] > 100, renderer: String(renderer), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
    });
  } finally { await browser.close(); }
}

let chosen = null;
for (const c of CANDIDATES) {
  let r;
  try { r = await probe(c.args); } catch (e) { r = { ok: false, renderer: 'launch failed: ' + String(e.message).split('\n')[0] }; }
  const hw = r.ok && !SOFTWARE.test(r.renderer);
  console.log(`${hw ? 'GPU ' : 'soft'}  ${c.name.padEnd(14)} ${r.renderer}`);
  if (hw && !chosen) chosen = { ...c, renderer: r.renderer };
}
const out = join(dirname(fileURLToPath(import.meta.url)), '.gpu-args.json');
writeFileSync(out, JSON.stringify(chosen ? { args: [...chosen.args, ...COMMON], renderer: chosen.renderer, name: chosen.name } : { args: null }, null, 1));
console.log(chosen ? `using ${chosen.name}: ${chosen.renderer} (saved to ${out})` : 'no hardware WebGL found; captures will use SwiftShader');
process.exit(chosen ? 0 : 1);
