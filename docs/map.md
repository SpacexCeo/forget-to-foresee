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

### Style

The panel reuses the world HUD tokens through `.wh-root` (`docs/ui-world-hud.md`): the dark panel surface with the pale
double hairline, Libre Caslon titles, Source Sans captions, gold for Shells with a sign, the goal and Iris. The archipelago
itself is drawn in parchment (`#d7c9a2`, plaza `#e3d8b8`) with ink outlines on the cloud sea. Reduced motion stops the goal
pulse; the low tier drops the backdrop blur (same rule as the HUD).

Widths: `min(560px, 100vw − 32px)`; at 390 px the drawing is 350 px wide and camp names are 11–12 px tall.

## 3. Checks

- `tests/client/map.test.mjs` (9 tests): projection and orientation, geometry mirrors the layout, 17 places with routes that
  resolve in `placePosition` and are reachable from the spawn over the walk graph, Shell states against a real judge-seed
  season (waiting → inside → staked), route decisions in both modes and inside a Shell, goal and Iris markers, the view
  model, five-locale strings, the label toggle default.
- Headless Chromium (SwiftShader, a few FPS; clicks dispatched with `element.click()`): see `docs/handoff/agent-reports/island-map.md`
  for the run log. Both modes, desktop 1280×800 and iPhone 13, EN and UK.

## 4. Open

- `input.js` does not forward `KeyN` yet (Task G owns it, request 8): until then the panel listens for N itself and
  de-duplicates the two paths within 400 ms. Remove the listener in `map-ui.js` once `WORLD_KEYS` has `KeyN`.
- Gamepad navigation inside the map (main.js only navigates `.pl-panel` and dialogs).
- The phone tap target is a stopgap until Task F's mobile HUD has a map tile; hide it with
  `createMapPanel({ phoneButton: false })` or CSS on `.ftf-map-fab`.
