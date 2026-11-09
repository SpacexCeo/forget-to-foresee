// Renders one shot: opens the game with ?cinematic=<shot> in headless Chromium, loads the shot script into
// the in-page runner, pre-loads every model, replays the shot's setup with rendering off, then steps the
// virtual clock one frame at a time, waits for the GPU (SwiftShader here, a real GPU on the owner's server)
// to finish the frame, screenshots it over CDP and pipes the PNG into ffmpeg. Deterministic: the same shot
// script gives the same frames (the harness records a hash of the first and last frame for the report).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openLayerPipe } from './ffmpeg.mjs';

const require = createRequire(import.meta.url);
let playwright = null;
function pw() {
  if (playwright) return playwright;
  for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright/index.js'].filter(Boolean)) {
    try { playwright = require(p); return playwright; } catch { /* next */ }
  }
  throw new Error('playwright is not installed (npm i -g playwright, or set PLAYWRIGHT_PATH to its package directory)');
}

export const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars'];
/** On a machine with a GPU, pass --gpu: the flags gpu-probe.mjs found (tools/capture/.gpu-args.json), else ANGLE's default back end. */
export const GPU_ARGS = ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars'];
export function browserArgs(gpu) {
  if (process.env.FTF_CHROMIUM_ARGS) return process.env.FTF_CHROMIUM_ARGS.split(/\s+/).filter(Boolean);
  if (!gpu) return BROWSER_ARGS;
  try { const saved = JSON.parse(readFileSync(new URL('../.gpu-args.json', import.meta.url), 'utf8')); if (saved.args) return saved.args; } catch { /* no probe result */ }
  return GPU_ARGS;
}

async function pollPage(page, fn, timeout, what) {
  const t0 = Date.now();
  while (!(await page.evaluate(fn))) {
    if (Date.now() - t0 > timeout) throw new Error(`timeout after ${timeout} ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * @param {object} o
 * @param {object} o.shot shot script (see tools/capture/shots)
 * @param {string} o.baseUrl e.g. http://localhost:5173
 * @param {string} o.outDir where <shot>.mp4, <shot>.json and sample frames go
 * @param {{width:number,height:number,fps:number,tier:string,gpu?:boolean,sampleEvery?:number,maxFrames?:number,log?:Function}} o.opts
 */
export async function renderShot({ shot, baseUrl, outDir, opts }) {
  const { width, height, fps, tier, gpu = false, sampleEvery = 0, log = () => {}, probe = null } = opts;
  // probe = { from, to }: GPU diagnosis. Frames from..to are dumped with every post pass switched off in turn and the
  // target sizes (runner.probe); the checks only log; capture stops after `to`.
  const probes = [];
  mkdirSync(outDir, { recursive: true });
  const { chromium } = pw();
  // Watchdog: a call into the page, the GPU or ffmpeg that never returns (seen on the RTX 4090: the opening Shell shot sat
  // for 30+ min with no frame) kills this shot's Chromium and ffmpeg after its phase's limit, so the shot fails loudly
  // and capture.mjs retries it in a fresh browser. The tag marks this shot's Chromium processes for the kill.
  const tag = `--ftf-capture-tag=${shot.name}-${process.pid}-${Date.now()}`;
  const FRAME_LIMIT = Number(process.env.FTF_FRAME_TIMEOUT || 120) * 1000;
  let pipe = null, hung = null;
  const watch = { phase: 'launch', limit: 120_000, at: Date.now() };
  const arm = (phase, limit) => { watch.phase = phase; watch.limit = limit; watch.at = Date.now(); };
  const killAll = () => { try { execFileSync('pkill', ['-9', '-f', '--', tag]); } catch { /* none left */ } if (pipe) pipe.kill(); };
  const dog = setInterval(() => {
    if (hung || Date.now() - watch.at <= watch.limit) return;
    hung = `stalled in ${watch.phase} for ${Math.round((Date.now() - watch.at) / 1000)} s in shot ${shot.name} (limit ${Math.round(watch.limit / 1000)} s): killed`;
    log(`[${shot.name}] WATCHDOG: ${hung}`);
    killAll();
  }, 2000);
  const browser = await chromium.launch({ args: [...browserArgs(gpu), tag], headless: true });
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
    arm('page load', 420_000);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    // Poll from Node: under the virtual clock the page's rAF and timers never fire on their own, so
    // Playwright's waitForFunction (rAF polling) would only evaluate once.
    await pollPage(page, () => !!(window.__ftfCinematic && window.__ftf), 120_000, 'window.__ftf');
    if (!shot.lobby) await pollPage(page, () => !!(window.__ftf && window.__ftf.play), 180_000, 'window.__ftf.play');
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
      arm('setup', 600_000);
      t = Date.now();
      const setupFrames = await page.evaluate((list) => window.__ftfCinematic.setup(list), shot.setup || []);
      result.timings.setupMs = Date.now() - t; result.setupFrames = setupFrames;
      if ((shot.actions || []).some((a) => a.do === 'guests') || shot.needsGuests) {
        arm('waiting for the Guests', 200_000);
        const gw = await page.evaluate((ms) => window.__ftfCinematic.waitGuests(ms), 150_000);
        result.timings.guestsMs = gw.ms;
        if (!gw.ok) throw new Error(`shot ${shot.name} needs the Guests behind the glass, not ready after ${Math.round(gw.ms / 1000)} s: ${gw.why}`);
      }
      arm('first rendered frame', 300_000);
      await page.evaluate(() => window.__ftfCinematic.setRender(true));
      // The first rendered frame compiles every shader: run it off-camera, then wait for all models again
      // (the setup may have moved Iris into a Shell, whose interior and Guests load now).
      await page.evaluate(() => window.__ftfCinematic.step());
      await page.evaluate((ms) => window.__ftfCinematic.waitLoaded(ms), 120_000);
    }
    await page.evaluate((pre) => window.__ftfCinematic.rewind(pre), shot.preroll ?? 0);
    const cdp = await page.context().newCDPSession(page);
    // Two layers per frame: the 3D frame is read from the WebGL drawing buffer in the same task as the render (never a
    // stale or half-presented canvas), the UI is a screenshot with alpha taken with the canvas hidden; ffmpeg composites them.
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.evaluate(() => document.documentElement.classList.add('cine-layers'));
    const total = probe ? Math.min(Math.round(shot.duration * fps), probe.to + 1) : Math.round(shot.duration * fps);
    const preroll = Math.round((shot.preroll ?? 0) * fps);
    arm('frame 0', FRAME_LIMIT * 2);
    pipe = openLayerPipe(join(outDir, shot.name + '.mp4'), { fps });
    t = Date.now();
    const stepGrab = () => page.evaluate(() => window.__ftfCinematic.step({ grab: true }));
    for (let i = 0; i < preroll; i++) await stepGrab();
    result.timings.prerollMs = Date.now() - t; t = Date.now();
    let lastReport = Date.now();
    const check = { jumps: 0, maxJump: 0, minMean: 255, maxMean: 0, maxEdgeBlack: 0, retries: 0 };
    let prevMean = null;
    const allowJumps = shot.allowJumps ?? 3;
    for (let i = 0; i < total; i++) {
      let r = await stepGrab();
      // An intermittent bad grab (seen once on the RTX 4090 / ANGLE Vulkan: a 46% black edge that a probe of the same frames
      // never reproduced) is read again from a fresh render of the same frame; only a frame that stays bad fails the shot.
      const bad = (x) => x && x.stats && ((x.stats.edgeBlack > 0.3 && x.stats.mean > 30) || (prevMean != null && Math.abs(x.stats.mean - prevMean) > 24));
      for (let k = 0; k < 3 && !probe && (bad(r) || (process.env.FTF_TEST_RETRY && i === 0 && k === 0)); k++) {
        check.retries = (check.retries || 0) + 1;
        const tag = `${shot.name}-f${String(i).padStart(5, '0')}-retry${k}`;
        writeFileSync(join(outDir, tag + '.png'), Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64'));
        log(`[${shot.name}] frame ${i}: flagged (edge ${(r.stats.edgeBlack * 100).toFixed(0)}%, luma ${r.stats.mean.toFixed(0)}), re-rendering (${tag}.png kept)`);
        r = await page.evaluate(() => window.__ftfCinematic.regrab());
      }
      if (!r || !r.png) throw new Error(`no canvas frame at ${i} in shot ${shot.name}`);
      if (r.stats.lost) throw new Error(`WebGL context lost in shot ${shot.name} at t=${r.t.toFixed(2)} (frame ${i}); renderer ${result.renderer}`);
      // Checks: a black band growing from an edge while the rest is lit is a partially drawn frame; large brightness
      // jumps between consecutive frames are flicker (a cut inside a shot, a flight, counts as one allowed jump).
      const st = r.stats;
      if (probe && i >= probe.from && i <= probe.to) {
        const pr = await page.evaluate(() => window.__ftfCinematic.probe({ png: true }));
        const tag = `${shot.name}-f${String(i).padStart(5, '0')}`;
        writeFileSync(join(outDir, tag + '-grab.png'), Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64'));
        for (const v of pr.variants) if (v.png) { writeFileSync(join(outDir, `${tag}-${v.name}.png`), Buffer.from(v.png.slice(v.png.indexOf(',') + 1), 'base64')); delete v.png; }
        probes.push({ frame: i, t: r.t, grab: st, ...pr });
        writeFileSync(join(outDir, shot.name + '.probe.json'), JSON.stringify(probes, null, 1));
        log(`[${shot.name}] probe f${i}: grab edge ${(st.edgeBlack * 100).toFixed(0)}% box ${JSON.stringify(st.blackBox)} · ` + pr.variants.map((v) => `${v.name} ${v.stats ? (v.stats.edgeBlack * 100).toFixed(0) + '%' : v.error}`).join(' · '));
      }
      if (probe) { /* diagnosis: no failing checks */ } else
      if (st.edgeBlack > 0.3 && st.mean > 30) throw new Error(`black edge region (${(st.edgeBlack * 100).toFixed(0)}% of the frame) in shot ${shot.name} at t=${r.t.toFixed(2)} (frame ${i})`);
      if (prevMean != null) { const d = Math.abs(st.mean - prevMean); if (d > check.maxJump) check.maxJump = d; if (d > 24) check.jumps++; }
      prevMean = st.mean; check.minMean = Math.min(check.minMean, st.mean); check.maxMean = Math.max(check.maxMean, st.mean); check.maxEdgeBlack = Math.max(check.maxEdgeBlack, st.edgeBlack);
      if (!probe && check.jumps > allowJumps) throw new Error(`flicker in shot ${shot.name}: ${check.jumps} brightness jumps over 24/255 by t=${r.t.toFixed(2)} (max ${check.maxJump.toFixed(1)})`);
      const canvasPng = Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64');
      await page.evaluate(() => window.__ftf.renderer.domElement.classList.add('cine-hidden'));
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await page.evaluate(() => window.__ftf.renderer.domElement.classList.remove('cine-hidden'));
      const uiPng = Buffer.from(data, 'base64');
      if (i === 0 || i === total - 1) result.hashes[i] = createHash('sha1').update(canvasPng).update(uiPng).digest('hex').slice(0, 16);
      if (sampleEvery && (i % sampleEvery === 0 || i === total - 1)) { writeFileSync(join(outDir, `${shot.name}-f${String(i).padStart(5, '0')}.png`), canvasPng); writeFileSync(join(outDir, `${shot.name}-f${String(i).padStart(5, '0')}-ui.png`), uiPng); }
      await pipe.write(canvasPng, uiPng);
      result.frames++;
      arm(`frame ${i + 1}`, FRAME_LIMIT);
      if (Date.now() - lastReport > 30_000) { lastReport = Date.now(); const per = (Date.now() - t) / (i + 1); log(`[${shot.name}] frame ${i + 1}/${total} · ${(per / 1000).toFixed(2)} s/frame · ETA ${Math.round(((total - i - 1) * per) / 60000)} min · luma ${st.mean.toFixed(0)} jumps ${check.jumps}`); }
    }
    result.check = check;
    arm('encoding the intermediate', 900_000);
    if (probe) result.probes = probes.map((p) => ({ frame: p.frame, grab: p.grab.edgeBlack, variants: p.variants.map((v) => [v.name, v.stats && v.stats.edgeBlack]) }));
    await pipe.close();
    result.timings.captureMs = Date.now() - t;
    result.secondsPerFrame = result.timings.captureMs / 1000 / Math.max(1, total);
    const [cues, marks, camLog, errors, state] = await page.evaluate(() => [window.__ftfCinematic.cues(), window.__ftfCinematic.marks(), window.__ftfCinematic.camLog(), window.__ftfCinematic.errors(), window.__ftfCinematic.state()]);
    Object.assign(result, { cues, marks, camLog, errors, finalState: state, wallMs: Date.now() - wall0 });
    writeFileSync(join(outDir, shot.name + '.json'), JSON.stringify(result));
    log(`[${shot.name}] done: ${result.frames} frames in ${(result.wallMs / 60000).toFixed(1)} min (${result.secondsPerFrame.toFixed(2)} s/frame), ${cues.length} cues, ${errors.length} runner errors, ${consoleErrors.length} console messages, luma ${result.check.minMean.toFixed(0)}–${result.check.maxMean.toFixed(0)} jumps ${result.check.jumps} (max ${result.check.maxJump.toFixed(1)}) edge-black ${(result.check.maxEdgeBlack * 100).toFixed(0)}% retries ${result.check.retries}`);
    return result;
  } catch (e0) {
    const e = hung ? new Error(hung + ' (' + e0.message.split('\n')[0] + ')') : e0;
    if (pipe) pipe.kill();
    result.failed = String(e.message);
    try { Object.assign(result, { errors: await page.evaluate(() => window.__ftfCinematic.errors()), wallMs: Date.now() - wall0 }); } catch { /* page gone */ }
    writeFileSync(join(outDir, shot.name + '.failed.json'), JSON.stringify(result));
    throw e;
  } finally {
    clearInterval(dog);
    await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 15_000))]);
    killAll();
  }
}
