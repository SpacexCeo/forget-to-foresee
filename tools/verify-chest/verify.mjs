#!/usr/bin/env node
// Independent check of the loot chests on NEAR testnet (docs/chests.md). Node 20+, no dependencies.
//   node tools/verify-chest/verify.mjs [--index <n>] [--contract chests.ftf-coordinator.testnet] [--attest]
//   node tools/verify-chest/verify.mjs --offline data.json [--index <n>]   (data: {info, openings, nftToken?})
// Checks: the committed root is the canonical deck (10,000 / exactly 1,000 NFT); the seed came from a TEE signature
// over a request naming that root, fixed after the commit and mixed with the block seed; every recorded opening's
// random and position replay exactly; the counters; for --index, the outcome's Merkle proof and the NFT's owner.
// --attest also checks the TEE signer's hardware attestation (tools/verify-tee). Prints PASS / FAIL.
import { readFileSync } from 'node:fs';
import { verifyChest } from './lib.mjs';
import { createTxClient } from '../../relayer/lib/near-tx.js';

const args = process.argv.slice(2);
const opt = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const index = opt('--index') != null ? Number(opt('--index')) : null;

async function load() {
  if (opt('--offline')) return JSON.parse(readFileSync(opt('--offline'), 'utf8'));
  const contract = opt('--contract', 'chests.ftf-coordinator.testnet');
  const c = createTxClient({ rpcUrls: ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'] });
  const info = await c.view(contract, 'season_info', {});
  const openings = [];
  while (openings.length < info.opened) openings.push(...await c.view(contract, 'list_openings', { from_index: openings.length, limit: 200 }));
  let nftToken;
  if (index != null && openings[index] && openings[index].nft) nftToken = await c.view(contract, 'nft_token', { token_id: openings[index].token_id });
  return { info, openings, nftToken, contract };
}

const d = await load();
console.log(`Loot chests${d.contract ? ' on ' + d.contract : ''}, season ${d.info.season}`);
const r = verifyChest({ ...d, index });
for (const [ok, text] of r.lines) console.log(`${ok === null ? 'SKIP' : ok ? ' ok ' : 'FAIL'}  ${text}`);
let pass = r.pass;
if (args.includes('--attest') && d.info.seed) {
  const { fetchAttestation } = await import('../verify-tee/verify.mjs');
  const { verifyModelAttestation } = await import('../../relayer/lib/tee-attest.js');
  const model = JSON.parse(d.info.seed.request_body).model;
  const { entry, nonce } = await fetchAttestation({ model, signingAddress: d.info.seed.signing_address });
  const a = entry ? await verifyModelAttestation(entry, { signingAddress: d.info.seed.signing_address, nonce, nras: true }) : { pass: false };
  console.log(`${a.pass ? ' ok ' : 'FAIL'}  the TEE signer ${d.info.seed.signing_address} is attested now (${model}; Intel TDX + GPU, fresh nonce)`);
  pass = pass && a.pass;
}
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
