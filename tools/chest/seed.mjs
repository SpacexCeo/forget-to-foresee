#!/usr/bin/env node
// Asks NEAR AI Cloud (a model inside a TEE) for the season's seed answer, after the deck is committed (docs/chests.md).
// The request names the committed root, so the TEE signature binds the seed to this deck. Prints the fix_seed args;
// the owner sends them (the contract mixes sha256(signature) with the block's random seed, once).
//   NEARAI_API_KEY=… node tools/chest/seed.mjs [--season s1] [--model <id>] [--out seed-answer.json]
import { writeFileSync } from 'node:fs';
import { commitment } from '../../relayer/lib/chest-deck.js';
import { teeChat, TEE_DEFAULTS } from '../../relayer/lib/tee.js';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const season = opt('--season', 's1'), model = opt('--model', process.env.NEARAI_MODEL || TEE_DEFAULTS.model);
const { root } = commitment(season);

/** The seed request: it names the season and the committed root (the contract checks the root is in it). */
export const seedRequest = (season, root, model) => ({
  model, max_tokens: 40, temperature: 1, stream: false,
  messages: [{ role: 'system', content: 'You witness a game draw. Answer with one short sentence.' },
    { role: 'user', content: `Forget to Foresee loot chests, season ${season}. Committed deck root: ${root}. Bless the draw.` }],
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await teeChat(seedRequest(season, root, model), { apiKey: process.env.NEARAI_API_KEY || 'proxy-injected', nras: true });
  if (r.status !== 200) { console.error('TEE call failed', JSON.stringify(r.body)); process.exit(1); }
  const t = r.body.tee;
  if (!t.verified) { console.error('the answer did not verify', JSON.stringify(t.signature_check), JSON.stringify(t.attestation && t.attestation.checks)); process.exit(1); }
  const out = opt('--out', `seed-${season}-answer.json`);
  writeFileSync(out, JSON.stringify(r.body, null, 2));
  const fix = { request_body: t.request_body, signed_text: t.signed_text, signature: t.signature, signing_address: t.signing_address };
  console.log(`answer saved to ${out} (verify: node tools/verify-tee/verify.mjs ${out})`);
  console.log('fix_seed args:'); console.log(JSON.stringify(fix));
  console.log(`\nnear contract call-function as-transaction chests.ftf-coordinator.testnet fix_seed json-args '${JSON.stringify(fix).replace(/'/g, "'\\''")}' prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' sign-as ftf-coordinator.testnet network-config testnet sign-with-legacy-keychain send`);
}
