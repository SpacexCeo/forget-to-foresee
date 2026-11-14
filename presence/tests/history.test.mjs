// The room memory: order, the cap of 30, the file round trip (atomic, size cap, untrusted on load), and through the
// hub: the history a newcomer gets, the action whitelist and the action rate limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHistory, HISTORY, cleanAct, cleanChat } from '../lib/history.js';
import { createHub, validate, LIMITS } from '../lib/hub.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ftf-presence-'));
const T0 = 1_700_000_000_000;
function rig(makeHistory = (now) => createHistory({ now })) {
  let t = T0; const now = () => t; const history = makeHistory(now); const hub = createHub({ now, history });
  const mk = () => {
    const c = { out: [], closed: null, send(s) { this.out.push(JSON.parse(s)); }, close(code) { this.closed = code; }, buffered: () => 0 };
    const conn = hub.connect(c);
    return { c, conn, say: (o) => conn.onText(JSON.stringify(o)), last: (type) => [...c.out].reverse().find((m) => m.t === type), all: (type) => c.out.filter((m) => m.t === type) };
  };
  return { hub, history, mk, adv: (ms) => { t += ms; } };
}

test('history: oldest first, the newest 30 per room, rooms apart, old lines expire', () => {
  let t = 1000; const h = createHistory({ now: () => t });
  for (let i = 0; i < 35; i++) { t += 10; h.addChat(1, { name: 'ann', text: 'line ' + i, at: t }); }
  h.addChat(2, { name: 'bob', text: 'elsewhere', at: t });
  const got = h.get(1).chat;
  assert.equal(got.length, HISTORY.cap); assert.equal(got[0].text, 'line 5'); assert.equal(got.at(-1).text, 'line 34');
  assert.ok(got.every((e, i) => i === 0 || e.at > got[i - 1].at));
  assert.deepEqual(h.get(2).chat.map((e) => e.text), ['elsewhere']); assert.deepEqual(h.get(3), { chat: [], acts: [] });
  for (let i = 0; i < 40; i++) h.addAct(1, { name: 'ann', k: 'level', v: 2 + i, at: t });
  assert.equal(h.get(1).acts.length, HISTORY.cap); assert.equal(h.get(1).acts[0].v, 12);
  t += HISTORY.maxAgeMs + 1; assert.deepEqual(h.get(1), { chat: [], acts: [] });
});

test('history: only clean entries are kept (names, text, whitelisted kinds and values)', () => {
  const h = createHistory({ now: () => 5 });
  assert.equal(h.addChat(1, { name: 'Ann!', text: 'x', at: 1 }), null); assert.equal(h.addChat(1, { name: 'ann', text: '', at: 1 }), null);
  assert.equal(h.addChat(1, { name: 'ann', text: 'x'.repeat(141), at: 1 }), null); assert.equal(h.addChat(99, { name: 'ann', text: 'x', at: 1 }), null);
  assert.equal(h.addAct(1, { name: 'ann', k: 'shout', v: 'buy at scam.xyz', at: 1 }), null);
  assert.equal(h.addAct(1, { name: 'ann', k: 'chest', v: 'golden', at: 1 }), null); assert.equal(h.addAct(1, { name: 'ann', k: 'quest', v: 'free text', at: 1 }), null);
  assert.equal(h.addAct(1, { name: 'ann', k: 'level', v: 1000, at: 1 }), null);
  assert.deepEqual(h.addAct(1, { name: 'ann', account: 'ann.testnet', k: 'chest', v: 'rare', at: 1, extra: 'dropped' }), { name: 'ann', at: 1, account: 'ann.testnet', k: 'chest', v: 'rare' });
  assert.deepEqual(cleanAct({ name: 'ann', k: 'trade', at: 2 }), { name: 'ann', at: 2, k: 'trade' });
  assert.equal(cleanChat({ name: 'ann', account: 'Bad Account', text: 'x', at: 1 }), null);
});

test('history: the file round trip is atomic and survives a restart; a broken or huge file means an empty memory', () => {
  const dir = tmp(), t = T0, now = () => t;
  const a = createHistory({ dir, now, timers: false });
  assert.equal(a.save(), false, 'nothing to write yet');
  a.addChat(1, { name: 'ann', text: 'hello', at: t }); a.addChat(1, { name: 'bob', account: 'bob.testnet', text: 'привет', at: t + 1 }); a.addAct(1, { name: 'ann', k: 'boss', v: 'shoal', at: t + 2 });
  assert.equal(a.save(), true); assert.equal(a.save(), false, 'clean: no second write');
  assert.deepEqual(fs.readdirSync(dir), [HISTORY.file], 'no temp file is left behind');
  const b = createHistory({ dir, now, timers: false });
  assert.deepEqual(b.get(1), a.get(1)); assert.equal(b.get(1).chat[1].text, 'привет'); assert.equal(b.stats().historyLines, 3);
  // a file edited by hand is not trusted: bad entries and unknown rooms are dropped on load
  const byHand = { v: 1, rooms: {
    1: { chat: [{ name: 'ann', text: 'ok', at: t }, { name: '<b>', text: 'x', at: t }, { name: 'ann', text: 'old', at: t - HISTORY.maxAgeMs - 5 }], acts: [{ name: 'ann', k: 'hack', at: t }] },
    777: { chat: [{ name: 'ann', text: 'x', at: t }] } } };
  fs.writeFileSync(a.file, JSON.stringify(byHand));
  const c = createHistory({ dir, now, timers: false });
  assert.deepEqual(c.get(1), { chat: [{ name: 'ann', at: t, text: 'ok' }], acts: [] }); assert.equal(c.stats().historyRooms, 1);
  fs.writeFileSync(a.file, '{ not json'); assert.deepEqual(createHistory({ dir, now, timers: false }).get(1), { chat: [], acts: [] });
  fs.writeFileSync(a.file, ' '.repeat(HISTORY.maxBytes + 1)); assert.deepEqual(createHistory({ dir, now, timers: false }).get(1), { chat: [], acts: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history: the file stays under the size cap (the oldest halves go first)', () => {
  const dir = tmp(), limits = { ...HISTORY, maxBytes: 2000 };
  const h = createHistory({ dir, now: () => 10, timers: false, limits });
  for (let r = 1; r <= 5; r++) for (let i = 0; i < 30; i++) h.addChat(r, { name: 'ann', text: 'я'.repeat(100) + i, at: 10 });
  assert.equal(h.save(), true);
  assert.ok(fs.statSync(h.file).size <= 2000, String(fs.statSync(h.file).size));
  const back = createHistory({ dir, now: () => 10, timers: false, limits });
  assert.ok(back.get(1).chat.length >= 1 && back.get(1).chat.at(-1).text.endsWith('29'), 'the newest lines are the ones kept');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hub: a newcomer gets the room history right after welcome; it survives an empty room and a restart', () => {
  const dir = tmp();
  const { history, mk, adv } = rig((now) => createHistory({ dir, now, timers: false }));
  const a = mk(); a.say({ t: 'hello', name: 'ann', account: 'ann.testnet' });
  assert.equal(a.last('welcome').name, 'ann'); assert.deepEqual(a.last('hist'), { t: 'hist', chat: [], acts: [] });
  assert.equal(a.c.out.findIndex((m) => m.t === 'hist'), a.c.out.findIndex((m) => m.t === 'welcome') + 1);
  a.say({ t: 'chat', text: 'first' }); adv(2100); a.say({ t: 'chat', text: 'second' }); adv(3100); a.say({ t: 'act', k: 'chest', v: 'rare' });
  assert.equal(a.last('chat').account, 'ann.testnet');
  const b = mk(); b.say({ t: 'hello', name: 'bob' });
  assert.deepEqual(b.last('hist').chat.map((m) => [m.name, m.text, m.account]), [['ann', 'first', 'ann.testnet'], ['ann', 'second', 'ann.testnet']]);
  assert.deepEqual(b.last('hist').acts.map((m) => [m.name, m.k, m.v]), [['ann', 'chest', 'rare']]);
  assert.ok(b.last('hist').chat.every((m) => !('id' in m)), 'session ids are not history');
  a.conn.onClose(); b.conn.onClose(); // the room is empty: its memory stays
  const c = mk(); c.say({ t: 'hello', name: 'cat' }); assert.equal(c.last('hist').chat.length, 2);
  assert.equal(history.save(), true);
  const again = rig((now) => createHistory({ dir, now, timers: false }));
  const d = again.mk(); d.say({ t: 'hello', name: 'dan' });
  assert.deepEqual(d.last('hist').chat.map((m) => m.text), ['first', 'second']); assert.equal(d.last('hist').acts[0].k, 'chest');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hub: filtered, rate-limited and muted chat never reaches the history', () => {
  const { mk, adv } = rig();
  const a = mk(); a.say({ t: 'hello', name: 'ann' });
  a.say({ t: 'chat', text: 'one' }); a.say({ t: 'chat', text: 'too fast' }); adv(2100); a.say({ t: 'chat', text: 'see www.scam.xyz' }); adv(2100); a.say({ t: 'chat', text: 'what the fuck' });
  const b = mk(); b.say({ t: 'hello', name: 'bob' });
  assert.deepEqual(b.last('hist').chat.map((m) => m.text), ['one', 'what the f***']);
});

test('hub: actions are whitelisted, carry no free text, and are rate-limited per sender', () => {
  assert.deepEqual(validate({ t: 'act', k: 'level', v: 7 }), { t: 'act', k: 'level', v: 7 });
  assert.deepEqual(validate({ t: 'act', k: 'quest' }), { t: 'act', k: 'quest', v: null });
  const bads = [{ t: 'act', k: 'say', v: 'hello' }, { t: 'act', k: 'quest', v: 'visit scam.xyz' }, { t: 'act', k: 'level', v: '7' }, { t: 'act', k: 'boss', v: 'your mom' }, { t: 'act', k: 'toString' }, { t: 'act' }];
  for (const bad of bads) assert.equal(validate(bad), null, JSON.stringify(bad));
  const { hub, mk, adv } = rig();
  const a = mk(), b = mk(); a.say({ t: 'hello', name: 'ann' }); b.say({ t: 'hello', name: 'bob' });
  a.say({ t: 'act', k: 'level', v: 5 });
  assert.deepEqual(b.last('act'), { t: 'act', id: a.last('welcome').id, name: 'ann', at: T0, k: 'level', v: 5 });
  assert.equal(a.all('act').length, 1, 'the sender sees it too');
  a.say({ t: 'act', k: 'quest' }); assert.equal(b.all('act').length, 1, 'one action per 3 s');
  for (let i = 0; i < 14; i++) { adv(LIMITS.actEveryMs + 100); a.say({ t: 'act', k: 'trade' }); }
  assert.equal(b.all('act').length, LIMITS.actPerMin, 'at most 10 a minute');
  assert.equal(hub.stats().acts, LIMITS.actPerMin); assert.ok(hub.stats().actsDropped >= 5);
  assert.equal(a.c.closed, null, 'dropped in silence, never a kick');
  adv(59000); a.say({ t: 'act', k: 'boss', v: 'shoal' }); assert.equal(b.last('act').v, 'shoal');
  const x = mk(); x.say({ t: 'hello', name: 'x' }); x.say({ t: 'act', k: 'say', v: 'free text' }); assert.equal(x.last('sys').reason, 'bad_message');
});
