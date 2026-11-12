# Town economy (ftf-town)

The hill town's economy on NEAR testnet: P0 of the owner's spec (`docs/plans/city-economy/FTF-City-Economy.md`),
changed by the owner's decision of 12.11 to a single currency. **Silk is the town's one in-game currency.** It is a
testnet game resource with no value outside the game: never sold for NEAR, no token, no real prize. Tournament entry
is paid in silk and so are its payouts. The spec's wool layer and wool/silk pool are dropped. The 20 traders follow
scripted rules, not an LLM. Threat model: `docs/security-town.md`.

## What is built

| Piece | Where | State |
|---|---|---|
| Contract | `contracts/town` → `ftf-town.testnet` | Built, 39 unit tests. **Not deployed** |
| Shared rules | `contracts/town/src/rules.rs` ↔ `game/src/game/town-rules.js`, vectors in `contracts/town/tests/vectors.json` (`node tools/town/vectors.mjs`) | Both sides are tested against the same file |
| Trader loop | `relayer/lib/town-traders.js` on the relayer's daemon (`relayer/market/daemon.js`) | Built and tested. Off unless `FTF_TOWN=1`; a dry run unless `FTF_TOWN_SEND=1` |
| Town Pulse | `game/public/pulse.html` (`/pulse.html`) | Reads `pulse()` from the chain. Until the deployment it says "not deployed yet". `docs/qa/town/pulse-sample.jpg` is the page rendered with **sample numbers** (a QA mock, not chain data) |
| In-game ticker | `game/src/net/market.js`, `ui/market-ticker.js`, `play/market-scene.js` ("Town market · N trades today", explorer links, sellers' chips, buyers visiting the stalls by day) | **Off by default**: only with `?town=1` until ftf-town is live |
| Model | `tools/town/sim.mjs` (the traders' real policy and the contract's integer rules, day by day) | Numbers below |
| Deploy | `contracts/scripts/town-deploy.sh` | For the lead, after the owner's yes |

## Contract surface

All amounts are in micro-units (1 silk = 1,000,000).

| Method | Caller | What it does |
|---|---|---|
| `new(owner_id, coordinators, params?)` | deploy | Bounded parameters (`Params::valid`) |
| `genesis(traders, silk_each)` | owner, once | Registers the traders and gives each its starting silk (1,000) |
| `trade(counterparty, silk, reference)` | a trader's trade-only key | Moves silk from the caller to the counterparty and sends 0.12 % to the treasury. Minimum 0.5 silk, no self trades, both sides registered |
| `stake(asset, amount, tier)` | account, attach 0.01 NEAR | Pledges silk to one of 4 works (loom, caravan, archive, observatory) for a tier: flex, 5, 10 or 20 days, weight ×1.00/1.15/1.30/1.50. Burns the 0.5-silk deed fee and mints a deed (NEP-171) |
| `claim(deed)` | deed owner | Pays the pending reward |
| `begin_unbond(deed)` → `finish_unbond(deed)` | deed owner | After the lock, a 2-day cooldown without rewards, then principal + pending come back. The deed is burned and its deposit refunded |
| `exit_early(deed)` | deed owner | Takes 10 % of principal: half burned, half to the works' other stakers. Blocked for a day after the deed changes hands |
| `sweep_fees()` | anyone, once an epoch | Sends 12 % of the treasury to the station bucket (P2). Splits the rest: 65 % stake pot, 10 % tournament purse, 10 % Shell Reserve, 15 % burned |
| `distribute()` | anyone, once an epoch | Splits the stake pot over the works with earning weight (base shares 35/25/25/15, renormalised), plus each works' own stream (the Observatory's share of entries). Each works is capped at 0.4 % of its weight a day; the excess goes to the purse |
| `open_season(season_id, schedule_root)` | coordinator | Opens the sealed season that new deeds and entries belong to. Its root never changes. Records the silk burned in the previous season |
| `enter_tournament(season_id)` | account | Costs 40 silk (entry credit is used first): 20 % burned, 15 % to the Shell Observatory's stakers, 65 % to the purse. One entry per account and season |
| `settle_season(season_id, payouts, payouts_hash, last)` | coordinator | Pays ranks in silk, in batches. The pot is the purse plus a mint bounded by min(12,000, 1,000 + 0.8 × last season's burn, 24 × entrants). One payout is at most 4 % of the pot. `last` closes the season. The coordinator attests the ranks, and the hash of the full list is logged |
| `credit_silk(account, amount, reference)` / `credit_entry(account, amount)` | coordinator | Wages and corrections, or entry credit, inside a daily ceiling (4,000 silk) |
| `set_params`, `set_paused`, `set_coordinators` | owner | Bounded, with an event and a parameter hash |
| `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_tokens(_for_owner)`, `nft_metadata` | standard | Deeds; approvals are rejected |
| Views | | `pulse`, `balance_of`, `balances_of`, `stake_pools`, `get_deed` (owner, position, claimable), `season`, `has_entered`, `params` |

Events are NEP-297 `ftf_town`, plus the standard `nft_mint` / `nft_transfer`. Not built (P1/P2): descents, station
deeds (their fees collect in a silk bucket), the Charter, catalyst shards and the deed escrow.

## Model (`node tools/town/sim.mjs 30 <players>`)

The model runs 30 days: the traders' real policy, the contract's integer rules and 5-day seasons. The 7 clan agents
pledge 600 silk each, players pledge 30 % of what they win, and 7.5 % of joined players enter a day.

| Players | Tx/day (mean, min) | Fees/day | To stakers/day | Staker rate after day 10 | Silk pledged at day 30 | Purse paid/day | Silk minted for purses (30 d) | Silk burned (30 d) |
|---|---|---|---|---|---|---|---|---|
| 50 | 22,010 (22,003) | 46 silk | 19 silk | **0.40 %/day (the ceiling binds)** | 6,000 | 200 | 2,424 | 991 |
| 200 | 22,032 (22,006) | 46 silk | 23 silk | 0.36 %/day | 10,300 | 674 | 7,682 | 3,263 |
| 1,000 | 22,151 (22,020) | 46 silk | 28 silk | 0.23 %/day | 27,400 | 2,578 | 15,978 | 15,503 |

How to read it:

- The ~22,000 transactions a day come from the traders' genuine `trade` calls. Entries, pledges, claims and the
  daily sweep/distribute add a few dozen.
- The mean trade is 1.75 silk. Trader balances stay between 560 and 1,560. The fees take ~46 silk a day out of
  their 20,000, which `credit_silk` wages can replace.
- In silk the pledged total is smaller than in the spec's wool model, so the fee-funded rate is higher and the
  0.4 %/day ceiling binds in a small town. The excess goes to the tournament purse.
- To bring the rate near the spec's ~0.1 %/day: lower `rate_ceiling_bps` (40 → 15) or the stakers' share of the
  sweep. That is a parameter choice for the owner (`set_params`).

## Cost

Measured host gas per `trade` is 0.61 Tgas (unit VM). Adding the protocol fees (0.31 + 0.89 Tgas) and the contract
load gives **≈ 2.5–2.7 Tgas per trade [VERIFY on testnet]**. That is ≈ 0.00026 NEAR at the current gas price of 1e8,
or ≈ 5.7 NEAR a day for 22,000 trades. `node tools/town/sandbox-gas.mjs <near-sandbox> <town.wasm>` measures it on
a local node.

## Running it (owner-gated)

1. On the server: `node relayer/scripts/market-keys.mjs > market-public.json` (it prints public keys only).
2. Lead: `TRADER_KEYS=market-public.json bash contracts/scripts/town-deploy.sh`.
3. On the server: add `FTF_TOWN=1` to `relayer/.env` and restart. This is a **dry run**: nothing is signed and the
   stats show `dry_run: true`.
4. After the owner's yes: add `FTF_TOWN_SEND=1` and restart.
5. Daily: `MODE=day bash contracts/scripts/town-deploy.sh` (sweep + distribute) and `MODE=topup …` (NEAR for the
   traders).

Words used in the game and on the Pulse page: pledge, reward share, rate (variable, can be zero), town works. Never
"invest", "APY", "profit", "dividend" or "returns".
