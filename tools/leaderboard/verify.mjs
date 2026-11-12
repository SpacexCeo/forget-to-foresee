#!/usr/bin/env node
// Re-derives a snapshot from the logs and the rules in this checkout; exits 1 on any edited row, wrong root or rule
// mismatch.   node tools/leaderboard/verify.mjs <snapshot.json> <logs-dir> [--from=ms] [--to=ms]
import { readFileSync } from 'node:fs';
import { loadAccounts, verifySnapshot } from './lib.mjs';
const [file, dir, ...rest] = process.argv.slice(2);
if (!file || !dir) { console.error('usage: verify.mjs <snapshot.json> <logs-dir>'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const window = { from: opt.from ? Number(opt.from) : undefined, to: opt.to ? Number(opt.to) : undefined };
const r = verifySnapshot(JSON.parse(readFileSync(file, 'utf8')), loadAccounts(dir).accounts, { window });
console.log(r.ok ? 'OK: every row, the root and the rules match the logs' : 'MISMATCH\n  ' + r.problems.join('\n  '));
process.exit(r.ok ? 0 : 1);
