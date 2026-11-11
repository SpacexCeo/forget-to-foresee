# Forget to Foresee — Foresight Exchange implementation plan

**Audience:** Claude (coding agent) working in [SpacexCeo/forget-to-foresee](https://github.com/SpacexCeo/forget-to-foresee).
**Language:** English only, as in `AGENTS.md`. All new UI, dialogue, comments, tests, and docs in English.
**Inspected repo:** `main` at `3653a1f` (11 Nov 2026 11:20 Europe/Kiev, UTC+2). Do not assume later commits until you pull.
**Related docs (read, do not rewrite unless a task below says so):**
[`FTF-HACKATHON-TZ.md`](./FTF-HACKATHON-TZ.md),
[`FTF-COMPETITOR-MAP.md`](./FTF-COMPETITOR-MAP.md),
`docs/api/README.md`, `docs/api/openapi.yaml`, `docs/decisions.md`, `docs/hackathon-rules.md`.

**This file is a plan.** It does not authorize a merge to `main`, a deploy, a mint, or a hosted API. Do not modify this plan's intent to sneak in wallet sign-in, real-money settlement, mainnet, or a second game.

---

## 0. Decision (read this first)

Efte proposed a trading game on real market values, paid only in in-game currency, where our agents can trade. That idea is good for the Games track **if and only if** it stays a foresight drill inside Forget to Foresee, not a new trading-bot product.

**Recommended scope before code freeze (13 Nov 2026 20:00 Kyiv):** ship **Scope A (Judge Echo)** only after **P0 and P1-C** from the TZ are green (P1-A ideally too). Treat Scope A as the TZ's leftover timed challenge (**replace P2-A "Predict three events"**, do not build both). If P0 or P1-C are still open at **13 Nov 14:00 Kyiv**, **cut the Exchange entirely** from the submission build and leave this document as post-hackathon work.

**Why this gate exists.** The TZ is explicit: do not start a second game, do not rewrite `game/src/game/engine.js`, do not host the agent API, and do not spend freeze week on P3. Crownfall already shows a finishable 3D loop. A broken Shell or a missing shard card loses the hackathon faster than a missing market.

**Hard rules for any Exchange work:**

1. Silk in the Exchange is **practice silk** on a **separate ledger**. Never debit or credit `S.silk` in `engine.js`. Season parity tests (`game/tests/v3.test.mjs`, `v2.test.mjs`, `parity.test.mjs`) must stay untouched in meaning.
2. No real money, no deposits, no withdrawals, no wallet, no mainnet, no player-owned mint, no "APY", no "invest".
3. Humans and agents use the **same** room command bus (`game/src/net/room.js`) and the **same** Exchange rules module. No hidden future prices.
4. Judge mode (`?demo=judge`) always uses the **frozen snapshot** in the repo. Never a live HTTP feed.
5. English copy only. Honest labels on every screen.

---

## 1. Why it fits, and why it is not a trading bot

### Lore

The Guests already ask Iris to read signs of what has not happened yet. The clans already trade **in-game goods**: silk, words, anchors, escrow, and forgotten memories at auction (`accept_offer`, `bid_shard`, `place_anchor` in `engine.js`). The hill town already has a walk-in shop `id: "exchange"` (`game/src/scenes/town-data.js`, piece `town_shop_exchange`, door on the square). The **shardkeeper** stands at that door (`game/src/play/townsfolk-plan.js`). Talking at the counter today opens the Memories / shards view (`SHOP_OPENS.exchange = 'shards'` in `game/src/scenes/town-layout.js`). A display-name map in the same file says `exchange: 'maren'` — treat that as an internal id; **do not add a fourteenth townsfolk**. Use the existing shardkeeper. If locales later give them a spoken name, use that name consistently.

**The fiction:** the Exchange is where the island practices foresight on the *outer world*. The Shells hear distant "weights" (real historical market prices) the way they hear upcoming signs. Players and clan agents stake **practice silk** on those echoes, then watch the next sealed bar resolve — the same emotional beat as staking on a Gift or Storm, but pointed at a public series instead of a Shell trial.

Do not frame it as a bank, a DEX, or a brokerage. It is a **Foresight Exchange**: a glass terminal in the shardkeeper's shop.

### Why it helps Games / NFTs judging

- **Fun, still Arrival.** A 90-second drill at a real counter is a verb judges can see, not a mermaid-market clone of Lunearcy or Crownfall.
- **Agents, visibly.** The five AI clans already act inside `startTick`. Here they stand on a shared board and place the same `place_order` action a human places. That is closer to "NPCs with wallets" in *spirit* (in-game purses, no NEAR wallets) than a silent autopilot.
- **Real usage, honestly.** A local, shareable result (seed, snapshot hash, scores) is usage without a fake weekly tournament. The existing lobby card is still a labeled simulation (`game/src/ui/tournament.js`).
- **NFT, only if true.** Scope A mints nothing. Scope B may coordinator-mint a badge or commit a result root on testnet, with the same honesty rules as shards (`ftf-shards.testnet`) and the undeployed `agent-card`.

### How we refuse to become a trading bot

| We do | We do not |
|---|---|
| A short, timed drill with a beginning and an end | An always-on blotter, grid bot, or live CEX UI |
| Historical public prices, sealed in-repo for judges | Live order routing, leverage, or cash-out |
| Lore names on the glass, mid and change as "weights" | "Profit", "invest", "APY", token tickers as the hero UI |
| Scripted clan agents with visible personality | High-frequency agents, hidden alpha, peeking future bars |
| Practice silk, isolated ledger | Season silk, NEAR, USDC, or any withdrawable asset |

Competitors such as OneUp are DeFi perps with Life NFTs. Bazaar pitches merchant-NFTs that own wallets. We will look worse if we imitate them with dishonest copy. We look better if the terminal feels like the Shell glass.

---

## 2. Baseline (already in the repo)

Inspected facts. Re-verify if `main` has moved.

| Area | Where | What is true today |
|---|---|---|
| Season engine | `game/src/game/engine.js` (718 lines), rules `v3` default in the client | Silk starts at 60 per clan; +3 per tick; spent on anchors (10), Guest questions (5), mend/mediate, word buys, loans, escrow, shard bids. Auctions, barter, and memory-as-price are **in-game only**. No price feed, no order book. |
| Headless authority | `game/src/net/room.js`, `engine-host.js`, `api.js`, `catalog.js` | One command bus for the browser (local transport) and `server/`. Envelope `{actionId, expectedVersion, type, args}`. `actionId` is an idempotency key (`^[A-Za-z0-9._:-]{8,128}$`); replay returns the stored result with `replayed: true` / header `Idempotent-Replayed: true`; reuse for a different command is `409 idempotency_key_reused`; stale version is `409 version_conflict`. Planned actions return `501`. |
| Catalog | `CATALOG_VERSION` `1.0.0`, `API_VERSION` `v1` | Implemented season actions plus world `move` / `inspect` / `talk` / enter-exit Shell / `assemble_logogram`. Planned: `propose_trade`, `chat`, `helper_contribute`, `mint_final_card` (never for agents). |
| Projection | `game/src/net/projection.js` | Per-viewer. Helpers do not see Iris's silk, memories, offers, or visions. Seed, salts, truth, AI valuations, unpublished events are never sent. |
| HTTP server | `server/src/server.js`, `rate-limit.js` | Localhost only (`127.0.0.1:8787`). Commands 20/s (burst 40) per token, reads 50/s, create 0.5/s. 16 KiB body cap. OpenAPI at `GET /v1/openapi.yaml`. **Not hosted** on GitHub Pages (static). Hosting it is TZ P3. |
| Example agent | `server/examples/agent.mjs` | Plays a full season over HTTP, no game imports, fresh actionId per command, retries 409. |
| Town hook | `town_shop_exchange`, shardkeeper at the door, counter empties in `town-data.js` | Walk-in interior already exists. `SHOP_VIEWS` is currently only `shards` and `dictionary`. |
| Tournament | `tournament.js`, `tournament-card.js` | Labeled simulation, localStorage enrollment, synthetic week, no prizes. TZ P2-A wanted a local "Predict three events" run instead. |
| NEAR testnet | `ftf-seasons.testnet`, `ftf-shards.testnet`; `contracts/agent-card` written, not deployed | Client is read-only. No wallet-selector, no mainnet, no client signing. |

World map places (`game/src/net/catalog.js` `PLACES`) are island/Shell only today. Scope A may add `shop:exchange` later; the first UI may be a town overlay that does not yet go through proximity, but the **rules** must still run in the room so a headless agent can play.

---

## 3. Scope A — Judge Echo (hackathon-safe)

A self-contained foresight drill. Visible on a judge path detour. Cuttable without damaging the season.

### 3.1 Player-visible slice

- From the town: enter `town_shop_exchange`, talk to the **shardkeeper** (or use the counter). A second prompt appears next to the existing Memories option: **"Practice foresight"** / "Look at memories". Memories must keep working.
- Optional judge entry: `/?demo=judge&exchange=1` starts a **short** drill (see timing) after, not instead of, the shard-card beat. The default `?demo=judge` 5-minute table **must still complete without the Exchange**. If the extra query is absent, the shop remains optional.
- A glass terminal (2D overlay is enough if the 3D prop is not ready) shows: three Echoes, last few bars, mid "weight", the player's practice-silk purse, three clan agents acting, a countdown, and a persistent disclaimer.
- The player may buy or sell at the house quote (market order) a few times. Agents act once per bar. At the end: mark-to-market, leaderboard **You vs Salt vs Amber vs Frost** (three scripted agents is enough), export/copy a JSON result, every screen says **"Local foresight drill — no prizes, no real money, not financial advice."**

### 3.2 Timing

- **Default drill:** 8 bars, ~10–12 seconds of UI time per bar, about **90 seconds** total, plus a 10-second result card.
- **Judge short drill** (`exchange=1` or a "Short drill" button): 4 bars, about **40–45 seconds**.
- Bars are successive **historical daily** observations from the sealed snapshot, played in chronological order, compressed in time. The clock is the drill timer, not wall-market hours.

### 3.3 Cut line (13 Nov, Europe/Kiev)

| Time | If this is not true, do this |
|---|---|
| Start of Exchange work | P0 and P1-C are green (tests + a walked `?demo=judge`). If not, **do not start**. |
| 13 Nov 14:00 | Rules module + tests + snapshot + a playable overlay (lobby or shop) + honest copy + example agent can finish a drill. If the 3D shop hook is unfinished, ship the overlay from a lobby / shop door prompt only and say so in the README. |
| 13 Nov 16:00 | If tests are not green or the disclaimer is missing, **revert Exchange from the submission branch** (or leave it behind a default-off flag `?exchange=1` only, documented as incomplete). P0/P1 must ship. |
| 13 Nov 20:00 | Freeze. No new systems after this. |

Do not implement Scope B before freeze. Do not implement TZ P2-A in parallel.

### 3.4 Explicitly out of Scope A

Live price fetches in judge/demo; order book or AMM curve; short selling or leverage; limit / stop / cancel (market orders fill immediately, so no cancel); converting practice silk into season silk; hosted `server/`; new NEAR contract; minting a badge; new townsfolk; rewriting `engine.js`; touching season Merkle / season-commit behavior.

---

## 4. Scope B — after 15 Nov 01:59 Kyiv

Build only after the submission is out.

- Optional live public feed (same provider as the snapshot), with cached snapshot fallback on any error, timeout, or CORS failure. Judge and recorded demos still pin a snapshot id.
- Limit orders and a cancel action; still no margin.
- More Echoes; maybe one clearly labeled commodity or NEAR-USD **if** legal copy stays calm and it does not become the hero of the pitch.
- Practice silk may optionally buy a **cosmetic or lore flag** (a sign on the shop wall), never season power and never a withdrawable token.
- Headless agents over the existing local API, and later a **hosted** agent API only if the owner asks (that is TZ P3).
- Weekly or daily sealed drill: snapshot id committed on testnet; result root committed; optional **coordinator-minted** badge NFT for a published winner list, labeled "coordinator-minted, not player-owned", only if the mint actually happened. No player wallet.
- Proximity place `shop:exchange` on the world map; agents must walk to the counter in `proximity` sessions.
- Chat / `propose_trade` stay separate planned season actions; do not overload them for the Exchange.

---

## 5. Design

### 5.1 Currency

- Name in UI: **practice silk**. Code id: `practiceSilk`.
- Non-transferable off the device / session. No bridge, no NEAR, no merch cash-out.
- Each drill grants a fixed purse: **100 practice silk** to the player and to each competing agent. Unused purse does not spill into the season.
- Integer amounts only (no fractional silk). Positions are integer "echo units".
- Starting purse, fees, and settlement use integer arithmetic. Document rounding: always **floor** fees and **floor** fills in the house's favor, then unit-test it.

### 5.2 Price source

**Provider for the frozen snapshot (Scope A):** [Frankfurter](https://www.frankfurter.app/) (`https://api.frankfurter.app`), a free, no-key wrapper around European Central Bank reference rates. License and attribution must be copied into the snapshot file and the README. This is FX, not a crypto casino, which keeps the "not a trading bot" read cleaner than CoinGecko.

**Snapshot file:** `game/public/data/exchange-snapshot-v1.json` (and a copy under `game/src/game/exchange/` if the public path is awkward for Node tests).

Suggested shape:

```json
{
  "spec": "ftf-exchange-snapshot/1",
  "id": "echo-2024-q1",
  "source": "https://api.frankfurter.app",
  "attribution": "European Central Bank reference rates via Frankfurter",
  "retrievedAt": "2026-11-12T12:00:00+02:00",
  "base": "USD",
  "quotes": ["EUR", "JPY", "CHF"],
  "bars": [
    { "t": "2024-01-02", "EUR": 0.9123, "JPY": 141.23, "CHF": 0.8410 }
  ],
  "hash": "sha256 of the canonical bars+quotes payload, hex"
}
```

A small script `game/scripts/build-exchange-snapshot.mjs` fetches a **fixed** inclusive date range (choose ~40 business days so a drill can start at several offsets), writes the file, computes `hash`, and fails if the hash does not match a committed expected value on later re-runs. Commit the JSON. Do not fetch at runtime in Scope A.

**Replay:** a drill is identified by `{snapshotId, startIndex, barCount}`. Given those, every client and test must produce identical mids, quotes, and settlements. `?demo=judge&exchange=1` uses a **fixed** `startIndex` written in `near-deployment.js` or a tiny `game/src/net/exchange-deployment.js` (public constants only).

**Scope B live path:** fetch the same provider; on failure or if `mode=judge` / `replay`, use the snapshot. Never mix a live bar into a replay id.

### 5.3 Instruments (Echoes)

Three instruments, lore name first, outer-world name in muted type:

| Code | Lore name | Series (snapshot) |
|---|---|---|
| `salt` | Echo of Salt | USD/EUR (store as EUR per USD from the file) |
| `amber` | Echo of Amber | USD/JPY |
| `frost` | Echo of Frost | USD/CHF |

If you invert a pair for display, invert it in one function and test it. Do not relabel them as "investment assets."

### 5.4 Market structure (start here, not an AMM)

**Simple house market maker**, not a CLOB and not an AMM.

- Mid at bar `i` is the snapshot value for that Echo.
- Bid = mid × (1 − spread/2), ask = mid × (1 + spread/2). **Spread = 0.4%** (0.004) in Scope A.
- **Market buy** fills at ask for `qty` units if `qty * ask + fee ≤ practiceSilk` and `qty` is a positive integer ≤ `MAX_QTY` (start with **5**).
- **Market sell** sells `qty` of a long position (or the whole position if `qty` omitted and the player is flattening) at bid.
- **Long only** in Scope A. No short. Selling more than you hold is `no_position`.
- Fill is immediate and total. No partials. No resting orders. Therefore **no `cancel_order` in Scope A** (list it as `planned` in the catalog if you mention it).
- At bar advance, open longs are marked to the new mid for the leaderboard; they are not auto-liquidated. At drill end, all positions are closed at the last bid (document this; test it).

Do not implement a constant-product AMM in A. It adds inventory math the house MM does not need.

### 5.5 Fees

- **Fee = 1%** of notional (qty × fill price), floored to a whole practice silk, **minimum 1** if notional ≥ 1.
- Fee is paid in practice silk at fill, to the Exchange (a house account on the ledger, shown as "the Exchange"). Not burned, not paid in NEAR.
- Show fee on the confirm line: "Buy 2 Echo of Salt at 0.91 — fee 1 practice silk."

### 5.6 Round, timer, leaderboard

- Phases: `idle` → `open` (bars 1…N) → `settled`.
- While `open`, the UI clock counts down the current bar, then the module calls `advanceBar()`. Scripted agents act at the start of each bar, **after** the new mid is public, **before** the human is blocked from acting (humans may act any time in the bar). Agents do not act twice in one bar.
- Score = final practice silk after forced close, tie-break = fewer fills, then name. Kind labels: `human` or `agent`.
- Persist last local results under a new storage key, e.g. `ftf.exchange.v1` (do not reuse `STORAGE_KEYS.tournament` without a migration). Export JSON: `{spec, snapshotId, startIndex, barCount, hash, scores, fills, at}`.
- Every view includes `simulation: true` / "Local foresight drill — no prizes."

### 5.7 Built-in agent policies (honest, no peeking)

Implement in `game/src/game/exchange-agents.js`. Each policy sees only bars `≤ current`.

- **Salt — cautious:** trade only if the last 3 mid changes have the same sign; size 1.
- **Amber — eager:** buy 1 of the Echo with the largest drop from bar 0 to now; sell if it is up again; max 2 units.
- **Frost — mean-reversion:** if last mid is below the average of visible bars by more than 0.3%, buy 1; if above, flatten.

Deterministic given the snapshot window (no `Math.random` unless seeded from the drill id). Unit-test that an agent with access to `bars[current+1]` is **not** how these functions are written (they must not even receive future bars).

---

## 6. Agent API

Keep `API_VERSION` at `v1` (additive). Bump `CATALOG_VERSION` to `1.1.0`.

### 6.1 New actions

Add to `game/src/net/catalog.js`. Kind is **`exchange`** (new kind), not `rules` and not `world`. `runRules` in `room.js` must **not** be used: those calls go through `ENGINE_CALLS` into `engine.js`. Add `runExchange(def, args, m)` beside `runRules` / `runWorld`. A command with kind `exchange` still uses the same envelope, idempotency, version check, rate limits, and history.

| type | status in A | params | preconditions | errors |
|---|---|---|---|---|
| `start_exchange` | implemented | `{ snapshotId?, startIndex?, barCount? }` — judge/demo ignore client-supplied window if a fixed window is configured | `role_controller`; not already `open` | `already_open`, `bad_snapshot`, `bad_window` |
| `place_order` | implemented | `{ echo: 'salt'|'amber'|'frost', side: 'buy'|'sell', qty: integer 1…5 }` | `role_controller`, drill `open`, optional `near_exchange` in proximity mode **once the place exists**; in A, allow `free` or a flagged town overlay without blocking the example agent | `phase`, `bad_echo`, `no_silk`, `no_position`, `qty` |
| `advance_exchange_bar` | implemented | `{}` | `role_controller`, drill `open`; also called by the room ticker when the bar timer elapses | `phase` |
| `cancel_order` | **planned** (501) | — | — | — |
| observation | via existing `GET .../observation` | — | — | — |

Do not add a separate `observe_market` HTTP route in A. Put an `exchange` object on the observation:

```json
{
  "exchange": {
    "phase": "open",
    "spec": "ftf-exchange/1",
    "snapshotId": "echo-2024-q1",
    "hash": "…",
    "bar": 3,
    "barCount": 8,
    "barEndsAtSim": 0,
    "disclaimer": "Local foresight drill — no prizes, no real money, not financial advice.",
    "echoes": [
      { "id": "salt", "name": "Echo of Salt", "series": "USD/EUR", "mid": 0.91, "bid": 0.908, "ask": 0.912, "history": [0.90, 0.907, 0.91] }
    ],
    "you": { "practiceSilk": 86, "positions": { "salt": 2, "amber": 0, "frost": 0 } },
    "board": [
      { "id": "iris", "kind": "human", "name": "You", "mark": 88 },
      { "id": "salt", "kind": "agent", "name": "Salt", "mark": 101 }
    ]
  }
}
```

`history` on each Echo is **only bars already public**. Never include `bars[bar]` or later before `advance_exchange_bar` has published them. Helpers (if present) may see public mids and the board, not the controller's fills if you decide fills are private — default in A: **fills and positions of agents and the human are public on the board** (it is a shared drill). Season secrets stay hidden.

### 6.2 Idempotency and rate limits

Reuse room idempotency and server token buckets as they are. Do not invent a second key scheme. Example agent: new `actionId` per command, on `409 version_conflict` re-read observation and retry, same as `server/examples/agent.mjs`.

A tighter **game** limit: at most **one `place_order` per actor per bar** for scripted agents; humans may place up to **3** per bar (stop button-mashing from looking like a bot). Enforce in the Exchange module (`too_many_orders`) so HTTP and the browser match.

### 6.3 Example agent

Add `server/examples/exchange-agent.mjs`. It must import nothing from `game/src/game`. Policy: Salt-like (three same-sign changes, size 1). It creates a session, `start_exchange` with the judge window if required, loops observe → `place_order` when its rule fires → `advance_exchange_bar` when it is the controller and the bar should complete (or waits if a ticker advances bars). Prints a JSON summary: `{snapshotId, hash, scores, commands, rejected: 0, peekedFuture: false}`.

### 6.4 Equivalence

Extend `server/tests/equivalence.test.mjs` or add `server/tests/exchange.test.mjs`: the same sealed window driven in-process (`createApi`) and over HTTP must yield identical board scores and observation hashes. Security test: a forged observation request must not return future mids (add a bar to the snapshot and assert `history.length === publishedCount`).

---

## 7. Optional NEAR (honest, mostly Scope B)

**Scope A:** no new contract, no mint, no "on-chain market." The terminal and the exported result show `snapshotId` and `hash`. You may write "These outer-world weights are sealed in the game files (sha256 …)." Do **not** say "verified on NEAR" for that hash.

**Scope B, if the owner wants it:**

1. Coordinator commits `{snapshotId, hash, window}` on testnet (a small new contract **or** a documented reuse of `season-commit` only if the byte format still fits — do not overload season leaves with FX bars). Client remains read-only.
2. After a published weekly drill, coordinator commits a Merkle root of results. Say "verified on-chain" only for that commit, in the same voice as `contracts/season-commit/README.md`.
3. Optional badge: coordinator-mints a NEP-171 to a named testnet account for a winner, labeled **"coordinator-minted, not player-owned."** If it is not deployed, the UI shows a **labeled preview**, never a mint toast.

Do not put keys in the repo. Do not block Scope A on this.

---

## 8. UI, copy, tests

### 8.1 In-world UI

Preferred: the existing Exchange interior and counter (`shopFromData`, `SHOP_TRANSITION`, shardkeeper). Extend `SHOP_VIEWS` with `'foresight'` (name stable in code). Talking to the keeper or using the counter offers two actions: Memories (current `shards`) and Practice foresight (new). Fallback: a door prompt or lobby button "Foresight Exchange (local drill)" if interior wiring slips the cut line.

Do not build a Bloomberg table. Use the existing HUD typography, one glass panel, large countdown, three Echo rows, Buy / Sell, board of four names, disclaimer always visible.

Optional world-HUD hook: a short toast the first time the player is near the Exchange door (`game/src/play/hints.js` pattern, observation-driven, no engine import).

### 8.2 Copy (English)

Suggested keys under `exch.*` in `game/src/locales/en.js` (and the other four locales if you touch i18n tests — at minimum English, and do not fail `ui-i18n-locales.test.mjs`).

- Title: "Foresight Exchange"
- Invitation: "The shardkeeper keeps a glass for outer-world weights. Stake practice silk on what happens next. This is a local drill."
- Disclaimer (always): "No real money. Practice silk cannot be withdrawn. Not financial advice. Historical reference rates, not a live market."
- Result: "Local foresight drill — no prizes. Snapshot {id}, hash {short}."
- Forbidden words: wallet, invest, profit, APY, brokerage, withdraw, mainnet, "minted" (unless a real badge exists in B).

Update the README real/mock table: Exchange is **local**, snapshot is **in-repo**, not on NEAR in A.

### 8.3 Tests (must land with the feature)

| File | What |
|---|---|
| `game/tests/exchange.test.mjs` | Snapshot hash; windowed replay is deterministic; buy/sell/fee/floor; cannot short; cannot overspend; end-of-drill flatten at last bid; agents never receive future bars; one-agent-order-per-bar; idempotent module calls. |
| `game/tests/client/exchange-ui.test.mjs` | Disclaimer text present; Memories still opens from the shop; `?demo=judge` without `exchange=1` does not auto-start the drill; short drill is 4 bars. |
| `server/tests/exchange.test.mjs` | Catalog lists new actions; HTTP place_order; 409 replay; 422 `no_silk`; observation has no future mids; equivalence HTTP vs in-process. |
| Existing suite | `npm test` in `game/` and `server/` stays green. **No** golden-value changes in `v2`/`v3`/`parity` unless you have accidentally coupled silk — if that happens, you have a bug; revert the coupling. |

Register new game tests in `game/package.json` `"test"` (it is an explicit list).

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Scope creep vs Crownfall / P0 quality | Gate in §0 and the 13 Nov 14:00 / 16:00 cut line. Overlay-only fallback. |
| Looks like a trading venue or unlicensed investment | FX historical rates, practice silk, disclaimer, Arrival tone, no cash-out, no live book. |
| Legal / trust: "real market values" | Every screen: no real money, not financial advice, historical reference rates. No solicitation to trade those pairs outside the game. |
| Feed outage | Scope A never hits the network in play. Scope B falls back to snapshot. |
| Breaking season economy or Merkle proofs | Isolated ledger; do not edit `engine.js` rules or `contracts/season-commit`. |
| Hidden-info leak | Projection tests; agents get a sliced history; no `seed` of unpublished bars. |
| Naming clash (`SHOP_KEEPERS.exchange = 'maren'` vs program key `shardkeeper`) | Do not invent Maren as a new model. One character: the shardkeeper. Align display names in locales. |
| Two timed modes (P2-A and Exchange) | Build only the Exchange as the leftover timed challenge. |
| GitHub Pages cannot host `server/` | Scope A is fully playable in the static client (room + Exchange module in-browser). The example agent remains localhost. Do not claim a public agent endpoint. |

---

## 10. Effort and task list

**Effort (one focused Claude + existing owner art):** Scope A about **10–14 hours** if P0/P1-C are already done: ~3h rules+snapshot+tests, ~2h room/catalog/projection, ~3h UI/copy/shop hook, ~2h example agent and server tests, ~1–2h judge wiring, README, video beat. If P0 is still open, **do not spend these hours**. Scope B is a later week (feed, limits, world place, optional contract).

Do work in this order. Skip a step only at the cut line.

1. **Snapshot and rules module** — `game/scripts/build-exchange-snapshot.mjs`, `game/public/data/exchange-snapshot-v1.json`, `game/src/game/exchange.js`, `game/src/game/exchange-agents.js`, `game/tests/exchange.test.mjs`. No UI yet.
2. **Room + catalog + projection** — `game/src/net/catalog.js` (version bump, new kind, actions, precondition `near_exchange` reserved), `game/src/net/room.js` (`runExchange`, `ENGINE_CALLS` left unchanged), `game/src/net/projection.js`, `game/src/net/text.js` (rejection strings), `docs/api/openapi.yaml`, `docs/api/README.md` (implemented vs planned table).
3. **Server example + tests** — `server/examples/exchange-agent.mjs`, `server/tests/exchange.test.mjs`, `server/package.json` test list if any. Do not change rate-limit defaults unless a test requires a hook.
4. **UI + copy** — `game/src/ui/exchange-terminal.js` (new), locales `exch.*`, wire from shop: `game/src/scenes/town-layout.js` (`SHOP_VIEWS` / opens), the shop interaction code that currently opens shards (find the consumer of `shop.opens` before editing; keep shards), optional `game/src/ui/lobby.js` button. Storage key next to `game/src/ui/storage.js`.
5. **Judge path** — parse `exchange=1` next to the existing demo flag (same place `?demo=judge` is read, likely `game/src/main.js` / boot / flow). Do not lengthen the default judge table. Add a line to the README real/mock table and, if you ship it, one sentence in `docs/submission/jury-video.md`.
6. **Stop.** Update `docs/decisions.md` with one dated row. Do not open a PR to `main` unless the owner asks. No push to `main`, no mint, no live feed.

---

## 11. Acceptance criteria (Scope A)

- `npm test` in `game/` and `server/` is green, including the new files registered in the test script.
- `engine.js` season rules are unchanged; v2/v3 parity goldens unchanged.
- A human can finish a 90-second drill and a 4-bar short drill, see a leaderboard of You vs at least three agents, and copy a result JSON that contains `snapshotId`, `hash`, and `simulation: true` (or equivalent honest flag).
- `?demo=judge` without `exchange=1` never auto-starts the drill and still shows Memories from the Exchange shop.
- `?demo=judge&exchange=1` uses the fixed window only (no network).
- Disclaimer is visible on the open and settled screens.
- Headless `node server/examples/exchange-agent.mjs` completes one drill with `rejected: 0` against localhost.
- Observation never includes a mid from a bar that has not been published.
- README / real-mock table does not claim NEAR settlement or a hosted API.
- No wallet UI, no mint toast, no season-silk change.

---

## 12. Demo video beat (optional 8–10 seconds)

Insert **after** the shard-card beat in the 60-second jury video, only if Scope A actually shipped and the default path still fits. If time is tight, keep the TZ 60-second script and cut this beat.

| Time | Picture | Spoken or caption |
|---|---|---|
| 0–2 s | Door of the town Exchange, shardkeeper waves | The island practices foresight on the outer world. |
| 2–6 s | Glass terminal: three Echoes, You buy 1 Echo of Salt, Frost buys on the board | Practice silk only. Agents use the same rules. |
| 6–8 s | Last bar ticks, board settles, You 2nd, Frost 1st | Local drill. No prizes, no real money. |
| 8–10 s | Snapshot hash on the card, short and readable | The weights were sealed in the game files. |

**Forbidden captions:** live NEAR prices paid in NEAR; agents have wallets; "we listed a token"; weekly prize pool; "verified on NEAR" (unless Scope B commit actually exists).

---

## 13. What not to do

- Do not start this work before P0 and P1-C are done.
- Do not implement P2-A "Predict three events" and the Exchange together.
- Do not host `server/` on Pages or claim a public agent URL.
- Do not modify `S.silk`, Merkle leaves, or contract byte formats to shoehorn FX data.
- Do not fetch Frankfurter (or any feed) from the judge path or from tests that must run offline — tests use the committed JSON.
- Do not add CoinGecko, binance, or a meme-coin series in Scope A.
- Do not invent player-owned Exchange NFTs.
- Do not merge to `main` or push tags without the owner.

When in doubt, cut the Exchange and protect the first minutes of the game.
