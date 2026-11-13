# Account login (Sign in / Create account)

Behind the feature flag `accountLogin` (`game/public/features.json`, off). `?ff=accountLogin` switches it on for one page.

## What the player sees

- **Play as guest** is the first and largest button. A guest plays at once on the Day-1 guest NEAR testnet account
  stored in this browser, exactly as before; nothing waits on a wallet or the relayer.
- **NEAR wallet (HOT, Meteor, Intear, MyNearWallet…)** through HOT's NEAR Connect (`@hot-labs/near-connect@0.12.0`,
  imported from esm.sh only when the row is tapped; its chooser lists HOT, Meteor, Intear, Ledger, MyNearWallet, OKX,
  NEAR Mobile, Nightly, Hana, NEAR CLI). It runs on mainnet: HOT, MyNearWallet, OKX and Hana declare no testnet support,
  and a NEP-413 signature is free and moves nothing; the game account stays the testnet guest. If NEAR Connect cannot
  load, the row falls back to MyNearWallet directly.
- **NEAR testnet account (MyNearWallet)**: MyNearWallet's NEP-413 popup on testnet, no library.
- **EVM wallet (MetaMask and others)**, **Solana wallet (Phantom and others)**. Each EIP-6963 EVM wallet and each
  injected Solana wallet the browser has gets its own row.
- The panel opens from the game menu (header button) and from the Day-1 name step (a secondary button under
  Continue). It never opens by itself; Esc, the × or a tap outside closes it. Text: "Your account lives on NEAR
  testnet. Nothing here has real-world value."
- Email / Google: not built. No project on the owner's machine had it (the reference site uses NEAR wallets only),
  and wallets shipped first before the feature freeze.

## How it works

The Day-1 guest account stays the on-chain identity. A login links to it.

1. **Device key, the same on every device, never sent anywhere.** The wallet signs a fixed text
   (`DEVICE_KEY_TEXT`). ed25519 signatures (NEAR, Solana) and RFC 6979 secp256k1 signatures (MetaMask and most EVM
   wallets) are deterministic, so `sha256("ftf-device-key-v1" || first 64 signature bytes)` is the same ed25519 seed on
   every device. The relayer never sees it.
2. **Login message.** `POST /api/auth/nonce` gives a one-time nonce (10 min). The wallet signs the message (login,
   game account, device public key, nonce, expiry, a testnet note):
   - EVM: EIP-191 `personal_sign`, checked by secp256k1 recovery to the 0x address;
   - Solana: `signMessage`, ed25519 over the UTF-8 bytes, the base58 address is the key;
   - NEAR: NEP-413 (`recipient: forget-to-foresee`, the nonce as the 32-byte NEP-413 nonce), and the key must be a
     full-access key of the named account, checked on that account's own network (`*.testnet` on testnet, other names
     on mainnet, `FTF_MAINNET_RPC` to override; implicit accounts: hex(key) = account).
   These are the key kinds intents.near accepts, so the same logins can later sign NEAR Intents.
3. **Guest proof.** When the browser already has a guest, the guest's own full-access key signs the same message;
   the relayer checks the key on chain. Nobody can link someone else's account.
4. **`POST /api/auth/link`** stores `identity -> {account, guest_key, kind, address, linked_at, history}` in
   `FTF_DATA_DIR/auth/identities.json` (mode 600, public data only). Answers:
   `new` (no account anywhere: the browser makes the free Day-1 guest with the device key itself, then links),
   `linked`, `existing` (another device already linked it), or `409 conflict` with a one-time choice token.
5. **AddKey.** After `linked`, the browser adds the device key to the guest account as a full-access key (a
   transaction signed by the guest key). On another device the same wallet derives the same key, the relayer names
   the account, the key is already there: the browser switches to that account (`guest_of(guest_key)` brings the
   Day-1 record back). Progress on chain (silk, NFTs) follows; this browser's previous record is kept under
   `ftf.day1.prev.v1`.
6. **Conflict.** If the login has another account, the player chooses: use the login's account (this browser's
   account and key are kept locally) or keep this browser's account (the login moves here; the old mapping is kept in
   `history`). Nothing is dropped silently.

Limits, stated honestly: a wallet whose signatures are not deterministic (some smart-contract or MPC wallets)
cannot restore the account on a second device; the panel says so (`acct.nokey`). Rate limit: 20 requests a minute
per IP on `/api/auth/*`. Nonces live in the relayer's memory (one process).

## Files

- `relayer/lib/auth.js`, `relayer/api/auth.js`, `relayer/tests/auth.test.mjs`
- `game/src/net/account-login.js` (flow), `game/src/net/wallets.js` (providers, no libraries),
  `game/src/play/account-panel.js` (UI), `game/src/play/locales/en-account.js` (+ `ru.js`),
  `game/tests/client/account-login.test.mjs` (the browser flow against the real relayer linker)
