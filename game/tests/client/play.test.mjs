// Play layer (src/play/): command bus, walk replay, context options, objectives, clan cues, hooks,
// play strings, and the onboarding played end to end through the same room as the agent API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { CommandBus } from '../../src/play/commands.js';
import { Trail, simplify, capWaypoints, MAX_WAYPOINTS } from '../../src/play/trail.js';
import { hotspotAt, contextOptions, availability, defaultOption } from '../../src/play/interactions.js';
import { currentGoal, ONBOARDING } from '../../src/play/objectives.js';
import { clanCue, reactionsFor, findClip, resolveClip, newlyUnderstood, ONE_SHOT_CLIPS } from '../../src/play/behaviour.js';
import { cuesForEvent, Hooks, VFX_MAP, AUDIO_MAP } from '../../src/play/hooks.js';
import { PlaySession } from '../../src/play/session.js';
import { PLAY_MESSAGES, createPlayI18n, renderMsg } from '../../src/play/i18n.js';
import { planRoute, placePosition, SPAWN } from '../../src/net/world-map.js';
import { EFFECT_NAMES } from '../../src/vfx/presets.js';
import { AUDIO_MANIFEST } from '../../src/audio/manifest.js';

const SEED = '0123456789abcdef0123456789abcdef';

test('play strings: EN and RU have the same keys, every message formats in both locales', () => {
  const en = Object.keys(PLAY_MESSAGES.en).sort(), ru = Object.keys(PLAY_MESSAGES.ru).sort();
  assert.deepEqual(ru, en);
  const missing = [];
  for (const loc of ['en', 'ru']) {
    const i18n = createPlayI18n(loc, { onMissing: (k) => missing.push(k) });
    for (const k of en) {
      const out = i18n.t(k, { who: 'X', n: 1, total: 7, tick: 3, ticks: 17, shell: 'II', prize: 30, deadline: 16, confidence: 25, count: 2, outcome: 'gift', fragment: 'held', link: 'speaking', offer: 'o', price: 1, a: 'A', b: 'B', amount: 3, closes: 4, title: 't', inScroll: 1, revealed: 0, open: 1, have: 1, need: 8, tension: 50, slot: 's', meaning: 'm', list: 'l', reason: 'r', index: 1 });
      assert.ok(out && out !== '…', `${loc}:${k} formats`);
    }
  }
  assert.deepEqual(missing, []);
  const en1 = createPlayI18n('en');
  assert.equal(renderMsg(en1, 'opt.talk', { who: { $agentId: 'moss' } }), 'Talk to Moss');
  assert.match(renderMsg(en1, 'opt.accept', { offer: { key: 'offer.gift', args: { who: { $agent: 5 } } } }), /^Accept: “I’ll share/);
});

test('trail: breadcrumbs simplify to at most 32 waypoints and keep the end point', () => {
  const tr = new Trail([0, 0, 0]);
  for (let i = 1; i <= 400; i++) tr.record([i * 0.5, 0, Math.sin(i / 7) * 6]);
  const w = tr.waypoints([200.2, 0, 1]);
  assert.ok(w.length <= MAX_WAYPOINTS && w.length >= 2);
  assert.deepEqual(w[w.length - 1], [200.2, 1]);
  assert.equal(simplify([[0, 0], [1, 0.01], [2, 0]]).length, 2);
  assert.equal(capWaypoints(Array.from({ length: 100 }, (_, i) => [i, 0]), 10).length, 10);
});

test('command bus: one decision = one idempotency key; a replay never pays twice; stale versions retry', async () => {
  const tr = createLocalTransport({ seedHex: SEED });
  const bus = new CommandBus(tr);
  assert.equal((await bus.send('start_season', {})).ok, true);
  const key = bus.key('forget');
  const a = await bus.send('sacrifice_memory', { memoryId: 2 }, { key });
  const b = await bus.send('sacrifice_memory', { memoryId: 2 }, { key });
  assert.equal(a.ok, true); assert.equal(b.replayed, true); assert.equal(b.ok, true);
  const obs = (await tr.observe()).body.observation;
  assert.equal(obs.iris.attention, 2, 'attention paid once');
  bus.version = 1; // stale on purpose
  const c = await bus.send('set_reading_rule', { rule: 'dots' });
  assert.equal(c.ok, true); assert.equal(bus.stats().conflicts, 1);
  const d = await bus.send('contribute_fragment', {});
  assert.equal(d.ok, false); assert.equal(d.reason, 'not_near'); // proximity is the room's call
});

test('hotspots and options come from the room: the Scroll offers the contribution, anchors the vision', async () => {
  const tr = createLocalTransport({ seedHex: SEED });
  const s = new PlaySession({ transport: tr });
  await s.start();
  assert.deepEqual(hotspotAt({ zone: 'island', pos: [0, 0, 4] }), { kind: 'scroll' });
  assert.deepEqual(hotspotAt({ zone: 'island', pos: placePosition('anchor_zone:2').position }), { kind: 'anchor', shell: 2 });
  assert.deepEqual(hotspotAt({ zone: 'island', pos: placePosition('camp:moss').position }), { kind: 'camp', clan: 'moss' });
  assert.deepEqual(hotspotAt({ zone: 'shell', pos: [0, 0, -8], shellSpots: { glass: [0, -8.6], radius: 4 } }), { kind: 'glass' });
  const opts = contextOptions({ kind: 'scroll' }, s.obs, s.actions);
  const contribute = opts.find((o) => o.id === 'contribute');
  assert.ok(contribute, 'contribute offered');
  assert.equal(contribute.available, true, 'not_near is deferred: the play layer replays the walk first');
  assert.equal(opts[defaultOption(opts)].id, 'contribute');
  assert.deepEqual(availability(s.actions, 'end_tick', {}), { available: true, reason: null });
  const camp = contextOptions({ kind: 'camp', clan: 'moss' }, s.obs, s.actions);
  assert.ok(camp.some((o) => o.cmd && o.cmd.type === 'talk'));
  s.dispose();
});

/** Walks the client avatar along the room's walk graph (as the G key does) and feeds the session. */
function walk(s, place) {
  const pts = planRoute(s.client.pos || SPAWN, place);
  let pos = (s.client.pos || SPAWN).slice();
  for (const [x, z] of pts) {
    const d = Math.hypot(x - pos[0], z - pos[2]), n = Math.max(1, Math.ceil(d / 0.5));
    const from = pos.slice();
    for (let i = 1; i <= n; i++) { pos = [from[0] + ((x - from[0]) * i) / n, 0, from[2] + ((z - from[2]) * i) / n]; s.setClient({ zone: 'island', pos }); }
  }
  const dest = placePosition(place).position;
  s.setClient({ zone: 'island', pos: dest.slice() });
}

test('onboarding plays end to end: Scroll → contribution → Price of Memory → anchor → end tick → talk', async () => {
  const tr = createLocalTransport({ seedHex: SEED });
  const s = new PlaySession({ transport: tr });
  const goals = [];
  s.on('goal', (g) => g && goals.push(g.id));
  await s.start();
  s.setClient({ zone: 'island', pos: SPAWN.slice() });
  assert.equal(s.goal.id, 'reach_scroll');
  assert.equal(s.goal.target, 'scroll');
  walk(s, 'scroll');
  assert.equal(s.goal.id, 'fragment');
  const contribute = s.options.find((o) => o.id === 'contribute');
  const r = await s.run(contribute);
  assert.equal(r.ok, true, 'first contribution accepted: ' + r.reason);
  assert.equal(s.lastSync.mode, 'trail', 'the walked trail was replayed to the room');
  assert.equal(s.obs.iris.fragment.status, 'scroll');
  assert.equal(s.goal.id, 'forget');
  const f = await s.send('sacrifice_memory', { memoryId: 2, purpose: 'vision' });
  assert.equal(f.ok, true);
  assert.equal(s.goal.id, 'anchor');
  const zone = s.goal.target;
  assert.match(zone, /^anchor_zone:[1-4]$/);
  walk(s, zone);
  const anchor = s.options.find((o) => o.cmd && o.cmd.type === 'place_anchor' && o.available !== false);
  const a = await s.run(anchor);
  assert.equal(a.ok, true, 'anchor accepted: ' + a.reason);
  assert.equal(s.goal.id, 'end_tick');
  const e = await s.send('end_tick', {});
  assert.equal(e.ok, true);
  assert.equal(s.obs.season.tick, 2);
  assert.equal(s.goal.id, 'talk');
  walk(s, s.goal.target);
  const talk = s.options.find((o) => o.cmd && o.cmd.type === 'talk');
  let dialogue = null; s.on('dialogue', (d) => { dialogue = d; });
  assert.equal((await s.run(talk)).ok, true);
  assert.ok(dialogue && dialogue.lines.length > 0);
  assert.equal(s.goal.id, 'ask');
  const seen = goals.filter((g, i) => g !== 'intro' && g !== goals[i - 1]);
  assert.deepEqual(seen, ONBOARDING, 'one goal at a time, in onboarding order');
  const hist = (await tr.history()).body.history;
  assert.ok(hist.every((h) => h.ok), 'no rejected commands during the onboarding');
  s.dispose();
});

test('a full season reaches the vote and the end through the play session', async () => {
  const tr = createLocalTransport({ seedHex: SEED });
  const s = new PlaySession({ transport: tr, skipOnboarding: true });
  await s.start();
  for (let i = 0; i < 20 && s.obs.season.phase === 'play'; i++) await s.send('end_tick', {});
  if (s.obs.season.phase === 'vote') {
    assert.equal(currentGoal(s.obs, s.flags).id, 'vote');
    walk(s, 'scroll');
    const vote = s.options.find((o) => o.id === 'vote:yes');
    assert.equal((await s.run(vote)).ok, true);
  }
  assert.equal(s.obs.season.phase, 'end');
  assert.equal(currentGoal(s.obs, s.flags).id, 'season_over');
  assert.equal((await s.send('set_heir', { heir: false })).ok, true);
  s.dispose();
});

test('clan cues make minds legible: offers lean in, broken links turn away, isolation slumps', () => {
  const obs = (rel, offers = [], tension = 10) => ({ season: { tension }, offers, relationships: { clans: [{ clan: 'moss', trustInIris: 50, linkBroken: false, isolated: false, fragment: 'held', ...rel }] } });
  assert.equal(clanCue('moss', obs({}, [{ from: 'moss' }])).clip, 'gesture_offer');
  const broken = clanCue('moss', obs({ linkBroken: true }));
  assert.equal(broken.clip, 'defeat'); assert.equal(broken.face, 'away'); assert.ok(broken.approach < 0);
  assert.equal(clanCue('moss', obs({ isolated: true })).glyph, 'isolated');
  assert.equal(clanCue('moss', obs({ trustInIris: 80 })).mood, 'warm');
  assert.equal(clanCue('frost', { season: { tension: 0 }, offers: [], relationships: { clans: [] } }).clip, 'think', 'the scholar thinks at rest');
  assert.equal(clanCue('moss', obs({}), { talking: true }).clip, 'talk');
  const re = reactionsFor({ type: 'scroll.fragment_changed', data: { clan: 'amber', from: 'held', to: 'scroll' } }, 10);
  assert.equal(re.amber.clip, 'celebrate');
  assert.equal(clanCue('amber', { season: { tension: 0 }, offers: [], relationships: { clans: [] } }, { reaction: re.amber, now: 11 }).clip, 'celebrate');
  const clips = [{ name: 'agent_moh|Idle' }, { name: 'talk.001' }];
  assert.equal(findClip(clips, 'idle').name, 'agent_moh|Idle');
  assert.equal(resolveClip(clips, 'gesture_offer').name, 'talk', 'missing clip falls back gracefully');
  assert.equal(resolveClip([], 'celebrate').clip, null);
});

test('Iris winks (understand) only when a dictionary word becomes known', () => {
  const dict = (...known) => ({ dictionary: { cells: [0, 1, 2, 3].map((f) => ({ slot: 1, form: f, known: known.includes(f) ? 2 : null })) } });
  assert.equal(newlyUnderstood(dict(), dict(2)), 1);
  assert.equal(newlyUnderstood(dict(2), dict(2)), 0, 'an already known word is not new');
  assert.equal(newlyUnderstood(dict(2), dict(0, 2, 3)), 2);
  assert.equal(newlyUnderstood(null, dict(2)), 0, 'the first observation never triggers');
  assert.equal(resolveClip([{ name: 'think' }], 'understand').name, 'think', 'older glbs fall back to think');
  assert.ok(ONE_SHOT_CLIPS.includes('understand'));
});

test('hooks: room events become named cues that exist in the VFX and audio modules', () => {
  const cues = cuesForEvent({ type: 'fx', data: { fx: { type: 'memory_burned', kind: 'call', purpose: 'vision' } } }).map((c) => c.name);
  assert.deepEqual(cues, ['memory_burn', 'vision']);
  assert.equal(cuesForEvent({ type: 'fx', data: { fx: { type: 'event', place: 1, action: 1, power: 2 } } })[0].name, 'reveal_storm');
  for (const v of Object.values(VFX_MAP)) assert.ok(EFFECT_NAMES.includes(v), 'vfx effect ' + v);
  for (const a of Object.values(AUDIO_MAP)) assert.ok(AUDIO_MANIFEST.sounds[a] || AUDIO_MANIFEST.groups[a], 'sound ' + a);
  const calls = [];
  const h = new Hooks({ resolve: () => [1, 2, 3] });
  h.attachVfx({ play: (n, o) => calls.push(['vfx', n, o.position]) });
  h.attachAudio({ play: () => { throw new Error('boom'); } }); // a broken module never breaks the game
  h.event({ type: 'fx', data: { fx: { type: 'anchor', place: 0, t: 3 } } });
  assert.deepEqual(calls, [['vfx', 'anchor_plant', [1, 2, 3]]]);
});
