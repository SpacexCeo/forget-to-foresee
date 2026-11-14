// Full multiplayer, the client side (presence v2): shared spiders in the mob brain (the server's place, health,
// state, bites and deaths; our blows sent, a kill reported only with the loot right), our strikes and casts told to
// the room, others' fx and "joined" / "left" lines, the one-shot weight of others' moves, five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
const HOOK = `export async function resolve(s, c, n) { return s === 'virtual:model-list' ? { url: 'data:text/javascript,export const MODEL_FILES={};export const MODEL_DIRS={};', shortCircuit: true } : n(s, c); }
export async function load(u, c, n) { const r = await n(u, c); if (u.includes('/game/src/') && r.source) { const t = String(r.source).replaceAll('import.meta.env', '({ BASE_URL: "/", DEV: false, PROD: true })'); return { ...r, source: t, shortCircuit: true }; } return r; }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);
const { MobBrain, PACKS, MOB_TYPES } = await import('../../src/play/mobs.js');
const { createPresence, COMBAT, CLIP_OF, sampleMob } = await import('../../src/net/presence.js');
const { oneShotWeight } = await import('../../src/play/remote-players.js');
const { actKey } = await import('../../src/ui/chat-panel.js');
const { PLAY_MESSAGES } = await import('../../src/play/i18n.js');

const ORIGIN = [100, 5, -40];
function linkWith(rows) {
  const sent = [], bites = [], loot = new Map();
  return { sent, bites, loot, live: () => true, rows: () => new Map(Object.entries(rows)), hit: (id, src, n) => sent.push([id, src, n]), lootOf: (id) => !!loot.get(id), takeBites: () => bites.splice(0) };
}

test('shared spiders: the server rows place them, our blow goes to the server, a bite hurts, the others think locally', () => {
  const b = new MobBrain({ origin: ORIGIN, seed: 3 });
  const id = 'skitter0_0', other = b.mobs.find((m) => m.type !== 'skitter');
  const rows = { [id]: { x: -10, z: 50, h: 1, hp: 55, state: 'idle' } };
  const link = linkWith(rows); b.share(link);
  const flat = (x, z, y) => 7;
  let ev = b.step(0.1, null, flat);
  const m = b.mobs.find((x) => x.id === id);
  assert.equal(m.shared, true); assert.equal(other.shared, false, 'packs the server does not run stay local');
  assert.deepEqual([m.pos[0], m.pos[1], m.pos[2], m.heading], [ORIGIN[0] - 10, 7, ORIGIN[2] + 50, 1]);
  const evs = []; b.damage(m, 14, evs, { src: 'strike' });
  assert.deepEqual(link.sent, [[id, 'strike', 14]]); assert.equal(m.hp, 41, 'shown at once'); assert.equal(evs[0].kind, 'hit'); assert.equal(evs[0].kill, false);
  b.damage(m, 99, evs, { src: 'super' }); assert.equal(m.hp, 1, 'never killed locally: the server decides');
  rows[id] = { ...rows[id], hp: 30, state: 'windup' };
  for (let i = 0; i < 7; i++) b.step(0.1, null, flat);
  assert.equal(m.hp, 30, 'the server number wins after the prediction window');
  link.bites.push(id); rows[id].state = 'chase';
  ev = b.step(0.1, null, flat);
  assert.ok(ev.some((e) => e.kind === 'impact' && e.hit && e.mob === m), 'a bite from the server');
  assert.ok(ev.some((e) => e.kind === 'impact' && !e.hit), 'the windup ends: the telegraph ring goes');
});

test('shared spiders: death comes from the server; the kill is ours only with the loot right; it comes back where the server says', () => {
  const b = new MobBrain({ origin: ORIGIN, seed: 3 });
  const rows = { skitter0_0: { x: -12, z: 52, h: 0, hp: 0, state: 'dead' }, skitter0_1: { x: -11, z: 52, h: 0, hp: 0, state: 'dead' } };
  const link = linkWith(rows); link.loot.set('skitter0_0', true); b.share(link);
  const ev = b.step(0.1, null, () => 0);
  const [a, c] = ['skitter0_0', 'skitter0_1'].map((id) => b.mobs.find((m) => m.id === id));
  assert.equal(ev.filter((e) => e.kind === 'death').length, 2);
  assert.equal(a.noLoot, false); assert.equal(c.noLoot, true, 'another player won it');
  b.fallen(a, ev); b.fallen(c, ev);
  rows.skitter0_1 = { x: -14, z: 49, h: 2, hp: 55, state: 'idle' };
  const back = b.step(0.1, null, () => 0);
  assert.ok(back.some((e) => e.kind === 'respawn' && e.mob === c)); assert.deepEqual([c.pos[0], c.pos[2], c.hp, c.state, c.noLoot], [ORIGIN[0] - 14, ORIGIN[2] + 49, MOB_TYPES.skitter.hp, 'idle', false]);
  assert.equal(PACKS[0].type, 'skitter');
});

test('shared spiders: without a live link (offline, an older server) every monster is local again', () => {
  const b = new MobBrain({ origin: ORIGIN, seed: 3 });
  const link = linkWith({ skitter0_0: { x: 0, z: 0, h: 0, hp: 55, state: 'idle' } }); link.live = () => false; b.share(link);
  b.step(0.1, null, () => 0);
  assert.ok(b.mobs.every((m) => !m.shared));
  const m = b.mobs[0], evs = []; b.damage(m, 999, evs, {}); assert.equal(m.state, 'dead'); assert.deepEqual(link.sent, []);
});

class FakeWS { constructor() { FakeWS.last = this; this.sent = []; this.readyState = 1; queueMicrotask(() => this.onopen && this.onopen()); } send(s) { this.sent.push(JSON.parse(s)); } close() {} }
const tick = () => new Promise((r) => setTimeout(r, 0));

test('presence v2: caps, spider rows interpolated, bites, deaths with the loot right, fx from others, joined and left lines', async () => {
  let t = 1000;
  const p = createPresence({ url: 'wss://x', name: 'ann', WebSocketImpl: FakeWS, now: () => t });
  await tick();
  const ws = FakeWS.last; assert.equal(ws.sent[0].area, 'town');
  const msg = (o) => ws.onmessage({ data: JSON.stringify(o) });
  msg({ t: 'welcome', id: 7, name: 'ann', room: 1, max: 15, players: [{ id: 8, name: 'bob', skin: 'elise', p: [0, 0, 0], h: 0, a: 'idle' }], caps: ['area', 'fx', 'mobs'], mobs: [['skitter0_0', 1, 2, 0, 55, 0]] });
  assert.equal(p.has('mobs'), true); assert.equal(p.mobs()[0].x, 1);
  t += 100; msg({ t: 'mobs', m: [['skitter0_0', 3, 2, 0, 40, 1]] });
  t += 75; const mid = p.mobs()[0]; assert.ok(mid.x > 1 && mid.x < 3, String(mid.x)); assert.equal(mid.hp, 40); assert.equal(mid.state, 'chase');
  const got = { bite: [], death: [], fx: [] }; for (const k of Object.keys(got)) p.on(k, (e) => got[k].push(e));
  msg({ t: 'bite', mob: 'skitter0_0', dmg: 3 }); msg({ t: 'mdeath', mob: 'skitter0_0', loot: [7] }); msg({ t: 'mdeath', mob: 'skitter0_1', loot: [8] });
  msg({ t: 'fx', id: 8, k: 'lance', p: [1, 2, 3], h: 0.5 }); msg({ t: 'fx', id: 8, k: 'nuke', p: [1, 2, 3], h: 0 }); msg({ t: 'fx', id: 99, k: 'lance', p: [1, 2, 3], h: 0 });
  assert.deepEqual(got.bite, [{ mob: 'skitter0_0', dmg: 3 }]);
  assert.deepEqual(got.death.map((d) => [d.mob, d.mine]), [['skitter0_0', true], ['skitter0_1', false]]);
  assert.equal(got.fx.length, 1, 'only known kinds from players in the room');
  p.hit('skitter0_0', 'strike', 14); p.fx('lance'); p.fx('nuke');
  assert.deepEqual(ws.sent.slice(-2), [{ t: 'hit', mob: 'skitter0_0', k: 'strike', n: 14 }, { t: 'fx', k: 'lance' }]);
  msg({ t: 'join', player: { id: 9, name: 'cat', skin: 'iris', p: [0, 0, 0], h: 0, a: 'idle' } }); msg({ t: 'leave', id: 8 });
  assert.deepEqual(p.chat.filter((c) => c.act).map((c) => [c.k, c.name]), [['joined', 'cat'], ['left', 'bob']]);
  // an older server: no caps, so no hit or fx is ever sent (it would disconnect for an unknown message)
  msg({ t: 'welcome', id: 7, name: 'ann', room: 1, max: 15, players: [] }); const n = ws.sent.length;
  p.hit('skitter0_0', 'strike', 14); p.fx('lance'); assert.equal(ws.sent.length, n);
});

test('our moves map to the relayed animation and effect; the remote clip exists for each; the one-shot weight eases in and out', () => {
  assert.deepEqual(COMBAT.cast_snare, { a: 'cast', fx: 'snare' }); assert.equal(COMBAT.strike_super.a, 'super');
  for (const c of Object.values(COMBAT)) assert.ok(CLIP_OF[c.a], c.a);
  assert.equal(oneShotWeight(0, 1), 0); assert.equal(oneShotWeight(0.04, 1), 0.5); assert.equal(oneShotWeight(0.5, 1), 1); assert.ok(oneShotWeight(0.95, 1) < 0.5); assert.equal(oneShotWeight(1.2, 1), 0);
  assert.deepEqual(sampleMob([{ at: 0, x: 0, z: 0, h: 0 }, { at: 100, x: 10, z: 0, h: 0 }], 50), { x: 5, z: 0, h: 0 });
});

test('joined and left lines: five locales, the name slot kept', () => {
  for (const k of ['joined', 'left']) {
    const key = actKey({ k }); assert.equal(key, 'mp.act.' + k);
    for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) assert.match(PLAY_MESSAGES[lang][key], /\{name\}/, `${lang}:${key}`);
  }
});

test('presence v2: moving to the isles rejoins in a room of that area; the town again on return', async () => {
  const p = createPresence({ url: 'wss://x', name: 'ann', WebSocketImpl: FakeWS, now: () => 0 });
  await tick();
  const first = FakeWS.last; first.onmessage({ data: JSON.stringify({ t: 'welcome', id: 1, name: 'ann', room: 1, max: 15, players: [], caps: ['area', 'fx', 'mobs'] }) });
  let closed = false; first.close = () => { closed = true; first.onclose(); };
  p.setArea('isles'); assert.equal(p.area, 'isles'); assert.equal(closed, true); assert.equal(p.status, 'connecting');
  p.setArea('moon'); assert.equal(p.area, 'isles', 'only known areas');
  p.stop();
});
