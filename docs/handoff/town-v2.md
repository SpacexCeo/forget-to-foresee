# Handoff: town v2 (branch `claude/town-v2`)

Task: make shops S-001 Shard Exchange, S-002 Scribe of Signs and S-003 Inn real places (exterior and interior per
GPT sheets, enter / talk / leave in the client), swing the hanging signs and lanterns as rigid bodies, and bring the
README real/mock table and `docs/town.md` up to date. Paused by the lead on 11.11.2026 at about 00:10 UTC, early in
the work. A fresh session can continue from this file and git alone.

## Done (pushed)

| What | Where |
|---|---|
| The twelve GPT shop sheets copied from the server (`_01` exterior, `_02` plan, `_03` view from entry, `_04` view from behind the counter) | `docs/art/town/board/refs/S-00{1,2,3}_0{1..4}.png` |

## Half-done (committed as WIP, NOT run, NOT tested)

1. **`art/town/town_geo.py`**: `TownBuilder.swing(name, pivot, hinge=…, length=…)` puts everything built inside it
   into a separate node `swing_<name>` with its origin at the hook; `light(pos, color, power, radius)` records
   bake-only lights per piece; `lathe` and `disc` primitives. Geometry is now keyed by (piece, material, node).
2. **`art/town/build_town.py`**: `build_objects` exports the swing nodes (an empty at the hook with the meshes as
   children, custom properties `swing`, `hinge`, `length`); interior-only materials (`M_Shop_Bronze`, `Iron`,
   `Ceramic`, `Paper`, `Wax`, `ShardAmber`, `CaseGlass`, painted `M_Shop_Daylight`); `bake_interior` (Cycles diffuse
   direct + indirect baked into vertex colour, `Col = tint x light`, after `tessellate`); `build <piece…>` for a
   partial rebuild; `TOWN_PREVIEW=<dir>` renders the baked interiors as the client would show them.
   **Never executed**: expect small errors. `preview_interiors` reads `sp["stand"]` and `sp["height"]`, which
   `town_plan.SHOPS` does not have yet. Nothing in `town_houses.py` or `town_shops.py` uses `swing` or `light` yet,
   so the shipped `.glb` files are unchanged (still the first-pass block-ins).
3. **`game/src/scenes/town-layout.js`**: the first pure helpers for the shop flow, written by a sub-worker that was
   stopped mid-task. Syntax checks; not wired to anything, no tests, `npm test` not run on it.

The last commit on which `npm test` and `npm run build` are known green is `main` at `8719074`.

## Not started

- Interiors rebuilt to the sheets (layout notes below), dressed, baked, ≤ 80k triangles each.
- Exteriors of `h15` (Exchange), `h13` (Scribe), `h07` (Inn) per the `_01` sheets: stone ground floor, double door
  with a stone surround, lit display window with a striped awning (indigo / moss / terracotta), a bronze ring sign
  hanging on chains (shard / arc + stylus + drop / cup).
- Signs, wall lanterns (`_lantern`) and lamp-post heads (`lamp_post`) built inside `tb.swing(...)`; the client side
  in `game/src/scenes/town-life.js`: a damped pendulum of a few degrees per `swing_*` node driven by `windAt()`
  from `game/src/render/weather.js`, still under reduced motion.
- Client: shop entry and exit (see the plan below), catalog entries for the interiors, locale texts, tests, e2e.
- `README.md` real/mock rows and `docs/town.md` for the town start, altar registration, shops and townsfolk.

## Plan that was being followed

**Lighting contract for interiors.** The whole lighting of a room is baked into vertex colour, so it looks the same
on every tier. While Iris is inside, the client turns off the sun, sky light, environment light, fog, clouds and
weather, and lights the interior with one neutral ambient light (three.js: intensity about pi shows the unlit albedo
at vertex colour 1) plus up to six low warm point lights at `socket_lamp_*` on tiers that allow them. A true metal
would go black under that, hence the non-metal `M_Shop_Bronze`.

**Client flow.** A module `game/src/scenes/town-shops.js`: each interior placed far away in the same scene with its
own `CollisionWorld` (precedent: `scenes/shell.js`), streamed when the door prompt is accepted, fade from
`render/fade.js`, `player.world` / `rig.world`, kill height and a closer camera swapped in and out. Prompts follow
the altar prompt (key `E`, the gamepad interact button, a tappable button on touch). Counter prompt: Exchange opens
the existing memory-shard / auction view, Scribe opens Iris's dictionary book, the Inn shows one line from the
innkeeper. How to open those two views before the play layer exists was still being investigated: nothing decided.
Keepers on the sheets: Maren (Exchange), Odo (Scribe), Bram (Inn). QA hooks planned on `window.__ftf.town`:
`shops`, `enterShop(id)`, `leaveShop()`, `talk()`; deep link `?play=direct&town=shop:<id>`.

**Layouts from the `_02` sheets** (room centred on the origin, door in the +Z wall, existing envelopes kept):
- Exchange 9 x 11 x 3.6 m: counter 3 m long on the right half of the rear wall with 1.2 m behind it and shelves on
  the wall; hero shard (violet above, amber below, in a dark bronze ring on three stone steps) left of the centre
  line; six low glass cases, three per side wall; a purple runner from the door to the counter, 1.5 m clear.
- Scribe 9 x 11 x 3.6 m: counter 3.6 m, offset right; ten round bronze-rimmed plaques (two rows of five) on the
  rear wall; four slanted drawing desks with arm lamps and stools, the front-left one turned; two chart racks in the
  rear-left corner; a terracotta runner; timber wainscot; plants on the sills.
- Inn 10 x 13 x 3.8 m: bar across the rear with shelves and barrels behind; hearth on the left wall with a bench
  nook and a rug; two communal tables, one right-front, one in the middle and off the axis; six clan banners; windows
  on the right wall. Keep the `npc_seat_inn_*` sockets for the townsfolk worker.

## How to resume

- **Server** (RTX 5090, rented until about 22:00 UTC 11.11; host and token live only in the sessions, never in
  git): work folder `/root/w/town2/ftf/` holds a copy of `art/town`, `art/common` and the baked tiling textures
  (`art/town/textures/`, copied from `/root/ftf`). Sync with a tar of `art/town` and `art/common`, then
  `cd /root/w/town2/ftf && blender -b -P art/town/build_town.py -- build`. A baseline build of the unmodified
  sources ran there in 5 s. Nothing of value exists only on the server.
- **Build and ship**: `docs/handoff/town-v1.md`, "How to resume" (`-- build`, then `art/town/compress_town.sh`).
  `TOWN_NO_BAKE=1` skips the light bake.
- **Checks**: `cd game && npm test && npm run build`; then open the built page once (`npx vite preview`), because
  the tests do not catch a chunk cycle.
