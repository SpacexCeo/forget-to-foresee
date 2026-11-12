// Stored expedition logs (story TZ §7.5 Q4): a guest's browser posts its hash-chained expedition log entries in
// batches; the relayer checks the guest's ed25519 signature (the Day 1 key, an access key of that account), that the
// batch continues the stored log exactly, the hash chain (the shared rules' verifyLog), rule bounds on every silk
// delta, and the plausibility of kill tickets; then appends to FTF_EXPEDITION_DIR/<guest>.jsonl (one entry per line,
// append-only), which lib/pass-eligibility.js reads. Kill acceptance is T1: plausibility, not proof. Without a
// directory nothing is stored (the answer says so). No keys of ours are used here.
import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { b58decode } from './near-tx.js';
import { loadLog } from './pass-eligibility.js';
import { verifyLog } from './expedition-rules/expedition-log.js';
import { EXPEDITION } from './expedition-rules/expedition-config.js';
import { QUESTS } from './expedition-rules/quests-data.js';

const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;
export const STORE = Object.freeze({
  maxSkewMs: 5 * 60 * 1000, // the request's own timestamp
  batchMax: 50, bodyMax: 64 * 1024, logMax: 20_000,
  futureMs: 2 * 60 * 1000, // an entry may not be later than now + 2 min
  // kill plausibility (T1): minimum time between two kills = hp / max dps (the super strike and the combo, about 67/s)
  maxDps: 67, hp: Object.freeze({ skitter: 55, veilbell: 120, hulker: 380, crownrift: 900 }),
  windowMs: 5 * 60 * 1000, killsPerWindow: 40, killsPerDay: 1200,
});
const DAY = 86_400_000;

export const logMessage = (accountId, at, fromSeq, count, lastHash) => `ftf-expedition-log|${accountId}|${at}|${fromSeq}|${count}|${lastHash}`;

/** {account_id, public_key, at, signature, from_seq, entries} → {ok, ...} (shape only). */
export function validateLogBatch(b, now = Date.now()) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > STORE.maxSkewMs) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100) return { ok: false, error: 'bad_signature' };
  if (!Number.isSafeInteger(b.from_seq) || b.from_seq < 0) return { ok: false, error: 'bad_from_seq' };
  if (!Array.isArray(b.entries) || b.entries.length < 1 || b.entries.length > STORE.batchMax) return { ok: false, error: 'bad_entries' };
  if (b.entries.some((e, i) => !e || typeof e !== 'object' || e.seq !== b.from_seq + i || typeof e.hash !== 'string')) return { ok: false, error: 'bad_entries' };
  return { ok: true, accountId: b.account_id, publicKey: b.public_key, at: b.at, signature: b.signature, fromSeq: b.from_seq, entries: b.entries };
}

/** ed25519 over logMessage (WebCrypto). */
export async function logSignatureValid({ accountId, publicKey, at, signature, fromSeq, entries }) {
  try {
    const pub = b58decode(publicKey.slice(8)), sig = b58decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(logMessage(accountId, at, fromSeq, entries.length, entries[entries.length - 1].hash)));
  } catch { return false; }
}

/**
 * Rule bounds and kill plausibility over the whole log (stored + new); `from` = first new index. Null when fine,
 * else {reason, at}. Pure.
 */
export function checkEntries(log, from, now = Date.now()) {
  const turned = new Set(); let lastBounty = -Infinity, lastKill = null; const win = [], perDay = new Map();
  for (let i = 0; i < log.length; i++) {
    const e = log[i], d = e.data || {}, fresh = i >= from;
    const bad = (reason) => ({ reason, at: i });
    if (fresh && e.t > now + STORE.futureMs) return bad('future');
    switch (e.kind) {
      case 'kill_ticketed': {
        if (e.trust !== 'T1') return bad('kill_trust'); // T2 kills come only from scripted hunts on the agent API
        const cap = EXPEDITION.kill[d.mob]; if (cap == null) return bad('kill_mob');
        if (!(e.silkC >= 0 && e.silkC <= cap)) return bad('kill_silk');
        if (fresh && lastKill && e.t - lastKill.t < (STORE.hp[d.mob] / STORE.maxDps) * 1000) return bad('kill_too_fast');
        while (win.length && e.t - win[0] >= STORE.windowMs) win.shift();
        win.push(e.t); if (fresh && win.length > STORE.killsPerWindow) return bad('kill_window');
        const day = Math.floor(e.t / DAY), n = (perDay.get(day) || 0) + 1; perDay.set(day, n);
        if (fresh && n > STORE.killsPerDay) return bad('kill_day');
        lastKill = e; break;
      }
      case 'quest_turned_in': {
        const q = QUESTS[d.questId]; if (!q || q.repeat) return bad('quest');
        if (turned.has(d.questId)) return bad('quest_twice'); turned.add(d.questId);
        if (!(e.silkC >= 0 && e.silkC <= q.reward.silk * 100)) return bad('quest_silk');
        break;
      }
      case 'bounty_resolved': {
        const q = QUESTS[d.questId]; if (!q || !q.repeat) return bad('bounty');
        if (e.t - lastBounty < q.repeat.minutes * 60_000) return bad('bounty_cooldown'); lastBounty = e.t;
        if (!(e.silkC >= 0 && e.silkC <= q.reward.silk * 100)) return bad('bounty_silk');
        break;
      }
      case 'stipend_granted': if (e.silkC !== EXPEDITION.stipendC) return bad('stipend'); break;
      case 'portal_paid': if (!(e.silkC < 0) || (!d.demo && e.silkC !== -EXPEDITION.PORTAL_FEE_C)) return bad('portal'); break;
      default: if (e.silkC > 0) return bad('silk'); // nothing else mints silk
    }
  }
  return null;
}

const locks = new Map();
/** Serialises appends per guest (one process). */
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release; const p = new Promise((r) => { release = r; });
  locks.set(key, prev.then(() => p));
  await prev;
  try { return await fn(); } finally { release(); if (locks.get(key) === p) locks.delete(key); }
}

/**
 * Appends a checked batch. {status, body}. Idempotent: a batch already stored answers ok with the stored length.
 * @param {{accountId: string, fromSeq: number, entries: object[]}} v
 * @param {{dir: string|null, now?: number, load?: Function, append?: Function}} o
 */
export async function appendBatch(v, { dir, now = Date.now(), load = loadLog, append = (file, text) => { mkdirSync(dir, { recursive: true }); appendFileSync(file, text); } }) {
  if (!dir) return { status: 200, body: { stored: false, reason: 'storage_off' } };
  return withLock(v.accountId, async () => {
    const stored = load(dir, v.accountId) || [];
    const head = () => (stored.length ? stored[stored.length - 1].hash : null);
    if (v.fromSeq < stored.length) { // a retry: the same entries are already there
      const same = v.entries.every((e, i) => stored[v.fromSeq + i] && stored[v.fromSeq + i].hash === e.hash);
      if (same && v.fromSeq + v.entries.length <= stored.length) return { status: 200, body: { stored: true, length: stored.length, head: head(), replayed: true } };
      return { status: 409, body: { error: 'fork', length: stored.length, head: head() } };
    }
    if (v.fromSeq > stored.length) return { status: 409, body: { error: 'gap', length: stored.length, head: head() } };
    if (stored.length + v.entries.length > STORE.logMax) return { status: 413, body: { error: 'log_full', length: stored.length } };
    const all = [...stored, ...v.entries];
    const chain = verifyLog(all);
    if (!chain.ok) return { status: 422, body: { error: 'log_invalid', reason: chain.reason, at: chain.at } };
    const bad = checkEntries(all, stored.length, now);
    if (bad) return { status: 422, body: { error: 'implausible', reason: bad.reason, at: bad.at } };
    append(join(dir, v.accountId + '.jsonl'), v.entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return { status: 200, body: { stored: true, length: all.length, head: all[all.length - 1].hash, trust: 'T1 kills are server-checked for plausibility, not proven' } };
  });
}

/** {length, head} of a guest's stored log (public: the entries are the guest's own play log). */
export function logStatus(dir, guest) {
  if (!dir) return { stored: false, reason: 'storage_off' };
  const log = loadLog(dir, guest) || [];
  let bytes = 0; try { bytes = statSync(join(dir, guest + '.jsonl')).size; } catch { /* none yet */ }
  return { stored: true, length: log.length, head: log.length ? log[log.length - 1].hash : null, bytes };
}
