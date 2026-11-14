// Where the relayer keeps its state (owner 14.11: a proper database). With FTF_DB set (a file path) every store below
// lives in the project's SQLite database (../../db/index.js); without it the JSON files under FTF_DATA_DIR are used
// exactly as before (local runs, the tests, and the rollback path). Each JSON store asks `activeDb()` first, so no
// caller changes: lib/auth.js identities, lib/email-auth.js codes, lib/town-gate.js credits and the gate log,
// lib/pass-eligibility.js + lib/expedition-store.js logs, market/index.js journals and state, lib/pass.js, lib/wheel.js,
// api/market/resource.js, lib/p2p.js.
//
// The database is opened once per process. When FTF_DB is set and the file cannot be opened or migrated, opening
// throws and server.js refuses to start: the relayer never falls back to files (or to memory) by itself, because a
// silent fallback would split or lose the players' data.
import { basename } from 'node:path';
import { openDatabase } from '../../db/index.js';

let db = null, forced = false;

/** The open database, or null when FTF_DB is not set. Throws when it is set and cannot be opened. */
export function activeDb(env = process.env) {
  if (db || forced) return db;
  if (!env.FTF_DB) return null;
  db = openDatabase(env.FTF_DB);
  return db;
}
/** Tests: use this database (or null: files) whatever the env says; resetDb() returns to the env. */
export function setActiveDb(d) { db = d; forced = true; }
export function resetDb() { if (db && !forced) { try { db.close(); } catch { /* closed */ } } db = null; forced = false; }

/** For server.js: open now, or say why not. Returns a one-line description for the start log. */
export function requireStorage(env = process.env) {
  if (!env.FTF_DB) return 'storage: JSON files under FTF_DATA_DIR (FTF_DB not set)';
  const d = activeDb(env);
  const c = d.counts();
  return `storage: database ${env.FTF_DB} (schema ${d.version()}, ${c.identities} identities, ${c.journal} journal rows)`;
}

/** For /api/health: where the state lives ({kind: 'sqlite', schema} | {kind: 'files'}). */
export function storageInfo(env = process.env) { try { const d = activeDb(env); return d ? { kind: 'sqlite', schema: d.version() } : { kind: 'files' }; } catch { return { kind: 'error' }; } }

// ---- the stores, in the shapes their JSON versions have ----

/** lib/auth.js createIdentityStore */
export const dbIdentityStore = (d) => ({ get: d.identities.get, set: d.identities.set, all: d.identities.all, remove: d.identities.remove, get size() { return d.identities.size; } });

/** lib/town-gate.js createCreditLedger */
export const dbCreditLedger = (d) => ({ get: (g) => d.credits.get(g), put: (g, rec) => d.credits.put(g, rec) });

/** market/index.js jsonlLog(dir): the stream is the folder's name (town-log, clan-actions, clan-decisions, town-gate, town-act). */
export const dbJournalLog = (d, dir) => { const stream = basename(String(dir)); return (entry) => { try { d.journal.append(stream, entry); } catch { /* a full disk: keep trading, as the file log does */ } }; };

/** market/index.js fileStore(path): a state document under the file's name without .json (town-state). */
export const dbFileStore = (d, path) => { const key = basename(String(path)).replace(/\.json$/, ''); return { load: () => d.kv.get(key), save: (obj) => d.kv.set(key, obj) }; };

/** lib/pass.js createPassStore: append-only, the last record per claim wins. */
export function dbPassStore(d) {
  const byClaim = new Map();
  for (const r of d.receipts.list('pass')) if (r && r.claim_id) byClaim.set(r.claim_id, r);
  return {
    get: (claimId) => byClaim.get(claimId) || null,
    byWallet: (wallet) => [...byClaim.values()].find((r) => r.wallet === wallet && r.status !== 'tx_failed') || null,
    pending: () => [...byClaim.values()].filter((r) => ['queued', 'paused', 'budget_exhausted', 'rpc_unavailable'].includes(r.status)),
    put(r) { byClaim.set(r.claim_id, r); try { d.receipts.add('pass', r, { ref: r.claim_id, account: r.wallet || null }); } catch { /* memory only, as the file store */ } return r; },
  };
}

/** lib/wheel.js createClaimLog */
export const dbClaimLog = (d) => ({
  record(c) { try { d.receipts.add('wheel', c, { ref: c && (c.claim_id || c.token_id || null), account: c && (c.account_id || c.account || null) }); return true; } catch { return false; } },
  list: () => d.receipts.list('wheel'),
});
