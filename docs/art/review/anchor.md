# Review: `anchor.glb` (Anchor, hero)

| | |
|---|---|
| Branch / commit | `main` (`art/anchor-first` merged); renders `docs/art/qa/anchor/final/`, stats `docs/art/qa/anchor/build-stats.json` |
| Review round | 1 (07.11) |
| Reviewed material | 11 QA renders (front, side, top, three-quarter, 3 close-ups runtime + 3 inspect, collision), turntable video, `anchor.glb` inspected with gltf-transform |
| Verdict | **close** — the silhouette and the palette are right; the bake has visible black artefacts, the fins and the lens look like placeholders, and the file is 3x heavier than it needs to be |

## Scores (1–10)

| Silhouette | Materials | Detail | Technical |
|---|---|---|---|
| 7 | 6 | 6 | 6 |

## What works

- Reads as a beacon from the side and the three-quarter view: plinth, tapered shaft, pad housing, gallery, caged lantern, cone cap. The trefoil of fins is recognizable from the top.
- Height 1.600 m next to the 1.75 m proxy: correct scale, pivot on the ground at the base centre, Y-up, 1 unit = 1 m.
- Palette follows the brief: cold grey-green stone, aged bronze, one amber accent. Nothing resembles Arrival.
- Pads: flat, untextured `M_Anchor_Pad` quads with bronze frames, front and back; `socket_shell_*` / `socket_tick_*` carry `pad_size_m` and `outward_normal_gltf` extras, `socket_beacon` sits at the lens centre. This is exactly what the code needs.
- Runtime 11,488 tris (budget 16k), `_inspect` 46,204 (budget 60k), 6 convex `_col` hulls with no materials, tangents exported, texel density uniform (CV 0.03, anisotropy p95 1.2).

## Fixes, ranked

1. **Bake artefacts on the cap (black fringe).** `anchor_close_lantern.jpg` and `anchor_inspect_close_lantern.jpg`: a jagged black fringe runs along the whole lower rim of the cone cap where it meets the top bronze ring. `anchor_top.jpg` (about 3 o'clock) and `anchor_front.jpg` (right of the cap base): the helical suture step of the cap shows a black wedge as if the cap were torn. These are missed rays / no padding on the overhang and on the vertical face of the suture step. Fix: bake the cap with a cage (extrusion about 8 mm) or raise the max ray distance there, give the suture step face its own UV island, and dilate the baked maps by at least 16 px at 4096. Verify on a flat-lit top render.
2. **Fins read as straps, tips read as cubes.** The three fins are flat 3 cm ribbons lying on the plinth (`anchor_close_base.jpg`, `anchor_front.jpg`); the bronze cubes at their tips look like untextured placeholder cubes. Make them stone buttresses: triangular or T section, 8–10 cm thick at the plinth tapering to 3–4 cm at the shaft, chamfered edges, and replace each cube with a wedge-shaped bronze shoe (about 6 x 8 x 5 cm) that wraps the fin tip, or a ground spike. From the isometric camera at 15–30 m the fins currently disappear and only the three cubes remain.
3. **Lower shaft ribs look like stacked tyres.** Five identical rings with equal spacing and soft, symmetric edges. The design calls for growth ridges: sharp leading edge, soft trailing edge, spacing that grows upward (e.g. 6, 8, 11, 14 cm), and a slight spiral pitch (5–8 deg) to echo the Shells. Add 2–3 chipped spots so the rings do not look lathed.
4. **Lens is a visibly faceted icosphere with a plastic look.** `anchor_close_lantern.jpg`: random triangles, roughness 0.05, emissive 0.35 — it reads as a painted egg, not as the "human decision" light. Either cut it as a gem (24–32 planned flat facets with bevelled edges, hexagonal rows) or make it smooth; raise the emissive to a real glow (emissive factor 1.0 plus `KHR_materials_emissive_strength` 2–3, code can scale it) and add a slight inner gradient (brighter core) in the base colour. The code is allowed to override the colour, but the mesh must look right at inspect distance (5 m).
5. **Stone lacks mid-frequency detail.** The whole body is one small-scale stucco noise with green moss blotches that look painted on (plinth in `anchor_close_base.jpg`). Reference `1.webp` (the segmented stone table): block seams, chipped edges, lichen only in crevices. Add a curvature-driven edge wear (lighter, rougher edges), 3–5 hairline cracks on the plinth and the pad housing, a block seam or two on the plinth, and restrict moss to AO-dark areas and horizontal ledges.
6. **Bronze is dull and uniform.** All bronze parts are one dark brown with constant roughness; against the gold inlay of the plaza (reference `2.webp`) it will look muddy. Brighten the base colour to a warm bronze, keep dark patina in recesses (AO-weighted), and vary roughness 0.25–0.5 so the rings and the cage catch the sun from the isometric camera.
7. **Gallery posts will shimmer.** The railing posts are about 5 mm thick; at 20–30 m they alias and flicker. Thicken them to 12–15 mm in the runtime mesh or move the posts into `_inspect` only and keep just the top rail at runtime.
8. **36.7 MB for a 1.6 m prop.** Four 4096 textures, two of them PNG normals of 11.9 MB each. Median texel density is 1277 px/m, which is far beyond what a 1.6 m object needs at 5 m inspect distance. Ship the runtime material at 2048 (normal PNG about 3 MB) and keep 4096 for `_inspect` only, or share one normal between both meshes. Target under 12 MB until KTX2 is in the build.
9. **All materials are double-sided.** `M_Anchor_Body`, `_Lens`, `_Pad`, `_Body_Inspect` export `doubleSided: true`; the meshes are closed, so set them single-sided (fewer shaded fragments, no back-face lighting errors on the cage ribs).
10. **Four materials in the file.** Runtime uses 3 (OK), but `M_Anchor_Body_Inspect` is a fourth material that duplicates `M_Anchor_Body` except for the normal map. Acceptable under the rule (3 per rendered object), just keep it that way; do not add a separate inspect pad or lens material.

## Reference check

- Mood vs `2.webp` / `1.webp`: the anchor is an original object, not in the concepts; its palette fits (charcoal stone, bronze, amber). It would sit better next to the gold-inlaid plaza with the brighter bronze of fix 6.
- Nothing copied from Arrival: confirmed (lighthouse / tide beacon design).
- Isometric readability at 20–30 m: the lantern glow and the cone cap read; the fins do not (fix 2).
- Close inspection: fixes 1, 4, 5 are the ones that show at 1–5 m.
