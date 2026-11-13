// The journal, the tracker and auto-walk (sprint §4.7-4.10, tests 6, 9, 10 and the E2/E3/E4/E5 behaviours without a
// browser): five tabs with counts, the spiders' detail (giver, counters, rewards), click-twice-to-walk, keys, the
// tracker never truncates, tracking holds at most three, the planner goes around a box, auto-walk arrives at 2.2 m and
// cancels on input, on a new walk or when blocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDoc, makeWin } from './dom.mjs';
import { journalModel, questView, toggleTrack, countdown } from '../../src/quests/journal-model.js';
import { createJournalUI } from '../../src/quests/journal-ui.js';
import { createTrackerUI } from '../../src/quests/tracker-ui.js';
import { planPath, stopPoint, createAutoWalk } from '../../src/sprint/auto-walk.js';
import { applyQuest, initialQuests } from '../../src/game/quest-rules.js';
import { createSay } from '../../src/quests/say.js';
import { GIVER_NAMES } from '../../src/game/journal-data.js';

const T0 = 20_000 * 86_400_000 + 3600_000;
const act = (s, a) => { const r = applyQuest(s, a, { now: T0 }); return r.rejected ? s : r.state; };
const say = createSay(null), gname = (k) => GIVER_NAMES[k];
function spidersActive() { let s = act(initialQuests(), { type: 'KILL', mob: 'veilbell', killId: 'k0' }); s = act(s, { type: 'ACCEPT', questId: 'q_spiders' }); return s; }

test('model: five tabs, ready/active/available/locked order, badges, Done tab, search, countdown, tracking limit', () => {
  const s = spidersActive();
  const m = journalModel({ qs: s, now: T0, giverName: gname });
  assert.deepEqual(Object.keys(m.tabs), ['story', 'side', 'daily', 'tournament', 'done']);
  assert.deepEqual(m.tabs.story.map((v) => v.status), ['active', 'available', 'available', 'locked']);
  assert.equal(m.tabs.story[0].id, 'q_spiders'); assert.equal(m.tabs.story[0].counter, '1/10'.replace('1', '0'));
  assert.ok(m.badge.story >= 2);
  assert.deepEqual(journalModel({ qs: s, now: T0, search: 'innkeeper', giverName: gname }).tabs.side.map((v) => v.id), ['s_sign', 's_wheel']);
  const done = act(s, { type: 'EVENT', event: 'open_chest' });
  assert.ok(journalModel({ qs: done, now: T0, giverName: gname }).tabs.done.some((v) => v.id === 's_chest'));
  assert.equal(countdown(3 * 3600_000 + 12 * 60_000 + 8_000), '03:12:08');
  let t = []; for (const id of ['a', 'b', 'c']) t = toggleTrack(t, id).tracked;
  assert.deepEqual(toggleTrack(t, 'd'), { tracked: ['a', 'b', 'c'], ok: false, reason: 'full' });
  assert.deepEqual(toggleTrack(t, 'b').tracked, ['a', 'c']);
  assert.deepEqual(questView('q_spiders', { qs: s, now: T0 }).walk, { kind: 'area', pos: [-12, 52], label: 'Stone spider field' }, 'while killing, Walk goes to the field');
});

test('journal: opens with five tabs; the spiders show Guard, 0/10 and 0/5, 20 silk and 80 XP; a second click walks there and closes', () => {
  const doc = makeDoc(), win = makeWin(); let s = spidersActive(); const walks = [], opened = [];
  s = { ...s, quests: { ...s.quests, q_spiders: { ...s.quests.q_spiders, progress: 0 } } };
  const j = createJournalUI({ doc, win, say, giverName: gname, model: (q) => journalModel({ qs: s, now: T0, search: q, giverName: gname }), onWalk: (v) => walks.push(v.id), onTrack: () => ({ ok: true }), onOpen: (t) => opened.push(t), now: () => T0 });
  j.open();
  assert.equal(j.isOpen, true); assert.deepEqual(opened, ['story']);
  assert.equal(doc.querySelectorAll('.fj-tab').length, 5);
  const row = doc.querySelector('[data-quest="q_spiders"]');
  row.click(); // select
  const d = doc.querySelector('.fj-detail').textContent;
  assert.match(d, /From: Guard/); assert.match(d, /Kill stone spiders0\/10/); assert.match(d, /Bring spider silk thread0\/5/); assert.match(d, /\+20 silk/); assert.match(d, /\+80 XP/);
  assert.match(d, /HOW TO GET IT/);
  const res = doc.querySelector('[data-res="spider_silk_thread"]'); assert.ok(res && res.querySelector('.fj-res'), 'the delivery shows the resource icon (A3 art.js)');
  assert.equal(walks.length, 0, 'selecting never moves Iris');
  doc.querySelector('[data-quest="q_spiders"]').click(); // the second click
  assert.deepEqual(walks, ['q_spiders']); assert.equal(j.isOpen, false);
});

test('journal keys: 1-5 switch tabs, T tracks, Enter walks, J and Esc close; the daily empty state shows the countdown', () => {
  const doc = makeDoc(), win = makeWin(); const s0 = act(initialQuests(), { type: 'EVENT', event: 'gather', n: 5 }); const tracks = [], walks = [];
  const j = createJournalUI({ doc, win, say, giverName: gname, model: (q) => journalModel({ qs: s0, now: T0, search: q, giverName: gname }), onWalk: (v) => walks.push(v.id), onTrack: (id) => { tracks.push(id); return { ok: true }; }, now: () => T0 });
  j.open(); win.key('Digit2'); assert.equal(j.tab, 'side');
  win.key('KeyT'); assert.equal(tracks.length, 1);
  win.key('Enter', 'Enter'); assert.equal(walks.length, 1); assert.equal(j.isOpen, false);
  j.open('daily'); assert.equal(j.tab, 'daily');
  win.key('Digit3'); assert.ok(doc.querySelector('.fj-list').textContent.length > 0);
  const rs = doc.querySelector('.fj-reset'); assert.ok(rs && /^Resets in \S/.test(rs.textContent), 'the daily tab shows the countdown to 00:00 UTC: ' + (rs && rs.textContent));
  win.key('Escape', 'Escape'); assert.equal(j.isOpen, false);
  j.open(); win.key('KeyJ'); assert.equal(j.isOpen, false);
});

test('tracker: Road Home from the gate number, the pinned quest with counters, the errand in full, collapse kept, no ellipsis', () => {
  const doc = makeDoc(), store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = spidersActive(); const opened = [], walks = [];
  const long = 'Optional: the innkeeper on the lower street has a sign to read';
  const tr = createTrackerUI({ doc, say, giverName: gname, storage, data: () => ({ tracked: [questView('q_spiders', { qs: s, now: T0, tracked: ['q_spiders'] })], road: { gateC: 3_800, feeC: 20_000 }, errand: long }), onOpen: (id) => opened.push(id), onWalk: (v) => walks.push(v.id) });
  tr.refresh(true);
  const txt = tr.root.textContent;
  assert.match(txt, /Road home38 \/ 200 silk/); assert.match(txt, /Stone Spiders on the Road/); assert.match(txt, /Kill stone spiders0\/10/);
  assert.ok(txt.includes(long), 'the errand is shown in full');
  tr.root.querySelector('.ft-walk').click(); assert.deepEqual(walks, ['q_spiders']);
  tr.root.querySelector('.ft-title').click(); assert.deepEqual(opened, ['q_spiders']);
  tr.root.querySelector('.ft-collapse').click(); assert.equal(JSON.parse(store.get('ftf.tracker.v1')).collapsed, true);
  assert.doesNotMatch(doc.getElementById('ft-css').textContent, /text-overflow\s*:\s*ellipsis/, 'R7: the tracker never cuts text');
  assert.doesNotMatch(doc.getElementById('ft-css').textContent, /white-space\s*:\s*nowrap/);
});

test('planner: around a box, none when the target is blocked or too far; the stop point', () => {
  const box = (x, z) => x >= 4 && x <= 6 && z >= -3 && z <= 3;
  const p = planPath([0, 0], [10, 0], { blocked: box });
  assert.ok(p && p.length >= 2); assert.deepEqual(p.at(-1), [10, 0]);
  for (const [x, z] of p) assert.equal(box(x, z), false);
  assert.equal(planPath([0, 0], [5, 0], { blocked: box }), null);
  assert.equal(planPath([0, 0], [500, 0]), null, 'at most 400 m');
  assert.deepEqual(planPath([0, 0], [3, 4]), [[3, 4]], 'no colliders: straight');
  assert.deepEqual(stopPoint([0, 0], [10, 0], 2.2).map((v) => +v.toFixed(2)), [7.8, 0]);
});

test('auto-walk: started, arrives at 2.2 m, cancelled by input, by a new walk, blocked after 6 s without progress', () => {
  let pos = [0, 0, 0], route = null, ended = null, t = 0; const events = [];
  const driver = { setRoute: (pts) => { route = pts; ended = null; }, cancel: () => { if (route) ended = 'cancel'; route = null; }, active: () => !!route, ended: () => ended, pos: () => pos };
  const doc = makeDoc();
  const w = createAutoWalk({ driver, doc, say, emit: (n, p) => events.push([n, p.reason || null]), now: () => t });
  w.autoWalkTo({ pos: [10, 0], label: 'Guard', questId: 'q_spiders' });
  assert.deepEqual(events.at(-1), ['autowalk.started', null]); assert.ok(route);
  assert.match(doc.querySelector('.ftf-autowalk').textContent, /Walking to Guard · 10 m · press W A S D to stop/);
  pos = [7.9, 0, 0]; t = 100; w.update();
  assert.deepEqual(events.at(-1), ['autowalk.arrived', null]); assert.equal(doc.querySelector('.ftf-autowalk'), null);
  pos = [1, 0, 0]; w.autoWalkTo({ pos: [10, 0], label: 'Guard' });
  route = null; ended = 'cancel'; w.update(); // W pressed: the town dropped the route
  assert.deepEqual(events.at(-1), ['autowalk.cancelled', 'input']);
  w.autoWalkTo({ pos: [10, 0], label: 'Guard' }); w.autoWalkTo({ pos: [20, 0], label: 'Elder' });
  assert.ok(events.some(([n, r]) => n === 'autowalk.cancelled' && r === 'replaced'));
  t = 1000; w.update(); t = 8000; w.update();
  assert.deepEqual(events.at(-1), ['autowalk.cancelled', 'blocked']);
});

test('auto-walk: a movement key wins over the 2 s re-plan toward a walking giver', () => {
  let pos = [0, 0, 0], route = null, ended = null, t = 0; const events = [];
  const driver = { setRoute: (pts) => { route = pts; ended = null; }, cancel: () => { if (route) ended = 'cancel'; route = null; }, active: () => !!route, ended: () => ended, pos: () => pos };
  const w = createAutoWalk({ driver, doc: makeDoc(), say, emit: (n, p) => events.push([n, p.reason || null]), now: () => t });
  w.autoWalkTo({ pos: [30, 0], label: 'Elder', follow: () => [31, 0] });
  route = null; ended = 'cancel'; t = 2500; w.update(); // W pressed in a slow frame, then the re-plan is due
  assert.deepEqual(events.at(-1), ['autowalk.cancelled', 'input']);
  assert.equal(route, null, 'the route stays dropped');
});

test('auto-walk: held off by the giver at talking range counts as arrived, not blocked', () => {
  let pos = [0, 0, 0], route = null, ended = null, t = 0; const events = [];
  const driver = { setRoute: (pts) => { route = pts; ended = null; }, cancel: () => { if (route) ended = 'cancel'; route = null; }, active: () => !!route, ended: () => ended, pos: () => pos };
  const w = createAutoWalk({ driver, doc: makeDoc(), say, emit: (n, p) => events.push([n, p.reason || null]), now: () => t });
  w.autoWalkTo({ pos: [10, 0], label: 'Elder' });
  pos = [7, 0, 0]; t = 100; w.update(); // 3 m away, then stuck against the Elder's collider
  t = 2000; w.update();
  assert.deepEqual(events.at(-1), ['autowalk.arrived', null]);
});

test('portraits: the five givers have one next to "From:" (letter fallback for anyone else)', async () => {
  const { portraitPath, PORTRAIT_GIVERS } = await import('../../src/quests/portraits.js');
  const { existsSync } = await import('node:fs');
  for (const g of PORTRAIT_GIVERS) for (const size of [128, 256]) {
    const p = portraitPath(g, size, '/'); assert.ok(existsSync(new URL('../../public' + p, import.meta.url)), p + ' ships');
  }
  assert.equal(portraitPath('baker'), null);
  const doc = makeDoc(), win = makeWin(); const s = spidersActive();
  const j = createJournalUI({ doc, win, say, giverName: gname, model: (q) => journalModel({ qs: s, now: T0, search: q, giverName: gname }), onWalk: () => {}, onTrack: () => ({ ok: true }), now: () => T0 });
  j.open(); doc.querySelector('[data-quest="q_spiders"]').click();
  const pic = doc.querySelector('.fj-portrait'); assert.ok(pic && /giver/.test(pic.parent.className), 'the journal detail shows the giver portrait in the From chip');
  j.close();
});
