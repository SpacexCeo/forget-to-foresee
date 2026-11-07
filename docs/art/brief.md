# Forget to Foresee — artist brief (vertical slice)

Deadline: models are needed **by the evening of 11.11** (Kyiv). 12.11 is QA, 13.11 20:00 is code freeze.
Until a model arrives, the game shows a greybox labeled "not final art". As soon as a model is in the folder, the code picks it up.

## The world in short
A compact diorama island. Six clan camps around the central Scroll. Four Shells float above the anchor zones. You can walk inside one Shell: fog, glass, and a Guest drawing a round sign (a logogram).
Inspired by the calm scale and mystery of *Arrival* (2016). **We copy nothing from the film:** not the ship shapes, the aliens, their ink circles or the interiors. Our Shells are literally seashells: a spiral, growth ridges, mother-of-pearl — not a smooth "egg".

## Palette and materials
- Cold grey-green surfaces, charcoal masses, light fog, **warm amber** as the mark of a human decision.
- Stylized PBR: shapes read in isometric view and hold up to close inspection. No photorealism; library assets without rework are not acceptable.
- Information colors (Gift, Storm, trust) are drawn by code on top. Do not bake them into textures.

## Technical requirements (all models)
| Parameter | Value |
|---|---|
| Format | binary glTF 2.0 (`.glb`), one file per object |
| Axes and units | Y up, 1 unit = 1 meter, scale applied |
| Pivot | on the ground, at the center of the base |
| Materials | PBR metallic-roughness, ≤3 materials per object, textures embedded in the `.glb` |
| Textures | hero and interior up to 2048², everything else up to 1024², PNG or JPEG (KTX2 is done at build time) |
| Normals | correct, no flipped faces; export tangents |
| UV | no visible stretching, consistent texel density |
| Collision | a separate simplified mesh with the suffix `_col` inside the same `.glb` (convex boxes and simple shapes) |
| Animation | not needed (motion and holograms are done in code) |

**Triangle budget (runtime):**
| Object | Count | Triangles each |
|---|---|---|
| Island (terrain + shore) | 1 | up to 60,000 |
| Shell exterior | 4 different | up to 15,000 |
| Shell interior | 1 | up to 80,000 |
| Clan camp (set) | 6 different | up to 12,000 |
| Hero: anchor, Scroll table, memory shard | 3 | up to 8,000 + a separate close-inspection LOD up to 30,000 (`_inspect`) |

## Slice object list
File names must match exactly: the code looks them up by name. Folder: `game/public/assets/models/`.

### Hero objects (close inspection required)
1. **`anchor.glb` — anchor.** A beacon the player places by a Shell as a 10-silk stake. About 1.6 m tall. Flat plates on the body for the Shell number (I–IV) and the tick: the digits are drawn by code. A recognizable silhouette from the side and from above.
2. **`scroll_table.glb` — Scroll table.** The center of the island. A round table or plinth about 3 m across with six sector sockets for message fragments (a ring of six parts) and a central recess for the "double ring". One sector per clan.
3. **`shard.glb` — memory shard.** A crystallized memory, about 0.4 m. Looks fragile, with thread-like inner cracks. Translucent material; the glow is added by code.

### Shells
4–7. **`shell_1.glb` … `shell_4.glb`** — four exteriors, about 18 m tall, floating above the ground (pivot at the bottom of the Shell). Shared language — spiral seashells with growth ridges, each with its own character: I — elongated and thin, II — massive, III — asymmetric, IV — cracked open. The number reads from afar by shape, not by a label.
8. **`shell_interior.glb` — the interior of one Shell.** A closed volume: floor, walls, a high vault, openings and supports. About 20×12 m, vault 10–14 m high. One end wall holds a large bright "glass" surface about 12×7 m (the code draws the logogram on it). **Required:** the ceiling is closed, no holes or single-sided walls; stairs or a ramp to the entrance; `_col` for floor, walls and ceiling.

### Clan camps
9–14. **`camp_iris.glb`, `camp_sol.glb`, `camp_pepel.glb`, `camp_moh.glb`, `camp_yantar.glb`, `camp_iney.glb`** — compact authored compositions about 8×8 m: a tent or shelter, a spot for the agent's hologram (a free circle about 2 m in the middle), 2–4 meaningful details. Characters:
   - **Iris** (the player) — iris flower, violet tones, neatness, human scale.
   - **Salt** — white crystals, scales, trade, something hidden.
   - **Ash** — charcoal, burnt wood, a palisade: fear and defense.
   - **Moss** — alive, soft, open, a shared cauldron.
   - **Amber** — warm, chests, scales and locks: everything has a price.
   - **Frost** — cold glass, instruments, tables of signs.

### Island
15. **`island.glb`** — one terrain about 70×70 m: a central plaza for the Scroll table, six camp plots in a ring (radius about 13 m), four anchor zones under the Shells (radius about 25 m, on the diagonals), paths between them. The shore fades into water or fog. A walk between neighboring points takes 30–45 seconds.

## Workflow (from the spec)
brief → blockout and scale check → master model → retopo and bake → materials → `.glb` export → in-game check → approval.
Do **one hero object completely** first (I suggest `anchor.glb`): it measures the real pace so we can adjust the scope if everything does not fit.

## How to deliver
1. Put the `.glb` into `game/public/assets/models/` (or send the file and I will place it).
2. Add a row to `docs/art/manifest.md`: file, author, source (own / purchased + license), triangles, texture sizes.
3. The code swaps the greybox for the model. We check close inspection together.

## Clan agent costumes (owner addition 07.11)
The six clan agents (and a Shell suit) are shown in game as holograms: code renders these meshes through the hologram shader and the player's constructor recipe, so readable silhouettes and clean topology come first; colour may be overridden by code.
- Files in `game/public/assets/models/`: `agent_iris.glb`, `agent_sol.glb` (Salt), `agent_pepel.glb` (Ash), `agent_moh.glb` (Moss), `agent_yantar.glb` (Amber), `agent_iney.glb` (Frost), plus `agent_suit.glb` (the protective suit worn inside a Shell).
- One shared parametric humanoid base: 1.75 m, relaxed stance (arms 14° from vertical; the meshes are never skinned in game), Y-up metres, origin on the ground between the feet, front +Z. Quad-based body from a skeleton (loops at the joints), separate head.
- Budget per agent: ≤24,000 runtime triangles, ≤3 materials, textures up to 2048², tangents exported, no animation, a capsule-like convex `_col`.
- Material slots by name: `M_<Clan>_Body` (under-layer, head, hair, visor), `M_<Clan>_Garment` (clothing and armour), `M_<Clan>_Ornament` (props). The suit replaces the ornament slot with `M_Suit_Light`, the emissive status strip, so code can recolour it per clan.
- Sockets (empties): `socket_head` (head centre; `head_top_m` in extras), `socket_hand_r` (right palm grip point; arm direction and palm normal in extras); the suit also has `socket_backpack_light`.
- Costume language (hybrid direction: bold faceted shapes from the isometric camera, detailed baked PBR close up):
  - **Iris**: owner concept: long charcoal hooded wool cloak with a frayed hem and shoulder cape, long violet scarf wrapped over the shoulders and hanging down the back, dark layers, leather bracers and boots, dark shoulder-length hair, a small iris pin.
  - **Salt**: tiered pale robe with scalloped "scale" hems, deep hood and veil (something hidden), white quartz clusters on the shoulders, brass balance, sealed satchel, salt pouches.
  - **Ash**: soot-black ragged layers, a palisade collar of charred stakes, a stake shield on the forearm, wrapped arms, masked face.
  - **Moss**: soft two-layer green cloak with a lumpy hem, moss, mushrooms and leaves on the shoulders, hood down, a cauldron in hand and a ladle.
  - **Amber**: warm merchant coat with a high collar, flat-brimmed hat, a strong-box chest on the back, padlocks on the belt, a ring of keys, amber gems.
  - **Frost**: tall pointed hood, icicle-hem mantle, pleated robe, armillary staff with glass rings, a lens arm, a slate tablet of 4-slot signs, glass vials.
- Source and QA: `art/agents/build_agents.py` (+ `agent_geometry.py`, `agent_costumes.py`); renders in `docs/art/qa/agents/<clan>/` and the lineups `docs/art/qa/agents/lineup_*.jpg`; measured values in `docs/art/qa/agents/build-stats.json`.