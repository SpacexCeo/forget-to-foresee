// Back from the Tournament (owner 14.11): the Biography's Return to town button and the card of what the season gave her
// (src/play/season-loot.js: only what the town ledger and the chest bag actually changed, plus her minted shard NFTs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { lootSnapshot, seasonLoot, silkText, LOOT_ICONS } from '../../src/play/season-loot.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { createChestBag } from '../../src/game/chests.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('a trip that changed nothing has no rows', () => {
  const storage = memStorage(), ledger = createTownLedger({ storage }), chests = createChestBag({ storage });
  const a = lootSnapshot({ ledger, chests });
  assert.deepEqual(seasonLoot(a, lootSnapshot({ ledger, chests })), []);
  assert.deepEqual(seasonLoot(null, a), []);
});

test('the season rows come from the ledger and the bag: XP, level, title, trials, signs, memories, chests, silk', () => {
  const storage = memStorage(), ledger = createTownLedger({ storage }), chests = createChestBag({ storage });
  const old = chests.add({ tier: 'common', source: 'monster' });
  const before = lootSnapshot({ ledger, chests });
  for (let i = 0; i < 6; i++) ledger.addXp('trialVerified');   // 120 XP: level 1 -> 2
  for (let i = 0; i < 3; i++) ledger.addXp('signRead');
  ledger.addXp('memoryForgotten');
  ledger.grant({ silk: 250 });
  chests.add({ tier: 'rare', source: 'quest' }); chests.add({ tier: 'common', source: 'quest' }); chests.add({ tier: 'common', source: 'quest' });
  const after = lootSnapshot({ ledger, chests });
  const rows = seasonLoot(before, after, { shards: [{ tokenId: '42', url: 'https://example.test/42' }] });
  const kinds = rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['level', 'title', 'shard', 'chest', 'chest', 'silk', 'xp', 'trials', 'signs', 'forgotten']);
  assert.equal(rows[0].level, 2);
  assert.equal(rows[1].title, 'listener');
  assert.deepEqual(rows[2], { kind: 'shard', tokenId: '42', href: 'https://example.test/42' });
  assert.deepEqual(rows.filter((r) => r.kind === 'chest'), [{ kind: 'chest', tier: 'rare', n: 1 }, { kind: 'chest', tier: 'common', n: 2 }], 'the chest she already had is not counted');
  assert.ok(before.chests.some((c) => c.id === old.id));
  assert.equal(rows.find((r) => r.kind === 'silk').n, 250);
  assert.equal(rows.find((r) => r.kind === 'xp').n, 6 * 20 + 3 * 5 + 15);
  assert.equal(rows.find((r) => r.kind === 'trials').n, 6);
  assert.equal(rows.find((r) => r.kind === 'signs').n, 3);
  assert.equal(rows.find((r) => r.kind === 'forgotten').n, 1);
  for (const k of kinds) assert.ok(LOOT_ICONS[k], 'icon for ' + k);
});

test('spending never shows as loot; silk is shown in whole silk', () => {
  const storage = memStorage(), ledger = createTownLedger({ storage });
  const before = lootSnapshot({ ledger });
  ledger.spend({ silkC: 100, reason: 'test' });
  assert.deepEqual(seasonLoot(before, lootSnapshot({ ledger })), []);
  assert.equal(silkText(250), '2.5'); assert.equal(silkText(1200), '12'); assert.equal(silkText(5), '0.05');
});

test('every icon file exists', () => {
  for (const name of new Set(Object.values(LOOT_ICONS))) {
    const f = name === 'silk' ? 'silk_coin_48.webp' : name + '_48.webp';
    assert.ok(readFileSync(new URL('../../public/assets/ui/icons/' + f, import.meta.url)).length > 0, f);
  }
});

test('the card strings in five locales; every row kind renders', async () => {
  const keys = ['end.returnTown', 'loot.kicker', 'loot.title', 'loot.empty', 'loot.continue', 'loot.hint.chests',
    'loot.row.level', 'loot.row.title', 'loot.row.shard', 'loot.row.chest', 'loot.row.silk', 'loot.row.xp', 'loot.row.trials', 'loot.row.signs', 'loot.row.forgotten'];
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = await import(`../../src/play/locales/${l}.js`), dict = m.default || Object.values(m)[0];
    for (const k of keys) assert.ok(typeof dict[k] === 'string' && dict[k].length, `${l}: ${k}`);
  }
  const { lootRowText } = await import('../../src/play/season-loot-ui.js');
  const seen = [];
  const t = (k, a) => { seen.push(k); return k + JSON.stringify(a || {}); };
  for (const row of [{ kind: 'level', level: 3 }, { kind: 'title', title: 'reader' }, { kind: 'shard', tokenId: '7' }, { kind: 'chest', tier: 'rare', n: 2 }, { kind: 'silk', n: 250 }, { kind: 'xp', n: 40 }, { kind: 'trials', n: 2 }, { kind: 'signs', n: 1 }, { kind: 'forgotten', n: 1 }]) lootRowText(row, t);
  for (const k of ['loot.row.level', 'profile.title.reader', 'loot.row.title', 'loot.row.shard', 'chest.tier.rare', 'loot.row.chest', 'loot.row.silk', 'loot.row.xp', 'loot.row.trials', 'loot.row.signs', 'loot.row.forgotten']) assert.ok(seen.includes(k), k);
});

test('the Biography offers Return to town; the town shows the card on return', () => {
  const read = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
  const ui = read('play/ui.js'), boot = read('boot-world.js');
  assert.match(ui, /'data-return-town': '', text: t\('end\.returnTown'\), onclick: \(\) => \{ close\(\); returnTown\(\); \}/);
  assert.match(ui, /setReturnTown\(fn\) \{/);
  assert.match(ui, /seasonFacts\(\) \{/);
  assert.match(boot, /play\.ui\.setReturnTown\(\(\) => returnToTown\(\)\)/);
  assert.match(boot, /takeLootSnapshot\(\); \/\/ what she has as she leaves/);
  assert.match(boot, /townFlow\.reenter\(\);\n  showSeasonLoot\(\);/);
  assert.match(read('play/season-loot-ui.js'), /el\('dialog', 'sl-wrap'/, 'an open dialog: the world keys wait');
});
