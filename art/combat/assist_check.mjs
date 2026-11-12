// Strike assist check on the BUILT page (owner 12.11: "strikes still fly sideways; on a PC assist onto the mob"):
// a skitter held still at 90° and 150° to her side, 3 m and 6 m away, the mouse cursor parked far to the other side;
// F (keyboard) and the touch strike slot (pointerdown / pointerup) must turn her heading onto the creature (±10°) and
// the creature must take damage. Prints JSON; exits 1 on any failure.   node art/combat/assist_check.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:4319';
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&hero=iris&quest=0&tod=evening&weather=clear`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([0, 1199, 44], 0)); await page.waitForTimeout(3000);
const results = [];
for (const input of ['key', 'touch']) for (const [deg, dist] of [[90, 3], [150, 3], [90, 6], [150, 6]]) {
  const setup = await page.evaluate(({ deg, dist }) => {
    const f = window.__ftf, M = f.town.mobs, b = M.brain, pk = b.packs[0];
    const sk = b.mobs.find((x) => x.pack === pk && x.state !== 'dead' && x.state !== 'gone');
    if (!sk) return null;
    for (const o of b.mobs) if (o !== sk && o.state !== 'dead' && o.state !== 'gone') { o.pos[0] += 40; }   // the others far away
    sk.hp = sk.T.hp; sk.state = 'idle'; sk.freeze = 999;                                                     // held still
    const cam = f.rig.camera, v = cam.getWorldDirection(cam.position.clone()), h = Math.atan2(v.x, v.z) + (deg * Math.PI / 180);
    const p = [sk.pos[0] - Math.sin(h) * dist, sk.pos[1] + 1, sk.pos[2] - Math.cos(h) * dist];
    f.player.teleport(p, Math.atan2(v.x, v.z)); M.iris.hp = 100;                                            // she faces where the camera looks
    window.__sk = sk; return { hp: sk.hp };
  }, { deg, dist });
  if (!setup) { results.push({ input, deg, dist, error: 'no skitter' }); continue; }
  await page.waitForTimeout(700);
  await page.mouse.move(1270, 10);                                                                           // the cursor parked far away
  await page.evaluate(() => { window.__sk.freeze = 999; window.__h0 = window.__ftf.player.heading; });
  if (input === 'key') await page.keyboard.press('KeyF');
  else await page.evaluate(() => { const b = document.querySelector('.ftf-cast-slot[data-id="strike"]'); const o = { bubbles: true, pointerId: 7, pointerType: 'touch' }; b.dispatchEvent(new PointerEvent('pointerdown', o)); setTimeout(() => b.dispatchEvent(new PointerEvent('pointerup', o)), 60); });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const f = window.__ftf, sk = window.__sk, p = f.player.pos, want = Math.atan2(sk.pos[0] - p[0], sk.pos[2] - p[2]);
    const off = Math.abs(Math.atan2(Math.sin(f.player.heading - want), Math.cos(f.player.heading - want))) * 180 / Math.PI;
    return { off: +off.toFixed(1), hp: Math.round(sk.hp), aimedBy: f.town.mobs.aimedBy, avatarOff: +Math.abs(Math.atan2(Math.sin(f.iris && f.iris.irisModel ? 0 : 0), 1)).toFixed(1) };
  });
  results.push({ input, deg, dist, ...r, ok: r.off <= 10 && r.hp < setup.hp });
  await page.waitForTimeout(900);
}
const ok = results.every((x) => x.ok) && !errors.length;
console.log(JSON.stringify({ ok, results, errors }));
await browser.close();
process.exit(ok ? 0 : 1);
