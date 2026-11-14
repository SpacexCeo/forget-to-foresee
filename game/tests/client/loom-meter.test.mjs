// The Loom meter (owner 14.11, "the town's shared hungry object"; ui/loom-meter-core.js, ui/loom-meter.js, net/loom-stats.js):
// silk fed to the Gate-Loom today from the relayer's gate log, the chain's all-time counters when the relayer is silent
// (never called "today"), who is in the valley (real players only), the Loom flares when anyone pays, receipts on the
// explorer, five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from '../lib/mini-dom.mjs';
import { loomView, hunger, freshGates, chipParts, shortSilk, agoOf, receiptHref, shortName, HALF_FED_SILK } from '../../src/ui/loom-meter-core.js';
import { fetchLoomStats } from '../../src/net/loom-stats.js';

const TX = '7Nb3dCbdbFzQWW1Mvhx8Lr9uKMSPuZZkqBpKV5ktMbvZ', M = 1_000_000;
const DAY = { today: { gates: 2, burned: String(400 * M) }, total: { gates: 41, burned: String(8200 * M) }, recent: [{ at: 1000, account: 'ann.ftf-guests.testnet', tx: TX }, { at: 500, account: 'bob.testnet', tx: 'bad hash!' }], gate_price: String(200 * M) };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the view: today from the gate log, the chain total as a fallback, bad receipts dropped, nothing invented', () => {
  const v = loomView(DAY);
  assert.deepEqual(v.today, { gates: 2, silk: 400 }); assert.deepEqual(v.total, { gates: 41, silk: 8200 });
  assert.deepEqual(v.recent.map((r) => r.href), ['https://testnet.nearblocks.io/txns/' + TX]);
  const c = loomView({ gates_paid: 41, gate_burned: String(8200 * M) });
  assert.equal(c.today, null, 'the chain knows no day: never shown as today'); assert.equal(c.source, 'chain');
  assert.equal(loomView(null), null); assert.equal(loomView({}), null); assert.equal(loomView({ today: { gates: 'x' } }), null);
  assert.equal(receiptHref('a b'), null); assert.equal(shortName('ann.ftf-guests.testnet'), 'ann');
});

test('hunger grows with the day and is half at HALF_FED_SILK; a new gate is counted once, never on the first look', () => {
  assert.equal(hunger(null), 0); assert.equal(hunger(loomView({ total: { gates: 3, burned: '600000000' } })), 0, 'no day: no glow claimed');
  assert.ok(Math.abs(hunger({ today: { silk: HALF_FED_SILK } }) - 0.5) < 1e-9);
  assert.ok(hunger({ today: { silk: 2000 } }) > hunger({ today: { silk: 200 } }));
  const a = loomView(DAY), b = loomView({ ...DAY, today: { gates: 3, burned: String(600 * M) }, recent: [{ at: 2000, account: 'cat.testnet', tx: 'NEWTX1' }, ...DAY.recent] });
  assert.equal(freshGates(null, a), 0); assert.equal(freshGates(a, a), 0); assert.equal(freshGates(a, b), 1);
  const c1 = loomView({ gates_paid: 4, gate_burned: '1' }), c2 = loomView({ gates_paid: 6, gate_burned: '1' });
  assert.equal(freshGates(c1, c2), 2, 'by the counters when there are no receipts');
});

test('the chip parts follow each flag; numbers are short; time is relative', () => {
  const v = loomView(DAY);
  assert.deepEqual(chipParts(v, 7), { loom: { key: 'loom.today', args: { silk: '400' } }, valley: { key: 'loom.valley', args: { n: 7 } } });
  assert.equal(chipParts(v, 7, { loomMeter: false, presenceChip: true }).loom, null);
  assert.equal(chipParts(v, 0).valley, null, 'offline: no count');
  assert.equal(chipParts(loomView({ ...DAY, today: { gates: 0, burned: '0' } }), 1).loom.key, 'loom.hungry');
  assert.equal(chipParts(loomView({ gates_paid: 41, gate_burned: String(8200 * M) }), 1).loom.key, 'loom.total');
  assert.equal(shortSilk(1234.4), '1,234'); assert.equal(shortSilk(12_500), '12.5k');
  assert.deepEqual(agoOf(0, 30_000), { key: 'loom.ago.now', args: {} }); assert.deepEqual(agoOf(0, 5 * 60_000), { key: 'loom.ago.min', args: { n: 5 } }); assert.equal(agoOf(0, 3 * 3600_000).key, 'loom.ago.h');
});

test('fetch: the relayer first, the chain pulse when it fails, null when both are silent', async () => {
  const ok = { ok: true, json: async () => DAY }, seen = [];
  assert.deepEqual(await fetchLoomStats({ base: 'https://r.x/', fetch: async (u) => { seen.push(u); return ok; }, chain: async () => assert.fail('no chain read') }), DAY);
  assert.equal(seen[0], 'https://r.x/api/town/gate?stats=1');
  const pulse = { gates_paid: 1, gate_burned: '1' };
  assert.deepEqual(await fetchLoomStats({ base: 'https://r.x', fetch: async () => { throw new Error('down'); }, chain: async () => pulse }), pulse);
  assert.equal(await fetchLoomStats({ base: '', fetch: null, chain: async () => { throw new Error('rpc'); } }), null);
});

test('the chip: today and the valley, the receipts open, the Loom flares once for anyone paying, five locales', async () => {
  const { doc } = installDom();
  const { createLoomMeter } = await import('../../src/ui/loom-meter.js');
  const timers = { setTimeout: () => 0, clearTimeout: () => {} };
  let stats = DAY; const room = []; const flares = [], fed = [];
  const listeners = {}; const win = { addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => {} };
  const t = (k, a) => k + (a ? JSON.stringify(a) : '');
  const m = createLoomMeter({ doc, t, poll: async () => stats, count: () => 3, acts: () => room, onFed: (k) => flares.push(k), onHunger: (k) => fed.push(k), timers, win, now: () => 61_000 });
  m.show(true); await tick(); await tick();
  const root = doc.querySelector('.ftf-loom');
  assert.equal(root.hidden, false);
  assert.match(root.textContent, /loom\.today\{"silk":"400"\}/); assert.match(root.textContent, /loom\.valley\{"n":3\}/);
  assert.equal(flares.length, 0, 'nothing flares on the first look'); assert.ok(Math.abs(fed[0] - 0.5) < 1e-9, '400 silk today: half fed');
  root.querySelector('button').click();
  const link = root.querySelector('a'); assert.equal(link.href, 'https://testnet.nearblocks.io/txns/' + TX); assert.equal(link.rel, 'noopener noreferrer');
  assert.match(root.querySelector('li').textContent, /loom\.fed\{"name":"ann"\}/);
  stats = { ...DAY, today: { gates: 3, burned: String(600 * M) }, recent: [{ at: 60_000, account: 'bob.testnet', tx: 'NEWTX2' }, ...DAY.recent] };
  room.push({ act: true, k: 'gate', name: 'bob', at: 5, mine: false }); m.update(); await tick(); await tick();
  assert.ok(flares.length >= 1, 'another player paid: the Loom flares'); assert.ok(root.className.includes('fed'));
  const n = flares.length; m.update(); await tick();
  assert.equal(flares.length, n, 'the same act never flares twice');
  listeners['ftf:gate-paid']({ detail: { tx: 'X' } }); assert.equal(flares.length, n + 1, 'our own payment flares at once');
  m.destroy(); assert.equal(doc.querySelector('.ftf-loom'), null);
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const L = (await import(`../../src/locales/${loc}.js`)).default;
    for (const k of ['loom.today', 'loom.hungry', 'loom.total', 'loom.valley', 'loom.label', 'loom.fed', 'loom.receipt', 'loom.none', 'loom.noLog', 'loom.ago.now', 'loom.ago.min', 'loom.ago.h']) assert.ok(L[k], `${loc} ${k}`);
  }
});

test('the Gate-Loom glows with the day and settles after a flare; paying it tells the town', () => {
  const portal = readFileSync(new URL('../../src/scenes/town-portal.js', import.meta.url), 'utf8');
  assert.match(portal, /setFed\(k\) \{ fed = Math\.min\(1, Math\.max\(0, Number\(k\) \|\| 0\)\); \}/);
  assert.match(portal, /glow\.intensity \+= \(want - glow\.intensity\) \* Math\.min\(1, dt \* 1\.5\)/, 'a flare settles back');
  const quests = readFileSync(new URL('../../src/scenes/town-quests.js', import.meta.url), 'utf8');
  assert.match(quests, /new CustomEvent\('ftf:gate-paid'/); assert.match(quests, /new CustomEvent\('ftf:feat', \{ detail: \{ k: 'gate' \} \}\)/);
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /featureFlags\.on\('loomMeter'\) \|\| featureFlags\.on\('presenceChip'\)/);
  assert.match(boot, /mp\.presence\.status === 'online'/, 'the valley counts real players, never the demo bots');
});
