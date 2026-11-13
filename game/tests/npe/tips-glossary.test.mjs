// First-seen tips and the glossary (sprint 7.7, 7.11 tests 5 and 6): the A4 tips with their copy, the queue rules
// (one at a time, never in a modal, a 1.5 s gap, three per minute), every glossary term of 1.4, search, the
// "For the curious" fold, and every data-glossary key resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { A4_TIPS, createTipQueue, registerTips, tipText, QUEUE } from '../../src/npe/tips.js';
import { TERMS, entries } from '../../src/npe/glossary.js';
import NPE from '../../src/play/locales/en-npe.js';

const dom = () => { const { doc } = installDom(); doc.getElementById = doc.getElementById || (() => null); doc.addEventListener = doc.addEventListener || (() => {}); doc.removeEventListener = doc.removeEventListener || (() => {}); return doc; };

test('tips: the eight A4 tips of 1.5 with their exact copy; the fee comes from config', () => {
  assert.deepEqual(A4_TIPS.map((x) => x.id), ['tip.silk', 'tip.hp', 'tip.mana', 'tip.xp', 'tip.hotbar', 'tip.minimap', 'tip.tournament', 'tip.chat']);
  assert.deepEqual(tipText('tip.silk', { fee: '200' }), { title: 'Silk', body: "Silk is the town's money. You need 200 to go home." });
  assert.equal(tipText('tip.hp').body, 'If it reaches zero you wake up at the town gate. Nothing is lost.');
  assert.equal(tipText('tip.tournament').body, 'Players and agents compete. Agents wear a badge.');
  const reg = []; assert.equal(registerTips({ registerTip: (x) => reg.push(x) }, { fee: '200' }), 8);
  assert.ok(reg.every((x) => x.id && x.trigger && x.anchor && x.title && x.body));
  assert.equal(reg.find((x) => x.id === 'tip.xp').trigger, 'xp.gained');
});

test('tips: the HP rule in the copy matches the game (respawn at the gate, full health, nothing taken)', async () => {
  const { readFileSync } = await import('node:fs');
  const mobs = readFileSync(new URL('../../src/play/mobs.js', import.meta.url), 'utf8');
  assert.match(mobs, /if \(respawn\) player\.teleport\(respawn\.slice\(\), player\.heading\); iris\.hp = IRIS_HP;/);
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /respawn: gate/);
});

test('tip queue: one at a time, never while busy, 1.5 s after a dismissal, at most three a minute, Skip tips', () => {
  const q = createTipQueue();
  for (const id of ['a', 'b', 'c', 'd', 'e']) q.push(id);
  q.push('a'); assert.equal(q.waiting.length, 5, 'no duplicates');
  assert.equal(q.next(0, { busy: true }), null, 'never during a cinematic, dialogue or modal');
  assert.equal(q.next(0), 'a');
  assert.equal(q.next(100), null, 'only one at a time');
  q.dismissed(1000);
  assert.equal(q.next(1000 + QUEUE.gapMs - 1), null, 'the gap');
  assert.equal(q.next(2500), 'b'); q.dismissed(3000);
  assert.equal(q.next(4500), 'c'); q.dismissed(5000);
  assert.equal(q.next(7000), null, 'a fourth in the same minute waits');
  assert.equal(q.next(60_000), 'd', 'the next minute');
  q.dismissed(60_100); q.skipAll(); assert.equal(q.next(70_000), null, 'Skip tips empties the queue');
  const seen = new Set(['x']); const q2 = createTipQueue({ seen }); q2.push('x'); assert.equal(q2.next(0), null, 'a seen tip never returns');
});

test('glossary: the 15 terms of 1.4 with their copy; search; curious folds never lead', () => {
  assert.equal(TERMS.length, 15);
  const all = entries(null, { fee: '200', end: '15 November' });
  assert.deepEqual(all.map((e) => e.term), ['Silk', 'Silk on chain', 'Pending silk', 'Play silk', 'Gate-Loom', 'Burn', 'NEAR testnet', 'Chest', 'Loot NFT', 'Whitelist pass', 'Agent', 'Season', 'Level, XP', 'Mana', 'Cooldown']);
  assert.equal(all.find((e) => e.id === 'gate').text, 'The portal that can take Iris home. It costs 200 silk, paid once on chain and burned (removed forever).');
  assert.equal(all.find((e) => e.id === 'season').text, 'A set period with its own leaderboard. Season 1 ends on 15 November.');
  for (const e of all) { assert.ok(e.text.split(/(?<=\.)\s/).length <= 3, `${e.id}: short (the exact copy of 1.4; Silk has three)`); assert.doesNotMatch(e.text, /NEP-|commit-reveal|multi-token/, e.id); }
  assert.ok(entries(null, {}, 'MANA').some((e) => e.id === 'mana'), 'search is case-insensitive');
  assert.equal(entries(null, {}, 'zzzz').length, 0);
});

test('glossary window: opens at a term from an underlined abbr, searches, Esc closes', async () => {
  const doc = dom();
  const { openGlossary, attach } = await import('../../src/npe/glossary.js');
  const host = doc.createElement('p'); const ab = doc.createElement('abbr'); ab.setAttribute('data-glossary', 'burn'); ab.textContent = 'burned'; host.append(ab); doc.body.append(host);
  assert.equal(attach(host, { doc }), 1); assert.equal(attach(host, { doc }), 0, 'wired once');
  ab.click();
  assert.ok(doc.querySelector('.npe-gl'));
  assert.equal(doc.querySelector('.npe-gl li.hit').querySelector('b').textContent, 'Burn');
  const g = openGlossary({ doc, vars: { fee: '200' } });
  assert.equal(g.search('silk'), 4 + 2, 'silk appears in the four silk terms and two other entries');
  assert.equal(g.search('qqq'), 0); assert.ok(doc.querySelectorAll('.npe-gl li').some((li) => li.textContent === NPE['gloss.none']));
  g.close(); assert.equal(g.isOpen, false);
});

test('glossary: every data-glossary key used in the sprint strings resolves to a term', () => {
  const used = new Set();
  for (const s of Object.values(NPE)) for (const m of String(s).matchAll(/data-glossary="([a-z_]+)"/g)) used.add(m[1]);
  for (const k of used) assert.ok(TERMS.includes(k), k);
  for (const id of TERMS) { assert.ok(NPE[`gloss.${id}.term`]); assert.ok(NPE[`gloss.${id}.text`]); }
});

test('first-seen wiring: the intro registers the A4 tips when tips are on, blocks them while it runs, the "?" re-shows', async () => {
  const doc = dom();
  const fs = await import('../../src/sprint/first-seen.js');
  const bus = await import('../../src/sprint/bus.js');
  const { reshowButton } = await import('../../src/npe/tips.js');
  const { memoryStorage } = await import('../../src/ui/storage.js');
  const storage = memoryStorage();
  fs._reset(); fs._configure({ storage, doc, touch: false });
  const { mount } = await import('../../src/npe/index.js');
  const m = mount({ doc, storage, t: (k) => k, search: '?intro=0', flags: { on: (k) => k === 'firstSeenTips' } });
  assert.equal(m.tips, true); assert.equal(m.intro, null);
  bus.state.set('npe.active', true);
  bus.emit('tournament.opened', {});
  assert.equal(doc.querySelectorAll('.ftf-tip').length, 0, 'never during the intro');
  bus.state.set('npe.active', false);
  bus.emit('tournament.opened', {});
  assert.ok(doc.querySelectorAll('.ftf-tip').length >= 1, 'shown once the intro is over');
  doc.querySelectorAll('.ftf-tip button').find((b) => b.textContent === 'Got it').click();
  assert.equal(doc.querySelectorAll('.ftf-tip').length, 0);
  bus.emit('tournament.opened', {});
  assert.equal(doc.querySelectorAll('.ftf-tip').length, 0, 'seen: not again on its own');
  const q = reshowButton({ doc, id: 'tip.tournament', show: fs.showTip });
  assert.equal(q.textContent, '?'); assert.equal(q.title, 'Show the tip again');
  q.click();
  assert.equal(doc.querySelectorAll('.ftf-tip').length, 1, 'the "?" re-shows a seen tip');
  assert.ok(doc.querySelector('.ftf-tip').textContent.includes('Players and agents compete. Agents wear a badge.'));
  fs._reset();
});
