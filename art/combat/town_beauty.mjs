// A beauty shot of the town for the X post (real game, GPU server): dusk, lamps lit, the townsfolk about, Iris walks
// in from the lower gate towards the altar stairs while the camera dollies slowly across the square. No HUD: the
// HUD is hidden; the frames are the game's own post-processed render through a scripted camera (rig.update is
// wrapped). Frames f_0000.jpg.. (ffmpeg interpolates them to 30 fps).
//   node art/combat/town_beauty.mjs <out dir> [url] [WxH] [seconds]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199';
const [W, H] = (process.argv.find((a) => /^\d+x\d+$/.test(a)) || '1280x720').split('x').map(Number);
const SECS = Number(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) || 14);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris&mobs=0&tod=dusk`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });   // no HUD in the beauty shot
await page.evaluate(() => window.__ftf.player.teleport([0.6, 1203, 30.5], Math.PI));
await page.waitForTimeout(3000);
// the dolly: from low beside the gate to higher over the square, always looking a little ahead of her
await page.evaluate((secs) => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig), t0 = performance.now();
  const ease = (u) => u * u * (3 - 2 * u);
  f.rig.update = (...a) => {
    orig(...a);
    const u = ease(Math.min(1, (performance.now() - t0) / (secs * 1000))), p = f.player.pos;
    const cam = [6.5 - 12 * u, 1201.6 + 2.6 * u, 33.5 - 10 * u];
    const look = [p[0] * 0.6, p[1] + 1.2 + 0.6 * u, p[2] - 3 - 4 * u];
    f.rig.camera.position.set(...cam); f.rig.camera.lookAt(...look); f.rig.camera.fov = 42; f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
  };
}, SECS);
// she walks up the square (W relative to the game camera's ground axes, steered towards the stairs)
let walking = true;
const walk = (async () => {
  const held = new Set();
  while (walking) {
    const r = await page.evaluate(() => {
      const f = window.__ftf, q = f.player.pos, dx = 0 - q[0], dz = 8 - q[2], d = Math.hypot(dx, dz);
      const { fwd, right } = f.rig.groundAxes(); const ux = dx / (d || 1), uz = dz / (d || 1);
      return { d, ay: ux * fwd.x + uz * fwd.y, ax: ux * right.x + uz * right.y };
    });
    const want = new Set();
    if (r.d > 1) { if (r.ay > 0.38) want.add('KeyW'); if (r.ay < -0.38) want.add('KeyS'); if (r.ax > 0.38) want.add('KeyD'); if (r.ax < -0.38) want.add('KeyA'); }
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    await page.waitForTimeout(100);
  }
  for (const k of held) await page.keyboard.up(k);
})();
let n = 0; const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 88 }));   // the post-processed frame (bloom on the lamps)
}
walking = false; await walk;
const secs = (Date.now() - t0) / 1000;
const res = { frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
