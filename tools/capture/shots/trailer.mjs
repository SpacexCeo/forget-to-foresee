// The 30 s trailer: pure beauty shots with four chapter words in the game's typography (READ · STAKE ·
// FORGET · FORESEE), one gameplay glimpse of the glass, and the title card. No HUD except that glimpse.
// The music is the game's own stems, pushed from calm to uneasy for the middle and resolved by the
// survived stinger under the title.
import { JUDGE_URL, BEAUTY_HIDE, SHELL_MID, SHELL, GLYPH, CAMP, INTERIOR, fadeIn, fadeOut, SETUP } from './common.mjs';

const RISE = 6.0, SHELL4 = 5.0, PLAZA = 5.5, GLASS = 6.0, STAKE = 3.5, TITLE = 6.0;
const word = (text, from, to) => ({ kind: 'word', text, position: 'low', from, to, fadeIn: 0.5, fadeOut: 0.5, rise: 12 });

export default {
  title: 'Forget to Foresee: trailer (30 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 1.0, fadeOut: 2.0 },
  output: { crf: 16, preset: 'slow', grain: 0 },
  shots: [
    {
      // Out of the cloud sea: a crane rising from below the plateaus to the whole archipelago.
      name: 'rise', duration: RISE, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'crane', path: [[30, 0, 118], [10, 0, 92]], y0: -6, y1: 34, look: [[0, 6, 0], [0, 4, 0]], fov: [42, 36], ease: 'inOutSine', allowLow: true },
      overlays: [fadeIn(1.4), { kind: 'letterbox', ratio: 2.2 }, { kind: 'vignette', amount: 0.5 }],
    },
    {
      // Shell IV, cracked open, mist below: a close orbit.
      name: 'shell-iv', duration: SHELL4, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, transition: { type: 'fade', duration: 0.6 },
      camera: { type: 'orbit', center: SHELL_MID[4], radius: [54, 44], height: [22, 32], yawFrom: 230, yawTo: 268, lookHeight: -2, fov: [34, 38], ease: 'inOutSine' },
      overlays: [{ kind: 'letterbox', ratio: 2.2 }, { kind: 'vignette', amount: 0.5 }, word('Read the signs', 0.8, SHELL4 - 0.4)],
    },
    {
      // The plaza: a low dolly across the Scroll medallion under the floating glyph, the clans at their camps.
      name: 'plaza', duration: PLAZA, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, transition: { type: 'fade', duration: 0.6 },
      setup: [{ do: 'teleport', pos: [0, 0, 6.5], heading: Math.PI }],
      camera: { type: 'dolly', path: [[-7.5, 1.9, 6.0], [-2.5, 2.6, 7.2], [5.5, 3.6, 4.5]], look: [[0, 1.2, 0], [0, 3, 0], [0, 8.5, 0]], fov: [42, 34], ease: 'inOutSine' },
      actions: [{ at: 2.2, do: 'music', tension: 48 }],
      overlays: [{ kind: 'letterbox', ratio: 2.2 }, { kind: 'vignette', amount: 0.5 }, word('Stake silk on your reading', 1.0, PLAZA - 0.4)],
    },
    {
      // Inside a Shell: the Guests behind the glass draw the sign, a slow push toward the glass.
      name: 'glass', duration: GLASS, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, transition: { type: 'fade', duration: 0.6 },
      setup: [{ do: 'fly', shell: 1 }, { do: 'until', pred: 'inShell', max: 400 }, { do: 'until', pred: 'hubIdle', max: 200 }, { do: 'until', pred: 'interiorReal', max: 60 }],
      camera: { type: 'push', from: [1.5, 302.6, 9.0], look: [0, 303.6, -10.7], lookTo: [0, 303.9, -10.7], dist1: 9.5, fov: [44, 38], ease: 'inOutSine', minHeight: 290 },
      overlays: [{ kind: 'letterbox', ratio: 2.2 }, { kind: 'vignette', amount: 0.35 }, word('Forget a memory to see further', 1.2, GLASS - 0.4)],
    },
    {
      // One gameplay glimpse: the reading card inside the Shell, the human's reading and the stake.
      name: 'stake', duration: STAKE, url: JUDGE_URL, ui: 'game', transition: { type: 'fade', duration: 0.5 },
      setup: [{ do: 'fly', shell: 1 }, { do: 'until', pred: 'inShell', max: 400 }, { do: 'until', pred: 'hubIdle', max: 200 }, { do: 'frames', n: 180 }],
      camera: { type: 'static', pos: [1.3, 303.3, 12.8], look: [0, 303.8, -10.7], fov: 42, drift: 0.12, minHeight: 300 },
      actions: [{ at: 1.2, do: 'key', code: 'KeyF' }],
      overlays: [],
    },
    {
      // Title over the archipelago at a slow drift, the survived stinger, the links.
      name: 'title', duration: TITLE, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, transition: { type: 'fadeblack', duration: 0.8 },
      camera: { type: 'orbit', center: [0, 0, 0], radius: [88, 84], height: [34, 36], yawFrom: 84, yawTo: 96, lookHeight: 6, fov: 34, ease: 'inOutSine' },
      actions: [{ at: 0.3, do: 'cue', name: 'sting_survived', gain: 0.8 }, { at: 0.0, do: 'music', tension: 8, gain: 0.5 }],
      overlays: [
        { kind: 'letterbox', ratio: 2.2 }, { kind: 'vignette', amount: 0.55 },
        { kind: 'title', from: 0.6, to: TITLE + 1, fadeIn: 1.4, fadeOut: 0.6, eyebrow: 'RAEN Computers · built at NEAR HACKATHON', text: 'Forget', text2: 'to foresee', sub: 'The future costs a memory', lines: ['*spacexceo.github.io/forget-to-foresee', 'github.com/SpacexCeo/forget-to-foresee'] },
        fadeOut(TITLE, 1.2),
      ],
    },
  ],
  captions: [
    { from: 1.6, to: 5.2, text: 'A season sealed in a Merkle root before your first move.' },
    { from: 6.4, to: 10.2, text: 'The Guests draw round signs on the glass. Read them.' },
    { from: 11.4, to: 15.6, text: 'Six clans of AI agents trade words, silk and trust. Stake on what you read.' },
    { from: 17.2, to: 21.4, text: 'Your agent Iris forgets a memory forever to see the future.' },
    { from: 22.6, to: 25.0, text: 'Stake 10 silk. Watch the sign come true. Verified ✓' },
  ],
};
void SHELL; void GLYPH; void CAMP; void INTERIOR; void SETUP;
