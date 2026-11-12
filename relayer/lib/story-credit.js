// Story credits on chain (story rev 4 §3.1, §3.5): after a guest's expedition log batch is stored (it passed the hash
// chain, the rule bounds and the kill plausibility of lib/expedition-store.js), every positive silk entry is credited
// to the guest on ftf-town by the coordinator: credit_silk(account, amount, "story:<seq>"), in log order, with the caps
// S1 (story_day_cap, all accounts), S2 (per account: 100 silk a UTC day, 230 in total). When a cap binds the rest
// waits (FIFO) and is credited later; nothing is ever invented. State per guest: <dir>/<guest>.credit.json.
// Sends only with FTF_STORY_CREDIT=1 and the coordinator account and key in the environment.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTxClient, importSecretKey } from './near-tx.js';

export const CREDIT = Object.freeze({
  perDayC: 10_000, totalC: 23_000, allDayC: 600_000, // hundredths: 100 / 230 / 6,000 silk
  microPerC: 10_000, // ftf-town counts micro-silk (1 silk = 1,000,000); the log hundredths
  batch: 20, gas: 10_000_000_000_000n,
  kinds: Object.freeze(['quest_turned_in', 'bounty_resolved', 'kill_ticketed', 'stipend_granted']),
});
const DAY = 86_400_000;

export const creditEnv = (env = process.env) => ({
  on: env.FTF_STORY_CREDIT === '1' && !!env.FTF_TOWN_COORDINATOR && !!env.FTF_TOWN_COORDINATOR_KEY,
  contract: env.FTF_TOWN_CONTRACT || 'ftf-town.testnet', signer: env.FTF_TOWN_COORDINATOR || null, secretKey: env.FTF_TOWN_COORDINATOR_KEY || null,
});

const readJson = (file, fresh) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fresh(); } };

/**
 * What to credit now (pure): entries after `st.lastSeq` with a positive silk delta of a story kind, in order, until a
 * cap binds. {credits: [{seq, kind, silkC}], st', all'}.
 */
export function planCredits(log, st, all, now) {
  const day = Math.floor(now / DAY);
  const s = { lastSeq: st.lastSeq ?? -1, totalC: st.totalC || 0, day, dayC: st.day === day ? st.dayC || 0 : 0 };
  const a = { day, c: all.day === day ? all.c || 0 : 0 };
  const credits = [];
  for (const e of log) {
    if (e.seq <= s.lastSeq) continue;
    if (!(CREDIT.kinds.includes(e.kind) && e.silkC > 0)) { s.lastSeq = e.seq; continue; } // nothing to credit (no earlier entry is waiting: a cap breaks the loop)
    if (s.totalC + e.silkC > CREDIT.totalC || s.dayC + e.silkC > CREDIT.perDayC || a.c + e.silkC > CREDIT.allDayC) break; // FIFO: wait
    credits.push({ seq: e.seq, kind: e.kind, silkC: e.silkC });
    s.lastSeq = e.seq; s.totalC += e.silkC; s.dayC += e.silkC; a.c += e.silkC;
  }
  return { credits, st: s, all: a };
}

/**
 * Credits what the stored log allows now. {credited, pending, hash?, error?}. `send(calls)` is the coordinator's
 * transaction (tests inject it); state is written only after the transaction succeeded.
 */
export async function creditStory({ dir, guest, log, now = Date.now(), send }) {
  const file = join(dir, guest + '.credit.json'), allFile = join(dir, '_story-credit.json');
  const st = readJson(file, () => ({ lastSeq: -1, totalC: 0 })), all = readJson(allFile, () => ({ day: -1, c: 0 }));
  const plan = planCredits(log, st, all, now);
  const credits = plan.credits.slice(0, CREDIT.batch);
  if (!credits.length) { if (plan.st.lastSeq !== st.lastSeq) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ ...st, lastSeq: plan.st.lastSeq })); } return { credited: 0, pending: pendingOf(log, plan.st) }; }
  const calls = credits.map((c) => ({ methodName: 'credit_silk', args: { account_id: guest, amount: String(c.silkC * CREDIT.microPerC), reference: `story:${c.kind}:${c.seq}` }, gas: CREDIT.gas, deposit: 0n }));
  const r = await send(calls);
  if (!r || !r.ok) return { credited: 0, pending: pendingOf(log, st), error: 'tx_failed', hash: r && r.hash };
  const last = credits[credits.length - 1], sum = credits.reduce((x, c) => x + c.silkC, 0);
  const day = Math.floor(now / DAY);
  const next = { lastSeq: last.seq, totalC: (st.totalC || 0) + sum, day, dayC: (st.day === day ? st.dayC || 0 : 0) + sum };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(next));
  writeFileSync(allFile, JSON.stringify({ day, c: (all.day === day ? all.c || 0 : 0) + sum }));
  return { credited: sum, pending: pendingOf(log, next), hash: r.hash };
}
const pendingOf = (log, st) => log.filter((e) => e.seq > (st.lastSeq ?? -1) && CREDIT.kinds.includes(e.kind) && e.silkC > 0).reduce((x, e) => x + e.silkC, 0);

/** The coordinator's multi-call sender for credit_silk (only when creditEnv().on). */
export function coordinatorSender(cfg, { rpcUrls, fetch = globalThis.fetch }) {
  return async (calls) => {
    const client = createTxClient({ rpcUrls, fetch });
    const key = await importSecretKey(cfg.secretKey);
    return client.callMany({ key, signerId: cfg.signer, receiverId: cfg.contract, calls });
  };
}
