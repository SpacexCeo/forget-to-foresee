// Day 1 free mint (docs/day1-free-mint-plan.md): the browser makes the player's own ed25519 key (kept in this
// browser), asks the guests contract for a guest account with that key as its full-access key, and the contract mints
// Elise to it. The call is signed with the guests contract's create_guest-only key from the build environment.
// Honest states: "minted" only after the transaction is final AND the contract confirms `minted: true` for this key;
// anything else is "failed" (retry) or "unavailable" (this build has no key or deployment): never a fake checkmark.
import { createTxClient, generateKeyPair, importSecretKey } from '../net/near-tx.js';
import { DAY1_DEPLOYMENT } from '../net/day1-deployment.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';

export const DAY1_KEY = 'ftf.day1.v1';
const envGuestKey = () => { try { return import.meta.env && import.meta.env.VITE_FTF_GUEST_KEY; } catch { return undefined; } };

/** The saved Day 1 record of this browser: {nickname, playerKey, guest, minted, claimed, skin, step}. */
export function loadDay1(storage) {
  try { const raw = storage && storage.getItem(DAY1_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/**
 * @param {{storage?: object, deployment?: object, guestSecret?: string, fetch?: Function, rpcUrls?: string[], keygen?: Function}} [o]
 */
export function createDay1Mint({ storage = null, deployment = DAY1_DEPLOYMENT, guestSecret = envGuestKey(), fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls, keygen = generateKeyPair } = {}) {
  let rec = loadDay1(storage);
  const st = { phase: rec.minted ? 'minted' : 'idle', reason: null, txHash: rec.txHash || null };
  const listeners = new Set();
  const save = () => { try { if (storage) storage.setItem(DAY1_KEY, JSON.stringify(rec)); } catch { /* memory only */ } };
  const emit = () => { for (const fn of [...listeners]) fn(api); };
  const set = (phase, reason = null) => { st.phase = phase; st.reason = reason; emit(); };
  const available = () => !!(deployment && deployment.guests && deployment.heroine && deployment.guestKeyAccount && guestSecret);
  const explorer = (NEAR_DEPLOYMENT.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '');
  let running = null;

  async function run(nickname) {
    if (!available()) { set('unavailable', 'not_configured'); return api; }
    try {
      set('keygen');
      if (!rec.playerKey) { rec.playerKey = await keygen(); save(); }
      if (nickname) { rec.nickname = nickname; save(); }
      const client = createTxClient({ rpcUrls, fetch });
      // a reload mid-mint, or a retry: the contract may already have it
      const before = await client.view(deployment.guests, 'guest_of', { public_key: rec.playerKey.publicKey }).catch(() => null);
      if (!(before && before.minted)) {
        set('sending');
        const key = await importSecretKey(guestSecret);
        const r = await client.call({ key, signerId: deployment.guestKeyAccount, receiverId: deployment.guests, methodName: 'create_guest', args: { public_key: rec.playerKey.publicKey, nickname: rec.nickname || 'guest' } });
        rec.txHash = r.hash; st.txHash = r.hash; save();
        if (!r.ok) { set('failed', 'tx_failed'); return api; }
      }
      set('checking');
      const g = await client.view(deployment.guests, 'guest_of', { public_key: rec.playerKey.publicKey });
      if (!g || !g.minted) { set('failed', g ? 'not_minted' : 'no_guest'); return api; }
      rec.guest = g; rec.minted = true; save();
      set('minted');
    } catch (e) {
      set('failed', (e && e.message ? e.message : 'error').slice(0, 80));
    }
    return api;
  }

  const api = {
    get phase() { return st.phase; },
    get reason() { return st.reason; },
    get record() { return { ...rec }; },
    get available() { return available(); },
    /** Explorer links, present only once minted. */
    get links() {
      if (st.phase !== 'minted' || !rec.guest) return null;
      return { token: `${explorer}/nft-token/${deployment.heroine}/${rec.guest.token_id}`, account: `${explorer}/address/${rec.guest.account_id}`, tx: rec.txHash ? `${explorer}/txns/${rec.txHash}` : null };
    },
    /** Runs the free mint (once at a time). */
    mint(nickname) { if (!running) running = run(nickname).finally(() => { running = null; }); return running; },
    retry() { return api.mint(rec.nickname); },
    setRecord(patch) { rec = { ...rec, ...patch }; save(); emit(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
