# Town economy (ftf-town)

The hill town's economy on NEAR testnet, as built in P0 of the owner's spec
(`docs/plans/city-economy/FTF-City-Economy.md`; that file has the design, model and simulation). **Wool and silk are
testnet game resources with no value outside the game.** Wool is never sold for NEAR, and there is no token and no
real prize. The 20 traders are scripted rules, not an LLM. Threat model: `docs/security-town.md`.

## What is built

| Piece | Where | State |
|---|---|---|
| Contract | `contracts/town` → `ftf-town.testnet` | Built, 36 unit tests. **Not deployed.** |
| Shared rules | `contracts/town/src/rules.rs` ↔ `game/src/game/town-rules.js`, vectors in `contracts/town/tests/vectors.json` (`node tools/town/vectors.mjs`) | Both sides tested against the same file |
| Trader loop | `relayer/lib/town-traders.js` on the relayer's market daemon (`relayer/market/daemon.js`) | Built and tested. Off unless `FTF_TOWN=1`, and a dry run unless `FTF_TOWN_SEND=1` |
| Town Pulse | `game/public/pulse.html` (served as `/pulse.html`) | Reads `pulse()` from the chain. Until deployment it says "not deployed yet". `docs/qa/town/pulse-sample.jpg` is the page rendered with **sample numbers** (a QA mock, not chain data) |
| Deploy | `contracts/scripts/town-deploy.sh` | For the lead, after the owner's yes |

## Contract surface

All amounts are micro-units: 1 wool = 1 silk = 1,000,000.

| Method | Caller | What it does |
|---|---|---|
| `new(owner_id, coordinators, params?)` | deploy | Bounded parameters (`rules.rs` `Params::valid`) |
| `genesis(traders, wool_each, silk_each, pool_wool, pool_silk)` | owner, once | Registers the traders, credits their wool/silk and seeds the protocol-owned pool (10,000 wool / 20,000 silk) |
| `trade(counterparty, silk, reference)` | a trader's trade-only key | Moves silk from the caller to the counterparty; 0.12 % goes to the treasury. Minimum 0.5 silk, no self trades, both sides registered |
| `swap_wool_for_silk` / `swap_silk_for_wool(amount, min_out)` | any registered account | Constant product, 0.30 % fee (a fifth to the stake pot), `min_out`, a daily cap of 5 % of the input reserve per account |
| `add_liquidity` / `remove_liquidity` | any registered account | Proportional shares kept as an internal balance; the pool can never be emptied |
| `stake(asset, amount, tier)` | account, attach 0.01 NEAR | Pledges wool to one of 4 works (loom, caravan, archive, observatory) for a tier (flex, 5, 10, 20 days; weight ×1.00/1.15/1.30/1.50). Burns the 0.25-wool deed fee and mints a deed (NEP-171) |
| `claim(deed)` | deed owner | Pays the pending reward |
| `begin_unbond(deed)` → `finish_unbond(deed)` | deed owner | After the lock, a 2-day cooldown without rewards, then principal + pending back. The deed is burned and its deposit refunded |
| `exit_early(deed)` | deed owner | Takes 10 % of principal: half burned, half to the works' other stakers. Blocked for a day after the deed changes hands |
| `sweep_fees()` | anyone, once an epoch | 12 % of treasury silk goes to the station bucket (P2). The rest buys wool in the pool (at most 1 % of the silk reserve a day): 65 % stake pot, 10 % purse, 10 % Shell Reserve, 15 % burned |
| `distribute()` | anyone, once an epoch | Splits the stake pot over works with earning weight (base shares 35/25/25/15, renormalised), each capped at 0.4 % of its weight a day; the excess goes to the purse |
| `credit_wool(account, amount, reference)` | coordinator | Only inside a daily ceiling (2,000 wool) |
| `set_season(season_id, schedule_root)` | coordinator | New deeds carry this sealed season; a season's root never changes |
| `set_params`, `set_paused`, `set_coordinators` | owner | Bounded, with an event and a parameter hash |
| `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_tokens(_for_owner)`, `nft_metadata` | standard | Deeds; approvals rejected |
| Views | | `pulse`, `balance_of`, `balances_of`, `pool_state`, `quote_swap`, `stake_pools`, `get_deed` (owner, position, claimable), `params` |

Events: NEP-297 `ftf_town` (`trade`, `swap`, `liquidity_add/remove`, `stake`, `claim`, `unbond_begin`,
`unbond_finish`, `early_exit`, `deed_transfer`, `sweep`, `distribute`, `wool_credit`, `silk_credit`, `season_open`,
`params`, `pause`, `genesis`) plus the standard `nft_mint` / `nft_transfer`.

Not in P0, as the spec scopes it: the tournament purse payout and `settle_season`, Attention and descents, station
deeds (fees collect in a silk bucket), the Charter, catalyst shards and the deed escrow (`expected_state_hash`).

## The traders

20 accounts: 13 townsfolk and 7 clan agents (the six clans and the tinker), `tf-<key>.ftf-coordinator.testnet`. Each
signs its own trades with a key that can only call `trade` on `ftf-town.testnet`.

- **Schedule** (`relayer/market/schedule.js`): a day curve on the town's clock, quiet at night (0.33×), busy in the
  afternoon (1.86×), normalised to 22,000 trades a day: 1,100 per trader, the spec's margin over 20,000.
- **Behaviour** (`TOWN_POLICY`): a buyer picks a good made by another trader (staples often, dear goods rarely) at a
  mean-reverting price. Quiet stalls draw buyers, and richer buyers buy more at once, so silk does not pile up in one
  purse. A simulated 10 days: mean trade 1.8 silk, every balance between ~640 and ~1,570 silk (start 1,000). The fees
  leave ~40 silk a day, which `credit_silk` wages can replace (a game-design faucet, not organic demand).
- **Operation**: one RPC call per trade (cached nonce and block hash), a global send cap, pause, a restart-safe
  state file, a JSONL log per day, low-NEAR back-off, and `/api/market/stats` (today's count, last trades with hashes,
  `dry_run`).

## Cost

Measured host gas per `trade` is 0.61 Tgas (unit VM). Adding the protocol fees (0.31 + 0.89 Tgas) and the contract
load (~0.45 Tgas for the 417 KB unoptimised wasm) gives **≈ 2.5–2.7 Tgas per trade [VERIFY on testnet]**. That is
≈ 0.00026 NEAR at the current gas price of 1e8, so 22,000 trades cost ≈ 5.7 NEAR a day across 20 accounts (~0.3 each).
Deed storage: the 0.01 NEAR deposit is refunded when the deed is burned.

## Running it (owner-gated)

1. On the server: `node relayer/scripts/market-keys.mjs > market-public.json` (public keys only).
2. Lead: `TRADER_KEYS=market-public.json bash contracts/scripts/town-deploy.sh`.
3. Server: `FTF_TOWN=1` in `relayer/.env` and restart: a **dry run** (the stats show `dry_run: true`, nothing is
   signed).
4. After the owner's yes: `FTF_TOWN_SEND=1` and restart.
5. Daily: `MODE=day bash contracts/scripts/town-deploy.sh` (sweep + distribute) and
   `MODE=topup bash contracts/scripts/town-deploy.sh` (NEAR for the traders).

Words used in the game and on the Pulse page: pledge, reward share, rate (variable, can be zero), town works. Never
"invest", "APY", "profit", "dividend" or "returns".
