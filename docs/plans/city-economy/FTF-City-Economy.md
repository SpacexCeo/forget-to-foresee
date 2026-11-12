# FTF City Economy: one currency (silk), the town works, a fee-funded pledge layer, and an on-chain portal gate

Forget to Foresee (repo `SpacexCeo/forget-to-foresee`, live https://spacexceo.github.io/forget-to-foresee/). **Revision 4, Thursday 12 Nov 2026 (late evening), Europe/Kyiv**, written against `main` at `77422d18` (12 Nov 19:03 Kyiv, `docs/town-economy.md` and `contracts/town`). English only, as required for FTF deliverables. Everything here is **NEAR testnet, in-game resources with no real-world value**. Nothing was pushed, deployed, signed or posted to produce this document: `main` was read-only (`git show origin/main:<path>`); the numbers come from the Python model in `/workspace/ftf-economy/` (reproduction commands in the appendix).

**What changed in revision 4 (owner decision, 12 Nov, final): the portal is paid ON CHAIN, in town silk, through `ftf-town`, and the price is LOWERED.** Revision 3 kept the 10,000-silk Gate in a separate off-chain book behind a "firewall"; that design is **withdrawn**, with its rules S1/S2 and the `bridge` scenario. In its place: (a) a new on-chain method `pay_gate` that **burns** the portal price from the player's own silk (§2.13), (b) a **sweep of the price** P from 100 to 2,000 silk in the silk-only simulation, at 50 / 200 / 1,000 players with 10% / 30% / 60% reaching the gate, (c) **caps recomputed** consistently with P (§2.2, §2.13.4), (d) a sybil cost table (§2.13.5). **Recommended: P = 200 silk** (5 tournament entries), with every quest, bounty and kill reward of the Story TZ scaled by P/10,000 so that the median focused-play time to reach it stays **102 minutes** (p10 68, p90 159). The owner originally said 10,000; it is not feasible as an honest on-chain number (§2.13.1). The earlier rev-2→3 change (one currency, silk only; the second token and its pool removed; aligned with `docs/town-economy.md` on `main` at `77422d18`) stands. Deadline: **Sun 15 Nov 2026 01:59 Kyiv (= Sat 14 Nov 23:59 UTC)**.

Lore canon used throughout: Iris is a doctor-linguist from another planet, year 2048. She is not an "AI clan agent". The town is quiet, misty, mysterious: copy in the game should sound like a hill town in fog, not like a trading terminal. The 20 traders and the citizens follow scripted rules; since 12 Nov the five clans (Salt, Ash, Moss, Amber, Frost) get a labelled LLM strategy layer (bounded `risk`, `buy`, `favour`; the rules engine still makes every move, `docs/town-economy.md` "Clan strategies").

---

## 0. Summary

**The idea.** **Silk is the only fungible thing in the town.** Players earn silk in the weekly tournament (the entry is 40 silk; payouts are silk) and can **pledge** it to four town works (Loom House, Caravan Guild, Archive & Translation Guild, Shell Observatory). A pledge is a **deed NFT (NEP-171)** carrying principal, lock tier and the sealed season it was opened in. The works pay a **variable share of the town's own fees**: the 0.12% fee on every market trade made by the 20 trader accounts and by players, in silk, routed to stakers by rule. **Nothing is minted to pay stakers.** Silk is minted in three bounded places only: the season purse (`min(12,000, 1,000 + 0.8 × last season's burn, 24 × entrants)`), entry credit for new guests (40 each), and coordinator wages/corrections (`credit_silk`), the last two inside one daily ceiling of 4,000. Merchants and the market price **goods** in silk by stock and demand (band 0.5× to 2× base); there is no second token, no pool, no exchange rate.

**Why it stands out in Games and NFTs.** The top Games rivals show *an NPC economy that runs* (a rival entry ~34.8k tx, a rival entry ~21.9k). FTF adds what none of them show in the scorecard: a position NFT whose provenance is bound to a sealed season, a published fee-flow model and a simulation the judge can rerun (Economy Lab), prices with a stated reason ("dear: only 3 salt left"), and an honest "what is scripted" label. The staking layer itself adds only ~170 tx/day (0.7%); **the ~22,000 tx/day come from the traders' genuine market trades** (owner decision of 12 Nov), and the pledge layer is what gives those trades a visible purpose: their fees are the reward pool.

**Key numbers (base case: 200 humans, 20 trader accounts, 30 days, 8 seeds; silk-only model, conservation checked to 1e-11):**

| Metric | Result |
|---|---|
| Real testnet tx per day | **22,862 mean, 20,229 minimum, 23,877 maximum** (22,692 market trades = 99.3%; ~170 pledge, claim, tournament and descent tx). With 50 players: 20,727 mean; with 1,000: 34,184 |
| Fee flow that funds rewards | ~47.7 silk/day of fees (0.12% of ~39,800 silk of volume) → 12% station tax → 65% to stakers = **~27 silk/day available** |
| Staker reward rate (variable, derived) | **0.15%/day = the ceiling, on 100% of days after day 3, at 50, 200 and 1,000 players** (≈ 55% annualised-equivalent, a display convention only). The fee flow (27 silk/day) is larger than what the ceiling lets out (~11-13 silk/day), so the excess goes to the purse. Per-pledge outcome, annualised on average principal: median 59%, p5 46%, p95 78% (lock multipliers lift it above the ceiling's 55%) |
| Rate range across 14 sensitivity runs | **0.075% to 0.283%/day** (follows the ceiling setting); with fee 0.06% the rate falls to 0.143%; with whale caps off it falls to **0.064%** |
| TVL | 4,200 at genesis (the 7 clans' 600 each) → **5,900 at day 10, 7,000 at day 20, 7,160 at day 30 (24% of supply)**; 5,000 / 7,200 / 14,500 at day 30 for 50 / 200 / 1,000 humans |
| Supply | 21.7k at day 0 (20,000 genesis + first credits) → 30.1k at day 30; then **+78 silk/day (+0.25%/day, +15% in days 30-90)**, linear not compounding. Wages off by default |
| Inequality | Gini of human silk wealth **0.45** at day 30 (p10-p90 0.42-0.47; 0.27 with 50 players, 0.53 with 1,000) |
| Whale caps | 3 whales with 8,000 silk each: top-1% stake share **30% with caps vs 61% without**; rate for everyone else **0.149% vs 0.064%/day** (caps hold the rate; without them it falls 57%). Whales hold 25% of TVL with caps, 79% without |
| Sybil (100 honest entrants + K bots) | Paying their own entry: break-even at skill 0 (K=100: −538 silk/season), **+372 silk/season at K=100 for +1σ bots**. **Free-credit entries are the leak: +3,481 silk/season at K=100 (skill 0), +4,337 (+1σ)**: a transfer from honest players, not new emission; mitigations in §2.11 |
| **Portal gate (rev 4)** | **P = 200 silk, burned, once per account, on chain (`pay_gate`).** Median focused-play time to earn it **102 min** (p10 68, p90 159; the Story TZ faucet scaled by P/10,000). With 50 / 200 / 1,000 players and 10% / 30% / 60% reaching it: supply at day 30 is **×1.14 / ×1.28 / ×1.38** the same town without the story, Gini change +0.01 / −0.01 / −0.04, staker rate stays at the ceiling, gate burn 850 / 11,350 / 121,100 silk (§2.13.3) |
| Caps for the gate (rev 4) | The story faucet needs a daily credit ceiling of **~1.25 × the peak day**: ~1,400 / **5,700** / 35,000 silk/day at the three audiences (peak day incl. entry credit 1,100 / 4,540 / 28,000). The earlier recommendation `credit_day_cap` ~200 **cannot be kept**: at 200 only 14% of finishers get through the gate in 30 days. Recommended **`credit_day_cap` 6,000** for ≤ 250 players or a separate `story_day_cap` (§2.13.4); `season_mint_cap` ~3,000 still fine (peak season mint 1,766 at 200 players) |
| Sybil cost to the whitelist pass (rev 4) | Free-credit tournament route to 200 silk: **never** for average bots, **7 seasons (35 days)** for the best bots at K=10 (6 at K=1, 43 at K=100); the honest route is 102 min. The story-bot route costs a guest slot plus replayed play whatever P is: defended by per-account day cap, relayer replay and guest limits (§2.13.5) |
| Wash trading | negative at every share: 20,000 wash tx/day cost **42 silk/day** in fees; the washer recovers at most 0.572 × (share of weight) of it |
| Stall shock (3 traders drained on day 12) | stalls reopen in about 7 days (36 closed-stall-days in total); with 5× the pledge rate (`invest_stall`), 29; a stall pledge returns a median **−78%** (the silk is not returned) |

**What is honestly not true yet.** `ftf-town` is **built and tested but not deployed**; the 20 trader accounts and clan wallets exist as code and a dry-run daemon, not as funded testnet accounts; Pulse says "not deployed yet" until the owner deploys. Descents, station deeds, the Charter, catalyst shards and the deed escrow are P1/P2 and not built. §9 cuts to what is left before the 13 Nov freeze. The 20k/day figure becomes a fact only when the explorer shows it.

---

## 1. What exists today (`main` at `77422d18`)

| Item | Status | Where, exactly |
|---|---|---|
| **Silk (town)** | **Built in `ftf-town`, not deployed.** Sole in-game currency of the town; moves by `trade`, entry, pledges and payouts. The engine's own `S.silk` (season rules; 60 per clan, +3 per tick) is a different, sealed resource and is **never debited by town code** | `contracts/town/src/{lib,rules}.rs`, `docs/town-economy.md`, `docs/agent-market-plan.md` §0 |
| **Contract** | `ftf-town.testnet`, 43 unit tests, shared rules `rules.rs` ↔ `game/src/game/town-rules.js` with `contracts/town/tests/vectors.json`. Methods: `genesis`, `trade`, `stake`, `claim`, `begin_unbond`/`finish_unbond`, `exit_early`, `sweep_fees`, `distribute`, `open_season`, `enter_tournament`, `settle_season`, `credit_silk`/`credit_entry`, `invest_stall`/`claim_stall`, `set_params`/`set_paused`/`set_coordinators`; NEP-171 deeds with approvals rejected | `contracts/town`, deploy script `contracts/scripts/town-deploy.sh` (lead, after the owner's yes) |
| **Traders** | 20 accounts `trader-01…20.ftf-town.testnet` (13 townsfolk + 7 clan traders), trade-only keys held on the relayer; 6 clan wallets with their own `stake/claim/unbond/enter` rights; daily NEAR cap per wallet, one kill switch (`FTF_TOWN_KILL=1`, `relayer/data/KILL`, contract `set_paused`). Dry run unless `FTF_TOWN_SEND=1` | `relayer/lib/town-traders.js`, `relayer/lib/clan-actions.js`, `relayer/market/daemon.js` |
| **Prices** | `relayer/market/prices.js`: each trader holds a shelf (starts 120 units per good, makes 80/hour, max 240); price = base × scarcity `(120/stock)^0.4` × demand, kept between 0.5× and 2× base; the reason travels with the trade; bankruptcy under 40 silk closes a stall (half pace, reopens above 120); `invest_stall` revives it | `relayer/market/prices.js`, `docs/town-economy.md` "Inventories, prices and closed stalls" |
| **Clan strategies** | LLM layer (NEAR AI Cloud via the relayer's TEE path, hourly, bounded numbers) with a scripted fallback; every decision logged to `relayer/data/clan-decisions/` and labelled | `relayer/lib/clan-strategy.js` |
| **Pulse and Lab** | `game/public/pulse.html` (reads `pulse()`; "not deployed yet" until then; the QA picture uses sample numbers), `/economy-lab.html` plays `tools/town/fast-week.mjs` (21,900 trades/day, no stall closes, purses ~520 to ~1,900 silk), in-game ticker behind `?town=1` | `game/public/`, `tools/town/` |
| **Main's own model** | `tools/town/sim.mjs`: 22,010 / 22,032 / 22,151 tx/day for 50 / 200 / 1,000 players, fees 46 silk/day, ceiling binds (0.14% at 1,000), pledged at day 30 6,100 / 10,400 / 27,500 silk | `docs/town-economy.md` "Model" |
| **Tournament (client)** | A labelled local simulation: weekly schedule, "no money, no prizes", trophy badge. **The moment silk is paid for rank on chain, that label and `docs/decisions.md` must say "silk, a testnet game resource, no money"** | `game/src/ui/tournament*.js` |
| **Memory shards, season seals** | Live on testnet: `ftf-shards.testnet` (NEP-171, no approvals), `ftf-seasons.testnet` (`commit_season`, `reveal_leaf`, `get_season`), season `793f6c05e89839f2` | `contracts/memory-shard`, `contracts/season-commit`, `docs/near.md` |
| **Not built** | Descents / Attention, station deeds (their 12% collects in a silk bucket), the Charter, catalyst shards, deed escrow, on-chain items (NEP-245 roadmap) | `docs/town-economy.md` |
| **NEP-141** | **Absent and not planned**: there is no fungible token to wrap | `rg ft_transfer` |

Accounts on testnet today: `ftf-seasons.testnet`, `ftf-shards.testnet`, owner/coordinator `ftf-coordinator.testnet`, guest fund `guests.ftf-coordinator.testnet` (balance and per-guest cost to be read live before any audience launch [VERIFY]). Funding the trader accounts and deploying `ftf-town` are **OWNER-GATED**.

---

## 2. Design

### 2.1 Three separated layers, one currency (a reference design idea, adapted)

a reference design keeps fuel, earnings and ownership apart; mixing them is what makes a game feel like a casino. FTF keeps the separation without a second fungible token:

| Layer | FTF name | Role | Behaviour |
|---|---|---|---|
| Fuel | **Attention** (P2, not built) | A **meter**, not a token: it burns while Iris is outside the walls or in a Shell ("memory and attention melt while you look into the future") | non-transferable, not stored as a balance anyone can hold; 10 free per day; extra units are bought **for silk** (60% burned, 40% to the Shell Reserve) |
| Earnings | **Silk** | The one fungible resource: price unit of the market, tournament entry and payouts, what is pledged | sources and sinks in §2.2; moves only inside the town contract (`trade`, entry, pledges, payouts); no transfer function between players |
| Ownership | **Deeds** (NEP-171, built), **memory shards** (live), **Charter / station deeds** (P2) | What a player *owns* and can hand over whole | a deed is a position; transferable as a whole; approvals disabled; escrow marketplace is P2 |

The layers stay meaningful with one currency: Attention is spent *in silk* but is itself not held or traded; ownership is NFT, never a balance. If the Attention layer is not built before the freeze, nothing else depends on it.

### 2.2 Silk sources and sinks, and why there is no inflation loop

**Sources (the only ways silk enters; every one bounded):**

| # | Source | Bound (contract rule on `main`) | 30-day base case |
|---|---|---|---|
| 1 | **Genesis** | `genesis(traders, silk_each)`, owner, once: 1,000 × 20 traders | 20,000 (day 0) |
| 2 | **Season mint** into the purse at `settle_season` | `min(12,000, 1,000 + 0.8 × last season's burn, 24 × entrants)` per season | 6,025 (6 seasons: 492 / 1,194 / 1,636 / 1,023 / 867 / 813) |
| 3 | **Entry credit** `credit_entry` for each new guest (40, spendable only on tournament entry, not sellable) | coordinator, shared daily ceiling 4,000 silk with `credit_silk` | 8,000 |
| 4 | **Wages / corrections** `credit_silk` | coordinator, same ceiling; **default off in our plan** | 0 (3,789 over 90 days if switched on to replace the fee drain) |
| 5 | **Story credits** `credit_silk` with reference `story:…` (quest, bounty, kill rewards, arrival stipend) | coordinator; its own **`story_day_cap`** (or the shared ceiling, §2.13.4); per-account lifetime cap ≈ 1.1 × P + stipend; **spent only on the gate until it is paid** (protected balance in the model); the gate burns P | 200 humans / 30% finishing: **19,375 minted, 11,350 burned at the gate** |

There is no other source: pledges, claims, trades, payouts and `invest_stall` only move silk.

**Sinks (burned):** 20% of every tournament entry fee, 15% of the fee tithe, the 0.5-silk deed fee, half of any early-exit penalty, Attention (60%), half of lost descent cargo, Charter (60%) (the last three are P2), and **the portal gate: 100% of the price P, once per account** (rev 4). Base-case 30 days: entries 2,377, Charter 1,029, tithe 178, Attention 155, deed fees 156, cargo 16, penalties 6 (P2 items are the modelled extras). Net silk per day after day 10: **minted 217 vs burned 132**.

**Inflation-loop analysis (what could feed on itself, and why it does not):**

| Loop | Mechanism | Verdict | Evidence |
|---|---|---|---|
| **L1 Reward compounding** | rewards → re-pledged → bigger pot | **None.** Rewards are *transfers* funded by fees (silk already in circulation) and capped at 0.15%/day of weight; they do not create silk | conservation test; staker pot 27 silk/day available, ~11-13 paid |
| **L2 Wages ↔ fees** | if `credit_silk` wages exactly replace the fees the traders paid, stakers are effectively paid by minted silk | **Closed, not compounding.** Wages = fees (~42 silk/day), volume is scripted at a fixed count, so no feedback. Cost: supply +3.8k in 90 days (+10.7% over the no-wage case) | `13_wages_stalls.png` left; `results.json` `wages`. With wages **off**, trader purses fall from a mean ~790 to ~690 in 90 days (poorest 413), no stall closes: **keep wages off; use `credit_silk` only when a stall is closed or mean purse < 600** |
| **L3 Mint ↔ burn** | burn funds next season's mint (0.8×) | **Gain < 1 and bounded.** Burn depends on entrants (20% × 40 each), not on balances; mint is also capped by 24 × entrants and 12,000 per season | sensitivity "mint cap 3,000": supply at day 30 29.2k vs 30.2k, rate unchanged |
| **L4 Entry credit farming** | free credit → free entries → payouts | **Not new emission** (mint follows the burn-match, not the number of accounts) but a **transfer from honest players** to farms; credit itself is minted (40 per account) | §5.5 sybil table |
| **L5 Story faucet** (rev 4) | the story pays P = 200 silk (+ stipend) per finisher and **partial** silk to the players who abandon it | **Real, bounded.** Finishers' silk is burned at the gate; **abandoners keep their partial silk** (8-12k at 200 humans / 30% finishing), which is why supply ends at ×1.28 rather than ×1.0. At P = 10,000 the same faucet would give supply ×6.5 (195k at 10% of 200 players, 671k at 30%): that is why the price is lowered. Controls: gate burn, per-account lifetime cap, `story_day_cap`, protected-until-paid, relayer replay | `gate_results.json` `sweep`; `15_gate_sweep.png`; rev-3 `bridge` result kept as the P = 10,000 reference |
| **L6 Stall pledges** | `invest_stall` moves silk into working capital | **Transfer only**; the investor's silk is not returned, the fee share is small (22.8 silk back on 115 pledged in 30 days) | `stall_pledge` |

**Recommended contract parameter changes (via `set_params`, owner; revised in rev 4):** (1) `credit_day_cap` **4,000 → 6,000** if the contract keeps one shared ceiling, or keep 4,000 for wages/entry credit and add a **separate `story_day_cap` of 6,000** (a contract change that is needed anyway for `pay_gate`); the rev-3 advice "lower to ~200" is **withdrawn**, because a story faucet that must credit ~3,250 silk on its peak day (200 humans, 30% finishing; 1,470 more for entry credit) is blocked for weeks by a 200 ceiling (median delay 21 days; 14% of finishers through by day 30) [VERIFY the bound in `Params::valid`: it only rejects values above 100,000]; (2) `season_mint_cap` **12,000 → ~3,000** stays (peak season mint 1,766 at 200 humans with the story, 4,476 at 1,000: raise to ~5,000 if more than ~600 humans are expected); it is the guard rail, not a lever; (3) new bounded param `gate_price` = **200**, valid range 20-5,000, `set_params` only between seasons; (4) gate burn kept in its own counter so it does **not** feed next season's mint-match (otherwise mint is ~30% higher: 10.8k vs 8.3k over 30 days at 200 humans). The full cap derivation is §2.13.4.

### 2.3 The four town works and the pledge (as built on `main`)

| Asset (works) | Fiction | Base share of the staker pot | Own stream |
|---|---|---|---|
| **Loom House** | The looms spin the town's cloth; its stall trades are the market's backbone | 35% | |
| **Caravan Guild** | Carts between the islands and the lower gate | 25% | |
| **Archive & Translation Guild** | Iris's own trade: translating the Guests' signs and shard inscriptions | 25% | (P2: a translation fee paid in silk) |
| **Shell Observatory** | Watches the Shells and the World Tension from the shrine | 15% | **15% of every tournament entry fee** |

Clan wallets pledge by their home works (Salt → Caravan Guild, Frost → Shell Observatory, Iris and Moss → Archive, Ash and Amber → Loom House), up to 30% × risk of their silk.

A **pledge** locks silk in one works for a tier: **flex (0 days; after the lock a 2-day cooldown without rewards), 5, 10 or 20 days**, with reward weights **1.00 / 1.15 / 1.30 / 1.50**. Weight `w = principal × m_tier`. The staker pot of each works is split by weight. There is **no emission to stakers**: the pot is the 65% of the fee tithe, plus the Observatory's entry stream, plus half of any early-exit penalty.

Safeguards written into the rules, not into a promise:
- **Rate ceiling** `rate_ceiling_bps = 15`: a works pays at most **0.15% of its weight per day** (owner-tunable by `set_params`); the excess goes to the purse. With silk-only balances the ceiling is the *operative* rate in every scenario of §5 (it binds on 100% of days), so what the fee flow decides is only whether the ceiling is reached; the Pulse page must show the measured rate, not the ceiling as a promise.
- **Caps per account**: `min(8,000, max(800, 5% × TVL))`, per works `min(3,000, that)`; the Charter (P2) raises it ×1.5.
- **Deed fee** 0.5 silk burned per new deed (spam brake). Storage for a deed is paid by the town if no deposit is attached (function-call keys cannot attach NEAR).
- **Display**: "reward rate, variable: *x* silk per 100 pledged per day, last 7 days, can be zero". The annualised figure belongs only in the Economy Lab with the caveat that 30 days say nothing about a year.

Slashing: **no principal is slashed.** Real risks: (a) the variable rate falls when trade volume drops or when the pot is shared with a bigger TVL (fee 0.06% → 0.143%/day; a whale without caps → 0.064%); (b) early exit costs 10% of principal; (c) the stall pledge (`invest_stall`) is *not* returned. A "Storm" day (an Observatory works pays nothing on a sealed storm leaf; verifiable against `season-commit`) is a P2 idea; it risks only that day's reward.

### 2.4 Treasury and fee flow (a reference design's "Crown Treasury" idea, in silk)

```
every market trade (silk) ──fee 0.12%──► Town Treasury (silk)           [stall investors first: 50% of that stall's fee, claim_stall]
                                          │
        sweep_fees(), once an epoch:      ├─ 12% ─► station bucket (6 station deeds, P2; collects until built)
                                          └─ 88% ─┬─ 65% ─► staker pot ─► four works by base share 35/25/25/15 (renormalised)
                                                  │              each works capped at 0.15%/day of its weight; excess ─► purse
                                                  ├─ 10% ─► tournament purse
                                                  ├─ 10% ─► Shell Reserve (pays descent cargo, P2; unspent flows to the purse at season end)
                                                  └─ 15% ─► burned
tournament entry (40) ─ 20% burned, 15% Shell Observatory stakers, 65% purse        early exit ─ 10% of principal: 50% burned, 50% to the works' other stakers
Attention (P2) ─ 60% burned, 40% Reserve                                            Charter (P2) ─ 60% burned, 40% purse
```

The silk that stakers receive was paid by the traders and players as a fee: **no new silk appears on the way**. The only mint on the staker path would be wages (L2), and we keep them off.

### 2.5 Price discovery without a pool: goods priced in silk

There is no pool: with one currency there is nothing to "price" silk against; silk is the unit of account. What is discovered, and how:

| What | Mechanism (all on `main`) | Why it is enough |
|---|---|---|
| **Goods** | `prices.js`: price = base × scarcity `(120/stock)^0.4` × demand (45-minute half-life moving average vs the usual pace), **clamped to 0.5×-2× base**; buyers weight choices by `(base/price)^2`; supply answers (up to 2× faster when dear, up to 3× when the stall is poor). Every trade carries a **reason** ("dear: only 3 salt left, demand rose") | continuous, explainable quotes with scripted but responsive participants; the clamp bounds any manipulation (buying out a stall can double a price, no more); the Economy Lab replays it |
| **Merchants' prices** | each trader prices its own goods in silk from its shelf; bankrupt stalls (under 40 silk) close, reopen above 120 | the town has a visible failure mode and a quest hook |
| **Stall capital** | `invest_stall(trader, silk)`: a pledge of silk into a stall's working capital, half the stall's fee (`stall_fee_bps` 5,000) to investors, `claim_stall` | the *only* liquidity-provision analogue: not a loan, no return of principal; model median −78% over 30 days, so it is a **quest and pride mechanic, never marketed as income** |
| **The pledge rate** | measured, capped at 0.15%/day, can be zero (§2.3) | not a price: a published variable |
| **Deeds** | bilateral, **priced in silk**, through the P2 escrow contract (`nft_transfer_call`); no approvals | the same silk, no second token; transfer semantics §2.6 |

Rejected options: a **constant-product pool** needs two fungible legs; with one currency there is no second leg, and a pool of silk against silk is meaningless. An **order book** needs per-order storage and active makers (200 humans over two days face an empty book). A **bonding curve** is an issuance mechanism that invites pump patterns. A **second fungible token** (or a NEP-141 facade) is exactly what the owner removed.

**Whale exit without a pool.** There is no price to crash: a whale that unbonds only (a) pays a 10% penalty if early, half burned, half to the others, and (b) removes TVL, so the rate per unit rises until the 0.15% ceiling (it is already there). Simulated: 3 whales unbond on day 15: rate 0.150%, TVL 9,200 vs 9,500 without exit.

### 2.6 Deed NFTs (NEP-171): what transfers, and the threat model

**One deed per pledge** (`stake` mints, `finish_unbond` burns). Token id `deed-<season_id>-<n>`; `extra` (all on-chain, rendered SVG like `shard_svg`) carries `kind: "town_deed"`, `asset`, `principal` (silk, micro-units), `tier`, `opened_day`, `locked_until_day`, `season_id`, `schedule_root`, `state` (`active|unbonding`), `unbond_ready_day`, `pending`. `season_id` and `schedule_root` tie the deed to the sealed season, exactly as shards are tied. Optional **catalyst shard** (P2): `nft_transfer_call` of one `ftf-shards` token locks it inside the deed for +10% weight (capped, never decisive).

**Transfer semantics (a rival entry's "sell the business"):** `nft_transfer` moves the **whole position**: principal, remaining lock, unbonding clock and accrued rewards. No partial transfer. Built rules (`main`): allowed in `active` and `unbonding`; **`exit_early` is blocked for a day after the deed changes hands**; **approvals (NEP-178) are rejected**, as in `ftf-shards`; a marketplace, if any (P2), is an escrow contract using `nft_transfer_call` that passes an `expected_state_hash`; the receiver's per-account cap is checked at transfer [VERIFY in `lib.rs`: `ERR_CAP_RECEIVER`-style check].

**Threat model:**

| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | Same-epoch stake → sweep → claim → unstake to capture a distribution | weight from the next epoch [VERIFY on `main`; the simulation credits same-day weight]; flex cooldown 2 days; deed fee; lock tiers | stake then distribute in the same epoch earns 0 |
| T2 | Reward rounding drift / reward > pot | `u128` micro-units, dust stays in the treasury, invariant Σclaims ≤ Σpots | property test: conservation |
| T3 | Double withdraw / replay | deed burned in `finish_unbond`; state guards (`active→unbonding→burned`) | double call panics |
| T4 | Reentrancy through callbacks | single contract: state written before any `Promise`; `nft_resolve_transfer` restores owner only | `nft_transfer_call` rollback test |
| T5 | Seller front-runs a sale by `begin_unbond` | state is part of the transferable object and of `expected_state_hash` (P2 escrow); 1-day no-early-exit after transfer | escrow test |
| T6 | Whale capture / splitting into many accounts | per-account cap `min(8,000, max(800, 5%·TVL))`, per-works 3,000; splitting gains nothing because reward is linear in weight (but cap-splitting does get around the cap; weight per account is the only defence, and each account costs a 0.5-silk deed fee and a guest slot) | cap tests; §5.4 |
| T7 | Wash trading to harvest rewards | fee paid on every trade; the washer recovers at most 0.572 × share of weight < 1 | EV test; §5.5 |
| T8 | **Price manipulation of goods** (replaces AMM sandwiching) | price band 0.5×-2× base, scarcity exponent 0.4, stock refills 80/hour, 3× supply boost: emptying a stall costs real silk and moves the price at most 2× | `prices.js` tests; Lab |
| T9 | Sybil farming of tournament silk | entry credit only via `guests` (daily cap), non-sellable; **credit-funded entries are a real leak (§5.5)**: mitigations §2.11 | sim §5.5 |
| T10 | Coordinator abuse: `credit_silk`, `credit_entry`, `settle_season` are trusted calls | on-chain per-season mint ceiling computed by the contract; 4% per-account payout cap; daily credit ceiling (lower it, §2.2); every payout batch logged with `payouts_hash`; testnet key only; TEE/multisig later | over-mint panics |
| T11 | Key leakage of 20 trader keys on the relayer | function-call keys restricted to `trade` with a small allowance; per-wallet daily NEAR cap; kill switch; rotation script | key scope test |
| T12 | Metadata/SVG griefing or storage drain | fixed-length SVG built from numbers, never from user strings; town pays storage only when none is attached (watch the drain) | fuzz |
| T13 | Admin changing the rules under players | `set_params` bounded by `Params::valid`, event + parameter hash; **no timelock and takes effect immediately**: change only between seasons by policy, and log it on the Pulse page | param bounds test; **gap**: see the reference project teardown C6 |
| T14 | Story-credit abuse: forged or botted story progress, or a stolen coordinator key crediting `story:` silk | `story_day_cap`, per-account lifetime cap ≈ 1.1 × P + stipend, per-account day cap 0.5 × P, relayer replay of the signed log (Story TZ Q4/E2), min account age, `guests` daily cap; every credit logged with its `reference` | cap test, replay test (§2.13.5) |

### 2.7 Shell Descent: Attention, Greed and World Tension (P2, not built; modelled in silk)

A **descent** is a trip outside the town walls (the hillside packs that already exist; later, Shell interiors). Iris must **return alive** to bank the cargo.
- **Attention** burns per descent: `A = 6 + 10·g` units, `g` ∈ [0,1] is **Greed**, chosen at the gate. 10 free per day (14 with a Charter); extra costs 0.5 silk per unit.
- **Cargo**: `R = 3·(1 + 1.5·g)` silk, **reserved** from the Shell Reserve when the descent begins (limited by what the Reserve holds, so extraction can never inflate).
- **Fail probability**: `p = clip(0.08 + 0.55·g·T/100)`, **T is the engine's World Tension** (`S.H`, 0-100). On failure the cargo is lost (50% burned, 50% back to the Reserve); **pledged silk, deeds, shards and liquid silk are never touched**.

Expected net value per run (formulas; fuel in silk): g=0 → 2.76 at every T; g=0.5 → 4.04 / 3.61 / 3.17 at T=20 / 50 / 80; g=1.0 → 3.08 / 1.84 / 0.60. Greed 0.5 is best on this grid at every tension; full Greed stops paying as tension rises. **Important in the silk-only model:** the Reserve is funded by 10% of the fee tithe (~4 silk/day) plus Attention purchases, so it **cannot** pay ~1,600 descents × 3-7.5 silk: in the run, cargo is paid only from what the Reserve holds (201 silk paid in 30 days; ~86% of runs extracted alive; Attention 258 silk bought). A descent faucet bigger than that needs a bigger Reserve share, which is an owner-gated parameter, not a hidden mint. Outcome attestation is the weak point: the contract cannot run the engine, so `settle_descent(id, outcome, history_hash)` is coordinator-signed (P1); the room's command history is the audit trail.

### 2.8 Clan station deeds and the Charter (P2, modelled for flows only)
- **Station deeds**: six NEP-171 deeds, one per clan (Iris, Salt, Ash, Moss, Amber, Frost), receiving the 12% station tax. In the model the bucket holds **162 silk after 30 days** (not income; **do not market it as income**). Until the deeds exist the silk waits in the bucket; that bucket is also the natural **Season 3 treasury** for the testnet demonstration (§2.13, Story TZ §9).
- **Charter**: a licence NFT (40 silk, 60 per season) that raises limits (stake cap ×1.5, Attention 14/day). **No yield multiplier and no combat power**: access, not advantage.

### 2.9 NPC traders as market makers
The 20 trader accounts (13 townsfolk, 7 clan traders) are the owner's decision; the design gives them an economic job:
- Townsfolk trade silk for goods at posted prices (the volume that pays the fee); each trade is one `trade` call, the price carries its reason.
- Clan wallets **hold pledges** (600 silk each in the model; `clan-actions.js` pledges up to 30% × risk), enter the tournament and claim; their **strategy** (risk/buy/favour) may come from the LLM layer, always labelled; **moves are made by the rules engine** in both cases.
- Honest label (the a rival entry lesson): README and UI say which parts are scripted. At ~22k tx/day, log a daily Merkle root plus a sample to `agent-ledger`, not each trade.
- Silk faucet: **none by default.** The traders are endowed once with 1,000 silk each and pay fees out of it; this is a **designed budget**, not organic demand, and the docs must say so. Over 90 days the 47.7 silk/day fee drain takes the mean purse from ~790 to ~690, no stall closes. `credit_silk` wages are the lever if that ever changes (L2).

### 2.10 Seasons and the sealed commit
- A **season** is the unit of resets (5 in-game days in the model). Silk balances, pledges and deeds **persist**; what resets is the purse (carry-over of what the 4% cap leaves stays in), the Shell Reserve (unspent flows to the purse) and the epoch.
- `open_season(season_id, schedule_root)` records the sealed root and last season's burn; `settle_season` pays ranks in batches with `payouts_hash`; `last` closes it. The coordinator attests the ranks; the hash of the full list is logged. A result a judge can check against `check_leaf`.
- Deeds opened in season *s* carry `season_id` and `schedule_root` for life.

### 2.11 Anti-exploit summary

| Attack | Defence | Evidence |
|---|---|---|
| Sybil entry farming | `guests` daily cap; credit non-sellable; mint bound to burn-match and participation (sybils dilute honest players, no new emission). **Open leak: credit-funded entries cost the attacker nothing.** Proposed: (1) credit pays only for the *first* entry per account and its payout is held until the account has one verified quest (Story TZ); (2) progressive entry fee per funding source (P2); (3) lower `credit_day_cap` (§2.2); (4) payout floor (30% equal share) only for accounts that have both entered and played a verified day; (5) monitor `entered_by_credit` share on Pulse | §5.5: K=100 free-credit bots take +3,481 silk/season (skill 0) |
| Wash trading | fee > recoverable share; leaderboard counts no trade proceeds | 20k wash tx/day cost 42 silk/day |
| Whale capture | dynamic cap, rate ceiling, receiver check | top-1% share 30% vs 61% |
| Whale exit | no pool, no price; early exit costs 10% | rate unchanged |
| Rate-chasing into tiny works | rate ceiling 0.15%/day | rate never exceeds it |
| Flash staking | next-epoch weight [VERIFY], cooldown, deed fee | T1 |
| Passive farming of the tournament | score must reward honest play: `docs/math/economy-report.md` §2.1 shows "doing nothing beats honest play" (passive 138 silk vs honest 76-95). If silk is paid for rank, scoring must not reward passivity | owner/engine decision (§11) |
| Story-faucet farming (bots earning P to get the whitelist pass) | gate burns P so the farm gains no silk; per-account day cap (≥ 2 calendar days to earn P), lifetime cap, relayer replay + minimum play-time in the log, guest cap; tournament route closed (§2.13.5) | `17_gate_sybil_sink.png`; `farm_seasons_to_P` |

### 2.12 Language and legal caution
Silk is a testnet game resource with **no sale for NEAR or any currency, no mainnet token, no transfer between players except a whole deed, no promised return**, and rewards that come only from in-game fee flows. This is not legal advice.
- Player-facing copy says **pledge**, **reward share**, **rate (variable, can be zero)**, **town works**. Do **not** use "invest", "APY", "yield farming", "profit", "dividend", "returns" in the game, README, X post or Pages. (`invest_stall` is the contract's method name; in the game say "back a stall" / "pledge to a stall".)
- Show the rate only as measured past data, with "can be zero". Never as a forecast.
- No silk-for-NEAR, no real-money prize, no token launch, no deposits. Real-value distribution (the Season 3 roadmap) only after legal and security review, as the project's TZ says.

### 2.13 The portal gate on chain: price, sink, caps, sybil (rev 4)

**2.13.1 What the owner decided, and why 10,000 does not work.** The portal is paid **on chain, in town silk, by `ftf-town`**, with no separate book. The Story TZ had priced it at 10,000 silk. On chain that number is not an honest balance: the whole silk supply is ~22k-30k at 200 players and the 4% per-account payout cap means nobody ever *wins* 10,000 from the purse (best payout in the model 128 silk; 402 at 1,000 players). Crediting 10,000 silk to each finisher gave supply 30,190 → **195,226** (10% of players finishing) and **671,044** (30%) with Gini 0.88, and the daily ceiling of 4,000 would need 50 days to admit the 200,000 silk of 20 finishers. So the price is **lowered** and every story reward scaled with it. An optional **display multiplier** (show "10,000 threads" = 50 × 200 silk) would restore the owner's original headline number. **It is not recommended**: it adds a second displayed unit next to "one currency, silk" and the explorer would show 200. Default is honest units: **"200 silk"**, with the portal narrative unchanged (the gate is the thing Iris crosses; the silk is what the town keeps as the toll).

**2.13.2 Contract design (`ftf-town`; spec for the contract lead, not built; *OWNER-GATED* to deploy).**
- `pay_gate(gate_id)`: caller pays the param `gate_price` (default **200**) from their **own silk balance** (not from entry credit); **100% burned**; once per account per `gate_id`; refused for scripted accounts (traders, clan wallets); emits NEP-297 event `gate_paid {account, gate_id, price, season_id}`; view `gate_paid_of(account) -> Option<{gate_id, price, block_timestamp}>`.
- The burn goes into a **separate counter `gate_burned`**, shown on Pulse, **excluded from the season mint-match** (§2.13.3 shows the cost of including it: +30% mint).
- Arrival: after `gate_paid` the relayer credits `credit_entry(40)` (first tournament entry on arrival) and the **stipend 0.05 × P = 10 silk** via `credit_silk` (reference `story:stipend`).
- Story rewards: `credit_silk(account, amount, "story:<id>")` by the coordinator after the relayer replays the signed log (Story TZ Q4/E2). Until the gate is paid, silk earned this way is **not spendable on `trade`, pledges or entries** (protected balance; model assumption, contract field `story_locked`). That rule stops the faucet silk being dumped into the market; it is what the simulation uses.
- The relayer reads **`gate_paid_of(account)`** for the whitelist-pass mint and for the cliffhanger eligibility (Story TZ §11). Nothing off chain decides eligibility.
- **Fallback.** If `ftf-town` is not deployed with passing tests by **Fri 13 Nov 14:00 Kyiv**, the gate runs as a **labelled local demo** (same price in the game, same scaled rewards, no on-chain proof) and the pass claim stays closed; the portal narrative is unchanged.

**2.13.3 Burn or treasury? Burn.** Same run (200 humans, 30% finishing, 30 days, 3 seeds), P = 200:

| Where the gate silk goes | Supply day 30 | Mean season purse | Season mint, 30 days | Staker rate |
|---|---|---|---|---|
| **Burn, own counter (recommended)** | **40,264** | 4,425 | 8,299 | 0.150 |
| Burn, counted in the mint-match | 42,481 | 5,131 | 10,799 | 0.150 |
| To the treasury (station / Season 3 bucket) | 51,391 | 5,921 | 9,908 | 0.150 (0.143 at P=300, 0.125 at P=500) |

Burn is the better sink: it removes the silk the story minted, keeps supply 22% below the treasury variant (and 28% above the no-story town), keeps the rate at the ceiling for every P up to 300 at the three audiences, and does not inflate the tournament purse. Treasury inflates the pot every season and, at larger P, dilutes the staker rate. The cost of burn: the Season 3 testnet treasury has to come from the station bucket and carry-over (162 + 4 + 82 silk at day 30), which was already the case. Burn also gives the gate a visible counter ("threads spent at the gate") for the Pulse page.

**2.13.4 The price sweep** (`run_gate.py`, silk-only model, conservation asserted; 4 seeds; supply is relative to the same town and seed without the story; rewards scaled by P/10,000; "peak" = peak daily coordinator credits incl. entry credit; delay = median days from arrival to a fully credited gate with `credit_day_cap` 4,000):

| P (silk) | Median min to P unscaled / **scaled** | 50 @10%: supply, Gini Δ, peak credit | 200 @30%: supply, Gini Δ, peak credit | 1,000 @60%: supply, Gini Δ, rate, peak credit | Delay at cap 4,000 (p90) / sized cap at 200 @30% |
|---|---|---|---|---|---|
| 100 | 5 / 102 | ×1.08, +0.01, 800 | ×1.15, −0.01, 2,925 | ×1.19, −0.04, 0.150, 17,114 | 1 d (2) / 3,700 |
| 150 | 5 / 102 | ×1.11, +0.01, 949 | ×1.22, −0.02, 3,727 | ×1.29, −0.04, 0.150, 22,638 | 1 d (2) / 4,700 |
| **200 (recommended)** | **5 / 102** | **×1.14, +0.01, 1,099** | **×1.28, −0.01, 4,540** | **×1.38, −0.04, 0.150, 28,022** | **1 d (2) / 5,700** |
| 250 | 5 / 102 | ×1.16, +0.02, 1,249 | ×1.35, −0.02, 5,392 | ×1.49, −0.03, 0.150, 33,553 | 1 d (2) / 6,800 |
| 300 | 5 / 102 | ×1.19, +0.06, 1,400 | ×1.40, −0.02, 6,214 | ×1.59, −0.04, 0.150, 39,044 | 2 d (3) / 7,800 |
| 500 | 6 / 102 | ×1.29, +0.10, 2,040 | ×1.66, −0.01, 9,503 | ×2.00, −0.02, 0.144, 61,177 | 5 d (7) / 11,900 |
| 750 | 10 / 102 | ×1.41, +0.13, 2,840 | ×1.98, +0.01, 13,956 | ×2.50, +0.02, 0.134, 88,923 | 8 d (12) / 17,500 |
| 1,000 | 12 / 102 | ×1.53, +0.15, 3,640 | ×2.29, +0.02, 18,181 | ×3.04, +0.03, 0.125, 116,841 | 11 d (17) / 22,800 |
| 1,500 | 13 / 102 | ×1.77, +0.18, 5,321 | ×2.81, +0.03, 26,153 | ×4.04, +0.04, 0.112, 172,264 | 15 d (23), 74% through by day 30 / 32,700 |
| 2,000 | 14 / 102 | ×2.00, +0.20, 6,952 | ×3.47, +0.04, 34,444 | ×5.12, +0.05, 0.102, 228,489 | 15 d (24), 55% through / 43,100 |

Reading the table against the four criteria:
- **(a) Meaningful goal.** With the **current** Story TZ faucets (quests 400 / 1,000 / 800 / 3,000, bounties, kills) a P of 300 or less is reached in **5 minutes** (the first quest pays 400) and 1,000 in 12: not a goal. **The faucet must be scaled by P/10,000**; then the focused-play median is **102 minutes (p10 68, p90 159)** for any P (4,000 simulated players, event-level model of the Story TZ pacing; 52% of the silk comes from the four quests). Time therefore does not choose P; the other criteria do.
- **(b) Healthy sink, sane supply and Gini.** P ≤ 250 keeps supply ≤ ×1.5 at all three audiences; from 500 the supply doubles at 1,000 players and the staker rate starts to fall (0.144 → 0.102 at 2,000). Gini stays within ±0.04 of the no-story town up to 300 at the two larger audiences; at 50 players it creeps up with P (+0.06 at 300, +0.20 at 2,000) because the few finishers are rich and the rest are abandoners. At P = 200 the gate burns **850 / 11,350 / 121,100 silk** by day 30 (against a no-story supply of 22.7k / 30.2k / 61.9k).
- **(c) Caps.** See below: P = 200 fits the default 4,000 ceiling at 200 players with a 1-day delay (99% of finishers through the gate in 30 days); from P = 500 the default ceiling delays the gate by 5+ days.
- **(d) Sybil.** §2.13.5: the free-credit tournament route needs 3 / 7 / 12 / 20 / 41 seasons for the best bots at P = 100 / 200 / 300 / 500 / 1,000 and never for average bots.

**Why 200 and not 100, 250 or 300.** 100 is two and a half entries and falls in the first three seasons of a competent free-credit bot; 200 is the first value where the best bot needs **7 seasons (35 days, longer than the hackathon)** and it is a round, explainable number (five entry fees). 250 is still acceptable (×1.49 supply at 1,000 @60%, the edge of the ×1.5 test) and costs 20% more in caps; 300 crosses ×1.5 and needs 2 days at the default ceiling; ≥ 500 fails (b) and (c). **Recommendation: P = 200** with a `set_params` range 20-5,000 so the owner can still move it before the freeze.

**Full matrix at P = 200** (4 seeds; 30 days; supply vs no story; gates paid by day 30; peak = peak daily credits; season mint = largest single season):

| Players / finishing | Supply day 30 | vs no story | Gini (no story) | Staker rate | Gates paid | Silk burned at the gate | Peak daily credits (story + entry) | Largest season mint (no story) |
|---|---|---|---|---|---|---|---|---|
| 50 / 10% | 26,329 | ×1.14 | 0.23 (0.22) | 0.150 | 4 | 850 | 1,099 (640 + 500) | 786 (570) |
| 50 / 30% | 25,800 | ×1.12 | 0.24 (0.22) | 0.150 | 15 | 3,000 | 1,399 | 768 |
| 50 / 60% | 25,332 | ×1.10 | 0.24 (0.22) | 0.150 | 29 | 5,800 | 1,878 | 762 |
| 200 / 10% | 41,523 | ×1.32 | 0.44 (0.46) | 0.150 | 17 | 3,300 | 3,272 | 1,785 (1,641) |
| **200 / 30%** | **40,264** | **×1.28** | **0.45 (0.46)** | **0.150** | **57** | **11,350** | **4,540 (3,250 + 1,470)** | **1,766** |
| 200 / 60% | 37,975 | ×1.21 | 0.46 (0.46) | 0.150 | 114 | 22,850 | 5,914 | 1,740 |
| 1,000 / 10% | 104,214 | ×1.65 | 0.48 (0.53) | 0.150 | 91 | 18,250 | 15,835 | 4,476 (4,285) |
| 1,000 / 30% | 98,014 | ×1.56 | 0.48 (0.53) | 0.150 | 300 | 60,000 | 21,055 | 4,429 |
| **1,000 / 60%** | **87,075** | **×1.38** | **0.48 (0.53)** | **0.150** | **606** | **121,100** | **28,022 (22,122 + 7,070)** | **4,335** |

Supply grows most when few players finish (more abandoners keep their partial silk: ×1.65 at 1,000 / 10%) and least when many do (the gate burns what they earned). The outlier 1,000 / 10% (×1.65) is the weakest cell: the rate and Gini stay fine, goods prices would feel it. Mitigations if it appears: lower the abandoner share by paying part of the story silk only at milestones, or `story_day_cap` lower; both are parameters, not new design.

**Caps recomputed for P = 200.** Required daily ceiling = **~1.25 × the peak day** (the model's peak incl. the 40-silk entry credit of every arrival):

| Audience | Peak day, story only + entry | Cap to use (×1.25, rounded) | With cap 4,000: median / p90 delay, finishers through by day 30 | With cap 200 |
|---|---|---|---|---|
| 50 @10-60% | 1,100-1,900 | **~1,400-2,400** | no delay | not simulated (peak is 1-2× the cap even here) |
| **200 @30%** | 4,540 | **5,700 → use 6,000** | 1 / 2 days, 99% | median 21 days, p90 25.6, **14% through by day 30**, 14,734 silk queue left |
| 200 @60% | 5,914 | ~7,400 | not simulated; the peak exceeds 4,000 | not simulated |
| 1,000 @60% | 28,022 | ~35,000 | not simulated; the peak is 7× the cap | not simulated |

So the **recommended `credit_day_cap` for the hackathon audience (≤ ~250 players) is 6,000**, or `story_day_cap` 6,000 with the wage/entry ceiling kept at 4,000 (preferred: the story faucet can be paused or lowered without touching wages and entry credit). `season_mint_cap` **3,000** still binds nothing at 200 humans (largest season 1,766-1,785). A per-account **day cap of 0.5 × P = 100** silk (simulated: peak credits −5%, median finish time 1 → 1-2 days) and a per-account **lifetime cap of 1.1 × P + stipend = 230** silk are the real abuse limits (T14). A stolen coordinator key can then credit at most 6,000 silk a day, ~15% of the supply.

**2.13.5 Sybil: what it costs to get the whitelist pass.** The pass is transferable, so it has value, and eligibility is `gate_paid_of`. Ways to reach it:

| Route | Cost to the attacker | Result at P = 200 |
|---|---|---|
| **Honest play** | ~102 min of play (p10 68, p90 159), one guest slot | the baseline |
| **Free entry credit through the tournament** (K bots, 40 free credit each) | free, then play seasons: first season nets +46 / +71 silk per bot (average / best), later seasons +0.8 / +24 (K=10), +3.8 (best bots at K=100) | average bots **never** (197 seasons at K=10, none above that); best bots **6 seasons at K=1, 7 at K=10, 9 at K=25, 43 at K=100** (5 days each: 30-215 days, longer than the hackathon). Higher P is linearly harder: 12 / 20 / 41 seasons at P = 300 / 500 / 1,000 for K=10 |
| **Scripting the story** (a bot plays Expedition T1/T2 quests, kills and bounties) | a guest slot + automation; **independent of P** (the price changes what the bot earns, not what it costs) | the only open route. The gate burns the silk, so the farm gains no silk, only the pass. Defences: (1) relayer replays the signed log and checks plausibility (kills per minute, path, time between quests) (Story TZ Q4/E2); (2) **per-account day cap 0.5 × P**: at least ~2 calendar days from first credit to gate; (3) lifetime cap ~230 silk; (4) `guests` daily cap and minimum account age; (5) protected silk is unspendable, so farms cannot convert it to market or tournament value; (6) cap the number of whitelist passes minted per day [VERIFY: Story TZ §11] |
| **Buying story silk** | impossible: no transfer function, silk moves only by `trade` between registered traders and whole deeds | closed |

Because the pass is the prize, the first sybil defence is the *relayer's replay*, not the price; lowering P from 10,000 to 200 does not make a verified-play farm cheaper, because the cost is play time and a guest slot, and the burn means a farm that finishes still cannot sell silk (it has none). It does make a **forged** log cheaper to monetise per credit, so the per-account caps above are mandatory, not optional.

Charts: `14_gate_pacing.png` (time to P), `15_gate_sweep.png` (supply, Gini, rate, peak credits against P), `16_gate_caps.png` (delay against cap), `17_gate_sybil_sink.png` (seasons to P by free credit; burn vs treasury), `18_gate_timeline.png` (supply and credits over 30 days at P = 200).

![gate pacing](ftf-economy-charts/14_gate_pacing.png)
![gate sweep](ftf-economy-charts/15_gate_sweep.png)
![gate caps](ftf-economy-charts/16_gate_caps.png)
![sybil and sink](ftf-economy-charts/17_gate_sybil_sink.png)
![timeline at P=200](ftf-economy-charts/18_gate_timeline.png)

**Season 3 testnet treasury.** The Story TZ's Season 3 distribution (linear by rank, Option B) needs an amount set aside by rule. In silk it is the station bucket plus unspent Reserve and purse carry-over (162 + 4 + 82 silk at day 30 in the base case): a symbolic amount, labelled testnet. The gate burns, so it does not feed the treasury.
**Honest weakness.** The story credits are only as honest as the relayer's replay of the log; the on-chain parts (price, burn, `gate_paid_of`) are exact. The simulation's story model (completion probability, abandoner shares, FIFO credit queue) is an assumption set, not measured human behaviour: [VERIFY] with the first 20 real testers.

---

## 3. Formulas (silk, as in `contracts/town/src/rules.rs` and `docs/town-economy.md`)

- **Trade fee**: `fee = φ·silk`, `φ = 0.0012`, from the caller's amount to the treasury; minimum trade 0.5 silk, no self trades.
- **Station-investor share**: for a stall with invested silk, `stall_fee_bps = 5000` (50%) of the fee of that stall's sales is shared among its investors by invested silk; the rest follows the treasury path.
- **Sweep** (once an epoch): `T = treasury`; `station = 0.12·T`; `R = 0.88·T`; `stake_pot = 0.65·R`; `purse += 0.10·R`; `reserve += 0.10·R`; `burn 0.15·R`.
- **Pledge weight**: `w_i = principal_i · m_tier(i)`, `m = (1.00, 1.15, 1.30, 1.50)`.
- **Works pot**: `pot_a = min(ω_a·stake_pot + stream_a, r_max·Σ_i w_ia)`, `r_max = 0.0015` per day; `reward_i = pot_a · w_ia / Σ w_a`; the overflow goes to the purse. `ω = (0.35, 0.25, 0.25, 0.15)`, renormalised over works that have weight; `stream_Observatory = 0.15 · entry fees`.
- **Displayed rate** (never promised): `rate_7d = (Σ_7d pot paid) / (7 · mean weight)`; per 100 silk: `100·rate_7d`; annualised-equivalent `365·rate_7d` only in the Economy Lab.
- **Rate when the ceiling does not bind**: `rate ≈ 0.65 · 0.88 · φ · V / W` (V = silk volume per day, W = total weight): linear in fee and volume, inverse in TVL. With the base figures V ≈ 39,750 and W ≈ 8,900 it is 0.31%/day, above the 0.15% ceiling, hence the ceiling decides.
- **Season mint**: `M_s = min(12,000, 1,000 + 0.8·Burn_{s−1}, 24·n_s)`.
- **Purse payout**: `pot = purse + M_s`; 30% split equally among entrants; the remaining 70% over the top 60% by rank with weight `k^(−0.6)`; per-account cap 4% of the pot, one redistribution pass; what the cap leaves stays in the purse (`tools/town/settle.mjs`, `planPayouts`).
- **Stake cap**: `C = min(8,000, max(800, 0.05·TVL))`; per works `min(3,000, C)`.
- **Early exit**: `penalty = 0.10·principal`: 50% burned, 50% to the works' other stakers.
- **Price** (goods): `p = base · (120/stock)^0.4 · demand`, clamped to `[0.5·base, 2·base]`.
- **Descent (P2)**: `A = 6 + 10g`, `fuel = max(0, A − free)/2` silk, `R = 3(1 + 1.5g)`, `p_fail = clip(0.08 + 0.55·g·T/100, 0, 0.9)`; failure: `0.5R` burned, `0.5R` back to the Reserve.
- **Wash EV**: attacker with weight share `s` and silk volume `V`: net `= −φ·V·(1 − 0.65·0.88·s)`, always negative because `0.572 < 1`.

---

## 4. Parameter table

Contract values are `Params::default()` on `main`; the model values marked *(model)* are behaviour assumptions of the simulation, not contract rules.

| Parameter | Value | Meaning |
|---|---|---|
| `days` / season length | 30 / 5 | simulated days; 6 seasons |
| humans / traders | 200 (also 50, 1000) / 20 (13 townsfolk + 7 clan) | *(model)* population; trader count is the owner's decision |
| trades per trader per day | 1,000 | owner decision; model Poisson; humans add 25 per active human per day *(model)* |
| mean trade | 1.75 silk | `docs/town-economy.md` |
| trade fee φ | 0.12% | contract |
| station tax | 12% of the treasury | contract (P2 bucket) |
| tithe split | stakers 65% / purse 10% / Reserve 10% / burn 15% | contract, on the 88% |
| `stall_fee_bps` | 5,000 | contract, owner-tunable |
| lock tiers / weights | flex 0 d, 5, 10, 20 d / 1.00, 1.15, 1.30, 1.50 | contract; 2-day cooldown |
| early-exit penalty | 10% (50% burned, 50% to others) | contract |
| deed fee | 0.5 silk burned | contract |
| `cap_total / cap_floor / cap_share / cap_asset` | 8,000 / 800 / 5% of TVL / 3,000 | contract |
| `rate_ceiling_bps` | 15 (0.15%/day of weight) | contract, owner-tunable |
| works base shares | 35 / 25 / 25 / 15 | contract (Loom / Caravan / Archive / Observatory) |
| entry fee | 40 silk (entry credit first): 20% burned, 15% Observatory, 65% purse | contract |
| entry credit per new guest | 40 | `credit_entry`, shared ceiling |
| `credit_day_cap` | 4,000 silk/day (valid up to 100,000) | contract; **recommended 6,000 for ≤ 250 players, or a separate `story_day_cap` 6,000 (§2.13.4); the rev-3 advice of 200 is withdrawn** |
| `gate_price` (new) | **200 silk**, range 20-5,000 | `pay_gate`; burned 100%, once per account (§2.13) |
| `story_day_cap` / per-account caps (new) | 6,000 per day; per account 100 per day (0.5 × P), 230 lifetime (1.1 × P + stipend) | recommended, §2.13.4 |
| `season_mint_cap` | 12,000 default; **~3,000 recommended** (~5,000 above ~600 humans) | contract |
| story rewards (Story TZ) | scaled by P/10,000: quests 8 / 20 / 16 / 60, bounty 6 then 0.6, kills 0.2 / 0.5 / 1.2 / 4, stipend 10 | Story TZ §3 |
| season mint | `min(12,000, 1,000 + 0.8·burn_prev, 24·entrants)` | contract |
| payout rule | 30% equal / 70% to top 60% with `k^-0.6` / 4% cap | `planPayouts` |
| genesis | 1,000 silk per trader | `genesis` |
| stall bankrupt / reopen | 40 / 120 silk | `prices.js` |
| purse noise and restoring force | sd 47, 5%/day (closed stall 2%/day) | *(model)*, calibrated to purses 560-1,560 in main's run |
| human pledge share | 30% of winnings, ±0.3 per unit of rate above 40%, clipped 10-80% | *(model)* from `docs/town-economy.md` |
| human behaviour | 65% of joined players enter a season; 60% active a day; 40% pledges renew | *(model)* |
| clans | 7 pledge 600 silk each at day 0, compound daily | *(model)* from `docs/town-economy.md` |
| Descent (P2) | `A = 6 + 10g`, cargo `3(1+1.5g)`, `p_fail = 0.08 + 0.55·g·T/100`, 50% of lost cargo burned | *(model)* |
| Charter (P2) | 40 silk (60% burned), 60 per season, cap ×1.5 | *(model)* |

---

## 5. Simulation

### 5.1 Method

Python, daily steps, agent level (`/workspace/ftf-economy/econ_sim.py`, `run_all.py`; model rewritten for the single-currency design; the previous two-currency version is kept as `*_v1.bak`): 200 humans who join over 10 days, 20 trader accounts whose purses random-walk around their endowment, four works with four lock tiers, tournament seasons of 5 days with the contract's mint and payout rule, optional descents and Charters (P2), stall pledges, whales and sybils as scenarios. Humans pledge a share of what they win, claim every 1-5 days, renew locks with 60% probability and may panic-exit when the measured rate collapses. **Conservation is asserted every day** (`minted − burned = Σ balances + pledged + pending + unbonding + buckets`; max error 1e-11). 8 seeds for the base case, 5 for scenarios, 3-4 for sensitivity; median and p10-p90 bands. The model is a design tool, not a forecast (§5.6).

Reconciliation with `main`'s own model (`tools/town/sim.mjs`, 200 players): tx/day 22,862 here (humans trade 25 times a day; main counts the traders) vs 22,032; fees 47.7 vs 46 silk/day; staker rate at the ceiling in both; pledged at day 30 7,160 here vs 10,400 (main's players pledge more of what they win); silk minted for purses in 30 days 6,025 vs 7,682; purse paid ~640 vs 688 silk/day. Same order of magnitude, same conclusions.

### 5.2 Base-case charts
- `ftf-economy-charts/01_supply_traders.png`: supply and TVL; trader purses (no stall closes in the base case).
- `ftf-economy-charts/02_rate_tvl.png`: **variable reward rate** (flat at the ceiling), TVL and weighted TVL, pledged silk per works.
- `ftf-economy-charts/03_tx_per_day.png`: **real tx per day** by action, with the 20,000 line.
- `ftf-economy-charts/04_gini_wealth.png`: Gini over time and final wealth histogram.
- `ftf-economy-charts/05_sinks_sources.png`: 30-day sources vs sinks; net supply growth per day.
- `ftf-economy-charts/06_returns.png`: staker outcome distribution; stall-pledge outcome.
- `ftf-economy-charts/07_descent_greed.png`: tension, survival, Greed EV, descent flows (P2).
- `ftf-economy-charts/08_audience.png`, `09_whale_caps.png`, `10_sensitivity.png`, `11_attacks.png`, `12_purse_tiers.png`, `13_wages_stalls.png`.
- `14_gate_pacing.png` to `18_gate_timeline.png`: the portal gate (§2.13).

![supply and traders](ftf-economy-charts/01_supply_traders.png)
![rate and TVL](ftf-economy-charts/02_rate_tvl.png)
![tx per day](ftf-economy-charts/03_tx_per_day.png)

Reading them:
- **Rate**: pinned at the 0.15%/day ceiling from day 3 on. The fee-funded pot available to stakers (27 silk/day) is more than twice what the ceiling lets out (~11-13 silk/day on ~8,900 weight); **2,184 silk in 30 days overflow to the purse** (including most of the Observatory's 15% entry stream). So the staking budget is a *ceiling decision*, not a fee outcome; the fees only fund it.
- **TVL**: 4,200 at genesis (clans) → 7,160 at day 30 (24% of supply). Humans' median liquid balance is ~28 silk: entering costs 40 and pledges are 30% of winnings, so humans stay small; the account caps never bind without whales (0 cap hits).
- **Supply**: 21.7k → 30.1k by day 30 (the 8,000 credits and 6,025 season mint are most of it), then +78 silk/day.
- **Inequality**: 0.45 among humans at day 30; early days are a small sample.

### 5.3 Transactions per day (owner target ~20,000, every tx a genuine action)

| Action | tx/day (mean, base, 200 humans + 20 traders) | Share |
|---|---|---|
| `market_trade` | 22,692 | 99.26% |
| `descent_begin` + `descent_end` (P2) | 108 | 0.47% |
| `buy_attention` (P2) | 10.6 | 0.05% |
| `stake` | 9.9 | 0.04% |
| `enter_tournament` | 9.9 | 0.04% |
| payout entries (inside `settle_season` batches; counted once here) | 9.9 | 0.04% |
| `claim` | 6.7 | 0.03% |
| `begin_unbond` + `finish_unbond` | 7.6 | 0.03% |
| `distribute`, `sweep`, `settle` | 5.4 | 0.02% |
| `charter` (P2), `early_exit`, `invest_stall`, `claim_stall` | 2.0 | 0.01% |
| **total** | **22,862** | 100% |

- The target is met by the traders' **market trades**: Poisson with mean 1,000 × 20 = 20,000/day, ± ~140. Humans add ~2,700 at 200 players, ~14,000 at 1,000 (34,184/day mean).
- With 50 players the mean is 20,727 and the daily minimum dips close to 20,000: **set the trader quota to ~1,100 trades/trader/day (5-10% margin)**, and monitor. If stalls close, 3 of 20 closed lose 15% of the volume at half pace (shock run: ~20,250/day during the week after the drain).
- The pledge/economy layer is **~170 tx/day (0.7%)**. Do not claim that the pledge layer "generates 20k"; claim that the town's economy runs 20k real trades a day and the pledge layer gives them meaning.
- "Genuine": a trade moves silk between two balances and pays a fee; there is no no-op ping. The health check is the explorer count and the Town Pulse page.
- **Cost** (`docs/town-economy.md`): ≈ 2.5-2.7 Tgas per trade [VERIFY on testnet] ≈ 0.00026 NEAR; **≈ 5.7 NEAR/day** for 22,000 trades. Funding the trader accounts is an owner-gated action.
- **Cumulative vs rivals**: the scorecard's counts are cumulative (a rival entry ~34.8k, a rival entry ~21.9k, a rival entry ~3k). At 22k/day FTF passes a rival entry's total in about 1.5 days of running. Judging starts 16 Nov (00:00 UTC): keep the market running through judging.

### 5.4 Scenarios

| Scenario | Rate (%/day) | TVL day 30 | Supply day 30 | Gini day 30 | Top-1% stake share | tx/day mean |
|---|---|---|---|---|---|---|
| base (200 humans) | 0.150 (ceiling) | 7,160 | 30,181 | 0.45 | 9% | 22,862 |
| small audience (50) | 0.150 | 4,952 | 22,722 | 0.27 | n/a | 20,727 |
| big audience (1000) | 0.150 | 14,549 | 61,855 | 0.53 | n/a | 34,193 |
| 3 whales × 8,000 silk, caps ON | 0.149 | 9,469 | n/a | n/a | 30% | n/a |
| 3 whales, caps OFF | **0.064** | 31,081 | n/a | n/a | **61%** | n/a |
| 3 whales unbond on day 15 (caps ON) | 0.150 | 9,233 | n/a | n/a | 32% | n/a |
| wages = fee drain (90 days) | 0.150 | n/a | 39,200 at day 90 (vs 35,411) | n/a | n/a | n/a |
| P = 200 gate, 200 humans / 30% finishing (rev 4) | 0.150 | 8,900 | 40,264 (×1.28) | 0.45 | n/a | n/a |
| P = 200 gate, 1,000 humans / 60% finishing | 0.150 | n/a | 87,075 (×1.38) | 0.48 | n/a | n/a |
| reference: P = 10,000 credited on chain, 10% of 200 | 0.150 | 7,634 | **195,226** | **0.88** | 9% | n/a |

![audience](ftf-economy-charts/08_audience.png)
![whale caps](ftf-economy-charts/09_whale_caps.png)

- **Small audience (50)**: nothing breaks; the day-minimum dips under ~20k without the margin.
- **Big audience (1000)**: tx 34k/day, TVL 14.5k, still at the ceiling; per-entrant payout 52 silk and the best payout 402 (4% cap binds from ~600 entrants).
- **Whales**: three whales with 8,000 silk each (more than a third of the on-chain supply). With caps, whales hold 25% of TVL, top-1% accounts 30%, and everyone else's rate stays at the ceiling (0.149%). **Without caps**, whales hold 79% and the rate for everybody falls to **0.064%/day, a 57% cut**: the caps are the real protection, not the ceiling.
- **Whale exit**: there is no pool, so there is no price crash; the penalty is 10% for an early exit, the rest of the pot per unit of weight rises to the ceiling, which it already is.
- **Story silk at P = 200**: see §2.13. The staker rate is not affected (the ceiling binds); supply is ×1.14-1.38 the no-story town at the paired audiences, Gini within ±0.04. At the old P = 10,000 the same faucet gives ×6.5 and Gini 0.88, which is the reference row above.

### 5.5 Sensitivity and attacks

| Run | Median rate (%/day) | TVL day 30 (silk) | Gini day 30 | Supply day 30 | tx/day | Burned in 30 d |
|---|---|---|---|---|---|---|
| base | 0.150 | 7,215 | 0.46 | 30,190 | 22,825 | 3,937 |
| fee 0.06% | 0.143 | 7,020 | 0.44 | 30,289 | 22,801 | 3,734 |
| fee 0.24% | 0.150 | 7,723 | 0.47 | 30,091 | 22,830 | 4,323 |
| ceiling 0.075% | 0.075 | 6,724 | 0.47 | 30,351 | 22,814 | 4,174 |
| ceiling 0.30% | 0.282 | 7,662 | 0.40 | 29,894 | 22,827 | 3,405 |
| entry fee 20 | 0.150 | 8,054 | 0.42 | 32,312 | 22,848 | 3,441 |
| entry fee 80 (credit stays 40) | 0.150 | 4,200 | 0.97 | 27,809 | 22,773 | 191 |
| mint cap 3,000 + floor 500 | 0.150 | 6,862 | 0.42 | 29,179 | 22,808 | 3,605 |
| pledge share 15% | 0.150 | 6,273 | 0.48 | 30,548 | 22,808 | 4,338 |
| pledge share 50% | 0.150 | 7,823 | 0.39 | 29,685 | 22,822 | 3,398 |
| caps OFF (no whales: nothing binds) | 0.150 | 7,215 | 0.46 | 30,190 | 22,825 | 3,937 |
| wages = fee drain | 0.150 | 7,215 | 0.46 | 31,452 | 22,825 | 3,937 |
| trades/trader 500 | 0.150 | 6,994 | 0.44 | 30,131 | 12,830 | 3,751 |
| trades/trader 1,500 | 0.150 | 7,454 | 0.46 | 30,098 | 32,837 | 4,118 |
| p_play 0.4 | 0.150 | 7,029 | 0.41 | 29,938 | 22,840 | 3,624 |

![sensitivity](ftf-economy-charts/10_sensitivity.png)

What moves what:
- **The ceiling moves the rate**: 0.075% → 0.075; 0.15% → 0.15; 0.30% → 0.282. The fee only matters when it is cut: fee 0.06% gives 0.143%/day; fee 0.24% changes nothing.
- **Participation, not fees, moves the supply**: entry fee 20 gives supply 32.3k; mint cap 3,000 (with floor 500) takes the supply 29.2k vs 30.2k; the rate does not change.
- **Cliff**: with an entry fee of 80 and an entry credit of 40, nobody can enter (Gini 0.97, TVL stuck at the clans' 4,200). Keep **entry fee ≤ 40 + the first win**, or raise the credit with the fee.
- **Tx count** follows the trader quota (500 → 12,830; 1,500 → 32,837), not the economy.
- **Gini** responds to the pledge share (15% → 0.48, 50% → 0.39) and to the entry fee.

![attacks](ftf-economy-charts/11_attacks.png)

**Sybil, one tournament (100 honest entrants, K extra accounts, 400 simulations each)**, net silk per season for the attacker group:

| K extra accounts | 1 | 5 | 10 | 25 | 50 | 100 |
|---|---|---|---|---|---|---|
| own silk, average skill | +4 | +11 | +15 | -6 | -146 | -538 |
| own silk, competent bots (+1σ) | +25 | +126 | +239 | +452 | +571 | +372 |
| free entry credit, average skill | +43 | +210 | +426 | +992 | +1,891 | +3,481 |
| free entry credit, competent bots | +68 | +336 | +646 | +1,450 | +2,546 | +4,337 |
| attacker share of the paid purse (competent, own silk) | 1% | 7% | 14% | 29% | 46% | 63% |

Reading:
- **Average entrants lose a little at scale**: the net per entrant is +10 silk at 30-50 entrants, +3.2 at 100, **−2.2 at 200, −5.4 at 500, −6.5 at 1,000** (the 20% entry burn is not repaid by a mint that does not grow with entrants; the 1,000-silk floor in `min(...)` is what supports small seasons). The tournament is a mild silk sink for the typical player, a source for the top ranks.
- **Paying their own entry**, bots of average skill break even or lose (K=100: −538); **competent bots** earn +239 at K=10 and +372-571 at K=50-100, **taking 14% to 63% of the paid purse from honest players**. This is not new emission (the mint is bound by the burn-match and does not grow with K: at K=100 it stays 1,720 vs 2,400 for 24 × 100), but it is a fairness problem; the 4% cap does not bind at these sizes.
- **Free entry credit** is the real leak: a farm that enters on guest credit pays nothing, so even average bots earn **+3,481 silk per season at K=100** (about 35 per account), competent ones +4,337. Defences in §2.11 (credit bound to a verified quest, a lower `credit_day_cap`, progressive entry fee per funding source, payout floor only for verified accounts). Above all, **a score that cannot be won by a script that does nothing or repeats one strategy**.

**Wash trading**: net silk/day is negative at every attacker share of staked weight. To fake 20,000 tx/day by wash trading would cost **42 silk/day** (20,000 × 1.75 × 0.12%); so the explorer count is cheap to inflate, which is why the Pulse page shows distinct signers and per-trade reasons, and why the leaderboard counts no trade proceeds.

### 5.6 What the model does not capture (read before quoting numbers)
- Humans' behaviour is parameterised, not observed: 200 synthetic players, fixed pledge rules. Real players may ignore pledging, or chase the ceiling harder.
- New deeds count from the same day in the model; `main` should use next-epoch weight [VERIFY], so early rates are slightly optimistic.
- Goods prices and stock are modelled in `relayer/market/prices.js` and the Economy Lab, **not here**: this simulation treats the traders' purses as a mean-reverting balance with a restoring force, and human trades as balanced (no net silk flow between humans and traders). A story-silk money-supply effect on prices is argued, not simulated.
- The 20k trades/day are scripted demand. The fee flow is a **designed budget** (47.7 silk/day paid out of an endowment of 20,000), not market-discovered income. Say so in the README.
- Deed transfers, escrow markets, Storm days, shard catalysts are not simulated (transfers add tx but no economics). Descents are modelled but are P2 and the Reserve is thin.
- 30 days: the annualised figures are a display convention. No gas-failure, relayer-outage or congestion modelling; real throughput and rate limits of RPC/relayer for 20 accounts × 1 tx/86 s are not tested here [VERIFY].
- The sybil model uses independent noise per account and a simple burn estimate for the mint; real clustering or coordinated play would change shares, not the sign of the free-credit result.

---

## 6. Borrowed mechanics

Reference design URLs: removed (external sources are not named in this repository).

| Mechanic | Source | How FTF adapts it | Deliberately NOT copied | Priority |
|---|---|---|---|---|
| Treasury funded by fees, shared with stakers | a reference design Crown Treasury | `sweep_fees`: 0.12% trade fee in silk → 65% to the works' pots (ceiling 0.15%/day), 10% purse, 10% Reserve, 15% burn (§2.4). The only source of staker rewards | USDC treasury, fee on cash-out, a tradeable ownership token | **P0 (built)** |
| Prize pool funded by season spend | a reference design seasons (Season 3 results; Gold Rush S3 rewards) | Tournament purse = capped mint + 65% of entry fees + tithe share + overflow of the ceiling + Reserve leftover; public on the Pulse page | Real-money pool, payout to token holders | **P0 (built, not deployed)** |
| Burning fuel (Energy burns while in the world) | a reference design Energy | **Attention** meter burns per descent; 10 free/day, rest costs silk (60% burned) | Buying fuel with USDC | **P2** |
| Extract alive to bank loot | a reference design cash-in on return | **Descent**: cargo reserved at the gate, banked only on return alive | Cash-in to USDC; full-loot PvP | **P2** |
| Greed scale raises reward and loss | a reference design Greed | **Greed tied to World Tension** `S.H`: `p_fail = p0 + k·g·T/100` | a reference design's loss numbers | **P2** |
| Partial loss: cargo all, artifacts partly, savings never | a reference design Genesis docs | Cargo lost; **pledged silk, deeds, shards never lost** | Gear loss; "full-loot" wording | **P2** |
| Three separated layers | a reference design Energy/Credits/Silver/$RSGP | Attention meter / Silk / Deeds and shards (§2.1), **one fungible currency** | Linking any layer to USDC or an external token; a second fungible token | **P0 (design)** |
| Territorial/station deeds with taxes | a reference design City Deeds | Six clan station deeds receiving the 12% bucket; social layer | Taxes on movement; selling deeds for money; the tax as income | **P2** |
| Licence NFT for limits and access | a reference design Charter | Charter: stake cap ×1.5, Attention 14/day; no yield multiplier | Royal Favor token path | **P2** |
| Short seasons (~10 days) | a reference design Season 3 | 5-day accelerated seasons; the purse closes per season | Waiting for a persistent world | **P0 (built)** |
| Staking with treasury share | a reference design $RSGP staking | Silk pledge with lock tiers (1.00-1.50); rewards from fees only | A token launched before the game; 48% insider allocation; any token launch | **P0 (built)**, token **never** pre-review |
| Autonomous NPC village with own accounts, honest "AI vs script" | a rival entry  | 20 trader accounts with own keys; trades fund the works; scripted/AI split labelled; decision logs | Real-world weather or gold price feeds | **P0 (built)** |
| City Pulse, Economy Lab, Judges' pass | a rival entry  | **Town Pulse** reads `pulse()`; **Economy Lab** replays a week of the real price rules; `?demo=judge` exists | GPS walking; selling AI-compute loot | **P0 (built)** |
| AI lords with own wallets, season throne, no-wallet login | a rival entry  | Clan wallets hold pledges and station deeds (P2); **Season Throne** = clan with the most silk earned at settle (P2); guests play without a wallet | Eight memecoins as the economy | **P2** |
| Mainnet with deleted keys, SECURITY_REVIEW.md, escrowed player market | a rival entry  | `docs/security-town.md` from the §2.6 threat model (exists on `main`); escrow marketplace for deeds via `nft_transfer_call` (P2) | Mainnet and Intents before review | **P0 doc**, **P2** escrow |
| NFT as an entity with a vault | a rival entry  | The deed *is* the position: principal, lock, pending, season provenance all inside the token | Chain signatures, USDC customers | **P0 (built)** |
| Transfer semantics of a running business | a rival entry  | Whole-position transfer with written states, post-transfer cooldown (§2.6) | Selling API keys/workers | **P0 (built)**, escrow P2 |
| No-wallet play; shop NFTs paying holders | Ashes of the Ninth Heaven (https://github.com/merajali98-dev/ashes-of-the-ninth-heaven [search-match]) | Guests and clan wallets pledge through the relayer under restricted function-call keys; deeds receive fee streams | NEP-245 everything | **P1** |

---

## 7. Contract and API surface (as built on `main`; not deployed)

### 7.1 Where it fits
- **`ftf-town.testnet`** (owner/coordinator `ftf-coordinator.testnet`, relayer-held trader keys). Balances (silk, entry credit), `trade`, pledges, deeds (NEP-171 inside it), treasury, tournament purse, Reserve, stall pledges. Single contract = atomic state, no cross-contract callbacks on the core path.
- **Reads** `ftf-seasons.testnet` (`get_season`, `schedule_root`) through the coordinator-supplied root at `open_season`; writes nothing to other contracts.
- **Silk is an internal balance** with views (`balance_of`, `balances_of`); there is **no `ft_transfer`** and no NEP-141 facade: silk moves by market ops and whole deeds only.
- **Shared authoritative rules**: `contracts/town/src/rules.rs` ↔ `game/src/game/town-rules.js` with `contracts/town/tests/vectors.json`.

### 7.2 Methods (`ftf-town.testnet`)

| Method | Caller | What it does |
|---|---|---|
| `new(owner_id, coordinators, params?)` | deploy | bounded params (`Params::valid`) |
| `genesis(traders, silk_each)` | owner, once | registers traders with 1,000 silk each |
| `trade(counterparty, silk, reference)` | a trader's trade-only key | moves silk, 0.12% to the treasury; min 0.5, no self trade |
| `enter_tournament(season_id)` | account | 40 silk (credit first): 20% burn, 15% Observatory stakers, 65% purse; one entry per season |
| `open_season(season_id, schedule_root)` / `settle_season(season_id, payouts, payouts_hash, last)` | coordinator | records the sealed root and last season's burn; pays ranks in silk in batches; `last` closes |
| `credit_silk(account, amount, reference)` / `credit_entry(account, amount)` | coordinator | wages/corrections; story rewards (`story:…`); entry credit; **shared daily ceiling 4,000 (recommended 6,000 or a separate `story_day_cap`, §2.13.4)** |
| `pay_gate(gate_id)` **(new, rev 4; spec only)** | account | burns `gate_price` (200) from the caller's silk, once per account; event `gate_paid`; counts in `gate_burned`, not in the mint-match (§2.13.2) |
| `stake(asset, amount, tier)` | account | pledge to a works; burns the 0.5-silk deed fee, mints a deed |
| `claim(deed)` | deed owner | pays pending |
| `begin_unbond(deed)` / `finish_unbond(deed)` | deed owner | after the lock, 2-day cooldown, principal + pending back, deed burned |
| `exit_early(deed)` | deed owner | 10% penalty (half burned, half to others); blocked for a day after a transfer |
| `sweep_fees()` / `distribute()` | anyone, once an epoch | the §2.4 split; the works' ceiling |
| `invest_stall(trader, silk)` / `claim_stall(trader)` | registered player | pledge silk into a stall's working capital; claim half-fee share. Views `stall_of`, `stall_position` |
| `set_params`, `set_paused`, `set_coordinators` | owner | bounded; event and hash; **immediate, no timelock** |
| `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_tokens(_for_owner)`, `nft_metadata` | standard | deeds; approvals rejected |
| Views | | `pulse`, `balance_of`, `balances_of`, `stake_pools`, `get_deed`, `season`, `has_entered`, `params`; **new: `gate_paid_of(account)`, `gate_burned`** |

Events (NEP-297 `ftf_town`): trade, entry, season open/settle, credits, **gate_paid**, stake/claim/unbond/early exit, sweep, distribute, stall pledges; plus standard `nft_mint` / `nft_transfer`. **Not built:** `buy_attention`, descents, Charter, station deeds, deed escrow.

### 7.3 Repo and relayer touchpoints
`contracts/town/`; `game/src/game/town-rules.js`; `relayer/lib/town-traders.js`, `relayer/lib/clan-actions.js`, `relayer/lib/clan-strategy.js`, `relayer/market/{catalog,prices,daemon}.js`; `game/public/{pulse,economy-lab}.html`; `docs/town-economy.md`, `docs/security-town.md`; `tools/town/{sim,fast-week,settle,vectors}.mjs`. Edits to `engine.js`: none (the economy never writes `S.silk`).

---

## 8. Why it differentiates

| Rival (from the scorecard) | What they show | What FTF adds on top |
|---|---|---|
| **a rival entry** (Games #1; ~34.8k tx, five NPC accounts at 3-8k each, NEP-141/171/245) | A running NPC village economy | Same live-NPC proof, plus a **position NFT bound to a sealed season**, a rate **derived from published fee flow** with a rerunnable Economy Lab, **a reason on every price**, **one currency and no token**, and explicit scripted/LLM labels per decision. 20-23k tx/day means FTF overtakes their cumulative count in ~1.5 days |
| **a rival entry** (Games #2; ~21.9k tx, Economy Lab, City Pulse, judge pass) | Dashboards and a judge shortcut | Town Pulse + Economy Lab exist on purpose; FTF's difference is an **NFT layer with transfer semantics and a written threat model**, not only counters |
| **a rival entry** (AI lords, ~3k tx, no-wallet login) | Walkable 3D + AI rivals | Seven clan wallets with real pledges (LLM strategy, rules-made moves); no memecoin; guests play without a wallet |
| **a rival entry** (mainnet, SECURITY_REVIEW.md, 16 tx) | Security discipline, tiny usage | We match the discipline (threat model, caps, bounded admin) at testnet scale and add real volume; **no mainnet before review** |
| **a rival entry / a rival entry** (NFTs #1/#2) | NFTs that *are* something | A deed that is a live position: season provenance, lifecycle states, whole-position transfer, cooldown |
| **Ashes** (no-wallet play, shop NFTs paying holders) | Frictionless entry | Guest pledging without a wallet; deeds that receive fee streams |

Effect on the scorecard criteria, honestly: this mostly attacks **Impact** and **Sustainability** and the **Games track-fit**: a verifiable running economy with a sink/source model and a threat model. If it is live, documented and verifiable in the explorer, I would expect Games track-fit near 0.8 and Impact up by roughly half a point to a point; if it ships half-built or labelled dishonestly, it costs more than it earns. It does not close the gap to a rival entry on Technical (tests, CI) or to mainnet entrants.

---

## 9. Priorities and scope cut

Timeline (Europe/Kyiv): it is Thu 12 Nov evening. **Feature freeze Fri 13 Nov 16:00**; hard freeze 20:00; **deadline Sun 15 Nov 01:59** (Sat 14 Nov 23:59 UTC); judging from 16 Nov. Contract cut line: **Fri 13 Nov 14:00**.

**Already built on `main` (no new work, verify only):** the contract with 43 tests, rules and vectors, trader loop, clan actions and LLM strategy layer, prices and closed stalls, `invest_stall`, Pulse, Economy Lab, `security-town.md`.

**P0: what is left before the freeze (mostly OWNER-GATED)**
1. **Owner: deploy `ftf-town.testnet`** (`contracts/scripts/town-deploy.sh`), `genesis` with the 20 traders, register the keys. *OWNER-GATED.*
2. **Owner: fund the trader accounts** (~5.7 NEAR/day at the repo's gas estimate [VERIFY]). Switch the daemon from dry run to send (`FTF_TOWN_SEND=1`) only after the owner's yes. *OWNER-GATED.*
3. **Parameter review before deploy** (§2.2, §2.13.4): `credit_day_cap` 4,000 → 6,000 (or a separate `story_day_cap` 6,000), `season_mint_cap` 12,000 → ~3,000, `gate_price` 200; decide whether wages stay off. *OWNER-GATED* (`set_params`). **Contract change to add before the cut line: `pay_gate`, `gate_paid_of`, `gate_burned`, the per-account story caps** (Fri 13 Nov 14:00 Kyiv).
4. Update the tournament card and `docs/decisions.md` so "no prizes" is not contradicted once silk is paid for rank.
5. Run the 5-minute judge path on top: Pulse live, one end-to-end human path (enter → payout → pledge → deed → claim → unbond), copy audit.

**P1:** pledge flow in the UI at the Exchange counter; guest pledging through the relayer; `agent-ledger` daily Merkle root of trader decisions; a tournament score that rewards honest play; the sybil mitigations of §2.11; Attention + Descent.

**P2: roadmap; do not start before the freeze:** Charter NFT, six station deeds, shard catalyst, deed escrow marketplace, Storm-day rule, Season Throne, progressive entry fee, TEE/multisig for coordinator calls, **mainnet and any real prize or token: only after legal and security review**.

**Cut line**: if the contract is not deployed with passing tests by **Fri 13 Nov 14:00**, ship only the trader market + Town Pulse (silk trades and the explorer count) and publish this document as the roadmap, with the pledge UI hidden. A broken pledge flow loses more than a missing one. The judge path comes first: **do not start economy deployment work if the 5-minute judge path is not green.**

---

## 10. Acceptance tests

Contract/Rust (`contracts/town/tests`; most already exist: check each is covered):
1. Conservation: after any op sequence, `minted − burned = Σ balances + Σ pledged + Σ pending + treasury + station + reserve + purse + unbonding`.
2. Mint only through the purse, entry credit and `credit_silk`: above the ceiling, `credit_silk`/`credit_entry` panic; `trade/stake/claim` never change total supply.
3. **No second fungible**: the ABI has no `ft_*` method and no swap.
4. Reward: Σ claimable ≤ Σ pots; ceiling enforced; zero-stake works roll over; excess to the purse; dust to the treasury.
5. Deed lifecycle: `active → unbonding → burned`; double `finish_unbond` panics; early exit takes 10% (50% burn, 50% to remaining stakers).
6. Deed transfer: moves position + pending + lock + unbond clock; receiver cap checked; 1-day no-early-exit; `nft_transfer_call` rollback restores owner; no approvals methods.
7. Weight starts at the next epoch (same-epoch stake-then-distribute earns 0) [VERIFY].
8. Caps: per-account `min(8,000, max(800, 5%·TVL))`, per-works 3,000.
9. Wash EV: a simulated wash loop ends with a negative balance for any weight share < 100%.
10. Season: `settle_season` pays at most 4% per account and mint ≤ `min(12,000, 1,000 + 0.8·burn, 24·n)`; all deeds of a season share one `schedule_root`.
11. Stalls: `invest_stall` reopens a closed stall; `claim_stall` pays half the stall's fees by invested share; the silk is not returned.
12. Params: `set_params` rejected outside bounds; event with parameter hash; (recommended) rejected mid-season.
13. Gas: `trade` ≤ 3 Tgas, `stake` ≤ 12 Tgas, measured in sandbox (`tools/town/sandbox-gas.mjs`).
14. **Gate** (rev 4): (a) `pay_gate` burns exactly `gate_price` from the caller's silk, never from entry credit or `story_locked` silk before payment; (b) a second call panics; (c) scripted accounts are refused; (d) `gate_burned` rises by P and is not in the season mint-match (mint with and without a gate in the burn is identical); (e) `gate_paid_of` returns the paid record; (f) conservation holds across `credit_silk(story:…)` → `pay_gate`; (g) per-account day and lifetime caps and `story_day_cap` panic when exceeded; (h) `story_locked` silk cannot `trade`, `stake` or `enter_tournament`; (i) relayer test: the whitelist mint refuses an account with no `gate_paid_of`.

JS/game: 15. vectors equal the Rust vectors (`node tools/town/vectors.mjs`). 16. Engine parity tests unchanged: `S.silk` is never written. 17. Economy actions through the room bus are idempotent and version-checked.

Live testnet (owner-gated deployment): 18. Explorer: ≥ 20,000 `trade` receipts in a 24-hour window with ≥ 18 distinct signers; failed-receipt rate ≤ 1%. 19. `pulse()` equals counts reconstructed from events. 20. One end-to-end human/guest path: enter tournament → payout → pledge → deed visible in Pulse and NFT list → claim → unbond → withdraw. 21. Copy audit: no "invest/APY/profit/dividend/returns" in game, README, X post; rate shown only as measured and "can be zero".

---

## 11. Owner-gated decisions

**Resolved by the owner (12 Nov, final; applied here, no action):** one currency = silk; no second token and no pool; tournament prizes, pledges to the four works, deed NFTs, leaderboard points, Season 3 distribution fee-funded staking rewards stay; **the portal is paid on chain in silk via `ftf-town` (`pay_gate`), no separate book, and its price is lowered** (recommended 200; the owner may overrule with `set_params`, §2.13).

1. **Approve the scope** (§9) and whether to cut at Fri 14:00 if not green.
2. **Deploy `ftf-town.testnet`**, fund it, set function-call keys for the 20 traders and the 6 clan wallets, top up NEAR (~5.7 NEAR/day [VERIFY]); the guest fund `guests.ftf-coordinator.testnet` needs a top-up before any audience launch. Signing and funding are the owner's.
3. **Set the coordinator ceilings** (`credit_day_cap` 6,000 or a separate `story_day_cap` 6,000, `season_mint_cap` ~3,000) and keep wages off, or accept the defaults and a story faucet that stalls at ~100 arrivals a day (§2.13.4).
4. **Confirm the portal price** (§2.13.4): **200 silk** (recommended), burned, on chain; alternatives 250 (still ×1.49 supply at 1,000 @60%) or 300 (×1.59). Decide whether to show an optional display multiplier ("10,000 threads" = 50 × 200); recommended **no**. Also confirm that **burn, not treasury**, is the destination and that the gate burn stays out of the season mint-match.
5. **Naming policy**: "pledge / reward share / rate / back a stall" in the game (recommended).
6. **Entry credit** size (40 silk) and the `guests` daily cap that bounds sybil credit; adopt at least mitigation (1) of §2.11 (credit pays the first entry; payout held until one verified quest).
7. **Tournament scoring**: today `OUTCOME_SCORE` rewards outcomes; the engine's own report shows doing nothing often wins on silk. Decide a score that rewards honest play before silk is paid for rank.
8. **Real prizes, any token, mainnet**: not before a legal review and a security review of the contract.
9. **How openly to say the trade volume is scripted** (recommended: say it on the Pulse page and in the README).

---

## Appendix: reproduction

```bash
cd /workspace/ftf-economy
.venv/bin/python run_all.py   # all scenarios, sensitivity, attacks, inflation, charts 01-13 -> /workspace/exports/ftf-economy-charts/, results.json (about 10 s)
.venv/bin/python run_gate.py       # portal-price sweep, caps, gate destination, sybil; chart 14 + gate_results.json (about 2 min)
.venv/bin/python run_gate_rec.py   # matrix at P = 200, per-account day cap effect; charts 15-18
```

Files: `econ_sim.py` (silk-only model), `run_all.py`, `run_gate.py`, `run_gate_rec.py`, `results.json`, `gate_results.json`; the previous two-currency model is kept as `econ_sim_v1.py.bak`, `run_all_v1.py.bak`, `results_v1.json.bak`, `charts_v1.bak/`. `main` is read from `/workspace/ftf-main` (`origin/main` at `77422d18`). Charts: `/workspace/exports/ftf-economy-charts/01…13_*.png`. The model is seeded (seeds 1-8 base, 1-5 scenarios, 1-4 sensitivity); numbers in this document are the outputs of those runs. The gate model: each new human starts the story; finishers (probability `gate_complete`) earn P over 1-3 days, abandoners earn P × {0.04, 0.14, 0.22, 0.52, 0.75}; credits queue FIFO through the daily cap; finishers' silk is protected until the gate is paid; the gate burns P and the stipend 0.05 × P is credited the next day. Pre-rev-4 files are kept as `*_pre_gate.*.bak`.
