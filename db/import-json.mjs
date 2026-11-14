#!/usr/bin/env node
// The one-shot move from the JSON files to the database (db/index.js). Reads the relayer's and the presence service's
// data folders and writes every record into the database, in ONE transaction: it either all arrives, verified, or
// nothing changes. The JSON files are only read, never changed or removed: they stay as the backup and as the
// rollback path (unset FTF_DB and the services use them again).
//
//   node db/import-json.mjs --db /var/lib/ftf-db/ftf.sqlite --relayer-dir /var/lib/ftf-relayer --presence-dir /var/lib/ftf-presence [--pass-dir DIR] [--dry-run]
//
// Idempotent: each source file is recorded in import_log with the number of records taken from it; a second run takes
// only what a file has gained since (append-only .jsonl files) and never overwrites a row the services have written
// after the move (identities, credits and state documents are imported once). Run it with the services stopped.
// Exit code 0 and the line "VERIFIED" mean every count matched; anything else is exit 1 with nothing written.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from './index.js';
import { cleanChat, cleanAct } from '../presence/lib/history.js';

/** The journals the relayer writes as <dir>/<stream>/market-YYYY-MM-DD.jsonl. */
export const JOURNAL_STREAMS = Object.freeze(['town-log', 'clan-actions', 'clan-decisions', 'town-gate', 'town-act']);
/** Append-only receipt files in the relayer's (or the pass) folder: file -> [kind, ref field, account field]. */
export const RECEIPT_FILES = Object.freeze({ 'pass-claims.jsonl': ['pass', 'claim_id', 'wallet'], 'wheel-claims.jsonl': ['wheel', 'claim_id', 'account_id'], 'resource-desk.jsonl': ['resource', 'hash', 'account'] });

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; } };
/** The non-empty lines of a .jsonl file, each parsed (undefined for a torn line). */
const readLines = (file) => { try { return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return undefined; } }); } catch { return null; } };
const list = (dir) => { try { return readdirSync(dir).sort(); } catch { return []; } };

/**
 * Imports into an open database. Returns {ok, rows: [{source, found, imported, skipped, already}], problems: [text]}.
 * Throws nothing: a failed check is reported in `problems` and the transaction is rolled back.
 * @param {{db: object, relayerDir?: string|null, presenceDir?: string|null, passDir?: string|null, dryRun?: boolean, now?: () => number}} o
 */
export function importJson({ db, relayerDir = null, presenceDir = null, passDir = relayerDir, dryRun = false, now = () => Date.now() }) {
  const rows = [], problems = [];
  const taken = (source) => { const r = db.raw.prepare('SELECT rows FROM import_log WHERE source = ?').get(source); return r ? Number(r.rows) : null; };
  const mark = (source, n) => db.raw.prepare('INSERT INTO import_log (source, rows, imported_at) VALUES (?, ?, ?) ON CONFLICT(source) DO UPDATE SET rows = excluded.rows, imported_at = excluded.imported_at').run(source, n, now());
  const count = (sql, ...a) => Number(db.raw.prepare(sql).get(...a).n);
  const row = (source, found, imported, skipped = 0, already = 0) => rows.push({ source, found, imported, skipped, already });
  const expect = (source, what, got, want) => { if (got !== want) problems.push(`${source}: ${what}: ${got} in the database, ${want} expected`); };

  db.raw.exec('BEGIN IMMEDIATE');
  try {
    // ---- accounts and linked sign-in methods: once (afterwards the database is the newer side)
    if (relayerDir) {
      const file = join(relayerDir, 'auth', 'identities.json'), source = 'auth/identities.json';
      if (existsSync(file)) {
        const j = readJson(file), all = j && j.identities && typeof j.identities === 'object' ? Object.entries(j.identities) : null;
        if (!all) problems.push(`${source}: not readable as {identities: {...}}`);
        else if (taken(source) != null) row(source, all.length, 0, 0, all.length);
        else {
          let n = 0, bad = 0;
          for (const [id, rec] of all) { if (rec && typeof rec.account === 'string' && rec.account) { db.identities.set(id, rec); n++; } else bad++; }
          for (const [id, rec] of all) if (rec && rec.account && JSON.stringify(db.identities.get(id)) !== JSON.stringify(rec)) problems.push(`${source}: ${id} differs after the import`);
          mark(source, all.length); row(source, all.length, n, bad);
        }
      }
      // ---- town credits per guest: once per file
      for (const f of list(join(relayerDir, 'town-credits')).filter((x) => x.endsWith('.json'))) {
        const source = 'town-credits/' + f, guest = f.slice(0, -5), rec = readJson(join(relayerDir, 'town-credits', f));
        if (!rec || typeof rec !== 'object') { problems.push(`${source}: not readable`); continue; }
        if (taken(source) != null) { row(source, 1, 0, 0, 1); continue; }
        db.credits.put(guest, rec);
        if (JSON.stringify(db.credits.get(guest)) !== JSON.stringify(rec)) problems.push(`${source}: differs after the import`);
        mark(source, 1); row(source, 1, 1);
      }
      // ---- expedition logs: the lines a file has beyond what was taken (a log is a hash chain: a torn line stops it)
      for (const f of list(join(relayerDir, 'expedition')).filter((x) => x.endsWith('.jsonl'))) {
        const source = 'expedition/' + f, guest = f.slice(0, -6), lines = readLines(join(relayerDir, 'expedition', f)) || [];
        if (lines.some((l) => l === undefined)) { problems.push(`${source}: a torn line (the relayer treats this log as unreadable); fix or remove the file`); continue; }
        const have = taken(source) || 0, stored = db.expedition.status(guest).length;
        if (stored !== have) { if (stored === lines.length) { mark(source, lines.length); row(source, lines.length, 0, 0, lines.length); continue; } problems.push(`${source}: the database holds ${stored} entries for ${guest}, the import log says ${have}`); continue; }
        const fresh = lines.slice(have);
        if (fresh.length) db.expedition.append(guest, have, fresh, now());
        expect(source, 'entries', db.expedition.status(guest).length, lines.length);
        mark(source, lines.length); row(source, lines.length, fresh.length, 0, have);
      }
      // ---- journals: per day file, the lines beyond what was taken
      for (const stream of JOURNAL_STREAMS) for (const f of list(join(relayerDir, stream)).filter((x) => x.endsWith('.jsonl'))) {
        const source = `${stream}/${f}`, lines = readLines(join(relayerDir, stream, f)) || [], have = taken(source) || 0;
        const fresh = lines.slice(have), good = fresh.filter((l) => l && typeof l === 'object');
        const before = db.journal.count(stream);
        const day = Date.parse((/(\d{4}-\d{2}-\d{2})/.exec(f) || [])[1] + 'T00:00:00Z');
        for (const e of good) db.raw.prepare('INSERT INTO journal (stream, at, body) VALUES (?, ?, ?)').run(stream, Number(e.at) || (Number.isFinite(day) ? day : now()), JSON.stringify(e));
        expect(source, 'rows added', db.journal.count(stream) - before, good.length);
        mark(source, lines.length); row(source, lines.length, good.length, fresh.length - good.length, have);
      }
      // ---- state documents: once
      for (const [f, key] of [['town-state.json', 'town-state'], ['p2p-book.json', 'p2p-book']]) {
        const file = join(relayerDir, f); if (!existsSync(file)) continue;
        const doc = readJson(file);
        if (doc === undefined) { problems.push(`${f}: not readable`); continue; }
        if (taken(f) != null) { row(f, 1, 0, 0, 1); continue; }
        db.kv.set(key, doc);
        if (JSON.stringify(db.kv.get(key)) !== JSON.stringify(doc)) problems.push(`${f}: differs after the import`);
        mark(f, 1); row(f, 1, 1);
      }
    }
    // ---- receipts: append-only files, the lines beyond what was taken
    for (const [f, [kind, refKey, accKey]] of Object.entries(RECEIPT_FILES)) {
      const dir = kind === 'pass' ? passDir : relayerDir; if (!dir) continue;
      const lines = readLines(join(dir, f)); if (!lines) continue;
      const have = taken(f) || 0, fresh = lines.slice(have), good = fresh.filter((l) => l && typeof l === 'object'), before = db.receipts.count(kind);
      for (const r of good) db.receipts.add(kind, r, { ref: r[refKey] ?? null, account: r[accKey] ?? null, at: Number(r.at) || Date.parse(r.at || r.created_at || '') || now() });
      expect(f, 'rows added', db.receipts.count(kind) - before, good.length);
      mark(f, lines.length); row(f, lines.length, good.length, fresh.length - good.length, have);
    }
    // ---- the rooms' chat and action feed: once (entries pass the same cleaning as when the presence service reads its file)
    if (presenceDir) {
      const file = join(presenceDir, 'chat-history.json'), source = 'presence/chat-history.json';
      if (existsSync(file)) {
        const j = readJson(file);
        if (!j || j.v !== 1 || !j.rooms || typeof j.rooms !== 'object') problems.push(`${source}: not readable as {v: 1, rooms}`);
        else {
          let found = 0, n = 0;
          const done = taken(source) != null;
          const c0 = count('SELECT COUNT(*) AS n FROM chat_messages') + count('SELECT COUNT(*) AS n FROM room_actions');
          for (const [k, r] of Object.entries(j.rooms)) {
            const room = Number(k); if (!Number.isInteger(room) || !r || typeof r !== 'object') continue;
            for (const [kind, clean] of [['chat', cleanChat], ['acts', cleanAct]]) for (const raw of Array.isArray(r[kind]) ? r[kind] : []) {
              found++; const e = clean(raw); if (!e || done) continue;
              if (kind === 'chat') db.raw.prepare('INSERT INTO chat_messages (room, name, account, text, at) VALUES (?, ?, ?, ?, ?)').run(room, e.name, e.account ?? null, e.text, e.at);
              else db.raw.prepare('INSERT INTO room_actions (room, name, account, kind, value, at) VALUES (?, ?, ?, ?, ?, ?)').run(room, e.name, e.account ?? null, e.k, e.v == null ? null : JSON.stringify(e.v), e.at);
              n++;
            }
          }
          if (done) row(source, found, 0, 0, found);
          else { expect(source, 'rows added', count('SELECT COUNT(*) AS n FROM chat_messages') + count('SELECT COUNT(*) AS n FROM room_actions') - c0, n); mark(source, found); row(source, found, n, found - n); }
        }
      }
    }
    if (db.check() !== 'ok') problems.push('the database failed its integrity check after the import');
    if (problems.length || dryRun) db.raw.exec('ROLLBACK'); else db.raw.exec('COMMIT');
  } catch (e) {
    try { db.raw.exec('ROLLBACK'); } catch { /* no transaction left */ }
    problems.push('import stopped: ' + ((e && e.message) || e));
  }
  return { ok: !problems.length, rows, problems, dryRun };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
  const dbPath = arg('db'), relayerDir = arg('relayer-dir'), presenceDir = arg('presence-dir'), dryRun = process.argv.includes('--dry-run');
  if (!dbPath || (!relayerDir && !presenceDir)) { console.error('usage: node db/import-json.mjs --db FILE [--relayer-dir DIR] [--presence-dir DIR] [--pass-dir DIR] [--dry-run]'); process.exit(2); }
  let db;
  try { db = openDatabase(dbPath); } catch (e) { console.error(`cannot open the database ${dbPath}: ${e.message}`); process.exit(1); }
  const r = importJson({ db, relayerDir, presenceDir, passDir: arg('pass-dir') || relayerDir, dryRun });
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('source', 58)}${pad('found', 8)}${pad('imported', 10)}${pad('skipped', 9)}already`);
  for (const x of r.rows) console.log(`${pad(x.source, 58)}${pad(x.found, 8)}${pad(x.imported, 10)}${pad(x.skipped, 9)}${x.already}`);
  const sum = (k) => r.rows.reduce((n, x) => n + x[k], 0);
  console.log(`\ntotal: ${sum('found')} records in ${r.rows.length} files, ${sum('imported')} imported, ${sum('skipped')} skipped (torn or malformed), ${sum('already')} already there`);
  if (!dryRun && r.ok) console.log('database now holds: ' + JSON.stringify(db.counts()));
  for (const p of r.problems) console.error('PROBLEM: ' + p);
  db.close();
  console.log(r.ok ? (dryRun ? 'DRY RUN: every count matched; nothing was written' : 'VERIFIED: every count matched; the JSON files were not changed') : 'FAILED: nothing was written');
  process.exit(r.ok ? 0 : 1);
}
