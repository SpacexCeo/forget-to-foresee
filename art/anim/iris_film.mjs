// Iris's animation filmed in the real game (the town's casting field beyond the walls), for before/after clips:
// the game's own renderer, clips, gait blend, planted feet and cast flow; only the camera is placed by this script.
//   node art/anim/iris_film.mjs <out dir> <loco|cast|combat|dash|skid|strikes|audit|shoulders|show|final> [--url http://127.0.0.1:4173] [--query anim=v1] [--hero elise] [--size 1280x720] [--gpu]
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
await page.goto(`${url}/?play=direct&town=1&day1=0&quest=0&tex=full&hero=${hero}&cycle=off${['combat', 'dash', 'strikes', 'audit', 'show', 'final'].includes(scenario) ? '' : '&mobs=0'}${extra ? '&' + extra : ''}`);
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
else if (scenario === 'skid') {
  // a cast out of a full run: the heel-dig stop blended into the wind-up, from the side and from the front
  const aim = (id) => page.evaluate((id) => { const f = window.__ftf, p = f.player.pos; const pt = [p[0] + 9, window.__ground(p[0] + 9, p[2]) ?? p[1], p[2]]; f.town.casting.aimAt(id, pt); return f.town.casting.release(); }, id);
  for (const [name, s] of [['side', { angle: Math.PI / 2, dist: 5.2, h: 0.9, up: 0.2 }], ['front34', { angle: 0.5, dist: 5.0, h: 0.9, up: 0.3 }]]) {
    for (const id of ['lance', 'snare']) {
      await back(); await shot(s); await wait(1800);
      mark(name + ' run'); await go(1300, true);
      mark(name + ' ' + id + ' out of the run'); await aim(id); await wait(2300);
    }
  }
}
else if (scenario === 'strikes') {
  // the owner's four checks (12.11): F tapped three times fast, F held, a strike out of a run, a strike and at once a
  // step; after each the report says which action clip is still on her and how far the chest is turned off the hips
  const tap = async (ms = 60) => { await page.keyboard.down('KeyF'); await wait(ms); await page.keyboard.up('KeyF'); };
  const state = (name) => page.evaluate((name) => {
    const m = window.__ftf.iris.irisModel, q = (n) => m.model.getObjectByName(n).getWorldQuaternion(new (m.model.quaternion.constructor)());
    const fwd = (n) => { const v = m.model.position.clone().set(0, 0, 1).applyQuaternion(q(n)); return Math.atan2(v.x, v.z); };
    let d = (fwd('chest') - fwd('pelvis')) * 180 / Math.PI; d = ((d + 540) % 360) - 180;
    return { after: name, clip: m.combat ? m.combat.name : null, pending: m.pendingHold ? m.pendingHold.name : null, chest_vs_hips_deg: +d.toFixed(1) };
  }, name);
  const res = [];
  for (const s of [{ angle: 0.5, dist: 4.4, h: 0.9, up: 0.3 }, { angle: Math.PI / 2, dist: 4.6, h: 0.9, up: 0.2 }]) {
    await back(); await shot(s); await wait(2000);
    mark('three fast taps'); for (let i = 0; i < 3; i++) { await tap(60); await wait(150); }
    await wait(1800); res.push(await state('three fast taps'));
    mark('two fast taps'); for (let i = 0; i < 2; i++) { await tap(60); await wait(120); }
    await wait(1800); res.push(await state('two fast taps'));
    mark('three taps in rhythm'); for (let i = 0; i < 3; i++) { await tap(60); await wait(330); }
    await wait(1600); res.push(await state('three taps in rhythm'));
    mark('hold'); await tap(800); await wait(1900); res.push(await state('hold 0.8 s'));
    await back(); await wait(500);
    mark('strike out of a run'); await go(1100, true); await tap(60); await wait(1700); res.push(await state('strike out of a run'));
    mark('strike then a step'); await tap(60); await wait(150); await go(900, false); await wait(900); res.push(await state('strike then a step'));
  }
  marks.push({ strikes: res });
}
else if (scenario === 'audit') {
  // every action out of standing, walking and running, alone and crossed with another one; 2.6 s later the report
  // says what is still on her (an action clip, a pending hold, a reaction, the cast's root), how far the chest and
  // the model are turned off the root, and whether she can walk again. A row with `bad` is a stuck or twisted end.
  await page.evaluate(() => { const mb = window.__ftf.town.mobs; if (mb && mb.iris) mb.iris.iframes = 1e9; });   // the packs must not kill the test
  const aim = (id) => page.evaluate((id) => { const f = window.__ftf, p = f.player.pos, h = f.player.heading; const pt = [p[0] + Math.sin(h) * 9, 0, p[2] + Math.cos(h) * 9]; pt[1] = window.__ground(pt[0], pt[2]) ?? p[1]; f.town.casting.aimAt(id, pt); return f.town.casting.release(); }, id);
  const F = { down: () => page.keyboard.down('KeyF'), up: () => page.keyboard.up('KeyF') };
  const tap = async (ms = 60) => { await F.down(); await wait(ms); await F.up(); };
  const ACTS = {
    lance: () => aim('lance'), snare: () => aim('snare'), dash: () => page.keyboard.press('Space'), tap: () => tap(), 'two taps': async () => { await tap(); await wait(120); await tap(); },
    hold: () => tap(800),
    'charge, dash, let go': async () => { await F.down(); await wait(500); await page.keyboard.press('Space'); await wait(300); await F.up(); },
    'charge, cast, let go': async () => { await F.down(); await wait(500); await aim('lance'); await wait(300); await F.up(); },
    'cast then tap': async () => { await aim('lance'); await wait(100); await tap(); },
    'cast then dash': async () => { await aim('snare'); await wait(150); await page.keyboard.press('Space'); },
    'tap then cast': async () => { await tap(); await wait(80); await aim('lance'); },
    'dash then cast': async () => { await page.keyboard.press('Space'); await wait(120); await aim('snare'); },
    'dash then tap': async () => { await page.keyboard.press('Space'); await wait(100); await tap(); },
  };
  const state = () => page.evaluate(() => {
    const f = window.__ftf, m = f.iris.irisModel, Q = m.model.quaternion.constructor;
    const fwd = (n) => { const o = m.model.getObjectByName(n); if (!o) return 0; const v = m.model.position.clone().set(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new Q())); return Math.atan2(v.x, v.z); };
    const deg = (a) => +((((a * 180 / Math.PI) + 540) % 360) - 180).toFixed(1);
    return { clip: m.combat ? m.combat.name : null, pending: m.pendingHold ? m.pendingHold.name : null, react: f.iris.irisReaction ? f.iris.irisReaction.clip : null,
      casting: !!(f.town.casting && f.town.casting.casting), charging: f.town.mobs ? f.town.mobs.charging != null : false,
      chest_vs_hips: deg(fwd('chest') - fwd('pelvis')), hips_vs_root: deg(fwd('pelvis') - f.player.heading), pos: [f.player.pos[0], f.player.pos[2]] };
  });
  const rows = [];
  for (const start of ['idle', 'walk', 'run']) for (const [name, act] of Object.entries(ACTS)) {
    await back(); await shot({ angle: 0.7, dist: 5.2, h: 0.9, up: 0.35 }); await wait(700);
    if (start !== 'idle') await go(700, start === 'run');
    mark(start + ': ' + name); await act(); await wait(2600);
    const s = await state(); await go(500, false); const s2 = await state(); await wait(200);
    const moved = Math.hypot(s2.pos[0] - s.pos[0], s2.pos[1] - s.pos[1]);
    const bad = [s.clip && 'clip left: ' + s.clip, s.pending && 'pending hold', s.casting && 'cast root stuck', s.charging && 'still charging', Math.abs(s.chest_vs_hips) > 14 && 'chest twisted', Math.abs(s.hips_vs_root) > 20 && 'hips off the root', moved < 0.3 && 'cannot walk'].filter(Boolean);
    rows.push({ start, action: name, clip: s.clip, react: s.react, chest_vs_hips: s.chest_vs_hips, hips_vs_root: s.hips_vs_root, moved: +moved.toFixed(2), bad });
  }
  marks.push({ audit: rows, bad: rows.filter((r) => r.bad.length) });
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
else if (scenario === 'show') {
  // a character review: idle, walk, run, the strike combo and a cast, from the front, the side and behind, then a close-up
  const aim = (id) => page.evaluate((id) => { const f = window.__ftf, p = f.player.pos; f.town.casting.aimAt(id, [p[0] + 9, window.__ground(p[0] + 9, p[2]) ?? p[1], p[2]]); return f.town.casting.release(); }, id);
  for (const [name, s] of [['front', { angle: 0.3, dist: 4.6, h: 0.9, up: 0.25 }], ['side', { angle: Math.PI / 2, dist: 4.6, h: 0.9, up: 0.15 }], ['back', { angle: Math.PI - 0.45, dist: 4.4, h: 0.9, up: 0.3 }]]) {
    await back(); await shot(s); await wait(2200);
    mark(name + ' idle'); await wait(2000);
    mark(name + ' walk'); await go(2400, false);
    mark(name + ' run'); await go(2000, true);
    mark(name + ' stop'); await wait(1400);
    mark(name + ' strikes'); for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyF'); await wait(420); }
    await wait(1300);
    mark(name + ' cast'); await aim('lance'); await wait(2400);
  }
  await back(); await shot({ angle: 0.25, dist: 1.5, h: 1.52, up: 0.05 }); await wait(2400);
  mark('face idle'); await wait(3000);
  mark('face wave'); await page.evaluate(() => window.__ftf.irisReact('greet')); await wait(2800);
}
else if (scenario === 'final') {
  // the final pass: everything she does in one take, with numbers. Each frame the head, hands and feet are sampled in
  // her own frame; a pop is a one-frame jump of the head or a foot that the frames around it do not explain. The
  // report also holds every cast (start to release), every strike (clip start to impact, impact to the first damage
  // on a creature) and the planted foot's slide while she walks and runs.
  await page.evaluate(() => {
    const f = window.__ftf; if (f.town.mobs && f.town.mobs.iris) f.town.mobs.iris.iframes = 1e9;
    const S = (window.__S = { rows: [], ev: [] }), V = f.rig.camera.position.constructor, names = ['head', 'hand_L', 'hand_R', 'foot_L', 'foot_R'];
    for (const n of ['ftf:cast', 'ftf:iris-action', 'ftf:foot']) window.addEventListener(n, (e) => S.ev.push({ n, t: performance.now(), ...e.detail }));
    const hp = () => (f.town.mobs && f.town.mobs.brain ? f.town.mobs.brain.mobs.reduce((a, m) => a + Math.max(0, m.hp || 0), 0) : 0); let last = hp();
    const orig = f.rig.update.bind(f.rig);
    f.rig.update = (...a) => {
      orig(...a); const m = f.iris.irisModel; if (!m) return;
      const p = f.player.renderPos ? f.player.renderPos(1) : f.player.pos, h = f.player.heading, c = Math.cos(-h), sn = Math.sin(-h), row = [performance.now()];
      for (const n of names) { const o = m.model.getObjectByName(n); const w = o ? o.getWorldPosition(new V()) : new V(); const dx = w.x - p[0], dz = w.z - p[2]; row.push(dx * c + dz * sn, w.y - p[1], -dx * sn + dz * c, w.x, w.z); }
      row.push(m.combat ? m.combat.name : '', Math.hypot(f.player.vel ? f.player.vel[0] : 0, f.player.vel ? f.player.vel[1] : 0)); S.rows.push(row);
      const now = hp(); if (now < last - 0.5) S.ev.push({ n: 'damage', t: performance.now(), amount: +(last - now).toFixed(1) }); last = now;
    };
  });
  const aim = (id) => page.evaluate((id) => { const f = window.__ftf, p = f.player.pos, h = f.player.heading; const pt = [p[0] + Math.sin(h) * 9, 0, p[2] + Math.cos(h) * 9]; pt[1] = window.__ground(pt[0], pt[2]) ?? p[1]; f.town.casting.aimAt(id, pt); return f.town.casting.release(); }, id);
  await back(); await shot({ angle: 0.55, dist: 5.0, h: 0.9, up: 0.3 }); await wait(2000);
  mark('idle'); await wait(1500);
  mark('walk'); await go(2600, false);
  mark('run'); await go(2400, true);
  mark('stop'); await wait(1400);
  mark('turn left, walk'); await go(1500, false, [0, -1]);
  mark('turn back, run'); await go(1500, true, [-1, 0]);
  mark('stop 2'); await wait(1200);
  await shot({ angle: 1.2, dist: 4.6 });
  mark('combo'); for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyF'); await wait(430); }
  await wait(1300);
  mark('super'); await page.keyboard.down('KeyF'); await wait(900); await page.keyboard.up('KeyF'); await wait(1900);
  mark('lance'); await aim('lance'); await wait(2000);
  mark('snare'); await aim('snare'); await wait(2200);
  mark('run, cast'); await go(900, true); await aim('lance'); await wait(1800);
  mark('dash'); await page.keyboard.press('Space'); await wait(1400);
  mark('run, strike'); await go(800, true); await page.keyboard.press('KeyF'); await wait(1500);
  const S = await page.evaluate(() => window.__S);
  const R = S.rows, at = (t) => { let k = 0; for (const m of marks) if (m.frame !== undefined && m.t * 1000 <= t - R[0][0] + marks[0].t * 1000) k = m.name; return k; };
  const part = { head: 1, hand_L: 6, hand_R: 11, foot_L: 16, foot_R: 21 }, pops = [];
  for (const [n, o] of Object.entries(part)) for (let i = 2; i < R.length - 2; i++) {
    const d = (a, b) => Math.hypot(R[a][o] - R[b][o], R[a][o + 1] - R[b][o + 1], R[a][o + 2] - R[b][o + 2]);
    const jump = d(i, i - 1), around = Math.max(d(i - 1, i - 2), d(i + 1, i), d(i + 2, i + 1));
    if (jump > (n.startsWith('hand') ? 0.12 : 0.05) && jump > 2.5 * around + 0.02) pops.push({ part: n, t: +((R[i][0] - R[0][0]) / 1000).toFixed(2), jump_m: +jump.toFixed(3), around_m: +around.toFixed(3), clip: R[i][26], during: at(R[i][0]) });
  }
  // the planted foot's slide over the ground: the lower foot's world speed while she walks, then runs
  const slide = {};
  for (const [name, from, to] of [['walk', 'walk', 'run'], ['run', 'run', 'stop']]) {
    const t0 = marks.find((m) => m.name === from).t * 1000 + 700, t1 = marks.find((m) => m.name === to).t * 1000 - 100, base = R[0][0] - marks[0].t * 1000 + 0; const v = [];
    for (let i = 1; i < R.length; i++) { const t = R[i][0] - base; if (t < t0 || t > t1) continue; const o = R[i][17] <= R[i][22] ? 16 : 21; if (Math.min(R[i][17], R[i][22]) > 0.14) continue; v.push(Math.hypot(R[i][o + 3] - R[i - 1][o + 3], R[i][o + 4] - R[i - 1][o + 4]) * STEP); }
    v.sort((a, b) => a - b); slide[name] = { samples: v.length, median_m_s: +(v[v.length >> 1] || 0).toFixed(2), p90_m_s: +(v[Math.floor(v.length * 0.9)] || 0).toFixed(2) };
  }
  const ev = S.ev, casts = [], strikes = [];
  for (const e of ev) if (e.n === 'ftf:cast' && e.phase === 'release') { const st = [...ev].reverse().find((x) => x.n === 'ftf:cast' && x.phase === 'start' && x.t <= e.t && x.id === e.id); casts.push({ id: e.id, start_to_release_s: st ? +((e.t - st.t) / 1000).toFixed(3) : null }); }
  for (const e of ev) if (e.n === 'ftf:iris-action' && e.phase === 'impact') { const st = [...ev].reverse().find((x) => x.n === 'ftf:iris-action' && x.phase === 'start' && x.t <= e.t && x.clip === e.clip); const dm = ev.find((x) => x.n === 'damage' && x.t >= e.t - 250 && x.t <= e.t + 600); strikes.push({ clip: e.clip, start_to_impact_s: st ? +((e.t - st.t) / 1000).toFixed(3) : null, impact_to_damage_s: dm ? +((dm.t - e.t) / 1000).toFixed(3) : null }); }
  marks.push({ final: { pops, slide, casts, strikes } });
}
capturing = false; await capture;
const seconds = STEP ? n / STEP : (Date.now() - t0) / 1000;
writeFileSync(`${out}/report.json`, JSON.stringify({ scenario, query: extra, frames: n, seconds: +seconds.toFixed(2), fps: +(n / seconds).toFixed(2), marks, errors: errors.slice(0, 10) }, null, 1));
console.log(JSON.stringify({ frames: n, seconds, fps: n / seconds, errors: errors.slice(0, 5) }));
await browser.close();
