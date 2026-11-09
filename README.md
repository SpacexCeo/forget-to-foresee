# Art sources (not on main)

Binary art sources that the build scripts on the main branches produce or consume but that are too large
for main. Stored with Git LFS on this orphan branch so a normal clone of main stays light.

Restore: `git clone -b art-sources <repo> art-sources && cd art-sources && git lfs pull`, then
`sha256sum -c SHA256SUMS`. `.blend` files are saved compressed (Blender opens them directly).

| Folder | What | Goes to (on a working clone) |
|---|---|---|
| `shells/` | the four memory-shell scenes `shell_N_r2.blend` + textures (built by `art/shells/build_shells.py`) | `art/shells/` |
| `agents_raw/` | raw agent exports before KTX2/meshopt compression | `art/agents/_raw/` |
| `agents_textures/` | agent texture bakes | `art/agents/textures/` |
| `guest/` | `guest_raw.glb` + textures | `art/guest/` |
| `iris_hero_coat/` | Iris hero, coat version (deployed 09.11 morning): body, costume, hero blends, raw glb, bakes | `art/agents/_raw/iris_hero/` |
| `iris_hero_athletic/` | Iris hero, athletic sportswear version: body and costume stage blends | `art/agents/_raw/iris_hero/` |

Everything here can also be rebuilt from the scripts on `claude/iris-hero` and `main`
(Blender 4.5.3 + MPFB 2.0.18; see `art/agents/iris_hero/README.md`).
| `shells_raw_glb/` | the four shells' raw glb exports (before KTX2/meshopt), from `/root/w/` | input of `tools/compress-glb.sh` |
| `media_v2/` | final 1080p videos from `/root/ftf-media-v2/` (demo, trailer, three clips; with and without burned captions) | release media |

## iris_hero_anatomy (09.11.2026, GPU server order 2422935, before it was released)

Iris on the anatomical body (`main` at `cf6d182`, `art/agents/iris_hero/hero_anatomy.py`): the full build
(`iris_hero.blend`, `iris_costume.blend`, the raw `agent_iris.glb` and its baked textures, CPU bake), the body
stage (`iris_body.blend`, `iris_body_pre.blend` before the anatomical pass, `iris_body_shape.blend` with the
editable shape key BODY_FEM_TARGET), the shipped compressed glb (`agent_iris_compressed.glb`), the bare-body
deformation test renders (`deform.tgz`), and the server set-up scripts of that session (`setup.sh`,
`setup2.sh`: system libraries, Blender 4.5.3, Node; no secrets). Checksums in `iris_hero_anatomy/SHA256SUMS`.
