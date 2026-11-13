# Hand-off: A1 (quest journal, tracker, auto-walk, starter guide, Gate-Loom copy)

Branch `claude/hackathon-tz` (the lead merges into `sprint/5h`; the owner merges to `main`). Every claim below has a unit test or an e2e check. What is not done is listed at the end.

## What exists

| Piece | Files | Tests |
|---|---|---|
| Journal data: 14 quests (story, side, bounty, daily, tournament) with giver, objectives, rewards, hints, area markers; the shared rules build the auto quests from it (EVENT action, daily reset at 00:00 UTC, level gate) | `game/src/game/journal-data.js`, `quests-data.js`, `quest-rules.js` (byte-copied to `relayer/lib/expedition-rules/`) | `tests/quests/journal-data.test.mjs`, `tests/client/quest-rules.test.mjs`, the relayer rules-copy test |
| Journal (J / L): 5 tabs, search, rows with progress, a detail pane (giver, objectives with bars, rewards, hints), Walk / Track / Abandon; a second click, double click or Enter on the selected quest walks there; keys 1-5, arrows, T, Esc; phone layout under 900 px | `game/src/quests/journal-model.js`, `journal-ui.js` | `tests/quests/journal-ui.test.mjs`, e2e E2/E3 |
| Tracker (replaces the cut-off one-line pills): Road Home "{gate} / {fee} silk", the pinned quest with counters and a walk button, two more tracked quests, the starter guide step, the town errand in full; collapse is remembered; "Show more" on phones; nothing is ever truncated | `game/src/quests/tracker-ui.js` | unit (journal-ui test), e2e E1/E8 at 1280×720 and 390×844 |
| Auto-walk: A* on a 1 m grid plus string pulling, stops 2.2 m short, follows a walking giver, cancelled by W A S D (always wins over the re-plan), by a new walk or after 6 s without progress; the label "Walking to X · N m · press W A S D to stop" | `game/src/sprint/auto-walk.js` (the seam), `scenes/town-flow.js` (`walkTo`, `routeEnd`) | unit (journal-ui test), e2e E4/E5 |
| Starter guide: 8 steps (move, camera, talk to the Elder, journal, fight, loot, market, the Gate-Loom), +10 XP each, once | `game/src/quests/guide.js` | `tests/quests/guide.test.mjs` |
| Markers and waypoint: quest-available / quest-ready / quest-area / portal, fed into `sprint/markers.js` (`setMarkers('quests', …)`) for the minimap; an edge arrow with the distance to the pinned target | `game/src/quests/markers-feed.js`, `waypoint-ui.js` | `tests/quests/markers.test.mjs` |
| Gate-Loom copy (§4.12): quiet / paying / syncing / need guest / offline / failed / pay / "Press E to sync" / wants, the confirm dialog; the fee from config or gate_price, every figure through A3's `formatSilkC`, "you hold" = `heldC` (recorded on NEAR) | `game/src/scenes/town-portal.js`, `net/town-gate.js` (`syncGate`, credit only) | `tests/client/town-portal.test.mjs` |
| English strings | `game/src/play/locales/en-quests.js` (imported by `en.js`) | `say()` tests |

E2E: `FTF_E2E_URL=<built preview> node --test game/tests/e2e/quests.e2e.mjs`, 4/4 on 13 Nov. Covers E1/E8 (tracker uncut on desktop and phone, Road Home against the configured fee, old pill hidden), E2/E3 (five tabs, the guard quest detail), E4/E5 (a second click walks, W cancels) and E10 (flags off: the old pill wraps, keeps its full text in the title and opens the log).

## Flags

`questJournal`, `questTracker`, `autoWalk`, `starterGuide` (in `DEFAULT_FLAGS`, off until `features.json` turns them on). For a page-only preview: `?ff=questJournal,questTracker,autoWalk,starterGuide`. With the flags off, the old objective pill and the old J log remain, and the pill now wraps instead of cutting text.

## Wiring

- `boot-world.js` (the lazy story block) passes `walkDriver` (town-flow route steering), `toWorld`, `camera`, `portalAt`, `level`, and `hudToast` (the toast that routes to the player HUD) into `createTownQuests`.
- `town-quests.js` hosts everything: the journal, the tracker, the walker (`setAutoWalker`), the waypoint, the guide events and the markers.

## Decisions

- One stipend: TWIST_DONE stays the only grant ('stipend_granted' in the verified expedition log); A4's W17 grants nothing (A4 agreed, claude/art-queue 77f58226).
- The giver ids stay stable for A6's models: guard, innkeeper, elder, lamplighter, shardkeeper.

## Known gaps

- Coach-mark bubbles for the guide steps (they would use A5's `sprint/tooltip.js`): the guide shows in the tracker only.
- No ground trail for auto-walk; the waypoint arrow and the label carry the direction.
- The quest save key stays `ftf.quests.v1` (no v2 migration was needed).
- Auto-walk plans straight lines when no collider grid is passed (the town physics slides Iris along walls).

## After the sprint (13 Nov, owner tasks)

| Piece | Files | Tests |
|---|---|---|
| The Hatchkeeper (pet seller) by the lower-lane stalls, three dragons looping, riddle panel; companions off (`COMPANIONS_ENABLED`), locked companion slot | `scenes/hatchkeeper.js`, `scenes/hatchkeeper-rules.js`, `scenes/companion-rules.js`, `ui/companion-slot.js` | `tests/client/hatchkeeper.test.mjs` |
| Live quest chain fixed: journal auto quests no longer make a giver "busy"; no raw titles in the old log; errand "!" markers | `game/quest-rules.js` (shared), `scenes/town-quests.js` | `tests/client/quest-chain.test.mjs` |
| Progress already held counts: a proof drop (crown shard) completes its kill objective on accept, on the HELD check and at turn-in; every kill is logged and kills from the last 30 min count on accept, once | `game/quest-rules.js`, `game/quests-data.js` (shared, relayer copies synced) | `quest-chain.test.mjs` |
| Townsfolk walk only on the path graph: feet-up grounding, prop footprints with 0.5 m margins, collider clearance, 0.35 m bodies that never overlap (head-on, standing givers, other heroines, Iris eased out) | `play/town-paths.js`, `scenes/town-footprints.js`, `play/townsfolk-plan.js`, `play/townsfolk.js`, `scripts/record-town-ground.mjs`, `tests/fixtures/town-ground.json` | `tests/client/town-paths.test.mjs`, `tests/client/walkers.test.mjs` |
| Day-1 clarity: the objective pill is never cut; giver portraits in the talk panel and the journal | `scenes/player-hud.js`, `quests/portraits.js` | `journal-ui.test.mjs` |
| The first pet after the first finished tournament: claim to the chosen heroine (relayer reason `tournament`), owned pet flies, slot unlocks for that heroine | `net/pet.js`, `net/companion-claim.js`, `relayer/lib/companion.js` | `hatchkeeper.test.mjs`, `relayer/tests/companion.test.mjs` |

Deploy note: the relayer needs this branch for the `tournament` claim (`FTF_TOWN_CONTRACT`, default `ftf-town.testnet`; `FTF_COMPANION_KEY` as before). Re-record the ground table (`FTF_E2E_URL=<built preview> node game/scripts/record-town-ground.mjs`) after moving routes or town pieces; `tests/fixtures/town-solid.json` lists any body contacts it finds.

Open: the Hatchkeeper is an obstacle and anchor only as a body (not a graph node); the pet claim was tested with mocks, not against a settled testnet season.
