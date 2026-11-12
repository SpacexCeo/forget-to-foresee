// Boss aggro check on the BUILT page (owner 12.11: "I can hit the boss from far away and it never comes"): Iris
// stands ~20 m from the crownrift (beyond its old leash), hits it once from there and then stands still. The boss
// must be provoked at once and must close in or shoot until she takes damage. Then she walks into the town: after
// PURSUIT.lose s it resets and heals back. Prints JSON; exits 1 on failure.
//   node art/combat/aggro_check.mjs <out dir> [url]
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
await page.goto(`${url}/?play=direct&town=1&day1=0&hero=iris&quest=0&tod=day&weather=clear`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.waitForTimeout(1500);
const setup = await page.evaluate(() => {
  const f = window.__ftf, M = f.town.mobs, b = M.brain, boss = b.mobs.find((m) => m.T.elite);
  for (const o of b.mobs) if (o !== boss) { o.state = 'gone'; }                         // only the boss on the hillside
  const home = boss.pack.home;
  // a spot ~20 m from the boss on the open field (straight line on the field), beyond its old leash (16 + 3 m)
  let at = null;
  for (let i = 0; i < 128 && !at; i++) {
    const a = (i / 128) * Math.PI * 2, p = [boss.pos[0] + Math.sin(a) * 20, boss.pos[1], boss.pos[2] + Math.cos(a) * 20];
    let ok = Math.hypot(p[0] - home[0], p[2] - home[2]) > 19;
    for (let k = 0; k <= 20 && ok; k++) ok = b.outside([boss.pos[0] + (p[0] - boss.pos[0]) * k / 20, 0, boss.pos[2] + (p[2] - boss.pos[2]) * k / 20]);
    if (ok) at = p;
  }
  if (!at) return null;
  f.player.teleport([at[0], at[1] + 3, at[2]], Math.atan2(boss.pos[0] - at[0], boss.pos[2] - at[2]));
  M.iris.hp = 100;
  return { at, boss: boss.pos.slice(), home };
});
if (!setup) { console.log(JSON.stringify({ ok: false, error: 'no spot' })); process.exit(1); }
await page.waitForTimeout(2500);
const before = await page.evaluate(() => { const b = window.__ftf.town.mobs.brain.mobs.find((m) => m.T.elite); return { state: b.state, provoked: !!b.provoked }; });
// one hit from ~20 m (no cast reaches that far, the damage itself is what counts: any distance)
await page.evaluate(() => { const M = window.__ftf.town.mobs, boss = M.brain.mobs.find((m) => m.T.elite); M.brain.damage(boss, 25, []); window.__t0 = performance.now(); window.__hp0 = boss.hp; });
await page.waitForTimeout(120);
const tick = await page.evaluate(() => { const b = window.__ftf.town.mobs.brain.mobs.find((m) => m.T.elite); return { state: b.state, provoked: !!b.provoked }; });
const track = [];
let shotFrame = false;
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => { const f = window.__ftf, M = f.town.mobs, b = M.brain.mobs.find((m) => m.T.elite), p = f.player.pos; return { t: +((performance.now() - window.__t0) / 1000).toFixed(1), d: +Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]).toFixed(1), state: b.state, hp: M.iris.hp }; });
  track.push(s);
  if (!shotFrame && (s.state === 'windup' || s.hp < 100)) { writeFileSync(`${out}/aggro_boss.png`, await page.screenshot()); shotFrame = true; }
  if (s.hp < 100 && i > 4) break;
}
const hurt = track.find((s) => s.hp < 100);
// she leaves into the town: reset after PURSUIT.lose s, healed back
await page.evaluate(() => { const f = window.__ftf; f.town.mobs.iris.hp = 100; f.player.teleport([-7, 1203, 25], 2.4); });
await page.waitForTimeout(12000);
const after = await page.evaluate(() => { const b = window.__ftf.town.mobs.brain.mobs.find((m) => m.T.elite); return { provoked: !!b.provoked, hp: b.hp, max: b.T.hp, state: b.state }; });
const res = { setup, before, tick, hurtAt: hurt || null, track, after, errors };
res.ok = !before.provoked && tick.provoked && ['chase', 'stagger', 'windup'].includes(tick.state) && !!hurt && !after.provoked && after.hp === after.max && !errors.length;
console.log(JSON.stringify(res, null, 1));
await browser.close();
process.exit(res.ok ? 0 : 1);
