// Pure VFX logic (no three.js) so pooling, timing and tier rules are covered by node tests
// (tests/client/vfx.test.mjs). Used by the GPU particle system (particles.js) and the effect
// player (index.js).

/** Deterministic PRNG (mulberry32). Same seed, same effect: QA screenshots are reproducible. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Uniform sample in [range[0], range[1]] (a plain number is a fixed value). */
export const pick = (range, r) => (Array.isArray(range) ? lerp(range[0], range[1], r()) : range);

/**
 * Attack / hold / release envelope in [0, 1] at time t (seconds) for a layer of the given
 * duration. attack and release are seconds; they are shrunk proportionally when they do not fit.
 */
export function envelope(t, duration, attack = 0, release = 0) {
  if (t < 0 || t > duration) return 0;
  const sum = attack + release;
  if (sum > duration && sum > 0) { const k = duration / sum; attack *= k; release *= k; }
  if (attack > 0 && t < attack) return t / attack;
  if (release > 0 && t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

/** Per-tier VFX budget. low: fewer particles, no soft particles, no screen distortion, no lights. */
export const VFX_TIERS = Object.freeze({
  ultra: Object.freeze({ particleScale: 1.0, capacity: 6144, soft: true, distortion: true, lights: 3, offscreenScale: 1.0, arcs: 1.0 }),
  high: Object.freeze({ particleScale: 0.7, capacity: 4096, soft: true, distortion: true, lights: 2, offscreenScale: 0.5, arcs: 0.75 }),
  low: Object.freeze({ particleScale: 0.35, capacity: 2048, soft: false, distortion: false, lights: 0, offscreenScale: 1.0, arcs: 0.5 }),
});

export function tierConfig(tier) { return VFX_TIERS[tier] || VFX_TIERS.high; }

/** Particle count for a tier: scaled, rounded, never zero for a non-zero request. */
export function scaledCount(count, tier, scale = 1) {
  if (!(count > 0)) return 0;
  return Math.max(1, Math.round(count * tierConfig(tier).particleScale * scale));
}

/**
 * Ring allocator for GPU particle slots. Particles are stateless on the GPU (position is a
 * function of birth time), so a burst just claims the next slots in ring order. When the ring is
 * full the oldest slots are reused; `stolen` counts slots that were still alive at that moment
 * (a budget signal for the dev HUD, never an error).
 */
export class SlotRing {
  constructor(capacity) {
    if (!(capacity > 0)) throw new Error('SlotRing capacity must be positive');
    this.capacity = capacity | 0;
    this.head = 0;
    this.used = 0;          // high-water mark (instances that ever held a particle)
    this.deathTime = new Float64Array(this.capacity).fill(-Infinity);
    this.stolen = 0;
  }

  /**
   * Claims n slots for particles that die at `deaths[i]` (or one shared death time). Returns
   * contiguous ranges [{start, count}] (two ranges when the claim wraps around the end).
   */
  allocate(n, now, deaths) {
    n = Math.min(n | 0, this.capacity);
    const ranges = [];
    if (n <= 0) return ranges;
    let left = n, i = 0;
    while (left > 0) {
      const start = this.head;
      const count = Math.min(left, this.capacity - start);
      for (let k = 0; k < count; k++, i++) {
        if (this.deathTime[start + k] > now) this.stolen++;
        this.deathTime[start + k] = Array.isArray(deaths) || ArrayBuffer.isView(deaths) ? deaths[i] : deaths;
      }
      ranges.push({ start, count });
      this.head = (start + count) % this.capacity;
      this.used = Math.max(this.used, start + count);
      left -= count;
    }
    return ranges;
  }

  /** Number of slots holding a particle that is alive at `now`. */
  live(now) {
    let n = 0;
    for (let i = 0; i < this.used; i++) if (this.deathTime[i] > now) n++;
    return n;
  }

  /** Latest death time of any slot (the batch can be hidden after it). */
  lastDeath() {
    let m = -Infinity;
    for (let i = 0; i < this.used; i++) if (this.deathTime[i] > m) m = this.deathTime[i];
    return m;
  }
}

/** Reuses objects (meshes, lights) up to a fixed capacity; acquire returns null when exhausted. */
export class ObjectPool {
  constructor(factory, capacity) {
    this.factory = factory;
    this.capacity = capacity;
    this.free = [];
    this.busy = new Set();
    this.created = 0;
  }

  acquire() {
    let o = this.free.pop();
    if (!o) {
      if (this.created >= this.capacity) return null;
      o = this.factory(this.created++);
    }
    this.busy.add(o);
    return o;
  }

  release(o) {
    if (!this.busy.delete(o)) return false;
    this.free.push(o);
    return true;
  }

  get size() { return this.busy.size; }
  all() { return [...this.free, ...this.busy]; }
}

/**
 * Effect timeline: walks an effect definition's layers (presets.js) over time and reports which
 * layers start, are running and end. A layer is {at, dur?, ...}: `at` is its start (s) relative to
 * play(); `dur` its length (bursts are instantaneous, dur 0). Looping effects keep their stream
 * layers running until stop() and re-fire their `every` layers each period.
 */
export class Timeline {
  constructor(def, { timeScale = 1 } = {}) {
    this.def = def;
    this.t = 0;
    this.timeScale = timeScale;
    this.stopped = false;
    this.stopAt = Infinity;
    this.fired = new Set();      // non-repeating layer indices already started
    this.repeats = new Map();    // layer index -> next fire time for `every` layers
    this.ended = new Set();
  }

  get duration() { return this.def.duration; }

  /** Length of a layer; Infinity for a stream layer in a looping effect until stop(). */
  layerEnd(i) {
    const L = this.def.layers[i];
    if (this.def.loop && L.dur === undefined && L.kind !== 'burst') return this.stopAt + (L.release || 0);
    return L.at + (L.dur || 0);
  }

  /** Stop a looping effect: streams wind down, nothing new starts. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.stopAt = this.t;
  }

  /**
   * Advance by dt seconds. Returns {start: [layerIndex], end: [layerIndex], done}. Layers whose
   * start falls inside (t, t + dt] start this step, in definition order.
   */
  advance(dt) {
    const t0 = this.t;
    const t1 = t0 + dt * this.timeScale;
    this.t = t1;
    const start = [], end = [];
    const layers = this.def.layers;
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      if (L.every > 0) {
        let next = this.repeats.has(i) ? this.repeats.get(i) : L.at;
        while (next <= t1 && !(this.stopped && next > this.stopAt) && (this.def.loop || next <= this.def.duration)) {
          if (next > t0 || (t0 === 0 && next === 0)) start.push(i);
          next += L.every;
        }
        this.repeats.set(i, next);
        continue;
      }
      if (!this.fired.has(i) && (L.at <= t1) && !(this.stopped && L.at > this.stopAt)) {
        this.fired.add(i);
        start.push(i);
      }
      if (this.fired.has(i) && !this.ended.has(i) && this.layerEnd(i) <= t1) {
        this.ended.add(i);
        end.push(i);
      }
    }
    return { start, end, done: this.done };
  }

  /** Finished: past the duration (one-shot) or stopped and every stream has wound down (loop). */
  get done() {
    if (!this.def.loop) return this.t >= this.def.duration;
    if (!this.stopped) return false;
    let rel = 0;
    for (const L of this.def.layers) rel = Math.max(rel, L.release || 0);
    return this.t >= this.stopAt + rel;
  }

  /** Local time inside layer i, or -1 when it is not running. */
  localTime(i) {
    const L = this.def.layers[i];
    if (this.t < L.at || this.t > this.layerEnd(i)) return -1;
    return this.t - L.at;
  }
}

/**
 * Lightning polyline between a and b ([x,y,z]) by midpoint displacement. `depth` subdivisions give
 * 2^depth segments; displacement shrinks by `roughness` per level. Deterministic for a seed.
 */
export function lightningPath(a, b, { seed = 1, depth = 5, jitter = 0.18, roughness = 0.55 } = {}) {
  const r = rng(seed);
  let pts = [a.slice(), b.slice()];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  let amp = len * jitter;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      next.push([
        (p[0] + q[0]) / 2 + (r() * 2 - 1) * amp,
        (p[1] + q[1]) / 2 + (r() * 2 - 1) * amp * 0.5,
        (p[2] + q[2]) / 2 + (r() * 2 - 1) * amp,
      ], q);
    }
    pts = next;
    amp *= roughness;
  }
  return pts;
}

/** Shape sampler for emitters: returns a local offset [x,y,z] for one particle. */
export function sampleShape(shape, r) {
  const s = shape || { type: 'point' };
  const R = s.radius || 0;
  switch (s.type) {
    case 'sphere': {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = R * Math.cbrt(r());
      const k = Math.sqrt(1 - u * u);
      return [Math.cos(th) * k * rad, u * rad * (s.flatten ?? 1), Math.sin(th) * k * rad];
    }
    case 'disc': {
      const th = r() * Math.PI * 2, rad = R * Math.sqrt(r());
      return [Math.cos(th) * rad, (r() - 0.5) * (s.height || 0), Math.sin(th) * rad];
    }
    case 'ring': {
      const th = r() * Math.PI * 2, rad = R + (r() - 0.5) * (s.width || 0);
      return [Math.cos(th) * rad, (r() - 0.5) * (s.height || 0), Math.sin(th) * rad];
    }
    case 'box': {
      const e = s.size || [1, 1, 1];
      return [(r() - 0.5) * e[0], (r() - 0.5) * e[1], (r() - 0.5) * e[2]];
    }
    case 'line': {
      // From the emitter origin along `dir` for `length` metres.
      const d = s.dir || [0, 1, 0], t = r() * (s.length || 1);
      return [d[0] * t, d[1] * t, d[2] * t];
    }
    default: return [0, 0, 0];
  }
}
