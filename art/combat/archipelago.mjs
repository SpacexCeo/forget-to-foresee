// The Tournament side for the trailer (real game, GPU server): Iris registers at the town's altar, the cover takes
// her up, and the floating archipelago appears at golden hour while the camera sweeps over the plaza, the clan camps
// and the Shells. Frames f_0000.jpg.. + report.json.   node art/combat/archipelago.mjs <out dir> [url] [seconds]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199', SWEEP = Number(process.argv[4] || 9);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris&mobs=0&tod=evening`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
// at the altar
await page.evaluate(async () => { const L = await import('/src/scenes/town-layout.js'); window.__ftf.player.teleport(L.TOWN_ALTAR_SPAWN.position.slice(), L.TOWN_ALTAR_SPAWN.heading); });
await page.waitForTimeout(2500);
let capturing = true, n = 0; const t0 = Date.now();
const capture = (async () => { while (capturing) writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 86 })); })();
await page.waitForTimeout(1200);
const reg = await page.evaluate(() => window.__ftf.town.register());
log.push('register ' + reg);
await page.waitForFunction(() => window.__ftf.play && !window.__ftf.town.active, null, { timeout: 120000 }).catch(() => errors.push('never reached the archipelago'));
log.push('archipelago');
await page.waitForTimeout(700);
capturing = false; await capture;                       // the arrival's own cloud cinematic is skipped: wait it out unrecorded
const coverEnd = n;
await page.waitForTimeout(7000);
// the sweep, rendered through a scripted camera straight into the canvas (the play layer's camera keeps running)
const ts = Date.now(); log.push({ sweepStartFrame: n, coverEnd });
await page.evaluate(() => { window.__sweep0 = performance.now(); });
while (Date.now() - ts < SWEEP * 1000) {
  const d = await page.evaluate((secs) => {
    const f = window.__ftf, ease = (u) => u * u * (3 - 2 * u);
    const u = ease(Math.min(1, (performance.now() - window.__sweep0) / (secs * 1000))), ang = 2.1 + 1.5 * u, r = 74 - 30 * u, h = 36 - 24 * u;
    const cam = f.rig.camera.clone(); cam.fov = 50; cam.near = 0.5; cam.far = 1500; cam.aspect = f.renderer.domElement.width / f.renderer.domElement.height; cam.updateProjectionMatrix();
    cam.position.set(Math.cos(ang) * r, h, Math.sin(ang) * r); cam.lookAt(0, 3 - 2 * u, 0); cam.updateMatrixWorld(true);
    f.renderer.setRenderTarget(null); f.renderer.render(f.scene || f.world3d?.scene, cam); return f.renderer.domElement.toDataURL('image/jpeg', 0.88);
  }, SWEEP);
  writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
}
const secs = (Date.now() - t0) / 1000;
const sweepSecs = (Date.now() - ts) / 1000, s0 = log.find((x) => typeof x === 'object').sweepStartFrame;
const res = { frames: n, seconds: +secs.toFixed(1), coverEnd, sweepStart: s0, fpsA: +(s0 / ((ts - t0) / 1000 - 7)).toFixed(2), fpsB: +((n - s0) / sweepSecs).toFixed(2), log, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
