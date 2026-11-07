# Economy report: Monte Carlo analysis of the season rules (v2)

Date: 07.11.2026. Engine: `game/src/game/engine.js`, rules `v2` (the default; `baseline-2d-1` behaves identically in gameplay, see `tests/sim.test.mjs`). Harness: `game/scripts/sim/`. Generated tables: `docs/math/sim-tables.md`, raw summaries `docs/math/sim-results.json`, proposal counterfactuals `docs/math/proposal-tables.md`.

Everything below is in-game silk, a closed resource. "RTP" means expected silk returned per silk put into an action; it is a design metric, not a gambling payout, and no real money or NEAR is involved anywhere.

## 1. Method

- The engine is pure and deterministic. A season is `newSeason(seed, { rules, randomBytes })`; the game RNG is `mulberry32(seed)`, and the v2 salt bytes are injected from a seeded xorshift so every record is reproducible from `(rules, seed, strategy)`. The v2 tests already prove the salt bytes never influence gameplay.
- Only clan 0 (Iris) is controllable. The five AI clans are the engine's fixed heuristics (`PERS`), so "strategies" are Iris strategies and the AI world is the environment. Strategy choices use a private LCG, never the game RNG.
- Factorial design, 12 strategies = fragment × trust × market:
  - fragment: `coop` (contribute at tick 6), `late` (contribute at tV−1, the last tick before the own prize fires), `hold` (never contribute);
  - trust: `honest` (keeps promises and debts, accepts Amber's escrow, speaks Ash's Key when the vision is open, mends and mediates), `defect` (accepts pacts and forgets the promise, forgets debts one tick before they are due, buys Salt's cheap words, never speaks the Key);
  - market: `anchor` (anchors on prophecies read as Gift, burns Call memories for visions, asks the Guests about the weakest cell, buys Frost's words) or `none`.
- Specials: `passive` (start, end ticks, vote accept; holds the fragment by inaction), `oracle` (reads `S.events` directly: what a leaked seed gives), `debtdump` (honest cooperator who forgets every debt at due−1), `bidder` and `latebid` (bid on Frost's shards immediately or on the last tick before closing).
- Ledger. Every silk movement of Iris is attributed: outflows by action (anchors, asks, words, loans, escrow, bids, mend, mediate) and inflows by source (stakes returned, Gift shares, repayments, shard sales, own prize, finale). The residual after `endTick` is attributed to repayments only when it is positive; a negative residual would be flagged as "unexplained". Over 170 000 seasons the unexplained residual is 0 and no strategy issued an intent the engine rejected.
- Statistics: means with 95% confidence intervals (1.96·sd/√n), paired differences on the same seeds where two strategies are compared, Gini over the six clans' final silk.
- Run: `cd game && npm run sim -- --out docs/math` (seeds 1..10000 per strategy, 17 strategies, 197 s, 1.16 ms per season on the development PC); `npm run sim -- --quick` uses 300 seeds (about 10 s). Findings use seeds 1..3000; proposal counterfactuals seeds 1..3000.

## 2. Headline numbers (10 000 seasons per strategy, seeds 1..10000)

### 2.1 Return per strategy

| strategy | final silk (mean ± 95% CI) | sd | net vs passive (paired) | value in | value back | RTP | anchors RTP | hit % | own prize | finale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 76.1 ± 0.7 | 36.3 | −61.9 ± 1.1 | 268.8 | 242.2 | 0.90 | 1.46 | 56.5% | 0.0 | 26.2 |
| coop-honest-none | 84.3 ± 0.6 | 28.8 | −53.7 ± 1.0 | 106.4 | 79.8 | 0.75 | n/a | n/a | 0.0 | 23.2 |
| coop-defect-anchor | 94.3 ± 1.0 | 52.6 | −43.7 ± 1.3 | 255.1 | 247.9 | 0.97 | 1.38 | 48.6% | 0.0 | 15.4 |
| coop-defect-none | 126.6 ± 0.9 | 46.4 | −11.5 ± 1.2 | 54.3 | 71.2 | 1.31 | n/a | n/a | 0.0 | 5.2 |
| late-honest-none | 84.4 ± 0.6 | 29.0 | −53.6 ± 1.0 | 106.3 | 79.8 | 0.75 | n/a | n/a | 0.0 | 23.2 |
| late-defect-none | 136.3 ± 0.9 | 48.2 | −1.8 ± 1.2 | 54.1 | 82.1 | 1.52 | n/a | n/a | 0.3 | 3.2 |
| hold-honest-anchor | 75.1 ± 0.7 | 38.1 | −63.0 ± 1.2 | 293.5 | 265.9 | 0.91 | 1.47 | 56.6% | 44.5 | 4.5 |
| hold-honest-none | 95.8 ± 0.6 | 31.6 | −42.2 ± 1.1 | 115.1 | 100.0 | 0.87 | n/a | n/a | 44.9 | −1.6 |
| hold-defect-anchor | 119.2 ± 1.2 | 59.7 | −18.8 ± 1.4 | 257.7 | 276.0 | 1.07 | 1.32 | 46.7% | 40.7 | −3.9 |
| hold-defect-none | 161.1 ± 1.1 | 53.6 | **+23.0 ± 1.3** | 54.1 | 106.9 | 1.97 | n/a | n/a | 41.5 | −13.2 |
| passive | 138.0 ± 1.0 | 50.0 | 0 | 0.0 | 27.4 | n/a | n/a | n/a | 44.5 | −17.1 |
| oracle (cheats) | 240.7 ± 1.3 | 68.2 | **+102.6 ± 1.5** | 66.2 | 207.1 | 3.13 | 2.79 | 100.0% | 0.0 | 22.1 |
| debtdump | 81.6 ± 0.5 | 26.3 | −56.4 ± 1.0 | 110.4 | 81.0 | 0.73 | n/a | n/a | 0.0 | 23.2 |
| bidder | 71.8 ± 0.7 | 35.9 | −66.2 ± 1.1 | 271.7 | 241.0 | 0.89 | 1.47 | 56.8% | 0.0 | 25.4 |
| latebid | 72.3 ± 0.7 | 36.0 | −65.7 ± 1.1 | 271.5 | 241.3 | 0.89 | 1.47 | 56.8% | 0.0 | 25.5 |

(The three omitted rows, `late-honest-anchor`, `late-defect-anchor`, are within 0.2 and 3 silk of their `coop` twins; full table in `sim-tables.md`. "Finale" is negative on average when the weapon outcome zeroes everyone.)

Reading the table:

- **Doing nothing beats doing anything honest.** A player who only ends ticks and votes "accept" finishes with 138 silk, 42–66 more than every honest strategy, because the own prize (mean 44.5) arrives by inaction and nothing is spent. Only `hold-defect-none` (+23) and the cheating `oracle` (+103) beat passive. The in-game activities the game is built around are negative expected value for the player.
- **Anchoring itself is profitable (RTP 1.46 at a 56.5% hit rate), the learning around it is not.** Per season the honest anchorer puts 100 silk into stakes and gets 146 back, but spends 69 on questions (5 silk each, pure sink), 22 on words and 34 on mediation (a sink, 15 silk burned per mediation). The learning cost exceeds the anchor profit.
- **Lending is break-even overall (RTP 0.97–0.99).** Analytically Moss's loan (15 → 25, honesty .92) returns 1.53 per silk and Salt's loan (20 → 32, honesty .35) returns 0.56; the strategies take both.
- **Variance.** Standard deviations are 29–68 silk on means of 72–241; p10 ranges from 26 (`coop-defect-anchor`) to 109 (`hold-defect-none`), and `passive` has p10 = 0 because the weapon outcome (11% of its seasons) zeroes everyone.

### 2.2 Best-response table (fragment decision; columns trust × market; mean final silk)

| fragment \ context | honest-anchor | honest-none | defect-anchor | defect-none |
| --- | --- | --- | --- | --- |
| coop | 76.1 ± 0.7 | 84.3 ± 0.6 | 94.3 ± 1.0 | 126.6 ± 0.9 |
| late | 76.3 ± 0.7 * | 84.4 ± 0.6 | 97.2 ± 1.1 | 136.3 ± 0.9 |
| hold | 75.1 ± 0.7 | 95.8 ± 0.6 * | 119.2 ± 1.2 * | 161.1 ± 1.1 * |

| dimension | best response in each context | dominant? |
| --- | --- | --- |
| fragment | hold in 3 of 4 contexts; in honest-anchor the three options tie within 1.2 silk | not strictly (see below) |
| trust | defect in all 6 contexts (+10 to +65 silk) | **yes: defect** |
| market | none in all 6 contexts (+8 to +42 silk) | **yes: none** |

Why the fragment row ties in the honest-anchor context: the honest anchorer that holds spends its prize at once on Amber's tick-13 escrow (23.6 silk per season vs 9.7) and on more questions (76.7 vs 69.1). With that confound removed (the paired `*-honest-none` comparison in §3.1) holding wins by 11.5 ± 0.9. Holding is a weakly dominant fragment strategy; defecting and not playing the market are strictly dominant for silk.

### 2.3 Finale distribution, ties, crisis

| strategy | gift | lost | survived | weapon | gone | accepted | tie 3:3 | key sign in Scroll | Key spoken | Ash contributes | Iris links broken at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 41.0% | 16.3% | 34.5% | 5.8% | 2.4% | 47.9% | 17.6% | 65.7% | 97.6% | 96.0% | 0.27 |
| coop-honest-none | 47.5% | 10.9% | 38.7% | 2.4% | 0.4% | 50.2% | 12.6% | 87.5% | 99.6% | 96.7% | 0.13 |
| coop-defect-none | 29.7% | 19.6% | 26.2% | 8.2% | 16.4% | 45.3% | 23.8% | 39.7% | 0.0% | 65.4% | 0.45 |
| hold-honest-none | 49.1% | 9.4% | 39.7% | 1.5% | 0.2% | 50.7% | 11.1% | 93.0% | 99.8% | 96.5% | 0.13 |
| hold-defect-none | 25.3% | 16.9% | 21.4% | 7.0% | 29.4% | 45.8% | 23.6% | 37.0% | 0.0% | 60.9% | 0.89 |
| passive | 32.8% | 23.0% | 28.3% | 11.0% | 4.9% | 46.1% | 26.6% | 37.6% | 0.0% | 62.3% | 1.00 |
| oracle | 32.5% | 21.4% | 35.2% | 2.9% | 8.0% | 38.5% | 22.1% | 39.7% | 0.0% | 65.3% | 0.61 |

- The vote accepts in 46–51% of finished seasons regardless of strategy; **3:3 ties happen in 11–27% of votes** and always count as "reject" (a tie is the single most common way a true Gift is lost).
- Honest play speaks Ash's Key in 97–100% of seasons; the AI clans' fragments then reach the Scroll (scroll size 4.9–5.5 of 6, the missing one is almost always Amber's, whose greed rule never contributes while tV ≤ 16). Defecting strategies never speak the Key (the honest branch owns that action) and Ash stays isolated in 99% of seasons.
- Amber is the richest clan in every run (184–203 silk): V = 80 guaranteed at tick 15 plus escrow income. Iris is the poorest clan under every honest strategy.

### 2.4 Tension and the Shells leaving

Mean tension after each tick (H starts at 10; 100 = the Shells leave = outcome `gone`):

| strategy | t4 | t8 | t10 | t12 | t13 (crisis) | t14 | t16 | max | P(gone) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-none | 6.8 | 7.7 | 19.6 | 54.6 | 27.7 | 25.9 | 23.9 | 54.7 | 0.4% |
| coop-honest-anchor | 8.5 | 13.1 | 24.2 | 59.0 | 30.0 | 29.4 | 26.2 | 59.3 | 2.4% |
| passive | 8.9 | 16.8 | 19.6 | 56.4 | 55.8 | 56.3 | 56.7 | 64.9 | 4.9% |
| coop-defect-none | 10.0 | 23.7 | 25.9 | 63.7 | 68.3 | 63.8 | 64.1 | 77.7 | 16.4% |
| hold-defect-none | 10.0 | 23.7 | 37.7 | 76.1 | 75.0 | 69.8 | 69.5 | 86.2 | 29.4% |

The t12 column is the state after `endTick(12)`, i.e. after the tick-13 crisis has fired (+15, Ash cuts 2.2 links on average, +36.6 total jump). Speaking the Key restores Ash's links (−10 each) and brings tension from ~57 back to ~28; without it the season sits at 55–76 for its second half, and every further deceit (+6) or break (+10) is close to the threshold. Note that **outcome `gone` keeps everyone's silk**: the "everyone loses" of the design brief is not implemented economically, which is why `hold-defect-none` can afford a 29% chance of ending the world.

### 2.5 Inequality

Gini over the six clans' final silk is 0.10 (passive) to 0.16 (honest anchoring); excluding weapon seasons 0.11–0.17. The spread comes from Amber's prize and escrow income and from Iris's spending; AI clans all finish between about 100 and 204.

### 2.6 Gift pool

Across 10 000 `coop-honest-anchor` seasons: 65 697 Gift events, 58 477 of them claimed; the claimed pots sum to 1 475 320 silk and payouts to 1 478 270 (+0.2%: 9 313 minted, 6 363 lost by rounding, in 24.4% of claimed events). Unclaimed pots (no anchor on the right Shell) are 10% of all pot silk with an active Iris and 29% without. Storms burn 8% as many silk as Gifts pay.

### 2.7 Shard auctions

The AI clans rarely end up unfunded (0–3 burned shards per 10 000 seasons). Iris does: with `bidder`, 426 of 42 916 closed auctions (1%) burned because her own winning bid was no longer covered at closing, costing the sellers 2 885 silk of otherwise funded second bids. Ties at the top bid occur in 9% of auctions (3 751 of 42 996) and resolve to whichever bid was placed first.

## 3. The six findings of the commercial review

All six reproduce. Numbers below are from `node scripts/sim/findings.mjs` (seeds 1..3000 unless stated); the full printout is at the end of `sim-tables.md`.

### 3.1 Fragment withholding pays more — confirmed

| measure | value |
| --- | --- |
| hold − coop, Iris final silk, paired on 3000 seeds, honest without market play | **+11.5 ± 0.9** |
| P(hold > coop) / P(tie) | 63.6% / 11.4% |
| late (contribute at tV−1) − coop | +0.2 ± 0.3 (timing does not matter) |
| own prize collected by hold | 44.9 (uniform over 30/40/50/60) |
| finale bonus collected by coop | 23.7 (= 40·P(gift) + 15·P(survived) with P(gift) 48.5%, P(survived) 38.5%) |
| AI side, coop run: Amber (always holds, V = 80) / Moss / Frost | 199.3 / 133.1 / 170.4 |

Minimal trace, seed 1: coop contributes at tick 6 (silk 48), votes accept at tick 17 and finishes with 88; hold collects its prize of 50 at tick 14 and finishes with 98.

Mechanism: the prize is certain and arrives at tV, the contribution bonus is paid only if the vote goes the right way (about 87% of finished votes reach gift or survived under honest play, but the bonus is 40 or 15, not 45). Contributing also has no effect on the holder's own vote outcome. Additional fact: tick 16 (`DEADLINE`) is unreachable for Iris's fragment because tV is 11..15 and the prize fires first; the UI offers a deadline that cannot be used.

Proposed fix: see §4, proposal P1.

### 3.2 The Gift pool is not conserved — confirmed (two senses)

1. Rounding: each anchor gets `round(pot · w / Σw)` independently. Enumerating 2–4 anchors with weights 1..8 gives 734 weight patterns where the shares sum to pot ± 1 and 19 where they sum to pot + 2. Measured: 24.7% of claimed Gift events pay a total different from the pot; net +0.2% minted (2 809 minted, 1 919 lost over 3 000 seasons). Minimal example, seed 1, tick 13: pot 40, three anchors with weights 3/3/3 → 13 + 13 + 13 = 39.
2. Structure: the pot is created at reveal time; nothing funds it. The Gift is a silk faucet (148 silk per season on average with an active Iris); Storms (12 silk per season) and unclaimed pots are the only sinks. This is a design choice, not a bug, but it should be stated as such in the economy.

Proposed fix: largest-remainder apportionment (shares sum to the pot exactly), and an explicit faucet/sink budget per season (P3).

### 3.3 The proof check is disconnected from the resolved fields — confirmed, 100%

`resolveEvent` verifies `e.leaf` against `S.root` with the stored path, then pays anchors and writes the chronicle from `e.place / e.action / e.power` without recomputing the leaf from them; `verified` is only logged. Over 500 seeds: editing `events[0].place` in memory after the commitment still reports ✓ in 500/500 seasons and pays Iris's anchor on the edited Shell in 500/500; recomputing the leaf from the resolved fields would have caught all 500. Replacing `S.root` with garbage makes every proof ✗, and the season continues and pays out normally in 500/500.

Proposed fix (P4): recompute `leafHash(e, idx)` from the fields being paid out, verify against a root held outside the mutable state (server or chain), and halt the season with a new outcome `proof_failed` on mismatch. The engine already exposes `verifyProof`; the change is confined to `resolveEvent`.

### 3.4 The public seed reveals the future — confirmed

`S.seed` is a 32-bit integer in the state, and `newSeason(seed)` regenerates all 15 events, every clan's hidden V and tV, and Ash's Key phrase. In `baseline-2d-1` the commitment is `sha256('seed:' + seed)`, so publishing the commitment publishes the seed to anyone with a dictionary; v2 salts the commitment but the seed stays in the state. Without the seed, a replica of the engine's RNG (no hashing needed) brute-forces it from revealed events at 10.4 million candidates per second single-threaded: in a 2^24 search space the true seed is unique after 4 revealed events (5 candidates after 3, 869 after 2); the full 2^32 space takes about 7 minutes on the development PC, i.e. by tick 7 the remaining 10 events, all prizes and the Key are known. Value of the leak: the `oracle` strategy ends with **+165.7 ± 2.3** silk over the honest anchoring cooperator on the same seeds (anchors RTP 2.81 vs 1.46, 100% hit rate), and it votes the truth.

Proposed fix (P5): 128-bit server-side seed, CSPRNG-grade stream instead of mulberry32, never ship `seed` or `truthGift`, `V`, `tV`, `pepelKey.phrase` in any client projection; the Merkle root is the only public commitment. This is already listed as a known limitation in `docs/rules-baseline.md` §13; the numbers above quantify it.

### 3.5 An unfunded top bid burns the sale — confirmed, and griefable

`resolveShards` takes the single top bid; if that bidder lacks the silk at closing, the shard burns even when other funded bids exist. In natural AI play this almost never happens (0–3 per 10 000 seasons), because AI bids are checked against silk when placed and AI balances rarely fall. Iris can do it deliberately: bid on Frost's tick-7 shard, then spend below the bid before closing at tick 9. The reproduction succeeded in **1000/1000** seasons where the shard existed; Frost lost 6 450 silk of otherwise funded AI bids and the AI buyers lost the insight (+0.05 mastery). Minimal trace, seed 1: accept Salt's loan (−20), bid 9, six anchors on tick 17 (−60); silk at close 7 < 9 → "nobody bought, the shard burned". Cost to Iris: nothing beyond stakes she gets back at tick 17.

Proposed fix (P6): lock the bid in escrow at bid time (refund when outbid), or fall back to the highest funded bid at closing.

### 3.6 Overdue debts are transferable — confirmed

A debt memory is settled in `startTick` of its due tick. Forgetting it one tick earlier puts it on a two-tick auction that closes after the due date; a non-debtor buyer receives a claim with `due` in the past, and `startTick` settles only claims with `due === tick`. Over 3 000 `debtdump` seasons: 214 claims were transferred to non-debtors, **214 (100%) already overdue**, buyers paid 2 996 silk for nothing; in 5 761 cases the debtor (Moss, who values its own debt at 0.55 of face) bought the shard and cancelled the debt. The lender's RTP falls from 0.99 (honest, repaid at face) to 0.91 (dumped, sold at about 0.55 of face) but each dump also buys a two-event vision, which is the real motive. Minimal trace, seed 3: accept Moss's loan at tick 3 (due 7), forget the debt at tick 6, the shard closes at tick 8 and Salt holds `{debtor: Moss, amount: 25, due: 7}` forever.

Proposed fix (P7): settle claims with `due <= tick` (immediately on purchase when overdue), or forbid forgetting a debt within one tick of its due date.

## 4. v3 proposal (rules unchanged in the engine; evaluate behind a new rule mode)

The proposals below are documented only. P1 and P8 were evaluated as payoff-only counterfactuals on the simulated v2 seasons (AI behaviour and the vote do not depend on V or on the finale bonus, so Iris's silk can be re-priced without re-simulating; `node scripts/sim/proposal.mjs`, seeds 1..3000). Everything else is untested and should be pinned by tests when implemented as `rules: 'v3'`.

**P1. Make contributing the better bet.** Finale bonus 40/15 → 60/30 (gift / survived) and the own prize V 30..60 → 20..40 ("A"); pay the prize at the finale and only if the message succeeded without the holder, i.e. outcome gift or survived ("D"). Counterfactual, honest Iris without market play:

| payoff rule | coop | hold | hold − coop (paired) | P(hold wins) | E[finale given contribute] | E[prize given hold] |
| --- | --- | --- | --- | --- | --- | --- |
| v2 (current) | 84.7 | 96.2 | +11.5 ± 0.9 | 63.6% | 23.7 | 44.9 |
| A | 101.6 | 81.2 | −20.4 ± 1.0 | 23.7% | 40.6 | 29.9 |
| D | 84.7 | 91.4 | +6.7 ± 1.0 | 55.8% | 23.7 | 40.1 |
| A+D | 101.6 | 78.0 | −23.6 ± 1.0 | 16.7% | 40.6 | 26.7 |

A alone flips the sign; D alone does not, but D turns holding into a bet on the others' success (the free-rider's risk) and keeps the temptation in 17–24% of seasons, which is the dilemma shape the design asked for. Recommendation: A+D. The same rule should apply to the AI clans' prizes (Amber's 80 becomes 53, paid only on success), which also removes Amber's guaranteed first place.

**P2. Stop burning silk on learning.** Questions (5 silk, 69 per season for an anchorer) and mediation (15 silk) are the two sinks that push every honest strategy below `passive`. Options, in order of preference: refund the question when the Guests answer "no" (information is weaker); mediation cost 15 → 10 paid to the two reconciled clans (a transfer, not a burn); Frost's word 12 → 8. Target: an honest anchoring cooperator should finish above `passive` by a margin comparable to A+D (≈ +20). Untested.

**P3. Pool arithmetic.** Largest-remainder apportionment for Gift shares (sum equals the pot). Declare the faucet: with an active Iris the Gifts mint about 148 silk per season against 306 of base tick income for all six clans (18 per tick over 17 ticks), Storms burn about 12, questions and mediation burn about 103. Keep a per-season faucet/sink table in this file when the numbers change.

**P4. Proof binding.** `resolveEvent` recomputes the leaf from the resolved fields, verifies against an externally held root, and halts with `proof_failed` on mismatch. Test: the F3 tampering script must fail the season.

**P5. Seed.** 128-bit server-side seed, CSPRNG stream, no `seed` / `truthGift` / `V` / `tV` / key phrase in client projections. Test: the client projection schema has no such fields; the F4 brute force on the replica RNG is no longer applicable.

**P6. Auctions.** Bid escrow (silk locked at bid time, refunded when outbid) or fallback to the highest funded bid. Test: the F5 griefing script cannot burn a shard that has a funded bid.

**P7. Debts.** Settle claims with `due <= tick`; a debt cannot be forgotten on tick due−1 (or the shard of an overdue debt is valued at 0 by non-debtors). Test: no claim with `due < tick` exists after `startTick`.

**P8. The Shells leaving must cost something.** Today `gone` ends the season with everyone's silk intact, so the defector pays nothing for a 29% chance of ending the world. Counterfactual (seeds 1..3000):

| strategy | P(gone) | v2 | gone keeps half | gone keeps nothing |
| --- | --- | --- | --- | --- |
| hold-defect-none | 29.7% | 160.4 | 137.6 | 114.8 |
| late-defect-none | 29.6% | 135.9 | 118.0 | 100.1 |
| coop-defect-none | 16.4% | 126.8 | 118.0 | 109.1 |
| hold-honest-none | 0.4% | 96.2 | 96.1 | 96.0 |
| passive | 4.9% | 138.0 | 134.5 | 130.9 |

Even "gone keeps nothing" leaves the defector ahead of the honest player (114.8 vs 96.2), because P2's sinks are the larger lever; P8 is necessary but not sufficient. Recommendation: `gone` zeroes silk like `weapon`.

**P9. Ties.** 3:3 votes (11–27% of finales) count as "reject". Give Iris's vote the tie-break, or make the electorate odd (the Scroll decides only with the key sign present, otherwise abstain). Untested; the effect is bounded by the tie rate times the bonus.

## 5. Other observations

- `late` contribution is a myth: Iris's fragment can never be contributed after her own tV (11..15), so the DEADLINE of 16 never applies to her. The UI should show tV as the real deadline.
- Honest play almost always completes the social loop (Key spoken 97–100%, Ash contributes 96%), so the crisis is well tuned for a cooperative player and lethal (P(gone) 16–33%) for a defecting one; the problem is only that defecting pays.
- `bidder` and `latebid` are within 0.5 silk: AI counter-bids are instantaneous, so bid timing does not matter; what matters is staying funded at closing.
- Under `bidder` Iris wins 95% of Frost's shards (18 951 of 20 000) at a mean price of about 9 silk; the insight pins one dictionary cell, worth roughly two questions.

## 6. Limitations

- One controllable player. Clan-vs-clan "strategies" (e.g. two cooperators against three defectors) cannot be simulated without changing the AI heuristics; the AI world is fixed, so the best-response table is Iris's best response to that world, not an equilibrium of six players.
- Scripted strategies are heuristics, not optimal policies; the oracle shows the ceiling of anchoring (RTP 2.8), the honest anchorer's 1.46 is one reasonable reading policy, not the best one.
- RTP is a ratio of totals over seasons; strategies that spend little have noisy ratios, so the paired net-vs-passive column is the more reliable comparison.
- Counterfactuals in §4 re-price Iris's payoff only; AI behaviour is unchanged, which is exact for P1/P8 under current AI code (the AI never reads V or the bonus) but says nothing about how human clans would adapt.
- The brute-force time in §3.4 is for one thread on the development PC; a GPU or a dozen cores reduces it to seconds.
- Rules `v2` only; `baseline-2d-1` is gameplay-identical (`tests/sim.test.mjs` pins final silk equality for both modes on 10 seeds).

## 7. Reproduce

```bash
cd game
npm run sim -- --quick                 # 300 seasons per strategy, ~10 s
npm run sim -- --out docs/math         # 10000 seasons per strategy + findings, ~4 min, rewrites sim-tables.md / sim-results.json
node scripts/sim/findings.mjs          # the six reproductions only (seeds 1..3000)
node scripts/sim/proposal.mjs          # v3 payoff counterfactuals (seeds 1..3000)
npm test                               # 78 tests incl. 3 harness tests
```

Options: `--seasons N`, `--seed0 N`, `--strategies a,b`, `--rules v2|baseline-2d-1|v2-crypto`, `--no-findings`.
## 8. Rules v3 (implemented 07.11) versus v2

The owner approved P1, P3, P4, P5, P6, P7 and P9 (not P2, not P8); they are implemented in `engine.js` as rule mode `v3` (`docs/rules-baseline.md` §14) with 13 tests in `game/tests/v3.test.mjs`. The same harness was run under v3: `npm run sim -- --rules v3 --no-findings --out docs/math/v3` (seeds 1..10000 per strategy, 17 strategies, 305 s, 1.79 ms per season; 0 rejected intents, 0 unexplained silk). Tables: `docs/math/v3/sim-tables.md`. Seeds are not paired across v2 and v3: v3 runs on a 128-bit seed drawn from the seeded byte source, so the same seed number produces a different season; all comparisons below are between means with 95% CIs. The findings script (`findings.mjs`) is v2-only (its brute-force replica is the mulberry32 RNG); under v3 the six findings are covered by the tests.

### 8.1 What changed, honestly

| measure | v2 | v3 | verdict |
| --- | --- | --- | --- |
| hold − coop, honest Iris without market play (final silk) | 95.8 − 84.3 = **+11.5** | 85.9 − 103.0 = **−17.1** | contributing now wins; `hold` loses in all four trust × market contexts (76–129 vs 92–140) |
| best fragment response | hold in 3 of 4 contexts | `late` (contribute at tV−1) in 4 of 4, `coop` within 0.1–7 silk of it | fragment dimension flipped; late ≈ coop because the finale bonus does not depend on timing |
| best trust response | defect in 6 of 6 (+10…+65) | defect in 6 of 6 (+9…+44) | **unchanged**: P2/P8 were not adopted, so breaking trust still pays and `gone` still keeps silk |
| best market response | none in 6 of 6 | none in 6 of 6 | **unchanged**: questions, words and mediation remain net sinks (P2 not adopted) |
| passive final silk | 138.0 ± 1.0 | 105.0 ± 1.1 | passive lost its guaranteed prize: V is 2/3 and paid only on gift/survived (its prize column fell from 44.5 to 19.0) |
| coop-honest-none vs passive | −53.7 ± 1.0 | **−2.0 ± 1.1** | an honest cooperator is now at par with doing nothing; not yet above it |
| coop-honest-anchor vs passive | −61.9 ± 1.1 | −12.7 ± 1.1 | the anchoring cooperator still loses to passive because of the learning sinks |
| hold-defect-none vs passive | +23.0 | +24.4 | the best exploit is unchanged in size; it is now beaten by `late-defect-none` (+35.1) |
| finale bonus collected by coop-honest-none | 23.2 | 42.0 | 60/30 bonus; P(gift) 47.5% → 57.1% |
| outcome mix, coop-honest-none (gift / lost / survived / weapon / gone) | 47.5 / 10.9 / 38.7 / 2.4 / 0.4 % | 57.1 / 2.8 / 35.2 / 4.5 / 0.3 % | P9: Iris's vote breaks 3:3 ties, so `lost` collapses (−8 pp) and `weapon` doubles (+2 pp) — the tie-break cuts both ways |
| 3:3 ties | 11–27% | 12–28% | frequency unchanged; they are now decided by Iris |
| Gift pool drift | +0.2% minted, 24% of events misround | **0 / 0** over 58 357 claimed events | P3 holds |
| shards burned with a funded second bidder (`bidder`) | 426 (2 885 silk) | **0** | P6 holds; `bidder` still buys 95% of Frost's shards |
| overdue claims transferred (`debtdump`) | 214 (2 996 silk paid for nothing) | **0** | P7: debts are now forgotten two ticks before due and the claim settles on the due tick; debtors still buy back their own debt (19 338 ×) |
| tension, P(gone) | honest 0.2–2.5%, defect 16–33% | honest 0.3–2.3%, defect 16–34% | unchanged (P8 not adopted) |
| Gini (all clans) | 0.10–0.16 | 0.08–0.14 | Amber's guaranteed 80 became a conditional 53; the richest clan is now Frost or Amber depending on the strategy |
| oracle vs honest anchorer | +165 | 259.7 vs 92.3 = +167 | the oracle strategy reads `S.events` directly; under v3 the seed is unguessable, so this is now the server-leak ceiling, not a brute-force result |

### 8.2 Reading

- P1 does what the counterfactual predicted (§4 said −23.6 for A+D on re-priced v2 seasons; the full re-simulation gives −17.1, because deferred prizes also change the AI clans' silk and therefore their bids and anchors). Holding is no longer a dominant or even a good fragment strategy for Iris, and Amber's prize is no longer a free 80.
- The remaining dominant strategy is still "break trust and do not play the market" (`late-defect-none`, 140.1; +35 over passive). That is the expected consequence of leaving P2 and P8 out: the price of betrayal is paid by the world (P(gone) 30%) while the betrayer keeps the silk, and every learning action is still a sink. Those two levers are the next decision for the owner.
- P9 trades `lost` for `weapon`: with Iris as the tie-breaker, a cooperative Iris who misreads the key sign now accepts a weapon in 4.5% of seasons (2.4% in v2). If that is undesirable, the alternative is an odd electorate or abstention without the key sign, not a return to "tie = reject".
- Integrity (P4, P5, P6, P7) changes no distribution except where it should: 0 pool drift, 0 burned funded sales, 0 overdue claims, and tampered reveals end the season (`proof_failed`) instead of paying out.

### 8.3 Reproduce v3

```bash
cd game
npm test                                                   # 157 tests incl. 13 for v3
npm run sim -- --rules v3 --quick --no-findings             # 300 seasons per strategy
npm run sim -- --rules v3 --no-findings --out docs/math/v3  # 10000 seasons per strategy, ~5 min
```
