// The season commitment as the NEAR contract `contracts/season-commit` sees it: the exact arguments of
// `commit_season`, `commit_ash_key` and `reveal_leaf` for one engine season, plus the deterministic byte
// source that makes a fixed-seed demo season (`?demo=judge`, `?seed=<hex>`) reproduce the same season id,
// salts and schedule root on every machine. No DOM, no network, no rule: it only reads an engine state.
//
// Why fixed-seed sessions need fixed bytes: the engine draws the season id and every salt from
// `randomBytes` (a CSPRNG by default), so two runs of the same seed share the schedule but not the
// commitment. A season committed on testnet can only be recognised by the game if the browser rebuilds
// the identical commitment, hence a seed-derived byte stream for these sessions. Demo and dev sessions
// only: a real season keeps the CSPRNG, and the demo seed is public anyway (the whole schedule is derived
// from it), so the derived salts hide nothing that was secret before.
import { sha256, merkle, proofFor, verifyProof } from '../game/crypto.js';

/** The commitment schema the contract knows; the engine tags every strong-mode leaf with it (also under rules v3). */
export const COMMITMENT_SCHEMA = 'v2';

/**
 * Deterministic byte source for a fixed-seed session: SHA-256 in counter mode over the seed.
 * Returns the `randomBytes(n)` function the engine expects. Never used for a season without a client seed.
 * @param {string} seedHex 32 lowercase hex characters (the engine's 128-bit v3 seed)
 * @param {string} [tag] domain tag; the game and its tooling must use the default to agree
 */
export function demoRandomBytes(seedHex, tag = 'ftf:demo-bytes:v1') {
  if (!/^[0-9a-f]{32}$/.test(seedHex)) throw new Error('seedHex must be 32 lowercase hex characters');
  let counter = 0;
  let pool = [];
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!pool.length) {
        const h = sha256(`${tag}|${seedHex}|${counter++}`);
        pool = Array.from({ length: 32 }, (_, j) => parseInt(h.slice(j * 2, j * 2 + 2), 16));
      }
      out[i] = pool.shift();
    }
    return out;
  };
}

/** The canonical event bytes exactly as engine.js `leafHash` serialises them. */
export const canonicalEvent = (e) => JSON.stringify({ t: e.t, place: e.place, action: e.action, power: e.power, delay: e.delay, dots: e.dots });

/**
 * Extracts the on-chain commitment of an engine season (strong rules: v2, v2-crypto, v3).
 * Every leaf is re-derived with the contract's preimage and checked against the engine's own leaf and
 * root, so a drift between engine.js and the contract's byte format throws here instead of on-chain.
 * @param {object} S an engine state (`newSeason(...)` result or a room's state)
 * @returns {{seasonId: string, schemaVersion: string, scheduleRoot: string, leafCount: number,
 *   leaves: Array<{index: number, tick: number, canonicalEvent: string, salt: string, leaf: string, path: Array<{h: string, left: boolean}>}>,
 *   ashKey: {commitment: string, phrase: string, salt: string}}}
 */
export function seasonCommitment(S) {
  if (!S || !S.seasonId) throw new Error('season has no commitment (baseline rules have no season id)');
  const levels = merkle(S.events.map((e) => e.leaf));
  const root = levels[levels.length - 1][0];
  if (root !== S.root) throw new Error('engine root does not match its leaves');
  const leaves = S.events.map((e, index) => {
    const body = canonicalEvent(e);
    const leaf = sha256(`ftf:leaf:${COMMITMENT_SCHEMA}|${S.seasonId}|${index}|${body}|${e.salt}`);
    if (leaf !== e.leaf) throw new Error(`leaf ${index}: engine.js leaf format drifted from the contract`);
    const path = proofFor(levels, index);
    if (!verifyProof(leaf, path, root)) throw new Error(`leaf ${index}: proof does not verify`);
    return { index, tick: e.t, canonicalEvent: body, salt: e.salt, leaf, path };
  });
  const k = S.pepelKey;
  const commitment = sha256(`ftf:key:${COMMITMENT_SCHEMA}|${S.seasonId}|${k.phrase}|${k.salt}`);
  if (commitment !== k.hash) throw new Error('Ash key format drifted from the contract');
  return {
    seasonId: S.seasonId,
    schemaVersion: COMMITMENT_SCHEMA,
    scheduleRoot: root,
    leafCount: leaves.length,
    leaves,
    ashKey: { commitment, phrase: k.phrase, salt: k.salt },
  };
}

/** Contract call arguments for a commitment, keyed by method (JSON-serialisable, ready for `near contract call-function`). */
export function contractArgs(c) {
  return {
    commit_season: { season_id: c.seasonId, schedule_root: c.scheduleRoot, schema_version: c.schemaVersion, leaf_count: c.leafCount },
    commit_ash_key: { season_id: c.seasonId, commitment: c.ashKey.commitment },
    reveal_ash_key: { season_id: c.seasonId, phrase: c.ashKey.phrase, salt: c.ashKey.salt },
    get_season: { season_id: c.seasonId },
    reveal_leaf: c.leaves.map((l) => ({ season_id: c.seasonId, index: l.index, canonical_event: l.canonicalEvent, salt: l.salt, merkle_path: l.path })),
  };
}

/* ---------- entropy the developer does not control: protocol ftf-seed/1 (docs/verify.md) ---------- */

export const SEED_PROTOCOL = 'ftf-seed/1';
export const NONCE_MAX = 128;
/** Nonce and beacon are opaque strings without `|` (the field separator of the seed preimage). */
export const NONCE_PATTERN = '^[^|]{1,128}$';

/** The room's commitment to its 32 random bytes, shown before the player's nonce is sent. */
export function entropyCommitment(roomEntropyHex) {
  return sha256(`ftf:entropy:v1|${roomEntropyHex}`);
}

/**
 * The engine's 128-bit seed from the room's entropy (committed first), the player's nonce (chosen after seeing
 * the commitment) and an optional public beacon nobody chose (e.g. a NEAR testnet block hash).
 * Anyone can recompute it from the revealed room entropy; `game/scripts/replay-season.mjs` regenerates the schedule.
 */
export function deriveSeed(roomEntropyHex, nonce = '', beacon = null) {
  if (!/^[0-9a-f]{64}$/.test(roomEntropyHex)) throw new Error('room entropy must be 32 bytes of lowercase hex');
  return sha256(`ftf:seed:v1|${roomEntropyHex}|${nonce ?? ''}|${beacon ?? ''}`).slice(0, 32);
}

export const hexOf = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
