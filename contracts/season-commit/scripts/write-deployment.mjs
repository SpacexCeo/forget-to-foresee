// Turns the deploy records in target/judge-deploy/*.json (written by scripts/deploy-judge-season.sh) and the shard NFT
// records in ../memory-shard/target/judge-deploy/*.json (deploy-judge-shards.sh) into the
// client's deployment module game/src/net/near-deployment.js: contract id, RPC hosts, explorer and, per committed
// season, the seed, root and transaction hashes the badge links to. Public data only (no keys).
// Usage: node scripts/write-deployment.mjs [--contract <id>] [--rpc <url,url>] [--explorer <url>]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const target = fileURLToPath(new URL('../../../game/src/net/near-deployment.js', import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };

const recDir = `${dir}target/judge-deploy/`;
const records = existsSync(recDir) ? readdirSync(recDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(recDir + f, 'utf8'))) : [];
if (!records.length) throw new Error(`no deploy records in ${recDir}; run scripts/deploy-judge-season.sh first`);
const contracts = new Set(records.map((r) => r.contractId));
const contractId = opt('--contract', records[records.length - 1].contractId);
if (!/\.testnet$/.test(contractId)) throw new Error(`refusing a non-testnet contract id: ${contractId}`);
if (contracts.size > 1) console.warn(`records mention several contracts (${[...contracts].join(', ')}); using ${contractId}`);

// Shard NFT deploy records (contracts/memory-shard/scripts/deploy-judge-shards.sh) live next door.
const shardDir = `${dir}../memory-shard/target/judge-deploy/`;
const shardRecords = existsSync(shardDir) ? readdirSync(shardDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(shardDir + f, 'utf8'))) : [];
const shardContractId = opt('--shard-contract', shardRecords.length ? shardRecords[shardRecords.length - 1].contractId : null);
if (shardContractId && !/\.testnet$/.test(shardContractId)) throw new Error(`refusing a non-testnet shard contract id: ${shardContractId}`);
const shardMints = {};
for (const r of shardRecords.filter((x) => x.contractId === shardContractId)) shardMints[r.seasonId] = { ...(shardMints[r.seasonId] || {}), ...(r.mintTx || {}) };

const seasons = {};
for (const r of records.filter((x) => x.contractId === contractId)) {
  seasons[r.seasonId] = { seedHex: r.seedHex, scheduleRoot: r.scheduleRoot, commitTx: r.commitTx || null, ashKeyTx: r.ashKeyTx || null, revealTx: r.revealTx || {} };
}
const deployment = {
  network: 'testnet',
  contractId,
  rpcUrls: opt('--rpc', 'https://rpc.testnet.near.org,https://test.rpc.fastnear.com').split(','),
  explorer: opt('--explorer', 'https://testnet.nearblocks.io'),
  seasons,
  shardContractId,
  shardMints,
};
const src = `// Where the season-commit contract lives on NEAR testnet and which seasons were committed there.
// Written by \`contracts/season-commit/scripts/write-deployment.mjs\` after a deploy (docs/near.md); edit by hand
// only to point the game at another deployment. \`contractId: null\` disables every NEAR lookup in the game.
// Testnet only: nothing here is a key, a balance or a mainnet address.
export const NEAR_DEPLOYMENT = ${JSON.stringify(deployment, null, 2).replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1:')};
`;
writeFileSync(target, src);
console.log(`wrote ${target}: ${contractId}, ${Object.keys(seasons).length} season(s); shards: ${shardContractId || 'none'}`);
