// Monster resources (owner 12.11 evening): the drop table per creature, seeded per kill id, pity on the wanted resource,
// the daily cap, the manifest and locale entries, and the view (inventory source 'drop', one event per drop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const R = await import('../../src/game/resources.js');
const { rollDrops, initialDrops, RESOURCES, RESOURCE_IDS, DROP_TABLE, RESOURCE_RULES, sourcesOf, resourceValue } = R;

test('resources: every table entry is a known resource with a sane chance and count; ids, names, values', () => {
  assert.deepEqual(Object.keys(DROP_TABLE).sort(), ['crownrift', 'hulker', 'skitter', 'veilbell']);
  for (const [mob, list] of Object.entries(DROP_TABLE)) for (const e of list) {
    assert.ok(RESOURCES[e.id], e.id); assert.ok(e.chance > 0 && e.chance <= 1); assert.ok(e.min >= 1 && e.max >= e.min, mob);
  }
  for (const id of RESOURCE_IDS) {
    const r = RESOURCES[id];
    assert.equal(r.id, id); assert.equal(r.nameKey, 'item.' + id); assert.ok(r.silk > 0 && Number.isInteger(r.silk));
    assert.ok(sourcesOf(id).includes(r.from), id + ' drops from its own creature');
  }
  assert.equal(RESOURCES.res_silk_thread.from, 'skitter'); assert.equal(RESOURCES.res_crown_shard.rarity, 'rare');
  assert.equal(resourceValue('res_ash_ore', 3), 75); assert.equal(resourceValue('nope'), 0);
});

test('resources: deterministic per kill id, aliases resolve, state is never mutated, unknown creatures drop nothing', () => {
  const a = rollDrops(initialDrops(), { killId: 'k1', mob: 'skitter', day: 'x' });
  const b = rollDrops(initialDrops(), { killId: 'k1', mob: 'stone spider', day: 'x' });
  assert.deepEqual(a.drops, b.drops);
  const s0 = initialDrops(); rollDrops(s0, { killId: 'k2', mob: 'hulker', day: 'x' });
  assert.deepEqual(s0, { miss: 0, want: null, day: '', today: 0 });
  assert.deepEqual(rollDrops(initialDrops(), { killId: 'k3', mob: 'dragon', day: 'x' }).drops, []);
});

test('resources: each creature drops only its own table, at about the table rates', () => {
  const N = 2000;
  for (const mob of Object.keys(DROP_TABLE)) {
    const hits = {}, own = new Set(DROP_TABLE[mob].map((e) => e.id));
    for (let i = 0; i < N; i++) {
      for (const d of rollDrops(initialDrops(), { killId: `${mob}${i}`, mob, day: 'x' }).drops) {
        assert.ok(own.has(d.id), `${mob} dropped ${d.id}`); hits[d.id] = (hits[d.id] || 0) + 1;
        const e = DROP_TABLE[mob].find((x) => x.id === d.id); assert.ok(d.n >= e.min && d.n <= e.max);
      }
    }
    for (const e of DROP_TABLE[mob]) assert.ok(Math.abs((hits[e.id] || 0) / N - e.chance) < 0.04, `${mob} ${e.id} ${(hits[e.id] || 0) / N} vs ${e.chance}`);
  }
});

test('resources: the wanted resource never misses more than `pity` kills running; changing it resets the count', () => {
  for (let p = 0; p < 200; p++) {
    let st = initialDrops(), run = 0, worst = 0;
    for (let i = 0; i < 40; i++) {
      const r = rollDrops(st, { killId: `p${p}_${i}`, mob: 'skitter', want: 'res_chitin_plate', day: 'x' }); st = r.state;
      run = r.drops.some((d) => d.id === 'res_chitin_plate') ? 0 : run + 1; worst = Math.max(worst, run);
    }
    assert.ok(worst <= RESOURCE_RULES.pity, `worst miss run ${worst}`);
  }
  // kills of a creature that cannot drop the wanted resource leave the count alone
  let st = rollDrops(initialDrops(), { killId: 'w', mob: 'skitter', want: 'res_ash_ore', day: 'x' }).state;
  assert.equal(st.miss, 0); assert.equal(st.want, 'res_ash_ore');
  st = { ...st, miss: 3 };
  assert.equal(rollDrops(st, { killId: 'w2', mob: 'skitter', want: 'res_crown_shard', day: 'x' }).state.miss, 0, 'new want: fresh count');
  assert.equal(rollDrops(initialDrops(), { killId: 'w3', mob: 'skitter', want: 'not_a_resource', day: 'x' }).state.want, null);
});

test('resources: at most dailyCap units per UTC day, a new day starts again', () => {
  let st = initialDrops(), got = 0;
  for (let i = 0; i < 400; i++) { const r = rollDrops(st, { killId: 'c' + i, mob: 'crownrift', day: '2026-11-12' }); st = r.state; got += r.drops.reduce((a, d) => a + d.n, 0); }
  assert.equal(got, RESOURCE_RULES.dailyCap); assert.equal(st.today, RESOURCE_RULES.dailyCap);
  const next = rollDrops(st, { killId: 'c-next', mob: 'crownrift', day: '2026-11-13' });
  assert.ok(next.drops.length > 0 || next.state.today === 0); assert.equal(next.state.day, '2026-11-13');
});

test('resources: manifest entries with icons and models, names in every locale, the bag shows them', () => {
  const man = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items;
  for (const id of RESOURCE_IDS) {
    const m = man.find((x) => x.id === id); assert.ok(m, id);
    assert.equal(m.kind, 'resource'); assert.equal(m.rarity, RESOURCES[id].rarity); assert.equal(m.nameKey, RESOURCES[id].nameKey);
    for (const f of [m.icon, m.icon128, m.glb]) assert.ok(existsSync(new URL('../../public/assets/items/' + f, import.meta.url)), f);
  }
  assert.match(readFileSync(new URL('../../src/play/game-menu.js', import.meta.url), 'utf8'), /i\.kind === 'resource'/);
});

test('resources: locale keys (item names, toast, bag lines) in all five languages', async () => {
  for (const L of ['en', 'ru', 'uk', 'it', 'zh']) {
    const play = (await import(`../../src/play/locales/${L}.js`)).default, site = (await import(`../../src/locales/${L}.js`)).default;
    for (const id of RESOURCE_IDS) { assert.ok(play['item.' + id], `${L} play item.${id}`); assert.ok(site['item.' + id], `${L} item.${id}`); }
    for (const k of ['story.res.found', 'menu.detail.resource', 'menu.source.drop', 'menu.source.salvage']) assert.ok(play[k], `${L} ${k}`);
    assert.match(play['story.res.found'], /\{n\}/); assert.match(play['story.res.found'], /\{name\}/);
  }
});

test('resource view: a kill adds the drop to the bag (source drop), toasts it, dispatches ftf:resource-drop; want via event', async () => {
  const { createResourceView, rarestDrop, RESOURCE_KEY } = await import('../../src/scenes/resource-view.js');
  const { createInventory } = await import('../../src/game/inventory.js');
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const win = new EventTarget(), toasts = [], dropped = [];
  win.addEventListener('ftf:resource-drop', (e) => dropped.push(e.detail));
  const v = createResourceView({ scene: null, storage, toast: (s) => toasts.push(s), t: (k, p) => (p ? `${k}:${p.n}:${p.name}` : k), win });
  win.dispatchEvent(new CustomEvent('ftf:resource-want', { detail: { id: 'res_chitin_plate' } }));
  assert.equal(v.wanted, 'res_chitin_plate');
  let total = 0;
  for (let i = 0; i < 12; i++) win.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: 'skitter', killId: 's:' + i, pos: [0, 0, 0] } }));
  for (const d of dropped) total += d.drops.reduce((a, x) => a + x.n, 0);
  const inv = createInventory({ storage });
  assert.ok(dropped.length > 0 && toasts.length === dropped.length);
  assert.equal(inv.count('res_silk_thread') + inv.count('res_chitin_plate'), total);
  assert.ok(inv.count('res_chitin_plate') >= 2, 'pity on the wanted chitin over 12 kills');
  assert.equal(JSON.parse(store.get('ftf.inventory.v1')).items.res_silk_thread.source, 'drop');
  assert.equal(JSON.parse(store.get(RESOURCE_KEY)).want, 'res_chitin_plate');
  assert.match(toasts[0], /story\.res\.found:\d:item\.res_/);
  win.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: 'skitter' } }));   // no kill id: ignored
  assert.equal(rarestDrop([{ id: 'res_silk_thread', n: 2 }, { id: 'res_chitin_plate', n: 1 }]).id, 'res_chitin_plate');
  assert.equal(rarestDrop([]), null);
  v.dispose();
  const before = dropped.length; win.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: 'hulker', killId: 'after' } }));
  assert.equal(dropped.length, before, 'disposed: no more drops');
});
