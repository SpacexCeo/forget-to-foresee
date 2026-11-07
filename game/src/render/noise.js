// Shared tileable noise texture for the sky and the cloud sea. Shader-side hash noise costs ~4
// hashes per octave per sample; a raymarched cloud sea takes thousands of samples per pixel, so the
// octaves are pre-baked on the CPU once (128x128 RGBA8, ~20 ms) and fetched with hardware filtering:
//   R  value-noise fbm, periods 4..32 (large billows)
//   G  value-noise fbm, periods 8..64 (detail)
//   B  inverted Worley (cellular), period 6: cauliflower cloud tops
//   A  inverted Worley, period 12: finer puffs
// Deterministic (seeded), repeat-wrapped, mipmapped.
import * as THREE from 'three';

const N = 128;

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Periodic value noise sampled on the N x N grid. */
function valueOctave(period, rnd) {
  const lat = new Float32Array(period * period).map(() => rnd());
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * period, fy = (y / N) * period;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const g = (i, j) => lat[((j % period) * period) + (i % period)];
    const a = g(ix, iy), b = g(ix + 1, iy), c = g(ix, iy + 1), d = g(ix + 1, iy + 1);
    out[y * N + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  return out;
}

function fbm(periods, rnd) {
  const out = new Float32Array(N * N);
  let amp = 0.5, sum = 0;
  for (const p of periods) {
    const o = valueOctave(p, rnd);
    for (let i = 0; i < out.length; i++) out[i] += o[i] * amp;
    sum += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

function worley(period, rnd) {
  const pts = [];
  for (let j = 0; j < period; j++) for (let i = 0; i < period; i++) pts.push([i + rnd(), j + rnd()]);
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * period, fy = (y / N) * period;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    let best = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = cx + di, j = cy + dj;
      const p = pts[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
      const dx = i + (p[0] - Math.floor(p[0])) - fx, dy = j + (p[1] - Math.floor(p[1])) - fy;
      best = Math.min(best, dx * dx + dy * dy);
    }
    out[y * N + x] = 1 - Math.min(1, Math.sqrt(best));
  }
  return out;
}

let cached = null;

/** @returns {THREE.DataTexture} the shared noise texture (created on first use). */
export function getNoiseTexture() {
  if (cached) return cached;
  const rnd = mulberry(1979);
  const ch = [fbm([4, 8, 16, 32], rnd), fbm([8, 16, 32, 64], rnd), worley(6, rnd), worley(12, rnd)];
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(Math.min(1, Math.max(0, ch[c][i])) * 255);
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.name = 'ftf_noise';
  t.needsUpdate = true;
  cached = t;
  return t;
}
