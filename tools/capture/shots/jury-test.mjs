// The jury video's 18.5 s cinematic test (docs/submission/jury-video.md, v3): the world first, then the agents, then
// the memory, then the proof. Every picture is in-engine; the interface and the data are `layers` anchored in depth
// (game/src/cinematic/layers.js): projected through each frame's camera, on the same virtual clock as the render.
// Data: game/cine/jury-data.json (tools/capture/jury-data.mjs: the engine, the judge playthrough, the deployment record).
import { readFileSync } from 'node:fs';
import { JUDGE_URL, BEAUTY_HIDE, CAMP, SHELL } from './common.mjs';

const D = JSON.parse(readFileSync(new URL('../../../game/cine/jury-data.json', import.meta.url), 'utf8'));
const S = D.shard;
const FRAME = [{ kind: 'vignette', amount: 0.42 }];
// The capture-only look (lead 09.11): dusk, a cool grey-green mood tint; the game's defaults are untouched.
const LOOK = { do: 'look', preset: 'dusk', atm: { elevation: 7, azimuth: 48, sunIntensity: 2.6, skyMean: 0.14, exposure: 0.35, cloudCover: 0.75, warmth: 0.75, envIntensity: 0.18, fog: { density: 0.028, falloff: 0.12, sunPower: 4, aerial: 0.55 } }, tint: '#4f625e', amount: 0.32 };
const cue = (at, name, gain = 0.8) => ({ at, do: 'cue', name, gain });
const music = (at, tension, gain) => ({ at, do: 'music', tension, ...(gain != null ? { gain } : {}) });
const head = (camp) => [CAMP[camp][0], 1.6, CAMP[camp][2]];
// The shard on its pedestal at the Iris plateau (scenes/layout.js SHARD: ring 26.8 m at 277°, pedestal top 1.0 m).
const SHARD_AT = [26.8 * Math.cos(277 * Math.PI / 180), 1.2, 26.8 * Math.sin(277 * Math.PI / 180)];
const IN = [Math.cos(97 * Math.PI / 180), Math.sin(97 * Math.PI / 180)]; // from the shard toward the plaza
const SHELL2 = [SHELL[2][0], SHELL[2][1] + 9, SHELL[2][2]];
const ACCENT = { iris: '#b49be6', salt: '#d9dcd6', ash: '#bdb6ad', moss: '#9cba7c', amber: '#e6a84a', frost: '#a9c6d4' };
// A sweep inside the camp ring (radius 21 m: 9 m from the camps) from one angle to another, looking out at the camps.
const ring = (a0, a1, n = 5) => Array.from({ length: n }, (_, i) => { const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180; return [[14 * Math.cos(a), 3.4, 14 * Math.sin(a)], [30 * Math.cos(a), 1.2, 30 * Math.sin(a)]]; });
const sweep = (a0, a1) => { const r = ring(a0, a1); return { type: 'dolly', path: r.map((x) => x[0]), look: r.map((x) => x[1]), fov: [44, 42], ease: 'inOutSine' }; };
// The camera's right in a view along -dir (XZ), to frame the subject off-centre beside the token panel.
const RIGHT = [-(-IN[1]), 0, -IN[0]];
const lookBeside = (p, k) => [p[0] - RIGHT[0] * k, p[1], p[2] - RIGHT[2] * k];
const card = (clan, name, temper, from, to) => ({ kind: 'clanCard', clan, name, sub: temper, color: ACCENT[clan], target: clan === 'iris' ? null : clan, world: clan === 'iris' ? head('iris') : null, from, to, lift: 120 });
const ROOT8 = D.root.slice(0, 8) + '…';
const PANEL = { kind: 'panel', svg: S.svg, x: 80, y: 180, w: 1180, h: 720, art: 320, title: 'Minted on <b>NEAR</b> testnet',
  fields: [['Memory', `Iris · A Call · weight ${S.weight}`], ['Forgotten · Sold', `Trial ${S.forgotten_at_tick} · Frost, ${S.price} silk`], ['Season root', ROOT8], ['Opened leaf', `#${S.unlocked_index} · ${S.unlocked_leaf.slice(0, 8)}…`]] };
// eslint-disable-next-line no-unused-vars
const pin = (clan, name, temper, from, to, target = clan) => ({ kind: 'pin', target: clan === 'iris' ? null : target, world: clan === 'iris' ? head('iris') : null, name, sub: temper, color: ACCENT[clan], from, to, lift: 160 });

export default {
  title: 'Forget to Foresee: jury video, cinematic test (18.5 s)',
  width: 1920, height: 1080, fps: 60,
  reading: { maxWps: 3, minHold: 1.5 },
  // The film grade of the plates (layers pass): deeper shadows, less milk in the fog, a cooler grey-green; per shot below.
  grade: 'contrast(1.2) brightness(0.92) saturate(0.85) sepia(0.04)',
  music: { gain: 1.0, fadeOut: 1.0 },
  output: { crf: 18, preset: 'slow', grain: 0 }, // a 4K30 master of 18.5 s stays under GitHub's 100 MB
  shots: [
    { // 0–3 · up out of the cloud sea; the archipelago opens; the chapter title emerges from the haze
      name: 'fly-in', duration: 3.0, setup: [LOOK, { do: 'frames', n: 60 }], grade: 'contrast(1.3) brightness(0.86) saturate(0.82) sepia(0.04)', url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'dolly', path: [[124, -25, 152], [88, 2, 112], [52, 24, 72], [38, 30, 54]], look: [[40, -6, 40], [20, 2, 20], [4, 5, 4], [0, 6, 0]], fov: [46, 40], ease: 'inOutSine', minHeight: -40, allowLow: true },
      actions: [music(0, 28), cue(0.0, 'guest_arc', 0.4)],
      overlays: [...FRAME, { kind: 'black', from: -1, to: 0.6, fadeIn: 0, fadeOut: 0.6 }],
      layers: [{ kind: 'lockup', eyebrow: 'I', text: 'The Agents', sub: 'Memory · Prophecy · Betrayal', from: 0.9, to: 3.0, y: 400, fadeOut: 0.35 }],
    },
    { // 3–4.5 · the back of the ring: Salt, Iris, Frost, their names pinned above their heads
      name: 'clans-back', duration: 1.5, allowJumps: 12, // a fast pan past light and dark camps: real luma steps, not flicker
       url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: [LOOK, { do: 'frames', n: 90 }],
      camera: sweep(200, 340),
      actions: [music(0, 38), cue(0.1, 'ui_notify', 0.4)],
      overlays: [...FRAME],
      layers: [card('salt', 'Salt', 'Cunning', 0.0, 1.5), card('iris', 'Iris', 'You', 0.15, 1.5), card('frost', 'Frost', 'Scholar', 0.3, 1.5)],
    },
    { // 4.5–6 · the front of the ring: Ash, Moss, Amber
      name: 'clans-front', duration: 1.5, allowJumps: 12,
       url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: [LOOK, { do: 'frames', n: 90 }],
      camera: sweep(20, 160),
      actions: [cue(0.1, 'ui_notify', 0.4)],
      overlays: [...FRAME],
      layers: [card('amber', 'Amber', 'Greedy', 0.0, 1.5), card('moss', 'Moss', 'Honest', 0.15, 1.5), card('ash', 'Ash', 'Wary', 0.3, 1.5)],
    },
    { // 6–9 · deals, deception, conflict: the season's real moments drawn between the real camps
      name: 'conflict', duration: 3.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: [LOOK, { do: 'frames', n: 90 }],
      camera: { type: 'orbit', center: [0, 0, 0], radius: [58, 54], height: [44, 40], yawFrom: 62, yawTo: 80, lookHeight: -2, fov: [44, 42], ease: 'inOutSine' },
      actions: [music(0, 52), cue(0.3, 'bid_tick_2', 0.7), cue(1.15, 'guest_spike', 0.5), cue(2.1, 'storm_crack', 0.8)],
      overlays: [...FRAME],
      layers: [
        { kind: 'transfer', a: head('iris'), b: head('iney'), label: 'Frost wins the shard', amount: '13', from: 0.1, to: 1.75, arc: 200, ax: 1480, ay: 330 },
        { kind: 'quote', world: head('sol'), text: 'It is a weapon', who: 'Salt', color: ACCENT.salt, from: 0.95, to: 2.45, x: 520, y: 300 },
        { kind: 'fracture', a: head('pepel'), b: head('yantar'), label: 'Ash cheats Amber', amount: '16', from: 1.75, snap: 2.4, to: 3.0, arc: 80, ax: 1300, ay: 720 },
      ],
    },
    { // 9–12 · macro on the physical shard: it cracks, two future signs rise out of it
      name: 'shard-macro', duration: 3.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: [LOOK, { do: 'frames', n: 90 }],
      camera: { type: 'push', from: [SHARD_AT[0] + IN[0] * 2.6, 1.32, SHARD_AT[2] + IN[1] * 2.6], look: [SHARD_AT[0], 1.26, SHARD_AT[2]], dist1: 1.35, fov: [15, 10], ease: 'inOutSine', minHeight: 0.5 },
      actions: [{ at: 0, do: 'dof', world: SHARD_AT, aperture: 0.006, maxblur: 0.014 }, music(0, 36), cue(1.4, 'memory_dissolve', 0.9), cue(2.0, 'vision_whoosh', 0.7)],
      overlays: [...FRAME],
      layers: [
        { kind: 'lockup', eyebrow: 'II', text: 'The Memory Shard', sub: 'Memory is the price of prophecy', from: 0.1, to: 1.7, y: 330, fadeOut: 0.3 },
        { kind: 'crumb', text: 'Memory', at: 3, from: 0.3, to: 3.0 },
        { kind: 'cracks', world: SHARD_AT, from: 1.35, to: 3.0, size: 190 },
        { kind: 'sign', world: SHARD_AT, forms: D.visions[0].forms, dots: D.visions[0].dots, from: 1.9, to: 3.0, dx: -420, dy: -120, size: 300, label: `sign #${D.visions[0].index + 1}` },
        { kind: 'sign', world: SHARD_AT, forms: D.visions[1].forms, dots: D.visions[1].dots, from: 2.05, to: 3.0, dx: 420, dy: -120, size: 300, label: `sign #${D.visions[1].index + 1}` },
        { kind: 'rule', html: 'to see the future <span style="color:#e4c272">first</span>', y: 760, from: 1.95, to: 3.0 },
      ],
    },
    { // 12–15 · the token assembles out of the shard; the season seal closes around it
      name: 'token', duration: 3.0, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: [LOOK, { do: 'frames', n: 90 }],
      camera: { type: 'orbit', center: SHARD_AT, radius: [1.3, 1.45], height: [1.45, 1.6], yawFrom: 97, yawTo: 112, look: lookBeside(SHARD_AT, 0.42), fov: [30, 32], ease: 'inOutSine', minHeight: 0.5 },
      actions: [{ at: 0, do: 'dof', world: SHARD_AT, aperture: 0.005, maxblur: 0.012 }, cue(1.1, 'ui_confirm', 0.6), cue(2.0, 'gift_chime', 0.5)],
      overlays: [...FRAME, { kind: 'black', from: -1, to: 3.5, fadeIn: 0, fadeOut: 0, amount: 0.28 }],
      layers: [
        { ...PANEL, from: 0.1, to: 3.0 },
      ],
    },
    { // 15–18.5 · crane up toward Shell II: the token's leaf is the season's leaf #3 on NEAR testnet
      name: 'proof', duration: 3.5, url: JUDGE_URL, ui: 'clean', hide: BEAUTY_HIDE, setup: [LOOK, { do: 'frames', n: 90 }],
      camera: { type: 'dolly', path: [[SHARD_AT[0] + IN[0] * 2.9, 1.9, SHARD_AT[2] + IN[1] * 2.9], [5, 10, -15], [6, 22, -4]], look: [lookBeside(SHARD_AT, 0.42), [-8, 14, 14], [SHELL2[0] + 16, SHELL2[1] - 2, SHELL2[2] + 17]], fov: [32, 44], ease: 'inOutSine', minHeight: 0.5 },
      actions: [music(0, 56), music(2.2, 30), cue(1.4, 'gift_chime', 0.7)],
      overlays: [...FRAME, { kind: 'black', from: -1, to: 4, fadeIn: 0, fadeOut: 0, amount: 0.22 }, { kind: 'black', from: 3.0, to: 4.5, fadeIn: 0.5, fadeOut: 0 }],
      layers: [
        { ...PANEL, from: -2, to: 3.5, fadeOut: 0.5 },
        { kind: 'seal', from: 0.2, to: 3.5, cx: 300, cy: 540, r: 205, label: '', value: '', lx: -999, ly: 0 },
        { kind: 'node', world: SHELL2, title: `leaf #${S.unlocked_index}`, sub: 'ftf-seasons', from: 0.8, to: 3.5 },
        { kind: 'screenLink', from2: [1240, 800], world: SHELL2, from: 0.9, to: 3.5 },
        { kind: 'text', html: 'Same leaf, <span style="color:#e4c272">sealed on NEAR testnet.</span>', big: true, from: 1.3, to: 3.45, y: 70 },
      ],
    },
  ],
  captions: [
    { from: 1.0, to: 2.95, text: 'The Agents' },
    { from: 3.0, to: 4.5, text: 'Salt, Iris, Frost' },
    { from: 4.5, to: 6.0, text: 'Amber, Moss, Ash' },
    { from: 6.2, to: 8.95, text: 'Trade. Rumor. Betrayal.' },
    { from: 9.1, to: 10.6, text: 'The Memory Shard' },
    { from: 10.7, to: 12.2, text: 'Two future signs.' },
    { from: 12.3, to: 14.95, text: 'Token 793f6c05e89839f2-7, bound to the season root.' },
    { from: 16.3, to: 18.45, text: 'Same leaf, sealed on NEAR testnet.' },
  ],
};
