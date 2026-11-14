// The data layer (db/index.js), the one-shot import from the JSON files (db/import-json.mjs) and the backup
// (backupDatabase): migrations, every store's round trip, two processes' worth of connections on one file, an
// unopenable path, verified and idempotent imports that never touch the JSON files, rotation and restore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate, backupDatabase, SCHEMA_VERSION } from '../index.js';
import { MIGRATIONS } from '../migrations.js';
import { importJson } from '../import-json.mjs';

const tmp = (p = 'ftf-db-') => mkdtempSync(join(tmpdir(), p));
const ACC = 'ann-1a.guests.ftf-coordinator.testnet';

test('a fresh database gets the schema; reopening applies nothing; a newer schema is refused; WAL and foreign keys are on', () => {
  const file = join(tmp(), 'sub', 'ftf.sqlite');
  const a = openDatabase(file);
  assert.deepEqual(a.applied, MIGRATIONS.map((m) => m.version)); assert.equal(a.version(), SCHEMA_VERSION);
  assert.equal(a.raw.prepare('PRAGMA journal_mode').get().journal_mode, 'wal'); assert.equal(a.raw.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(a.check(), 'ok');
  a.close();
  const b = openDatabase(file); assert.deepEqual(b.applied, []);
  b.raw.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(SCHEMA_VERSION + 5, 'from the future', 1);
  b.close();
  assert.throws(() => openDatabase(file), /newer than this code/);
});

test('a failing migration changes nothing (its transaction is rolled back)', () => {
  const raw = new DatabaseSync(':memory:');
  assert.throws(() => migrate(raw, { migrations: [{ version: 1, name: 'ok', sql: 'CREATE TABLE a (x)' }, { version: 2, name: 'broken', sql: 'CREATE TABLE b (x); THIS IS NOT SQL' }] }), /migration 2 \(broken\) failed/);
  assert.equal(Number(raw.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v), 1);
  assert.equal(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get(), undefined, 'the half-made table is gone');
});

test('a path that cannot be opened throws (the services then refuse to start)', () => {
  const dir = tmp(); writeFileSync(join(dir, 'plain-file'), 'x');
  assert.throws(() => openDatabase(join(dir, 'plain-file', 'ftf.sqlite')));
  writeFileSync(join(dir, 'garbage.sqlite'), 'this is not a database, not at all, '.repeat(40));
  assert.throws(() => openDatabase(join(dir, 'garbage.sqlite')));
});

test('identities: whole records round-trip, one account row per player, methods by account, remove', () => {
  const db = openDatabase(':memory:');
  const wallet = { account: ACC, guest_key: 'ed25519:g', kind: 'evm', address: '0xabc', linked_at: '2026-11-14T00:00:00.000Z', history: [{ account: 'old.testnet', until: 'x' }] };
  const mail = { account: ACC, kind: 'email', email_hint: 'a***@b.co', key_pub: 'ed25519:p', key_box: 'v1.a.b.c', linked_at: 'y', history: [] };
  db.identities.set('evm:0xabc', wallet); db.identities.set('email:' + 'f'.repeat(64), mail);
  assert.deepEqual(db.identities.get('evm:0xabc'), wallet); assert.equal(db.identities.get('nope'), null);
  assert.equal(db.identities.size, 2); assert.equal(db.counts().accounts, 1);
  assert.deepEqual(db.identities.ofAccount(ACC).map(([id]) => id), ['evm:0xabc', 'email:' + 'f'.repeat(64)]);
  db.identities.set('evm:0xabc', { ...wallet, account: 'bob.testnet' }); // the login moved to another account
  assert.equal(db.identities.get('evm:0xabc').account, 'bob.testnet'); assert.equal(db.identities.ofAccount(ACC).length, 1);
  assert.equal(db.identities.remove('evm:0xabc'), true); assert.equal(db.identities.remove('evm:0xabc'), false);
  assert.throws(() => db.identities.set('x', { kind: 'evm' }), /without an account/);
  assert.throws(() => db.raw.prepare("INSERT INTO identities (id, account_id, kind, data) VALUES ('z', 'ghost.testnet', 'evm', '{}')").run(), /FOREIGN KEY/, 'a method cannot point at an account that does not exist');
});

test('email codes: hashes by email id, tries, the hourly send count, pruning', () => {
  let t = 1000; const db = openDatabase(':memory:', { now: () => t });
  db.codes.set('email:x', { hash: Buffer.from([1, 2, 3]), purpose: 'login', bind: null, exp: 5000, tries: 0 });
  assert.deepEqual(db.codes.get('email:x'), { hash: Buffer.from([1, 2, 3]), purpose: 'login', bind: null, exp: 5000, tries: 0 });
  db.codes.tries('email:x', 3); assert.equal(db.codes.get('email:x').tries, 3);
  db.codes.sent('email:x', 1000); db.codes.sent('email:x', 2000); assert.equal(db.codes.sentSince('email:x', 1500), 1);
  db.codes.prune(6000); assert.equal(db.codes.get('email:x'), null);
  db.codes.prune(3600_000 + 1500); assert.equal(db.codes.sentSince('email:x', 0), 1, 'send marks older than an hour go');
});

test('rooms: the newest lines per room, oldest first, rooms apart, values typed', () => {
  const db = openDatabase(':memory:');
  for (let i = 0; i < 35; i++) db.history.add(1, 'chat', { name: 'ann', text: 'line ' + i, at: 100 + i }, 30);
  db.history.add(2, 'chat', { name: 'bob', account: 'bob.testnet', text: 'elsewhere', at: 200 }, 30);
  db.history.add(1, 'acts', { name: 'ann', k: 'level', v: 7, at: 300 }, 30); db.history.add(1, 'acts', { name: 'ann', k: 'chest', v: 'rare', at: 301 }, 30); db.history.add(1, 'acts', { name: 'ann', k: 'quest', at: 302 }, 30);
  const h = db.history.get(1, 0, 30);
  assert.equal(h.chat.length, 30); assert.equal(h.chat[0].text, 'line 5'); assert.equal(h.chat.at(-1).text, 'line 34');
  assert.deepEqual(h.acts, [{ name: 'ann', at: 300, k: 'level', v: 7 }, { name: 'ann', at: 301, k: 'chest', v: 'rare' }, { name: 'ann', at: 302, k: 'quest' }]);
  assert.deepEqual(db.history.get(2, 0, 30).chat, [{ name: 'bob', at: 200, account: 'bob.testnet', text: 'elsewhere' }]);
  assert.equal(db.history.get(1, 130, 30).chat.length, 4, 'nothing older than the cut');
  assert.deepEqual(db.history.stats(), { rooms: 2, lines: 34 });
  db.history.prune(250); assert.equal(db.history.stats().lines, 3);
});

test('expedition logs, town credits, journals, receipts, state documents', () => {
  const db = openDatabase(':memory:');
  assert.equal(db.expedition.load(ACC), null);
  db.expedition.append(ACC, 0, [{ seq: 0, hash: 'h0', kind: 'start' }, { seq: 1, hash: 'h1', kind: 'kill' }]);
  db.expedition.append(ACC, 2, [{ seq: 2, hash: 'h2' }]);
  assert.deepEqual(db.expedition.load(ACC).map((e) => e.hash), ['h0', 'h1', 'h2']); assert.equal(db.expedition.status(ACC).length, 3); assert.ok(db.expedition.status(ACC).bytes > 30);
  assert.throws(() => db.expedition.append(ACC, 1, [{ hash: 'fork' }]), 'a stored seq cannot be written twice');
  assert.equal(db.expedition.status(ACC).length, 3, 'and the failed batch left nothing');
  assert.deepEqual(db.credits.get(ACC), { credited: '0', day: 0, today: '0' });
  db.credits.put(ACC, { credited: '5000000', day: 20771, today: '100' }); db.credits.put(ACC, { credited: '6000000', day: 20771, today: '200' });
  assert.deepEqual(db.credits.get(ACC), { credited: '6000000', day: 20771, today: '200' });
  db.journal.append('town-log', { at: 10, buyer: 'guard' }); db.journal.append('town-log', { at: 20, buyer: 'baker' }); db.journal.append('clan-actions', { at: 15, clan: 'ash' });
  assert.deepEqual(db.journal.read('town-log', 15), [{ at: 20, buyer: 'baker' }]); assert.equal(db.journal.count('town-log'), 2); assert.equal(db.journal.read('town-gate').length, 0);
  db.receipts.add('pass', { claim_id: 'c1', status: 'queued' }, { ref: 'c1' }); db.receipts.add('pass', { claim_id: 'c1', status: 'minted' }, { ref: 'c1' });
  assert.deepEqual(db.receipts.list('pass').map((r) => r.status), ['queued', 'minted']); assert.equal(db.receipts.count('wheel'), 0);
  assert.equal(db.kv.get('town-state'), null); db.kv.set('town-state', { day: 1, today: 5 }); db.kv.set('town-state', { day: 1, today: 6 }); assert.deepEqual(db.kv.get('town-state'), { day: 1, today: 6 });
});

test('two connections on one file (the relayer and the presence service): each sees the other\'s writes', () => {
  const file = join(tmp(), 'ftf.sqlite');
  const relayer = openDatabase(file), presence = openDatabase(file);
  relayer.identities.set('evm:0x1', { account: ACC, kind: 'evm', address: '0x1' });
  presence.history.add(1, 'chat', { name: 'ann', text: 'hi', at: 5 }, 30);
  for (let i = 0; i < 200; i++) { relayer.journal.append('town-log', { at: i }); if (i % 20 === 0) presence.history.add(1, 'chat', { name: 'ann', text: 'n' + i, at: 10 + i }, 30); }
  assert.equal(presence.identities.size, 1); assert.equal(relayer.history.get(1, 0, 30).chat.length, 11); assert.equal(presence.journal.count('town-log'), 200);
  relayer.close(); presence.close();
});

test('backup: a checked copy, rotation keeps the newest, and a copy restores the data', () => {
  const dir = tmp(), file = join(dir, 'ftf.sqlite'), backups = join(dir, 'backups');
  const db = openDatabase(file); db.identities.set('evm:0x1', { account: ACC, kind: 'evm', address: '0x1' }); db.journal.append('town-log', { at: 1 });
  let t = Date.UTC(2026, 10, 14, 3, 17, 0);
  const made = []; for (let i = 0; i < 5; i++) { made.push(backupDatabase(file, backups, { keep: 3, now: () => t })); t += 86_400_000; }
  assert.match(made[0].file, /ftf-20261114T031700Z\.sqlite$/); assert.ok(made[0].bytes > 4096);
  assert.equal(readdirSync(backups).length, 3); assert.deepEqual(made[4].removed.length, 1);
  db.identities.remove('evm:0x1'); db.close(); // "the disaster"
  for (const ext of ['', '-wal', '-shm']) rmSync(file + ext, { force: true });
  copyFileSync(made[4].file, file);
  const back = openDatabase(file); assert.equal(back.identities.get('evm:0x1').account, ACC); assert.equal(back.journal.count('town-log'), 1); assert.equal(back.check(), 'ok'); back.close();
  assert.throws(() => backupDatabase(join(dir, 'missing.sqlite'), backups), /no database/);
});

// ---- the one-shot import ----
function fixture() {
  const R = tmp('ftf-rel-'), P = tmp('ftf-pres-');
  mkdirSync(join(R, 'auth')); writeFileSync(join(R, 'auth', 'identities.json'), JSON.stringify({ identities: { 'evm:0xabc': { account: ACC, guest_key: 'ed25519:g', kind: 'evm', address: '0xabc', linked_at: 'x', history: [] }, 'sol:So1': { account: 'bob.testnet', kind: 'sol', address: 'So1', linked_at: 'y', history: [] } } }));
  mkdirSync(join(R, 'town-credits')); writeFileSync(join(R, 'town-credits', ACC + '.json'), JSON.stringify({ credited: '5000000', day: 20771, today: '0' }));
  mkdirSync(join(R, 'expedition')); writeFileSync(join(R, 'expedition', ACC + '.jsonl'), [{ seq: 0, hash: 'h0' }, { seq: 1, hash: 'h1' }].map((e) => JSON.stringify(e)).join('\n') + '\n'); writeFileSync(join(R, 'expedition', 'empty.testnet.jsonl'), '');
  mkdirSync(join(R, 'town-log')); writeFileSync(join(R, 'town-log', 'market-2026-11-13.jsonl'), [{ at: 1, n: 1 }, { at: 2, n: 2 }, { at: 3, n: 3 }].map((e) => JSON.stringify(e)).join('\n') + '\n{"torn":');
  mkdirSync(join(R, 'clan-decisions')); writeFileSync(join(R, 'clan-decisions', 'market-2026-11-14.jsonl'), JSON.stringify({ clan: 'ash', source: 'llm' }) + '\n');
  writeFileSync(join(R, 'town-state.json'), JSON.stringify({ day: 20771, today: 99 }));
  writeFileSync(join(R, 'wheel-claims.jsonl'), JSON.stringify({ account_id: ACC, at: '2026-11-13T10:00:00Z' }) + '\n');
  writeFileSync(join(R, 'coord-key.json'), JSON.stringify({ secretKey: 'ed25519:SECRET' })); // a secret: never imported
  writeFileSync(join(P, 'chat-history.json'), JSON.stringify({ v: 1, savedAt: 1, rooms: { 1: { chat: [{ name: 'ann', text: 'hello', at: 10 }, { name: '<b>', text: 'bad name', at: 11 }], acts: [{ name: 'ann', k: 'chest', v: 'rare', at: 12 }] } } }));
  return { R, P };
}
const snapshot = (dir) => readdirSync(dir, { recursive: true }).map(String).sort().map((f) => { try { return f + ':' + readFileSync(join(dir, f)).length; } catch { return f; } }).join('|');

test('import: every record arrives, counts are verified, the JSON files are untouched, secrets stay out', () => {
  const { R, P } = fixture(), before = snapshot(R) + snapshot(P);
  const db = openDatabase(':memory:');
  const r = importJson({ db, relayerDir: R, presenceDir: P });
  assert.deepEqual(r.problems, []); assert.equal(r.ok, true);
  assert.equal(snapshot(R) + snapshot(P), before, 'the files are only read');
  assert.deepEqual(db.counts(), { accounts: 2, identities: 2, email_codes: 0, chat_messages: 1, room_actions: 1, expedition_events: 2, town_credits: 1, journal: 4, receipts: 1, kv: 1 });
  assert.equal(db.identities.get('evm:0xabc').guest_key, 'ed25519:g'); assert.deepEqual(db.credits.get(ACC).credited, '5000000');
  assert.deepEqual(db.kv.get('town-state'), { day: 20771, today: 99 }); assert.deepEqual(db.history.get(1, 0, 30).chat.map((c) => c.text), ['hello']);
  const log = r.rows.find((x) => x.source === 'town-log/market-2026-11-13.jsonl'); assert.deepEqual([log.found, log.imported, log.skipped], [4, 3, 1], 'the torn line is counted and skipped');
  assert.equal(db.journal.read('clan-decisions')[0].at, undefined); assert.equal(Number(db.raw.prepare("SELECT at FROM journal WHERE stream = 'clan-decisions'").get().at), Date.UTC(2026, 10, 14), 'an entry with no time gets its file\'s day');
  assert.ok(!JSON.stringify(db.raw.prepare('SELECT * FROM kv').all()).includes('SECRET'));
});

test('import: a second run adds nothing; lines appended since are taken; rows written after the move are never overwritten', () => {
  const { R, P } = fixture(); const db = openDatabase(':memory:');
  importJson({ db, relayerDir: R, presenceDir: P });
  const counts = db.counts();
  const again = importJson({ db, relayerDir: R, presenceDir: P });
  assert.equal(again.ok, true); assert.deepEqual(db.counts(), counts); assert.equal(again.rows.reduce((n, x) => n + x.imported, 0), 0);
  db.identities.set('evm:0xabc', { account: 'moved.testnet', kind: 'evm', address: '0xabc' }); db.kv.set('town-state', { day: 20772, today: 1 }); // the services worked on the database
  appendFileSync(join(R, 'clan-decisions', 'market-2026-11-14.jsonl'), JSON.stringify({ clan: 'moss', at: 5 }) + '\n');
  appendFileSync(join(R, 'expedition', ACC + '.jsonl'), JSON.stringify({ seq: 2, hash: 'h2' }) + '\n');
  const third = importJson({ db, relayerDir: R, presenceDir: P });
  assert.equal(third.ok, true); assert.equal(db.journal.count('clan-decisions'), 2); assert.equal(db.expedition.status(ACC).length, 3);
  assert.equal(db.identities.get('evm:0xabc').account, 'moved.testnet', 'not overwritten by the old file'); assert.equal(db.kv.get('town-state').day, 20772);
});

test('import: a dry run and a failed check write nothing', () => {
  const { R, P } = fixture(); const db = openDatabase(':memory:');
  const dry = importJson({ db, relayerDir: R, presenceDir: P, dryRun: true });
  assert.equal(dry.ok, true); assert.equal(db.counts().identities, 0); assert.equal(db.counts().journal, 0);
  writeFileSync(join(R, 'expedition', 'torn.testnet.jsonl'), '{"seq":0,"hash":"a"}\n{"seq":1,');
  const bad = importJson({ db, relayerDir: R, presenceDir: P });
  assert.equal(bad.ok, false); assert.match(bad.problems.join(' '), /torn line/); assert.equal(db.counts().identities, 0, 'all or nothing');
  assert.ok(existsSync(join(R, 'expedition', 'torn.testnet.jsonl')));
});
