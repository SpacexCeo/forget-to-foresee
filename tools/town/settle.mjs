#!/usr/bin/env node
// Plans a season's tournament payouts in silk and prints the settle_season calls for the coordinator (the lead runs
// them; this tool never signs or sends). The ranks come from the season's results (best first); the pot is the
// contract's: the purse plus the season's mint ceiling (rules: game/src/game/town-rules.js planPayouts,
// seasonMintCap). The hash of the whole payout list is logged on chain with every batch.
//   node tools/town/settle.mjs --season <id> --results results.json [--town ftf-town.testnet] [--batch 40] [--pot <micro>] [--purse <micro>]
//   results.json: ["acc1.testnet", "acc2.testnet", ...] or [{"account": "...", "score": 12}, ...] (sorted by score)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULT_PARAMS as P, planPayouts, seasonMintCap, fmt } from '../../game/src/game/town-rules.js';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const TOWN = arg('town', 'ftf-town.testnet'), SEASON = arg('season'), FILE = arg('results'), BATCH = Number(arg('batch', 40));
const SIGNER = process.env.SIGNER || 'ftf-coordinator.testnet';
const RPC = process.env.RPC || 'https://test.rpc.fastnear.com';
if (!SEASON || !FILE) { console.error('usage: settle.mjs --season <id> --results results.json [--pot micro] [--purse micro]'); process.exit(2); }

async function view(method, args) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: TOWN, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') } }) });
  const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
  return JSON.parse(Buffer.from(j.result.result).toString());
}

export function canonical(payouts) { return payouts.map((x) => `${x.account}:${x.amount}`).join('\n'); }

async function main() {
  const raw = JSON.parse(readFileSync(FILE, 'utf8'));
  const ranked = (Array.isArray(raw) ? raw : []).map((x) => (typeof x === 'string' ? { account: x, score: 0 } : x)).filter((x) => /^[a-z0-9._-]{2,64}$/.test(x.account));
  if (raw.some((x) => typeof x === 'object' && 'score' in x)) ranked.sort((a, b) => b.score - a.score || (a.account < b.account ? -1 : 1));
  let pot = arg('pot') ? BigInt(arg('pot')) : null, note = 'given';
  if (pot === null) {
    try {
      const s = await view('season', { season_id: SEASON });
      if (!s) throw new Error('unknown season');
      if (s.settled) throw new Error('season already settled');
      if (BigInt(s.pot) > 0n) { pot = BigInt(s.pot) - BigInt(s.paid); note = 'season.pot - paid'; }
      else { const p = await view('pulse', {}); pot = BigInt(p.purse) + seasonMintCap(P, s.burn_prev, s.entrants); note = `purse ${fmt(p.purse)} + mint ceiling ${fmt(seasonMintCap(P, s.burn_prev, s.entrants))}`; }
    } catch (e) {
      if (!arg('purse')) { console.error(`could not read ${TOWN} (${e.message}); pass --pot or --purse`); process.exit(1); }
      pot = BigInt(arg('purse')) + seasonMintCap(P, 0, ranked.length); note = 'offline: --purse + mint ceiling (burn_prev 0)';
    }
  }
  const payouts = planPayouts(P, pot, ranked.map((x) => x.account));
  const hash = createHash('sha256').update(canonical(payouts)).digest('hex');
  const total = payouts.reduce((a, x) => a + x.amount, 0n);
  console.log(`# season ${SEASON} on ${TOWN}: ${ranked.length} ranked, pot ${fmt(pot)} silk (${note}), paying ${fmt(total)} silk to ${payouts.length} accounts`);
  console.log(`# payouts_hash ${hash}  (sha256 of "account:amount" lines, best first)`);
  for (let i = 0; i < payouts.length; i += BATCH) {
    const part = payouts.slice(i, i + BATCH), last = i + BATCH >= payouts.length;
    const args = JSON.stringify({ season_id: SEASON, payouts: part.map((x) => [x.account, x.amount.toString()]), payouts_hash: hash, last });
    console.log(`near contract call-function as-transaction ${TOWN} settle_season json-args '${args}' prepaid-gas '200.0 Tgas' attached-deposit '0 NEAR' sign-as ${SIGNER} network-config testnet sign-with-legacy-keychain send`);
  }
  if (!payouts.length) console.log(`near contract call-function as-transaction ${TOWN} settle_season json-args '${JSON.stringify({ season_id: SEASON, payouts: [], payouts_hash: hash, last: true })}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as ${SIGNER} network-config testnet sign-with-legacy-keychain send`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
