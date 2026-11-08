// Objectives: exactly one goal on screen at a time. The first season opens with an onboarding path
// that teaches the core loop in about two minutes (walk to the Scroll → decide the fragment → the
// Price of Memory: forget a memory, see a vision → anchor where it points → end the tick and watch
// the sign revealed), then two follow-ups (talk to a clan, ask the Guests). After that the goal is
// picked from the observation by priority. Pure: reads the room's observation plus a few local
// flags (things only the client sees, such as "the player reached the Scroll"); never a rule.

export const ONBOARDING = Object.freeze(['reach_scroll', 'fragment', 'forget', 'anchor', 'end_tick', 'talk', 'ask']);

const ROMAN = ['I', 'II', 'III', 'IV'];
const pct = (x) => Math.round((x || 0) * 100);

/** The vision the onboarding points at: the earliest vision with its implied anchor. */
export function firstVision(obs) {
  const v = (obs.prophecies || []).filter((p) => p.vision && p.impliedAnchor).sort((a, b) => a.publishedAt - b.publishedAt || a.index - b.index);
  if (v.length) return v[0];
  const pub = (obs.prophecies || []).filter((p) => p.impliedAnchor);
  return pub[0] || null;
}

const meanConfidence = (p) => (p && p.reading ? p.reading.slots.reduce((a, s) => a + s.confidence, 0) / 4 : 0);

function stepDone(id, obs, flags) {
  const iris = obs.iris || {};
  switch (id) {
    case 'reach_scroll': return !!flags.reachedScroll;
    case 'fragment': return (iris.fragment && iris.fragment.status !== 'held') || !!flags.heldFragment;
    case 'forget': return (iris.forgotten || []).length > 0;
    case 'anchor': return (iris.anchors || []).length > 0 || obs.season.tick > 1 || !!flags.anchored;
    case 'end_tick': return obs.season.tick > 1;
    // The two follow-ups are soft: they expire so the onboarding never blocks the season's own goals.
    case 'talk': return !!flags.talked || obs.season.tick >= 4;
    case 'ask': return !!flags.asked || obs.season.tick >= 5;
    default: return true;
  }
}

/** Goal text for one onboarding step: {id, key, args, hintKey, hintArgs, target, step, steps}. */
function onboardingGoal(id, obs, flags) {
  const i = ONBOARDING.indexOf(id);
  const base = { id, key: 'goal.' + id, args: {}, hintKey: 'goal.' + id + '.hint', hintArgs: {}, target: null, step: i + 1, steps: ONBOARDING.length, onboarding: true };
  const iris = obs.iris || {};
  switch (id) {
    case 'reach_scroll': return { ...base, target: 'scroll' };
    case 'fragment': return { ...base, target: 'scroll', hintArgs: { prize: iris.fragment.prize.amount, tick: iris.fragment.prize.tick, deadline: obs.season.contributionDeadline } };
    case 'forget': return { ...base, target: null };
    case 'anchor': {
      const v = firstVision(obs);
      if (!v) return { ...base, key: 'goal.anchor.any', hintKey: 'goal.anchor.any.hint', target: 'anchor_zone:1' };
      const c = meanConfidence(v);
      return { ...base, args: { shell: ROMAN[v.impliedAnchor.shell - 1], tick: v.impliedAnchor.tick }, hintKey: c < 0.6 ? 'goal.anchor.hintGuess' : 'goal.anchor.hint', hintArgs: { confidence: pct(c) }, target: 'anchor_zone:' + v.impliedAnchor.shell };
    }
    case 'end_tick': return { ...base, args: { tick: obs.season.tick } };
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
 * @param {{reachedScroll?:boolean, heldFragment?:boolean, talked?:boolean, asked?:boolean, anchored?:boolean, skipOnboarding?:boolean}} flags
 */
export function currentGoal(obs, flags = {}) {
  if (!obs || !obs.season) return null;
  const s = obs.season;
  if (s.phase === 'intro') return { id: 'intro', key: 'goal.intro', args: {}, hintKey: 'goal.intro.hint', hintArgs: {}, target: null };
  if (s.phase === 'end') return { id: 'season_over', key: 'goal.season_over', args: { outcome: s.outcome }, hintKey: s.heir == null ? 'goal.season_over.hint' : 'goal.season_over.done', hintArgs: {}, target: null };
  if (flags.hub) return hubGoal(obs, flags);
  if (!flags.skipOnboarding) {
    for (const id of ONBOARDING) if (!stepDone(id, obs, flags)) return onboardingGoal(id, obs, flags);
  }
  return dynamicGoal(obs);
}

/** The Shell-first onboarding (play/hub.js): fly into a Shell → stake on the reading → leave. */
export const ONBOARDING_HUB = Object.freeze(['fly', 'stake', 'leave']);

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
  const g = (id, args = {}, target = null, hintArgs = {}, extra = {}) => ({ id, key: 'hub.goal.' + id, args, hintKey: 'hub.goal.' + id + '.hint', hintArgs, target, ...extra });
  if (s.phase === 'vote') return g('vote');
  const wait = waitingShell(obs);
  if (!flags.skipOnboarding) {
    const step = (id) => ({ step: ONBOARDING_HUB.indexOf(id) + 1, steps: ONBOARDING_HUB.length, onboarding: true });
    const staked = (iris.anchors || []).length > 0 || !!flags.anchored;
    if (!inShell && !staked && s.tick === 1) return g('fly', { shell: ROMAN[(wait || 1) - 1] }, 'shell:' + (wait || 1), {}, step('fly'));
    if (inShell && !staked && s.tick === 1) return g('stake', {}, null, {}, step('stake'));
    if (inShell && s.tick === 1) return g('leave', {}, null, {}, step('leave'));
  }
  if (inShell) return g('inside', { shell: ROMAN[(obs.you.shell || 1) - 1] });
  const rel = (obs.relationships && obs.relationships.clans) || [];
  const ash = rel.find((c) => c.clan === 'ash');
  if (ash && ash.isolated && !(iris.ashKey && iris.ashKey.known)) return g('ash_key', { have: iris.keyVision ? iris.keyVision.confidentCells : 0, need: iris.keyVision ? iris.keyVision.needCells : 8 });
  if (wait && iris.attention > 0) return g('fly_next', { shell: ROMAN[wait - 1] }, 'shell:' + wait);
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
