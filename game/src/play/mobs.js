// Monsters on the hillside outside the lower gate (MOB-001, art/mobs): packs that idle and wander near their home,
// notice Iris, chase, telegraph and attack, flinch when her casts land, die (hit-stop, the dissolve of
// render/mob-fx.js) and come back after a while. Never inside the walls: every position is clamped to the field
// beyond them (scenes/town-outside.js `onField`) and to the pack's leash.
//
// Two layers. `MobBrain` is pure (positions as arrays, no three.js): the state machine, damage and the leash, so the
// rules are node-tested. `createMobs` is the view: loads mob_*.glb (phone `_m` variants), drives the clips, the
// ground following, the telegraph rings, the Veilbell's seed, Iris's health and the hit feedback.
//
// Events: `ftf:mob-killed` on window, detail {type, pos: [x, y, z] world, elite} when a monster has fallen (its death
// clip has played and the dissolve starts) - the loot code turns it into a chest. `ftf:iris-down` when her health
// runs out (she is carried back to the gate with full health).
import { onField } from '../scenes/town-outside.js';
import { CASTS } from '../scenes/town-casting-fx.js';

/** Per type: health, speeds (m/s, matched to the clips: art/mobs/mobs.json), ranges (m), attack timing. */
export const MOB_TYPES = Object.freeze({
  skitter: Object.freeze({ hp: 30, walk: 0.9, run: 1.8, radius: 0.35, aggro: 9, attack: 1.0, damage: 6, windup: 0.8, impact: 0.45, cooldown: 1.2, stagger: true }),
  hulker: Object.freeze({ hp: 160, walk: 1.25, run: 2.6, radius: 0.9, aggro: 11, attack: 2.4, damage: 22, windup: 1.4, impact: 0.58, cooldown: 2.2, stagger: true }),
  veilbell: Object.freeze({ hp: 60, walk: 1.0, run: 1.9, radius: 0.5, aggro: 14, attack: 9.0, damage: 12, windup: 1.5, impact: 0.75, cooldown: 2.6, stagger: true, ranged: true }),
  crownrift: Object.freeze({ hp: 320, walk: 1.6, run: 3.4, radius: 1.3, aggro: 13, attack: 3.0, damage: 30, windup: 1.6, impact: 0.55, cooldown: 2.4, stagger: false, elite: true }),
});

/** Packs: type, count (phone count), home in town-local metres (x, z), respawn seconds after the last one fell. */
export const PACKS = Object.freeze([
  { type: 'skitter', count: 4, phone: 3, home: [-12, 52], respawn: 30 },      // the first fight, just off the road
  { type: 'skitter', count: 4, phone: 3, home: [-30, 66], respawn: 35 },      // on the casting field
  { type: 'veilbell', count: 2, phone: 1, home: [36, 66], respawn: 45 },      // the bend terrace
  { type: 'hulker', count: 1, phone: 1, home: [16, 79], respawn: 60 },        // below the second bend
  { type: 'skitter', count: 3, phone: 2, home: [-16, 87], respawn: 35 },
  { type: 'crownrift', count: 1, phone: 1, home: [12, 102], respawn: 120 },   // the elite on the lookout
]);

export const LEASH = 16;            // a monster never strays further than this from its pack's home
export const WANDER = 4.5;          // idle wander radius
export const IRIS_HP = 100;
export const STAGGER_SECONDS = 0.45;
export const SNARE_ROOT_SECONDS = 1.6;
export const HIT_STOP_SECONDS = 0.07;
export const CAST_DAMAGE = Object.freeze({ lance: 40, snare: 25 });
const LANCE_SPEED = 20;             // the fracture front of the Frost Lance (m/s): a monster far along the line is hit later
const SNARE_DELAY = 0.35;           // the leash reaches the point, the ring snaps open

/** Deterministic PRNG (mulberry32): the same seed wanders the same way (QA, replays). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Lance: distance of p from the segment start along dir (unit [x, z]) and across it. */
export function alongLine(from, dir, p) {
  const dx = p[0] - from[0], dz = p[2] - from[2];
  return { along: dx * dir[0] + dz * dir[1], across: Math.abs(dx * dir[1] - dz * dir[0]) };
}

/**
 * The pure state machine. Positions are world [x, y, z]; `origin` is the town origin (town-local = world - origin).
 * States: idle (wander), chase, windup (the telegraph, then the impact), recover, stagger, dead, gone (waiting to
 * respawn). `step` returns the events of the step: {kind: 'attack'|'impact'|'shot'|'hit'|'death'|'killed'|'respawn', mob}.
 */
export class MobBrain {
  constructor({ origin = [0, 0, 0], phone = false, seed = 7, packs = PACKS } = {}) {
    this.origin = origin; this.rand = rng(seed); this.mobs = []; this.pending = []; this.packs = [];
    for (const [pi, p] of packs.entries()) {
      const pack = { ...p, index: pi, home: [origin[0] + p.home[0], origin[1], origin[2] + p.home[1]], timer: -1 };
      this.packs.push(pack);
      const n = phone ? p.phone : p.count;
      for (let k = 0; k < n; k++) this.mobs.push(this.spawn(pack, k, n));
    }
  }

  spawn(pack, k, n) {
    const T = MOB_TYPES[pack.type], a = (k / Math.max(1, n)) * Math.PI * 2 + this.rand() * 0.8, r = n > 1 ? 1.2 + this.rand() * 1.5 : 0;
    const pos = [pack.home[0] + Math.cos(a) * r, pack.home[1], pack.home[2] + Math.sin(a) * r];
    return { id: `${pack.type}${pack.index}_${k}`, type: pack.type, pack, T, hp: T.hp, pos, heading: this.rand() * Math.PI * 2, state: 'idle',
      t: 0, goal: null, cooldown: 0, root: 0, speed: 0, struckAt: 0, freeze: 0, target: null };
  }

  /** Town-local check: a world point lies on the field beyond the walls. */
  outside(p) { return onField(p[0] - this.origin[0], p[2] - this.origin[2]); }

  /** Damage to one monster (from a cast). */
  damage(m, amount, events, { root = 0 } = {}) {
    if (m.state === 'dead' || m.state === 'gone') return;
    m.hp -= amount; m.freeze = HIT_STOP_SECONDS; m.root = Math.max(m.root, root);
    events.push({ kind: 'hit', mob: m, amount });
    if (m.hp <= 0) { m.hp = 0; m.state = 'dead'; m.t = 0; events.push({ kind: 'death', mob: m }); return; }
    if (m.state === 'idle') m.state = 'chase';                                   // a hit always draws it in
    if (m.T.stagger && m.state !== 'windup') { m.state = 'stagger'; m.t = 0; }
    else if (m.T.stagger && m.state === 'windup' && m.t < m.T.windup * m.T.impact * 0.6) { m.state = 'stagger'; m.t = 0; }   // interrupted early in the telegraph
  }

  /** Iris's cast left her hands: queue its hits ({id, from, dir [x, z], point}). */
  cast({ id, from, dir, point }) {
    if (id === 'lance') {
      const c = CASTS.lance;
      for (const m of this.mobs) {
        if (m.state === 'dead' || m.state === 'gone') continue;
        const { along, across } = alongLine(from, dir, m.pos);
        if (along > -m.T.radius && along < c.range + m.T.radius && across < c.width / 2 + m.T.radius) this.pending.push({ at: Math.max(0, along) / LANCE_SPEED, mob: m, amount: CAST_DAMAGE.lance, root: 0 });
      }
    } else if (id === 'snare') {
      const c = CASTS.snare;
      for (const m of this.mobs) {
        if (m.state === 'dead' || m.state === 'gone') continue;
        if (dist2(m.pos, point) < c.radius + m.T.radius) this.pending.push({ at: SNARE_DELAY, mob: m, amount: CAST_DAMAGE.snare, root: SNARE_ROOT_SECONDS });
      }
    }
  }

  /**
   * One step. `iris` {pos, alive, outside}. `ground(x, z, nearY)` gives the ground height. Returns events.
   */
  step(dt, iris, ground = (x, z, y) => y) {
    const ev = [];
    for (const p of this.pending) p.at -= dt;
    for (const p of this.pending.filter((q) => q.at <= 0)) this.damage(p.mob, p.amount, ev, { root: p.root });
    this.pending = this.pending.filter((q) => q.at > 0);
    for (const m of this.mobs) this.think(m, dt, iris, ground, ev);
    for (const pack of this.packs) {                                             // a pack comes back after its last one fell
      const mine = this.mobs.filter((m) => m.pack === pack);
      if (mine.every((m) => m.state === 'gone')) {
        if (pack.timer < 0) pack.timer = pack.respawn;
        pack.timer -= dt;
        const near = iris && iris.alive && dist2(iris.pos, pack.home) < 12;   // never under her nose
        if (pack.timer <= 0 && !near) {
          pack.timer = -1;
          mine.forEach((m, k) => { const fresh = this.spawn(pack, k, mine.length); Object.assign(m, fresh, { id: m.id }); m.pos[1] = ground(m.pos[0], m.pos[2], pack.home[1]); ev.push({ kind: 'respawn', mob: m }); });
        }
      }
    }
    return ev;
  }

  think(m, dt, iris, ground, ev) {
    if (m.state === 'gone') return;
    if (m.freeze > 0) { m.freeze -= dt; return; }                                // hit-stop
    m.t += dt; m.cooldown = Math.max(0, m.cooldown - dt); m.root = Math.max(0, m.root - dt);
    const T = m.T, home = m.pack.home;
    const sees = iris && iris.alive && iris.outside && dist2(iris.pos, m.pos) < T.aggro && dist2(iris.pos, home) < LEASH + T.attack;
    m.speed = 0;
    switch (m.state) {
      case 'dead':                                                                   // the view reports the end of the death clip
        if (m.t >= 3) this.fallen(m, ev);                                            // (or, without a view, after 3 s)
        return;
      case 'stagger':
        if (m.t >= STAGGER_SECONDS) { m.state = 'chase'; m.t = 0; }
        return;
      case 'windup': {
        if (iris) m.heading = turn(m.heading, Math.atan2(iris.pos[0] - m.pos[0], iris.pos[2] - m.pos[2]), dt * 3);
        const hitAt = T.windup * T.impact;
        if (m.t >= hitAt && !m.struck) {
          m.struck = true;
          if (T.ranged) ev.push({ kind: 'shot', mob: m, to: iris ? iris.pos.slice() : null });
          else ev.push({ kind: 'impact', mob: m, hit: !!(iris && iris.alive && dist2(iris.pos, m.pos) < T.attack + 0.6 && facing(m, iris.pos)) });
        }
        if (m.t >= T.windup) { m.state = 'recover'; m.t = 0; m.cooldown = T.cooldown; }
        return;
      }
      case 'recover':
        if (m.t >= 0.3) { m.state = sees ? 'chase' : 'idle'; m.t = 0; m.goal = null; }
        return;
      case 'chase': {
        if (!sees) { m.state = 'idle'; m.t = 0; m.goal = home.slice(); break; }   // she left: walk home
        const d = dist2(iris.pos, m.pos);
        m.heading = turn(m.heading, Math.atan2(iris.pos[0] - m.pos[0], iris.pos[2] - m.pos[2]), dt * 6);
        if (d <= T.attack && m.cooldown <= 0) { m.state = 'windup'; m.t = 0; m.struck = false; ev.push({ kind: 'attack', mob: m }); return; }
        if (d > T.attack * 0.85 && m.root <= 0) this.move(m, T.run, dt, ground);
        return;
      }
      default: break;
    }
    // idle: wander near home, aggro when she comes close
    if (sees) { m.state = 'chase'; m.t = 0; return; }
    if (!m.goal || (m.t > 3 && this.rand() < dt * 0.5)) {
      const a = this.rand() * Math.PI * 2, r = this.rand() * WANDER;
      m.goal = [home[0] + Math.cos(a) * r, home[1], home[2] + Math.sin(a) * r]; m.t = 0;
    }
    if (dist2(m.goal, m.pos) > 0.4 && m.root <= 0) {
      m.heading = turn(m.heading, Math.atan2(m.goal[0] - m.pos[0], m.goal[2] - m.pos[2]), dt * 3);
      this.move(m, T.walk * (dist2(m.pos, home) > LEASH * 0.8 ? 1.4 : 1), dt, ground);
    }
  }

  move(m, speed, dt, ground) {
    const nx = m.pos[0] + Math.sin(m.heading) * speed * dt, nz = m.pos[2] + Math.cos(m.heading) * speed * dt;
    const home = m.pack.home, dh = Math.hypot(nx - home[0], nz - home[2]);
    if (dh > LEASH || !this.outside([nx, 0, nz])) return;                         // the leash and the walls hold it
    for (const o of this.mobs) {                                                  // do not walk into a pack mate
      if (o === m || o.state === 'gone' || o.state === 'dead') continue;
      if (Math.hypot(nx - o.pos[0], nz - o.pos[2]) < (m.T.radius + o.T.radius) * 0.9 && Math.hypot(nx - o.pos[0], nz - o.pos[2]) < dist2(m.pos, o.pos)) return;
    }
    m.pos[0] = nx; m.pos[2] = nz; m.pos[1] = ground(nx, nz, m.pos[1]); m.speed = speed;
  }

  /** The view has played the death clip out: the monster becomes `gone` (dissolving) and the kill is reported. */
  fallen(m, ev) { if (m.state === 'dead') { m.state = 'gone'; ev.push({ kind: 'killed', mob: m }); } }
}

function turn(h, want, k) {
  let d = want - h; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return h + d * Math.min(1, k);
}
function facing(m, p) {
  const a = Math.atan2(p[0] - m.pos[0], p[2] - m.pos[2]); let d = a - m.heading;
  while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < 1.1;
}

/* ------------------------------------------------------------------ the view */

const CSS = `
.ftf-hp { position: absolute; left: 50%; top: calc(14px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); width: min(240px, 50vw); height: 10px; border-radius: 6px; background: rgba(10,12,16,.6); box-shadow: 0 0 0 1px rgba(255,255,255,.18); overflow: hidden; z-index: 6; pointer-events: none; }
.ftf-hp[hidden] { display: none; }
.ftf-hp > i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #e2584f, #f0a15a); transition: width .2s ease; }
.ftf-hp.ftf-hurt { animation: ftf-hp-shake .25s; }
@keyframes ftf-hp-shake { 25% { transform: translateX(calc(-50% - 4px)); } 75% { transform: translateX(calc(-50% + 4px)); } }
.ftf-hurt-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 4; box-shadow: inset 0 0 120px 30px rgba(200, 30, 20, .55); opacity: 0; transition: opacity .35s ease; }
.ftf-hurt-vignette.on { opacity: 1; transition: none; }
@media (prefers-reduced-motion: reduce) { .ftf-hp.ftf-hurt { animation: none; } .ftf-hp > i { transition: none; } }
`;

/**
 * @param {object} o
 * @param {object} o.THREE three.js namespace (passed in so the brain stays node-testable without it)
 * @param {THREE.Scene} o.scene @param {object} o.town scenes/town.js handle (world, origin) @param {object} o.player
 * @param {(name: string) => Promise<{gltf}>} o.load glTF by model name (render/assets.js prefetchGltf)
 * @param {(o: THREE.Object3D) => THREE.Object3D} o.clone SkeletonUtils.clone
 * @param {class} o.MobFx render/mob-fx.js @param {object} o.glow MOB_GLOW
 * @param {(x: number, z: number, nearY: number) => number} o.ground ground height under a world point
 * @param {string} [o.variant] '_m' on phones @param {boolean} [o.phone] fewer monsters, cheaper updates
 * @param {() => boolean} [o.reduced] reduced motion
 * @param {(kind: string) => void} [o.onFeedback] 'hurt' | 'down' | 'kill' (sound cues)
 * @param {number[]} [o.respawn] where Iris is carried when her health runs out (world)
 */
export function createMobs({ THREE, scene, origin, player, load, clone, MobFx, glow, ground, variant = '', phone = false, reduced = () => false, onFeedback = null,
  respawn = null, doc = globalThis.document, win = globalThis.window, seed = 7 }) {
  const brain = new MobBrain({ origin, phone, seed });
  const group = new THREE.Group(); group.name = 'mobs'; scene.add(group);
  const views = new Map(), templates = {};
  const iris = { pos: player.pos, alive: true, outside: false, hp: IRIS_HP, hurtT: 0 };
  const shots = [];
  let disposed = false;

  if (doc && !doc.getElementById('ftf-mobs-style')) { const st = doc.createElement('style'); st.id = 'ftf-mobs-style'; st.textContent = CSS; doc.head.append(st); }
  const hpEl = doc ? doc.createElement('div') : null, hpFill = doc ? doc.createElement('i') : null, vignette = doc ? doc.createElement('div') : null;
  if (doc) {
    hpEl.className = 'ftf-hp'; hpEl.hidden = true; hpEl.setAttribute('role', 'meter'); hpEl.setAttribute('aria-label', 'Health'); hpEl.setAttribute('aria-valuemin', '0'); hpEl.setAttribute('aria-valuemax', String(IRIS_HP));
    hpEl.append(hpFill); vignette.className = 'ftf-hurt-vignette'; doc.body.append(hpEl, vignette);
  }
  const ringGeo = new THREE.RingGeometry(0.75, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.0, depthWrite: false });
  const seedGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const seedMat = new THREE.MeshBasicMaterial({ color: 0x9ff5ea });

  const names = [...new Set(brain.mobs.map((m) => m.type))];
  const ready = Promise.all(names.map((n) => load('mob_' + n + variant).catch(() => load('mob_' + n)).then(({ gltf }) => { templates[n] = gltf; }))).then(() => {
    if (disposed) return;
    for (const m of brain.mobs) attach(m);
  }).catch((e) => console.warn('[mobs] models unavailable', e));

  function attach(m) {
    const g = templates[m.type]; if (!g) return;
    const model = clone(g.scene);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = !phone; o.frustumCulled = true; } });
    const holder = new THREE.Group(); holder.add(model); group.add(holder);
    const mixer = new THREE.AnimationMixer(model);
    const clip = (n) => g.animations.find((c) => c.name === n || c.name.endsWith('|' + n) || c.name.endsWith(n));
    const actions = {};
    for (const n of ['idle', 'walk', 'run', 'attack', 'hit', 'death']) {
      const c = clip(n); if (!c) continue;
      const a = mixer.clipAction(c);
      if (n === 'attack' || n === 'hit' || n === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[n] = a;
    }
    const fx = new MobFx(holder, { edge: glow[m.type] });
    const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.visible = false; ring.renderOrder = 2; group.add(ring);
    const v = { model, holder, mixer, actions, fx, ring, current: null, oneShot: null };
    mixer.addEventListener('finished', (e) => { if (e.action === actions.death) { const ev = []; brain.fallen(m, ev); handle(ev); } if (e.action === v.oneShot) v.oneShot = null; });
    views.set(m, v); play(v, 'idle', 0);
    place(m, v);
  }

  function play(v, name, fade = 0.2) {
    const a = v.actions[name]; if (!a || v.current === a) return;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (v.current) v.current.crossFadeTo(a, fade, false);
    v.current = a;
  }

  function place(m, v) {
    v.holder.position.set(m.pos[0], m.pos[1], m.pos[2]); v.holder.rotation.y = m.heading;
  }

  function hurt(amount) {
    if (!iris.alive) return;
    iris.hp = Math.max(0, iris.hp - amount); iris.hurtT = 0.3;
    if (hpEl) { hpFill.style.width = (100 * iris.hp / IRIS_HP).toFixed(1) + '%'; hpEl.setAttribute('aria-valuenow', String(Math.round(iris.hp))); hpEl.classList.remove('ftf-hurt'); void hpEl.offsetWidth; hpEl.classList.add('ftf-hurt'); }
    if (vignette && !reduced()) { vignette.classList.add('on'); setTimeout(() => vignette.classList.remove('on'), 60); }
    if (onFeedback) onFeedback('hurt');
    if (iris.hp <= 0) {
      iris.alive = false; if (onFeedback) onFeedback('down');
      if (win) win.dispatchEvent(new CustomEvent('ftf:iris-down', { detail: { pos: player.pos.slice() } }));
      setTimeout(() => { if (disposed) return; if (respawn) player.teleport(respawn.slice(), player.heading); iris.hp = IRIS_HP; iris.alive = true; if (hpFill) hpFill.style.width = '100%'; }, 1200);
    }
  }

  function handle(ev) {
    for (const e of ev) {
      const v = views.get(e.mob);
      if (e.kind === 'attack' && v) { if (v.actions.attack) { play(v, 'attack', 0.1); v.oneShot = v.actions.attack; } v.ring.visible = !e.mob.T.ranged; }
      else if (e.kind === 'impact') { if (v) v.ring.visible = false; if (e.hit) hurt(e.mob.T.damage); }
      else if (e.kind === 'shot' && e.to && v) {
        const s = new THREE.Mesh(seedGeo, seedMat); const from = new THREE.Vector3(); v.model.getObjectByName('seed')?.getWorldPosition(from);
        if (!from.lengthSq()) from.set(e.mob.pos[0], e.mob.pos[1] + 1, e.mob.pos[2]);
        s.position.copy(from); group.add(s);
        const to = new THREE.Vector3(e.to[0], e.to[1] + 1.0, e.to[2]);
        shots.push({ s, vel: to.clone().sub(from).normalize().multiplyScalar(9), life: 2.2, damage: e.mob.T.damage });
      }
      else if (e.kind === 'hit' && v) {
        v.fx.hit();
        if (e.mob.state === 'stagger' && v.actions.hit) { play(v, 'hit', 0.06); v.oneShot = v.actions.hit; }
        v.ring.visible = v.ring.visible && e.mob.state === 'windup';
      }
      else if (e.kind === 'death' && v) { v.ring.visible = false; play(v, 'death', 0.1); if (onFeedback) onFeedback('kill'); }
      else if (e.kind === 'killed') {
        if (v) v.fx.die();
        if (win) win.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: e.mob.type, pos: e.mob.pos.slice(), elite: !!e.mob.T.elite } }));
      }
      else if (e.kind === 'respawn' && v) {                                          // a fresh view: the dissolved one is thrown away
        group.remove(v.holder); group.remove(v.ring); views.delete(e.mob); attach(e.mob);
      }
    }
  }

  let acc = 0;
  return {
    brain, ready, group, iris,
    get hp() { return iris.hp; },
    /** Iris's cast (scenes/town-casting.js onFire). */
    cast(c) { brain.cast(c); },
    /**
     * @param {number} dt @param {boolean} active the town is shown and the player is in it (false: hidden, asleep)
     */
    update(dt, active) {
      group.visible = active;
      const outside = active && brain.outside(player.pos);
      if (hpEl) hpEl.hidden = !outside;
      if (!active) return;
      iris.pos = player.pos; iris.outside = outside;
      acc += dt;
      const stepDt = phone ? 1 / 20 : 0;                                              // phones think at 20 Hz
      if (acc < stepDt) return animate(dt);
      const sdt = Math.min(acc, 0.1); acc = 0;
      handle(brain.step(sdt, iris, ground));
      animate(dt);
    },
    dispose() {
      disposed = true; scene.remove(group);
      for (const v of views.values()) v.mixer.stopAllAction();
      if (hpEl) { hpEl.remove(); vignette.remove(); }
    },
  };

  function animate(dt) {
    for (const [m, v] of views) {
      const near = Math.hypot(m.pos[0] - player.pos[0], m.pos[2] - player.pos[2]) < (phone ? 45 : 70);
      v.holder.visible = near && !(m.state === 'gone' && v.fx.done);
      if (!v.holder.visible) continue;
      if (m.freeze <= 0) {
        if (!v.oneShot && m.state !== 'dead' && m.state !== 'gone') play(v, m.speed > m.T.walk * 1.2 ? 'run' : m.speed > 0 ? 'walk' : 'idle');
        if (v.current && m.speed > 0) v.current.timeScale = m.speed / (m.speed > m.T.walk * 1.2 ? m.T.run : m.T.walk);
        else if (v.current) v.current.timeScale = 1;
        v.mixer.update(dt);
      }
      v.fx.update(dt);
      place(m, v);
      if (v.ring.visible) {
        const k = Math.min(1, m.t / (m.T.windup * m.T.impact));
        v.ring.position.set(m.pos[0] + Math.sin(m.heading) * m.T.attack * 0.55, m.pos[1] + 0.06, m.pos[2] + Math.cos(m.heading) * m.T.attack * 0.55);
        v.ring.scale.setScalar(m.T.attack * 0.6 * (reduced() ? 1 : 0.6 + 0.4 * k));
        v.ring.material.opacity = 0.25 + 0.5 * k;
      }
    }
    for (const s of shots) {
      s.life -= dt; s.s.position.addScaledVector(s.vel, dt);
      const p = s.s.position;
      if (iris.alive && Math.hypot(p.x - player.pos[0], p.y - (player.pos[1] + 1.0), p.z - player.pos[2]) < 0.75) { hurt(s.damage); s.life = 0; }
      if (s.life <= 0) group.remove(s.s);
    }
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i].life <= 0) shots.splice(i, 1);
  }
}
