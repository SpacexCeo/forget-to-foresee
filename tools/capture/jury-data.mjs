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
import { createApi } from '../../game/src/net/api.js';

/** The crisis of the canonical judge playthrough (as judge-shards-args.mjs plays it), read at trial 14: Ash's edges. */
function judgeCrisis() {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, seasonRandomBytes: () => demoRandomBytes(JUDGE_SEED) });
  const { sessionId, token } = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex: JUDGE_SEED }).body;
  let n = 0;
  const obs = () => api.observe(sessionId, token).body.observation;
  const cmd = (type, args = {}) => { const r = api.command(sessionId, token, { actionId: `jury-crisis-${++n}`, expectedVersion: obs().version, type, args }); if (r.status !== 200) throw new Error(type + ' rejected'); };
  cmd('start_season'); for (let i = 0; i < 3; i++) cmd('end_tick');
  cmd('sacrifice_memory', { memoryId: obs().memories.find((m) => m.kind === 'call').id });
  let o = obs();
  for (let g = 0; g < 40 && o.season.tick < 14; g++, o = obs()) {
    const off = o.availableActions.find((a) => a.type === 'decline_offer');
    if (o.availableActions.some((a) => a.type === 'end_tick')) cmd('end_tick'); else if (off) cmd('decline_offer', off.args); else break;
  }
  const edges = o.relationships.edges.filter((e) => e.a === 'ash' || e.b === 'ash').map((e) => ({ clan: e.a === 'ash' ? e.b : e.a, broken: e.broken }));
  const breaks = o.log.filter((l) => /ash/i.test(l.text) && /cut/i.test(l.text)).map((l) => ({ tick: l.tick, text: l.text }));
  const ash = o.relationships.clans.find((c) => c.clan === 'ash');
  return { tick: o.season.tick, isolated: ash.isolated, edges, breaks };
}

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
// Ash's key commitment as the engine made it (docs/near.md: committed on testnet by commit_ash_key, not revealed).
if (st.pepelKey.hash !== 'd1a397141934211d4673b7db523824988957b5d2d06b1ab050341a4b545d99b6') throw new Error('Ash key commitment differs from the testnet record');
const dep = NEAR_DEPLOYMENT, js = dep.seasons[season.seasonId];
const data = {
  seed: JUDGE_SEED, seasonId: season.seasonId, root: season.merkleRoot,
  sign: { forms: ev.forms, dots: ev.dots, slots: [
    { slot: SLOT[0], value: PLACE[ev.place] }, { slot: SLOT[1], value: ACTION[ev.action] },
    { slot: SLOT[2], value: String(POT[ev.power]) }, { slot: SLOT[3], value: 'trial ' + ev.t }] },
  shard: { tokenId: shardTokenId(sh7), ...sh7, svg: shardSvg(sh7), mintTx: dep.shardMints[season.seasonId]['7'] },
  crisis: judgeCrisis(),
  visions: vis.map(({ e, i }) => ({ index: i, forms: e.forms, dots: e.dots })),
  near: { ashKey: st.pepelKey.hash, seasons: dep.contractId, shards: dep.shardContractId, coordinator: 'ftf-coordinator.testnet', commitTx: js.commitTx, ashKeyTx: js.ashKeyTx, reveals: Object.keys(js.revealTx).length, reveal0: js.revealTx['0'] },
  rules: { pot: POT, stake: 10, finaleGift: E.V3.finaleGift, finaleSurvived: E.V3.finaleSurvived, split: E.apportion(20, [3, 2]), askCost: 5 },
};
if (data.shard.root_check === undefined && sh7.schedule_root !== season.merkleRoot) throw new Error('shard root differs from the season root');
writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
console.log(`wrote ${OUT}: sign ${JSON.stringify(data.sign.slots.map((x) => x.value))}, shard ${data.shard.tokenId}, split ${data.rules.split}`);
void readFileSync;
