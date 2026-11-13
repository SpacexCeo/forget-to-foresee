// Measures what the game plays on the quest givers (docs/art/townsfolk/rigging-best-practices.md, section 8): loads
// each model and its clips through the game's own loaders on a running dev server and steps every clip at 30 fps.
//   node art/townsfolk/npc_check.mjs [--url http://127.0.0.1:5211] [--models npc_guard,...] [--out report.json]
// Per clip: knee bend range and the largest change in one frame (a pop), the knee's bend-plane turn per frame (while
// the knee is bent more than 17 degrees: a straighter leg has no plane to speak of), how far
// a planted foot slides, how far the ankles stand apart against the rest stance, and the longest stretch of a mesh
// edge on the legs against its rest length. Exit code 1 when a limit is broken.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5211'), models = arg('models', 'npc_guard,npc_innkeeper,npc_elder,npc_lamplighter,npc_shardkeeper').split(',');
export const LIMITS = { kneeMin: -1, kneeMax: 150, pop: 14, popMoving: 30, plane: 25, slide: 0.02, stretch: 0.025, spread: 0.06 };
const BODY = { npc_guard: 'guard', npc_elder: 'elder' };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '/anim-review.html?a=townsfolk_baker&aclips=townsfolk&scenario=clip:idle&seconds=1'); await page.waitForTimeout(1500);
const report = {};
for (const name of models) {
  report[name] = await page.evaluate(async ({ name, body }) => {
    const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => import('three'));
    const [{ fetchGltf }, L, SU] = await Promise.all([import('/src/render/assets.js'), import('/src/play/anim-library.js'), import('/node_modules/.vite/deps/three_addons_utils_SkeletonUtils__js.js')]);
    const { gltf } = await fetchGltf(name); const model = SU.clone(gltf.scene); model.updateMatrixWorld(true);
    const own = gltf.animations || [];
    const shared = own.length >= 4 ? [] : await L.townsfolkClips(model, { key: name + ':check', body });
    const clips = L.mergeClips(own, shared);
    let mesh = null; model.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
    const bone = (n) => mesh.skeleton.bones.find((b) => b.name === n);
    const wp = (b) => b.getWorldPosition(new THREE.Vector3());
    // the legs' edges at rest (a sample), with skinning applied on the CPU
    const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index, v = new THREE.Vector3();
    const P = (i) => mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).clone();
    const edges = [], si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, isLeg = mesh.skeleton.bones.map((b) => /^(thigh|shin|foot|toe)_/.test(b.name));
    const leg = (i) => { let w = 0; for (let c = 0; c < 4; c++) if (isLeg[si.getComponent(i, c)]) w += sw.getComponent(i, c); return w > 0.5; }; // a leg's own skin (a hand hanging beside it is not)
    const nT = idx ? idx.count / 3 : pos.count / 3, stepT = Math.max(1, Math.floor(nT / 6000));
    for (let t = 0; t < nT; t += stepT) { const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1; if (!leg(a) || !leg(b)) continue; const pa = P(a), pb = P(b); edges.push([a, b, pa.distanceTo(pb)]); }
    const rest = { ankles: Math.abs(wp(bone('foot_L')).x - wp(bone('foot_R')).x) };
    const out = { own: own.length, edges: edges.length, restAnkles: +rest.ankles.toFixed(3), clips: {} };
    const mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      mixer.stopAllAction(); const act = mixer.clipAction(clip); act.reset().play(); mixer.setTime(0);
      const F = Math.max(2, Math.round(clip.duration * 30)), speed = (clip.userData && clip.userData.speed) || 0;
      const R = { speed: +speed.toFixed(3), kneeMin: 999, kneeMax: -999, pop: 0, plane: 0, slide: 0, stretch: 0, spread: 0, floor: 0 };
      const prev = {}, feet = { L: [], R: [] };
      for (let f = 0; f < F; f++) {
        mixer.setTime((f / F) * clip.duration); model.updateMatrixWorld(true);
        for (const s of ['L', 'R']) {
          const h = wp(bone('thigh_' + s)), k = wp(bone('shin_' + s)), a = wp(bone('foot_' + s)), toe = wp(bone('toe_' + s));
          const d1 = k.clone().sub(h).normalize(), d2 = a.clone().sub(k).normalize();
          const n = d1.clone().cross(d2); const bend = Math.atan2(n.length(), d1.dot(d2)) * 180 / Math.PI;
          R.kneeMin = Math.min(R.kneeMin, bend); R.kneeMax = Math.max(R.kneeMax, bend);
          const p = prev[s];
          if (p) { R.pop = Math.max(R.pop, Math.abs(bend - p.bend)); if (n.length() > 0.3 && p.n.length() > 0.3) R.plane = Math.max(R.plane, n.clone().normalize().angleTo(p.n.clone().normalize()) * 180 / Math.PI); }
          prev[s] = { bend, n }; feet[s].push({ a, toe });
        }
        R.spread = Math.max(R.spread, Math.abs(Math.abs(feet.L[f].a.x - feet.R[f].a.x) - rest.ankles));
        if (f % 3 === 0) for (const [a, b, l0] of edges) { const d = P(a).distanceTo(P(b)) - l0; if (d > R.stretch) R.stretch = d; }
      }
      // planted: the ankle within 1.5 cm of its lowest height in the clip; slide = travel against the ground while planted
      for (const s of ['L', 'R']) {
        const ys = feet[s].map((x) => x.a.y), lo = Math.min(...ys); let run = 0, worst = 0;
        for (let f = 1; f < F; f++) {
          if (ys[f] < lo + 0.015 && ys[f - 1] < lo + 0.015) { const dx = feet[s][f].a.x - feet[s][f - 1].a.x, dz = feet[s][f].a.z - feet[s][f - 1].a.z + speed * (clip.duration / F) * (clip.userData && clip.userData.forward === -1 ? -1 : 1); run += Math.hypot(dx, dz); worst = Math.max(worst, run); } else run = 0;
        }
        R.slide = Math.max(R.slide, worst); R.floor = Math.max(R.floor, Math.max(...ys) - lo);
      }
      for (const k of Object.keys(R)) R[k] = +R[k].toFixed(k === 'slide' || k === 'stretch' || k === 'spread' || k === 'floor' ? 3 : 1);
      out.clips[clip.name] = R;
    }
    return out;
  }, { name, body: BODY[name] || 'adult' }).catch((e) => ({ error: String(e).slice(0, 300) }));
}
await browser.close();
const bad = [];
for (const [m, r] of Object.entries(report)) {
  if (r.error) { bad.push(m + ': ' + r.error); continue; }
  for (const [c, R] of Object.entries(r.clips)) {
    const why = [];
    if (R.kneeMax > LIMITS.kneeMax) why.push('knee ' + R.kneeMax); if (R.pop > (R.speed ? LIMITS.popMoving : LIMITS.pop)) why.push('pop ' + R.pop); if (R.plane > LIMITS.plane) why.push('plane ' + R.plane);
    if (R.slide > LIMITS.slide) why.push('slide ' + R.slide); if (R.stretch > LIMITS.stretch) why.push('stretch ' + R.stretch); if (!R.speed && R.spread > LIMITS.spread) why.push('spread ' + R.spread);
    if (why.length) bad.push(`${m} ${c}: ${why.join(', ')}`);
  }
}
if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ limits: LIMITS, report, bad, errors }, null, 1));
for (const [m, r] of Object.entries(report)) { console.log(m, r.error || `own clips ${r.own}, rest ankles ${r.restAnkles}`); if (!r.error) for (const [c, R] of Object.entries(r.clips)) console.log('  ' + c.padEnd(11), JSON.stringify(R)); }
console.log(bad.length ? 'FAILED:\n' + bad.join('\n') : 'ALL WITHIN LIMITS'); process.exit(bad.length ? 1 : 0);
