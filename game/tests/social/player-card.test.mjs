// The other-player card (src/play/player-card.js) and the friends list (src/play/friends.js): honest labels, the
// actions, the list saved for this account, and how it closes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { createPlayI18n } from '../../src/play/i18n.js';
import { createFriends } from '../../src/play/friends.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const buttons = (doc) => [...doc.body.querySelectorAll('button')];
const click = (doc, label) => buttons(doc).find((b) => b.textContent === label).click();

test('friends: added once, saved per account, removed', () => {
  const s = mem();
  const a = createFriends({ storage: s, me: 'ann.testnet', now: () => 5 });
  assert.equal(a.add({ name: 'Bob', account: 'bob.testnet' }), true); assert.equal(a.add({ name: 'Bob', account: 'bob.testnet' }), false);
  assert.equal(a.has({ account: 'bob.testnet' }), true);
  assert.equal(createFriends({ storage: s, me: 'cat.testnet' }).list().length, 0); // another account's list is its own
  assert.equal(a.remove({ account: 'bob.testnet' }), true); assert.equal(a.list().length, 0);
});

test('the demo player\'s card says it is scripted; its trade is a practice trade on this device; add friend', async () => {
  const { doc } = installDom();
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const { createPlayerCard, PRACTICE_KEY } = await import('../../src/play/player-card.js');
  const storage = mem(); let read = 0;
  const card = createPlayerCard({ t, storage, me: 'ann.testnet', doc, read: async () => { read++; return { silkC: 0, nfts: [] }; }, setTimer: (f) => f(), now: () => 9 });
  card.open({ id: 'demo-sheriffchenko', name: t('pc.demoName'), skin: 'sheriffchenko', demo: true, lv: 6, silkC: 1240 });
  const text = () => doc.body.textContent;
  assert.match(text(), /Sheriffchenko \(demo player\)/);
  assert.match(text(), /Demo player: a scripted townsperson so you can try trading, profiles and friends\./);
  assert.match(text(), /Practice silk \(this device\)12\.4/); assert.match(text(), /Level6/);
  assert.equal(read, 0, 'a demo player has no account: nothing is read from chain');
  click(doc, 'Trade'); await tick();
  assert.match(text(), /nothing is moved and nothing is recorded on chain/);
  assert.match(text(), /You get 1 spider silk thread for 3 silk \(3 silk each, the stall's price\)\./);
  click(doc, 'Confirm trade'); await tick();
  assert.match(text(), /accepted \(scripted\)\. Practice trade saved on this device/);
  assert.equal(JSON.parse(storage.getItem(PRACTICE_KEY))[0].practice, true);
  click(doc, 'Add friend');
  assert.match(text(), /Added to your friends \(saved on this device\)\./);
  assert.equal(card.friends.list()[0].demo, true);
  click(doc, 'Profile'); assert.match(text(), /Profile \(read-only\)/); assert.match(text(), /Friendyes/);
  card.close(); assert.equal(card.isOpen, false);
});

test('a real player\'s card reads silk and NFTs from chain for their account; trade goes to the market; Esc and a tap outside close it', async () => {
  const { doc } = installDom();
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const { createPlayerCard } = await import('../../src/play/player-card.js');
  let market = 0, asked = null;
  const card = createPlayerCard({ t, storage: mem(), me: 'ann.testnet', doc, openMarket: () => market++,
    read: async (acc) => { asked = acc; return { silkC: 3800, nfts: [{ title: 'Chest loot #41 (rare)', href: 'https://testnet.nearblocks.io/nft-token/x/41' }] }; } });
  card.open({ id: 4, name: 'maren', skin: 'elise', account: 'maren-1.guests.ftf-coordinator.testnet', lv: 3 });
  await tick(); await tick();
  const text = () => doc.body.textContent;
  assert.equal(asked, 'maren-1.guests.ftf-coordinator.testnet');
  assert.match(text(), /Silk on NEAR38/); assert.match(text(), /Chest loot #41 \(rare\)/); assert.doesNotMatch(text(), /[Dd]emo/);
  click(doc, 'Trade'); assert.match(text(), /settle through the market on NEAR testnet/);
  click(doc, 'Open the market'); assert.equal(market, 1); assert.equal(card.isOpen, false);
  card.open({ id: 5, name: 'nobody', skin: 'iris' });
  assert.match(text(), /does not share an account, so no NFTs can be read/);
  const wrap = doc.body.querySelector('.pc-wrap');
  wrap.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {}, stopPropagation() {} }); assert.equal(card.isOpen, false);
  card.open({ id: 5, name: 'nobody', skin: 'iris' });
  const w2 = doc.body.querySelector('.pc-wrap'); w2.dispatchEvent({ type: 'pointerdown', target: w2, stopPropagation() {} }); assert.equal(card.isOpen, false);
});

test('card and friends strings exist in five locales', async () => {
  const keys = ['pc.demo', 'pc.demoName', 'pc.practiceNote', 'pc.accepted', 'pc.tradeReal', 'pc.addFriend', 'menu.tab.friends', 'friends.empty'];
  for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) { const d = (await import(`../../src/play/locales/${lang}.js`)).default; for (const k of keys) assert.ok(d[k], lang + ' ' + k); }
});
