// Day cycle in the town (owner 11.11). No bright midday: early morning → evening → night with ground mist and
// moonlight → early morning, in one loop of eight minutes, every transition continuous. Rain may visit the evening
// and the night of every second loop. Pure schedule + look mixing, no three.js (node tests): the boot layer asks
// `cycleLook(t)` every frame with the elapsed time and LookDev applies it (applyLookLive) with sky statistics
// interpolated between the KEYS, which are read from the GPU once when the town is entered (prepareCycle).
// Off on the jury path, under ?tod= / ?weather= / ?cycle=off, and held under reduced motion.

/** The loop: [hour, seconds held, seconds of the transition to the next hour]. */
export const KEYS = Object.freeze([
  Object.freeze(['dawn', 100, 70]),
  Object.freeze(['evening', 80, 40]),
  Object.freeze(['dusk', 30, 30]),
  Object.freeze(['twilight', 20, 30]),
  Object.freeze(['night', 110, 50]),
]);
export const DAY_CYCLE_LENGTH = KEYS.reduce((n, k) => n + k[1] + k[2], 0);
/** Rain inside every second loop, seconds from the loop start: it gathers in the evening and clears in the night. */
export const RAIN_WINDOW = Object.freeze({ overcast: 175, rain: 200, clear: 330 });
/** Seconds the weather takes to ease in and out (LookDev's weather already eases; this sets the schedule's edges). */
export const WEATHER_FADE = 8;

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * Where the loop is at `t` seconds: the two hours on either side and the eased blend between them.
 * @returns {{a:string, b:string, k:number, ia:number, ib:number, weather:'clear'|'overcast'|'rain', loop:number, s:number}}
 */
export function cycleAt(t) {
  const T = Math.max(0, Number(t) || 0);
  const loop = Math.floor(T / DAY_CYCLE_LENGTH), s = T - loop * DAY_CYCLE_LENGTH;
  let at = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const [name, hold, move] = KEYS[i], next = (i + 1) % KEYS.length;
    if (s < at + hold) return withWeather({ a: name, b: name, k: 0, ia: i, ib: i, loop, s });
    if (s < at + hold + move) return withWeather({ a: name, b: KEYS[next][0], k: smooth((s - at - hold) / move), ia: i, ib: next, loop, s });
    at += hold + move;
  }
  return withWeather({ a: KEYS[0][0], b: KEYS[0][0], k: 0, ia: 0, ib: 0, loop, s });
}
function withWeather(c) {
  let weather = 'clear';
  if (c.loop % 2 === 1 && c.s >= RAIN_WINDOW.overcast && c.s < RAIN_WINDOW.clear) weather = c.s < RAIN_WINDOW.rain ? 'overcast' : 'rain';
  return { ...c, weather };
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
 * caller can blend the sky statistics of the same two hours.
 */
export function cycleLook(t, lookFor) {
  const c = cycleAt(t);
  return { ...c, look: mixLooks(lookFor(c.a), lookFor(c.b), c.k) };
}

/** Steps of the blend that were worth a full re-bake before the live path (kept for the archipelago's presets). */
export const BLEND_STEP = 0.04;
