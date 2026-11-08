# heroes: round 2 hero objects (stopped early on lead's wrap-up order)

## Status: nothing new shipped
- Shipped glbs, QA renders and `art/shells/build_shells.py` are unchanged (still round 1), so every shipped asset still matches its source.
- `anchor`, `scroll_table`, `shard`: not started. Every point in their review files is still open.

## Produced (WIP, not wired to any glb)
- `art/shells/build_shells_r2_wip.py`: new Shell generator (untracked, needs a `git add` if you want to keep it). Each Shell is built from one formula for the surface: the runtime mesh samples it at rib key points, and the master samples the same formula about 50x denser, plus growth-line displacement.
- What it does:
  - culls faces buried inside the next whorl;
  - gives the living chamber a real 0.32 m wall (rim plus nacre inner wall) ending in a septum;
  - IV: break through the venter, stepped along the ribs, with wall-thickness rims, 4 glowing septa and 10 solid curved fragments (2 half-attached);
  - I: rebuilt as a 6.5-whorl helical spire with an uncoiled hook. This follows review fix 2 and still keeps the concept's "uncoiled hook".
- Also written, not yet run:
  - glb patch for iridescence (thickness texture = ORM green), clearcoat and emissive strength;
  - single-sided exterior;
  - 8192 bakes downsampled to 4096 with dithering;
  - an inward-face check;
  - golden-hour QA lighting (style addendum: gold/nacre glow);
  - game-camera frame of all four Shells (camera-rig.js maths).

## Verified (server 2, geometry stage only)
- All four Shells build without errors.
- Runtime triangles, before bake (budget 30k): I 12,106 · II 10,232 · III 12,004 · IV 13,992.
- Faces culled as buried: 18–26%.
- Preview renders checked: I reads as a tall ribbed spire; IV's open chambers and septa read from the 3/4 view.

## Not verified / known issues
- The master bake, KTX2 compression and iridescence QA have not run, so no review point is fixed in a shipped file yet (before/after not available).
- IV fragments come out as thin, spiky slivers (the lobed outline mask is too aggressive). Use wider outlines.
- Ribs could use more sides: there is budget headroom of about 16k triangles.
- Server 1's GPU was full (out of memory); server 2 is free. Run with `-- all N`, then `/root/tools/compress-glb.sh`.
