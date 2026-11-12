// The fight outside the walls in the real game (dev server): Iris is put on the hillside next to the first skitter
// pack; the pack must wake, strike her (health drops), her Frost Lance and Storm Snare must hurt and kill, and
// `ftf:mob-killed` must fire. Stills along the way. node art/mobs/combat_check.mjs <out dir> [url] [--m]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199', phone = process.argv.includes('--m');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=${phone ? 'm' : 'full'}${phone ? '&tier=low' : ''}`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 });
await page.evaluate(() => { window.__kills = []; window.addEventListener('ftf:mob-killed', (e) => window.__kills.push(e.detail)); });
await page.waitForFunction(() => window.__ftf.town.mobs, null, { timeout: 120000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
const shot = async (n) => writeFileSync(`${out}/${n}.jpg`, await page.screenshot({ type: 'jpeg', quality: 82 }));
// put her 5 m from the first pack's home, on the ground
const start = await page.evaluate(() => {
  const f = window.__ftf, mobs = f.town.mobs, home = mobs.brain.packs[0].home;
  const p = [home[0] + 5, home[1] + 40, home[2] - 3];
  f.player.teleport(p, Math.atan2(home[0] - p[0], home[2] - p[2]));
  return { home, mobs: mobs.brain.mobs.length, hp: mobs.hp };
});
await page.waitForTimeout(1500); await shot('1_arrive');
await page.waitForFunction(() => window.__ftf.town.mobs.hp < 100, null, { timeout: 20000 }).catch(() => errors.push('Iris was never hit'));
const hurt = await page.evaluate(() => window.__ftf.town.mobs.hp); await shot('2_hurt');
// the strike combo on the nearest skitter (face it, F three times), then a dash (Space)
const melee = await page.evaluate(async () => {
  const f = window.__ftf, mobs = f.town.mobs, p = f.player.pos, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const live = mobs.brain.mobs.filter((m) => m.pack === mobs.brain.packs[0] && m.state !== 'dead' && m.state !== 'gone');
  live.sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]));
  const t = live[0];
  f.player.teleport([t.pos[0], t.pos[1] + 0.5, t.pos[2] - 1.2], 0); await wait(120);
  const hp0 = t.hp; const res = { combos: [] };
  for (let i = 0; i < 3; i++) { f.player.heading = Math.atan2(t.pos[0] - f.player.pos[0], t.pos[2] - f.player.pos[2]); res.combos.push(mobs.strike() ? mobs.actions.combo : 0); await wait(380); }
  res.dealt = hp0 - t.hp;
  const a = f.player.pos.slice(); res.dash = mobs.dash([1, 0]); res.iframes = mobs.actions.iframes; await wait(450);
  res.dashed = Math.hypot(f.player.pos[0] - a[0], f.player.pos[2] - a[2]);
  return res;
});
await shot('3_melee');
// cast at the nearest living skitter until the pack is dead (or 20 casts)
let casts = 0;
for (let i = 0; i < 24; i++) {
  const r = await page.evaluate((i) => {
    const f = window.__ftf, mobs = f.town.mobs, p = f.player.pos;
    const live = mobs.brain.mobs.filter((m) => m.pack === mobs.brain.packs[0] && m.state !== 'dead' && m.state !== 'gone');
    if (!live.length) return { done: true };
    live.sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]));
    const id = i % 3 === 2 ? 'snare' : 'lance';
    const c = f.town.casting; if (!c || !c.aimAt(id, live[0].pos)) return { field: false };
    return { ok: c.release(), left: live.length, id };
  }, i);
  if (r.done) break;
  if (r.field === false) { errors.push('not on the casting field'); break; }
  casts++;
  if (i === 1) { await page.waitForTimeout(250); await shot('3b_cast'); }
  await page.waitForTimeout(1300);
}
await page.waitForTimeout(3500); await shot('4_after');
const end = await page.evaluate(() => ({ kills: window.__kills, hp: window.__ftf.town.mobs.hp, states: window.__ftf.town.mobs.brain.mobs.filter((m) => m.pack === window.__ftf.town.mobs.brain.packs[0]).map((m) => m.state) }));
const res = { phone, start, hurt, melee, casts, end, errors, pass: errors.length === 0 && hurt < 100 && melee.dealt > 0 && melee.combos.join() === '1,2,3' && melee.dashed > 3 && end.kills.length >= 1 && end.kills.every((k) => k.type && k.pos.length === 3) };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
