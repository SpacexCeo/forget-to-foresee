// Impact effects, the three.js part (render/hit-fx-core.js has the numbers): pooled, a fixed number of draw calls
// whatever the fight does. Five layers, all additive and depth-tested, none writing depth:
//   flash     camera-facing sprites in the blow's colour, a quick swell and fade (8 at once)
//   ice       diamond-shaped shards that fly off the struck side and fall (one Points, 96)
//   spark     round sparks, the same physics, quicker (one Points, 160); also the motes of trails
//   crackle   jagged violet arcs that flicker over the struck creature (one LineSegments)
//   ring      ground rings that burst outwards (4 at once)
//   slash     a blade's arc: a flat crescent bright at its leading edge that sweeps and fades (3 at once)
// and the camera kick: a damped spring the blows push along their direction; the caller adds `kick` to the camera.
//
//   const fx = createHitFx({ THREE, parent: scene });
//   fx.impact([x, y, z], [awayX, awayZ], impactOf('lance', { radius }));
//   fx.trail([x, y, z], 0x9ff5ea);      // one mote behind a projectile, call every frame or two
//   fx.update(dt); camera.position.add(fx.kick)
import { FRAG, KICK, fragVelocities, kickStep, crackle as crackleLine } from './hit-fx-core.js';

const FLASHES = 8, RINGS = 4, CRACKLES = 12, CRACKLE_SEGS = 6, SLASHES = 3, SLASH_ARC = 2.3;
const CAP = { ice: 96, spark: 160 };

function canvasTex(THREE, doc, draw) {
  if (!doc || !doc.createElement) return null;
  const c = doc.createElement('canvas'); c.width = c.height = 64; const g = c.getContext && c.getContext('2d'); if (!g) return null;
  draw(g); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * @param {{THREE: object, parent: object, doc?: Document, rand?: () => number, scale?: number}} o  scale < 1 on phones
 *   thins the fragments (the flash and the rings stay: they carry the hit)
 */
export function createHitFx({ THREE, parent, doc = globalThis.document, rand = Math.random, scale = 1 }) {
  const group = new THREE.Group(); group.name = 'hit-fx'; parent.add(group);
  const soft = canvasTex(THREE, doc, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const shard = canvasTex(THREE, doc, (g) => {
    const gr = g.createLinearGradient(16, 0, 48, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.35)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(32, 2); g.lineTo(46, 30); g.lineTo(32, 62); g.lineTo(20, 30); g.closePath(); g.fill();
  });

  // ---- flashes
  const flashes = [];
  for (let i = 0; i < FLASHES; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.visible = false; sp.renderOrder = 5; group.add(sp); flashes.push({ sp, t: 1, dur: 0.16, s: 1 });
  }
  let flashNext = 0;

  // ---- particles: positions, velocities, colours (faded to black = invisible under additive blending), life
  function particles(kind, tex) {
    const n = CAP[kind], pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ map: tex, size: FRAG[kind].size * 2.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; group.add(pts);
    return { kind, n, pos, col, geo, vel: new Float32Array(n * 3), base: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), grav: new Float32Array(n), next: 0, live: 0, pts };
  }
  const P = { ice: particles('ice', shard || soft), spark: particles('spark', soft) };
  const tmpC = new THREE.Color();
  function emit(p, at, v, color, life, grav) {
    const i = p.next; p.next = (p.next + 1) % p.n;
    p.pos.set(at, i * 3); p.vel.set(v, i * 3);
    tmpC.set(color); p.base[i * 3] = tmpC.r; p.base[i * 3 + 1] = tmpC.g; p.base[i * 3 + 2] = tmpC.b;
    p.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    p.life[i] = life; p.max[i] = life; p.grav[i] = grav;
  }

  // ---- crackles: CRACKLES arcs of CRACKLE_SEGS segments each
  const cSegs = CRACKLES * CRACKLE_SEGS, cPos = new Float32Array(cSegs * 6), cCol = new Float32Array(cSegs * 6);
  const cGeo = new THREE.BufferGeometry(); cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3)); cGeo.setAttribute('color', new THREE.BufferAttribute(cCol, 3));
  const cLines = new THREE.LineSegments(cGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  cLines.frustumCulled = false; cLines.renderOrder = 5; group.add(cLines);
  const arcs = Array.from({ length: CRACKLES }, () => ({ t: 1, dur: 0.22, a: null, b: null, color: new THREE.Color(), amp: 0.12, reflick: 0 }));
  let arcNext = 0;
  function drawArc(j) {
    const A = arcs[j], o = j * CRACKLE_SEGS * 6;
    const pts = crackleLine(A.a, A.b, CRACKLE_SEGS, A.amp, rand);
    for (let s = 0; s < CRACKLE_SEGS; s++) { cPos.set(pts[s], o + s * 6); cPos.set(pts[s + 1], o + s * 6 + 3); }
  }

  // ---- rings
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48); ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < RINGS; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; m.renderOrder = 4; group.add(m); rings.push({ m, t: 1, dur: 0.42, r: 1 });
  }
  let ringNext = 0;

  // ---- slashes: a crescent whose vertex colour rises from the tail to the leading edge (additive: the tail vanishes)
  const slashGeo = new THREE.RingGeometry(0.62, 1, 28, 2, -SLASH_ARC / 2, SLASH_ARC);
  { const pa = slashGeo.attributes.position, c = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) { const a = Math.atan2(pa.getY(i), pa.getX(i)), u = (a + SLASH_ARC / 2) / SLASH_ARC, r = Math.hypot(pa.getX(i), pa.getY(i)), edge = 1 - Math.abs(r - 0.86) / 0.24; const b = Math.pow(Math.max(0, u), 2.2) * (0.45 + 0.55 * Math.max(0, edge)); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = b; }
    slashGeo.setAttribute('color', new THREE.BufferAttribute(c, 3)); slashGeo.rotateX(-Math.PI / 2); }
  const slashes = [];
  for (let i = 0; i < SLASHES; i++) {
    const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; m.renderOrder = 5; group.add(m); slashes.push({ m, t: 1, dur: 0.2, yaw: 0, dir: 1, r: 1 });
  }
  let slashNext = 0;

  // ---- camera kick
  const kickState = { x: [0, 0, 0], v: [0, 0, 0] };
  const kick = new THREE.Vector3();
  const KICK_V = Math.sqrt(KICK.k) * Math.E;           // the impulse that peaks at ~1 m for a critically damped spring

  function flash(at, color, size, dur = 0.16) {
    const f = flashes[flashNext]; flashNext = (flashNext + 1) % FLASHES;
    f.sp.position.set(at[0], at[1], at[2]); f.sp.material.color.set(color); f.s = size; f.t = 0; f.dur = dur; f.sp.visible = true;
  }
  function ring(at, color, radius, dur = 0.42) {
    if (!(radius > 0)) return;
    const r = rings[ringNext]; ringNext = (ringNext + 1) % RINGS;
    r.m.position.set(at[0], at[1] + 0.06, at[2]); r.m.material.color.set(color); r.r = radius; r.t = 0; r.dur = dur; r.m.visible = true;
  }

  return {
    group,
    /** The camera offset of the kick this frame (add it to the camera position after the rig placed it). */
    kick,
    /**
     * One blow landing at `at` (world, the struck side at chest height), pushed along `away` ([x, z] unit, from the
     * attacker), with the look `imp` from impactOf(). `ground` is the ground height under it for the ring.
     */
    impact(at, away, imp, ground = at[1] - 0.6) {
      flash(at, imp.color, imp.flash, imp.crit ? 0.2 : 0.15);
      if (imp.crit) flash(at, 0xffffff, imp.flash * 0.55, 0.09);                  // a white core on the big ones
      const F = FRAG[imp.frag] || FRAG.spark, p = P[imp.frag] || P.spark;
      const n = Math.max(1, Math.round(imp.frags * scale));
      for (const v of fragVelocities(n, away, imp.frag, rand)) emit(p, at, v, imp.color, F.life * (0.7 + 0.6 * rand()), F.gravity);
      for (let i = 0; i < imp.crackle; i++) {
        const A = arcs[arcNext]; arcNext = (arcNext + 1) % CRACKLES;
        const ang = rand() * Math.PI * 2, r = 0.35 + rand() * 0.35;
        A.a = [at[0], at[1] + 0.3, at[2]]; A.b = [at[0] + Math.cos(ang) * r, at[1] - 0.25 - rand() * 0.3, at[2] + Math.sin(ang) * r];
        A.color.set(imp.color); A.t = 0; A.dur = 0.18 + 0.1 * rand(); A.reflick = 0; A.amp = 0.08 + 0.06 * rand();
      }
      if (imp.ring) ring([at[0], ground, at[2]], imp.color, imp.ring);
      if (imp.kick) {
        const l = Math.hypot(away[0], away[1]) || 1, s = imp.kick * KICK_V;
        kickState.v[0] += away[0] / l * s; kickState.v[2] += away[1] / l * s; kickState.v[1] -= s * 0.35;
      }
    },
    /** A ground shock without a target (the super strike's release, a slam): a ring and a flash at the feet. */
    shock(at, color, radius) { ring(at, color, radius, 0.5); flash([at[0], at[1] + 0.3, at[2]], color, radius * 0.6, 0.18); },
    /** One trail mote at `at` (a projectile's wake): drifts up a little and fades. */
    trail(at, color, life = 0.28, jitter = 0.05) {
      emit(P.spark, [at[0] + (rand() - 0.5) * jitter, at[1] + (rand() - 0.5) * jitter, at[2] + (rand() - 0.5) * jitter], [(rand() - 0.5) * 0.3, 0.25, (rand() - 0.5) * 0.3], color, life, 0);
    },
    /**
     * A blade's arc around `at` (her chest), facing `heading` (rad, 0 = +z), `radius` m, sweeping `dir` (1 left to
     * right, -1 back), tilted by `tilt` rad (a rising or falling cut).
     */
    slash(at, heading, radius, color, dir = 1, tilt = 0, dur = 0.2) {
      const S = slashes[slashNext]; slashNext = (slashNext + 1) % SLASHES;
      S.m.position.set(at[0], at[1], at[2]); S.m.material.color.set(color); S.r = radius; S.t = 0; S.dur = dur; S.dir = dir < 0 ? -1 : 1;
      S.yaw = heading; S.tilt = tilt; S.m.visible = true;
    },
    /** A small burst without a camera kick (a projectile ending, a spark off armour). */
    burst(at, color, n = 5, size = 0.45) {
      flash(at, color, size, 0.14);
      for (const v of fragVelocities(Math.max(1, Math.round(n * scale)), [0, 1], 'spark', rand)) emit(P.spark, at, [v[0] * (rand() < 0.5 ? -1 : 1), v[1], v[2] * (rand() < 0.5 ? -1 : 1)], color, FRAG.spark.life, FRAG.spark.gravity);
    },
    update(dt) {
      for (const f of flashes) {
        if (!f.sp.visible) continue;
        f.t += dt; const u = Math.min(1, f.t / f.dur);
        f.sp.scale.setScalar(f.s * (0.55 + 0.75 * (1 - (1 - u) * (1 - u)))); f.sp.material.opacity = 1 - u * u;
        if (u >= 1) f.sp.visible = false;
      }
      for (const p of Object.values(P)) {
        let live = 0;
        for (let i = 0; i < p.n; i++) {
          if (p.life[i] <= 0) continue;
          p.life[i] -= dt;
          const j = i * 3;
          if (p.life[i] <= 0) { p.col[j] = p.col[j + 1] = p.col[j + 2] = 0; continue; }
          live++;
          p.vel[j + 1] -= p.grav[i] * dt;
          p.pos[j] += p.vel[j] * dt; p.pos[j + 1] += p.vel[j + 1] * dt; p.pos[j + 2] += p.vel[j + 2] * dt;
          const k = p.life[i] / p.max[i], b = k * (2 - k);                         // bright, then out
          p.col[j] = p.base[j] * b; p.col[j + 1] = p.base[j + 1] * b; p.col[j + 2] = p.base[j + 2] * b;
        }
        if (live || p.live) { p.geo.attributes.position.needsUpdate = true; p.geo.attributes.color.needsUpdate = true; }
        p.live = live; p.pts.visible = live > 0;
      }
      let arcsLive = false;
      for (let j = 0; j < CRACKLES; j++) {
        const A = arcs[j], o = j * CRACKLE_SEGS * 6;
        if (A.t >= A.dur) { if (cCol[o] || cCol[o + 1] || cCol[o + 2]) cCol.fill(0, o, o + CRACKLE_SEGS * 6); continue; }
        A.t += dt; A.reflick -= dt; arcsLive = true;
        if (A.reflick <= 0) { drawArc(j); A.reflick = 0.045; }                          // it re-strikes a few times
        const b = Math.max(0, 1 - A.t / A.dur) * (0.6 + 0.4 * rand());
        for (let s = 0; s < CRACKLE_SEGS * 2; s++) { cCol[o + s * 3] = A.color.r * b; cCol[o + s * 3 + 1] = A.color.g * b; cCol[o + s * 3 + 2] = A.color.b * b; }
      }
      cGeo.attributes.position.needsUpdate = true; cGeo.attributes.color.needsUpdate = true; cLines.visible = arcsLive;
      for (const r of rings) {
        if (!r.m.visible) continue;
        r.t += dt; const u = Math.min(1, r.t / r.dur), e = 1 - (1 - u) * (1 - u) * (1 - u);
        r.m.scale.setScalar(r.r * (0.25 + 0.75 * e)); r.m.material.opacity = 0.85 * (1 - u);
        if (u >= 1) r.m.visible = false;
      }
      for (const S of slashes) {
        if (!S.m.visible) continue;
        S.t += dt; const u = Math.min(1, S.t / S.dur), e = 1 - (1 - u) * (1 - u);
        // the crescent's middle points along +x of its plane: turn it to face `yaw`, then sweep it through the cut
        S.m.rotation.set(S.tilt, S.yaw - Math.PI / 2 + S.dir * (e - 0.5) * 1.6, 0, 'YXZ');
        S.m.scale.set(S.r * (0.85 + 0.15 * e), 1, S.dir * S.r * (0.85 + 0.15 * e)); // dir -1 mirrors the crescent across its own axis
        S.m.material.opacity = u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65;
        if (u >= 1) S.m.visible = false;
      }
      kickStep(kickState, Math.min(dt, 1 / 30));
      const l = Math.hypot(...kickState.x);
      if (l > KICK.max) for (let i = 0; i < 3; i++) kickState.x[i] *= KICK.max / l;
      kick.set(kickState.x[0], kickState.x[1], kickState.x[2]);
    },
    /** Stops the camera kick at once (reduced motion switched on, the fight left). */
    still() { kickState.x.fill(0); kickState.v.fill(0); kick.set(0, 0, 0); },
    dispose() {
      group.parent?.remove(group);
      for (const f of flashes) f.sp.material.dispose();
      for (const p of Object.values(P)) { p.geo.dispose(); p.pts.material.dispose(); }
      cGeo.dispose(); cLines.material.dispose(); ringGeo.dispose(); slashGeo.dispose(); for (const S of slashes) S.m.material.dispose(); for (const r of rings) r.m.material.dispose();
      if (soft) soft.dispose(); if (shard) shard.dispose();
    },
  };
}
