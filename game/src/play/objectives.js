// Objectives: exactly one goal on screen at a time. The first season opens with the first loop the
// game is about, Read → Anchor → Reveal → Verified (docs/tutorial.md §2.2): the player stakes on the
// first sign, lets trials pass and watches trial 3 come true with its proof. Only then come the
// Price of Memory, the fragment and the two soft follow-ups (talk to a clan, ask the Guests). After
// that the goal is picked from the observation by priority. Pure: reads the room's observation plus
// a few local flags (things only the client sees, such as "the player reached the Scroll"); never a
// rule. Every title stays under seven words and every hint under thirteen (tests/tutorial.test.mjs).

/** Walking play: stake first, see it verified, then the Price of Memory and the rest. */
export const ONBOARDING = Object.freeze(['anchor', 'end_tick', 'verified', 'forget', 'fragment', 'talk', 'ask']);

/**
 * The first event of every season lands on trial 3 (a Gift of 20, `docs/rules-baseline.md` §2.2), and
 * the rules resolve a stake only when an event lands on its trial: a stake on trial 1 or 2 is never
 * paid back. The first-loop goals therefore steer the first stake to this trial. Presentation only.
 */
export const FIRST_GIFT_TICK = FIRST_EVENT_TICK;

import { signForShell, impliedTick, prefillFirstDelay, FIRST_EVENT_TICK } from './hub.js';

/** Device flag (createSafeStorage key): set once the player has seen the first loop verified; `skipOnboarding` then. */
export const FIRST_LOOP_KEY = 'ftf.firstloop.v1';

const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * How the player drives the game, for device-aware copy (QA-011): 'touch' names on-screen buttons,
 * 'gamepad' says "choose", 'keyboard' names the keys. `flags.input` (the client's input device) wins;
 * otherwise a coarse pointer means touch. Pure outside the guarded matchMedia probe.
 */
export function inputKind(flags = {}) {
  if (flags.input === 'gamepad' || flags.input === 'touch' || flags.input === 'keyboard') return flags.input;
  try { if (globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches) return 'touch'; } catch { /* no DOM */ }
  return 'keyboard';
}
/** Every goal carries `input` in its args so the ICU `select` in the strings picks the device's words. */
const withInput = (g, flags) => (g ? { ...g, args: { input: inputKind(flags), ...(g.args || {}) } } : g);
const pct = (x) => Math.round((x || 0) * 100);

/** The vision the onboarding points at: the earliest vision with its implied anchor. */
export function firstVision(obs) {
  const v = (obs.prophecies || []).filter((p) => p.vision && p.impliedAnchor).sort((a, b) => a.publishedAt - b.publishedAt || a.index - b.index);
  if (v.length) return v[0];
  const pub = (obs.prophecies || []).filter((p) => p.impliedAnchor).sort((a, b) => a.publishedAt - b.publishedAt || a.index - b.index);
  return pub[0] || null;
}

const meanConfidence = (p) => (p && p.reading ? p.reading.slots.reduce((a, s) => a + s.confidence, 0) / 4 : 0);
/** The first proof checked against the root (the "Verified ✓" moment). */
const firstProof = (obs) => (obs.proofs || []).some((p) => p.verified);

function stepDone(id, obs, flags) {
  const iris = obs.iris || {};
  const tick = obs.season.tick;
  switch (id) {
    case 'anchor': return (iris.anchors || []).length > 0 || tick > 1 || !!flags.anchored;
    case 'end_tick': return tick > 1;
    case 'verified': return firstProof(obs) || tick > FIRST_GIFT_TICK;
    // The rest are soft: they expire so the onboarding never blocks the season's own goals.
    case 'forget': return (iris.forgotten || []).length > 0 || tick >= 7;
    case 'fragment': return (iris.fragment && iris.fragment.status !== 'held') || !!flags.heldFragment || tick >= Math.min(9, obs.season.contributionDeadline || 16);
    case 'talk': return !!flags.talked || tick >= 9;
    case 'ask': return !!flags.asked || tick >= 10;
    default: return true;
  }
}

/** Goal text for one onboarding step: {id, key, args, hintKey, hintArgs, target, step, steps}. */
function onboardingGoal(id, obs, flags) {
  const i = ONBOARDING.indexOf(id);
  const base = { id, key: 'goal.' + id, args: {}, hintKey: 'goal.' + id + '.hint', hintArgs: {}, target: null, step: i + 1, steps: ONBOARDING.length, onboarding: true };
  const iris = obs.iris || {};
  switch (id) {
    case 'anchor': {
      const v = firstVision(obs);
      if (!v) return { ...base, key: 'goal.anchor.any', hintKey: 'goal.anchor.any.hint', target: 'anchor_zone:1' };
      return { ...base, args: { shell: ROMAN[v.impliedAnchor.shell - 1], tick: FIRST_GIFT_TICK }, target: 'anchor_zone:' + v.impliedAnchor.shell };
    }
    case 'end_tick': return { ...base, args: { tick: obs.season.tick } };
    case 'verified': return { ...base, args: { tick: FIRST_GIFT_TICK } };
    case 'forget': return { ...base, target: null };
    case 'fragment': return { ...base, target: 'scroll', hintArgs: { prize: iris.fragment.prize.amount, tick: iris.fragment.prize.tick, deadline: obs.season.contributionDeadline } };
    case 'talk': {
      const clans = (obs.relationships && obs.relationships.clans) || [];
      const best = clans.filter((c) => !c.linkBroken && !c.isolated).sort((a, b) => b.trustInIris - a.trustInIris)[0];
      const clan = best ? best.clan : 'moss';
      return { ...base, args: { who: { $agentId: clan } }, target: 'camp:' + clan };
    }
    case 'ask': {
      const zone = (obs.you && obs.you.zone === 'shell') ? null : 'anchor_zone:' + nearestZoneHint(obs);
      return { ...base, target: zone };
    }
    default: return base;
  }
}

function nearestZoneHint(obs) {
  const v = firstVision(obs);
  return v ? v.impliedAnchor.shell : 1;
}

/**
 * The single current goal.
 * @param {object} obs the room observation (controller)
 * @param {{reachedScroll?:boolean, heldFragment?:boolean, talked?:boolean, asked?:boolean, anchored?:boolean, skipOnboarding?:boolean, hub?:boolean}} flags
 */
export function currentGoal(obs, flags = {}) {
  if (!obs || !obs.season) return null;
  const s = obs.season;
  if (s.phase === 'intro') return withInput({ id: 'intro', key: 'goal.intro', args: {}, hintKey: 'goal.intro.hint', hintArgs: {}, target: null }, flags);
  if (s.phase === 'end') return withInput({ id: 'season_over', key: 'goal.season_over', args: { outcome: s.outcome }, hintKey: s.heir == null ? 'goal.season_over.hint' : 'goal.season_over.done', hintArgs: {}, target: null }, flags);
  if (flags.hub) return hubGoal(obs, flags);
  if (!flags.skipOnboarding && s.phase === 'play') {
    for (const id of ONBOARDING) if (!stepDone(id, obs, flags)) return withInput(onboardingGoal(id, obs, flags), flags);
  }
  return withInput(dynamicGoal(obs), flags);
}

/** The Shell-first onboarding (play/hub.js): fly into a Shell → stake on the reading → leave → watch trial 3 verified. */
export const ONBOARDING_HUB = Object.freeze(['fly', 'stake', 'leave', 'verified']);

/** The Shell whose sign waits for the player: the newest sign Iris reads for a Shell not yet staked there. */
function waitingShell(obs) {
  const staked = new Set(((obs.iris && obs.iris.anchors) || []).map((a) => a.shell + ':' + a.tick));
  const signs = (obs.prophecies || []).filter((p) => p.impliedAnchor && p.impliedAnchor.tick >= obs.season.tick)
    .sort((a, b) => (b.vision - a.vision) || (b.publishedAt - a.publishedAt));
  const open = signs.find((p) => !staked.has(p.impliedAnchor.shell + ':' + p.impliedAnchor.tick));
  return open ? open.impliedAnchor.shell : null;
}

/** Goals in the Shell hub: the same priorities, phrased as flights instead of walks. */
export function hubGoal(obs, flags = {}) {
  const s = obs.season, iris = obs.iris || {};
  const inShell = obs.you && obs.you.zone === 'shell';
  const g = (id, args = {}, target = null, hintArgs = {}, extra = {}) => withInput({ id, key: 'hub.goal.' + id, args, hintKey: 'hub.goal.' + id + '.hint', hintArgs, target, ...extra }, flags);
  if (s.phase === 'vote') return g('vote');
  const wait = waitingShell(obs);
  if (!flags.skipOnboarding && s.phase === 'play') {
    const step = (id) => ({ step: ONBOARDING_HUB.indexOf(id) + 1, steps: ONBOARDING_HUB.length, onboarding: true });
    const staked = (iris.anchors || []).length > 0 || !!flags.anchored;
    if (!inShell && !staked && s.tick === 1) return g('fly', { shell: ROMAN[(wait || 1) - 1] }, 'shell:' + (wait || 1), {}, step('fly'));
    if (inShell && !staked && s.tick === 1) {
      // Simple mode (or a lucky prior): Iris's own reading already lands on trial 3, so there is nothing to change.
      const sign = signForShell(obs, obs.you.shell);
      // a quiet Shell (no sign of its own): point to the Shell that holds the waiting sign, as its card does
      if (!sign) return g('fly', { shell: ROMAN[(wait || 1) - 1] }, 'shell:' + (wait || 1), {}, step('fly'));
      const slots = sign && sign.reading ? sign.reading.slots.map((x) => x.meaning) : null;
      if (slots) prefillFirstDelay(obs, sign, slots); // the same pre-fill the hub's reading card applies
      const ready = !!(slots && impliedTick(sign, slots) === FIRST_GIFT_TICK);
      // the first stake is framed as a test of Iris's guess, never a promise (readiness audit P2): before any
      // reveal her prior is a coin toss per slot, and the hint says how sure she is
      return g('stake', { tick: FIRST_GIFT_TICK }, null, { confidence: pct(meanConfidence(sign)) }, { ...step('stake'), hintKey: ready ? 'hub.goal.stake.hintReady' : 'hub.goal.stake.hint' });
    }
    if (inShell && s.tick === 1) return g('leave', {}, null, {}, step('leave'));
    if (!inShell && s.tick <= FIRST_GIFT_TICK && !firstProof(obs)) return g('verified', { tick: FIRST_GIFT_TICK }, null, {}, step('verified'));
  }
  if (inShell) return g('inside', { shell: ROMAN[(obs.you.shell || 1) - 1] });
  const rel = (obs.relationships && obs.relationships.clans) || [];
  const ash = rel.find((c) => c.clan === 'ash');
  if (ash && ash.isolated && !(iris.ashKey && iris.ashKey.known)) return g('ash_key', { have: iris.keyVision ? iris.keyVision.confidentCells : 0, need: iris.keyVision ? iris.keyVision.needCells : 8 });
  if (wait && iris.attention > 0) return g('fly_next', { shell: ROMAN[wait - 1] }, 'shell:' + wait);
  // a sign waits but Iris has no attention left this trial: the hint must not claim that nothing waits
  if (wait) return g('wait', { tick: s.tick, ticks: s.ticks }, null, { shell: ROMAN[wait - 1] }, { hintKey: 'hub.goal.wait.hintSpent' });
  return g('wait', { tick: s.tick, ticks: s.ticks });
}

/** After onboarding: the most pressing thing, by priority. */
export function dynamicGoal(obs) {
  const s = obs.season, iris = obs.iris || {}, rel = (obs.relationships && obs.relationships.clans) || [];
  const goal = (id, args = {}, target = null, hintArgs = {}) => ({ id, key: 'goal.' + id, args, hintKey: 'goal.' + id + '.hint', hintArgs, target });
  if (s.phase === 'vote') return goal('vote', {}, 'scroll');
  const ash = rel.find((c) => c.clan === 'ash');
  if (ash && ash.isolated) {
    if (iris.ashKey && iris.ashKey.known) return goal('speak_key', {}, 'camp:ash');
    return goal('ash_key', { have: iris.keyVision ? iris.keyVision.confidentCells : 0, need: iris.keyVision ? iris.keyVision.needCells : 8 });
  }
  if (s.tension >= 70) {
    const broken = rel.find((c) => c.linkBroken && !c.remembersBetrayal && !c.isolated);
    if (broken) return goal('mend', { who: { $agentId: broken.clan } }, 'camp:' + broken.clan, { tension: s.tension });
  }
  const offer = (obs.offers || [])[0];
  if (offer) return goal('offer', { who: { $agentId: offer.from } }, 'camp:' + offer.from);
  if (iris.fragment && iris.fragment.status === 'held' && s.tick >= Math.min(iris.fragment.prize.tick, s.contributionDeadline) - 2) {
    return goal('fragment_decide', { tick: iris.fragment.prize.tick, prize: iris.fragment.prize.amount, deadline: s.contributionDeadline }, 'scroll');
  }
  const anchoredTicks = new Set((iris.anchors || []).map((a) => a.shell + ':' + a.tick));
  const open = (obs.prophecies || []).find((p) => p.impliedAnchor && p.impliedAnchor.tick >= s.tick && !anchoredTicks.has(p.impliedAnchor.shell + ':' + p.impliedAnchor.tick));
  if (open && iris.attention > 0) return goal('anchor_next', { shell: ROMAN[open.impliedAnchor.shell - 1], tick: open.impliedAnchor.tick }, 'anchor_zone:' + open.impliedAnchor.shell, { confidence: pct(meanConfidence(open)) });
  const auction = (obs.auctions || []).find((a) => a.open && a.from !== 'iris' && !(a.topBid && a.topBid.clan === 'iris'));
  if (auction && iris.silk >= ((auction.topBid ? auction.topBid.amount : 0) + 3)) return goal('auction', { title: auction.title }, 'shard_pedestal');
  return goal('next_tick', { tick: s.tick, ticks: s.ticks });
}
