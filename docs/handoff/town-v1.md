# Handoff: town worker (branch `claude/town-v1`)

Tasks: T-001 town, A-001 Tournament altar, S-001…S-003 shops, the town in the client. Briefs:
`docs/art/town-brief.md` (v2), `docs/art/townsfolk-shops-brief.md`. Decisions: the 10.11 rows at the end of
`docs/decisions.md`. A fresh session can continue from this file and git alone. Last update: 10.11.2026 17:40 UTC.

## Done (all pushed)

| What | Where | Commit |
|---|---|---|
| Town art v1, textured: terrain, 3 house blocks, round shrine, altar, sky islands (146k tris) | `art/town/*.py` → `game/public/assets/models/town/*.glb` (+ `_m`) | `8b09b06` |
| GPT review applied (altar per sheet A-001_01, shell dome, roof families, broken rows, cliff ledges) | same | `3932e8e` |
| Shops first pass: three walkable interiors (block-ins from the town kit), signs and doors in the town | `art/town/town_shops.py`, `town_shop_*.glb` | `6e8b0be` |
| Town data for the client and the townsfolk worker: pieces, interiors, npc points / areas / routes, shops | `game/src/scenes/town-data.js` (generated) | `ef32744`, later rebuilt |
| Client: town scene, walk to the altar, "Register for the Tournament", transition into the season | `game/src/scenes/town*.js`, `docs/town.md` | `3e1560d` … `b8ef89d` |
| QA renders (Cycles, GPU), board checkpoint, manifest rows, decision rows | `docs/art/town/qa/`, `docs/art/town/board/`, `docs/art/manifest.md` | `f36bf3d` |

Verified: `cd game && npm test` (610 pass) and `npm run build` at `b8ef89d`. The walk → register → archipelago
flow ran in a headless browser on the **blockout** files; in-engine screenshots on the textured files exist
(`docs/art/town/qa/ingame/v1-*.png`) but a full end-to-end re-run on the current files is **not confirmed**.

## Half-done

1. **Client queue** (was running in a background agent of the worker session; it stops with that session).
   Order: (a) re-verify the flow on the current files, new screenshots; (b) the town is the start for every
   player + a loading screen with real progress that shows the town warmed (`game/src/ui/loading.js`,
   `game/src/main.js` gate; in progress, uncommitted edits may exist only as checkpoint commits);
   (c) ambient motion: cloth (`M_Town_Cloth`) and trees (`M_Town_Foliage`) in the wind from one local wind
   source (to be swapped for the shared uniform of branch `claude/atmosphere`), chimney smoke at
   `socket_smoke_*`, birds, lamp flicker, drifting `town_sky`, well water (`M_Town_Water`), the altar core
   pulse and the sixteen glyph nodes `town_altar_altar_glyph_00…15` lighting in sequence as Iris approaches
   (ratio core : glyphs : waystone eyes about 1 : 0.3 : 0.1); (d) frame-time numbers in the town on the desktop
   and phone layouts; (e) shop entry / exit (`TOWN_DATA.shops`, `TOWN_DATA.interiors`; pieces go far away
   with their own collision world like the Shell interior; what S-001 and S-002 open before the season
   starts is undecided: propose the smallest honest option to the lead). Colour grading, fog, lighting and
   weather are NOT ours any more (rendering worker, `claude/atmosphere`).
   Known client gaps: the camera far plane must be ≥ 700 m in the town (far sky islands are 450–620 m away);
   the last altar screenshot predates the reworked altar.
2. **Shops**: interiors are block-ins. Final detail waits for GPT sheets `S-001…S-003` (owner rule: every
   reference comes from the GPT chat). Board entry `S-001 Q01` asks GPT what the sheets will change.
3. **GPT board**: open entries `T-001 Q03` (what was applied) and `S-001 Q01`. Board lives on the GPU server
   (`/root/board/board.md`, `refs/`, `renders/`); copy in git: `docs/art/town/board/` (board.md + the altar
   sheet only so far; the other refs are for the townsfolk worker and still to copy).
4. **README**: the real/mock table does not mention the town yet. Add it only after the flow is re-verified.
5. **Codex CLI** (GPT watcher in this container) is not installed: the permission system of the worker
   session denied it. The board is answered by the lead's side or the owner's browser GPT.

## Next steps, in order

1. Finish the client queue above; commit and push after each item; `npm test` + `npm run build` green.
2. Read the board; apply GPT's answers to `T-001 Q03`; refine shops from the `S-00x` sheets when they land.
3. Before the GPU server stops (about 22:00 UTC 10.11): copy `/root/board` into `docs/art/town/board/`,
   pull results, push. Nothing may exist only on the server.
4. README real/mock rows for the town, the altar and the shops once they run.

## How to resume

- **Art build** (Blender 4.5 LTS, any machine; GPU only speeds up the QA renders):
  `blender -b -P art/town/build_town.py -- textures` (numpy, about 3 min), `-- build` (5 s; writes
  `art/town/out/*.glb`, `docs/art/town/qa/build-stats.json` and `game/src/scenes/town-data.js`),
  `-- render [views]`, `-- shops`; then `art/town/compress_town.sh [piece…]` (gltf-transform + toktx) writes the
  shipped files. The layout is `art/town/town_plan.py`; never edit `town-data.js` by hand (running
  `town_plan.py` alone writes default bounds: always regenerate through `-- build`).
- **Files**: `town_geo.py` (builder: game space Y up, world-aligned UVs, vertex colour), `town_terrain.py`,
  `town_houses.py` (eight recipes, props), `town_altar.py` (altar, shrine, sky islands), `town_shops.py`,
  `town_textures.py` (nine tiling sets).
- **GPU server**: `tools/gpu-server/jx.py` with the host and token in an uncommitted `../gpu/` folder (ask the
  lead; never commit them). The repo clone on the server is `/root/ftf`; sources are synced by tar, results
  pulled back by tar. One heavy job at a time (shared with other workers).
- **Client QA**: `cd game && npm run dev`, open `/?play=direct&town=1` (town), `&town=altar` (at the altar),
  `/?demo=judge` (lobby → town); `window.__ftf.town` has `ready`, `registered`, `register()`.
  e2e: `game/tests/e2e/town.e2e.mjs`. Notes: `docs/town.md`.
- **Reports** go to the lead session; the townsfolk worker (`claude/townsfolk-v1`) reads `TOWN_DATA.npc`
  and asks for new points through the lead.
