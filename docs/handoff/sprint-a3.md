# Sprint seat A3: handoff (stopped at 04:00 Kyiv by the owner's budget; resume 07:41)

1. **First, the owner's override "no demo modes":** the market must settle on the live chain only, labelled "NEAR testnet". Remove the demo settlement and the Demo chip (`relayer/lib/p2p.js`, `game/src/market/market-ui.js`, `docs/market.md`). This needs town v5 `trade_for` and items v2 `coordinator_transfer` deployed, plus `P2P_SETTLEMENT=chain` as the only path. Until then the window says the market is not open.
2. **Then:** wire the new art from sprint/5h (bd8c96a2): `res_<name>_{256,128}.webp` icons in the market and stall rows and the resource needs, and the `deed_<works>.webp` cards in the Town works window, each with a text fallback. After that: loot beams and the chest-open animation (spec 6.5), and the wheel restyle with odds and play-silk labels (6.8).
3. **Done and pushed on claude/tee-agents:**
   - e4b138a: chest batch fix.
   - b676fc0: one silk number.
   - de3ca3a: market backend and contracts.
   - d021735: market window.
   - 60855b8: Loom Dice and the "This device" wording; not yet merged, lead's 05:00 wave.
   - Tests at stop: game 1044/0, relayer 113/0, town 69/69, items 13/13.
4. **The relayer redeploy must carry:**
   - `lib/near-tx.js` `callEach` and `lib/chest.js` (one transaction per chest).
   - `api/chest/open.js`: journal before the replay guard, 20/min, `chests.errors` in health.
   - `api/town/gate.js` GET with `creditable`, `credited`, `day_room`.
   - `/api/market/p2p/*`, `/api/town/act`, `/api/companion/claim`, and the `/api/town/gate` route.
   - Then check: Open 5 on a test guest gives 5 transactions and 1 batch in `/api/health`.
5. **Owner deploys:**
   - Town v4 and v5, via `town-upgrade.sh`.
   - Items v2.
   - The coordinator key with the full method list (`docs/town-gate.md`).
   - The companions and items minter keys (`docs/companions.md`, `docs/market.md`).
