// Read-only watch of the whitelist pass on the day (docs/mainnet-pass-runbook.md step 6): polls public RPC for the
// minter key's remaining allowance, the pass contract's available balance and pass_info, and the relayer's
// /api/health pass block. No keys, no signing, no writes.
//
//   node tools/pass/watch.mjs --network mainnet --contract pass.<owner>.near --minter minter.<owner>.near \
//        --minter-key ed25519:<the minter's PUBLIC key> [--relayer https://relayer.example] [--every 60]
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const network = args.network === 'mainnet' ? 'mainnet' : 'testnet';
const RPC = { mainnet: ['https://rpc.mainnet.near.org', 'https://free.rpc.fastnear.com'], testnet: ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'] }[network];
const { contract, minter } = args;
const minterKey = args['minter-key'];
const every = Math.max(10, Number(args.every) || 60);
if (!contract) { console.error('--contract is required'); process.exit(1); }
if (minterKey && !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(minterKey)) { console.error('--minter-key takes the PUBLIC key (ed25519:<32-44 base58 chars>), never a private key'); process.exit(1); }

async function rpc(method, params) {
  let last;
  for (const url of RPC) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'watch', method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160)); return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}
const view = async (method, a = {}) => { const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(a)).toString('base64') }); return JSON.parse(Buffer.from(r.result).toString() || 'null'); };
const near = (y) => (Number(BigInt(y) / 10n ** 18n) / 1e6).toFixed(4) + ' NEAR';

async function once() {
  const out = { at: new Date().toISOString(), network, contract };
  try { out.pass_info = await view('pass_info'); } catch (e) { out.pass_info = 'ERROR ' + e.message; }
  try { const a = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: contract }); out.available = near(BigInt(a.amount) - BigInt(a.storage_usage) * 10n ** 19n); out.code_hash = a.code_hash; } catch (e) { out.available = 'ERROR ' + e.message; }
  try { const keys = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: contract }); out.contract_keys = keys.keys.length; } catch (e) { out.contract_keys = 'ERROR ' + e.message; }
  if (minter && minterKey) {
    try { const k = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: minter, public_key: minterKey }); const fc = k.permission && k.permission.FunctionCall; out.minter_key = fc ? { receiver: fc.receiver_id, methods: fc.method_names, allowance: fc.allowance == null ? 'unlimited' : near(fc.allowance) } : 'FULL ACCESS (should be a function-call key)'; } catch (e) { out.minter_key = 'ERROR ' + e.message; }
  }
  if (args.relayer) { try { const h = await (await fetch(args.relayer.replace(/\/$/, '') + '/api/health', { signal: AbortSignal.timeout(8000) })).json(); out.relayer = h.pass || null; } catch (e) { out.relayer = 'ERROR ' + e.message; } }
  console.log(JSON.stringify(out));
}
await once();
if (!process.argv.includes('--once')) setInterval(once, every * 1000);
