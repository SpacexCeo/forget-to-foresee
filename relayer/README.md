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

`server.js` also reads `relayer/.env` (git-ignored; variables already set in the environment win).

Optional env: `FTF_GUESTS_CONTRACT` (default `guests.ftf-coordinator.testnet`), `FTF_RPC_URLS` (comma-separated),
`HOST` (default `0.0.0.0`).

Then in the game repository set the Actions variable `FTF_RELAYER_URL=https://<host>`; the Pages build passes it as
`VITE_FTF_RELAYER_URL`. For a local game build put the same line in `game/.env.local`.

## TEE agents (NEAR AI Cloud)

Townsfolk speech and a trader's buy/sell/hold come from a model that runs inside a TEE on NEAR AI Cloud
(`https://cloud-api.near.ai/v1`, OpenAI-compatible). The key stays on this server (`NEARAI_API_KEY`).

- `POST /api/agent/say` `{ npc, question, facts?, lang? }` → `{ text, tee }`. `facts` is the game's own scripted answer
  (true state); the model only rephrases it in character.
- `POST /api/agent/decide` `{ npc, echo, bars: [cents…] (2–32 published bars), position: -1|0|1 }` →
  `{ decision: { action, reason, decision_hash }, text, tee }`.
- `tee` carries everything needed to check the answer without trusting this relayer: the exact `request_body` and
  `response_body`, `signed_text` (`sha256(request):sha256(response)`), the ECDSA `signature`, the `signing_address`, the
  relayer's own check of both hashes and the signature, and the attestation of that address (Intel TDX quote chain to
  the Intel root, report data binding the address and a fresh nonce, RTMR replay, the measured docker compose, GPU
  evidence). `verified: true` only when all of these pass. `node tools/verify-tee/verify.mjs` re-checks independently.
- Errors: `400` (bad body), `429` (per-IP limit: 6, then one per 20 s; or the daily cap), `502` (upstream), `503` (no key, or `tee_busy`: more than `FTF_TEE_MAX_INFLIGHT`, default 8, answers in flight).
  The game always falls back to its scripted lines.
- Optional env: `NEARAI_MODEL` (default `Qwen/Qwen3-VL-30B-A3B-Instruct`), `FTF_TEE_DAILY_CAP` (default 1500),
  `FTF_TEE_NRAS=0` to skip the GPU vendor's online attestation check, `NEARAI_BASE_URL`.
- Details and the verification chain: `docs/tee.md`.

## Wheel grand prize (Sheriffchenko skin)

`POST /api/wheel/claim` `{ account_id, public_key, wheel_id, seed, at, signature }` → `{ token_id, tx_hash }`: the
relayer re-derives the wheel id and the roll, bounds the spin number and mints on `skins.ftf-coordinator.testnet`
(cap 100, one per account) with `FTF_SKIN_KEY`. Details: `docs/wheel-skin.md`.

## Test

```bash
cd relayer && npm test
```
