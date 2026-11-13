// The citizens' quests as pure rules (TZ §6.3): locked → available → active → ready → done (a repeatable goes back to
// available after its cooldown and bumps its attempt). applyQuest(state, action, ctx) → {state, events[], rejected?};
// events are expedition-log entries ({kind, data, silkC, trust}); rewards are paid exactly once per (questId, attempt),
// kills count only after acceptance and once per killId. Kill silk (EXPEDITION.kill) is T1 with a daily soft cap.
// No DOM, no three, no engine. Pure.
import { QUESTS } from './quests-data.js';
import { EXPEDITION } from './expedition-config.js';
import { JOURNAL_BY_ID } from './journal-data.js';

export const QUESTS_KEY = 'ftf.quests.v1';
const DAY = 24 * 3600 * 1000;
const dayOf = (ms) => Math.floor((ms || 0) / DAY); // UTC days

export const initialQuests = () => ({ v: 1, seq: 0, quests: {}, kills: [], guide: { talked: false, moved: false }, killDay: { day: -1, c: 0 }, bountyDay: { day: -1, n: 0 } });

const q0 = () => ({ state: 'locked', progress: 0, attempt: 0, acceptedSeq: -1, doneAt: null });
const get = (s, id) => s.quests[id] || q0();
const copy = (s) => ({ ...s, quests: { ...s.quests }, kills: s.kills.slice(), guide: { ...s.guide }, killDay: { ...s.killDay }, bountyDay: { ...s.bountyDay } });
const rejected = (state, reason) => ({ state, events: [], rejected: reason });

/** A quest's status now: locked | available | active | ready | done (cooldowns and prerequisites applied). */
/** The elder's guide never blocks play (owner, 12.11): the welcome counts as met for the quests after it once the player
 * has made a kill or WELCOME_GRACE_MS after the start (BEGIN), even if the elder was skipped. */
export const WELCOME_GRACE_MS = 3 * 60_000;
const welcomeWaived = (s, now) => (s.kills && s.kills.length > 0) || (s.since != null && now - s.since >= WELCOME_GRACE_MS);

export function questStatus(s, id, now = 0) {
  const def = QUESTS[id]; if (!def) return null;
  const q = get(s, id);
  if (q.state === 'active' || q.state === 'ready') return q.state;
  if (q.state === 'done' && !def.repeat) return 'done';
  if (q.state === 'done' && def.repeat && def.repeat.mode === 'daily' && dayOf(now) === dayOf(q.doneAt)) return 'done'; // back at 00:00 UTC
  if (q.state === 'done' && def.repeat && def.repeat.minutes && now - q.doneAt < def.repeat.minutes * 60e3) return 'done';
  return def.requires.every((r) => get(s, r).state === 'done' || (r === 'q_welcome' && welcomeWaived(s, now))) ? 'available' : 'locked';
}

/** Silk (hundredths) a kill pays: the table, at 25 % beyond the day's soft cap. */
export function killSilk(s, mob, now) {
  const base = EXPEDITION.kill[mob] || 0;
  const used = s.killDay.day === dayOf(now) ? s.killDay.c : 0;
  return used >= EXPEDITION.killDaySoftC ? Math.round(base * EXPEDITION.killAfterSoftFactor) : base;
}

/** The silk (whole) a turn-in pays: the reward, the bounty at its reduced rate after the day's full turn-ins. */
export function rewardSilk(s, id, now) {
  const def = QUESTS[id];
  if (!def.repeat) return def.reward.silk;
  const n = s.bountyDay.day === dayOf(now) ? s.bountyDay.n : 0;
  if (!def.repeat.fullPerDay) return def.reward.silk; // a daily: full pay once a day
  return n < def.repeat.fullPerDay ? def.reward.silk : Math.round(def.reward.silk * def.repeat.afterFullFactor);
}

/**
 * @param {object} state @param {{type: string, questId?: string, mob?: string, killId?: string, partId?: string,
 *   partSource?: 'salvage'|'inventory', step?: string}} a
 * @param {{now?: number}} [ctx]
 */
export function applyQuest(state, a = {}, ctx = {}) {
  const s = state || initialQuests(); const now = ctx.now || 0;
  switch (a.type) {
    case 'BEGIN': { // the start of play (the town view sends it once): the guide's grace period counts from here
      if (s.since != null) return rejected(s, 'begun');
      return { state: { ...copy(s), since: now }, events: [] };
    }
    case 'GUIDE': { // the starter guide's steps feed q_welcome (talked to the elder, moved)
      if (!['talked', 'moved'].includes(a.step)) return rejected(s, 'step');
      const n = copy(s); n.guide[a.step] = true; n.seq++;
      const ev = [];
      const w = get(n, 'q_welcome');
      if (w.state === 'active' && n.guide.talked && n.guide.moved) { n.quests.q_welcome = { ...w, state: 'ready' }; ev.push({ kind: 'quest_ready', data: { questId: 'q_welcome' }, silkC: 0, trust: 'T2' }); }
      return { state: n, events: ev };
    }
    case 'ACCEPT': {
      const def = QUESTS[a.questId]; if (!def) return rejected(s, 'quest');
      if (questStatus(s, a.questId, now) !== 'available') return rejected(s, 'not_available');
      if (!def.auto && Object.keys(QUESTS).some((id) => QUESTS[id].giver === def.giver && !QUESTS[id].auto && id !== a.questId && ['active', 'ready'].includes(get(s, id).state))) return rejected(s, 'giver_busy'); // auto quests (journal side/daily/tournament) never block a talk quest
      const n = copy(s); n.seq++;
      const prev = get(n, a.questId);
      const q = { state: 'active', progress: 0, attempt: prev.attempt + 1, acceptedSeq: n.seq, doneAt: prev.doneAt };
      if (def.objective.type === 'guide' && def.objective.steps.every((k) => n.guide[k])) q.state = 'ready';
      n.quests[a.questId] = q;
      const ev = [{ kind: 'quest_accepted', data: { questId: a.questId, attempt: q.attempt }, silkC: 0, trust: 'T2' }];
      if (q.state === 'ready') ev.push({ kind: 'quest_ready', data: { questId: a.questId }, silkC: 0, trust: 'T2' });
      return { state: n, events: ev };
    }
    case 'KILL': {
      if (!a.mob || !a.killId) return rejected(s, 'kill');
      if (s.kills.includes(a.killId)) return rejected(s, 'duplicate');
      const n = copy(s); n.seq++;
      n.kills = [...n.kills, a.killId].slice(-500);
      const ev = [];
      const silk = killSilk(n, a.mob, now);
      if (silk > 0) {
        if (n.killDay.day !== dayOf(now)) n.killDay = { day: dayOf(now), c: 0 };
        n.killDay.c += silk;
        ev.push({ kind: 'kill_ticketed', data: { mob: a.mob, killId: a.killId }, silkC: silk, trust: a.hunt ? 'T2' : 'T1' }); // a scripted hunt (game/hunt.js) is T2
      }
      for (const id of Object.keys(QUESTS)) {
        const def = QUESTS[id], q = get(n, id);
        if (def.objective.type !== 'kill' || def.objective.mob !== a.mob || q.state !== 'active') continue;
        const p = q.progress + 1;
        n.quests[id] = { ...q, progress: p, state: p >= def.objective.count ? 'ready' : 'active' };
        ev.push({ kind: 'quest_progress', data: { questId: id, progress: p }, silkC: 0, trust: 'T2' });
        if (p >= def.objective.count) ev.push({ kind: 'quest_ready', data: { questId: id }, silkC: 0, trust: 'T2' });
      }
      return { state: n, events: ev };
    }
    case 'TURN_IN': {
      const def = QUESTS[a.questId]; if (!def) return rejected(s, 'quest');
      const q = get(s, a.questId);
      if (def.objective.type === 'fetch') {
        if (q.state !== 'active' && q.state !== 'ready') return rejected(s, 'not_ready');
        if (!a.partId) return rejected(s, 'no_part');
      } else if (q.state !== 'ready') return rejected(s, 'not_ready');
      const needs = def.needs || {}; // monster resources, consumed by the caller after the turn-in (counts in a.have)
      if (Object.entries(needs).some(([id, n]) => (Number(a.have && a.have[id]) || 0) < n)) return rejected(s, 'needs');
      const n = copy(s); n.seq++;
      const silk = rewardSilk(n, a.questId, now);
      if (def.repeat && def.repeat.fullPerDay) { if (n.bountyDay.day !== dayOf(now)) n.bountyDay = { day: dayOf(now), n: 0 }; n.bountyDay.n++; }
      n.quests[a.questId] = { ...q, state: 'done', doneAt: now };
      const trust = def.objective.type === 'fetch' && a.partSource !== 'salvage' ? 'T1' : 'T2';
      return { state: n, events: [{ kind: def.repeat ? 'bounty_resolved' : 'quest_turned_in', data: { questId: a.questId, attempt: q.attempt, partId: a.partId || null, xp: def.reward.xp, chest: def.reward.chest || null, ...(def.needs ? { consumed: { ...def.needs } } : {}) }, silkC: silk * 100, trust }] };
    }
    case 'EVENT': { // a counted event (chest opened, trade, wheel spin, skill, tournament entry, agent entry, resource, sign read)
      const n0 = Math.max(1, Math.floor(Number(a.n) || 1)), n = copy(s); n.seq++; const ev = [];
      for (const id of Object.keys(QUESTS)) {
        const def = QUESTS[id]; if (def.objective.type !== 'event' || def.objective.event !== a.event) continue;
        let q = get(n, id); const st = questStatus(n, id, now);
        if (st === 'available' && def.auto) { q = { state: 'active', progress: 0, attempt: q.attempt + 1, acceptedSeq: n.seq, doneAt: q.doneAt }; ev.push({ kind: 'quest_accepted', data: { questId: id, attempt: q.attempt }, silkC: 0, trust: 'T2' }); }
        else if (st !== 'active') continue;
        const p = Math.min(def.objective.count, q.progress + n0);
        q = { ...q, progress: p, state: p >= def.objective.count ? 'ready' : 'active' };
        ev.push({ kind: 'quest_progress', data: { questId: id, progress: p }, silkC: 0, trust: 'T2' });
        if (q.state === 'ready' && def.auto) { // completes by itself: paid once for this attempt
          const silk = rewardSilk(n, id, now);
          q = { ...q, state: 'done', doneAt: now };
          ev.push({ kind: def.repeat ? 'bounty_resolved' : 'quest_turned_in', data: { questId: id, attempt: q.attempt, partId: null, xp: def.reward.xp, chest: null, ...(def.reward.title ? { title: def.reward.title } : {}) }, silkC: silk * 100, trust: 'T2' });
        }
        n.quests[id] = q;
      }
      return ev.length ? { state: n, events: ev } : rejected(s, 'no_quest');
    }
    case 'ABANDON': {
      const q = get(s, a.questId);
      if (!QUESTS[a.questId] || q.state !== 'active') return rejected(s, 'not_active');
      const n = copy(s); n.seq++;
      n.quests[a.questId] = { ...q, state: q.doneAt ? 'done' : 'locked', progress: 0 };
      return { state: n, events: [{ kind: 'quest_abandoned', data: { questId: a.questId }, silkC: 0, trust: 'T2' }] };
    }
    default: return rejected(s, 'action');
  }
}

/** Replays a list of actions (with their times) from the start: the same state the view holds. */
export function replayQuests(actions) {
  let s = initialQuests(); const events = [];
  for (const { action, now } of actions) { const r = applyQuest(s, action, { now }); if (!r.rejected) { s = r.state; events.push(...r.events); } }
  return { state: s, events };
}

/** The next daily reset (00:00 UTC) after `now`, in ms. */
export const nextDailyReset = (now) => (dayOf(now) + 1) * DAY;

/**
 * A quest's journal status: locked | available | active | ready | completed | cooldown. Level gates show as locked
 * with `reason: 'level'` (shown greyed, never hidden). {status, reason?, level?}
 */
export function statusOf(id, state, now = 0, { level = 1, levelOf = (x) => (JOURNAL_BY_ID[x] && JOURNAL_BY_ID[x].level) || 1 } = {}) {
  const def = QUESTS[id]; if (!def) return { status: 'locked', reason: 'unknown' };
  const st = questStatus(state, id, now), q = get(state, id);
  if (st === 'done') return { status: def.repeat ? 'cooldown' : 'completed' };
  if (def.repeat && q.state === 'done' && st === 'available' && level < levelOf(id)) return { status: 'locked', reason: 'level', level: levelOf(id) };
  if ((st === 'available' || st === 'locked') && level < levelOf(id)) return { status: 'locked', reason: 'level', level: levelOf(id) };
  return { status: st };
}

/**
 * The journal's objective rows for a quest: [{id, text, done, count, of}] from its journal objectives and the rule
 * state. `have`: resource and part counts the player holds ({spider_silk_thread: 3, part: 1}).
 */
export function progressOf(id, state, { have = {} } = {}) {
  const j = JOURNAL_BY_ID[id]; if (!j) return [];
  const q = get(state, id), finished = q.state === 'done', ready = finished || q.state === 'ready';
  const guide = state.guide || {};
  return j.objectives.map((o) => {
    let count = 0;
    if (finished) count = o.count;
    else if (o.type === 'talk') count = guide.talked ? 1 : 0;
    else if (o.type === 'reach') count = guide.moved ? 1 : 0;
    else if (o.type === 'kill') count = ready ? o.count : q.progress || 0;
    else if (o.type === 'deliver') count = Number(have[o.resource]) || 0;
    else if (o.type === 'gather' && o.item === 'part') count = Number(have.part) || 0;
    else count = q.progress || 0;
    count = Math.min(o.count, Math.max(0, count));
    return { id: o.id, text: o.text, type: o.type, done: count >= o.count, count, of: o.count };
  });
}
