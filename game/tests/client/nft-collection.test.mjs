// The cards a player can earn (src/play/nft-collection.js, owner 14.11): five painted cards, each on disk in two sizes,
// owned ones first, a dragon is owned when the Hatchkeeper's pet or the chain says so, the pass when it was claimed;
// the NFTs tab shows them and a card opens large; five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { COLLECTION, collectionView } from '../../src/play/nft-collection.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';
import { installDom } from '../lib/mini-dom.mjs';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('five cards, each with its art on disk in both sizes and its words in five locales', () => {
  assert.deepEqual(COLLECTION.map((c) => c.id), ['sheriffchenko', 'cinder', 'nacre', 'rill', 'pass']);
  for (const c of COLLECTION) for (const f of [c.art, c.thumb]) assert.ok(existsSync(new URL('../../public/assets/' + f, import.meta.url)), f);
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    for (const k of ['nft.collection', 'nft.owned', 'nft.card.pass', 'nft.how.wheel', 'nft.how.hatch', 'nft.how.pass']) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
    for (const c of COLLECTION) assert.ok(PLAY_MESSAGES[loc][c.nameKey] && PLAY_MESSAGES[loc][c.howKey], `${loc} ${c.id}`);
  }
});

test('ownership: nothing by default; the won skin, the pet, a chain dragon and a claimed pass come first', () => {
  assert.ok(collectionView().every((c) => !c.owned));
  assert.deepEqual(collectionView().map((c) => c.id), COLLECTION.map((c) => c.id), 'collection order when nothing is owned');
  const v = collectionView({ skins: { owned: { sheriffchenko: true } }, pet: { kind: 'rill' }, dragons: ['nacre'], pass: true });
  assert.deepEqual(v.map((c) => [c.id, c.owned]), [['sheriffchenko', true], ['nacre', true], ['rill', true], ['pass', true], ['cinder', false]]);
  assert.equal(collectionView({ skins: { owned: { elise: true } } })[0].owned, false, 'another skin is not the Sheriffchenko card');
});

test('the NFTs tab shows the cards, the owned one marked; a card opens large and closes on a click', async () => {
  const { doc } = installDom();
  const { openGameMenu } = await import('../../src/play/game-menu.js');
  const storage = memoryStorage();
  globalThis.__ftfPet = { kind: 'cinder' };
  try {
    const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
    const MANIFEST = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items;
    const m = openGameMenu({ doc, t, ledger: createTownLedger({ storage }), storage, tab: 'nfts', manifest: Promise.resolve(MANIFEST), onChain: Promise.resolve({ state: 'none', items: [] }), base: '/' });
    await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
    const cards = m.root.querySelectorAll('.gm-coll-card');
    assert.equal(cards.length, 5);
    assert.ok(cards[0].textContent.includes('Cinder') && cards[0].textContent.includes(t('nft.owned')), 'the pet comes first, marked');
    assert.ok(cards[0].querySelector('img').src.endsWith('assets/nft/card_cinder_m.webp'));
    assert.ok(cards[1].className.includes('gm-locked') && cards[1].textContent.includes(t('nft.how.wheel')));
    cards[1].click();
    const big = m.root.querySelector('.gm-coll-big');
    assert.ok(big && big.querySelector('img').src.endsWith('assets/nft/sherif_card.webp'));
    big.click();
    assert.equal(m.root.querySelector('.gm-coll-big'), null);
    m.close();
  } finally { delete globalThis.__ftfPet; }
});

test('the menu actions of the inventory and the NFTs tab have their sound (a card opening clicks, archiving and wearing confirm)', async () => {
  const { doc } = installDom();
  const { openGameMenu } = await import('../../src/play/game-menu.js');
  const sounds = [], had = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (e) => { if (e && e.type === 'ftf:sound') sounds.push(e.detail); return true; };
  globalThis.__ftfSkins = () => ({ current: 'iris', owned: { iris: true, elise: true } });
  try {
    const storage = memoryStorage(); const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
    const MANIFEST = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items;
    const m = openGameMenu({ doc, t, ledger: createTownLedger({ storage }), storage, tab: 'nfts', manifest: Promise.resolve(MANIFEST), onChain: Promise.resolve({ state: 'none', items: [] }), base: '/' });
    await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
    m.root.querySelector('.gm-coll-card').click();
    assert.deepEqual(sounds, ['ui_click']);
    m.show('inventory'); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
    const wearElise = [...m.root.querySelectorAll('.gm-ward-card button')].find((b) => b.textContent === t('skin.wear'));
    wearElise.click();
    assert.equal(sounds.at(-1), 'ui_confirm');
    m.close();
  } finally { globalThis.dispatchEvent = had; delete globalThis.__ftfSkins; }
});
