// Runs the authoritative engine (game/src/game/engine.js) for one room's state.
// The engine keeps the current season in a module-level binding `S`; a room owns its own state
// object and swaps it in for the duration of one synchronous call, so many rooms share one engine
// module without sharing state. JavaScript runs one call at a time, which also serializes commands.
// There is no second rules implementation anywhere in the API: every rule outcome comes from here.
import * as E from '../game/engine.js';

export { E };

/** Runs fn(E) with `state` loaded as the engine's current season, then restores the previous one. */
export function withState(state, fn) {
  const prev = E.S;
  E.loadState(state);
  try { return fn(E); } finally { if (prev && prev !== state) E.loadState(prev); }
}

/**
 * Creates a season. `rules` is a session parameter (engine RULES_VERSIONS: 'v3', 'v2', ...).
 * `seed` (32-bit, legacy modes) / `seedHex` (128-bit, v3) and `randomBytes` are for test sessions only.
 */
export function createSeason({ rules = 'v3', seed, seedHex, randomBytes } = {}) {
  if (!E.RULES_VERSIONS.includes(rules)) throw Object.assign(new Error('unknown rules ' + rules), { code: 'unknown_rules' });
  const prev = E.S;
  const s = seed ?? randomSeed32(randomBytes);
  const opts = { rules };
  if (seedHex) opts.seedHex = seedHex;
  if (randomBytes) opts.randomBytes = randomBytes;
  const state = E.newSeason(s, opts);
  const fx = E.takeFx();
  if (prev && prev !== state) E.loadState(prev);
  return { state, fx };
}

function randomSeed32(randomBytes) {
  const b = randomBytes ? randomBytes(4) : globalThis.crypto.getRandomValues(new Uint8Array(4));
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
}

/**
 * Evaluates an engine action on a deep copy of the state and throws the copy away: the same guards
 * as the real call, no side effects. Used for `availableActions` so preconditions are never re-coded.
 */
export function dryRun(state, fn) {
  const copy = structuredClone(state);
  return withState(copy, (eng) => {
    const r = fn(eng);
    return r && typeof r === 'object' ? r : { ok: !!r };
  });
}

export const RULES_VERSIONS = E.RULES_VERSIONS;
export const DEFAULT_RULES = E.RULES_VERSIONS.includes('v3') ? 'v3' : 'v2';
