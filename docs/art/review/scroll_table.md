# Review: `scroll_table.glb` (Scroll table, hero)

| | |
|---|---|
| Branch / commit | `art/scroll-table-shard` @ `ba9e039`; renders `docs/art/qa/scroll_table/final/`, stats `docs/art/qa/scroll_table/build-stats.json` |
| Review round | 1 (07.11) |
| Reviewed material | 11 QA renders (front, side, top, three-quarter, close base / socket / center runtime + inspect, collision), `scroll_table.glb` inspected with gltf-transform, `art/scroll_table/build_scroll_table.py` |
| Verdict | **close** — the layout is exactly what the code needs (six sector sockets, double-ring seat, extras) and the top view reads as a medallion; the surface language is wrong for the reference (marble veining and terraced sides instead of segmented weathered stone with inlay) and the file is 46 MB with no tangents and half the UV space empty |

## Scores (1–10)

| Silhouette | Materials | Detail | Technical |
|---|---|---|---|
| 6 | 5 | 5 | 5 |

## What works

- Top-down reading (`scroll_table_top.jpg`): six dark wedges around a central ring, bronze dividers, a warm centre. From the isometric camera this is a clear medallion and the sector order is unambiguous.
- Dimensions 3.4 m across, 0.43 m high, pivot at the base centre, 1.75 m proxy for scale. The decisions log calls for a floor medallion; a 0.43 m step is at the upper limit but walkable.
- Contract: `socket_sector_1..6` with inner/outer radius, half angle and depth, `socket_center` with both groove radii and the recess radius; two convex `_col` hulls; runtime 13,772 tris (16k), `_inspect` 54,874 (60k); three materials per rendered mesh.
- The bronze itself is pleasant: warm, with pitting, catches light on the rings.
- The amber centre disc is a correct "human decision" accent and the only warm note.

## Fixes, ranked

1. **Stone reads as polished marble, not weathered segmented stone.** The whole body is a soft grey-white cloud with a thin Voronoi hairline network (`scroll_table_close_base.jpg`, `scroll_table_close_center.jpg`). Reference `1.webp`: the table is cut from wedge blocks with visible radial joints, chipped edges, lichen and grit in the joints. Replace the Voronoi hairlines with six radial block joints (3–5 mm deep grooves on the top and the side, aligned with the dividers), plus two or three concentric joints on the top, and add real edge wear on the outer rim (curvature mask, lighter and rougher). Keep hairline cracks to a few, long and directional.
2. **Side is a stack of terraces.** `scroll_table_side.jpg`, `scroll_table_close_base.jpg`: three horizontal bands with identical soft edges, the same "stacked tyres" look as the anchor shaft, plus a dark speckled seam at each band edge (bake bleed). Make the side one tall drum with the radial block joints of fix 1, one overhanging lip under the slab, and remove the two lower bands (or make one a clear shell growth rib with a sharp leading edge). Dilate the bake to kill the speckled seams.
3. **Black fringe along the socket walls.** `scroll_table_close_socket.jpg`: the top edge of every socket wall carries a dark jagged line, and the vertical walls go near-black. Same cause as the anchor cap: missing cage/padding at the step. Bake the top with a cage (6–8 mm) and 16 px padding; give the socket walls their own UV islands.
4. **Concentric moire in the socket floors.** `scroll_table_close_socket.jpg`: faint regular concentric arcs across every charcoal socket floor; the dished floor (6 mm) displaced with `socket_wave` at 0.05 scale produces terracing in the 8-bit normal on a surface that is almost flat. Lower `socket_wave` strength or raise its scale so the structure is at least 3 cm, and dither the normal when writing the 8-bit PNG.
5. **Inlay is laid on top, not in.** The bronze rings and dividers sit about 1 cm proud of the stone with shadows under their edges (`scroll_table_close_socket.jpg`). Reference `2.webp` shows gold inlay flush with the stone. Sink the strips flush (or 1–2 mm proud at most) and let the stone groove around them carry the edge.
6. **Outer ring is bare.** Between the two bronze circles the outer stone ring is empty; the reference medallion has a dense ornament ring. Engrave a ring of shallow sign strokes (the game's own forms: arc, spike, loop, drop, 2–3 mm deep, 6–8 cm tall) with bronze fill only in a few of them. This gives the "gold-inlaid medallion" richness at zero runtime cost and no information colour.
7. **Centre reads as ripples with a fried egg.** `scroll_table_close_center.jpg`: five concentric stepped stone rings with a glossy orange dome. The extras define two grooves; make exactly those two read: two clean seat grooves with chamfered edges, one shallow dish between them, and replace the glossy dome with a flat amber disc (roughness 0.35) sunk 5 mm into the floor, or leave the floor empty and let code place the double ring.
8. **Buttress feet are placeholders.** Six tiny tapered wedges with bronze blocks under them (`scroll_table_close_base.jpg`); from the three-quarter view they look like furniture glides. Either make them proper shell-rib buttresses that flow into the drum (10–14 cm thick, triangular section) or remove them; the bronze blocks go.
9. **46 MB file.** Four 4096 textures (two 15 MB PNG normals that differ only in detail). `uv_fill` is 0.447, so more than half of every 4096 texture is empty, and the real density is 643 px/m. Pack UVs to at least 70% fill, share one base/ORM between runtime and inspect (already the case), ship the runtime normal at 2048 and keep 4096 for `_inspect`. Target under 15 MB before KTX2.
10. **No tangents.** `scroll_table` and `scroll_table_inspect` export POSITION, NORMAL, TEXCOORD_0 only; the brief requires tangents, and the anchor and the shard have them. Enable tangent export (the mesh is UV-mapped, so it is one flag).
11. **A stray wedge on the outer ring.** `scroll_table_inspect_close_socket.jpg`, bottom left: a small grey triangular protrusion crosses the outer bronze ring (a buttress top or a divider end poking through the slab). Check for intersecting parts around the rim.
12. **All materials double-sided**; the slab is closed, set single-sided. `M_ScrollTable_Socket` shares every texture with `M_ScrollTable_Body`; merging them frees a material slot for a dedicated bronze material with its own roughness.

## Reference check

- Mood vs `2.webp` (gold-inlaid plaza medallion) and `1.webp` (segmented stone table): the structure matches `2.webp`, the surface matches neither yet (fixes 1, 2, 5, 6).
- Nothing copied from Arrival: confirmed.
- Isometric readability: good; the six wedges and the warm centre read at 30 m.
- Close inspection (9 m inspect distance, player standing on it): fixes 1–5 and 7 are visible from a standing player.
