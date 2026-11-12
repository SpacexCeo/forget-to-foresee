#!/usr/bin/env node
// Mints the wheel wins recorded while the minter key was missing (data/wheel-claims.jsonl), once FTF_SKIN_KEY is in
// relayer/.env. Each claim is minted at most once: the contract refuses a second skin for an account (already owned is
// reported and skipped). Run on the relayer's server:  node scripts/mint-pending.mjs [--dry-run]
import { readFileSync, existsSync } from 'node:fs';
import { createClaimLog, mintSkin, wheelEnv } from '../lib/wheel.js';
import { envConfig } from '../lib/core.js';

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const w = wheelEnv(), cfg = envConfig();
const claims = createClaimLog(w.dataDir).list();
const seen = new Set();
console.log(`${claims.length} recorded claims, contract ${w.skins}`);
if (!w.secretKey && !process.argv.includes('--dry-run')) { console.error('FTF_SKIN_KEY is not set'); process.exit(2); }
for (const c of claims) {
  if (seen.has(c.account_id)) continue; seen.add(c.account_id);
  if (process.argv.includes('--dry-run')) { console.log('would mint', c.account_id, c.seed); continue; }
  // the claim was verified when it was recorded (signature, key, wheel id, roll, spin bound); the key check is skipped here
  const r = await mintSkin({ accountId: c.account_id, publicKey: null, seed: c.seed, n: c.n }, { ...w, rpcUrls: cfg.rpcUrls, skipKeyCheck: true });
  console.log(c.account_id, c.seed, r.status, JSON.stringify(r.body));
}
