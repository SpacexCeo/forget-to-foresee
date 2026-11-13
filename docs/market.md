# The player market

Players trade monster resources for silk with each other (sprint 6.4). The rules live in one file,
`game/src/market/market-rules.js`, copied byte for byte to `relayer/lib/market-rules.js` (a test checks the copy).

| Rule | Value |
|---|---|
| Tradable | `spider_silk_thread`, `chitin_plate`, `veil_dust`, `ash_ore`, `crown_shard` (the NEP-245 ids on `items.ftf-town.testnet`) |
| Listing fee | 0 |
| Sale fee | 2 % of the total, rounded up to 0.01 silk, paid by the seller, **burned** |
| Minimum total | 0.10 silk |
| Price band | unit price between 50 % and 200 % of the reference (the stall's price for one, from the stock-and-demand rule) |
| Quantity | 1 to 99 per listing |
| Active listings | 10 per account |
| Duration | 24 h, then the listing expires and the items stay with the seller |
| Daily volume | 500 silk per account, counted for buyer and seller |
| Self-trade | refused |
| Cancel | free |

## Endpoints (`relayer/api/market/p2p.js`, `relayer/lib/p2p.js`)

- `GET /api/market/p2p/book?item=<id>` → `{listings, referenceUnitC, band: {minC, maxC}, settlement: "chain", live}`.
- `GET /api/market/p2p/mine?account_id=` → `{listings, fills, volumeTodayC, settlement, live}`.
- `GET /api/market/p2p/stats` → `{today, volumeC, lastTrades, settlement}`.
- `POST /api/market/p2p/list` `{account_id, public_key, at, signature, item, qty, unit_price_c}` → `{listing}`.
- `POST /api/market/p2p/buy` `{..., listing_id, qty, request_id}` → `{fill: {qty, totalC, feeC, sellerGetsC, txItems,
  txSilk}, listing}`. A retry with the same `request_id` returns the same fill.
- `POST /api/market/p2p/cancel` `{..., listing_id}` → `{listing}`.

Every POST is signed by the guest key over `ftf-market|<account>|<action>|<args joined by ",">|<at>`. The args are
`item,qty,unit_price_c` for list, `listing_id,qty,request_id` for buy and `listing_id` for cancel. The relayer checks
the signature, that the key belongs to the account, a 5-minute skew and that the signature was never used.
Operations run one at a time, so the last items go to exactly one buyer.

Errors: `outside_band` (with `minC`, `maxC`), `not_enough_items`, `not_enough_silk`, `listing_gone`,
`limit_listings`, `daily_cap`, `self_trade`, `too_small`, `bad_qty`, `not_tradable`, `rate_limited`, `replayed`,
`bad_signature`, `not_your_key`.

## Settlement: NEAR testnet only

The owner's rule is no demo modes, so every sale settles on NEAR testnet. For each fill the items move first
(`items.coordinator_transfer` from seller to buyer, signed by `FTF_ITEMS_MINTER`). Then the silk moves (`ftf-town`
`trade_for` from buyer to seller, fee burned, signed by the town coordinator). If the silk call fails, the items are
moved back with a fresh request hash. Both transaction hashes are returned and shown as NearBlocks links.

**Not live yet**: the market is live only when both keys are on the relayer and both contract methods are deployed.
The relayer checks this once a minute. Until then `book` and `mine` answer `live: false`, list and buy answer `503
market_not_live`, and the window says so plainly with its buttons off. The listings themselves (the book) are kept by
the relayer.

## What the owner deploys to make the market live

1. `ftf-town` v5 (`trade_for`), with `bash contracts/scripts/town-upgrade.sh`. It is state-compatible: two raw keys,
   no stored struct changes. Add `trade_for` to the coordinator's function-call key methods.
2. `items.ftf-town.testnet` v2 (`coordinator_transfer`). It is state-compatible: one new collection
   (`StorageKey::Requests`) at the end. Redeploy without an init call. The market key must be one of the items
   minters (`set_minters` replaces the list).
3. `FTF_ITEMS_MINTER` and `FTF_ITEMS_KEY` and the coordinator key on the relayer server, then restart it. The market
   turns live within a minute.

Tests: `relayer/tests/p2p.test.mjs` (6) and the contract tests (`trade_for` 8, `coordinator_transfer` 5).

## Games tab: Loom Dice (play money, sprint 6.8)

`game/src/market/dice.js`. "Roll under N" for N = 50, 25 or 10. The roll is 1–100 and pays stake × 96/N, so every bet
returns 96 % on average: a 4 % house edge, shown in an odds table generated from the code. Stakes are 1, 2, 5 or 10
**play silk**, and the payout is capped at 50.

- **Play silk only**: silk on this device that can never be recorded on NEAR. Nothing is written on chain, and the
  verified log never sees dice silk.
- **Daily limits (UTC)**: net win 40 silk, net loss 60, 200 rolls, 1.5 s between rolls.
- **Allowance**: a one-time play allowance of 20 play silk.
- **First open**: a modal with the legal frame (no real value; cannot be bought, cashed out or used for the
  Gate-Loom; 18+), shown once.
- **Checkable rolls**: `roll = 1 + floor(100 · seededRandom('dice:' + sha256(id|n)))`. Verify recomputes it.
- **Tests**: over 200,000 seeded rolls each bet wins within ±0.5 % of N and returns 96 % ± 1 %
  (`game/tests/market/dice.test.mjs`).

