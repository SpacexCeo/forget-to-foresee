// Batch chest opening in the client (docs/chests.md "Batch opening"): the client asks for N at once, every opening
// settles its own sealed chest the moment the answer arrives, the reveal flips the cards and ends on a summary sorted
// by rarity with each card's verified link; a failure keeps the chests sealed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byRarity, openChestBatch, FLIP_S } from '../../src/play/chest-batch.js';
import { createChestClient } from '../../src/net/chest-client.js';

const TX = '7Xy3tZ9rQd1mVbN4kLpW2sF8hJcGaE5uYoTiRe6wQzx';
const op = (index, kind, rarity, verified = true) => ({ index, outcome: { kind, id: kind === 'item' ? 'x' : null, amount: 3, rarity }, verification: { verified }, tx: TX, nft: null });

function fakeDoc() {
  const mk = (tag) => {
    const e = { tag, children: [], className: '', textContent: '', attrs: {}, style: { setProperty(k, v) { this[k] = v; } }, listeners: {}, parent: null, dataset: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      append(...c) { for (const x of c) { if (typeof x === 'string') continue; x.parent = e; e.children.push(x); } }, replaceChildren(...c) { e.children = []; e.append(...c); },
      setAttribute(k, v) { e.attrs[k] = v; }, addEventListener(k, f) { (e.listeners[k] ||= []).push(f); }, remove() { e.removed = true; }, focus() {},
      closest() { return null; }, click() { for (const f of e.listeners.click || []) f({ target: e }); } };
    return e;
  };
  const doc = { head: mk('head'), body: mk('body'), createElement: mk, getElementById: () => null, documentElement: { dataset: {} }, defaultView: null };
  return doc;
}
const all = (e) => [e, ...e.children.flatMap(all)];
const textOf = (e) => all(e).map((x) => x.textContent).join(' | ');
const t = (k, a) => (a ? `${k}:${JSON.stringify(a)}` : k);
function fakeTimers() { const q = []; return { q, setTimeout(f, ms) { q.push({ f, ms }); return q.length; }, clearTimeout(h) { if (q[h - 1]) q[h - 1].f = () => {}; }, run() { q.sort((a, b) => a.ms - b.ms).forEach((x) => x.f()); } }; }

test('batch: the summary puts the rarest first', () => {
  const s = byRarity([op(1, 'silk', 'common'), op(2, 'nft', 'legendary'), op(3, 'item', 'rare'), op(4, 'xp', 'legendary')]);
  assert.deepEqual(s.map((o) => o.index), [2, 4, 3, 1]);
});

test('batch: the client maps the batch answer and reports the cut', async () => {
  const c = createChestClient({ load: async () => ({ openChests: async ({ count }) => ({ ok: true, batch: true, cut: 'daily_cap', tx_hash: TX,
    openings: [{ ok: true, index: 7, position: 3, outcome: { kind: 'silk', amount: 5, tier: 'common' }, verified: true, check: { leaf_ok: true, proof_ok: true, random_ok: true }, tx_hash: TX }].slice(0, count) }) }) });
  const r = await c.openMany(5);
  assert.equal(r.ok, true); assert.equal(r.cut, 'daily_cap'); assert.equal(r.openings[0].outcome.amount, 5); assert.equal(r.openings[0].verification.verified, true);
  const off = createChestClient({ load: async () => ({ openChests: async () => ({ ok: false, reason: 'daily_cap' }) }) });
  assert.deepEqual(await off.openMany(3), { ok: false, error: 'rate' });
});

test('batch: every opening settles its own chest at once; flips then a summary with verified links; Claim all closes', async () => {
  const doc = fakeDoc(), timers = fakeTimers(), settled = [];
  const chests = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
  const client = { openMany: async (n) => ({ ok: true, openings: [op(10, 'silk', 'common'), op(11, 'item', 'rare'), op(12, 'xp', 'common', false)].slice(0, n), cut: null, batch: true }) };
  const r = openChestBatch({ doc, t, client, chests, count: 3, timers, onSettled: (c, o) => settled.push([c.id, o.index]) });
  await new Promise((res) => setTimeout(res, 0));
  assert.deepEqual(settled, [['c1', 10], ['c2', 11], ['c3', 12]]); // before any animation
  assert.ok(timers.q.some((x) => x.ms === FLIP_S * 1000));
  timers.run();
  const box = doc.body.children[0];
  const links = all(box).filter((e) => e.tag === 'a');
  assert.equal(links.length, 2); // the unverified card says so and links nothing
  assert.ok(links.every((a) => a.href === `https://testnet.nearblocks.io/txns/${TX}` && a.rel.includes('noopener')));
  assert.ok(textOf(box).includes('chest.unverified') && textOf(box).includes('chest.batch.summary:{"n":3}'));
  const claim = all(box).find((e) => e.tag === 'button' && e.textContent === 'chest.batch.claim');
  claim.click();
  const out = await r.result;
  assert.equal(out.ok, true); assert.equal(out.openings.length, 3); assert.equal(box.removed, true);
});

test('batch: a refusal keeps the chests sealed and says why', async () => {
  const doc = fakeDoc(), settled = [];
  const r = openChestBatch({ doc, t, client: { openMany: async () => ({ ok: false, error: 'rate' }) }, chests: [{ id: 'a' }, { id: 'b' }], count: 2, timers: fakeTimers(), onSettled: () => settled.push(1) });
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(settled.length, 0);
  assert.ok(textOf(doc.body).includes('chest.err.rate') && textOf(doc.body).includes('chest.stillSealed'));
  r.close(); assert.equal((await r.result).ok, false);
});
