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
