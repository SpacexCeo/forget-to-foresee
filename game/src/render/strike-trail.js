// Strike trails for the heroine's moves (owner 14.11: "удары, VFX — делай"): from the swing's start to just past its
// impact a ribbon follows the limb that moves fastest (a fist, a foot, the Loomblade's edge when she holds it), then it
// fades; at the impact frame a flash blooms at the contact point. The limb is found by its speed, so a new move needs
// no table: whatever she swings is what leaves the trail. Pooled (one ribbon of RIBBON samples, one flash), nothing
// allocated per frame. Reduced motion: a shorter, fainter trail; the flash stays (it carries the hit).
//
//   const trail = createStrikeTrail({ THREE, parent: scene });
//   trail.start(model, clip, impactS, blade);   // ftf:iris-action phase 'start' (blade: the held sword object or null)
//   trail.impact();                             // phase 'impact'
//   trail.update(dt, reduced);                  // every frame, after the animation mixer

/** Per move: colour and how wide the ribbon is drawn (metres across the limb's sweep). Unknown moves use `strike`. */
export const STRIKE_LOOK = Object.freeze({
  strike: { color: 0xffb35c, width: 0.42 },   // fists as warm and wide as the kick (owner 14.11: "the kick's effect, on the hands too")
  strike3: { color: 0xffa04a, width: 0.48 },
  super: { color: 0xffa040, width: 0.55 },
  slash: { color: 0xfff1c9, width: 0.0 },   // the blade: the ribbon spans hilt to tip, no extra width
  cast: { color: 0xa8e4ff, width: 0.26 },
});
export const RIBBON = 24, TRAIL_FADE = 0.28, AFTER_IMPACT = 0.12;

/** Which look a clip takes (pure). */
export function lookFor(clip) {
  const c = String(clip || '');
  if (/^super/.test(c)) return 'super';
  if (/^slash/.test(c)) return 'slash';
  if (/^cast|snare|lance/.test(c)) return 'cast';
  if (/3$/.test(c)) return 'strike3';
  return 'strike';
}

/** The limb bones worth following: hands, wrists, feet, ankles (not fingers or toes). Pure on names. */
export function isLimbBone(name) {
  const n = String(name || '');
  return /(hand|wrist|foot|ankle)/i.test(n) && !/(thumb|index|middle|ring|pinky|finger|toe|ball|end|twist|ik|pole)/i.test(n);
}

const VERT = `attribute float aA; varying float vA; varying float vU; attribute float aU; void main(){ vA = aA; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `uniform vec3 uColor; varying float vA; varying float vU; void main(){ float edge = 1.0 - abs(vU * 2.0 - 1.0); gl_FragColor = vec4(mix(uColor, vec3(1.0), edge * 0.5), vA * (0.35 + 0.65 * edge)); }`;

/** @param {{THREE: object, parent: object}} o */
export function createStrikeTrail({ THREE, parent }) {
  const pos = new Float32Array(RIBBON * 2 * 3), alpha = new Float32Array(RIBBON * 2), across = new Float32Array(RIBBON * 2);
  const age = new Float32Array(RIBBON); // seconds since each sample was taken (Infinity: empty)
  age.fill(Infinity);
  const idx = [];
  for (let i = 0; i < RIBBON - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  for (let i = 0; i < RIBBON; i++) { across[i * 2] = 0; across[i * 2 + 1] = 1; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aA', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aU', new THREE.BufferAttribute(across, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color() } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const ribbon = new THREE.Mesh(geo, mat); ribbon.frustumCulled = false; ribbon.visible = false; ribbon.name = 'strike_trail';
  parent.add(ribbon);
  // the contact flash: one soft sprite
  const flashTex = (() => { const d = globalThis.document; if (!d || !d.createElement) return null; const c = d.createElement('canvas'); c.width = c.height = 64; const g = c.getContext && c.getContext('2d'); if (!g) return null; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,235,190,0.8)'); r.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  flash.visible = false; flash.name = 'strike_flash'; parent.add(flash);
  let flashT = 1e9, flashSize = 0.8;

  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
  let limbs = [], model = null, blade = null, look = STRIKE_LOOK.strike, active = false, t = 0, until = 0, impactAt = null, head = 0, lead = null;
  /** The bones and their last positions; the one that travelled furthest since the start leads. */
  function collect(m) {
    limbs = [];
    m.traverse((o) => { if (o.isBone && isLimbBone(o.name) && o.parent && o.parent.isBone) limbs.push({ bone: o, last: new THREE.Vector3(), path: 0 }); });
    m.updateMatrixWorld(true);
    for (const l of limbs) l.bone.getWorldPosition(l.last);
  }
  const api = {
    ribbon, flash,
    /** A move starts: follow it until AFTER_IMPACT past `impactS` (or 0.35 s when the clip has no impact time). */
    start(m, clip, impactS = null, sword = null) {
      if (!m) return;
      if (m !== model) { model = m; collect(m); } else { m.updateMatrixWorld(true); for (const l of limbs) { l.bone.getWorldPosition(l.last); l.path = 0; } }
      blade = sword || null; look = STRIKE_LOOK[lookFor(clip)] || STRIKE_LOOK.strike;
      mat.uniforms.uColor.value.setHex(look.color);
      active = true; t = 0; impactAt = impactS; until = (impactS != null ? impactS : 0.35) + AFTER_IMPACT; lead = null;
      age.fill(Infinity); head = 0;
    },
    /** The impact frame: a flash at the leading limb (or the blade's tip). */
    impact() {
      const p = api.tip(_w); if (!p) return;
      flash.position.copy(p); flashT = 0; flashSize = 0.55 + look.width * 1.6; flash.material.color.setHex(look.color);
    },
    /** The point the trail follows now (the blade's tip, else the leading limb), written into `out`; null if none. */
    tip(out) {
      if (blade) { out.set(0, 0.94, 0); return blade.localToWorld(out); }
      if (!lead) return null;
      return lead.bone.getWorldPosition(out);
    },
    update(dt, reduced = false) {
      // flash
      if (flashT < 0.22) { flashT += dt; const k = flashT / 0.22; flash.visible = true; flash.material.opacity = (1 - k) * 0.95; flash.scale.setScalar(flashSize * (0.6 + 0.8 * k)); } else flash.visible = false;
      for (let i = 0; i < RIBBON; i++) age[i] += dt;
      if (active) {
        t += dt;
        // the leading limb: the furthest travelled since the start (decided after the first few frames, then kept)
        for (const l of limbs) { l.bone.getWorldPosition(_v); l.path += _v.distanceTo(l.last); l.last.copy(_v); }
        if (!blade && (!lead || t < 0.08)) { let best = null; for (const l of limbs) if (!best || l.path > best.path) best = l; lead = best; }
        // one sample: the blade (hilt to tip) or the limb and a point back along its bone toward the joint above
        let ok = false;
        if (blade) { _v.set(0, 0.15, 0); blade.localToWorld(_v); _w.set(0, 0.94, 0); blade.localToWorld(_w); ok = true; }
        else if (lead) {
          lead.bone.getWorldPosition(_w); lead.bone.parent.getWorldPosition(_d);
          _v.subVectors(_d, _w); const len = _v.length() || 1; _v.multiplyScalar(Math.min(1, look.width / len)).add(_w); ok = true;
        }
        if (ok) {
          const i = head; head = (head + 1) % RIBBON;
          pos[i * 6] = _v.x; pos[i * 6 + 1] = _v.y; pos[i * 6 + 2] = _v.z; pos[i * 6 + 3] = _w.x; pos[i * 6 + 4] = _w.y; pos[i * 6 + 5] = _w.z; age[i] = 0;
        }
        if (t >= until) active = false;
      }
      // the strip is drawn oldest -> newest: rebuild the order from the ring (copy into place is cheaper than an index rebuild)
      const fade = reduced ? TRAIL_FADE * 0.5 : TRAIL_FADE, peak = reduced ? 0.5 : 0.9;
      let any = false;
      for (let i = 0; i < RIBBON; i++) { const a = age[i] < fade ? peak * (1 - age[i] / fade) : 0; alpha[i * 2] = a * 0.4; alpha[i * 2 + 1] = a; if (a > 0) any = true; }
      ribbon.visible = any;
      if (any) { reorder(); geo.attributes.position.needsUpdate = true; geo.attributes.aA.needsUpdate = true; }
    },
    get active() { return active; },
    get lead() { return lead ? lead.bone.name : blade ? 'blade' : null; },
    dispose() { geo.dispose(); mat.dispose(); flash.material.dispose(); if (flashTex) flashTex.dispose(); ribbon.removeFromParent(); flash.removeFromParent(); },
  };
  // the ring's samples in time order for the strip (scratch arrays, no allocation per frame)
  const sPos = new Float32Array(pos.length), sA = new Float32Array(alpha.length), sAge = new Float32Array(RIBBON);
  function reorder() {
    for (let k = 0; k < RIBBON; k++) {
      const i = (head + k) % RIBBON; // oldest first
      for (let c = 0; c < 6; c++) sPos[k * 6 + c] = pos[i * 6 + c];
      sA[k * 2] = alpha[i * 2]; sA[k * 2 + 1] = alpha[i * 2 + 1]; sAge[k] = age[i];
    }
    // empty slots collapse onto the oldest real sample so no stray triangle reaches the origin
    let first = -1; for (let k = 0; k < RIBBON; k++) if (sAge[k] !== Infinity) { first = k; break; }
    if (first < 0) return;
    for (let k = 0; k < first; k++) { for (let c = 0; c < 6; c++) sPos[k * 6 + c] = sPos[first * 6 + c]; sA[k * 2] = sA[k * 2 + 1] = 0; }
    pos.set(sPos); alpha.set(sA);
    // the ring now starts at slot 0 again
    for (let k = 0; k < RIBBON; k++) age[k] = sAge[k];
    head = 0;
  }
  return api;
}
