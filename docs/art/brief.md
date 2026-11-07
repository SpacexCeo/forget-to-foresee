# Forget to Foresee — Artist Brief (vertical slice)

English translation of the original Russian brief (same requirements, exact filenames retained). Clauses marked *(owner addition, Nov 7)* come from the owner's later English brief (`ART-BRIEF.md`) and refine the original without removing anything.

**Deadline:** models are needed **by Nov 11, evening (Kyiv)**. Nov 12 — QA. **Nov 13, 20:00 (Kyiv) — freeze.**
Until models arrive, the game uses greybox marked "not final art". As soon as a model is in the folder, the code picks it up.

## The world in brief
A compact diorama island. Six clan camps around the central Scroll. Four Shells float above the anchor zones. One Shell can be entered: inside there is fog, glass, and a Guest draws a circular logogram sign.
Inspiration: the calm scale and mystery of the film *Arrival* (2016). **Nothing from the film is copied:** not the shape of the ships, not the aliens, not their ink circles, not the interiors. The Shells are genuinely shells — spiral, growth ribs, nacre — not a smooth "egg".

## Palette and material
- Cold grey-green surfaces, charcoal masses, light fog, **warm amber** as the sign of human decision.
- Stylized PBR: forms read in isometric view and withstand close inspection. Photorealism is not needed; generic library assets without rework are not acceptable.
- Informational colours (Gift, Storm, trust) are drawn by code on top. **Do not bake them into textures.**

## Technical requirements (all models)
| Parameter | Value |
|---|---|
| Format | glTF 2.0 binary (`.glb`), one file per object |
| Axes and units | Y up, 1 unit = 1 metre, scale applied (Apply Scale) |
| Pivot | On the ground, at the centre of the object's base (floating Shells: pivot at the bottom of the Shell itself) |
| Materials | PBR metallic-roughness, ≤ 3 materials per object, textures embedded in the `.glb` |
| Textures | Hero and interior — up to 2048²; everything else — up to 1024²; PNG or JPEG (KTX2 is done in the build) |
| Normals | Correct, no inverted faces; export tangents |
| UV | No visible stretching, consistent texel density |
| Collision | Separate simplified mesh with the suffix `_col` inside the same `.glb` (convex boxes and simple forms) |
| Animations | Not needed (motion and holograms are done by code) |

**Triangle budget (runtime):**
| Object | Count | Triangles each |
|---|---|---|
| Island (terrain + shore) | 1 | up to 60,000 |
| Shell, exterior | 4 distinct | up to 15,000 |
| Shell interior | 1 | up to 80,000 |
| Clan camp (assembly) | 6 distinct | up to 12,000 |
| Hero: anchor, Scroll table, memory shard | 3 | up to 8,000 + a separate close-inspection LOD up to 30,000 (`_inspect`) |

The `_inspect` mesh is separate and does not replace the runtime mesh or its LODs.

## Slice object list
Filenames must be exactly these: the code looks them up by name. Folder: `game/public/assets/models/`.

### Hero objects (close inspection mandatory)
1. **`anchor.glb` — anchor.** A beacon the player places by a Shell; stake: 10 silk. *(Owner addition, Nov 7: the stake is a game resource, not a modelled part.)* Height about 1.6 m. On the body — sockets for the Shell number (I–IV) and the tick: the code draws the numbers, leave flat pads. Recognizable silhouette from the side and from above.
2. **`scroll_table.glb` — Scroll table.** Centre of the island. A round table or plinth about 3 m in diameter, with six sector sockets for message fragments (a ring of six parts) and a central recess for the "double ring" *(owner addition: the double ring itself is drawn by code)*. Each clan has its own sector.
3. **`shard.glb` — memory shard.** A crystallized memory, about 0.4 m. Looks fragile, with inner crack-threads. Translucent material; the glow is added by code.

### Shells
4–7. **`shell_1.glb` … `shell_4.glb`** — four exteriors, about 18 m tall. They hang above the ground (pivot at the bottom of the Shell itself). Shared language: spiral shells with growth ribs, but each has its own character: **I** — elongated and thin, **II** — massive, **III** — asymmetric, **IV** — with a fracture. The number is readable from afar by shape, not by lettering.

8. **`shell_interior.glb` — interior of one Shell.** Closed volume: floor, walls, high vault, openings and supports. About 20 × 12 m, vault height 10–14 m. In one end wall — a large bright "glass" plane about 12 × 7 m (the code draws the logogram on it). **Mandatory:** ceiling closed, no holes and no single-sided walls; stairs or a ramp to the entrance; `_col` for floor, walls and ceiling.

### Clan camps
9–14. **`camp_iris.glb`, `camp_sol.glb`, `camp_pepel.glb`, `camp_moh.glb`, `camp_yantar.glb`, `camp_iney.glb`** — compact authored compositions about 8 × 8 m: a tent or shelter, a place for the agent's hologram (a free circle about 2 m in the centre), 2–4 meaningful details. Characters:

| File | Clan | Character |
|---|---|---|
| `camp_iris.glb` | Iris (player) | Iris flower, violet tones, neatness, human scale |
| `camp_sol.glb` | Salt | White crystals, scales, trade, something hidden |
| `camp_pepel.glb` | Ash | Charcoal, burned wood, palisade: fear and protection |
| `camp_moh.glb` | Moss | Living, soft, open, a common pot |
| `camp_yantar.glb` | Amber | Warm, chests, scales and locks: everything has a price |
| `camp_iney.glb` | Frost | Cold glass, instruments, tables of signs |

### Island
15. **`island.glb`** — one terrain about 70 × 70 m: a central platform for the Scroll table, six camp platforms in a circle (radius about 13 m), four anchor zones under the Shells (radius about 25 m, on the diagonals), paths between them. The shore runs into water or fog. Walking between neighbouring points takes 30–45 seconds.

> *(Owner addition, Nov 7)* Check before blockout: at these radii, 30–45 s between neighbours implies a slow gait or winding paths. Measure with the game's actual walk speed and report the result to the owner; do not silently change dimensions or the timing target.

## Workflow (from the spec)
brief → blockout and scale check → master model → retopo and bake → materials → `.glb` export → in-game check → approval.

Do **one hero object completely** first (proposed: `anchor.glb`): it measures the real pace so the scope can be adjusted if not everything fits. *(Owner addition, Nov 7: a reference image may be used as input before blockout if the owner prefers; the pipeline stays the same.)*

## How to deliver
1. Put the `.glb` into `game/public/assets/models/` (or send the file and the owner places it).
2. Add a row to `docs/art/manifest.md`: file, author, source (own / purchased + license), triangles, texture size.
3. The code picks up the model instead of the greybox *(owner addition: verify the loader actually does this; do not claim it is tested until it is)*. Close inspection is reviewed together with the owner.
