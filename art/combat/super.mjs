// The super strike in the real game (GPU server): Iris walks up to the first skitter pack, holds the strike (the
// charge ring gathers), lets go: the cone hit, the knockback, the ring and the arc; then a tap combo. A side camera
// wraps rig.update; page screenshots keep the HUD. Frames f_0000.jpg.. + report.json.
//   node art/combat/super.mjs <out dir> [url]
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
await page.addInitScript(() => { window.__ia = []; window.addEventListener('ftf:iris-action', (e) => window.__ia.push(e.detail.clip + ':' + e.detail.phase)); });
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris&tod=evening&weather=clear`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([0, 1199, 44], 0)); await page.waitForTimeout(3000);
const wait = (ms) => page.waitForTimeout(ms);
async function at(pi, d) {
  await page.evaluate(({ pi, d }) => {
    const f = window.__ftf, M = f.town.mobs, pk = M.brain.packs[pi], m = M.brain.mobs.find((x) => x.pack === pk && x.state !== 'dead' && x.state !== 'gone') || { pos: pk.home };
    f.player.teleport([m.pos[0] + 0.3, m.pos[1] + 1, m.pos[2] - d], 0); M.iris.hp = 100;
    window.__camT = m.pos.slice();
  }, { pi, d });
  await wait(1500);
}
await page.evaluate(() => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig);
  f.rig.update = (...a) => {
    orig(...a);
    const p = f.player.pos, t = window.__camT || p, mx = (p[0] + t[0]) / 2, mz = (p[2] + t[2]) / 2;
    f.rig.camera.position.set(mx + 5.2, Math.max(p[1], t[1]) + 2.6, mz - 1.5); f.rig.camera.lookAt(mx, p[1] + 0.9, mz);
    f.rig.camera.fov = 45; f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
  };
});
let n = 0, capturing = true; const t0 = Date.now();
const cap = (async () => { while (capturing) writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 86 })); })();
const hp = (pi) => page.evaluate((pi) => { const M = window.__ftf.town.mobs, pk = M.brain.packs[pi]; return M.brain.mobs.filter((x) => x.pack === pk).map((x) => Math.round(x.hp)); }, pi);
await at(0, 1.8);
log.push({ before: await hp(0) });
await page.keyboard.down('KeyF'); await wait(1100); log.push({ charging: await page.evaluate(() => window.__ftf.town.mobs.charging) });
await page.keyboard.up('KeyF'); await wait(900); log.push({ afterSuper: await hp(0) });
await wait(900);
for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyF'); await wait(380); }
await wait(900); log.push({ afterCombo: await hp(0) });
await at(3, 2.6);                                         // the hulker: it stands its ground
log.push({ hulker: await hp(3) });
await page.keyboard.down('KeyF'); await wait(1100); await page.keyboard.up('KeyF'); await wait(1400); log.push({ hulkerAfter: await hp(3) });
capturing = false; await cap;
const secs = (Date.now() - t0) / 1000;
const res = { frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), log, actions: await page.evaluate(() => window.__ia), errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
