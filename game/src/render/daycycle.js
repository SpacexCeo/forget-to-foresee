// Day cycle in the town (owner 11.11). No bright midday: early morning → evening → night with ground mist and
// moonlight → early morning, in one loop of eight minutes, every transition continuous. A session starts where the
// player's own clock falls on that loop (startPhase), give or take half a minute, so two sessions rarely open alike.
// The weather runs on its own seeded timeline per session (weatherTimeline): calm spells of clear sky or haze, and
// fronts of fog or rain (overcast → drizzle → rain, now and then a storm → drizzle → drying); rain shows up within
// ten minutes in about half the sessions. Pure schedule + look mixing, no three.js (node tests): the boot layer asks
// `cycleLook(t, lookFor, timeline)` every frame with the elapsed time and LookDev applies it (applyLookLive) with sky
// statistics interpolated between the KEYS, which are read from the GPU once when the town is entered
// (prepareCycle). Off on the jury path, under ?tod= / ?weather= / ?cycle=off, and held under reduced motion.

/** The loop: [hour, seconds held, seconds of the transition to the next hour]. */
export const KEYS = Object.freeze([
  Object.freeze(['dawn', 100, 70]),
  Object.freeze(['evening', 80, 40]),
  Object.freeze(['dusk', 30, 30]),
  Object.freeze(['twilight', 20, 30]),
  Object.freeze(['night', 110, 50]),
]);
export const DAY_CYCLE_LENGTH = KEYS.reduce((n, k) => n + k[1] + k[2], 0);
/** Seconds the weather takes to ease from one state of the timeline to the next. */
export const WEATHER_FADE = 12;

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * A session's weather: [[start s, name], ...] from 0 for `hours` hours. Calm spells (clear, sometimes haze) of a
 * few minutes alternate with fronts. The first front comes 2.5–9 minutes in and is rain more often than not; a rain
 * front is overcast → drizzle → rain (one in six a storm) → drizzle → clear while the ground dries; a fog front is
 * haze → fog → haze. Every state lasts long enough for the WEATHER_FADE ease to finish.
 */
export function weatherTimeline(seed, hours = 3) {
  const rnd = mulberry(seed), out = [];
  const span = (a, b) => a + rnd() * (b - a);
  let t = 0, first = true;
  const push = (name, len) => { out.push(Object.freeze([Math.round(t), name])); t += len; };
  while (t < hours * 3600) {
    // a calm spell
    push(rnd() < 0.75 ? 'clear' : 'haze', first ? span(150, 540) : span(180, 480));
    const rain = rnd() < (first ? 0.6 : 0.45);
    first = false;
    if (rain) {
      push('overcast', span(35, 60)); push('drizzle', span(40, 80));
      push(rnd() < 1 / 6 ? 'storm' : 'rain', span(100, 210)); push('drizzle', span(30, 60));
    } else { push('haze', span(40, 70)); push('fog', span(110, 220)); push('haze', span(40, 70)); }
  }
  return Object.freeze(out);
}

/** The timeline's weather at `t` seconds (clear without a timeline). */
export function weatherAt(timeline, t) {
  if (!timeline || !timeline.length) return 'clear';
  let w = timeline[0][1];
  for (const [at, name] of timeline) { if (at > t) break; w = name; }
  return w;
}

/**
 * Where a session starts on the loop, from the player's local time: before 9 early morning, through the day the
 * early morning turning to evening (there is no midday), evening from 15:00, dusk around 19:00, twilight, night
 * from 21:30 until 5:00; then up to ±30 s of chance so the same hour does not open the same way twice.
 * @param {Date} [date] @param {() => number} [random]
 */
export function startPhase(date = new Date(), random = Math.random) {
  const h = date.getHours() + date.getMinutes() / 60;
  // [local hour, loop seconds]: piecewise linear, wrapping at 24 h
  const MAP = [[5, 0], [9, 90], [15, 170], [18.5, 245], [20, 300], [21.5, 360], [29, 500]];
  const x = h < 5 ? h + 24 : h;
  let s = 0;
  for (let i = 0; i < MAP.length - 1; i++) {
    const [h0, s0] = MAP[i], [h1, s1] = MAP[i + 1];
    if (x >= h0 && x <= h1) { s = s0 + (s1 - s0) * (x - h0) / (h1 - h0); break; }
  }
  return (s + (random() * 60 - 30) + DAY_CYCLE_LENGTH) % DAY_CYCLE_LENGTH;
}

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * Where the loop is at `t` seconds: the two hours on either side and the eased blend between them.
 * @returns {{a:string, b:string, k:number, ia:number, ib:number, weather:'clear'|'overcast'|'rain', loop:number, s:number}}
 */
export function cycleAt(t, timeline = null, t0 = 0) {
  const T = Math.max(0, Number(t) || 0), w = weatherAt(timeline, T - t0);
  const loop = Math.floor(T / DAY_CYCLE_LENGTH), s = T - loop * DAY_CYCLE_LENGTH;
  let at = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const [name, hold, move] = KEYS[i], next = (i + 1) % KEYS.length;
    if (s < at + hold) return { a: name, b: name, k: 0, ia: i, ib: i, loop, s, weather: w };
    if (s < at + hold + move) return { a: name, b: KEYS[next][0], k: smooth((s - at - hold) / move), ia: i, ib: next, loop, s, weather: w };
    at += hold + move;
  }
  return { a: KEYS[0][0], b: KEYS[0][0], k: 0, ia: 0, ib: 0, loop, s, weather: w };
}

const lerp = (a, b, k) => a + (b - a) * k;
/** The value a look means when it leaves a numeric field out (sky.js reads `disc ?? 1`, the others as 0). */
const NUM_DEFAULT = Object.freeze({ disc: 1 });
/** Shortest-way blend of two azimuths in degrees. */
export const lerpAngle = (a, b, k) => { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * k; };

/** Numeric fields (and the nested fog) blended; the azimuth the short way round; anything else from the nearer look. */
export function mixLooks(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key], y = b[key];
    if (key === 'azimuth' && typeof x === 'number' && typeof y === 'number') out[key] = lerpAngle(x, y, k);
    else if (typeof x === 'number' && typeof y === 'number') out[key] = lerp(x, y, k);
    else if (typeof x === 'number' || typeof y === 'number') { const d = NUM_DEFAULT[key] ?? 0; out[key] = lerp(typeof x === 'number' ? x : d, typeof y === 'number' ? y : d, k); } // stars, disc, sunCool, sunWarm
    else if (key === 'fog' && x && y) out.fog = mixLooks(x, y, k);
    else out[key] = k < 0.5 ? (x !== undefined ? x : y) : (y !== undefined ? y : x);
  }
  return Object.freeze(out);
}

/**
 * The look at `t` seconds for a `lookFor(location, hour)` function, plus the keyframe indices and weight so the
 * caller can blend the sky statistics of the same two hours, and the weather of `timeline` at `t - t0` (the
 * session's own seconds: the loop clock starts at startPhase, the weather clock at 0).
 */
export function cycleLook(t, lookFor, timeline = null, t0 = 0) {
  const c = cycleAt(t, timeline, t0);
  return { ...c, look: mixLooks(lookFor(c.a), lookFor(c.b), c.k) };
}

/** Steps of the blend that were worth a full re-bake before the live path (kept for the archipelago's presets). */
export const BLEND_STEP = 0.04;
