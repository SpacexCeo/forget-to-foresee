// Regenerates a season's schedule from a seed with the published rules and compares it with a proof export.
// This is the "generator is public" half of the fairness check (docs/verify.md): a stranger who has the room's
// revealed entropy, the player's nonce and the beacon derives the seed (tools/verify/verify.mjs does), then runs
// this script to see that the revealed events are exactly what that seed produces under rules v3.
// Usage: node scripts/replay-season.mjs <seedHex> [export.json] [rules=v3]
import { readFileSync } from 'node:fs';
import { createSeason } from '../src/net/engine-host.js';
import { canonicalEvent } from '../src/net/near-season.js';

const [seedHex, file, rules = 'v3'] = process.argv.slice(2);
if (!/^[0-9a-f]{32}$/.test(seedHex || '')) { console.error('usage: node scripts/replay-season.mjs <seedHex 32 hex> [export.json] [rules]'); process.exit(2); }
// Salts and the season id come from the CSPRNG, not from the seed, so they are irrelevant here: the schedule
// (t, place, action, power, delay, dots per leaf) is a pure function of the seed under v3 (P5).
const zero = (n) => new Uint8Array(n);
const { state } = createSeason({ rules, seedHex, randomBytes: zero });
const events = state.events.map((e, index) => ({ index, canonicalEvent: canonicalEvent(e) }));
console.log(`seed ${seedHex} (rules ${rules}) generates ${events.length} events:`);
for (const e of events) console.log(`  ${e.index}: ${e.canonicalEvent}`);
if (!file) process.exit(0);
const doc = JSON.parse(readFileSync(file, 'utf8'));
const leaves = doc.leaf ? [{ leaf: doc.leaf }] : doc.leaves || [];
let failed = 0;
for (const { leaf } of leaves) {
  const mine = events[leaf.index];
  const same = mine && mine.canonicalEvent === leaf.canonicalEvent;
  if (!same) failed++;
  console.log(`  ${same ? '✓' : '✗'} leaf ${leaf.index}: export ${leaf.canonicalEvent} ${same ? 'matches' : 'differs from'} the seed's ${mine ? mine.canonicalEvent : '(none)'}`);
}
if (doc.season && doc.season.entropy && doc.season.entropy.seedHex && doc.season.entropy.seedHex !== seedHex) { failed++; console.log(`  ✗ the export's seed ${doc.season.entropy.seedHex} is not the seed given`); }
console.log(failed ? `FAIL (${failed})` : `OK: ${leaves.length} revealed event(s) are what this seed generates`);
process.exit(failed ? 1 : 0);
