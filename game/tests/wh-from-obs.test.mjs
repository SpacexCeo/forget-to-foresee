// World HUD view model from the room observation (src/ui/world-hud/from-obs.js), built over a real
// local season (the same room code the agent API serves).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../src/play/transport-local.js';
import { PlaySession } from '../src/play/session.js';
import { createPlayI18n, renderMsg } from '../src/play/i18n.js';
import { buildHudModel, signsFromObs, confidenceBand, phaseOf, layerOf } from '../src/ui/world-hud/from-obs.js';

const SEED = '0123456789abcdef0123456789abcdef';
const i18n = createPlayI18n('en', { onMissing: (k) => { throw new Error('missing i18n key ' + k); } });
const T = (ref) => i18n.t(ref.key, typeof ref.args === 'function' ? ref.args() : ref.args);

async function season(ticks) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: SEED }), sleep: async () => {}, skipOnboarding: true });
  await s.start();
  for (let i = 1; i < ticks; i++) assert.ok((await s.send('end_tick', {})).ok);
  return s;
}
const build = (s, mode = 'novice', extra = {}) => buildHudModel({
  obs: s.obs, goal: s.goal, options: s.options, defaultIndex: s.defaultIndex, i18n, mode,
  render: (k, a) => renderMsg(i18n, k, a), ...extra,
});

test('from-obs: Novice layers gate the trial rows and the hotbar; Pro shows everything', async () => {
  const s = await season(1);
  const m = build(s);
  assert.equal(m.trial.n, 1);
  assert.equal(m.trial.total, s.obs.season.ticks);
  assert.equal(m.layer, 0);
  assert.equal(m.mode, 'novice');
  assert.deepEqual(m.trial.rows.map((r) => r.id), ['phase', 'silk'], 'L0: silk is the only number');
  assert.equal(T(m.trial.rows[1].value), String(s.obs.iris.silk));
  assert.ok(!m.hotbar.some((x) => x.id === 'memory'), 'Memories unlock at L1');
  assert.deepEqual(build(s, 'pro').trial.rows.map((r) => r.id), ['phase', 'silk', 'attention', 'tension']);
  assert.ok(build(s, 'pro').hotbar.some((x) => x.id === 'memory'));
  const later = await season(4);
  const l1 = build(later);
  assert.equal(l1.layer, 1);
  assert.deepEqual(l1.trial.rows.map((r) => r.id), ['phase', 'silk', 'attention', 'words']);
  assert.match(T(l1.trial.rows[3].value), /^\d+ \/ 16$/);
});

test('from-obs: the quest banner is the session goal, rendered by the play layer', async () => {
  const s = await season(1);
  const m = build(s);
  assert.equal(m.quests.length, 1);
  assert.equal(T(m.quests[0].title), renderMsg(i18n, s.goal.key, s.goal.args));
  i18n.setLocale('ru');
  assert.equal(T(m.quests[0].title), renderMsg(i18n, s.goal.key, s.goal.args), 'a locale switch re-renders the same ref');
  assert.notEqual(T(m.quests[0].title), renderMsg(createPlayI18n('en'), s.goal.key, s.goal.args));
  i18n.setLocale('en');
});

test('from-obs: sign cards — plain reading in Novice, four engine slots in Pro, anchor in trials', async () => {
  const s = await season(3);
  const cards = signsFromObs(s.obs, { i18n, mode: 'novice' });
  assert.equal(cards.length, s.obs.prophecies.length + s.obs.chronicle.length);
  const p = s.obs.prophecies[0];
  const c = cards.find((x) => x.id === 'sign-' + p.index);
  assert.equal(c.state, 'active');
  assert.equal(c.number, p.index + 1);
  assert.equal(c.stats.length, 0, 'Novice hides the stat rows');
  assert.match(T(c.plain), /^(Unsure|Likely|Certain): \w+ of \d+ at Shell [IV]+, trial \d+$/);
  assert.deepEqual(c.anchor, { shell: p.impliedAnchor.shell - 1, trial: p.impliedAnchor.tick });
  const pro = signsFromObs(s.obs, { i18n, mode: 'pro' }).find((x) => x.id === c.id);
  assert.deepEqual(pro.stats.map((x) => x.id), ['place', 'action', 'power', 'delay']);
  assert.match(T(pro.stats[0].value), /^Shell [IV]+ · \d+%$/);
  assert.equal(pro.plain, undefined);
});

test('from-obs: a revealed sign carries the chain check (Verified ✓)', async () => {
  const s = await season(5);
  assert.ok(s.obs.chronicle.length > 0, 'the fixed season reveals a sign by trial 5');
  const cards = signsFromObs(s.obs, { i18n });
  const done = cards.filter((x) => x.state === 'resolved');
  assert.equal(done.length, s.obs.chronicle.length);
  for (const d of done) {
    assert.equal(d.verified, 'ok');
    assert.equal(i18n.t('wh.sign.verified.' + d.verified), 'Verified ✓');
    assert.match(T(d.plain), /^Came true: /);
  }
  assert.ok(cards.findIndex((x) => x.state === 'resolved') > cards.findLastIndex((x) => x.state === 'active'), 'active cards come first');
});

test('from-obs: log, prompt, hotbar and layer', async () => {
  const s = await season(5);
  const m = build(s);
  assert.ok(m.journal.log.length > 0);
  assert.ok(m.journal.log.every((e) => /^T\d+$/.test(e.time)));
  assert.ok(!m.journal.log.some((e) => e.tone === 'tick'), 'tick separators are dropped');
  assert.equal(new Set(m.journal.log.map((e) => e.id)).size, m.journal.log.length, 'ids are unique');
  assert.deepEqual(m.hotbar.map((x) => x.id), ['memory', 'signs', 'endTick', 'help', 'settings']);
  assert.equal(m.prompt.visible, s.defaultIndex >= 0);
  assert.equal(layerOf(s.obs), 1);
});

test('from-obs: helpers', () => {
  assert.equal(confidenceBand([{ confidence: .9 }, { confidence: .85 }]), 'certain');
  assert.equal(confidenceBand([{ confidence: .9 }, { confidence: .6 }]), 'likely');
  assert.equal(confidenceBand([{ confidence: .25, certain: false }, { confidence: 1 }]), 'unsure');
  assert.equal(confidenceBand([{ confidence: .1, certain: true }]), 'certain');
  assert.equal(phaseOf({ id: 'anchor' }), 'anchor');
  assert.equal(phaseOf({ id: 'forget' }), 'interpret');
  assert.equal(phaseOf({ id: 'end_tick' }), 'resolve');
  assert.equal(phaseOf({ id: 'reach_scroll' }), 'explore');
});

test('from-obs: an unchanged observation reuses the previous sub-objects (no DOM rebuild)', async () => {
  const s = await season(2);
  const a = build(s);
  const b = build(s, 'novice', { prev: a });
  for (const k of ['trial', 'quests', 'signs', 'journal', 'prompt', 'hotbar']) assert.equal(b[k], a[k], k);
  assert.ok((await s.send('end_tick', {})).ok);
  const c = build(s, 'novice', { prev: b });
  assert.notEqual(c.trial, b.trial, 'a new trial rebuilds the trial card');
  assert.notEqual(c.signs, b.signs);
  const d = build(s, 'pro', { prev: c });
  assert.notEqual(d.signs, c.signs, 'a mode switch rebuilds the sign cards');
});
