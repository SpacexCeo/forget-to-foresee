// The first fight outside the walls, captured in the real game (GPU server): the intro card is skipped, Iris walks
// out of the lower gate (click to move), the first skitter pack wakes, she fights it with the strike combo, a dash and
// the Frost Lance until it is dead. Frames as f_0000.jpg.. plus report.json; ffmpeg makes the video.
//   node art/combat/first_fight.mjs <out dir> [url] [WxH]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199';
const V3 = process.argv.includes('v3');      // v3: the pack's kill drops the chest, the open-case reveal (?chestpreview=1) ends it
const [W, H] = (process.argv.find((a) => /^\d+x\d+$/.test(a)) || '1280x720').split('x').map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = 'button.ftf-town-prompt[style*="left: 16px"],button.ftf-town-prompt[style*="left:16px"]{opacity:0!important}'; document.addEventListener('DOMContentLoaded', () => document.head.append(st)); });
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris${V3 ? '&chestpreview=1' : ''}`);
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
// steering with the keyboard relative to the game camera (WASD, Shift to run): holds keys until she is within `near`
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function walkTo(p, near = 1.2, maxMs = 6000, run = true) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    const r = await page.evaluate((p) => {
      const f = window.__ftf, q = f.player.pos, dx = p[0] - q[0], dz = p[2] - q[2], d = Math.hypot(dx, dz);
      const { fwd, right } = f.rig.groundAxes(); const ux = dx / (d || 1), uz = dz / (d || 1);
      return { d, ay: ux * fwd.x + uz * fwd.y, ax: ux * right.x + uz * right.y };
    }, p);
    if (r.d < near) break;
    const want = new Set(run ? ['ShiftLeft'] : []);
    if (r.ay > 0.38) want.add('KeyW'); if (r.ay < -0.38) want.add('KeyS'); if (r.ax > 0.38) want.add('KeyD'); if (r.ax < -0.38) want.add('KeyA');
    await keys(want); await page.waitForTimeout(90);
  }
  await keys(new Set());
}
const state = () => page.evaluate(() => {
  const f = window.__ftf, mobs = f.town.mobs, p = f.player.pos, pack = mobs.brain.packs[0];
  const live = mobs.brain.mobs.filter((m) => m.pack === pack && m.state !== 'dead' && m.state !== 'gone');
  live.sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]));
  return { live: live.length, near: live[0] ? { pos: live[0].pos, d: Math.hypot(live[0].pos[0] - p[0], live[0].pos[2] - p[2]), state: live[0].state } : null, hp: mobs.hp, field: !!(f.town.casting && f.town.casting.field) };
});

// the game camera follows a chase path behind her towards the pack: rig.update is wrapped, so every frame the game
// renders (with its UI) from this camera; a ray from the look point keeps it in front of walls
await page.evaluate(async () => {
  const f = window.__ftf, col = await import('/src/physics/collision.js'), orig = f.rig.update.bind(f.rig);
  f.rig.update = (...a) => {
    orig(...a);
    const p = f.player.pos, home = window.__camTarget || f.town.mobs.brain.packs[0].home;
    let dx = home[0] - p[0], dz = home[2] - p[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let want = [p[0] - dx * 6.5, p[1] + 3.2, p[2] - dz * 6.5], look = [p[0] + dx * 2.0, p[1] + 0.8, p[2] + dz * 2.0];
    if (p[2] - 1200 * 0 < 43 && p[2] > 20) { want = [p[0] + 1.5, p[1] + 2.0, 46.5]; look = [p[0], p[1] + 1.1, p[2]]; }   // in and just past the gate: a front view, she walks out towards us
    if (window.__camHold) { want = window.__camHold.slice(); look = [p[0], p[1] + 0.9, p[2]]; }   // held: she walks into a still frame
    const dir = [want[0] - look[0], want[1] - look[1], want[2] - look[2]], dl = Math.hypot(...dir);
    const hit = col.rayCast(f.town.scene.world, look, dir, dl, col.MASK_PLAYER);
    if (hit) { const k = Math.max(0.15, (hit.t - 0.4) / dl); for (let i = 0; i < 3; i++) want[i] = look[i] + dir[i] * k; }
    const c = window.__cam || (window.__cam = { pos: want.slice(), look: look.slice() });
    for (let i = 0; i < 3; i++) { c.pos[i] += (want[i] - c.pos[i]) * (hit ? 0.5 : 0.12); c.look[i] += (look[i] - c.look[i]) * 0.15; }
    f.rig.camera.position.set(...c.pos); f.rig.camera.lookAt(...c.look); f.rig.camera.updateMatrixWorld(true);
  };
});
// v3: a chest dropped right under her would be picked up mid-fight before the camera sees it; such a drop waits
// until she has stepped away (the kill -> drop hook itself is the game's)
if (V3) await page.evaluate(() => {
  const M = window.__ftf.town.monsters, d = M.drop.bind(M);
  M.drop = (pos, elite) => { const go = () => { const q = window.__ftf.player.pos; if (Math.hypot(q[0] - pos[0], q[2] - pos[2]) > 2.4) d(pos, elite); else setTimeout(go, 150); }; go(); return true; };
});
// capture in the background
let capturing = true, n = 0; const t0 = Date.now();
const capture = (async () => {
  while (capturing) {
    const b = await page.screenshot({ type: 'jpeg', quality: 80 });            // the game's own frame, UI included
    writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, b);
  }
})();

const wait = (ms) => page.waitForTimeout(ms);
await walkTo(L(0, 42), 1.5, 6000, false); log.push('walk out');
await walkTo(L(-7, 50), 1.5, 5000, true); log.push('towards the pack');
// let the pack reach her and land a few hits first (the health bar and the hurt flash show), then fight back
const t1 = Date.now(); while (Date.now() - t1 < 4500 && (await state()).hp > 88) await wait(200);
log.push('hit by the pack: hp ' + Math.round((await state()).hp));
for (let round = 0; round < 14 && (Date.now() - t0) < 28000; round++) {
  const s = await state();
  if (!s.live) { log.push('pack dead'); break; }
  if (s.near.d > 2.0) {
    if (s.field && s.near.d < 11 && round % 3 === 1) {                       // Frost Lance at range
      const ok = await page.evaluate((p) => { const c = window.__ftf.town.casting; return c.aimAt('lance', p) && c.release(); }, s.near.pos); log.push(ok ? 'lance' : 'lance-miss'); await wait(900); continue;
    }
    await walkTo(s.near.pos, 1.6, 1500, true); continue;
  }
  await page.evaluate((p) => { const f = window.__ftf; f.player.heading = Math.atan2(p[0] - f.player.pos[0], p[2] - f.player.pos[2]); }, s.near.pos);
  for (let k = 0; k < 3; k++) { await page.keyboard.press('KeyF'); await wait(360); }
  log.push('combo');
  if (round % 2 === 0) { await page.keyboard.press('Space'); log.push('dash'); await wait(500); }
  else await wait(300);
}
await wait(1500);
if (V3) {
  // the chest the pack's kill dropped (play/mobs.js 'ftf:mob-killed' -> town-monsters drop): walk onto it, then the
  // labelled open-case preview (its button is clicked from script and kept off screen: the reel and the card show)
  await page.evaluate(() => Promise.all([import('/src/play/chest-open.js'), import('/src/play/game-menu.js')]));
  await walkTo(L(-4, 46), 1.0, 2500, false); log.push('stepped back');   // a drop held under her lands now
  const chests = () => page.evaluate(() => window.__ftf.town.monsters ? window.__ftf.town.monsters.chests.map((c) => c.at) : []);
  let cs = []; for (let i = 0; i < 40 && !(cs = await chests()).length; i++) await wait(250);
  log.push('chests ' + cs.length);
  if (cs.length) {
    await page.evaluate(() => { const c = window.__cam; if (c) window.__camHold = c.pos.slice(); });
    await walkTo(cs[0], 0.6, 6000, false); log.push('walked onto the chest'); await wait(1500);
    const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /preview/i.test(x.textContent)); if (!b) return false; b.click(); return true; });
    log.push(ok ? 'reveal' : 'no preview button'); await wait(11000);
  }
} else {
// the chest: a moss critter below the gate drops one (the monster kill -> chest hook is not in yet): lance it, walk
// onto the chest (picked up into the bag), open the inventory and the chest
const critter = () => page.evaluate(() => {
  const f = window.__ftf, M = f.town.monsters, p = f.player.pos; if (!M) return null;
  const cs = M.critters.filter((c) => c.state !== 'dying' && c.state !== 'gone').map((c) => [c.root.position.x, c.root.position.y, c.root.position.z]);
  cs.sort((a, b) => Math.hypot(a[0] - p[0], a[2] - p[2]) - Math.hypot(b[0] - p[0], b[2] - p[2]));
  return { pos: cs[0] || null, chests: M.chests.map((c) => c.at), kills: M.kills };
});
for (let i = 0; i < 10 && (Date.now() - t0) < 52000; i++) {
  const c = await critter(); if (!c) { log.push('no critters'); break; }
  if (c.chests.length) { log.push('chest dropped'); break; }
  if (!c.pos) { await wait(800); continue; }
  await page.evaluate((p) => { window.__camTarget = p; }, c.pos);
  const d = await page.evaluate((p) => Math.hypot(p[0] - window.__ftf.player.pos[0], p[2] - window.__ftf.player.pos[2]), c.pos);
  if (d > 9) { await walkTo(c.pos, 8, 3000, true); continue; }
  const ok = await page.evaluate((p) => { const c = window.__ftf.town.casting; return c.aimAt('lance', p) && c.release(); }, c.pos);
  log.push(ok ? 'lance at a critter' : 'lance not ready'); await wait(1300);
}
await wait(900);
const ch = await critter();
if (ch && ch.chests.length) {
  await page.evaluate((p) => { window.__camTarget = p; }, ch.chests[0]);
  await walkTo(ch.chests[0], 0.6, 6000, false); log.push('walked onto the chest'); await wait(1800);
  const bag = await page.evaluate(() => { const b = window.__ftf.town.chests; try { return b ? JSON.stringify(Object.keys(b)) + ':' + (typeof b.count === 'number' ? b.count : (b.sealed ? b.sealed().length : '?')) : null; } catch (e) { return String(e); } });
  log.push('bag ' + bag);
  for (const name of [/Profile/, /Inventory/, /^Open/]) {
    const b = page.getByRole('button', { name }).or(page.getByRole('tab', { name })); if (await b.count()) { await b.first().click().catch(() => {}); log.push('clicked ' + name); await wait(1400); }
  }
  await wait(3500);
}
}
capturing = false; await capture;
const secs = (Date.now() - t0) / 1000;
const end = await page.evaluate(() => ({ kills: window.__kills, hp: window.__ftf.town.mobs.hp, critterKills: window.__ftf.town.monsters ? window.__ftf.town.monsters.kills : null }));
const res = { camInfo, frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), log, end, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
