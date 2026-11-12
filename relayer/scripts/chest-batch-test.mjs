#!/usr/bin/env node
// Checks on testnet that the chest opener's FUNCTION-CALL key may sign one transaction with several open_chest actions
// (the batch design; docs/chests.md "Batch opening"). Run ON THE RELAYER SERVER (it uses FTF_CHEST_KEY from .env):
//   node scripts/chest-batch-test.mjs <guest account that may open today> [count=2]
// Opens `count` real chests for that account in one transaction and prints the tx hash, the receipts' gas and the
// openings read from the chain events. Without --send it only prints what it would send.
import { readFileSync } from 'node:fs';
import { createTxClient, importSecretKey } from '../lib/near-tx.js';
import { BATCH_ACTION_GAS, chestEnv, openedEvents } from '../lib/chest.js';
import { DEFAULTS } from '../lib/core.js';

try { for (const l of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; } } catch { /* no .env */ }
const [account, n = '2'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const count = Math.max(1, Math.min(10, Number(n)));
if (!account) { console.error('usage: chest-batch-test.mjs <guest account> [count] [--send]'); process.exit(2); }
const cfg = chestEnv();
if (!cfg.secretKey) { console.error('FTF_CHEST_KEY is not set'); process.exit(1); }
const key = await importSecretKey(cfg.secretKey);
console.log(`opener key ${key.publicKey} on ${cfg.chests}: ${count} x open_chest({account_id: ${account}}) at ${BATCH_ACTION_GAS / 10n ** 12n} Tgas each`);
if (!process.argv.includes('--send')) { console.log('dry run: add --send to send it'); process.exit(0); }
const client = createTxClient({ rpcUrls: DEFAULTS.rpcUrls });
const r = await client.callMany({ key, signerId: cfg.chests, receiverId: cfg.chests, calls: Array.from({ length: count }, () => ({ methodName: 'open_chest', args: { account_id: account }, gas: BATCH_ACTION_GAS })) });
const burnt = [r.outcome.transaction_outcome, ...r.outcome.receipts_outcome].reduce((s, o) => s + BigInt(o.outcome.gas_burnt), 0n);
console.log(JSON.stringify({ ok: r.ok, tx_hash: r.hash, failure: r.failure, gas_burnt_tgas: Number(burnt) / 1e12, openings: openedEvents(r.outcome) }, null, 1));
