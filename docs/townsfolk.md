# Townsfolk of the hill town (N-001)

Brief: `docs/art/townsfolk-shops-brief.md`. Branch `claude/townsfolk-v1`. This page is the working record of the
cast, the build pipeline and (later) the clips and the client behaviour.

## Status

| Step | State |
| --- | --- |
| 1. Cast sheet (designs for approval) | **v1 posted for review** (`docs/art/townsfolk/cast/`), waiting for the owner |
| 2. Characters on the shared rig, faces, hair, costumes | pipeline runs for all twelve; final hair (cards), bakes and budgets not done |
| 3. Clip set + contact sheet | not started |
| 4. Behaviour in the client on the town's `npc_*` points | not started |
| 5. QA per the brief | not started |

Nothing of this is in the game yet.

## Cast v1 (twelve people, our own designs)

| Key | Name | Role | Height | Read from the game camera by |
| --- | --- | --- | --- | --- |
| `exchange` | Maren Voss | Keeper of the Shard Exchange (S-001) | 1.74 | long slate coat over indigo, amber beads, loupe |
| `scribe` | Odo Fenn | Scribe of Signs (S-002) | 1.66 | ochre robe with bell sleeves, linen tabard, indigo skull cap, white beard |
| `innkeeper` | Bram Holloway | Innkeeper (S-003) | 1.88 | the broadest silhouette, long apron, terracotta vest, auburn beard |
| `baker` | Tilda Marsh | Baker and market seller | 1.58 | round, terracotta dress, cream apron, moss headscarf, bread basket |
| `sweeper` | Pip Rowan | Street sweeper and lamplighter | 1.83 | wide straw hat, lanky, sage tunic, broom |
| `guard` | Kessa Dorn | Guard at the lower gate | 1.90 | the tallest, quilted terracotta coat, round-sign tabard, kettle hat, spear |
| `elder` | Nan Aldery | Elder on the bench | 1.52 | small under a moss shawl, plum dress, kerchief, cane |
| `girl` | Wren | Child, about 8 | 1.24 | ochre dress, two braids, shell on a string |
| `boy` | Tam | Child, about 11 | 1.40 | indigo tunic, knee trousers, terracotta cap, toy top |
| `musician` | Liss Carrow | Street musician | 1.68 | moss felt hat with a feather, ring-lute on the back, plum trousers |
| `courier` | Jory Pell | Courier with a satchel | 1.63 | terracotta capelet, satchel and scroll tubes, cropped indigo trousers |
| `shrinekeeper` | Ilan Seré | Keeper of the round shrine | 1.79 | pearl-white robe, amber sash and stole (the only pale figure in the town) |

The brief lists thirteen roles for "10–12 people": the street sweeper and the lamplighter are one person (the clip
list has a sweep but no lamp-lighting clip).

World details: ring-sign brooches and belt rings (bronze), amber beads and pins, a shell on a string, the round sign on
the guard's tabard, the ring-lute (a round soundbox with an open ring). Palette: linen, undyed wool, leather, felt in
terracotta, ochre, moss, indigo and plum; pearl white is kept for the shrine keeper.

## Pipeline (`art/townsfolk/`)

| File | Role |
| --- | --- |
| `cast.py` | The cast as data: body macros, face details, heights, palette, costume recipe, posture and gait. |
| `tf_body.py` | MakeHuman body (MPFB 2.0.18, CC0, as for Iris) per entry, re-posed into the agent rest stance, the eye line scaled to 1.64 m, the agent armature on the body's own joints (same bone names as every agent), 23 face morphs, eyes. The real height is a scale on export. |
| `tf_costume.py` | Garment library on body landmarks: shells cut from the body, tubes on the support function of body sections (never inside the body), bands, lofted shoes and hats; removal of the body hidden under the costume. |
| `tf_wardrobe.py` | Recipes → garments, hats, hair shapes, beards, props. |
| `tf_shading.py` | Procedural skin, eyes and surfaces (the same functions will feed the texture bakes). |
| `qa_sheet.py`, `qa_compose.py`, `qa_lineup_bodies.py` | Turnaround renders (Cycles) and the composed sheets. |

Reuses, without changing them: `art/agents/iris_hero/` (body, rig layout, costume primitives, shading helpers),
`art/agents/agent_rig.py`, `agent_anim.py`.

## Known defects of cast v1 (design review only, not final models)

- Hair is sculpted placeholder shapes; the final hair is cards as on Iris. Beards are rough.
- About 40–52k triangles per person before reduction (budget 16k).
- Some cut edges are still ragged (V-necks, the shawl's top edge, the tabard's shoulders); the stole hangs stiff.
- Materials are live procedural shaders, not baked textures; no stitching, patches, embroidery or flour yet.
