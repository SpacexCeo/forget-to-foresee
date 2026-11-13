// The journal's view model (sprint §4.7), pure: tabs Story / Side / Daily / Tournament / Done, rows ordered ready,
// active, available, locked (then by sort), each with its status icon, "Lv N · Giver", the first unfinished objective's
// counter and the tracked pin; the detail for a quest (chips, copy, objectives with counters, rewards, hints, the walk
// target). Inputs are the rule state and what the player holds; no DOM.
import { JOURNAL, JOURNAL_BY_ID } from '../game/journal-data.js';
import { statusOf, progressOf, nextDailyReset } from '../game/quest-rules.js';

export const TABS = Object.freeze(['story', 'side', 'daily', 'tournament', 'done']);
export const MAX_TRACKED = 3;
const RANK = { ready: 0, active: 1, available: 2, locked: 3, cooldown: 4, completed: 5 };
export const ICON = Object.freeze({ available: '!', ready: '?', active: '◆', completed: '✓', locked: '🔒', cooldown: '◷' });

/** A text from the locale (`tr(key)`, e.g. quests/say.js) or the journal's English when the locale has none. */
export const localText = (tr, key, en) => { if (!tr) return en; const v = tr(key); return v && v !== key ? v : en; };

/** One quest's row and detail. `tr` (optional) localises the copy through the jq.<id>.* keys (journalTextKeys). */
export function questView(id, { qs, now = 0, have = {}, level = 1, tracked = [], tr = null } = {}) {
  const j = JOURNAL_BY_ID[id]; if (!j) return null;
  const T = (k, en) => localText(tr, 'jq.' + id + '.' + k, en);
  const st = statusOf(id, qs, now, { level });
  const objectives = progressOf(id, qs, { have }).map((o) => ({ ...o, text: T('obj.' + o.id, o.text) }));
  const next = objectives.find((o) => !o.done) || null;
  const area = j.markers.find((m) => m.kind === 'quest-area') || null;
  // where "Walk" goes: the giver to turn in, else the objective area while killing or gathering, else the giver
  const toArea = st.status === 'active' && area && next && ['kill', 'gather'].includes(next.type);
  return {
    id, title: T('title', j.title), summary: T('summary', j.summary), description: T('desc', j.description), category: j.category, level: j.level, giver: j.giver, turnIn: j.turnIn,
    status: st.status, lockedLevel: st.reason === 'level' ? st.level : null, icon: ICON[st.status] || '', sort: j.sort,
    counter: next ? `${next.count}/${next.of}` : null, objectives,
    rewards: j.rewards.title ? { ...j.rewards, title: T('rewardTitle', j.rewards.title) } : j.rewards,
    hints: j.hints.map((h, n) => ({ ...h, text: T('hint.' + n, h.text) })),
    markers: j.markers.map((m) => ({ ...m, label: localText(tr, 'jq.marker.' + m.id, m.label) })),
    tracked: tracked.includes(id), canAbandon: j.category !== 'story' && st.status === 'active',
    walk: toArea ? { kind: 'area', pos: area.pos, label: localText(tr, 'jq.marker.' + area.id, area.label) } : { kind: 'giver', giver: st.status === 'ready' ? j.turnIn : j.giver },
  };
}

/** Every tab's rows (and the daily reset). Done holds completed and cooldown quests. */
export function journalModel({ qs, now = 0, have = {}, level = 1, tracked = [], search = '', giverName = (k) => k, tr = null } = {}) {
  const views = JOURNAL.map((j) => questView(j.id, { qs, now, have, level, tracked, tr }));
  const q = String(search || '').trim().toLowerCase();
  const match = (v) => !q || v.title.toLowerCase().includes(q) || String(giverName(v.giver)).toLowerCase().includes(q);
  const tabs = {};
  for (const t of TABS) tabs[t] = [];
  for (const v of views) {
    if (!match(v)) continue;
    const done = v.status === 'completed' || (v.status === 'cooldown' && v.category !== 'daily');
    (done ? tabs.done : tabs[v.category]).push(v);
  }
  for (const t of TABS) tabs[t].sort((a, b) => (RANK[a.status] - RANK[b.status]) || (a.sort - b.sort));
  const badge = Object.fromEntries(TABS.map((t) => [t, tabs[t].filter((v) => v.status === 'ready' || v.status === 'available').length]));
  return { tabs, badge, resetAt: nextDailyReset(now) };
}

/** "03:12:08" until a time (for the daily countdown). */
export function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

/** Tracking (pure): at most three, newest last; returns {tracked, ok, reason?}. */
export function toggleTrack(tracked, id) {
  if (tracked.includes(id)) return { tracked: tracked.filter((x) => x !== id), ok: true };
  if (tracked.length >= MAX_TRACKED) return { tracked, ok: false, reason: 'full' };
  return { tracked: [...tracked, id], ok: true };
}
