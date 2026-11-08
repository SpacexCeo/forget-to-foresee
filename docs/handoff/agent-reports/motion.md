# Task S report: motion design system

Branch `claude/motion` (from `claude/loving-curie-ihasft` at de4465d). Files touched: new `game/src/ui/motion/index.js`,
`game/src/ui/lobby.js`, `game/src/ui/onboarding.js`, `game/src/ui/hologram/constructor.js`, `game/src/play/map-ui.js`, the
animation parts of `game/src/play/agents.js`, new `game/tests/motion.test.mjs`, `game/package.json` (test script), new
`docs/motion.md` and `docs/motion/` (frame captures), one row in `docs/decisions.md`, request 15 in
`docs/collab-requests.md`. Not touched: `game/src/ui/index.js` (the screen hand-offs animate from inside the lobby and
the onboarding, so `mountShell` needed no change), `flow.js` (pure state, nothing to animate), the world HUD and play
panels (Task F applies the tokens there).

## Done

1. **Module first** (pushed and announced before the application): `MOTION` tokens (durations 120 / 200 / 320 / 480 /
   640 ms, expo-out / in / in-out / emphasized easings, three springs, distances, scales, stagger), pure math (`ease`,
   `createSpring`, `springSamples`, `springDuration`, `staggerDelay`, `flipDelta`, `tickValue`), helpers on the Web
   Animations API (`enter`, `exit`, `stagger`, `crossfade`, `flip`, `tickNumber`, `press`, `seal`, `ringFlash`, `drawOn`,
   `parallax`), `installMotionStyles` with `--mo-*` variables and `.mo-press` / `.mo-lift` / `.mo-ring` / `.mo-draw`,
   and `isReduced`. Transforms and opacity only (a test greps the stylesheet for layout properties); every movement
   becomes a 160 ms cross-fade under reduced motion; nothing blocks input. 13 tests.
2. **Motion language** in `docs/motion.md`: the feel (calm, weighty, precise; ink and nacre), the token table, the API
   table and the event → motion table (panel open/close, card reveal, number change, stake placed, Verified seal,
   toast, hover/press, lobby → onboarding → island → Shell, the world).
3. **Applied in the owned paths:** lobby (layered pointer parallax, staggered title reveal, press and lift on every
   button, the screen leaves before the hand-off); onboarding (step and beat changes cross-fade with staggered
   children, the stake seal stamps with a ring, silk ticks up, dots / trials / chips / stepper pop, into the island the
   screen fades over 480 ms); hologram constructor (staged reveal, Customize unfolds and folds, a new look cross-fades
   the preview and the hash, status lines fade in); map panel (scrim and parchment unfold, places arrive by distance
   from Iris, markers pop, a hovered or focused place draws its walk route on, close is an exit); the world (Iris and
   the agents lean into starts and settle after stops; Iris's head and neck turn to the clan she talks to through the
   shared look-at helper: the open item from Task N).
4. **Performance:** transforms / opacity only, one measurement pair per FLIP, text written once per frame in tick-ups,
   parallax eases on its own frame and stops at rest.

## Checked

- `cd game && npm test`: 372/372. `npm run build`: ok.
- Headless Chromium (SwiftShader, `vite preview` of the build), zero console errors or warnings beyond SwiftShader's
  own "GPU stall" notice in every state: lobby (motion stylesheet installed, 4 lifted buttons, parallax moves the mist
  by 7.8 px against the pointer, Enter shows the pressed state, the screen leaves and the onboarding mounts with
  its staggered card; frames in `docs/motion/`), onboarding (step change to the tutorial card, back to the lobby),
  reduced motion through the system query (`data-motion=reduce`, parallax off, the same hand-off clean), the map
  (unfold frames, close hides after the exit, reopen), Iris's look-at toward Moss while talking (head and neck bones
  found, look weight 0.99, yaw 1.1° after turning to face her), frame time 245 ms (unchanged). The route draw-on:
  the handler is verified by dispatching `pointerenter` on a camp place (a gold polyline of 11 points, length 234
  map units, drawn on over 480 ms, removed on leave), and it also listens on `pointerover`, `pointermove` and
  `focus`; Playwright's synthetic hover over the map's SVG does not reach the place in this SwiftShader container
  (`elementFromPoint` finds the hit circle, yet no pointer event arrives, with waits of 2.5 s), so hovering with a
  real mouse is on the GPU check list below.
- QA-008 (the lead's defect): fixed in `camera-rig.js` with a test; the pre-flight zoom is remembered when the play
  layer swaps the rig's world into a Shell and eased back over about a second on return; a zoom by the player cancels
  the ease.

## Quality bar

- Tests for the tokens and every helper (pure, stub element); hostile review over reduced motion (setting and
  system), no-WAAPI browsers (helpers resolve at once), keyboard (press on Space / Enter, focus lift), touch (parallax
  off for coarse pointers), repeated opens / closes of the map (a close token guards the hide), screen hand-offs
  clicked twice (a `leaving` guard), re-renders in place (no animation unless the step or beat changed).
- Could not verify on a GPU: the feel of the timings at 60 fps (SwiftShader runs at a few fps, so the captures are
  frames, not a film); the route draw-on under a real mouse hover (see above; keyboard focus and the dispatched
  events are verified); the eye share of the look-at (no eye bones in the current glbs).

## Not done / for the lead

- Task F applies the tokens to the world HUD and the play panels; Task Q to settings; Task P to the films
  (request 15 has the mapping).
- The hub fly cover (`hub-ui.js`, Task F's file) still uses its own 450 ms fade; it matches `duration.screen` within
  30 ms, the token can replace it when F touches the file.
