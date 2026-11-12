#!/usr/bin/env node
// Makes one of the relayer's function-call keys on THIS server: writes it to relayer/.env (once) and prints only the
// public key, which the lead adds to the contract as a function-call-only key:
//   node scripts/chest-key.mjs                 FTF_CHEST_KEY (open_chest on chests.<signer>, contracts/scripts/chest-deploy.sh)
//   node scripts/chest-key.mjs FTF_SKIN_KEY    FTF_SKIN_KEY  (mint_skin on skins.<signer>, contracts/scripts/skin-deploy.sh)
//   node scripts/chest-key.mjs FTF_COMPANION_KEY  (nft_mint on companions.<signer>, docs/companions.md)
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { generateKeyPair, importSecretKey } from '../lib/near-tx.js';

const env = new URL('../.env', import.meta.url);
const text = existsSync(env) ? readFileSync(env, 'utf8') : '';
const NAME = /^FTF_[A-Z_]+_KEY$/.test(process.argv[2] || '') ? process.argv[2] : 'FTF_CHEST_KEY';
const m = new RegExp('^' + NAME + '=(\\S+)', 'm').exec(text);
let secret = m && m[1];
if (!secret) { const kp = await generateKeyPair(); secret = kp.secretKey; appendFileSync(env, (text && !text.endsWith('\n') ? '\n' : '') + `${NAME}=${secret}\n`, { mode: 0o600 }); }
console.log((await importSecretKey(secret)).publicKey);
