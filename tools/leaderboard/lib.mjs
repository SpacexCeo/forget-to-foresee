// The board's snapshot machinery (docs/leaderboard.md; TZ §8.4): verified logs in, ranked rows, a Merkle root over
// them and per-row proofs out. Scores come only from game/src/game/board-score.js (the same code the town board runs).
// Node only (node:crypto, node:fs); no network, no keys, no chain writes.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rankAccounts, BOARD } from '../../game/src/game/board-score.js';
import { verifyLog } from '../../game/src/game/expedition-log.js';

export const SNAPSHOT_VERSION = 1;
const sha = (x) => createHash('sha256').update(x).digest();
const hex = (b) => Buffer.from(b).toString('hex');

/** sha256 of the rules bundle: the scoring code, the expedition config and the quest data, in that order. */
export function rulesHash(root = new URL('../../game/src/game/', import.meta.url)) {
  const h = createHash('sha256');
  for (const f of ['board-score.js', 'expedition-config.js', 'quests-data.js']) h.update(readFileSync(new URL(f, root)));
  return h.digest('hex');
}

/** The leaf of one row (TZ §8.4). */
export const leafText = (boardSeason, epoch, r) => ['ftf-lb-1', boardSeason, epoch, r.rank, r.account, r.score, r.logHead || ''].join('|');
export const leafHash = (boardSeason, epoch, r) => sha(leafText(boardSeason, epoch, r));

/** Merkle levels: parent = sha256(left || right); an odd last node moves up unchanged (relayer/lib/chest-deck.js rule). */
export function merkleLevels(leaves) {
  const levels = [leaves.length ? leaves : [sha('')]];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? sha(Buffer.concat([cur[i], cur[i + 1]])) : cur[i]);
    levels.push(next);
  }
  return levels;
}
export function merkleProof(levels, i) {
  const proof = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const cur = levels[l], sib = i ^ 1;
    if (sib < cur.length) proof.push({ hash: hex(cur[sib]), left: sib < i });
    i >>= 1;
  }
  return proof;
}
export function verifyProof(leaf, proof, rootHex) {
  let h = leaf;
  for (const s of proof) h = s.left ? sha(Buffer.concat([Buffer.from(s.hash, 'hex'), h])) : sha(Buffer.concat([h, Buffer.from(s.hash, 'hex')]));
  return hex(h) === rootHex;
}

/**
 * Accounts from a directory: one `<anything>.json` per account {account, log: [...], extra?: {...}}; `registry.json`
 * (optional) lists the scripted accounts {scripted: [account...]}. Logs that fail verifyLog are excluded with a reason.
 */
export function loadAccounts(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'registry.json').sort();
  let scripted = [];
  try { scripted = JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8')).scripted || []; } catch { /* no registry: everyone is human */ }
  return accountsFrom(files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))), scripted);
}
export function accountsFrom(items, scripted = []) {
  const reg = new Set(scripted), accounts = [], rejected = [];
  for (const it of items) {
    if (!it || typeof it.account !== 'string' || !Array.isArray(it.log)) { rejected.push({ account: it && it.account, reason: 'shape' }); continue; }
    const v = verifyLog(it.log);
    if (!v.ok) { rejected.push({ account: it.account, reason: v.reason, at: v.at }); continue; }
    accounts.push({ account: it.account, actor: reg.has(it.account) ? 'scripted' : 'human', log: it.log, extra: it.extra || {} });
  }
  return { accounts, rejected };
}

/** Flags (TZ §8.3), shown as a badge and excluded from any payout list until reviewed. */
export function flagsFor(accounts) {
  const seqHash = new Map(), out = new Map();
  for (const a of accounts) {
    const f = [];
    const ts = a.log.map((e) => e.t); const gaps = ts.slice(1).map((t, i) => t - ts[i]).filter((g) => g > 0);
    if (gaps.length >= 10) { const m = gaps.reduce((x, y) => x + y, 0) / gaps.length; const sd = Math.sqrt(gaps.reduce((x, g) => x + (g - m) ** 2, 0) / gaps.length); if (sd / m < 0.02) f.push('fixed_interval'); }
    const kinds = new Set(a.log.map((e) => e.kind).filter((k) => ['quest_turned_in', 'bounty_resolved', 'kill_ticketed'].includes(k)));
    if (a.log.length >= 20 && kinds.size === 1) f.push('one_class');
    const h = hex(sha(a.log.map((e) => e.kind + ':' + JSON.stringify(e.data && e.data.questId || e.data && e.data.mob || '')).join(',')));
    if (a.log.length >= 10) { if (!seqHash.has(h)) seqHash.set(h, []); seqHash.get(h).push(a.account); }
    out.set(a.account, f);
  }
  for (const group of seqHash.values()) if (group.length > 1) for (const acc of group) out.get(acc).push('same_sequence');
  return out;
}

/**
 * The snapshot (TZ §8.4): rows (humans ranked, then scripted ranked), the Merkle root over all rows in that order,
 * proofs per row. `createdAt` and `sealRef` are passed in (never typed into the data by hand; sealRef is read from chain).
 */
export function buildSnapshot(accounts, { boardSeason = 1, epoch = 0, createdAt = 0, window = {}, sealRef = null, rules = rulesHash() } = {}) {
  const ranked = rankAccounts(accounts, { window });
  const flags = flagsFor(accounts);
  const rows = [...ranked.human, ...ranked.scripted].map((r) => ({ ...r, flags: flags.get(r.account) || [] }));
  const levels = merkleLevels(rows.map((r) => leafHash(boardSeason, epoch, r)));
  const root = hex(levels[levels.length - 1][0]);
  const proofs = rows.map((r, i) => ({ account: r.account, proof: merkleProof(levels, i) }));
  return { snapshot: { v: SNAPSHOT_VERSION, boardSeason, epoch, createdAt, rules, board: BOARD.version, sealRef, rows, root }, proofs };
}

/** Re-derives a snapshot from the logs and compares: every row, the root and the rules hash. */
export function verifySnapshot(snapshot, accounts, { window = {}, rules = rulesHash() } = {}) {
  const problems = [];
  if (snapshot.rules !== rules) problems.push('rules: the snapshot was built with other rules');
  const again = buildSnapshot(accounts, { boardSeason: snapshot.boardSeason, epoch: snapshot.epoch, createdAt: snapshot.createdAt, window, sealRef: snapshot.sealRef, rules: snapshot.rules }).snapshot;
  const byAcc = new Map(again.rows.map((r) => [r.account + '|' + r.actor, r]));
  for (const r of snapshot.rows) {
    const x = byAcc.get(r.account + '|' + r.actor);
    if (!x) { problems.push(`row ${r.account}: not in the logs`); continue; }
    for (const k of ['rank', 'score', 'logHead', 'lastSeq']) if (x[k] !== r[k]) problems.push(`row ${r.account}: ${k} ${r[k]} != ${x[k]}`);
  }
  if (snapshot.rows.length !== again.rows.length) problems.push(`rows: ${snapshot.rows.length} != ${again.rows.length}`);
  const levels = merkleLevels(snapshot.rows.map((r) => leafHash(snapshot.boardSeason, snapshot.epoch, r)));
  if (hex(levels[levels.length - 1][0]) !== snapshot.root) problems.push('root: does not match the rows');
  if (again.root !== snapshot.root) problems.push('root: does not match the logs');
  return { ok: problems.length === 0, problems };
}
