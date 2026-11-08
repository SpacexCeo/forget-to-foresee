// The trailer (41 s), reworked 08.11 on the owner's note "make the videos interesting": open on the strongest image
// (the ink Guest emerging from the mist and drawing the ring sign on the glass, Iris small in front), then a fast,
// legible story on the beats of the game's own music (60 bpm: every cut lands on a whole second, the chapter cards on
// bar lines): a sign → Iris stakes → the seal, Verified ✓ → forget a memory → visions → the shard to auction → the
// clans' faces and hands, meeting and trading → trial 13, the crisis → the vote → the title. The two differentiators
// lead as cards: the sealed season and the Price of Memory. Motion in every shot; no wide fog shot over 2 s.
// The crisis and vote shots cue the Guests' own trial-13 and pre-vote moments (docs/guests-stage.md) directly.
import { JUDGE_URL, WALK_URL, BEAUTY_HIDE, GLYPH, fadeIn, fadeOut, WALK, IN_SHELL, guestSign, faceCam, chapterCard, dim, BEHIND_IRIS, IRIS_AT_GLASS } from './common.mjs';

const word = (text, from, to) => ({ kind: 'word', text, position: 'low', from, to, fadeIn: 0.2, fadeOut: 0.25, rise: 10 });
const FRAME = [{ kind: 'letterbox', ratio: 2.2 }, { kind: 'vignette', amount: 0.45 }];
const face = (clan, side) => ({
  name: 'face-' + clan, duration: 1.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
  setup: [{ do: 'frames', n: 90 }],
  camera: faceCam(clan, side),
  overlays: [...FRAME],
});

export default {
  title: 'Forget to Foresee: trailer (41 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 1.0, fadeOut: 2.0 },
  output: { crf: 16, preset: 'slow', grain: 0 },
  shots: [
    {
      // 0–6: out of black, the Guest comes forward through the mist and starts to draw; Iris small in the foreground.
      name: 'emerge', duration: 6.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [...IN_SHELL, ...IRIS_AT_GLASS],
      camera: BEHIND_IRIS,
      actions: [guestSign(1.5), { at: 0.0, do: 'music', tension: 35 }],
      overlays: [fadeIn(1.0), ...FRAME, word('They draw the future', 3.0, 5.8)],
    },
    {
      // 6–8: close on the glass: ink runs from the tendril and the ring closes.
      name: 'ink', duration: 2.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: IN_SHELL,
      camera: { type: 'push', from: [0.6, 303.8, -2.0], look: [0, 303.95, -10.75], dist1: 5.6, fov: [38, 34], ease: 'outSine', minHeight: 290 },
      actions: [guestSign(7.5)],
      overlays: [...FRAME],
    },
    {
      // 8–11: the reading card; F: Iris stakes 10 silk on her reading.
      name: 'stake', duration: 3.0, url: JUDGE_URL, ui: 'game',
      setup: [...IN_SHELL, { do: 'frames', n: 120 }],
      camera: { type: 'push', from: [1.3, 303.3, 13.6], look: [0, 303.8, -10.7], dist1: 21.5, fov: [42, 40], ease: 'inOutSine', minHeight: 290 },
      actions: [{ at: 0.9, do: 'key', code: 'KeyF' }, { at: 0.9, do: 'music', tension: 45 }],
      overlays: [],
    },
    {
      // 11–13: differentiator I, the sealed season: a card over a push on the floating glyph.
      name: 'card-seal', duration: 2.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'push', from: [6, 12.5, 16], look: GLYPH, dist1: 9, fov: [36, 32], ease: 'inOutSine' },
      overlays: [...FRAME, dim(-1, 3, 0.7), chapterCard('Sealed', 'The whole season is fixed before trial 1', 0.0, 2.0, 'I')],
    },
    {
      // 13–16: trial 3 came true: Signs & Visions, Resolved, Verified ✓ (the walking judge path).
      name: 'verified', duration: 3.0, url: WALK_URL, ui: 'game',
      setup: [...WALK.staked, ...WALK.trial4, ...WALK.resolved],
      actions: [{ at: 0.0, do: 'rig', dist: 12, yaw: 0.7 }, { at: 0.0, do: 'cue', name: 'gift_chime', gain: 0.8 }],
      overlays: [],
    },
    {
      // 16–18: differentiator II, the Price of Memory.
      name: 'card-memory', duration: 2.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: [0, 0, 0], radius: [26, 22], height: [7, 9], yawFrom: 60, yawTo: 78, lookHeight: 5, fov: [38, 34], ease: 'inOutSine' },
      overlays: [...FRAME, dim(-1, 3, 0.7), chapterCard('The price of memory', 'Forget one forever to see the future', 0.0, 2.0, 'II')],
    },
    {
      // 18–22: M, "Forget it for a vision": the vision floods in, two future signs; the shard goes to auction (the log).
      name: 'forget', duration: 4.0, url: WALK_URL, ui: 'game',
      setup: [...WALK.staked, ...WALK.trial4, { do: 'key', code: 'KeyM' }, { do: 'frames', n: 12 }],
      actions: [{ at: 0.0, do: 'rig', dist: 9, yaw: 0.4 }, { at: 0.4, do: 'forget', index: 1 }, { at: 0.4, do: 'music', tension: 58 }],
      overlays: [],
    },
    // 22–26: the clans' faces, one beat each.
    face('moss', 0.25), face('salt', -0.25), face('amber', 0.25), face('frost', -0.25),
    {
      // 26–29: the clans meet and trade over the plaza after a trial ends: a crane over the camps.
      name: 'clans', duration: 3.0, url: WALK_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [...WALK.staked, { do: 'key', code: 'KeyT' }, { do: 'frames', n: 30 }, { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'trial', value: 2, max: 300 }, { do: 'frames', n: 60 }],
      camera: { type: 'crane', path: [[-14, 0, 20], [-4, 0, 14]], y0: 4.5, y1: 9, look: [[0, 1.5, 0], [0, 1.0, -6]], fov: [40, 36], ease: 'inOutSine' },
      actions: [{ at: 0.0, do: 'music', tension: 66 }],
      overlays: [...FRAME, word('Trade · lend · betray', 0.4, 2.8)],
    },
    {
      // 29–33: trial 13, the crisis: the giants loom at the glass, the mist churns, the backlight flares.
      name: 'crisis', duration: 4.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: IN_SHELL,
      camera: { type: 'push', from: [-1.2, 302.4, 9.5], look: [0, 304.6, -10.7], dist1: 15.0, fov: [44, 40], roll: [0, -0.02], ease: 'inOutSine', minHeight: 290 },
      actions: [{ at: 0.0, do: 'guests', seed: 'trailer', cue: 'crisis', warp: 2.5 }, { at: 0.0, do: 'music', tension: 92 }, { at: 0.0, do: 'cue', name: 'guest_spike', gain: 0.9 }],
      overlays: [...FRAME, chapterCard('Trial 13', 'The crisis', 0.3, 2.6)],
    },
    {
      // 33–36: before the vote: every Guest faces the visitor, still and lit.
      name: 'vote', duration: 3.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [...IN_SHELL, ...IRIS_AT_GLASS],
      camera: BEHIND_IRIS,
      actions: [{ at: 0.0, do: 'guests', seed: 'trailer', cue: 'vote', warp: 7.5 }, { at: 0.0, do: 'music', tension: 40 }, { at: 0.0, do: 'cue', name: 'guest_call', gain: 0.8 }],
      overlays: [...FRAME, word('Then the clans vote', 0.4, 2.8)],
    },
    {
      // 36–41: the title over a drift toward the glyph, the survived stinger, the links.
      name: 'title', duration: 5.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: [0, 0, 0], radius: [70, 58], height: [26, 22], yawFrom: 84, yawTo: 100, lookHeight: 6, fov: 34, ease: 'outSine' },
      actions: [{ at: 0.0, do: 'cue', name: 'sting_survived', gain: 0.8 }, { at: 0.0, do: 'music', tension: 8, gain: 0.5 }],
      overlays: [
        ...FRAME, dim(-1, 6, 0.45),
        { kind: 'title', from: 0.2, to: 6, fadeIn: 0.9, fadeOut: 0.6, eyebrow: 'RAEN Computers · built at NEAR HACKATHON', text: 'Forget', text2: 'to foresee', sub: 'The future costs a memory', lines: ['*spacexceo.github.io/forget-to-foresee', 'github.com/SpacexCeo/forget-to-foresee'] },
        fadeOut(5.0, 1.0),
      ],
    },
  ],
  captions: [
    { from: 1.0, to: 5.6, text: 'Behind the glass, the Guests draw round signs of what is coming.' },
    { from: 8.2, to: 10.8, text: 'Your agent Iris reads one. You stake silk on it.' },
    { from: 13.2, to: 15.8, text: 'It comes true, and the seal checks it: Verified ✓' },
    { from: 18.2, to: 21.8, text: 'Forget a memory forever: the visions come early, and the memory goes to auction.' },
    { from: 22.2, to: 25.8, text: 'Six clans of AI agents with wallets and memory.' },
    { from: 26.2, to: 28.8, text: 'They meet, trade, lend and break trust.' },
  ],
};
