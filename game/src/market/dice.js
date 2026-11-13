// Loom Dice (sprint 6.8): a play-money game of chance on a practice network. "Roll under N": the roll is 1-100, you
// win if it is <= N, the payout is stake x 96/N (your stake included), so every bet returns 96 % on average: a 4 %
// house edge, shown on the card. Stakes come from PLAY silk only (silk saved on this device that can never be
// recorded on NEAR); a win adds play silk; nothing is written on chain and the verified log never sees it. Daily
// limits per profile (UTC): net win 40 silk, net loss 60 silk, 200 rolls, 1.5 s between rolls, payout at most 50.
// Every roll is checkable: roll = 1 + floor(100 x seededRandom('dice:' + sha256(wheelId|rollNumber))).
import { seededRandom } from '../game/town-economy.js';
import { sha256 } from '../game/crypto.js';

export const DICE = Object.freeze({
  bets: Object.freeze([50, 25, 10]),
  stakesC: Object.freeze([100, 200, 500, 1000]),   // 1, 2, 5, 10 play silk
  edge: 0.04, maxPayoutC: 5_000, netWinCapC: 4_000, netLossCapC: 6_000, maxRolls: 200, cooldownMs: 1_500,
  allowanceC: 2_000,                               // a one-time play allowance of 20 play silk
});
export const DICE_KEY = 'ftf.dice.v1';
const dayOf = (ms) => Math.floor(ms / 86_400_000);

/** The payout multiplier of a bet: 96 / N. */
export const multiplierOf = (n) => (100 * (1 - DICE.edge)) / n;
/** The payout of a winning stake, in cents (stake included), rounded down. */
export const payoutOf = (stakeC, n) => Math.floor(stakeC * multiplierOf(n));
/** Whether a stake is allowed for a bet (the payout cap). */
export const stakeAllowed = (stakeC, n) => DICE.stakesC.includes(stakeC) && payoutOf(stakeC, n) <= DICE.maxPayoutC;
/** The odds table shown on the card, generated so it can never drift. */
export const oddsTable = () => DICE.bets.map((n) => ({ n, chance: n / 100, multiplier: multiplierOf(n), rtp: 1 - DICE.edge, edge: DICE.edge, maxStakeC: Math.max(...DICE.stakesC.filter((s) => payoutOf(s, n) <= DICE.maxPayoutC)) }));

/** The seed and the roll of roll number `k` of a profile (checkable by anyone). */
export function rollOf(wheelId, k) {
  const seed = sha256(String(wheelId) + '|' + k);
  return { seed, roll: 1 + Math.floor(100 * seededRandom('dice:' + seed)()) };
}

/**
 * The dice state of a profile: {wheelId, rolls (all time), day, rollsToday, netC, lastAt, allowance}.
 * `play()` returns the play silk available (cents); `ledger` holds the town silk (grant/spend).
 */
export function createDice({ storage, ledger, play, wheelId, now = () => Date.now() }) {
  let st = { wheelId, rolls: 0, day: 0, rollsToday: 0, netC: 0, lastAt: 0, allowance: false };
  try { const v = JSON.parse(storage.getItem(DICE_KEY) || 'null'); if (v && v.wheelId === wheelId) st = { ...st, ...v }; } catch { /* fresh */ }
  const save = () => { try { storage.setItem(DICE_KEY, JSON.stringify(st)); } catch { /* memory only */ } };
  const today = () => { if (st.day !== dayOf(now())) { st = { ...st, day: dayOf(now()), rollsToday: 0, netC: 0 }; } return st; };
  return {
    state: () => ({ ...today() }),
    /** The play silk available now (cents). */
    play: () => play(),
    /** Gives the one-time play allowance (20 play silk) once per profile. */
    claimAllowance() { if (st.allowance) return false; st.allowance = true; ledger.grant({ silk: DICE.allowanceC }); save(); return true; },
    /** Why a roll cannot happen now, or null. */
    blocker(stakeC, n) {
      const s = today();
      if (!DICE.bets.includes(n) || !stakeAllowed(stakeC, n)) return 'max_payout';
      if (s.netC >= DICE.netWinCapC) return 'win_cap';
      if (-s.netC >= DICE.netLossCapC) return 'loss_cap';
      if (s.rollsToday >= DICE.maxRolls) return 'max_rolls';
      if (now() - s.lastAt < DICE.cooldownMs) return 'cooldown';
      if (play() < stakeC) return 'no_play_silk';
      return null;
    },
    /** One roll: {ok, roll, seed, k, win, payoutC, netC} | {ok: false, reason}. Play silk only. */
    roll(stakeC, n) {
      const why = this.blocker(stakeC, n);
      if (why) return { ok: false, reason: why };
      const sp = ledger.spend({ silkC: stakeC, reason: 'dice' });
      if (!sp.ok) return { ok: false, reason: 'no_play_silk' };
      const k = st.rolls + 1, { seed, roll } = rollOf(st.wheelId, k);
      const win = roll <= n, payoutC = win ? payoutOf(stakeC, n) : 0;
      if (payoutC) ledger.grant({ silk: payoutC });
      st = { ...st, rolls: k, rollsToday: st.rollsToday + 1, netC: st.netC + payoutC - stakeC, lastAt: now() }; save();
      return { ok: true, roll, seed, k, win, payoutC, stakeC, n, netC: st.netC };
    },
  };
}
