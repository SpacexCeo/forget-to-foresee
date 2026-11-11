// In-game check of Iris's animation (real time, the game's own town): walks, runs, stops, pivots and registers at
// the altar, saving an mp4 and a contact sheet per sequence.
//   node art/anim/ingame.mjs --out <dir> [--url http://127.0.0.1:5199] [--query "anim=classic"] [--gpu]
// Needs a running `npx vite` in game/, Playwright and ffmpeg.
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'out'), url = arg('url', 'http://127.0.0.1:5199'), query = arg('query', ''), tag = arg('name', 'ingame');
const gpuArgs = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: process.argv.includes('--gpu') ? gpuArgs : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
mkdirSync(out, { recursive: true });

async function open(q) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await page.goto(`${url}/?${q}${query ? '&' + query : ''}`);
  // a title screen, when the deep link shows one: its button enters the world
  const enter = page.getByRole('button', { name: /world/i }).first();
  await enter.waitFor({ timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await enter.click({ timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 240000 });
  await page.waitForTimeout(4000);
  await page.addStyleTag({ content: '.ftf-town-objective, .ftf-town-prompt { opacity: .35 }' });
  await page.evaluate(() => { const r = window.__ftf.rig; r.dist = 4.6; });
  return page;
}

async function record(page, name, steps) {
  // real-time video from the game's own canvas (screenshots of the full town take about a second each)
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 6e6 });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    window.__rec = { rec, chunks, speeds: [], timer: setInterval(() => { const p = window.__ftf.player; window.__rec.speeds.push(+Math.hypot(p.vel[0], p.vel[1]).toFixed(2)); }, 250) };
    rec.start(200);
  });
  for (const [seconds, act] of steps) { if (act) await act(page); await page.waitForTimeout(seconds * 1000); }
  const { b64, speeds } = await page.evaluate(() => new Promise((res) => {
    const r = window.__rec; clearInterval(r.timer);
    r.rec.onstop = () => { const fr = new FileReader(); fr.onload = () => res({ b64: fr.result.split(',')[1], speeds: r.speeds }); fr.readAsDataURL(new Blob(r.chunks, { type: 'video/webm' })); };
    r.rec.stop();
  }));
  const webm = join(out, `${tag}_${name}.webm`);
  writeFileSync(webm, Buffer.from(b64, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'scale=960:-2', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', join(out, `${tag}_${name}.mp4`)]);
  const total = steps.reduce((q, x) => q + x[0], 0);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(out, `${tag}_${name}.mp4`), '-vf', `fps=${(12 / total).toFixed(3)},crop=420:420:270:90,scale=280:-1,tile=6x2`, '-frames:v', '1', '-q:v', '4', join(out, `${tag}_${name}_sheet.jpg`)]);
  rmSync(webm, { force: true });
  return { name, seconds: total, speeds };
}

const key = (k, down) => (page) => (down ? page.keyboard.down(k) : page.keyboard.up(k));
const results = [];
let page = await open('play=direct&town=1');
results.push(await record(page, 'loco', [
  [0.8, null], [2.6, key('KeyW', true)], [2.4, key('ShiftLeft', true)], [1.2, key('ShiftLeft', false)], [1.6, key('KeyW', false)],
  [0.25, key('KeyS', true)], [1.2, key('KeyS', false)], [0.2, key('KeyA', true)], [1.2, key('KeyA', false)],
]));
results.push({ clips: await page.evaluate(() => { const names = new Set(); window.__ftf.scene.traverse((o) => { if (o.animations && o.animations.length) o.animations.forEach((c) => names.add(c.name)); }); return [...names]; }) });
await page.close();
page = await open('play=direct&town=altar');
results.push(await record(page, 'register', [[0.8, null], [2.6, (p) => p.evaluate(() => { window.__ftf.town.register(); })]]));
await page.close();
await browser.close();
writeFileSync(join(out, `${tag}.json`), JSON.stringify({ results, errors: errors.slice(0, 12) }, null, 1));
console.log(JSON.stringify({ results, errors: errors.slice(0, 6) }));
