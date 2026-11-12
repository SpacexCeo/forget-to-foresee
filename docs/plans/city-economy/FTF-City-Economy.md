# FTF City Economy: wool, the town works, and a fee-funded staking layer

> **Status (lead, 12 Nov):** the owner's current economy spec. It supersedes the Move 2 arena plan in `docs/plans/npc-economy-spec.md` (kept for reference). Build P0 of section 9 first.

Forget to Foresee (repo `SpacexCeo/forget-to-foresee`, live https://spacexceo.github.io/forget-to-foresee/). Prepared Thursday 12 Nov 2026, Europe/Kyiv, against `main` at `58c69bd` (12 Nov 14:26 UTC, "townsfolk market at ~20k testnet transactions a day"). English only, as required for FTF deliverables. Everything here is **NEAR testnet, in-game resources with no real-world value**. Nothing was pushed, deployed, signed or posted to produce this document: the repo was cloned read-only, the numbers come from the Python model in `/workspace/ftf-economy/` (reproduction commands in the appendix).

Lore canon used throughout: Iris is a doctor-linguist from another planet, year 2048. She is not an "AI clan agent". The town is quiet, misty, mysterious: copy in the game should sound like a hill town in fog, not like a trading terminal.

---

## 0. Summary

**The idea.** Players earn **wool** (a testnet resource) in the weekly tournament and by surviving trips outside the walls. They can **pledge** it to four town works (Loom House, Caravan Guild, Archive & Translation Guild, Shell Observatory). A pledge is a **deed NFT (NEP-171)** carrying principal, lock tier and the sealed-season it was opened in. The works pay a **variable share of the town's own fees**: the 0.12% fee on every market trade made by the 20 townsfolk/clan trader accounts and by players, converted to wool through a small **wool/silk AMM**. No wool is minted to pay stakers. Wool is minted in one place only: the tournament purse, capped by participation and by what the town burned last season.

**Why it stands out in Games and NFTs.** The top Games rivals show *an NPC economy that runs* (Hearthmarket ~34.8k tx, TokenGo ~21.9k). FTF adds what none of them show in the scorecard: a position NFT whose provenance is bound to a sealed season, a published fee-flow model and a simulation the judge can rerun, a risk-to-earn loop tied to the engine's World Tension, and an honest "what is scripted" label. The staking layer itself adds only ~230 tx/day (1%); **the ~20,000 tx/day come from the trader accounts' genuine market trades** (the owner's decision of 12 Nov), and the staking layer is what gives those trades a visible purpose: their fees are the reward pool.

**Key numbers (base case: 200 humans, 20 trader accounts, 30 days, 8 seeds):**

| Metric | Result |
|---|---|
| Real testnet tx per day | **22,978 mean, 20,831 minimum** (22,673 market trades; ~226 staking/descent/tournament tx) |
| Fee flow that funds rewards | ~48 silk/day fees → ~25 wool/day bought through the AMM → ~15 wool/day to stakers (TVL ~13,000 wool at day 29) |
| Staker reward rate (variable, derived) | **39% annualised-equivalent mean, p10-p90 32%-47%** for the flexible tier; 45% / 50% / 58% for 5 / 10 / 20-day locks. Per-pledge outcome: median 59%, p5 −27% (early exits), p95 92%. It scales **linearly** with fee × volume and **inversely** with TVL |
| TVL | 7,500 → 13,000 wool staked (39% of supply); AMM pool ~21,000 wool-equivalent |
| Wool price (silk per wool) | stays within ±6% CV of the fair value; **−66% in a whale dump, only −25% with a 5%-of-pool daily swap cap** |
| Supply | 24.6k at day 0 → 33.3k at day 29; **+0.19%/day after day 20**; one-time entry credits (7.7k) are most of the early growth |
| Inequality | Gini of human wool wealth 0.35 (0.21 with 50 players, 0.42 with 1000) |
| Whale caps | 3 whales with 8,000 wool: top-1% stake share **33% with caps vs 75% without**; reward rate for everyone else 42% vs 20% |
| Wash trading | negative expected value at every attacker stake share (they pay the fee, recover at most 57% of it) |
| Sybil farming | idle bots break even (≈0 to +35 wool/season for 100 accounts); **competent bots earn ~+15 wool per account per season** and caps do not stop that: it is a transfer from honest players, not new emission. Mitigations in §2.11 |

**What is honestly not true yet.** In `main` today there is **no wool, no staking, no AMM, no town market contract, no NEP-141 token, and the tournament is a labelled local simulation with "no money, no prizes"**. The townsfolk market is a decision (12 Nov) with a worker assigned, not code. Everything below is a proposal; §10 cuts it to what is buildable before the 13 Nov 16:00 Kyiv feature freeze.

---

## 1. What exists today (verified in the clone at `58c69bd`)

| Item | Status | Where, exactly |
|---|---|---|
| **Wool** as a resource | **Absent.** The only hits are costume text ("wool cloak", "wool socks") in `art/` and `docs/art/*`. Proposed here as a new resource. | `rg -i wool` over the repo |
| **Silk** | **Exists, in-game only.** The season engine's closed currency: 60 per clan at start, +3 per tick, spent on anchors (10), Guest questions (5), mend/mediate, words, loans, escrow, shard bids. A 12 Nov decision gives the town market its own silk balances; per `docs/agent-market-plan.md` the engine's `S.silk` must never be debited by market code. | `game/src/game/engine.js`; `docs/math/economy-report.md` (Monte Carlo over 170,000 seasons); `docs/agent-market-plan.md` §0, §2 |
| **Tournament** | **Exists as a labelled simulation.** Weekly schedule (enrol Mon → Sat 18:00, results 20:00 UTC), synthetic enrolment kept per device in localStorage, sealed results, "No money, no prizes, no entry fee; the trophy is a badge". No chain, no wool. | `game/src/ui/tournament.js`, `game/src/ui/tournament-card.js`, `game/src/ui/tourney-warn.js` |
| **Town** | **Exists (client).** Hill town below the archipelago, 13 named townsfolk with fixed posts, shops (`town_shop_exchange`, `town_shop_scribe`, `town_shop_inn`), the Tournament altar, a three-step town quest with a 5-silk practice purse labelled "town coins, nothing on a chain". `SHOP_VIEWS` only lists `shards` and `dictionary`. | `docs/town.md`, `game/src/scenes/town-data.js`, `town-quest.js`, `town-layout.js:176`, `docs/townsfolk.md` |
| **Trading NPC agents** | **Decided, not built.** `docs/decisions.md` (12 Nov, owner): 20 trader accounts (13 townsfolk + 7 clan agents), each signing its own trades with a function-call key kept only on the relayer, ~1,000 trades/trader/day, one trade = one function call on "a small market contract (silk moves between two balances, an event log; no per-trade storage)", gas ≤ 3 Tgas ≈ 0.0003 NEAR, ~6 NEAR/day. No market contract in `contracts/`. | `docs/decisions.md` lines 350-351; `relayer/lib/near-tx.js`; `relayer/api/agent/{decide,say}.js` |
| Existing clan AIs | Scripted heuristics (`PERS`), not an LLM, per README/decisions; the TEE/LLM path is in `docs/tee.md` and `contracts/agent-ledger` (`record_tee_decision`). Clans: Iris, Salt, Ash, Moss, Amber, Frost (`NAMES` in `engine.js:42`). | `game/src/game/engine.js`, `contracts/agent-ledger/src/lib.rs` |
| **Memory shards** | **Live on testnet.** NEP-171 `ftf-shards.testnet`: core + metadata + enumeration, **no NEP-178 approvals** (shards move only by owner `nft_transfer`; `nft_transfer_call` exists via the standard macro). Token `<seasonId>-<shardId>`; `extra` carries kind, weight, auction result, `unlocked_leaf`, `schedule_root`. Minted by coordinator `ftf-coordinator.testnet`; 3 tokens minted for the judge replay. | `contracts/memory-shard/src/lib.rs` (`mint_shard`, `get_shard`, `shards_of_season`, `shard_svg`), `docs/shard-nft.md`, `contracts/deployments/testnet-memory-shard-793f6c05e89839f2.json` |
| **Season seals** | **Live on testnet.** `ftf-seasons.testnet` (`season-commit`): `commit_season(season_id, schedule_root, schema_version, leaf_count)`, `reveal_leaf`, `commit_ash_key/reveal_ash_key`, `check_leaf`, `get_season`, `get_revealed_leaf(s)`. Season `793f6c05e89839f2`: 15 leaves, commit tx `6TtWeZ3W…`, 15 reveal txs. Explorer links in `docs/near.md`. | `contracts/season-commit/src/lib.rs` |
| NEP-171 others | `contracts/agent-card` (written, **not deployed**), `character-nft`, `skin-nft`, `loot-chest` (`commit_deck`, `fix_seed`, `open_chest`), `guests` (`create_guest`, daily cap, 0.05 NEAR fund per guest, `guests.ftf-coordinator.testnet`). | `contracts/*` |
| **NEP-141** | **Absent.** `ft_transfer` appears only in `token-account` and docs about other projects. | `rg ft_transfer` |
| Staking / AMM / pools / treasury | **Absent.** "stake" in the repo means the engine's anchor stakes (`place_anchor`) and art scripts. | `game/src/game/engine.js` |
| Shared rules + agent API | **Exists.** One command bus (`game/src/net/room.js`), catalog `1.0.0`, `engine-host.js`, HTTP `server/` on localhost, OpenAPI; `exchange.js` (practice-silk Foresight Exchange) is an existing "kind: exchange" module with sealed snapshot and its own rules file. | `docs/api/README.md`, `docs/agent-market-plan.md` §2, `game/src/game/exchange.js` |
| Outside-the-walls risk loop | **Exists (built 12 Nov).** Six mob packs on the hillside, telegraphed attacks, Iris health bar and regen, `ftf:mob-killed {type,pos,elite}`, chests drop on kill. This is the cheapest hook for "extract alive" before the freeze (VERIFY death/respawn handling in the client before wiring). | `game/src/play/mobs.js`, `docs/decisions.md` (12.11 monsters entry) |

Accounts on testnet today: `ftf-seasons.testnet`, `ftf-shards.testnet`, owner/coordinator `ftf-coordinator.testnet`, guest fund `guests.ftf-coordinator.testnet` (4.95 NEAR at 0.05 NEAR per guest ≈ 99 guests; must be topped up before any audience launch).

One inconsistency to be aware of: the tournament card says "no prizes". The moment wool is paid for tournament rank, that label and `docs/decisions.md` must be updated ("wool, a testnet game resource, no money").

---

## 2. Design

### 2.1 Three separated layers (borrowed from Cambria, adapted)

Cambria keeps fuel, earnings and ownership apart; mixing them is what makes a game feel like a casino. FTF does the same, with no money anywhere:

| Layer | FTF name | Role | Behaviour |
|---|---|---|---|
| Fuel | **Attention** | Burns while Iris is outside the walls or in a Shell ("memory and attention melt while you look into the future") | non-transferable; 10 free per day; extra bought with wool (60% burned, 40% to the Shell Reserve) |
| Earnings | **Silk** (town ledger) | What townsfolk and clans trade in; price unit of the market | faucet = trader wages; sink = stall upkeep and fees; separate from engine `S.silk` |
| Ownership | **Wool** | Tournament resource; what is pledged to the works; what deeds hold | minted only for the tournament purse; non-transferable between players except as a whole deed; burned by fees and risk |

### 2.2 Wool sources and sinks

**Sources (the only ways wool enters):**
1. **Tournament purse** per season: `M = min(E0·d^s, F + μ·Burn_{s-1}, m_e·n_entrants)`, plus 65% of entry fees, half of the tithe's prize share, 40% of Charter sales and unspent Reserve at season end. A season is 5 in-game days in the model.
2. **Shell Reserve** (pays extractors, §2.7): funded 25% from the season mint, 50% of the tithe's prize share, 40% of Attention sales and 50% of lost cargo. It cannot pay more than it holds, so extraction can never inflate.
3. **Entry credit** for each new guest (40 wool, spendable only on tournament entry, not sellable, bound to the guest account created by `guests`; limited by the guests contract's `daily_cap`).
4. **Genesis** (day 0 only): 700 wool per trader account and the 10,000/20,000 wool/silk AMM pool seed, all public in the first transaction.

**Sinks (burned):** tithe burn 15%, 20% of tournament entry fees, translation at the Archive (70% of the fee), Attention (60% of purchases), half of lost descent cargo, half of any early-exit penalty, deed fee 0.25 wool, Charter licence (60%).

Base-case 30-day totals (excluding the 24,000 genesis): minted 4,123 (tournament) + 7,713 (entry credits used); burned 2,560 (entry 1,798, deed fees 164, attention 194, charter 114, tithe 111, translation 108, cargo 65, penalties 6). Per season, the mint rule gives 257, 606, 914, 1,009, 701, 638 against burns of 132, 517, 641, 519, 405, 345: the purse follows participation and tracks what the town destroyed.

### 2.3 The four town works and the pledge

| Asset (works) | Fiction | Where it lives | Extra fee stream |
|---|---|---|---|
| **Loom House** | The looms spin wool into town cloth for the market | `town_shop_*` piece of the square (art TBD), a new "works" panel at the Exchange counter first | base share 35% of staker pot |
| **Caravan Guild** | Carts between the islands and the lower gate; trades pass through its stalls | courier/baker posts | 25% |
| **Archive & Translation Guild** | Iris's own trade: translating the Guests' signs and shard inscriptions. Players pay wool to have a shard translated into a Lexicon entry | `town_shop_scribe` (the scribe, M 32, "Scribe of Signs") | 25% + 30% of translation fees |
| **Shell Observatory** | Watches the Shells and the World Tension from the shrine | `shrinekeeper` beside the altar | 15% + 15% of tournament entry fees |

A **pledge** (the in-game word; "stake" in this document) locks wool in one works for a tier: **flex (0 days, 2-day unbonding), 5, 10 or 20 days**, with reward weights 1.00 / 1.15 / 1.30 / 1.50. Weight `w = principal × m_tier`. The staker pot of each works is split by weight. There is **no emission to stakers**: the pot is exactly the wool bought with fees, plus 20% of AMM swap fees, plus the Observatory/Archive streams, plus 50% of early-exit penalties.

Safeguards written into the rule, not into a promise:
- **Rate ceiling** `r_max = 0.4%/day` per unit of weight in any works (excess goes to the purse). Without it a nearly empty works would pay 5-10× the average and attract whales to it; the first simulation without the ceiling had pledge outcomes up to +950%.
- **Warm-up**: a deed's weight counts from the next epoch boundary (design requirement; the simulation credits same-day weight, a small optimism, see §5.6).
- **Display**: the UI shows "reward rate, variable: *x* wool per 100 pledged per day, last 7 days, can be zero". The annualised figure is shown only in the Economy Lab with the caveat that 30 days of data say nothing about a year.

Slashing: **no principal is slashed.** There is no validator duty that could be failed. Real risks are: (a) the variable rate can fall to near zero when trade volume drops (sell-off scenario: 24%, p10 14%); (b) early exit costs 10% of principal; (c) liquidity providers carry impermanent loss; (d) wool price against silk moves. A meaningful in-game slash, if the owner wants one, is the **Shell Observatory's "Storm" day**: on the day a sealed-season leaf marks a storm, that works pays no reward (rewards roll into the purse). It risks only the day's reward, never principal, and is verifiable against `season-commit`. Not simulated; P2.

### 2.4 Treasury and fee flow (the Cambria "Crown Treasury" idea)

```
every market trade (silk) ──fee φ_m = 0.12%──► Town Treasury (silk)
        │                                   ├─ τ_s = 12% ─► 6 station-deed holders (clan accounts)  [P2]
        │                                   └─ 88% ─ daily sweep_fees(): swap silk→wool in the AMM ─► B wool
        │                                                       ├─ 65% ─► stake pools (by works base share, rate ceiling)
        │                                                       ├─ 20% ─► 50% tournament purse / 50% Shell Reserve
        │                                                       └─ 15% ─► burned
every AMM swap, fee f = 0.30% ─ 80% stays in the pool (LPs) ─ 20% to stake pools
translation fee ─ 70% burn, 30% Archive pool          tournament entry ─ 20% burn, 15% Observatory, 65% purse
early exit ─ 10% of principal: 50% burn, 50% to remaining stakers of that works
Attention bought ─ 60% burn, 40% Shell Reserve        Charter ─ 60% burn, 40% purse
```

Because the sweep *buys* wool with silk, the trader accounts' activity creates real buy pressure for wool; the wool that stakers receive was sold into the pool by tournament winners. No new wool appears on the way.

### 2.5 Price discovery: AMM, not order book, not bonding curve

**Choice: a constant-product pool wool/silk (x·y = k), fee 0.30%, genesis liquidity 10,000 wool / 20,000 silk.**

| Option | Verdict |
|---|---|
| **Constant-product AMM** | **Chosen.** Continuous quotes with thin, bursty participants; one pool = one storage cell (flat storage, same property the owner asked of the trade call); ~6 Tgas per swap; pure integer maths with `u128`; the same function runs in JS (rules module) and Rust (vector-tested like `memory-shard`'s `vectors.json`); NPC arbitrage keeps it honest, and the model shows it does (CV 6%). Impermanent loss is a real, teachable risk for LPs. |
| Order book | Rejected for v0: needs per-order storage and active makers; 200 humans over two days would face an empty book; cancel/expire logic is a security surface; per-order storage works against the flat-storage goal. A posted-price market already exists for goods (townsfolk quote prices); the book would only add a second one for a tiny market. |
| Bonding curve | Rejected: it is an issuance mechanism, and a curve that mints wool for silk (or NEAR) invites exactly the pump pattern and the "buy to earn" framing we want to avoid. Wool is never sold for NEAR. |

Pairing wool with *shards* in a pool does not work: shards are non-fungible (a pool needs a fungible leg). Shards connect through **deeds** instead (§2.6) and through the Archive's translation sink.

### 2.6 Deed NFTs (NEP-171): what transfers, and the threat model

**One deed per pledge.** Minted by `stake`, burned by `finish_unbond`. Token id `deed-<season_id>-<n>`; `extra` (all on-chain, rendered SVG like `shard_svg`):

```json
{ "v": 1, "kind": "town_deed", "asset": "archive", "principal": "120000000000000000000000",
  "tier": 2, "opened_day": 7, "locked_until_day": 17, "season_id": "793f6c05e89839f2",
  "schedule_root": "03dbd4587b5d…", "state": "active|unbonding", "unbond_ready_day": null,
  "reward_index": "…", "pending": "…", "catalyst_shard": null }
```

`season_id` and `schedule_root` tie the deed to the sealed season, exactly as shards are tied (`ERR_SEASON_ROOT` style check: one root per season). Optional **catalyst shard** (P2): `nft_transfer_call` of one `ftf-shards` token to the town contract locks it inside the deed for +10% weight (capped, never decisive); it returns on burn.

**Transfer semantics (borrowed from Outlive's "sell the business"):** `nft_transfer` moves the **whole position**: principal, remaining lock, unbonding clock, and accrued `pending` rewards. There is no partial transfer. Rules:
1. Allowed in `active` and `unbonding`; the buyer reads `state` and `unbond_ready_day` on-chain, and escrow flows pass `expected_state_hash` so a seller cannot swap state mid-sale.
2. After a transfer the new owner cannot `exit_early` for 1 day (blocks seller→buyer→drain dances and sandwiching the penalty).
3. The receiver's per-account cap is checked at transfer (`ERR_CAP_RECEIVER`), so deeds cannot be used to bypass the whale cap.
4. Approvals (NEP-178) stay **disabled**, as in `ftf-shards`: no approval phishing. A marketplace, if any (P2), is an escrow contract using `nft_transfer_call` (the Trezo escrow idea).
5. Storage for the deed (~0.005 NEAR) is attached by the staker (the relayer for guests) and refunded on burn.

**Threat model:**

| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | Same-block stake → sweep → claim → unstake to capture a distribution | weight from next epoch; flex cooldown 2 days; deed fee; lock tiers | stake then distribute in same epoch earns 0 |
| T2 | Reward rounding drift / reward > pot | `u128` fixed point (index ×1e24), dust to treasury, invariant Σclaims ≤ Σpots | property test: conservation |
| T3 | Double withdraw / replay | deed burned in `finish_unbond`; state transition guards (`active→unbonding→burned`) | double call panics |
| T4 | Reentrancy or inconsistent state through callbacks | single contract: all state is written before any `Promise`; `nft_resolve_transfer` restores owner only, position lives under token id | `nft_transfer_call` rollback test |
| T5 | Seller front-runs a sale by calling `begin_unbond` | state is part of the transferable object and of `expected_state_hash`; post-transfer 1-day no-early-exit | escrow test |
| T6 | Whale capture / splitting into many accounts | cap per account = min(4,000, max(400, 5%·TVL)) (Charter ×1.5, supply-limited), per-works 1,500, receiver check on transfer; splitting gains nothing because reward is linear in weight | cap tests; sim §5.4 |
| T7 | Wash trading to harvest rewards | fee paid on every trade; the washer recovers at most σ_st(1−τ_s)·s = 0.57·s of it (s = share of weight) < 1 | EV test; sim §5.5 |
| T8 | AMM sandwiching / price manipulation | `min_out` on every swap; per-account swap ≤ 5% of pool per day; sweep in chunks with max 2% impact | impact tests; whale-dump sim |
| T9 | Sybil farming of tournament wool | entry credit only via `guests` (daily cap), non-sellable, expires; emission capped by participation and burn-match, so sybils redistribute, not inflate; progressive entry fee for entries funded from one source (P2); score rules must reward honest play (§12 decision 8) | sim §5.5 |
| T10 | Coordinator abuse: `credit_wool`, `settle_season`, `settle_descent` are trusted calls | on-chain per-season mint ceiling computed by the contract; per-account payout cap; every payout event-logged with `payouts_hash`; testnet key only; TEE/multisig later (§12) | over-mint panics |
| T11 | Key leakage of 20 trader keys on the relayer | function-call keys restricted to the market `trade` method with a small allowance; rotation script; no deed ownership | key scope test |
| T12 | Metadata/SVG griefing or storage drain | fixed-length SVG built from numbers, never from user strings; storage paid by staker | fuzz |
| T13 | Admin changing the rules under players | `set_params` only between seasons, bounded ranges, event logged, parameters hashed into the season record | param bounds test |

### 2.7 Shell Descent: Attention, Greed and World Tension (Cambria's risk-to-earn, adapted)

A **descent** is a trip outside the town walls (P1: the hillside packs that already exist; later: Shell interiors). Iris must **return alive through the gate / out of the Shell** to bank the cargo.

- **Attention** burns per descent: `A = 6 + 10·g` units, `g` ∈ [0,1] is **Greed**, chosen at the gate. 10 free per day (14 with a Charter); extra costs 0.5 wool per unit.
- **Cargo**: `R = 3·(1 + 1.5·g)` wool, **reserved** from the Shell Reserve when the descent begins (limited by what the Reserve holds, so no inflation).
- **Fail probability**: `p = clip(0.08 + 0.55·g·T/100)`, where **T is the engine's World Tension** (`S.H`, 0-100; tension 100 = the Shells leave). Greed is the same dial the game already has: the more you ask of the Shells while tension is high, the likelier you lose it.
- **Partial loss, never savings**: on failure the cargo is lost (50% burned, 50% back to the Reserve); **pledged wool, deeds, shards and liquid wool are never touched**.

Expected value per run (computed from the formulas; fuel in wool):

| World Tension T | Greed g | Cargo if extracted (wool) | P(fail) | Expected cargo | Fuel bought (wool) | Net expected |
|---|---|---|---|---|---|---|
| 20 | 0.0 | 3.00 | 8% | 2.76 | 0.00 | 2.76 |
| 20 | 0.5 | 5.25 | 14% | 4.54 | 0.50 | 4.04 |
| 20 | 1.0 | 7.50 | 19% | 6.08 | 3.00 | 3.08 |
| 50 | 0.0 | 3.00 | 8% | 2.76 | 0.00 | 2.76 |
| 50 | 0.5 | 5.25 | 22% | 4.11 | 0.50 | 3.61 |
| 50 | 1.0 | 7.50 | 36% | 4.84 | 3.00 | 1.84 |
| 80 | 0.0 | 3.00 | 8% | 2.76 | 0.00 | 2.76 |
| 80 | 0.5 | 5.25 | 30% | 3.67 | 0.50 | 3.17 |
| 80 | 1.0 | 7.50 | 52% | 3.60 | 3.00 | 0.60 |

Greed 0.5 is the best setting on this grid at every tension (net 4.04 / 3.61 / 3.17 wool at T=20/50/80); full Greed 1.0 stops paying as tension rises and at T=80 loses badly to Greed 0 (net 0.60 vs 2.76 wool), because the fail chance grows with `g·T`. That is the readable choice we want: the greedier the ask and the higher the World Tension, the more likely the cargo is lost. In the simulation: ~1,600 descents per 30 days, 86% extracted alive, 1,166 wool paid, 131 wool lost (65 burned), 323 wool of Attention bought. Outcome attestation is the weak point: the contract cannot run the engine, so P1 uses `settle_descent(id, outcome, history_hash)` signed by the coordinator (§2.6 T10); the room's command history is the audit trail.

### 2.8 Clan station deeds and the Charter (P2, modelled for flows only)

- **Station deeds**: six NEP-171 deeds, one per clan (Iris, Salt, Ash, Moss, Amber, Frost), minted once to the clan accounts, receiving a 12% tax on market fees through that clan's station. In the model the tax is tiny (98 wool in 30 days across six deeds): it is a *social* layer (clans have an economic stake in the town), not income. Do not market it as income.
- **Charter**: a licence NFT (40 wool, 60 per season) that raises limits (stake cap ×1.5, Attention 14/day, access to the far Shells). **No yield multiplier and no combat power**: access, not advantage (Cambria's Charter, minus the royal-favour token path). Sim: 4.75 Charters per run on average.

### 2.9 NPC traders as market makers

The 20 trader accounts (13 townsfolk, 7 clan agents) are the owner's decision; this design gives them an economic job:
- Townsfolk trade silk for goods at posted prices (the volume that pays the fee); each trade is one `trade` call.
- Clan agents also **arbitrage the AMM** toward the town's fair value (bounded by 25% of NPC inventory/day), **hold pledges** (70% of their wool, compounding daily: ~16 claim tx/day) and hold the six station deeds.
- Honest label (the Hearthmarket lesson): README and UI say which parts are scripted. Trades are scripted rules (not an LLM); if the TEE path is used for some decisions, they are logged with `agent-ledger.record_tee_decision`; at 20k tx/day, log only a daily Merkle root plus a 1% sample.
- Silk faucet: 45 silk/NPC/day wages and 3% daily stall upkeep. This is a **game-design budget**, not organic demand, and the docs must say so.

### 2.10 Seasons and the sealed commit

- A **season** is the unit of resets. Wool balances, pledges and deeds **persist**; what resets is the tournament purse, the Shell Reserve (unspent flows to the purse), Charter supply, and the epoch reward index.
- `open_season(season_id)` requires that `ftf-seasons.testnet` has `get_season(season_id)` (cross-contract view, or the coordinator attesting with `schedule_root`); it computes the mint ceiling from last season's burn counter and records `schedule_root` for deeds opened in it.
- `settle_season` runs after the last leaf reveal (leaf 14 of 15 in the existing deployment): payouts are computed from the revealed result list, hash-committed, then paid in batches. A tournament result a judge can check against `check_leaf`.
- Deeds opened in season *s* carry `season_id` and `schedule_root` for life: a pledge is provably "opened under seal *s*".

### 2.11 Anti-exploit summary

| Attack | Defence | Evidence |
|---|---|---|
| Sybil entry farming | guest credit via `guests` daily cap; credit non-sellable; emission bounded by participation and burn-match (sybils dilute honest players, no new wool); progressive entry fee per funding source (P2) | §5.5: idle bots ≈ break-even; competent bots +15 wool/account/season, a transfer not emission |
| Wash trading | fee > recoverable share | negative EV chart `11_attacks.png` |
| Whale capture | dynamic cap, rate ceiling, Charter limit, receiver check | top-1% share 33% vs 75% |
| Whale dump | per-account swap cap 5% of pool/day, `min_out` | min price 0.64 → 1.39 |
| Rate-chasing into tiny works | rate ceiling 0.4%/day | pre-ceiling outliers up to +950% |
| Flash staking | epoch weight, cooldown, deed fee | T1 |
| Passive farming of the tournament | score rule must reward honest play: the engine's own report shows "doing nothing beats honest play" (`docs/math/economy-report.md` §2.1: passive 138 silk vs honest 76-95). If wool is paid for rank, the scoring must not reward passivity | owner/engine decision §12 |

### 2.12 Language and legal caution

Wool is a testnet game resource with **no sale for NEAR or any currency, no mainnet token, no transfer between players except a whole deed, no promised return**, and rewards that come only from in-game fee flows. This is not legal advice. Practical rules:
- Player-facing copy says **pledge**, **reward share**, **rate (variable, can be zero)**, **town works**. Do **not** use "invest", "APY", "yield farming", "profit", "dividend", "returns" in the game, README, X post or Pages. (`docs/agent-market-plan.md` §0 already forbids "APY"/"invest" for the Foresight Exchange; the owner's words "invest/staking/DeFi" are fine in internal docs.)
- Show the rate only as measured past data from the fee flow, with "can be zero". Never as a forecast.
- No wool-for-NEAR, no real-money prize, no token launch, no deposits. Real prizes or any token only after legal and security review, as the project's own TZ says. Cambria's own docs say the median player will not get its token; its token launch before a public game is something we explicitly avoid (§6).

---

## 3. Formulas

Let `x`, `y` be pool reserves (wool, silk), `f` = 0.003.

- **Swap**: `Δout = y·Δin(1−f) / (x + Δin(1−f))` (symmetric for the other direction); price `p = y/x`.
- **Fee conversion** (daily `sweep_fees`): trade volume `V` (silk), fee `F = φ_m·V` (φ_m = 0.0012). `F_station = τ_s·F` (τ_s = 0.12) is converted separately and paid to the six station deeds. `B = swap_silk_for_wool(F − F_station + silk from swap fees)`; `Pot = σ_st·B + 0.2·(wool swap fees)` with σ_st = 0.65; purse/Reserve gets σ_pz·B = 0.20·B; burn σ_bn·B = 0.15·B.
- **Pledge weight**: `w_i = principal_i · m_tier(i)`, `m = (1.00, 1.15, 1.30, 1.50)`.
- **Works pot**: `pot_a = min(ω_a·Pot + extras_a, r_max·Σ_i w_ia)`, `r_max = 0.004`; `reward_i = pot_a · w_ia / Σ w_a`; the overflow `ω_a·Pot + extras_a − pot_a` goes to the purse. `ω = (0.35, 0.25, 0.25, 0.15)`, weights renormalised over works with stake.
- **Displayed rate** (never promised): `rate_7d = (Σ_7d pot paid) / (7 · mean weight)`; per 100 wool: `100·rate_7d`; annualised-equivalent `365·rate_7d` shown only in the Economy Lab.
- **Rate scaling** (what the sensitivity run confirms): `rate ≈ σ_st·(1−τ_s)·φ_m·V / (p·W)`, where `W` is total weight: linear in fee and volume, inverse in TVL.
- **Emission**: `M_s = min(E0·d^s, F + μ·Burn_{s−1}, m_e·n_s)`; E0 = 6,000, d = 0.9, F = 500, μ = 0.8, m_e = 12.
- **Purse payout**: `purse = 0.75·M_s + 0.65·entry_fees + Reserve leftover + 0.5·tithe_prize + …`; `floor` = 30% split equally among entrants; the remaining 70% to the top 60% by rank with weight `k^(−0.6)`; per-account cap 4% of purse, one redistribution pass.
- **Stake cap**: `C = min(4000, max(400, 0.05·TVL))·(1.5 if Charter)`; per works `min(1500, C)`.
- **Early exit**: `penalty = 0.10·principal`: 50% burned, 50% to the other stakers of that works.
- **Descent**: `A = 6 + 10g`, `fuel = max(0, A − free)/2` wool, `R = 3(1 + 1.5g)`, `p_fail = clip(0.08 + 0.55·g·T/100, 0, 0.9)`; failure: `0.5R` burned, `0.5R` back to the Reserve.
- **Fair value** (model only): `P*_t = 2.0 · (S_ref/S_t)^0.35 · exp(OU_t)`; the contract has no oracle and never reads `P*`.
- **Wash EV**: attacker with weight share `s` and silk volume `V`: net (in silk) `= −φ_m·V·(1 − σ_st(1−τ_s)·s)`, always negative because `σ_st(1−τ_s) = 0.572 < 1`.

---

## 4. Parameter table

| Parameter | Symbol / key | Value | Meaning |
|---|---|---|---|
| `days` | days | 30 | simulated in-game days |
| `season_len` | L | 5 | days per season (6 seasons); matches the accelerated-season idea, Cambria seasons are ~10 days |
| `n_humans` | N_h | 200 | human players (also 50 and 1000 tested) |
| `n_npc` | N_npc | 20 | trader accounts: 13 townsfolk + 7 clan agents (owner decision of 12 Nov) |
| `npc_trades_per_npc` | λ | 1000 | market trades per NPC per day (owner decision: ~1,000) |
| `human_trades_per_active` |  | 25 | market trades per active human per day |
| `mean_trade_silk` | s̄ | 2.0 | mean trade size in silk |
| `market_fee` | φ_m | 0.0012 | fee on silk volume of every market trade (0.12%) |
| `station_tax` | τ_s | 0.12 | share of that fee paid to the 6 station-deed holders |
| `tithe_stakers` | σ_st | 0.65 | share of fee-bought wool paid to stake pools |
| `tithe_prize` | σ_pz | 0.2 | share to the tournament purse / Shell Reserve (50/50) |
| `tithe_burn` | σ_bn | 0.15 | share burned |
| `amm_fee` | f | 0.003 | AMM swap fee; 20% of it goes to stake pools, 80% stays with LPs |
| `pool_wool / pool_silk` | x0 / y0 | 10,000 / 20,000 | genesis pool (price 2.0 silk per wool), protocol-owned at start |
| `lock_days` | d_t | 0 / 5 / 10 / 20 | lock tiers (flex has a 2-day cooldown) |
| `lock_mult` | m_t | 1.00 / 1.15 / 1.30 / 1.50 | reward weight multiplier per tier |
| `cooldown` |  | 2 | unbonding days (no rewards, deed in `unbonding` state) |
| `early_exit_penalty` | π | 0.1 | taken from principal on early exit; 50% burned, 50% to remaining stakers of that asset |
| `deed_fee` |  | 0.25 | wool burned per new deed (spam brake) |
| `cap_total / cap_floor / cap_share` | C_max / C_min / χ | 4000 / 400 / 5% of TVL | per-account stake cap = min(C_max, max(C_min, χ·TVL)); Charter ×1.5 |
| `cap_asset` |  | 1500 | per-account per-asset ceiling |
| `max_daily_rate` | r_max | 0.4% / day | hard ceiling on any pool's reward per unit of weight; excess flows to the purse |
| `asset_w` | ω_a | 0.35 / 0.25 / 0.25 / 0.15 | base share of the staker pot: Loom House / Caravan Guild / Archive & Translation Guild / Shell Observatory |
| `entry_fee` |  | 20 | tournament entry (wool); 20% burned, 15% to Shell Observatory pool, 65% to purse |
| `welcome_wool` |  | 40 | entry credit per new guest (only spendable on tournament entry, never sellable) |
| `emit0 / emit_decay` | E0 / d | 6000 / 0.90 | mint ceiling per season (never binds in the base case) |
| `emit_floor / emit_burn_match` | F / μ | 500 / 0.8 | mint ≤ F + μ·(wool burned last season) |
| `mint_per_entrant` | m_e | 12 | mint ≤ m_e × entrants: emission scales with real participation |
| `floor_share / payout_alpha / paid_frac / payout_cap` |  | 30% / 0.6 / 60% / 4% | purse: 30% equal floor, 70% rank-weighted (power 0.6) over the top 60%, per-account cap 4% of purse |
| `mint_to_dividend / tithe_dividend` |  | 25% / 50% | share of mint and of tithe-prize routed to the Shell Reserve that pays extractors |
| `free_attention / attention_per_wool` |  | 10 / 2.0 | free Attention per day; extra Attention costs 0.5 wool each (60% burned, 40% to the Reserve) |
| `base_run / greed_run` | a0 / a1 | 6 / 10 | Attention burned per descent = a0 + a1·g |
| `cargo_base / cargo_greed` | c0 / κ | 3 / 1.5 | cargo = c0·(1 + κ·g) wool, reserved from the Reserve |
| `pfail_base / pfail_k` | p0 / k | 0.08 / 0.55 | P(fail) = p0 + k·g·T/100 (T = World Tension 0-100) |
| `fail_burn` |  | 50% | of the lost cargo burned, rest returns to the Reserve |
| `charter_cost / charter_per_season` |  | 40 / 60 | Charter licence price (60% burned) and seasonal supply |
| `p0 / supply_elast` | P* | 2.0 / 0.35 | fair value of wool in silk, falls with supply^-0.35 (more wool, lower marginal use) |
| `npc_wage / silk_upkeep` |  | 45 / 3% | silk faucet per NPC per day and stall upkeep burned per day |
| `arb_band / arb_cap` |  | 1% / 25% | NPC arbitrage band and share of NPC inventory usable per day |
| `sell_frac / stake_base / stake_k` |  | 30% / 0.5 / 0.6 | human behaviour: share of fresh wool sold; stake share = 0.5 + 0.6·(rate-30%), clipped 10-90% |

---

## 5. Simulation

### 5.1 Method

Python, daily steps, agent level (`/workspace/ftf-economy/econ_sim.py`, `run_all.py`, `extra_stats.py`): 200 humans who join over 10 days (front-loaded), 20 trader accounts, a wool/silk AMM, four works with four lock tiers, tournament seasons of 5 days, descents, Charters, six station deeds. Humans decide per fresh wool: sell, pledge (tier by a fixed risk type, works by softmax on measured rate), LP (30% of humans), claim every 1-5 days, exit at lock expiry with 40% probability, panic-exit after a 10% price drop. NPC arbitrage pulls the pool price toward the fair value `P*`. 8 seeds for the base case, 5 for sensitivity, median and p10-p90 bands. The model is a design tool, not a forecast: see §5.6 for what it does not capture.

### 5.2 Base-case charts

- `ftf-economy-charts/01_price_supply.png`: pool price vs fair value; supply and where it sits.
- `ftf-economy-charts/02_apr_tvl.png`: **variable reward rate** derived from fee flow, TVL, staked wool per works.
- `ftf-economy-charts/03_tx_per_day.png`: **real tx per day** by action, with the 20,000 line.
- `ftf-economy-charts/04_gini_wealth.png`: Gini over time and final wealth histogram.
- `ftf-economy-charts/05_sinks_sources.png`: 30-day sources vs sinks; net supply growth per day.
- `ftf-economy-charts/06_roi_distribution.png`: staker outcome distribution and LP-vs-hold.
- `ftf-economy-charts/07_descent_greed.png`: tension, survival, Greed EV, descent flows.
- `ftf-economy-charts/12_purse_tiers.png`: purse per season; stake by lock tier.

![price and supply](ftf-economy-charts/01_price_supply.png)
![rate and TVL](ftf-economy-charts/02_apr_tvl.png)
![tx per day](ftf-economy-charts/03_tx_per_day.png)

Reading them:
- **Rate**: starts ~58% (little TVL) and settles to 35-40% as stake grows from 7,500 to 13,000 wool, with a fixed fee flow: the correct behaviour of a fee-funded rate (more pledged wool → thinner share).
- **Price**: tracks the fair value through the 30 days (CV 6%, minimum 1.74 vs 2.0 start). The pool's wool grows slightly (10,000 → 10,661) as fees and sells accumulate.
- **Supply**: 24.6k → 33.3k; day 10-20 +10.8% (entry credits and the ramp), **day 20-29 +1.7% total (0.19%/day)**. The purse never exceeds participation × 12 and falls with the burn.
- **Inequality**: 0.35 among humans; the Descent makes it slightly more even (0.39 without it).

### 5.3 Transactions per day (owner target ~20,000, every tx a genuine action)

| Action | tx/day (mean, base, 200 humans + 20 NPC) | Share |
|---|---|---|
| `market_trade` | 22,673.1 | 99.01% |
| `descent_begin` | 53.4 | 0.23% |
| `descent_end` | 53.4 | 0.23% |
| `swap` | 21.0 | 0.09% |
| `stake` | 21.0 | 0.09% |
| `claim` | 15.8 | 0.07% |
| `enter` | 15.0 | 0.07% |
| `prize_claim` | 15.0 | 0.07% |
| `buy_attention` | 13.4 | 0.06% |
| `unbond` | 5.6 | 0.02% |
| `withdraw` | 4.5 | 0.02% |
| `distribute` | 4.0 | 0.02% |
| `lp_add` | 1.7 | 0.01% |
| `sweep` | 1.0 | 0.00% |
| `early_exit` | 0.4 | 0.00% |
| `lp_remove` | 0.4 | 0.00% |
| `settle` | 0.2 | 0.00% |
| `translate` | 0.2 | 0.00% |
| `charter` | 0.2 | 0.00% |
| `deed_transfer` | 0.0 | 0.00% |
| **total** | **22,899** | 100% |

- The target is met by the trader accounts' **market trades**: Poisson with mean 1,000 × 20 = 20,000/day, ± ~140. Humans add ~2,700 at 200 players, ~15,000 at 1,000 players (total 34.8k/day, min 24.9k).
- With 50 players the day-minimum was 19,980: **set the trader quota to ~1,100 trades/trader/day (5-10% margin)**, and monitor.
- The staking/economy layer is **about 230 tx/day (1%)**: staking, claims, unbonding, swaps, entries, descents. Do not claim the staking layer "generates 20k"; claim that the town's economy runs 20k real trades a day and the staking layer gives them meaning.
- "Genuine": a trade moves silk between two balances and pays a fee; a swap/stake/claim moves wool; there is no no-op ping. Minimum trade size 0.5 silk; the `trade` call rejects zero or self trades. The health check is the explorer count and the Town Pulse page (§7).
- **Cost** (VERIFY by measurement on testnet; estimates at the repo's own 3 Tgas ≈ 0.0003 NEAR): 22.7k trades × 0.0003 ≈ 6.8 NEAR/day + ~230 economy tx × ~0.0007 ≈ 0.16 NEAR/day + deed storage 0.005 NEAR refundable per open deed. About **7 testnet NEAR/day**. Funding the trader accounts is an owner-gated action.
- **Cumulative vs rivals**: the scorecard's counts are cumulative (Hearthmarket ~34.8k, TokenGo ~21.9k, Crownfall ~3k). At 20-23k/day FTF passes Hearthmarket's total in about 1.5 days of running. Judging starts 16 Nov (00:00 UTC): keep the market running through judging.

### 5.4 Scenarios

| Scenario | Rate mean (p10-p90) | Price end (min) | Price CV | Gini (d20+) | Top-1% stake share | tx/day mean (min) | Staking-layer tx/day |
|---|---|---|---|---|---|---|---|
| base | 39% (32%-47%) | 1.88 (1.74) | 0.06 | 0.35 | 6% | 22,978 (20,831) | 226 |
| small audience (50) | 42% (35%-50%) | 2.04 (1.87) | 0.06 | 0.21 | 5% | 20,767 (19,980) | 76 |
| big audience (1000) | 39% (28%-53%) | 1.45 (1.21) | 0.11 | 0.42 | 11% | 34,807 (24,881) | 995 |
| sell-off (day 15: sell x2.5, volume -60%) | 24% (14%-46%) | 1.89 (1.75) | 0.06 | 0.37 | 7% | 16,770 (10,597) | 219 |
| 3 whales, caps ON | 42% (33%-54%) | 1.67 (1.47) | 0.06 | 0.35 | 33% | 23,072 (20,830) | 230 |
| 3 whales, caps OFF | 20% (15%-27%) | 1.52 (1.43) | 0.05 | 0.38 | 75% | 23,028 (20,789) | 228 |
| whale dump (day 15: 3 whales sell 40%) | 42% (20%-72%) | 1.67 (0.64) | 0.19 | 0.35 | 41% | 23,079 (20,830) | 237 |
| whale dump + swap cap 5% pool/acct/day | 36% (21%-57%) | 1.62 (1.39) | 0.08 | 0.35 | 41% | 23,075 (20,830) | 236 |
| no Descent / no Charter | 38% (31%-45%) | 1.92 (1.80) | 0.05 | 0.39 | 6% | 22,869 (20,533) | 103 |

![scenarios](ftf-economy-charts/08_scenarios.png)
![whale caps](ftf-economy-charts/09_whale_caps.png)

- **Small audience (50)**: nothing breaks; price ~2.0; but tx min dips under 20k without a margin.
- **Big audience (1000)**: tx 34.8k/day; supply and price pressure (price end 1.45); rate similar because stake grows with players.
- **Sell-off** (day 15: players sell 2.5× as much and NPC trade volume −60%): rate falls to 24% (p10 14%), tx/day to ~11k after day 15. The economy does not collapse, but **the 20k/day target depends on the trader quota, not on the economy**.
- **Whales**: three whales with 8,000 wool each (more than a third of total supply). With caps: whales hold 14% of staked wool, top-1% accounts 33%, others' rate 42%. Without caps: whales hold 63%, top-1% 75%, **everyone else's rate halves to 20%**.
- **Whale dump** (each sells 40% in one day): pool price falls **−66% to 0.64** and recovers within days via NPC arbitrage; the staker rate spikes (p90 72%) because fee silk buys more wool at a low price. **With a 5%-of-pool per-account daily swap cap: minimum 1.39 (−25%)**.
- **Without Descent/Charter**: Gini rises 0.35 → 0.39, staking-layer tx halves (103/day).

### 5.5 Sensitivity and attacks

| Parameter | Tested values | Mean staker rate | Price CV | Supply growth d15-30 | Gini |
|---|---|---|---|---|---|
| `market_fee` | 0.0006 / 0.0012 / 0.0024 | 18% / 39% / 79% | 0.09 / 0.07 / 0.06 | 13% / 13% / 12% | 0.35 / 0.35 / 0.35 |
| `tithe_stakers` | 0.45 / 0.6 / 0.65 / 0.8 | 24% / 36% / 39% / 50% | 0.07 / 0.07 / 0.07 / 0.07 | 13% / 13% / 13% / 13% | 0.36 / 0.35 / 0.35 / 0.35 |
| `emit0` | 3000.0 / 6000.0 / 12000.0 | 39% / 39% / 39% | 0.07 / 0.07 / 0.07 | 13% / 13% / 13% | 0.35 / 0.35 / 0.35 |
| `mint_per_entrant` | 20.0 / 40.0 / 80.0 | 39% / 36% / 33% | 0.07 / 0.06 / 0.07 | 14% / 14% / 13% | 0.35 / 0.35 / 0.36 |
| `sell_frac` | 0.1 / 0.3 / 0.6 | 39% / 39% / 38% | 0.06 / 0.07 / 0.06 | 13% / 13% / 12% | 0.35 / 0.35 / 0.35 |
| `npc_trades_per_npc` | 500.0 / 1000.0 / 1500.0 | 20% / 39% / 53% | 0.06 / 0.07 / 0.06 | 13% / 13% / 13% | 0.36 / 0.35 / 0.35 |
| `amm_fee` | 0.001 / 0.003 / 0.01 | 39% / 39% / 38% | 0.06 / 0.07 / 0.06 | 13% / 13% / 13% | 0.36 / 0.35 / 0.35 |
| `lock_mult` | (1, 1, 1, 1) / (1, 1.15, 1.3, 1.5) / (1, 1.5, 2.0, 3.0) | 45% / 39% / 28% | 0.07 / 0.07 / 0.06 | 13% / 13% / 13% | 0.35 / 0.35 / 0.36 |
| `early_exit_penalty` | 0.0 / 0.1 / 0.25 | 39% / 39% / 38% | 0.06 / 0.07 / 0.07 | 13% / 13% / 13% | 0.35 / 0.35 / 0.35 |
| `cap_share` | 0.02 / 0.05 / 1000000000.0 | 45% / 39% / 38% | 0.06 / 0.07 / 0.05 | 13% / 13% / 13% | 0.34 / 0.35 / 0.36 |
| `max_daily_rate` | 0.002 / 0.004 / 1.0 | 40% / 39% / 34% | 0.06 / 0.07 / 0.06 | 13% / 13% / 13% | 0.35 / 0.35 / 0.35 |
| `pool_wool` | 3000.0 / 10000.0 / 30000.0 | 39% / 39% / 55% | 0.08 / 0.07 / 0.05 | 17% / 13% / 8% | 0.34 / 0.35 / 0.35 |
| `pfail_k` | 0.25 / 0.55 / 0.85 | 39% / 39% / 39% | 0.07 / 0.07 / 0.07 | 13% / 13% / 13% | 0.35 / 0.35 / 0.36 |

![sensitivity](ftf-economy-charts/10_sensitivity.png)

What moves what:
- **Rate** is almost entirely `market_fee × trade volume`: 18% / 39% / 79% for fee 0.06% / 0.12% / 0.24%, and 20% / 39% / 53% for 500 / 1000 / 1500 trades per NPC. Lock multipliers and the stake share of the tithe move it by tens of points (28% to 45% for multipliers; 25% to 50% for σ_st).
- **Stability** (price CV, supply growth) responds to **pool depth** (3,000 wool: CV 0.084, +16.8% supply growth; 30,000 wool: CV 0.049, +7.6%) and little to anything else. `emit0` has **no effect** because `m_e × entrants` and burn-match bind first: emission is governed by participation, as intended.
- **Gini** responds to `cap_share` and `mint_per_entrant`; early-exit penalty and Greed slope barely matter.
- **Choose the AMM pool deeper than the daily flow**: 10,000 wool against ~420 wool/day of swap volume keeps price moves small.

![attacks](ftf-economy-charts/11_attacks.png)

**Sybil, one tournament (100 honest entrants, attacker K accounts, 300 simulations each)** (net wool per season after entry fees):

| K accounts | 1 | 5 | 10 | 25 | 50 | 100 |
|---|---|---|---|---|---|---|
| idle bot, caps on | +0.6 | +3.7 | +7.5 | +7.8 | +13.5 | +35.5 |
| competent bot (skill +1), caps on | +15.3 | +70.4 | +138.7 | +283.8 | +494.2 | +736.8 |
| competent bot, caps off | +13.9 | +69.9 | +131.6 | +299.1 | +484.9 | +721.9 |
| competent bot, caps on + paid depth 5%, no floor | +5.0 | +34.6 | +61.0 | +141.7 | +255.8 | +518.6 |

Reading: the per-entrant mint (12) was chosen so that **an idle entrant is roughly break-even** (payout ≈ entry fee). A *competent* automated entrant earns +15 wool per account per season, linear in K. The payout cap does not bind at these sizes. This is **not new emission** (total mint is capped by participation and the burn-match; extra accounts take wool from honest players), but it is a fairness problem. Hard defences: guest accounts only through `guests` (daily cap), non-sellable credit, a shallower paid depth (roughly halves the farm at K=25-50), progressive entry fee per funding source (P2), and, above all, a **score that cannot be won by a script that does nothing or one strategy repeated**.

**Wash trading**: net wool/day is negative at every attacker share of staked weight (`11_attacks.png`, right).

### 5.6 What the model does not capture (read before quoting numbers)

- Humans' behaviour is parameterised, not observed: 200 synthetic players, fixed sell/stake rules. Real players may ignore staking or chase rates harder.
- Same-day weight for new deeds (the contract must use next-epoch weight), so early rates are slightly optimistic.
- Fair value `P*` and the NPC wage faucet are assumptions; the 20k trades/day are scripted demand. The fee flow is therefore a **designed budget** (48 silk/day against a faucet of 900 silk/day), not market-discovered income. Say so in the README.
- Deed transfers, marketplaces, Storm days, shard catalysts and LP gauge details are not simulated (transfers add tx but no economics).
- 30 days: the annualised figures are a display convention; two weeks of rate data say nothing about a year.
- No gas-failure, relayer-outage or chain-congestion modelling. Real testnet tx throughput and rate limits of the RPC/relayer for 20 accounts × 1 tx/86 s are not tested here (VERIFY).

---

## 6. Borrowed mechanics

Sources: Cambria notes (`/home/box/agent-data/agents/1d6e7def-…/attachments/90a3a52f….md`, collected 12 Nov 2026 from the project's docs, blog and X) and `FTF-Competitor-Scorecard.md`. Cambria URLs: docs https://docs.cambria.gg/ · $RSGP https://docs.cambria.gg/l2-the-state/usdrsgp · Energy/Credits/Silver https://docs.cambria.gg/l0-economic-engine/silver-credits-and-energy · Crown Treasury https://docs.cambria.gg/l2-the-state/crown-treasury · Royal Favor https://docs.cambria.gg/l2-the-state/royal-favor · testnet and launch https://docs.cambria.gg/genesis-misc/testnet-and-early-access · token blog (22 Jul 2026) https://blog.cambria.gg/rsgp-is-coming/ · Season 3 results (25 Dec 2025) https://blog.cambria.gg/season-3-results/ · Gold Rush S3 rewards https://cambria-1.gitbook.io/goldrush-s3/overview/rewards · presale https://blog.roninchain.com/p/cambrias-rsgp-presale-starts-today · tokenomics post https://x.com/playcambria/article/2115458668137205766 · site https://beta.cambria.gg/ · blog https://blog.cambria.gg/ · X https://x.com/playcambria. Some Cambria facts in the notes are marked unconfirmed there (21% vs 23.8% emissions; reported airdrop size and price move); nothing below depends on them.

| Mechanic | Source | How FTF adapts it | Deliberately NOT copied | Priority |
|---|---|---|---|---|
| Treasury funded by fees, shared with stakers | Cambria Crown Treasury (docs.cambria.gg/l2-the-state/crown-treasury) | `sweep_fees`: 0.12% trade fee + 20% of swap fees + translation/entry streams → wool pots for the four works (§2.4). In the simulation this is the only source of staker rewards. | USDC treasury, fee on cash-out/withdraw, a tradeable ownership token | **P0** |
| Prize pool funded by season spend | Cambria seasons (blog.cambria.gg/season-3-results/; Gold Rush S3 rewards) | Tournament purse = capped mint + 65% of entry fees + half of the tithe's prize share + 40% of Charter + Reserve leftover; public on the Pulse page | Real-money pool, payout to token holders | **P1** (wool credit for rank), **P0** purse display |
| Burning fuel (Energy burns while in the world) | Cambria Energy (docs …/silver-credits-and-energy) | **Attention** burns per descent: a0 + a1·g; 10 free/day, rest costs wool (60% burned) | Buying fuel with USDC; $81/hour at top tier | **P1** |
| Extract alive to bank loot | Cambria cash-in on return | **Descent**: cargo reserved at the gate, banked only on return alive (hillside packs now, Shells later) | Cash-in to USDC/Silver; full-loot PvP interception | **P1** |
| Greed scale raises reward and loss | Cambria Greed | **Greed tied to World Tension** `S.H`: `p_fail = p0 + k·g·T/100`, reward ×(1 + 1.5g); EV table §2.7 | Cambria's 10-30% artifact loss numbers | **P1** |
| Partial loss: cargo all, artifacts partly, savings never | Cambria Genesis docs | Cargo lost, **pledged wool, deeds, shards never lost**; lost cargo is a wool sink (50% burn) | Artifact (gear) loss; the older "full-loot" wording in the token article | **P1** |
| Three separated currency layers | Cambria Energy/Credits/Silver/$RSGP | Attention (fuel) / Silk (earnings) / Wool (ownership) (§2.1) | Linking any of them to USDC or an external token | **P0** (design), P1 (Attention code) |
| Territorial/station deeds with taxes | Cambria City Deeds and Islands | **Six clan station deeds** (NEP-171) receiving 12% of market fees through their station; social layer for the six clans | Taxes on player movement; selling deeds for real money; treating the tax as income | **P2** |
| Licence NFT for limits and access, not power | Cambria Charter | **Charter**: stake cap ×1.5, Attention 14/day, far-Shell access; 60 per season; no yield multiplier | Royal Favor token path, royalties to a token | **P2** |
| Short seasons (~10 days) | Cambria Season 3 (10 days) | 5-day accelerated seasons for the hackathon; the wool purse closes per season | Waiting for a persistent world before shipping | **P0** (already in sim) |
| Staking with treasury share | Cambria $RSGP staking | Wool pledge with lock tiers; weight ×1.0-1.5; rewards from fees only | A token launched before the game, 48% insider allocation with cliff, a token players cannot realistically obtain; any token launch | **P0** (pledge), token **never** pre-review |
| Autonomous NPC village with own accounts, honest "AI vs script" | Hearthmarket (https://github.com/nguyenkhangph/hearthmarket · https://hearthmarket.space · https://x.com/tomdrawneth/status/2120420754978484542) | 20 trader accounts with own keys; trades fund the works; scripted/AI split documented; decision hashes in `agent-ledger` sampled | Real-world weather or tokenized-gold price feeds | **P0** (owner decision), P1 (labels/ledger roots) |
| City Pulse, Economy Lab, Judges' pass | TokenGo (https://github.com/ebenbaruk/TokenGo · https://tokengo-production-195c.up.railway.app · https://x.com/r4b1nj0i3/status/2119186356325015735) | **Town Pulse** page reading the contract's `pulse()` view; **Economy Lab** = this simulation ported to JS with sliders; the judge link `?demo=judge` already exists | GPS walking; selling AI-compute loot | **P0** Pulse, **P1** Lab |
| AI lords with their own wallets, season throne, no-wallet login | Crownfall (https://github.com/neromtoobad/crownfall · https://crownfall.nerom.site · https://x.com/neromtoobad/status/2119855648150339694) | Seven clan agents hold pledges and station deeds; **Season Throne** = clan with the most wool at settle; guests play without a wallet | Eight memecoins as the economy; untested contracts | **P2** |
| Mainnet with deleted keys, SECURITY_REVIEW.md, escrowed player market, Intents top-up | Trezo (https://github.com/TeevincsCrypt/Trezo · https://playtrezo.xyz · https://x.com/neartrezo/status/2120720269035864460) | Write `docs/security-town.md` from the §2.6 threat model before deploying (P0); escrow marketplace for deeds via `nft_transfer_call` (P2) | Mainnet and Intents before a security review; real-money mint | **P0** doc, **P2** escrow, mainnet **not before review** |
| NFT as an autonomous entity with a vault | Incorpr (https://github.com/mrnetwork0001/Incorpr [search-match, ownership unconfirmed] · https://tryincorpr.vercel.app · https://x.com/encrypt_wizard/status/2119883806333141164) | The deed *is* the position: principal, lock, pending, season provenance all inside the token; no external account | Bitcoin/Solana chain signatures, USDC customers | **P0** (design) |
| Transfer semantics of a running business | Outlive (https://github.com/itsolaph/outlive · https://itsolaph.github.io/outlive/ · https://x.com/olaph_lol/status/2118877859389530222) | Whole-position transfer with a written state diagram, `expected_state_hash`, receiver cap check, post-transfer cooldown (§2.6) | Selling API keys/workers | **P0** (rules), P2 (escrow) |
| No-wallet play; shop NFTs paying holders | Ashes of the Ninth Heaven (https://github.com/merajali98-dev/ashes-of-the-ninth-heaven [search-match] · https://ashes-ninth.duckdns.org · https://x.com/merajali206/status/2119698012339663045) | Guest pledging through the relayer (function-call key limited to `stake/claim/begin_unbond/finish_unbond`); deeds as fee-receiving positions | NEP-245 everything; nine merchants | **P1** |

---

## 7. Contract and API surface (proposed; none of this exists in `main`)

### 7.1 Where it fits

- **One new testnet contract, `ftf-town.testnet`** (owner/coordinator `ftf-coordinator.testnet`, relayer-held trader keys). It is the "small market contract" of the 12 Nov decision, extended: balances (wool, silk, entry credit), `trade`, AMM, pledges, deeds (NEP-171 implemented inside it with `near-contract-standards`, the same pattern as `memory-shard`), treasury, tournament purse, Reserve, descents. Single contract = atomic state, no cross-contract callbacks for the core path, one deployment under a deadline.
- **Reads** existing contracts: `ftf-seasons.testnet.get_season` (season exists, `schedule_root`), later `ftf-shards.testnet` (catalyst, via `nft_on_transfer`). Writes nothing to them.
- **Wool and silk are internal balances** with `ft_balance_of`-style views (no `ft_transfer`): wool moves by market ops and whole deeds only. A NEP-141 facade is optional P2 (Hearthmarket has one); it must not enable free P2P transfers before review.
- **Shared authoritative rules**: a pure module `game/src/game/town-economy.js` (same pattern as `exchange.js`: integer maths, no `Date`/`Math.random`, seed-free) and a Rust port in the contract with shared **test vectors** (`contracts/town/tests/vectors.json`, as `memory-shard` does with `vectors.json`). The room's command bus gets `kind: "economy"` actions so humans and agents use one rule set: `stake`, `begin_unbond`, `finish_unbond`, `claim`, `swap`, `add_liquidity`, `remove_liquidity`, `buy_attention`, `begin_descent`, `extract`, `enter_tournament`. In the catalog they start as `planned` (501) as `exchange` actions did; in `proximity` sessions they need the avatar at the works' counter. Chain calls are made by the relayer for NPCs and guests; a human with a wallet signs their own (P2).

### 7.2 Methods (`ftf-town.testnet`)

| Method | Caller | What it does |
|---|---|---|
| `new(owner, coordinators, relayers, season_contract, params)` | deploy | stores bounded params and their hash |
| `trade(counterparty, silk, ref)` | trader/guest (function-call key) | the decided one-call market op: moves silk, takes `φ_m` into treasury, emits `trade` |
| `enter_tournament(season_id)` | player | pays 20 wool (credit first); emits `entry` |
| `open_season(season_id)` / `settle_season(season_id, payouts_batch, payouts_hash)` | coordinator | computes the mint ceiling; pays purse after the last leaf reveal; per-account cap; emits `season_open/settle` |
| `credit_wool(account, amount, season_id, ref)` | coordinator | only inside the per-season ceiling; used for descent settlement and corrections |
| `swap_wool_for_silk(amount, min_out)` / `swap_silk_for_wool(amount, min_out)` | any | AMM; per-account daily cap 5% of pool |
| `add_liquidity(wool_max, silk_max, min_shares)` / `remove_liquidity(shares, min_wool, min_silk)` | any | LP shares are internal balances (P2: NEP-171 LP deed) |
| `stake(asset, amount, tier) → Token` | player (attached storage deposit) | mints a deed; checks caps and rate ceiling; burns the deed fee |
| `claim(token_id)` | deed owner | pays `pending` |
| `begin_unbond(token_id)` / `finish_unbond(token_id)` | deed owner | `active → unbonding → burned`; principal back after the cooldown |
| `exit_early(token_id)` | deed owner | 10% penalty; 50% burned, 50% to remaining stakers |
| `sweep_fees()` / `distribute()` | anyone, once per epoch | converts treasury silk to wool, splits σ_st/σ_pz/σ_bn, credits the works' reward indices |
| `buy_attention(units)` / `begin_descent(greed)` / `settle_descent(id, outcome, history_hash)` | player / player / coordinator | fuel, reservation of cargo, banking or losing it |
| `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_tokens_for_owner`, `nft_resolve_transfer` | standard | deeds (no approvals) |
| Views | | `balance_of`, `pool_state`, `quote_swap`, `stake_pools`, `get_deed`, `deeds_of`, `season_state`, `treasury`, `reserve`, `pulse` |
| Admin | owner | `set_params` (between seasons, bounded, hashed), `pause` |

**Events** (NEP-297 `ftf_town`): `trade`, `entry`, `season_open`, `season_settle`, `wool_credit`, `swap`, `liquidity_add/remove`, `stake`, `claim`, `unbond_begin`, `unbond_finish`, `early_exit`, `sweep`, `distribute`, `attention_buy`, `descent_begin`, `descent_end`, `charter`. `trade` is a short log line; no per-trade storage.

**Data shapes**

```text
Balance   { wool: U128, silk: U128, credit: U128 }
Pool      { wool: U128, silk: U128, shares: U128, fee_bps: 30, last_day: u32 }
Works     { id, weight_total: U128, principal_total: U128, reward_index: U128, pot_7d: U128, rate_7d_per_100: U128 }
Deed      { token_id, asset, principal, tier, opened_day, locked_until_day, season_id, schedule_root,
            state, unbond_ready_day?, reward_index_snapshot, pending, catalyst_shard? }
Season    { season_id, schedule_root, mint_ceiling, purse, entrants, burn_counter, settled }
Pulse     { tx_counters{trade,swap,stake,claim,descent}, accounts, volume_silk, burned_wool, minted_wool,
            tvl_staked, pool_price, reserve, purse, day }
```

### 7.3 Repo and relayer touchpoints (for the build team; all new files unless noted)

`contracts/town/` (Rust, `near-sdk`, tests incl. `vectors.json`); `game/src/game/town-economy.js` + `game/tests/town-economy.test.mjs`; `game/src/net/town-client.js` (read-only views first, like `shard-nft.js`); `game/src/ui/town-works.js` (works panel at the Exchange counter; edit `SHOP_VIEWS` in `game/src/scenes/town-layout.js:176`); `relayer/lib/town-traders.js` (20 accounts, quota, jitter, backoff) and `relayer/api/town/*`; `docs/town-economy.md`, `docs/security-town.md`; a static `game/public/pulse.html`. `docs/api/openapi.yaml` and `game/src/net/catalog.js` get `economy` actions as `planned`. Edits to `engine.js`: **none** (the economy reads `S.H` through the room projection, never writes silk).

---

## 8. Why it differentiates

| Rival (from the scorecard) | What they show | What FTF adds on top |
|---|---|---|
| **Hearthmarket** (Games #1; village contract ~34.8k tx, five NPC accounts at 3-8k each, NEP-141/171/245) | A running NPC village economy | Same live-NPC proof, plus: a **position NFT bound to a sealed season** (their NFTs are items), a rate that is **derived from published fee flow** with a rerunnable Economy Lab, a risk-to-earn loop **driven by the engine's World Tension**, and explicit scripted/AI labels. 20-23k tx/day means FTF overtakes their cumulative count in ~1.5 days |
| **TokenGo** (Games #2; ~21.9k tx, Economy Lab, City Pulse, judge pass) | Dashboards and a judge shortcut | Town Pulse + Economy Lab are borrowed on purpose; FTF's difference is that the economy has an **NFT layer with transfer semantics and a written threat model**, not just counters |
| **Crownfall** (AI lords, ~3k tx, no-wallet login) | Walkable 3D + AI rivals | Seven clan agents with real stakes and station deeds; no memecoin; guests play without a wallet |
| **Trezo** (mainnet, SECURITY_REVIEW.md, 16 tx) | Security discipline, real usage tiny | We match the discipline (threat model, caps, bounded admin) at testnet scale and add real volume; **no mainnet before review** |
| **Incorpr / Outlive** (NFTs #1/#2: mainnet entity NFTs, transfer semantics) | NFTs that *are* something | A deed that is a live position: provenance (season root), lifecycle states, whole-position transfer, receiver-cap check, escrow-ready hash |
| **Ashes** (no-wallet play, shop NFTs paying holders) | Frictionless entry | Guest pledging without a wallet; deeds that receive fee streams |

Effect on the scorecard criteria, honestly: this mostly attacks **Impact** (5.5) and **Sustainability** (5.0) and the **Games track-fit** (0.65): a verifiable running economy with a sink/source model and a threat model. If it is live, documented and verifiable in the explorer, I would expect Games track-fit near 0.8 and Impact up by roughly half a point to a point; if it ships half-built or labelled dishonestly, it costs more than it earns. It does not by itself close the gap to Hearthmarket on Technical (tests, CI) or to mainnet entrants.

---

## 9. Priorities and scope cut

Timeline (Europe/Kyiv): it is Thu 12 Nov evening. **Feature freeze proposed Fri 13 Nov 16:00**; hard freeze 20:00; **deadline Sat 15 Nov 01:59** (14 Nov 23:59 UTC); judging from 16 Nov. About 23 hours to the proposed freeze. The repo's lean-team decision (one worker on the market) is the real constraint; parallel agents help only if they own separate files.

**P0: build for the freeze (one tight vertical slice)**
1. `ftf-town` contract: balances, `trade` (market decision), AMM swap/add/remove, `stake/claim/begin_unbond/finish_unbond/exit_early` with four works, four tiers, caps, rate ceiling, `sweep_fees/distribute`, deeds (NEP-171, no approvals), events, `pulse()`.
2. Relayer trader loop: 20 accounts, ~1,100 trades each/day, backoff, daily top-up check. (Owner-gated: deploy, keys, NEAR top-up.)
3. `town-economy.js` rules + vectors shared with the contract; honest labels in README ("wool: testnet game resource"; scripted traders).
4. **Town Pulse** page (static, reads views and the explorer API): tx counters, TVL, pool price, rate (7-day, "variable, can be zero"), burned/minted, season root.
5. `docs/security-town.md` (the §2.6 threat model), `docs/town-economy.md` (this document, trimmed), threat tests.
6. Update the tournament card/decisions text so "no prizes" is not contradicted.

**P1: if P0 is green by Fri ~12:00; otherwise right after the freeze as fixes only**
1. Wool credit for tournament rank (`open_season/settle_season/credit_wool`) with the per-season mint ceiling, linked to `ftf-seasons`.
2. Attention + Descent on the hillside gate (`ftf:mob-killed`, health) with `settle_descent` attested by the coordinator.
3. Economy Lab (JS port of this simulation with sliders).
4. Guest pledging through the relayer with a restricted function-call key.
5. Dynamic caps + swap caps (move from P0 static caps to share-of-TVL).
6. `agent-ledger` daily Merkle root of trader decisions + sample.

**P2: roadmap; do not start before the freeze**
Charter NFT, six station deeds, shard catalyst, deed escrow marketplace, LP deed and gauge, Storm-day rule, NEP-141 facade, Season Throne, progressive entry fee, TEE/multisig for coordinator calls, **mainnet and any real prize or token: only after legal and security review**.

**Cut line** (same discipline as `docs/agent-market-plan.md` §3.3): if the contract is not deployed with passing tests by **Fri 13 Nov 14:00**, ship only the trader market + Town Pulse (silk trades and the explorer count) and publish this document as the roadmap, with the staking/pledge UI hidden. A broken pledge flow loses more than a missing one. P0/P1 of the earlier TZ (judge path, shard card, CI fixes) come before any of this: **do not start the economy work if the 5-minute judge path is not green.**

---

## 10. Acceptance tests

Contract/Rust (`contracts/town/tests`):
1. Conservation: after any op sequence, `minted − burned = Σ balances + Σ staked + Σ pending + pool + treasury + reserve + purse`.
2. Mint only through the purse: `credit_wool` above the ceiling panics; `trade/swap/stake/claim` never change total supply.
3. AMM: `k` never decreases; `min_out` enforced; per-account daily swap cap enforced; vectors match JS to the unit.
4. Reward: Σ claimable ≤ Σ pots; rate ceiling enforced; zero-stake works roll over; dust to treasury.
5. Deed lifecycle: `active → unbonding → burned`; double `finish_unbond` panics; early exit takes 10% (50% burn, 50% to remaining stakers).
6. Deed transfer: moves position + pending + lock + unbond clock; receiver cap checked (`ERR_CAP_RECEIVER`); 1-day no-early-exit; `nft_transfer_call` rollback restores owner; no approvals methods exist.
7. Weight starts at the next epoch (same-epoch stake-then-distribute earns 0).
8. Caps: per-account `min(4000, max(400, 5%·TVL))`, per-works 1,500, Charter ×1.5 only.
9. Wash EV: simulated wash loop ends with negative balance for any weight share <100%.
10. Season: `open_season` fails for an unknown season in `ftf-seasons`; `settle_season` before the last reveal fails; all deeds of a season share one `schedule_root`.
11. Descent: cargo reserve never exceeds the Reserve; fail returns 50% to the Reserve and burns 50%; pledged wool, deeds and shards untouched.
12. Params: `set_params` rejected mid-season and outside bounds; params hash changes the event log.
13. Gas: `trade` ≤ 3 Tgas, `stake` ≤ 12 Tgas, `swap` ≤ 6 Tgas, measured in sandbox.

JS/game:
14. `town-economy.js` vectors equal the Rust vectors.
15. Parity tests `v2/v3/parity` unchanged: the engine's `S.silk` is never written.
16. The economy actions through the room bus are idempotent (`actionId`) and version-checked.

Live testnet (owner-gated deployment):
17. Explorer: ≥ 20,000 `trade` receipts in a 24-hour window with ≥ 18 distinct signers; no failed-receipt rate above 1%.
18. `pulse()` equals counts reconstructed from events.
19. One end-to-end human/guest path: enter tournament → payout → pledge → deed visible in the Pulse and NFT list → claim → unbond → withdraw.
20. Copy audit: no "invest/APY/profit/dividend/returns" in game, README, X post; rate shown only as measured and "can be zero".

---

## 11. Owner-gated decisions

1. **Approve the scope** (§9) and whether to cut at Fri 14:00 if not green.
2. **Deploy `ftf-town.testnet`**, fund it, set function-call keys for 20 trader accounts and top up NEAR (about 7 NEAR/day; guest fund `guests.ftf-coordinator.testnet` needs a top-up before any audience launch). Signing and funding are the owner's.
3. **Naming policy**: "pledge/reward share/rate" in the game (recommended) or "stake" everywhere. The owner's words were "invest" and "staking".
4. **Is wool non-transferable between players** except as whole deeds (recommended) or a transferable NEP-141?
5. **Silk wage faucet size** and how openly to say the trade volume is scripted.
6. **Entry credit** size (40 wool) and the `guests` daily cap that bounds sybil credit.
7. **Coordinator trust** for `credit_wool/settle_season/settle_descent` on testnet; TEE/multisig only later.
8. **Tournament scoring**: today `OUTCOME_SCORE` (gift 5, survived 4, lost 2, weapon 1, gone 0) rewards outcomes; the engine's own report shows doing nothing often wins on silk. Decide a score that rewards honest play before wool is paid for rank.
9. **Real prizes, any token, mainnet**: not before a legal review and a security review of the contract (the Trezo-style `SECURITY_REVIEW.md`).
10. **Whether the AMM stays in P0** (best price story, most code) or the first release pays rewards from the silk fee at a fixed internal rate.
11. **Lore wording** for the works (Loom House, Caravan Guild, Archive & Translation Guild, Shell Observatory), consistent with Iris as a doctor-linguist from another planet, year 2048.

---

## Appendix: reproduction

```bash
cd /workspace/ftf-economy
.venv/bin/python run_all.py        # scenarios, sensitivity, attacks, 12 charts -> /workspace/exports/ftf-economy-charts/, results.json
.venv/bin/python extra_stats.py    # per-season mint/burn, tx table, descent EV -> extra_stats.json
```

Files: `econ_sim.py` (model), `run_all.py`, `extra_stats.py`, `results.json`, `extra_stats.json`, repo clone at `repo/` (read-only, `58c69bd`). Charts: `/workspace/exports/ftf-economy-charts/01…12_*.png`. The model is seeded (seeds 1-8 base, 1-5 sensitivity); numbers in this document are the outputs of those runs.
