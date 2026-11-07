// Public VFX API (docs/vfx.md):
//   const vfx = createVfx(scene, camera, renderer, { tier: 'ultra', reducedMotion: false });
//   const h = vfx.play('anchor_plant', { position: [x, y, z] });   // handle: stop(), set(opts), done
//   vfx.update(dt);   // once per frame, before rendering
//   vfx.dispose();
// Soft particles and screen effects need vfx.attachToComposer(composer) (ultra/high); without it
// (or on the low tier) particles render directly in the scene and screen effects are skipped.
import * as THREE from 'three';
import { EFFECTS, EMITTERS, EFFECT_NAMES, PALETTE } from './presets.js';
import { Timeline, ObjectPool, tierConfig, scaledCount, envelope, rng, clamp01 } from './core.js';
import { ParticleSystem } from './particles.js';
import { VfxPass } from './post.js';
import {
  createRing, createBeam, placeBeam, createArc, regenArc, layoutArc, createDecal,
  createLogogram, setLogogramSign, logogramPen, createLight,
} from './primitives.js';
import { CAMPS } from '../scenes/layout.js';

export { EFFECT_NAMES };

const v3 = (p) => (p && p.isVector3 ? p.clone() : new THREE.Vector3().fromArray(p || [0, 0, 0]));

export function createVfx(scene, camera, renderer, options = {}) {
  let tier = options.tier || 'ultra';
  let cfg = tierConfig(tier);
  let reducedMotion = !!options.reducedMotion;
  const root = new THREE.Group(); root.name = 'vfx';
  scene.add(root);
  const offscene = new THREE.Scene();
  const particles = new ParticleSystem({ capacity: tierConfig('ultra').capacity });
  particles.prewarm(EMITTERS);
  particles.loadAtlases();
  root.add(particles.group);

  const add = (f) => () => { const o = f(); root.add(o); return o; };
  const pools = {
    ring: new ObjectPool(add(createRing), 8),
    beam: new ObjectPool(add(createBeam), 10),
    arc: new ObjectPool(add(createArc), 6),
    decal: new ObjectPool(add(createDecal), 6),
    logogram: new ObjectPool(add(createLogogram), 3),
  };
  // Fixed light pool sized for the best tier; lights beyond the tier's budget stay dark.
  const lights = [];
  for (let i = 0; i < 3; i++) { const l = createLight(); l.visible = false; root.add(l); lights.push({ l, busy: false }); }

  const pass = new VfxPass({ particles, offscene, camera });
  let composer = null;
  const instances = new Set();
  let tension = null;
  let time = 0;
  const hooks = { skyTint: null };
  const seedR = rng(99);
  const _p = new THREE.Vector3(), _q = new THREE.Vector3();

  function setSoft(on) {
    const soft = on && cfg.soft;
    particles.setSoft(soft);
    (soft ? offscene : root).add(particles.group);
  }

  function acquireLight() {
    const n = cfg.lights;
    for (let i = 0; i < n; i++) if (!lights[i].busy) { lights[i].busy = true; lights[i].l.visible = true; return lights[i]; }
    return null;
  }
  function releaseLight(s) { s.busy = false; s.l.visible = false; s.l.intensity = 0; }

  function originOf(inst) {
    if (inst.opts.follow) inst.opts.follow.getWorldPosition(inst.origin);
    return inst.origin;
  }

  function startLayer(inst, i) {
    const L = inst.def.layers[i];
    const o = inst.opts, sc = o.scale || 1;
    const org = originOf(inst);
    const off = L.offset ? _q.fromArray(L.offset).multiplyScalar(sc) : _q.set(0, 0, 0);
    const at = _p.copy(org).add(off).toArray();
    const st = { kind: L.kind };
    switch (L.kind) {
      case 'burst': {
        const e = EMITTERS[L.emitter];
        particles.emit(e, scaledCount(e.count * (L.scale || 1), tier, o.count || 1), at, { scale: sc, ...emitOverrides(inst, L) });
        return null;
      }
      case 'stream': st.acc = 0; st.prev = at; break;
      case 'ring': {
        const m = pools.ring.acquire(); if (!m) return null;
        m.position.set(at[0], at[1] + (L.y ?? 0.04), at[2]); m.scale.setScalar(L.radius * sc);
        m.material.uniforms.uColor.value.setHex(L.color); m.material.uniforms.uWidth.value = L.width / L.radius;
        m.material.uniforms.uSeed.value = seedR() * 10; m.visible = true; st.obj = m; st.pool = pools.ring; break;
      }
      case 'light': { const s = acquireLight(); if (!s) return null; s.l.color.setHex(L.color); s.l.distance = L.distance * sc; s.l.position.fromArray(at); st.light = s; break; }
      case 'decal': {
        const m = pools.decal.acquire(); if (!m) return null;
        m.position.set(at[0], at[1] + 0.02, at[2]); m.scale.setScalar(L.radius * sc);
        m.material.uniforms.uColor.value.setHex(L.color); m.material.uniforms.uSeed.value = seedR() * 10;
        m.visible = true; st.obj = m; st.pool = pools.decal; break;
      }
      case 'arcs': {
        st.objs = [];
        const n = Math.max(1, Math.round(L.bolts * cfg.arcs));
        for (let k = 0; k < n; k++) { const m = pools.arc.acquire(); if (!m) break; m.material.uniforms.uColor.value.setHex(L.color); m.visible = true; st.objs.push(m); }
        st.pool = pools.arc; st.next = 0; st.at = at; break;
      }
      case 'beams': {
        st.objs = []; st.pool = pools.beam;
        const target = v3(o.target || [0, 14, 0]);
        const pairs = [];
        if (L.source === 'pillar') pairs.push([new THREE.Vector3(target.x, 0, target.z), new THREE.Vector3(target.x, L.height || 60, target.z)]);
        else for (const p of (o.points || CAMPS.map((c) => [c.position[0], 2.5, c.position[2]]))) pairs.push([v3(p), target]);
        for (const [a, b] of pairs) {
          const m = pools.beam.acquire(); if (!m) break;
          placeBeam(m, a, b, L.width); m.material.uniforms.uColor.value.setHex(L.color); m.visible = true; st.objs.push(m);
        }
        break;
      }
      case 'logogram': {
        const m = pools.logogram.acquire(); if (!m) return null;
        setLogogramSign(m, { forms: o.forms, dots: o.dots, seed: o.seed || 7 });
        const r = L.radius * sc;
        m.scale.setScalar(r);
        m.position.set(at[0], at[1] + (o.normal ? 0 : r + 0.3), at[2]);
        const n = v3(o.normal || [0, 0, 1]).normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        m.visible = true; st.obj = m; st.pool = pools.logogram; st.normal = n; st.prevPen = null;
        break;
      }
      case 'post': break;
      default: return null;
    }
    return st;
  }

  function emitOverrides(inst, L) {
    const o = inst.opts;
    const e = EMITTERS[L.emitter];
    if (o.crackDir && e.shape && e.shape.type === 'line') return { shape: { type: 'line', dir: o.crackDir, length: o.crackLength || e.shape.length } };
    return {};
  }

  function updateLayer(inst, i, st, lt, dt) {
    const L = inst.def.layers[i];
    const o = inst.opts, sc = o.scale || 1;
    const stopping = inst.tl.stopped;
    const dur = L.dur ?? (inst.def.loop ? Infinity : inst.def.duration - L.at);
    switch (st.kind) {
      case 'stream': {
        if (stopping) return;
        const e = EMITTERS[L.emitter];
        const level = L.emitter.startsWith('tension') ? (o.level ?? 0.5) : 1;
        st.acc += e.rate * cfg.particleScale * (o.count || 1) * level * dt;
        const n = Math.floor(st.acc);
        if (n > 0) {
          st.acc -= n;
          const off = L.offset ? _q.fromArray(L.offset).multiplyScalar(sc) : _q.set(0, 0, 0);
          const at = _p.copy(originOf(inst)).add(off).toArray();
          particles.emit(e, n, at, { scale: sc, birthSpread: dt, from: st.prev, ...emitOverrides(inst, L) });
          st.prev = at;
        }
        break;
      }
      case 'ring': st.obj.material.uniforms.uT.value = clamp01(lt / L.dur); st.obj.material.uniforms.uIntensity.value = L.intensity; break;
      case 'light': {
        let k = inst.def.loop && !L.dur ? (stopping ? Math.max(0, 1 - (inst.tl.t - inst.tl.stopAt) / (L.release || 0.5)) : Math.min(1, lt / (L.attack || 0.01)))
          : envelope(lt, dur, L.attack, L.release);
        if (L.pulse) { const ph = 0.5 + 0.5 * Math.cos((lt / L.pulse.period) * Math.PI * 2); const lv = L.pulse.min + (1 - L.pulse.min) * ph; k *= lv; if (o.onPulse) o.onPulse(lv); }
        st.light.l.intensity = L.intensity * k * (o.lightScale ?? 1);
        if (o.follow) st.light.l.position.copy(originOf(inst)).add(L.offset ? _q.fromArray(L.offset) : _q.set(0, 0, 0));
        break;
      }
      case 'decal': {
        const u = st.obj.material.uniforms; u.uT.value = lt; u.uFade.value = envelope(lt, L.dur, 0.05, 1.6); break;
      }
      case 'arcs': {
        const alive = lt < L.dur;
        if (alive && time >= st.next) {
          st.next = time + 1 / L.rate;
          const tgt = [st.at[0], st.at[1] + 1.2 * sc, st.at[2]];
          st.objs.forEach((m, k) => {
            const r = seedR;
            const top = [tgt[0] + (r() - 0.5) * 4, tgt[1] + L.height * sc, tgt[2] + (r() - 0.5) * 4];
            regenArc(m, top, tgt, Math.floor(r() * 1e6) + k, 5);
            m.material.uniforms.uIntensity.value = (3 + r() * 6) * (1 - lt / L.dur);
          });
        }
        st.objs.forEach((m) => { m.visible = alive; if (alive) layoutArc(m, camera); });
        break;
      }
      case 'beams': {
        const grow = clamp01(lt / L.grow);
        const fade = envelope(lt, L.dur, 0.2, 2.5);
        for (const m of st.objs) { const u = m.material.uniforms; u.uGrow.value = 1 - Math.pow(1 - grow, 2); u.uFade.value = fade; u.uTime.value = time; }
        break;
      }
      case 'logogram': {
        const u = st.obj.material.uniforms;
        const p = clamp01(lt / L.draw);
        u.uProgress.value = p * 1.002;
        u.uSettle.value = clamp01((lt - L.draw - L.hold) / L.settle);
        u.uTime.value = time;
        const end = L.draw + L.hold + L.settle;
        u.uOpacity.value = o.persist ? 1 : 1 - clamp01((lt - end) / Math.max(0.3, inst.def.duration - L.at - end));
        if (p < 1) {
          const pen = logogramPen(st.obj, p);
          if (pen) {
            _p.set(pen[0], pen[1], 0.02).applyMatrix4(st.obj.matrixWorld);
            const e = EMITTERS.ink_motes;
            st.acc = (st.acc || 0) + e.rate * cfg.particleScale * dt;
            const n = Math.floor(st.acc);
            if (n > 0) { st.acc -= n; particles.emit(e, n, _p.toArray(), { scale: sc, dir: st.normal.toArray(), birthSpread: dt, from: st.prevPen }); }
            st.prevPen = _p.toArray();
          } else st.prevPen = null;
        }
        break;
      }
      case 'post': break;
    }
  }

  function endLayer(st) {
    if (!st) return;
    if (st.obj) { st.obj.visible = false; st.pool.release(st.obj); }
    if (st.objs) for (const m of st.objs) { m.visible = false; st.pool.release(m); }
    if (st.light) releaseLight(st.light);
  }

  function finish(inst) {
    for (const st of inst.states.values()) endLayer(st);
    inst.states.clear();
    instances.delete(inst);
    inst.handle.done = true;
    if (inst === tension) { tension = null; if (hooks.skyTint) hooks.skyTint(PALETTE.emberDeep, 0); }
  }

  function play(name, opts = {}) {
    const def = EFFECTS[name];
    if (!def) throw new Error('Unknown VFX effect: ' + name + ' (known: ' + EFFECT_NAMES.join(', ') + ')');
    if (name === 'tension' && tension) { tension.handle.set(opts); return tension.handle; }
    const inst = { name, def, opts: { ...opts }, origin: v3(opts.position), tl: new Timeline(def), states: new Map(), handle: null };
    inst.handle = {
      name, done: false,
      stop: () => inst.tl.stop(),
      set: (o) => {
        Object.assign(inst.opts, o);
        if (o.position) inst.origin.copy(v3(o.position));
        if (name === 'tension' && hooks.skyTint) hooks.skyTint(PALETTE.emberDeep, inst.opts.level ?? 0.5);
      },
    };
    if (name === 'tension') { tension = inst; if (hooks.skyTint) hooks.skyTint(PALETTE.emberDeep, inst.opts.level ?? 0.5); }
    instances.add(inst);
    return inst.handle;
  }

  const post = { distort: 0, chroma: 0, shock: 0, shockT: 0, tint: new THREE.Color(1, 1, 1), tintAmount: 0, desat: 0 };

  function update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    time += dt;
    particles.update(dt);
    post.distort = post.chroma = post.shock = post.tintAmount = post.desat = 0;
    for (const inst of [...instances]) {
      const res = inst.tl.advance(dt);
      for (const i of res.start) {
        const st = startLayer(inst, i);
        if (st) { if (inst.states.has(i)) endLayer(inst.states.get(i)); inst.states.set(i, st); }
      }
      for (const [i, st] of inst.states) {
        const lt = inst.tl.localTime(i);
        if (lt >= 0) updateLayer(inst, i, st, lt, dt);
        const L = inst.def.layers[i];
        if (L.kind === 'post' && lt >= 0) {
          const k = envelope(lt, L.dur, L.attack, L.release);
          post.distort = Math.max(post.distort, (L.distort || 0) * k);
          post.chroma = Math.max(post.chroma, (L.chroma || 0) * k);
          post.desat = Math.max(post.desat, (L.desat || 0) * k);
          if (L.tint !== undefined && (L.tintAmount || 0) * k > post.tintAmount) { post.tintAmount = L.tintAmount * k; post.tint.setHex(L.tint); }
          if (L.shock && k > 0) {
            post.shock = L.shock; post.shockT = clamp01(lt / L.dur);
            _p.copy(inst.origin).project(camera);
            pass.uniforms.uShockCenter.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
          }
        }
      }
      for (const i of res.end) { endLayer(inst.states.get(i)); inst.states.delete(i); }
      if (inst.tl.done) finish(inst);
    }
    const u = pass.uniforms;
    const screen = cfg.distortion && !!composer;
    u.uTime.value = time;
    u.uDistort.value = screen && !reducedMotion ? post.distort : 0;
    u.uShock.value = screen && !reducedMotion ? post.shock : 0;
    u.uShockT.value = post.shockT;
    u.uChroma.value = screen ? post.chroma : 0;
    u.uTint.value.copy(post.tint); u.uTintAmount.value = screen ? post.tintAmount : 0;
    u.uDesat.value = screen ? post.desat : 0;
    u.uTension.value = screen && tension ? (tension.opts.level ?? 0.5) : 0;
  }

  function attachToComposer(c) {
    composer = c;
    if (!c || !cfg.soft) { setSoft(false); return; }
    const passes = c.passes;
    const old = passes.indexOf(pass);
    if (old >= 0) passes.splice(old, 1);
    let at = passes.findIndex((p) => p.constructor && /Bloom|OutputPass/.test(p.constructor.name));
    if (at < 0) at = passes.length;
    c.insertPass(pass, at);
    pass.depthTexture = c.renderTarget1.depthTexture || null;
    pass.scale = cfg.offscreenScale;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    pass.setSize(c.renderTarget1.width || size.x, c.renderTarget1.height || size.y);
    setSoft(true);
  }

  function setQuality(t) {
    tier = t; cfg = tierConfig(t);
    for (let i = cfg.lights; i < lights.length; i++) if (lights[i].busy) lights[i].l.intensity = 0;
    if (composer && cfg.soft) attachToComposer(composer); else setSoft(false);
  }

  function dispose() {
    for (const inst of [...instances]) finish(inst);
    if (composer) { const i = composer.passes.indexOf(pass); if (i >= 0) composer.passes.splice(i, 1); }
    particles.dispose();
    for (const p of Object.values(pools)) for (const m of p.all()) { m.geometry.dispose(); m.material.dispose(); }
    pass.dispose();
    root.removeFromParent();
  }

  setSoft(false);
  return {
    play, update, dispose, attachToComposer, setQuality,
    setReducedMotion: (on) => { reducedMotion = !!on; particles.shared.uCurlScale.value = on ? 0.5 : 1; },
    stats: () => ({ tier, effects: instances.size, ...particles.stats(), lights: lights.filter((s) => s.busy).length }),
    names: EFFECT_NAMES, hooks, pass, root,
  };
}
