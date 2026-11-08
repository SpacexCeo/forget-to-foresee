// Writes the `mint_shard` arguments for the shards of the canonical judge playthrough: the fixed judge season
// (`?demo=judge`, seed cc161d308faa67539af44205b56b6d4f) played the way the README's judge path plays it — start,
// trials 1-3, forget the Call memory for a vision at trial 4 (the Price of Memory), then let the season run to the end
// (offers declined, vote to accept, no Heir). Every shard of that season (Iris's and the clans') becomes one argument file.
// The data comes from the same room code the browser runs (game/src/net), so a shard minted from these files is exactly
// what a judge sees in the Memories panel of that playthrough.
// Usage: node scripts/judge-shards-args.mjs [seedHex] [--receiver <account.testnet>]  ->  target/judge-shards/<seasonId>/
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApi } from '../../../game/src/net/api.js';
import { demoRandomBytes } from '../../../game/src/net/near-season.js';
import { shardDataFromAuction, shardTokenId, shardMetadata, shardSvg } from '../../../game/src/net/shard-nft.js';

export const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
const dir = fileURLToPath(new URL('..', import.meta.url));

/** Plays the canonical judge playthrough and returns the season and every shard's data. */
export async function judgeShards(seedHex = JUDGE_SEED) {
  // The same room code and seed-derived bytes as the browser's local transport (so the season id and salts match),
  // with `worldRules: 'free'` because this script does not walk Iris to the Scroll for the vote.
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, seasonRandomBytes: () => demoRandomBytes(seedHex) });
  const created = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex, label: 'judge shards' });
  if (created.status !== 201) throw new Error('session failed: ' + JSON.stringify(created.body.error));
  const { sessionId, token } = created.body;
  const tr = { observe: () => api.observe(sessionId, token), command: (env) => api.command(sessionId, token, env) };
  let n = 0;
  const observe = async () => (await tr.observe()).body.observation;
  const cmd = async (type, args = {}) => {
    const o = await observe();
    const r = await tr.command({ actionId: `judge-shards-${type}-${++n}`, expectedVersion: o.version, type, args });
    if (r.status !== 200) throw new Error(`${type} rejected: ${JSON.stringify(r.body.error)}`);
    return r;
  };
  await cmd('start_season');
  for (let i = 0; i < 3; i++) await cmd('end_tick');
  let obs = await observe();
  const call = obs.memories.find((m) => m.kind === 'call') || obs.memories[obs.memories.length - 1];
  await cmd('sacrifice_memory', { memoryId: call.id });
  for (let guard = 0; guard < 80; guard++) {
    obs = await observe();
    if (obs.season.phase === 'end') break;
    const avail = obs.availableActions.map((a) => a.type);
    if (avail.includes('end_tick')) { await cmd('end_tick'); continue; }
    if (avail.includes('cast_vote')) { await cmd('cast_vote', { accept: true }); continue; }
    if (avail.includes('set_heir')) { await cmd('set_heir', { heir: false }); continue; }
    const offer = obs.availableActions.find((a) => a.type === 'decline_offer');
    if (offer) { await cmd('decline_offer', offer.args); continue; }
    throw new Error('stuck: ' + avail.join(','));
  }
  const shards = obs.shards.filter((s) => !s.open).map((a) => ({ auction: a, data: shardDataFromAuction(obs.season, a) }));
  return { seedHex, season: obs.season, shards, outcome: obs.season.outcome };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const seedHex = argv.find((a) => /^[0-9a-f]{32}$/.test(a)) || JUDGE_SEED;
  const ri = argv.indexOf('--receiver');
  const receiver = ri >= 0 ? argv[ri + 1] : '<RECEIVER_ID>';
  const { season, shards, outcome } = await judgeShards(seedHex);
  const out = `${dir}target/judge-shards/${season.seasonId}/`;
  mkdirSync(out, { recursive: true });
  const put = (name, obj) => writeFileSync(out + name, JSON.stringify(obj));
  for (const { data } of shards) {
    put(`mint-${data.shard_id}.json`, { receiver_id: receiver, shard: data });
    writeFileSync(out + `shard-${data.shard_id}.svg`, shardSvg(data));
  }
  writeFileSync(out + 'summary.json', JSON.stringify({
    seedHex, seasonId: season.seasonId, scheduleRoot: season.merkleRoot, outcome, receiver,
    shards: shards.map(({ data }) => ({ tokenId: shardTokenId(data), ...data, title: shardMetadata(data).title })),
  }, null, 2) + '\n');
  console.log(`seed ${seedHex} -> season ${season.seasonId} (${outcome}), ${shards.length} shard(s):`);
  for (const { data } of shards) console.log(`  ${shardTokenId(data)}  ${data.owner_clan} ${data.kind} w${data.weight} trial ${data.forgotten_at_tick} -> ${data.winner_clan ? `${data.winner_clan} for ${data.price}` : 'burned'}${data.unlocked_index != null ? ` (opened sign #${data.unlocked_index + 1})` : ''}`);
  console.log(`arguments: ${out}`);
}
