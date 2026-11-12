// Animation review (dev only, served by `vite` as /anim-review.html; not part of the production build).
// Plays one or two rigged characters through the game's own locomotion runtime on a checker ground, frame by frame
// and deterministically, so a headless browser can capture identical before/after sequences and measure foot slip.
//
//   ?a=agent_iris[&aclips=/assets/anim/x.glb][&art=v1|v2]   left character (clips from the model, or a side-car file)
//   &b=agent_iris&bclips=...&brt=...                        optional second character (rows: a on top, b below)
//   &scenario=loco|walk|run|idle|turn|clip:<name>           what the characters do (see SCENARIOS)
//   &views=side,front                                       camera columns (side, front, front0, feetfront, back, top, feet, game)
//   &aclips=townsfolk                                       the shared townsfolk clips retargeted onto the model
//   &body=elder&walkclip=elder_walk&walk=clip               townsfolk body type, the clip that drives the gait, move at the clip's speed
//   &zoom=1.6&hscale=0.8&plant=0&once=1&walk=1.3            closer camera, lower aim, no planted-feet layer, one-shot, walk speed
//
// Page API for the capture script: window.__anim = { ready: Promise, frames, fps, step(i) → state, metrics() }.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { configureTextureSupport, fetchGltf } from '../render/assets.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { tuneHairCards } from '../render/hair-cards.js';
import { fabricSheen } from '../render/fabric.js';
import { resolveClip } from '../play/behaviour.js';
import { GaitLayer, FootPlant } from '../play/gait.js';
import { mergeClips, faceLayerClip, townsfolkClips } from '../play/anim-library.js';
import * as gaitModule from '../play/gait.js';
import { DEFAULT_MOTION, createMotion, stepMotion } from '../physics/motion.js';

const Q = new URLSearchParams(location.search);
const FPS = 30, DT = 1 / FPS;
const WALK = Number(Q.get('walk')) || 1.7, RUN = 3.3;
const ZOOM = Number(Q.get('zoom')) || 1, HSCALE = Number(Q.get('hscale')) || 1;

/** Each scenario: seconds, and input(t) → { speed: wished m/s, dir: wished heading (radians) or null, clip?: name }. */
const SCENARIOS = {
  idle: { seconds: 6, input: () => ({ speed: 0, dir: null }) },
  walk: { seconds: 4, input: () => ({ speed: WALK, dir: 0 }), warm: 2 },
  run: { seconds: 4, input: () => ({ speed: RUN, dir: 0 }), warm: 2 },
  // stand, start walking, break into a run, back to a walk, stop
  loco: { seconds: 11, input: (t) => (t < 1.5 ? { speed: 0, dir: null } : t < 4.5 ? { speed: WALK, dir: 0 } : t < 7.5 ? { speed: RUN, dir: 0 } : t < 9 ? { speed: WALK, dir: 0 } : { speed: 0, dir: null }) },
  // stand, reverse direction on the spot (the game pivots at up to 690 °/s), walk, a 90° corner, a reversal at a run
  turn: { seconds: 10, input: (t) => (t < 1 ? { speed: 0, dir: null } : t < 1.06 ? { speed: 0.01, dir: Math.PI } : t < 2.2 ? { speed: 0, dir: null } : t < 4 ? { speed: WALK, dir: Math.PI } : t < 6 ? { speed: WALK, dir: Math.PI / 2 } : t < 8 ? { speed: RUN, dir: -Math.PI / 2 } : { speed: 0, dir: null }) },
};

SCENARIOS.pivot = { seconds: 5, input: (t) => (t >= 0.5 && t < 0.8 ? { speed: 0.01, dir: Math.PI } : t >= 2.5 && t < 2.75 ? { speed: 0.01, dir: Math.PI / 2 } : { speed: 0, dir: null }) }; // half turn and quarter turn on the spot

function scenario() {
  const name = Q.get('scenario') || 'loco';
  if (name.startsWith('clip:')) return { name, seconds: Number(Q.get('seconds')) || 4, input: () => ({ speed: 0, dir: null, clip: name.slice(5) }) };
  return { name, ...(SCENARIOS[name] || SCENARIOS.loco) };
}

const VIEW = {
  side: { dir: [1, 0.06, 0], dist: 3.9, fov: 30, h: 0.95 },
  front: { dir: [0.45, 0.16, 1], dist: 3.9, fov: 30, h: 0.95 },
  back: { dir: [-0.3, 0.22, -1], dist: 4.6, fov: 30, h: 1.0 },
  front0: { dir: [0, 0.08, 1], dist: 3.9, fov: 30, h: 0.95 },
  feetfront: { dir: [0, 0.12, 1], dist: 1.9, fov: 30, h: 0.3 },
  top: { dir: [0.001, 1, 0.001], dist: 6, fov: 30, h: 0.2 },
  feet: { dir: [1, 0.1, 0.25], dist: 2.0, fov: 30, h: 0.25 },
  game: { dir: [-0.25, 0.42, -1], dist: 5.6, fov: 42, h: 1.2 }, // roughly the third-person game camera behind her
};

function checker() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#59635d' : '#6d7871'; g.fillRect(x * 128, y * 128, 128, 128); }
  g.strokeStyle = '#3a423d'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(200, 200); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

let sidecarLoader = null;
async function loadClips(url) {
  sidecarLoader ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await sidecarLoader.loadAsync(url);
  const extras = (gltf.parser.json.animations || []).map((x) => x.extras || {});
  gltf.animations.forEach((c, i) => { c.userData = { ...extras[i] }; });   // speed, contact intervals
  return gltf.animations;
}

class Subject {
  constructor(tag, name, clipsUrl, runtime, x) {
    Object.assign(this, { tag, name, clipsUrl, runtime, x });
    this.root = new THREE.Group(); this.root.position.set(x, 0, 0);
    this.motion = createMotion(0);
    this.track = [];
  }

  async load(scene) {
    const { gltf } = await fetchGltf(this.name);
    const model = cloneSkinned(gltf.scene);
    upgradeAssetMaterials(this.name, model);
    if (this.name === 'agent_iris') { tuneHairCards(model); fabricSheen(model); }
    model.traverse((o) => { if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false; if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.model = model; this.root.add(model); scene.add(this.root);
    const extra = this.clipsUrl === 'townsfolk' ? await townsfolkClips(model, { key: this.name, body: Q.get('body') || 'adult' }) : this.clipsUrl ? await loadClips(this.clipsUrl) : [];
    this.clips = mergeClips(gltf.animations, extra);
    for (const [as, q] of [['walk', 'walkclip'], ['run', 'runclip']]) {   // e.g. walkclip=elder_walk: that clip drives the gait
      const c = Q.get(q) && this.clips.find((x) => x.name === Q.get(q));
      if (c) { const k = c.clone(); k.name = as; k.userData = c.userData; this.clips = [...this.clips.filter((x) => x.name !== as), k]; }
    }
    this.mixer = new THREE.AnimationMixer(model);
    const face = extra.length ? faceLayerClip(gltf.animations) : null;
    if (face) this.mixer.clipAction(face).play();
    const Rt = this.runtime === 'v2' && gaitModule.Locomotion ? gaitModule.Locomotion : null;
    this.loco = Rt ? new Rt(this.mixer, this.clips, model) : null;
    this.gait = Rt ? null : new GaitLayer(this.mixer, this.clips);
    const idle = resolveClip(this.clips, 'idle').clip;
    this.idle = !Rt && idle ? this.mixer.clipAction(idle) : null;
    if (this.idle) this.idle.play();
    this.plant = Q.get('plant') === '0' ? null : new FootPlant(model);
    this.feet = ['foot_L', 'foot_R', 'toe_L', 'toe_R'].map((n) => model.getObjectByName(n)).filter(Boolean);
    this.clipNames = this.clips.map((c) => c.name);
    // the sole's contact points (under the ball joint and under the heel) in each foot bone's space, from the rest pose
    this.soles = [];
    if (this.feet.length === 4) {
      this.root.updateMatrixWorld(true);
      for (const i of [0, 1]) {
        const foot = this.feet[i], toe = this.feet[i + 2], a = foot.getWorldPosition(new THREE.Vector3()), t = toe.getWorldPosition(new THREE.Vector3());
        const back = new THREE.Vector3(a.x - (t.x - a.x) * 0.3, 0, a.z - (t.z - a.z) * 0.3);
        this.soles.push({ foot, ball: foot.worldToLocal(new THREE.Vector3(t.x, 0, t.z)), heel: foot.worldToLocal(back) });
      }
    }
    this.soleTrack = []; this.phases = [];
  }

  step(input, t) {
    const wish = input.dir == null ? [0, 0] : [Math.sin(input.dir), Math.cos(input.dir)];
    const before = this.motion.heading;
    // walk=clip / run=clip: the scenario moves at the speed the clip was built (and retargeted) for
    const ref = this.gait && Q.get('walk') === 'clip' ? (input.speed > WALK ? this.gait.runRef : this.gait.walkRef) : 0;
    stepMotion(this.motion, wish, ref || input.speed || WALK, DT, DEFAULT_MOTION, true);
    this.root.position.x += this.motion.vel[0] * DT; this.root.position.z += this.motion.vel[1] * DT;
    this.root.rotation.y = this.motion.heading;
    const speed = Math.hypot(this.motion.vel[0], this.motion.vel[1]);
    const turnRate = (this.motion.heading - before) / DT;
    if (this.loco) this.loco.update(DT, { speed, turnRate, heading: this.motion.heading, clip: input.clip || null, t });
    else {
      const move = this.gait.update(DT, speed);
      if (input.clip && (!this.one || this.one.getClip().name !== input.clip)) {
        const c = resolveClip(this.clips, input.clip).clip;
        if (c) { this.one = this.mixer.clipAction(c); this.one.reset().play(); if (Q.get('once')) { this.one.setLoop(THREE.LoopOnce, 1); this.one.clampWhenFinished = true; } }
      }
      if (this.one) this.one.weight = 1 - move;
      if (this.idle) this.idle.weight = this.one ? 0 : 1 - move;
      this.mixer.update(DT);
      if (this.plant) this.plant.update(DT, this.root, move);
    }
    this.root.updateMatrixWorld(true);
    this.measure();
    return { speed, heading: this.motion.heading, weights: this.gait ? { ...this.gait.weights } : this.loco.debug ? this.loco.debug() : {} };
  }

  /** Records the balls of the feet (toe bone heads) each frame; `slipStats` turns them into the slip numbers. */
  measure() {
    if (this.feet.length === 4) this.track.push([2, 3].map((i) => this.feet[i].getWorldPosition(new THREE.Vector3())));
    if (this.soles.length) this.phases.push(this.gait ? [this.gait.phase, this.gait.weights.walk, this.gait.weights.run] : [0, 0, 0]);
    if (this.soles.length) this.soleTrack.push(this.soles.map((s) => [s.foot.localToWorld(s.ball.clone()), s.foot.localToWorld(s.heel.clone())]));
  }

  /** Foot slip: horizontal speed of a ball of the foot over the ground while it is planted (within 1 cm of its lowest height). */
  slipStats() {
    const v = [];
    for (const f of [0, 1]) {
      const low = Math.min(...this.track.map((fr) => fr[f].y));
      for (let i = 1; i < this.track.length; i++) {
        const a = this.track[i - 1][f], b = this.track[i][f];
        if (a.y - low < 0.01 && b.y - low < 0.01) v.push(Math.hypot(b.x - a.x, b.z - a.z) / DT);
      }
    }
    // every frame's speed of each ball of the foot: a foot that really stands has its slowest 30 % of frames near zero
    const all = [];
    for (const f of [0, 1]) for (let i = 1; i < this.track.length; i++) { const a = this.track[i - 1][f], b = this.track[i][f]; all.push(Math.hypot(b.x - a.x, b.z - a.z) / DT); }
    all.sort((x, y) => x - y);
    const stance = all.slice(0, Math.floor(all.length * 0.3));
    this.stance = +(stance.reduce((q, x) => q + x, 0) / (stance.length || 1)).toFixed(3);
    // the sole itself: the lower of the ball and heel points while it is within 8 mm of the lowest it ever gets
    const sole = [];
    const floor = Math.min(...this.soleTrack.flatMap((fr) => fr.flatMap((pt) => [pt[0].y, pt[1].y])), 1);
    for (const f of [0, 1]) for (let i = 1; i < this.soleTrack.length; i++) {
      const a = this.soleTrack[i - 1][f], b = this.soleTrack[i][f], k = b[0].y <= b[1].y ? 0 : 1;
      if (a[k].y - floor < 0.008 && b[k].y - floor < 0.008) sole.push(Math.hypot(b[k].x - a[k].x, b[k].z - a[k].z) / DT);
    }
    const minY = (k) => +Math.min(...this.soleTrack.flatMap((fr) => fr.map((pt) => pt[k].y))).toFixed(3);
    this.sole = { ball_min_y: minY(0), heel_min_y: minY(1), samples: sole.length, mean: +(sole.reduce((q, x) => q + x, 0) / (sole.length || 1)).toFixed(3), max: +(Math.max(0, ...sole)).toFixed(3) };
    // the same inside the clip's own planted intervals (userData.contact, fractions of the stride), one key inside each end:
    // this is the slip of a foot that is meant to stand, without the frames in which it lands or leaves
    const planted = [];
    for (const [name, wi] of [['walk', 1], ['run', 2]]) {
      const c = this.clips.find((x) => x.name === name), ct = c && c.userData && c.userData.contact;
      if (!ct) continue;
      ['L', 'R'].forEach((side, f) => { const [s0, len] = ct[side], pad = 0.012;
        for (let i = 1; i < this.soleTrack.length; i++) {
          if (this.phases[i][wi] < 0.98 || this.phases[i - 1][wi] < 0.98) continue;
          const inside = (ph) => { const u = ((ph - s0) % 1 + 1) % 1; return u > pad && u < len - pad; };
          if (!inside(this.phases[i][0]) || !inside(this.phases[i - 1][0])) continue;
          const a = this.soleTrack[i - 1][f], b = this.soleTrack[i][f], k = b[0].y <= b[1].y ? 0 : 1;
          planted.push(Math.hypot(b[k].x - a[k].x, b[k].z - a[k].z) / DT);
        } });
    }
    this.planted = { samples: planted.length, mean: +(planted.reduce((q, x) => q + x, 0) / (planted.length || 1)).toFixed(3), max: +(Math.max(0, ...planted)).toFixed(3) };
    v.sort((x, y) => x - y);
    const mean = v.reduce((s, x) => s + x, 0) / (v.length || 1);
    return { planted_slip_mean_m_s: this.planted.mean, planted_slip_max_m_s: this.planted.max, planted_frames: this.planted.samples, sole_ball_min_y: this.sole.ball_min_y, sole_heel_min_y: this.sole.heel_min_y, sole_slip_mean_m_s: this.sole.mean, sole_slip_max_m_s: this.sole.max, sole_samples: this.sole.samples, stance_speed_m_s: this.stance, planted_samples: v.length, slip_mean_m_s: +mean.toFixed(3), slip_p95_m_s: +(v[Math.floor(v.length * 0.95)] || 0).toFixed(3), slip_max_m_s: +(v[v.length - 1] || 0).toFixed(3) };
  }
}

async function main() {
  const app = document.getElementById('app'), hud = document.getElementById('hud');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  app.append(renderer.domElement);
  configureTextureSupport(renderer);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#aab6b0');
  scene.add(new THREE.HemisphereLight('#f4f7ff', '#59605a', 1.15));
  const sun = new THREE.DirectionalLight('#fff3dd', 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 30 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: checker(), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const sc = scenario();
  const subjects = [new Subject('A', Q.get('a') || 'agent_iris', Q.get('aclips'), Q.get('art') || 'v1', 0)];
  if (Q.get('b')) subjects.push(new Subject('B', Q.get('b'), Q.get('bclips'), Q.get('brt') || 'v1', 60));
  await Promise.all(subjects.map((s) => s.load(scene)));
  const views = (Q.get('views') || 'side,front').split(',').filter((v) => VIEW[v]);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const labels = document.getElementById('labels');
  const names = { A: Q.get('alabel') || subjects[0].name + (subjects[0].clipsUrl ? ' + ' + subjects[0].clipsUrl.split('/').pop() : ''), B: subjects[1] ? Q.get('blabel') || subjects[1].name + (subjects[1].clipsUrl ? ' + ' + subjects[1].clipsUrl.split('/').pop() : '') : '' };
  subjects.forEach((s, r) => { const d = document.createElement('div'); d.className = 'tag'; d.style.left = '10px'; d.style.top = (r * innerHeight / subjects.length + 10) + 'px'; d.textContent = names[s.tag]; labels.append(d); });

  let frame = -1; const states = [];
  const draw = () => {
    const W = innerWidth, H = innerHeight, cw = W / views.length, rh = H / subjects.length;
    renderer.setScissorTest(true);
    subjects.forEach((s, r) => views.forEach((vn, c) => {
      const v = VIEW[vn], p = s.root.position;
      const d = new THREE.Vector3(...v.dir).normalize().multiplyScalar(v.dist / ZOOM);
      if (vn === 'game') d.applyAxisAngle(new THREE.Vector3(0, 1, 0), s.root.rotation.y);
      cam.fov = v.fov; cam.aspect = cw / rh; cam.updateProjectionMatrix();
      cam.position.set(p.x + d.x, v.h * HSCALE + d.y, p.z + d.z); cam.lookAt(p.x, v.h * HSCALE, p.z);
      sun.position.set(p.x + 4, 9, p.z + 5); sun.target.position.set(p.x, 0, p.z); sun.target.updateMatrixWorld();
      renderer.setViewport(c * cw, H - (r + 1) * rh, cw, rh); renderer.setScissor(c * cw, H - (r + 1) * rh, cw, rh);
      renderer.render(scene, cam);
    }));
  };
  const advance = () => {
    frame++;
    const t = frame * DT, input = sc.input(t);
    const st = subjects.map((s) => s.step(input, t));
    states[frame] = st;
    hud.textContent = `${sc.name}  t=${t.toFixed(2)}s  frame ${frame}\n` + subjects.map((s, i) => `${s.tag}: v=${st[i].speed.toFixed(2)} m/s  ` + Object.entries(st[i].weights).map(([k, v]) => `${k} ${(+v).toFixed(2)}`).join('  ')).join('\n');
  };
  // warm-up: let steady scenarios reach speed before frame 0 (not measured)
  for (let i = 0; i < Math.round((sc.warm || 0) * FPS); i++) { const input = sc.input(0); subjects.forEach((s) => s.step(input, 0)); }
  subjects.forEach((s) => { s.track = []; s.soleTrack = []; s.phases = []; });
  const api = {
    fps: FPS, frames: Math.round(sc.seconds * FPS), clips: Object.fromEntries(subjects.map((s) => [s.tag, s.clipNames])),
    step(i) { while (frame < i) advance(); draw(); return states[i]; },
    metrics: () => Object.fromEntries(subjects.map((s) => [s.tag, s.slipStats()])),
  };
  api.step(0);
  if (Q.get('live')) { const loop = () => { api.step(frame + 1 >= api.frames ? frame : frame + 1); requestAnimationFrame(loop); }; loop(); }
  return api;
}

window.__anim = { ready: main().then((api) => { Object.assign(window.__anim, api); document.body.dataset.ready = '1'; return true; }).catch((e) => { document.getElementById('hud').textContent = 'failed: ' + e.message; console.error(e); document.body.dataset.ready = 'error'; throw e; }) };
