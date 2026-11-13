// The room's memory and the action feed, the client side: the history a join brings (shown in the panel with its time,
// never as bubbles), live lines and actions, the whitelist and pacing of our own actions, the friends' mark, and the
// watcher that notices a level, a chest, a boss, a quest and a trade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { createPresence, ACTS, ACT_EVERY_MS, ACT_QUEUE, CHAT_KEEP } from '../../src/net/presence.js';
import { chatFeed, SELF } from '../../src/play/chat-bubbles.js';
import { watchFeats, FEAT_EVENT } from '../../src/play/feats.js';
import { createFriends } from '../../src/play/friends.js';
import { createPlayI18n } from '../../src/play/i18n.js';
import { ACT_KINDS } from '../../../presence/lib/history.js';

class FakeWS {
  static last = null; static made = 0;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.last = this; FakeWS.made++; queueMicrotask(() => { this.readyState = 1; if (this.onopen) this.onopen(); }); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  recv(o) { this.onmessage({ data: JSON.stringify(o) }); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const T = 1_763_000_000_000; // a server clock value (epoch ms)
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

async function online(o = {}) {
  let t = 1000; const changes = [];
  const mp = createPresence({ url: 'wss://x/presence', name: 'ann', account: 'ann.testnet', WebSocketImpl: FakeWS, now: () => t, storage: memory(), onChange: () => changes.push(1), ...o });
  await tick(); const ws = FakeWS.last;
  ws.recv({ t: 'welcome', id: 7, name: 'ann', room: 1, max: 15, players: [{ id: 3, name: 'bob', skin: 'iris', p: [0, 0, 0], h: 0, a: 'idle' }] });
  return { mp, ws, changes, adv: (ms) => { t += ms; } };
}
const HIST = { t: 'hist',
  chat: [{ name: 'bob', text: 'anyone here?', at: T + 10 }, { name: 'ann', account: 'ann.testnet', text: 'me, yesterday', at: T + 30 }, { name: 'cat', account: 'cat.testnet', text: 'later', at: T + 50 }],
  acts: [{ name: 'cat', account: 'cat.testnet', k: 'chest', v: 'rare', at: T + 20 }, { name: 'bob', k: 'level', v: 4, at: T + 40 }, { name: 'eve', k: 'shout', v: 'free text', at: T + 45 }] };

test('the client and the server share one action whitelist', () => {
  assert.deepEqual(Object.keys(ACTS).sort(), Object.keys(ACT_KINDS).sort());
  const samples = [null, 1, 2, 7, 99, 100, '7', 'common', 'rare', 'legendary', 'golden', 'crownrift', 'shoal', 'free text', {}, 2.5];
  for (const k of Object.keys(ACTS)) for (const v of samples) assert.equal(ACTS[k](v), ACT_KINDS[k](v), `${k} ${JSON.stringify(v)}`);
});

test('history on join: one list, oldest first by the server clock, marked old; unknown kinds dropped; own lines found', async () => {
  const { mp, ws } = await online();
  ws.recv(HIST);
  assert.deepEqual(mp.chat.map((m) => [m.act ? m.k : m.text, m.name, m.old, m.mine]), [
    ['anyone here?', 'bob', true, false], ['chest', 'cat', true, false], ['me, yesterday', 'ann', true, true], ['level', 'bob', true, false], ['later', 'cat', true, false]]);
  assert.equal(mp.chat[1].v, 'rare'); assert.equal(mp.chat[1].account, 'cat.testnet'); assert.equal(mp.chat[0].at, T + 10);
  // live lines follow the history and are not old
  ws.recv({ t: 'chat', id: 3, name: 'bob', text: 'hi', at: T + 60 }); ws.recv({ t: 'act', id: 3, name: 'bob', k: 'boss', v: 'shoal', at: T + 70 });
  ws.recv({ t: 'act', id: 3, name: 'bob', k: 'say', v: 'not on the list', at: T + 71 }); ws.recv({ t: 'act', id: 7, name: 'ann', account: 'ann.testnet', k: 'quest', at: T + 72 });
  assert.deepEqual(mp.chat.slice(5).map((m) => [m.act ? m.k : m.text, !!m.old, m.mine]), [['hi', false, false], ['boss', false, false], ['quest', false, true]]);
  // a reconnect brings the room's memory again: it replaces what we held, nothing doubles
  ws.recv({ t: 'welcome', id: 9, name: 'ann', room: 1, max: 15, players: [] }); ws.recv(HIST);
  assert.equal(mp.chat.length, 5);
  ws.recv({ t: 'hist' }); assert.equal(mp.chat.length, 0, 'a bare hist is an empty room');
});

test('history: a muted name stays out; the list is capped', async () => {
  const { mp, ws } = await online();
  mp.mute('bob'); ws.recv(HIST);
  assert.deepEqual([...new Set(mp.chat.map((m) => m.name))].sort(), ['ann', 'cat']);
  ws.recv({ t: 'act', id: 3, name: 'bob', k: 'trade', at: T + 80 }); assert.ok(!mp.chat.some((m) => m.name === 'bob'));
  for (let i = 0; i < CHAT_KEEP + 20; i++) ws.recv({ t: 'chat', id: 4, name: 'cat', text: 'line ' + i, at: T + 100 + i });
  assert.equal(mp.chat.length, CHAT_KEEP); assert.equal(mp.chat.at(-1).text, 'line ' + (CHAT_KEEP + 19));
});

test('only live speech becomes a bubble: neither the history nor the action feed', async () => {
  const { mp, ws } = await online();
  const feed = chatFeed();
  assert.deepEqual(feed(mp.chat), []);
  ws.recv(HIST); assert.deepEqual(feed(mp.chat), [], 'history that arrives after the first frame still pops nothing');
  ws.recv({ t: 'act', id: 3, name: 'bob', k: 'chest', v: 'common', at: T + 60 }); assert.deepEqual(feed(mp.chat), []);
  ws.recv({ t: 'chat', id: 3, name: 'bob', text: 'hello', at: T + 61 }); ws.recv({ t: 'chat', id: 7, name: 'ann', text: 'hey', at: T + 62 });
  assert.deepEqual(feed(mp.chat), [{ key: 3, text: 'hello' }, { key: SELF, text: 'hey' }]);
  ws.recv({ t: 'welcome', id: 7, name: 'ann', room: 1, max: 15, players: [] }); ws.recv({ ...HIST, chat: [...HIST.chat, { name: 'bob', text: 'hello', at: T + 61 }] });
  assert.deepEqual(feed(mp.chat), [], 'the same lines coming back as history after a reconnect do not pop again');
});

test('our actions: whitelisted, compact, at most one per 3.2 s with a short queue', async () => {
  const { mp, ws, adv } = await online();
  const acts = () => ws.sent.filter((m) => m.t === 'act');
  assert.equal(mp.act('level', 5), false, 'a server that sent no history is an older one: it would disconnect us for an act');
  ws.recv({ t: 'hist', chat: [], acts: [] });
  assert.equal(mp.act('level', 5), true); assert.deepEqual(acts(), [{ t: 'act', k: 'level', v: 5 }]);
  assert.equal(mp.act('say', 'free text'), false); assert.equal(mp.act('chest', 'golden'), false); assert.equal(mp.act('quest', 'q_boss'), false); assert.equal(mp.act('level', 1), false);
  assert.equal(mp.act('quest'), true); assert.equal(mp.act('chest', 'rare'), true); assert.equal(acts().length, 1, 'the next ones wait');
  adv(ACT_EVERY_MS); mp.update({ p: [0, 0, 0], h: 0, a: 'idle' }); assert.deepEqual(acts().at(-1), { t: 'act', k: 'quest' });
  adv(1000); mp.update({ p: [0, 0, 0], h: 0, a: 'idle' }); assert.equal(acts().length, 2);
  adv(ACT_EVERY_MS); mp.update({ p: [0, 0, 0], h: 0, a: 'idle' }); assert.deepEqual(acts().at(-1), { t: 'act', k: 'chest', v: 'rare' });
  for (let i = 0; i < ACT_QUEUE + 3; i++) mp.act('trade');
  for (let i = 0; i < 20; i++) { adv(ACT_EVERY_MS); mp.update({ p: [0, 0, 0], h: 0, a: 'idle' }); }
  assert.equal(acts().filter((m) => m.k === 'trade').length, ACT_QUEUE, 'a burst beyond the queue is dropped');
  mp.stop(); assert.equal(mp.act('quest'), false, 'offline: nothing is sent or queued');
});

test('an idle kick is not final: the player joins again when she is back in town', async () => {
  const { mp, ws } = await online();
  const made = FakeWS.made;
  ws.recv({ t: 'sys', key: 'kicked', reason: 'idle' }); ws.close();
  assert.equal(mp.status, 'offline'); assert.equal(FakeWS.made, made, 'no reconnect while she is away');
  mp.update({ p: [0, 0, 0], h: 0, a: 'idle' }); assert.equal(FakeWS.made, made + 1); assert.equal(mp.status, 'connecting'); await tick();
  FakeWS.last.recv({ t: 'welcome', id: 12, name: 'ann', room: 1, max: 15, players: [] }); assert.equal(mp.status, 'online');
  FakeWS.last.recv({ t: 'sys', key: 'kicked', reason: 'flood' }); FakeWS.last.close();
  mp.update({ p: [0, 0, 0], h: 0, a: 'idle' }); assert.equal(FakeWS.made, made + 1, 'any other kick still ends it');
});

test('the watcher: a level gained, a chest opened, the Crownrift felled, and ftf:feat events, each once', () => {
  const got = []; const act = (k, v) => got.push([k, v]);
  let level = 3; const lsubs = new Set(); const ledger = { get level() { return { level, into: 0 }; }, subscribe(f) { lsubs.add(f); return () => lsubs.delete(f); } };
  const opened = [{ id: 'c0', tier: 'common' }]; const csubs = new Set(); const chests = { opened: () => opened.slice(), subscribe(f) { csubs.add(f); return () => csubs.delete(f); } };
  const win = { ls: {}, addEventListener(t, f) { (this.ls[t] ||= []).push(f); }, removeEventListener(t, f) { this.ls[t] = (this.ls[t] || []).filter((x) => x !== f); }, fire(t, detail) { for (const f of this.ls[t] || []) f({ detail }); } };
  const stop = watchFeats({ act, ledger, chests, win });
  for (const f of lsubs) f(); assert.deepEqual(got, [], 'silk moved, the level did not');
  level = 5; for (const f of lsubs) f(); for (const f of lsubs) f(); assert.deepEqual(got, [['level', 5]]);
  for (const f of csubs) f(); assert.equal(got.length, 1, 'the chest opened before we watched is not news');
  opened.push({ id: 'c1', tier: 'legendary' }); for (const f of csubs) f(); for (const f of csubs) f(); assert.deepEqual(got.at(-1), ['chest', 'legendary']); assert.equal(got.length, 2);
  win.fire('ftf:mob-killed', { type: 'skitter', pos: [0, 0, 0] }); assert.equal(got.length, 2);
  win.fire('ftf:mob-killed', { type: 'crownrift' }); assert.deepEqual(got.at(-1), ['boss', 'crownrift']);
  win.fire(FEAT_EVENT, { k: 'quest' }); win.fire(FEAT_EVENT, { k: 'boss', v: 'shoal' }); win.fire(FEAT_EVENT, { k: 'trade' }); win.fire(FEAT_EVENT, null);
  assert.deepEqual(got.slice(3), [['quest', null], ['boss', 'shoal'], ['trade', null]]);
  stop(); level = 9; for (const f of lsubs) f(); win.fire(FEAT_EVENT, { k: 'quest' }); assert.equal(got.length, 6, 'stopped');
  assert.equal(lsubs.size + csubs.size, 0);
});

test('the panel: remembered and live lines with their time, actions as grey system lines, friends marked', async () => {
  const { doc } = installDom();
  doc.getElementById = () => null; doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  const { createChatPanel, actKey, clockOf } = await import('../../src/ui/chat-panel.js');
  assert.equal(clockOf(new Date(2026, 10, 13, 9, 5).getTime()), '09:05'); assert.equal(clockOf(12), ''); assert.equal(clockOf(undefined), '');
  assert.equal(actKey({ k: 'chest', v: 'common' }), 'mp.act.chest'); assert.equal(actKey({ k: 'chest', v: 'legendary' }), 'mp.act.chest.legendary'); assert.equal(actKey({ k: 'dance' }), null);

  const storage = memory(); const friends = createFriends({ storage, me: 'ann.testnet' }); friends.add({ name: 'cat', account: 'cat.testnet' });
  const { mp, ws } = await online();
  ws.recv(HIST); ws.recv({ t: 'chat', id: 3, name: 'bob', text: '<b>hi</b>', at: T + 60 }); ws.recv({ t: 'act', id: 7, name: 'ann', account: 'ann.testnet', k: 'boss', v: 'crownrift', at: T + 70 });
  const reported = []; mp.report = (id) => reported.push(id);
  for (const locale of ['en', 'ru']) {
    const i18n = createPlayI18n(locale);
    const panel = createChatPanel({ doc, t: (k, a) => i18n.t(k, a), presence: mp, isFriend: (m) => friends.has(m) });
    panel.el.querySelector('.ftf-chat-chip').dispatchEvent({ type: 'click', stopPropagation() {}, preventDefault() {} });
    const rows = panel.el.querySelectorAll('li');
    assert.equal(rows.length, 7);
    const text = rows.map((li) => li.textContent);
    assert.ok(rows.every((li) => /^\d\d:\d\d/.test(li.textContent)), 'every line carries its time');
    assert.ok(text[0].endsWith('bob: anyone here?')); assert.ok(text[5].endsWith('bob: <b>hi</b>'), 'chat text is text, never markup');
    assert.ok(text[1].endsWith(locale === 'en' ? 'cat opened a rare chest' : 'cat открывает редкий сундук'), text[1]);
    assert.ok(text[3].endsWith(locale === 'en' ? 'bob reached level 4' : 'bob достигает уровня 4'), text[3]);
    assert.ok(text[6].endsWith(locale === 'en' ? 'ann defeated the Crownrift' : 'ann побеждает Короноразлом'), text[6]);
    const cls = rows.map((li) => li.className.split(/\s+/).filter(Boolean).sort().join(' '));
    assert.deepEqual(cls, ['', 'act friend sys', '', 'act sys', 'friend', '', 'act sys'], 'actions are system lines; cat is a friend, our own lines are never marked');
    // a remembered line can be muted, not reported (its speaker's session is over); a live one can be both
    rows[0].querySelector('button').dispatchEvent({ type: 'click', stopPropagation() {}, preventDefault() {} });
    assert.equal(panel.el.querySelectorAll('.ftf-chat-menu button').length, 2);
    rows[5].querySelector('button').dispatchEvent({ type: 'click', stopPropagation() {}, preventDefault() {} });
    const menu = panel.el.querySelectorAll('.ftf-chat-menu button'); assert.equal(menu.length, 3);
    menu[1].dispatchEvent({ type: 'click', stopPropagation() {}, preventDefault() {} }); assert.equal(reported.pop(), 3);
    panel.destroy();
  }
});

test('mp.act.* strings: every kind in five locales, each with the name', async () => {
  const load = async (l) => (await import(`../../src/play/locales/${l}.js`)).default;
  const { actKey } = await import('../../src/ui/chat-panel.js');
  const keys = [{ k: 'level', v: 5 }, { k: 'quest' }, { k: 'trade' }, { k: 'chest', v: 'common' }, { k: 'chest', v: 'rare' }, { k: 'chest', v: 'legendary' }, { k: 'boss', v: 'crownrift' }, { k: 'boss', v: 'shoal' }].map(actKey);
  assert.ok(keys.every(Boolean)); assert.equal(new Set(keys).size, 8);
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) { const m = await load(l); for (const k of keys) { assert.ok(m[k] && m[k].includes('{name}'), `${l} ${k}`); assert.equal(m[k].includes('{n}'), k === 'mp.act.level', `${l} ${k}`); } }
});
