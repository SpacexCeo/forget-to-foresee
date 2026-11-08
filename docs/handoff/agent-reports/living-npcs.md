# Task N report: a living island (NPC agents that feel alive)

Branch `claude/living-npcs` (based on `claude/loving-curie-ihasft` after the Task G merge). Files touched:
`game/src/play/behaviour.js` (seeded rng, `IdleLife`, `lookAtAngles`, `NpcDirector`), `game/src/play/agents.js`
(animation and behaviour code: routing, avoidance, look-at bones, idle life, meetings, the `onSay` hook, `event()`;
the nameplate code untouched), `game/src/physics/motion.js` (`avoidWish`), new `game/tests/client/npc.test.mjs`,
`game/package.json` (test script), new `docs/npcs.md`, one row at the end of the `docs/decisions.md` §4 table,
requests 9 and 10 in `docs/collab-requests.md`. No engine, no game.js, no art, no locale files.

## Done (the five points of the task)

1. **Look-at**: neck, head and eye bones track Iris when she is near (7 m), on the plateau or talking; agents face
   whoever they talk to (body and head); every clan looks up at the Shell of a reveal. Clamped, faded behind, smoothed.
2. **Idle life**: seeded glances, weight shifts and short gestures by temperament, gaps 4–12 s over the tempo, held
   back when another agent just gestured (never in sync, tested). `think` / `gesture_offer` / `celebrate` / `defeat`
   keep coming from the cue layer and the reactions.
3. **Purposeful movement**: errands on the room's walk graph with the Task G motion model (to the Scroll, a camp,
   the pedestal, the plaza ring for the vote), inferred from observation diffs (so it works with no new wiring) and
   from the public events when wired; local avoidance of agents and Iris; the route walk is corridor-checked.
4. **Conversations**: silk transfers and mended links make two clans meet, face each other and take talk turns; the
   first beat goes to the dialogue strip through `agents.onSay` with existing line keys (one-line wiring: request 9).
5. **Budget**: no per-frame allocations beyond small arrays; one route plan per goal; the headless frame time did not
   move (numbers below). 9 deterministic tests; `npm test` 328/328 (after merging the map); `npm run build` green.

## Checked

- `cd game && npm test`: 328/328. `npm run build`: ok.
- Headless Chromium (SwiftShader, zero console errors in walk mode and the hub): see "Headless result" in
  `docs/npcs.md` (errand, meeting, real end-of-trial events, the gathering; frame time unchanged; four screenshots).
  Final run: KeyN toggles once per press; an errand and a
  neighbour meeting run to completion with avoidance when two agents cross.
- Also folded in (lead's request): `KeyN` is forwarded by `game/src/ui/input.js` (`WORLD_KEYS`) and the map panel's
  own window listener in `game/src/play/map-ui.js` is removed (H's request 8); map and input tests green.

## Quality bar

- Every behaviour has a test (director state machine, inference, scheduler, look-at, avoidance, route walk).
- Hostile review: isolated / broken clans never take goals; a clan gone dark goes home; a host whose visitor never
  arrives gives up after 60 s, at once if the visitor drops the meeting; Iris is never a meeting partner; the avoidance push is bounded and corridor-tested;
  reduced motion slows the look-at and removes weight shifts and Ash's pacing; a model without head bones degrades
  to no look-at; agents keep working while Iris is inside a Shell (`irisPos` null).
- Could not verify on a GPU: how the eye share and the 2° weight shift read up close; the real timing of a meeting
  against a trial's event burst at 60 fps.

## Not done / for the lead

- Request 9 (two one-line hooks in `game/src/play/game.js`) for the speech beats and the event fast path.
- Request 10 to Task F: the mind glyph sprite is floating world text.
- Iris's own look-at toward the clan she talks to (small follow-up in `updateIris`).
