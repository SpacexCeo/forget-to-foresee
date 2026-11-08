// Offline mix to picture, from the cue logs the cinematic runner records while a shot is captured: every
// `audio.play()` the game asked for (with its gain, rate and position relative to the camera), the zone
// and tension changes that drive the ambience beds and the three music stems, the Guest's stroke voice,
// and the script's own cues (stingers under title cards, music overrides). The result is the same
// material the game plays (game/public/assets/audio, all synthesized in-house) laid out sample-exactly on
// the final timeline: no third-party music, no recording of a browser. Pure JS on float32 buffers; ffmpeg
// only decodes the Ogg files and later muxes the WAV.
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePcm, writeWav } from './ffmpeg.mjs';
import { AUDIO_MANIFEST } from '../../../game/src/audio/manifest.js';
import { tensionMix, zoneMix, guestPlan, dbToGain } from '../../../game/src/audio/mix.js';
import { humPositions } from '../../../game/src/play/ambience.js';

const RATE = 48000;
/** Bus levels: the game's defaults (slider² law: music .6 → .36, sfx .85 → .72) shaped a little for a mix without a listener's hand on the sliders. */
export const LEVELS = Object.freeze({ music: 0.34, sfx: 0.72, amb: 0.5, wind: 0.6, hum: 0.55, master: 0.9 });
const DUCK = { music: dbToGain(-9), amb: dbToGain(-6), attack: 0.05, release: 0.45 };
const DUCK_KINDS = new Set(['voice', 'sting']);

class SoundBank {
  constructor(assetsDir, cacheDir) { this.dir = assetsDir; this.cache = cacheDir; this.buffers = new Map(); mkdirSync(cacheDir, { recursive: true }); }
  get(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    const meta = AUDIO_MANIFEST.sounds[name];
    if (!meta) return null;
    const cached = join(this.cache, name + '.f32');
    let pcm;
    if (existsSync(cached)) { const b = readFileSync(cached); pcm = new Float32Array(b.buffer, b.byteOffset, b.length / 4); }
    else { pcm = decodePcm(join(this.dir, meta.file), RATE); writeFileSync(cached, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length * 4)); }
    this.buffers.set(name, pcm);
    return pcm;
  }
}

/** Deterministic variant choice for a group (the game avoids repeating the last variant; so do we). */
function resolveName(name, seed, last) {
  const g = AUDIO_MANIFEST.groups[name];
  if (!g) return AUDIO_MANIFEST.sounds[name] ? name : null;
  const pool = g.filter((v) => v !== last);
  return pool[Math.abs(seed) % pool.length];
}

/** Inverse-distance attenuation as the game's PannerNode (refDistance, rolloffFactor). */
function distanceGain(d, meta) {
  if (!(d >= 0)) return 1;
  const ref = meta.ref ?? 3, roll = meta.rolloff ?? 1;
  return ref / (ref + roll * Math.max(0, d - ref));
}
/** Equal-power stereo gains from pan −1..1. */
const panGains = (pan) => { const a = ((Math.max(-1, Math.min(1, pan || 0)) + 1) * Math.PI) / 4; return [Math.cos(a), Math.sin(a)]; };

/**
 * Adds a one-shot into `out` at `at` seconds with gain, rate (resampled), pan and an optional per-sample gain curve.
 * Stereo sources keep their image when pan is 0; mono sources are panned.
 */
function addSound(out, pcm, { at, gain = 1, rate = 1, pan = 0, loop = false, loopEnd = null, until = null, env = null }) {
  const total = out.length / 2;
  const start = Math.max(0, Math.round(at * RATE));
  const srcFrames = pcm.length / 2;
  const loopFrames = loop ? Math.min(srcFrames, Math.round((loopEnd ?? srcFrames / RATE) * RATE)) : srcFrames;
  const endFrame = until != null ? Math.min(total, Math.round(until * RATE)) : loop ? total : Math.min(total, start + Math.ceil(loopFrames / rate));
  const [gl, gr] = panGains(pan);
  for (let i = start; i < endFrame; i++) {
    let s = (i - start) * rate;
    if (loop) s %= loopFrames; else if (s >= srcFrames - 1) break;
    const i0 = Math.floor(s), f = s - i0, i1 = Math.min(srcFrames - 1, i0 + 1);
    const l = pcm[i0 * 2] + (pcm[i1 * 2] - pcm[i0 * 2]) * f;
    const r = pcm[i0 * 2 + 1] + (pcm[i1 * 2 + 1] - pcm[i0 * 2 + 1]) * f;
    const g = gain * (env ? env(i / RATE) : 1);
    // pan: mono-like sources go through the equal-power law; a stereo image is only balanced
    out[i * 2] += (l * gl + (pan > 0 ? 0 : 0)) * g * (pan ? 1 : 1) * (pan ? 1 : 1);
    out[i * 2 + 1] += r * gr * g;
    if (!pan) { out[i * 2] += l * g * (1 - gl); out[i * 2 + 1] += r * g * (1 - gr); }
  }
}

/** Piecewise-linear gain automation: set(t, value, rampSeconds) then at(t). */
class Automation {
  constructor(v0 = 0) { this.pts = [{ t: -Infinity, v: v0 }]; }
  set(t, v, ramp = 0) {
    const cur = this.at(t);
    this.pts = this.pts.filter((p) => p.t < t);
    this.pts.push({ t, v: cur }, { t: t + Math.max(1e-4, ramp), v });
  }
  at(t) {
    const p = this.pts;
    if (t >= p[p.length - 1].t) return p[p.length - 1].v;
    let i = 1; while (p[i].t < t) i++;
    const a = p[i - 1], b = p[i];
    if (!Number.isFinite(a.t)) return a.v;
    return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
  }
}

/** A camera log [[t, x, y, z, rx, ry, rz], ...] → interpolated camera pose at time t. */
function cameraAt(log, t) {
  if (!log.length) return null;
  let lo = 0, hi = log.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (log[m][0] < t) lo = m + 1; else hi = m; }
  return log[Math.max(0, lo)];
}
function spatialFrom(cam, pos) {
  if (!cam) return { pan: 0, dist: 0 };
  const dx = pos[0] - cam[1], dy = pos[1] - cam[2], dz = pos[2] - cam[3];
  const dist = Math.hypot(dx, dy, dz);
  const pan = dist > 1e-3 ? Math.max(-1, Math.min(1, (dx * cam[4] + dy * cam[5] + dz * cam[6]) / dist)) : 0;
  return { pan, dist };
}

/**
 * Mixes a video.
 * @param {{shots: Array<{start:number, duration:number, cues:object[], camLog:number[][]}>, duration:number,
 *          assetsDir:string, cacheDir:string, out:string, music?:{gain?:number, tension?:number, fadeOut?:number}}} o
 * @returns {{peak:number, events:number, wav:string}}
 */
export function mixVideo({ shots, duration, assetsDir, cacheDir, out, music = {}, levels = LEVELS }) {
  const bank = new SoundBank(assetsDir, cacheDir);
  const frames = Math.ceil(duration * RATE);
  const busMusic = new Float32Array(frames * 2), busAmb = new Float32Array(frames * 2), busSfx = new Float32Array(frames * 2);
  const duckers = []; // [from, to] intervals of voice/sting
  let events = 0;

  // 1. Flatten the cue logs onto the final timeline.
  const cues = [];
  for (const s of shots) for (const c of s.cues) {
    const t = s.start + c.t;
    if (c.t < -0.001 || c.t > s.duration + 0.001) { if (c.kind === 'zone' || c.kind === 'tension') cues.push({ ...c, t: Math.max(s.start, Math.min(s.start + s.duration, t)), shot: s }); continue; }
    cues.push({ ...c, t, shot: s });
  }
  cues.sort((a, b) => a.t - b.t);

  // 2. Music: three synced stems looping from 0, mixed by the tension timeline (script overrides win).
  const tension = new Automation(10);
  let override = null;
  for (const c of cues) {
    if (c.kind === 'tension' && override == null) tension.set(c.t, c.tension, 1.2);
    if (c.kind === 'music') { if (c.tension != null) { override = c.tension; tension.set(c.t, c.tension, 2.0); } }
  }
  if (music.tension != null) { tension.pts = [{ t: -Infinity, v: music.tension }]; }
  const musicGain = new Automation(0);
  musicGain.set(0, music.gain ?? 1, 0.8);
  for (const c of cues) if (c.kind === 'music' && c.gain != null) musicGain.set(c.t, c.gain, 1.5);
  const fadeOut = music.fadeOut ?? 1.6;
  const stems = ['mus_calm', 'mus_uneasy', 'mus_crisis'];
  const stemPcm = stems.map((n) => bank.get(n));
  const stemDur = AUDIO_MANIFEST.sounds.mus_calm.dur;
  for (let i = 0; i < frames; i++) {
    const t = i / RATE;
    const m = tensionMix(tension.at(t));
    const g = musicGain.at(t) * (t > duration - fadeOut ? Math.max(0, (duration - t) / fadeOut) : 1);
    const s = (i % Math.round(stemDur * RATE));
    const w = [m.calm, m.uneasy, m.crisis];
    let l = 0, r = 0;
    for (let k = 0; k < 3; k++) if (w[k] > 0) { l += stemPcm[k][s * 2] * w[k]; r += stemPcm[k][s * 2 + 1] * w[k]; }
    busMusic[i * 2] = l * g; busMusic[i * 2 + 1] = r * g;
  }

  // 3. Ambience: wind, the zone bed (crossfaded like the game), the Shell hums spatialised from the camera log.
  const zoneAt = [];
  let zone = 'plaza';
  for (const c of cues) if (c.kind === 'zone') { zoneAt.push({ t: c.t, zone: zoneMix(c.zone).zone }); }
  if (!zoneAt.length || zoneAt[0].t > 0) zoneAt.unshift({ t: 0, zone: zoneAt.length ? zoneAt[0].zone : 'plaza' });
  const zoneOf = (t) => { let z = zoneAt[0].zone; for (const p of zoneAt) if (p.t <= t) z = p.zone; return z; };
  const windGain = new Automation(zoneMix(zoneOf(0)).wind), humGain = new Automation(zoneMix(zoneOf(0)).hum);
  for (const p of zoneAt) { windGain.set(p.t, zoneMix(p.zone).wind, 0.8); humGain.set(p.t, zoneMix(p.zone).hum, 1.5); }
  addSound(busAmb, bank.get('amb_wind'), { at: 0, loop: true, loopEnd: AUDIO_MANIFEST.sounds.amb_wind.dur, gain: levels.wind, env: (t) => windGain.at(t) });
  // Beds: one segment per zone change; 0.8 s in, 2.5 s out.
  const segs = [];
  zoneAt.forEach((p, i) => { const end = i + 1 < zoneAt.length ? zoneAt[i + 1].t : duration; segs.push({ from: p.t, to: end, zone: p.zone }); });
  for (const seg of segs) {
    const bed = zoneMix(seg.zone).bed;
    if (!bed) continue;
    const pcm = bank.get(bed);
    const env = (t) => Math.min(1, Math.max(0, (t - seg.from) / 0.8)) * (t > seg.to ? Math.max(0, 1 - (t - seg.to) / 2.5) : 1);
    addSound(busAmb, pcm, { at: seg.from, loop: true, loopEnd: AUDIO_MANIFEST.sounds[bed].dur, until: Math.min(duration, seg.to + 2.5), gain: levels.amb, env });
  }
  // Hums: four positional loops; pan and distance follow the captured camera, level follows the zone.
  const humCue = cues.find((c) => c.kind === 'hums');
  const humsPos = humCue ? humCue.positions : humPositions();
  const humPcm = bank.get('amb_shell_hum'), humMeta = AUDIO_MANIFEST.sounds.amb_shell_hum;
  for (const pos of humsPos) {
    for (const s of shots) {
      const log = s.camLog || [];
      if (!log.length) continue;
      const env = (t) => { const cam = cameraAt(log, t - s.start); const sp = spatialFrom(cam, pos); return humGain.at(t) * distanceGain(sp.dist, humMeta) * (0.7 + 0.3 * Math.max(0, 1 - sp.dist / 120)); };
      const panEnv = (t) => spatialFrom(cameraAt(log, t - s.start), pos).pan;
      addSpatialLoop(busAmb, humPcm, { from: s.start, to: s.start + s.duration, loopEnd: humMeta.dur, gain: levels.hum, env, panEnv });
    }
  }

  // 4. One-shots, the Guest voice and script cues.
  const last = new Map();
  cues.forEach((c, idx) => {
    if (c.kind === 'strokes') {
      for (const p of guestPlan(AUDIO_MANIFEST, c.strokes)) {
        const pcm = bank.get(p.name); if (!pcm) continue;
        const meta = AUDIO_MANIFEST.sounds[p.name];
        const g = levels.sfx * distanceGain(c.dist, meta);
        addSound(busSfx, pcm, { at: c.t + p.at, gain: g, rate: p.rate, pan: c.pan || 0 });
        duckers.push([c.t + p.at, c.t + p.at + meta.dur / p.rate]);
        events++;
      }
      return;
    }
    if (c.kind !== 'sound') return;
    const name = resolveName(c.name, idx * 7919 + Math.round(c.t * 1000), last.get(c.name));
    if (!name) return;
    const meta = AUDIO_MANIFEST.sounds[name];
    if (meta.kind === 'amb' || meta.kind === 'music' || c.loop) return; // loops are rebuilt above from the zone/hum state
    last.set(c.name, name);
    const pcm = bank.get(name); if (!pcm) return;
    const g = (c.gain ?? 1) * levels.sfx * distanceGain(c.dist, meta);
    if (g < 0.004) return;
    const at = c.t + (c.delay || 0);
    addSound(busSfx, pcm, { at, gain: g, rate: c.rate || 1, pan: c.pan || 0 });
    if (DUCK_KINDS.has(meta.kind)) duckers.push([at, at + meta.dur / (c.rate || 1)]);
    events++;
  });

  // 5. Ducking under voice and stingers, then the bus sum.
  const duckEnv = new Float32Array(frames);
  duckEnv.fill(1);
  for (const [a, b] of duckers) {
    const i0 = Math.max(0, Math.floor((a - DUCK.attack) * RATE)), i1 = Math.min(frames, Math.ceil((b + DUCK.release) * RATE));
    for (let i = i0; i < i1; i++) {
      const t = i / RATE;
      const w = t < a ? (t - (a - DUCK.attack)) / DUCK.attack : t > b ? 1 - (t - b) / DUCK.release : 1;
      duckEnv[i] = Math.min(duckEnv[i], 1 - Math.max(0, Math.min(1, w)));
    }
  }
  const out2 = new Float32Array(frames * 2);
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const d = duckEnv[i];
    const gm = DUCK.music + (1 - DUCK.music) * d, ga = DUCK.amb + (1 - DUCK.amb) * d;
    for (const ch of [0, 1]) {
      const v = (busMusic[i * 2 + ch] * levels.music * gm + busAmb[i * 2 + ch] * ga + busSfx[i * 2 + ch]) * levels.master;
      out2[i * 2 + ch] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
  }
  // Safety ceiling at -1 dBFS; loudnorm at the mux sets the final loudness.
  const ceil = dbToGain(-1);
  if (peak > ceil) { const k = ceil / peak; for (let i = 0; i < out2.length; i++) out2[i] *= k; }
  writeWav(out, out2, RATE, 2);
  return { peak, events, wav: out, cues: cues.length };
}

/** A looping mono source whose pan and gain move every 1024 frames (the Shell hums under a moving camera). */
function addSpatialLoop(out, pcm, { from, to, loopEnd, gain, env, panEnv }) {
  const total = out.length / 2;
  const start = Math.max(0, Math.round(from * RATE)), end = Math.min(total, Math.round(to * RATE));
  const loopFrames = Math.min(pcm.length / 2, Math.round(loopEnd * RATE));
  const block = 1024;
  for (let i = start; i < end; i += block) {
    const t = i / RATE;
    const g = gain * env(t);
    if (g < 0.002) continue;
    const [gl, gr] = panGains(panEnv(t));
    const n = Math.min(block, end - i);
    for (let k = 0; k < n; k++) {
      const s = (i + k) % loopFrames;
      const m = (pcm[s * 2] + pcm[s * 2 + 1]) * 0.5;
      out[(i + k) * 2] += m * gl * g; out[(i + k) * 2 + 1] += m * gr * g;
    }
  }
}
