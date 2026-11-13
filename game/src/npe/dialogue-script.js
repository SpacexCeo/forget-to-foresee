// The wake-up dialogue as data (sprint 7.3): 19 lines, speaker, string key, camera beat. Pure; the text lives in
// play/locales/en-npe.js and placeholders ({fee}, {stipend}) are filled from config by `lineVars`.
import { EXPEDITION, portalFee } from '../game/expedition-config.js';

/** Speaker -> plate colour and whether lines are Iris's own (italic, cream). */
export const SPEAKERS = Object.freeze({
  townsfolk: { color: '#aab1c5' }, weaver: { color: '#e79ab3' }, child: { color: '#5fc9c0' }, guard: { color: '#86a8d6' },
  lamplighter: { color: '#f0b24a' }, elder: { color: '#f6c860' }, iris: { color: '#f3e6c8', italic: true },
});

/** @type {ReadonlyArray<{id: string, speaker: string, key: string, camera?: string, award?: boolean}>} */
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
  { id: 'W17', speaker: 'elder', key: 'npe.w17', award: true },
  { id: 'W18', speaker: 'elder', key: 'npe.w18' },
  { id: 'W19', speaker: 'iris', key: 'npe.w19' },
]);

export const BARKS = Object.freeze(Array.from({ length: 10 }, (_, i) => `npe.bark.${i + 1}`));

/** Whole silk text: 200, or 12.5 when not whole (rule: at most two decimals, whole numbers when whole). */
export const silkWhole = (c) => { const v = Math.round(Number(c) || 0) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''); };

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
