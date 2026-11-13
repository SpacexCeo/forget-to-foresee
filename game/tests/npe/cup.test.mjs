// The Season Cup card (sprint 7.9; E5, E6 as DOM tests): add an agent, it plays its own season and shows with the
// Agent badge and the scripted tooltip; the agents-only exhibition shows four Agent rows with scores and the
// "not recorded on chain" line; refusals in plain words; the empty state; a fixed seed plays the same exhibition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import NPE from '../../src/play/locales/en-npe.js';
import { runExhibition } from '../../src/play/agent-policies.js';

const dom = () => { const { doc } = installDom(); doc.getElementById = doc.getElementById || (() => null); doc.addEventListener = doc.addEventListener || (() => {}); doc.removeEventListener = doc.removeEventListener || (() => {}); return doc; };
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); } };

test('cup card: empty state, Add an agent -> Agent badge with the scripted tooltip, its season scores it', async () => {
  const doc = dom();
  const { createSeasonCup } = await import('../../src/play/season-cup.js');
  const events = [];
  const card = createSeasonCup({ doc, bus: { emit: (n) => events.push(n) }, onEnterChain: () => events.push('chain') });
  card.open();
  assert.ok(doc.querySelector('.cup').textContent.includes(NPE['cup.empty']));
  assert.ok(events.includes('tournament.opened'));
  const btn = (s) => doc.querySelectorAll('.cup button').find((b) => b.textContent === s);
  btn('Add an agent').click();
  assert.ok(doc.querySelector('.cup form'), 'the dialog');
  const p = card.addAgent('Scribe-7', 'explorer');
  await until(() => doc.querySelector('.cup li'));
  const badge = doc.querySelector('.cup li .badge');
  assert.ok(badge.textContent.includes('Agent')); assert.equal(badge.title, NPE['cup.badge.scripted']);
  assert.ok(events.includes('tournament.agent_entered'));
  await p;
  await until(() => doc.querySelector('.cup li .sc').textContent !== '…');
  assert.match(doc.querySelector('.cup li .sc').textContent, /^\d+$/);
  assert.ok(doc.querySelector('.cup .state').textContent.startsWith('Scribe-7 finished with'));
  await card.addAgent('scribe-7', 'cautious');
  assert.equal(doc.querySelector('.cup .state').textContent, NPE['cup.err.already_entered']);
  await card.addAgent('<bad>', 'cautious');
  assert.equal(doc.querySelector('.cup .state').textContent, NPE['cup.err.bad_name']);
  btn('Enter the tournament').click(); assert.ok(events.includes('chain'), 'the on-chain entry with its price'); assert.equal(card.isOpen, false);
});

test('cup card: the agents-only exhibition shows four Agent rows with scores, sealed, not on chain', async () => {
  const doc = dom();
  const { createSeasonCup } = await import('../../src/play/season-cup.js');
  const card = createSeasonCup({ doc });
  card.open();
  await card.runExhibition();
  const rows = doc.querySelectorAll('.cup li');
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.dataset.kind === 'agent' && /^\d+$/.test(r.querySelector('.sc').textContent)));
  assert.ok(doc.querySelector('.cup').textContent.includes(NPE['cup.exhibition.note']));
  assert.ok(doc.querySelector('.cup .chip').textContent === 'Sealed');
});

test('exhibition: a fixed seed plays the same seasons; the policies differ in score', async () => {
  const a = await runExhibition({ seed: 5 }); const b = await runExhibition({ seed: 5 });
  assert.deepEqual(a.leaderboard.map((r) => [r.name, r.score]), b.leaderboard.map((r) => [r.name, r.score]));
  assert.equal(a.season.status, 'sealed');
  assert.ok(new Set(a.leaderboard.map((r) => r.score)).size > 1, 'not every agent scores the same');
});
