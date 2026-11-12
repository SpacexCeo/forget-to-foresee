// Monsters outside the walls and the chests they drop (night plan 12.11, "Loot chests from monsters"). A few moss
// critters (fauna_moss_critter: hop / idle / hide clips) roam the field below the lower gate. The two casts hit them
// (scenes/town-casting.js reports each release: the Frost Lance along its line, the Storm Snare in its circle); a
// beaten critter curls up and vanishes in a puff, and may leave a chest (art: assets/models/loot/chest_<tier>.glb)
// under a soft beam. Walking onto it picks it up into the chest bag (game/chests.js); it is opened from the inventory.
// Light, non-graphic. Loaded only once Iris first walks out of the gate. Visual and local: no engine, no chain.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { fetchGltfUrl } from '../render/assets.js';
import { TOWN_ORIGIN } from './town-layout.js';
import { onField } from './town-outside.js';
import { MONSTERS, castHits, spawnPoint } from './monster-rules.js';
import { rollDrop, chestTier } from '../game/chests.js';
import { cue } from '../audio/town-audio.js';
export { MONSTERS, castHits, spawnPoint };

const spriteMat = (tex, color, opacity = 1, additive = true) => new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {object} o.town (groundAt) @param {object} o.player (pos)
 * @param {object} o.bag the chest bag (game/chests.js) @param {(chest: object) => void} [o.onPickup]
 * @param {() => boolean} [o.critters] the moss critters roam only while this holds (the hillside packs, play/mobs.js,
 *   take over when they run: their kills drop chests through drop())
 * @param {boolean} [o.mobile] @param {string} [o.base] @param {() => number} [o.rand]
 */
export function createTownMonsters({ scene, town, player, bag, onPickup = () => {}, critters = () => true, mobile = false, base = (import.meta.env && import.meta.env.BASE_URL) || '/', rand = Math.random }) {
  const group = new THREE.Group(); group.name = 'town_monsters'; scene.add(group);
  const state = { loading: null, proto: null, clips: [], scale: 1, critters: [], chests: [], shots: [], kills: 0, puffs: [], t: 0 };
  const loader = new THREE.TextureLoader();
  const tex = (name) => { const t = loader.load(base + 'assets/vfx/loot/' + name); t.colorSpace = THREE.SRGBColorSpace; return t; };
  let sparkleTex = null, beamTex = null, ringTex = null, glowTex = null;
  const chestModels = new Map(); // tier -> Promise<gltf>
  const W = (x, z) => [x + TOWN_ORIGIN[0], 0, z + TOWN_ORIGIN[2]];
  const ground = (wx, wz, fallback) => { const y = town.groundAt ? town.groundAt(wx, wz) : null; return y == null ? fallback : y; };

  function textures() { if (!sparkleTex) { sparkleTex = tex('loot_sparkle.png'); beamTex = tex('loot_beam.png'); ringTex = tex('loot_ring.png'); glowTex = tex('loot_glow.png'); } }
  function load() {
    if (state.loading) return state.loading;
    textures();
    state.loading = fetchGltfUrl(base + 'assets/models/fauna_moss_critter.glb').then((g) => {
      state.proto = g.scene; state.clips = g.animations || [];
      const box = new THREE.Box3().setFromObject(g.scene); const h = box.max.y - box.min.y || 1;
      state.scale = MONSTERS.height / h; state.lift = -box.min.y * state.scale;
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      for (let i = 0; i < MONSTERS.count; i++) spawn();
    }).catch((e) => { console.warn('[monsters]', e); });
    return state.loading;
  }

  function spawn() {
    const irisL = [player.pos[0] - TOWN_ORIGIN[0], player.pos[2] - TOWN_ORIGIN[2]];
    const [x, z] = spawnPoint(rand, irisL);
    const root = cloneSkinned(state.proto); root.scale.setScalar(state.scale);
    root.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.userData.baseEmissive = o.material.emissive ? o.material.emissive.clone() : null; } });
    const w = W(x, z); const y = ground(w[0], w[2], TOWN_ORIGIN[1]);
    root.position.set(w[0], y + state.lift, w[2]); root.rotation.y = rand() * Math.PI * 2;
    group.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const act = (name) => { const c = state.clips.find((k) => k.name === name); return c ? mixer.clipAction(c) : null; };
    const c = { root, mixer, hop: act('hop'), idle: act('idle'), hide: act('hide'), hp: MONSTERS.hp, state: 'idle', timer: 1 + rand() * 2, target: null, flash: 0, vanish: 0, local: [x, z] };
    if (c.hide) { c.hide.setLoop(THREE.LoopOnce, 1); c.hide.clampWhenFinished = true; }
    if (c.idle) c.idle.play();
    state.critters.push(c);
    return c;
  }

  function play(c, name) {
    const next = c[name]; if (!next || c.playing === next) return;
    if (c.playing) c.playing.fadeOut(0.18);
    next.reset().fadeIn(0.18).play(); c.playing = next;
  }

  function puff(at) {
    if (!sparkleTex) return;
    const parts = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(spriteMat(sparkleTex, i % 3 ? 0xbff5e8 : 0xffd27a)); s.scale.setScalar(0.18 + rand() * 0.16);
      s.position.set(at[0], at[1] + 0.3, at[2]); group.add(s);
      const a = rand() * Math.PI * 2, v = 0.8 + rand() * 1.4;
      parts.push({ s, v: [Math.cos(a) * v, 1 + rand() * 1.6, Math.sin(a) * v] });
    }
    state.puffs.push({ parts, t: 0 });
  }

  function chestModel(tier) {
    if (!chestModels.has(tier)) chestModels.set(tier, fetchGltfUrl(base + 'assets/models/loot/chest_' + tier + '.glb').catch(() => null));
    return chestModels.get(tier);
  }

  function dropChest(at) {
    const tier = chestTier(rand());
    const ch = { tier, at: [at[0], at[1], at[2]], root: new THREE.Group(), t: 0, picked: 0, ready: false };
    ch.root.position.set(at[0], at[1], at[2]); ch.root.rotation.y = rand() * Math.PI * 2; group.add(ch.root);
    const color = tier === 'legendary' ? 0xffb43c : tier === 'rare' ? 0x2fd0bd : 0xf0d9a0;
    // normal blending: an additive beam vanishes against the bright sky over the cloud sea
    ch.beam = new THREE.Sprite(spriteMat(beamTex, color, 0.85, false)); ch.beam.scale.set(1.1, 4.2, 1); ch.beam.position.y = 2.1; ch.root.add(ch.beam);
    // an additive core inside the beam and a soft halo at its foot: readable at fight distance over the bright haze
    ch.core = new THREE.Sprite(spriteMat(beamTex, 0xffffff, 0.9, true)); ch.core.scale.set(0.45, 5.2, 1); ch.core.position.y = 2.6; ch.root.add(ch.core);
    ch.halo = new THREE.Sprite(spriteMat(glowTex, color, 0.8, true)); ch.halo.scale.set(2.6, 2.6, 1); ch.halo.position.y = 0.6; ch.root.add(ch.halo);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ch.root.add(ring); ch.ring = ring;
    chestModel(tier).then((g) => {
      if (!g || ch.picked) return;
      const m = cloneSkinned(g.scene); m.scale.setScalar(1.4); m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); // a little larger than life: read from the town camera
      ch.root.add(m); ch.model = m; ch.ready = true;
    });
    state.chests.push(ch);
    cue('ui_notify');
  }

  function damage(c, amount) {
    if (c.state === 'dying' || c.state === 'gone') return;
    c.hp -= amount; c.flash = 0.25;
    const p = c.root.position;
    const away = Math.atan2(p.x - player.pos[0], p.z - player.pos[2]);
    c.knock = { x: Math.sin(away) * 2.2, z: Math.cos(away) * 2.2, t: 0.22 };
    cue('bid_tick');
    if (c.hp <= 0) {
      c.state = 'dying'; c.vanish = 0; if (c.hide) play(c, 'hide');
      state.kills++;
      const at = [p.x, ground(p.x, p.z, p.y - state.lift), p.z];
      setTimeout(() => puff(at), 380);
      if (rollDrop(rand(), state.kills - 1)) setTimeout(() => dropChest(at), 520);
      setTimeout(() => { group.remove(c.root); state.critters = state.critters.filter((x) => x !== c); }, 900);
      setTimeout(() => { if (state.proto) spawn(); }, MONSTERS.respawn * 1000);
    } else { c.state = 'flee'; c.timer = 0.9; }
  }

  return {
    group,
    get kills() { return state.kills; }, get critters() { return state.critters; }, get chests() { return state.chests; },
    /** A cast left Iris's hands (town-casting onCast): it lands after its flight. */
    cast(id, shot) {
      if (!state.proto || !shot || !shot.point) return;
      state.shots.push({ id, from: shot.from, point: shot.point, at: state.t + (id === 'snare' ? 0.32 : 0.2) });
    },
    /** A monster of the hillside packs fell (play/mobs.js 'ftf:mob-killed'): maybe a chest; an elite always drops one. */
    drop(pos, elite = false) {
      if (!pos) return false;
      textures();
      const n = state.kills++;
      if (!(elite || rollDrop(rand(), n))) return false;
      const at = [pos[0], ground(pos[0], pos[2], pos[1]), pos[2]];
      setTimeout(() => puff(at), 200); setTimeout(() => dropChest(at), 450);
      return true;
    },
    /** Per frame. */
    update(dt, reducedMotion = false) {
      state.t += dt;
      const lx = player.pos[0] - TOWN_ORIGIN[0], lz = player.pos[2] - TOWN_ORIGIN[2];
      if (!state.loading && onField(lx, lz) && critters()) load();
      if (state.proto) this.critterStep(dt);
      this.chestStep(dt, reducedMotion);
    },
    /** The moss critters and the casts that land on them. */
    critterStep(dt) {
      // casts landing
      const due = state.shots.filter((x) => x.at <= state.t);
      state.shots = state.shots.filter((x) => x.at > state.t);
      for (const s of due) {
        for (const c of state.critters.slice()) { const p = c.root.position; if (castHits(s, [p.x, p.y, p.z])) damage(c, MONSTERS.damage[s.id] || 1); }
      }
      // critters
      for (const c of state.critters) {
        c.mixer.update(dt);
        const p = c.root.position;
        if (c.flash > 0) {
          c.flash -= dt;
          const k = Math.max(0, c.flash / 0.25);
          c.root.traverse((o) => {
            if (!o.isMesh || !o.material || !o.material.emissive) return;
            const b0 = o.userData.baseEmissive;
            o.material.emissive.setRGB((b0 ? b0.r : 0) + 0.9 * k, (b0 ? b0.g : 0) + 0.55 * k, (b0 ? b0.b : 0) + 0.3 * k);
          });
        }
        if (c.knock && c.knock.t > 0) { c.knock.t -= dt; p.x += c.knock.x * dt; p.z += c.knock.z * dt; }
        if (c.state === 'dying') { c.vanish += dt; if (c.vanish > 0.45) c.root.scale.setScalar(state.scale * Math.max(0.01, 1 - (c.vanish - 0.45) / 0.4)); continue; }
        c.timer -= dt;
        const dIris = Math.hypot(p.x - player.pos[0], p.z - player.pos[2]);
        if (c.state === 'flee' || (dIris < 3.2 && c.state !== 'hop')) {
          // hop away from Iris for a moment
          const away = Math.atan2(p.x - player.pos[0], p.z - player.pos[2]);
          const tl = [p.x - TOWN_ORIGIN[0] + Math.sin(away) * 4, p.z - TOWN_ORIGIN[2] + Math.cos(away) * 4];
          c.target = [Math.max(MONSTERS.area.x[0], Math.min(MONSTERS.area.x[1], tl[0])), Math.max(MONSTERS.area.z[0], Math.min(MONSTERS.area.z[1], tl[1]))];
          c.state = 'hop'; c.timer = 2.5;
        }
        if (c.state === 'idle' && c.timer <= 0) {
          const A = MONSTERS.area; const lx0 = p.x - TOWN_ORIGIN[0], lz0 = p.z - TOWN_ORIGIN[2];
          c.target = [Math.max(A.x[0], Math.min(A.x[1], lx0 + (rand() - 0.5) * 8)), Math.max(A.z[0], Math.min(A.z[1], lz0 + (rand() - 0.5) * 8))];
          c.state = 'hop'; c.timer = 4;
        }
        if (c.state === 'hop') {
          play(c, 'hop');
          const tw = W(c.target[0], c.target[1]);
          const dx = tw[0] - p.x, dz = tw[2] - p.z, d = Math.hypot(dx, dz);
          if (d < 0.25 || c.timer <= 0) { c.state = 'idle'; c.timer = 1.5 + rand() * 2.5; play(c, 'idle'); }
          else {
            const step = Math.min(d, MONSTERS.speed * dt);
            p.x += (dx / d) * step; p.z += (dz / d) * step;
            const want = Math.atan2(dx, dz); let dh = want - c.root.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            c.root.rotation.y += dh * Math.min(1, dt * 8);
          }
        }
        p.y = ground(p.x, p.z, p.y - state.lift) + state.lift;
      }
    },
    /** Puffs and the chests on the ground: a soft pulse; walking onto one picks it up. */
    chestStep(dt, reducedMotion) {
      for (const f of state.puffs) {
        f.t += dt;
        for (const q of f.parts) { q.s.position.x += q.v[0] * dt; q.s.position.y += q.v[1] * dt; q.s.position.z += q.v[2] * dt; q.v[1] -= 2.4 * dt; q.s.material.opacity = Math.max(0, 1 - f.t / 0.9); }
        if (f.t > 0.9) for (const q of f.parts) { group.remove(q.s); q.s.material.dispose(); }
      }
      state.puffs = state.puffs.filter((f) => f.t <= 0.9);
      for (const ch of state.chests) {
        ch.t += dt;
        const pulse = reducedMotion ? 0.7 : 0.6 + 0.25 * Math.sin(ch.t * 2.4);
        ch.beam.material.opacity = ch.picked ? Math.max(0, 0.75 - ch.picked * 2) : pulse;
        ch.core.material.opacity = ch.picked ? 0 : Math.min(1, pulse + 0.2); ch.halo.material.opacity = ch.picked ? 0 : pulse;
        if (ch.picked) {
          ch.picked += dt;
          const k = Math.min(1, ch.picked / 0.45);
          ch.root.position.y = ch.at[1] + k * 0.9; ch.root.scale.setScalar(Math.max(0.01, 1 - k));
          continue;
        }
        if (Math.hypot(ch.at[0] - player.pos[0], ch.at[2] - player.pos[2]) <= MONSTERS.pickup && Math.abs(ch.at[1] - player.pos[1]) < 2) {
          ch.picked = 0.0001;
          const c = bag.add({ tier: ch.tier, source: 'monster' });
          cue('gift_chime');
          onPickup(c);
        }
      }
      for (const ch of state.chests) if (ch.picked > 0.5) group.remove(ch.root);
      state.chests = state.chests.filter((ch) => !(ch.picked > 0.5));
    },
    dispose() { scene.remove(group); },
  };
}
