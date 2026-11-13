// The Town Ledger (src/net/town-ledger.js, src/ui/town-ledger.js; flag townLedger): the relayer's stats are narrowed to a
// safe shape, the trader's reason words become translated "why this price" lines, every trader maps to its own testnet
// account (the same order as the relayer's catalog), and the window shows live trades with explorer links, a trader
// card and the clans' NEAR AI Cloud strategy, in English and Russian. The game menu shows the Town tab only with the flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { normalizeLedger, parseReason, reasonText, traderAccount, clanAccount, traderCard, progressOf, agoOf, silkOf, unitSilk, txUrl, TRADERS, BASE } from '../../src/net/town-ledger.js';
import { TRADERS as RELAYER_TRADERS, CATALOG, traderAccount as relayerAccount, CLAN_WALLETS } from '../../../relayer/market/catalog.js';
import { reasonFor } from '../../../relayer/market/prices.js';
import { MESSAGES } from '../../src/ui/i18n/index.js';
import { createPlayI18n } from '../../src/play/i18n.js';

const HASH = '46Vif97ZPAWdFDfe1rJvxGBRkoJovjiEJKXxNq1gy7QB';
const STATS = {
  enabled: true, paused: false, contract: 'ftf-town.testnet', target: 24000, traders: 20, today: 18493, failures_today: 1082,
  recent: [
    { at: 1_000_000, buyer: 'amber', seller: 'shardkeeper', item: 'shard_dust', qty: 2, price: 8, silk: 3200000, reason: 'cheap: few buyers', stock: 183, hash: HASH },
    { at: 990_000, buyer: 'elder', seller: 'innkeeper', item: 'stew', qty: 2, price: 5, silk: 2000000, reason: 'fair price', stock: 97, hash: 'not a hash' },
    { at: 1, buyer: '<img src=x>', seller: 'baker', item: 'bread', qty: 1, price: 4, hash: HASH },
    { at: 1, buyer: 'guard', seller: 'baker', item: 'bread', qty: 0, price: 4 },
  ],
  stalls: [{ item: 'shard_dust', kind: 'good', maker: 'shardkeeper', stock: 183, price: 8, closed: false }, { item: 'bread', maker: 'baker', stock: 3, price: 9, closed: true }],
  balances: { shardkeeper: '2837711840', amber: 'lots' },
  strategy: { decisions_today: 21, llm_today: 21, clans: [{ clan: 'amber', at: 5, source: 'llm', model: 'Qwen/Qwen3-VL-30B-A3B-Instruct', chat_id: 'chatcmpl-c95a8f5f-97a9', verified: true,
    params: { risk: 1.2, buy: 'staples', favour: 'baker', reason: 'low silk, high demand for staples' } }, { clan: 'BAD!', source: 'llm' }] },
};

test('town ledger: the traders and base prices match the relayer catalog, account by account', () => {
  assert.deepEqual([...TRADERS], [...RELAYER_TRADERS]);
  for (const k of TRADERS) assert.equal(traderAccount(k), relayerAccount(k), k);
  for (const c of CLAN_WALLETS) assert.equal(clanAccount(c), `clan-${c}.ftf-town.testnet`);
  assert.equal(traderAccount('nobody'), null);
  assert.equal(clanAccount('guard'), null);
  for (const it of CATALOG) assert.equal(BASE[it.id], it.base, it.id);
  assert.equal(Object.keys(BASE).length, CATALOG.length);
});

test('town ledger: the stats are narrowed to a safe shape (bad rows, keys and hashes dropped)', () => {
  const d = normalizeLedger(STATS);
  assert.equal(d.live, true); assert.equal(d.today, 18493); assert.equal(d.target, 24000); assert.equal(d.failures, 1082);
  assert.equal(d.recent.length, 2, 'the markup buyer and the zero-quantity row are gone');
  assert.equal(d.recent[0].url, 'https://testnet.nearblocks.io/txns/' + HASH);
  assert.equal(d.recent[1].hash, null); assert.equal(d.recent[1].url, null);
  assert.equal(d.recent[0].base, 15);
  assert.deepEqual(Object.keys(d.balances), ['shardkeeper']);
  assert.equal(d.strategy.clans.length, 1);
  assert.equal(d.strategy.clans[0].favour, 'baker'); assert.equal(d.strategy.clans[0].verified, true);
  assert.equal(normalizeLedger(null), null); assert.equal(normalizeLedger([1]), null);
  assert.equal(normalizeLedger({ enabled: true, killed: true }).live, false);
  assert.equal(progressOf(d), 18493 / 24000);
  assert.equal(txUrl('x'), null);
});

test('town ledger: every reason the price rules can give parses, and translates', () => {
  const en = MESSAGES.en, ru = MESSAGES.ru;
  const tr = (msgs) => (k, a = {}) => String(msgs[k]).replace(/\{(\w+)\}/g, (_, n) => a[n]);
  const cases = [[50, 10, 0.5], [120, 80, 1], [230, 200, 1.6], [10, 200, 2], [200, 10, 0.6], [30, 80, 1.2]];
  for (const [stock, demand, factor] of cases) {
    const words = reasonFor('river_stones', stock, demand, factor);
    const p = parseReason(words);
    assert.ok(p.mood, words);
    assert.ok(!reasonText(tr(en), words).includes('{'), words);
    assert.notEqual(reasonText(tr(ru), words), words, 'Russian is not the raw words: ' + words);
  }
  assert.deepEqual(parseReason('dear: only 3 iron ore left, demand rose'), { mood: 'dear', parts: [{ k: 'left', n: 3 }, { k: 'demand' }], raw: 'dear: only 3 iron ore left, demand rose' });
  assert.equal(parseReason('buys at 60 % of its price (fair price)').mood, null, 'buy-back lines stay as they are');
  assert.equal(reasonText(tr(en), 'cheap: few buyers'), 'cheap: few buyers');
  assert.equal(reasonText(tr(ru), 'cheap: few buyers'), 'дёшево: мало покупателей');
});

test('town ledger: silk and time helpers', () => {
  assert.equal(silkOf(3200000), '3.2'); assert.equal(silkOf('2837711840'), '2837.71');
  assert.equal(unitSilk(4), '0.8'); assert.equal(unitSilk(15), '3');
  assert.deepEqual(agoOf(1000, 13_000), { k: 's', n: 12 }); assert.deepEqual(agoOf(0, 185_000), { k: 'm', n: 3 }); assert.deepEqual(agoOf(0, 7_300_000), { k: 'h', n: 2 });
});

test('town ledger: a trader card carries the own account, purse, stall, trades and strategy', () => {
  const d = normalizeLedger(STATS);
  const c = traderCard(d, 'shardkeeper');
  assert.equal(c.account, 'trader-02.ftf-town.testnet'); assert.equal(c.clanAccount, null);
  assert.equal(c.silk, '2837.71'); assert.equal(c.sells.length, 1); assert.equal(c.trades.length, 1);
  const a = traderCard(d, 'amber');
  assert.equal(a.account, 'trader-18.ftf-town.testnet'); assert.equal(a.clanAccount, 'clan-amber.ftf-town.testnet');
  assert.equal(a.strategy.buy, 'staples');
  assert.equal(traderCard(d, 'nobody'), null);
});

async function mount(locale) {
  const { doc } = installDom();
  const i18n = createPlayI18n(locale, { onMissing: (k) => { throw new Error('missing ' + k); } });
  const t = (k, a) => i18n.t(k, a);
  const { mountTownLedger } = await import('../../src/ui/town-ledger.js');
  const timers = { setTimeout: () => 1, clearTimeout: () => {} };
  const v = mountTownLedger({ doc, t, poll: async () => normalizeLedger(STATS), now: () => 1_012_000, timers, base: '/forget-to-foresee/' });
  doc.body.append(v.root);
  await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  return { doc, v };
}

test('town ledger window: count vs target, live trades with reasons and explorer links, the AI strategy, links out', async () => {
  const { v } = await mount('en');
  const text = v.root.textContent;
  assert.ok(text.includes((18493).toLocaleString()), 'today');
  assert.ok(text.includes('77 % of the daily target of ' + (24000).toLocaleString()), text.slice(0, 200));
  assert.ok(text.includes('12 s ago'));
  assert.ok(text.includes('Why this price: cheap: few buyers'));
  assert.ok(text.includes('1.6 silk each (base 3)'));
  assert.ok(text.includes('Qwen/Qwen3-VL-30B-A3B-Instruct'));
  assert.ok(text.includes('low silk, high demand for staples'));
  const hrefs = v.root.querySelectorAll('a').map((a) => a.href);
  assert.ok(hrefs.includes('https://testnet.nearblocks.io/txns/' + HASH));
  assert.ok(hrefs.includes('https://testnet.nearblocks.io/address/ftf-town.testnet'));
  assert.ok(hrefs.includes('/forget-to-foresee/economy-lab.html'));
  assert.ok(hrefs.includes('/forget-to-foresee/pulse.html'));
  for (const a of v.root.querySelectorAll('a')) assert.equal(a.target, '_blank');
  // a name opens the trader card with its own account
  const btn = v.root.querySelectorAll('button').find((b) => b.dataset.trader === 'shardkeeper');
  btn.click();
  assert.equal(v.state().card, 'shardkeeper');
  const card = v.root.textContent;
  assert.ok(card.includes('trader-02.ftf-town.testnet'));
  assert.ok(v.root.querySelectorAll('a').some((a) => a.href === 'https://testnet.nearblocks.io/address/trader-02.ftf-town.testnet'));
  assert.ok(card.includes((2838).toLocaleString() + ' silk in the purse'), card);
  assert.ok(card.includes('1.6 silk (base 3) · 183 on the shelf'), 'the stall price with its base');
  v.root.querySelectorAll('button').find((b) => b.className === 'tl-back').click();
  assert.equal(v.state().card, null);
  v.destroy();
});

test('town ledger window: Russian renders every line, an offline relayer says so', async () => {
  const { v } = await mount('ru');
  assert.ok(v.root.textContent.includes('Почему такая цена: дёшево: мало покупателей'));
  v.destroy();
  const { doc } = installDom();
  const { mountTownLedger } = await import('../../src/ui/town-ledger.js');
  const i18n = createPlayI18n('en'); const off = mountTownLedger({ doc, t: (k, a) => i18n.t(k, a), poll: async () => null, timers: { setTimeout: () => 1, clearTimeout: () => {} } });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(off.root.textContent.includes('did not answer'));
  off.destroy();
});

test('game menu: the Town tab only with the flag, second after Profile', async () => {
  const { doc } = installDom();
  const { openGameMenu } = await import('../../src/play/game-menu.js');
  const { createTownLedger } = await import('../../src/game/town-economy.js');
  const { memoryStorage } = await import('../../src/ui/storage.js');
  const storage = memoryStorage();
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const tabs = (m) => m.root.querySelectorAll('button').filter((b) => b.dataset.tab).map((b) => b.dataset.tab);
  const off = openGameMenu({ doc, t, ledger: createTownLedger({ storage }), storage, manifest: Promise.resolve([]), onChain: Promise.resolve({ state: 'loaded', items: [] }) });
  assert.ok(!tabs(off).includes('town')); off.close();
  const on = openGameMenu({ doc, t, ledger: createTownLedger({ storage }), storage, manifest: Promise.resolve([]), onChain: Promise.resolve({ state: 'loaded', items: [] }), townLedger: true, tab: 'town' });
  assert.deepEqual(tabs(on).slice(0, 2), ['profile', 'town']);
  assert.equal(on.tab, 'town');
  on.close();
});

test('market pill: the "Open the Town Ledger" button appears only while the flag answers an opener', async () => {
  const { doc } = installDom();
  doc.getElementById ||= () => null;
  const { createMarketTicker } = await import('../../src/ui/market-ticker.js');
  const { normalizeStats, tradeLine } = await import('../../src/net/market.js');
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  let flag = false; const opened = [];
  const tk = createMarketTicker({ doc, t, line: (r) => tradeLine(t, r), poll: async () => normalizeStats({ enabled: true, today: 5, recent: [] }),
    onLedger: () => (flag ? () => opened.push('town') : null), timers: { setTimeout: () => 1, clearTimeout: () => {} } });
  tk.show(true); await tk.refresh();
  assert.ok(!tk.el.querySelectorAll('button').some((b) => b.className === 'more'));
  flag = true; await tk.refresh();
  const more = tk.el.querySelectorAll('button').find((b) => b.className === 'more');
  assert.ok(more && !more.hidden && more.textContent.startsWith('Open the Town Ledger'));
  more.click(); assert.deepEqual(opened, ['town']);
  flag = false; await tk.refresh(); assert.equal(more.hidden, true);
  tk.destroy();
});
