// The shared town client: interpolation, send rate, join/leave/chat, mute, offline fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, sample, changed, lerpAngle } from '../../src/net/presence.js';

class FakeWS {
  static last = null;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.last = this; queueMicrotask(() => { this.readyState = 1; this.onopen && this.onopen(); }); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose && this.onclose(); }
  recv(o) { this.onmessage({ data: JSON.stringify(o) }); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('sample: interpolates between snapshots, extrapolates a little past the newest', () => {
  const buf = [{ at: 0, p: [0, 0, 0], h: 0, a: 'walk' }, { at: 100, p: [1, 0, 0], h: 0.2, a: 'walk' }];
  assert.deepEqual(sample(buf, 50).p, [0.5, 0, 0]); assert.ok(Math.abs(sample(buf, 50).speed - 10) < 1e-9);
  assert.deepEqual(sample(buf, 200).p, [2, 0, 0]);
  assert.deepEqual(sample(buf, 10_000).p, [3.5, 0, 0], 'extrapolation stops after 250 ms');
  assert.ok(Math.abs(lerpAngle(3, -3, 0.5) - Math.PI) < 0.01, 'angles blend the short way');
  assert.equal(changed({ p: [0, 0, 0], h: 0, a: 'idle' }, { p: [0.01, 0, 0], h: 0, a: 'idle' }), false);
  assert.equal(changed({ p: [0, 0, 0], h: 0, a: 'idle' }, { p: [0, 0, 0], h: 0, a: 'walk' }), true);
});

test('online: hello, welcome, snapshots, chat, mute, send rate', async () => {
  let t = 1000; const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const mp = createPresence({ url: 'wss://x/presence', name: 'ann', skin: 'elise', WebSocketImpl: FakeWS, now: () => t, storage });
  assert.equal(mp.status, 'connecting'); await tick();
  const ws = FakeWS.last; assert.deepEqual(ws.sent[0], { t: 'hello', v: 1, name: 'ann', skin: 'elise' });
  ws.recv({ t: 'welcome', id: 7, room: 2, max: 15, players: [{ id: 3, name: 'bob', skin: 'iris', p: [0, 0, 0], h: 0, a: 'idle' }] });
  assert.equal(mp.status, 'online'); assert.equal(mp.count, 2); assert.equal(mp.room, 2);
  t += 100; ws.recv({ t: 'snap', s: [[3, 1, 0, 0, 0, 'walk'], [7, 9, 9, 9, 0, 'run']] });
  t += 150; assert.deepEqual(mp.positions()[0].p, [1, 0, 0]);
  mp.update({ p: [5, 0, 5], h: 1, a: 'walk' }); mp.update({ p: [6, 0, 5], h: 1, a: 'walk' });
  assert.equal(ws.sent.filter((m) => m.t === 's').length, 1, 'at most 10 Hz');
  t += 100; mp.update({ p: [5, 0, 5], h: 1, a: 'walk' }); assert.equal(ws.sent.filter((m) => m.t === 's').length, 1, 'unchanged state is not resent');
  mp.say('  hello  '); assert.deepEqual(ws.sent.at(-1), { t: 'chat', text: 'hello' });
  ws.recv({ t: 'chat', id: 3, name: 'bob', text: 'hi', at: 1 }); assert.equal(mp.chat.length, 1);
  mp.mute('bob'); assert.equal(mp.chat.length, 0); ws.recv({ t: 'chat', id: 3, name: 'bob', text: 'again', at: 2 }); assert.equal(mp.chat.length, 0);
  assert.ok(store.get('ftf.mp.muted.v1').includes('bob'));
  ws.recv({ t: 'join', player: { id: 4, name: 'cat', skin: 'iris', p: [0, 0, 0], h: 0, a: 'idle' } }); assert.equal(mp.count, 3);
  ws.recv({ t: 'leave', id: 3 }); assert.equal(mp.count, 2);
  mp.report(4); assert.deepEqual(ws.sent.at(-1), { t: 'report', id: 4 });
  mp.stop(); assert.equal(mp.status, 'offline'); assert.equal(mp.count, 0);
});

test('offline: no URL or no WebSocket means single-player; a kick stops reconnecting', async () => {
  assert.equal(createPresence({ url: '', WebSocketImpl: FakeWS }).status, 'offline');
  assert.equal(createPresence({ url: 'wss://x', WebSocketImpl: null }).status, 'offline');
  const mp = createPresence({ url: 'wss://x', WebSocketImpl: FakeWS }); await tick();
  FakeWS.last.recv({ t: 'sys', key: 'kicked', reason: 'flood' });
  assert.equal(mp.status, 'offline'); assert.equal(mp.sys.reason, 'flood');
  FakeWS.last.close(); assert.equal(mp.status, 'offline');
});

test('drawing: nearest 8 on phones within 70 m; animation names from speed', async () => {
  const { pickDrawn, animFor, REMOTE } = await import('../../src/net/presence.js');
  const list = Array.from({ length: 15 }, (_, i) => ({ id: i, p: [i * 6, 0, 0] }));
  assert.deepEqual(pickDrawn(list, [0, 0, 0], REMOTE.maxDrawnPhone), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(pickDrawn(list, [0, 0, 0], 15).length, 12, 'nobody beyond 70 m');
  assert.equal(animFor(0), 'idle'); assert.equal(animFor(1.5), 'walk'); assert.equal(animFor(3.5), 'run'); assert.equal(animFor(3, false), 'fall');
  const { ANIMS } = await import('../../../presence/lib/hub.js');
  for (const a of ['idle', 'walk', 'run', 'fall']) assert.ok(ANIMS.includes(a), a);
});

test('mp.* strings: five locales, same placeholders', async () => {
  const load = async (l) => (await import(`../../src/play/locales/${l}.js`)).default;
  const en = await load('en'); const keys = Object.keys(en).filter((k) => k.startsWith('mp.'));
  assert.ok(keys.length >= 18);
  const args = (s) => [...new Set([...String(s).matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort().join(',');
  for (const l of ['ru', 'uk', 'it', 'zh']) { const m = await load(l); for (const k of keys) { assert.ok(m[k], `${l} ${k}`); assert.equal(args(m[k]), args(en[k]), `${l} ${k}`); } }
});
