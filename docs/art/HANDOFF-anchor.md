# Handoff: `anchor.glb` production (CPU Blender pipeline)

Written 2026-11-07 by Claude Code at the owner's request to stop and hand over. Branch: `claude/adoring-darwin-r9mu72` (do **not** push to `main`, do not create `art/anchor-first`).

**Status in one line:** the blockout and scale check are done and rendered. **No `anchor.glb` exists yet.** The detailed model, bake, materials, export, validation scene and validation have **not** been started.

## 1. Owner instructions in force (read before continuing)

- English only for everything new (docs, UI, comments, commits).
- Stay on `claude/adoring-darwin-r9mu72`; preserve existing work; no merge/push to `main`, no deploys, no paid services, no real money.
- CPU Blender production and a minimal Three.js validation scene are **authorized**. GPU access is a **separate blocked workstream**, not a prerequisite.
- Do not tunnel around the cloud network policy, try alternate SSH routes, or use or request passwords in chat.
- Follow `docs/art/brief.md` (English, includes owner additions) and the acceptance list in section 6 below.
- Manifest status for the anchor may go to `review` only after real validation; **only the owner sets `approved`**. Keep the other assets `greybox`. Never invent authors, licences or checks.
- Never claim GPU generation/baking that did not run. If a browser check cannot run, mark it **NOT RUN**.

## 2. Done and verified (with evidence)

| Item | Result | Evidence |
|---|---|---|
| Art docs translated to English | Done, requirements + exact filenames + existing attribution preserved | `docs/art/brief.md`, `docs/art/manifest.md` (commit `473913a`) |
| Blender on CPU | `bpy` 4.5.15 LTS installed in 6 s into a Python 3.11 venv (`uv venv -p python3.11; uv pip install "bpy==4.5.*" numpy`); Cycles CPU + OpenImageDenoise render OK | session log |
| Existing tests | `cd game && npm install && npm test` → **68/68 pass** (baseline before any change) | session log |
| Existing build | `npx vite build` **fails at baseline**: no `game/index.html` entry exists. Pre-existing, not caused by this work | session log |
| Blockout + scale check | Height **1.600 m**; footprint 0.79 × 0.72 m (three fins); pivot at base centre (min Z = 0) | `docs/art/qa/anchor/blockout/blockout-dimensions.json` |
| Blockout references | Front, side (orthographic), three-quarter, top renders with a 2 m ruler (0.1 m segments) and a 1.75 m human proxy | `docs/art/qa/anchor/blockout/*.png`, `anchor_blockout.blend` |
| Silhouette check | Side: tapered tower, pad housing, gallery, lantern, cone cap — reads as a beacon. Top: trefoil of three fins around the round plinth — recognizable. Blockout fins are flat boxes; the final fins should be curved buttresses | renders above |

Not a defect in the asset, fixed in the script: the first blockout render showed the human proxy's head floating above the body. It was re-rendered with the fix before commit.

## 3. Not done / blocked

| Item | State |
|---|---|
| RTX 5090 server (Clore #121819) | **BLOCKED, not verified.** This cloud container has no DNS route and no `ssh`; the egress proxy does not relay SSH (ports 1787 and 1436 gave no SSH banner); the web URL is denied by network policy (HTTP 403 at the proxy). Nothing on the server was run: no `nvidia-smi`, CUDA, disk or RAM checks. The owner pasted credentials in chat; they were **not used**, and the owner was advised to rotate them. GPU tasks must be done from the owner's own machine (local Claude Code where the owner types the password). |
| Detailed model, `_inspect`, `_col` | NOT STARTED (design below) |
| UVs, bake, materials, textures | NOT STARTED |
| `anchor.glb` export | NOT STARTED — `game/public/assets/models/` still contains only `.gitkeep` |
| Validation scene (Three.js) | NOT STARTED. No loader exists anywhere in `game/src` (only `engine.js`, `crypto.js`) |
| glTF-Validator, metrics, browser screenshot | NOT RUN |
| Manifest anchor row | still `greybox` (correct until validated) |

## 4. Files

| Path | What |
|---|---|
| `art/anchor/build_anchor.py` | Single procedural source. Stage `blockout` works. Stages `build` and `render` raise `NotImplementedError` — implement them next. Contains render helpers (Cycles CPU, AgX, sun lights, grid ground, ruler, human proxy, standard cameras) to reuse. |
| `docs/art/qa/anchor/blockout/` | Blockout renders, dimensions JSON, blockout `.blend` |
| `docs/art/brief.md`, `docs/art/manifest.md` | English brief and manifest |

Run (from repo root):
```bash
uv venv -p /usr/bin/python3.11 /tmp/bpyenv && uv pip install -p /tmp/bpyenv/bin/python "bpy==4.5.*" numpy
/tmp/bpyenv/bin/python -I art/anchor/build_anchor.py blockout
```
In desktop Blender 4.5: `blender -b -P art/anchor/build_anchor.py -- blockout`.

## 5. Proposed detailed design and pipeline (plan, not yet executed)

**Design — original "tide beacon".** Lighthouse-like, echoing the Shells' growth ribs, nothing taken from *Arrival*. Heights are measured from the ground, in metres.

| Part | Spec | Material |
|---|---|---|
| Plinth | Round, r 0.28, 0–0.11, chamfered rim | Body |
| Fins ×3 | Curved buttresses at 90°/210°/330° (one points to the back, two frame the front), reach r 0.44, top joins the shaft at ~0.45, chamfered edges | Body, bronze tip shoe |
| Lower shaft | Tapered r 0.17 → 0.13, 0.11–0.52, three asymmetric growth-rib bands (sharp leading edge, soft trailing edge) | Body |
| Pad housing | Rounded octagon (apothem ≈ 0.15), 0.52–0.86. On the front (−Y in Blender = +Z in glTF) **and** the back: bronze frame + flat pad plate, Shell-number pad ≈ 0.10 × 0.12 (upper) and tick pad ≈ 0.10 × 0.08 (lower). Pad plate = one flat quad with 0–1 UVs for code-drawn decals | Body / Trim / **Pad** |
| Neck + collar | r 0.12 → 0.10, 0.86–1.02, bronze collar ring | Body + trim |
| Gallery | Disc r 0.19–0.20, 1.02–1.07, drip edge, bronze rim | Body + trim |
| Lantern cage | 5 slender helical ribs (≈40° twist, bowing to r 0.17) between gallery and top ring at 1.40 | Trim (bronze) |
| Lens | Faceted amber bulb r ≈ 0.085, 1.09–1.36 — amber is the palette's "human decision" colour, **not** an informational colour | **Lens** |
| Cap | Spiral whorl cone 1.43 → 1.60 (radius modulated by a helical suture step, ~2.5 turns), finial at 1.60 | Body |

**Materials (exactly 3):** `M_Anchor_Body` (stone + bronze trim share one 2048 atlas: baseColor JPEG, ORM JPEG, normal PNG), `M_Anchor_Pad` (flat neutral light grey-green, untextured, so code can overlay numbers), `M_Anchor_Lens` (amber, low roughness, modest emissive; code may override). No Gift/Storm/trust colours in any texture.

**Sockets for code** (glTF empties = nodes): `socket_shell_front`, `socket_tick_front`, `socket_shell_back`, `socket_tick_back` at pad centres, facing out; `socket_beacon` at the lens centre.

**Node names:** runtime mesh `anchor`; inspection mesh `anchor_inspect`; collision objects ending in `_col` (e.g. `anchor_body_col` = 8-sided prism r 0.20 × 1.60, `anchor_fin_a_col` … `_c_col` = boxes). No materials on `_col`.

**Key technique — shared UVs between runtime and `_inspect`.** Generate every part procedurally at two resolutions (`lo` ≈ 6–7k tris, `hi` ≈ 22–28k tris) with **parametric UVs**: revolution surfaces get u = perimeter fraction and v = profile arc length, and tubes get u = around and v = along. Each part maps into a fixed atlas rectangle sized by its surface area, for consistent texel density. Both meshes then share one texture set and the 3 materials.

**Bake (Cycles CPU, honest labelling):**
1. Master `M` = `hi` mesh minus pad/lens faces + Subdivision (SIMPLE, level 2) + Displace modifiers (stone pitting, strata bands, hammered bronze; 1–2 mm). It stays unapplied in `art/anchor/anchor.blend` and is never shipped.
2. Normal (detail-only): bake `M` → `hi`, selected-to-active, cage extrusion ≈ 0.01, max ray ≈ 0.02.
3. AO → ORM red channel; procedural base colour, roughness and metallic via Emit bakes (pointiness/AO-driven edge wear) on `hi`.
4. Runtime `lo` uses the same images. Optionally transfer custom normals from `hi` to `lo` (Data Transfer modifier) so the detail normal map reads the same.

**Export:** Blender glTF exporter, `export_format='GLB'`, `export_yup=True`, `export_apply=True`, `export_tangents=True`, `export_image_format='AUTO'` (keeps JPEG/PNG as saved), no animations. Watch the file size (initial desktop download target ≤ 10 MB for the whole game). If the 2048 PNG normal map is too heavy, report options (JPEG normal, or 1024) to the owner instead of silently cutting.

**Validation scene (smallest fit):** `game/review.html` + `game/src/review/asset-review.js` + `game/vite.config.js` multi-page input (keep `index.html` free for the real game). GLTFLoader for `/assets/models/anchor.glb` (optional `?model=` restricted to `[a-z0-9_]`), RoomEnvironment + hemisphere + shadowed directional light, OrbitControls, a grid ground, a 1.75 m human proxy and a 2 m ruler, a visible loading/error overlay, `_col`/`_inspect` hidden by default (toggles for review only), and a stats panel. Do not touch `engine.js`/`crypto.js`.

**Validation to run and report with real output:**
- `gltf-validator` (npm, Khronos): 0 errors.
- Metrics via `@gltf-transform/core`: triangles per mesh, number of materials, image sizes and embedded state, bounds (height ≈ 1.6, min Y = 0, centred), node names.
- Proposed: `npm run validate:models` script.
- `npm test` must stay 68/68.
- Build via `vite build` with the new config.
- Playwright screenshot of `review.html`: Chromium is preinstalled in cloud sessions, so this can actually run.
- Cycles QA renders: front, side, 3/4, top, close detail of pads + lantern, and an `_inspect` close-up.

## 6. Acceptance checklist (from owner brief)

- [ ] glTF-Validator 0 errors; Y-up, metres, applied scale, pivot at base centre, height ≈ 1.6 m
- [ ] Runtime ≤ 8,000 tris; `_inspect` ≤ 30,000 tris (separate, does not replace runtime)
- [ ] ≤ 3 PBR metallic-roughness materials; embedded PNG/JPEG ≤ 2048²
- [ ] UVs without stretching, consistent texel density; normals correct; tangents exported
- [ ] `_col` simplified convex meshes; flat pads for Shell number I–IV and tick; no modelled 10-silk stake; no informational colours baked; no animations
- [ ] Recognizable silhouette from side and top (blockout ✔, final pending)
- [ ] Loads in the review scene (tested, screenshot); close-inspection renders saved
- [ ] Manifest row with **measured** values, status `review`
- [ ] Time per stage recorded (below)

## 7. Measured time per stage (wall clock, this session)

| Stage | Start (UTC) | End (UTC) | Duration | Note |
|---|---|---|---|---|
| Read brief/spec, server reachability checks | ~11:50 | ~12:00 | ~10 min | SSH blocked |
| Blender install (CPU) | 12:03:37 | 12:03:43 | 6 s | `bpy` 4.5.15 |
| Docs translation | ~12:03 | 12:07:32 | ~4 min | |
| Blockout script + scale renders | 12:07:32 | 12:10:59 | 3.5 min | 4 Cycles CPU renders, 85 s compute (4 cores) |
| Detailed model → export → validation | — | — | — | not started |

Pace forecast is not possible yet: the expensive stages (detailed modelling, bake, validation) have not run. The next executor should log the same columns.

## 8. Other context received this session (not acted on)

The owner attached a commercial game assessment (dated Nov 7): two RTX 5090s, human clans and leaders, entry-funded prizes, and six math findings in the 2D prototype (fragment withholding pays more, the gift pool is not conserved, the proof check is disconnected from resolved event fields, the public seed reveals the future, an unfunded top bid burns a sale, overdue debts are transferable). It is out of scope for the art task and was **not** applied to code or rules here. Cash-prize and real-money work stays off until the owner and legal approve.
