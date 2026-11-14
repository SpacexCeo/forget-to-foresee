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
  The device-key text is signed inside the wallet's own sign-in step (`connect({signMessageParams})`, the wallet's
  `signInAndSignMessage`), so a NEAR login is two wallet approvals: connect, then the sign-in message after the gold
  "Continue in your wallet" button. HOT gets the NEP-413 nonce as a plain array (its executor sends JSON, where a
  `Uint8Array` turns into an object). Wallets answer in different shapes (`signedMessage` nested or flat, snake-case
  fields, byte signatures): `signedOf` in `net/wallets.js` reads them all. While a wallet is being asked, a tap outside
  the panel or Esc does not close it. The relayer logs each link outcome (`[auth] link <kind> -> <status> <result>`).
- **NEAR testnet account (MyNearWallet)**: MyNearWallet's NEP-413 popup on testnet, no library.
- **EVM wallet (MetaMask and others)**, **Solana wallet (Phantom and others)**. Each EIP-6963 EVM wallet and each
  injected Solana wallet the browser has gets its own row.
- The panel opens from the game menu (header button) and from the Day-1 name step (a secondary button under
  Continue). It never opens by itself; Esc, the × or a tap outside closes it. Text: "Your account lives on NEAR
  testnet. Nothing here has real-world value."
- **Sign in with a passkey / Create a passkey** (first rows when the browser has WebAuthn): the "email-like" login,
  with Face ID, a fingerprint or the device PIN, no extension and no provider secret. See "Passkeys" below.
- **Sign in with email** (no wallet app, e.g. on a phone): see "Email and linked methods" below. Google: not built.

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

### Passkeys (WebAuthn)

- **Create a passkey**: `navigator.credentials.create` (ES256, discoverable, rpId = the page's host). The browser
  hands over the credential's P-256 public key (`getPublicKey()`, SPKI). **Sign in with a passkey**:
  `navigator.credentials.get` with no allow-list, so the browser offers the passkeys it holds (or a phone's via QR).
- **Login message**: the passkey signs an assertion whose challenge is `sha256(login message)`. The relayer
  (`verifyPasskey` in `relayer/lib/auth.js`) checks five things: `type = webauthn.get`, the challenge, an allowed
  origin (`FTF_ALLOWED_ORIGINS` or localhost), `rpIdHash = sha256(origin host)` with the user-present flag set, and
  the ECDSA P-256 signature over `authenticatorData || sha256(clientDataJSON)`. The identity is
  `passkey:<credential id>`. The first link pins the public key (`passkey_key`); later requests verify with the pinned
  key, so reusing a credential id with another key fails. Replays and expiry are covered by the same one-time nonce.
- **Device key**: the PRF extension's output for the salt `sha256("ftf-device-key-v1")`. Synced passkeys (iCloud
  Keychain, Google Password Manager) give the same output on every device, so the same device key comes back and the
  account is restored. Without PRF the device key is kept in this browser only, and another device answers
  "no device key" (`acct.nokey`), as for a non-deterministic wallet.
- Tests: `relayer/tests/auth.test.mjs` (good, bad key/text/origin/presence/type, replayed, expired, pinned key) and
  `game/tests/client/account-login.test.mjs` (the real provider with a fake authenticator against the real linker:
  create + restore with PRF, no PRF, foreign origin, panel rows).

Limits, stated honestly: a wallet whose signatures are not deterministic (some smart-contract or MPC wallets)
cannot restore the account on a second device; the panel says so (`acct.nokey`). Rate limit: 20 requests a minute
per IP on `/api/auth/*`. Nonces live in the relayer's memory (one process).

## Email and linked methods (14 Nov)

One canonical account per player: the Day-1 NEAR account every login maps to. In the account panel a signed-in
browser sees **Linked sign-in methods** (each with Unlink), **Link an email**, and a note that another wallet is linked
by signing in with it while this account is open. A browser with no account sees **Sign in with email**.

- **Link an email** (`net/account-email.js` linkStart / linkFinish; `relayer/lib/email-auth.js`): an account proof (a
  message signed by a full-access key of the account, used once, 5 minutes) and the email go to
  `POST /api/auth/email/start`; a 6-digit code is mailed. The browser makes a dedicated **email key**, adds it to the
  account on chain (AddKey, signed by its own key), then sends the code, the key and a second proof to
  `POST /api/auth/email/link`. The relayer checks that the key is on the account and stores it **encrypted**
  (AES-256-GCM, `FTF_EMAIL_KEY_SECRET`) under `email:<sha256>`; the address itself is never stored (only a hint like
  `a***@gmail.com`).
- **Sign in with email**: `POST /api/auth/email/start` (the same answer for a known and an unknown address; no mail to
  an unknown one), then `POST /api/auth/email/login` with the code returns the account and its email key while that key
  is still on the account. The browser plays as that account: mints and transfers go there, as with every login.
- Codes: 10 minutes, 5 tries, one use, 5 an hour per address, kept only as salted hashes in memory. No passwords exist.
- `POST /api/auth/methods` and `POST /api/auth/unlink` (each with a fresh proof). Unlinking an email destroys its stored
  key; a device that already signed in with it keeps that key until it is removed from the account (DeleteKey is not
  wired in the panel yet).
- **Custody, stated plainly:** email sign-in means the relayer holds an encrypted testnet key per linked email. The
  account holds testnet NEAR and game items with no real-world value.
- **Configuration (owner):** `RESEND_API_KEY` and `FTF_EMAIL_FROM` (a sender on a domain verified in Resend), and
  `FTF_EMAIL_KEY_SECRET` (32 random bytes, base64). Without them the email routes answer 503 `email_not_configured`
  and the panel says "Email sign-in is not available yet"; the methods list works regardless.
- Tests: `relayer/tests/email-auth.test.mjs`, `game/tests/client/account-email.test.mjs` (a desktop link and a phone
  sign-in against the real relayer code).

## Files

- `relayer/lib/auth.js`, `relayer/api/auth.js`, `relayer/tests/auth.test.mjs`
- `game/src/net/account-login.js` (flow), `game/src/net/wallets.js` (providers incl. `passkeyProvider`, no libraries),
  `game/src/play/account-panel.js` (UI), `game/src/play/locales/en-account.js` (+ `ru.js`),
  `game/tests/client/account-login.test.mjs` (the browser flow against the real relayer linker)
