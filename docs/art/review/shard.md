# Review: `shard.glb` (Memory shard, hero)

| | |
|---|---|
| Branch / commit | `art/scroll-table-shard` @ `a23d346`; renders `docs/art/qa/shard/final/`, stats `docs/art/qa/shard/build-stats.json` |
| Review round | 1 (07.11) |
| Reviewed material | 11 QA renders (front, side, top, three-quarter, 3 close-ups runtime + 3 inspect, collision), `shard.glb` inspected with gltf-transform, `art/shard/build_shard.py` |
| Verdict | **close on paper, far in the renders** — the design (leaning six-sided crystal, broken tip, two splinters, bronze clasp, inner filaments) matches the brief, but the surface has a regular ripple artefact on every facet, the glass goes black from above, and the "cracks" read as dry grass stalks. It currently looks like a trophy with roots in it |

## Scores (1–10)

| Silhouette | Materials | Detail | Technical |
|---|---|---|---|
| 6 | 4 | 6 | 7 |

## What works

- Scale 0.398 m, pivot at the base centre, `socket_core` at the crystal centre for the code-driven glow.
- Runtime 7,048 tris (budget 16k), `_inspect` 30,853 (60k), one convex `_col` hull, tangents, texel density 4072 px/m with CV 0.03 at 2048. File 8.7 MB.
- Three runtime materials (`M_Shard_Crystal`, `M_Shard_Bronze`, `M_Shard_Veins`); glass is single-sided; transmission + volume are proper glTF extensions.
- The bronze clasp base itself is well made: bevelled rings, subtle pitting, a convincing aged-metal roughness (`shard_close_base.jpg`).
- The broken slanted tip and the chipped shoulder give the crystal character from the side (`shard_side.jpg`).

## Fixes, ranked

1. **Regular horizontal ripple ("corduroy") on every facet.** `shard_close_tip.jpg`, the right edge of `shard_close_veins.jpg`, `shard_side.jpg`, the splinter tip in `shard_three_quarter.jpg`: evenly spaced horizontal bands about 2 mm apart over the whole crystal. It is far too regular for the `facet_wave` CLOUDS displacement (scale 0.02, strength 0.00012): with strength 0.12 mm on a 4.5 M-triangle master and a near-flat normal, this is 8-bit terracing of the baked normal (plus the 0.5 mm densify grid). Fix: drop `facet_wave` or raise it to a real growth striation (anisotropic along the crystal axis, amplitude at least 0.3 mm, irregular spacing 1–6 mm), bake normals at 16 bit and dither when writing the 8-bit PNG. Check on a flat-lit render that no banding remains before anything else; it is the first thing anyone sees at inspect distance (3 m).
2. **Veins read as roots / dry grass, not as cracks.** `shard_close_veins.jpg`, `shard_inspect_close_veins.jpg`, `shard_close_base.jpg`: opaque ivory 3-sided tubes with 3.8 mm base radius (about 10% of the crystal's width), root-like branching, warm beige colour. The brief asks for thread-like inner cracks in a fragile crystal. Replace most of the tubes with planar fracture flakes: 20–40 thin triangles/quads 0.5–1.5 cm wide lying on 2–3 fracture planes, near-white material with low roughness (0.1–0.2) and 40–60% alpha so they catch light like internal fractures, plus a handful of hair-thin threads (radius at most 0.6 mm) between them. Keep the colour cold (white/pale cyan): the warm amber note is the code-driven glow, not the veins.
3. **Glass goes black from above and on the long facets.** `shard_top.jpg`: the crystal looks like dark green marble; `shard_front.jpg`: the upper left facet is black. `attenuationDistance` 0.14 m with `thicknessFactor` 0.06 means any view ray crossing more than about 10 cm is extinguished; from the isometric camera the ray crosses the 40 cm length. Set `attenuationDistance` 0.6–0.9 m, lighten `attenuationColor` towards (0.80, 0.90, 0.88), reduce `thicknessFactor` to 0.03, and consider a milky frost instead of clear glass (transmission 0.7–0.85, roughness 0.15–0.25): a frosted crystal reads as a solid object at 20 m, clear glass just shows the ground.
4. **Intersections and a black pit at the clasp.** `shard_close_base.jpg`: the left splinter cuts through the clasp cup and a sliver pokes out through the rim; the right splinter leaves a black triangular gap in the rim; inside the cup is a black pit with visible fan triangulation. Sink the splinters so they start inside the cup, fill the cup with a "resin" floor 1 cm below the rim (bronze or dark glass), bevel the inner rim.
5. **Clasp claws are flat 2 mm ribbons.** Only two are visible from the front and they look like bent strips of card. Give them a triangular section (6 mm base, 2 mm tip), a hooked end that bends over the crystal shoulder so the clasp actually holds the crystal, and rotate the set so one claw faces the front (+Z).
6. **Composition is a trophy.** Three stepped bronze rings take 40% of the top view and the crystal stands bolt upright on them. Reduce the base to about 60% of its diameter with two steps, or tilt the crystal 8–10 deg so the object reads as a found, bound relic rather than an award.
7. **Veins eat 70% of the runtime budget.** Body 1,990 tris, veins 5,058 tris in the runtime mesh, invisible beyond 3 m. Keep at most 12 lines (or the fracture flakes of fix 2, about 300 tris) in the runtime mesh and the full set in `_inspect`.
8. **`M_Shard_Bronze` is double-sided**; the clasp is closed, make it single-sided.
9. **Transmission in the client.** Three.js maps `KHR_materials_transmission` to `MeshPhysicalMaterial.transmission`, which triggers the transmission render pass (an extra framebuffer per frame). Acceptable for one hero object, but confirm in `game/review.html` that it renders (the current loader does nothing special for it) and that the glow planned by code still shows through; if not, a `BLEND` fallback with alpha 0.6 is the safe option.

## Reference check

- Mood vs `1.webp` (Salt's white quartz) and `3.webp` (nacre): the shard should be the one small, precious, cold-white crystal of the set. Clear grey glass with beige roots is off-mood; a milky nacre-frost crystal with bright internal fractures would match.
- Nothing copied from Arrival: confirmed.
- Isometric readability: a 0.4 m object is a spike at 20 m; the frost (fix 3) and the glow by code carry it. Fine.
- Close inspection: fixes 1–4 all show at 1–3 m.
