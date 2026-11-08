// The 60–90 s demo video for the X post (docs/submission/x-post.md): one complete loop on the fixed judge
// season (`?demo=judge`, Shell hub): read the sign the Guest draws, correct Iris's reading, stake silk,
// pay a memory for a vision, see the sign come true with "Verified ✓" against the sealed root. Captions
// are the voice; the music and every sound are the game's own. Times are shot seconds; captions are
// final-timeline seconds (the tool prints each shot's start with --check).
import { JUDGE_URL, BEAUTY_HIDE, SHELL_MID, GLYPH, fadeIn, fadeOut, SETUP } from './common.mjs';

const LOBBY = 5.0, ARCH = 8.0, FIRST = 28.0, VISION = 26.0, CLOSE = 9.0;

export default {
  title: 'Forget to Foresee: demo (one complete loop, 76 s)',
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
      transition: null,
    },
    {
      // Gameplay, continuous: the Shell dock on the balcony → flight into Shell I → the Guest draws → the human
      // reads Shell II / +2 → F stakes 10 silk → T leaves → trial 2 → M → forget a memory → vision cards.
      name: 'first-shell', duration: FIRST, url: JUDGE_URL, ui: 'game',
      actions: [
        { at: 0.0, do: 'rig', dist: 24, yaw: 0.35 },
        { at: 3.0, do: 'click', selector: '.hub-shells button[data-shell="1"]' },
        { at: 9.5, do: 'slot', k: 0, dir: 1 },
        { at: 10.8, do: 'slot', k: 3, dir: 1 },
        { at: 12.6, do: 'key', code: 'KeyF' },
        { at: 16.0, do: 'key', code: 'KeyT' },
        { at: 20.5, do: 'key', code: 'KeyM' },
        { at: 23.0, do: 'forget', index: 1 },
      ],
      overlays: [fadeIn(0.6), fadeOut(FIRST, 0.7)],
    },
    {
      // Continuous: trial 2 with the vision → into Shell I (the vision drawn) → T → trial 3, Moss's loan card →
      // decline → trial 3 ends: "Gift on Shell II: 10 silk for you", "Tick 3 · Shell II: Gift, power 20 … ✓" →
      // T stops the clock at trial 4 → V: Signs & Visions, Resolved: "Verified ✓".
      name: 'vision-shell', duration: VISION, url: JUDGE_URL, ui: 'game',
      setup: [...SETUP.stakedInShellI, ...SETUP.trial2, ...SETUP.forgot],
      actions: [
        { at: 0.0, do: 'rig', dist: 22, yaw: 0.35 },
        { at: 1.6, do: 'click', selector: '.hub-shells button[data-shell="1"]' },
        { at: 10.0, do: 'key', code: 'KeyT' },
        { at: 14.0, do: 'card', choice: 'decline' },
        { when: 'trial', value: 4, do: 'key', code: 'KeyT' },
        { at: 20.0, do: 'key', code: 'KeyV' },
        { at: 21.0, do: 'click', selector: '.wh-signs__chip[data-filter="resolved"]' },
      ],
      overlays: [fadeIn(0.6), fadeOut(VISION, 0.9)],
    },
    {
      // Closing beauty: a Shell up close with its mist, then the end card.
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
  captions: [
    { from: 0.8, to: 4.6, text: 'Most games with "AI agents" let the AI decide the ending.' },
    { from: 5.4, to: 9.2, text: 'Here the whole season is sealed in a Merkle root before you make a move.' },
    { from: 9.6, to: 12.8, text: 'A floating archipelago. Six clans of AI agents. Four Shells.' },
    { from: 13.4, to: 17.0, text: 'Your agent Iris. The Guests inside the Shells draw signs on the glass.' },
    { from: 17.4, to: 21.2, text: 'A sign is a ring of four slots: Place, Action, Power, Delay.' },
    { from: 22.0, to: 25.6, text: 'Iris guesses each slot. You read it differently: Shell II, two trials out.' },
    { from: 26.0, to: 28.8, text: 'Stake 10 silk on your reading.' },
    { from: 29.6, to: 32.4, text: 'Leaving the Shell ends the trial. A new sign glows.' },
    { from: 34.0, to: 38.6, text: 'To see further, Iris forgets a memory forever. It goes to auction as a shard.' },
    { from: 38.9, to: 41.6, text: 'Two future signs appear: a vision only she sees.', style: 'Quiet' },
    { from: 43.6, to: 47.0, text: 'The vision drawn in Shell I. Trials pass as you leave.' },
    { from: 50.6, to: 54.6, text: 'The clans lend, trade words, keep or break trust: agents with wallets and memory.' },
    { from: 56.0, to: 60.6, text: 'Trial 3. Gift at Shell II, as you read it. Your stake pays out.' },
    { from: 61.4, to: 66.4, text: 'Every reveal is checked against the root committed before trial 1: Verified ✓' },
    { from: 68.0, to: 71.4, text: 'What would you forget to see the future?' },
    { from: 72.0, to: 75.4, text: 'Play it in the browser. Built at NEAR HACKATHON by RAEN Computers.', style: 'Quiet' },
  ],
};
