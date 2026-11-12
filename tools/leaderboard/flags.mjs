#!/usr/bin/env node
// Prints the cluster flags (TZ §8.3) for a directory of logs.   node tools/leaderboard/flags.mjs <logs-dir>
import { loadAccounts, flagsFor } from './lib.mjs';
const dir = process.argv[2];
if (!dir) { console.error('usage: flags.mjs <logs-dir>'); process.exit(2); }
for (const [acc, f] of flagsFor(loadAccounts(dir).accounts)) if (f.length) console.log(`${acc}: ${f.join(', ')}`);
