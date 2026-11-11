// Achievements (local, owner 11.11): derived from what the town ledger, the wheel, the inventory and Day 1 already
// record, so nothing new has to be tracked and nothing can drift. Each has a goal; progress = min(1, value / goal).
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first_sign', goal: 1, of: (s) => s.signsRead }),
  Object.freeze({ id: 'reader', goal: 10, of: (s) => s.signsRead }),
  Object.freeze({ id: 'verified', goal: 3, of: (s) => s.trialsVerified }),
  Object.freeze({ id: 'price', goal: 1, of: (s) => s.memoriesForgotten }),
  Object.freeze({ id: 'employer', goal: 1, of: (s) => s.agentsHired }),
  Object.freeze({ id: 'guild', goal: 5, of: (s) => s.agentsHired }),
  Object.freeze({ id: 'quest', goal: 3, of: (s) => s.questSteps }),
  Object.freeze({ id: 'spinner', goal: 1, of: (s) => s.spins }),
  Object.freeze({ id: 'collector', goal: 8, of: (s) => s.distinctItems }),
  Object.freeze({ id: 'elise', goal: 1, of: (s) => (s.eliseMinted ? 1 : 0) }),
  Object.freeze({ id: 'level5', goal: 5, of: (s) => s.level }),
]);

/** [{id, value, goal, progress, done}] from the combined stats. */
export function achievementsFor(stats) {
  return ACHIEVEMENTS.map((a) => { const value = Math.max(0, Number(a.of(stats)) || 0); return { id: a.id, value, goal: a.goal, progress: Math.min(1, value / a.goal), done: value >= a.goal }; });
}
