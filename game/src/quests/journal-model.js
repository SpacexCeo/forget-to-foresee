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

/** One quest's row and detail. */
export function questView(id, { qs, now = 0, have = {}, level = 1, tracked = [] } = {}) {
  const j = JOURNAL_BY_ID[id]; if (!j) return null;
  const st = statusOf(id, qs, now, { level });
  const objectives = progressOf(id, qs, { have });
  const next = objectives.find((o) => !o.done) || null;
  const area = j.markers.find((m) => m.kind === 'quest-area') || null;
  // where "Walk" goes: the giver to turn in, else the objective area while killing or gathering, else the giver
  const toArea = st.status === 'active' && area && next && ['kill', 'gather'].includes(next.type);
  return {
    id, title: j.title, summary: j.summary, description: j.description, category: j.category, level: j.level, giver: j.giver, turnIn: j.turnIn,
    status: st.status, lockedLevel: st.reason === 'level' ? st.level : null, icon: ICON[st.status] || '', sort: j.sort,
    counter: next ? `${next.count}/${next.of}` : null, objectives, rewards: j.rewards, hints: j.hints, markers: j.markers,
    tracked: tracked.includes(id), canAbandon: j.category !== 'story' && st.status === 'active',
    walk: toArea ? { kind: 'area', pos: area.pos, label: area.label } : { kind: 'giver', giver: st.status === 'ready' ? j.turnIn : j.giver },
  };
}

/** Every tab's rows (and the daily reset). Done holds completed and cooldown quests. */
export function journalModel({ qs, now = 0, have = {}, level = 1, tracked = [], search = '', giverName = (k) => k } = {}) {
  const views = JOURNAL.map((j) => questView(j.id, { qs, now, have, level, tracked }));
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
