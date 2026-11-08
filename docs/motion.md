# Motion design system (Task S)

State on 08.11.2026, branch `claude/motion`. Module: `game/src/ui/motion/index.js` (one file, no dependencies, ~300
lines); tests `game/tests/motion.test.mjs`. Owner directive: "everything must be animated and look expensive, as a
2026 consumer expects" (`docs/handoff/worker-tasks.md`, quality bar). This note is the motion language for the whole
game, the tokens, the event table and the API that Task F (world HUD, play panels), Task P (films) and Task Q
(settings) build on.

## The feel: calm, weighty, precise; ink and nacre

- **Calm.** Nothing jumps. Things arrive from a short distance (12 px) and settle; they leave faster than they came
  (exits 120 ms, enters 200 ms) so attention goes to what is new.
- **Weighty.** Expo-out easing (`cubic-bezier(.16, 1, .3, 1)`): fast arrival, long settle, like a shell coming to rest
  on sand. Springs where something is "placed": a stake, the Verified seal, a marker. One visible overshoot at most,
  and only on the seal.
- **Precise.** Durations are tokens, never ad hoc: 120 / 200 / 320 ms for UI, 480 ms for a screen, 640 ms for the
  seal. Staggered lists step by 40 ms and cap at 320 ms so a long list finishes together with a short one.
- **Ink and nacre.** Reveals are ink: strokes draw on (SVG dash offset), titles rise out of the page line by line.
  Surfaces are nacre: a slight lift on hover (2 px), a soft press (scale 0.97), no bounce.
- **Never blocks input.** Every helper returns a promise and leaves the element interactive; nothing waits for an
  animation to accept a click. Exits leave `opacity: 0` inline for the caller to hide or remove.
- **Reduced motion is a first-class variant, not an off switch.** Under `html[data-motion="reduce"]` (the setting) or
  `prefers-reduced-motion`, every movement becomes a 160 ms cross-fade, presses dim instead of shrink, draw-ons
  appear complete, parallax and ambient drift are off. The same code path, the same promises, the same timing contract.

## Tokens (`MOTION`, also as CSS variables `--mo-*` once `installMotionStyles()` has run)

| token | value | use |
|---|---|---|
| `duration.fast` | 120 ms | exits, press feedback, hover, chip state |
| `duration.base` | 200 ms | enters, panel content, menu items |
| `duration.slow` | 320 ms | FLIP moves, number tick-ups, panel open |
| `duration.screen` | 480 ms | screen transitions (lobby → onboarding → island → Shell), route draw-on |
| `duration.seal` | 640 ms | the Verified seal / a placed stake (spring-sampled) |
| `duration.reduced` | 160 ms | the cross-fade every movement becomes under reduced motion |
| `easing.out` | `cubic-bezier(.16, 1, .3, 1)` | default: enters, moves, lifts |
| `easing.in` | `cubic-bezier(.7, 0, .84, 0)` | exits |
| `easing.inOut` | `cubic-bezier(.65, 0, .35, 1)` | A → B moves, draw-ons |
| `easing.emphasized` | `cubic-bezier(.2, .9, .2, 1)` | reveals that may overshoot a hair |
| `spring.gentle` | k 120, c 20 | panels, follows (settles in 0.72 s, no overshoot) |
| `spring.snappy` | k 260, c 28 | buttons, chips, markers (0.60 s) |
| `spring.settle` | k 170, c 14 | the seal: one 13 % overshoot (1.07 s) |
| `distance.rise / drop / lift / nudge / parallax` | 12 / 8 / 2 / 6 / 10 px | enter offset, exit offset, hover lift, nudge, pointer parallax |
| `scale.press / pop / enterFrom / exitTo / sealFrom` | .97 / 1.04 / .96 / .98 / 1.35 | press, pop, scale-enter, scale-exit, seal start |
| `stagger.step / cap` | 40 / 320 ms | list delays |

## API (`import { … } from '../ui/motion/index.js'`)

| helper | what it does | reduced motion |
|---|---|---|
| `installMotionStyles(doc)` | injects `--mo-*` vars and the `.mo-press`, `.mo-lift`, `.mo-ring`, `.mo-draw` rules once | overrides included |
| `enter(el, {from: 'rise'|'drop'|'left'|'right'|'scale'|'fade', distance, duration, delay, easing})` | arrives from an offset to rest; clears inline exit state; `fill: backwards` so a delayed item stays hidden until its turn | fade, ≤ 160 ms |
| `exit(el, {to: 'fade'|'drop'|'rise'|'scale', …})` | leaves and sets inline `opacity: 0`; the caller hides or removes | fade |
| `stagger(els, opts, fn = enter)` | per-item delay `min(i × step, cap)` | same, fades |
| `crossfade(outEl, inEl, opts)` | exit + delayed enter at the same spot | fades |
| `flip(el, mutate, opts)` | measure → `mutate()` → measure → animate from the inverse transform (transform only) | mutation applied, no move |
| `tickNumber(el, to, {from, duration, decimals, format})` | eased count-up of the element's text; a new call cancels the old | final value at once |
| `press(el)` → unbind | `.mo-pressed` on pointer / Space / Enter down (scale .97) | dims instead |
| `seal(el)` | stamps from 1.35× with the `settle` spring | fade |
| `ringFlash(el)` | one expanding ring (`.mo-ring--on`) for a confirmation | none |
| `drawOn(pathEl, length?)` | SVG stroke draw-on over `duration.screen` | drawn at once |
| `parallax(container, [{el, depth}], {max})` → unbind | pointer parallax, transform only, eased per frame; off for coarse pointers | off |
| `isReduced(doc)` | setting first (`data-motion`), then the system query | – |
| pure: `ease.*`, `createSpring`, `springSamples`, `springDuration`, `staggerDelay`, `flipDelta`, `tickValue`, `motionVars`, `MOTION_CSS` | math for the 3D side and tests | – |

CSS classes for stylesheets that transition on their own: `.mo-press`, `.mo-lift` (hover lift + press), `.mo-hidden`,
`.mo-will-move`, `.mo-ring`, `.mo-draw`; variables `--mo-fast|base|slow|screen|reduced`, `--mo-ease-out|in|in-out|emphasized`,
`--mo-rise`, `--mo-lift`, `--mo-press`, `--mo-pop`.

## Every UI event → its motion

| event | motion | tokens |
|---|---|---|
| lobby appears | background layers parallax to the pointer (depth 1 / .6 / .3); title line 1, line 2, the rule, the tagline, the menu rise in a stagger; the hero fades up | `parallax`, `stagger(enter rise)`, step 60 ms |
| button hover / focus | 2 px lift, border and glow 120 ms | `.mo-lift` |
| button press | scale .97 for the press, back on release | `.mo-press` |
| lobby → onboarding, onboarding → lobby | the whole screen exits (fade + scale .98, 120 ms), the next mounts and enters (rise, 200 ms, staggered children) | `exit scale`, `enter`, `stagger` |
| onboarding step change | old card exits (drop 8 px), new card enters (rise 12 px) with heading → body → stage → nav staggered; the stepper's current dot pops | `crossfade`, `stagger`, `.mo-pop` |
| tutorial: slot lit, dot counted, trial passed, stake placed | the control pops (scale 1.04 → 1) and, for the stake, a ring flash | `flip`/scale, `ringFlash` |
| "Verified ✓" seal, a sealed stake | the seal stamps down (1.35× → 1, one overshoot) with a ring | `seal`, `ringFlash` |
| number changes (silk, attention, progress) | tick-up over 320 ms, eased | `tickNumber` |
| hologram look picked, Customize unfolded | tiles stagger in; the detail block enters (rise); the preview cross-fades | `stagger`, `enter`, `crossfade` |
| map opens / closes | scrim fades (120 ms); the parchment unfolds (scale .96 → 1, rise), places stagger in by distance from Iris; routes draw on when a place is hovered or focused; close = exit scale | `enter scale`, `stagger`, `drawOn`, `exit` |
| map markers (Iris, goal, agents) | enter with a pop; the goal keeps its slow pulse | `enter pop` |
| toast / line in the dialogue strip (Task F) | rise 12 px in, fade out; text changes cross-fade | `enter`, `crossfade` |
| panel open / close (Task F) | open = scale .96 → 1 + rise, 320 ms; close = exit scale 120 ms; backdrop fades | `enter`, `exit` |
| card reveal in a list (Task F) | stagger rise, 40 ms step | `stagger` |
| screen: island → Shell (hub fly-in) | the cover fades in 480 ms, the camera snaps under it, the cover fades out (already in `hub-ui.js`; uses the same durations) | `duration.screen` |
| settings change (Task Q) | the changed control pops; a dependent section cross-fades | `.mo-pop`, `crossfade` |
| films (Task P) | the same easings for camera dollies; titles use `enter rise` with the stagger | `ease.out`, `stagger` |
| in the world: Iris starts / stops | anticipation: a short lean into the start, a settle after the stop (the body group's pitch follows the acceleration, eased) | `createSpring gentle` on the 3D side |
| in the world: a reaction gesture (celebrate, defeat) | cross-fade 350 ms (existing `FADE`), gait weight eases 0.1 s | – |
| in the world: Iris talks to a clan | her head and neck turn to the clan (look-at), the clan's to her | shared look-at helper |

## Performance

Transforms and opacity only: the stylesheet is checked by a test for layout properties. FLIP measures twice and
animates once; `tickNumber` writes text at most once per frame; parallax eases on its own frame and stops when at
rest; `will-change` only on `.mo-will-move` while something moves. The phone profile keeps every duration (motion
is not what costs frames there; the renderer is).

## Captures (frames, `docs/motion/`)

Headless Chromium frames at 1280×800 (SwiftShader renders at a few frames per second, so each file is one frame
of the animation at roughly the named time, not a smooth film; the timings in the code are the tokens above):

| strip | frames | what to look for |
|---|---|---|
| lobby title reveal | `lobby-reveal-120ms.png`, `-320ms.png`, `-640ms.png` | line 1 and line 2 are in by 120 ms, the rule's dot next, the tagline and the menu arrive last (stagger 70 ms, cap 420 ms); before: everything appeared at once |
| lobby → onboarding | `onboarding-enter-80ms.png`, `-700ms.png` | the onboarding card rises in with its heading, body, details and button staggered (50 ms); before: an instant swap |
| onboarding step change | `onboarding-step-80ms.png`, `-700ms.png` | the access card drops away while the tutorial card rises; the stepper's current item slides 2 px; before: an instant swap |
| map unfold | `map-unfold-60ms.png`, `-220ms.png`, `-520ms.png` | the scrim first, the parchment at 0.96 → 1 with a rise, then the places by distance from Iris and the markers popping in; before: `hidden` toggled |
| route draw-on | `map-route-drawon.png` | the gold walk route from Iris to the hovered camp along the island's graph |

Under reduced motion the same screens cross-fade (checked headless with the system query: no movement, zero
console errors).
