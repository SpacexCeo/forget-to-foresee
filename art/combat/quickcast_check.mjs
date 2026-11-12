// Quick cast check on the built page (owner 12.11): with the default setting, Q / V cast at once toward the mouse
// cursor (the snare on the cursor when in range, clamped to its range otherwise), with no aim step; with the box
// unticked Q only arms. Prints JSON; exits 1 on failure.   node art/combat/quickcast_check.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:4319';
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
await page.addInitScript(() => { window.__casts = []; addEventListener('ftf:cast', (e) => window.__casts.push({ ...e.detail, t: performance.now() })); });
await page.goto(`${url}/?play=direct&town=1&day1=0&hero=iris&quest=0&tod=evening&weather=clear&mobs=0`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.casting, null, { timeout: 600000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([0, 1199, 50], 0)); await page.waitForTimeout(3000);
const res = { box: await page.evaluate(() => { const b = document.querySelector('.ftf-cast-quick input'); return b ? { checked: b.checked, visible: !!b.offsetParent } : null; }) };
async function castAt(key, sx, sy) {
  await page.mouse.move(sx, sy); await page.waitForTimeout(150);
  const n0 = await page.evaluate(() => window.__casts.length);
  await page.keyboard.press(key); await page.waitForTimeout(400);
  return page.evaluate((n0) => ({ casts: window.__casts.slice(n0).map((c) => c.phase + ':' + c.id), armed: window.__ftf.town.casting.armed, heading: +window.__ftf.player.heading.toFixed(2) }), n0);
}
res.lanceRight = await castAt('KeyQ', 1000, 420);
await page.waitForTimeout(1300);
res.snareLeft = await castAt('KeyV', 280, 430);
await page.waitForTimeout(2600);
await page.evaluate(() => { const b = document.querySelector('.ftf-cast-quick input'); b.click(); });
res.off = await castAt('KeyQ', 640, 400);
await page.keyboard.press('Escape');
await page.evaluate(() => { const b = document.querySelector('.ftf-cast-quick input'); b.click(); });
res.errors = errors;
res.ok = !!(res.box && res.box.checked && res.box.visible && res.lanceRight.casts.includes('start:lance') && res.snareLeft.casts.includes('start:snare') && res.lanceRight.heading !== res.snareLeft.heading && res.off.armed === 'lance' && !res.off.casts.length && !errors.length);
console.log(JSON.stringify(res));
await browser.close();
process.exit(res.ok ? 0 : 1);
