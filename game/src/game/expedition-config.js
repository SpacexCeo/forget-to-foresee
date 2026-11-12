// The Expedition's numbers (docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md §3.3): amounts in HUNDREDTHS of town
// silk, as the town ledger counts (game/town-economy.js). Starting values for the pacing test, not facts. Wool is never
// touched by the story. Pure.
export const EXPEDITION = Object.freeze({
  currency: 'silk',                        // town silk; never the engine's S.silk, never wool
  PORTAL_FEE_C: 1_000_000,                 // 10,000 silk (the Gate-Loom); ?portalFee=N is a visible demo fee that never counts
  kill: Object.freeze({ skitter: 1000, veilbell: 2500, hulker: 6000, crownrift: 20000 }), // 10, 25, 60, 200 silk per kill ('skitter' reads "spider")
  killDaySoftC: 600_000,                   // 6,000 silk a day from kills at the full rate; beyond it 25 %
  killAfterSoftFactor: 0.25,
  bounty: Object.freeze({ perDayFull: 3, afterFullFactor: 0.1, cooldownMin: 30 }),
  stipendC: 50_000,                        // 500 silk once, on arrival at the archipelago
  killVerifyCapC: 500_000,                 // T1 kill silk that counts toward the pass: 5,000
});

/** The fee shown and charged: the real one, or a visible QA/demo fee from ?portalFee=N (whole silk) that never counts. */
export function portalFee(search = '') {
  let q = null;
  try { q = new URLSearchParams(search).get('portalFee'); } catch { q = null; }
  const n = q == null ? NaN : Math.round(Number(q));
  return Number.isFinite(n) && n > 0 ? { feeC: n * 100, demo: true } : { feeC: EXPEDITION.PORTAL_FEE_C, demo: false };
}

/** Story mode is on only with ?story=1 (default OFF: the judge link is unchanged). */
export const storyOn = (search = '') => { try { return new URLSearchParams(search).get('story') === '1'; } catch { return false; } };
