// The monsters in the real game (dev server): loaded through the game's own glTF loader (KTX2 + meshopt, the phone
// variant with --m), placed beside the heroine on the town street, every clip played; stills per creature and clip.
//   node art/mobs/ingame_check.mjs <out dir> [url] [--m]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199', phone = process.argv.includes('--m');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=${phone ? 'm' : 'full'}`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 });
const report = await page.evaluate(async (phone) => {
  const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => import('three'));
  const { prefetchGltf } = await import('/src/render/assets.js');
  const f = window.__ftf, p = f.player, res = {};
  const names = ['skitter', 'hulker', 'veilbell', 'crownrift'];
  const x0 = p.pos[0], y0 = p.pos[1], z0 = p.pos[2];
  const mobs = [];
  for (const [i, n] of names.entries()) {
    const { gltf } = await prefetchGltf('mob_' + n + (phone ? '_m' : ''));
    const m = gltf.scene; let tris = 0;
    m.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const box = new THREE.Box3().setFromObject(m);
    m.position.set(x0 + (i - 1.5) * 3.2, y0, z0 + 4); m.rotation.y = Math.PI; f.scene.add(m);
    const mixer = new THREE.AnimationMixer(m);
    mobs.push({ n, m, mixer, clips: gltf.animations });
    res[n] = { tris, height: +(box.max.y - box.min.y).toFixed(2), clips: gltf.animations.map((c) => `${c.name}:${c.duration.toFixed(2)}`) };
  }
  window.__mobs = mobs;
  return res;
}, phone);
const shots = [];
await page.evaluate(async () => {
  const { MobFx, MOB_GLOW } = await import('/src/render/mob-fx.js');
  for (const mb of window.__mobs) mb.fx = new MobFx(mb.m, { edge: MOB_GLOW[mb.n] });
});
for (const clip of ['idle', 'walk', 'attack', 'death', 'hit_flash', 'dissolve']) {
  const d = await page.evaluate((clip) => {
    for (const mb of window.__mobs) {
      mb.fx.u.flash.value = clip === 'hit_flash' ? 1 : 0;
      mb.fx.u.dissolve.value = clip === 'dissolve' ? 0.5 : 0;
    }
    if (clip === 'hit_flash' || clip === 'dissolve') clip = clip === 'dissolve' ? 'death' : 'hit';
    const f = window.__ftf, p = f.player;
    for (const mb of window.__mobs) {
      mb.mixer.stopAllAction();
      const c = mb.clips.find((x) => x.name === clip || x.name.endsWith(clip)); if (!c) continue;
      const a = mb.mixer.clipAction(c); a.reset(); a.setLoop(2200, 1); a.clampWhenFinished = true; a.play();
      mb.mixer.update(clip === 'death' ? c.duration : clip === 'attack' ? c.duration * 0.55 : c.duration * 0.25);
    }
    const cam = f.rig.camera.clone(); cam.fov = 40; cam.near = 0.05; cam.aspect = f.renderer.domElement.width / f.renderer.domElement.height; cam.updateProjectionMatrix();
    cam.position.set(p.pos[0] + 2.5, p.pos[1] + 2.6, p.pos[2] - 4.5); cam.lookAt(p.pos[0], p.pos[1] + 1.0, p.pos[2] + 4); cam.updateMatrixWorld(true);
    f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam);
    return f.renderer.domElement.toDataURL('image/jpeg', 0.88);
  }, clip);
  writeFileSync(`${out}/${clip}.jpg`, Buffer.from(d.split(',')[1], 'base64')); shots.push(clip);
}
const res = { phone, report, errors, pass: errors.length === 0 && Object.values(report).every((r) => r.clips.length === 6 && r.tris > 0) };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
