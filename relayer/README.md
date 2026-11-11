# Day 1 relayer

A tiny Node service that signs one call, `guests.ftf-coordinator.testnet` → `create_guest`, so the game page carries
no key. The player's browser still makes its own ed25519 key; its public part becomes the full-access key of the new
guest account, and the contract mints Elise to that account (`contracts/guests`). NEAR testnet only, no real money.

- `POST /api/create-guest` `{ "public_key": "ed25519:…", "nickname": "Ann" }` → `200 { account_id, token_id, tx_hash }`
  only after the transaction is final and `guest_of` says `minted: true`. Idempotent per key: an already-minted guest
  is returned with `tx_hash: null`. Errors: `400` (bad key / nickname), `429` (per-IP limit or the contract's daily
  cap), `502` (transaction failed or not minted; carries `tx_hash` when there is one), `503` (no key configured).
- `GET /api/health` → `{ ok, contract, configured, stats }` (never the key).
- Validation follows the contract: nickname → lowercase `a-z0-9`, at most 12, else `guest`. Rate limit: a per-IP
  token bucket (3 at once, then 1 per 10 min) in each instance's memory, best effort; the contract's daily cap
  (`stats.daily_cap`) is the hard limit. CORS: `https://spacexceo.github.io` and any `localhost` / `127.0.0.1` port.
- No dependencies: the signer is `lib/near-tx.js`, a byte-identical copy of `game/src/net/near-tx.js` (a test checks
  it). Needs Node 20+ (WebCrypto Ed25519).

## Run on any server

```bash
cd relayer                                   # Node 20+, no npm install needed
export FTF_GUEST_KEY='ed25519:…'             # the create_guest-only private key (contracts/scripts/day1-guest-key.sh)
export ALLOWED_ORIGIN='https://spacexceo.github.io'   # comma-separated; localhost is always allowed
PORT=8787 TRUST_PROXY=1 node server.js       # or: docker build -t ftf-relayer . && docker run -e FTF_GUEST_KEY -e ALLOWED_ORIGIN -e TRUST_PROXY=1 -p 8787:8787 ftf-relayer
# put it behind HTTPS (a reverse proxy with a certificate), then: curl https://<host>/api/health
```

`TRUST_PROXY=1` only behind a reverse proxy (the rate limit then reads `X-Forwarded-For`); without it the socket
address is used. The same handlers also run as serverless functions from `api/` (`vercel.json`); set `FTF_GUEST_KEY`
in that host's environment.

Optional env: `FTF_GUESTS_CONTRACT` (default `guests.ftf-coordinator.testnet`), `FTF_RPC_URLS` (comma-separated),
`HOST` (default `0.0.0.0`).

Then in the game repository set the Actions variable `FTF_RELAYER_URL=https://<host>`; the Pages build passes it as
`VITE_FTF_RELAYER_URL`. For a local game build put the same line in `game/.env.local`.

## Test

```bash
cd relayer && npm test
```
