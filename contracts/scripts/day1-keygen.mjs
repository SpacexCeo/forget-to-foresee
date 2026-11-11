// ed25519 keys in NEAR's text format (base58). No dependencies.
//   node day1-keygen.mjs                  prints a new secret key  ed25519:<base58 of 64 bytes: seed + public>
//   node day1-keygen.mjs --public <secret> prints its public key   ed25519:<base58 of 32 bytes>
import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; }
  return s;
}
export function unb58(s) {
  let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Uint8Array.from(out);
}
const raw = (key, type) => { const j = key.export({ format: 'jwk' }); return Buffer.from(type === 'pub' ? j.x : j.d, 'base64url'); };
if (process.argv[2] === '--public') {
  const sk = unb58(process.argv[3].replace(/^ed25519:/, ''));
  console.log('ed25519:' + b58(sk.slice(32, 64)));
} else if (process.argv[1] && process.argv[1].endsWith('day1-keygen.mjs')) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  console.log('ed25519:' + b58(Buffer.concat([raw(privateKey), raw(publicKey, 'pub')])));
}
void createPrivateKey; void createPublicKey;
