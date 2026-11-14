// The project's database (owner 14.11: "a proper database"): one SQLite file for what the relayer and the presence
// service used to keep in JSON files: accounts and their linked sign-in methods, email codes, the rooms' chat and
// action feed, the players' server-held progress (expedition logs, town credits), the town's journals (trades, clan
// actions and decisions, gate and act logs), receipts (pass, wheel, resource desk) and small state documents.
//
// No dependency: Node's built-in `node:sqlite` (Node 22.13+; the server runs Node 24). WAL mode, so the two services
// (two processes) read and write the same file; foreign keys on; a busy timeout instead of SQLITE_BUSY errors; the
// schema is versioned in `schema_migrations` and only ever moves forward (db/migrations.js).
//
// This file is the whole data-access layer: openDatabase(path) returns small stores with the same shapes the JSON
// stores had, so the services swap one for the other (relayer/lib/storage.js, presence/lib/history-db.js). Secrets
// (the coordinator and trader keys) are NOT kept here: they stay in their own files, mode 600.
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MIGRATIONS } from './migrations.js';

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Applies every migration above the stored version, each in its own transaction. Returns the versions applied. */
export function migrate(raw, { now = () => Date.now(), migrations = MIGRATIONS } = {}) {
  raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const have = Number(raw.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get().v);
  const newest = migrations[migrations.length - 1].version;
  if (have > newest) throw new Error(`database schema ${have} is newer than this code (${newest}): deploy the newer code, never an older one over it`);
  const applied = [];
  for (const m of migrations) {
    if (m.version <= have) continue;
    raw.exec('BEGIN IMMEDIATE');
    try { raw.exec(m.sql); raw.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, now()); raw.exec('COMMIT'); }
    catch (e) { raw.exec('ROLLBACK'); throw new Error(`migration ${m.version} (${m.name}) failed: ${e.message}`); }
    applied.push(m.version);
  }
  return applied;
}

const parse = (s, fallback = null) => { try { return JSON.parse(s); } catch { return fallback; } };

/**
 * Opens (and creates, and migrates) the database. Throws when it cannot: callers must not run without their store.
 * @param {string} path a file path, or ':memory:' in tests
 * @param {{now?: () => number, mode?: number}} [o] mode: the file's permission bits when it is created (default 0o660:
 *   the two services share it through a group)
 */
export function openDatabase(path, { now = () => Date.now(), mode = 0o660 } = {}) {
  const memory = path === ':memory:';
  if (!memory) mkdirSync(dirname(path), { recursive: true });
  const fresh = !memory && !existsSync(path);
  const raw = new DatabaseSync(path, { timeout: 5000 });
  if (fresh) { try { chmodSync(path, mode); } catch { /* a filesystem without modes */ } }
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const applied = migrate(raw, { now });
  const q = (sql) => raw.prepare(sql);
  /** Runs fn inside one write transaction (rolled back when it throws); joins the transaction that is already open. */
  const tx = (fn) => {
    if (raw.isTransaction) return fn(); // already inside one (the import runs everything in a single transaction)
    raw.exec('BEGIN IMMEDIATE'); try { const r = fn(); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; }
  };

  // ---- accounts and linked sign-in methods (relayer/lib/auth.js identities; email links of lib/email-auth.js)
  const idGet = q('SELECT data FROM identities WHERE id = ?'), idDel = q('DELETE FROM identities WHERE id = ?');
  const idPut = q(`INSERT INTO identities (id, account_id, kind, address, linked_at, data) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, kind = excluded.kind, address = excluded.address, linked_at = excluded.linked_at, data = excluded.data`);
  const accPut = q('INSERT OR IGNORE INTO accounts (account_id, created_at) VALUES (?, ?)');
  const identities = {
    get: (id) => { const r = idGet.get(String(id)); return r ? parse(r.data) : null; },
    /** rec: {account, kind, address?, linked_at, ...}; the whole record is kept (data), the named columns are for queries. */
    set(id, rec) {
      if (!rec || typeof rec.account !== 'string' || !rec.account) throw new Error('identity without an account');
      tx(() => { accPut.run(rec.account, now()); idPut.run(String(id), rec.account, String(rec.kind || ''), rec.address == null ? null : String(rec.address), rec.linked_at == null ? null : String(rec.linked_at), JSON.stringify(rec)); });
      return rec;
    },
    all: () => q('SELECT id, data FROM identities ORDER BY rowid').all().map((r) => [r.id, parse(r.data)]),
    /** The sign-in methods of one account: [[id, record], ...]. */
    ofAccount: (account) => q('SELECT id, data FROM identities WHERE account_id = ? ORDER BY rowid').all(String(account)).map((r) => [r.id, parse(r.data)]),
    remove: (id) => idDel.run(String(id)).changes > 0,
    get size() { return Number(q('SELECT COUNT(*) AS n FROM identities').get().n); },
  };

  // ---- one-time email codes (only hashes; the key is the email's hash id, never the address)
  const codes = {
    get(emailId) { const r = q('SELECT code_hash, purpose, bind, expires_at, tries FROM email_codes WHERE email_id = ?').get(emailId); return r ? { hash: Buffer.from(r.code_hash), purpose: r.purpose, bind: r.bind, exp: Number(r.expires_at), tries: Number(r.tries) } : null; },
    set(emailId, c) { q(`INSERT INTO email_codes (email_id, code_hash, purpose, bind, expires_at, tries) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email_id) DO UPDATE SET code_hash = excluded.code_hash, purpose = excluded.purpose, bind = excluded.bind, expires_at = excluded.expires_at, tries = excluded.tries`).run(emailId, c.hash, c.purpose, c.bind ?? null, c.exp, c.tries | 0); },
    tries(emailId, n) { q('UPDATE email_codes SET tries = ? WHERE email_id = ?').run(n | 0, emailId); },
    delete(emailId) { q('DELETE FROM email_codes WHERE email_id = ?').run(emailId); },
    /** How many codes this email was sent since `since` (ms). */
    sentSince: (emailId, since) => Number(q('SELECT COUNT(*) AS n FROM email_sends WHERE email_id = ? AND at > ?').get(emailId, since).n),
    sent(emailId, at) { q('INSERT INTO email_sends (email_id, at) VALUES (?, ?)').run(emailId, at); },
    /** Drops expired codes and send marks older than an hour. */
    prune(t = now()) { q('DELETE FROM email_codes WHERE expires_at <= ?').run(t); q('DELETE FROM email_sends WHERE at <= ?').run(t - 3600_000); },
  };

  // ---- rooms: chat lines and the action feed (presence/lib/history.js)
  const history = {
    /** kind: 'chat' | 'acts'; e: a cleaned entry ({name, at, account?, text} or {name, at, account?, k, v?}); keeps the newest `cap` of the room. */
    add(room, kind, e, cap) {
      tx(() => {
        if (kind === 'chat') q('INSERT INTO chat_messages (room, name, account, text, at) VALUES (?, ?, ?, ?, ?)').run(room, e.name, e.account ?? null, e.text, e.at);
        else q('INSERT INTO room_actions (room, name, account, kind, value, at) VALUES (?, ?, ?, ?, ?, ?)').run(room, e.name, e.account ?? null, e.k, e.v == null ? null : JSON.stringify(e.v), e.at);
        const table = kind === 'chat' ? 'chat_messages' : 'room_actions';
        q(`DELETE FROM ${table} WHERE room = ? AND id NOT IN (SELECT id FROM ${table} WHERE room = ? ORDER BY id DESC LIMIT ?)`).run(room, room, cap);
      });
    },
    /** {chat, acts} of a room, oldest first, nothing older than `since` (ms), at most `cap` each. */
    get(room, since, cap) {
      const chat = q('SELECT name, account, text, at FROM (SELECT * FROM chat_messages WHERE room = ? AND at > ? ORDER BY id DESC LIMIT ?) ORDER BY id').all(room, since, cap)
        .map((r) => ({ name: r.name, at: Number(r.at), ...(r.account ? { account: r.account } : {}), text: r.text }));
      const acts = q('SELECT name, account, kind, value, at FROM (SELECT * FROM room_actions WHERE room = ? AND at > ? ORDER BY id DESC LIMIT ?) ORDER BY id').all(room, since, cap)
        .map((r) => ({ name: r.name, at: Number(r.at), ...(r.account ? { account: r.account } : {}), k: r.kind, ...(r.value != null ? { v: parse(r.value) } : {}) }));
      return { chat, acts };
    },
    prune(before) { q('DELETE FROM chat_messages WHERE at <= ?').run(before); q('DELETE FROM room_actions WHERE at <= ?').run(before); },
    stats: () => ({ rooms: Number(q('SELECT COUNT(*) AS n FROM (SELECT room FROM chat_messages UNION SELECT room FROM room_actions)').get().n), lines: Number(q('SELECT (SELECT COUNT(*) FROM chat_messages) + (SELECT COUNT(*) FROM room_actions) AS n').get().n) }),
  };

  // ---- the players' expedition logs (relayer/lib/expedition-store.js: hash-chained entries per guest)
  const expedition = {
    /** The guest's log, oldest first; null when there is none. */
    load(account) { const rows = q('SELECT body FROM expedition_events WHERE account_id = ? ORDER BY seq').all(String(account)); return rows.length ? rows.map((r) => parse(r.body)) : null; },
    /** Appends entries at fromSeq (the log's length); a clash with a stored seq throws (the caller serialises per guest). */
    append(account, fromSeq, entries, at = now()) {
      tx(() => { const ins = q('INSERT INTO expedition_events (account_id, seq, hash, body, stored_at) VALUES (?, ?, ?, ?, ?)'); entries.forEach((e, i) => ins.run(String(account), fromSeq + i, String(e.hash ?? ''), JSON.stringify(e), at)); });
    },
    status(account) { const r = q('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(body) + 1), 0) AS bytes FROM expedition_events WHERE account_id = ?').get(String(account)); return { length: Number(r.n), bytes: Number(r.bytes) }; },
  };

  // ---- town credits per guest (relayer/lib/town-gate.js createCreditLedger)
  const credits = {
    get(account) { const r = q('SELECT body FROM town_credits WHERE account_id = ?').get(String(account)); return r ? parse(r.body) : { credited: '0', day: 0, today: '0' }; },
    put(account, rec) { q(`INSERT INTO town_credits (account_id, credited, day, today, body, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET credited = excluded.credited, day = excluded.day, today = excluded.today, body = excluded.body, updated_at = excluded.updated_at`)
      .run(String(account), String(rec.credited ?? '0'), Number(rec.day) || 0, String(rec.today ?? '0'), JSON.stringify(rec), now()); },
  };

  // ---- journals: append-only streams (town-log, clan-actions, clan-decisions, town-gate, town-act)
  const jIns = q('INSERT INTO journal (stream, at, body) VALUES (?, ?, ?)');
  const journal = {
    append(stream, entry) { jIns.run(String(stream), Number(entry && entry.at) || now(), JSON.stringify(entry)); },
    /** The entries of a stream from `since` (ms) on, oldest first. */
    read: (stream, since = 0) => q('SELECT body FROM journal WHERE stream = ? AND at >= ? ORDER BY id').all(String(stream), since).map((r) => parse(r.body)).filter(Boolean),
    count: (stream) => Number(q('SELECT COUNT(*) AS n FROM journal WHERE stream = ?').get(String(stream)).n),
  };

  // ---- receipts: append-only records of what the relayer did for a player (pass claims, wheel claims, the resource desk)
  const rIns = q('INSERT INTO receipts (kind, ref, account, at, body) VALUES (?, ?, ?, ?, ?)');
  const receipts = {
    add(kind, body, { ref = null, account = null, at = now() } = {}) { rIns.run(String(kind), ref == null ? null : String(ref), account == null ? null : String(account), at, JSON.stringify(body)); },
    list: (kind) => q('SELECT body FROM receipts WHERE kind = ? ORDER BY id').all(String(kind)).map((r) => parse(r.body)).filter(Boolean),
    count: (kind) => Number(q('SELECT COUNT(*) AS n FROM receipts WHERE kind = ?').get(String(kind)).n),
  };

  // ---- small state documents (the trader daemon's state, the player market's book)
  const kv = {
    get(key) { const r = q('SELECT value FROM kv WHERE key = ?').get(String(key)); return r ? parse(r.value) : null; },
    set(key, value) { q('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(String(key), JSON.stringify(value), now()); },
  };

  return {
    raw, path, tx, applied, identities, codes, history, expedition, credits, journal, receipts, kv,
    version: () => Number(q('SELECT MAX(version) AS v FROM schema_migrations').get().v),
    /** Row counts per table (the migration's check and the health endpoint). */
    counts() { const out = {}; for (const t of ['accounts', 'identities', 'email_codes', 'chat_messages', 'room_actions', 'expedition_events', 'town_credits', 'journal', 'receipts', 'kv']) out[t] = Number(q(`SELECT COUNT(*) AS n FROM ${t}`).get().n); return out; },
    /** 'ok' when SQLite's own integrity check and the foreign keys hold. */
    check() { const r = q('PRAGMA integrity_check').get(); const fk = q('PRAGMA foreign_key_check').all(); return Object.values(r)[0] === 'ok' && !fk.length ? 'ok' : 'damaged'; },
    close() { try { raw.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* another process holds it: its checkpoint will do */ } raw.close(); },
  };
}

/**
 * A consistent copy of the database into `dir` (VACUUM INTO: safe while the services write), checked, then old copies
 * rotated: the newest `keep` stay. Returns {file, bytes, removed}.
 */
export function backupDatabase(path, dir, { keep = 14, now = () => Date.now() } = {}) {
  if (!existsSync(path)) throw new Error(`no database at ${path}`);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
  const file = join(dir, `ftf-${stamp}.sqlite`);
  const src = new DatabaseSync(path, { timeout: 15000 });
  try { src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); } finally { src.close(); }
  const copy = new DatabaseSync(file, { readOnly: true });
  let ok; try { ok = Object.values(copy.prepare('PRAGMA integrity_check').get())[0] === 'ok'; } finally { copy.close(); }
  if (!ok) { rmSync(file, { force: true }); throw new Error('the backup copy failed its integrity check'); }
  try { chmodSync(file, 0o600); } catch { /* no modes */ }
  const all = readdirSync(dir).filter((f) => /^ftf-\d{8}T\d{6}Z\.sqlite$/.test(f)).sort();
  const removed = all.slice(0, Math.max(0, all.length - keep));
  for (const f of removed) rmSync(join(dir, f), { force: true });
  return { file, bytes: statSync(file).size, removed };
}
