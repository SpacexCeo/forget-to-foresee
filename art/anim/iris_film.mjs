// Iris's animation filmed in the real game (the town's casting field beyond the walls), for before/after clips:
// the game's own renderer, clips, gait blend, planted feet and cast flow; only the camera is placed by this script.
//   node art/anim/iris_film.mjs <out dir> <loco|cast|combat|dash|shoulders> [--url http://127.0.0.1:4173] [--query anim=v1] [--hero elise] [--size 1280x720] [--gpu]
// --step 60: frame by frame: the page's clock and its animation frames are driven by this script (each frame is
// exactly 1/60 s of game time and is saved), so the film is a true 60 fps whatever the renderer's speed is.
// Writes <out>/f_0000.jpg.. and <out>/report.json (frames, seconds, fps); make the video with
//   ffmpeg -framerate <fps> -i <out>/f_%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 20 out.mp4
// Scenarios: loco (stand, walk, run, stop: a front tracking shot, then the same from the side), cast (Frost Lance,
// Storm Snare), combat (the strike combo and the dash).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], scenario = process.argv[3] || 'loco';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:4173'), extra = arg('query', '');
const hero = arg('hero', 'iris');
const STEP = Number(arg('step', 0));      // frames per second of game time in frame-by-frame mode (0: real time)
const [W, H] = arg('size', '1280x720').split('x').map(Number);
mkdirSync(out, { recursive: true });
const gpu = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: process.argv.includes('--gpu') ? gpu : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
if (STEP) await page.addInitScript(() => {
  // the game's clock (performance.now) and its frame callbacks under the script's control once __manual() is called
  const realRAF = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let manual = false, vt = 0, q = [], id = 0;
  performance.now = () => (manual ? vt : realNow());
  window.requestAnimationFrame = (cb) => { if (!manual) return realRAF(cb); q.push(cb); return ++id; };
  window.__manual = () => { vt = realNow(); manual = true; };
  window.__frame = (dt) => { vt += dt; const c = q; q = []; for (const f of c) { try { f(vt); } catch (e) { console.error(e); } } return c.length; };
});
await page.goto(`${url}/?play=direct&town=1&day1=0&quest=0&tex=full&hero=${hero}&cycle=off${scenario === 'combat' || scenario === 'dash' ? '' : '&mobs=0'}${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 900000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge, .ftf-town-prompt, .ftf-cast-hint { display: none !important; }' });
let n = 0, stepping = false, gameMs = 0;
const frame = async () => { await page.evaluate((dt) => window.__frame(dt), 1000 / STEP); gameMs += 1000 / STEP; const b = await page.screenshot({ type: 'jpeg', quality: 90 }); writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, b); };
const wait = async (ms) => { if (!stepping) return page.waitForTimeout(ms); for (let i = 0, k = Math.round(ms * STEP / 1000); i < k; i++) await frame(); };
await wait(1500);
// the casting field: a level clearing (town-local centre -27, 62); she stands at its west end facing east (+X)
const start = await page.evaluate(async () => {
  const f = window.__ftf, col = await import('/src/physics/collision.js');
  const ground = (x, z) => { let y = 1300; for (let i = 0; i < 8; i++) { const h = col.rayCast(f.town.scene.world, [x, y, z], [0, -1, 0], 500, col.MASK_PLAYER); if (!h) return null; if (h.normal[1] > 0.7) return h.point[1]; y = h.point[1] - 0.05; } return null; };
  window.__ground = ground;
  const x = -35, z = 59.5, y = ground(x, z);
  f.player.teleport([x, y + 0.1, z], Math.PI / 2);
  return [x, y, z];
});
await wait(2500);
// the camera: each frame after the game's own rig, placed around her by `window.__shot` {angle (0 = in front of her
// first heading), dist, h (aim height), up, fov}; eased, so a change of shot is a move, not a cut
await page.evaluate(() => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig), base = Math.PI / 2;
  window.__shot = { angle: 0.35, dist: 4.4, h: 0.85, up: 0.25, fov: 30 };
  const c = { a: 0.35, d: 4.4, h: 0.85, up: 0.25 };
  f.rig.update = (...a) => {
    orig(...a);
    const s = window.__shot, p = f.player.renderPos ? f.player.renderPos(1) : f.player.pos;
    for (const [k, v] of [['a', s.angle], ['d', s.dist], ['h', s.h], ['up', s.up]]) c[k] += (v - c[k]) * 0.08;
    const ang = base + c.a, cam = f.rig.camera;
    if (cam.fov !== s.fov) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
    cam.position.set(p[0] + Math.sin(ang) * c.d, p[1] + c.h + c.up, p[2] + Math.cos(ang) * c.d);
    cam.lookAt(p[0], p[1] + c.h, p[2]); cam.updateMatrixWorld(true);
  };
});
const shot = (s) => page.evaluate((s) => { Object.assign(window.__shot, s); }, s);
// keys relative to the game's own camera rig: she is steered along +X whatever the rig's yaw is
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function go(ms, run, dir = [1, 0]) {
  const clock = () => (stepping ? gameMs : Date.now());
  const t = clock();
  while (clock() - t < ms) {
    const r = await page.evaluate((d) => { const { fwd, right } = window.__ftf.rig.groundAxes(); return { ay: d[0] * fwd.x + d[1] * fwd.y, ax: d[0] * right.x + d[1] * right.y }; }, dir);
    const want = new Set(run ? ['ShiftLeft'] : []);
    if (r.ay > 0.38) want.add('KeyW'); if (r.ay < -0.38) want.add('KeyS'); if (r.ax > 0.38) want.add('KeyD'); if (r.ax < -0.38) want.add('KeyA');
    await keys(want); await wait(60);
  }
  await keys(new Set());
}
let capturing = !STEP; const marks = [];
if (STEP) { await page.evaluate(() => window.__manual()); stepping = true; }
const t0 = Date.now();
const capture = (async () => { while (capturing) { const b = await page.screenshot({ type: 'jpeg', quality: 88 }); writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, b); } })();
const mark = (name) => marks.push({ name, t: +((stepping ? gameMs : Date.now() - t0) / 1000).toFixed(2), frame: n });
const back = () => page.evaluate((s) => { window.__ftf.player.teleport([s[0], s[1] + 0.1, s[2]], Math.PI / 2); }, start);

if (scenario === 'loco') {
  for (const [name, s] of [['front', { angle: 0, dist: 4.6, h: 0.8, up: 0.2 }], ['feet', { angle: 0.12, dist: 2.3, h: 0.32, up: 0.12 }], ['side', { angle: Math.PI / 2, dist: 4.4, h: 0.85, up: 0.15 }]]) {
    await back(); await shot(s); await wait(2200);
    mark(name + ' idle'); await wait(1500);
    mark(name + ' walk'); await go(2600, false);
    mark(name + ' run'); await go(2300, true);
    mark(name + ' stop'); await wait(2000);
  }
} else if (scenario === 'cast') {
  const aim = (id) => page.evaluate(([id, s]) => { const f = window.__ftf, p = f.player.pos; const pt = [p[0] + 9, window.__ground(p[0] + 9, p[2]) ?? p[1], p[2]]; f.town.casting.aimAt(id, pt); return f.town.casting.release(); }, [id, start]);
  await page.evaluate(() => { window.__casts = []; window.addEventListener('ftf:cast', (e) => window.__casts.push({ ...e.detail, t: performance.now() })); });
  for (const [name, s] of [['front34', { angle: 0.55, dist: 4.6, h: 0.9, up: 0.3 }], ['side', { angle: Math.PI / 2, dist: 5.0, h: 0.9, up: 0.2 }]]) {
    await shot(s); await wait(2200);
    mark(name + ' lance'); await aim('lance'); await wait(2600);
    mark(name + ' snare'); await aim('snare'); await wait(3000);
  }
  marks.push({ casts: await page.evaluate(() => window.__casts) });
} else if (scenario === 'combat') {
  await shot({ angle: 0.6, dist: 4.6, h: 0.9, up: 0.3 }); await wait(2200);
  for (const s of [{ angle: 0.6 }, { angle: Math.PI / 2 }]) {
    await shot(s); await wait(1500);
    mark('strikes'); for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyF'); await wait(420); }
    await wait(1200);
    mark('dash'); await page.keyboard.press('Space'); await wait(1500);
    await back(); await wait(600);
  }
}
else if (scenario === 'dash') {
  // the dash and its trail, from the side and from behind; the sync events are counted for the report
  await page.evaluate(() => { window.__ev = {}; for (const n of ['ftf:foot', 'ftf:iris-action', 'ftf:cast']) window.addEventListener(n, (e) => { (window.__ev[n] ||= []).push({ ...e.detail, t: Math.round(performance.now()) }); }); });
  for (const s of [{ angle: Math.PI / 2, dist: 7.5, h: 0.9, up: 0.4 }, { angle: 0.5, dist: 6.5, h: 0.9, up: 0.6 }]) {
    await back(); await shot(s); await wait(2000);
    mark('walk'); await go(1500, false);
    mark('dash 1'); await page.keyboard.press('Space'); await wait(1300);
    mark('run'); await go(900, true);
    mark('dash 2'); await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.keyboard.press('Space'); await wait(250); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); await wait(1300);
  }
  marks.push({ events: await page.evaluate(() => Object.fromEntries(Object.entries(window.__ev).map(([k, v]) => [k, { n: v.length, first: v.slice(0, 6) }]))) });
}
else if (scenario === 'shoulders') {
  // the shoulders and arms (Elise): close from the front and from behind while she stands, waves, walks and runs
  for (const [name, s] of [['front', { angle: 0.25, dist: 2.3, h: 1.25, up: 0.1 }], ['back', { angle: Math.PI - 0.3, dist: 2.3, h: 1.25, up: 0.15 }], ['full', { angle: 0.3, dist: 4.6, h: 0.9, up: 0.25 }]]) {
    await back(); await shot(s); await wait(2200);
    mark(name + ' idle'); await wait(1500);
    mark(name + ' wave'); await page.evaluate(() => window.__ftf.irisReact('greet')); await wait(2600);
    mark(name + ' walk'); await go(2200, false);
    mark(name + ' run'); await go(1800, true);
    mark(name + ' stop'); await wait(1500);
  }
}
capturing = false; await capture;
const seconds = STEP ? n / STEP : (Date.now() - t0) / 1000;
writeFileSync(`${out}/report.json`, JSON.stringify({ scenario, query: extra, frames: n, seconds: +seconds.toFixed(2), fps: +(n / seconds).toFixed(2), marks, errors: errors.slice(0, 10) }, null, 1));
console.log(JSON.stringify({ frames: n, seconds, fps: n / seconds, errors: errors.slice(0, 5) }));
await browser.close();
