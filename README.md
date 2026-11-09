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
