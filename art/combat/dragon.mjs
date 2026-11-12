// The dragon companion for the trailer (real game, GPU server): Nacre flies beside Elise in the square at dusk, a
// slow scripted arc with the HUD hidden, then Profile -> NFTs -> the "Owned by Elise · Agentic NFT" card. The dragon
// is read from the chain (companions.ftf-coordinator.testnet) for an existing Day 1 heroine token: the Day 1 state is
// preset in localStorage, nothing is created, linked or signed. Frames f_0000.jpg.. + report.json.
//   node art/combat/dragon.mjs <out dir> [url] [orbit seconds]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:5199', SECS = Number(process.argv[4] || 8);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [], marks = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('ftf.day1.v1', JSON.stringify({ nickname: 'Cy', minted: true, claimed: true, skin: 'elise', step: 'done',
      guest: { account_id: 'cy-8.guests.ftf-coordinator.testnet', token_id: 'elise-cy-8', nickname: 'cy', minted: true } }));
  } catch (e) { /* storage blocked: the shot shows no dragon and the report says so */ }
});
await page.goto(`${url}/?day1=0&quest=0&skip=intro&tex=full&mobs=0&tod=dusk`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 600000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.evaluate(() => window.__ftf.player.teleport([-7, 1203, 25], 2.4));     // the quiet west side of the square
const found = await page.waitForFunction(() => { let d = null; window.__ftf.scene.traverse((o) => { if (!d && /^companion_/.test(o.name) && o.visible) d = o.name; }); return d; }, null, { timeout: 60000 }).then((h) => h.jsonValue()).catch(() => null);
log.push({ hero: await page.evaluate(() => window.__ftf.iris.hero.id), dragon: found });
await page.waitForTimeout(2500);
const hide = await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
// a slow arc framing her and the dragon (the camera follows their midpoint)
await page.evaluate((secs) => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig), t0 = performance.now();
  let drag = null; f.scene.traverse((o) => { if (!drag && /^companion_/.test(o.name)) drag = o; });
  f.rig.update = (...a) => {
    orig(...a);
    if (window.__freeCam) return;
    const t = Math.min(1, (performance.now() - t0) / (secs * 1000)), u = t * t * (3 - 2 * t), p = f.player.pos;
    const d = drag ? [drag.position.x, drag.position.y, drag.position.z] : [p[0], p[1] + 1.6, p[2]];
    const m = [(p[0] + d[0]) / 2, (p[1] + 1.25 + d[1]) / 2, (p[2] + d[2]) / 2];
    // the camera stands off the line from her to the dragon, on her front side, so both read at a similar size
    let vx = d[0] - p[0], vz = d[2] - p[2]; const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
    let px = -vz, pz = vx; if (px * Math.sin(f.player.heading) + pz * Math.cos(f.player.heading) < 0) { px = -px; pz = -pz; }
    const sw = -0.45 + 0.9 * u, cx = px * Math.cos(sw) - pz * Math.sin(sw), cz = px * Math.sin(sw) + pz * Math.cos(sw), r = Math.max(2.6, vl * 0.9 + 1.6) - 0.4 * u;
    f.rig.camera.position.set(m[0] + cx * r, m[1] + 0.25, m[2] + cz * r);
    f.rig.camera.lookAt(m[0], m[1], m[2]); f.rig.camera.fov = 40; f.rig.camera.updateProjectionMatrix(); f.rig.camera.updateMatrixWorld(true);
  };
}, SECS);
let capturing = true, n = 0; const t0 = Date.now();
const mark = (what) => { marks.push({ what, frame: n, s: +((Date.now() - t0) / 1000).toFixed(2) }); };
const capture = (async () => { while (capturing) writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 88 })); })();
mark('orbit');
await page.waitForTimeout(SECS * 1000);
// the card: back to the HUD, Profile -> NFTs -> "Owned by Elise"
await hide.evaluate((el) => el.remove());
await page.evaluate(() => { window.__freeCam = true; });
mark('menu');
await page.locator('.ftf-town-profile').first().click().catch(() => log.push('no profile button'));
await page.waitForTimeout(900);
const tab = page.getByRole('tab', { name: 'NFTs' }).or(page.getByRole('button', { name: 'NFTs', exact: true }));
if (await tab.count()) await tab.first().click(); else log.push('no NFTs tab');
const card = page.getByText(/Owned by Elise · Agentic NFT/).first();
await card.waitFor({ timeout: 30000 }).then(() => mark('card')).catch(() => log.push('no owned card'));
await card.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(3500);
capturing = false; await capture;
writeFileSync(`${out}/card.png`, await page.screenshot());
const secs = (Date.now() - t0) / 1000;
const res = { frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), marks, log, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
