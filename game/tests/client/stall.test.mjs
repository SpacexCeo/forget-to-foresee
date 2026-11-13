// The monster-resource stalls, the game side (net/stall-client.js): the stall map is the relayer catalog's, a quote is
// checked, the call the player signs passes the desk's own check (relayer lib/resource-desk.js checkCall), the desk's
// dry run never lets the player sign, and only a settled answer with a hash reads as Verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STALLS, readQuote, canTrade, playerCall, readSettle, createStallClient, silkText } from '../../src/net/stall-client.js';
import { STALL_KEEPERS } from '../../src/scenes/town-flow.js';
import { RESOURCES } from '../../../relayer/market/catalog.js';
import { checkCall } from '../../../relayer/lib/resource-desk.js';
import { RESOURCE_IDS } from '../../src/game/resources.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const TOWN = 'ftf-town.testnet', ITEMS = 'items.ftf-town.testnet', STALL = 'trader-09.ftf-town.testnet'; // the sweeper's wallet: not this stall's
const q = (side, extra = {}) => ({ ok: true, side, item: 'spider_silk_thread', qty: 2, unit: 15, silk: 6000000, reason: 'shelf is full', stock: 20, stall: STALL, town: TOWN, items: ITEMS, reference: side === 'buy' ? 'buy:spider_silk_thread:2' : null, dry_run: false, ...extra });
const HASH = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

test('stalls: the map is the relayer catalog (who keeps which resource) and covers every resource id', () => {
  const fromCatalog = {};
  for (const r of RESOURCES) (fromCatalog[r.maker] ||= []).push(r.id);
  assert.deepEqual(Object.fromEntries(Object.entries(STALLS).map(([k, v]) => [k, [...v]])), fromCatalog);
  assert.deepEqual(Object.values(STALLS).flat().sort(), [...RESOURCE_IDS].sort());
  for (const k of STALL_KEEPERS) assert.ok(STALLS[k], k + ' keeps a stall');
});

test('stalls: a quote is checked (item, side, qty, accounts, the buy reference)', () => {
  const ok = readQuote(q('buy'), { side: 'buy', item: 'spider_silk_thread', qty: 2 });
  assert.equal(ok.ok, true); assert.equal(ok.silk, '6000000'); assert.equal(silkText(ok.silk), '6.00');
  assert.equal(readQuote(q('buy', { reference: 'buy:veil_dust:2' }), { side: 'buy', item: 'spider_silk_thread', qty: 2 }).ok, false);
  assert.equal(readQuote(q('buy', { qty: 3 }), { side: 'buy', item: 'spider_silk_thread', qty: 2 }).ok, false);
  assert.equal(readQuote({ ok: false, reason: 'only 1 spider silk thread on the shelf', stock: 1 }, { side: 'buy', item: 'spider_silk_thread', qty: 2 }).reason, 'only 1 spider silk thread on the shelf');
  assert.equal(readQuote(null, { side: 'buy', item: 'x', qty: 1 }).error, 'offline');
});

test('stalls: the call the player signs passes the desk\'s own check, for buy and sell', () => {
  for (const side of ['buy', 'sell']) {
    const qq = readQuote(q(side), { side, item: 'spider_silk_thread', qty: 2 });
    const c = playerCall(qq);
    const call = { signer: 'ann.guests.testnet', receiver: c.receiverId, method: c.methodName, args: c.args };
    assert.equal(checkCall(call, { side, item: 'spider_silk_thread', qty: 2, account: 'ann.guests.testnet', town: TOWN, items: ITEMS, quoteSilk: 6000000 }), side === 'buy' ? 'wrong_stall' : 'wrong_transfer',
      'the desk derives the stall itself: with a made-up stall account the check refuses');
    const real = RESOURCES.find((r) => r.id === 'spider_silk_thread');
    const stall = `trader-${String(['guard', 'shardkeeper', 'scribe', 'innkeeper', 'baker', 'shrinekeeper', 'elder', 'musician', 'sweeper', 'lamplighter', 'courier', 'child_a', 'child_b', 'iris', 'salt', 'ash', 'moss', 'amber', 'frost', 'tinker'].indexOf(real.maker) + 1).padStart(2, '0')}.${TOWN}`;
    const c2 = playerCall(readQuote(q(side, { stall }), { side, item: 'spider_silk_thread', qty: 2 }));
    assert.equal(checkCall({ signer: 'ann.guests.testnet', receiver: c2.receiverId, method: c2.methodName, args: c2.args }, { side, item: 'spider_silk_thread', qty: 2, account: 'ann.guests.testnet', town: TOWN, items: ITEMS, quoteSilk: 6000000 }), null, side);
    assert.equal(c2.deposit, side === 'sell' ? 1n : 0n, 'mt_transfer needs 1 yoctoNEAR');
  }
});

test('stalls: the desk in dry run never lets the player sign; no guest, no deal', async () => {
  const dry = readQuote(q('buy', { dry_run: true }), { side: 'buy', item: 'spider_silk_thread', qty: 2 });
  assert.deepEqual(canTrade(dry, { accountId: 'a' }), { ok: false, why: 'dry_run' });
  assert.deepEqual(canTrade(readQuote(q('buy'), { side: 'buy', item: 'spider_silk_thread', qty: 2 }), null), { ok: false, why: 'no_guest' });
  let signed = 0;
  const store = new Map([['ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann.guests.testnet' }, playerKey: { secretKey: 'x' } })]]);
  const c = createStallClient({ base: 'https://r', storage: { getItem: (k) => store.get(k) ?? null }, signer: async () => { signed++; return {}; }, client: { call: async () => { signed++; return { ok: true, hash: HASH }; } } });
  assert.deepEqual(await c.trade(dry), { state: 'error', error: 'dry_run' });
  assert.equal(signed, 0, 'nothing signed in dry run');
});

test('stalls: Verified only for a settled answer with a hash', () => {
  assert.equal(readSettle(200, { settled: true, tx_hash: HASH }, HASH).url, 'https://testnet.nearblocks.io/txns/' + HASH);
  const dry = readSettle(200, { settled: false, dry_run: true }, HASH);
  assert.deepEqual([dry.state, dry.settled, dry.url], ['done', false, null]);
  assert.equal(readSettle(200, { settled: true }, HASH).state, 'error', 'settled without a hash is not verified');
  assert.equal(readSettle(422, { error: 'wrong_stall' }, HASH).error, 'wrong_stall');
});

test('stalls: every stall.* key in five locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('stall.'));
  assert.ok(keys.length >= 29);
  for (const lang of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[lang][k], `${lang}:${k}`);
});

test('stalls: an account not yet in the town is never sent to fail on chain; the panel offers the one-tap set-up (live bug 13.11)', async () => {
  const store = new Map([['ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann.guests.testnet' }, playerKey: { secretKey: 'x' } })]]);
  const buy = readQuote(q('buy'), { side: 'buy', item: 'spider_silk_thread', qty: 2 });
  let calls = 0, registered = false;
  const client = { view: async (c, m) => (m === 'balance_of' ? (registered ? { silk: '5000000' } : null) : null), call: async () => { calls++; return { ok: false, failure: 'Smart contract panicked: ERR_UNKNOWN_ACCOUNT: the account is not registered in the town', hash: HASH }; } };
  const c = createStallClient({ base: 'https://r', storage: { getItem: (k) => store.get(k) ?? null }, signer: async () => ({}), client });
  assert.deepEqual(await c.trade(buy), { state: 'error', error: 'not_registered' });
  assert.equal(calls, 0, 'nothing signed for an account not in the town');
  registered = true; // the view says yes but the chain still refuses: mapped to the same plain next step
  assert.equal((await c.trade(buy)).error, 'not_registered');
  // the panel: the plain line and the Set it up button, which runs the relayer set-up (the silk Sync)
  const { installDom } = await import('../lib/mini-dom.mjs');
  const { doc } = installDom();
  const { createPlayI18n } = await import('../../src/play/i18n.js');
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const { installSilkModel, computeSilkView } = await import('../../src/net/silk-core.js');
  let synced = 0;
  installSilkModel({ view: () => computeSilkView({}), subscribe: () => () => {}, syncNow: async () => { synced++; return { ok: true }; }, refresh: async () => {} });
  const { createStallPanel } = await import('../../src/ui/stall-panel.js');
  const panel = createStallPanel({ t, doc, client: { guest: () => ({ accountId: 'ann.guests.testnet' }), quote: async (side, item, qty) => readQuote(q(side), { side, item, qty }), trade: async () => ({ state: 'error', error: 'not_registered' }) } });
  panel.open('shrinekeeper'); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  const buyBtn = [...doc.body.querySelectorAll('button')].find((b) => b.textContent === t('stall.buy'));
  buyBtn.disabled = false; buyBtn.click(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  assert.match(doc.body.textContent, /Your town account isn't set up yet\./);
  const setup = [...doc.body.querySelectorAll('button')].find((b) => b.textContent === 'Set it up (free, one tap)');
  assert.ok(setup); setup.click(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  assert.equal(synced, 1); assert.match(doc.body.textContent, /Your town account is set up\. Try again\./);
  installSilkModel(null); panel.close();
});
