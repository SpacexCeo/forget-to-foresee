#!/usr/bin/env node
// Measures what one market trade costs, on a local NEAR sandbox node (no testnet, no keys, no tokens): deploys
// contracts/market, registers two traders, gives one a trade-only function-call key (as on the relayer's server) and
// sends trades with it. Prints gas burnt per trade, the NEAR it costs at a given gas price, how much of the key's
// allowance a trade uses, and whether the contract's storage grew.
//   node tools/market/sandbox-gas.mjs <near-sandbox binary> <market.wasm> [trades=30] [gasPriceYocto=100000000]
// The binary: https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/Linux-x86_64/<version>/near-sandbox.tar.gz
import { spawn, execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { b58decode, b58encode } from '../../relayer/lib/near-tx.js';
import { ITEMS } from '../../relayer/market/catalog.js';

const [bin, wasmPath, nArg, priceArg] = process.argv.slice(2);
if (!bin || !wasmPath) { console.error('usage: sandbox-gas.mjs <near-sandbox> <market.wasm> [trades] [gasPrice]'); process.exit(2); }
const TRADES = Number(nArg || 30), GAS_PRICE = BigInt(priceArg || 100000000);
const PORT = 3030 + Math.floor(Math.random() * 500);
const home = mkdtempSync(join(tmpdir(), 'ftf-sbx-'));

// --- borsh ---
class W {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 255); return this; }
  u32(v) { for (let i = 0; i < 4; i++) this.b.push((v >>> (8 * i)) & 255); return this; }
  uN(v, n) { v = BigInt(v); for (let i = 0; i < n; i++) { this.b.push(Number(v & 255n)); v >>= 8n; } return this; }
  bytes(a) { for (const x of a) this.b.push(x); return this; }
  vec(a) { return this.u32(a.length).bytes(a); }
  str(s) { return this.vec(new TextEncoder().encode(s)); }
  done() { return Uint8Array.from(this.b); }
}
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
function keyFrom(secretText) {
  const raw = b58decode(secretText.replace(/^ed25519:/, ''));
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(raw.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { priv, pub: Uint8Array.from(pub), text: 'ed25519:' + b58encode(Uint8Array.from(pub)) };
}
function freshKey() {
  const { privateKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  const k = keyFrom('ed25519:' + b58encode(Uint8Array.from([...seed, ...new Uint8Array(32)])));
  return k;
}
const A = {
  create: (w) => w.u8(0),
  deploy: (code) => (w) => w.u8(1).vec(code),
  call: (method, args, gas = 30n * 10n ** 12n, deposit = 0n) => (w) => w.u8(2).str(method).vec(new TextEncoder().encode(JSON.stringify(args))).uN(gas, 8).uN(deposit, 16),
  transfer: (yocto) => (w) => w.u8(3).uN(yocto, 16),
  fullKey: (pub) => (w) => w.u8(5).u8(0).bytes(pub).uN(0, 8).u8(1),
  fnKey: (pub, allowance, receiver, methods) => (w) => { w.u8(5).u8(0).bytes(pub).uN(0, 8).u8(0).u8(1).uN(allowance, 16).str(receiver).u32(methods.length); for (const m of methods) w.str(m); return w; },
};

// --- rpc ---
let rid = 0;
async function rpc(method, params) {
  const r = await fetch(`http://127.0.0.1:${PORT}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}
const view = (account_id, public_key) => rpc('query', { request_type: 'view_access_key', finality: 'final', account_id, public_key });
const account = (account_id) => rpc('query', { request_type: 'view_account', finality: 'final', account_id });
async function send(signer, key, receiver, actions) {
  const ak = await view(signer, key.text);
  const block = await rpc('block', { finality: 'final' });
  const w = new W().str(signer).u8(0).bytes(key.pub).uN(BigInt(ak.nonce) + 1n, 8).str(receiver).bytes(b58decode(block.header.hash)).u32(actions.length);
  for (const a of actions) a(w);
  const tx = w.done();
  const sig = sign(null, createHash('sha256').update(tx).digest(), key.priv);
  const signed = new W().bytes(tx).u8(0).bytes(sig).done();
  const out = await rpc('send_tx', { signed_tx_base64: Buffer.from(signed).toString('base64'), wait_until: 'FINAL' });
  const fail = [out.status, ...out.receipts_outcome.map((r) => r.outcome.status)].find((s) => s && s.Failure);
  if (fail) throw new Error(signer + ' -> ' + receiver + ': ' + JSON.stringify(fail.Failure));
  return out;
}
const burnt = (out) => [out.transaction_outcome, ...out.receipts_outcome].reduce((s, o) => s + BigInt(o.outcome.gas_burnt), 0n);
const tokens = (out) => [out.transaction_outcome, ...out.receipts_outcome].reduce((s, o) => s + BigInt(o.outcome.tokens_burnt), 0n);

async function main() {
  execFileSync(bin, ['--home', home, 'init'], { stdio: 'ignore' });
  const node = spawn(bin, ['--home', home, 'run', '--rpc-addr', `127.0.0.1:${PORT}`, '--network-addr', `127.0.0.1:${PORT + 1000}`], { stdio: 'ignore' });
  try {
    for (let i = 0; ; i++) { try { await rpc('status', {}); break; } catch { if (i > 120) throw new Error('sandbox did not start'); await new Promise((r) => setTimeout(r, 500)); } }
    const vk = JSON.parse(readFileSync(join(home, 'validator_key.json'), 'utf8'));
    const root = { id: vk.account_id, key: keyFrom(vk.secret_key || vk.private_key) };
    const NEAR = 10n ** 24n;
    const mk = async (name, near) => { const key = freshKey(); const id = `${name}.${root.id}`; await send(root.id, root.key, id, [A.create, A.transfer(near * NEAR), A.fullKey(key.pub)]); return { id, key }; };
    const market = await mk('market', 10n), a = await mk('tf-baker', 5n), b = await mk('tf-guard', 5n);
    const code = readFileSync(wasmPath);
    await send(market.id, market.key, market.id, [A.deploy(code), A.call('new', { owner_id: market.id, items: ITEMS.map(({ id, base }) => ({ id, base })) }, 100n * 10n ** 12n)]);
    await send(market.id, market.key, market.id, [A.call('add_traders', { traders: [a.id, b.id], balance: 100000 })]);
    const tradeKeyA = freshKey(), tradeKeyB = freshKey(), ALLOW = NEAR;
    await send(a.id, a.key, a.id, [A.fnKey(tradeKeyA.pub, ALLOW, market.id, ['trade'])]);
    await send(b.id, b.key, b.id, [A.fnKey(tradeKeyB.pub, ALLOW, market.id, ['trade'])]);
    const gas = BigInt(process.env.TRADE_GAS || 10) * 10n ** 12n;
    const it = ITEMS[0];
    const trade = (who, key, to) => send(who.id, key, market.id, [A.call('trade', { to: to.id, item: it.id, qty: 3, price: it.base }, gas)]);
    await trade(a, tradeKeyA, b); await trade(b, tradeKeyB, a); // first writes
    const s0 = (await account(market.id)).storage_usage, aBal0 = BigInt((await account(a.id)).amount), allow0 = BigInt((await view(a.id, tradeKeyA.text)).permission.FunctionCall.allowance);
    const g = [], t = [];
    for (let i = 0; i < TRADES; i++) { const out = await trade(a, tradeKeyA, b); g.push(burnt(out)); t.push(tokens(out)); await trade(b, tradeKeyB, a); }
    const s1 = (await account(market.id)).storage_usage, aBal1 = BigInt((await account(a.id)).amount), allow1 = BigInt((await view(a.id, tradeKeyA.text)).permission.FunctionCall.allowance);
    const avg = g.reduce((x, y) => x + y, 0n) / BigInt(g.length), max = g.reduce((x, y) => (y > x ? y : x), 0n);
    const Tg = (v) => (Number(v) / 1e12).toFixed(3) + ' Tgas', N = (v) => (Number(v) / 1e24).toFixed(6) + ' NEAR';
    const perTrade = avg * GAS_PRICE;
    console.log(JSON.stringify({
      wasmBytes: code.length, trades: TRADES, prepaidGas: Tg(gas),
      gasBurntAvg: Tg(avg), gasBurntMax: Tg(max),
      sandboxTokensBurntAvg: N(t.reduce((x, y) => x + y, 0n) / BigInt(t.length)),
      costPerTradeAtPrice: N(perTrade), gasPriceYocto: String(GAS_PRICE),
      costPer20kDay: N(perTrade * 20000n),
      traderBalanceSpentPerTrade: N((aBal0 - aBal1) / BigInt(TRADES)),
      allowanceUsedPerTrade: N((allow0 - allow1) / BigInt(TRADES)),
      marketStorageBytes: { before: s0, after: s1 },
    }, null, 2));
  } finally { node.kill('SIGKILL'); rmSync(home, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
