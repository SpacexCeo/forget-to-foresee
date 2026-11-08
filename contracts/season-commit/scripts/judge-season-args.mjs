// Writes the contract arguments for a fixed-seed game season, exactly as the browser builds it for `?demo=judge`
// (or `?seed=<hex>`): the same engine (rules v3), the same seed-derived season id and salts
// (game/src/net/near-season.js), so the commitment the game shows is the one that goes on-chain.
// Usage: node scripts/judge-season-args.mjs [seedHex]   ->  target/judge-args/<seasonId>/*.json + summary.json
// Default seed: the judge demo season `cc161d308faa67539af44205b56b6d4f` (game/src/main.js).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSeason } from '../../../game/src/net/engine-host.js';
import { demoRandomBytes, seasonCommitment, contractArgs } from '../../../game/src/net/near-season.js';

export const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';

/** The commitment of a fixed-seed v3 season as the local transport creates it (same byte stream, same draws). */
export function judgeSeason(seedHex = JUDGE_SEED) {
  // The room draws its 32-bit legacy seed from the same byte stream before newSeason() (engine-host.createSeason),
  // so the arguments go through createSeason, not through newSeason directly.
  const { state } = createSeason({ rules: 'v3', seedHex, randomBytes: demoRandomBytes(seedHex) });
  return { seedHex, commitment: seasonCommitment(state) };
}

const dir = fileURLToPath(new URL('..', import.meta.url));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const seedHex = process.argv[2] || JUDGE_SEED;
  if (!/^[0-9a-f]{32}$/.test(seedHex)) throw new Error('seedHex must be 32 lowercase hex characters');
  const { commitment: c } = judgeSeason(seedHex);
  const args = contractArgs(c);
  const out = `${dir}target/judge-args/${c.seasonId}/`;
  mkdirSync(out, { recursive: true });
  const put = (name, obj) => writeFileSync(out + name, JSON.stringify(obj));
  put('commit-season.json', args.commit_season);
  put('commit-ash-key.json', args.commit_ash_key);
  put('reveal-ash-key.json', args.reveal_ash_key);
  put('season.json', args.get_season);
  for (const r of args.reveal_leaf) put(`reveal-${r.index}.json`, r);
  writeFileSync(out + 'summary.json', JSON.stringify({
    seedHex, rules: 'v3', seasonId: c.seasonId, schemaVersion: c.schemaVersion, scheduleRoot: c.scheduleRoot, leafCount: c.leafCount,
    ashKeyCommitment: c.ashKey.commitment, leaves: c.leaves.map((l) => ({ index: l.index, tick: l.tick, leaf: l.leaf })),
  }, null, 2) + '\n');
  console.log(`seed ${seedHex} -> season ${c.seasonId}, root ${c.scheduleRoot}, ${c.leafCount} leaves, Ash key ${c.ashKey.commitment}`);
  console.log(`arguments: ${out}`);
}
