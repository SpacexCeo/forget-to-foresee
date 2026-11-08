// Memory shards as NEP-171 NFTs (contracts/memory-shard): the JavaScript twin of the contract's metadata and image.
// A forgotten memory becomes a shard (the Price of Memory); on-chain the shard carries the season id, the memory's
// kind and weight, the trial it was forgotten, the auction result and the Merkle leaf of the season event the vision
// unlocked, so the shard is provably tied to the committed season. The image is an ink ring drawn from the same data,
// byte for byte here and in Rust (contracts/memory-shard/src/image.rs); tests/vectors.json pins both.
// Integer arithmetic only: no floats cross the language boundary.
import { sha256 } from '../game/crypto.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { createNearClient, explorerLinks } from './near.js';

export const SHARD_KINDS = ['first', 'call', 'gift', 'betrayal', 'debt', 'promise', 'insight', 'lie'];
export const CLANS = ['iris', 'salt', 'ash', 'moss', 'amber', 'frost'];
export const SHARD_SPEC = 'ftf-shard/1';

/** Ink colours per memory kind (the ring, the strokes). */
export const KIND_COLOR = Object.freeze({
  first: '#d8b24a', call: '#7fb3d5', gift: '#8fcf8f', betrayal: '#c0504d', debt: '#b08968', promise: '#9b86c9', insight: '#cfd8dc', lie: '#6b6b6b',
});
/** 16 directions, cos/sin × 1000, rounded: the only trigonometry the image uses. */
export const DIRS = Object.freeze([
  [1000, 0], [924, 383], [707, 707], [383, 924], [0, 1000], [-383, 924], [-707, 707], [-924, 383],
  [-1000, 0], [-924, -383], [-707, -707], [-383, -924], [0, -1000], [383, -924], [707, -707], [924, -383],
]);

const HEX = /^[0-9a-f]+$/;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Validates and normalises the shard data the contract stores (its `extra` JSON). Field order is canonical.
 * @param {object} d
 * @returns {{season_id:string, shard_id:number, owner_clan:string, kind:string, weight:number, forgotten_at_tick:number,
 *   closes_at_tick:number, winner_clan:(string|null), price:(number|null), unlocked_index:(number|null), unlocked_leaf:(string|null), schedule_root:string}}
 */
export function shardData(d) {
  const str = (v, name) => { if (typeof v !== 'string') throw new Error(`${name} must be a string`); return v; };
  const int = (v, name, lo, hi) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be an integer ${lo}-${hi}`); return v; };
  const season_id = str(d.season_id, 'season_id');
  if (season_id.length < 8 || season_id.length > 64 || !HEX.test(season_id)) throw new Error('season_id must be 8-64 lowercase hex characters');
  const kind = str(d.kind, 'kind');
  if (!SHARD_KINDS.includes(kind)) throw new Error('unknown kind ' + kind);
  const owner_clan = str(d.owner_clan, 'owner_clan');
  if (!CLANS.includes(owner_clan)) throw new Error('unknown owner_clan ' + owner_clan);
  const winner_clan = d.winner_clan == null ? null : str(d.winner_clan, 'winner_clan');
  if (winner_clan != null && !CLANS.includes(winner_clan)) throw new Error('unknown winner_clan ' + winner_clan);
  const schedule_root = str(d.schedule_root, 'schedule_root');
  if (schedule_root.length !== 64 || !HEX.test(schedule_root)) throw new Error('schedule_root must be 64 lowercase hex characters');
  const unlocked_leaf = d.unlocked_leaf == null ? null : str(d.unlocked_leaf, 'unlocked_leaf');
  if (unlocked_leaf != null && (unlocked_leaf.length !== 64 || !HEX.test(unlocked_leaf))) throw new Error('unlocked_leaf must be 64 lowercase hex characters');
  const unlocked_index = d.unlocked_index == null ? null : int(d.unlocked_index, 'unlocked_index', 0, 1023);
  if ((unlocked_leaf == null) !== (unlocked_index == null)) throw new Error('unlocked_index and unlocked_leaf go together');
  return {
    season_id, shard_id: int(d.shard_id, 'shard_id', 1, 4294967295), owner_clan, kind,
    weight: int(d.weight, 'weight', 0, 4),
    forgotten_at_tick: int(d.forgotten_at_tick, 'forgotten_at_tick', 1, 17),
    closes_at_tick: int(d.closes_at_tick, 'closes_at_tick', 1, 19),
    winner_clan, price: d.price == null ? null : int(d.price, 'price', 0, 4294967295),
    unlocked_index, unlocked_leaf, schedule_root,
  };
}

export const shardTokenId = (d) => `${d.season_id}-${d.shard_id}`;

/** The canonical `extra` JSON: the normalised data in canonical field order, no spaces. */
export const shardExtra = (d) => JSON.stringify(shardData(d));

/** The ink-ring image, 320×320, deterministic from the data. */
export function shardSvg(input) {
  const d = shardData(input);
  const color = KIND_COLOR[d.kind];
  const src = d.unlocked_leaf ?? d.schedule_root; // 64 hex digits drive the strokes
  const nib = (i) => parseInt(src[i % 64], 16);
  const cx = 160, cy = 160, r = 92;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320">`);
  parts.push(`<rect width="320" height="320" fill="#141a1f"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="6" opacity="0.9"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="none" stroke="${color}" stroke-width="1" opacity="0.35"/>`);
  // Eight strokes: direction from nibble i, length from nibble i+8, drawn from the ring outward.
  for (let i = 0; i < 8; i++) {
    const [dx, dy] = DIRS[nib(i)];
    const len = 18 + 3 * nib(i + 8);
    const x1 = cx + Math.trunc((r + 10) * dx / 1000), y1 = cy + Math.trunc((r + 10) * dy / 1000);
    const x2 = cx + Math.trunc((r + 10 + len) * dx / 1000), y2 = cy + Math.trunc((r + 10 + len) * dy / 1000);
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${2 + (i % 3)}" stroke-linecap="round"/>`);
  }
  // Weight dots inside the ring (0-4), evenly spaced from the top.
  for (let k = 0; k < d.weight; k++) {
    const [dx, dy] = DIRS[(12 + 4 * k) % 16];
    parts.push(`<circle cx="${cx + Math.trunc(56 * dx / 1000)}" cy="${cy + Math.trunc(56 * dy / 1000)}" r="7" fill="${color}"/>`);
  }
  // The core: a dot whose size says whether the shard was bought (large) or burned (small, hollow).
  if (d.winner_clan) parts.push(`<circle cx="${cx}" cy="${cy}" r="12" fill="${color}"/>`);
  else parts.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="${color}" stroke-width="2"/>`);
  parts.push(`<text x="160" y="28" text-anchor="middle" font-family="monospace" font-size="13" fill="#cfd8dc">SEASON ${d.season_id}</text>`);
  parts.push(`<text x="160" y="300" text-anchor="middle" font-family="monospace" font-size="13" fill="#cfd8dc">${d.kind.toUpperCase()} · TRIAL ${d.forgotten_at_tick} · #${d.shard_id}</text>`);
  parts.push('</svg>');
  return parts.join('');
}

const b64 = (s) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))));
const hexToB64 = (hex) => (typeof Buffer !== 'undefined' ? Buffer.from(hex, 'hex').toString('base64') : btoa(String.fromCharCode(...hex.match(/../g).map((h) => parseInt(h, 16)))));

/** NEP-177 token metadata as the contract builds it (without `issued_at`, which is block time). */
export function shardMetadata(input) {
  const d = shardData(input);
  const svg = shardSvg(d);
  const sale = d.winner_clan ? `bought by ${cap(d.winner_clan)} for ${d.price ?? 0} silk at the trial-${d.closes_at_tick} auction` : `unsold at the trial-${d.closes_at_tick} auction and burned`;
  const unlock = d.unlocked_leaf ? ` The vision it paid for opened sign #${d.unlocked_index + 1} of the season (leaf ${d.unlocked_leaf}).` : '';
  const what = d.weight > 0 ? `a ${d.kind} memory of weight ${d.weight}` : `${d.kind === 'lie' ? 'a lie' : 'an insight'}`;
  return {
    title: `Memory shard #${d.shard_id} · ${cap(d.kind)} · season ${d.season_id}`,
    description: `${cap(d.owner_clan)} forgot ${what} at trial ${d.forgotten_at_tick} of season ${d.season_id}; the shard was ${sale}.${unlock} The season's schedule root is ${d.schedule_root} (contracts/season-commit). Forget to Foresee, NEAR testnet.`,
    media: `data:image/svg+xml;base64,${b64(svg)}`,
    media_hash: hexToB64(sha256(svg)),
    copies: 1,
    extra: shardExtra(d),
  };
}

/** Shard data from the game's observation (season + one auction entry with the shard fields of the projection). */
export function shardDataFromAuction(season, a) {
  const kind = a.memory ? a.memory.kind : a.kind;
  return shardData({
    season_id: season.seasonId, shard_id: a.id, owner_clan: a.from, kind,
    weight: a.memory ? a.memory.weight : 0,
    forgotten_at_tick: a.forgottenAtTick ?? Math.max(1, a.closesAtTick - 2), closes_at_tick: a.closesAtTick,
    winner_clan: a.winner ?? null, price: a.winner ? (a.result && a.result.price != null ? a.result.price : a.topBid ? a.topBid.amount : null) : null,
    unlocked_index: a.unlocked ? a.unlocked.index : null, unlocked_leaf: a.unlocked ? a.unlocked.leaf : null,
    schedule_root: season.merkleRoot,
  });
}

/* ---------- read-only client and the "minted" badge ---------- */

export function createShardNftClient({ contractId, rpcUrls, fetch, timeoutMs } = {}) {
  const near = createNearClient({ contractId, rpcUrls, fetch, timeoutMs });
  return {
    contractId,
    nftToken: async (tokenId) => (await near.view('nft_token', { token_id: tokenId })).value,
    getShard: async (tokenId) => (await near.view('get_shard', { token_id: tokenId })).value,
    shardsOfSeason: async (seasonId, fromIndex = 0, limit = 50) => (await near.view('shards_of_season', { season_id: seasonId, from_index: fromIndex, limit })).value,
    seasonShardCount: async (seasonId) => (await near.view('season_shard_count', { season_id: seasonId })).value,
    nftMetadata: async () => (await near.view('nft_metadata', {})).value,
  };
}

/**
 * Watches the shards of one season on testnet: `observe(obs)` after each observation asks the contract once per
 * season (`shards_of_season`) and remembers which token ids exist; `badge(auctionId)` gives the HUD pill.
 * Silent when there is no shard deployment, offline, or for seasons not listed in the deployment.
 */
export function createShardWatcher({ deployment = NEAR_DEPLOYMENT, fetch = globalThis.fetch, knownSeasonsOnly = true, retryMs = 30000, now = () => Date.now(), timeoutMs } = {}) {
  const contractId = deployment ? deployment.shardContractId : null;
  const listeners = new Set();
  const status = { state: contractId ? 'idle' : 'disabled', contractId, seasonId: null, minted: new Map(), error: null };
  let client = null, pending = null, lastFail = 0;
  const emit = () => { for (const fn of [...listeners]) { try { fn(status); } catch (e) { console.warn('[shard-nft] listener failed', e); } } };
  const links = (txHash) => explorerLinks({ ...deployment, contractId }, { txHash });
  async function load(seasonId) {
    status.seasonId = seasonId; status.state = 'checking'; status.minted = new Map(); status.error = null; emit();
    try {
      client ||= createShardNftClient({ contractId, rpcUrls: deployment.rpcUrls, fetch, timeoutMs });
      const list = (await client.shardsOfSeason(seasonId, 0, 100)) || [];
      if (status.seasonId !== seasonId) return;
      for (const s of list) status.minted.set(s.token_id, s);
      status.state = 'loaded'; emit();
    } catch (e) {
      if (status.seasonId !== seasonId) return;
      status.state = 'offline'; status.error = e.code || 'NETWORK'; lastFail = now(); emit();
    }
  }
  const w = {
    status,
    observe(obs) {
      if (status.state === 'disabled') return;
      const s = obs && obs.season;
      if (!s || !s.seasonId) return;
      const mints = (deployment.shardMints && deployment.shardMints[s.seasonId]) || null;
      if (knownSeasonsOnly && !mints) { if (status.seasonId !== s.seasonId) { status.seasonId = s.seasonId; status.state = 'other-season'; status.minted = new Map(); emit(); } return; }
      if (s.seasonId !== status.seasonId) pending = load(s.seasonId);
      else if (status.state === 'offline' && now() - lastFail >= retryMs) pending = load(s.seasonId);
    },
    async settle() { let p = null; while (pending && pending !== p) { p = pending; await p; } return status; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** The on-chain record of a shard (by auction id) or null. */
    token(auctionId) { return status.seasonId ? status.minted.get(`${status.seasonId}-${auctionId}`) || null : null; },
    /** Badge model for the HUD: null, or {kind:'shard', labelKey, tipKey, href, tokenId}. */
    badge(auctionId) {
      if (status.state !== 'loaded') return null;
      const tokenId = `${status.seasonId}-${auctionId}`;
      const t = status.minted.get(tokenId);
      if (!t) return null;
      const tx = deployment.shardMints && deployment.shardMints[status.seasonId] ? deployment.shardMints[status.seasonId][String(auctionId)] || null : null;
      return { kind: 'shard', state: 'minted', labelKey: 'wh.shard.near.minted', tipKey: 'wh.shard.near.tip', href: links(tx).tx || `${links().contract}?tab=nfts`, tokenId, owner: t.owner_id || null };
    },
  };
  return w;
}
