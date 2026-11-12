// Play-test of every monster type in the real game (dev server): for each pack, Iris is put 6 m from it; the script
// records whether it wakes (chase), telegraphs (windup with the ring), lands its hit (melee impact or the Veilbell's
// seed reaching her), takes the casts and the strike, dies, reports the kill and dissolves. Stills per type.
//   node art/mobs/playtest.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
await page.evaluate(() => {
  window.__kills = []; window.addEventListener('ftf:mob-killed', (e) => window.__kills.push(e.detail));
  window.__seen = {}; window.__hits = [];
  const mobs = window.__ftf.town.mobs, brain = mobs.brain, step = brain.step.bind(brain);
  brain.step = (...a) => { const ev = step(...a); for (const e of ev) { const k = e.mob.type + ':' + e.kind; window.__seen[k] = (window.__seen[k] || 0) + 1; } return ev; };
  const hp0 = { v: mobs.hp }; setInterval(() => { if (mobs.hp < hp0.v) window.__hits.push(hp0.v - mobs.hp); hp0.v = mobs.hp; }, 50);
});
const shotCam = (name, mobPos) => page.evaluate((p) => {
  const f = window.__ftf, q = f.player.pos, mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2, dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
  const cam = f.rig.camera.clone(); cam.fov = 45; cam.near = 0.1; cam.aspect = f.renderer.domElement.width / f.renderer.domElement.height; cam.updateProjectionMatrix();
  cam.position.set(mx - dz / l * 9, q[1] + 4.5, mz + dx / l * 9); cam.lookAt(mx, q[1] + 1, mz); cam.updateMatrixWorld(true);
  f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam); return f.renderer.domElement.toDataURL('image/jpeg', 0.85);
}, mobPos).then((d) => writeFileSync(`${out}/${name}.jpg`, Buffer.from(d.split(',')[1], 'base64')));

const result = {};
for (const pi of [2, 3, 5]) {          // veilbell pair, hulker, crownrift elite
  const info = await page.evaluate((pi) => {
    const f = window.__ftf, b = f.town.mobs.brain, pack = b.packs[pi];
    const p = [pack.home[0] + 5, pack.home[1] + 1.5, pack.home[2] + 1.5];       // the home sits on the real ground
    f.player.teleport(p, Math.atan2(pack.home[0] - p[0], pack.home[2] - p[2]));
    f.town.mobs.iris.hp = 100;
    return { type: pack.type, home: pack.home };
  }, pi);
  await page.waitForTimeout(1500);                      // she lands from the drop before the clock starts
  const T0 = Date.now(); const r = { type: info.type };
  // wake and strike: up to 9 s, Iris standing still (a short dash-out if her health gets low)
  await page.waitForFunction((t) => (window.__seen[t + ':impact'] || 0) + (window.__seen[t + ':shot'] || 0) > 0, info.type, { timeout: 9000 }).catch(() => {});
  r.woke = !!(await page.evaluate((t) => window.__ftf.town.mobs.brain.mobs.some((m) => m.type === t && (m.state === 'chase' || m.state === 'windup' || m.state === 'recover')), info.type));
  await page.waitForTimeout(900);
  const mobPos = await page.evaluate((pi) => { const b = window.__ftf.town.mobs.brain; const m = b.mobs.find((x) => x.pack === b.packs[pi] && x.state !== 'gone' && x.state !== 'dead'); return m ? m.pos.slice() : b.packs[pi].home; }, pi);
  await shotCam(info.type + '_1_attack', mobPos);
  // fight: lance + snare + strikes until the pack is dead (max 40 s)
  let casts = 0;
  while (Date.now() - T0 < 50000) {
    const s = await page.evaluate((pi) => {
      const f = window.__ftf, b = f.town.mobs.brain, p = f.player.pos;
      const live = b.mobs.filter((m) => m.pack === b.packs[pi] && m.state !== 'dead' && m.state !== 'gone');
      if (!live.length) return { done: true };
      live.sort((a, c) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(c.pos[0] - p[0], c.pos[2] - p[2]));
      const m = live[0], d = Math.hypot(m.pos[0] - p[0], m.pos[2] - p[2]);
      f.player.heading = Math.atan2(m.pos[0] - p[0], m.pos[2] - p[2]);
      let did = '';
      if (d < 2.4 + m.T.radius) did = f.town.mobs.strike() ? 'strike' : '';
      if (!did) { const c = f.town.casting; if (c && c.aimAt('lance', m.pos) && c.release()) did = 'lance'; else if (c && c.aimAt('snare', m.pos) && c.release()) did = 'snare'; }
      if (f.town.mobs.hp < 35) { f.town.mobs.dash([-Math.sin(f.player.heading), -Math.cos(f.player.heading)]); did += '+dash'; }
      return { did, hp: m.hp, state: m.state, d: +d.toFixed(1), irisHp: f.town.mobs.hp };
    }, pi);
    if (s.done) break;
    if (s.did) casts++;
    await page.waitForTimeout(350);
  }
  r.seconds = +((Date.now() - T0) / 1000).toFixed(1);
  await page.waitForTimeout(500); await shotCam(info.type + '_2_death', mobPos);
  await page.waitForTimeout(3500);
  r.actions = casts;
  r.events = await page.evaluate((t) => Object.fromEntries(Object.entries(window.__seen).filter(([k]) => k.startsWith(t + ':'))), info.type);
  r.kills = await page.evaluate((t) => window.__kills.filter((k) => k.type === t).length, info.type);
  r.irisDamage = await page.evaluate(() => { const s = window.__hits.reduce((a, b) => a + b, 0); window.__hits = []; return Math.round(s); });
  r.states = await page.evaluate((pi) => { const b = window.__ftf.town.mobs.brain; return b.mobs.filter((m) => m.pack === b.packs[pi]).map((m) => m.state); }, pi);
  r.shots = await page.evaluate(() => window.__ftf.town.mobs.shotLog.splice(0));
  result[info.type] = r;
}
const res = { result, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
