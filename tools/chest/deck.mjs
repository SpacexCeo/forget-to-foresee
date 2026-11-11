#!/usr/bin/env node
// The season deck of loot chests (docs/chests.md): prints the commitment, or the args for commit_deck.
//   node tools/chest/deck.mjs [--season s1]              # summary: size, NFT slots by tier, rewards, root, deck sha256
//   node tools/chest/deck.mjs --season s1 --commit-args  # {"root":"…","deck_sha256":"…"}
//   node tools/chest/deck.mjs --season s1 --lines > deck.txt   # the canonical lines (their sha256 is deck_sha256)
import { buildDeck, commitment } from '../../relayer/lib/chest-deck.js';

const args = process.argv.slice(2);
const season = args.includes('--season') ? args[args.indexOf('--season') + 1] : 's1';
const c = commitment(season);
if (args.includes('--commit-args')) console.log(JSON.stringify({ root: c.root, deck_sha256: c.deck_sha256 }));
else if (args.includes('--lines')) process.stdout.write(c.lines);
else {
  const deck = buildDeck(), count = {};
  for (const d of deck) { const k = `${d.kind} ${d.tier}${d.item ? ' ' + d.item : ''}${d.kind === 'silk' || d.kind === 'xp' ? ' x' + d.amount : ''}`; count[k] = (count[k] || 0) + 1; }
  console.log(`season ${season}: ${c.size} chests, ${c.nft} NFT (${(100 * c.nft / c.size).toFixed(1)}%)`);
  for (const [k, n] of Object.entries(count)) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log(`root        ${c.root}\ndeck_sha256 ${c.deck_sha256}`);
}
