// The Guests behind the glass (src/play/guests-stage.js): the seeded moment scheduler the Shell scene
// stages. Pure logic: which cues start which moments, priorities, the seeded drift schedule, quality
// sets, reduced motion, the clip fallbacks and the ink pen, and the moments a real season triggers in
// both play modes (hub flights and walking in) through the same room code as the agent API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuestsStage, MOMENTS, MOMENT_DEFS, QUALITY, momentForCue, stageQualityFor, slotsFor, hashSeed, mulberry32, resolveClip, inkPenPoint, DRAWING_SLOT } from '../../src/play/guests-stage.js';
import { cuesForEvent } from '../../src/play/hooks.js';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { ShellHub } from '../../src/play/hub.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const run = (st, seconds, step = 1 / 30) => { let t = st.raw; for (let i = 0; i < seconds / step; i++) { t += step; st.update(t, step); } return st.state; };

test('guests: cues map to moments; every moment has a definition; unknown cues are ignored', () => {
  assert.deepEqual(momentForCue('reveal_storm'), { name: 'reveal', action: 'storm' });
  assert.deepEqual(momentForCue('reveal_silence'), { name: 'reveal', action: 'silence' });
  assert.equal(momentForCue('crisis').name, 'crisis');
  assert.equal(momentForCue('double_ring').name, 'vote');
  assert.equal(momentForCue('guest_yes').name, 'yes');
  assert.equal(momentForCue('guest_no').name, 'no');
  assert.equal(momentForCue('shell_enter', { shell: 2 }).shell, 2);
  assert.equal(momentForCue('anchor_placed'), null);
  for (const m of MOMENTS) assert.ok(MOMENT_DEFS[m], 'definition for ' + m);
  const st = new GuestsStage();
  st.enter(1);
  assert.equal(st.cue('nonsense'), false);
  assert.equal(st.cue('sign'), true);
});

test('guests: the drift schedule is seeded (same seed, same drifts; another seed differs; never a fixed interval)', () => {
  const sched = (seed) => {
    const st = new GuestsStage({ seed });
    st.enter(1);
    const log = [];
    let last = null;
    for (let i = 0; i < 60 * 400; i++) {
      const s = st.update(i / 60, 1 / 60);
      if (s.moment && s.moment.name === 'drift' && (!last || last !== st.moment.start)) { last = st.moment.start; log.push([+last.toFixed(2), s.moment.slot]); }
    }
    return log;
  };
  const a = sched('season-a'), b = sched('season-a'), c = sched('season-b');
  assert.ok(a.length >= 5, 'several drifts in 400 s: ' + a.length);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const gaps = a.slice(1).map((x, i) => x[0] - a[i][0]);
  assert.ok(new Set(gaps.map((g) => g.toFixed(1))).size > 1, 'gaps vary: ' + gaps.join(', '));
  assert.ok(gaps.every((g) => g >= 18 && g <= 58 + 20), 'gaps inside the seeded range plus a drift: ' + gaps.join(', '));
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  const r = mulberry32(42); const x = r(); assert.ok(x >= 0 && x < 1); assert.notEqual(x, r());
});

test('guests: a sign brings the drawing Guest to the glass and back; stronger moments interrupt, weaker ones wait', () => {
  const st = new GuestsStage({ seed: 's' });
  st.enter(2);
  const rest = st.state.guests[DRAWING_SLOT].depth;
  assert.equal(st.cue('sign'), true);
  let s = run(st, 6);
  assert.equal(s.moment.name, 'sign'); assert.equal(s.moment.phase, 'hold');
  assert.ok(s.guests[DRAWING_SLOT].depth > rest + 0.35, 'the drawing Guest came forward: ' + s.guests[DRAWING_SLOT].depth);
  assert.equal(s.guests[DRAWING_SLOT].clip, 'draw');
  assert.ok(s.guests[0].depth < s.guests[DRAWING_SLOT].depth && s.guests[2].depth < s.guests[DRAWING_SLOT].depth, 'the giants stay behind');
  assert.ok(s.camera > 0.3 && s.swell > 0.3, 'camera hint and swell rise');
  assert.equal(st.cue('drift'), false, 'a drift never interrupts a sign');
  assert.equal(st.cue('crisis'), true, 'the crisis interrupts the sign');
  s = run(st, 8);
  assert.equal(s.moment.name, 'crisis');
  assert.ok(s.guests[0].scale > 2.7 && s.guests[2].scale > 2.5, 'the giants loom');
  assert.ok(s.mist.churn > 1.5, 'the mist churns');
  s = run(st, 30);
  assert.ok(!s.moment || s.moment.name === 'drift', 'the crisis ends (a seeded drift may follow): ' + JSON.stringify(s.moment));
  assert.ok(Math.abs(s.guests[DRAWING_SLOT].depth - rest) < 0.03 || (s.moment && s.moment.slot === DRAWING_SLOT), 'back at rest');
  assert.ok(s.camera < 0.02, 'camera released');
});

test('guests: reveal reactions differ by action; yes opens, no folds; vote faces squarely', () => {
  const after = (name, data, secs) => { const st = new GuestsStage({ seed: 'r' }); st.enter(1); st.cue(name, data); return run(st, secs); };
  const gift = after('reveal', { action: 'gift' }, 4.5), storm = after('reveal', { action: 'storm' }, 2.5), silence = after('reveal', { action: 'silence' }, 5), call = after('reveal', { action: 'call' }, 5);
  assert.ok(gift.guests[1].open > 0.2 && storm.guests[1].open < -0.4, 'gift opens, storm folds');
  assert.ok(storm.mist.churn > 2, 'storm churns the mist');
  assert.ok(silence.guests[1].depth < 0.2 && silence.guests[1].light < 0.15, 'silence sinks away');
  assert.ok(call.guests[0].rise > 2 && call.guests[2].rise > 2, 'a call lifts the giants');
  assert.equal(gift.moment.action, 'gift');
  const yes = after('yes', {}, 2), no = after('no', {}, 2), vote = after('vote', {}, 10);
  assert.ok(yes.guests[1].open > 0.5 && yes.guests[1].light > 0.8);
  assert.ok(no.guests[1].open < -0.5 && no.guests[1].light < 0.2);
  for (const g of vote.guests) assert.ok(Math.abs(g.face) < 0.05, 'before the vote every Guest faces the visitor');
});

test('guests: quality sets (3 Guests, fewer on low, one on phones) and reduced motion without drift', () => {
  assert.deepEqual(Object.values(QUALITY).map((q) => q.guests), [3, 3, 2, 1]);
  assert.equal(stageQualityFor({ tier: 'ultra', profile: 'desktop' }), 'ultra');
  assert.equal(stageQualityFor({ tier: 'high', profile: 'phone' }), 'phone');
  assert.equal(stageQualityFor({ tier: 'nonsense' }), 'high');
  assert.deepEqual(slotsFor(1), [DRAWING_SLOT]);
  assert.deepEqual(slotsFor(2), [DRAWING_SLOT, 0]);
  const st = new GuestsStage({ seed: 'q', quality: 'phone', reducedMotion: true });
  st.enter(1);
  let s = run(st, 120);
  assert.equal(s.moment, null, 'no drift under reduced motion');
  assert.equal(s.guests.filter((g) => g.onStage).length, 1);
  const motion = new GuestsStage({ seed: 'q', quality: 'phone' }); motion.enter(1); run(motion, 120);
  assert.equal(motion.drifts, st.drifts, 'the seeded sequence advances the same way with or without motion');
  st.cue('sign');
  s = run(st, 2);
  const depthBefore = s.guests[DRAWING_SLOT].depth;
  s = run(st, 4);
  assert.ok(s.guests[DRAWING_SLOT].depth > 0.6, 'placed at the glass');
  assert.ok(depthBefore < 0.3 || depthBefore > 0.6, 'no travel in between: it stands either at rest or at the glass');
  assert.equal(s.camera, 0, 'no camera hint under reduced motion');
  assert.equal(s.mist.churn, 0, 'the mist stands still');
});

test('guests: clip fallbacks and the ink pen follow the drawing schedule', () => {
  assert.equal(resolveClip('approach', { idle: 1, draw: 1 }), 'idle');
  assert.equal(resolveClip('approach', { idle: 1, approach: 1 }), 'approach');
  assert.equal(resolveClip('react', new Set(['idle', 'react'])), 'react');
  assert.equal(resolveClip('idle', []), null);
  const sign = { forms: [0, 1, 2, 3], dots: 1 };
  const p0 = inkPenPoint(sign, 0.05, 2);
  assert.equal(p0.stroke, 0); assert.equal(p0.pos, 1); assert.ok(Math.abs(p0.x - 2.26) < 1e-6 && Math.abs(p0.y) < 1e-6, 'first stroke at the right (reading starts at position 1)');
  assert.equal(inkPenPoint(sign, 0.4, 2).pos, 3);
  const ring = inkPenPoint(sign, 0.75, 2);
  assert.equal(ring.stroke, 4); assert.ok(Math.hypot(ring.x, ring.y) - 2 < 1e-6, 'on the ring');
  assert.equal(inkPenPoint(sign, 0.95, 2), null, 'the pen lifts while the sign turns');
  assert.equal(inkPenPoint(null, 0.5), null);
});

test('guests: warp and freeze (stills) keep the stage consistent with the play clock', () => {
  const st = new GuestsStage({ seed: 'w' });
  st.enter(1); st.update(3, 1 / 60);
  st.cue('crisis');
  st.warp(8);
  assert.equal(st.state.moment.phase, 'hold');
  assert.ok(st.state.guests[0].depth > 0.6, 'the warp eased the pose');
  st.freeze(true);
  const before = st.state;
  st.update(50, 0.25);
  assert.equal(st.state.now, before.now, 'frozen: the clock stands');
  st.freeze(false);
  st.update(50.25, 0.25);
  assert.ok(st.state.now > before.now, 'released: it runs on');
});

/** Feeds the room's view events through the cue table into a stage, the way presentation.js does. */
function wire(session, stage) {
  session.on('event', (ev) => { for (const c of cuesForEvent(ev)) { const m = momentForCue(c.name, c.data); if (m && m.name !== 'enter' && m.name !== 'exit') stage.cue(m.name, { action: m.action }); } });
  session.on('zone', (r) => { if (r.zone === 'shell') stage.enter(r.shell); else stage.exit(); });
}

test('guests: a real season in the hub triggers reveal, crisis and vote moments (seeded, deterministic)', async () => {
  const play = async () => {
    const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
    await s.start();
    s.flags.hub = true; s.recompute();
    const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
    const stage = new GuestsStage({ seed: s.obs.season.merkleRoot });
    wire(s, stage);
    const seen = [];
    const note = () => { const m = stage.moment; const key = m && m.name + ':' + (m.action || '') + '@' + s.obs.season.tick; if (m && seen[seen.length - 1] !== key) seen.push(key); };
    await hub.flyTo(1); note();
    assert.equal(stage.inside, true);
    for (let i = 0; i < 40 && s.obs.season.phase === 'play'; i++) {
      if (!hub.inShell) await hub.flyTo(1);
      await hub.leave(); note();
      if (hub.card) { hub.card.kind === 'vote' ? await hub.resolve('accept') : hub.card.kind === 'heir' ? await hub.resolve('none') : hub.dismiss(); note(); }
    }
    s.dispose();
    return seen;
  };
  const a = await play();
  assert.ok(a.some((k) => k.startsWith('reveal:')), 'a reveal moment: ' + a.join(' '));
  assert.ok(a.some((k) => k.startsWith('crisis')), 'the crisis moment: ' + a.join(' '));
  assert.ok(a.some((k) => k.startsWith('vote')), 'the vote moment: ' + a.join(' '));
  const b = await play();
  assert.deepEqual(b, a, 'the same season gives the same moments');
});

test('guests: walking in (no hub) arms the stage through the zone event and the sign cue comes from the scene', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  const stage = new GuestsStage({ seed: 'walk' });
  wire(s, stage);
  assert.equal((await s.send('move', { to: 'anchor_zone:1' })).ok, true);
  assert.equal((await s.send('enter_shell', { shell: 1 })).ok, true);
  assert.equal(stage.inside, true); assert.equal(stage.shell, 1);
  assert.ok(Number.isFinite(stage.nextDrift), 'a drift is scheduled');
  assert.equal((await s.send('exit_shell', {})).ok, true);
  assert.equal(stage.inside, false); assert.equal(stage.nextDrift, Infinity);
  s.dispose();
});
