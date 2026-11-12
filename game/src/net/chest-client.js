// The chest service client (night plan 12.11, "Loot chests from monsters"; server: relayer/, TEE worker). Opening a
// chest asks the relayer for the next index of the committed season deck; the answer carries the outcome, its Merkle
// leaf and proof, the deck root and the TEE-signed seed. The client recomputes the root from the leaf and the proof and
// calls the opening verified only when that root equals the answer's root and, when the chain can be read, the root
// committed on chain. No relayer, no opening: nothing is ever invented here.
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => { const s = String(h).replace(/^0x/, ''); const out = new Uint8Array(s.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16); return out; };
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

export const CHEST_OUTCOMES = Object.freeze(['nft', 'item', 'silk', 'xp', 'title']);

/** The leaf's preimage (agreed with the server): `${index}|${kind}|${id}|${amount}|${rarity}`. */
export function leafString(index, outcome) {
  const o = outcome || {};
  return `${index}|${o.kind || ''}|${o.id || ''}|${o.amount || 0}|${o.rarity || ''}`;
}

/** sha256 of bytes, as hex. */
export async function sha256Hex(bytes) {
  const s = subtle(); if (!s) throw new Error('no_webcrypto');
  return hex(await s.digest('SHA-256', bytes));
}

/** The root from a leaf and a sorted-pair proof (each step hashes min(a, b) || max(a, b) of the raw 32 bytes). */
export async function rootFromProof(leafHex, proof) {
  let cur = String(leafHex).toLowerCase();
  for (const sib of proof || []) {
    const a = cur, b = String(sib).toLowerCase();
    const [x, y] = a <= b ? [a, b] : [b, a];
    const buf = new Uint8Array(64); buf.set(unhex(x), 0); buf.set(unhex(y), 32);
    cur = await sha256Hex(buf);
  }
  return cur;
}

/**
 * Checks one opening. Returns {leafOk, proofOk, chainOk: true|false|null (unknown), verified}.
 * @param {object} op the server's answer @param {string|null} [chainRoot] the root read from the contract
 */
export async function verifyOpening(op, chainRoot = null) {
  if (!op || op.index == null || !op.outcome || !op.leaf || !op.root) return { leafOk: false, proofOk: false, chainOk: null, verified: false };
  const leaf = await sha256Hex(enc.encode(leafString(op.index, op.outcome)));
  const leafOk = leaf === String(op.leaf).toLowerCase();
  const proofOk = leafOk && (await rootFromProof(leaf, op.proof)) === String(op.root).toLowerCase();
  const chainOk = chainRoot == null ? null : String(chainRoot).toLowerCase().replace(/^0x/, '') === String(op.root).toLowerCase().replace(/^0x/, '');
  return { leafOk, proofOk, chainOk, verified: proofOk && chainOk !== false };
}

/**
 * @param {{relayer?: string|null, fetch?: Function}} [o]
 */
export function createChestClient({ relayer = null, fetch = globalThis.fetch } = {}) {
  const base = relayer ? String(relayer).replace(/\/$/, '') : null;
  return {
    get available() { return !!base; },
    /** The supply: {opened, cap, nftMinted, nftCap, root, contract} or null when the service is unreachable. */
    async status() {
      if (!base) return null;
      try { const r = await fetch(base + '/api/chest/status'); return r.ok ? await r.json() : null; } catch { return null; }
    },
    /**
     * Opens one chest for a guest account. {ok: true, opening} | {ok: false, error: 'off'|'rate'|'sold_out'|'network'|'bad'}.
     * @param {{guest: string, chestId: string, source?: string}} a
     */
    async open({ guest, chestId, source = 'monster' }) {
      if (!base) return { ok: false, error: 'off' };
      if (!guest) return { ok: false, error: 'no_guest' };
      let r;
      try { r = await fetch(base + '/api/chest/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guest, chestId, source }) }); } catch { return { ok: false, error: 'network' }; }
      let body = null; try { body = await r.json(); } catch { /* none */ }
      if (r.status === 429) return { ok: false, error: 'rate' };
      if (r.status === 409) return { ok: false, error: 'sold_out' };
      if (r.status === 503 || r.status === 404) return { ok: false, error: 'off' };
      if (!r.ok || !body || !body.outcome || !CHEST_OUTCOMES.includes(body.outcome.kind)) return { ok: false, error: 'bad' };
      return { ok: true, opening: body };
    },
  };
}
