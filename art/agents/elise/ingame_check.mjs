// Elise in the real game: stills and a frame sequence through the game's renderer (spy camera).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199', video = process.argv.includes('--video');
const gpu = process.argv.includes('--gpu');
const [W, H] = (process.argv.find((a) => /^\d+x\d+$/.test(a)) || '640x720').split('x').map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: gpu ? ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const errors = [], reqs = [];
page.on('console', (m) => { if (m.type() === 'error' || /Iris model failed/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
page.on('request', (r) => { if (/\.glb(\?|$)/.test(r.url()) && /elise|iris/.test(r.url())) reqs.push(r.url().split('/').slice(-2).join('/')); });
await page.goto(`${url}/?play=direct&town=1&tier=low&tex=full&hero=elise`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 });
await page.waitForFunction(() => window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 300000 }).catch(() => errors.push('avatar model never attached'));
await page.evaluate(() => {
  const f = window.__ftf;
  window.__shot = (angle, dist = 3.6, h = 0.9, fov = 30, up = 0.2) => {
    const p = f.player, a = p.heading + angle, at = [p.pos[0], p.pos[1] + h, p.pos[2]];
    const cam = f.rig.camera.clone(); cam.fov = fov; cam.near = 0.05; cam.aspect = f.renderer.domElement.width / f.renderer.domElement.height; cam.updateProjectionMatrix();
    cam.position.set(at[0] + Math.sin(a) * dist, at[1] + up, at[2] + Math.cos(a) * dist); cam.lookAt(at[0], at[1], at[2]); cam.updateMatrixWorld(true);
    f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam);
    return f.renderer.domElement.toDataURL('image/jpeg', 0.9);
  };
});
const save = (name, d) => writeFileSync(`${out}/${name}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
const shot = async (name, ...a) => save(name, await page.evaluate((a) => window.__shot(...a), a));
const wait = (s) => page.waitForTimeout(s * 1000);
const PI = Math.PI;
const info = await page.evaluate(() => { const m = window.__ftf.iris.irisModel; let tris = 0, mats = new Set(), bones = 0; m.model.traverse((o) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; mats.add(o.material.type + ':' + o.material.name); } if (o.isBone) bones++; }); return { tris, mats: [...mats], bones, clips: m.clips.map((c) => c.name) }; }).catch((e) => ({ error: String(e) }));
let n = 0;
const seq = async (seconds, angle, dist = 4.2) => { const t0 = Date.now(); while (Date.now() - t0 < seconds * 1000) { save('f_' + String(n++).padStart(4, '0'), await page.evaluate((a) => window.__shot(...a), [angle, dist])); } };
await wait(2);
if (video) {
  await seq(2.5, 0.35); await page.keyboard.down('KeyW'); await seq(4, PI / 2); await seq(2, 0.5);
  await page.keyboard.down('ShiftLeft'); await seq(3.5, PI / 2); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await seq(1.2, PI / 2);
  await page.keyboard.down('KeyA'); await seq(1.5, 0.4); await page.keyboard.up('KeyA'); await page.keyboard.down('KeyS'); await seq(2, 0.4); await page.keyboard.up('KeyS'); await seq(1.5, 0.3);
} else {
  await shot('idle_front', 0); await shot('idle_34', PI * 0.22); await shot('idle_back', PI); await shot('face', 0.15, 1.1, 1.58, 30, 0.02);
  await shot('game_cam', PI, 6.5, 1.2, 50, 1.6);
  await page.keyboard.down('KeyW'); await wait(2.5); await shot('walk_side', PI / 2); await shot('walk_34', PI * 0.25); await shot('walk_back', PI * 0.9);
  await page.keyboard.down('ShiftLeft'); await wait(2.5); await shot('run_side', PI / 2); await shot('run_34', PI * 0.25);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await wait(1.5);
  await page.keyboard.down('KeyS'); await wait(0.3); await page.keyboard.up('KeyS'); await wait(0.3); await shot('turn', PI * 0.25);
}
writeFileSync(`${out}/report.json`, JSON.stringify({ info, errors, reqs: [...new Set(reqs)], frames: n }, null, 1));
console.log(JSON.stringify({ info, errors: errors.slice(0, 6), reqs: [...new Set(reqs)], frames: n }));
await browser.close();
