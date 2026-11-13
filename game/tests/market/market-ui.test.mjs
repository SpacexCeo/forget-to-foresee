// The Market window (src/market/market-ui.js; docs/market.md) against a fake client: the Demo chip, the buy confirm,
// errors in plain words, cancel. The rules copy is checked in relayer/tests/p2p.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { createPlayI18n } from '../../src/play/i18n.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const NOW = Date.UTC(2026, 10, 13, 12);
const listing = { id: 'lst_0000abcd', seller: 'maren-1.guests.ftf-coordinator.testnet', sellerKind: 'player', item: 'spider_silk_thread', qtyTotal: 10, qtyLeft: 10, unitPriceC: 320, createdAt: NOW - 12 * 60_000, status: 'active', fills: [] };

function fakeClient() {
  const calls = [];
  return { calls, client: {
    account: () => 'tobias-2.guests.ftf-coordinator.testnet',
    book: async () => ({ ok: true, listings: [listing], referenceUnitC: 300, band: { minC: 150, maxC: 600 }, settlement: 'demo' }),
    mine: async () => ({ ok: true, listings: [{ ...listing, seller: 'tobias-2.guests.ftf-coordinator.testnet', qtyLeft: 6, status: 'partial' }], fills: [], demo: { silkC: 4000, items: { spider_silk_thread: 2 } }, settlement: 'demo' }),
    buy: async (id, qty) => { calls.push(['buy', id, qty]); return { ok: true, fill: { qty, totalC: qty * 320, feeC: 7, txItems: null, txSilk: null }, listing }; },
    list: async (item, qty, unitC) => { calls.push(['list', item, qty, unitC]); return unitC > 600 ? { ok: false, error: 'outside_band', minC: 150, maxC: 600 } : { ok: true, listing }; },
    cancel: async (id) => { calls.push(['cancel', id]); return { ok: true, listing }; },
  } };
}

test('market window: the Demo chip, a confirmed buy, a plain error, cancel', async () => {
  const { doc } = installDom();
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const { createMarketUi } = await import('../../src/market/market-ui.js');
  const { calls, client } = fakeClient();
  const ui = createMarketUi({ t, client, doc, now: () => NOW });
  ui.open('buy'); await tick(); await tick();
  const text = () => doc.body.textContent;
  assert.match(text(), /Demo settlement: recorded by the game server, not yet on the blockchain/);
  assert.match(text(), /Reference price 3 silk each/);
  assert.match(text(), /maren-1Player/); assert.match(text(), /12 min/); assert.match(text(), /32 silk/);
  [...doc.body.querySelectorAll('button')].find((b) => b.textContent === 'Buy' && /mk2-act/.test(b.className)).click(); await tick();
  assert.match(text(), /Buy 1 spider silk thread for 3\.2 silk from maren-1\?/); // always a confirm
  assert.match(text(), /The seller receives 3\.13 silk/);
  [...doc.body.querySelectorAll('button')].find((b) => /^Buy for/.test(b.textContent)).click(); await tick(); await tick(); await tick();
  assert.deepEqual(calls[0], ['buy', 'lst_0000abcd', 1]);
  assert.match(text(), /Bought 1 spider silk thread\./);
  // sell: a price outside the band explains itself
  [...doc.body.querySelectorAll('.mk2-tabs button')][1].click(); await tick(); await tick();
  assert.match(text(), /Allowed 1\.5 to 6 silk each/); assert.match(text(), /you have 2/);
  const [qty, price] = doc.body.querySelectorAll('input'); qty.value = '2'; price.value = '7';
  [...doc.body.querySelectorAll('button')].find((b) => b.textContent === 'List for sale').click(); await tick(); await tick();
  assert.deepEqual(calls[1], ['list', 'spider_silk_thread', 2, 700]);
  assert.match(text(), /outside the fair range \(1\.5 to 6 silk each\)/);
  // my listings: status and cancel
  [...doc.body.querySelectorAll('.mk2-tabs button')][2].click(); await tick(); await tick();
  assert.match(text(), /Partly sold 4\/10/);
  [...doc.body.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click(); await tick(); await tick();
  assert.deepEqual(calls[2], ['cancel', 'lst_0000abcd']);
  ui.close(); assert.equal(ui.isOpen, false);
});

test('market client: list, buy and cancel are signed over their own fields', async () => {
  const { createMarketClient, marketMessage } = await import('../../src/market/market-client.js');
  const { generateKeyPair } = await import('../../src/net/near-tx.js');
  const kp = await generateKeyPair(); const m = new Map();
  m.set('ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann-1.guests.testnet' }, playerKey: { secretKey: kp.secretKey } }));
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  const sent = [];
  const fetch = async (url, init) => { sent.push([url, init && JSON.parse(init.body)]); return { ok: true, json: async () => ({ listing: { id: 'lst_00000001' } }) }; };
  const c = createMarketClient({ storage, base: 'https://r.example', fetch, now: () => 7, rand: () => 0.5 });
  assert.equal((await c.list('chitin_plate', 3, 250)).ok, true);
  assert.equal(sent[0][0], 'https://r.example/api/market/p2p/list'); assert.deepEqual([sent[0][1].item, sent[0][1].qty, sent[0][1].unit_price_c, sent[0][1].at], ['chitin_plate', 3, 250, 7]);
  await c.buy('lst_00000001', 2); assert.match(sent[1][1].request_id, /^m7/);
  assert.equal(marketMessage('a', 'buy', ['lst_1', 2, 'r'], 7), 'ftf-market|a|buy|lst_1,2,r|7');
  assert.deepEqual(await createMarketClient({ storage: { getItem: () => null }, base: 'https://r.example', fetch }).list('ash_ore', 1, 4000), { ok: false, error: 'need_guest' });
});

test('games tab: the legal frame first, once; the allowance; a roll moves play silk only and verifies', async () => {
  const { doc } = installDom();
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const { createMarketUi } = await import('../../src/market/market-ui.js');
  const { createDice } = await import('../../src/market/dice.js');
  const m = new Map(); const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
  let silk = 0; const ledger = { get silk() { return silk; }, grant: ({ silk: s }) => { silk += s; }, spend: ({ silkC }) => (silk >= silkC ? (silk -= silkC, { ok: true }) : { ok: false }) };
  const dice = createDice({ storage, ledger, play: () => silk, wheelId: 'w-ui', now: () => NOW });
  const ui = createMarketUi({ t, client: fakeClient().client, dice, storage, doc, now: () => NOW });
  ui.open('games'); await tick();
  const text = () => doc.body.textContent;
  assert.match(text(), /It has no real value, cannot be bought, and cannot be cashed out or used to open the Gate-Loom/);
  [...doc.body.querySelectorAll('button')].find((b) => b.textContent === 'I understand').click(); await tick();
  assert.equal(silk, 2000); // the one-time play allowance
  assert.match(text(), /Practice network\. No real money\. Entertainment only\./);
  assert.match(text(), /Win 1\.92 play silk with a 50% chance\./);
  assert.match(text(), /Under 10 · ×9\.60/); assert.match(text(), /Your play silk: 20/);
  [...doc.body.querySelectorAll('button')].find((b) => b.textContent === 'Roll').click(); await tick();
  assert.match(text(), /You (win \+0\.92|lose −1) play silk/);
  [...doc.body.querySelectorAll('button')].find((b) => b.textContent === 'Verify').click();
  assert.match(text(), /Checked: the seed gives \d+\./);
  ui.close(); ui.open('games'); await tick();
  assert.doesNotMatch(text(), /I understand/); // shown once
  ui.close();
});
