// The room memory in the database (lib/history-db.js; ../../db/index.js): the same behaviour as chat-history.json for
// the hub (order, the cap of 30, clean entries only, a newcomer's history, a restart), the real server with FTF_DB,
// and the refusal to start when the database cannot be opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../db/index.js';
import { createDbHistory } from '../lib/history-db.js';
import { HISTORY } from '../lib/history.js';
import { createHub } from '../lib/hub.js';
import { createPresence } from '../server.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'ftf-pres-db-'));
const T0 = 1_700_000_000_000;

test('rows instead of a file: oldest first, the newest 30 per room, only clean entries, old lines expire', () => {
  let t = T0; const h = createDbHistory({ db: openDatabase(':memory:'), now: () => t });
  for (let i = 0; i < 35; i++) { t += 10; h.addChat(1, { name: 'ann', text: 'line ' + i, at: t }); }
  h.addChat(2, { name: 'bob', account: 'bob.testnet', text: 'elsewhere', at: t });
  assert.equal(h.addChat(1, { name: 'Ann!', text: 'x', at: t }), null); assert.equal(h.addAct(1, { name: 'ann', k: 'shout', v: 'free text', at: t }), null); assert.equal(h.addChat(99, { name: 'ann', text: 'x', at: t }), null);
  assert.deepEqual(h.addAct(1, { name: 'ann', account: 'ann.testnet', k: 'chest', v: 'rare', at: t, extra: 'dropped' }), { name: 'ann', at: t, account: 'ann.testnet', k: 'chest', v: 'rare' });
  const got = h.get(1);
  assert.equal(got.chat.length, HISTORY.cap); assert.equal(got.chat[0].text, 'line 5'); assert.equal(got.chat.at(-1).text, 'line 34');
  assert.deepEqual(got.acts, [{ name: 'ann', at: t, account: 'ann.testnet', k: 'chest', v: 'rare' }]);
  assert.deepEqual(h.get(2).chat, [{ name: 'bob', at: t, account: 'bob.testnet', text: 'elsewhere' }]); assert.deepEqual(h.get(3), { chat: [], acts: [] });
  assert.deepEqual(h.stats(), { historyRooms: 2, historyLines: 32, historyFile: true, historyDb: true }); assert.equal(h.save(), false, 'nothing waits to be saved');
  t += HISTORY.maxAgeMs + 1; assert.deepEqual(h.get(1), { chat: [], acts: [] });
});

test('a row edited by hand is not trusted on the way out', () => {
  const db = openDatabase(':memory:'); const h = createDbHistory({ db, now: () => T0 });
  h.addChat(1, { name: 'ann', text: 'ok', at: T0 });
  db.raw.prepare("INSERT INTO chat_messages (room, name, account, text, at) VALUES (1, '<b>', NULL, 'x', ?)").run(T0);
  db.raw.prepare("INSERT INTO room_actions (room, name, account, kind, value, at) VALUES (1, 'ann', NULL, 'hack', NULL, ?)").run(T0);
  assert.deepEqual(h.get(1), { chat: [{ name: 'ann', at: T0, text: 'ok' }], acts: [] });
});

test('the hub with the database: a newcomer gets the history; it survives a restart of the service', () => {
  const file = join(tmp(), 'ftf.sqlite');
  const run = (fn) => { let t = T0; const history = createDbHistory({ path: file, now: () => t }); const hub = createHub({ now: () => t, history });
    const mk = () => { const c = { out: [], send(s) { this.out.push(JSON.parse(s)); }, close() {}, buffered: () => 0 }; const conn = hub.connect(c); return { say: (o) => conn.onText(JSON.stringify(o)), last: (type) => [...c.out].reverse().find((m) => m.t === type) }; };
    fn(mk, (ms) => { t += ms; }); history.close(); };
  run((mk, adv) => { const a = mk(); a.say({ t: 'hello', name: 'ann', account: 'ann.testnet' }); a.say({ t: 'chat', text: 'first' }); adv(2100); a.say({ t: 'chat', text: 'see www.scam.xyz' }); adv(3100); a.say({ t: 'act', k: 'level', v: 3 }); });
  run((mk) => { const b = mk(); b.say({ t: 'hello', name: 'bob' }); const h = b.last('hist');
    assert.deepEqual(h.chat.map((m) => [m.name, m.text, m.account]), [['ann', 'first', 'ann.testnet']], 'the filtered line never reached the database');
    assert.deepEqual(h.acts.map((m) => [m.name, m.k, m.v]), [['ann', 'level', 3]]); });
});

test('the server with FTF_DB: no chat-history.json is written; health says the history is kept', async () => {
  const dir = tmp(), file = join(dir, 'db', 'ftf.sqlite');
  const { server, history } = createPresence({ env: { FTF_DB: file, PRESENCE_DATA_DIR: dir }, log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    history.addChat(1, { name: 'ann', text: 'kept', at: Date.now() });
    const h = await (await fetch(`http://127.0.0.1:${server.address().port}/health`)).json();
    assert.equal(h.historyFile, true); assert.equal(h.historyDb, true); assert.equal(h.historyLines, 1);
    assert.deepEqual(readdirSync(dir), ['db'], 'the JSON file is not used');
  } finally { server.close(); server.closeAllConnections(); history.close(); }
});

test('a database that cannot be opened: presence refuses to start, loudly', () => {
  const dir = tmp(); writeFileSync(join(dir, 'not-a-folder'), 'x');
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], { env: { ...process.env, FTF_DB: join(dir, 'not-a-folder', 'ftf.sqlite'), PORT: '0', HOST: '127.0.0.1' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1, r.stderr + r.stdout); assert.match(r.stderr, /FATAL: the database .* cannot be opened/); assert.doesNotMatch(r.stdout, /presence on/);
});
