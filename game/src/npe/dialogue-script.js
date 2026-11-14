// The wake-up dialogue as data (sprint 7.3): 19 lines, speaker, string key, camera beat. Pure; the text lives in
// play/locales/en-npe.js and placeholders ({fee}, {stipend}) are filled from config by `lineVars`.
import { EXPEDITION, portalFee } from '../game/expedition-config.js';
import { formatSilkC } from '../net/silk-core.js';

/** Speaker -> plate colour and whether lines are Iris's own (italic, cream). */
export const SPEAKERS = Object.freeze({
  townsfolk: { color: '#aab1c5' }, weaver: { color: '#e79ab3' }, child: { color: '#5fc9c0' }, guard: { color: '#86a8d6' },
  lamplighter: { color: '#f0b24a' }, elder: { color: '#f6c860' }, iris: { color: '#f3e6c8', italic: true },
});

/**
 * Every wake-up speaker's bust portrait (assets/ui/portraits). The crowd's voices are the people who stand in the wake-up
 * ring (cinematic/prologue/townsfolk-ring.js): the weaver is the baker's model, the townsperson the courier, the child child_a.
 * Iris's is a bust crop of her card (owner 14.11: the full-body card squeezed into the circle).
 */
const P = (k) => `assets/ui/portraits/${k}_256.webp`;
export const PORTRAITS = Object.freeze({ elder: P('elder'), guard: P('guard'), lamplighter: P('lamplighter'), iris: P('iris'), weaver: P('baker'), townsfolk: P('courier'), child: P('child_a') });
/** The portrait URL of a speaker under `base`, or null (then the box shows the initial). */
export const introPortrait = (sp, base = '/') => (PORTRAITS[sp] ? base + PORTRAITS[sp] : null);

/** @type {ReadonlyArray<{id: string, speaker: string, key: string, camera?: string}>} */
export const WAKEUP = Object.freeze([
  { id: 'W1', speaker: 'townsfolk', key: 'npe.w1' },
  { id: 'W2', speaker: 'child', key: 'npe.w2' },
  { id: 'W3', speaker: 'guard', key: 'npe.w3', camera: 'gate_loom' },
  { id: 'W4', speaker: 'lamplighter', key: 'npe.w4', camera: 'iris_badge' },
  { id: 'W5', speaker: 'weaver', key: 'npe.w5' },
  { id: 'W6', speaker: 'elder', key: 'npe.w6', camera: 'elder' },
  { id: 'W7', speaker: 'iris', key: 'npe.w7' },
  { id: 'W8', speaker: 'elder', key: 'npe.w8' },
  { id: 'W9', speaker: 'elder', key: 'npe.w9', camera: 'shell' },
  { id: 'W10', speaker: 'elder', key: 'npe.w10' },
  { id: 'W11', speaker: 'iris', key: 'npe.w11' },
  { id: 'W12', speaker: 'elder', key: 'npe.w12', camera: 'gate_loom' },
  { id: 'W13', speaker: 'elder', key: 'npe.w13' },
  { id: 'W14', speaker: 'guard', key: 'npe.w14' },
  { id: 'W15', speaker: 'lamplighter', key: 'npe.w15' },
  { id: 'W16', speaker: 'weaver', key: 'npe.w16' },
  { id: 'W17', speaker: 'elder', key: 'npe.w17' }, // the welcome itself is the story's TWIST_DONE stipend (one grant, A1)
  { id: 'W18', speaker: 'elder', key: 'npe.w18' },
  { id: 'W19', speaker: 'iris', key: 'npe.w19' },
]);

/**
 * The welcome as played on a first visit (first-minutes pass, 14.11): eight of the nineteen lines, so a stranger is walking
 * within a minute. It keeps who she is to them, the way home ({fee} silk at the Gate-Loom) and the first job (the spiders).
 */
export const WELCOME_IDS = Object.freeze(['W1', 'W6', 'W7', 'W11', 'W12', 'W13', 'W14', 'W19']);
export const WELCOME = Object.freeze(WAKEUP.filter((l) => WELCOME_IDS.includes(l.id)));

export const BARKS = Object.freeze(Array.from({ length: 10 }, (_, i) => `npe.bark.${i + 1}`));

/** Whole silk text: 200, or 12.5 when not whole (rule: at most two decimals, whole numbers when whole). */
export const silkWhole = (c) => formatSilkC(c); // the shared silk format (net/silk-core.js)

/** The placeholder values: the portal fee from config (or the visible QA fee), the arrival stipend, the season end. */
export function lineVars(search = (globalThis.location && globalThis.location.search) || '', end = SEASON_END) {
  return { fee: silkWhole(portalFee(search).feeC), stipend: silkWhole(EXPEDITION.stipendC), end };
}
/** Season 1 end as shown (the submission deadline day; docs/hackathon-rules.md). */
export const SEASON_END = '15 November';

/** Typing time of a line at 40 characters per second; 0 under reduced motion. */
export const CPS = 40;
export const typeMs = (text, reduced = false) => (reduced ? 0 : Math.ceil((String(text).length / CPS) * 1000));
/** How many characters are visible `ms` into a line. */
export const typedChars = (text, ms, reduced = false) => (reduced ? String(text).length : Math.min(String(text).length, Math.floor((Math.max(0, ms) / 1000) * CPS)));
