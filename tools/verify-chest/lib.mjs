// The checks of tools/verify-chest/verify.mjs as a pure function (tests feed it recorded data).
import { createHash } from 'node:crypto';
import { commitment, buildDeck, leafHash, merkleProof, rootFromProof, seasonSeed, drawRandom, replayDraws, nftTierOf, DECK_SIZE, NFT_SLOTS } from '../../relayer/lib/chest-deck.js';
import { recoverPersonal } from '../../relayer/lib/tee-crypto.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');

/**
 * @param {{info: object, openings: object[], index?: number, nftToken?: object|null}} d  season_info, list_openings 0..n-1
 * @returns {{pass: boolean, lines: [ok: boolean|null, text: string][]}}
 */
export function verifyChest({ info, openings, index = null, nftToken = undefined }) {
  const lines = [], add = (ok, text) => { lines.push([ok, text]); return ok; };
  const season = info.season;
  const c = commitment(season);
  add(info.root === c.root, `committed root equals the canonical deck's Merkle root (${String(info.root).slice(0, 16)}…)`);
  add(info.deck_sha256 === c.deck_sha256, 'committed deck sha256 equals the canonical deck lines');
  const deck = buildDeck();
  add(deck.length === DECK_SIZE && deck.filter((x) => x.kind === 'nft').length === NFT_SLOTS, `deck: ${DECK_SIZE} chests, exactly ${NFT_SLOTS} NFT slots (positions 0..${NFT_SLOTS - 1})`);
  const s = info.seed;
  if (!s) { add(false, 'season seed is fixed'); return { pass: false, lines }; }
  add(s.request_body.includes(info.root), 'the TEE seed request names the committed root');
  const parts = s.signed_text.split(':');
  add((parts.length === 3 ? parts[1] : parts[0]) === sha(s.request_body), 'sha256(seed request) is the request hash the TEE signed');
  add(recoverPersonal(s.signed_text, s.signature) === s.signing_address, `the TEE signature recovers to ${s.signing_address}`);
  add(info.committed_block != null && Number(s.block) > Number(info.committed_block), `seed fixed at block ${s.block}, after the commit at block ${info.committed_block}`);
  const seed = seasonSeed(s.signature, Buffer.from(s.block_random, 'hex'));
  add(seed.toString('hex') === s.seed, 'season seed = sha256("ftf-chest-seed-1" || sha256(signature) || block random seed)');
  let randOk = true;
  openings.forEach((o, k) => { if (o.index !== k || drawRandom(seed, k, Buffer.from(o.block_random, 'hex')).toString('hex') !== o.random) randOk = false; });
  add(randOk, `${openings.length} openings: each draw random = sha256(seed || index || its block random seed)`);
  let replayOk = false, positions = [];
  try { positions = replayDraws(openings); replayOk = positions.every((p, k) => p === openings[k].position); } catch { replayOk = false; }
  add(replayOk, 'replaying the draws (sparse Fisher-Yates) gives every recorded position');
  const nfts = positions.filter((p) => p < NFT_SLOTS).length;
  add(nfts === info.nft_minted && openings.length === info.opened, `counters: ${info.opened} opened, ${info.nft_minted} NFT minted (replay: ${nfts})`);
  add(openings.every((o) => o.nft === (o.position < NFT_SLOTS) && (o.tier || null) === nftTierOf(o.position)), 'every opening is an NFT exactly when its position is an NFT slot, with the slot\'s tier');
  if (index != null) {
    const o = openings[index];
    if (!add(!!o, `opening #${index} is recorded`)) return { pass: false, lines };
    const d = deck[o.position];
    const root = rootFromProof(leafHash(season, d), merkleProof(c.levels, o.position));
    add(root === info.root, `opening #${index}: position ${o.position} = ${d.kind} ${d.tier}${d.item ? ' ' + d.item : ''}${d.kind === 'silk' || d.kind === 'xp' ? ' x' + d.amount : ''}; its Merkle proof leads to the root`);
    if (o.nft) add(nftToken === undefined ? null : !!nftToken && nftToken.owner_id === o.account_id, `NFT ${o.token_id} is owned by ${o.account_id}`);
  }
  const pass = lines.every(([ok]) => ok !== false);
  return { pass, lines };
}
