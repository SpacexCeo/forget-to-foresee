// Day 1 skin in the real game: K swaps Iris for Elise's own model, the choice survives a reload, no page errors.
//   node skin_check.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
const who = () => page.evaluate(() => { const a = window.__ftf.iris; const m = a && a.irisModel; let tris = 0, toon = false; if (m) m.model.traverse((o) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; if (o.material.type === 'MeshToonMaterial') toon = true; } }); return { hero: a && a.hero && a.hero.id, tris, toon, clips: m ? m.clips.length : 0 }; });
const ready = async () => {
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 });
  await page.waitForFunction(() => window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 300000 });
};
const shot = async (name) => writeFileSync(`${out}/${name}.jpg`, await page.screenshot({ type: 'jpeg', quality: 85 }));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full`); await ready();
const before = await who(); await page.waitForTimeout(1500); await shot('1_iris');
await page.locator('canvas').first().click({ position: { x: 480, y: 360 } }).catch(() => {});
await page.keyboard.press('KeyK');
await page.waitForFunction(() => window.__ftf.iris.hero.id === 'elise' && window.__ftf.iris.irisModel && (() => { let t = false; window.__ftf.iris.irisModel.model.traverse((o) => { if (o.isMesh && o.material.type === 'MeshToonMaterial') t = true; }); return t; })(), null, { timeout: 120000 }).catch(() => errors.push('K did not swap in Elise'));
const after = await who(); await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW'); await page.waitForTimeout(800); await shot('2_elise');
await page.reload(); await ready();
const reload = await who(); await page.waitForTimeout(1500); await shot('3_reload');
const res = { before, after, reload, errors, pass: before.hero === 'iris' && after.hero === 'elise' && after.toon && reload.hero === 'elise' && reload.toon && errors.length === 0 };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
