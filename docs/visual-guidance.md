# Visual guidance in the world

Started 10.11.2026 on branch `claude/game-visual-performance-9umizm` (owner: "it is hard to find your way, there are
too few visual hints"). The HUD already says what to do; this file lists the cues that say **where**, in the world
itself. All of them are presentation only: they read the goal and the observation, never a rule, and they use no new
strings. Branch log: `docs/handoff/visual-perf-log.md`.

## What a player sees

| cue | when | where in the code |
|---|---|---|
| A gold column of light and a slow ring on a Shell | the Shell has an open sign (the dock's "gold Shell") | `game/src/render/beacons.js` `ShellBeacons` |
| The same, brighter, with a gold diamond above | the current goal names that Shell (`shell:n`) or its anchor zone (`anchor_zone:n`) | levels from `game/src/play/beacon-plan.js` `shellBeaconLevels` |
| Three gold chevrons on the ground ahead of Iris | the goal names a Shell or an anchor zone; they run toward it and fade out on arrival | `GoalPointer`, pose from `pointerPose` |

Why the chevrons: from the start balcony the camera looks down at Iris and every Shell is some sixty metres away,
off screen. The quest card says "fly into Shell I" and the world showed nothing gold. The chevrons are the cue that is
always in frame; the column is what the player finds when the camera turns or zooms out.

## Rules the cues follow

- Off inside a Shell and during chapter films.
- Reduced motion: the light is set at once and holds still (no drift, no bob, no running pulse).
- Unlit, additive, on the overlay layer: the ambient-occlusion pass never sees them, they cast no shadow, and they add
  no light to the scene (a new light would recompile every lit material, see `docs/smoothness.md`).
- Their programs are compiled through the warm-up queue when the play layer starts, not on first appearance.

## Tests

`game/tests/client/beacons.test.mjs`: levels per Shell (open sign, goal, inside a Shell, film), the judge season's
first goal lights exactly one goal beacon, fade in and out, overlay layer, pointer aim and arrival fade, the short way
round, reduced motion.

## Open

- Camps and the Scroll table when a goal or an offer refers to them.
- A click on a lit Shell in the world could fly there (the dock button does today); that is play input, so it is a
  request to the play layer's owner, not done here.
