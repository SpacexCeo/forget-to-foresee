# The portal on chain, for guests

City Economy rev 4 §2.13; contract v3 (`docs/town-upgrades.md`). A guest's browser key is a function-call key of
the guests contract and cannot sign to `ftf-town`. The relayer acts for the guest, but only on what the guest proves.

## 1. Credit: the silk the guest earned, on chain

- **The source** is the guest's stored, hash-chained expedition log (`POST /api/expedition/log`, kept in
  `FTF_EXPEDITION_DIR`). It is verified with the shared rules' `verifyLog`: T2 income counts in full, T1 kill income
  up to its cap (5,000 game silk).
- **The scale** maps the game's portal fee to the on-chain gate price: `income × gate_price / PORTAL_FEE_C`. Since story
  rev 4 the game's own fee and rewards are already on the gate's scale (fee 200 silk, rewards × 0.02), so the factor is 1
  while `gate_price` stays 200: 220 verified game silk gives 220 silk on chain. If the owner moves `gate_price`, the factor follows.
- **What happens**:
  - The relayer registers the guest on `ftf-town` (`register`) if needed.
  - It credits the difference between that amount and what it credited before (`credit_silk`, reference
    `story:<guest>`), up to `FTF_GUEST_CREDIT_DAY` (300 silk) per guest per day. The contract's own daily ceiling
    also applies.
- **Idempotent.** A per-guest ledger (`relayer/data/town-credits/<guest>.json`) records what was credited. It is
  written before the call and rolled back if the call fails, so nothing is credited twice. A tampered log credits
  nothing.

## 2. Gate: the guest's own signed request

1. The guest signs `ftf-gate|<account>|<gate_id>|<at>` with its Day-1 key and POSTs it.
2. The relayer checks:
   - the ed25519 signature;
   - that the key is an access key of that account (`view_access_key`);
   - the timestamp (±5 min);
   - that the request was never used, both in the relayer's own guard and on chain (`gate_request_used`);
   - that this gate is unpaid.
3. It runs the credit step first and checks that the balance covers the price.
4. It calls `pay_gate_for(account, gate_id, sha256(message|signature))`. The contract burns the price, records the
   request hash once and logs `gate_paid` with `by` and `request_hash`.

## Endpoint (`relayer/api/town/gate.js`)

| Call | Body / query | Answer |
|---|---|---|
| `GET /api/town/gate?account_id=<guest>` | | `{registered, silk, gate_price, gate, contract, configured}`. `gate` is `gate_paid_of` (null until paid). Amounts are µ-silk strings |
| `POST /api/town/gate` (credit only) | `{account_id, public_key, at, signature, credit_only: true}`, signed `ftf-town-credit\|<account>\|<at>` | `{registered, credited_now, credited_total, creditable, silk, gate_price, tx_hash, capped_today}` |
| `POST /api/town/gate` (pay) | `{account_id, public_key, at, gate_id, signature}`, signed `ftf-gate\|<account>\|<gate_id>\|<at>` | 200 `{paid, tx_hash, request_hash, gate, contract}` |

Errors:

| Code | Error | Meaning |
|---|---|---|
| 400 | `bad_*`, `stale` | malformed or out-of-time request |
| 401 | `bad_signature` | the signature does not verify |
| 403 | `not_your_key` | the key is not an access key of that account |
| 409 | `replayed`, `already_paid`, `no_verified_log` | request used, gate paid, or no verifiable log |
| 402 | `not_enough_silk` | the balance does not cover the price (`silk`, `gate_price`, `creditable` say how far) |
| 429 | `rate_limited` | too many requests from this address |
| 503 | `gate_not_configured` | the relayer's keys or log directory are missing |
| 502 | `*_failed` | the chain call failed (`tx_hash` included) |

## Server setup (owner)

The coordinator is `gate.ftf-town.testnet`, a sub-account of ftf-town with no full-access key, only one
function-call key on ftf-town (register, credit_silk, pay_gate_for). The key is made on the relayer's server and its
secret never leaves it:

1. On the server, in `relayer/`: `node scripts/coord-key.mjs gate.ftf-town.testnet`. It writes
   `data/coord-key.json` (mode 600, gitignored; run again, it keeps the key) and prints only the account, the public
   key and the methods. `lib/town-gate.js` reads that file when `FTF_TOWN_COORD`/`FTF_TOWN_COORD_KEY` are not set,
   so nothing goes into `.env`.
2. The lead creates the account (signed by ftf-town) and adds the printed key:
   ```
   near account create-account fund-myself gate.ftf-town.testnet '0.5 NEAR' autogenerate-new-keypair save-to-legacy-keychain sign-as ftf-town.testnet network-config testnet sign-with-legacy-keychain send
   near account add-key gate.ftf-town.testnet grant-function-call-access --allowance '1 NEAR' --contract-account-id ftf-town.testnet --function-names 'register, credit_silk, pay_gate_for' use-manually-provided-public-key <PUBLIC_KEY> network-config testnet sign-with-legacy-keychain send
   ```
   (The full-access key the first command generates stays in the lead's keychain; it can be deleted afterwards so
   the account holds only the function-call key.)
3. The owner adds it to the coordinators. `set_coordinators` replaces the whole list, so keep the existing ones:
   `set_coordinators({"coordinators": ["ftf-coordinator.testnet", "gate.ftf-town.testnet"]})`.
4. `FTF_EXPEDITION_DIR` set (it already is, for the log store). Restart the relayer; `GET /api/town/gate?account_id=…`
   then answers `configured: true`.

Tests: `relayer/tests/town-gate.test.mjs` (6). They cover the scaling and a tampered log; that registration happens
once, only the difference is credited, the daily cap holds and the credit is idempotent; the rollback after a failed
credit; that a signed request pays once with replays and second payments refused; and bad signature, someone
else's key, a stale request and too little silk; and that the key file is read when the env has none.
