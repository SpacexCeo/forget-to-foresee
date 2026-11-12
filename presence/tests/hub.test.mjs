// The hub without sockets: rooms of 15, clamping, chat filters and limits, kicks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, filterChat, cleanName, validate, LIMITS } from '../lib/hub.js';

function rig() {
  let t = 1_000_000; const now = () => t; const hub = createHub({ now });
  const mk = () => { const c = { out: [], closed: null, buf: 0, send(s) { this.out.push(JSON.parse(s)); }, close(code) { this.closed = code; }, buffered() { return this.buf; } }; const conn = hub.connect(c); return { c, conn, say: (o) => conn.onText(JSON.stringify(o)), last: (type) => [...c.out].reverse().find((m) => m.t === type) }; };
  return { hub, mk, adv: (ms) => { t += ms; } };
}

test('rooms hold 15; the 16th player opens room 2; leaving frees the seat', () => {
  const { hub, mk } = rig();
  const ps = Array.from({ length: 16 }, (_, i) => { const p = mk(); p.say({ t: 'hello', name: 'P' + i, skin: 'elise' }); return p; });
  assert.equal(ps[14].last('welcome').room, 1); assert.equal(ps[15].last('welcome').room, 2);
  assert.equal(ps[14].last('welcome').players.length, 14);
  assert.equal(hub.stats().players, 16); assert.deepEqual(hub.stats().byRoom, { 1: 15, 2: 1 });
  ps[0].conn.onClose();
  assert.equal(ps[1].last('leave').id, ps[0].last('welcome').id);
  const late = mk(); late.say({ t: 'hello', name: 'late' }); assert.equal(late.last('welcome').room, 1);
});

test('state relay at the tick, clamped to bounds and speed; a rare snap is allowed', () => {
  const { hub, mk, adv } = rig();
  const a = mk(), b = mk(); a.say({ t: 'hello', name: 'a' }); b.say({ t: 'hello', name: 'b' });
  a.say({ t: 's', p: [0, 0, 0], h: 1, a: 'walk' }); hub.tick();
  assert.deepEqual(b.last('snap').s[0].slice(1), [0, 0, 0, 1, 'walk']);
  adv(100); a.say({ t: 's', p: [50, 0, 0], h: 1, a: 'run' }); hub.tick();   // first jump: a snap (respawn) is accepted
  assert.equal(b.last('snap').s[0][1], 50);
  adv(100); a.say({ t: 's', p: [90, 0, 0], h: 1, a: 'run' }); hub.tick();   // second within 3 s: clamped to 8 m/s
  assert.ok(Math.abs(b.last('snap').s[0][1] - 51.3) < 0.01, String(b.last('snap').s[0][1]));
  adv(4000); a.say({ t: 's', p: [9999, 0, 0], h: 1, a: 'run' }); hub.tick();
  assert.equal(b.last('snap').s[0][1], LIMITS.bounds.x[1]);
  const n = b.c.out.length; hub.tick(); assert.equal(b.c.out.length, n, 'no snapshot when nobody moved');
});

test('chat: filtered, rate-limited, muted after spam; URLs dropped; reports mute', () => {
  const { mk, adv } = rig();
  const a = mk(), b = mk(), c = mk(), d = mk();
  for (const [p, n] of [[a, 'ann'], [b, 'bob'], [c, 'cat'], [d, 'dan']]) p.say({ t: 'hello', name: n });
  a.say({ t: 'chat', text: '  hello   there ' }); assert.equal(b.last('chat').text, 'hello there');
  a.say({ t: 'chat', text: 'again' }); assert.equal(a.last('sys').key, 'slow_down');
  adv(2100); a.say({ t: 'chat', text: 'join www.scam.xyz now' }); assert.equal(a.last('sys').key, 'filtered');
  adv(2100); a.say({ t: 'chat', text: 'what the fuck' }); assert.equal(b.last('chat').text, 'what the f***');
  for (let i = 0; i < 4; i++) a.say({ t: 'chat', text: 'spam' + i });
  assert.equal(a.last('sys').key, 'muted');
  adv(2100); const before = b.c.out.filter((m) => m.t === 'chat').length; a.say({ t: 'chat', text: 'hi' });
  assert.equal(b.c.out.filter((m) => m.t === 'chat').length, before);
  const bid = b.last('welcome').id;
  for (const p of [a, c, d]) p.say({ t: 'report', id: bid });
  adv(2100); b.say({ t: 'chat', text: 'hi all' }); assert.equal(b.last('sys').key, 'muted');
});

test('kicks: bad message, hello first, flood, slow client, idle', () => {
  const { hub, mk, adv } = rig();
  const x = mk(); x.conn.onText('not json'); assert.equal(x.c.closed, 4000);
  const y = mk(); y.say({ t: 's', p: [0, 0, 0], h: 0 }); assert.equal(y.last('sys').reason, 'hello_first');
  const f = mk(); f.say({ t: 'hello' }); for (let i = 0; i < 40; i++) f.say({ t: 'ping' }); assert.equal(f.last('sys').reason, 'flood');
  const s = mk(), o = mk(); s.say({ t: 'hello' }); o.say({ t: 'hello' }); s.c.buf = 1e6; o.say({ t: 's', p: [1, 0, 1], h: 0 }); hub.tick(); assert.equal(s.c.closed, 1008);
  const i = mk(); i.say({ t: 'hello' }); adv(61000); hub.tick(); assert.equal(i.last('sys').reason, 'idle');
});

test('names, validation, filter edge cases', () => {
  assert.equal(cleanName('Ann Lee!', 7), 'annlee'); assert.equal(cleanName('', 7), 'guest7'); assert.equal(cleanName('bitchqueen', 3), 'guest3');
  const { mk } = rig(); const a = mk(), b = mk(); a.say({ t: 'hello', name: 'ann' }); b.say({ t: 'hello', name: 'ann' });
  assert.equal(b.last('welcome').players[0].name, 'ann'); assert.equal(a.last('join').player.name, 'ann2');
  assert.equal(validate({ t: 's', p: [0, NaN, 0], h: 0 }), null); assert.equal(validate({ t: 'nope' }), null); assert.equal(validate([1]), null);
  assert.equal(validate({ t: 's', p: [0, 0, 0], h: 0, a: '<script>' }).a, 'idle');
  assert.equal(filterChat('x'.repeat(141)), null); assert.equal(filterChat('‮ evil'), 'evil'); assert.equal(filterChat('t.me/x'), null);
});
