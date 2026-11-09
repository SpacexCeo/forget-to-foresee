// Shard NFT card: the view model (pure, node-testable). Turns the shard watcher's status (src/net/shard-nft.js,
// createShardWatcher) and one shard of the local observation into what the HUD shows:
//   - null: nothing to show (no deployment, still checking, RPC failed, or no matching token on-chain);
//   - {state: 'judge-only'}: a live season, which mints nothing ("on-chain for the judge season only");
//   - {state: 'minted', ...}: a real token. Shown only when the token exists on-chain AND its stored shard data equals
//     this playthrough's shard field for field (a judge who plays differently gets a different shard #7, and the
//     game never claims someone else's token as theirs).
// Read-only: nothing here signs or sends anything.
import { shardData, shardDataFromAuction, shardExtra, shardSvg, shardMetadata } from '../../net/shard-nft.js';
import { NEAR_DEPLOYMENT } from '../../net/near-deployment.js';

const svgCache = new Map(); // tokenId + media → verified svg | null

/** The explorer page of one token on nearblocks. */
export const tokenUrl = (deployment, tokenId) =>
  `${(deployment.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '')}/nft-token/${deployment.shardContractId}/${tokenId}`;

/**
 * The local shard's data, or null when the shard has not been sold or burned yet (the token is minted after the
 * auction closes, so an open auction never matches).
 */
export function localShardData(season, shard) {
  if (!season || !season.seasonId || !season.merkleRoot || !shard || shard.open) return null;
  try { return shardData(shardDataFromAuction(season, shard)); } catch { return null; }
}

/**
 * @param {object} o
 * @param {object} o.status  the watcher's status ({state, seasonId, minted: Map<tokenId, {token_id, owner_id, data, metadata}>})
 * @param {object} o.season  obs.season ({seasonId, merkleRoot})
 * @param {object} o.shard   one entry of obs.shards
 * @param {object} [o.deployment]
 */
export function shardCardModel({ status, season, shard, deployment = NEAR_DEPLOYMENT }) {
  if (!status || !deployment || !deployment.shardContractId || !season || !shard) return null;
  if (status.state === 'other-season') return status.seasonId === season.seasonId ? { state: 'judge-only' } : null;
  if (status.state !== 'loaded' || status.seasonId !== season.seasonId) return null; // checking, offline, disabled: silent
  const tokenId = `${season.seasonId}-${shard.id}`;
  const rec = status.minted.get(tokenId);
  if (!rec || !rec.data) return null;
  let chain;
  try { chain = shardData(rec.data); } catch { return null; }
  const local = localShardData(season, shard);
  if (!local || shardExtra(local) !== shardExtra(chain)) return null;
  const explorer = (deployment.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '');
  const rec2 = deployment.seasons && deployment.seasons[season.seasonId];
  const mintTx = deployment.shardMints && deployment.shardMints[season.seasonId] ? deployment.shardMints[season.seasonId][String(shard.id)] || null : null;
  const revealTx = chain.unlocked_index != null && rec2 && rec2.revealTx ? rec2.revealTx[String(chain.unlocked_index)] || null : null;
  return {
    state: 'minted',
    tokenId,
    contractId: deployment.shardContractId,
    seasonContractId: deployment.contractId || null,
    standard: 'NEP-171',
    owner: rec.owner_id || null,
    ownerHref: rec.owner_id ? `${explorer}/address/${rec.owner_id}` : null,
    shardId: chain.shard_id,
    ownerClan: chain.owner_clan,
    kind: chain.kind,
    weight: chain.weight,
    forgottenAt: chain.forgotten_at_tick,
    closesAt: chain.closes_at_tick,
    winner: chain.winner_clan,
    price: chain.price,
    leaf: chain.unlocked_index != null ? { index: chain.unlocked_index, href: revealTx ? `${explorer}/txns/${revealTx}` : null } : null,
    tokenHref: tokenUrl(deployment, tokenId),
    mintTxHref: mintTx ? `${explorer}/txns/${mintTx}` : null,
    ...verifiedSvg(tokenId, chain, rec.metadata),
  };
}

/**
 * The image: the contract's own media, read from the chain. When it is byte-identical to the game's `shardSvg()` of the
 * same data (always, for an honest contract) the card draws that SVG inline so it can animate; otherwise it shows
 * the chain's media as an image and marks it unverified.
 */
function verifiedSvg(tokenId, data, metadata) {
  const media = metadata && typeof metadata.media === 'string' ? metadata.media : null;
  if (!media) return { svg: null, media: null, svgVerified: false };
  const key = tokenId + '|' + media.length + '|' + media.slice(-32);
  if (!svgCache.has(key)) svgCache.set(key, media === shardMetadata(data).media ? shardSvg(data) : null);
  const svg = svgCache.get(key);
  return { svg, media: svg ? null : (media.startsWith('data:image/svg+xml;base64,') ? media : null), svgVerified: !!svg };
}

/**
 * The shard cards for the Memories panel: Iris's shards first, then the other clans' minted shards of the season.
 * Returns {cards: [{shard, card}], judgeOnly: boolean}.
 */
export function shardCards({ status, obs, deployment = NEAR_DEPLOYMENT }) {
  const season = obs && obs.season;
  const shards = (obs && obs.shards) || [];
  const cards = [];
  let judgeOnly = false;
  for (const shard of shards) {
    const card = shardCardModel({ status, season, shard, deployment });
    if (!card) continue;
    if (card.state === 'judge-only') { if (shard.from === 'iris') judgeOnly = true; continue; }
    cards.push({ shard, card });
  }
  cards.sort((a, b) => (a.shard.from === 'iris' ? 0 : 1) - (b.shard.from === 'iris' ? 0 : 1) || a.shard.id - b.shard.id);
  return { cards, judgeOnly: judgeOnly && !cards.length };
}

/**
 * The "Minted on NEAR testnet" moment. Feed it every observation; it remembers which shards it saw open and returns
 * the ids that closed with a buyer since the last call. `take(status, obs)` then turns pending ids into cards once the
 * watcher has loaded (dropping them if the token is absent, the RPC failed or the season is live).
 */
export function createMintMoments() {
  const seenOpen = new Set();
  const announced = new Set();
  let pending = [];
  return {
    observe(obs) {
      for (const s of (obs && obs.shards) || []) {
        if (s.open) seenOpen.add(s.id);
        else if (s.winner && seenOpen.has(s.id) && !announced.has(s.id)) { announced.add(s.id); pending.push(s.id); }
      }
    },
    take(status, obs, deployment = NEAR_DEPLOYMENT) {
      if (!pending.length) return [];
      if (!status || status.state === 'idle' || status.state === 'checking') return []; // wait for the one view call
      const out = [];
      for (const id of pending) {
        const shard = ((obs && obs.shards) || []).find((s) => s.id === id);
        const card = shard ? shardCardModel({ status, season: obs.season, shard, deployment }) : null;
        if (card && card.state === 'minted') out.push({ shard, card });
      }
      pending = [];
      return out;
    },
    get pending() { return pending.slice(); },
  };
}
