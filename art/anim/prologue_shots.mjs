// Stills of the lab prologue from a running dev server, for review: one screenshot per listed second.
//   node art/anim/prologue_shots.mjs <out dir> [--url http://127.0.0.1:5211] [--gpu] [--reduced]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = process.argv[2], url = arg('url', 'http://127.0.0.1:5211'); mkdirSync(out, { recursive: true });
const gpu = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: process.argv.includes('--gpu') ? gpu : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: process.argv.includes('--reduced') ? 'reduce' : 'no-preference' });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(`${url}/?play=direct&town=1&day1=0&quest=0&cycle=off&mobs=0&ff=labPrologue,newPlayerIntro&intro=1`);
await page.waitForSelector('.ftf-prologue', { timeout: 300000 });
const t0 = Date.now(), times = [1.5, 4.5, 6.0, 8.5, 11.5, 12.8, 14.3, 17.0, 19.0, 21.5, 24.6, 26.0, 27.5, 29.0, 30.5, 32.0, 34.0, 35.0, 39.5, 41.5];
for (const t of times) { const w = t * 1000 - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: `${out}/p_${String(t.toFixed(1)).padStart(4, '0')}.jpg`, quality: 85, type: 'jpeg' }); }
const tel = await page.evaluate(() => (window.__ftfTelemetry || []).filter((e) => /^(prologue|wakeup|npe)\./.test(e.name)).map((e) => [e.name, e.payload && (e.payload.id || e.payload.step) || '', Math.round(e.t)]));
writeFileSync(`${out}/report.json`, JSON.stringify({ errors: errors.slice(0, 10), events: tel }, null, 1)); console.log(JSON.stringify({ shots: times.length, errors: errors.slice(0, 5), events: tel.length }));
await browser.close();
