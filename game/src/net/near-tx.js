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
/**
 * Serializes a Transaction with several FunctionCall actions to one receiver (a batch; a function-call key may sign
 * it when every action has zero deposit and a permitted method). All actions run in one receipt: all or nothing.
 * @param {{signerId, publicKey, nonce, receiverId, blockHash, calls: {methodName: string, args: object, gas: bigint|number, deposit?: bigint|number}[]}} t
 */
export function serializeMultiCallTx(t) {
  const w = new W().str(t.signerId).bytes(publicKeyBytes(t.publicKey)).u64(t.nonce).str(t.receiverId).bytes(b58decode(t.blockHash)).u32(t.calls.length);
  for (const c of t.calls) w.u8(2).str(c.methodName).vec(new TextEncoder().encode(JSON.stringify(c.args || {}))).u64(c.gas).u128(c.deposit || 0n);
  return w.done();
}
/**
 * Serializes a Transaction with one AddKey action: `newKey` becomes a full-access key of `signerId` (account login:
 * the key a wallet signature derives on every device, docs/account-login.md).
 * @param {{signerId: string, publicKey: string, nonce: bigint|number, blockHash: string, newKey: string}} t
 */
export function serializeAddKeyTx(t) {
  return new W()
    .str(t.signerId).bytes(publicKeyBytes(t.publicKey)).u64(t.nonce).str(t.signerId).bytes(b58decode(t.blockHash))
    .u32(1).u8(5) // one action: AddKey (enum index 5)
    .bytes(publicKeyBytes(t.newKey)).u64(0).u8(1) // AccessKey {nonce: 0, permission: FullAccess (enum index 1)}
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
/**
 * True for an RPC error that is about the endpoint, not the request: a rate limit (code -429, "Too Many Requests") or a
 * deprecated/unavailable endpoint. The client then tries the next URL instead of failing the call (the same signed
 * transaction is safe to send twice: its hash is its identity).
 */
export function endpointError(err) {
  if (!err) return false;
  const text = [err.message, err.name, err.data, err.cause && err.cause.name].map((x) => String(x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : x)).join(' ');
  return err.code === -429 || err.code === 429 || /too many requests|rate.?limit|deprecated|unavailable/i.test(text);
}

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
        if (res.status === 429 || res.status >= 500) { last = new Error('RPC HTTP ' + res.status); continue; } // rate limit or outage: next endpoint
        const j = await res.json();
        if (j.error && endpointError(j.error)) { last = new Error('RPC endpoint refused: ' + String(j.error.message || j.error.code)); continue; }
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
    /** Like call(), with several FunctionCall actions in one transaction (see serializeMultiCallTx). */
    async callMany({ key, signerId, receiverId, calls }) {
      const ak = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: signerId, public_key: key.publicKey });
      const block = await rpc('block', { finality: 'final' });
      const tx = serializeMultiCallTx({ signerId, publicKey: key.publicKey, nonce: BigInt(ak.nonce) + 1n, receiverId, blockHash: block.header.hash, calls });
      const hash = await sha256(tx);
      const sig = await key.sign(hash);
      const outcome = await rpc('send_tx', { signed_tx_base64: b64(signedTxBytes(tx, sig)), wait_until: 'FINAL' });
      const failure = findFailure(outcome);
      return { ok: !failure, hash: b58encode(hash), outcome, failure };
    },
    /**
     * Several FunctionCalls as SEPARATE single-action transactions (a function-call access key may sign only one
     * action per transaction): each is sent once the one before is in a block (consecutive nonces, never out of
     * order), then all final outcomes are read together. Resolves one {ok, hash, outcome, failure} per call, in order;
     * a call that was refused or failed does not stop the others.
     */
    async callEach({ key, signerId, receiverId, calls }) {
      const ak = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: signerId, public_key: key.publicKey });
      const block = await rpc('block', { finality: 'final' });
      const sent = [];
      for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        const tx = serializeFunctionCallTx({ signerId, publicKey: key.publicKey, nonce: BigInt(ak.nonce) + 1n + BigInt(i), receiverId, blockHash: block.header.hash, methodName: c.methodName, args: c.args, gas: c.gas ?? 100_000_000_000_000n, deposit: c.deposit ?? 0n });
        const hash = await sha256(tx);
        const signed = b64(signedTxBytes(tx, await key.sign(hash)));
        try { await rpc('send_tx', { signed_tx_base64: signed, wait_until: 'INCLUDED' }); sent.push({ hash: b58encode(hash), signed }); } catch (e) { sent.push({ hash: b58encode(hash), error: String((e && e.message) || e).slice(0, 160) }); }
      }
      return Promise.all(sent.map(async (s) => {
        if (s.error) return { ok: false, hash: s.hash, outcome: null, failure: s.error };
        try {
          const outcome = await rpc('tx', { tx_hash: s.hash, sender_account_id: signerId, wait_until: 'FINAL' });
          const failure = findFailure(outcome);
          return { ok: !failure, hash: s.hash, outcome, failure };
        } catch (e) { return { ok: false, hash: s.hash, outcome: null, failure: String((e && e.message) || e).slice(0, 160) }; }
      }));
    },
    /** Adds `newKey` as a full-access key of `signerId`, signed by `key` (a full-access key of that account). */
    async addKey({ key, signerId, newKey }) {
      const ak = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: signerId, public_key: key.publicKey });
      const block = await rpc('block', { finality: 'final' });
      const tx = serializeAddKeyTx({ signerId, publicKey: key.publicKey, nonce: BigInt(ak.nonce) + 1n, blockHash: block.header.hash, newKey });
      const hash = await sha256(tx);
      const outcome = await rpc('send_tx', { signed_tx_base64: b64(signedTxBytes(tx, await key.sign(hash))), wait_until: 'FINAL' });
      const failure = findFailure(outcome);
      return { ok: !failure, hash: b58encode(hash), outcome, failure };
    },
    /** The access key's permission ('FullAccess' or {FunctionCall}) of `publicKey` on `accountId`, or null when absent. */
    async accessKey(accountId, publicKey) {
      try { const r = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey }); return r.permission; } catch { return null; }
    },
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
