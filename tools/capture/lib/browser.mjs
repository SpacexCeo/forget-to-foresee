// Renders one shot: opens the game with ?cinematic=<shot> in headless Chromium, loads the shot script into
// the in-page runner, pre-loads every model, replays the shot's setup with rendering off, then steps the
// virtual clock one frame at a time, waits for the GPU (SwiftShader here, a real GPU on the owner's server)
// to finish the frame, screenshots it over CDP and pipes the PNG into ffmpeg. Deterministic: the same shot
// script gives the same frames (the harness records a hash of the first and last frame for the report).
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openFramePipe } from './ffmpeg.mjs';

const require = createRequire(import.meta.url);
let playwright = null;
function pw() {
  if (playwright) return playwright;
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright/index.js']) {
    try { playwright = require(p); return playwright; } catch { /* next */ }
  }
  throw new Error('playwright is not installed (npm i -g playwright, or set PLAYWRIGHT_PATH)');
}

export const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars'];
/** On a machine with a GPU, pass --gpu: the flags gpu-probe.mjs found (tools/capture/.gpu-args.json), else ANGLE's default back end. */
export const GPU_ARGS = ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars'];
export function browserArgs(gpu) {
  if (process.env.FTF_CHROMIUM_ARGS) return process.env.FTF_CHROMIUM_ARGS.split(/\s+/).filter(Boolean);
  if (!gpu) return BROWSER_ARGS;
  try { const saved = JSON.parse(readFileSync(new URL('../.gpu-args.json', import.meta.url), 'utf8')); if (saved.args) return saved.args; } catch { /* no probe result */ }
  return GPU_ARGS;
}

/**
 * @param {object} o
 * @param {object} o.shot shot script (see tools/capture/shots)
 * @param {string} o.baseUrl e.g. http://localhost:5173
 * @param {string} o.outDir where <shot>.mp4, <shot>.json and sample frames go
 * @param {{width:number,height:number,fps:number,tier:string,gpu?:boolean,sampleEvery?:number,maxFrames?:number,log?:Function}} o.opts
 */
export async function renderShot({ shot, baseUrl, outDir, opts }) {
  const { width, height, fps, tier, gpu = false, sampleEvery = 0, log = () => {} } = opts;
  mkdirSync(outDir, { recursive: true });
  const { chromium } = pw();
  const browser = await chromium.launch({ args: browserArgs(gpu), headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.type() + ': ' + m.text().slice(0, 400)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  const wall0 = Date.now();
  const result = { shot: shot.name, width, height, fps, tier, frames: 0, consoleErrors, hashes: {}, timings: {} };
  try {
    const q = new URLSearchParams({ cinematic: shot.name, tier, tex: 'full', profile: 'desktop', fps: String(fps), ...(shot.url || {}) });
    const url = baseUrl + '/?' + q.toString();
    log(`[${shot.name}] open ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => window.__ftfCinematic && window.__ftf, null, { timeout: 120_000 });
    if (!shot.lobby) await page.waitForFunction(() => window.__ftf.play, null, { timeout: 180_000 });
    await page.evaluate(() => document.fonts.ready);
    result.renderer = await page.evaluate(() => { try { const gl = window.__ftf.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { return null; } });
    log(`[${shot.name}] WebGL: ${result.renderer}`);
    await page.evaluate((s) => window.__ftfCinematic.load(s), shot);
    let t = Date.now();
    if (!shot.lobby) {
      await page.evaluate(() => window.__ftfCinematic.setRender(false));
      const loaded = await page.evaluate((ms) => window.__ftfCinematic.waitLoaded(ms), 300_000);
      result.timings.loadMs = Date.now() - t;
      result.loaded = loaded.ok;
      if (!loaded.ok) log(`[${shot.name}] WARNING: not every model streamed in: ${JSON.stringify(loaded.streaming && loaded.streaming.list.filter((x) => x.state !== 'loaded').map((x) => x.name + ':' + x.state))}`);
      t = Date.now();
      const setupFrames = await page.evaluate((list) => window.__ftfCinematic.setup(list), shot.setup || []);
      result.timings.setupMs = Date.now() - t; result.setupFrames = setupFrames;
      await page.evaluate(() => window.__ftfCinematic.setRender(true));
      // The first rendered frame compiles every shader: run it off-camera, then wait for all models again
      // (the setup may have moved Iris into a Shell, whose interior and Guests load now).
      await page.evaluate(() => window.__ftfCinematic.step());
      await page.evaluate((ms) => window.__ftfCinematic.waitLoaded(ms), 120_000);
    }
    await page.evaluate((pre) => window.__ftfCinematic.rewind(pre), shot.preroll ?? 0);
    const cdp = await page.context().newCDPSession(page);
    const total = Math.round(shot.duration * fps);
    const preroll = Math.round((shot.preroll ?? 0) * fps);
    const pipe = openFramePipe(join(outDir, shot.name + '.mp4'), { fps });
    t = Date.now();
    const stepAndWait = () => page.evaluate(async () => {
      const r = await window.__ftfCinematic.step();
      // Make the GPU finish this frame before the screenshot (SwiftShader runs it only now).
      const gl = window.__ftf.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      return r;
    });
    for (let i = 0; i < preroll; i++) await stepAndWait();
    result.timings.prerollMs = Date.now() - t; t = Date.now();
    let lastReport = Date.now();
    for (let i = 0; i < total; i++) {
      await stepAndWait();
      // No optimizeForSpeed here: with it Chromium drops the WebGL canvas from this and every later capture.
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const buf = Buffer.from(data, 'base64');
      if (i === 0 || i === total - 1) result.hashes[i] = createHash('sha1').update(buf).digest('hex').slice(0, 16);
      if (sampleEvery && (i % sampleEvery === 0 || i === total - 1)) writeFileSync(join(outDir, `${shot.name}-f${String(i).padStart(5, '0')}.png`), buf);
      await pipe.write(buf);
      result.frames++;
      if (Date.now() - lastReport > 30_000) { lastReport = Date.now(); const per = (Date.now() - t) / (i + 1); log(`[${shot.name}] frame ${i + 1}/${total} · ${(per / 1000).toFixed(2)} s/frame · ETA ${Math.round(((total - i - 1) * per) / 60000)} min`); }
    }
    await pipe.close();
    result.timings.captureMs = Date.now() - t;
    result.secondsPerFrame = result.timings.captureMs / 1000 / Math.max(1, total);
    const [cues, marks, camLog, errors, state] = await page.evaluate(() => [window.__ftfCinematic.cues(), window.__ftfCinematic.marks(), window.__ftfCinematic.camLog(), window.__ftfCinematic.errors(), window.__ftfCinematic.state()]);
    Object.assign(result, { cues, marks, camLog, errors, finalState: state, wallMs: Date.now() - wall0 });
    writeFileSync(join(outDir, shot.name + '.json'), JSON.stringify(result));
    log(`[${shot.name}] done: ${result.frames} frames in ${(result.wallMs / 60000).toFixed(1)} min (${result.secondsPerFrame.toFixed(2)} s/frame), ${cues.length} cues, ${errors.length} runner errors, ${consoleErrors.length} console messages`);
    return result;
  } finally {
    await browser.close();
  }
}
