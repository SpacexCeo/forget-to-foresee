// Day cycle in the town (owner 11.11: "the reworked lighting and weather never show in normal play").
// A slow loop: afternoon → dusk (lamps and windows light up) → afternoon, and every second loop a shower of rain
// during the afternoon. Pure schedule + preset mixing, no three.js, so the rules are covered by node tests; the
// boot layer feeds the result to LookDev (applyLook / setWeather). Off on the jury path, under ?tod= / ?weather=,
// and under reduced motion (the scene stays on its default hour there).

/** Phase lengths in seconds. One loop is 6 minutes. */
export const DAY_CYCLE = Object.freeze({ day: 150, toDusk: 45, dusk: 120, toDay: 45 });
export const DAY_CYCLE_LENGTH = DAY_CYCLE.day + DAY_CYCLE.toDusk + DAY_CYCLE.dusk + DAY_CYCLE.toDay;
/** Rain window inside the day phase of every second loop (seconds from the loop start). */
export const RAIN_WINDOW = Object.freeze({ overcast: 20, rain: 35, clear: 110 });

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * Where the loop is at `t` seconds: the blend from the day preset to dusk (`k` 0 = day, 1 = dusk) and the weather.
 * @returns {{k:number, weather:'clear'|'overcast'|'rain', loop:number}}
 */
export function cycleAt(t) {
  const T = Math.max(0, t);
  const loop = Math.floor(T / DAY_CYCLE_LENGTH), s = T - loop * DAY_CYCLE_LENGTH;
  const { day, toDusk, dusk } = DAY_CYCLE;
  let k;
  if (s < day) k = 0;
  else if (s < day + toDusk) k = smooth((s - day) / toDusk);
  else if (s < day + toDusk + dusk) k = 1;
  else k = 1 - smooth((s - day - toDusk - dusk) / DAY_CYCLE.toDay);
  let weather = 'clear';
  if (loop % 2 === 1 && s >= RAIN_WINDOW.overcast && s < RAIN_WINDOW.clear) weather = s < RAIN_WINDOW.rain ? 'overcast' : 'rain';
  return { k, weather, loop };
}

const lerp = (a, b, k) => a + (b - a) * k;

/** Numeric fields (and the nested fog) blended; anything else from the nearer preset. */
export function mixLooks(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key], y = b[key];
    if (typeof x === 'number' && typeof y === 'number') out[key] = lerp(x, y, k);
    else if (key === 'fog' && x && y) out.fog = mixLooks(x, y, k);
    else out[key] = k < 0.5 ? (x !== undefined ? x : y) : (y !== undefined ? y : x);
  }
  return Object.freeze(out);
}

/** Steps of the blend that are worth re-baking the sky for (a re-bake reads the sky LUT back, a few ms). */
export const BLEND_STEP = 0.04;
