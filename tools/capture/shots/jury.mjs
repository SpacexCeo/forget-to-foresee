// The jury video (60 s, docs/submission/jury-video.md): the mechanics and the sell in one minute, for the jury and the
// X post. In-engine shots (the island, the Guests, Iris, the clans) are cut with motion-graphics scenes (game/cine/jury.js:
// the sign decoded, the shard, the agents, the API split screen, the season, the rewards, the NFT, the backend diagram,
// the end card) that draw only real data (tools/capture/jury-data.mjs). Every line of text stays under 3 words per second
// and on screen for at least 1.5 s (`reading`, enforced by --check), at 64 px inside X's mobile safe area.
import { JUDGE_URL, WALK_URL, BEAUTY_HIDE, WALK, IN_SHELL, IRIS_AT_GLASS, BEHIND_IRIS, guestSign, faceCam, fadeIn } from './common.mjs';

const FRAME = [{ kind: 'vignette', amount: 0.4 }];
/** A caption in the jury style; *text* is gold. */
const caption = (text, from, to) => ({ kind: 'caption', text, from, to, fadeIn: 0.3, fadeOut: 0.22 });
const page = (name, duration, actions = [], extra = {}) => ({ name, page: name, duration, actions, ...extra });
const cue = (at, name, gain = 0.8) => ({ at, do: 'cue', name, gain });
const music = (at, tension, gain) => ({ at, do: 'music', tension, ...(gain != null ? { gain } : {}) });

// The browser half of the split screen: inside Shell I, Iris's reading card, F stakes 10 silk (rendered, then scaled
// into the page's window by capture.mjs; not on the timeline by itself).
const STAKE = {
  name: 'api-browser', hidden: true, duration: 5.0, url: JUDGE_URL, ui: 'game',
  setup: [...IN_SHELL, { do: 'frames', n: 120 }],
  camera: { type: 'push', from: [1.3, 303.3, 13.6], look: [0, 303.8, -10.7], dist1: 21.5, fov: [42, 40], ease: 'inOutSine', minHeight: 290 },
  actions: [{ at: 1.2, do: 'key', code: 'KeyF' }],
  overlays: [],
};

export default {
  title: 'Forget to Foresee: jury video (60 s)',
  width: 1920, height: 1080, fps: 60,
  reading: { maxWps: 3, minHold: 1.5 },
  music: { gain: 1.0, fadeOut: 1.2 },
  output: { crf: 16, preset: 'slow', grain: 0 },
  shots: [
    { // 0–3.5 · the Guest comes forward through the mist and draws; Iris small in front
      name: 'emerge', duration: 3.5, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [...IN_SHELL, ...IRIS_AT_GLASS], camera: BEHIND_IRIS,
      actions: [guestSign(1.5), music(0, 30)],
      overlays: [fadeIn(0.8), ...FRAME, caption('They draw the future.', 0.9, 3.4)],
    },
    { // 3.5–5.5 · the archipelago: four Shells over six camps
      name: 'island', duration: 2.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: [0, 0, 0], radius: [86, 76], height: [36, 30], yawFrom: 28, yawTo: 40, lookHeight: 10, fov: [40, 38], ease: 'inOutSine' },
      overlays: [...FRAME, caption('Four Shells. Six clans.', 0.15, 1.95)],
    },
    { // 5.5–7.0 · close on the glass as the ink ring closes
      name: 'ink', duration: 1.5, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: IN_SHELL,
      camera: { type: 'push', from: [0.6, 303.8, -2.0], look: [0, 303.95, -10.75], dist1: 5.6, fov: [38, 34], ease: 'outSine', minHeight: 290 },
      actions: [guestSign(7.5)], overlays: [...FRAME],
    },
    page('decode', 6.0, [music(0, 38), cue(0.1, 'guest_arc', 0.6), ...[1.2, 1.75, 2.3, 2.85].map((t) => cue(t, 'ui_click', 0.5)), cue(4.0, 'ui_notify', 0.6), cue(4.6, 'ui_confirm', 0.8)]),
    { // 13.0–15.5 · the walking judge path at trial 4: Memories, "Forget it for a vision", the vision arrives
      name: 'forget', duration: 2.5, url: WALK_URL, ui: 'game',
      setup: [...WALK.staked, ...WALK.trial4, { do: 'key', code: 'KeyM' }, { do: 'frames', n: 12 }],
      actions: [{ at: 0.0, do: 'rig', dist: 9, yaw: 0.4 }, { at: 0.35, do: 'forget', index: 1 }, music(0, 50)],
      overlays: [caption('Forget a memory forever…', 0.15, 2.45)],
    },
    page('shard', 3.0, [cue(0.55, 'memory_dissolve', 0.9), cue(1.0, 'vision_whoosh', 0.7), cue(2.1, 'bid_tick_1', 0.7)]),
    { // 18.5–20.5 · a clan agent up close (the round-5 faces)
      name: 'face-moss', duration: 2.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [{ do: 'frames', n: 90 }], camera: faceCam('moss', 0.25),
      actions: [music(0, 56)], overlays: [...FRAME, caption('Six clans. Six agents.', 0.15, 1.95)],
    },
    page('agents', 4.5, [cue(1.0, 'bid_tick_2', 0.7), cue(2.0, 'ui_confirm', 0.6), cue(3.0, 'ui_error', 0.7)]),
    page('api', 5.0, [music(0, 52), cue(0.4, 'ui_click', 0.4), cue(1.2, 'anchor_plant', 0.8)], { under: { shot: 'api-browser', x: 60, y: 300, w: 880, h: 495 } }),
    STAKE,
    page('season', 4.0, [music(0, 68), cue(0.3, 'gift_chime', 0.5), cue(2.6, 'storm_crack', 0.6)]),
    { // 34.0–36.5 · trial 13: the giants loom at the glass, the mist churns
      name: 'crisis', duration: 2.5, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: IN_SHELL,
      camera: { type: 'push', from: [-1.2, 302.4, 9.5], look: [0, 304.6, -10.7], dist1: 15.0, fov: [44, 40], roll: [0, -0.02], ease: 'inOutSine', minHeight: 290 },
      actions: [{ at: 0.0, do: 'guests', seed: 'trailer', cue: 'crisis', warp: 2.5 }, music(0, 92), cue(0.0, 'guest_spike', 0.9)],
      overlays: [...FRAME, caption('*Trial 13* · The crisis', 0.15, 2.35)],
    },
    page('ash', 3.5, [cue(0.45, 'storm_crack', 0.8), cue(1.5, 'vision_whoosh', 0.5), cue(2.1, 'gift_chime', 0.7), music(2.1, 70)]),
    { // 40.0–42.5 · before the vote: every Guest faces the visitor
      name: 'vote', duration: 2.5, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      setup: [...IN_SHELL, ...IRIS_AT_GLASS], camera: BEHIND_IRIS,
      actions: [{ at: 0.0, do: 'guests', seed: 'trailer', cue: 'vote', warp: 7.5 }, music(0, 45), cue(0.0, 'guest_call', 0.8)],
      overlays: [...FRAME, caption('Trial 17: *Gift or Weapon?*', 0.15, 2.35)],
    },
    page('rewards', 6.0, [music(0, 40), cue(0.7, 'gift_chime', 0.6), cue(1.5, 'storm_crack', 0.5), ...[2.95, 3.13, 3.31, 3.49].map((t, i) => cue(t, `vote_stone_${(i % 3) + 1}`, 0.7))]),
    page('nft', 4.0, [music(0, 34), cue(0.1, 'vision_whoosh', 0.6), cue(1.4, 'ui_confirm', 0.5)]),
    page('backend', 4.5, [music(0, 30), cue(2.0, 'ui_notify', 0.5), cue(2.55, 'ui_confirm', 0.6)]),
    page('end', 3.0, [music(0, 8, 0.6), cue(0.0, 'sting_survived', 0.8)]),
  ],
  // The SRT (players, X): the same lines the picture shows, at the same times.
  captions: [
    { from: 0.9, to: 3.4, text: 'They draw the future.' },
    { from: 3.65, to: 5.45, text: 'Four Shells. Six clans.' },
    { from: 7.2, to: 10.5, text: 'Read it slot by slot: Place, Action, Power, Delay.' },
    { from: 10.7, to: 12.95, text: 'Ask the Guests: yes or no.' },
    { from: 13.15, to: 15.45, text: 'Forget a memory forever…' },
    { from: 15.7, to: 18.45, text: '…to see the future first.' },
    { from: 18.65, to: 20.45, text: 'Six clans. Six agents.' },
    { from: 20.7, to: 22.7, text: 'Silk, a memory, a temper.' },
    { from: 22.85, to: 24.95, text: 'They trade… and break trust.' },
    { from: 25.2, to: 27.5, text: 'Humans and agents. Same rules.' },
    { from: 27.7, to: 29.95, text: 'Open HTTP API · OpenAPI 3.1' },
    { from: 30.2, to: 32.25, text: '17 trials. Every reveal checked ✓' },
    { from: 32.4, to: 33.95, text: 'Tension rises.' },
    { from: 34.15, to: 36.35, text: 'Trial 13 · The crisis' },
    { from: 36.62, to: 38.25, text: 'Ash turns away.' },
    { from: 38.4, to: 39.95, text: 'Ash’s Key restores them.' },
    { from: 40.15, to: 42.35, text: 'Trial 17: Gift or Weapon?' },
    { from: 42.7, to: 45.25, text: 'Stake early, bigger share.' },
    { from: 45.45, to: 48.45, text: 'Then the vote pays out.' },
    { from: 48.65, to: 50.7, text: 'The memory becomes an NFT.' },
    { from: 50.85, to: 52.45, text: 'Minted on NEAR testnet.' },
    { from: 52.65, to: 56.95, text: 'Sealed before trial 1. Checked on NEAR.' },
    { from: 57.1, to: 59.9, text: 'Forget to Foresee · Made by Lambada_eth' },
  ],
};
