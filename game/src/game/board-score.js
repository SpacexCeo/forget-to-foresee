// The board season's score (docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md §8.2; docs/leaderboard.md): a pure
// function of one account's verified expedition log (game/expedition-log.js) plus the few facts that live outside it
// (on-chain quest receipts, wool earned from the purse, trade results). Shared by the in-world board (the player's own
// row, recomputed locally) and tools/leaderboard (snapshots and the verifier). No balance, no transfer and no trade
// proceed is ever read: only rule-minted income events score. T0 never scores (the log only carries T1 and T2).
// Browser-safe (no node imports); the Merkle tree of a snapshot lives in tools/leaderboard/snapshot.mjs.

export const BOARD = Object.freeze({
  version: 1,
  quest: Object.freeze({ q_welcome: 40, q_spiders: 100, q_part: 80, q_boss: 300 }),
  bounty: 30, bountyFullPerDay: 3, bountyAfter: 3,
  silkPerPointC: 1000, // 1 point per 10 silk of kill income (the log counts hundredths)
  t1Factor: 0.25, t1DayCap: 200,
  woolCap: 1000, receiptPoints: 10, receiptCap: 50, portal: 200,
  classes: Object.freeze(['quest', 'hunt', 'trade', 'verify']),
});

const DAY = 86_400_000;
const dayOf = (t) => Math.floor(t / DAY);

/**
 * One account's score.
 * @param {object[]} log the account's verified expedition log (entries {seq, t, kind, data, silkC, trust, hash})
 * @param {object} [o]
 * @param {{receipts?: string[], woolEarned?: number, trades?: number, onChain?: number}} [o.extra] facts read from
 *   chain or the town contract: distinct quest receipt ids, wool earned from the purse/Reserve (T2), collected trade
 *   results, other on-chain verifications (a shard mint, a chest opening)
 * @param {{from?: number, to?: number}} [o.window] the board season (ms, [from, to))
 * @returns {{score: number, parts: {Q: number, Sk: number, Wl: number, V: number, P: number, M: number}, classes: string[],
 *   quests: number, bounties: number, killsT1: number, receipts: number, reachedAt: number|null, lastSeq: number, logHead: string|null}}
 */
export function scoreAccount(log, { extra = {}, window = {} } = {}) {
  const from = window.from ?? -Infinity, to = window.to ?? Infinity;
  const inSeason = (e) => e.t >= from && e.t < to && (e.trust === 'T1' || e.trust === 'T2');
  const classes = new Set();
  let Q = 0, quests = 0, bounties = 0, killsT1 = 0, P = 0, reachedAt = null;
  const seenQuest = new Set(), bountyDay = new Map(), t1Day = new Map();
  let skT2 = 0;
  const scored = (e) => { reachedAt = e.t; };
  for (const e of log || []) {
    if (!inSeason(e)) continue;
    const d = e.data || {};
    if (e.kind === 'quest_turned_in' && BOARD.quest[d.questId] != null && !seenQuest.has(d.questId) && e.trust === 'T2') {
      seenQuest.add(d.questId); Q += BOARD.quest[d.questId]; quests++; classes.add('quest'); scored(e);
    } else if (e.kind === 'bounty_resolved') {
      const day = dayOf(e.t), n = (bountyDay.get(day) || 0) + 1; bountyDay.set(day, n);
      Q += n <= BOARD.bountyFullPerDay ? BOARD.bounty : BOARD.bountyAfter; bounties++; classes.add('quest'); scored(e);
    } else if (e.kind === 'kill_ticketed' && e.silkC > 0) {
      const pts = e.silkC / BOARD.silkPerPointC;
      if (e.trust === 'T2') skT2 += pts;
      else { const day = dayOf(e.t), had = t1Day.get(day) || 0; t1Day.set(day, Math.min(BOARD.t1DayCap, had + pts * BOARD.t1Factor)); killsT1++; }
      classes.add('hunt'); scored(e);
    } else if (e.kind === 'portal_paid' && !d.demo && P === 0) { P = BOARD.portal; scored(e); }
  }
  let Sk = skT2; for (const v of t1Day.values()) Sk += v;
  const receipts = [...new Set((extra.receipts || []).map(String))];
  const V = Math.min(BOARD.receiptCap, receipts.length * BOARD.receiptPoints);
  const Wl = Math.min(BOARD.woolCap, Math.max(0, Math.floor(Number(extra.woolEarned) || 0)));
  if ((Number(extra.trades) || 0) > 0) classes.add('trade');
  if (receipts.length || (Number(extra.onChain) || 0) > 0) classes.add('verify');
  const M = Math.round((0.6 + 0.1 * classes.size) * 10) / 10;
  const raw = Q + Sk + Wl + V + P;
  const last = log && log.length ? log[log.length - 1] : null;
  return {
    score: Math.round(M * raw),
    parts: { Q, Sk: Math.round(Sk * 100) / 100, Wl, V, P, M },
    classes: BOARD.classes.filter((c) => classes.has(c)),
    quests, bounties, killsT1, receipts: receipts.length, reachedAt,
    lastSeq: last ? last.seq : -1, logHead: last ? last.hash : null,
  };
}

/** Board order: score down, then the earliest time the final score was reached, then the account id. */
export function compareRows(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const ta = a.reachedAt ?? Infinity, tb = b.reachedAt ?? Infinity;
  if (ta !== tb) return ta - tb;
  return a.account < b.account ? -1 : a.account > b.account ? 1 : 0;
}

/**
 * Ranked rows for a set of accounts; humans and scripted accounts are ranked separately (a scripted account can never
 * appear in the human list). Accounts with a zero score are kept (rank shown) so "You: rank n of N" stays honest.
 * @param {{account: string, actor?: 'human'|'scripted', log: object[], extra?: object}[]} accounts
 * @param {{window?: object}} [o]
 */
export function rankAccounts(accounts, { window = {} } = {}) {
  const rows = accounts.map((a) => {
    const s = scoreAccount(a.log, { extra: a.extra, window });
    return { account: a.account, actor: a.actor === 'scripted' ? 'scripted' : 'human', score: s.score, parts: s.parts, classes: s.classes,
      quests: s.quests, bounties: s.bounties, killsT1: s.killsT1, receipts: s.receipts, reachedAt: s.reachedAt, lastSeq: s.lastSeq, logHead: s.logHead, flags: [] };
  });
  const out = { human: [], scripted: [] };
  for (const actor of ['human', 'scripted']) out[actor] = rows.filter((r) => r.actor === actor).sort(compareRows).map((r, i) => ({ rank: i + 1, ...r }));
  return out;
}
