// The Hatchkeeper's first pet (owner 13.11, "prove you are real"): a player who entered a tournament season that has
// since settled may claim ONE dragon, minted by the relayer (/api/companion/claim, reason "tournament") to the heroine
// NFT the player picks (NFT owns NFT). This module remembers which seasons this browser entered, checks on chain that
// one of them is entered and settled (ftf-town has_entered + season), lists the player's heroines, reads the pet a
// heroine owns (token ids "pet-…" on the companions contract) and sends the claim. Loaded lazily; never invents.
import { createNearClient } from './near.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { readCompanions } from './companions.js';

export const SEASONS_KEY = 'ftf.tourney.seasons.v1';
const day1 = (storage) => { try { return JSON.parse((storage && storage.getItem('ftf.day1.v1')) || '{}'); } catch { return {}; } };

/** Remembers a season this browser entered (the altar's entry panel calls it on success). */
export function recordSeason(storage, seasonId) {
  if (!seasonId) return;
  try { const all = new Set(JSON.parse(storage.getItem(SEASONS_KEY) || '[]')); all.add(String(seasonId)); storage.setItem(SEASONS_KEY, JSON.stringify([...all].slice(-20))); } catch { /* memory only */ }
}
export function enteredSeasons(storage) { try { const v = JSON.parse((storage && storage.getItem(SEASONS_KEY)) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } }

/** Pure: which dragons count as the heroine's pets (the Hatchkeeper's: token ids "pet-…"). */
export const petsOf = (dragons) => (Array.isArray(dragons) ? dragons.filter((d) => d && /^pet-/.test(d.tokenId) && d.kind) : []);

/** Pure: what the Hatchkeeper shows: 'owned' (a pet already chose a heroine), 'claim' (a finished tournament), else 'riddle'. */
export const hatchState = ({ proven = false, pet = null } = {}) => (pet ? 'owned' : proven ? 'claim' : 'riddle');

/**
 * {proven, seasonId} from the chain: a remembered season the guest entered and that has settled.
 * @param {{storage: object, view?: (contract: string, method: string, args: object) => Promise<any>}} o
 */
export async function tournamentProof({ storage, view = chainView }) {
  const g = day1(storage).guest; const account = g && g.account_id;
  if (!account) return { proven: false, seasonId: null };
  for (const id of enteredSeasons(storage).slice().reverse()) {
    try {
      if (!(await view(DAY1_DEPLOYMENT.town, 'has_entered', { season_id: id, account_id: account }))) continue;
      const s = await view(DAY1_DEPLOYMENT.town, 'season', { season_id: id });
      if (s && s.settled) return { proven: true, seasonId: id };
    } catch { /* offline: not proven now */ }
  }
  return { proven: false, seasonId: null };
}

/** The player's heroines: the Day 1 one first, then any other the guest account holds on the heroine contract. */
export async function heroineOptions({ storage, view = chainView }) {
  const g = day1(storage).guest; const out = [];
  if (g && g.token_id) out.push(g.token_id);
  if (g && g.account_id) {
    try { const r = await view(DAY1_DEPLOYMENT.heroine, 'nft_tokens_for_owner', { account_id: g.account_id, from_index: '0', limit: 20 }); for (const tk of Array.isArray(r) ? r : []) if (tk && tk.token_id && !out.includes(tk.token_id)) out.push(tk.token_id); } catch { /* the Day 1 one */ }
  }
  return out;
}

/** The pet of any of the player's heroines: {heroine, kind, tokenId} | null. */
export async function findPet({ storage, heroines = null, read = readCompanions }) {
  for (const h of heroines || (await heroineOptions({ storage }))) {
    const r = await read({ tokenId: h }).catch(() => null);
    const p = r && r.state === 'loaded' ? petsOf(r.dragons)[0] : null;
    if (p) return { heroine: h, kind: p.kind, tokenId: p.tokenId };
  }
  return null;
}

async function chainView(contractId, method, args) {
  const near = createNearClient({ contractId, rpcUrls: NEAR_DEPLOYMENT.rpcUrls, timeoutMs: 10000 });
  const r = await near.view(method, args); return r && 'value' in r ? r.value : r;
}
