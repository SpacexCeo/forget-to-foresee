// Short promo vignettes from the real game (GPU server), frames f_0000.jpg.. + report.json:
//   node art/combat/vignettes.mjs elise <out dir> [url]   7 s close orbit of Elise (her own model) in the square at dusk, no HUD
//   node art/combat/vignettes.mjs shop  <out dir> [url]   10 s: Iris walks to the Exchange door, the fade, inside to the counter
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [mode, out, url = 'http://127.0.0.1:5199'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
const hero = mode === 'elise' ? 'elise' : 'iris';
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=${hero}&mobs=0&tod=dusk`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
const wait = (ms) => page.waitForTimeout(ms);
let capturing = true, n = 0; const t0 = { v: 0 };
const capture = async () => { t0.v = Date.now(); while (capturing) writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 88 })); };
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function walkTo(p, near = 0.6, maxMs = 5000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    const r = await page.evaluate((p) => { const f = window.__ftf, q = f.player.pos, dx = p[0] - q[0], dz = p[2] - q[2], d = Math.hypot(dx, dz); const { fwd, right } = f.rig.groundAxes(); const ux = dx / (d || 1), uz = dz / (d || 1); return { d, ay: ux * fwd.x + uz * fwd.y, ax: ux * right.x + uz * right.y }; }, p);
    if (r.d < near) break;
    const want = new Set(); if (r.ay > 0.38) want.add('KeyW'); if (r.ay < -0.38) want.add('KeyS'); if (r.ax > 0.38) want.add('KeyD'); if (r.ax < -0.38) want.add('KeyA');
    await keys(want); await wait(80);
  }
  await keys(new Set());
}

if (mode === 'elise') {
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
  await page.evaluate(() => window.__ftf.player.teleport([-7, 1203, 25], 2.4));     // the quiet west side of the square, the lamps behind
  await wait(3000);
  log.push(await page.evaluate(() => { let tris = 0, toon = false; window.__ftf.iris.irisModel.model.traverse((o) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : 0) / 3; if (o.material.type === 'MeshToonMaterial') toon = true; } }); return { hero: window.__ftf.iris.hero.id, tris, toon }; }));
  await page.evaluate(() => {
    const f = window.__ftf, orig = f.rig.update.bind(f.rig), t0 = performance.now();
    f.rig.update = (...a) => {
      orig(...a);
      const t = (performance.now() - t0) / 1000, p = f.player.pos, a0 = f.player.heading + 0.5 + t * 0.62, r = 2.4 - 0.2 * Math.min(1, t / 7);
      f.rig.camera.position.set(p[0] + Math.sin(a0) * r, p[1] + 1.5 - 0.1 * Math.min(1, t / 7), p[2] + Math.cos(a0) * r);
      f.rig.camera.lookAt(p[0], p[1] + 1.12, p[2]); f.rig.camera.fov = 40;   // head to knees in frame f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
    };
  });
  const cap = capture(); await wait(7200); capturing = false; await cap;
} else {
  const shop = await page.evaluate(() => { const s = window.__ftf.town.shops; return null; });
  const S = { door: [12.8, 1204.5, -9.4] };
  // outside the Exchange door, a few steps away on the street side (the door faces +x)
  await page.evaluate(() => window.__ftf.player.teleport([9.2, 1206, -9.4], Math.PI / 2));
  await wait(2500);
  await page.evaluate(() => {
    const f = window.__ftf, orig = f.rig.update.bind(f.rig);
    f.rig.update = (...a) => {
      orig(...a);
      const p = f.player.pos, inside = f.town.shops && f.town.shops.inside;
      if (!inside) { f.rig.camera.position.set(p[0] - 3.6, p[1] + 2.0, p[2] + 2.4); f.rig.camera.lookAt(p[0] + 2.5, p[1] + 1.2, p[2] - 0.3); }
      else { const c = window.__shopCam; if (c) { f.rig.camera.position.set(...c.pos); f.rig.camera.lookAt(...c.look); } }
      f.rig.camera.fov = 45; f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
    };
  });
  const cap = capture();
  await walkTo([S.door[0] - 0.6, 0, S.door[2]], 0.5, 3000); log.push('at the door');
  const entering = page.evaluate(() => window.__ftf.town.shops.enter('exchange')); log.push('enter');
  await entering;
  const info = await page.evaluate(() => { const f = window.__ftf, p = f.player.pos; return { pos: p.slice(), inside: f.town.shops.inside }; });
  log.push(info);
  // inside: the camera behind and above her, she walks to the counter
  const target = await page.evaluate(() => { const f = window.__ftf, p = f.player.pos; const s = f.town.shops; return { p: p.slice() }; });
  const counter = [2000, 1200, -2];
  // the room is 9 x 11 m around the shop origin [2000, 1200, 0], the door at +z: a corner view from inside the door
  await page.evaluate(() => { window.__shopCam = { pos: [2002.6, 1202.4, 4.8], look: [1999.6, 1201.0, -2.2] }; });
  await walkTo(counter, 1.6, 5000); log.push('at the counter');
  await wait(2500);
  capturing = false; await cap;
}
const secs = (Date.now() - t0.v) / 1000;
const res = { mode, frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), log, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
