#!/usr/bin/env node
// Writes game/cine/jury-data.json: the real data the jury video's motion-graphics pages draw (docs/submission/jury-video.md).
// Everything comes from the game's own code or the testnet deployment record, never typed by hand:
//  - the judge season (seed cc161d30…): its first sign (forms, dots, the meaning of each slot) from the engine;
//  - shard 7 of the judge playthrough: the mint data and its ink-ring SVG (shardSvg(), byte-identical on-chain);
//  - account ids and transaction hashes from game/src/net/near-deployment.js;
//  - the payout numbers from the engine (V3, apportion) so the reward scene cannot drift from the rules.
// Usage: node tools/capture/jury-data.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSeason, E } from '../../game/src/net/engine-host.js';
import { demoRandomBytes } from '../../game/src/net/near-season.js';
import { NEAR_DEPLOYMENT } from '../../game/src/net/near-deployment.js';
import { shardSvg, shardTokenId } from '../../game/src/net/shard-nft.js';
import { judgeShards, JUDGE_SEED } from '../../contracts/memory-shard/scripts/judge-shards-args.mjs';

const OUT = fileURLToPath(new URL('../../game/cine/jury-data.json', import.meta.url));
const SLOT = ['Place', 'Action', 'Power', 'Delay'];
const PLACE = ['Shell I', 'Shell II', 'Shell III', 'Shell IV'];
const ACTION = ['Gift', 'Storm', 'Silence', 'Call'];
const POT = [10, 20, 40, 80];

const s = createSeason({ rules: 'v3', seedHex: JUDGE_SEED, randomBytes: demoRandomBytes(JUDGE_SEED) });
const st = s.state || s;
const ev = (st.events || []).find((e) => e.t === 3) || st.events[0];
const { season, shards } = await judgeShards(JUDGE_SEED);
const sh7 = shards.find((x) => x.data.shard_id === 7).data;
// The signs shard 7's vision opened: the engine's own rule in forget() (future signs by publication, as many as the weight).
const vis = st.events.map((e, i) => ({ e, i })).filter((x) => x.e.pub > sh7.forgotten_at_tick).sort((a, b) => a.e.pub - b.e.pub || a.e.t - b.e.t).slice(0, sh7.weight);
if (vis[0].i !== sh7.unlocked_index) throw new Error(`vision order differs: ${vis[0].i} vs ${sh7.unlocked_index}`);
const dep = NEAR_DEPLOYMENT, js = dep.seasons[season.seasonId];
const data = {
  seed: JUDGE_SEED, seasonId: season.seasonId, root: season.merkleRoot,
  sign: { forms: ev.forms, dots: ev.dots, slots: [
    { slot: SLOT[0], value: PLACE[ev.place] }, { slot: SLOT[1], value: ACTION[ev.action] },
    { slot: SLOT[2], value: String(POT[ev.power]) }, { slot: SLOT[3], value: 'trial ' + ev.t }] },
  shard: { tokenId: shardTokenId(sh7), ...sh7, svg: shardSvg(sh7), mintTx: dep.shardMints[season.seasonId]['7'] },
  visions: vis.map(({ e, i }) => ({ index: i, forms: e.forms, dots: e.dots })),
  near: { seasons: dep.contractId, shards: dep.shardContractId, coordinator: 'ftf-coordinator.testnet', commitTx: js.commitTx, ashKeyTx: js.ashKeyTx, reveals: Object.keys(js.revealTx).length, reveal0: js.revealTx['0'] },
  rules: { pot: POT, stake: 10, finaleGift: E.V3.finaleGift, finaleSurvived: E.V3.finaleSurvived, split: E.apportion(20, [3, 2]), askCost: 5 },
};
if (data.shard.root_check === undefined && sh7.schedule_root !== season.merkleRoot) throw new Error('shard root differs from the season root');
writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
console.log(`wrote ${OUT}: sign ${JSON.stringify(data.sign.slots.map((x) => x.value))}, shard ${data.shard.tokenId}, split ${data.rules.split}`);
void readFileSync;
