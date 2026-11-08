# fauna: report (stopped on the lead's wrap-up, before the first GPU job)

**No fauna glb is shipped.** No GPU job had started when the wrap-up came, and I started none after it. There are no glbs, no QA renders and no manifest row yet.

Produced (repo paths):
- `art/fauna/formation.py`: logogram formation and orbit maths (pure Python). **Ran:** it writes `game/public/assets/vfx/glyphmote_formation.json` (17 KB, 96-mote pool: ring 40, 4×9 strokes, 3 dots, 16 key ring). The geometry matches the prototype glyph `FORM_PATH`. A local 2D preview showed the arc/spike/loop/drop slots in the right clockwise order.
- `art/fauna/build_fauna.py`: Blender 4.5 builder for skyray, driftjelly, glyphmote (instancing mote + 96-bone skinned demo swarm), cloudwhale and moss_critter. It covers procedural geometry, armatures, baked clips (glide/bank/bank_r, pulse, orbit/assemble, swim, idle/hop/hide), numpy textures (weathered nacre, frayed/torn membranes, gold glow per the style addendum), raw glb export and GPU contact sheets. **Never run: expect first-run fixes.** The riskiest parts are the 4.5 slotted-action export (`export_animation_mode=ACTIONS`) and the critter's shell/hide pose.
- `art/fauna/post_fauna.mjs`: adds iridescence/transmission/volume/emissive-strength. `check` verifies tris, joints, loop error and the glTF validator. Not run.
- `art/fauna/run_all.sh`: chains build → post → compress-glb.sh → check → render. `art/fauna/.gitignore` ignores `out/`.
- `docs/art/fauna.md`: spawn zones, counts, motion parameters and event → response table, with a status line saying the glbs are not built yet.

Server 2 workspace `/root/w/fauna` is cloned but has no outputs. The push helper is in the scratchpad (`fpush.sh`).

Next: run `art/fauna/run_all.sh` on server 2, fix the first-run errors, review the contact sheets, then add the manifest rows.
