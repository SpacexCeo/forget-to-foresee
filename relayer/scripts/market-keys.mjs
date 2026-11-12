#!/usr/bin/env node
// Makes the market traders' keys on THIS server (docs/market.md): one ed25519 key per trader in data/market-keys.json
// (mode 600, never committed; existing keys are kept) and prints ONLY the accounts and public keys, as the JSON that
// contracts/scripts/market-deploy.sh reads (TRADER_KEYS=<file>):
//   node scripts/market-keys.mjs [parent=ftf-coordinator.testnet] > market-public.json
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateKeyPair, importSecretKey } from '../lib/near-tx.js';
import { TRADERS, traderAccount } from '../market/catalog.js';
import { marketEnv } from '../market/index.js';

const parent = process.argv[2] || 'ftf-coordinator.testnet';
const file = marketEnv().keysFile;
const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { traders: [] };
const out = [];
for (const key of TRADERS) {
  let t = old.traders.find((x) => x.key === key);
  if (!t) { const kp = await generateKeyPair(); t = { key, account: traderAccount(key, parent), secretKey: kp.secretKey }; old.traders.push(t); }
  out.push({ key, account: t.account, public_key: (await importSecretKey(t.secretKey)).publicKey });
}
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(old, null, 1), { mode: 0o600 }); chmodSync(file, 0o600);
console.log(JSON.stringify({ traders: out }, null, 1));
