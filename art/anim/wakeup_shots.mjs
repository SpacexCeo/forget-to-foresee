// Stills of the wake-up shot (the town camera and the ring of townsfolk) from a running dev server.
//   node art/anim/wakeup_shots.mjs <out dir> [--url http://127.0.0.1:5211] [--gpu]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = process.argv[2], url = arg('url', 'http://127.0.0.1:5211'); mkdirSync(out, { recursive: true });
const gpu = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: process.argv.includes('--gpu') ? gpu : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(`${url}/?play=direct&town=1&day1=0&quest=0&cycle=off&mobs=0&ff=labPrologue,newPlayerIntro&intro=1`);
await page.waitForSelector('.ftf-prologue', { timeout: 300000 });
await page.waitForTimeout(8000); // the town loads behind the film
await page.evaluate(() => window.__ftfPrologue.skip());
await page.waitForSelector('.ftf-wakeup', { timeout: 60000 });
const t0 = Date.now(), times = [0.6, 1.4, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.6, 9.5];
for (const t of times) { const w = t * 1000 - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: `${out}/w_${t.toFixed(1)}.jpg`, quality: 85, type: 'jpeg' }); }
const state = await page.evaluate(() => { const s = window.__ftf && window.__ftf.scene; const r = s && s.getObjectByName('wakeup_ring'); return { ring: r ? r.children.length : -1, hook: !!(s && s.onBeforeRender && String(s.onBeforeRender).includes('prev')) }; }).catch((e) => ({ error: String(e) }));
writeFileSync(`${out}/report.json`, JSON.stringify({ errors: errors.slice(0, 10), state }, null, 1)); console.log(JSON.stringify({ shots: times.length, errors: errors.slice(0, 5), state }));
await browser.close();
