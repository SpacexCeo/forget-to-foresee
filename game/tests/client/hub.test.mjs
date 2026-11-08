// The Shell hub (src/play/hub.js): flights into Shells, staking on a reading from inside, leaving
// ends the trial, automatic trials stop for a new sign or a decision card, and a whole season can
// be played through the hub with only room commands (the same API as an agent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { ShellHub, signsByShell, signForShell, impliedTick, interruptFor, autopilotMoves } from '../../src/play/hub.js';
import { currentGoal, hubGoal } from '../../src/play/objectives.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const noPause = async () => {};

async function setup(seedHex = JUDGE) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  return { s, hub: new ShellHub({ session: s, sleep: noPause, pauseMs: 0 }) };
}

test('hub: signs are grouped by the Shell Iris reads them for; the trial is publication + delay + 1', async () => {
  const { s } = await setup();
  const by = signsByShell(s.obs);
  assert.deepEqual([...by.keys()], [1, 2, 3, 4]);
  const all = [...by.values()].flat();
  assert.equal(all.length, s.obs.prophecies.length, 'every visible sign belongs to one Shell');
  const p = all[0];
  assert.equal(impliedTick(p, p.reading.slots.map((x) => x.meaning)), p.impliedAnchor.tick);
  assert.equal(signForShell(s.obs, p.impliedAnchor.shell).index, p.index);
  assert.ok(signForShell(s.obs, 4), 'a Shell with no sign of its own still shows the newest sign');
  s.dispose();
});

test('hub: fly in, change a slot, stake from inside the Shell, stay inside', async () => {
  const { s, hub } = await setup();
  const silk = s.obs.iris.silk;
  const n = [...signsByShell(s.obs)].find(([, v]) => v.length)[0];
  assert.equal((await hub.flyTo(n)).ok, true);
  assert.equal(s.obs.you.zone, 'shell'); assert.equal(s.obs.you.shell, n);
  assert.equal(currentGoal(s.obs, s.flags).id, 'stake');
  hub.cycleSlot(3, 1); // the human reads the delay one trial later than Iris
  const target = hub.target();
  const r = await hub.stake();
  assert.equal(r.ok, true, r.reason);
  assert.equal(s.obs.you.zone, 'shell', 'the room avatar is back inside');
  assert.equal(s.obs.iris.silk, silk - 10);
  assert.ok(s.obs.iris.anchors.some((a) => a.shell === target.shell && a.tick === target.tick), 'anchored where the human read it');
  const again = await hub.stake();
  assert.equal(again.ok, false, 'the same stake twice is refused before anything is sent');
  assert.equal(currentGoal(s.obs, s.flags).id, 'leave');
  s.dispose();
});

test('hub: leaving ends the trial and automatic trials stop at a new sign or a decision', async () => {
  const { s, hub } = await setup();
  await hub.flyTo(1);
  const tick = s.obs.season.tick;
  await hub.leave();
  assert.equal(s.obs.you.zone, 'island');
  assert.ok(s.obs.season.tick > tick, 'the trial ended');
  assert.equal(hub.advancing, false);
  const stopped = hub.card || (hub.notice && hub.notice.key === 'hub.notice.newSign') || s.obs.season.phase !== 'play';
  assert.ok(stopped, 'stops for a reason the player can see');
  s.dispose();
});

test('hub: decision cards: word sales and gifts never block; loans, pacts, fragment, Key and vote do', () => {
  const base = { season: { phase: 'play', tick: 6, contributionDeadline: 16 }, iris: { fragment: { status: 'contributed' }, keyVision: { open: false }, ashKey: { known: false } }, relationships: { clans: [] } };
  assert.equal(interruptFor({ ...base, offers: [{ id: 1, kind: 'sell', from: 'salt' }, { id: 2, kind: 'gift', from: 'moss' }] }), null);
  assert.equal(interruptFor({ ...base, offers: [{ id: 3, kind: 'loan', from: 'amber' }] }).kind, 'offer');
  assert.equal(interruptFor({ ...base, offers: [{ id: 3, kind: 'loan', from: 'amber' }] }, new Set(['offer:3'])), null, 'a dismissed card stays dismissed');
  assert.equal(interruptFor({ ...base, offers: [], iris: { ...base.iris, fragment: { status: 'held' } } }).kind, 'fragment');
  assert.equal(interruptFor({ ...base, offers: [], iris: { ...base.iris, keyVision: { open: true } } }).kind, 'key');
  assert.equal(interruptFor({ ...base, offers: [], season: { ...base.season, phase: 'vote' } }).kind, 'vote');
  assert.equal(interruptFor({ ...base, offers: [], season: { ...base.season, phase: 'end', heir: null } }).kind, 'heir');
  assert.deepEqual(autopilotMoves({ ...base, offers: [{ id: 2, kind: 'gift', from: 'moss' }] }).map((m) => [m.type, m.args.offerId, m.place]), [['accept_offer', 2, 'camp:moss']]);
});

test('hub: a whole season played only through the hub reaches the end', async () => {
  const { s, hub } = await setup();
  let guard = 0, stakes = 0;
  while (s.obs.season.phase !== 'end' && guard++ < 80) {
    if (hub.card) {
      const choice = { offer: 'later', fragment: 'give', speak: 'speak', key: 'later', vote: 'accept', heir: 'keep' }[hub.card.kind];
      const r = await hub.resolve(choice);
      assert.equal(r.ok, true, `${choice}: ${r.reason}`);
      continue;
    }
    const n = [...signsByShell(s.obs)].find(([, v]) => v.length);
    if (n && s.obs.iris.attention > 0 && s.obs.iris.silk >= 10) {
      await hub.flyTo(n[0]);
      if ((await hub.stake()).ok) stakes++;
      await hub.leave();
    } else await hub.advance();
  }
  assert.equal(s.obs.season.phase, 'end');
  assert.ok(s.obs.season.outcome);
  assert.ok(stakes >= 3, `staked ${stakes} times`);
  assert.ok(s.obs.iris.fragment.status !== 'held', 'the fragment card was answered');
  assert.equal(s.bus.stats().rejections, 0, 'the hub never sends a command the room refuses');
  s.dispose();
});

test('hub goals and strings: every hub key exists in all five languages', async () => {
  const { s } = await setup();
  assert.equal(hubGoal(s.obs, s.flags).id, 'fly');
  assert.ok(hubGoal(s.obs, s.flags).target.startsWith('shell:'));
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('hub.'));
  assert.ok(keys.length > 60);
  for (const loc of ['en', 'uk', 'ru', 'it', 'zh']) {
    const i18n = createPlayI18n(loc, { onMissing: () => {} });
    for (const k of keys) {
      assert.ok(k in PLAY_MESSAGES[loc], `${loc}:${k}`);
      const out = i18n.t(k, { shell: 'II', tick: 3, ticks: 17, count: 2, who: 'X', offer: 'o', prize: 30, deadline: 16, have: 1, need: 8, confidence: 40, slot: 's', action: 'Gift', silk: 50, attention: 2, outcome: 'gift', text: 't' });
      assert.ok(out && out !== '…', `${loc}:${k} formats`);
    }
  }
  s.dispose();
});
