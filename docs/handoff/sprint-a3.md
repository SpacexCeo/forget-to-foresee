# Sprint seat A3: handoff (updated 13.11 after the 07:41 session)

1. **Done this session (on claude/tee-agents):**
   - 6e4115d0: the market on NEAR testnet only; not live until town v5 and items v2 are deployed.
   - f7da639a: resource icons and deed cards.
   - 6e4bcb23: loot beams in the rarity palette, and the sealed-chest beat while NEAR answers.
   - The commit after it: the wheel labels (play money on this device, "Skin NFT (very rare)", the countdown to the next free spin, the odds folded under "See the odds").
2. **Not done:**
   - Icons in the quest "needs" line (`town-quests.js`, A1's file; call `artBox(doc, resIconPath(id), t('res.' + id))` from `market/art.js`).
   - The B key and HUD button that dispatch `ftf:market-open` (the HUD and seam seats).
3. **The relayer redeploy must carry:**
   - `lib/near-tx.js` `callEach` and `lib/chest.js` (one transaction per chest).
   - `api/chest/open.js`: journal before the replay guard, 20/min, `chests.errors`.
   - `api/town/gate.js` GET with `creditable`, `credited`, `day_room`.
   - `/api/market/p2p/*` (chain only), `/api/town/act`, `/api/companion/claim`, and the `/api/town/gate` route.
   - Then check: Open 5 on a test guest gives 5 transactions and 1 batch in `/api/health`.
4. **Owner deploys:**
   - Town v4 and v5, via `town-upgrade.sh`.
   - Items v2 (`coordinator_transfer`), without an init call.
   - The coordinator key with the full method list, including `trade_for` (`docs/town-gate.md`).
   - `FTF_ITEMS_MINTER` and `FTF_ITEMS_KEY`.
   - The companions minter (`docs/companions.md`).
   - The market turns live within a minute of the last of these.
5. **Tests at stop:** game 1134/0, relayer 114/0, town 69/69, items 13/13; build and smoke OK.
