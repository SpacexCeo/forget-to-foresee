// Simple mode (src/play/simple.js): one proposal per trial over the hub API. A whole season is played
// headless by confirming every proposal (in each of the five locales the texts render clean), the
// recommendations are what Iris's policy says, the card renders and reacts (Enter, Pause, "let me
// choose", hold-to-confirm for the Heir), and the engine never refuses a command the mode sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './lib/mini-dom.mjs';
import { createLocalTransport } from '../src/play/transport-local.js';
import { PlaySession } from '../src/play/session.js';
import { ShellHub } from '../src/play/hub.js';
import { proposalFor, runProposal, recommendFor, waitingSign, AUTO_PASS_MS } from '../src/play/simple.js';
import { createPlayI18n, renderMsg, PLAY_MESSAGES } from '../src/play/i18n.js';
import { createSafeStorage, memoryStorage } from '../src/ui/storage.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const LOCALES = ['en', 'uk', 'ru', 'it', 'zh'];
const noPause = async () => {};
const i18ns = Object.fromEntries(LOCALES.map((l) => [l, createPlayI18n(l, { onMissing: (k) => { throw new Error(l + ' missing ' + k); } })]));

async function hubSeason(seedHex = JUDGE) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  return { s, hub: new ShellHub({ session: s, sleep: noPause, pauseMs: 0 }) };
}

function renderAll(p, label) {
  for (const loc of LOCALES) {
    const i18n = i18ns[loc];
    for (const ref of [p.title, p.why]) {
      const text = renderMsg(i18n, ref.key, ref.args);
      assert.ok(text && text !== '…' && !/[{}]/.test(text), `${label} ${loc}: ${text}`);
      assert.ok(text.length <= 230, `${label} ${loc} too long: ${text}`);
    }
  }
}

test('simple: confirming every proposal plays a whole season; every text renders in five locales; no refused command', async () => {
  for (const seed of [JUDGE, '0123456789abcdef0123456789abcdef']) {
    const { s, hub } = await hubSeason(seed);
    const kinds = new Set();
    let guard = 0, stakes = 0;
    while (guard++ < 120) {
      const p = proposalFor(s.obs, { hub });
      if (!p) { assert.equal(s.obs.season.phase, 'end'); break; }
      kinds.add(p.kind);
      renderAll(p, `${seed.slice(0, 4)} ${p.kind} t${s.obs.season.tick}`);
      assert.ok(p.actions.length > 0 || p.kind === 'passing', p.kind);
      if (p.kind === 'heir') { await runProposal(hub, p, 'keep'); continue; }
      if (p.kind === 'key') { let opened = 0; await runProposal(hub, p, 'memories', { onOpenMemories: () => opened++ }); assert.equal(opened, 1); continue; }
      const action = p.primary;
      const before = s.obs.iris.anchors.length;
      const r = await runProposal(hub, p, action);
      assert.ok(r.ok, `${p.kind}/${action} at trial ${s.obs.season.tick}: ${r.reason}`);
      if (p.kind === 'stake' && s.obs.iris.anchors.length > before) stakes++;
    }
    assert.equal(s.obs.season.phase, 'end', 'the season ended');
    assert.ok(s.obs.season.outcome);
    assert.ok(stakes >= 2, `staked ${stakes} times`);
    assert.ok(kinds.has('stake') && kinds.has('pass') && kinds.has('card'), [...kinds].join(','));
    assert.equal(s.bus.stats().rejections, 0, 'Simple mode never sends a command the room refuses');
    assert.equal(s.obs.iris.fragment.status, 'scroll', 'the fragment went to the Scroll as Iris recommended');
    s.dispose();
  }
});

test('simple: proposals follow the state: a waiting sign → stake; inside → stake and leave / leave; nothing → pass (auto)', async () => {
  const { s, hub } = await hubSeason();
  const p0 = proposalFor(s.obs, { hub });
  assert.equal(p0.kind, 'stake');
  assert.deepEqual(p0.actions, ['stake', 'read', 'skip']);
  assert.equal(p0.primary, 'stake');
  assert.equal(p0.shell, waitingSign(s.obs).impliedAnchor.shell);
  const en = renderMsg(i18ns.en, p0.title.key, p0.title.args);
  assert.match(en, /^Fly into Shell (I|II|III|IV) and stake 10 silk on my reading$/);
  assert.match(renderMsg(i18ns.en, p0.why.key, p0.why.args), /I read the sign there as (Gift|Storm|Silence|Call) of (10|20|40|80) at Shell/);
  // "let me read it first" flies in without staking
  await runProposal(hub, p0, 'read');
  assert.equal(s.obs.you.zone, 'shell');
  const p1 = proposalFor(s.obs, { hub });
  assert.equal(p1.kind, 'inside');
  assert.deepEqual(p1.actions, ['stake', 'leave']);
  hub.cycleSlot(3, 1); // the player changes the delay: the proposal follows the draft
  const p2 = proposalFor(s.obs, { hub });
  assert.equal(p2.title.args.tick, p1.title.args.tick + 1);
  hub.resetDraft();
  const anchors = s.obs.iris.anchors.length;
  const r = await runProposal(hub, p2, 'stake');
  assert.ok(r.ok);
  assert.ok(s.obs.iris.anchors.length > anchors || s.obs.season.tick > 1, 'the stake was placed (a Gift share may already have paid it back)');
  assert.equal(s.obs.you.zone, 'island', 'stake and leave ends on the island');
  // later: a Shell whose reading is already staked proposes leaving
  const wait = waitingSign(s.obs);
  if (wait) {
    await hub.flyTo(wait.impliedAnchor.shell);
    await hub.stake();
    const p3 = proposalFor(s.obs, { hub });
    assert.equal(p3.kind, 'leave');
    assert.equal(p3.title.key, 'simple.staked.title');
    await hub.leave();
  }
  // passing time while the hub advances shows the status proposal with no actions
  hub.advancing = true;
  assert.equal(proposalFor(s.obs, { hub }).kind, 'passing');
  hub.advancing = false;
  // no silk: the pass proposal explains why
  const poor = { ...s.obs, iris: { ...s.obs.iris, silk: 3 } };
  const pp = proposalFor(poor, { hub });
  if (waitingSign(poor)) { assert.equal(pp.kind, 'pass'); assert.equal(pp.why.key, 'simple.pass.whyLow'); assert.equal(pp.auto, true); }
  s.dispose();
});

test('simple: recommendations come from the visible state only, and never decide memory, vote or Heir alone', () => {
  const obs = { chronicle: [{ meaning: { action: 'gift' } }, { meaning: { action: 'storm' } }, { meaning: { action: 'gift' } }] };
  assert.equal(recommendFor({ kind: 'offer', offer: { kind: 'gift', from: 'moss' } }, obs).choice, 'accept');
  assert.equal(recommendFor({ kind: 'offer', offer: { kind: 'sell', from: 'salt' } }, obs).choice, 'later');
  assert.equal(recommendFor({ kind: 'offer', offer: { kind: 'loan', from: 'amber' } }, obs).choice, 'decline');
  assert.equal(recommendFor({ kind: 'offer', offer: { kind: 'pact', from: 'ash' } }, obs).choice, 'accept');
  assert.equal(recommendFor({ kind: 'fragment' }, obs).choice, 'give');
  assert.equal(recommendFor({ kind: 'speak' }, obs).choice, 'speak');
  assert.equal(recommendFor({ kind: 'key' }, obs).choice, 'memories', 'forgetting is never delegated: the memories open');
  const v = recommendFor({ kind: 'vote' }, obs);
  assert.equal(v.choice, 'accept');
  assert.deepEqual(v.why.args, { gifts: 2, storms: 1 });
  assert.equal(recommendFor({ kind: 'vote' }, { chronicle: [{ meaning: { action: 'storm' } }] }).choice, 'reject');
  assert.equal(recommendFor({ kind: 'heir' }, obs).choice, null, 'the Heir has no recommendation');
  for (const loc of LOCALES) for (const k of Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('simple.'))) assert.ok(k in PLAY_MESSAGES[loc], `${loc}:${k}`);
  assert.equal(AUTO_PASS_MS, 1600);
});

test('simple card: renders only in Simple mode, Enter confirms, P pauses, "let me choose" reveals the hub card, the Heir needs a hold', async () => {
  const { doc } = installDom();
  doc.documentElement.style = { setProperty() {}, getPropertyValue: () => '' };
  const { createPlayContext } = await import('../src/play/i18n.js');
  const { createSimpleMode } = await import('../src/play/simple.js');
  const { createNarration, fakeSynth } = await import('../src/play/narration.js');
  const { s, hub } = await hubSeason();
  const ctx = createPlayContext({ storage: createSafeStorage(memoryStorage()), locale: 'en' });
  const { synth, Utterance } = fakeSynth();
  const narration = createNarration({ prefs: ctx.prefs, i18n: ctx.i18n, synth, Utterance });
  const root = doc.createElement('div'); doc.body.appendChild(root);
  const timers = [];
  const simple = createSimpleMode({ root, ctx, session: s, hub, narration, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: (h) => { timers[h - 1] = null; } });
  assert.equal(root.querySelector('.a11y-simple'), null, 'Novice: no card');
  assert.equal(doc.body.classList.contains('ftf-simple-on'), false);
  ctx.prefs.set({ hudMode: 'simple' });
  let card = root.querySelector('.a11y-simple');
  assert.ok(card, 'Simple: the card appears');
  assert.equal(card.getAttribute('data-kind'), 'stake');
  assert.equal(doc.body.classList.contains('ftf-simple-on'), true);
  assert.match(card.querySelector('h3').textContent, /^Fly into Shell/);
  assert.ok(card.querySelector('canvas, .a11y-sign-missing'), 'the sign is drawn (or a placeholder without canvas support)');
  assert.equal(card.querySelectorAll('.a11y-row button').length, 3);
  assert.equal(synth.spoken.length, 0, 'narration off: silent');
  // P pauses; a stake proposal is never auto-run
  assert.equal(simple.handleKey('KeyP'), true);
  assert.equal(simple.paused, true);
  assert.equal(root.querySelector('.a11y-simple .a11y-eyebrow').textContent, 'Paused');
  assert.equal(simple.handleKey('KeyP'), true);
  assert.equal(timers.filter(Boolean).length, 0, 'no auto timer for a stake proposal');
  // Enter with nothing focused runs the primary action: fly, stake, leave
  ctx.prefs.set({ narration: true });
  const anchorsBefore = s.obs.iris.anchors.length;
  assert.equal(simple.handleKey('Enter', 'Enter'), true);
  await new Promise((r) => setTimeout(r, 0));
  let guard = 0;
  while ((hub.busy || hub.advancing) && guard++ < 200) await new Promise((r) => setTimeout(r, 2));
  assert.ok(s.obs.iris.anchors.length > anchorsBefore || s.obs.season.tick > 1, 'staked and the trial ended');
  assert.equal(s.obs.you.zone, 'island');
  assert.ok(synth.spoken.length >= 1, 'narration on: the proposal is spoken');
  // a pass proposal schedules the automatic advance; pause cancels it
  const p = simple.proposal();
  if (p && p.kind === 'pass') {
    assert.ok(timers.filter(Boolean).length >= 1, 'auto-pass scheduled');
    simple.setPaused(true);
    assert.equal(timers.filter(Boolean).length, 0, 'pause cancels the auto-pass');
    simple.setPaused(false);
  }
  // drive to a decision card, then "let me choose" hands over to the hub's own card
  guard = 0;
  while (!hub.card && s.obs.season.phase === 'play' && guard++ < 60) { if (hub.advancing) await new Promise((r) => setTimeout(r, 2)); else await hub.advance(); }
  if (hub.card) {
    card = root.querySelector('.a11y-simple');
    assert.ok(['card', 'key'].includes(card.getAttribute('data-kind')));
    if (card.getAttribute('data-kind') === 'card') {
      assert.match(card.querySelector('.a11y-primary').textContent, /^EnterDo as Iris says: /);
      card.querySelector('[data-simple="choose"]').click();
      assert.equal(simple.choosing, true);
      assert.equal(doc.body.classList.contains('ftf-simple-choosing'), true);
      assert.equal(root.querySelector('.a11y-simple'), null, 'the Simple card steps aside');
      assert.equal(simple.handleKey('Escape'), true);
      assert.equal(simple.choosing, false);
      assert.ok(root.querySelector('.a11y-simple'));
    }
  }
  // the Heir card: "keep" is a plain button, "forget" needs press-and-hold
  hub.card = { id: 'heir', kind: 'heir' };
  s.obs.season.phase = 'end'; s.obs.season.outcome = 'gift';
  hub.changed();
  card = root.querySelector('.a11y-simple');
  assert.equal(card.getAttribute('data-kind'), 'heir');
  const forget = card.querySelector('[data-simple="heir"]');
  assert.ok(forget.classList.contains('a11y-hold'));
  assert.equal(forget.getAttribute('title'), 'Press and hold to confirm');
  assert.ok(card.querySelector('[data-simple="keep"]'));
  assert.equal(card.querySelector('.a11y-primary'), null, 'no recommended choice for the Heir');
  // switching back to Novice removes everything
  ctx.prefs.set({ hudMode: 'novice' });
  assert.equal(root.querySelector('.a11y-simple'), null);
  assert.equal(doc.body.classList.contains('ftf-simple-on'), false);
  assert.equal(ctx.i18n.missing.size, 0, [...ctx.i18n.missing].join(', '));
  simple.destroy();
  s.dispose();
});
