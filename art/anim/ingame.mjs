// In-game check of Iris's animation (real time, the game's own town): walks, runs, stops, pivots and registers at
// the altar, saving stills and the foot numbers measured on the rendered frames (stance speed per gait).
//   node art/anim/ingame.mjs --out <dir> [--url http://127.0.0.1:5199] [--query "anim=classic"] [--gpu]
// Needs a running `npx vite` in game/ and Playwright.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  // every rendered frame: the player's speed and the balls of Iris's feet (the toe bones nearest to the player)
  await page.evaluate(() => {
    const f = window.__ftf, p = f.player, toes = { L: null, R: null };
    const pick = () => { for (const s of ['L', 'R']) { let best = 1e9; f.scene.traverse((o) => { if (o.name !== 'toe_' + s) return; const w = o.getWorldPosition(new o.position.constructor()); const d = Math.hypot(w.x - p.pos[0], w.z - p.pos[2]); if (d < best) { best = d; toes[s] = o; } }); } };
    pick();
    const rows = []; window.__rec = { rows, on: true };
    const tick = () => { if (!window.__rec.on) return; const r = [performance.now() / 1000, Math.hypot(p.vel[0], p.vel[1])]; for (const s of ['L', 'R']) { const w = toes[s].getWorldPosition(new toes[s].position.constructor()); r.push(w.x, w.y, w.z); } rows.push(r); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  let shot = 0;
  for (const [seconds, act, label] of steps) {
    if (act) await act(page);
    await page.waitForTimeout(seconds * 500);
    if (label) await page.screenshot({ path: join(out, `${tag}_${name}_${String(shot++).padStart(2, '0')}_${label}.jpg`), quality: 80, type: 'jpeg', clip: { x: 340, y: 60, width: 600, height: 600 }, timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(seconds * 500);
  }
  const rows = await page.evaluate(() => { window.__rec.on = false; return window.__rec.rows; });
  // per gait: mean speed of the slowest 30 % of frames of each ball of the foot while the player moves steadily
  const band = (lo, hi) => {
    const v = [];
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i], dt = b[0] - a[0]; if (dt <= 0 || b[1] < lo || b[1] > hi || a[1] < lo || a[1] > hi) continue; for (const k of [2, 5]) v.push(Math.hypot(b[k] - a[k], b[k + 2] - a[k + 2]) / dt); }
    v.sort((x, y) => x - y); const n = Math.floor(v.length * 0.3);
    return { frames: v.length / 2, stance_speed_m_s: n ? +(v.slice(0, n).reduce((q, x) => q + x, 0) / n).toFixed(3) : null };
  };
  const fps = rows.length > 1 ? +((rows.length - 1) / (rows[rows.length - 1][0] - rows[0][0])).toFixed(1) : 0;
  return { name, fps, max_speed: +Math.max(...rows.map((r) => r[1])).toFixed(2), standing: band(0, 0.02), walking: band(1.6, 1.8), running: band(3.2, 3.4) };
}

const key = (k, down) => (page) => (down ? page.keyboard.down(k) : page.keyboard.up(k));
const results = [];
let page = await open('play=direct&town=1');
results.push(await record(page, 'loco', [
  [1.0, null, 'idle'], [3.0, key('KeyW', true), 'walk'], [3.0, key('ShiftLeft', true), 'run'], [1.2, key('ShiftLeft', false)], [1.6, key('KeyW', false), 'stop'],
  [0.3, key('KeyS', true)], [1.4, key('KeyS', false), 'pivot'], [0.25, key('KeyA', true)], [1.2, key('KeyA', false)],
]));
results.push({ clips: await page.evaluate(() => { const names = new Set(); window.__ftf.scene.traverse((o) => { if (o.animations && o.animations.length) o.animations.forEach((c) => names.add(c.name)); }); return [...names]; }) });
await page.close();
page = await open('play=direct&town=altar');
results.push(await record(page, 'register', [[0.6, null], [1.5, (p) => p.evaluate(() => { window.__ftf.town.register(); }), 'reach']]));
await page.close();
await browser.close();
writeFileSync(join(out, `${tag}.json`), JSON.stringify({ results, errors: errors.slice(0, 12) }, null, 1));
console.log(JSON.stringify({ results, errors: errors.slice(0, 6) }));
