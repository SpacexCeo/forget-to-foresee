// Input latency probe (owner 12.11: "skills must fire without lag"): in the real game on the field, for a cast
// (Q armed, a click on the ground), a strike tap (F) and the dash (Space), the time and frames from the input event to
// the first visual change (the action's start event / her move) and to the hit (the cast's release, the strike's
// impact). Prints JSON.   node art/combat/latency.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199', HERO = process.argv[4] || 'iris';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.addInitScript(() => {
  const L = window.__lat = { ev: [], frames: 0, input: null };
  const tick = () => { L.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const mark = (k) => (e) => L.ev.push({ k: k(e), t: performance.now(), f: L.frames });
  addEventListener('keydown', mark((e) => 'in:' + e.code), true);
  addEventListener('pointerdown', mark(() => 'in:pointer'), true);
  addEventListener('ftf:cast', mark((e) => 'cast:' + e.detail.phase));
  addEventListener('ftf:iris-action', mark((e) => e.detail.clip + ':' + e.detail.phase));
});
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=${HERO}&tod=evening&weather=clear`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([0, 1199, 50], 0)); await page.waitForTimeout(3000);
const fps = await page.evaluate(() => new Promise((r) => { const f0 = window.__lat.frames, t0 = performance.now(); setTimeout(() => r((window.__lat.frames - f0) / ((performance.now() - t0) / 1000)), 1500); }));
const span = async (inputKey, doIt, startKey, hitKey, wait = 900) => {
  await page.evaluate(() => { window.__lat.ev = []; });
  await doIt(); await page.waitForTimeout(wait);
  const ev = await page.evaluate(() => window.__lat.ev);
  const i = ev.find((e) => e.k === inputKey), s = ev.find((e) => e.k === startKey), h = hitKey && ev.find((e) => e.k === hitKey);
  return { input: inputKey, first: s ? { ms: +(s.t - i.t).toFixed(1), frames: s.f - i.f } : null, hit: h ? { ms: +(h.t - i.t).toFixed(1), frames: h.f - i.f } : null };
};
const res = { fps: +fps.toFixed(1) };
// the cast: Q arms, a click 6 m ahead releases
await page.keyboard.press('KeyQ'); await page.waitForTimeout(300);
res.cast = await span('in:pointer', () => page.mouse.click(640, 330), 'cast:start', 'cast:release');
await page.waitForTimeout(1500);
// the strike tap
res.strike = await span('in:KeyF', () => page.keyboard.press('KeyF'), 'strike1:start', 'strike1:impact');
await page.waitForTimeout(1200);
// the dash: first frame she has moved
await page.evaluate(() => { window.__lat.ev = []; const f = window.__ftf, p0 = f.player.pos.slice(); window.__lat.moved = null; const chk = () => { if (Math.hypot(f.player.pos[0] - p0[0], f.player.pos[2] - p0[2]) > 0.05) window.__lat.moved = { t: performance.now(), f: window.__lat.frames }; else requestAnimationFrame(chk); }; requestAnimationFrame(chk); });
await page.keyboard.press('Space'); await page.waitForTimeout(800);
res.dash = await page.evaluate(() => { const i = window.__lat.ev.find((e) => e.k === 'in:Space'), m = window.__lat.moved, s = window.__lat.ev.find((e) => e.k === 'dash:start'); return { first: m && i ? { ms: +(m.t - i.t).toFixed(1), frames: m.f - i.f } : null, clip: s && i ? { ms: +(s.t - i.t).toFixed(1), frames: s.f - i.f } : null }; });
res.errors = errors;
writeFileSync(`${out}/latency.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
