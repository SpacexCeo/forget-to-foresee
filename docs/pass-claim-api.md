# Whitelist pass claim API (relayer)

Story TZ §11.3. Code: `relayer/lib/pass.js`, `relayer/api/pass/{claim,status,eligibility}.js`. Contract:
[`contracts/whitelist-pass`](../contracts/whitelist-pass). Plain-language page: [`whitelist-pass.md`](whitelist-pass.md).
**Default: testnet and dry-run** — without `FTF_PASS_KEY` the claim answers `503 not_configured` after every check,
and nothing signs unless `FTF_PASS_ENABLED=1`.

## `POST /api/pass/claim`

```json
{ "guest_account": "ann.guests.ftf-coordinator.testnet", "public_key": "ed25519:<guest public key>", "wallet": "ann.near",
  "claim": { "v": 1, "board_season": 1, "claim_id": "<sha256('ftf-pass-1|1|' + guest_account), hex>", "log_head": "<hash>", "log_len": 412, "issued_at": 1762960000000 },
  "signature": "ed25519:<base58 signature of the canonical text by the guest key>", "captcha": "<only when the server asks>" }
```

Canonical text signed by the guest key: `ftf-pass-claim|v|board_season|claim_id|log_head|log_len|issued_at|wallet`.

Checks, in order (each a separate tested function): (1) wallet syntax — named `^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$`
or implicit `^[0-9a-f]{64}$`, 2 to 64 characters, lowercase only, not the contract or minter, `.testnet` refused on
mainnet and required on testnet (shared vectors: `relayer/tests/fixtures/account-ids.json`); (2) a named wallet exists
on the pass network (`view_account`, two RPC endpoints, 5 s timeout; implicit accounts may be unfunded unless
`FTF_PASS_REQUIRE_FUNDED_IMPLICIT=1`); (3) the signature verifies and the key is an access key of the guest account
(testnet `view_access_key`); (4) one claim per guest and per wallet: the server index, then the contract's
`is_claimed(claim_id)` and `has_minted(wallet)`; a repeat returns the original result with `"replay": true`;
(5) eligibility from the replayed expedition log (the 200 silk Gate-Loom fee paid at the portal, story income only; wool is never an
input); (6) per-IP bucket (3, then 1 per 10 minutes), per-guest one attempt per 10 minutes, optional captcha when
`FTF_CAPTCHA_SECRET` is set; (7) budget: minter key allowance (must be a function-call key), the contract's available
balance, `pass_info` (paused, caps; the server's daily cap is at most the contract's); (8) `mint_pass` signed by the
minter function-call key, `wait_until: FINAL`, then the token is read back with the wallet as owner. An ambiguous
outcome is looked up (the tx by its hash, the contract's claim set), never re-sent blindly.

| status | HTTP | queued? |
|---|---|---|
| `minted` (with `tx_hash`, `token_id`, `explorer`) | 200 | no |
| `already_claimed` (replay; `tx_hash` only if this server knows it) | 200 | no |
| `queued` | 202 | yes |
| `paused` (contract paused or kill switch) | 202 | yes |
| `budget_exhausted` (allowance, balance or day cap) | 202 | yes |
| `rpc_unavailable` | 202 | yes |
| `invalid_account` / `bad_body` | 400 | no |
| `signature_invalid` | 401 | no |
| `not_eligible` (with `needed`, `paid`, `earned`) | 403 | no |
| `wallet_taken` | 409 | no |
| `sold_out` | 410 | no |
| `account_missing` | 422 | no |
| `captcha_required` | 428 | no |
| `rate_limited` (with `retry_after_s`) | 429 | no |
| `tx_failed` (with `code`) | 502 | no |
| `not_configured` (dry run, after every check) | 503 | no |

**A transaction hash is returned only with `minted`** (and on a replay of it). Never while pending, never invented.

## `GET /api/pass/status?claim_id=<64 hex>` and `GET /api/pass/eligibility?guest=<guest account>`

Status: the stored claim (polled every 15 s by the game while queued). Eligibility: `{eligible, paid, earned, needed}`
from the replayed log; the client only asks, it can never supply a number.

## Queue, kill switch, environment

Append-only `FTF_PASS_DIR/pass-claims.jsonl` (the last line per claim wins), a worker every 10 s with backoff 30 s,
2 min, 10 min, 1 h, expiry after 24 h (`expired`, kept visible), one send in flight. Kill switch: `FTF_PASS_ENABLED=0`
or a `STOP` file in `FTF_PASS_DIR` halts sending (claims keep queueing).

| variable | meaning |
|---|---|
| `FTF_PASS_NETWORK` | `testnet` (default) or `mainnet` |
| `FTF_PASS_CONTRACT`, `FTF_PASS_MINTER` | the pass contract and the minter account |
| `FTF_PASS_KEY` | the minter's **function-call** private key (receiver = the contract, method `mint_pass`); only on the relayer host, never in the repo, CI or logs |
| `FTF_PASS_ENABLED` | `1` to allow signing; anything else is the kill switch |
| `FTF_PASS_DIR` | queue directory (back it up) |
| `FTF_PASS_RPC_URLS` | override of the pass network's RPC list |
| `FTF_PASS_DAILY_CAP` | server daily cap (default 100, keep it at most the contract's `daily_cap`) |
| `FTF_PASS_MIN_ALLOWANCE_YOCTO`, `FTF_PASS_MIN_BALANCE_YOCTO` | budget thresholds (0.05 and 0.1 NEAR) |
| `FTF_CAPTCHA_SECRET` | optional captcha (off by default) |
| `FTF_PASS_REQUIRE_FUNDED_IMPLICIT` | `1` to refuse unfunded implicit accounts |

`/api/health` reports `pass: {network, contract, configured, enabled}` and never the key.

**Eligibility source.** `relayer/lib/pass-eligibility.js`: the guest's log from `FTF_EXPEDITION_DIR/<guest>.jsonl`,
its chain verified with `expedition-rules/expedition-log.js` `verifyLog`, then `expedition-rules/portal-eligibility.js`
`portalEligibility` (exactly one `portal_paid` of the 200 silk fee, covered by verified income before it). Without
`FTF_EXPEDITION_DIR`, without a stored log, or without the rules modules, nobody is eligible (honest default).
