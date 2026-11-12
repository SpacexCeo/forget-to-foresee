// The Expedition's hash-chained event log `ftf-expedition-log/1` (TZ §4.3): every silk the story creates or takes, so a
// server (or anyone) can replay it with the same pure rules. Canonical JSON (sorted keys, no spaces) is hashed;
// prev links each entry to the one before. Pure.
import { sha256 } from './crypto.js';

export const LOG_VERSION = 'ftf-expedition-log/1';
export const ZERO = '0'.repeat(64);
export const KINDS = Object.freeze(['story_started', 'guide_step', 'quest_accepted', 'quest_progress', 'quest_ready', 'quest_turned_in', 'quest_abandoned',
  'kill_ticketed', 'bounty_resolved', 'salvage_dropped', 'stipend_granted', 'portal_paid', 'pass_claimed']);
export const TRUSTS = Object.freeze(['T2', 'T1']);

/** Canonical JSON: object keys sorted at every depth, no whitespace. */
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

/** The hash of an entry: sha256(prev + canonical(entry without hash)). */
export function entryHash(e) { const { hash, ...rest } = e; return sha256((e.prev || ZERO) + canonical(rest)); }

/** Appends one entry to a log (returns the new entry; the log array is not mutated). */
export function makeEntry(log, { t, kind, data = {}, silkC = 0, trust = 'T2' }) {
  const last = log.length ? log[log.length - 1] : null;
  const e = { v: 1, seq: last ? last.seq + 1 : 0, t, kind, data, silkC: Math.round(silkC), trust, prev: last ? last.hash : ZERO };
  e.hash = entryHash(e);
  return e;
}

/**
 * Checks a whole log: versions, kinds, trust, monotonic time, seq without gaps, the hash chain, integer deltas.
 * `expectDelta(entry)` (optional) returns the delta the rules compute for an entry, or undefined to skip.
 * @returns {{ok: boolean, reason?: string, at?: number, earned: number, earnedVerified: number, byKind: object}}
 */
export function verifyLog(log, { expectDelta = null, killVerifyCapC = Infinity } = {}) {
  let prev = ZERO, t = -Infinity, earned = 0, t2 = 0, t1 = 0; const byKind = {};
  const fail = (reason, at) => ({ ok: false, reason, at, earned, earnedVerified: t2 + Math.min(t1, killVerifyCapC), byKind });
  if (!Array.isArray(log)) return fail('not_a_log', -1);
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e || e.v !== 1) return fail('version', i);
    if (e.seq !== i) return fail('seq', i);
    if (!KINDS.includes(e.kind)) return fail('kind', i);
    if (!TRUSTS.includes(e.trust)) return fail('trust', i);
    if (!Number.isInteger(e.silkC)) return fail('delta', i);
    if (!(e.t >= t)) return fail('time', i);
    if (e.prev !== prev) return fail('chain', i);
    if (entryHash(e) !== e.hash) return fail('hash', i);
    if (expectDelta) { const d = expectDelta(e); if (d !== undefined && d !== e.silkC) return fail('rules', i); }
    if (e.silkC > 0) { earned += e.silkC; if (e.trust === 'T2') t2 += e.silkC; else t1 += e.silkC; }
    byKind[e.kind] = (byKind[e.kind] || 0) + e.silkC;
    prev = e.hash; t = e.t;
  }
  return { ok: true, earned, earnedVerified: t2 + Math.min(t1, killVerifyCapC), byKind };
}
