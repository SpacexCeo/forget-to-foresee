#!/usr/bin/env node
// Scores a directory of verified expedition logs and prints the ranked rows (humans, then scripted NPC).
//   node tools/leaderboard/score.mjs <logs-dir> [--from=ms] [--to=ms]
import { loadAccounts } from './lib.mjs';
import { rankAccounts } from '../../game/src/game/board-score.js';
const [dir, ...rest] = process.argv.slice(2);
if (!dir) { console.error('usage: score.mjs <logs-dir> [--from=ms] [--to=ms]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const window = { from: opt.from ? Number(opt.from) : undefined, to: opt.to ? Number(opt.to) : undefined };
const { accounts, rejected } = loadAccounts(dir);
const r = rankAccounts(accounts, { window });
for (const actor of ['human', 'scripted']) {
  console.log(actor === 'human' ? 'Humans' : 'Scripted NPC');
  for (const x of r[actor]) console.log(`  ${String(x.rank).padStart(3)}  ${String(x.score).padStart(6)}  ${x.account}  Q ${x.parts.Q}  Sk ${x.parts.Sk}  V ${x.parts.V}  P ${x.parts.P}  M ${x.parts.M}`);
}
for (const x of rejected) console.log(`rejected ${x.account}: ${x.reason}${x.at != null ? ' at ' + x.at : ''}`);
