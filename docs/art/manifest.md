# Asset manifest

Status: `greybox` (code placeholder) → `wip` → `review` → `approved`. Only `approved` counts as final art.

| File | Object | Author | Source / license | Triangles | Textures | Status |
|---|---|---|---|---|---|---|
| anchor.glb | Anchor (hero) | Claude Code (procedural, `art/anchor/build_anchor.py`, v3) | own, MIT; built with Blender 4.5.3 | runtime 12,340 · `_inspect` 49,936 · `_col` 148 (6 hulls) | KTX2: base colour + ORM 4096² ETC1S, runtime normal 2048² UASTC, `_inspect` normal 4096² UASTC; meshopt; file 19.8 MB | review |
| scroll_table.glb | Scroll table (hero) | Claude Code (procedural, `art/scroll_table/build_scroll_table.py`) | own, MIT | runtime 13,772; `_inspect` 54,874; `_col` 184 (2 convex prisms) | 4096² basecolor JPEG, 4096² ORM JPEG, 2× 4096² normal PNG (runtime + _inspect); 3 materials per mesh; .glb 46.0 MB | review |
| shard.glb | Memory shard (hero) | Claude Code (procedural, `art/shard/build_shard.py`) | own, MIT | runtime 7,048; `_inspect` 30,853; `_col` 56 (1 convex hull) | 2048² basecolor JPEG, 2048² ORM JPEG, 2× 2048² normal PNG (runtime + _inspect); crystal uses KHR_materials_transmission + volume; 3 materials per mesh; .glb 8.7 MB | review |
| shell_1.glb | Shell exterior I, elongated (uncoiled hook) | Claude Code (procedural, `art/shells/build_shells.py`) | own, MIT | runtime 21,456; `_col` 148 (2 convex hulls) | 4096² basecolor JPEG, 4096² ORM JPEG, 1× 4096² normal PNG; 2 materials (exterior, nacre); .glb 18.0 MB | review |
| shell_2.glb | Shell exterior II, massive | Claude Code (procedural, `art/shells/build_shells.py`) | own, MIT | runtime 17,568; `_col` 130 (1 convex hull) | 4096² basecolor JPEG, 4096² ORM JPEG, 1× 4096² normal PNG; 2 materials (exterior, nacre); .glb 15.5 MB | review |
| shell_3.glb | Shell exterior III, asymmetric | Claude Code (procedural, `art/shells/build_shells.py`) | own, MIT | runtime 19,680; `_col` 120 (1 convex hull) | 4096² basecolor JPEG, 4096² ORM JPEG, 1× 4096² normal PNG; 2 materials (exterior, nacre); .glb 16.9 MB | review |
| shell_4.glb | Shell exterior IV, cracked open | Claude Code (procedural, `art/shells/build_shells.py`) | own, MIT | runtime 19,120; `_col` 136 (1 convex hull) | 4096² basecolor JPEG, 4096² ORM JPEG, 1× 4096² normal PNG; 2 materials (exterior, nacre); .glb 18.3 MB | review |
| shell_interior.glb | Shell interior | — | — | — | — | greybox |
| camp_*.glb (6) | Clan camps: Iris violet canopy, Salt crystal colonnade, Ash dark pagoda + palisade, Moss overgrown arbour + cauldron, Amber wooden pavilion + chests, Frost glass pavilion | Claude Code (procedural, `art/camps/build_camps.py`, shared `art/common/ftf.py`) | own, MIT; Blender 4.5.3, GPU bake on RTX 5090 | ~9-12k runtime each (budget 24k) + `_col` | KTX2: basecolor/ORM ETC1S 4096², normal UASTC 2048²; meshopt; glb 6.5-7.7 MB | **exported, owner review pending**; QA in `docs/art/qa/camp_*/` |
| island.glb | Island | — | — | — | — | greybox |
| agent_iris.glb | Iris clan agent (player): hooded wool cloak, violet scarf | Claude Code (procedural, `art/agents/`) | own, MIT | 12,164 (`_col` 144) | 3 mats sharing 2048² base/ORM/normal; glb 4.52 MB | review |
| agent_sol.glb | Salt clan agent: quartz shoulder scales, hood and veil, balance | Claude Code (procedural, `art/agents/`) | own, MIT | 12,172 (`_col` 144) | 3 mats sharing 2048² base/ORM/normal; glb 5.47 MB | review |
| agent_pepel.glb | Ash clan agent: palisade collar, stake shield | Claude Code (procedural, `art/agents/`) | own, MIT | 9,666 (`_col` 144) | 3 mats sharing 2048² base/ORM/normal; glb 5.06 MB | review |
| agent_moh.glb | Moss clan agent: soft layered cloak with growth, cauldron | Claude Code (procedural, `art/agents/`) | own, MIT | 11,098 (`_col` 144) | 3 mats sharing 2048² base/ORM/normal; glb 5.18 MB | review |
| agent_yantar.glb | Amber clan agent: strong-box, padlocks, keys, flat hat | Claude Code (procedural, `art/agents/`) | own, MIT | 9,698 (`_col` 144) | 3 mats sharing 2048² base/ORM/normal; glb 5.38 MB | review |
| agent_iney.glb | Frost clan agent: pointed hood, icicle mantle, armillary staff, sign tablet | Claude Code (procedural, `art/agents/`) | own, MIT | 10,982 (`_col` 144) | 3 mats sharing 2048² base/ORM/normal; glb 5.29 MB | review |
| agent_suit.glb | Shell suit (any clan): armour, helmet, backpack with emissive strip `M_Suit_Light` | Claude Code (procedural, `art/agents/`) | own, MIT | 8,120 (`_col` 144) | 3 mats sharing 2048² base/ORM/normal; glb 3.28 MB | review |
| (code) | Agent holograms, logograms, VFX | Claude Code | own, MIT | — | — | in progress |
| assets/audio/*.ogg (60) | Ambience, adaptive music stems, Guest voice, UI, footsteps, SFX, stingers | Claude Code (procedural synthesis, `art/audio/build_audio.py` + `synth.py`, numpy/scipy, Opus via ffmpeg/libopus) | own, MIT; no samples, no third-party audio | — | 5.77 MB Ogg Opus 48 kHz | review |
