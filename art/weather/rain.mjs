// Weather clips from the real game (GPU server), HUD hidden, the game's own post-processed frames:
//   node art/weather/rain.mjs rain  <out dir> [url]   15 s: the square at dusk, clear, then rain comes in
//   node art/weather/rain.mjs still <out dir> [url]   stills of every weather at dusk and at night (fog, storm flash...)
// Frames f_0000.jpg.. (rain) or <weather>_<hour>.jpg (still) + report.json.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [mode, out, url = 'http://127.0.0.1:5199'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [], events = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
const wait = (ms) => page.waitForTimeout(ms);
async function open(tod) {
  await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris&mobs=0&tod=${tod}&weather=clear`);
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
  for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
  await page.evaluate(() => { window.__wev = []; window.addEventListener('ftf:weather', (e) => window.__wev.push(e.detail)); });
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
  await page.evaluate(() => window.__ftf.player.teleport([0.6, 1203, 30.5], Math.PI));
  await wait(3000);
}
if (mode === 'rain') {
  await open('dusk');
  // a slow dolly over the square, Iris walking up it; the rain comes in two seconds in
  await page.evaluate(() => {
    const f = window.__ftf, orig = f.rig.update.bind(f.rig), t0 = performance.now();
    f.rig.update = (...a) => {
      orig(...a);
      const u = Math.min(1, (performance.now() - t0) / 15000), e = u * u * (3 - 2 * u), p = f.player.pos;
      f.rig.camera.position.set(-1.2 + 2.4 * e, 1203.1 + 1.6 * e, 36.5 - 5 * e);
      f.rig.camera.lookAt(p[0] * 0.5, p[1] + 1.3, p[2] - 6); f.rig.camera.fov = 46; f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
    };
  });
  let n = 0, capturing = true; const t0 = Date.now();
  const cap = (async () => { while (capturing) writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 88 })); })();
  const held = new Set();
  await page.keyboard.down('KeyW');
  await wait(2000);
  log.push(await page.evaluate(() => window.__ftf.lookdev.setWeather('rain', { seconds: 7 })));
  await wait(6000); await page.keyboard.up('KeyW'); await wait(7000);
  capturing = false; await cap;
  const secs = (Date.now() - t0) / 1000;
  log.push({ events: await page.evaluate(() => window.__wev), splashes: await page.evaluate(() => window.__ftf.lookdev.splashes.mesh.geometry.instanceCount), rain: await page.evaluate(() => window.__ftf.lookdev.rain.mesh.geometry.instanceCount) });
  writeFileSync(`${out}/report.json`, JSON.stringify({ frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), log, errors }, null, 1));
} else {
  for (const tod of ['dusk', 'night']) {
    await open(tod);
    await page.evaluate(() => { const f = window.__ftf; f.rig.update = ((orig) => (...a) => { orig(...a); f.rig.camera.position.set(1.2, 1204.7, 31.5); f.rig.camera.lookAt(0.3, 1204.3, 18); f.rig.camera.updateMatrixWorld(true); })(f.rig.update.bind(f.rig)); });
    for (const w of ['clear', 'haze', 'fog', 'drizzle', 'rain', 'storm']) {
      await page.evaluate((w) => window.__ftf.lookdev.setWeather(w, { immediate: true }), w);
      await wait(w === 'storm' ? 200 : 1800);
      if (w === 'storm') await page.waitForFunction(() => window.__ftf.lookdev.weather.flash > 0.4, null, { timeout: 30000 }).catch(() => log.push('no flash'));
      writeFileSync(`${out}/${w}_${tod}.jpg`, await page.screenshot({ type: 'jpeg', quality: 88 }));
    }
    log.push({ tod, events: await page.evaluate(() => window.__wev.map((e) => e.state + (e.thunder ? '+thunder' : ''))) });
  }
  writeFileSync(`${out}/report.json`, JSON.stringify({ log, errors }, null, 1));
}
console.log(JSON.stringify({ mode, log, errors }));
await browser.close();
