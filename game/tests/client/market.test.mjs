// The town market in the game (docs/market.md): the stats parser, explorer links, localized trade lines, the ticker
// (hidden without a market, count + label + links, new trades reported once) and the stall scene's visits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStats, txUrl, tradeLine, fetchMarket } from '../../src/net/market.js';
import { createMarketTicker } from '../../src/ui/market-ticker.js';
import { createMarketScene, VISIT } from '../../src/play/market-scene.js';
import { createPlayI18n } from '../../src/play/i18n.js';
import { ITEMS, TRADERS } from '../../../relayer/market/catalog.js';

const HASH = '7Xy3tZ9rQd1mVbN4kLpW2sF8hJcGaE5uYoTiRe6wQzx';
const row = (o = {}) => ({ at: 1, buyer: 'guard', seller: 'baker', item: 'bread', qty: 3, price: 4, hash: HASH, ...o });

function fakeDoc() {
  const mk = (tag) => {
    const e = { tag, children: [], className: '', textContent: '', hidden: false, attrs: {}, style: {}, listeners: {}, parent: null,
      append(...c) { for (const x of c) { x.parent = e; e.children.push(x); } }, replaceChildren(...c) { e.children = []; e.append(...c); },
      setAttribute(k, v) { e.attrs[k] = v; }, addEventListener(k, f) { e.listeners[k] = f; }, remove() { e.removed = true; } };
    return e;
  };
  return { head: mk('head'), body: mk('body'), createElement: mk, getElementById: () => null, visibilityState: 'visible' };
}
const all = (e) => [e, ...e.children.flatMap(all)];
const textOf = (e) => all(e).map((x) => x.textContent).join(' ');

test('market: stats are normalised, bad rows dropped, explorer links only for real hashes', () => {
  const s = normalizeStats({ enabled: true, today: 1234, recent: [row(), row({ buyer: '<img>' }), row({ hash: 'nope' }), row({ qty: 1.5 })] });
  assert.equal(s.live, true); assert.equal(s.today, 1234); assert.equal(s.recent.length, 2);
  assert.equal(s.recent[0].url, `https://testnet.nearblocks.io/txns/${HASH}`); assert.equal(s.recent[1].url, null);
  assert.equal(normalizeStats({ enabled: false, chain: { today: 9 } }).today, 9);
  assert.deepEqual(normalizeStats(null), { live: false, today: null, recent: [] });
  assert.equal(txUrl('javascript:alert(1)'), null);
});

test('market: every trader and good has a name in every language, and lines read naturally', () => {
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const i = createPlayI18n(loc, { onMissing: (k) => assert.fail(`${loc} misses ${k}`) });
    for (const k of TRADERS) assert.ok(i.t('mk.t.' + k));
    for (const it of ITEMS) assert.ok(i.t('mk.i.' + it.id));
    assert.ok(i.t('mk.today', { n: 21 }).includes('21'));
  }
  const en = createPlayI18n('en');
  assert.equal(tradeLine((k, a) => en.t(k, a), row()), 'the guard bought 3 × bread from the baker for 4');
  assert.equal(tradeLine((k, a) => en.t(k, a), row({ silk: 1_234_000 })), 'the guard bought 3 × bread from the baker for 1.23');
  const ru = createPlayI18n('ru');
  assert.equal(ru.t('mk.today', { n: 5 }), '5 сделок сегодня');
});

test('market: fetchMarket reads the relayer and fails quietly', async () => {
  assert.equal(await fetchMarket({ base: '' }), null);
  const ok = await fetchMarket({ base: 'https://r.example', fetch: async (u) => { assert.equal(u, 'https://r.example/api/market/stats'); return { ok: true, json: async () => ({ enabled: true, today: 3, recent: [row()] }) }; } });
  assert.equal(ok.today, 3);
  assert.equal(await fetchMarket({ base: 'https://r.example', fetch: async () => { throw new Error('down'); } }), null);
});

test('market ticker: hidden without a market; shows the count, the honest label and links; reports new trades once', async () => {
  const en = createPlayI18n('en'), t = (k, a) => en.t(k, a), doc = fakeDoc();
  let answer = null; const seen = [];
  const timers = { setTimeout: () => 1, clearTimeout: () => {} };
  const tk = createMarketTicker({ doc, t, line: (r) => tradeLine(t, r), poll: async () => answer, onTrade: (r) => seen.push(r.hash), timers });
  tk.show(true); await tk.refresh();
  assert.equal(tk.el.hidden, true);
  answer = normalizeStats({ enabled: true, today: 20_001, recent: [row()] });
  await tk.refresh();
  assert.equal(tk.el.hidden, false);
  const txt = textOf(tk.el);
  assert.ok(txt.includes('Town market · 20,001 trades today') || txt.includes('Town market · 20001 trades today'), txt);
  assert.ok(txt.includes('Scripted townsfolk · automated trades on NEAR testnet'));
  assert.ok(all(tk.el).some((e) => e.tag === 'a' && e.href === `https://testnet.nearblocks.io/txns/${HASH}` && e.rel === 'noopener'));
  assert.deepEqual(seen, []); // the first answer is history, not news
  const h2 = '8Xy3tZ9rQd1mVbN4kLpW2sF8hJcGaE5uYoTiRe6wQzx';
  answer = normalizeStats({ enabled: true, today: 20_002, recent: [row({ hash: h2 }), row()] });
  await tk.refresh(); await tk.refresh();
  assert.deepEqual(seen, [h2]);
  tk.show(false); assert.equal(tk.el.hidden, true);
});

test('market scene: by day a townsperson buyer visits the stalls (two at most, hired ones never), then goes home', () => {
  const sent = [];
  const people = new Map(['guard', 'baker', 'scribe', 'elder', 'courier'].map((k) => [k, { def: { key: k, height: 1.7 }, state: 'loaded', root: { visible: true }, plan: { x: 0, y: 0, z: 0 } }]));
  const tf = { byKey: people, sendToTrade: (k, on) => sent.push([k, on]) };
  let time = 0, day = true;
  const camera = { matrixWorldInverse: { elements: new Array(16).fill(0) }, projectionMatrix: { elements: new Array(16).fill(0) } };
  const sc = createMarketScene({ camera, doc: fakeDoc(), t: (k) => k, folk: () => tf, folkPos: () => [0, 0, 0], hired: () => ['scribe'], isDay: () => day, now: () => time });
  sc.onTrade(row({ buyer: 'guard' })); sc.onTrade(row({ buyer: 'scribe' })); sc.onTrade(row({ buyer: 'elder' })); sc.onTrade(row({ buyer: 'courier' }));
  assert.deepEqual(sc.visits(), ['guard', 'elder']);
  time = VISIT.seconds + 1; sc.update([100, 0, 100]);
  assert.deepEqual(sc.visits(), []);
  assert.deepEqual(sent, [['guard', true], ['elder', true], ['guard', false], ['elder', false]]);
  day = false; sc.onTrade(row({ buyer: 'courier' }));
  assert.deepEqual(sc.visits(), []);
  sc.dispose();
});
