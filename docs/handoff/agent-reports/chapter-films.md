# Task P: chapter films (branch `claude/chapter-films`) — report in progress

**Stopped on 08.11 (lead's pause order, usage limit):** the pure half is done and tested: `game/src/play/chapters.js`
(chapter model, triggers for both play modes, season ledger from the player's own observations and events, film scripts
for Arrival / The Language / Trust / The Crisis / The Vote and one ending per outcome, cheap and reduced-motion variants,
seen store, Chronicle rows), `chapter.*` strings in all five play locales (parity test green), `tests/client/chapters.test.mjs`
(11 tests, `npm test` 330/330). Not started yet: the browser-side player `game/src/cinematic/chapters/` (camera driver,
letterbox overlay with subtitles, title and "What matters now" card, hold-to-skip, Chronicle replay menu, narration and
audio cues), the guarded hook in `game/src/play/game.js`, the Chromium still frames and `docs/chapters.md`.
Collaboration requests to J, Q, G/F are in `docs/collab-requests.md` (items 9–11).
