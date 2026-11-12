#!/usr/bin/env node
// Builds snapshot.json (rows + Merkle root), proofs.json and rows.csv from a directory of verified logs.
//   node tools/leaderboard/snapshot.mjs <logs-dir> <out-dir> --season=1 --epoch=0 [--created=ms] [--from=ms] [--to=ms]
// No network and no keys: sealRef (the sealed season the board is published against) is added by the owner's publish
// step from a chain read, never typed here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAccounts, buildSnapshot } from './lib.mjs';
const [dir, out, ...rest] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: snapshot.mjs <logs-dir> <out-dir> --season=1 --epoch=0'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const window = { from: opt.from ? Number(opt.from) : undefined, to: opt.to ? Number(opt.to) : undefined };
const { accounts, rejected } = loadAccounts(dir);
const { snapshot, proofs } = buildSnapshot(accounts, { boardSeason: Number(opt.season || 1), epoch: Number(opt.epoch || 0), createdAt: Number(opt.created || Date.now()), window });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'snapshot.json'), JSON.stringify(snapshot, null, 1) + '\n');
writeFileSync(join(out, 'proofs.json'), JSON.stringify(proofs) + '\n');
writeFileSync(join(out, 'rows.csv'), 'actor,rank,account,score,Q,Sk,V,P,M,quests,killsT1,receipts,flags\n'
  + snapshot.rows.map((r) => [r.actor, r.rank, r.account, r.score, r.parts.Q, r.parts.Sk, r.parts.V, r.parts.P, r.parts.M, r.quests, r.killsT1, r.receipts, r.flags.join(' ')].join(',')).join('\n') + '\n');
console.log(`root ${snapshot.root}  rows ${snapshot.rows.length}  rejected ${rejected.length}  rules ${snapshot.rules.slice(0, 12)}`);
for (const x of rejected) console.log(`rejected ${x.account}: ${x.reason}`);
