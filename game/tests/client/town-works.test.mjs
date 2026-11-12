// The player's side of the town works (src/net/town-act.js, src/ui/town-works-panel.js): the signed request the relayer
// can verify, honest failures (no endpoint = not available, never a simulated success), the panel's rows and deed
// buttons, the words (pledge, reward share, rate; never invest/APY/profit), five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { generateKeyPair, b58decode } from '../../src/net/near-tx.js';
import { createTownAct, canonicalArgs, actMessage, toMicro, silkOf, readMe, deedActions } from '../../src/net/town-act.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';

const guestStore = async () => {
  const kp = await generateKeyPair();
  const m = new Map([['ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann.guests.ftf-coordinator.testnet' }, playerKey: kp })]]);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
const ME = {
  registered: true, silk: '125500000',
  pools: [{ principal: '1000000000' }, { principal: '0' }, { principal: '2500000' }, { principal: '0' }],
  pulse: { day: 20, paused: false, rate_7d_per_100: ['120000', '0', '50000', '0'], season_id: 's3', season_entrants: 4, purse: '90000000', entry_fee: '40000000' },
  params: { lock_days: [0, 5, 10, 20], lock_mult_bps: [10000, 11500, 13000, 15000], cooldown_days: 2, deed_fee: '500000', min_trade: '1000000' },
  deeds: [
    { token_id: 'deed-s3-1', deed: { asset: 0, principal: '10000000', tier: 1, state: 0, locked_until_day: 25, unbond_ready_day: 0 }, claimable: '300000' },
    { token_id: 'deed-s3-2', deed: { asset: 2, principal: '5000000', tier: 0, state: 1, locked_until_day: 10, unbond_ready_day: 19 }, claimable: '0' },
  ],
  season: { id: 's3', entered: false, entrants: 4, purse: '90000000' },
};

test('town act: amounts, canonical args, deed actions', () => {
  assert.equal(toMicro('10'), '10000000'); assert.equal(toMicro('0.5'), '500000'); assert.equal(toMicro('0'), null); assert.equal(toMicro('-1'), null); assert.equal(toMicro('1e3'), null);
  assert.equal(silkOf('125500000'), '125.50'); assert.equal(silkOf('10000000'), '10');
  assert.deepEqual(Object.keys(canonicalArgs('stake', { tier: 1, asset: 2, amount: '5', extra: 1 })), ['amount', 'asset', 'tier'], 'sorted, only its keys');
  assert.equal(canonicalArgs('stake', { asset: 4, amount: '5', tier: 0 }), null);
  assert.equal(canonicalArgs('transfer', {}), null, 'unknown action');
  assert.equal(actMessage('a.testnet', 'claim', { token_id: 'd' }, 7), 'ftf-town-act|a.testnet|claim|{"token_id":"d"}|7');
  const me = readMe(ME);
  assert.deepEqual(deedActions(me.deeds[0], 20), { claim: true, begin_unbond: false, finish_unbond: false });
  assert.deepEqual(deedActions(me.deeds[0], 25), { claim: true, begin_unbond: true, finish_unbond: false });
  assert.deepEqual(deedActions(me.deeds[1], 20), { claim: false, begin_unbond: false, finish_unbond: true });
});

test('town act: the guest signs the canonical request; the relayer can verify it; failures are honest', async () => {
  const storage = await guestStore();
  let sent = null;
  const fetch = async (url, init) => { sent = { url, init }; return { status: 200, ok: true, json: async () => ({ ok: true, tx_hash: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', result: 'deed-s3-9' }) }; };
  const c = createTownAct({ storage, base: 'https://r.example/', fetch, now: () => 1762960000000 });
  const r = await c.act('stake', { asset: 1, amount: '10000000', tier: 2 });
  assert.equal(r.ok, true); assert.equal(r.result, 'deed-s3-9');
  assert.equal(sent.url, 'https://r.example/api/town/act');
  const b = JSON.parse(sent.init.body);
  assert.equal(b.action, 'stake'); assert.deepEqual(b.args, { amount: '10000000', asset: 1, tier: 2 });
  const key = await crypto.subtle.importKey('raw', b58decode(b.public_key.slice(8)), { name: 'Ed25519' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify('Ed25519', key, b58decode(b.signature), new TextEncoder().encode(actMessage(b.account_id, b.action, b.args, b.at))));
  const no = (status, body) => createTownAct({ storage, base: 'https://r', fetch: async () => ({ status, ok: status < 300, json: async () => body }) });
  assert.deepEqual(await no(404, {}).act('claim', { token_id: 'd' }), { ok: false, reason: 'not_available' }, 'no endpoint: not available');
  assert.equal((await no(400, { error: 'not_enough_silk' }).act('claim', { token_id: 'd' })).reason, 'no_silk');
  assert.equal((await no(502, { error: 'rpc' }).act('claim', { token_id: 'd' })).reason, 'tx_failed');
  assert.equal((await no(404, {}).me()).reason, 'not_available');
  assert.equal((await createTownAct({ storage, base: '', fetch }).act('claim', { token_id: 'd' })).reason, 'not_available');
  assert.equal((await createTownAct({ storage: { getItem: () => null }, base: 'https://r', fetch }).act('claim', { token_id: 'd' })).reason, 'need_guest', 'no guest: nothing sent');
  assert.equal((await createTownAct({ storage, base: 'https://r', fetch: async () => { throw new Error('down'); } }).me()).reason, 'network');
});

test('town works panel: four works with totals and rates, deed buttons by state, a pledge sends stake', async () => {
  const { doc } = installDom();
  const { createTownWorksPanel } = await import('../../src/ui/town-works-panel.js');
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const calls = [];
  const client = { me: async () => ({ ok: true, me: readMe(ME) }), act: async (a, args) => { calls.push([a, args]); return { ok: true, hash: null }; } };
  const p = createTownWorksPanel({ t, client, doc });
  await p.open();
  const text = (s) => doc.querySelectorAll(s).map((e) => e.textContent);
  assert.ok(text('.tw-name').includes('Loom House') && text('.tw-name').includes('Shell Observatory'));
  assert.ok(text('.tw-num').includes('Pledged: 1000 silk'));
  assert.ok(text('.tw-note').some((s) => s.includes('0.12 silk per 100 pledged') && s.includes('can be zero')));
  const btns = () => doc.querySelectorAll('button');
  const byText = (s) => btns().filter((b) => b.textContent === s);
  assert.equal(byText('Pledge').length, 4);
  assert.equal(byText('Claim')[0].disabled, false, 'reward share waiting');
  assert.equal(byText('Begin unbond')[0].disabled, true, 'still locked');
  assert.equal(byText('Finish unbond')[0].disabled, false, 'cooldown over');
  byText('Pledge')[2].click(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls[0], ['stake', { asset: 2, amount: '10000000', tier: 0 }]);
  assert.ok(text('.tw-state')[0].includes('Pledged'));
  p.close(); assert.equal(doc.querySelectorAll('.tw-wrap').length, 0);
  const off = createTownWorksPanel({ t, client: { me: async () => ({ ok: false, reason: 'not_available' }), act: async () => assert.fail('no action without the endpoint') }, doc });
  await off.open();
  assert.equal(byText('Pledge').length, 0, 'no buttons when the relayer has no town endpoint');
  assert.ok(doc.querySelector('.tw').textContent.includes(PLAY_MESSAGES.en['works.err.not_available']));
});

test('works copy: five locales, translated, the agreed words only', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('works.'));
  assert.ok(keys.length >= 50);
  for (const lang of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[lang][k], `${lang}:${k}`);
  const en = keys.map((k) => PLAY_MESSAGES.en[k]).join(' ');
  assert.doesNotMatch(en, /\b(invest\w*|APY|APR|profit|dividend|returns?|yield|interest)\b/i);
  assert.match(PLAY_MESSAGES.en['works.rate'], /variable, can be zero/);
});
