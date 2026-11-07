// Quality tiers for the 3D client (spec 10: 60 FPS desktop, <= 120 draw calls, <= 500k triangles;
// decisions 07.11: minimum spec RTX 2060 Super, quality first). Pure data plus a GPU-string
// heuristic, no three.js, so the tier rules are covered by node tests.
//
//   ultra  default for an RTX 2060 Super or better: MSAA 4x, 4k shadows, GTAO, bloom, god rays,
//          dense grass, glass transmission, three cloud layers.
//   high   same look without GTAO, 2k shadows, half the grass, two cloud layers.
//   low    direct render (no post stack), 1k shadows, sparse grass, no transmission, one cloud layer.
// Reduced motion (spec 1/3) is orthogonal: it freezes the cloud drift, wind and Shell hover.

export const TIERS = Object.freeze(['ultra', 'high', 'low']);

export const QUALITY = Object.freeze({
  ultra: Object.freeze({
    pixelRatioCap: 1.5, msaa: 4, shadowMap: 4096, shadowRadius: 2,
    post: true, ao: true, bloom: true, godRays: true, grade: true,
    grassBlades: 36000, flowers: 1400, grassFadeDistance: 70,
    cloudLayers: 3, transmission: true, iridescence: true, pointLights: true,
  }),
  high: Object.freeze({
    pixelRatioCap: 1.25, msaa: 4, shadowMap: 2048, shadowRadius: 1.5,
    post: true, ao: false, bloom: true, godRays: true, grade: true,
    grassBlades: 18000, flowers: 800, grassFadeDistance: 55,
    cloudLayers: 2, transmission: true, iridescence: true, pointLights: true,
  }),
  low: Object.freeze({
    pixelRatioCap: 1, msaa: 0, shadowMap: 1024, shadowRadius: 1,
    post: false, ao: false, bloom: false, godRays: false, grade: false,
    grassBlades: 5000, flowers: 250, grassFadeDistance: 40,
    cloudLayers: 1, transmission: false, iridescence: false, pointLights: false,
  }),
});

export const isTier = (t) => TIERS.includes(t);

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
 * GPUs get 'high', clearly integrated or mobile parts get 'low', the minimum spec and above 'ultra'.
 * @param {{gpu?:string, mobile?:boolean, deviceMemory?:number, cores?:number}} env
 */
export function detectTier(env = {}) {
  const gpu = String(env.gpu || '').toLowerCase();
  if (env.mobile) return 'low';
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  if (/intel\s*(\(r\)\s*)?(uhd|hd|iris)|apple gpu|adreno|mali|powervr|radeon\(tm\) graphics|vega \d/.test(gpu)) return 'low';
  // NVIDIA RTX 20/30/40/50 series and GTX 16 series: at or above the minimum spec.
  const rtx = /rtx\s*(\d{4})/.exec(gpu);
  if (rtx) { const n = Number(rtx[1]); if (n >= 3050 || n === 2060 && /super|ti/.test(gpu) || n >= 2070) return 'ultra'; return 'high'; }
  const gtx = /gtx\s*(\d{3,4})/.exec(gpu);
  if (gtx) { const n = Number(gtx[1]); return n >= 1660 ? 'high' : 'low'; }
  // AMD RDNA2+ desktop cards and Apple M-series Pro/Max parts are in the ultra class; keep others high.
  if (/radeon rx (6|7|9)\d{3}/.test(gpu)) return 'ultra';
  if (/apple m\d (pro|max|ultra)/.test(gpu)) return 'ultra';
  if (/apple m\d/.test(gpu)) return 'high';
  if ((env.deviceMemory && env.deviceMemory <= 4) || (env.cores && env.cores <= 2)) return 'low';
  return 'high';
}
