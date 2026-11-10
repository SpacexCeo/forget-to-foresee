// Live prices for the Exchange hall (read-only, no keys, no wallet, nothing signed):
//   NEAR/USD            CoinGecko simple price (public, CORS open); when it refuses (its keyless rate limit),
//                       the wNEAR/USDC pool on DexScreener, and the board names the source it actually used
//   NEAR memecoins      DexScreener token pairs on the `near` chain (public, CORS open); the deepest pool per token
//   NFTs on NEAR        the game's own memory shards on NEAR testnet (`nft_tokens` view of the shard contract):
//                       what each shard sold for at its in-game auction, in silk. No public keyless feed of
//                       mainnet NFT floor prices answered when this was built (10.11.2026), so none is shown.
// A board is `live` only with numbers that came from the network in this session; otherwise it says loading,
// stale (older than STALE_MS) or offline. Nothing here is ever invented or cached across reloads.
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';
import { createNearClient } from '../net/near.js';

export const NEAR_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd&include_24hr_change=true';
export const MEME_TOKENS = Object.freeze([
  'blackdragon.tkn.near', 'token.0xshitzu.near', 'token.lonkingnearbackto2024.near', 'ftv2.nekotoken.near',
  'gear.enleap.near', 'nearnvidia.near', 'dd.tg',
]);
export const MEME_URL = 'https://api.dexscreener.com/tokens/v1/near/' + MEME_TOKENS.join(',');
export const NEAR_FALLBACK_URL = 'https://api.dexscreener.com/tokens/v1/near/wrap.near';
export const REFRESH_MS = 60 * 1000;
export const STALE_MS = 5 * 60 * 1000;

const finite = (v) => { const n = typeof v === 'string' ? Number(v) : v; return Number.isFinite(n) ? n : null; };

/** CoinGecko → {usd, change24h} or null when the payload is not what we expect. */
export function parseNearPrice(json) {
  const usd = finite(json && json.near && json.near.usd);
  if (usd == null || usd <= 0) return null;
  return { usd, change24h: finite(json.near.usd_24h_change) };
}

/** DexScreener pairs of wrap.near → {usd, change24h} from the deepest pool, or null. */
export function parseNearFromDex(json) {
  if (!Array.isArray(json)) return null;
  let best = null;
  for (const p of json) {
    const usd = finite(p && p.priceUsd), liq = finite(p && p.liquidity && p.liquidity.usd) || 0;
    if (!p || p.chainId !== 'near' || !p.baseToken || p.baseToken.address !== 'wrap.near' || usd == null || usd <= 0) continue;
    if (!best || liq > best.liq) best = { usd, change24h: finite(p.priceChange && p.priceChange.h24), liq };
  }
  return best ? { usd: best.usd, change24h: best.change24h } : null;
}

/** DexScreener pairs → one row per known token (its deepest pool), in MEME_TOKENS order. */
export function parseMemes(json, tokens = MEME_TOKENS) {
  if (!Array.isArray(json)) return null;
  const best = new Map();
  for (const p of json) {
    const id = p && p.baseToken && p.baseToken.address;
    const usd = finite(p && p.priceUsd);
    if (!tokens.includes(id) || usd == null || usd <= 0 || p.chainId !== 'near') continue;
    const liq = finite(p.liquidity && p.liquidity.usd) || 0;
    const prev = best.get(id);
    if (!prev || liq > prev.liquidityUsd) {
      best.set(id, { id, symbol: String(p.baseToken.symbol || id).slice(0, 14), usd, change24h: finite(p.priceChange && p.priceChange.h24), liquidityUsd: liq, volume24h: finite(p.volume && p.volume.h24) || 0, url: typeof p.url === 'string' && p.url.startsWith('https://dexscreener.com/') ? p.url : null });
    }
  }
  const rows = tokens.map((t) => best.get(t)).filter(Boolean);
  return rows.length ? rows : null;
}

/** `nft_tokens` of the shard contract → [{tokenId, title, owner, kind, priceSilk, winner}], sold shards first by price. */
export function parseShards(tokens) {
  if (!Array.isArray(tokens)) return null;
  const rows = [];
  for (const t of tokens) {
    if (!t || typeof t.token_id !== 'string') continue;
    let extra = null;
    try { extra = JSON.parse((t.metadata && t.metadata.extra) || 'null'); } catch { extra = null; }
    rows.push({
      tokenId: t.token_id, title: String((t.metadata && t.metadata.title) || t.token_id).slice(0, 60), owner: String(t.owner_id || ''),
      kind: extra && typeof extra.kind === 'string' ? extra.kind : null,
      priceSilk: extra && Number.isInteger(extra.price) ? extra.price : null,
      winner: extra && typeof extra.winner_clan === 'string' ? extra.winner_clan : null,
    });
  }
  rows.sort((a, b) => (b.priceSilk ?? -1) - (a.priceSilk ?? -1));
  return rows;
}

/** A price with enough digits for a memecoin: 3.61, 0.0127, 0.0₈6418 style is avoided, plain decimals instead. */
export function formatUsd(v) {
  if (!Number.isFinite(v)) return '—';
  if (v >= 100) return '$' + v.toFixed(0);
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  const digits = Math.min(14, Math.ceil(-Math.log10(v)) + 3);
  return '$' + v.toFixed(digits).replace(/0+$/, '');
}
export function formatChange(v) {
  if (!Number.isFinite(v)) return '';
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1) + '%';
}

async function getJson(fetchFn, url, timeoutMs) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    // no credentials, no custom headers: a plain public GET that says nothing about the player
    const res = await fetchFn(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ac ? ac.signal : undefined });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { if (timer) clearTimeout(timer); }
}

/**
 * The three boards. `refresh()` asks every source (each on its own: one failing never blanks the others);
 * `start()` refreshes now and every REFRESH_MS while someone listens; `view()` gives {near, memes, nfts}, each
 * {status: 'idle'|'loading'|'live'|'stale'|'offline', data, at}.
 */
export function createPriceFeed({ fetch: fetchFn = globalThis.fetch, now = () => Date.now(), deployment = NEAR_DEPLOYMENT, timeoutMs = 12000, setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval } = {}) {
  const boards = { near: { data: null, at: 0, failed: false, busy: false }, memes: { data: null, at: 0, failed: false, busy: false }, nfts: { data: null, at: 0, failed: false, busy: false } };
  const listeners = new Set();
  let timer = null;
  const emit = () => { for (const fn of [...listeners]) fn(api.view()); };
  const statusOf = (b) => {
    if (b.data && now() - b.at <= STALE_MS) return 'live';
    if (b.data) return 'stale';
    if (b.busy) return 'loading';
    return b.failed ? 'offline' : 'idle';
  };

  async function load(name, job) {
    const b = boards[name];
    if (b.busy) return;
    b.busy = true; emit();
    try {
      const data = await job();
      if (data == null) throw new Error('unexpected payload');
      b.data = data; b.at = now(); b.failed = false;
    } catch { b.failed = true; }
    b.busy = false; emit();
  }

  const shardContract = deployment && deployment.shardContractId;
  const api = {
    sources: { near: 'CoinGecko', memes: 'DexScreener', nfts: shardContract || null },
    view() {
      const out = {};
      for (const [k, b] of Object.entries(boards)) out[k] = { status: statusOf(b), data: b.data, at: b.at };
      return out;
    },
    get nearLive() { return statusOf(boards.near) === 'live'; },
    refresh() {
      if (typeof fetchFn !== 'function') { for (const b of Object.values(boards)) b.failed = true; emit(); return Promise.resolve(); }
      const jobs = [
        load('near', async () => {
          try {
            const d = parseNearPrice(await getJson(fetchFn, NEAR_PRICE_URL, timeoutMs));
            if (d) { api.sources.near = 'CoinGecko'; return d; }
          } catch { /* fall through to the second source */ }
          const d = parseNearFromDex(await getJson(fetchFn, NEAR_FALLBACK_URL, timeoutMs));
          if (d) api.sources.near = 'DexScreener (wNEAR/USDC)';
          return d;
        }),
        load('memes', async () => parseMemes(await getJson(fetchFn, MEME_URL, timeoutMs))),
      ];
      if (shardContract) {
        jobs.push(load('nfts', async () => {
          const near = createNearClient({ contractId: shardContract, rpcUrls: deployment.rpcUrls, fetch: fetchFn, timeoutMs });
          return parseShards((await near.view('nft_tokens', { from_index: '0', limit: 24 })).value);
        }));
      } else boards.nfts.failed = true;
      return Promise.all(jobs).then(() => {});
    },
    start() {
      if (timer != null) return;
      api.refresh();
      timer = setIntervalFn(() => api.refresh(), REFRESH_MS);
    },
    stop() { if (timer != null) { clearIntervalFn(timer); timer = null; } },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
