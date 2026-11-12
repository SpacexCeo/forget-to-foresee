#!/usr/bin/env node
// Makes the town wallets' keys on THIS server (docs/town-economy.md "Wallets"): one ed25519 key for each of the 20
// trader wallets (trader-01 … trader-20.ftf-town.testnet) and the 6 clan wallets (clan-<clan>.ftf-town.testnet), in
// data/market-keys.json (mode 600, never committed; existing keys are kept). Prints ONLY accounts and public keys,
// the JSON contracts/scripts/town-deploy.sh reads (TRADER_KEYS=<file>):
//   node scripts/market-keys.mjs [town=ftf-town.testnet] > market-public.json
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateKeyPair, importSecretKey } from '../lib/near-tx.js';
import { TRADERS, CLAN_WALLETS, traderAccount, clanAccount, TRADER_METHODS, CLAN_METHODS } from '../market/catalog.js';
import { marketEnv } from '../market/index.js';

const town = process.argv[2] || 'ftf-town.testnet';
const file = marketEnv().keysFile;
const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
old.traders ||= []; old.clans ||= [];
async function ensure(list, key, account) {
  let t = list.find((x) => x.key === key && x.account === account);
  if (!t) { const kp = await generateKeyPair(); t = { key, account, secretKey: kp.secretKey }; list.push(t); }
  return { key, account, public_key: (await importSecretKey(t.secretKey)).publicKey };
}
const traders = [], clans = [];
for (const key of TRADERS) traders.push({ ...(await ensure(old.traders, key, traderAccount(key, town))), methods: TRADER_METHODS });
for (const clan of CLAN_WALLETS) clans.push({ ...(await ensure(old.clans, clan, clanAccount(clan, town))), methods: CLAN_METHODS });
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(old, null, 1), { mode: 0o600 }); chmodSync(file, 0o600);
console.log(JSON.stringify({ town, traders, clans }, null, 1));
