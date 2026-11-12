// The first fight outside the walls, captured in the real game (GPU server): the intro card is skipped, Iris walks
// out of the lower gate (click to move), the first skitter pack wakes, she fights it with the strike combo, a dash and
// the Frost Lance until it is dead. Frames as f_0000.jpg.. plus report.json; ffmpeg makes the video.
//   node art/combat/first_fight.mjs <out dir> [url] [WxH]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199';
const [W, H] = (process.argv.find((a) => /^\d+x\d+$/.test(a)) || '1280x720').split('x').map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
await page.waitForFunction(() => window.__ftf.town.mobs, null, { timeout: 120000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
await page.evaluate(() => { window.__kills = []; window.addEventListener('ftf:mob-killed', (e) => window.__kills.push(e.detail)); });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.waitForTimeout(1500);
// just inside the lower gate, facing out
await page.evaluate(() => { const f = window.__ftf; f.player.teleport([0, 1203, 29], 0); });
await page.waitForTimeout(1500);
const camInfo = await page.evaluate(() => { const f = window.__ftf; const before = f.rig.camera.position.z - f.player.pos[2]; f.rig.yaw += Math.PI; return { yaw: f.rig.yaw, before }; });
await page.waitForTimeout(1200);
camInfo.after = await page.evaluate(() => window.__ftf.rig.camera.position.z - window.__ftf.player.pos[2]);   // negative: the camera is on the town side, looking out

const L = (x, z) => [x, 1200, z];          // town-local -> world (the town origin is [0, 1200, 0])
const screenOf = (p) => page.evaluate((p) => {
  const f = window.__ftf, c = f.rig.camera, v = { x: p[0], y: p[1], z: p[2] };
  const THREE = c.position.constructor; const w = new THREE(v.x, v.y, v.z).project(c);
  return [(w.x + 1) / 2 * innerWidth, (1 - w.y) / 2 * innerHeight, w.z];
}, p);
const groundAt = (p) => page.evaluate((p) => { const f = window.__ftf; return [p[0], f.player.pos[1], p[2]]; }, p);
async function walkTo(p) { const g = await groundAt(p); const s = await screenOf(g); if (s[2] < 1) await page.mouse.click(s[0], s[1]); }
const state = () => page.evaluate(() => {
  const f = window.__ftf, mobs = f.town.mobs, p = f.player.pos, pack = mobs.brain.packs[0];
  const live = mobs.brain.mobs.filter((m) => m.pack === pack && m.state !== 'dead' && m.state !== 'gone');
  live.sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]));
  return { live: live.length, near: live[0] ? { pos: live[0].pos, d: Math.hypot(live[0].pos[0] - p[0], live[0].pos[2] - p[2]), state: live[0].state } : null, hp: mobs.hp, field: !!(f.town.casting && f.town.casting.field) };
});

// capture in the background
let capturing = true, n = 0; const t0 = Date.now();
const capture = (async () => {
  while (capturing) {
    const b = await page.screenshot({ type: 'jpeg', quality: 80 });
    writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, b);
  }
})();

const wait = (ms) => page.waitForTimeout(ms);
await walkTo(L(0, 44)); log.push('walk out'); await wait(4200);
await walkTo(L(-8, 50)); log.push('towards the pack'); await wait(2500);
for (let round = 0; round < 14 && (Date.now() - t0) < 28000; round++) {
  const s = await state();
  if (!s.live) { log.push('pack dead'); break; }
  if (s.near.d > 2.0) {
    if (s.field && s.near.d < 11 && round % 3 === 1) {                       // Frost Lance at range
      await page.keyboard.press('KeyQ'); const sc = await screenOf(s.near.pos); await page.mouse.click(sc[0], sc[1]); log.push('lance'); await wait(900); continue;
    }
    await walkTo(s.near.pos); await wait(700); continue;
  }
  await page.evaluate((p) => { const f = window.__ftf; f.player.heading = Math.atan2(p[0] - f.player.pos[0], p[2] - f.player.pos[2]); }, s.near.pos);
  for (let k = 0; k < 3; k++) { await page.keyboard.press('KeyF'); await wait(360); }
  log.push('combo');
  if (round % 2 === 0) { await page.keyboard.press('Space'); log.push('dash'); await wait(500); }
  else await wait(300);
}
await wait(2600);
capturing = false; await capture;
const secs = (Date.now() - t0) / 1000;
const end = await page.evaluate(() => ({ kills: window.__kills, hp: window.__ftf.town.mobs.hp }));
const res = { camInfo, frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), log, end, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
