// Quality tiers for the 3D client (spec 10: 60 FPS desktop, <= 120 draw calls, <= 500k triangles;
// decisions 07.11: minimum spec RTX 2060 Super, quality first). Pure data plus a GPU-string
// heuristic and a frame-time governor, no three.js, so the tier rules are covered by node tests.
//
//   ultra  RTX 3060 Ti class and up: 1.5x pixel ratio cap, MSAA 4x + SMAA, 4k shadows, full-res
//          GTAO (4 slices), 28-step raymarched cloud sea, half-res god rays, dense grass.
//   high   the minimum spec (RTX 2060 Super, 1080p, 60 fps): MSAA 4x, 2k shadows, half-res GTAO
//          (2 slices), 16-step clouds, quarter-res god rays, half the grass. Same look, cheaper.
//   low    direct render (no post stack), 1k shadows, flat-shaded cloud deck, sparse grass, no
//          transmission/iridescence, the sky-dome PMREM instead of the baked HDR.
// Reduced motion (spec 1/3) is orthogonal: it freezes the cloud drift, wind and Shell hover.
// Per-pass costs and how they were estimated: docs/rendering.md.

export const TIERS = Object.freeze(['ultra', 'high', 'low']);

export const QUALITY = Object.freeze({
  ultra: Object.freeze({
    pixelRatioCap: 1.5, msaa: 4, smaa: true, shadowMap: 4096, shadowRadius: 2, shadowDistance: 150,
    post: true, ao: true, aoScale: 1, aoSlices: 4, aoSteps: 6, bloom: true, bloomMips: 6,
    godRays: true, raysScale: 0.5, grade: true, cloudSteps: 28, envHdr: true,
    grassBlades: 36000, flowers: 1400, grassFadeDistance: 70,
    cloudLayers: 3, transmission: true, iridescence: true, pointLights: true,
  }),
  high: Object.freeze({
    pixelRatioCap: 1, msaa: 4, smaa: false, shadowMap: 2048, shadowRadius: 1.5, shadowDistance: 110,
    post: true, ao: true, aoScale: 0.5, aoSlices: 2, aoSteps: 5, bloom: true, bloomMips: 5,
    godRays: true, raysScale: 0.25, grade: true, cloudSteps: 16, envHdr: true,
    grassBlades: 18000, flowers: 800, grassFadeDistance: 55,
    cloudLayers: 2, transmission: true, iridescence: true, pointLights: true,
  }),
  low: Object.freeze({
    pixelRatioCap: 1, msaa: 0, smaa: false, shadowMap: 1024, shadowRadius: 1, shadowDistance: 70,
    post: false, ao: false, aoScale: 0.5, aoSlices: 0, aoSteps: 0, bloom: false, bloomMips: 0,
    godRays: false, raysScale: 0.25, grade: false, cloudSteps: 0, envHdr: false,
    grassBlades: 5000, flowers: 250, grassFadeDistance: 40,
    cloudLayers: 1, transmission: false, iridescence: false, pointLights: false,
  }),
});

export const isTier = (t) => TIERS.includes(t);

/** One step cheaper, or null at the bottom. */
export const lowerTier = (t) => (t === 'ultra' ? 'high' : t === 'high' ? 'low' : null);

/**
 * Maps the UI preference ('auto' | 'high' | 'low', src/ui/prefs.js) and the detected hardware to
 * a render tier. 'high' from the UI means "the best this machine should run", i.e. ultra on the
 * target hardware.
 */
export function tierForPreference(pref, detected = 'ultra') {
  if (pref === 'low') return 'low';
  if (pref === 'high') return detected === 'low' ? 'high' : 'ultra';
  return isTier(detected) ? detected : 'ultra';
}

/**
 * Heuristic from the unmasked WebGL renderer string and the environment. Conservative: unknown
 * GPUs get 'high', clearly integrated or mobile parts get 'low'. The minimum spec (RTX 2060
 * Super) is the 'high' reference machine; RTX 3060 Ti / 2080 class and up get 'ultra'.
 * @param {{gpu?:string, mobile?:boolean, deviceMemory?:number, cores?:number}} env
 */
export function detectTier(env = {}) {
  const gpu = String(env.gpu || '').toLowerCase();
  if (env.mobile) return 'low';
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  if (/intel\s*(\(r\)\s*)?(uhd|hd|iris)|apple gpu|adreno|mali|powervr|radeon\(tm\) graphics|vega \d/.test(gpu)) return 'low';
  const rtx = /rtx\s*(a?\d{4})/.exec(gpu);
  if (rtx) {
    const n = Number(rtx[1].replace('a', ''));
    const series = Math.floor(n / 1000), model = n % 1000;
    // 2080 / 2070 Super, 3060 Ti and up, every 40/50 series card from the 4060 Ti: ultra.
    if (model >= 80 || (model >= 70 && (series >= 3 || /super/.test(gpu))) || (series >= 3 && model >= 60 && /ti/.test(gpu)) || (series >= 4 && model >= 70)) return 'ultra';
    return 'high';
  }
  const gtx = /gtx\s*(\d{3,4})/.exec(gpu);
  if (gtx) { const n = Number(gtx[1]); return n >= 1660 ? 'high' : 'low'; }
  if (/radeon rx (6[7-9]|7[7-9]|9[0-9])\d{2}/.test(gpu)) return 'ultra';
  if (/radeon rx (5[6-9]|6|7|9)\d{2}/.test(gpu)) return 'high';
  if (/apple m\d (max|ultra)/.test(gpu)) return 'ultra';
  if (/apple m\d/.test(gpu)) return 'high';
  if ((env.deviceMemory && env.deviceMemory <= 4) || (env.cores && env.cores <= 2)) return 'low';
  return 'high';
}

/**
 * Frame-time governor for the automatic tier: after a warm-up it watches a rolling window and
 * steps the tier down once when the 75th-percentile frame time stays above budget (never up, so
 * it cannot oscillate; it stops judging after `windowEnd` seconds). Pure: feed it frame times.
 */
export class TierGovernor {
  /** @param {{budgetMs?:number, warmup?:number, window?:number, windowEnd?:number, cooldown?:number}} o */
  constructor({ budgetMs = 1000 / 58, warmup = 4, window = 90, windowEnd = 40, cooldown = 5 } = {}) {
    Object.assign(this, { budgetMs, warmup, windowSize: window, windowEnd, cooldown });
    this.t = 0; this.samples = []; this.lastChange = -Infinity; this.done = false;
  }

  /**
   * @param {number} ms frame time
   * @param {string} tier current tier
   * @returns {string|null} the tier to switch to, or null to stay
   */
  sample(ms, tier) {
    if (this.done) return null;
    this.t += ms / 1000;
    if (this.t > this.windowEnd) { this.done = true; return null; }
    if (this.t < this.warmup || this.t - this.lastChange < this.cooldown) return null;
    this.samples.push(ms);
    if (this.samples.length > this.windowSize) this.samples.shift();
    if (this.samples.length < this.windowSize) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    if (p75 <= this.budgetMs * 1.12) return null;
    const next = lowerTier(tier);
    if (!next) { this.done = true; return null; }
    this.lastChange = this.t; this.samples = [];
    return next;
  }
}
