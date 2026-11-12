#!/usr/bin/env node
// Makes the relayer's town coordinator key on THIS server (docs/town-gate.md "Coordinator"): one ed25519 key in
// data/coord-key.json (mode 600, never committed; an existing key is kept), which lib/town-gate.js reads when
// FTF_TOWN_COORD_KEY is not set. Prints ONLY the account and the public key, for the owner to add it as a
// function-call key of that account on ftf-town (register, credit_silk, pay_gate_for and the v4 *_for moves):
//   node scripts/coord-key.mjs [account=gate.ftf-town.testnet]
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateKeyPair, importSecretKey } from '../lib/near-tx.js';
import { coordKeyFile } from '../lib/town-gate.js';

const file = coordKeyFile();
const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
const account = process.argv[2] || (old && old.account) || 'gate.ftf-town.testnet';
const rec = old && old.account === account ? old : { account, secretKey: (await generateKeyPair()).secretKey };
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(rec), { mode: 0o600 }); chmodSync(file, 0o600);
const town = process.env.FTF_TOWN_CONTRACT || 'ftf-town.testnet';
console.log(JSON.stringify({ account, public_key: (await importSecretKey(rec.secretKey)).publicKey, receiver: town, methods: ['register', 'credit_silk', 'pay_gate_for', 'pledge_for', 'claim_for', 'unbond_for', 'exit_early_for', 'invest_stall_for', 'claim_stall_for', 'enter_tournament_for'], kept: rec === old }, null, 1));
