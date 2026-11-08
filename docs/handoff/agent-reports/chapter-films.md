# Task P: chapter films — report (branch `claude/chapter-films`, 08.11.2026)

## What was done

- **Chapter model, triggers and ledger** (`game/src/play/chapters.js`, pure, no DOM/three): chapters of a season
  (Arrival 1–4, The Language 5–8, Trust 9–12, The Crisis 13, The Vote 14–17, an ending per outcome: gift, weapon,
  lost, survived, gone, proof_failed); `dueFilm(obs, seen)` works in both play modes and is deterministic per
  seed; a `SeasonLedger` records what the player saw (reveals from the public `season.event_revealed` event,
  stakes and their outcomes, offers and the player's answers, betrayal memories, repaid debts, gifts, pacts,
  memory burns, auctions, broken/mended links, the crisis, the Key, contributions, dark fragments, the outcome)
  from the observation and the room events only.
- **Film scripts**: five shots per film, each with a camera (plain data), one narrator line (`chapter.*` ICU keys
  with variants on the facts), optional agent poses and a sound cue, plus a title and a "What matters now" card.
  Cheap profile (phones, low tier): still cameras, no interior visit; reduced motion: frozen cameras.
- **Strings** `chapter.*` (68 keys) in `game/src/play/locales/{en,ru,uk,it,zh}.js`, translated by hand, parity
  test green (`chapter.list.sep` added to the shared-separator allowlist of `tests/ui-i18n-locales.test.mjs`).
- **Player** (`game/src/cinematic/chapters/`): `player.js` (camera after the rig through Task J's
  `src/cinematic/camera.js`, Iris pinned, Shell interior visit, agent poses, subtitle, narration, cue, hold-to-skip
  0.7 s in wall time, tap on the card to end), `overlay.js` (letterbox, title, subtitle, card, dots, skip ring),
  `chronicle.js` (replay menu, C and a 48 px button), `shot-camera.js` (shot data → J's camera spec; runtime
  cameras for Iris and the interior), `index.js` (glue: safe moment, panels closed, hub stop/resume, narration
  via a guarded import of Task Q's `play/narration.js`, `?films=off|full|cheap`, `?film=<id>`).
  `camera.js` and `ease.js` are J's files copied unchanged from `claude/trailer` so this branch builds alone.
- **Hook in `game/src/play/game.js`**: one import, one `attachChapters(...)` call, `chapters.update(dt)` after the
  map update, two lines in `handleKey`, `chapters` on the returned play API. Nothing else in the play layer changed.
- **Tests**: `tests/client/chapters.test.mjs` (11) and `tests/client/chapters-player.test.mjs` (5), both in `npm test`
  (335/335). `npm run build` green.
- **Review frames**: `node tests/client/chapters-stills.mjs` renders every film's title, five shots and card at
  1280×800 plus 1920×1080 and 390×844 samples into `docs/chapters/` (Chromium + SwiftShader, judge seed, hub mode);
  `docs/chapters.md` documents the films, the rules, the wiring and the review notes.
- **Docs**: `docs/chapters.md`, a row in `docs/decisions.md` §4, requests 9–12 in `docs/collab-requests.md`
  (J: cinematic API; Q: narration contract; G/F: `KeyC` and a hotbar entry; I/D: the Arrival film on the judge path).

## How it was checked

- `cd game && npm test` 335/335, `npm run build` green (after every step; pushed after every commit).
- Headless Chromium (SwiftShader, 1280×800, `?play=direct&seed=<judge>`): the Arrival film starts after the world
  opens in hub mode; holding W does not move Iris; a short press shows "Hold to skip", a 0.9 s hold skips; the
  Chronicle opens on C with six rows (Arrival seen / Replay, the rest "not yet"); zero console errors (one
  renderer performance warning from SwiftShader itself).
- Frames of every film reviewed by eye (`docs/chapters.md`, "Review frames"): framing of the island, the Shells,
  the interior with the Guest drawing the first sign, Iris, the Scroll, the camps; subtitles readable at all three
  sizes; the portrait layout keeps the subtitle in the bottom band.

## What was not done or could not be verified

- No GPU in the container: the films were seeked frame by frame, never watched at speed; the camera eases and
  the 6 s pacing are set by numbers, not by eye. First thing to do on a GPU: watch all six films once
  (`?film=arrival` … `?film=ending`, and `?mode=walk`).
- No human listened to the cue mix or the narration voice; the narration module (Task Q) is not on this branch,
  so the voice was exercised only through Q's own tests on `claude/all-ages`.
- Gamepad input is polled by `main.js` and is not captured during a film: movement is undone by the pin, but the
  menu button opens the settings dialog over the film (noted for Task G).
- The Guests of Task O (`claude/guests-stage`) are not on this branch; the interior shots show the current
  `guest.glb` creatures. `attachChapters` accepts a `guests` stage (`cue(moment, { force })`) when the lead merges O.
- The README judge table does not mention the Arrival film (Task D owns the README; request 12).
- Streaming under the dev server is slow; some review frames show a greybox where the model had not decoded in
  the 90 s allowed (the `loaded` flag per frame is in `docs/chapters/stills.json`).

## Owner decisions this touches

- The Arrival film plays once per season on every world entry (a reload is a new season by rules v3). If the
  owner wants it only on the very first visit per device, `createSeenStore` already persists per season key and
  needs one line to key on the device instead.
