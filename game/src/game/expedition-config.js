// The Expedition's numbers (docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md §3.3): amounts in HUNDREDTHS of town
// silk, as the town ledger counts (game/town-economy.js). Starting values for the pacing test, not facts. Wool is never
// touched by the story. Pure.
export const EXPEDITION = Object.freeze({
  currency: 'silk',                        // town silk; never the engine's S.silk, never wool
  PORTAL_FEE_C: 1_000_000,                 // 10,000 silk (the Gate-Loom); ?portalFee=N is a visible demo fee that never counts
  kill: Object.freeze({ skitter: 600, veilbell: 1500, hulker: 4000, crownrift: 20000 }), // 6, 15, 40, 200 silk per kill ('skitter' reads "spider"); tuned by silk-pacing.test.mjs (TZ: 10, 25, 60, 200 gave 74 min)
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

/** The Expedition is on by default (one entry, owner 12.11); ?story=0 switches it off. */
export const storyOn = (search = '') => { try { return new URLSearchParams(search).get('story') !== '0'; } catch { return true; } };
