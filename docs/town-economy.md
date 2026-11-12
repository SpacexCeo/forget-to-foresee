# Town economy (ftf-town)

The hill town's economy on NEAR testnet: P0 of the owner's spec (`docs/plans/city-economy/FTF-City-Economy.md`),
changed by the owner's decision of 12.11 to a single currency. **Silk is the town's one in-game currency.** It is a
testnet game resource with no value outside the game: never sold for NEAR, no token, no real prize. Tournament entry
is paid in silk and so are its payouts. The spec's wool layer and wool/silk pool are dropped. The 20 traders follow
scripted rules, not an LLM. Threat model: `docs/security-town.md`.

## What is built

| Piece | Where | State |
|---|---|---|
| Contract | `contracts/town` → `ftf-town.testnet` | Built, 43 unit tests. **Not deployed** |
| Shared rules | `contracts/town/src/rules.rs` ↔ `game/src/game/town-rules.js`, vectors in `contracts/town/tests/vectors.json` (`node tools/town/vectors.mjs`) | Both sides are tested against the same file |
| Trader loop | `relayer/lib/town-traders.js` on the relayer's daemon (`relayer/market/daemon.js`) | Built and tested. Off unless `FTF_TOWN=1`; a dry run unless `FTF_TOWN_SEND=1` |
| Town Pulse | `game/public/pulse.html` (`/pulse.html`) | Reads `pulse()` from the chain. Until the deployment it says "not deployed yet". `docs/qa/town/pulse-sample.jpg` is the page rendered with **sample numbers** (a QA mock, not chain data) |
| In-game ticker | `game/src/net/market.js`, `ui/market-ticker.js`, `play/market-scene.js` ("Town market · N trades today", explorer links, sellers' chips, buyers visiting the stalls by day) | **Off by default**: only with `?town=1` until ftf-town is live |
| Model | `tools/town/sim.mjs` (the traders' real policy and the contract's integer rules, day by day) | Numbers below |
| Deploy | `contracts/scripts/town-deploy.sh` | For the lead, after the owner's yes |

## Wallets

Every NPC signs from its own testnet account under the town contract (owner, 12.11), so the activity is many wallets,
not one address:

| Wallets | Accounts | Key may call |
|---|---|---|
| 20 traders | `trader-01` … `trader-20.ftf-town.testnet`: the 13 townsfolk, then the 7 clan traders (order of `relayer/market/catalog.js` `TRADERS`) | `trade` |
| 6 clans | `clan-salt`, `clan-ash`, `clan-moss`, `clan-amber`, `clan-frost`, `clan-iris.ftf-town.testnet` | `trade`, `stake`, `claim`, `begin_unbond`, `finish_unbond`, `enter_tournament` |

- **Keys** are made on the relayer's server (`node relayer/scripts/market-keys.mjs`). Only the public keys leave it.
- **Budget per wallet**: the key's allowance (`ALLOWANCE`, default 2 NEAR) and the daemon's daily cap
  (`FTF_WALLET_DAY_NEAR`, default 0.5 NEAR, counted at `FTF_TX_NEAR` = 0.0003 per transaction). A capped wallet sits
  out until the next UTC day, and `/api/market/stats` lists it in `budget_capped`.
- **One kill switch**: `FTF_TOWN_KILL=1`, or a file `relayer/data/KILL`, stops every wallet on the next tick. The
  contract's `set_paused` stops the town itself.
- **Clan wallets** (`relayer/lib/clan-actions.js`, every `FTF_CLAN_MINUTES`, default 120) take one action per round
  from their own account: claim a ripe reward, enter the open season's tournament, or pledge up to 30 % × risk of
  their silk to their works (Salt → Caravan Guild, Frost → Shell Observatory, Iris and Moss → Archive, Ash and Amber
  → Loom House). The clan's strategy (below) sets the risk; the rules make the move. Function-call keys cannot
  attach NEAR, so the contract pays a deed's storage when no deposit comes with the pledge.
- **Town Pulse** lists all 26 wallets with explorer links: silk, earned, spent, pledged (the contract keeps
  `earned`/`spent` per account).

## Contract surface

All amounts are in micro-units (1 silk = 1,000,000).

| Method | Caller | What it does |
|---|---|---|
| `new(owner_id, coordinators, params?)` | deploy | Bounded parameters (`Params::valid`) |
| `genesis(traders, silk_each)` | owner, once | Registers the traders and gives each its starting silk (1,000) |
| `trade(counterparty, silk, reference)` | a trader's trade-only key | Moves silk from the caller to the counterparty and sends 0.12 % to the treasury. Minimum 0.5 silk, no self trades, both sides registered |
| `stake(asset, amount, tier)` | account; attach 0.01 NEAR or nothing (the town pays the storage) | Pledges silk to one of 4 works (loom, caravan, archive, observatory) for a tier: flex, 5, 10 or 20 days, weight ×1.00/1.15/1.30/1.50. Burns the 0.5-silk deed fee and mints a deed (NEP-171) |
| `claim(deed)` | deed owner | Pays the pending reward |
| `begin_unbond(deed)` → `finish_unbond(deed)` | deed owner | After the lock, a 2-day cooldown without rewards, then principal + pending come back. The deed is burned and its deposit refunded |
| `exit_early(deed)` | deed owner | Takes 10 % of principal: half burned, half to the works' other stakers. Blocked for a day after the deed changes hands |
| `sweep_fees()` | anyone, once an epoch | Sends 12 % of the treasury to the station bucket (P2). Splits the rest: 65 % stake pot, 10 % tournament purse, 10 % Shell Reserve, 15 % burned |
| `distribute()` | anyone, once an epoch | Splits the stake pot over the works with earning weight (base shares 35/25/25/15, renormalised), plus each works' own stream (the Observatory's share of entries). Each works is capped at 0.15 % of its weight a day (owner-tunable); the excess goes to the purse |
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
| 50 | 22,010 (22,003) | 46 silk | 7 silk | 0.15 %/day (the ceiling binds) | 6,100 | 212 | 2,424 | 991 |
| 200 | 22,032 (22,006) | 46 silk | 10 silk | 0.15 %/day (the ceiling binds) | 10,400 | 688 | 7,682 | 3,263 |
| 1,000 | 22,151 (22,020) | 46 silk | 17 silk | 0.14 %/day | 27,500 | 2,589 | 15,978 | 15,503 |

How to read it:

- The ~22,000 transactions a day come from the traders' genuine `trade` calls. Entries, pledges, claims and the
  daily sweep/distribute add a few dozen.
- The mean trade is 1.75 silk. Trader balances stay between 560 and 1,560. The fees take ~46 silk a day out of
  their 20,000, which `credit_silk` wages can replace.
- **The rate ceiling is owner-tunable.** The default `rate_ceiling_bps` is 15 (0.15 % of pledged weight a day,
  ≈ 55 % annualised-equivalent), set by the owner on 12.11; change it with `set_params`. In silk the pledged total is
  small, so the fee-funded rate reaches the ceiling, and the excess goes to the tournament purse.

## Inventories, prices and closed stalls (roadmap items 1, 2, 3 part, 6)

All the price rules live in one readable file, `relayer/market/prices.js`:

- **Inventory.** Each trader keeps a shelf of the goods it makes: it starts with 120 units of each, makes 80 an hour,
  and holds at most 240. Every sale takes units off the shelf, and a good with an empty shelf cannot be bought.
- **Price** = base × scarcity × demand, kept between half and twice the base. Scarcity is (120 / stock)^0.4, and
  demand compares the units bought lately (a moving average with a 45-minute half-life) with the usual pace. Buy a
  stall empty and its goods get dearer; flood the market and they get cheaper.
- **The trader's reason** travels with each trade, for example "dear: only 3 salt left, demand rose" or "cheap: 240
  river stones on the shelf, few buyers". It appears in `/api/market/stats`, as the in-game ticker's tooltip, and in
  the Pulse "Why that price" column.
- **Bankruptcy.** A trader under 40 silk closes its stall: it stops buying and making goods and only sells off its
  shelf. It reopens above 120 silk.
- **Investing in a stall** (item 3): `invest_stall(trader, silk)` on the contract. Any registered player pledges silk
  into a trader's stall. The silk becomes the trader's working capital, so a closed stall reopens once its purse is
  back above the line; the relayer reads the new balance at its next sync. From then on the investor earns half the
  fee (`stall_fee_bps` 5,000, owner-tunable) of every sale that stall makes, shared by invested silk, and collects
  it with `claim_stall(trader)`. It is a pledge, not a loan: the silk does not come back, only the fee share does.
  Views: `stall_of`, `stall_position`.
- In the model, stock-outs and closed stalls skip about 9 % of attempts, so the daemon aims for 24,000 attempts a day
  to land ~22,000 trades (30-day run, 200 players: 21,800 trades a day, mean 2.3 silk).
- Inventories and prices live in the relayer's state, not on chain yet. The chain records every trade's silk and
  goods (`reference`). On-chain items are roadmap item 4 (NEP-245).

## Settling a season (coordinator, dry run)

`node tools/town/settle.mjs --season <id> --results results.json` reads the season and the purse from the contract.
`results.json` is the season's results, best first, or with scores. The tool plans the payouts with `planPayouts`
(`town-rules.js`, tested):

- 30 % of the pot is split equally among all entrants.
- 70 % goes over the top 60 % with weight k^-0.6.
- Each account gets at most 4 % of the pot, with one pass that redistributes the capped excess.

It prints the payout-list hash and the `settle_season` batches (the last one closes the season) for the lead to send.
It never signs. With few entrants the 4 % cap leaves most of the pot in the purse, and that silk carries over to the
next season.

## Clan strategies (LLM layer with a scripted fallback)

`relayer/lib/clan-strategy.js`, owner's request. Once an hour (`FTF_STRATEGY_MINUTES`, default 60; `FTF_STRATEGY=0`
turns it off), each of the 7 clan agents sends its own state to a model on NEAR AI Cloud through the relayer's TEE
path (`lib/tee.js`). The state is its silk, its rank among the traders, its goods' prices and the last trades. The
model answers with three bounded numbers:

- `risk` 0.5–1.5, which scales how much the clan buys per trade;
- `buy`: staples, dear goods or balanced;
- `favour`: a stall to buy from more often.

The rules engine (`TOWN_POLICY`) still makes every move. The parameters only reweight its normal choice, so trades
stay ordinary `trade` calls.

- **Fallback**: with no key, a 402 (the account has no credits today), a timeout or unparseable JSON, the clan uses
  its scripted strategy: a richer clan buys bolder, a poorer one buys staples.
- **Labels, per decision**: "LLM-chosen strategy (model via NEAR AI Cloud), moves by the rules engine" or "Scripted
  strategy (rules engine)", plus the reason for the fallback.
- **Audit**: every decision goes to `relayer/data/clan-decisions/market-<day>.jsonl`. The record holds the state,
  the prompt hash, the model, the chat id, the exact response, the request/response hashes and the TEE signature
  check. `/api/market/stats` → `strategy` gives the latest decision per clan and today's LLM vs scripted counts, and
  the Town Pulse page shows them.
- **Cost**: 7 calls an hour, about 170 short calls a day, inside the TEE path's daily cap (`FTF_TEE_DAILY_CAP`).

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
