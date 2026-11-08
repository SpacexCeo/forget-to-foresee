# guests: final report

**Guest rebuilt with a rig and 3 clips. The Shell interior is NOT reworked (I was told to stop).**

Files (sources are in art/guest/ and art/shell_interior/):
- art/guest/build_guest.py: full rewrite, procedural, `-- build | render | all`.
- game/public/assets/models/guest.glb: 5.57 MB, KTX2 (ETC1S/UASTC) + meshopt, 3 clips. Compression steps: `gltf-transform resample` -> ETC1S emissive -> /root/tools/compress-glb.sh. The script is in scratchpad g/compress_guest.sh.
- docs/art/qa/guest/build-stats.json and final/: front, three_quarter, back_three_quarter, guest_anim_contact_sheet (12 frames of idle/draw/react). I deleted the WIP renders.

Measured:
- Triangles: 12,271 (body 10,865, membranes 1,392, core 14), under the 16k budget.
- 3 materials: Nacre with iridescence, transmission 0.25, volume, ior 1.53; Membrane BLEND with iridescence; Core with emissive strength 8.
- Rig: 92 joints. Every vertex is weighted, at most 4 influences.
- Clips: idle 8 s loop, draw 4 s loop (IK baked, circle r 0.86 m), react 1.8 s one-shot that starts and ends at rest.
- Sockets: socket_draw_tip (child of the tip joint), socket_core, socket_head.
- Height 6.9 m. It hovers (no legs, no Arrival look).

WIP review:
- The old guest was 37.6k tris with no rig, and its 8 standing legs read as a heptapod.
- The interior is solid engineering, but its glass is at z -10.75 and spawn at +11.3. Gameplay needs SHELL_ENTRANCE z +4.5 and SHELL_GLASS z -4.5.
- The interior also needs a glass frame that does not look like a TV bezel, warmer nacre, gold floor seams and a stronger spiral.

Not done:
- shell_interior.glb is unchanged: the coordinate mismatch above, no socket_entrance / socket_glass, not re-QA'd.
- `guest` is not in asset-catalog.js.
- The core glows as a bright oval through the chest. It needs a lower emissive or less transmission.
- QA renders use the raw glb because the Blender importer has no meshopt support.

Manifest row: | guest.glb | Guest (rigged: idle/draw/react) | 12,271 | — | 3 | KTX2+meshopt 5.6 MB | art/guest/build_guest.py | first pass |
