// The hulker and the crownrift elite in the real game (GPU server), captured straight from the canvas through a
// scripted side camera (30+ fps): each pack wakes, telegraphs and strikes, Iris fights back with the strike combo,
// the dash and both casts, hit flashes, the death and the dissolve. Frames f_0000.jpg.. + report.json.
//   node art/combat/elite_fight.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
// walk out once so the hillside colliders exist, then the packs settle
await page.evaluate(() => window.__ftf.player.teleport([0, 1199, 44], 0)); await page.waitForTimeout(2500);
let n = 0;
const frame = () => page.evaluate(() => {
  const f = window.__ftf, c = window.__cam;
  const cam = f.rig.camera.clone(); cam.fov = 42; cam.near = 0.1; cam.aspect = f.renderer.domElement.width / f.renderer.domElement.height; cam.updateProjectionMatrix();
  cam.position.set(...c.pos); cam.lookAt(...c.look); cam.updateMatrixWorld(true);
  f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam); return f.renderer.domElement.toDataURL('image/jpeg', 0.88);
}).then((d) => writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64')));

async function fight(pi, maxMs, dist) {
  await page.evaluate(({ pi, dist }) => {
    const f = window.__ftf, pack = f.town.mobs.brain.packs[pi];
    const p = [pack.home[0] + dist, pack.home[1] + 1.2, pack.home[2] + 1.0];
    f.player.teleport(p, Math.atan2(pack.home[0] - p[0], pack.home[2] - p[2])); f.town.mobs.iris.hp = 100;
    window.__cam = null;
  }, { pi, dist });
  await page.waitForTimeout(1200);
  const t0 = Date.now(); let lastAct = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate((pi) => {
      const f = window.__ftf, b = f.town.mobs.brain, p = f.player.pos, live = b.mobs.filter((m) => m.pack === b.packs[pi] && m.state !== 'gone');
      const m = live.find((x) => x.state !== 'dead') || live[0];
      if (!m) return { done: true };
      // a side camera framing both, easing along
      const mx = (m.pos[0] + p[0]) / 2, mz = (m.pos[2] + p[2]) / 2, dx = p[0] - m.pos[0], dz = p[2] - m.pos[2], l = Math.hypot(dx, dz) || 1;
      const want = [mx - dz / l * (6 + m.T.radius * 2.5), Math.max(p[1], m.pos[1]) + 2.2 + m.T.radius, mz + dx / l * (6 + m.T.radius * 2.5)], look = [mx, Math.max(p[1], m.pos[1]) + 1.0 + m.T.radius * 0.4, mz];
      const c = window.__cam || (window.__cam = { pos: want.slice(), look: look.slice() });
      for (let i = 0; i < 3; i++) { c.pos[i] += (want[i] - c.pos[i]) * 0.06; c.look[i] += (look[i] - c.look[i]) * 0.1; }
      return { done: m.state === 'gone' || (m.state === 'dead' && m.t > 3.2), d: Math.hypot(m.pos[0] - p[0], m.pos[2] - p[2]), state: m.state, radius: m.T.radius, pos: m.pos.slice(), windup: m.state === 'windup' ? m.t / (m.T.windup * m.T.impact) : 0 };
    }, pi);
    await frame();
    if (s.done) break;
    if (s.state === 'dead') continue;
    const now = Date.now();
    if (now - lastAct < 330) continue;
    lastAct = now;
    await page.evaluate((s) => {
      const f = window.__ftf, M = f.town.mobs, p = f.player.pos;
      f.player.heading = Math.atan2(s.pos[0] - p[0], s.pos[2] - p[2]);
      if (s.windup > 0.65 && s.d < 4 + s.radius) { M.dash([Math.cos(f.player.heading), -Math.sin(f.player.heading)]); return; }   // sidestep the telegraphed blow
      if (s.d < 2.2 + s.radius) { M.strike(); return; }
      const c = f.town.casting; if (c && (c.aimAt('lance', s.pos) && c.release())) return; if (c) { c.aimAt('snare', s.pos); c.release(); }
    }, s);
  }
  for (let i = 0; i < 30; i++) await frame();       // the dissolve plays out
  return Date.now() - t0;
}
const T0 = Date.now();
const hulkerMs = await fight(3, 16000, 4.5); log.push({ hulker: hulkerMs, frames: n });
const eliteMs = await fight(5, 26000, 6); log.push({ crownrift: eliteMs, frames: n });
const secs = (Date.now() - T0) / 1000;
const kills = await page.evaluate(() => (window.__ftf.town.mobs.brain.mobs.filter((m) => m.state === 'gone').map((m) => m.type)));
const res = { frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), log, kills, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
