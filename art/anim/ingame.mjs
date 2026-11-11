// In-game check of the characters (the real game, town start): Iris standing, walking, running, stopping, turning,
// registering at the altar and winking, every townsperson, and a phone run that lists the model files requested.
// Stills are rendered from the page with a spy camera through the game's own renderer and scene (no game code path
// changes: the camera, the clips and the people are whatever the game has at that moment), so any angle is possible
// and software WebGL is enough.
//   node art/anim/ingame.mjs --out <dir> [--url http://127.0.0.1:5199] [--size 640x400] [--gpu] [--only desk,folk,altar,phone]
// Needs a running `npx vite` in game/ and Playwright. Writes <out>/*.jpg and <out>/report.json.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'out'), url = arg('url', 'http://127.0.0.1:5199');
const [W, H] = arg('size', '640x400').split('x').map(Number);
const only = arg('only', 'desk,folk,altar,phone').split(',');   // folk runs inside desk
const gpuArgs = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: process.argv.includes('--gpu') ? gpuArgs : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
mkdirSync(out, { recursive: true });
const report = { errors: {}, runs: {} };

async function open(name, query, ctxOptions) {
  const ctx = await browser.newContext(ctxOptions || { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = report.errors[name] = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 240)));
  page.on('request', (r) => { const u = r.url(); if (/\.glb(\?|$)/.test(u)) requests.push(u.split('/').pop().split('?')[0]); });
  await page.goto(`${url}/?${query}`);
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 });
  await page.evaluate(() => {
    const f = window.__ftf, V = f.rig.camera.position.constructor;
    /** A still through the game's renderer from `from` looking at `at` (world points). */
    window.__spy = (at, from, fov = 30) => {
      const cam = f.rig.camera.clone(); cam.fov = fov; cam.near = 0.05; cam.updateProjectionMatrix();
      cam.position.set(from[0], from[1], from[2]); cam.lookAt(at[0], at[1], at[2]); cam.updateMatrixWorld(true);
      f.renderer.setRenderTarget(null); f.renderer.render(f.scene, cam);
      return f.renderer.domElement.toDataURL('image/jpeg', 0.86);
    };
    /** Iris from an angle around her own facing (0 = from the front), at `dist`, aimed at height `h`. */
    window.__irisShot = (angle, dist = 3.4, h = 0.92, fov = 30, up = 0.25) => {
      const p = f.player, a = p.heading + angle, at = [p.pos[0], p.pos[1] + h, p.pos[2]];
      return window.__spy(at, [at[0] + Math.sin(a) * dist, at[1] + up, at[2] + Math.cos(a) * dist], fov);
    };
    window.__bone = (name) => { let best = null, bd = 1e9; f.scene.traverse((o) => { if (o.name !== name) return; const w = o.getWorldPosition(new V()); const d = Math.hypot(w.x - f.player.pos[0], w.z - f.player.pos[2]); if (d < bd) { bd = d; best = o; } }); return best; };
    window.__V = V;
  });
  return { page, ctx, errors, requests };
}

const save = (name, dataUrl) => writeFileSync(join(out, name + '.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
const shot = async (page, name, ...a) => save(name, await page.evaluate((a) => window.__irisShot(...a), a));
const wait = (page, s) => page.waitForTimeout(s * 1000);
const fpsOf = (page) => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 > 3000) res(+(n / 3).toFixed(1)); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
const PI = Math.PI;

if (only.includes('desk')) {
  const { page, ctx, requests } = await open('desk', 'play=direct&town=1&tier=low&tex=full');
  const run = report.runs.desk = { fps: await fpsOf(page) };
  await wait(page, 3);
  await shot(page, 'iris_idle_front', 0); await shot(page, 'iris_idle_34', PI * 0.22); await shot(page, 'iris_idle_side', PI / 2); await shot(page, 'iris_idle_back', PI);
  // hands against the body: distance of each hand bone from the pelvis' side at rest in the idle
  run.idle = await page.evaluate(() => { const o = {}; for (const n of ['hand_L', 'hand_R', 'forearm_L', 'upperarm_L', 'thigh_L', 'foot_L', 'foot_R', 'pelvis']) { const b = window.__bone(n); const w = b.getWorldPosition(new window.__V()); o[n] = [+(w.x - window.__ftf.player.pos[0]).toFixed(3), +(w.y - window.__ftf.player.pos[1]).toFixed(3), +(w.z - window.__ftf.player.pos[2]).toFixed(3)]; } return o; });
  await page.keyboard.down('KeyW'); await wait(page, 2.5);
  await shot(page, 'iris_walk_side', PI / 2); await shot(page, 'iris_walk_34', PI * 0.25);
  run.walkSpeed = await page.evaluate(() => +Math.hypot(...window.__ftf.player.vel).toFixed(2));
  await page.keyboard.down('ShiftLeft'); await wait(page, 2.5);
  await shot(page, 'iris_run_side', PI / 2);
  run.runSpeed = await page.evaluate(() => +Math.hypot(...window.__ftf.player.vel).toFixed(2));
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await wait(page, 0.35);
  await shot(page, 'iris_stop_side', PI / 2); await wait(page, 1.5);
  await page.keyboard.down('KeyS'); await wait(page, 0.25); await page.keyboard.up('KeyS'); await wait(page, 0.3);
  await shot(page, 'iris_turn_34', PI * 0.25, 3.4, 0.7); await wait(page, 1.5);
  await shot(page, 'iris_after_turn_front', 0);
  // the wink: cue the clip and take the face when the lid is at its lowest (sampled each frame)
  // cued through the avatar with a far-off end time: on software WebGL a frame takes longer than the game's 0.25 s
  // step, so the wall-clock reaction (2.6 s) would end before the clip reaches the wink; on real hardware use irisReact
  await page.evaluate(() => window.__ftf.iris.react('understand', 1e9));
  const wink = await page.evaluate(() => new Promise((res) => {
    const f = window.__ftf; let tries = 0;
    const face = (side, dist) => { const h = window.__bone('head').getWorldPosition(new window.__V()); const a = f.player.heading + side; return window.__spy([h.x, h.y + 0.09, h.z], [h.x + Math.sin(a) * dist, h.y + 0.11, h.z + Math.cos(a) * dist], 30); };
    // one moment, by the clip's own time (the wink's morph peaks at about 1.37 s); nothing is rendered before it,
    // because software WebGL stalls the game clock that ends the reaction
    const tick = () => { const m = f.iris && f.iris.irisModel, act = m && m.react; tries++;
      if (act && act.time >= 1.37) res({ clip: act.getClip().name, time: +act.time.toFixed(2), imgs: [face(0.2, 0.7), face(-0.5, 0.8), window.__irisShot(0.3, 2.2, 1.25)] });
      else if (tries > 900) res({ clip: act ? act.getClip().name : null, time: act ? act.time : null, imgs: [] }); else setTimeout(tick, 30); };
    tick();
  }));
  run.wink = { clip: wink.clip, time: wink.time };
  wink.imgs.forEach((im, i) => save(`iris_wink_${i}`, im));
  if (only.includes('folk')) {
  // the townsfolk: wait for everyone, then a still of each from two sides and the numbers
  await page.waitForFunction(() => { const t = window.__ftf.town.scene.townsfolk; return t && t.loaded >= 13; }, null, { timeout: 420000 }).catch(() => {});
  await wait(page, 4);
  const origin = await page.evaluate(async () => (await import('/src/scenes/town-layout.js')).TOWN_ORIGIN);
  run.townsfolk = [];
  const keys = await page.evaluate(() => window.__ftf.town.scene.townsfolk.status().map((s) => s.key));
  for (const key of keys) {
    // far people are hidden and frozen by the game: stand Iris next to each one first (QA teleport), then look
    const got = await page.evaluate(async ([key, origin]) => {
      const f = window.__ftf, tf = f.town.scene.townsfolk, st = () => tf.status().find((s) => s.key === key);
      const world = (s) => [s.at[0] + origin[0], s.at[1] + origin[1], s.at[2] + origin[2]];
      let w = world(st());
      f.player.pos[0] = w[0] + 1.6; f.player.pos[1] = w[1] + 0.05; f.player.pos[2] = w[2] + 1.6; f.player.vel[0] = f.player.vel[1] = 0;
      await new Promise((r) => setTimeout(r, 4500));
      const s = st(); w = world(s);
      let ground = null; try { ground = f.town.scene.groundAt(w[0], w[2], w[1] + 1); } catch { ground = null; }
      let pelvis = null, foot = null, bd = 1e9;
      f.scene.traverse((o) => { if (o.name !== 'pelvis') return; const q = o.getWorldPosition(new window.__V()); const d = Math.hypot(q.x - w[0], q.z - w[2]); if (d < bd) { bd = d; pelvis = q; } });
      bd = 1e9; f.scene.traverse((o) => { if (o.name !== 'foot_L') return; const q = o.getWorldPosition(new window.__V()); const d = Math.hypot(q.x - w[0], q.z - w[2]); if (d < bd) { bd = d; foot = q; } });
      const at = [w[0], w[1] + 0.85, w[2]];
      const imgs = [0.7, 3.9].map((a) => window.__spy(at, [at[0] + Math.sin(a) * 3.4, at[1] + 0.45, at[2] + Math.cos(a) * 3.4], 32));
      return { info: { key, state: s.state, file: s.file, clip: s.clip, walk: s.walk, visible: s.visible, y: +w[1].toFixed(2), ground: ground == null ? null : +ground.toFixed(2), pelvis_above: pelvis ? +(pelvis.y - w[1]).toFixed(2) : null, foot_above: foot ? +(foot.y - w[1]).toFixed(2) : null }, imgs };
    }, [key, origin]);
    run.townsfolk.push(got.info);
    got.imgs.forEach((im, i) => save(`folk_${key}_${i}`, im));
  }
  // a second look after a while: who moved, which clips play
  await wait(page, 4);
  run.townsfolkLater = await page.evaluate(() => window.__ftf.town.scene.townsfolk.status().map((s) => ({ key: s.key, clip: s.clip, walk: s.walk, at: s.at.map((v) => +v.toFixed(2)) })));
  }
  run.glb = [...new Set(requests)].filter((x) => /iris|townsfolk/.test(x));
  await ctx.close();
}

if (only.includes('altar')) {
  const { page, ctx } = await open('altar', 'play=direct&town=altar&tier=low&tex=full');
  const run = report.runs.altar = {};
  await wait(page, 2);
  run.offered = await page.evaluate(() => window.__ftf.town.promptVisible);
  // the pose first (held by a far-off end time, see the wink), then the real flow: does it cue the clip?
  await page.evaluate(() => window.__ftf.iris.react('register', 1e9));
  const reg = await page.evaluate(() => new Promise((res) => {
    const f = window.__ftf; let tries = 0;
    const tick = () => { const m = f.iris && f.iris.irisModel, act = m && m.react; tries++;
      if (act && act.time >= 1.1) res({ clip: act.getClip().name, time: +act.time.toFixed(2), imgs: [window.__irisShot(Math.PI / 2, 3.2, 1.0), window.__irisShot(Math.PI * 0.8, 3.6, 1.1), window.__irisShot(0.6, 3.2, 1.0)] });
      else if (tries > 600) res({ clip: act ? act.getClip().name : null, time: act ? act.time : null, imgs: [] }); else setTimeout(tick, 30); };
    tick();
  }));
  run.register = { clip: reg.clip, time: reg.time };
  await page.evaluate(() => { window.__ftf.iris.irisReaction = null; });
  await wait(page, 2.5);
  run.flowCuesRegister = await page.evaluate(() => new Promise((res) => {
    const f = window.__ftf; f.town.register(); let n = 0;
    const tick = () => { const r = f.iris.irisReaction; if (r && r.clip === 'register') res(true); else if (++n > 60) res(false); else setTimeout(tick, 50); };
    tick();
  }));
  reg.imgs.forEach((im, i) => save(`iris_register_${['side', 'back34', 'front34'][i]}`, im));
  await ctx.close();
}

if (only.includes('phone')) {
  const { page, ctx, requests } = await open('phone', 'play=direct&town=1', { ...devices['iPhone 13'] });
  const run = report.runs.phone = { fps: await fpsOf(page) };
  await page.waitForFunction(() => { const t = window.__ftf.town.scene.townsfolk; return t && t.loaded >= 13; }, null, { timeout: 420000 }).catch(() => {});
  run.loaded = await page.evaluate(() => window.__ftf.town.scene.townsfolk.loaded);
  run.files = await page.evaluate(() => window.__ftf.town.scene.townsfolk.status().map((s) => s.file));
  run.glb = [...new Set(requests)].filter((x) => /iris|townsfolk/.test(x));
  save('phone_iris_idle_34', await page.evaluate(() => window.__irisShot(Math.PI * 0.22)));
  await ctx.close();
}

await browser.close();
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report).slice(0, 6000));
