#!/usr/bin/env node
// Prints agent-ledger record_track arguments (JSON) for one entry of an expedition log. Dry run only: it never signs or
// sends.   node tools/quest-receipt/args.mjs <log.json> <seq>    (log.json: an array, or {log: [...]})
import { readFileSync } from 'node:fs';
import { receiptArgs, contractCheck } from './lib.mjs';
const [file, seq] = process.argv.slice(2);
if (!file || seq == null) { console.error('usage: args.mjs <log.json> <seq>'); process.exit(2); }
const j = JSON.parse(readFileSync(file, 'utf8')); const log = Array.isArray(j) ? j : j.log;
const a = receiptArgs(log, Number(seq));
const bad = contractCheck(a);
console.log(JSON.stringify(a, null, 1));
console.error(bad ? 'INVALID: ' + bad : 'valid for record_track (deposit 0.01 NEAR, 20 Tgas); dry run, nothing was sent');
process.exit(bad ? 1 : 0);
