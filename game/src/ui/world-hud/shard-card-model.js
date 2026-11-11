// Shard NFT card: the view model (pure, node-testable). Turns the shard watcher's status (src/net/shard-nft.js,
// createShardWatcher) and one shard of the local observation into what the HUD shows:
//   - null: nothing to show (the auction is still open, or the watcher is still checking the chain);
//   - {state: 'preview', ...}: an "Unminted shard preview" built from the local shard alone (docs/hackathon-tz.md
//     P1-C): any closed shard that is not a matching on-chain token (a live season, a judge playthrough that
//     diverged, an RPC failure, no deployment). It has no token id, no owner and no explorer link, and the HUD labels
//     it Unminted; it is never shown as on-chain;
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
  if (!season || !shard) return null;
  const local = localShardData(season, shard);
  if (!local) return null; // the auction is still open: nothing is minted or previewed yet
  const preview = () => previewCard(local);
  if (!deployment || !deployment.shardContractId || !status || status.state === 'disabled') return preview();
  if (status.state === 'idle' || status.state === 'checking') return null; // wait for the one view call
  if (status.state !== 'loaded' || status.seasonId !== season.seasonId) return preview(); // live season, offline
  const tokenId = `${season.seasonId}-${shard.id}`;
  const rec = status.minted.get(tokenId);
  if (!rec || !rec.data) return preview();
  let chain;
  try { chain = shardData(rec.data); } catch { return preview(); }
  if (shardExtra(local) !== shardExtra(chain)) return preview(); // someone else's token #id: never claimed
  return chainShardCard({ rec, chain, tokenId, seasonId: season.seasonId, deployment });
}

/** A real token's card from the chain record alone (the contract's data, owner and media). */
export function chainShardCard({ rec, chain, tokenId, seasonId, deployment = NEAR_DEPLOYMENT }) {
  const explorer = (deployment.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '');
  const rec2 = deployment.seasons && deployment.seasons[seasonId];
  const mintTx = deployment.shardMints && deployment.shardMints[seasonId] ? deployment.shardMints[seasonId][String(chain.shard_id)] || null : null;
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
 * The unminted preview of a closed shard: the same biography and the game's own ink ring, and nothing that could
 * pass for a token (no token id, contract, owner, standard, explorer or mint link, no "verified" mark).
 */
export function previewCard(local) {
  return {
    state: 'preview',
    key: `preview-${local.season_id}-${local.shard_id}`,
    tokenId: null, contractId: null, standard: null, owner: null, ownerHref: null,
    shardId: local.shard_id,
    ownerClan: local.owner_clan,
    kind: local.kind,
    weight: local.weight,
    forgottenAt: local.forgotten_at_tick,
    closesAt: local.closes_at_tick,
    winner: local.winner_clan,
    price: local.price,
    leaf: null, tokenHref: null, mintTxHref: null,
    svg: shardSvg(local), media: null, svgVerified: false,
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
 * Returns {cards: [{shard, card}], judgeOnly: false} (judgeOnly is kept for callers; previews replaced that line).
 */
export function shardCards({ status, obs, deployment = NEAR_DEPLOYMENT, judge = false }) {
  const season = obs && obs.season;
  const shards = (obs && obs.shards) || [];
  const cards = [];
  for (const shard of shards) {
    const card = shardCardModel({ status, season, shard, deployment });
    if (!card) continue;
    if (card.state === 'preview' && shard.from !== 'iris') continue; // previews are for Iris's own shards only
    cards.push({ shard, card });
  }
  // Iris's first, real tokens before previews, then by shard id
  const rank = (c) => (c.shard.from === 'iris' ? 0 : 2) + (c.card.state === 'minted' ? 0 : 1);
  cards.sort((a, b) => rank(a) - rank(b) || a.shard.id - b.shard.id);
  return { cards, judgeOnly: false, recorded: judge ? recordedJudgeShard({ status, season, deployment, shown: cards }) : null };
}

/** The shard of the recorded judge playthrough that is minted on testnet (Iris's forgotten Call). */
export const JUDGE_SHARD_ID = 7;

/**
 * On ?demo=judge only (audit QW-3): the recorded judge playthrough's on-chain shard, one click away even when this
 * session played differently. {state: 'minted', card} | {state: 'offline'} | {state: 'checking'} | null (not this
 * season, not minted, or this playthrough already shows the same token as its own card).
 */
export function recordedJudgeShard({ status, season, deployment = NEAR_DEPLOYMENT, shown = [] }) {
  if (!season || !deployment || !deployment.shardContractId) return null;
  const mints = deployment.shardMints && deployment.shardMints[season.seasonId];
  if (!mints || !mints[String(JUDGE_SHARD_ID)]) return null;
  const tokenId = `${season.seasonId}-${JUDGE_SHARD_ID}`;
  if (shown.some((c) => c.card && c.card.tokenId === tokenId)) return null;
  if (!status || status.state === 'disabled') return null;
  if (status.state === 'offline') return { state: 'offline' };
  if (status.state !== 'loaded' || status.seasonId !== season.seasonId) return { state: 'checking' };
  const rec = status.minted.get(tokenId);
  if (!rec || !rec.data) return null;
  let chain;
  try { chain = shardData(rec.data); } catch { return null; }
  return { state: 'minted', card: { ...chainShardCard({ rec, chain, tokenId, seasonId: season.seasonId, deployment }), recorded: true } };
}

/**
 * The shard moment. Feed it every observation; it remembers which shards it saw open and returns the ids that closed
 * with a buyer since the last call. `take(status, obs)` then turns pending ids into cards once the watcher has
 * answered: a real token ("Minted on NEAR testnet") for any clan's shard, or, for Iris's own shard only, the
 * "Unminted shard preview" (token absent or different, RPC failed, live season). Never a minted toast without a token.
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
        if (card && (card.state === 'minted' || shard.from === 'iris')) out.push({ shard, card });
      }
      pending = [];
      return out;
    },
    get pending() { return pending.slice(); },
  };
}
