// Rain clip without a GPU (software GL, the built page on :4319): a stepped Playwright clock makes every frame exactly 1/FPS s of game time.
//   node art/weather/rain_local.mjs <out dir> [seconds] [tier] [fps]   (playwright must resolve from the script folder)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2], FPS = Number(process.argv[5] || 8), SECS = Number(process.argv[3] || 10), TIER = process.argv[4] || 'medium';
mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:4319/?play=direct&town=1&day1=0&tex=full&hero=iris&mobs=0&tod=dusk&weather=clear&quest=0&tier=${TIER}`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 400000 });
for (const name of ['Skip', 'Skip the town quest']) { const x = p.getByRole('button', { name, exact: true }); if (await x.count()) await x.first().click().catch(() => {}); }
await p.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
await p.evaluate(() => window.__ftf.player.teleport([0.6, 1203, 30.5], Math.PI));
await p.waitForTimeout(4000);
const info = await p.evaluate(() => ({ tier: window.__ftf.lookdev.tier, puddles: window.__ftf.lookdev.weather.puddles }));
await p.clock.install();
await p.clock.runFor(100);
await p.evaluate((secs) => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig), t0 = performance.now();
  f.rig.update = (...a) => {
    orig(...a);
    const u = Math.min(1, (performance.now() - t0) / (secs * 1000)), e = u * u * (3 - 2 * u), q = f.player.pos;
    f.rig.camera.position.set(-1.0 + 2.0 * e, 1203.2 + 1.3 * e, 35.5 - 3.5 * e);
    f.rig.camera.lookAt(q[0] * 0.5, q[1] + 1.3, q[2] - 6); f.rig.camera.fov = 46; f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
  };
}, SECS);
await p.keyboard.down('KeyW');
const N = FPS * SECS; const T = Date.now();
for (let i = 0; i < N; i++) {
  if (i === Math.round(FPS * 1.2)) await p.evaluate(() => window.__ftf.lookdev.setWeather('rain', { seconds: 4 }));
  if (i === Math.round(FPS * 5.5)) await p.keyboard.up('KeyW');
  await p.clock.runFor(1000 / FPS);
  writeFileSync(`${out}/f_${String(i).padStart(4, '0')}.jpg`, await p.screenshot({ type: 'jpeg', quality: 90 }));
  if (i % 12 === 0) console.log('frame', i, ((Date.now() - T) / 1000).toFixed(0) + 's');
}
console.log(JSON.stringify({ info, frames: N, errs }));
await b.close();
