# Rules baseline (R0)

Source of truth: `prototype-2d/index.html` (commit `4c7098d`). References like `L367` are line numbers in that file.
Extracted from the code on 07.11.2026. The prototype code was not changed. Discrepancies and the author's answers are in §12–13.
Clan names in code are Russian: 0 Ирис/Iris (player), 1 Соль/Salt, 2 Пепел/Ash, 3 Мох/Moss, 4 Янтарь/Amber, 5 Иней/Frost.

## 1. Constants and entities
| What | Value | Where |
|---|---|---|
| Ticks per season | `TICKS=17` | L208 |
| Last tick to contribute a fragment | `DEADLINE=16` | L208 |
| Crisis tick | `CRISIS=13` | L208 |
| Clans | 0 Iris, 1 Salt, 2 Ash, 3 Moss, 4 Amber, 5 Frost | L209 |
| AI personalities `{h honesty, g greed, p paranoia, sk learning}` | Salt .35/.6/.3/.5 · Ash .8/.3/.85/.4 · Moss .92/.2/.2/.35 · Amber .65/.9/.3/.45 · Frost .88/.4/.4/.8 | L210–215 |
| Logogram slots | Place, Action, Power, Delay | L216 |
| Values | Place I–IV · Gift/Storm/Silence/Call · 10/20/40/80 · +1…+4 ticks | L217–218 |
| Stroke forms | arc, spike, loop, drop | L219 |
| Starting silk | 60 for everyone | L271 |
| Income | +3 silk for everyone at the start of each tick | L370 |
| Actions per tick | 3; 2 after losing the "First Word" (`maxAP`) | L318 |
| Tension | starts at 10, clamped at 0, rounded; ≥100 = everyone loses | L271, L313 |
| Starting AI mastery | Salt .12, Ash .10, Moss .08, Amber .10, Frost .18 | L271 |

## 2. Season generation (`newSeason`, L269)
The order of RNG calls matters for reproducibility:
1. `S.perm` — 4 permutations of `[0..3]` (one per slot), `perm[s][form] = meaning`.
2. Events for ticks 3…17: action (tick 3 is always Gift, otherwise weights 40/24/16/20), place `ri(4)`, power (tick 3 is 20, otherwise weights 34/36/22/8), delay `1+ri(min(4, T-1))`, `pub = T - delay`, dots `ri(4)`, salt `hex(12)` from the game RNG. Call order inside the literal: action, power, delay, then place, dots, salt.
3. `leaf = sha256(JSON{t,place,action,power,delay,dots} + salt)`; Merkle tree (an odd leaf is duplicated), `root`.
4. `seedCommit = sha256('seed:'+seed)` (no RNG).
5. `truthGift = rnd() < .6`; `keyHolder = rnd() < .6 ? Ash : Amber`.
6. Fragments per clan: `m = [ri(4), keyHolder ? (gift ? Gift : Storm) : 2+ri(2), ri(4), ri(4)]`, `dots = ri(4)`. The key sign differs only in the Action slot.
7. Prizes `V = [30|40|50|60, 20..50, 30..50, 20..40, 80, 20..40]`, `tV = [11..15, 17, 18, 18, 15, 13..17]`.
8. Ash's Key: one of 4 phrases, salt `hex(8)`, `hash = sha256(phrase+salt)`.
9. Iris's starting memory: "First Word" (w4), "Call on the night of arrival" (w2), "Moss shared silk" (gift, about Moss, w1). `T[0][3]=65`, `T[3][0]=60`, all other trust 50.
10. `startTick()` runs for tick 1 right away (phase is still `intro`).
`ACT.start` (L859): the player's Key salt is `hex(8)` (game RNG), `pKey.hash = sha256(phrase+salt)`, phase becomes `play`.

## 3. Language and dictionary
- Encoding (`encodeForms`, L263): slot `s`'s form sits at position `(dots + s) % 4`, positions clockwise from the top.
- Dictionary votes (`dictVotes`, L322): one per chronicle entry. Rule `dots` — weight 1 at `r = dots`; `top` — weight 1 at `r = 0`; `unknown` — 0.25 on each of the 4 offsets.
- Guess (`guess`, L330): a pinned cell → confidence 1. Otherwise score = votes + 0.35, +1.6 for an unverified purchased word; meanings pinned to other forms of the same slot and "definitely not" meanings are excluded. Confidence = best / sum of positive scores.
- Reading (`readGlyph`, L342): with `unknown` all 4 offsets are tried and the one with the highest total confidence wins.
- A "confident sign" has confidence ≥ 0.65 (`confidentCells`, L349).
- Lie detection (`checkBought`, L351): after each chronicle entry, if votes for the true meaning are ≥1.5 and exceed votes for the purchased one by 0.5 → `revealLie`.
- `revealLie` (L359): a "betrayal" memory w3 about the seller, `trust[0][X] −40`, tension +6, link 0–X breaks (+10).

## 4. Tick order
`startTick` (L367), strictly in this order:
1. Actions reset to the maximum; everyone gets +3 silk.
2. Shard auctions with `exp ≤ tick` close (§8).
3. Iris's debts due this tick: repaid with probability `h` of the debtor (Iris +amount, the debtor −amount without a clamp, trust +10); otherwise a "betrayal" memory, trust −40, tension +6, link breaks.
4. Claims held by AI buyers of debts: repaid with probability `h`.
5. Iris's promise due this tick and fragment in hand → automatic contribution.
6. AI pacts due this tick: if the fragment is in hand — contribute when not isolated and `rnd() < h`; otherwise betrayal (as in step 3).
7. Amber's escrow is paid and the fragment is in hand → contribution, 45/55 silk go to Amber.
8. Voluntary AI contributions (tick ≤16, not isolated, not greedy with `tV ≤ 16`): `c = .05 + max(0, avgTrust−45)/150 + (h−.5)·.2 + (tick≥11 ? .15 : 0) + (tick≥15 ? .3 : 0)`, then `c *= 1 − p·.7`.
9. Personal prizes: fragment in hand and `tV = tick` → +V silk, the fragment goes dark; AI clans lose 10 trust in the holder.
10. Tick >16: every fragment still in hand goes dark.
11. Tick 13: crisis (§9).
12. From tick 4, with probability .22, an AI deceit: deceiver by weights `1−h`, victim a random AI still linked to them, amount 8…17, victim's trust −35, tension +6, link breaks when trust <20.
13. AI trust drifts towards 50 by ±2 per tick (Iris does not drift).
14. Broken AI–AI links restore with probability .2 when both trusts are ≥30 and neither side is isolated.
15. An AI whose trust in Iris is <15 breaks the link with her.
16. AI mastery `+= sk·.045 + .01` (max .95).
17. New voices are logged; AIs place anchors (§6); this tick's offers (§7); on ticks 7 and 11 — Frost's shard (§8).
18. Tick 17 → phase `vote`.

`endTick` (L440): only in phase `play` → reveal this tick's event → clear offers → tension −2 → if tension ≥ 100, outcome `gone` → tick +1 → `startTick` → check tension ≥ 100 again.
The click handler (L916), after **any** click: tension ≥ 100 in phase `play` → `gone`.

## 5. Event reveal (`resolveEvent`, L452)
- Before any change, it records how many slots Iris read correctly (for the chronicle).
- The leaf's Merkle proof is checked against the root.
- Anchors for this tick at the wrong place → stake returned.
- At the right place: **Gift** — each gets their stake + `round(power · w / Σw)`, where `w = tick − tick_placed + 1`. **Storm** — stakes burn. **Silence** — stake returned. **Call** — stake returned; Iris gets a "Call" memory (w2), an AI gets +0.04 mastery.
- If nobody anchored the right place for a Gift, the reward goes to no one.
- The event joins the chronicle, the proof joins the last 5 checks; then `checkBought`.
- `castVote` (L624) also reveals the tick-17 event before the vote.

## 6. AI anchors (`aiAnchors`, L473)
Every AI considers each published, not-yet-due event once. Each slot is read correctly with probability `.3 + .7·mastery`, otherwise at random. An anchor is placed only if the AI read a Gift, the tick is within the season, it has ≥10 silk and `rnd() ≤ .7`. RNG call order: Action, Place, Delay, the .7 check.

## 7. Offers (`genOffers`, L503)
Offers expire at the end of the tick. A clan whose link with Iris is broken sends none.
| Tick | Offer |
|---|---|
| 2 | Salt sells a word (7) |
| 3 | Moss asks for a 15 loan, repays 25 on tick 7 |
| 4 | Frost gives a true word for free ("gift" memory w1, trust +15) |
| 5 | Ash: pact "we both contribute by tick 14" (if both hold fragments and Iris has no other promise) |
| 6 | Frost sells a word (12) |
| 7 | Salt asks for 20, repays 32 on tick 11 |
| 8 | Salt sells a word (7) |
| 9, 13 | Amber: escrow to contribute the fragment for 45 / 55 (if Amber holds it and `tV` has not passed) |
| 10 | Moss: pact by tick 14 (same conditions) |
| 11 | Frost sells a word (12) |
| 3–15 | With probability .3 — a random word sale by Salt / Amber (10) / Frost |
A word sale (`offSell`, L496): a random cell that is neither pinned nor bought; honest with the seller's probability `h`, otherwise a random wrong meaning.
Declining an offer: the seller's trust in Iris −2.

## 8. Memory, visions, shards
- **Forget** (`doForget`, L550): 1 action. Effects of removal: betrayal → trust 50 and the link restores (tension −10); gift → trust −15; "First Word" → `wild`, 2 actions. A vision reveals the `w` nearest unpublished events (by publish tick, then event tick). "Key" mode reveals Ash's phrase.
- The shard is auctioned for 2 ticks. AI bids (rounded; placed when the value is ≥3 and they have the silk): default `rnd·5`; betrayal — the subject 16…26; debt — the debtor `.55·amount`, others `(.25….55)·amount`; promise — the promisee 12…18; gift — the subject 5…9; Call — Frost 9…14; "First Word" — Salt 22…30.
- Iris's bid (`ACT.bid`, L895): best + 3; an AI valuing it at ≥ bid+2 immediately outbids by +2.
- Closing (`resolveShards`, L590): the winner pays the seller; with no bids, or if the winner lacks silk, the shard burns. Effects (`applyShard`, L604): betrayal (the subject destroys it, otherwise the buyer loses 25 trust in the subject); debt (the debtor cancels it, otherwise the buyer holds the claim); promise (the promisee: trust in Iris −40, tension +6); gift (+10 trust); Call (+.06 mastery); "First Word" (the buyer speaks the Key in the finale).
- Frost's shards on ticks 7 and 11: "a word from a slot" (buying = a true word) or, on tick 11 if Iris bought a lie from Salt, "how Salt traded words" (buying exposes all of Salt's lies).

## 9. Crisis and Key
- Tick 13 (`crisis`, L431): tension +15; Ash breaks links with the two clans it trusts least among those it trusts <70; Ash is isolated; Salt's rumor (`rumor`).
- Key vision (UI L767+): available when Ash is isolated, ≥8 confident signs, a memory of weight ≥3 exists, an action is left.
- Speak the Key (`ACT.speak`, L880): 1 action; the hash is checked against the commitment; all of Ash's broken links restore (trust ≥45), trust in Iris 90, isolation lifted; if Ash still holds the fragment and tick < 16 — a pact for the next tick.

## 10. Player actions: cost and conditions
| Action | Cost | Checked in the function | Checked only in the UI |
|---|---|---|---|
| Anchor (`placeAnchor`, L906) | 1 action + 10 silk | tick in `[current, 17]`, no identical anchor | phase `play` |
| Ask the Guests (`ACT.ask`, L867) | 1 + 5 silk | — | cell not pinned, phase `play` |
| Forget (`doForget`) | 1 | memory exists | phase `play`; for the Key — §9 conditions |
| Key (`ACT.speak`) | 1 | — | Ash isolated, phrase known |
| Make peace (`ACT.mend`, L891) | 1 + 10 silk (paid to the clan) | no betrayal memory | the clan's trust in Iris ≥25 |
| Mediate (`ACT.mediate`, L892) | 1 + 15 silk | — | both trust Iris ≥40, neither isolated |
| Accept an offer (`acceptOffer`, L528) | offer price | enough silk | phase `play` |
| Bid on a shard | best + 3 | enough silk, auction open | not own shard, phase `play` |
| Contribute the fragment | 0 | tick ≤16, fragment in hand | phase `play` |
| Vote (`castVote`) | — | — | phase `vote` |
Changing the reading rule is free and re-runs `checkBought` immediately.

## 11. Finale (`castVote`, L624)
AI votes: if the key sign is in the Scroll — correct with probability `.35 + .6·mastery`, and Ash under the rumor has another 40% chance of voting "reject"; without the key sign — 50% (Ash 25%). "Accept" needs ≥4 of 6; a tie means "reject".
| Truth | Accepted | Rejected |
|---|---|---|
| Gift | `gift`: each contributor +40 | `lost`: nothing |
| Weapon | `weapon`: everyone's silk = 0 | `survived`: each contributor +15 |
Plus `gone` — tension ≥ 100 at any moment. The Heir choice appears only on `gift`.

## 12. Discrepancies
**Log ↔ code:** nothing significant. Details missing from the log: the stake on Silence is returned, the Gift share formula (§5), question cost (5 silk), final tick 17, a tie means "reject".

**Code ↔ spec:**
1. **Commitment salts** — 12 hex (48 bits) for events and 8 hex for Keys, from the game RNG (mulberry32, not a CSPRNG), no domain tag or schemaVersion. The spec requires ≥32 CSPRNG bytes and domain separation.
2. **UI-only conditions** (§10): an authoritative engine needs them inside the actions.
3. **No idempotency** (`actionId`/`expectedVersion`) — a new transport layer; it does not change rules.
4. Onboarding, tutorial, customization, tournaments, localization — new features absent from the prototype.

**Prototype defects:**
- `mediate` adds +5 trust without a clamp — can exceed 100.
- Debts and deceits subtract silk without a clamp — an AI balance can go negative.
- `speak` does not check Ash's isolation (only the UI protects it).
- Changing the reading rule can expose a lie and raise tension to 100, but the season ends only on the next click (the change handler does not check the threshold).

## 13. Author's answers (07.11.2026)
1. **Salts:** CSPRNG with compatibility — accepted. Rules `v2` (the engine default) use 32-byte CSPRNG salts and domain-separated commitments (`ftf:leaf:v2|seasonId|index|event|salt`, `ftf:key:v2|…`, `ftf:seed:v2|…`); the game RNG still draws the legacy salts, so gameplay is identical to the prototype. Proven by the `v2-crypto` test over all 60 recorded seasons.
2. **UI-only conditions move into the engine** — accepted. The engine rejects invalid actions with a reason; valid play is unchanged.
3. **Defects fixed in a separate commit** — accepted. Rules `v2`: trust clamp in mediation, AI balances never negative, a rule change settles tension. `baseline-2d-1` keeps the prototype behavior bit-exact for parity tests; `speak` guards Ash's isolation in every mode (answer 2).

**Known limitation (not fixed):** the season is generated by mulberry32 from a 32-bit seed. Someone who sees several revealed events could brute-force the seed offline and predict the rest. Production needs a 128-bit seed and a CSPRNG-grade stream cipher; for the hackathon the seed stays server-side and the README says so.

## 14. Rules v3 (approved by the owner 07.11.2026, implemented in `engine.js` behind `rules: 'v3'`)

Source: `docs/math/economy-report.md` §4 (proposals P1–P9). The owner approved P1, P3, P4, P5, P6, P7 and P9 first, then (later on 07.11) P2 (learning sinks) and P8 (the Shells leaving costs silk) as well; all nine are in `v3`. `baseline-2d-1` and `v2` are unchanged; `v2` stays the engine default. The commitment schema (`ftf:leaf:v2|…`, `ftf:key:v2|…`, `ftf:seed:v2|…`) is unchanged, so the `season-commit` contract and its test vectors need no update.

| # | Rule in v2 | Rule in v3 | Where |
|---|---|---|---|
| P1 | Personal prize V ∈ {30,40,50,60} for Iris (20..50 / 30..50 / 20..40 / 80 / 20..40 for the AI clans), paid in silk at tick tV when the fragment goes dark. Finale: each contributor +40 (gift) / +15 (survived). | V scaled by 2/3 and rounded (Iris 20/27/33/40, Amber 53). At tV the fragment goes dark and the prize is only **promised** (`frag[i].prize`); it is paid at the finale **only if the outcome is gift or survived** (`frag[i].prizePaid`). Finale bonus **60 / 30**. | `V3` constants, `newSeason`, `tickPrizesAndSocial`, `castVote` |
| P3 | Gift share `round(pot · w / Σw)` per anchor; the shares can sum to pot ± 1 or +2. | `apportion(pot, weights)`: largest-remainder split, shares sum to the pot exactly; fractional ties go to the earlier anchor. | `apportion`, `resolveEvent` |
| P4 | The reveal verifies the stored leaf against the root and only logs ✓/✗; payouts use the in-memory fields regardless. | The reveal recomputes the leaf from the fields being paid out and verifies the path; any mismatch ends the season with outcome **`proof_failed`** before any silk moves (also for the tick-17 reveal inside the vote; `S.votes` stays null). | `resolveEvent`, `endTick`, `castVote` |
| P5 | 32-bit numeric seed, mulberry32, `S.seed` in the state; the seed is brute-forceable from 4 revealed events. | 128-bit seed from the CSPRNG (`opts.randomBytes`) or `opts.seedHex`; the numeric `seed` argument is ignored. Game RNG = SHA-256 counter mode over the seed (`S.rng = {ctr, i, block}`, snapshot-exact). New `clientProjection()` strips the seed, RNG state, truth, other clans' V/tV, Ash's phrase, unpublished events, unresolved meanings, held fragments' glyphs, offer honesty and AI valuations; transports must send it, never `S`. | `rnd3`, `newSeason`, `clientProjection` |
| P6 | If the top bidder cannot pay at closing, the shard burns even when funded bids exist. | The highest bid that is still covered wins. | `resolveShards` |
| P7 | A debt can be forgotten on any tick; a claim bought after the due date never settles (`due === tick` only). | `forget` rejects a debt memory with `due < tick + 2` (reason **`debt_due`**): the auction closes on or before the due tick. Claims with `due <= tick` settle in `startTick`. | `forget`, `startTick` |
| P9 | "Accept" needs ≥ 4 of 6; a 3:3 tie means reject. | ≥ 4 of 6, or exactly 3 **with Iris among the yes votes** (`tally`). | `tally`, `castVote` |
| P2 (approved later on 07.11) | A question costs 5 silk whatever the answer; mediation burns 15 silk; Frost sells a word for 12. | A "no" from the Guests **refunds the 5 silk** (the question still costs attention); mediation costs **10, paid 5 + 5 to the two reconciled clans** (a transfer, nothing burned); Frost's word costs **8**. Salt (7) and Amber (10) unchanged. | `V3.askRefundOnNo / mediateCost / frostWord`, `askGuests`, `mediate`, `offSell` |
| P8 (approved later on 07.11) | Outcome `gone` (tension ≥ 100) ends the season and everyone keeps their silk. | Every clan keeps `round(silk · V3.goneKeep)` with **goneKeep = 0**: the Shells leaving wipes the silk of the world exactly like the weapon does; the loss per clan is recorded in `S.goneLoss`. Size chosen from the counterfactual in `docs/math/economy-report.md` §9: keeping 1/2 or 1/4 still left `late-defect-none` above the honest cooperator. | `V3.goneKeep`, `finish` |

New identifiers that need UI text: outcome `proof_failed`, rejection reason `debt_due` (added to `src/locales/en.js` and `ru.js`). Tests: `game/tests/v3.test.mjs` (13 tests, one or more per proposal, each of the six review findings replayed under v3). Simulation under v3: `npm run sim -- --rules v3 --no-findings --out docs/math/v3` (the findings script's brute-force replica is written for the v2 RNG and is not applicable to v3).
