// The demo video for the X post (docs/submission/x-post.md), cut to the juror's notes (docs/jury, 08.11): gameplay
// in the first seconds, "the last thing first" (the verified reveal), then the README judge table recorded from
// its own URL (`?demo=judge&mode=walk`) in real time with plain cuts, the Shell hub as a labelled second segment,
// and the wording "fixed before trial 1 and checked against that seal". Captions are the voice; the music and
// every sound are the game's own. Times are shot seconds; captions are final-timeline seconds (`--check` prints the
// shot starts: guest 0, cold-open 4, archipelago 8, run 10, pad 19, hub 53, closing 67; end 75).
import { JUDGE_URL, WALK_URL, BEAUTY_HIDE, SHELL_MID, GLYPH, fadeIn, fadeOut, WALK, segmentLabel, IN_SHELL, guestSign, BEHIND_IRIS, IRIS_AT_GLASS } from './common.mjs';

const GUEST = 4.0, COLD = 4.0, ARCH = 2.0, RUN = 9.0, PAD = 34.0, HUB = 14.0, CLOSE = 8.0;
const JUDGE_LABEL = 'The judge path · spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk';
const HUB_LABEL = 'The Shell hub · spacexceo.github.io/forget-to-foresee/?demo=judge';

export default {
  title: 'Forget to Foresee: demo (the judge path, 75 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 1.0, fadeOut: 2.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      // The strongest image first: in Shell I the Guest comes forward through the mist and draws the ring sign on the
      // glass, Iris small in the foreground (the hub URL, labelled).
      name: 'guest', duration: GUEST, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [...IN_SHELL, ...IRIS_AT_GLASS],
      camera: BEHIND_IRIS,
      actions: [guestSign(3.0)],
      overlays: [fadeIn(0.6), { kind: 'letterbox', ratio: 2.2 }, segmentLabel(HUB_LABEL, 0.3, GUEST)],
    },
    {
      // Cold open, the payoff: trial 4 on the judge path, Signs & Visions on Resolved, "Verified ✓" over Iris at the pad.
      name: 'cold-open', duration: COLD, url: WALK_URL, ui: 'game',
      setup: [...WALK.staked, ...WALK.trial4, ...WALK.resolved],
      actions: [{ at: 0.0, do: 'rig', dist: 14, yaw: 0.6 }],
      overlays: [fadeIn(0.4), segmentLabel(JUDGE_LABEL, 0.3, COLD + 1)],
    },
    {
      // Introduction: the archipelago from the cloud sea, no UI.
      name: 'archipelago', duration: ARCH, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: [0, 0, 0], radius: [84, 70], height: [34, 28], yawFrom: 104, yawTo: 92, lookHeight: 5, fov: [34, 37], ease: 'inOutSine' },
      overlays: [],
    },
    {
      // The judge path from its first frame: Trial 1 of 17, silk 63, quest "Stake 10 silk at Shell I's pad"; G with Shift held:
      // Iris runs from the balcony over the bridge (real time; the cut lands mid-bridge).
      name: 'run', duration: RUN, url: WALK_URL, ui: 'game',
      actions: [
        { at: 0.0, do: 'rig', dist: 17, yaw: 0.5 },
        { at: 1.2, do: 'keydown', code: 'ShiftLeft' },
        { at: 1.4, do: 'key', code: 'KeyG' },
      ],
      overlays: [fadeIn(0.5), segmentLabel(JUDGE_LABEL, 0.3, 5.0)],
    },
    {
      // One continuous take at the pad: the last steps of the run, the context menu (E · Anchor here for trial 3), E:
      // silk 53, "Anchor: Shell I, tick 3"; T T → Trial 2 (56); T T → Trial 3; T T → Trial 4: silk 72, "Tick 3 · Shell II:
      // Gift, power 20. Leaf #0 checked against the root ✓"; V → Resolved: "Verified ✓"; Esc; M → forget → the vision.
      name: 'pad', duration: PAD, url: WALK_URL, ui: 'game',
      setup: [{ do: 'teleport', pos: [-2.6, 0, 7.4], heading: Math.PI * 0.25 }, { do: 'frames', n: 6 }],
      actions: [
        { at: 0.0, do: 'rig', dist: 13, yaw: 0.55 },
        { at: 0.0, do: 'keydown', code: 'ShiftLeft' },
        { at: 0.2, do: 'key', code: 'KeyG' },
        { at: 3.2, do: 'keyup', code: 'ShiftLeft' },
        { when: 'spot', value: 'anchor', do: 'mark', label: 'at the pad' },
        { at: 4.6, do: 'key', code: 'KeyE' },
        { at: 8.0, do: 'key', code: 'KeyT' }, { at: 8.9, do: 'key', code: 'KeyT' },
        { at: 12.0, do: 'key', code: 'KeyT' }, { at: 12.9, do: 'key', code: 'KeyT' },
        { at: 16.0, do: 'key', code: 'KeyT' }, { at: 16.9, do: 'key', code: 'KeyT' },
        { at: 21.0, do: 'key', code: 'KeyV' },
        { at: 22.0, do: 'click', selector: '.wh-signs__chip[data-filter="resolved"]' },
        { at: 27.0, do: 'key', code: 'Escape' },
        { at: 28.0, do: 'key', code: 'KeyM' },
        { at: 30.4, do: 'forget', index: 1 },
      ],
      overlays: [fadeOut(PAD, 0.6)],
    },
    {
      // The Shell hub, labelled: the dock, a flight into Shell I, the Guest drawing on the glass, the reading card, F stakes.
      name: 'hub', duration: HUB, url: JUDGE_URL, ui: 'game',
      camera: [
        { from: 0, to: 2.0, type: 'rig' },
        { from: 2.0, to: HUB, type: 'dolly', path: [[1.1, 303.5, 13.8], [0.9, 303.2, 11.6]], look: [0, 303.9, -10.7], fov: [42, 40], ease: 'inOutSine', minHeight: 300 },
      ],
      actions: [
        { at: 0.0, do: 'rig', dist: 24, yaw: 0.35 },
        { at: 1.2, do: 'click', selector: '.hub-shells button[data-shell="1"]' },
        { at: 10.4, do: 'key', code: 'KeyF' },
      ],
      overlays: [fadeIn(0.5), segmentLabel(HUB_LABEL, 0.3, 5.0), fadeOut(HUB, 0.6)],
    },
    {
      // Button: Shell IV with its mist drifting toward the glyph, the end card, fade to black.
      name: 'closing', duration: CLOSE, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: SHELL_MID[4], radius: [34, 44], height: [30, 36], yawFrom: 200, yawTo: 250, look: [SHELL_MID[4], GLYPH], fov: [40, 36], ease: 'inOutSine' },
      actions: [{ at: 2.4, do: 'cue', name: 'gift_chime', gain: 0.7 }, { at: 2.2, do: 'music', gain: 0.55 }],
      overlays: [
        fadeIn(0.6),
        { kind: 'title', from: 2.4, to: CLOSE + 1, fadeIn: 1.2, fadeOut: 0.6, eyebrow: 'RAEN Computers · built at NEAR HACKATHON', text: 'Forget', text2: 'to foresee', sub: 'The future costs a memory', lines: ['*spacexceo.github.io/forget-to-foresee', 'github.com/SpacexCeo/forget-to-foresee'] },
        fadeOut(CLOSE, 1.2),
      ],
    },
  ],
  captions: [
    { from: 0.4, to: 3.8, text: 'Behind the glass, a Guest draws a round sign of what is coming.' },
    { from: 4.2, to: 7.8, text: 'Trial 3 came true, exactly as the seal said: Verified ✓' },
    { from: 8.0, to: 13.0, text: 'Forget to Foresee: the whole season is fixed before trial 1, and every reveal is checked against that seal.' },
    { from: 13.2, to: 16.0, text: 'Your agent Iris, among six clans of AI agents.' },
    { from: 16.2, to: 18.8, text: 'Iris reads a sign: a Gift, two trials out.' },
    { from: 19.6, to: 23.2, text: 'At Shell I’s pad: stake 10 silk on trial 3.' },
    { from: 24.0, to: 27.4, text: 'Silk 63 to 53. Now end the trials; T ends one.' },
    { from: 28.2, to: 32.4, text: 'Trials 1 and 2 pass. The clans trade, lend and place their fragments.' },
    { from: 33.0, to: 38.4, text: 'Trial 3 comes true: a Gift of 20 on Shell II. The stake returns, and the leaf is checked against the seal.' },
    { from: 39.4, to: 45.0, text: 'Signs & Visions, Resolved: Verified ✓. The season was fixed before trial 1 and checked against that seal.' },
    { from: 46.4, to: 52.2, text: 'The Price of Memory: Iris forgets a memory forever to see the next signs early. The memory becomes a shard at auction.' },
    { from: 53.4, to: 57.4, text: 'The same season in the Shell hub: fly in, and the Guest draws on the glass.' },
    { from: 58.0, to: 62.0, text: 'Iris pre-reads each slot. Change any you doubt, then stake.' },
    { from: 62.4, to: 66.8, text: 'It all runs in your browser. The NEAR contract for the same check is tested, not yet deployed.', style: 'Quiet' },
    { from: 67.4, to: 70.6, text: 'What would you forget to see the future?' },
    { from: 71.0, to: 74.4, text: 'Play it in the browser. Built at NEAR HACKATHON by RAEN Computers.', style: 'Quiet' },
  ],
};
