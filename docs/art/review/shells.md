# Review: `shell_1..4.glb` (Shell exteriors I–IV)

| | |
|---|---|
| Branch / commit | `art/scroll-table-shard` @ `2786597` (manifest `6237aae`); renders `docs/art/qa/shell_<n>/final/`, stats `docs/art/qa/shell_<n>/build-stats.json` |
| Review round | 1 (07.11) |
| Reviewed material | per Shell: three-quarter, side, low, top, close flank / umbilicus / aperture (16 renders viewed); all four `.glb` inspected with gltf-transform; `art/shells/build_shells.py` |
| Verdict | **far** as a family — these are the most important silhouettes in the game and the only ones the owner's reference `2.webp` shows directly: bright iridescent nacre ammonites with deep rounded ribs. What landed is matte pale-grey faceted coils with paper-fan ribs; II and III have the right bones, I reads as an uncoiled hose instead of a tall spire, IV's "cracked" state is five rectangular blocks beside a zigzag cut |

## Scores (1–10)

| | Silhouette | Materials | Detail | Technical |
|---|---|---|---|---|
| Family | 5 | 3 | 4 | 6 |
| I | 3 | | | |
| II | 7 | | | |
| III | 6 | | | |
| IV | 4 | | | |

## Per Shell

| Shell | Size / tris / MB | Reads as | Main problem |
|---|---|---|---|
| `shell_1` (I) | 18.0 m, 21,456, 18.0 | a thin coiled tube that uncoils into a hose with a trumpet mouth on the ground | wrong archetype: reference `1.webp` shows "elongated" as a tall ribbed spire; the thin evolute coil has no mass at 50 m |
| `shell_2` (II) | 17.5 m, 17,568, 15.5 | an involute ribbed ammonite / nautilus | best of the four; ribs are flat fans, no nacre sheen, black spots |
| `shell_3` (III) | 17.0 m, 19,680, 16.9 | a tilted ram's-horn coil | works as the asymmetric one; the trochospiral side is a sheared flat disc |
| `shell_4` (IV) | 18.6 m, 19,120, 18.3 | II with a bite and five floating boxes | fragments are rectangular blocks; the broken edge is a paper-thin zigzag; from the unbroken side IV = II |

## What works

- Heights 17–18.6 m, pivot at the bottom centre, `socket_aperture` with radius and forward vector, convex `_col` hulls, two materials sharing one 4096 atlas, tangents, all under the 30k runtime budget, `nonmanifold_edges` 0.
- II and III have a believable involute coil, a real umbilicus and a visible wall thickness at the aperture (0.32 m). The 24-sided section gives the intended faceted hybrid look.
- The faint pink/green/blue tint idea is the right direction for nacre; it is only far too weak and baked in the wrong place (see fix 1).

## Fixes, ranked

1. **Nacre is missing.** All four are matte mid-grey (`COL_PEARL` 0.40 linear, roughness high); reference `2.webp` Shells are bright silver-white with pink/green/blue interference that shifts with the view. Add `KHR_materials_iridescence` to both materials (iridescence 1.0, IOR 1.3, thickness 150–400 nm driven by the growth-line texture), `KHR_materials_clearcoat` 0.6 with roughness 0.15 for the glossy nacre layer, raise the base to about 0.78–0.85 linear, and set roughness 0.25–0.35 on rib crests / 0.5 in grooves. Three.js `MeshPhysicalMaterial` supports both extensions. Keep the baked tints as a subtle low-frequency gradient along the spiral, not per rib (fix 11). The nacre interior (`M_Shell_Nacre`) should be the brightest, most iridescent surface, not the darkest.
2. **Shell I is the wrong shape.** Reference `1.webp` right side: "elongated and thin" is a tall conical spire (turret shell) standing upright, 6–7 whorls, apex up, strong spiral ribs with knobs, aperture at the bottom tilted 15–20 deg. Current I is a thin evolute coil whose last whorl uncoils into a straight hose ending in a trumpet mouth on the ground: at 50 m it has no mass and reads as a party horn. Rebuild I as the spire; it also gives the family its one vertical silhouette against three round ones.
3. **Shell IV's break is placeholder work.** `shell_4_close_aperture.jpg`, `shell_4_top.jpg`: five drifting fragments are rectangular blocks; the broken edge is a single-sided zigzag of flat plates. Make fragments real pieces of shell wall: curved, 0.3 m thick, ribs outside and nacre inside, 8–12 pieces 1–4 m across, 1–6 m from the break, rotated randomly, two still half-attached. Give the broken edge thickness (the wall is 0.32 m, show it), step the break along rib lines, and open the hole far enough to show 2–3 chamber septa inside (reference IV shows internal structure). Put the break through the venter (top) so it bites into the silhouette from every side; from the unbroken flank IV is currently indistinguishable from II.
4. **Ribs read as flat paper fans.** `shell_2_close_umbilicus.jpg`, `shell_2_close_flank.jpg`: each rib is a planar facet with hard creases radiating from the umbilicus; the flank looks folded from card. Reference ribs are rounded ridges (half-round section, 0.4–0.6 m wide, 0.2–0.3 m high) with a gentle forward S-curve across the flank. Keep the hybrid faceting in the 24-sided whorl section, not in the ribs; raise `rib_amp` only if the profile is rounded.
5. **Bake artefacts.** Black speckles over the whole flank of I and II (`shell_1_close_flank.jpg`, `shell_1_close_umbilicus.jpg`, `shell_2_close_flank.jpg`): missed rays on the densified master. Black polygons at the umbilicus core of I, II, III (the coil's innermost faces are open or flipped). Small black rectangular faces on the flank of II (`shell_2_low.jpg` near 5 m, `shell_2_three_quarter.jpg`) and IV (`shell_4_three_quarter.jpg`): flipped or missing faces. Fix the cage distance, cap the umbilicus with a small nacre plug, and run a face-orientation check before export; `nonmanifold_edges` 0 does not catch flipped faces.
6. **Nacre interior is a corrugated pipe.** `shell_2_close_aperture.jpg`: 12–16 visible concentric steps, uniform dark grey-purple. Smooth the interior (more segments or smooth shading inside only), add 2–3 septa a few metres in (the player looks into this mouth from the anchor zone), and let fix 1 make it the brightest surface.
7. **Tint bands read as paint stripes.** `shell_2_three_quarter.jpg`, `shell_4_three_quarter.jpg`: alternating pale / pink / green vertical bands per rib. Interference colour is view-dependent; if some is baked, make it a low-frequency gradient along the spiral (2–3 slow shifts per whorl) and let the iridescence extension do the rest.
8. **Shell III's flat side.** `shell_3_side.jpg`, `shell_3_close_umbilicus.jpg`: the trochospiral side is a sheared flat disc with a thin translucent-looking lip plate. Give the spire side a convex bulge (10–15% of the diameter) and thicken the flared lip to the wall thickness.
9. **File weight.** 4 x 4096 PNG normals of 12.5–12.8 MB = 68.7 MB for the four; `uv_fill` 0.55–0.74 and exterior texel density only 133–197 px/m (nacre 60–94 px/m). Pack to at least 0.8 fill; with that density a 2048 normal loses nothing visible at 20–50 m, which halves the file. Consider sharing one atlas across all four (same material, different UVs) once KTX2 lands.
10. **`M_Shell_Exterior` double-sided.** The wall is solidified, so the exterior can be single-sided; keep double-sided only on the nacre (visible through the aperture and IV's break).
11. **Hover and scale check in the scene.** The Shells hang 14–25 m above the anchor zones at r 50–54 m. At that distance the ribs must be at least 0.4 m wide to read; the current fine growth lines (fix 4) vanish and the Shells become smooth grey blobs. Render one test frame of all four from the game camera position (balcony at 46 m, pitch 40 deg) before the next pass.

## Reference check

- Mood vs `2.webp`: far on materials (fix 1), close on II/III silhouettes, far on I and IV (fixes 2, 3). The numbers currently read by shape only for III; I reads but as the wrong object; II and IV are twins from most angles.
- Nothing from Arrival: confirmed (seashells, not smooth lenses).
- Isometric readability: ribs and the break need to be 3–5x bolder to read at 50 m (fixes 3, 4, 11).
