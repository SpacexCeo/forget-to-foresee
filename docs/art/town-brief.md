# Town on the ground + Tournament altar — task brief

Task IDs: **T-001 town v1**, **A-001 Tournament altar v1**. Brief version 2, 10.11.2026 (round shrine).
Owner decisions behind it: `docs/decisions.md` (10.11, "Town on the ground"). Process: `docs/art/gpt-claude-gpu-workflow.md`.
Assignee: the Claude worker session (Blender, export, Three.js integration). References and visual review: GPT
(storyboards arrive in `docs/art/town/refs/`). Art direction: the owner, through the lead session.

## What the town is in the game

- The game now has two locations. **The town on the ground** is where play starts. **The air archipelago**
  (the current island, camps, Scroll and four Shells) is a separate location above it.
- The existing season loop becomes **the Tournament**. Nothing in its rules changes (`engine.js`, parity
  tests and the testnet commitments stay as they are).
- In the town square stands **the Tournament altar**. Iris walks to it, registers, and is carried up to
  the archipelago where the Tournament season runs. That is the whole new flow for the jury build.
- From the town, the archipelago is visible in the sky (scale and haze sell that it is far above).

## Look

Mood reference only: a compact old-world hill town. **Nothing is copied** from any game, film or screenshot:
our own plan, names, silhouettes and details (same rule as `docs/art/brief.md` for the film).

- Compact housing on terraced ground, a shrine/temple on the highest terrace, steps and ramps between levels.
- Warm terracotta and amber roofs, light plaster, dark timber frames, stone bases and retaining walls.
- It must belong to our world: the round-sign language appears as carved rings on lintels, banners and
  the altar; the cold grey-green of the archipelago appears only in the sky; **warm amber marks the
  human decision**, so the altar holds the strongest amber accent in the town.
- Stylized PBR (as the archipelago): silhouettes read from the third-person camera, materials hold up close.

## Layout (v1)

- Playable area about 120 × 120 m; walls, cliffs or houses close the edges (no invisible walls on open ground).
- Spawn at the lower gate. A clear main street climbs to **the square with the altar** (the jury walk from
  spawn to the altar: about 20 s at walk speed, about 10 s running). **The round shrine** sits above the square
  as the backdrop of the altar shot (owner decision 10.11, option C, replacing the classical temple): a ring
  colonnade around a round cella on a raised stone drum, a low dome with spiral growth ridges and a pearl sheen
  echoing the Shells, an open oculus, a frieze of round-sign strokes; its amber accents stay weaker than the
  altar core; no bell tower.
- 12–20 houses from a modular kit (walls, timber frame, roofs, doors, windows, chimneys, balconies, awnings)
  with variation, plus props: well, market stalls, crates, barrels, lamps, banners, trees and planters.
- Iris's scale: the existing agent rig (height about 1.7 m). Doors 2.1–2.4 m, street width 4–8 m.

## Tournament altar (hero object)

- A round stone dais with three steps, a ring-shaped altar stone carved with a logogram ring, an amber core
  that wakes when Iris approaches (emissive mask as a separate texture; the pulse is done in code).
- Up to 16k triangles runtime + `_inspect` up to 60k; textures up to 4096² (budgets from `docs/decisions.md` §4, 07.11).
- A named empty `altar_focus` for the camera and the interaction point, and `altar_stand` where Iris stands.

## Technical requirements

As `docs/art/brief.md` "Technical requirements", with these budgets: town terrain + walls up to 120k
triangles, the kit split into separate `.glb` files per piece or per block so the client can stream them,
each piece with a `_col` collision mesh. Y up, metres, pivots on the ground. Procedural Blender sources go
into `art/town/` (as the other `art/*/build_*.py`), outputs into `game/public/assets/models/town/`,
compressed with `art/tools/compress-glb.sh`. Every source and licence into `docs/art/manifest.md`.

## Integration (Three.js)

- A new scene module for the town next to `game/src/scenes/island.js`, its layout data like `scenes/layout.js`.
- The game starts in the town. At the altar a prompt "Register for the Tournament" (en + ru locale keys)
  starts the existing season flow and moves Iris to the archipelago with a short transition.
- `?demo=judge` also starts in the town (the jury should see it); `?skip=town` goes straight to the
  archipelago as today. Every existing deep link and test keeps working.
- `cd game && npm test` and `npm run build` stay green; check the town in the browser with no console errors.

## Acceptance (v1)

1. Walk spawn → altar → register → archipelago with no errors; collisions hold (no walking through houses).
2. The town reads from the game camera at 1280×800 and on a phone layout; the frame rate on desktop stays
   close to the archipelago's.
3. Renders from the server: a top view, the spawn view, the altar shot; committed under `docs/art/town/qa/`.
4. Sources, exports and QA committed and pushed; nothing exists only on the GPU server.

Typical defects to avoid: floating houses, z-fighting roof tiles, stretched UVs on walls, repeated identical
facades in one view, doors too small for Iris, a square too empty or too cluttered for the altar shot.

## Order of work

1. Blockout of terrain, streets and building volumes + altar blockout; in-engine walk test.
2. Modular kit and the altar hero; materials and bakes on the GPU.
3. Integration and QA renders. 4. Refinement against GPT storyboards as they arrive.
