// Social clip 1 (12 s): read the sign. Opens on the strongest image: in Shell I the Guest comes forward through the
// mist and draws the ring sign on the glass, Iris small in front; then the reading card (Place, Action, Power, Delay,
// Iris's guess per slot) and F: the stake. Cuts on the music's whole seconds (60 bpm).
import { JUDGE_URL, BEAUTY_HIDE, fadeIn, fadeOut, IN_SHELL, guestSign, BEHIND_IRIS, IRIS_AT_GLASS } from './common.mjs';

const FRAME = [{ kind: 'letterbox', ratio: 2.2 }, { kind: 'vignette', amount: 0.4 }];

export default {
  title: 'Forget to Foresee: clip, read the sign (12 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 0.9, fadeOut: 1.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      name: 'emerge', duration: 4.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [...IN_SHELL, ...IRIS_AT_GLASS],
      camera: BEHIND_IRIS,
      actions: [guestSign(2.5), { at: 0.0, do: 'music', tension: 35 }],
      overlays: [fadeIn(0.5), ...FRAME],
    },
    {
      name: 'ink', duration: 2.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: IN_SHELL,
      camera: { type: 'push', from: [0.6, 303.8, -2.0], look: [0, 303.95, -10.75], dist1: 5.6, fov: [38, 34], ease: 'outSine', minHeight: 290 },
      actions: [guestSign(7.5)],
      overlays: [...FRAME],
    },
    {
      name: 'read', duration: 6.0, url: JUDGE_URL, ui: 'game',
      setup: [...IN_SHELL, { do: 'frames', n: 120 }],
      camera: { type: 'dolly', path: [[1.1, 303.5, 13.8], [0.9, 303.2, 11.2]], look: [0, 303.9, -10.7], fov: [42, 40], ease: 'inOutSine', minHeight: 290 },
      actions: [{ at: 3.6, do: 'key', code: 'KeyF' }, { at: 3.6, do: 'music', tension: 45 }],
      overlays: [fadeOut(6.0, 0.7)],
    },
  ],
  captions: [
    { from: 0.5, to: 3.8, text: 'Behind the glass, a Guest draws a round sign.' },
    { from: 4.0, to: 6.0, text: 'Each sign is a future event.' },
    { from: 6.2, to: 9.4, text: 'Iris guesses its Place, Action, Power and Delay.' },
    { from: 9.6, to: 11.6, text: 'Stake 10 silk on the reading.' },
  ],
};
