import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARKET, feeOf, bandOf, checkListing, checkBuy } from '../lib/market-rules.js';
import { createP2P } from '../lib/p2p.js';
import { p2pHandler, marketMessage, validateMarket } from '../api/market/p2p.js';
import { generateKeyPair, importSecretKey, b58encode } from '../lib/near-tx.js';

const NOW = Date.UTC(2026, 10, 13, 12);
const A = 'ann-1.guests.ftf-coordinator.testnet', B = 'bob-2.guests.ftf-coordinator.testnet';
const ref = () => 300; // 3 silk a unit

test('market rules: 2 % fee rounded up, the band, minimum total, limits, self trade, the daily cap', () => {
  assert.equal(feeOf(1280), 26); assert.equal(feeOf(100), 2); assert.equal(feeOf(10), 1); assert.equal(feeOf(0), 0);
  assert.deepEqual(bandOf(300), { minC: 150, maxC: 600 });
  assert.equal(checkListing({ item: 'spider_silk_thread', qty: 10, unitC: 320, refUnitC: 300 }).ok, true);
  assert.equal(checkListing({ item: 'spider_silk_thread', qty: 10, unitC: 601, refUnitC: 300 }).error, 'outside_band');
  assert.equal(checkListing({ item: 'spider_silk_thread', qty: 100, unitC: 300, refUnitC: 300 }).error, 'bad_qty');
  assert.equal(checkListing({ item: 'bread', qty: 1, unitC: 300, refUnitC: 300 }).error, 'not_tradable');
  assert.equal(checkListing({ item: 'spider_silk_thread', qty: 1, unitC: 5, refUnitC: 6 }).error, 'too_small');
  assert.equal(checkListing({ item: 'spider_silk_thread', qty: 1, unitC: 300, refUnitC: 300, active: 10 }).error, 'limit_listings');
  assert.equal(checkListing({ item: 'spider_silk_thread', qty: 5, unitC: 300, refUnitC: 300, held: 4 }).error, 'not_enough_items');
  const l = { seller: A, status: 'active', expiresAt: NOW + 1, qtyLeft: 10, unitPriceC: 320 };
  assert.deepEqual(checkBuy({ listing: l, buyer: B, qty: 4, now: NOW }).fill, { qty: 4, totalC: 1280, feeC: 26, sellerGetsC: 1254 });
  assert.equal(checkBuy({ listing: l, buyer: A, qty: 1, now: NOW }).error, 'self_trade');
  assert.equal(checkBuy({ listing: l, buyer: B, qty: 4, now: NOW, silkC: 100 }).error, 'not_enough_silk');
  assert.equal(checkBuy({ listing: l, buyer: B, qty: 4, now: NOW, spentToday: { buyer: MARKET.dailyCapC - 100, seller: 0 } }).error, 'daily_cap');
  assert.equal(checkBuy({ listing: { ...l, expiresAt: NOW }, buyer: B, qty: 1, now: NOW }).error, 'listing_gone');
});

test('market rules: the relayer copy is byte for byte the game\'s', () => {
  assert.equal(readFileSync(new URL('../lib/market-rules.js', import.meta.url), 'utf8'), readFileSync(new URL('../../game/src/market/market-rules.js', import.meta.url), 'utf8'));
});

const holdings = async (acc) => (acc === A ? { silkC: 1000, items: { spider_silk_thread: 12, chitin_plate: 3 } } : { silkC: 5000, items: {} });
function fakeChain(silkOk = true) {
  const calls = [];
  return { calls, chain: { async transferItems(o) { calls.push(['items', o.from, o.to, o.qty, o.requestHash]); return { ok: true, hash: 'TI' + calls.length }; },
    async tradeSilk(o) { calls.push(['silk', o.buyer, o.seller, o.feeC]); return silkOk ? { ok: true, hash: 'TS' + calls.length } : { ok: false, failure: 'ERR_FUNDS' }; } } };
}

test('p2p: no demo mode: until the contracts are live nothing is listed or bought, and the book says so', async () => {
  const m = createP2P({ refUnitC: ref, holdings, chain: fakeChain().chain, live: async () => false, now: () => NOW });
  assert.deepEqual(await m.list({ account: A, item: 'spider_silk_thread', qty: 1, unitC: 300 }), { status: 503, body: { error: 'market_not_live' } });
  assert.equal(m.book('spider_silk_thread').settlement, 'chain');
});

test('p2p: list checks the real holdings; a buy moves the items, then the silk; both hashes; a repeat answers the same; cancel', async () => {
  let t = NOW; const { calls, chain } = fakeChain();
  const m = createP2P({ refUnitC: ref, holdings, chain, now: () => t });
  assert.equal((await m.list({ account: A, item: 'spider_silk_thread', qty: 13, unitC: 320 })).body.error, 'not_enough_items');
  const l = (await m.list({ account: A, item: 'spider_silk_thread', qty: 10, unitC: 320 })).body.listing;
  assert.equal(l.status, 'active'); assert.equal(l.settlement, 'chain');
  const r = await m.buy({ account: B, listingId: l.id, qty: 4, requestId: 'req-00000001' });
  assert.equal(r.status, 200); assert.deepEqual([r.body.fill.totalC, r.body.fill.feeC, r.body.listing.qtyLeft, r.body.listing.status], [1280, 26, 6, 'partial']);
  assert.deepEqual(calls.map((c) => c.slice(0, 4)), [['items', A, B, 4], ['silk', B, A, 26]]);
  assert.equal(r.body.fill.txItems, 'TI1'); assert.equal(r.body.fill.txSilk, 'TS2'); assert.match(calls[0][4], /^[0-9a-f]{64}$/);
  const again = await m.buy({ account: B, listingId: l.id, qty: 4, requestId: 'req-00000001' });
  assert.equal(again.body.repeated, true); assert.equal(calls.length, 2);
  assert.equal((await m.cancel({ account: B, listingId: l.id })).status, 404); // not the seller
  assert.equal((await m.cancel({ account: A, listingId: l.id })).body.listing.status, 'cancelled');
  assert.equal(m.stats().today, 1); assert.equal(m.stats().lastTrades[0].buyer, B);
});

test('p2p: two buyers of the last items get one winner; an expired listing leaves the book', async () => {
  let t = NOW; const m = createP2P({ refUnitC: ref, holdings, chain: fakeChain().chain, now: () => t });
  const l = (await m.list({ account: A, item: 'chitin_plate', qty: 3, unitC: 300 })).body.listing;
  const [x, y] = await Promise.all([m.buy({ account: B, listingId: l.id, qty: 3, requestId: 'req-bbbbbbb1' }), m.buy({ account: 'cy-3.guests.ftf-coordinator.testnet', listingId: l.id, qty: 3, requestId: 'req-ccccccc1' })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  const l2 = (await m.list({ account: A, item: 'spider_silk_thread', qty: 2, unitC: 300 })).body.listing;
  t += MARKET.durationMs;
  assert.equal(m.book('spider_silk_thread').listings.length, 0);
  assert.equal((await m.mine(A)).listings.find((q) => q.id === l2.id).status, 'expired');
});

test('p2p: a failed silk call moves the items back with a valid request hash and records no fill', async () => {
  const { calls, chain } = fakeChain(false);
  const m = createP2P({ refUnitC: ref, holdings, chain, now: () => NOW });
  const l = (await m.list({ account: A, item: 'spider_silk_thread', qty: 5, unitC: 300 })).body.listing;
  const bad = await m.buy({ account: B, listingId: l.id, qty: 2, requestId: 'req-chain002' });
  assert.equal(bad.status, 402); assert.equal(bad.body.compensated, true);
  assert.deepEqual(calls.map((c) => c.slice(0, 3)), [['items', A, B], ['silk', B, A], ['items', B, A]]);
  assert.match(calls[2][4], /^[0-9a-f]{64}$/); assert.notEqual(calls[2][4], calls[0][4]); // the contract takes hex only, each hash once
  assert.equal(m.book('spider_silk_thread').listings[0].qtyLeft, 5);
});

test('p2p endpoint: signed requests only, each used once; GET book shows the band and the settlement', async () => {
  const kp = await generateKeyPair(); const key = await importSecretKey(kp.secretKey);
  const client = { async rpc(m, p) { if (p.account_id !== A) throw new Error('UNKNOWN'); return {}; } };
  const p2p = createP2P({ refUnitC: ref, holdings, chain: fakeChain().chain, now: () => NOW });
  const h = p2pHandler({ env: {}, client, p2p, now: () => NOW });
  const call = async (method, url, body) => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } }; await h({ method, headers: {}, url, body }, res); return res; };
  const sign = async (action, args) => b58encode(await key.sign(new TextEncoder().encode(marketMessage(A, action, args, NOW))));
  const body = { account_id: A, public_key: key.publicKey, at: NOW, item: 'spider_silk_thread', qty: 3, unit_price_c: 310 };
  body.signature = await sign('list', ['spider_silk_thread', 3, 310]);
  const r = await call('POST', '/api/market/p2p/list', body);
  assert.equal(r.statusCode, 200); assert.match(r.body.listing.id, /^lst_[0-9a-f]{8}$/);
  assert.equal((await call('POST', '/api/market/p2p/list', body)).statusCode, 409); // replayed
  assert.equal((await call('POST', '/api/market/p2p/list', { ...body, qty: 4 })).statusCode, 401); // the signature covers qty
  const book = await call('GET', '/api/market/p2p/book?item=spider_silk_thread');
  assert.deepEqual([book.body.listings.length, book.body.band.minC, book.body.band.maxC, book.body.settlement, book.body.live], [1, 150, 600, 'chain', true]);
  assert.equal((await call('GET', '/api/market/p2p/book?item=bread')).statusCode, 400);
  assert.equal(validateMarket('buy', { ...body, listing_id: 'x', request_id: 'req-12345678' }, NOW).error, 'bad_args');
});
