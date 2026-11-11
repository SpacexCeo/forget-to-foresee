// A minimal NEAR testnet transaction client for Day 1 (owner decision, 11.11: the browser signs one kind of call).
// It builds and signs a FunctionCall transaction (borsh, as nearcore expects), sends it and waits for the final
// outcome. Keys are ed25519 via WebCrypto; NEAR's text form is `ed25519:<base58>` (secret = seed 32 + public 32).
// No dependencies. Used with two keys only: the guests contract's create_guest-only key (from the build environment)
// and the player's own browser key (kept in localStorage; its public part is the guest account's full-access key).

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58encode(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; }
  return s;
}
export function b58decode(s) {
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Uint8Array.from(out);
}

/** Borsh writer for the transaction layout. */
class W {
  constructor() { this.parts = []; }
  u8(v) { this.parts.push(Uint8Array.of(v)); return this; }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); this.parts.push(b); return this; }
  u64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); this.parts.push(b); return this; }
  u128(v) { const x = BigInt(v), b = new Uint8Array(16), d = new DataView(b.buffer); d.setBigUint64(0, x & 0xffffffffffffffffn, true); d.setBigUint64(8, x >> 64n, true); this.parts.push(b); return this; }
  bytes(b) { this.parts.push(b); return this; }
  vec(b) { this.u32(b.length); this.parts.push(b); return this; }
  str(s) { return this.vec(new TextEncoder().encode(s)); }
  done() { const n = this.parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}

/** Public key text -> 33 borsh bytes (key type 0 = ed25519, then 32 bytes). */
export const publicKeyBytes = (text) => { const k = b58decode(String(text).replace(/^ed25519:/, '')); if (k.length !== 32) throw new Error('bad public key'); return Uint8Array.of(0, ...k); };

/**
 * Serializes a Transaction with one FunctionCall action (nearcore borsh layout).
 * @param {{signerId: string, publicKey: string, nonce: bigint|number, receiverId: string, blockHash: string, methodName: string, args: object, gas: bigint|number, deposit: bigint|number}} t
 */
export function serializeFunctionCallTx(t) {
  const args = new TextEncoder().encode(JSON.stringify(t.args || {}));
  return new W()
    .str(t.signerId).bytes(publicKeyBytes(t.publicKey)).u64(t.nonce).str(t.receiverId).bytes(b58decode(t.blockHash))
    .u32(1).u8(2) // one action: FunctionCall (enum index 2)
    .str(t.methodName).vec(args).u64(t.gas).u128(t.deposit)
    .done();
}
/** SignedTransaction = transaction bytes + signature (type 0 + 64 bytes). */
export const signedTxBytes = (txBytes, sig) => new W().bytes(txBytes).u8(0).bytes(sig).done();

const PKCS8_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

/** Imports a NEAR secret key text for signing. Returns {publicKey (text), sign(bytes) -> Uint8Array(64)}. */
export async function importSecretKey(text) {
  const sk = b58decode(String(text).replace(/^ed25519:/, ''));
  if (sk.length !== 64) throw new Error('bad secret key');
  const key = await subtle().importKey('pkcs8', Uint8Array.from([...PKCS8_PREFIX, ...sk.slice(0, 32)]), { name: 'Ed25519' }, false, ['sign']);
  return { publicKey: 'ed25519:' + b58encode(sk.slice(32)), sign: async (bytes) => new Uint8Array(await subtle().sign({ name: 'Ed25519' }, key, bytes)) };
}

/** A new ed25519 keypair in NEAR text form: {secretKey, publicKey}. */
export async function generateKeyPair() {
  const kp = await subtle().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', kp.privateKey));
  const pub = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  const seed = pkcs8.slice(pkcs8.length - 32);
  return { secretKey: 'ed25519:' + b58encode(Uint8Array.from([...seed, ...pub])), publicKey: 'ed25519:' + b58encode(pub) };
}

export const sha256 = async (bytes) => new Uint8Array(await subtle().digest('SHA-256', bytes));
const b64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/**
 * An RPC client: views, access-key nonce, final block hash, and send-and-wait for a FunctionCall.
 * @param {{rpcUrls: string[], fetch?: Function, timeoutMs?: number}} o
 */
export function createTxClient({ rpcUrls, fetch = globalThis.fetch, timeoutMs = 60000 }) {
  let i = 0;
  async function rpc(method, params) {
    let last = null;
    for (let k = 0; k < rpcUrls.length; k++) {
      const url = rpcUrls[(i + k) % rpcUrls.length];
      try {
        const ac = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'ftf', method, params }), signal: ac ? ac.signal : undefined });
        if (timer) clearTimeout(timer);
        const j = await res.json();
        if (j.error) { const e = new Error((j.error.cause && j.error.cause.name) || j.error.message || 'RPC error'); e.rpc = j.error; throw e; }
        i = (i + k) % rpcUrls.length;
        return j.result;
      } catch (e) { last = e; if (e.rpc) throw e; }
    }
    throw last || new Error('RPC unreachable');
  }
  return {
    rpc,
    async view(contractId, method, args = {}) {
      const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: contractId, method_name: method, args_base64: b64(new TextEncoder().encode(JSON.stringify(args))) });
      const text = new TextDecoder().decode(Uint8Array.from(r.result));
      return text ? JSON.parse(text) : null;
    },
    /**
     * Signs and sends one FunctionCall with `key` ({publicKey, sign}) as `signerId`; waits for the final outcome.
     * Resolves {ok, hash, outcome, failure}: ok only when the transaction and all its receipts succeeded.
     */
    async call({ key, signerId, receiverId, methodName, args, gas = 200_000_000_000_000n, deposit = 0n }) {
      const ak = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: signerId, public_key: key.publicKey });
      const block = await rpc('block', { finality: 'final' });
      const tx = serializeFunctionCallTx({ signerId, publicKey: key.publicKey, nonce: BigInt(ak.nonce) + 1n, receiverId, blockHash: block.header.hash, methodName, args, gas, deposit });
      const hash = await sha256(tx);
      const sig = await key.sign(hash);
      const outcome = await rpc('send_tx', { signed_tx_base64: b64(signedTxBytes(tx, sig)), wait_until: 'FINAL' });
      const failure = findFailure(outcome);
      return { ok: !failure, hash: b58encode(hash), outcome, failure };
    },
  };
}

/** The first failure in a final outcome (the transaction or any receipt), or null. */
export function findFailure(outcome) {
  if (!outcome) return 'no outcome';
  const st = outcome.status || {};
  if (st.Failure) return JSON.stringify(st.Failure).slice(0, 200);
  for (const r of outcome.receipts_outcome || []) { const s = r.outcome && r.outcome.status; if (s && s.Failure) return JSON.stringify(s.Failure).slice(0, 200); }
  return null;
}
