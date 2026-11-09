#!/usr/bin/env node
// The CPU layers pass (docs/submission/jury-video.md, v3): the GPU renders clean plates (FTF_NO_LAYERS=1) and records each
// frame's camera (`layerLog` in <shot>.json); this pass draws the shot's depth-anchored data layers from that record on a
// transparent page (game/cine/layers.html), frame-stepped, and composites them over the plate. Restyling the layers then
// costs a CPU pass, not another GPU run. Afterwards `capture.mjs <video> --resume --work <work>` assembles as usual.
//
//   node tools/capture/layers-pass.mjs <video> <plates-work-dir> <out-work-dir> [--base http://localhost:5173]
//   (plates-work-dir holds the GPU run's <shot>.mp4 + <shot>.json; out-work-dir gets the composited <shot>.mp4 + json)
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lumaCheck } from './lib/compose.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pw = () => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)) { try { return require(p); } catch { /* next */ } } throw new Error('playwright is not installed'); };
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [name, platesDir, outDir] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
let base = opt('base', null), devServer = null;
if (!base) { // no running dev server given: start one (the layers page is a dev-server page, not a build input)
  const port = Number(process.env.FTF_LAYERS_PORT || 5181);
  devServer = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--clearScreen', 'false'], { cwd: join(HERE, '../../game'), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((r, j) => { const tm = setTimeout(() => j(new Error('vite did not start')), 60_000); devServer.stdout.on('data', (d) => { if (String(d).includes('Local:')) { clearTimeout(tm); r(); } }); });
  base = `http://localhost:${port}`;
}
const video = (await import('file://' + join(HERE, 'shots', name + '.mjs'))).default;
mkdirSync(outDir, { recursive: true });

const { chromium } = pw();
const browser = await chromium.launch({ headless: true, args: ['--hide-scrollbars', '--font-render-hinting=none'] });
try {
  for (const shot of video.shots) {
    const plate = join(platesDir, shot.name + '.mp4'), meta = join(platesDir, shot.name + '.json');
    if (!existsSync(plate) || !existsSync(meta)) { console.log(`[${shot.name}] no plate, skipped`); continue; }
    const res = JSON.parse(readFileSync(meta, 'utf8'));
    if (!shot.layers || !shot.layers.length) { copyFileSync(plate, join(outDir, shot.name + '.mp4')); copyFileSync(meta, join(outDir, shot.name + '.json')); console.log(`[${shot.name}] no layers: plate copied`); continue; }
    if (!res.layerLog || res.layerLog.length < res.frames) throw new Error(`[${shot.name}] the plate has no layerLog (render it with FTF_NO_LAYERS=1 from a build that records the camera)`);
    // --width/--height: the plate's real size when it is a proxy of a larger render (the layers scale to any size)
    const width = Number(opt('width', res.width || 1920)), height = Number(opt('height', res.height || 1080)), fps = res.fps || 60;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${base}/cine/layers.html`, { waitUntil: 'load' });
    for (let k = 0; k < 200 && !(await page.evaluate(() => !!window.__lp)); k++) await new Promise((r) => setTimeout(r, 100));
    await page.evaluate(([items, log, grade]) => window.__lp.load(items, log, grade), [shot.layers, res.layerLog.slice(-res.frames), shot.grade ?? video.grade ?? null]);
    // The plate's frames sit behind the layers in the page, so backdrop blur (frosted glass) sees the real world.
    const frames = join(outDir, shot.name + '.frames'); mkdirSync(frames, { recursive: true });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', plate, '-q:v', '2', join(frames, '%05d.jpg')]);
    await page.route('**/__plate/*', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(join(frames, r.request().url().split('/').pop())) }));
    const cdp = await page.context().newCDPSession(page);
    const out = join(outDir, shot.name + '.mp4');
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'libx264', '-preset', 'faster', '-crf', '6', '-pix_fmt', 'yuv444p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg layers ' + c)))));
    for (let i = 0; i < res.frames; i++) {
      await page.evaluate(([k, src]) => window.__lp.render(k, src), [i, `/__plate/${String(i + 1).padStart(5, '0')}.jpg`]);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await done; await page.close();
    rmSync(frames, { recursive: true, force: true });
    if (errs.length) throw new Error(`[${shot.name}] page errors: ${errs.join(' | ')}`);
    const luma = lumaCheck(out, { allowJumps: shot.allowJumps ?? 3 });
    writeFileSync(join(outDir, shot.name + '.json'), JSON.stringify({ ...res, layersPass: { frames: res.frames, luma } }));
    console.log(`[${shot.name}] layers composited: ${res.frames} frames, luma ${JSON.stringify(luma)}`);
    if (!luma.ok) throw new Error(`[${shot.name}] luma check failed after the layers pass`);
  }
} finally { await browser.close(); if (devServer) devServer.kill(); }
console.log(`layers pass done: ${resolve(outDir)}. Next: node tools/capture/capture.mjs ${name} --resume --work <parent of ${outDir}> (the folder name must be ${name}-WxH-tier)`);
