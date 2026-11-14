// Quality tiers for the 3D client (spec 10: 60 FPS desktop, <= 120 draw calls, <= 500k triangles;
// decisions 07.11: minimum spec RTX 2060 Super, quality first). Pure data plus a GPU-string
// heuristic and a frame-time governor, no three.js, so the tier rules are covered by node tests.
//
//   ultra  RTX 3060 Ti class and up: 1.5x pixel ratio cap, MSAA 4x + SMAA, 2k near + 4k far shadows, full-res
//          GTAO (4 slices), 28-step raymarched cloud sea, half-res god rays, dense grass.
//   high   the minimum spec (RTX 2060 Super, 1080p, 60 fps): MSAA 4x, 2k near + 2k far shadows, half-res GTAO
//          (2 slices), 16-step clouds, quarter-res god rays, half the grass. Same look, cheaper.
//   low    direct render (no post stack), 1k shadows, flat-shaded cloud deck, sparse grass, no
//          transmission/iridescence, the sky-dome PMREM instead of the baked HDR.
//   motes  air specks drifting around the camera (render/motes.js), one draw call; 0 hides it.
//   cascades / shadowFarMap / shadowFarEvery  sun shadow cascades (render/shadows.js): two on ultra and high (the far
//          one redrawn every N frames), one on low and on phones. blobs: strength of the discs under characters'
//          feet (render/blobs.js). rain: most rain streaks drawn at once (render/weather.js).
// Reduced motion (spec 1/3) is orthogonal: it freezes the cloud drift, wind, motes, flicker and Shell hover.
// Per-pass costs and how they were estimated: docs/rendering.md.
//
// Phones use the same three tier names on a second *profile* (docs/mobile.md), so everything that
// keys on 'ultra' | 'high' | 'low' (settings, VFX, the dev HUD) keeps working:
//   phone/high  (also 'ultra'): direct render at up to 1.5x pixel ratio (the screen is small, so
//          sharpness buys more than post effects), 1k shadows, a third of the desktop-low grass.
//   phone/low   1x pixel ratio, 512 shadows, sparse grass; the governor then lowers the render
//          resolution in steps before giving up.
// The desktop tiers are untouched by the profile.

export const TIERS = Object.freeze(['ultra', 'high', 'low']);
export const PROFILES = Object.freeze(['desktop', 'phone']);

export const QUALITY = Object.freeze({
  ultra: Object.freeze({
    pixelRatioCap: 1.5, msaa: 4, smaa: true, shadowMap: 2048, shadowRadius: 2, shadowDistance: 150,
    cascades: 2, shadowFarMap: 4096, shadowFarEvery: 2, blobs: 0.3, rain: 6000,
    post: true, ao: true, aoScale: 1, aoSlices: 4, aoSteps: 6, bloom: true, bloomMips: 6,
    godRays: true, raysScale: 0.5, grade: true, cloudSteps: 28, envHdr: true,
    grassBlades: 36000, flowers: 1400, grassFadeDistance: 70,
    cloudLayers: 3, transmission: true, iridescence: true, pointLights: true, motes: 500,
  }),
  high: Object.freeze({
    pixelRatioCap: 1, msaa: 4, smaa: false, shadowMap: 2048, shadowRadius: 1.5, shadowDistance: 110,
    cascades: 2, shadowFarMap: 2048, shadowFarEvery: 4, blobs: 0.3, rain: 3500,
    post: true, ao: true, aoScale: 0.5, aoSlices: 2, aoSteps: 5, bloom: true, bloomMips: 5,
    godRays: true, raysScale: 0.25, grade: true, cloudSteps: 16, envHdr: true,
    grassBlades: 18000, flowers: 800, grassFadeDistance: 55,
    cloudLayers: 2, transmission: true, iridescence: true, pointLights: true, motes: 300,
  }),
  low: Object.freeze({
    pixelRatioCap: 1, msaa: 0, smaa: false, shadowMap: 1024, shadowRadius: 1, shadowDistance: 60,
    cascades: 1, shadowFarMap: 0, shadowFarEvery: 0, blobs: 0.42, rain: 1500,
    post: false, ao: false, aoScale: 0.5, aoSlices: 0, aoSteps: 0, bloom: false, bloomMips: 0,
    godRays: false, raysScale: 0.25, grade: false, cloudSteps: 0, envHdr: false,
    grassBlades: 5000, flowers: 250, grassFadeDistance: 40,
    cloudLayers: 1, transmission: false, iridescence: false, pointLights: false, motes: 120,
  }),
});

/** Phone profile (docs/mobile.md). 'ultra' resolves to `high` here: the best a phone should run. */
export const PHONE_QUALITY = Object.freeze({
  high: Object.freeze({
    pixelRatioCap: 1.5, msaa: 0, smaa: false, shadowMap: 1024, shadowRadius: 1, shadowDistance: 40,
    cascades: 1, shadowFarMap: 0, shadowFarEvery: 0, blobs: 0.45, rain: 900,
    post: false, ao: false, aoScale: 0.5, aoSlices: 0, aoSteps: 0, bloom: false, bloomMips: 0,
    godRays: false, raysScale: 0.25, grade: false, cloudSteps: 0, envHdr: false,
    grassBlades: 1800, flowers: 90, grassFadeDistance: 32,
    cloudLayers: 1, transmission: false, iridescence: false, pointLights: false, motes: 80,
  }),
  low: Object.freeze({
    pixelRatioCap: 1, msaa: 0, smaa: false, shadowMap: 512, shadowRadius: 1, shadowDistance: 28,
    cascades: 1, shadowFarMap: 0, shadowFarEvery: 0, blobs: 0.5, rain: 400,
    post: false, ao: false, aoScale: 0.5, aoSlices: 0, aoSteps: 0, bloom: false, bloomMips: 0,
    godRays: false, raysScale: 0.25, grade: false, cloudSteps: 0, envHdr: false,
    grassBlades: 700, flowers: 30, grassFadeDistance: 24,
    cloudLayers: 1, transmission: false, iridescence: false, pointLights: false, motes: 0,
  }),
});

export const isTier = (t) => TIERS.includes(t);
export const isProfile = (p) => PROFILES.includes(p);

/** The knob set for a tier on a profile; unknown input falls back to desktop ultra / phone high. */
export function qualityFor(tier, profile = 'desktop') {
  if (profile === 'phone') return tier === 'low' ? PHONE_QUALITY.low : PHONE_QUALITY.high;
  return QUALITY[isTier(tier) ? tier : 'ultra'];
}

/** Governor settings per profile: phones aim at 30 fps (spec 10) and may also drop render resolution. */
export const GOVERNORS = Object.freeze({
  // upScales: supersampling steps the desktop climbs on the top tier while frames keep the budget (owner 14.11: "the game
  // must load any GPU to the max"); the whole render ratio never passes upRatioMax (render/lookdev.js clamps it).
  desktop: Object.freeze({ budgetMs: 1000 / 58, warmup: 4, window: 90, windowEnd: 40, cooldown: 5, pixelScales: Object.freeze([]), upScales: Object.freeze([1.25, 1.5, 1.75, 2]), upRatioMax: 2 }),
  // 90 frames at 30 fps are three seconds over budget; asset streaming hitches are excluded by the warm-up.
  phone: Object.freeze({ budgetMs: 1000 / 30, warmup: 6, window: 90, windowEnd: 120, cooldown: 8, pixelScales: Object.freeze([0.85, 0.7]) }),
});

/**
 * The lowest tier the frame-time governor may reach on its own. A desktop GPU detected as 'high' or 'ultra'
 * (the minimum spec, RTX 2060 Super, and up) never loses the look-dev stack automatically: 'low' renders
 * without the post stack and the lamp lights, and loading hitches in the town used to push the owner's
 * minimum-spec machine there in the first seconds (decisions 11.11). Phones and weak desktops keep the full range.
 */
export function governorFloor(detected, profile = 'desktop') {
  return profile === 'desktop' && (detected === 'high' || detected === 'ultra') ? 'high' : null;
}

/** One step cheaper, or null at the bottom. */
/**
 * The settings popup's graphics switches on top of a tier (ui/settings-store.js renderOverrides): shadows off clears
 * both shadow maps, bloom off clears the bloom, weather off stops the rain particles. Only switches that are off change
 * anything; a tier never gains what it does not have.
 */
export function applyOverrides(cfg, o = {}) {
  const out = { ...cfg };
  if (o.shadows === false) { out.shadowMap = 0; out.shadowFarMap = 0; out.cascades = Math.min(1, out.cascades || 0); }
  if (o.bloom === false) { out.bloom = false; out.bloomMips = 0; }
  if (o.weather === false) out.rain = 0;
  return out;
}

export const lowerTier = (t) => (t === 'ultra' ? 'high' : t === 'high' ? 'low' : null);

/**
 * Maps the UI preference ('auto' | 'high' | 'low', src/ui/prefs.js) and the detected hardware to
 * a render tier. 'high' from the UI means "the best this machine should run", i.e. ultra on the
 * target hardware.
 */
export function tierForPreference(pref, detected = 'ultra') {
  if (pref === 'low') return 'low';
  if (pref === 'medium') return 'high';
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
  if (env.mobile) return detectPhoneTier(env, gpu);
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
 * Phone tier from the signals a browser gives (docs/mobile.md): small memory (`deviceMemory` is rounded to
 * powers of two, so 3 GB phones report 2), one or two cores, or a last-generation mobile GPU mean 'low';
 * everything else, including iPhones that expose neither number, starts on 'high' and relies on the governor.
 */
function detectPhoneTier(env, gpu) {
  if (env.deviceMemory && env.deviceMemory <= 2) return 'low';
  if (env.cores && env.cores <= 2) return 'low';
  if (/swiftshader|llvmpipe|software/.test(gpu)) return 'low';
  const adreno = /adreno\s*(?:\(tm\)\s*)?(\d{3})/.exec(gpu);
  if (adreno && Number(adreno[1]) < 610) return 'low';
  if (/mali-t\d|mali-g(?:[1-5]\d|7[01])\b|mali-400|powervr (?:ge|gx|sgx)/.test(gpu)) return 'low';
  return 'high';
}

/**
 * Render profile from device signals: a phone user agent, or a coarse (touch) primary pointer on a screen
 * whose short side is phone-sized. Tablets with a desktop user agent stay on the desktop profile.
 * @param {{mobile?:boolean, coarse?:boolean, screenMin?:number}} env
 */
export function detectProfile(env = {}) {
  if (env.mobile) return 'phone';
  if (env.coarse && env.screenMin && env.screenMin <= 600) return 'phone';
  return 'desktop';
}

/**
 * Frame-time governor for the automatic tier: after a warm-up it watches a rolling window and
 * steps the tier down once when the 75th-percentile frame time stays above budget (the tier never goes up); it stops
 * judging after `windowEnd` seconds. Pure: feed it frame times.
 * Climbing (desktop, `upScales`): on the top tier ('ultra'), while a window keeps the budget, it raises the render
 * resolution one supersampling step, so a strong GPU is used to the full. The first window over budget takes back one
 * step and locks the climb (no oscillation). Once it has climbed it keeps watching past `windowEnd`, only ever stepping
 * the supersampling back down, so a heavy fight later still gets its frames back.
 */
export class TierGovernor {
  /**
   * @param {{budgetMs?:number, warmup?:number, window?:number, windowEnd?:number, cooldown?:number,
   *          pixelScales?:readonly number[]}} o `pixelScales`: render-resolution steps (fractions of the
   *          tier's pixel ratio) taken once the bottom tier is reached, e.g. [0.85, 0.7]; empty on desktop.
   *          `floor`: the lowest tier the governor may step down to (null: down to 'low'); see governorFloor().
   */
  constructor({ budgetMs = 1000 / 58, warmup = 4, window = 90, windowEnd = 40, cooldown = 5, pixelScales = [], upScales = [], floor = null } = {}) {
    Object.assign(this, { budgetMs, warmup, windowSize: window, windowEnd, cooldown, pixelScales: [...pixelScales], upScales: [...upScales], floor });
    this.t = 0; this.samples = []; this.lastChange = -Infinity; this.done = false;
    this.pixelScale = 1; this.pixelStep = 0; this.upStep = 0; this.upLocked = false;
  }

  /**
   * @param {number} ms frame time
   * @param {string} tier current tier
   * @returns {{tier?:string, pixelScale?:number}|null} the change to apply, or null to stay
   */
  step(ms, tier) {
    this.t += ms / 1000;
    const watching = this.upStep > 0; // it has supersampled: guard the frame rate for the rest of the session
    if (this.done && !watching) return null;
    if (this.t > this.windowEnd && !this.done) { this.done = true; if (!watching) return null; }
    if (this.t < this.warmup || this.t - this.lastChange < this.cooldown) return null;
    this.samples.push(ms);
    if (this.samples.length > this.windowSize) this.samples.shift();
    if (this.samples.length < this.windowSize) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const over = p75 > this.budgetMs * 1.12;
    if (over && this.upStep > 0) {
      this.upStep--; this.upLocked = true; this.lastChange = this.t; this.samples = [];
      this.pixelScale = this.upStep > 0 ? this.upScales[this.upStep - 1] : 1;
      return { pixelScale: this.pixelScale };
    }
    if (this.done) return null;
    if (!over) {
      if (p75 > this.budgetMs || tier !== 'ultra' || this.upLocked || this.upStep >= this.upScales.length) return null;
      this.pixelScale = this.upScales[this.upStep++]; this.lastChange = this.t; this.samples = [];
      return { pixelScale: this.pixelScale };
    }
    this.upLocked = true;
    const next = tier === this.floor ? null : lowerTier(tier);
    this.lastChange = this.t; this.samples = [];
    if (next) return { tier: next };
    if (this.pixelStep < this.pixelScales.length) { this.pixelScale = this.pixelScales[this.pixelStep++]; return { pixelScale: this.pixelScale }; }
    this.done = true;
    return null;
  }

  /** Tier-only view of `step()` (kept for callers that ignore the resolution steps). */
  sample(ms, tier) { return this.step(ms, tier)?.tier || null; }
}
