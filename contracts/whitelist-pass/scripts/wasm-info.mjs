// Prints a wasm's code hash in base58 (as NEAR's view_account `code_hash`) and its exported functions, and checks the
// export list: no approval, burn or royalty method, nft_transfer present. Read-only. Usage: node wasm-info.mjs <file.wasm>
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const buf = readFileSync(process.argv[2]);
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex')), s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; }
  return s;
}
console.log('code_hash (base58):', base58(createHash('sha256').update(buf).digest()));
// the export section (id 7) of the wasm binary
let p = 8; const exports = [];
const leb = () => { let r = 0, sh = 0, b; do { b = buf[p++]; r |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80); return r >>> 0; };
while (p < buf.length) {
  const id = buf[p++], len = leb(), end = p + len;
  if (id === 7) { const n = leb(); for (let i = 0; i < n; i++) { const l = leb(); const name = buf.slice(p, p + l).toString('utf8'); p += l; const kind = buf[p++]; leb(); if (kind === 0) exports.push(name); } }
  p = end;
}
exports.sort();
console.log('exports (' + exports.length + '):', exports.join(' '));
const banned = exports.filter((e) => /approv|burn|royalt|payout/i.test(e));
const must = ['nft_transfer', 'nft_transfer_call', 'nft_resolve_transfer', 'mint_pass', 'has_minted', 'is_whitelisted', 'is_claimed', 'pass_info'];
const missing = must.filter((m) => !exports.includes(m));
if (banned.length || missing.length) { console.error('EXPORT CHECK FAILED', { banned, missing }); process.exit(1); }
console.log('export check: ok (no approval, burn or royalty method; transfer and pass methods present)');
