// Iris's combat clips in the real game: each one played on her avatar and photographed at its impact frame from a
// spy camera (front three-quarter). node art/anim/iris_combat_check.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199', hero = process.argv[4] || 'iris';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=${hero}&mobs=0`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.player.teleport([-27, 1240, 62], 0.6)); await page.waitForTimeout(2500);  // the open casting field
const shot = (az) => page.evaluate((az) => {
  const f = window.__ftf, p = f.player, a = p.heading + az, at = [p.pos[0], p.pos[1] + 0.95, p.pos[2]];
  const cam = f.rig.camera.clone(); cam.fov = 30; cam.near = 0.05; cam.aspect = f.renderer.domElement.width / f.renderer.domElement.height; cam.updateProjectionMatrix();
  cam.position.set(at[0] + Math.sin(a) * 4, at[1] + 0.3, at[2] + Math.cos(a) * 4); cam.lookAt(at[0], at[1], at[2]); cam.updateMatrixWorld(true);
  f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam); return f.renderer.domElement.toDataURL('image/jpeg', 0.9);
}, az);
const res = {};
for (const [name, ms] of [['strike1', 200], ['strike2', 200], ['strike3', 140], ['strike3', 400], ['dash', 150]]) {
  res[name] = await page.evaluate((n) => window.__ftf.iris.combat(n), name);
  await page.waitForTimeout(ms);
  const d = await shot(name === 'strike2' ? -0.9 : 0.9);
  writeFileSync(`${out}/${name}_${ms}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  await page.waitForTimeout(900);
}
console.log(JSON.stringify({ res, errors }));
await browser.close();
