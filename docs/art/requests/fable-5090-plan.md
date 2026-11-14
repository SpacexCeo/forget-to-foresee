# Fable on the RTX 5090: the 3D push before submission

Inputs: `docs/art/tripo-batch-1.md` (ids, prompts, budgets, scales), `docs/plans/boss/HANDOFF-glass-shoal.md`
(placeholders waiting for models), `docs/plans/boss/arena-tech-spec.md`. Team: Fable with 3 agents at medium effort,
plus the owner's 10 ultra-quality generation slots. All heavy work runs on the GPU box, never on the owner's laptop.

## 1. What the judges see in the first 10 minutes (rank = order of work)

| # | Asset (game name) | Why it matters |
|---|---|---|
| 1 | `shoal_dragon` (Tripo id `dragon_pearl_mount`) + `dragon_saddle` | the ride: on screen for minutes, in every trailer shot, seen from behind and below |
| 2 | `hollow_tide` (`boss_hollow_tide`) | the boss fight is the climax; today a placeholder serpent |
| 3 | `loomblade` (`weapon_loomblade`) | in Iris's hand during every swing, close to the camera |
| 4 | Iris / Elise hero polish (`agent_iris`, `agent_elise`) | the player looks at her back the whole time: hair, face in close-ups, sword socket |
| 5 | Town first impression (`town/town_block_gate`, `town_block_square`) | the first 30 s after the prologue |
| 6 | Lab prologue (`lab_baker`) | the first 60 s of the game |
| 7 | `shoal_spire_set`, `shoal_monolith_set`, `cliff_stone` | the arena silhouette and the landing |
| 8 | `teleport_gate` + `last_chip` | the ending shot |

## 2. The 10 ultra slots (owner generates; Fable's agents process)

1. `dragon_pearl_mount` — largest, most seen, hardest to fake procedurally.
2. `boss_hollow_tide` — the climax; needs a clean silhouette at 30 m.
3. `weapon_loomblade` — close to camera; ultra detail shows in every attack.
4. `dragon_saddle` — sits on the mount in every ride shot; must match its quality.
5. `lab_baker` — first thing a judge sees in-game.
6. `teleport_gate` — ending shot, close-up.
7. `cliff_stone` — the landing frame of the ride.
8. `shoal_spire_set` — horizon read; one generation gives all three.
9. `shoal_monolith_set` — arena dressing; one generation gives all three.
10. `last_chip` — tiny, but a hero close-up in the ending.

Spare re-roll: if the dragon or the boss come out weak, spend slots 9–10 on a second try of them instead.

## 3. Per-model pipeline (one model = one folder, one owner)

Work dir on the GPU box: `/srv/art/<id>/` with `in/` (Tripo GLB), `work/`, `out/`.

1. **Generate**: owner exports GLB from Tripo (auto-rig for dragon and boss), drops it in `refs/tripo/<id>/` on the
   art board; the agent copies it to `in/`.
2. **Retopo / weld** (Blender 4.5, script per asset under `art/<area>/`, e.g. `art/dragons/`, `art/mobs/`): merge by
   distance, remove loose parts, recalc normals, apply scale in metres (scales in `tripo-batch-1.md`), pivot on the
   ground, forward = -Z after glTF export.
3. **Decimate** to the budget (dragon 40k, boss 50k, sword 3k, saddle 4k, baker 15k, gate 15k, spire 2k each,
   monolith 3k each, cliff 4k, chip 1k). Keep the rig weights on creatures.
4. **Bake** on the 5090 (Cycles GPU): base colour + ORM + normal from the high poly; 2048² for hero assets (dragon,
   boss), 1024² for props, 512² for the chip and spires.
5. **Compress**: `art/tools/compress-glb.sh <in.glb> <out.glb> <name>` (KTX2 ETC1S colour/ORM, UASTC normals, meshopt).
6. **Lite `_m`**: textures ≤1024², meshes simplified (`art/tools/phone-lod.sh` for skinned meshes,
   `art/tools/glb_mobile.py` for props). Target about 40% of the full tris.
7. **Colliders**: props get a `<name>_col` node (convex hulls, ≤300 tris), it is extracted by
   `game/src/render/asset-catalog.js` (`COL_RE`). The dragon and the boss use code capsules, no `_col`.
8. **Import**: `game/public/assets/models/<name>.glb` and `<name>_m.glb` with the **game names** (`shoal_dragon`,
   `hollow_tide`, `loomblade`); the vite model list picks them up and `glass-shoal.js` swaps the placeholder.
   Add a row to `docs/art/manifest.md` (source Tripo, licence, tris, textures, size).
9. **Checks** (on the server): tris and size vs budget (`gltf-transform inspect`), `art/tools/phone_check.mjs` for
   draw calls on `_m`, `npm test` in `game/`, `FTF_BASE=/forget-to-foresee/ npx vite build`, the boot check, and a
   still in the arena at the game camera. Size caps: hero ≤8 MB full / ≤3 MB `_m`, props ≤1.5 MB / ≤0.6 MB.

## 4. Three agents without collisions

| Agent | Branch | Owns | Assets |
|---|---|---|---|
| A — creatures | `wip/fable-creatures` | `art/dragons/`, `art/boss/`, models `shoal_dragon*`, `hollow_tide*`, `dragon_saddle*` | 1, 2, 4 + their clips (glide, flap, bank, land; rise, slam, lunge, sweep, death) |
| B — hero props | `wip/fable-props` | `art/props/shoal/`, `art/props/lab/`, models `loomblade*`, `lab_baker*`, `teleport_gate*`, `last_chip*` | 3, 5, 6, 10 + the sword socket check on Iris |
| C — arena dressing | `wip/fable-arena` | `art/env/shoal/`, models `shoal_spire*`, `shoal_monolith*`, `cliff_stone*` | 7, 8, 9 + placement in the arena scene data |

Rules: each agent writes only its own folders and model names; `docs/art/manifest.md` rows go in through the merge
lead (append-only, one row per asset). Shared scripts in `art/tools/` and `art/common/` are read-only for all three;
a needed change goes to the lead. GPU: one Cycles bake at a time (`flock /srv/art/.gpu.lock`); decimation and
compression run in parallel. Each agent pushes `wip/fable-<area>` and reports to the merge lead per WORKER-RULES.
