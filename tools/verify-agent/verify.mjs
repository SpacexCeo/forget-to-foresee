#!/usr/bin/env node
// Verifies a townsperson-agent's track record on NEAR testnet (docs/api/verify-agent.md): reads the record from the
// agent-ledger contract over public RPC, checks the sealed price snapshot's sha256, re-runs the agent's deterministic
// policy with the recorded seed and inputs, recomputes the PnL, and prints PASS or FAIL with the first mismatch.
// No dependencies beyond this repository (Node 20+).
//   node tools/verify-agent/verify.mjs <account_id> <npc> <epoch> [ledger_contract]
//   node tools/verify-agent/verify.mjs --file track.json          (a record saved as JSON, no network)
import { readFileSync } from 'node:fs';
import { verifyTrack } from '../../game/src/game/track-record.js';

const RPCS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
async function view(contract, method, args) {
  let last;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') } }) });
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
      return JSON.parse(Buffer.from(j.result.result).toString() || 'null');
    } catch (e) { last = e; }
  }
  throw last;
}

const a = process.argv.slice(2);
let track;
if (a[0] === '--file') track = JSON.parse(readFileSync(a[1], 'utf8'));
else {
  const [account, npc, epoch, ledger = 'ledger.ftf-coordinator.testnet'] = a;
  if (!account || !npc || !epoch) { console.error('usage: node tools/verify-agent/verify.mjs <account_id> <npc> <epoch> [ledger_contract]'); process.exit(2); }
  track = await view(ledger, 'get_track', { account_id: account, npc, epoch: Number(epoch) });
  if (!track) { console.log(`FAIL no record for ${account} / ${npc} / epoch ${epoch} on ${ledger}`); process.exit(1); }
}
const v = verifyTrack(track);
if (v.ok) {
  console.log(`PASS ${track.npc} epoch ${track.epoch}: ${v.trades} trades re-computed from seed "${track.seed}" on snapshot ${track.snapshot_sha256.slice(0, 12)}…, PnL ${v.pnlBp} bp matches the record`);
  process.exit(0);
}
console.log(`FAIL ${v.reason}${v.at != null ? ` at trade ${v.at}` : ''}: expected ${JSON.stringify(v.expected)}, recorded ${JSON.stringify(v.actual)}`);
process.exit(1);
