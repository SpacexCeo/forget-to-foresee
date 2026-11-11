// Real-time checks of the characters in the real game on a GPU browser (what software WebGL cannot show):
// foot sliding of Iris and of townsfolk walkers, start / stop / turn on the spot / a corner at a run, the wink in its
// real 2.6 s window, the idle → idle2 hand-over, the registration, the townsfolk look-at and the frame cost.
//   node art/anim/ingame-gpu.mjs --out <dir> [--url http://127.0.0.1:5199] [--only loco,face,altar,folk,perf,phone]
// Needs a running `npx vite` in game/, Playwright, ffmpeg and a GPU (ANGLE on Vulkan). Writes <out>/report.json,
// stills and <out>/loco.webm (the game's own camera, turned so that she moves across the screen).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'out'), url = arg('url', 'http://127.0.0.1:5199');
const only = arg('only', 'loco,face,altar,folk,perf,phone').split(',');
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', ...(process.argv.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
mkdirSync(out, { recursive: true });
const report = { errors: {}, runs: {} };
const flush = () => writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));

async function open(name, query, ctxOptions) {
  const ctx = await browser.newContext(ctxOptions || { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = report.errors[name] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 240)));
  await page.goto(`${url}/?${query}`);
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 300000 });
  await page.evaluate(async () => {
    const f = window.__ftf, V = f.rig.camera.position.constructor;
    window.__V = V;
    window.__origin = (await import('/src/scenes/town-layout.js')).TOWN_ORIGIN;
    window.__spy = (at, from, fov = 30) => {
      const cam = f.rig.camera.clone(); cam.fov = fov; cam.near = 0.05; cam.updateProjectionMatrix();
      cam.position.set(from[0], from[1], from[2]); cam.lookAt(at[0], at[1], at[2]); cam.updateMatrixWorld(true);
      f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam);
      return f.renderer.domElement.toDataURL('image/jpeg', 0.8);
    };
    window.__irisShot = (angle, dist = 3.4, h = 0.92, fov = 30, up = 0.25) => { const p = f.player, a = p.heading + angle, at = [p.pos[0], p.pos[1] + h, p.pos[2]]; return window.__spy(at, [at[0] + Math.sin(a) * dist, at[1] + up, at[2] + Math.cos(a) * dist], fov); };
    window.__near = (name, x, z) => { let best = null, bd = 1e9; f.scene.traverse((o) => { if (o.name !== name) return; const w = o.getWorldPosition(new V()); const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = o; } }); return best; };
    /** Samples every rendered frame until stopped: time, a speed, a yaw, and the world positions of the given bones. */
    window.__sample = (bones, speed, yaw) => { const rows = []; const s = { rows, on: true }; const tick = () => { if (!s.on) return; const r = [performance.now() / 1000, speed(), yaw()]; for (const b of bones) { const w = b.getWorldPosition(new V()); r.push(w.x, w.y, w.z); } rows.push(r); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return s; };
    /** A burst of stills from a fixed side camera (set at the start, following her position): for start, stop and turns. */
    window.__bursts = {};
    window.__burst = (name, frames = 16, every = 3) => { const p = f.player, a = p.heading + Math.PI / 2, off = [Math.sin(a) * 3.3, 0.2, Math.cos(a) * 3.3], o = { imgs: [] }; let i = 0;
      const tick = () => { if (i++ % every === 0) { const at = [p.pos[0], p.pos[1] + 0.75, p.pos[2]]; o.imgs.push(window.__spy(at, [at[0] + off[0], at[1] + off[1], at[2] + off[2]], 34)); } if (o.imgs.length < frames) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); window.__bursts[name] = o; };
    window.__irisBones = () => ['toe_L', 'toe_R', 'foot_L', 'foot_R'].map((n) => f.iris.irisModel.model.getObjectByName(n));
  });
  await page.waitForTimeout(2500);
  return { page, ctx, errors };
}

const save = (name, dataUrl) => writeFileSync(join(out, name + '.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
const wait = (page, s) => page.waitForTimeout(s * 1000);
const r3 = (x) => +x.toFixed(3);

/** Foot numbers from sampled rows [t, speed, yaw, toeL xyz, toeR xyz, ...] between two times. */
function feet(rows, t0, t1, { lo = -1, hi = 1e9 } = {}) {
  const seg = rows.filter((r) => r[0] >= t0 && r[0] <= t1);
  const v = []; let slide = 0, frames = 0;
  for (const k of [3, 6]) {
    const low = Math.min(...seg.map((r) => r[k + 1]));
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1], b = seg[i], dt = b[0] - a[0];
      if (dt <= 0 || b[1] < lo || b[1] > hi) continue;
      const d = Math.hypot(b[k] - a[k], b[k + 2] - a[k + 2]);
      v.push(d / dt); frames++;
      if (a[k + 1] - low < 0.012 && b[k + 1] - low < 0.012) slide += d;       // travel of a ball of the foot while it is on the ground
    }
  }
  v.sort((x, y) => x - y); const n = Math.floor(v.length * 0.3);
  return { frames: frames / 2, seconds: r3(t1 - t0), stance_speed_m_s: n ? r3(v.slice(0, n).reduce((q, x) => q + x, 0) / n) : null, ground_slide_m: r3(slide / 2) };
}

if (only.includes('loco')) {
  const { page, ctx } = await open('loco', 'play=direct&town=1&tex=full', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const run = report.runs.loco = {};
  // the camera looks across the street, so the street runs across the screen: A / D walk along it, seen from the side
  await page.evaluate(() => { const f = window.__ftf; f.rig.rotate(Math.PI / 2); f.rig.dist = 5.2; f.rig.pitchOffset = -0.25; });
  await wait(page, 1.5);
  await page.evaluate(() => { const f = window.__ftf; window.__s = window.__sample(window.__irisBones(), () => Math.hypot(f.player.vel[0], f.player.vel[1]), () => (f.iris.irisModel.plant && f.iris.irisModel.plant.yaw != null ? f.iris.irisModel.plant.yaw : f.player.heading)); });
  const marks = {}; const now = () => page.evaluate(() => performance.now() / 1000);
  const step = async (name, fn, seconds) => { marks[name] = await now(); if (fn) await fn(); await wait(page, seconds); };
  const dir = arg('dir', 'KeyD'), back = dir === 'KeyD' ? 'KeyA' : 'KeyD';
  await step('idle', null, 1.0);
  await step('walk', async () => { await page.evaluate(() => window.__burst('start', 16, 3)); await page.keyboard.down(dir); }, 3.2);
  await step('run', () => page.keyboard.down('ShiftLeft'), 3.0);
  await step('slow', () => page.keyboard.up('ShiftLeft'), 1.6);
  await step('stop', async () => { await page.evaluate(() => window.__burst('stop', 16, 3)); await page.keyboard.up(dir); }, 2.0);
  await step('pivot180', async () => { await page.evaluate(() => window.__burst('pivot180', 16, 4)); await page.keyboard.down(back); await wait(page, 0.12); await page.keyboard.up(back); }, 2.2);
  await step('pivot90', async () => { await page.evaluate(() => window.__burst('pivot90', 12, 4)); await page.keyboard.down('KeyW'); await wait(page, 0.1); await page.keyboard.up('KeyW'); }, 2.0);
  await step('runstop', async () => { await page.keyboard.down('ShiftLeft'); await page.keyboard.down(dir); await wait(page, 2.0); await page.evaluate(() => window.__burst('runstop', 16, 3)); await page.keyboard.up(dir); await page.keyboard.up('ShiftLeft'); }, 1.8);
  await step('stop2', () => page.keyboard.up(back), 0.2);
  await step('corner', async () => { await page.keyboard.down('ShiftLeft'); await page.keyboard.down(back); await wait(page, 1.6); await page.evaluate(() => window.__burst('corner', 16, 3)); await page.keyboard.down('KeyS'); await page.keyboard.up(back); }, 1.6);
  await step('end', async () => { await page.keyboard.up('KeyS'); await page.keyboard.up('ShiftLeft'); }, 1.5);
  marks.done = await now();
  const rows = await page.evaluate(() => { window.__s.on = false; return window.__s.rows; });
  const t0 = rows[0][0];
  run.fps = r3((rows.length - 1) / (rows[rows.length - 1][0] - rows[0][0]));
  run.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, r3(v - t0)]));
  run.walk = { ...feet(rows, marks.walk + 1.0, marks.run, { lo: 1.6, hi: 1.8 }), speed: r3(Math.max(...rows.filter((r) => r[0] > marks.walk + 1 && r[0] < marks.run).map((r) => r[1]))) };
  run.run = { ...feet(rows, marks.run + 1.0, marks.slow, { lo: 3.2, hi: 3.4 }), speed: r3(Math.max(...rows.filter((r) => r[0] > marks.run + 1 && r[0] < marks.slow).map((r) => r[1]))) };
  run.stop = feet(rows, marks.stop + 0.1, marks.pivot180, { hi: 0.05 });
  run.runstop = feet(rows, marks.runstop + 2.1, marks.stop2, { hi: 0.05 });
  run.pivot180 = feet(rows, marks.pivot180, marks.pivot90);
  run.pivot90 = feet(rows, marks.pivot90, marks.runstop);
  // the body's own turn: fastest yaw rate and how long the half turn takes
  const yawRate = (a, b) => { let m = 0; const seg = rows.filter((r) => r[0] >= a && r[0] <= b); for (let i = 1; i < seg.length; i++) { let d = seg[i][2] - seg[i - 1][2]; d = Math.atan2(Math.sin(d), Math.cos(d)); m = Math.max(m, Math.abs(d) / Math.max(seg[i][0] - seg[i - 1][0], 1e-4)); } return r3(m * 180 / Math.PI); };
  run.pivot180.max_yaw_deg_s = yawRate(marks.pivot180, marks.pivot90); run.pivot90.max_yaw_deg_s = yawRate(marks.pivot90, marks.runstop);
  run.corner = { max_yaw_deg_s: yawRate(marks.corner + 1.4, marks.end), speed_min: r3(Math.min(...rows.filter((r) => r[0] > marks.corner + 1.2 && r[0] < marks.end).map((r) => r[1]))) };
  const bursts = await page.evaluate(() => window.__bursts);
  for (const [k, b] of Object.entries(bursts)) b.imgs.forEach((im, i) => save(`burst_${k}_${String(i).padStart(2, '0')}`, im));
  writeFileSync(join(out, 'loco_rows.json'), JSON.stringify(rows.filter((_, i) => i % 2 === 0).map((r) => r.slice(0, 9).map((x) => +x.toFixed(3)))));
  await ctx.close();
  const vid = readdirSync(out).find((f) => f.endsWith('.webm') && f !== 'loco.webm'); if (vid) renameSync(join(out, vid), join(out, 'loco.webm'));
  flush();
}

if (only.includes('face')) {
  const { page, ctx } = await open('face', 'play=direct&town=1&tex=full');
  const run = report.runs.face = {};
  // the wink as the game cues it (2.6 s window on the game clock)
  run.wink = await page.evaluate(() => new Promise((res) => {
    const f = window.__ftf, m = f.iris.irisModel, lid = m.model.getObjectByName('lid_up_L'), w0 = lid.quaternion.w, t0 = performance.now();
    f.irisReact('understand');
    const o = { max_weight: 0, lid_change_max: 0, lid_peak_clip_time: null, clip_time_at_end: null, still: null };
    const tick = () => { const a = m.react, t = (performance.now() - t0) / 1000;
      if (a) { o.max_weight = Math.max(o.max_weight, a.getEffectiveWeight()); const d = Math.abs(lid.quaternion.w - w0); if (d > o.lid_change_max) { o.lid_change_max = d; o.lid_peak_clip_time = +a.time.toFixed(2); o.lid_peak_wall = +t.toFixed(2); } o.clip_time_at_end = +a.time.toFixed(2);
        if (!o.still && a.time >= 1.37) { const h = m.model.getObjectByName('head').getWorldPosition(new window.__V()); const an = f.player.heading + 0.2; o.still = window.__spy([h.x, h.y + 0.09, h.z], [h.x + Math.sin(an) * 0.7, h.y + 0.11, h.z + Math.cos(an) * 0.7], 30); o.still_wall = +t.toFixed(2); o.still_weight = +a.getEffectiveWeight().toFixed(2); } }
      if (t > 3.6) res(o); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  if (run.wink.still) save('wink_realtime', run.wink.still); delete run.wink.still;
  run.wink.max_weight = r3(run.wink.max_weight); run.wink.lid_change_max = r3(run.wink.lid_change_max);
  // idle → idle2: three loops of 6 s; the weights, and the largest jump of a hand between two frames (a pop)
  await wait(page, 1.0);
  run.idle2 = await page.evaluate(() => new Promise((res) => {
    const f = window.__ftf, m = f.iris.irisModel, hand = m.model.getObjectByName('hand_R'), pel = m.model.getObjectByName('pelvis'), V = window.__V;
    const t0 = performance.now(); let prevH = hand.getWorldPosition(new V()), prevP = pel.getWorldPosition(new V()), prevT = t0;
    const o = { has: !!m.idle2Action, k_max: 0, k_first_above_half_s: null, k_back_below_half_s: null, hand_speed_max_m_s: 0, pelvis_speed_max_m_s: 0, pelvis_x_range: [1e9, -1e9], stills: [] };
    const tick = () => { const now = performance.now(), t = (now - t0) / 1000, dt = (now - prevT) / 1000; prevT = now;
      const h = hand.getWorldPosition(new V()), p = pel.getWorldPosition(new V());
      if (dt > 0) { o.hand_speed_max_m_s = Math.max(o.hand_speed_max_m_s, h.distanceTo(prevH) / dt); o.pelvis_speed_max_m_s = Math.max(o.pelvis_speed_max_m_s, p.distanceTo(prevP) / dt); }
      prevH = h; prevP = p;
      const k = m.idleK || 0; o.k_max = Math.max(o.k_max, k);
      if (k > 0.5 && o.k_first_above_half_s == null) o.k_first_above_half_s = +t.toFixed(2);
      if (k < 0.5 && o.k_first_above_half_s != null && o.k_back_below_half_s == null) o.k_back_below_half_s = +t.toFixed(2);
      const want = [2.5, 8.5, 14.5, 20.5][o.stills.length]; if (want != null && t >= want) o.stills.push(window.__irisShot(0, 3.3));
      if (t > 21) res(o); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  run.idle2.stills.forEach((im, i) => save(`idle_loop_${i}`, im)); delete run.idle2.stills;
  for (const k of ['k_max', 'hand_speed_max_m_s', 'pelvis_speed_max_m_s']) run.idle2[k] = r3(run.idle2[k]);
  await ctx.close(); flush();
}

if (only.includes('altar')) {
  const { page, ctx } = await open('altar', 'play=direct&town=altar&tex=full');
  const run = report.runs.altar = { offered: await page.evaluate(() => window.__ftf.town.promptVisible) };
  run.register = await page.evaluate(() => new Promise((res) => {
    const f = window.__ftf, m = f.iris.irisModel, t0 = performance.now(); f.town.register();
    const o = { max_weight: 0, clip: null, stills: [], at: [] };
    const tick = () => { const a = m.react, t = (performance.now() - t0) / 1000;
      if (a) { o.clip = a.getClip().name; o.max_weight = Math.max(o.max_weight, a.getEffectiveWeight()); const want = [0.45, 0.9, 1.4][o.stills.length]; if (want != null && a.time >= want) { o.stills.push(window.__irisShot(Math.PI / 2, 3.2, 1.0)); o.at.push([+a.time.toFixed(2), +t.toFixed(2), f.town.phase]); } }
      if (t > 2.4 || o.stills.length >= 3) res(o); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  run.register.stills.forEach((im, i) => save(`register_realtime_${i}`, im)); delete run.register.stills; run.register.max_weight = r3(run.register.max_weight);
  await ctx.close(); flush();
}

if (only.includes('folk')) {
  const { page, ctx } = await open('folk', 'play=direct&town=1&tex=full');
  const run = report.runs.folk = { walkers: {}, look: {} };
  await page.waitForFunction(() => window.__ftf.town.scene.townsfolk.loaded >= 13, null, { timeout: 180000 }).catch(() => {});
  await wait(page, 3);
  for (const key of ['courier', 'lamplighter', 'sweeper', 'child_a', 'child_b', 'elder']) {
    const got = await page.evaluate(async (key) => {
      const f = window.__ftf, tf = f.town.scene.townsfolk, O = window.__origin, st = () => tf.status().find((s) => s.key === key);
      const W = () => { const s = st(); return [s.at[0] + O[0], s.at[1] + O[1], s.at[2] + O[2]]; };
      // up to 40 s: wait for this person to be on a walk, standing Iris 5 m to the side so the person is drawn and animated
      let w = W(), tries = 0, moving = false;
      while (tries++ < 40 && !moving) { w = W(); f.player.pos[0] = w[0] + 3.5; f.player.pos[1] = w[1] + 0.05; f.player.pos[2] = w[2] + 3.5; await new Promise((r) => setTimeout(r, 1000)); const w2 = W(); moving = Math.hypot(w2[0] - w[0], w2[2] - w[2]) > 0.25; w = w2; }
      if (!moving) return { moving: false, clip: st().clip };
      const bones = ['toe_L', 'toe_R'].map((n) => window.__near(n, w[0], w[2]));
      let prev = W(), prevT = performance.now() / 1000, sp = 0;
      const s = window.__sample(bones, () => { const n = performance.now() / 1000, c = W(); if (n - prevT > 0.05) { sp = Math.hypot(c[0] - prev[0], c[2] - prev[2]) / (n - prevT); prev = c; prevT = n; } return sp; }, () => 0);
      const shots = [];
      for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 900)); const c = W(); const at = [c[0], c[1] + 0.8, c[2]]; if (i === 1) shots.push(window.__spy(at, [at[0] + 2.6, at[1] + 0.3, at[2] + 2.2], 32)); }
      s.on = false;
      return { moving: true, walk: st().walk, rows: s.rows, shots };
    }, key);
    if (got.moving) { const rows = got.rows; const sp = rows.map((r) => r[1]).sort((a, b) => a - b); const med = sp[Math.floor(sp.length / 2)]; run.walkers[key] = { clip: got.walk, speed_m_s: r3(med), ...feet(rows, rows[0][0], rows[rows.length - 1][0], { lo: med * 0.7, hi: med * 1.3 }) }; got.shots.forEach((im) => save(`walker_${key}`, im)); } else run.walkers[key] = { moving: false, clip: got.clip };
    flush();
  }
  // look-at: Iris 3 m to one side, then to the other, of people who stand: the head's heading must follow her
  for (const key of ['shrinekeeper', 'baker', 'innkeeper']) {
    run.look[key] = await page.evaluate(async (key) => {
      const f = window.__ftf, tf = f.town.scene.townsfolk, O = window.__origin, s = tf.status().find((x) => x.key === key), V = window.__V;
      const w = [s.at[0] + O[0], s.at[1] + O[1], s.at[2] + O[2]];
      const yawOf = (o) => { const d = new V(0, 0, 1).applyQuaternion(o.getWorldQuaternion(f.rig.camera.quaternion.clone())); return Math.atan2(d.x, d.z); };
      const res = {}; const stills = [];
      for (const [name, dx, dz] of [['a', 2.6, 1.5], ['b', -2.6, 1.5], ['far', 9, 9]]) {
        f.player.pos[0] = w[0] + dx; f.player.pos[1] = w[1] + 0.05; f.player.pos[2] = w[2] + dz;
        await new Promise((r) => setTimeout(r, name === 'far' ? 2500 : 4200));           // greeting clips (2.6 s) end, the look stays
        const head = window.__near('head', w[0], w[2]), chest = window.__near('chest', w[0], w[2]);
        const rel = (a) => Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI;
        res[name] = { head_minus_chest_deg: +rel(yawOf(head) - yawOf(chest)).toFixed(1), to_iris_minus_chest_deg: +rel(Math.atan2(dx, dz) - yawOf(chest)).toFixed(1) };
        if (name !== 'far') stills.push(window.__spy([w[0], w[1] + 1.35, w[2]], [w[0] + dx * 0.55, w[1] + 1.5, w[2] + dz * 0.55 + 0.9], 34));
      }
      return { ...res, stills };
    }, key);
    run.look[key].stills.forEach((im, i) => save(`look_${key}_${i}`, im)); delete run.look[key].stills;
  }
  await ctx.close(); flush();
}

async function perfRun(name, query, ctxOptions) {
  const { page, ctx } = await open(name, query, ctxOptions);
  await page.waitForFunction(() => window.__ftf.town.scene.townsfolk.loaded >= 13, null, { timeout: 180000 }).catch(() => {});
  const run = report.runs[name] = { spots: {} };
  for (const [spot, k] of [['start', null], ['square', 'baker'], ['shrine', 'shrinekeeper']]) {
    if (k) await page.evaluate((k) => { const f = window.__ftf, s = f.town.scene.townsfolk.status().find((x) => x.key === k), O = window.__origin; f.player.pos[0] = s.at[0] + O[0] + 4; f.player.pos[1] = s.at[1] + O[1] + 0.05; f.player.pos[2] = s.at[2] + O[2] + 6; f.rig.dist = 14; }, k);
    else await page.evaluate(() => { window.__ftf.rig.dist = 14; });
    await wait(page, 4);
    run.spots[spot] = await page.evaluate(() => new Promise((res) => {
      const f = window.__ftf, proto = Object.getPrototypeOf(f.iris.irisModel.mixer); const orig = proto.update; let mix = 0, frames = 0; const ft = [];
      proto.update = function (dt) { mix++; return orig.call(this, dt); };
      // draw calls of the whole frame (all passes): the renderer's counters are reset by hand while measuring
      const info = f.renderer.info, auto = info.autoReset; info.autoReset = false; info.reset();
      let prev = performance.now(); const t0 = prev; let calls = 0, tris = 0;
      const tick = () => { const n = performance.now(); ft.push(n - prev); prev = n; frames++; calls += info.render.calls; tris += info.render.triangles; info.reset();
        if (n - t0 < 4000) requestAnimationFrame(tick); else {
          proto.update = orig; info.autoReset = auto; ft.sort((a, b) => a - b);
          let skinned = 0, bones = 0; f.scene.traverse((o) => { if (o.isSkinnedMesh) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) { skinned++; bones += o.skeleton.bones.length; } } });
          const st = f.town.scene.townsfolk.status(); const p = f.perf() || {};
          res({ fps: +(1000 * frames / (n - t0)).toFixed(1), frame_ms_avg: +((n - t0) / frames).toFixed(2), frame_ms_p95: +ft[Math.floor(ft.length * 0.95)].toFixed(2), frame_ms_max: +ft[ft.length - 1].toFixed(2), draw_calls: Math.round(calls / frames), triangles: Math.round(tris / frames), skinned_meshes_visible: skinned, skinned_bones_visible: bones, mixer_updates_per_frame: +(mix / frames).toFixed(2), townsfolk_visible: st.filter((s) => s.visible).length, townsfolk_loaded: st.filter((s) => s.state === 'loaded').length, files: [...new Set(st.map((s) => (/_m$/.test(s.file || '') ? 'm' : 'full')))].join('+'), tier: p.tier, pixelRatio: p.pixelRatio, size: p.size, gpu: p.gpu });
        } };
      requestAnimationFrame(tick);
    }));
    save(`${name}_${spot}`, await page.evaluate(() => window.__ftf.renderer.domElement.toDataURL('image/jpeg', 0.7)));
    flush();
  }
  await ctx.close();
}
if (only.includes('perf')) await perfRun('perf_desktop', 'play=direct&town=1');
if (only.includes('phone')) await perfRun('perf_phone', 'play=direct&town=1', { ...devices['iPhone 13'] });

await browser.close();
flush();
console.log(JSON.stringify(report).slice(0, 8000));
