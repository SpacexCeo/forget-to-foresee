// Social clip 3 (12 s): Verified ✓. Opens on the sealed-season card, then trial 3 on the walking judge path: T ends it,
// the Gift lands on Shell II as Iris read it, the stake returns, the leaf is checked against the root, and Signs &
// Visions, Resolved, shows "Verified ✓" (held 4 s).
import { WALK_URL, BEAUTY_HIDE, GLYPH, fadeOut, WALK, chapterCard, dim } from './common.mjs';

export default {
  title: 'Forget to Foresee: clip, Verified (12 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 0.9, fadeOut: 1.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      name: 'card', duration: 2.0, url: WALK_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'push', from: [6, 12.5, 16], look: GLYPH, dist1: 9, fov: [36, 32], ease: 'inOutSine' },
      overlays: [{ kind: 'letterbox', ratio: 2.2 }, dim(-1, 3, 0.7), chapterCard('Sealed', 'The whole season is fixed before trial 1', 0.0, 2.0)],
    },
    {
      name: 'verified', duration: 10.0, url: WALK_URL, ui: 'game',
      // trial 3 on the walking judge path, 10 silk staked on Shell I, trial 3
      setup: [...WALK.staked, ...WALK.trial4.slice(0, 10)],
      actions: [
        { at: 0.0, do: 'rig', dist: 14, yaw: 0.5 },
        { at: 0.4, do: 'key', code: 'KeyT' }, { at: 1.2, do: 'key', code: 'KeyT' },
        { at: 4.6, do: 'key', code: 'KeyV' },
        { at: 5.4, do: 'click', selector: '.wh-signs__chip[data-filter="resolved"]' },
      ],
      overlays: [fadeOut(10.0, 0.7)],
    },
  ],
  captions: [
    { from: 2.2, to: 5.6, text: 'Trial 3 ends: a Gift of 20 on Shell II, as Iris read it.' },
    { from: 6.0, to: 9.4, text: 'The reveal is checked against the season’s seal.' },
    { from: 9.6, to: 11.8, text: 'Verified ✓' },
  ],
};
