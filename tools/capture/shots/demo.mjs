// The 60–90 s demo video for the X post (docs/submission/x-post.md): one complete loop on the fixed judge
// season (`?demo=judge`, Shell hub), in the order of the README judge table (08.11): read the sign the Guest
// draws, Iris reads it for trial 3, stake 10 silk, let the trials pass, answer Moss's loan,
// see trial 3 come true with "Verified ✓" against the sealed root, then pay a memory for a vision. Captions
// are the voice; the music and every sound are the game's own. Times are shot seconds; captions are
// final-timeline seconds (the tool prints each shot's start with --check).
import { JUDGE_URL, BEAUTY_HIDE, SHELL_MID, GLYPH, fadeIn, fadeOut, SETUP } from './common.mjs';

const LOBBY = 5.0, ARCH = 8.0, FIRST = 24.0, VERIFIED = 26.0, CLOSE = 9.0;

export default {
  title: 'Forget to Foresee: demo (one complete loop, 72 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 1.0, fadeOut: 2.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      // The lobby as the player sees it: the owner's art, drifting mist, the title; ENTER THE WORLD is pressed.
      name: 'lobby', lobby: true, duration: LOBBY, url: { demo: 'judge' }, ui: 'game',
      actions: [{ at: 4.1, do: 'click', selector: '#ftf-enter' }],
      overlays: [fadeIn(0.9), fadeOut(LOBBY, 0.8)],
    },
    {
      // Beauty: the archipelago from the cloud sea, a slow orbit that settles toward the plaza.
      name: 'archipelago', duration: ARCH, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: [0, 0, 0], radius: [98, 78], height: [40, 30], yawFrom: 112, yawTo: 78, lookHeight: 5, fov: [34, 38], ease: 'inOutSine' },
      overlays: [fadeIn(1.0)],
    },
    {
      // Gameplay, continuous: the Shell dock on the balcony → flight into Shell I → the Guest draws → the reading card
      // says trial 3 → F stakes 10 silk → T leaves → trial 2, a new sign glows → T lets trial 2 pass → trial 3
      // stops on Moss's loan card (cut).
      name: 'first-shell', duration: FIRST, url: JUDGE_URL, ui: 'game',
      actions: [
        { at: 0.0, do: 'rig', dist: 24, yaw: 0.35 },
        { at: 3.0, do: 'click', selector: '.hub-shells button[data-shell="1"]' },
        { at: 12.6, do: 'key', code: 'KeyF' },
        { at: 15.8, do: 'key', code: 'KeyT' },
        { at: 20.4, do: 'key', code: 'KeyT' },
      ],
      overlays: [fadeIn(0.6), fadeOut(FIRST, 0.5)],
    },
    {
      // Continuous: Moss's card → decline → trial 3 ends: "Tick 3 · Shell II: Gift, power 20 … ✓", silk 72 → the
      // clock stops on trial 4's new signs → V: Signs & Visions, Resolved: "Verified ✓" → Esc → M → forget a memory
      // → the vision: two future signs.
      name: 'verified', duration: VERIFIED, url: JUDGE_URL, ui: 'game',
      setup: [...SETUP.stakedInShellI, ...SETUP.trial2, ...SETUP.trial3card],
      actions: [
        { at: 0.0, do: 'rig', dist: 20, yaw: 0.35 },
        { at: 1.8, do: 'card', choice: 'decline' },
        { at: 7.4, do: 'key', code: 'KeyV' },
        { at: 8.4, do: 'click', selector: '.wh-signs__chip[data-filter="resolved"]' },
        { at: 14.0, do: 'key', code: 'Escape' },
        { at: 15.4, do: 'key', code: 'KeyM' },
        { at: 18.2, do: 'forget', index: 1 },
      ],
      overlays: [fadeIn(0.5), fadeOut(VERIFIED, 0.9)],
    },
    {
      // Closing beauty: Shell IV up close with its mist, then the end card.
      name: 'closing', duration: CLOSE, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: SHELL_MID[4], radius: [34, 44], height: [30, 36], yawFrom: 200, yawTo: 250, look: [SHELL_MID[4], GLYPH], fov: [40, 36], ease: 'inOutSine' },
      actions: [{ at: 3.2, do: 'cue', name: 'gift_chime', gain: 0.7 }, { at: 3.0, do: 'music', gain: 0.55 }],
      overlays: [
        fadeIn(0.8),
        { kind: 'title', from: 3.2, to: CLOSE + 1, fadeIn: 1.2, fadeOut: 0.6, eyebrow: 'RAEN Computers · built at NEAR HACKATHON', text: 'Forget', text2: 'to foresee', sub: 'The future costs a memory', lines: ['*spacexceo.github.io/forget-to-foresee', 'github.com/SpacexCeo/forget-to-foresee'] },
        fadeOut(CLOSE, 1.2),
      ],
    },
  ],
  // Final-timeline seconds: lobby 0, archipelago 5, first-shell 13, verified 37, closing 63 (end 72).
  captions: [
    { from: 0.8, to: 4.6, text: 'Most games with "AI agents" let the AI decide the ending.' },
    { from: 5.4, to: 9.2, text: 'Here the whole season is sealed in a Merkle root before you make a move.' },
    { from: 9.6, to: 12.8, text: 'A floating archipelago. Six clans of AI agents. Four Shells.' },
    { from: 13.4, to: 17.0, text: 'Your agent Iris. The Guests inside the Shells draw signs on the glass.' },
    { from: 17.8, to: 21.6, text: 'A sign is a ring of four slots: Place, Action, Power, Delay.' },
    { from: 22.2, to: 25.5, text: 'Iris reads it: a Gift, two trials out. Change any slot you doubt.' },
    { from: 25.8, to: 28.4, text: 'Stake 10 silk on your reading.' },
    { from: 29.2, to: 32.4, text: 'Leaving the Shell ends the trial. A new sign glows.' },
    { from: 33.4, to: 36.8, text: 'Trials pass on their own and stop when a clan wants something.' },
    { from: 37.6, to: 41.6, text: 'Moss asks for a loan. The clans lend, trade words, keep or break trust.' },
    { from: 42.2, to: 46.4, text: 'Trial 3 comes true: a Gift of 20 on Shell II. Your stake returns.' },
    { from: 47.2, to: 52.6, text: 'Every reveal is checked against the root committed before trial 1: Verified ✓' },
    { from: 53.4, to: 57.8, text: 'To see further, Iris forgets a memory forever. It goes to auction as a shard.' },
    { from: 58.6, to: 62.4, text: 'Two future signs appear: a vision only she sees.' },
    { from: 64.0, to: 67.4, text: 'What would you forget to see the future?' },
    { from: 68.0, to: 71.4, text: 'Play it in the browser. Built at NEAR HACKATHON by RAEN Computers.', style: 'Quiet' },
  ],
};
