// VFX presets as pure data: emitters (what a particle does) and effects (which layers fire when).
// No three.js here; tests/client/vfx.test.mjs validates every reference, number and duration.
//
// Palette (docs/art/brief.md + owner style addendum 07.11): a restrained, desaturated world with
// warm gold as the sacred / human accent. Gold motes and gold light are the signature; storms are
// cold steel and ash, never neon; Guest magic is nacre (pale pearl with a faint lavender cast)
// edged in gold; dust and smoke stay weathered warm grey. Heavy atmosphere: soft smoke and mist
// layers carry most effects, sparks are the exception.

/** Flipbook atlases baked in Blender (art/vfx/bake_flipbooks.py): 8x8 frames, webp RGBA. */
export const ATLASES = Object.freeze({
  smoke: Object.freeze({ file: 'assets/vfx/flipbook_smoke.webp', grid: 8, frames: 64, tintable: true }),
  dust: Object.freeze({ file: 'assets/vfx/flipbook_dust.webp', grid: 8, frames: 64, tintable: true }),
  fire: Object.freeze({ file: 'assets/vfx/flipbook_fire.webp', grid: 8, frames: 64, tintable: false }),
  magic: Object.freeze({ file: 'assets/vfx/flipbook_magic.webp', grid: 8, frames: 64, tintable: true }),
});

/** Procedural sprites (no texture): drawn in the fragment shader by id. */
export const SPRITES = Object.freeze({ dot: 0, spark: 1, mote: 2, glyph: 3, shard: 4 });
export const BLENDS = Object.freeze(['add', 'alpha']);

export const PALETTE = Object.freeze({
  gold: 0xe8bd6a, paleGold: 0xf4dfa6, amber: 0xd59a3a, ember: 0xff9440, emberDeep: 0xb8452a,
  nacre: 0xdfe3ee, nacreLilac: 0xb9b2d8, steel: 0xa9bfd8, stormWhite: 0xeef3ff,
  dust: 0x9a917f, dustDark: 0x6c665c, charcoal: 0x2a2826, ash: 0x55514b, mist: 0xc9d0d4, ink: 0x1c1b22,
});
const P = PALETTE;

/**
 * Emitter fields (ranges are [min, max], a plain number is fixed):
 *   atlas | sprite   flipbook name (ATLASES) or procedural sprite (SPRITES) when atlas is null
 *   blend            'add' (light, HDR) | 'alpha' (premultiplied smoke / dust)
 *   count            particles per burst at ultra (tier-scaled); rate: particles per second (streams)
 *   life             seconds; shape: sampleShape() in core.js
 *   speed, dir, spread  initial speed along dir inside a cone (spread 0 = straight, 1 = sphere)
 *   radial           extra outward speed from the shape centre (horizontal)
 *   gravity          m/s^2 on Y (negative falls, positive rises); drag 1/s (exponential)
 *   curl             {strength m/s, scale 1/m, speed} curl-noise drift
 *   size [start,end] metres; sizeRand 0..1; spin rad/s; stretch: velocity stretch factor
 *   color [start,end] hex; intensity [start,end] HDR multiplier; alpha peak opacity
 *   fadeIn, fadeOut  fractions of life; soft: soft-particle depth fade distance (m)
 *   flip             'life' (flipbook spans the life) or frames per second (looping)
 */
export const EMITTERS = Object.freeze({
  // --- anchor plant ---
  dust_burst: {
    atlas: 'dust', blend: 'alpha', count: 28, life: [1.6, 2.6], shape: { type: 'disc', radius: 0.5, height: 0.1 },
    speed: [0.2, 0.7], dir: [0, 1, 0], spread: 0.3, radial: [1.6, 3.4], gravity: -0.2, drag: 1.8,
    curl: { strength: 0.35, scale: 0.6, speed: 0.4 }, size: [0.8, 2.6], sizeRand: 0.35, spin: [-0.5, 0.5],
    color: [P.dust, P.dustDark], intensity: [1, 1], alpha: 0.62, fadeIn: 0.04, fadeOut: 0.6, soft: 0.6, flip: 'life',
  },
  dust_debris: {
    sprite: 'dot', blend: 'alpha', count: 26, life: [0.6, 1.1], shape: { type: 'disc', radius: 0.35 },
    speed: [2.2, 4.8], dir: [0, 1, 0], spread: 0.4, radial: [0.5, 1.6], gravity: -9.8, drag: 0.4,
    size: [0.07, 0.05], sizeRand: 0.5, color: [P.dustDark, P.charcoal], intensity: [1, 1], alpha: 0.95, fadeIn: 0, fadeOut: 0.2, soft: 0.05,
  },
  anchor_motes: {
    sprite: 'mote', blend: 'add', count: 36, life: [1.8, 3.2], shape: { type: 'ring', radius: 1.2, width: 0.6, height: 0.2 },
    speed: [0.3, 0.9], dir: [0, 1, 0], spread: 0.25, radial: [0.2, 0.9], gravity: 0.25, drag: 0.6,
    curl: { strength: 0.5, scale: 0.8, speed: 0.6 }, size: [0.07, 0.02], sizeRand: 0.4,
    color: [P.paleGold, P.amber], intensity: [3.2, 0.8], alpha: 1, fadeIn: 0.1, fadeOut: 0.5, soft: 0.2,
  },

  // --- storm hit ---
  storm_sparks: {
    sprite: 'spark', blend: 'add', count: 60, life: [0.25, 0.75], shape: { type: 'sphere', radius: 0.15 },
    speed: [3, 8], dir: [0, 1, 0], spread: 0.75, gravity: -9.8, drag: 1.2, size: [0.05, 0.02], sizeRand: 0.4,
    stretch: 0.06, color: [P.stormWhite, P.steel], intensity: [6, 1.5], alpha: 1, fadeIn: 0, fadeOut: 0.4, soft: 0.1,
  },
  storm_flare: {
    atlas: 'fire', blend: 'add', count: 7, life: [0.7, 1.3], shape: { type: 'sphere', radius: 0.25, flatten: 0.4 },
    speed: [0.4, 1.2], dir: [0, 1, 0], spread: 0.3, gravity: 1.2, drag: 1, size: [0.7, 1.6], sizeRand: 0.3, spin: [-1, 1],
    color: [0xffffff, 0xffd2a0], intensity: [2.4, 1.2], alpha: 1, fadeIn: 0.02, fadeOut: 0.5, soft: 0.4, flip: 'life',
  },
  burnt_smoke: {
    atlas: 'smoke', blend: 'alpha', rate: 5, life: [3, 5], shape: { type: 'disc', radius: 0.25 },
    speed: [0.2, 0.5], dir: [0, 1, 0], spread: 0.2, gravity: 0.35, drag: 0.4, curl: { strength: 0.45, scale: 0.5, speed: 0.3 },
    size: [0.5, 2.4], sizeRand: 0.3, spin: [-0.3, 0.3], color: [P.charcoal, P.ash], intensity: [1, 1], alpha: 0.5,
    fadeIn: 0.12, fadeOut: 0.55, soft: 0.7, flip: 'life',
  },
  ash_flakes: {
    sprite: 'dot', blend: 'add', rate: 9, life: [1.5, 3], shape: { type: 'disc', radius: 0.3 },
    speed: [0.3, 0.9], dir: [0, 1, 0], spread: 0.4, gravity: 0.3, drag: 0.5, curl: { strength: 0.6, scale: 1.2, speed: 0.8 },
    size: [0.035, 0.015], sizeRand: 0.5, color: [P.ember, P.emberDeep], intensity: [3.5, 0.6], alpha: 1, fadeIn: 0.05, fadeOut: 0.6, soft: 0.1,
  },

  // --- gift ---
  gift_motes: {
    sprite: 'mote', blend: 'add', rate: 30, life: [2.6, 4.2], shape: { type: 'disc', radius: 0.9, height: 0.4 },
    speed: [0.25, 0.7], dir: [0, 1, 0], spread: 0.2, gravity: 0.3, drag: 0.3, curl: { strength: 0.55, scale: 0.7, speed: 0.5 },
    size: [0.08, 0.025], sizeRand: 0.45, color: [P.paleGold, P.gold], intensity: [3.0, 0.7], alpha: 1, fadeIn: 0.18, fadeOut: 0.45, soft: 0.2,
  },
  gift_glow: {
    atlas: 'magic', blend: 'add', count: 7, life: [2.2, 3.0], shape: { type: 'disc', radius: 0.4 },
    speed: [0.2, 0.5], dir: [0, 1, 0], spread: 0.2, gravity: 0.2, drag: 0.5, size: [1.0, 2.4], sizeRand: 0.3, spin: [-0.4, 0.4],
    color: [P.paleGold, P.amber], intensity: [1.1, 0.4], alpha: 0.8, fadeIn: 0.15, fadeOut: 0.6, soft: 0.6, flip: 'life',
  },

  // --- shard auction ---
  shard_glints: {
    sprite: 'shard', blend: 'add', rate: 22, life: [0.35, 0.9], shape: { type: 'sphere', radius: 0.5, flatten: 1.4 },
    speed: [0.02, 0.12], dir: [0, 1, 0], spread: 1, size: [0.2, 0.04], sizeRand: 0.5, spin: [-2.5, 2.5],
    color: [0xffffff, P.nacreLilac], intensity: [4.5, 1.0], alpha: 1, fadeIn: 0.15, fadeOut: 0.6, soft: 0.1,
  },
  shard_veil: {
    atlas: 'magic', blend: 'add', rate: 3, life: [1.6, 2.4], shape: { type: 'sphere', radius: 0.25 },
    speed: [0.1, 0.3], dir: [0, 1, 0], spread: 0.6, gravity: 0.1, drag: 0.4, size: [0.6, 1.2], sizeRand: 0.3, spin: [-0.6, 0.6],
    color: [P.nacre, P.nacreLilac], intensity: [0.7, 0.2], alpha: 0.7, fadeIn: 0.25, fadeOut: 0.5, soft: 0.4, flip: 'life',
  },

  // --- vision / memory sacrifice ---
  memory_wisps: {
    atlas: 'magic', blend: 'add', rate: 9, life: [2.8, 4.2], shape: { type: 'disc', radius: 0.6, height: 0.8 },
    speed: [0.4, 0.9], dir: [0, 1, 0], spread: 0.25, gravity: 0.5, drag: 0.3, curl: { strength: 0.7, scale: 0.4, speed: 0.4 },
    size: [0.5, 1.6], sizeRand: 0.3, spin: [-0.5, 0.5], color: [P.paleGold, P.nacreLilac], intensity: [1.3, 0.3], alpha: 0.8,
    fadeIn: 0.15, fadeOut: 0.5, soft: 0.5, flip: 'life',
  },
  memory_glyphs: {
    sprite: 'glyph', blend: 'add', rate: 12, life: [2.6, 4.0], shape: { type: 'disc', radius: 0.7, height: 1.2 },
    speed: [0.3, 0.8], dir: [0, 1, 0], spread: 0.2, gravity: 0.55, drag: 0.25, curl: { strength: 0.6, scale: 0.6, speed: 0.5 },
    size: [0.2, 0.08], sizeRand: 0.4, spin: [-0.8, 0.8], color: [P.paleGold, P.nacre], intensity: [3.0, 0.6], alpha: 1,
    fadeIn: 0.12, fadeOut: 0.45, soft: 0.2,
  },

  // --- logogram ---
  ink_motes: {
    sprite: 'mote', blend: 'add', rate: 40, life: [0.6, 1.4], shape: { type: 'sphere', radius: 0.05 },
    speed: [0.1, 0.4], dir: [0, 0, 1], spread: 0.7, gravity: 0.2, drag: 1.2, curl: { strength: 0.25, scale: 2.0, speed: 1 },
    size: [0.06, 0.01], sizeRand: 0.5, color: [P.paleGold, P.gold], intensity: [4, 0.8], alpha: 1, fadeIn: 0, fadeOut: 0.6, soft: 0.05,
  },
  ink_bloom: {
    atlas: 'magic', blend: 'add', count: 10, life: [1.6, 2.6], shape: { type: 'ring', radius: 1.0, width: 0.2 },
    speed: [0.05, 0.2], dir: [0, 0, 1], spread: 0.5, drag: 0.6, size: [0.6, 1.5], sizeRand: 0.3, spin: [-0.3, 0.3],
    color: [P.paleGold, P.nacreLilac], intensity: [0.9, 0.2], alpha: 0.6, fadeIn: 0.1, fadeOut: 0.7, soft: 0.3, flip: 'life',
  },

  // --- Shells ---
  shell_mist: {
    atlas: 'smoke', blend: 'alpha', rate: 3, life: [6, 9], shape: { type: 'disc', radius: 3.5, height: 1.5 },
    speed: [0.05, 0.25], dir: [0, -1, 0], spread: 0.5, gravity: -0.03, drag: 0.2, curl: { strength: 0.35, scale: 0.12, speed: 0.15 },
    size: [3, 6.5], sizeRand: 0.3, spin: [-0.12, 0.12], color: [P.mist, P.nacre], intensity: [1, 1], alpha: 0.22,
    fadeIn: 0.3, fadeOut: 0.5, soft: 2.0, flip: 'life',
  },
  shell_drips: {
    sprite: 'spark', blend: 'add', rate: 2.5, life: [2.4, 3.2], shape: { type: 'disc', radius: 2.4 },
    speed: [0, 0.1], dir: [0, -1, 0], spread: 0, gravity: -2.6, drag: 0.15, size: [0.09, 0.05], sizeRand: 0.3, stretch: 0.12,
    color: [P.paleGold, P.nacre], intensity: [4, 1.2], alpha: 1, fadeIn: 0.05, fadeOut: 0.35, soft: 0.1,
  },
  crack_embers: {
    sprite: 'mote', blend: 'add', rate: 10, life: [1.4, 2.6], shape: { type: 'line', dir: [0, 1, 0], length: 4 },
    speed: [0.1, 0.4], dir: [0, 0, 1], spread: 0.6, gravity: 0.3, drag: 0.5, curl: { strength: 0.4, scale: 0.6, speed: 0.6 },
    size: [0.08, 0.02], sizeRand: 0.4, color: [P.paleGold, P.amber], intensity: [3.5, 0.8], alpha: 1, fadeIn: 0.1, fadeOut: 0.5, soft: 0.1,
  },
  crack_glow: {
    atlas: 'magic', blend: 'add', rate: 2.2, life: [1.6, 2.2], shape: { type: 'line', dir: [0, 1, 0], length: 4 },
    speed: [0, 0.1], dir: [0, 0, 1], spread: 0.5, size: [1.6, 2.6], sizeRand: 0.3, spin: [-0.2, 0.2],
    color: [P.gold, P.amber], intensity: [0.9, 0.2], alpha: 0.7, fadeIn: 0.3, fadeOut: 0.5, soft: 0.6, flip: 'life',
  },

  // --- tension (ambient, rate scaled by level) ---
  tension_embers: {
    sprite: 'mote', blend: 'add', rate: 40, life: [4, 7], shape: { type: 'box', size: [36, 3, 36] },
    speed: [0.1, 0.4], dir: [0, 1, 0], spread: 0.5, gravity: 0.25, drag: 0.2, curl: { strength: 0.9, scale: 0.15, speed: 0.25 },
    size: [0.06, 0.02], sizeRand: 0.5, color: [P.ember, P.emberDeep], intensity: [3.2, 0.4], alpha: 1, fadeIn: 0.2, fadeOut: 0.4, soft: 0.1,
  },
  tension_haze: {
    atlas: 'smoke', blend: 'alpha', rate: 2, life: [7, 10], shape: { type: 'box', size: [30, 1.5, 30] },
    speed: [0.05, 0.2], dir: [1, 0, 0], spread: 0.6, gravity: 0.04, drag: 0.1, curl: { strength: 0.3, scale: 0.08, speed: 0.1 },
    size: [4, 8], sizeRand: 0.3, spin: [-0.08, 0.08], color: [0x6b5a4c, 0x4a4442], intensity: [1, 1], alpha: 0.16,
    fadeIn: 0.3, fadeOut: 0.5, soft: 2.5, flip: 'life',
  },

  // --- vote finale ---
  finale_burst: {
    sprite: 'mote', blend: 'add', count: 240, life: [2.5, 4.5], shape: { type: 'sphere', radius: 0.8 },
    speed: [1.2, 4.2], dir: [0, 1, 0], spread: 1, gravity: -0.35, drag: 0.7, curl: { strength: 0.7, scale: 0.3, speed: 0.5 },
    size: [0.12, 0.03], sizeRand: 0.5, color: [P.paleGold, P.gold], intensity: [4, 0.8], alpha: 1, fadeIn: 0.02, fadeOut: 0.5, soft: 0.2,
  },
  finale_column: {
    sprite: 'mote', blend: 'add', rate: 50, life: [3, 5], shape: { type: 'ring', radius: 1.4, width: 0.8 },
    speed: [1.5, 3.5], dir: [0, 1, 0], spread: 0.08, gravity: 0.4, drag: 0.1, curl: { strength: 0.4, scale: 0.4, speed: 0.5 },
    size: [0.09, 0.03], sizeRand: 0.4, color: [P.paleGold, P.nacre], intensity: [3.5, 0.6], alpha: 1, fadeIn: 0.1, fadeOut: 0.5, soft: 0.2,
  },
  finale_veil: {
    atlas: 'magic', blend: 'add', rate: 6, life: [2.5, 3.5], shape: { type: 'ring', radius: 1.6, width: 1.0, height: 6 },
    speed: [0.6, 1.4], dir: [0, 1, 0], spread: 0.15, gravity: 0.2, drag: 0.3, size: [1.5, 3.5], sizeRand: 0.3, spin: [-0.3, 0.3],
    color: [P.paleGold, P.nacre], intensity: [0.8, 0.2], alpha: 0.7, fadeIn: 0.2, fadeOut: 0.6, soft: 1.0, flip: 'life',
  },
  beam_motes: {
    sprite: 'mote', blend: 'add', rate: 24, life: [1.0, 1.8], shape: { type: 'sphere', radius: 0.3 },
    speed: [0.1, 0.5], dir: [0, 1, 0], spread: 1, drag: 0.8, curl: { strength: 0.3, scale: 0.8, speed: 0.6 },
    size: [0.08, 0.02], sizeRand: 0.4, color: [P.paleGold, P.gold], intensity: [3.5, 0.6], alpha: 1, fadeIn: 0.05, fadeOut: 0.6, soft: 0.1,
  },
});

/**
 * Effects. Layer kinds:
 *   burst  {emitter, scale?, offset?}            one-off particles at `at`
 *   stream {emitter, dur?, scale?, offset?}      continuous; in a loop effect runs until stop()
 *   ring   {color, radius, width, dur, intensity, y?}       ground shockwave (gold ring)
 *   light  {color, intensity, distance, dur, attack, release, pulse?: {period, min}, offset?}
 *   beams  {source: 'camps'|'pillar', color, dur, grow, width, height?}
 *   arcs   {bolts, dur, color, height, rate}       crackling lightning from above
 *   decal  {radius, dur, color}                    burnt ground (scorch) with cooling embers
 *   logogram {draw, hold, settle, radius}          stroke-by-stroke ink sign (opts.forms / dots)
 *   post   {distort?, chroma?, shock?, tint?, tintAmount?, desat?, dur, attack, release}
 *            screen-space; skipped on the low tier and with reduced motion (distortion only)
 * `at` is seconds after play(); `release` lets a looping stream wind down after stop().
 */
export const EFFECTS = Object.freeze({
  logogram: {
    duration: 9.5, desc: "A Guest's round sign drawn stroke by stroke: gold-nacre ink glows, then settles dark.",
    layers: [
      { at: 0, kind: 'logogram', draw: 4.2, hold: 1.4, settle: 2.6, radius: 1.2 },
      { at: 0, kind: 'light', color: P.paleGold, intensity: 6, distance: 6, dur: 6.5, attack: 0.6, release: 2.5, offset: [0, 0, 0.6] },
      { at: 5.6, kind: 'burst', emitter: 'ink_bloom' },
    ],
  },
  vision: {
    duration: 10, desc: 'Vision (10 s, spec 6): screen distortion, chromatic fringe, memories rise from Iris as gold-nacre glyphs.',
    layers: [
      { at: 0, kind: 'post', distort: 1.0, chroma: 1.0, tint: P.paleGold, tintAmount: 0.18, desat: 0.35, dur: 10, attack: 1.4, release: 2.6 },
      { at: 0.2, kind: 'stream', emitter: 'memory_wisps', dur: 7 },
      { at: 0.4, kind: 'stream', emitter: 'memory_glyphs', dur: 7 },
      { at: 0, kind: 'light', color: P.paleGold, intensity: 5, distance: 7, dur: 9, attack: 1.2, release: 3, offset: [0, 1.4, 0] },
    ],
  },
  anchor_plant: {
    duration: 3.2, desc: 'An anchor is driven into its zone: dust burst, debris, gold ring shockwave, rising gold motes.',
    layers: [
      { at: 0, kind: 'burst', emitter: 'dust_burst' },
      { at: 0, kind: 'burst', emitter: 'dust_debris' },
      { at: 0.03, kind: 'ring', color: P.gold, radius: 3.4, width: 0.32, dur: 0.95, intensity: 4.5 },
      { at: 0.22, kind: 'ring', color: P.paleGold, radius: 2.2, width: 0.18, dur: 1.2, intensity: 2.0 },
      { at: 0.1, kind: 'burst', emitter: 'anchor_motes' },
      { at: 0, kind: 'light', color: P.gold, intensity: 14, distance: 8, dur: 1.4, attack: 0.03, release: 1.2, offset: [0, 0.6, 0] },
      { at: 0, kind: 'post', shock: 1.0, dur: 0.8, attack: 0.02, release: 0.7 },
    ],
  },
  storm_hit: {
    duration: 8, desc: 'Storm strikes a stake: crackling steel-white arcs, sparks, a flare, a burnt scorch that smoulders.',
    layers: [
      { at: 0, kind: 'arcs', bolts: 3, dur: 0.9, color: P.stormWhite, height: 9, rate: 18 },
      { at: 0, kind: 'light', color: P.steel, intensity: 30, distance: 14, dur: 0.9, attack: 0.01, release: 0.6, offset: [0, 2.5, 0], pulse: { period: 0.11, min: 0.25 } },
      { at: 0.05, kind: 'burst', emitter: 'storm_sparks' },
      { at: 0.08, kind: 'burst', emitter: 'storm_flare' },
      { at: 0.1, kind: 'decal', radius: 1.3, dur: 7.8, color: P.charcoal },
      { at: 0.3, kind: 'stream', emitter: 'burnt_smoke', dur: 6 },
      { at: 0.2, kind: 'stream', emitter: 'ash_flakes', dur: 4 },
      { at: 0, kind: 'post', chroma: 0.6, distort: 0.25, dur: 0.45, attack: 0.01, release: 0.4 },
    ],
  },
  gift: {
    duration: 5, desc: 'A Gift: warm gold motes rise, a soft glow, a chime of light (a ring and a bright flash).',
    layers: [
      { at: 0, kind: 'stream', emitter: 'gift_motes', dur: 2.8 },
      { at: 0, kind: 'burst', emitter: 'gift_glow' },
      { at: 0.05, kind: 'ring', color: P.paleGold, radius: 1.8, width: 0.12, dur: 1.4, intensity: 3.0, y: 0.05 },
      { at: 0, kind: 'light', color: P.paleGold, intensity: 12, distance: 7, dur: 2.4, attack: 0.06, release: 2.0, offset: [0, 1.2, 0] },
    ],
  },
  shard_auction: {
    duration: 3.5, desc: 'The shard is up for auction: crystal glints and a nacre veil shimmer around it.',
    layers: [
      { at: 0, kind: 'stream', emitter: 'shard_glints', dur: 3 },
      { at: 0, kind: 'stream', emitter: 'shard_veil', dur: 2.6 },
      { at: 0, kind: 'light', color: P.nacre, intensity: 4, distance: 4, dur: 3.2, attack: 0.3, release: 1.4, pulse: { period: 0.8, min: 0.55 } },
    ],
  },
  shell_mist: {
    duration: 4, loop: true, desc: 'Looping: mist pooling beneath a hovering Shell and slow drips of light falling from it.',
    layers: [
      { at: 0, kind: 'stream', emitter: 'shell_mist', release: 0 },
      { at: 0, kind: 'stream', emitter: 'shell_drips', release: 0 },
    ],
  },
  shell_crack_pulse: {
    duration: 2.4, loop: true, desc: "Looping: Shell IV's crack breathes gold light; embers leak from it.",
    layers: [
      { at: 0, kind: 'light', color: P.gold, intensity: 10, distance: 12, pulse: { period: 2.4, min: 0.2 }, attack: 0.5, release: 0.6 },
      { at: 0, kind: 'stream', emitter: 'crack_glow' },
      { at: 0, kind: 'stream', emitter: 'crack_embers' },
    ],
  },
  tension: {
    duration: 1, loop: true, desc: 'Ambient tension (opts.level 0..1): drifting embers, warm haze, a rust sky tint hook.',
    layers: [
      { at: 0, kind: 'stream', emitter: 'tension_embers' },
      { at: 0, kind: 'stream', emitter: 'tension_haze' },
    ],
  },
  vote_finale: {
    duration: 12, desc: 'Collective finale (12 s, spec 6): six gold beams rise from the camps and converge; a pillar of light.',
    layers: [
      { at: 0, kind: 'beams', source: 'camps', color: P.paleGold, dur: 11.5, grow: 3.0, width: 0.45 },
      { at: 0.4, kind: 'stream', emitter: 'beam_motes', dur: 3.0, offset: [0, 14, 0] },
      { at: 3.0, kind: 'burst', emitter: 'finale_burst', offset: [0, 14, 0] },
      { at: 3.0, kind: 'light', color: P.paleGold, intensity: 40, distance: 30, dur: 8.5, attack: 0.08, release: 4, offset: [0, 10, 0] },
      { at: 3.2, kind: 'beams', source: 'pillar', color: P.paleGold, dur: 8.3, grow: 1.2, width: 1.6, height: 60 },
      { at: 3.2, kind: 'ring', color: P.gold, radius: 9, width: 0.5, dur: 1.6, intensity: 4 },
      { at: 3.4, kind: 'stream', emitter: 'finale_column', dur: 7 },
      { at: 3.4, kind: 'stream', emitter: 'finale_veil', dur: 6 },
      { at: 3.0, kind: 'post', shock: 1.4, chroma: 0.5, tint: P.paleGold, tintAmount: 0.12, dur: 8.5, attack: 0.1, release: 4 },
    ],
  },
});

export const EFFECT_NAMES = Object.freeze(Object.keys(EFFECTS));

/** Layers that need the post pass (screen-space); the low tier drops them. */
export const isPostLayer = (L) => L.kind === 'post';

/**
 * Validates presets; returns a list of problems (empty = fine). Run by the unit tests so a typo
 * in a preset fails CI instead of silently dropping an effect.
 */
export function validatePresets(emitters = EMITTERS, effects = EFFECTS) {
  const errs = [];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const range = (v) => num(v) || (Array.isArray(v) && v.length === 2 && v.every(num) && v[0] <= v[1]);
  for (const [name, e] of Object.entries(emitters)) {
    const where = 'emitter ' + name;
    if (e.atlas != null && !ATLASES[e.atlas]) errs.push(where + ': unknown atlas ' + e.atlas);
    if (e.atlas == null && !(e.sprite in SPRITES)) errs.push(where + ': needs an atlas or a known sprite');
    if (!BLENDS.includes(e.blend)) errs.push(where + ': blend must be add|alpha');
    if (!(e.count > 0) && !(e.rate > 0)) errs.push(where + ': needs count or rate');
    if (!range(e.life) || [].concat(e.life)[0] <= 0) errs.push(where + ': bad life');
    if (!range(e.speed)) errs.push(where + ': bad speed');
    if (!Array.isArray(e.size) || e.size.length !== 2 || !e.size.every((s) => num(s) && s >= 0)) errs.push(where + ': bad size');
    if (!Array.isArray(e.color) || e.color.length !== 2) errs.push(where + ': bad color');
    if (!Array.isArray(e.intensity) || !e.intensity.every(num)) errs.push(where + ': bad intensity');
    if (!(e.alpha > 0 && e.alpha <= 1)) errs.push(where + ': alpha must be in (0, 1]');
    if ((e.fadeIn || 0) + (e.fadeOut || 0) > 1) errs.push(where + ': fadeIn + fadeOut > 1');
    if (e.flip !== undefined && e.flip !== 'life' && !(e.flip > 0)) errs.push(where + ': flip must be life or fps');
  }
  for (const [name, fx] of Object.entries(effects)) {
    const where = 'effect ' + name;
    if (!(fx.duration > 0)) errs.push(where + ': duration must be positive');
    if (!Array.isArray(fx.layers) || !fx.layers.length) errs.push(where + ': no layers');
    for (const L of fx.layers || []) {
      if (!(L.at >= 0)) errs.push(where + ': layer start must be >= 0');
      if ((L.kind === 'burst' || L.kind === 'stream') && !emitters[L.emitter]) errs.push(where + ': unknown emitter ' + L.emitter);
      if (L.kind === 'burst' && !(emitters[L.emitter] && emitters[L.emitter].count > 0)) errs.push(where + ': burst needs an emitter with count');
      if (L.kind === 'stream' && !(emitters[L.emitter] && emitters[L.emitter].rate > 0)) errs.push(where + ': stream needs an emitter with rate');
      if (!['burst', 'stream', 'ring', 'light', 'beams', 'arcs', 'decal', 'logogram', 'post'].includes(L.kind)) errs.push(where + ': unknown layer kind ' + L.kind);
      if (!fx.loop && L.at + (L.dur || 0) > fx.duration + 1e-9 && L.kind !== 'logogram') errs.push(where + ': layer runs past the duration');
      if (L.kind === 'logogram' && L.at + L.draw + L.hold + L.settle > fx.duration + 1e-9) errs.push(where + ': logogram runs past the duration');
    }
  }
  return errs;
}
