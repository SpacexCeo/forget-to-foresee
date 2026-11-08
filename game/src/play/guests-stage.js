// The Guests behind the glass: staging logic (owner request 08.11, docs/guests-stage.md).
//
// The Guests are mostly hidden in dense, slowly moving mist behind the glass wall of a Shell. They
// emerge as enormous, backlit, low-contrast silhouettes at meaningful moments: when a sign is drawn
// (the drawing Guest comes closest and the logogram forms on the glass between it and Iris), on a
// reveal (a reaction coloured by the outcome), at the trial-13 crisis, before the final vote, and as
// an answer to a question. Otherwise one of them drifts a little, now and then, on a schedule seeded
// per season, so no two Shells and no two seasons breathe alike and nothing runs on a fixed loop.
//
// This module is pure: no three.js, no DOM, no audio. It turns cues and time into per-Guest targets
// (depth toward the glass, lateral offset, rise, scale, light, sail opening, facing, clip) plus the
// mist, the camera hint and the sound swell, and eases the current pose toward them. The Shell scene
// (scenes/shell.js) maps the pose into the chamber, presentation.js feeds it cues, quality, the
// season seed, the audio and the camera. Presentation only: nothing here reads or changes a rule.

/** Moments the stage knows, strongest first (a stronger moment interrupts a weaker one). */
export const MOMENTS = Object.freeze(['crisis', 'vote', 'sign', 'reveal', 'yes', 'no', 'drift']);
const PRIORITY = Object.fromEntries(MOMENTS.map((m, i) => [m, MOMENTS.length - i]));

/** Slots behind the glass: 0 left, 1 centre (the drawing Guest), 2 right. */
export const SLOTS = 3;
export const DRAWING_SLOT = 1;

/**
 * Stage quality: how many Guests stand behind the glass and whether the mist is layered and moving.
 * `low` (desktop low tier) and `phone` keep every moment but drop the volumetric tricks (docs/mobile.md).
 */
export const QUALITY = Object.freeze({
  ultra: { guests: 3, mistLayers: 8, volumetric: true },
  high: { guests: 3, mistLayers: 6, volumetric: true },
  low: { guests: 2, mistLayers: 3, volumetric: false },
  phone: { guests: 1, mistLayers: 2, volumetric: false },
});

/** Stage quality for a look-dev state (`{tier, profile}`): phones always get the phone set. */
export function stageQualityFor(lookdev) {
  if (!lookdev) return 'high';
  if (lookdev.profile === 'phone') return 'phone';
  return QUALITY[lookdev.tier] ? lookdev.tier : 'high';
}

/** Which Guest slots are on stage for a count (the drawing Guest first, then left, then right). */
export function slotsFor(count) {
  return [DRAWING_SLOT, 0, 2].slice(0, Math.max(0, Math.min(SLOTS, count | 0)));
}

/**
 * Cue name of play/hooks.js → stage moment, or null for cues the Guests ignore.
 * `shell_enter` arms the stage (the drift schedule starts), `shell_exit` rests it.
 */
export function momentForCue(name, data = {}) {
  switch (name) {
    case 'reveal_gift': return { name: 'reveal', action: 'gift' };
    case 'reveal_storm': return { name: 'reveal', action: 'storm' };
    case 'reveal_silence': return { name: 'reveal', action: 'silence' };
    case 'reveal_call': return { name: 'reveal', action: 'call' };
    case 'crisis': return { name: 'crisis' };
    case 'double_ring': return { name: 'vote' };
    case 'guest_yes': return { name: 'yes' };
    case 'guest_no': return { name: 'no' };
    case 'shell_enter': return { name: 'enter', shell: data.shell };
    case 'shell_exit': return { name: 'exit' };
    default: return null;
  }
}

/**
 * Clip fallbacks: the stage names idle | draw | react | approach | recede (the ink Guest's clips);
 * a model that lacks one plays the next name in its chain, so an older glb still animates.
 */
export const CLIP_FALLBACK = Object.freeze({ approach: ['approach', 'idle'], recede: ['recede', 'idle'], draw: ['draw', 'idle'], react: ['react', 'idle'], idle: ['idle'] });
export function resolveClip(name, available) {
  const has = available instanceof Set ? (n) => available.has(n) : Array.isArray(available) ? (n) => available.includes(n) : (n) => !!(available && available[n]);
  for (const c of CLIP_FALLBACK[name] || [name, 'idle']) if (has(c)) return c;
  return null;
}

/**
 * Where the ink pen is on the glass while a sign forms, in the glyph's own units (radius R = the ring
 * radius, x right, y up, the ring centre at 0,0), mirroring the schedule of play/logogram.js
 * drawLogogram: strokes in reading order take the first 70 % (each at its ring position: 0 top, then
 * clockwise), the ring 70..90 % (a filament from the top running clockwise), then the sign turns and the
 * pen lifts (null). The drawing Guest's ink thread ends here.
 */
export function inkPenPoint(sign, progress, R = 1) {
  const p = Math.min(1, Math.max(0, Number(progress) || 0));
  if (!sign || p >= 0.9) return null;
  const dots = sign.dots || 0;
  if (p < 0.7) {
    const k = Math.min(3, Math.floor(p / 0.175));
    const pos = (dots + k) % 4;
    const a = pos * Math.PI / 2;
    return { x: Math.sin(a) * 1.13 * R, y: Math.cos(a) * 1.13 * R, stroke: k, pos };
  }
  const u = (p - 0.7) / 0.2, e = u * u * (3 - 2 * u);
  const a = Math.PI * e;
  return { x: Math.sin(a) * R, y: Math.cos(a) * R, stroke: 4, pos: null };
}

/** FNV-1a over a string → 32-bit seed (the season's Merkle root makes the schedule per season). */
export function hashSeed(s) {
  let h = 0x811c9dc5;
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** mulberry32: a small deterministic generator (0 ≤ x < 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (u) => { const x = clamp01(u); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
/** Exponential ease toward a target: rate in 1/s. */
const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Rest pose per slot: deep in the mist, huge, dim, not facing the visitor squarely. */
// The two giants watch from the sides; the smaller one in the centre is the one that comes close and draws.
const REST = [
  { depth: 0.16, x: 0, rise: 0.2, scale: 2.5, light: 0.18, open: 0, face: -0.35 },
  { depth: 0.22, x: 0, rise: 0.0, scale: 1.35, light: 0.22, open: 0, face: 0.25 },
  { depth: 0.12, x: 0, rise: 0.5, scale: 2.3, light: 0.16, open: 0, face: 0.4 },
];
const REST_MIST = Object.freeze({ density: 1, churn: 1, backlight: 0.55, thin: 0 });

/**
 * Moment shapes: approach / hold / withdraw in seconds, then the pose each Guest aims for at full
 * strength (u = 1) as deltas over its rest pose, the mist, the camera hint weight and the sound swell.
 * `clip` names the Guest clip to play while the moment holds (idle | draw | react).
 */
export const MOMENT_DEFS = Object.freeze({
  sign: {
    approach: 5, hold: 9, withdraw: 8, camera: 0.6, swell: 0.7, clip: { 1: 'draw' },
    mist: { thin: 0.45, backlight: 0.8 },
    guests: { 1: { depth: 0.68, scale: 1.25, light: 1, rise: 0.3, face: 0 }, 0: { depth: 0.3, light: 0.3, face: -0.6, x: -0.8 }, 2: { depth: 0.26, light: 0.28, face: 0.7, x: 0.8 } },
  },
  reveal: {
    approach: 3.5, hold: 4, withdraw: 6, camera: 0.35, swell: 0.5, clip: { 0: 'react', 1: 'react', 2: 'react' },
    mist: { thin: 0.25, backlight: 0.75 },
    guests: { 0: { depth: 0.55, light: 0.7, open: 0.4 }, 1: { depth: 0.6, light: 0.8, open: 0.4 }, 2: { depth: 0.52, light: 0.7, open: 0.4 } },
    byAction: {
      // Storm: a fast surge, sails fold, cores go cold, the mist churns.
      storm: { approach: 1.4, hold: 3, withdraw: 5, swell: 0.8, mist: { churn: 3, backlight: 0.35, density: 1.1 }, guests: { 0: { depth: 0.62, light: 0.25, open: -0.8, rise: -0.6 }, 1: { depth: 0.66, light: 0.3, open: -0.8, rise: -0.6 }, 2: { depth: 0.6, light: 0.25, open: -0.8, rise: -0.6 } } },
      // Silence: they turn away and sink; the mist closes.
      silence: { approach: 4, hold: 6, withdraw: 7, camera: 0.2, swell: 0.3, mist: { density: 1.25, backlight: 0.3, thin: 0 }, guests: { 0: { depth: 0.12, light: 0.08, face: -1.3, rise: -1.2 }, 1: { depth: 0.14, light: 0.1, face: 1.2, rise: -1.2 }, 2: { depth: 0.1, light: 0.08, face: 1.4, rise: -1.2 } } },
      // Call: the two side Guests rise high and bright; the centre keeps still.
      call: { approach: 4, hold: 5, withdraw: 7, swell: 0.6, mist: { thin: 0.3, backlight: 0.9 }, guests: { 0: { depth: 0.5, rise: 3.2, light: 0.9, open: 0.6 }, 1: { depth: 0.3, light: 0.5 }, 2: { depth: 0.48, rise: 3.6, light: 0.9, open: 0.6 } } },
    },
  },
  crisis: {
    approach: 4, hold: 10, withdraw: 10, camera: 0.9, swell: 1, clip: { 0: 'react', 2: 'react' },
    mist: { churn: 2.2, backlight: 0.95, density: 0.9, thin: 0.3 },
    guests: { 0: { depth: 0.74, scale: 2.9, light: 0.9, open: 0.7, rise: 1.4, face: -0.1 }, 1: { depth: 0.62, scale: 1.9, light: 1, open: 0.5, rise: -1.6, face: 0 }, 2: { depth: 0.76, scale: 2.7, light: 0.9, open: 0.7, rise: 1.6, face: 0.1 } },
  },
  vote: {
    approach: 8, hold: 25, withdraw: 10, camera: 0.7, swell: 0.6,
    mist: { thin: 0.6, backlight: 0.7, churn: 0.5 },
    // The one time they face the visitor squarely, still and lit: the question is theirs too.
    guests: { 0: { depth: 0.64, light: 0.75, face: 0, rise: 0.6 }, 1: { depth: 0.66, light: 0.85, face: 0, rise: -0.6 }, 2: { depth: 0.62, light: 0.75, face: 0, rise: 0.7 } },
  },
  yes: { approach: 1.2, hold: 2, withdraw: 3, camera: 0.15, swell: 0.35, clip: { 1: 'react' }, mist: { thin: 0.2, backlight: 0.7 }, guests: { 1: { depth: 0.55, light: 1, open: 0.8 }, 0: { open: 0.3, light: 0.35 }, 2: { open: 0.3, light: 0.35 } } },
  no: { approach: 1.2, hold: 2, withdraw: 3, camera: 0, swell: 0.2, mist: { density: 1.1, backlight: 0.4 }, guests: { 1: { depth: 0.1, light: 0.05, open: -0.9, rise: -0.5 }, 0: { open: -0.4, light: 0.1 }, 2: { open: -0.4, light: 0.1 } } },
  drift: { approach: 6, hold: 4, withdraw: 7, camera: 0, swell: 0.12, mist: {}, guests: {} }, // filled per drift from the seeded schedule
});

/** Gap in seconds between two drifts, and the first after entering (seeded). */
export const DRIFT_GAP = Object.freeze({ first: [6, 16], next: [18, 58] });

function mergeDef(def, action) {
  const over = action && def.byAction && def.byAction[action];
  if (!over) return def;
  const guests = { ...def.guests };
  for (const k of Object.keys(over.guests || {})) guests[k] = { ...(guests[k] || {}), ...over.guests[k] };
  return { ...def, ...over, mist: { ...def.mist, ...(over.mist || {}) }, guests, clip: over.clip || def.clip };
}

/**
 * The stage. Call `update(t, dt)` every frame with the play clock (seconds) and read `state`.
 * Cues arrive through `cue(name, data)`; the seed, quality and reduced motion through their setters.
 */
export class GuestsStage {
  /** @param {{seed?: string|number, quality?: string, reducedMotion?: boolean}} [o] */
  constructor({ seed = 'season', quality = 'high', reducedMotion = false } = {}) {
    this.quality = QUALITY[quality] ? quality : 'high';
    this.reducedMotion = !!reducedMotion;
    this.now = 0;                // stage clock: the play clock plus the warp offset
    this.raw = 0; this.offset = 0; this.frozen = false;
    this.inside = false;
    this.shell = 0;
    this.moment = null;          // {name, action, def, start, dur, guestsDef}
    this.nextDrift = Infinity;
    this.drifts = 0;
    this.log = [];               // last moments, for QA and tests
    this.guests = REST.map((r) => ({ ...r, fade: 1, clip: 'idle', target: { ...r } }));
    this.mist = { ...REST_MIST };
    this.camera = 0;
    this.swell = 0;
    this.setSeed(seed);
  }

  /** Re-seeds the drift schedule (the season's Merkle root, so a season always breathes the same way). */
  setSeed(seed) {
    this.seed = String(seed == null ? 'season' : seed);
    this.rng = mulberry32(hashSeed(this.seed));
    this.drifts = 0;
    if (this.inside) this.scheduleDrift(true);
  }

  setQuality(q) { if (QUALITY[q]) this.quality = q; }
  setReducedMotion(on) { this.reducedMotion = !!on; }

  /** Slots on stage under the current quality. */
  get slots() { return slotsFor(QUALITY[this.quality].guests); }
  get count() { return QUALITY[this.quality].guests; }

  /** Iris entered Shell n: arm the stage (the first drift comes soon, seeded). */
  enter(n = 1) {
    this.inside = true; this.shell = n | 0;
    this.scheduleDrift(true);
  }

  /** Iris left: the Guests rest and the schedule stops. */
  exit() {
    this.inside = false;
    this.moment = null;
    this.nextDrift = Infinity;
  }

  scheduleDrift(first = false) {
    const [a, b] = first ? DRIFT_GAP.first : DRIFT_GAP.next;
    this.nextDrift = this.now + a + this.rng() * (b - a);
  }

  /** The next drift from the seeded sequence: which Guest, how far, how long. */
  drawDrift() {
    const r = this.rng;
    const slots = this.slots;
    const pick = r();
    const slot = slots.length > 1 && pick < 0.7 ? slots[1 + Math.floor(r() * (slots.length - 1))] : slots[0];
    const dx = (r() - 0.5) * 3.2;
    const depth = 0.08 + r() * 0.2;
    const hold = 3 + r() * 6;
    const light = 0.1 + r() * 0.2;
    this.drifts++;
    return { slot, dx, depth, hold, light, index: this.drifts };
  }

  /**
   * A moment request. `data.action` colours a reveal; `data.force` lets a cinematic restart the same
   * moment or override a stronger one. Returns true when the moment starts.
   */
  cue(name, data = {}) {
    if (name === 'enter') { this.enter(data.shell); return true; }
    if (name === 'exit') { this.exit(); return true; }
    const base = MOMENT_DEFS[name];
    if (!base) return false;
    const cur = this.moment;
    if (cur && !data.force) {
      const curLeft = cur.start + cur.dur - this.now;
      if (PRIORITY[cur.name] > PRIORITY[name] && curLeft > 0) return false;
      if (cur.name === name && curLeft > cur.def.withdraw) return false; // the same moment already runs: let it play
    }
    let def = mergeDef(base, data.action);
    let guestsDef = def.guests;
    let drift = null;
    if (name === 'drift') {
      drift = data.drift || this.drawDrift();
      def = { ...def, hold: drift.hold };
      guestsDef = { [drift.slot]: { depth: REST[drift.slot].depth + drift.depth, x: drift.dx, light: drift.light } };
    }
    this.moment = { name, action: data.action || null, def, guestsDef, start: this.now, dur: def.approach + def.hold + def.withdraw, drift };
    this.log.push({ name, action: data.action || null, at: this.now, slot: drift ? drift.slot : null });
    if (this.log.length > 24) this.log.shift();
    return true;
  }

  /** Strength 0..1 of the running moment at time t (approach → hold → withdraw), and its phase name. */
  strength(t) {
    const m = this.moment;
    if (!m) return { u: 0, phase: 'rest' };
    const e = t - m.start, d = m.def;
    if (e < 0) return { u: 0, phase: 'rest' };
    if (e < d.approach) return { u: smooth(e / d.approach), phase: 'approach' };
    if (e < d.approach + d.hold) return { u: 1, phase: 'hold' };
    if (e < m.dur) return { u: 1 - smooth((e - d.approach - d.hold) / d.withdraw), phase: 'withdraw' };
    return { u: 0, phase: 'done' };
  }

  /** Per frame: advances the schedule and eases the pose toward the moment's targets. */
  update(t, dt = 0) {
    dt = Math.max(0, Math.min(0.25, Number(dt) || 0));
    if (this.frozen) { this.offset = this.now - (Number(t) || 0); dt = 0; } // stills: the stage clock stands
    this.raw = Number(t) || 0;
    this.now = this.raw + this.offset;
    if (this.inside && this.now >= this.nextDrift) {
      if (!this.moment || this.moment.name === 'drift') { if (!this.reducedMotion) this.cue('drift'); else this.drawDrift(); }
      this.scheduleDrift();
    }
    let { u, phase } = this.strength(this.now);
    if (phase === 'done') { this.moment = null; u = 0; phase = 'rest'; }
    const m = this.moment;
    const d = m ? m.def : null;
    const slots = new Set(this.slots);
    // Targets. Under reduced motion the pose keys aim at the phase's end pose (one placement per phase,
    // behind a short fade) instead of travelling with the strength curve; light and sails still ease.
    const uPose = this.reducedMotion ? (phase === 'approach' || phase === 'hold' ? 1 : 0) : u;
    for (let i = 0; i < SLOTS; i++) {
      const g = this.guests[i], rest = REST[i];
      const over = (m && m.guestsDef[i]) || null;
      const tg = g.target;
      for (const k of ['depth', 'x', 'rise', 'scale', 'light', 'open', 'face']) {
        const want = over && over[k] != null ? over[k] : rest[k];
        tg[k] = lerp(rest[k], want, k === 'light' || k === 'open' ? u : uPose);
      }
      // Clips: the moment's own while it holds; approach / recede while the Guest travels toward or from the glass.
      const moved = over && over.depth != null && over.depth > rest.depth + 0.12;
      let clip = 'idle';
      if (m && phase === 'approach' && moved) clip = 'approach';
      else if (m && phase === 'withdraw' && moved) clip = 'recede';
      else if (m && d.clip && d.clip[i] && phase === 'hold') clip = d.clip[i];
      else if (m && d.clip && d.clip[i] && phase === 'approach') clip = d.clip[i];
      g.clip = slots.has(i) && !this.reducedMotion ? clip : (slots.has(i) && m && d.clip && d.clip[i] && phase === 'hold' ? d.clip[i] : 'idle');
      g.onStage = slots.has(i);
    }
    // Pose: ease toward the targets; under reduced motion the pose is set in place behind a short fade.
    const travelRate = m && phase === 'approach' ? 1.6 : 0.9;
    for (let i = 0; i < SLOTS; i++) {
      const g = this.guests[i], tg = g.target;
      if (!this.reducedMotion) {
        for (const k of ['depth', 'x', 'rise', 'scale', 'face']) g[k] = ease(g[k], tg[k], travelRate, dt);
        g.fade = ease(g.fade, g.onStage ? 1 : 0, 3, dt);
      } else {
        const far = Math.abs(g.depth - tg.depth) > 0.02 || Math.abs(g.x - tg.x) > 0.1 || Math.abs(g.rise - tg.rise) > 0.1 || Math.abs(g.scale - tg.scale) > 0.03;
        if (far && g.fade > 0.05) g.fade = ease(g.fade, 0, 6, dt);
        else {
          if (far) for (const k of ['depth', 'x', 'rise', 'scale', 'face']) g[k] = tg[k];
          g.fade = ease(g.fade, g.onStage ? 1 : 0, 4, dt);
        }
        g.face = tg.face;
      }
      g.light = ease(g.light, tg.light, 2.5, dt);
      g.open = ease(g.open, tg.open, 2, dt);
    }
    // Mist, camera and sound follow the moment's strength.
    const mistDef = m ? d.mist : {};
    this.mist.density = ease(this.mist.density, lerp(REST_MIST.density, mistDef.density ?? REST_MIST.density, u), 1.2, dt);
    this.mist.churn = this.reducedMotion ? 0 : ease(this.mist.churn, lerp(REST_MIST.churn, mistDef.churn ?? REST_MIST.churn, u), 1.5, dt);
    this.mist.backlight = ease(this.mist.backlight, lerp(REST_MIST.backlight, mistDef.backlight ?? REST_MIST.backlight, u), 1.5, dt);
    this.mist.thin = ease(this.mist.thin, lerp(REST_MIST.thin, mistDef.thin ?? REST_MIST.thin, u), 1.2, dt);
    this.camera = this.reducedMotion ? 0 : ease(this.camera, m ? d.camera * u : 0, 1.2, dt);
    this.swell = ease(this.swell, m ? d.swell * u : 0, m && phase === 'approach' ? 1.4 : 0.8, dt);
    return this.state;
  }

  /**
   * QA and stills: advances the stage clock by `seconds` in small steps without waiting for frames
   * (the clock then stays ahead of the play clock by that much). Never used by the game itself.
   */
  warp(seconds, step = 0.05) {
    const n = Math.max(0, Math.floor((Number(seconds) || 0) / step));
    for (let i = 0; i < n; i++) { this.offset += step; this.update(this.raw, step); }
    return this.now;
  }

  /** QA and stills: holds the stage clock (and every eased value) where it is until released. */
  freeze(on = true) { this.frozen = !!on; }

  /** The Guest nearest to the glass (for the sound position and the camera). */
  get nearest() {
    let best = null;
    for (const i of this.slots) { const g = this.guests[i]; if (!best || g.depth > best.depth) best = g; }
    return best;
  }

  get state() {
    const { u, phase } = this.strength(this.now);
    return {
      now: this.now, inside: this.inside, shell: this.shell, quality: this.quality, reducedMotion: this.reducedMotion,
      moment: this.moment ? { name: this.moment.name, action: this.moment.action, phase, u, slot: this.moment.drift ? this.moment.drift.slot : null } : null,
      nextDrift: this.nextDrift, drifts: this.drifts, seed: this.seed,
      guests: this.guests.map((g, i) => ({ slot: i, onStage: !!g.onStage, depth: g.depth, x: g.x, rise: g.rise, scale: g.scale, light: g.light, open: g.open, face: g.face, fade: g.fade, clip: g.clip })),
      mist: { ...this.mist }, camera: this.camera, swell: this.swell, log: this.log.slice(),
    };
  }
}
