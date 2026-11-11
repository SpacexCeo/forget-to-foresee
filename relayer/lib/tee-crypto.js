// Dependency-free primitives for checking NEAR AI Cloud response signatures: keccak256, EIP-191 personal-message hash
// and secp256k1 public-key recovery (BigInt, no constant-time needs: everything here is public data).
// Used by the relayer (a local self-check of every signed answer) and by tools/verify-tee.

const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK);

function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) { const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1); for (let y = 0; y < 25; y += 5) s[y + x] ^= d; }
    const b = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
    for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) s[y + x] = b[y + x] ^ (~b[y + ((x + 1) % 5)] & MASK & b[y + ((x + 2) % 5)]);
    s[0] ^= RC[round];
  }
}

/** keccak256 (the Ethereum one, padding 0x01) of bytes -> 32 bytes. */
export function keccak256(bytes) {
  const rate = 136, s = new Array(25).fill(0n);
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes); padded[bytes.length] ^= 0x01; padded[padded.length - 1] ^= 0x80;
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) { let v = 0n; for (let k = 7; k >= 0; k--) v = (v << 8n) | BigInt(padded[off + i * 8 + k]); s[i] ^= v; }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) out[i * 8 + k] = Number((s[i] >> BigInt(8 * k)) & 0xffn);
  return out;
}

export const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export function unhex(h) {
  const s = String(h).replace(/^0x/i, '');
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('bad hex');
  return Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16));
}
const utf8 = (s) => new TextEncoder().encode(s);

/** The EIP-191 hash that `personal_sign` signs: keccak256("\x19Ethereum Signed Message:\n" + len + message). */
export function personalMessageHash(text) {
  const m = utf8(text);
  const pre = utf8('\x19Ethereum Signed Message:\n' + m.length);
  const all = new Uint8Array(pre.length + m.length); all.set(pre); all.set(m, pre.length);
  return keccak256(all);
}

// secp256k1
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m = P) => ((a % m) + m) % m;
function powmod(b, e, m) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
const inv = (a, m = P) => powmod(a, m - 2n, m);
function add(p, q) {
  if (!p) return q; if (!q) return p;
  if (p[0] === q[0]) { if (mod(p[1] + q[1]) === 0n) return null; const l = mod(3n * p[0] * p[0] * inv(2n * p[1])); const x = mod(l * l - 2n * p[0]); return [x, mod(l * (p[0] - x) - p[1])]; }
  const l = mod((q[1] - p[1]) * inv(q[0] - p[0])); const x = mod(l * l - p[0] - q[0]); return [x, mod(l * (p[0] - x) - p[1])];
}
function mul(p, k) { let r = null; k = mod(k, N); while (k > 0n) { if (k & 1n) r = add(r, p); p = add(p, p); k >>= 1n; } return r; }
const big = (b) => BigInt('0x' + ((typeof b === 'string' ? b.replace(/^0x/i, '') : hex(b)) || '0'));
const be32 = (n) => unhex(n.toString(16).padStart(64, '0'));

/** Ethereum address (0x + 40 lowercase hex) of an uncompressed public key point. */
export const addressOf = (pt) => '0x' + hex(keccak256(new Uint8Array([...be32(pt[0]), ...be32(pt[1])])).slice(12));

/** Recovers the signer address from a 32-byte hash and a 65-byte r||s||v signature (v in 0/1 or 27/28). Null if invalid. */
export function recoverAddress(hash32, sig65) {
  const sig = typeof sig65 === 'string' ? unhex(sig65) : sig65;
  if (sig.length !== 65) return null;
  const r = big(sig.slice(0, 32)), s = big(sig.slice(32, 64)); let v = sig[64]; if (v >= 27) v -= 27;
  if (v > 1 || r <= 0n || r >= N || s <= 0n || s >= N) return null;
  const y2 = mod(r * r * r + 7n); let y = powmod(y2, (P + 1n) / 4n, P);
  if (mod(y * y) !== y2) return null;
  if ((y & 1n) !== BigInt(v)) y = P - y;
  const e = big(hash32), ri = inv(r, N);
  const q = add(mul([r, y], mod(s * ri, N)), mul(G, mod(-e * ri, N)));
  return q ? addressOf(q) : null;
}

/** personal_sign recovery of a text message (what NEAR AI Cloud's /v1/signature returns). */
export const recoverPersonal = (text, signature) => { try { return recoverAddress(personalMessageHash(text), signature); } catch { return null; } };

/** Test helper: signs a 32-byte hash with a private key (deterministic k from a counter; tests only). */
export function signHashForTest(hash32, privKey, k = 0x1234567n) {
  const d = typeof privKey === 'bigint' ? privKey : big(privKey);
  const R = mul(G, k), r = mod(R[0], N);
  let s = mod(inv(k, N) * (big(hash32) + r * d), N); let v = Number(R[1] & 1n);
  if (s > N / 2n) { s = N - s; v ^= 1; }
  return new Uint8Array([...be32(r), ...be32(s), 27 + v]);
}
export const publicAddressForTest = (privKey) => addressOf(mul(G, typeof privKey === 'bigint' ? privKey : big(privKey)));

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', typeof text === 'string' ? utf8(text) : text);
  return hex(new Uint8Array(d));
}
