// Combat feel check (real game, GPU): Iris walks into the first skitter pack and waits so its telegraphs and hits
// land on her (the hurt reaction), then fights back with tapped strikes until the pack is down (hit flashes, damage
// numbers, knockback, the death puff), then the hulker's telegraph. A close side camera; page screenshots keep the
// DOM numbers and the red edge. Frames f_0000.jpg.. + report.json.   node art/combat/feel.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris&tod=evening&weather=clear`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
await page.evaluate(() => window.__ftf.town.mobs.ready);
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([0, 1199, 44], 0)); await page.waitForTimeout(3000);
const wait = (ms) => page.waitForTimeout(ms);
await page.evaluate(() => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig);
  f.rig.update = (...a) => {
    orig(...a);
    const p = f.player.pos, t = window.__camT || p, mx = (p[0] + t[0]) / 2, mz = (p[2] + t[2]) / 2;
    const c = window.__camS || (window.__camS = [mx + 4.4, p[1] + 2.2, mz - 1.2]);
    const w = [mx + 4.4, Math.max(p[1], t[1]) + 2.2, mz - 1.2]; for (let i = 0; i < 3; i++) c[i] += (w[i] - c[i]) * 0.08;
    f.rig.camera.position.set(...c); f.rig.camera.lookAt(mx, p[1] + 0.8, mz); f.rig.camera.fov = 45; f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
  };
});
async function at(pi, d) {
  await page.evaluate(({ pi, d }) => {
    const f = window.__ftf, M = f.town.mobs, pk = M.brain.packs[pi], m = M.brain.mobs.find((x) => x.pack === pk && x.state !== 'dead' && x.state !== 'gone') || { pos: pk.home };
    f.player.teleport([m.pos[0] + 0.3, m.pos[1] + 1, m.pos[2] - d], 0); M.iris.hp = 100; window.__camT = m.pos.slice(); window.__camS = null;
  }, { pi, d });
  await wait(1200);
}
let n = 0, capturing = true; const t0 = Date.now();
const cap = (async () => { while (capturing) writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 86 })); })();
await at(0, 2.2);
await wait(3200);                                         // they wake, telegraph and bite: the hurt reaction
log.push({ hpAfterBites: await page.evaluate(() => Math.round(window.__ftf.town.mobs.hp)) });
for (let i = 0; i < 14; i++) {
  const alive = await page.evaluate(() => { const M = window.__ftf.town.mobs, pk = M.brain.packs[0]; return M.brain.mobs.filter((x) => x.pack === pk && x.state !== 'dead' && x.state !== 'gone').length; });
  if (!alive) break;
  await page.keyboard.press('KeyF'); await wait(380);
}
await wait(1600);
await at(3, 3.4);                                         // the hulker winds up: its ground warning
await wait(3000);
capturing = false; await cap;
const secs = (Date.now() - t0) / 1000;
const res = { frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), log, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
