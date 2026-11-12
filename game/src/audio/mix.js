// Pure audio logic (no WebAudio): volumes, tension -> stem mix, zones, variants, Guest stroke plans,
// listener orientation. Unit-tested in tests/client/audio.test.mjs.
import { CAMPS, PLAZA_RADIUS, PLATEAU_RADIUS, BALCONY_CENTER, BALCONY } from '../scenes/layout.js';

export const BUSES = Object.freeze(['master', 'music', 'sfx']);
export const DEFAULT_VOLUMES = Object.freeze({ master: 0.8, music: 0.6, sfx: 0.85 });
export const VOLUME_KEY = 'ftf.audio.v1';

export const clamp01 = (v) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : 0);
export const dbToGain = (d) => 10 ** (d / 20);
/** Slider position 0..1 -> linear gain (perceptual square law). */
export const sliderGain = (v) => clamp01(v) ** 2;

export function sanitizeVolumes(obj) {
  const out = { ...DEFAULT_VOLUMES };
  if (obj && typeof obj === 'object') for (const b of BUSES) if (b in obj && Number.isFinite(+obj[b])) out[b] = clamp01(obj[b]);
  return out;
}

/** storage: createSafeStorage-like ({getItem,setItem}) */
export function loadVolumes(storage) {
  try { const raw = storage?.getItem(VOLUME_KEY); return sanitizeVolumes(raw ? JSON.parse(raw) : null); } catch { return { ...DEFAULT_VOLUMES }; }
}
export function saveVolumes(storage, vols) {
  try { storage?.setItem(VOLUME_KEY, JSON.stringify(sanitizeVolumes(vols))); return true; } catch { return false; }
}

const STEMS = ['calm', 'uneasy', 'crisis'];
/** Equal-power crossfade of the three music stems for tension 0..100. */
export function tensionMix(t) {
  const x = Math.min(100, Math.max(0, Number.isFinite(+t) ? +t : 0));
  const xf = (a, b) => Math.min(1, Math.max(0, (x - a) / (b - a))) * Math.PI / 2;
  if (x <= 55) { const p = xf(30, 55); return { calm: Math.cos(p), uneasy: Math.sin(p), crisis: 0 }; }
  const p = xf(70, 90); return { calm: 0, uneasy: Math.cos(p), crisis: Math.sin(p) };
}
export function tensionBand(t) {
  const m = tensionMix(t); return STEMS.reduce((a, b) => (m[b] > m[a] ? b : a), 'calm');
}

/** Wind loudness relative to the first mix (owner 12.11: half as loud). */
export const WIND_SCALE = 0.5;

/** Zone -> camp bed and wind level. Camp ids follow layout.js (iris, sol, pepel, moh, yantar, iney). */
const CAMP_IDS = CAMPS.map((c) => c.id);
export const ZONES = Object.freeze(['plaza', 'balcony', 'bridge', 'shell', ...CAMP_IDS]);
export function zoneMix(zone) {
  let z = String(zone || 'plaza');
  if (z.startsWith('camp:')) z = z.slice(5);
  if (z === 'island' || z === 'scroll') z = 'plaza';
  // Owner 09.11: no constant low drone anywhere (wind and music stay). The Shell hum loops and the 82 Hz
  // inside-the-Shell bed were both steady drones, so `hum` is 0 and the Shell has no bed.
  // Owner 12.11: the wind at half its earlier level everywhere (WIND_SCALE).
  if (CAMP_IDS.includes(z)) return { zone: z, bed: 'amb_camp_' + z, wind: 0.55 * WIND_SCALE, hum: 0 };
  if (z === 'shell') return { zone: z, bed: null, wind: 0, hum: 0 };
  if (z === 'balcony' || z === 'bridge') return { zone: z, bed: null, wind: 1.0 * WIND_SCALE, hum: 0 };
  return { zone: 'plaza', bed: null, wind: 0.7 * WIND_SCALE, hum: 0 };
}

/** Zone of a ground position [x, y, z] on the island (use 'shell' yourself when inside a Shell). */
export function zoneAt(p) {
  const x = p?.[0] ?? p?.x ?? 0, z = p?.[2] ?? p?.z ?? 0;
  for (const c of CAMPS) if (Math.hypot(x - c.position[0], z - c.position[2]) <= PLATEAU_RADIUS) return c.id;
  if (Math.hypot(x, z) <= PLAZA_RADIUS) return 'plaza';
  if (Math.hypot(x - BALCONY_CENTER[0], z - BALCONY_CENTER[2]) <= BALCONY.size) return 'balcony';
  return 'bridge';
}

/** Name or group -> concrete sound name; avoids repeating the previous variant. */
export function resolveSound(manifest, name, rng = Math.random, last = null) {
  const g = manifest.groups?.[name];
  if (!g || !g.length) return manifest.sounds?.[name] ? name : null;
  if (g.length === 1) return g[0];
  const pool = g.filter((v) => v !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

export const STROKES = Object.freeze(['arc', 'spike', 'loop', 'drop']);
/**
 * Schedule the Guest voice to track a logogram's strokes: [{stroke, dur}] -> [{name, at, rate}].
 * Each stroke plays guest_<stroke>; its playback rate stretches it to the stroke's drawing time.
 */
export function guestPlan(manifest, strokes) {
  const out = []; let at = 0;
  for (const s of strokes || []) {
    const stroke = typeof s === 'string' ? s : s?.stroke;
    if (!STROKES.includes(stroke)) continue;
    const meta = manifest.sounds?.['guest_' + stroke];
    const nominal = meta?.strokeDur ?? 1.5;
    const dur = typeof s === 'object' && Number.isFinite(s.dur) && s.dur > 0 ? s.dur : nominal;
    out.push({ name: 'guest_' + stroke, at, rate: Math.min(1.6, Math.max(0.6, nominal / dur)) });
    at += dur;
  }
  return out;
}

/** Listener pose from a Three.js-style camera (matrixWorld column-major), optionally placed at target. */
export function listenerPose(camera, target) {
  const e = camera?.matrixWorld?.elements;
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  const forward = e ? norm([-e[8], -e[9], -e[10]]) : [0, 0, -1];
  const up = e ? norm([e[4], e[5], e[6]]) : [0, 1, 0];
  const src = target ?? camera?.position ?? (e ? [e[12], e[13], e[14]] : [0, 0, 0]);
  const pos = Array.isArray(src) ? src.slice(0, 3) : [src.x ?? 0, src.y ?? 0, src.z ?? 0];
  return { pos, forward, up };
}

export function validateManifest(m) {
  const errors = [];
  for (const [k, v] of Object.entries(m.sounds || {})) {
    if (v.file !== k + '.ogg') errors.push(k + ': file name');
    if (!(v.dur > 0)) errors.push(k + ': duration');
  }
  for (const [g, list] of Object.entries(m.groups || {})) for (const n of list) if (!m.sounds[n]) errors.push(g + ': missing ' + n);
  return errors;
}
