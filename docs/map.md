# The island map and the end of floating labels

Owner feedback 08.11 (screenshot of the overview camera with "Camp: Iris · not final art" and "Memory shard · not
final art" hanging over the island): *the labels cheapen it; make a map and show them there.* Branch `claude/island-map`.

## 1. No text floats in the 3D world during play

- `game/src/render/greybox.js`: every greybox still builds its "· not final art" sprite, but the sprite starts hidden and
  all sprites toggle together through `setGreyboxLabels(on)` (`greyboxLabelsEnabled()` reads the flag; `buildGreybox(name,
  { label: false })` skips the sprite entirely). Play never turns them on.
- Dev surfaces turn them on: `?dev=1`, the F3 dev HUD while it is visible (the play layer watches `#hud[hidden]`), and the
  asset review page (`game/src/review/asset-review.js` calls `setGreyboxLabels(true)` on load).
- The greybox stand-ins themselves stay in play, unlabeled, until the models stream in and replace them.
- Not in this task: the clan agents' name plates ("Frost · fragment giver", `game/src/play/agents.js`) belong to Task F,
  which turns them into screen-space plates. The anchor pads' Shell numeral and tick are diegetic decals, not labels.

## 2. The map panel

Key **N** (also `play.map.toggle()` and `play.handleKey('KeyN')`), **Esc** or **N** closes. On coarse pointers a round
48 px tap target sits bottom-left (mirroring the run button); the hotbar "Map" button is Task F's (request 7 in
`docs/collab-requests.md`). Only one panel is open at a time: opening the map closes the play panels and the HUD's Signs,
and the map yields when another panel opens (checked every frame). While it is open the Shell dock, the reading card,
the spot menu and the E prompt are hidden under the scrim.

Files: `game/src/play/map.js` (model, pure, node-tested), `game/src/play/map-ui.js` (panel, SVG, own styles), wiring in
`game/src/play/game.js`, `KeyN` in `PLAY_KEYS` (`game/src/main.js`), strings `map.*` in all five play locales.

### What it shows (all from `game/src/scenes/layout.js` and the observation)

| Element | Source | Interaction |
|---|---|---|
| Plaza, six plateaus, balcony, every bridge | `platforms()`, `bridges()` | drawing only |
| The Scroll (medallion rings) | `SCROLL_TABLE` | click → walk to `scroll` |
| Six camps with the clan name (gold) and "camp" | `CAMPS` + `agent.<clan>` | click → walk to `camp:<clan>` |
| Four anchor zones with their numeral on the plaza rim | `ANCHOR_ZONES` | click → walk to `anchor_zone:<n>` (tooltip only) |
| Four Shells: quiet (dashed), **a sign waits** (gold, count badge), **you are inside** (bright ring) | `signsByShell(obs)`, `obs.you` | hub: click → fly (`hub.flyTo`); walk mode: walk to its anchor zone |
| Memory-shard pedestal (small gem on the Iris plateau) | `SHARD` | click → walk to `shard_pedestal` |
| Iris: gold arrow turned to her heading (inside a Shell: a ring on that Shell) | `player.pos`, `player.heading` | refreshed 5×/s |
| Current goal: pulsing gold diamond on the goal place | `session.goal.target` (`camp:…`, `anchor_zone:…`, `scroll`, `shell:n`) | |
| Other agents: dots in the clan colour | `agents.positionOf(clan)` | tooltip with the name |

Orientation: the default camera looks from +Z toward the centre, so +Z is the bottom of the map (Moss at the bottom, Iris's
camp at the top, Amber right, Salt left). The drawing is a 400-unit square covering ±62 m, so the Shells at r = 50–54 m
stay inside it.

Routing reuses the room's walk graph (`walkTo` → `planRoute`, the same path the G key takes) and the hub's flight; a click
never evaluates a rule. Inside a Shell only other Shells are clickable (hub), the rest reads "Leave the Shell first".

### Style (hand-drawn chart, not a debug plot)

The panel reuses the world HUD tokens through `.wh-root` (`docs/ui-world-hud.md`): the dark panel surface with the pale
double hairline, Libre Caslon titles, Source Sans captions, gold for Shells with a sign, the goal and Iris. The chart itself:

- the archipelago in parchment (a warm radial paper gradient with fractal-noise grain, `feTurbulence` multiplied in) with ink
  outlines, a dashed cliff hatching around every plateau, a terrace ring inside, and soft blurred drop shadows of the rock
  pillars on the cloud sea (blurred cloud banks along the edges, a haze under the island);
- bridges as parchment decks on an ink edge with a dashed paving joint;
- the Scroll as a medallion with six clan sectors and a gold core; the four anchor zones with their numerals on the plaza rim;
- the Shells as coiled ammonite glyphs on discs: dashed and dim when quiet, gold-filled with a glow and a count badge when a
  sign waits, a bright ring when Iris is inside; their names sit in the four corners of the sea next to their discs, so the
  camp ring stays uncluttered in every locale;
- cartouche details: gold corner flourishes, a compass rose (north = −Z, the top of the map), a 10 m scale bar;
- camp names in gold serif with a small-caps "camp" caption; the Scroll named to the right of the plaza (the only side with no
  bridge); the balcony below its disc; the pedestal as a small gem with a tooltip.

Reduced motion stops the goal pulse; the low tier drops the backdrop blur (same rule as the HUD). Widths:
`min(560px, 100vw − 32px)`; at 390 px the drawing is 350 px wide and camp names are about 11 px tall.

### Before / after (headless Chromium, SwiftShader; `docs/map/`)

| Viewport | Before: overview with the floating labels (`?dev=1&view=overview`, the old look) | After: the same view in play | After: the map |
|---|---|---|---|
| 1280×800 | `before-overview-1280x800.jpg` | `after-overview-1280x800.jpg` | `after-map-1280x800.jpg` |
| 1920×1080 | `before-overview-1920x1080.jpg` | `after-overview-1920x1080.jpg` | `after-map-1920x1080.jpg` |
| 390×844 (2×) | `before-overview-390x844.jpg` | `after-overview-390x844.jpg` | `after-map-390x844.jpg` |

Locales at 390×844: `after-map-390x844-{uk,ru,it,zh}.jpg` (English is `after-map-390x844.jpg`). Low tier with reduced
motion: `after-map-low-reduced-1280x800.jpg`.

## 3. Checks

- `tests/client/map.test.mjs` (9 tests): projection and orientation, geometry mirrors the layout, 17 places with routes that
  resolve in `placePosition` and are reachable from the spawn over the walk graph, Shell states against a real judge-seed
  season (waiting → inside → staked), route decisions in both modes and inside a Shell, goal and Iris markers, the view
  model, five-locale strings, the label toggle default.
- Headless Chromium (SwiftShader, a few FPS; clicks dispatched with `element.click()`): both modes, desktop and iPhone 13,
  EN and UK, zero console errors; the run log is in `docs/handoff/agent-reports/island-map.md`. A second run takes the
  before/after screenshots above, checks that no label leaves the drawing or overlaps another at 390 px in five locales, and
  that the low tier with reduced motion opens the map with no animation and no blur.

## 4. Open

- `input.js` does not forward `KeyN` yet (Task G owns it, request 8): until then the panel listens for N itself and
  de-duplicates the two paths within 400 ms. Remove the listener in `map-ui.js` once `WORLD_KEYS` has `KeyN`.
- Gamepad navigation inside the map (main.js only navigates `.pl-panel` and dialogs); keyboard works (Tab cycles the close
  button and the places, Enter/Space routes, Esc closes).
- The map is a drawing, not the live island: it does not show the real art's silhouettes or the agents' walking routes,
  only their positions.
- The phone tap target is a stopgap until Task F's mobile HUD has a map tile; hide it with
  `createMapPanel({ phoneButton: false })` or CSS on `.ftf-map-fab`.
