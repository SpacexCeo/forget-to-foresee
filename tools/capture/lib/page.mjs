// Renders a motion-graphics shot: an HTML/SVG page (game/cine/<page>.html) whose every frame is a pure function of time.
// The page installs the cinematic virtual clock (game/src/cinematic/clock.js) and exposes
//   window.__cine = { ready: Promise, render(t), step() }
// The harness calls render(t) for t = i / fps, steps the clock once (so any CSS transition or timer also advances
// exactly one frame), screenshots over CDP and pipes the PNG into ffmpeg. Nothing reads the wall clock, so two renders
// give the same frames and a slow machine cannot drop or repeat one: no flicker by construction. The same luma check as
// the in-engine path guards against a bad frame. A shot with `under` keeps an alpha channel: the page is composited over
// another rendered shot (the browser half of the split screen) by capture.mjs.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openFramePipe } from './ffmpeg.mjs';

const require = createRequire(import.meta.url);
const pw = () => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright/index.js'].filter(Boolean)) { try { return require(p); } catch { /* next */ } } throw new Error('playwright is not installed'); };

/** RGBA intermediate (ffv1 in mkv) for pages that are composited over another shot. */
function openAlphaPipe(out, { fps }) {
  const p = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'ffv1', '-pix_fmt', 'bgra', out], { stdio: ['pipe', 'inherit', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  const done = new Promise((resolve, reject) => p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg alpha intermediate failed: ' + err)))));
  return {
    write: (buf) => new Promise((resolve) => { if (!p.stdin.write(buf)) p.stdin.once('drain', resolve); else resolve(); }),
    close: () => { p.stdin.end(); return done; },
    kill: () => { try { p.kill('SIGKILL'); } catch { /* gone */ } },
  };
}

/** Optional per-frame stats a page may report ({mean}); the authoritative luma check runs on the encoded file (compose.mjs). */
async function frameStats(page) {
  return page.evaluate(() => (window.__cine.stats ? window.__cine.stats() : null));
}

export async function renderPage({ shot, baseUrl, outDir, opts }) {
  const { width, height, fps, sampleEvery = 0, log = () => {} } = opts;
  const { chromium } = pw();
  const browser = await chromium.launch({ headless: true, args: ['--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  const result = { shot: shot.name, kind: 'page', width, height, fps, frames: 0, consoleErrors, hashes: {}, errors: [], camLog: [], timings: {} };
  const alpha = !!shot.under;
  const file = join(outDir, shot.name + (alpha ? '.mkv' : '.mp4'));
  let pipe = null;
  const wall0 = Date.now();
  try {
    const q = new URLSearchParams({ scene: shot.page, w: String(width), h: String(height), fps: String(fps), ...(alpha ? { alpha: '1' } : {}), ...(shot.params || {}) });
    const url = `${baseUrl}/cine/jury.html?${q}`;
    log(`[${shot.name}] page ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    for (let t0 = Date.now(); !(await page.evaluate(() => !!window.__cine)); ) { if (Date.now() - t0 > 60_000) throw new Error('page did not expose window.__cine'); await new Promise((r) => setTimeout(r, 200)); }
    await page.evaluate(() => window.__cine.ready);
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page);
    if (alpha) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    pipe = alpha ? openAlphaPipe(file, { fps }) : openFramePipe(file, { fps });
    const total = Math.round(shot.duration * fps);
    const check = { jumps: 0, maxJump: 0, minMean: 255, maxMean: 0 };
    let prev = null;
    const t = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate((tt) => { window.__cine.render(tt); window.__cine.step(); }, i / fps);
      const st = await frameStats(page);
      if (st && prev != null) { const d = Math.abs(st.mean - prev); check.maxJump = Math.max(check.maxJump, d); if (d > 24) check.jumps++; }
      if (st) { prev = st.mean; check.minMean = Math.min(check.minMean, st.mean); check.maxMean = Math.max(check.maxMean, st.mean); }
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const png = Buffer.from(data, 'base64');
      if (i === 0 || i === total - 1) result.hashes[i] = createHash('sha1').update(png).digest('hex').slice(0, 16);
      if (sampleEvery && (i % sampleEvery === 0 || i === total - 1)) writeFileSync(join(outDir, `${shot.name}-f${String(i).padStart(5, '0')}.png`), png);
      await pipe.write(png);
      result.frames++;
    }
    if (check.jumps > (shot.allowJumps ?? 3)) throw new Error(`flicker in page shot ${shot.name}: ${check.jumps} luma jumps over 24/255`);
    await pipe.close();
    result.check = check;
    result.timings.captureMs = Date.now() - t;
    result.secondsPerFrame = result.timings.captureMs / 1000 / Math.max(1, total);
    // The script's own sound cues (music tension, stingers) in the same form the in-engine runner logs them.
    result.cues = (shot.actions || []).filter((a) => a.do === 'music' || a.do === 'cue').map((a) => (a.do === 'music'
      ? { t: a.at, kind: 'music', tension: a.tension, gain: a.gain }
      : { t: a.at, kind: 'sound', name: a.name, gain: a.gain ?? 1, rate: a.rate ?? 1, delay: 0, loop: false, script: true }));
    result.file = file;
    result.wallMs = Date.now() - wall0;
    writeFileSync(join(outDir, shot.name + '.json'), JSON.stringify(result));
    log(`[${shot.name}] done: ${result.frames} frames, ${result.secondsPerFrame.toFixed(3)} s/frame, luma ${check.minMean.toFixed(0)}–${check.maxMean.toFixed(0)} jumps ${check.jumps}, ${consoleErrors.length} console messages`);
    return result;
  } catch (e) {
    if (pipe && pipe.kill) pipe.kill();
    result.failed = String(e.message);
    writeFileSync(join(outDir, shot.name + '.failed.json'), JSON.stringify(result));
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}
