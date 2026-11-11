#!/usr/bin/env node
// Makes the relayer's chest-opener key on THIS server: writes FTF_CHEST_KEY to relayer/.env (once) and prints only the
// public key, which the lead adds to chests.<signer> as an open_chest-only access key (contracts/scripts/chest-deploy.sh).
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { generateKeyPair, importSecretKey } from '../lib/near-tx.js';

const env = new URL('../.env', import.meta.url);
const text = existsSync(env) ? readFileSync(env, 'utf8') : '';
const m = /^FTF_CHEST_KEY=(\S+)/m.exec(text);
let secret = m && m[1];
if (!secret) { const kp = await generateKeyPair(); secret = kp.secretKey; appendFileSync(env, (text && !text.endsWith('\n') ? '\n' : '') + `FTF_CHEST_KEY=${secret}\n`, { mode: 0o600 }); }
console.log((await importSecretKey(secret)).publicKey);
