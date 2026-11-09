// Read-only NEAR testnet client for the season-commit contract, and the watcher that turns its answers into the
// "Committed on NEAR testnet ✓" badge next to the browser's own "Verified ✓".
//
// Rules of this module:
//   * read-only: JSON-RPC `query` view calls only; no wallet, no key, no signing, no transaction, ever;
//   * silent degradation: an unreachable RPC, an unknown contract, another seed or a disabled deployment all end in
//     "no badge", never in an error the player sees; the browser verification against the root stands on its own;
//   * honest labels: `on-chain` only when the contract itself recorded the leaf (`reveal_leaf` succeeded on
//     testnet, `get_revealed_leaf` returns the same leaf hash); `dry-run` when the contract's free `check_leaf`
//     view accepts the browser's proof but no transaction recorded it (contracts/season-commit/README.md).
// No DOM here: the world HUD renders the badge model this module computes (docs/collab-requests.md, Task F).
import { NEAR_DEPLOYMENT } from './near-deployment.js';

export const NEAR_TESTNET_RPC = ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'];

const b64 = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'utf8').toString('base64'));
const utf8 = (bytes) => new TextDecoder().decode(Uint8Array.from(bytes));

export class NearError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = 'NearError'; this.code = code; Object.assign(this, extra); }
}

/**
 * A minimal JSON-RPC view client. `view(method, args)` returns the contract's JSON result (null when the method
 * returns null). Network failures try the next RPC URL; a contract-side error throws a NearError with `code`
 * `UNKNOWN_ACCOUNT`, `NO_CONTRACT_CODE`, `CONTRACT_EXECUTION_ERROR` (method panicked or does not exist) or `RPC`.
 * @param {{contractId: string, rpcUrls?: string[], fetch?: typeof fetch, timeoutMs?: number}} o
 */
// 15 s per host: public testnet RPC behind a slow link or a corporate proxy can take 5-10 s per view call.
export function createNearClient({ contractId, rpcUrls = NEAR_TESTNET_RPC, fetch = globalThis.fetch, timeoutMs = 15000 }) {
  if (!contractId) throw new NearError('CONFIG', 'contractId is required');
  let rpcIndex = 0;
  const urls = rpcUrls.length ? rpcUrls : NEAR_TESTNET_RPC;

  async function rpc(body) {
    let lastErr = null;
    for (let attempt = 0; attempt < urls.length; attempt++) {
      const url = urls[(rpcIndex + attempt) % urls.length];
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac ? ac.signal : undefined });
        if (!res.ok) throw new NearError('HTTP', `HTTP ${res.status} from ${url}`);
        const json = await res.json();
        rpcIndex = (rpcIndex + attempt) % urls.length; // stick with the URL that answered
        return json;
      } catch (e) {
        lastErr = e;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw new NearError('NETWORK', 'no NEAR RPC answered: ' + (lastErr && lastErr.message), { cause: lastErr });
  }

  async function view(method, args = {}) {
    const json = await rpc({
      jsonrpc: '2.0', id: 'ftf', method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: contractId, method_name: method, args_base64: b64(JSON.stringify(args)) },
    });
    if (json.error) {
      const cause = json.error.cause || {};
      const name = cause.name || json.error.name || 'RPC';
      throw new NearError(name, json.error.data || json.error.message || name, { rpcError: json.error });
    }
    const r = json.result || {};
    if (r.error) throw new NearError('CONTRACT_EXECUTION_ERROR', r.error, { logs: r.logs });
    const text = utf8(r.result || []);
    return { value: text === '' ? null : JSON.parse(text), blockHeight: r.block_height ?? null, blockHash: r.block_hash ?? null };
  }

  return {
    contractId,
    view,
    /** `get_season` → SeasonView or null when the season was never committed. */
    getSeason: async (seasonId) => (await view('get_season', { season_id: seasonId })).value,
    /** `get_revealed_leaf` → RevealedLeafView or null. */
    getRevealedLeaf: async (seasonId, index) => (await view('get_revealed_leaf', { season_id: seasonId, index })).value,
    getRevealedLeaves: async (seasonId, fromIndex = 0, limit = 100) => (await view('get_revealed_leaves', { season_id: seasonId, from_index: fromIndex, limit })).value,
    getAshKey: async (seasonId) => (await view('get_ash_key', { season_id: seasonId })).value,
    /** Free dry run of `reveal_leaf` with the room's `proof(index)` record → {valid, leaf, error}. */
    checkLeaf: async (proof) => (await view('check_leaf', leafArgs(proof))).value,
    getCoordinators: async () => (await view('get_coordinators', {})).value,
  };
}

/** The `reveal_leaf` / `check_leaf` arguments for a proof record as `GET /sessions/:id/proof/:index` returns it. */
export function leafArgs(proof) {
  return { season_id: proof.seasonId, index: proof.index, canonical_event: proof.canonicalEvent, salt: proof.salt, merkle_path: proof.path };
}

/** Explorer links (nearblocks testnet layout). */
export function explorerLinks(deployment, { txHash = null, accountId = null } = {}) {
  const base = (deployment.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '');
  return {
    contract: `${base}/address/${deployment.contractId}`,
    account: accountId ? `${base}/address/${accountId}` : null,
    tx: txHash ? `${base}/txns/${txHash}` : null,
  };
}

/**
 * Compares the browser's season with the contract's record of it.
 * @returns {'committed'|'mismatch'} committed = same root, same leaf count, a schema the browser hashes with
 */
export function compareSeason(local, onChain) {
  const sameRoot = onChain && onChain.schedule_root === local.merkleRoot;
  const sameCount = !onChain || local.leafCount == null || onChain.leaf_count === local.leafCount;
  return sameRoot && sameCount ? 'committed' : 'mismatch';
}

/** The badge the HUD shows for a season state (season-level pill). Null means: show nothing. */
export function seasonBadge(status) {
  if (!status || status.state !== 'committed') return null;
  return { kind: 'season', state: 'committed', labelKey: 'wh.sign.near.committed', tipKey: 'wh.sign.near.tip', href: status.commitTxUrl || status.contractUrl };
}

/** The badge for one revealed sign (leaf index). Null means: show nothing (not committed, offline, unknown). */
export function leafBadge(status, leaf) {
  if (!status || status.state !== 'committed' || !leaf) return null;
  if (leaf.state === 'on-chain') return { kind: 'leaf', state: 'on-chain', labelKey: 'wh.sign.near.leaf', tipKey: 'wh.sign.near.tip', href: leaf.txUrl || status.contractUrl };
  if (leaf.state === 'dry-run') return { kind: 'leaf', state: 'dry-run', labelKey: 'wh.sign.near.dryrun', tipKey: 'wh.sign.near.tip', href: status.contractUrl };
  if (leaf.state === 'mismatch') return { kind: 'leaf', state: 'mismatch', labelKey: 'wh.sign.near.mismatch', tipKey: 'wh.sign.near.tip', href: status.contractUrl };
  return null;
}

/**
 * Watches one play session's season on testnet.
 *
 *   const near = createNearWatcher({ season: () => session.obs && session.obs.season, proof: (i) => session.transport.proof(i) });
 *   near.observe(session.obs);              // after every observation (idempotent, cheap)
 *   near.subscribe(() => rerender());       // fires when the status or a leaf state changes
 *   near.status                             // { state, seasonId, contractId, contractUrl, commitTxUrl, onChain }
 *   near.leaf(index) / near.leafBadge(index) / near.seasonBadge()
 *
 * States: `disabled` (no contractId), `idle` (no season yet), `other-season` (this seed was never committed, the
 * contract is not even asked), `checking`, `committed`, `not-committed`, `mismatch`, `offline`.
 * Leaf states: `unknown`, `checking`, `on-chain`, `dry-run`, `missing`, `mismatch`, `offline`.
 * @param {object} o
 * @param {() => (object|null)} o.season  the observation's `season` ({seasonId, merkleRoot, rules})
 * @param {(index:number) => Promise<{status:number, body:object}>} o.proof  the transport's proof call
 * @param {object} [o.deployment]  defaults to NEAR_DEPLOYMENT
 * @param {typeof fetch} [o.fetch]
 * @param {boolean} [o.knownSeasonsOnly=true]  only ask the contract about seasons listed in the deployment
 * @param {number} [o.retryMs=30000]  how long an `offline` answer is kept before the next observation retries
 * @param {boolean} [o.autoRetry]  also retry on a timer after `retryMs` (default: in a browser), so a badge appears
 *   without another player action once the network recovers
 * @param {() => number} [o.now]
 */
export function createNearWatcher({ season, proof, deployment = NEAR_DEPLOYMENT, fetch = globalThis.fetch, knownSeasonsOnly = true, retryMs = 30000, now = () => Date.now(), timeoutMs, autoRetry = typeof window !== 'undefined' } = {}) {
  const listeners = new Set();
  const leaves = new Map();
  let client = null;
  let pending = null;
  let lastFail = 0;
  let lastObs = null;
  const base = { state: deployment && deployment.contractId ? 'idle' : 'disabled', network: deployment ? deployment.network : null, contractId: deployment ? deployment.contractId : null };
  const status = { ...base, seasonId: null, contractUrl: null, commitTxUrl: null, onChain: null, error: null };
  const emit = () => { for (const fn of [...listeners]) { try { fn(status); } catch (e) { console.warn('[near] listener failed', e); } } };
  const set = (patch) => { Object.assign(status, patch); emit(); };
  const seasonRecord = (id) => (deployment && deployment.seasons && deployment.seasons[id]) || null;

  function getClient() {
    if (!client) client = createNearClient({ contractId: deployment.contractId, rpcUrls: deployment.rpcUrls, fetch, timeoutMs });
    return client;
  }

  async function checkSeason(s) {
    const rec = seasonRecord(s.seasonId);
    const links = explorerLinks(deployment, { txHash: rec ? rec.commitTx : null });
    set({ state: 'checking', seasonId: s.seasonId, contractUrl: links.contract, commitTxUrl: links.tx, onChain: null, error: null });
    try {
      const onChain = await getClient().getSeason(s.seasonId);
      if (status.seasonId !== s.seasonId) return; // a newer season took over meanwhile
      if (!onChain) return set({ state: 'not-committed', onChain: null });
      set({ state: compareSeason({ merkleRoot: s.merkleRoot, leafCount: s.leafCount ?? null }, onChain), onChain });
    } catch (e) {
      if (status.seasonId !== s.seasonId) return;
      lastFail = now();
      set({ state: 'offline', error: e.code || 'NETWORK' });
      scheduleRetry();
    }
  }

  async function checkLeaf(index) {
    const s = season();
    if (!s || status.state !== 'committed' || status.seasonId !== s.seasonId) return;
    const rec = seasonRecord(s.seasonId);
    const txHash = rec && rec.revealTx ? rec.revealTx[index] || null : null;
    const entry = { state: 'checking', index, txUrl: explorerLinks(deployment, { txHash }).tx, onChain: null, dryRun: null };
    leaves.set(index, entry); emit();
    try {
      const p = await proof(index);
      if (!p || p.status !== 200) { entry.state = 'unknown'; return emit(); }
      const local = p.body.proof;
      const recorded = await getClient().getRevealedLeaf(s.seasonId, index);
      entry.onChain = recorded;
      if (recorded) { entry.state = recorded.leaf === local.leaf ? 'on-chain' : 'mismatch'; return emit(); }
      const dry = await getClient().checkLeaf(local);
      entry.dryRun = dry;
      entry.state = dry && dry.valid ? 'dry-run' : 'missing';
      emit();
    } catch (e) {
      entry.state = 'offline'; entry.error = e.code || 'NETWORK'; lastFail = now(); emit();
      scheduleRetry();
    }
  }

  /** One pending retry at a time: re-observes the latest observation after `retryMs` (never keeps node alive). */
  let retryTimer = null;
  function scheduleRetry() {
    if (retryTimer || !autoRetry) return;
    retryTimer = setTimeout(() => { retryTimer = null; if (lastObs) watcher.observe(lastObs); }, retryMs);
    if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();
  }

  const watcher = {
    status,
    leaves,
    /** Call after each observation. Starts (at most one) season check and one check per revealed leaf. */
    observe(obs) {
      if (status.state === 'disabled') return;
      if (obs) lastObs = obs; // observations that arrive while the season check is in flight are not lost
      const s = (obs && obs.season) || season();
      if (!s || !s.seasonId || !s.merkleRoot) return;
      if (s.seasonId !== status.seasonId) {
        leaves.clear();
        if (knownSeasonsOnly && !seasonRecord(s.seasonId)) { set({ state: 'other-season', seasonId: s.seasonId, contractUrl: explorerLinks(deployment).contract, commitTxUrl: null, onChain: null, error: null }); return; }
        pending = checkSeason(s).then(() => watcher.observe(lastObs));
        return;
      }
      if (status.state === 'offline' && now() - lastFail >= retryMs) { pending = checkSeason(s).then(() => watcher.observe(lastObs)); return; }
      if (status.state !== 'committed') return;
      const revealed = (obs && obs.proofs) || [];
      // A leaf is asked once; one that failed on the network is asked again after `retryMs`.
      const due = (i) => { const l = leaves.get(i); return !l || (l.state === 'offline' && now() - lastFail >= retryMs); };
      for (const p of revealed) if (due(p.index)) pending = checkLeaf(p.index);
      for (const c of (obs && obs.chronicle) || []) if (due(c.index)) pending = checkLeaf(c.index);
    },
    /** Resolves when the checks started so far have finished (tests, QA). */
    async settle() { let p = null; while (pending && pending !== p) { p = pending; await p; } return status; },
    leaf: (index) => leaves.get(index) || null,
    seasonBadge: () => seasonBadge(status),
    leafBadge: (index) => leafBadge(status, leaves.get(index) || null),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Stops the retry timer and drops listeners (the HUD calls it on unmount). */
    destroy() { if (retryTimer) clearTimeout(retryTimer); retryTimer = null; listeners.clear(); },
    client: () => (status.state === 'disabled' ? null : getClient()),
  };
  return watcher;
}

/**
 * A public beacon nobody in the game chose: the hash of the latest final NEAR testnet block, as
 * `near-testnet:<height>:<blockHash>`. Read-only JSON-RPC `block`; null when no host answers within `timeoutMs`.
 * Used by protocol ftf-seed/1 (docs/verify.md): fetched after the room's entropy commitment, mixed into the seed.
 */
export async function fetchNearBeacon({ rpcUrls = NEAR_TESTNET_RPC, fetch = globalThis.fetch, timeoutMs = 2500, network = 'testnet' } = {}) {
  for (const url of rpcUrls) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'ftf-beacon', method: 'block', params: { finality: 'final' } }), signal: ac ? ac.signal : undefined });
      if (!res.ok) continue;
      const json = await res.json();
      const h = json && json.result && json.result.header;
      if (h && typeof h.hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(h.hash) && Number.isInteger(h.height)) return `near-${network}:${h.height}:${h.hash}`;
    } catch { /* next host */ } finally { if (timer) clearTimeout(timer); }
  }
  return null;
}
