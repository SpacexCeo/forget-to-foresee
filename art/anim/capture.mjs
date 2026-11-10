// Deterministic capture of the animation review page (game/anim-review.html): steps the page frame by frame,
// saves PNG frames, an mp4 and a contact sheet, and prints the foot-slip metrics.
//   node art/anim/capture.mjs --out <dir> --name <base> --query "a=agent_iris&scenario=loco" [--size 1920x1080]
//        [--url http://127.0.0.1:5199] [--every 3] [--sheet 12] [--gpu]
// Needs a running `npx vite --port 5199` in game/ (the page is a dev page), Playwright and ffmpeg.
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const out = arg('out', 'out'), name = arg('name', 'capture'), query = arg('query', 'a=agent_iris&scenario=loco');
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
const url = arg('url', 'http://127.0.0.1:5199'), sheetN = Number(arg('sheet', 12));
const frames = join(out, name + '_frames');
rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });

const gpuArgs = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: flag('gpu') ? gpuArgs : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
await page.goto(`${url}/anim-review.html?${query}`);
await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 300000 });
if (await page.evaluate(() => document.body.dataset.ready) !== '1') { console.error('page failed', errors); process.exit(1); }
const info = await page.evaluate(() => ({ frames: window.__anim.frames, fps: window.__anim.fps, clips: window.__anim.clips }));
const every = Number(arg('every', 1));
let n = 0;
for (let i = 0; i < info.frames; i += every) {
  await page.evaluate((i) => window.__anim.step(i), i);
  await page.screenshot({ path: join(frames, String(n++).padStart(4, '0') + '.png') });
}
const metrics = await page.evaluate(() => window.__anim.metrics());
await browser.close();
writeFileSync(join(out, name + '.json'), JSON.stringify({ query, size: [W, H], ...info, every, metrics, errors }, null, 1));
const fps = info.fps / every;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', join(out, name + '.mp4')]);
const stepN = Math.max(1, Math.floor(n / sheetN)), cols = Math.min(sheetN, 6), rows = Math.ceil(sheetN / cols);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', join(frames, '%04d.png'), '-vf', `select='not(mod(n\\,${stepN}))',scale=${Math.round(W / 3)}:-1,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', join(out, name + '_sheet.jpg')]);
if (!flag('keep')) rmSync(frames, { recursive: true, force: true });
console.log(JSON.stringify({ name, frames: n, metrics, errors: errors.slice(0, 5) }));
