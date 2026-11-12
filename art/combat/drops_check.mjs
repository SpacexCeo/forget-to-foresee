// Monster resource drops on the BUILT page (owner 12.11 evening, behind ?story=1): stone spiders are struck down
// beside Iris outside the gate; every kill rolls game/resources.js, the drop must land in the inventory with source
// 'drop', one toast lists it and 'ftf:resource-drop' fires. Then Profile -> Inventory shows the resource cards.
// Stills: drop_toast.png (the toast and the spark), drop_bag.png (the bag). Prints JSON; exits 1 on failure.
//   node art/combat/drops_check.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || '.', url = process.argv[3] || 'http://127.0.0.1:4319';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
await page.addInitScript(() => { window.__drops = []; window.__toasts = []; addEventListener('ftf:resource-drop', (e) => window.__drops.push(e.detail)); });
await page.goto(`${url}/?play=direct&town=1&day1=0&hero=iris&quest=0&tod=evening&weather=clear&story=1`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([0, 1199, 46], 0)); await page.waitForTimeout(3000);
// the toast text as it shows (town HUD toast or the page toast)
await page.evaluate(() => { new MutationObserver(() => { for (const el of document.querySelectorAll('#toast, [class*="toast"]')) { const s = el.textContent.trim(); if (s && !el.hidden && window.__toasts[window.__toasts.length - 1] !== s) window.__toasts.push(s); } }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); });
let kills = 0, shot = false;
for (let i = 0; i < 14; i++) {
  const ok = await page.evaluate(() => {
    const f = window.__ftf, M = f.town.mobs, b = M.brain;
    const sk = b.mobs.find((x) => x.type === 'skitter' && x.state !== 'dead' && x.state !== 'gone');
    if (!sk) return false;
    for (const o of b.mobs) if (o !== sk && o.state !== 'dead' && o.state !== 'gone' && Math.hypot(o.pos[0] - f.player.pos[0], o.pos[2] - f.player.pos[2]) < 12) o.pos[0] += 40;
    M.iris.hp = 100; const p = f.player.pos, h = f.player.heading;
    sk.pos[0] = p[0] + Math.sin(h) * 1.4; sk.pos[1] = p[1]; sk.pos[2] = p[2] + Math.cos(h) * 1.4; sk.hp = 1; sk.state = 'idle'; sk.freeze = 999;
    return true;
  });
  if (!ok) break;
  await page.keyboard.press('KeyF'); await page.waitForTimeout(900);
  kills++;
  if (!shot && (await page.evaluate(() => window.__drops.length > 0))) { await page.waitForTimeout(250); writeFileSync(`${out}/drop_toast.png`, await page.screenshot()); shot = true; }
  await page.waitForTimeout(1200);
}
const res = await page.evaluate(() => {
  const inv = JSON.parse(localStorage.getItem('ftf.inventory.v1') || '{"items":{}}').items;
  const res = Object.fromEntries(Object.entries(inv).filter(([k]) => k.startsWith('res_')));
  const st = JSON.parse(localStorage.getItem('ftf.resources.v1') || 'null');
  return { drops: window.__drops, toasts: [...new Set(window.__toasts.filter((s) => /\+\d/.test(s) && s.length < 120))].slice(0, 6), bag: res, state: st };
});
res.kills = kills;
// the bag (the Profile button shows in the town)
await page.evaluate(() => window.__ftf.player.teleport([-7, 1203, 25], 2.4)); await page.waitForTimeout(3500);
await page.mouse.click(130, 55);                                                       // the HUD's profile card
await page.waitForTimeout(1200);
const tab = page.locator('.gm-tab[data-tab="inventory"]');
if (await tab.count()) await tab.first().click(); else errors.push('no Inventory tab');
await page.waitForTimeout(1500);
res.cards = await page.evaluate(() => [...document.querySelectorAll('.gm-card')].map((c) => c.textContent.trim().slice(0, 60)).filter((s) => /silk thread|Chitin|Veil|Ash ore|Crown/i.test(s)));
writeFileSync(`${out}/drop_bag.png`, await page.screenshot());
const total = res.drops.reduce((a, d) => a + d.drops.reduce((b, x) => b + x.n, 0), 0), inBag = Object.values(res.bag).reduce((a, x) => a + x.n, 0);
res.ok = res.drops.length > 0 && total === inBag && Object.values(res.bag).every((x) => x.source === 'drop') && res.toasts.length > 0 && res.cards.length > 0 && !errors.length;
res.errors = errors;
console.log(JSON.stringify(res, null, 1));
await browser.close();
process.exit(res.ok ? 0 : 1);
