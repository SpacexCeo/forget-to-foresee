// Synchronous SHA-256 and a small Merkle tree: enough to commit the season's
// future at tick 0 and verify every reveal against the root. Strings hash as UTF-8
// (Ash's phrases, committed on testnet, are multi-byte).

const primes = (n) => {
  const r = [];
  let x = 2;
  while (r.length < n) {
    let p = true;
    for (let i = 2; i * i <= x; i++) if (x % i === 0) { p = false; break; }
    if (p) r.push(x);
    x++;
  }
  return r;
};
const K = primes(64).map((p) => ((Math.cbrt(p) % 1) * 4294967296) | 0);
const H0 = primes(8).map((p) => ((Math.sqrt(p) % 1) * 4294967296) | 0);

export function sha256(str) {
  const msg = new TextEncoder().encode(str);
  const l = msg.length;
  const padLen = ((l + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(msg);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 4, (l * 8) >>> 0);
  dv.setUint32(padLen - 8, Math.floor((l * 8) / 4294967296));
  const H = H0.slice();
  const W = new Int32Array(64);
  for (let o = 0; o < padLen; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getInt32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

export function merkle(leaves) {
  const lv = [leaves];
  while (lv[lv.length - 1].length > 1) {
    const L = lv[lv.length - 1], N = [];
    for (let i = 0; i < L.length; i += 2) N.push(sha256(L[i] + (L[i + 1] ?? L[i])));
    lv.push(N);
  }
  return lv;
}

export function proofFor(levels, idx) {
  const p = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const L = levels[l], sib = idx ^ 1;
    p.push({ h: L[sib] ?? L[idx], left: sib < idx });
    idx >>= 1;
  }
  return p;
}

export function verifyProof(leaf, proof, root) {
  let h = leaf;
  for (const s of proof) h = s.left ? sha256(s.h + h) : sha256(h + s.h);
  return h === root;
}

export const short = (h) => '0x' + h.slice(0, 10) + '…';
