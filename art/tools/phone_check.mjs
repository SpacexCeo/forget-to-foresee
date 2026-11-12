// In-game check of a heroine's phone model (`?tex=m`): her mesh, primitive and triangle counts, the frame's draw
// calls, a still at the game camera and a close one (head to knees), all from the real game.
//   node art/tools/phone_check.mjs <out dir> <hero iris|elise> <tag> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out, hero, tag, url = 'http://127.0.0.1:5199'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=m&hero=${hero}&mobs=0&tod=day`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([-7, 1203, 25], 2.4));
await page.waitForTimeout(3500);
const info = await page.evaluate(() => {
  const m = window.__ftf.iris.irisModel.model; let meshes = 0, prims = 0, tris = 0; const names = [];
  m.traverse((o) => { if (o.isMesh && o.visible) { meshes++; prims++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; names.push(o.name + ':' + (o.material && o.material.name)); } });
  const r = window.__ftf.renderer; return { meshes, prims, tris, names, calls: r.info.render.calls, frameTris: r.info.render.triangles };
});
await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
await page.waitForTimeout(400);
writeFileSync(`${out}/${hero}_${tag}_game.png`, await page.screenshot());
const close = (az) => page.evaluate((az) => {
  const f = window.__ftf, p = f.player.pos, a = f.player.heading + az;
  const cam = f.rig.camera.clone(); cam.fov = 35; cam.near = 0.05; cam.aspect = f.renderer.domElement.width / f.renderer.domElement.height; cam.updateProjectionMatrix();
  cam.position.set(p[0] + Math.sin(a) * 2.6, p[1] + 1.3, p[2] + Math.cos(a) * 2.6); cam.lookAt(p[0], p[1] + 1.05, p[2]); cam.updateMatrixWorld(true);
  f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam); return f.renderer.domElement.toDataURL('image/png');
}, az).then((d) => Buffer.from(d.split(',')[1], 'base64'));
writeFileSync(`${out}/${hero}_${tag}_front.png`, await close(0));
writeFileSync(`${out}/${hero}_${tag}_side.png`, await close(1.9));
const res = { hero, tag, ...info, errors };
writeFileSync(`${out}/${hero}_${tag}.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
