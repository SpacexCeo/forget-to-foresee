// Weekly tournament, simulation only (spec §7): schedule, synthetic enrollment,
// sealed results. No money, no prizes, no entry fee; the trophy is a badge.
// Enrollment is idempotent per (week, player) and survives a "coordinator restart"
// (a new store over the same storage).
import { sha256 } from '../game/crypto.js';
import { STORAGE_KEYS } from './storage.js';

const DAY = 86400000, HOUR = 3600000;

/** ISO-8601 week of a UTC timestamp. */
export function isoWeek(ms) {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const year = t.getUTCFullYear();
  return { year, week: Math.ceil(((t - Date.UTC(year, 0, 1)) / DAY + 1) / 7) };
}

/**
 * Synthetic weekly schedule (UTC): enrollment Monday 00:00 → Saturday 18:00
 * (the enrollment barrier), one accelerated season until Saturday 20:00
 * (the results barrier), results visible until the week ends.
 */
export function weeklySchedule(nowMs) {
  const d = new Date(nowMs);
  const day = (d.getUTCDay() + 6) % 7;
  const opensAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const { year, week } = isoWeek(nowMs);
  return {
    weekId: `${year}-W${String(week).padStart(2, '0')}`,
    year, week,
    opensAt,
    closesAt: opensAt + 5 * DAY + 18 * HOUR,
    resultsAt: opensAt + 5 * DAY + 20 * HOUR,
    endsAt: opensAt + 7 * DAY,
  };
}

export function tournamentPhase(schedule, nowMs) {
  if (nowMs < schedule.opensAt) return 'upcoming';
  if (nowMs < schedule.closesAt) return 'open';
  if (nowMs < schedule.resultsAt) return 'running';
  return 'results';
}

/** Splits a duration into days/hours/minutes for the `tour.duration` message. */
export function splitDuration(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
}

export const entryIdFor = (weekId, playerId) => sha256(`ftf:enroll:v1|${weekId}|${playerId}`).slice(0, 8);
const OUTCOMES = ['gift', 'survived', 'lost', 'weapon', 'gone'];
const OUTCOME_SCORE = { gift: 5, survived: 4, lost: 2, weapon: 1, gone: 0 };

export function createTournamentStore({ storage, clock = () => Date.now() } = {}) {
  const load = () => {
    const s = storage ? storage.getJSON(STORAGE_KEYS.tournament) : null;
    return s && typeof s.enrollments === 'object' ? s : { enrollments: {} };
  };
  let state = load();
  const save = () => { if (storage) storage.setJSON(STORAGE_KEYS.tournament, state); };
  const subs = new Set();
  const emit = () => { for (const fn of [...subs]) fn(); };

  function entryFor(weekId, playerId) {
    const e = state.enrollments[weekId] && state.enrollments[weekId][playerId];
    return e ? { ...e } : null;
  }

  return {
    schedule: (now = clock()) => weeklySchedule(now),
    phase: (now = clock()) => tournamentPhase(weeklySchedule(now), now),
    entryFor,
    /**
     * Idempotent enrollment. Repeating it (same player, any requestId) returns the
     * same entry with duplicate=true and writes nothing new.
     */
    enroll({ playerId, requestId = null, now = clock() }) {
      if (!playerId) return { ok: false, reason: 'no_player' };
      const sch = weeklySchedule(now);
      const existing = entryFor(sch.weekId, playerId);
      if (existing) return { ok: true, duplicate: true, entry: existing };
      if (tournamentPhase(sch, now) !== 'open') return { ok: false, reason: 'closed' };
      const entry = { weekId: sch.weekId, playerId, entryId: entryIdFor(sch.weekId, playerId), requestId, enrolledAt: new Date(now).toISOString(), simulation: true };
      state.enrollments[sch.weekId] = { ...(state.enrollments[sch.weekId] || {}), [playerId]: entry };
      save(); emit();
      return { ok: true, duplicate: false, entry: { ...entry } };
    },
    /** Count of enrollments recorded for a week (simulation keeps them per device). */
    count(weekId) { return Object.keys(state.enrollments[weekId] || {}).length; },
    /**
     * Results table, or null before the results barrier (nothing is revealed early).
     * Rows carry only public data: rank, entrant label, outcome. No hidden values.
     */
    results({ playerId = null, now = clock() } = {}) {
      const sch = weeklySchedule(now);
      if (now < sch.resultsAt) return null;
      const rows = ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ kind: 'sim', letter, seed: `${sch.weekId}|${letter}` }));
      if (playerId && entryFor(sch.weekId, playerId)) rows.push({ kind: 'you', letter: null, seed: `${sch.weekId}|${playerId}` });
      for (const r of rows) {
        const h = sha256('ftf:result:v1|' + r.seed);
        r.outcome = OUTCOMES[parseInt(h.slice(0, 2), 16) % OUTCOMES.length];
        r.score = OUTCOME_SCORE[r.outcome] * 100 + (parseInt(h.slice(2, 4), 16) % 100);
        delete r.seed;
      }
      rows.sort((a, b) => b.score - a.score);
      rows.forEach((r, i) => { r.rank = i + 1; r.trophy = i === 0; });
      return { weekId: sch.weekId, simulation: true, rows };
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** Re-reads storage (what a restarted coordinator would see). */
    reload() { state = load(); emit(); },
  };
}
