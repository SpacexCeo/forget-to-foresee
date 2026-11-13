# Tripo batch 1: ten models for the Glass Shoal, the lab and the video

The owner generates these in Tripo (13 Nov). Order = priority: the ride and the boss are seen in every trailer shot, so
they come first. After each model: rig it (Tripo auto-rig for the creatures, none for props), export GLB, put the file
on the GPU art board under `refs/tripo/<id>/`, and the models seat imports it (weld, decimate to the budget, KTX2 +
meshopt, a `_m` lite version, a collider for props).

Shared style for every prompt: stylised semi-realistic, hand-painted PBR, warm low-sun palette (amber, pearl, slate,
teal accents), clean silhouettes readable from 20 m, no text, no logos, symmetric T-pose or A-pose for creatures,
neutral grey background, single object centred.

| # | Id | What | Budget | Rig / clips needed later |
|---|---|---|---|---|
| 1 | `dragon_pearl_mount` | the great pearl dragon we fly on | 40k tris | auto-rig quadruped + wings: glide, flap, bank L/R, land, take-off; saddle socket |
| 2 | `boss_hollow_tide` | the Hollow Tide, the arena boss | 50k tris | auto-rig serpent: rise, slam, lunge, sweep, roar, hit, death |
| 3 | `weapon_loomblade` | Iris's sword | 3k tris | none (held in the right hand) |
| 4 | `shoal_spire_set` | the crystal spires on the horizon | 2k tris each | none |
| 5 | `shoal_monolith_set` | broken monoliths standing in the mirror | 3k tris each | none |
| 6 | `cliff_stone` | the cliff stone where the dragon lands | 4k tris | none |
| 7 | `lab_baker` | the prologue device "baking nanoparticles" | 15k tris | none (a separate spinning ring part if possible) |
| 8 | `teleport_gate` | the ending teleport with the chip slot | 15k tris | none (ring as a separate part) |
| 9 | `last_chip` | the last chip Iris inserts into the teleport | 1k tris | none |
| 10 | `dragon_saddle` | saddle and harness for the mount | 4k tris | none (parented to the mount's back bone) |

## Prompts

**1. dragon_pearl_mount**
> A majestic slender dragon mount, long graceful neck, narrow elegant head with swept-back horn crest, pearl-white
> iridescent scales shifting to soft pink and teal at the edges, large bat-like wings with translucent pearl membranes
> and fine golden veins, long tail ending in a fin, strong forelegs, a flat area on the shoulders for a rider. Calm,
> noble, not scary. Wings fully spread, symmetric pose, side and top readable. Stylised semi-realistic, hand-painted PBR.

Reference look: a sleek wyvern/eastern-western hybrid; think "pearl and mother-of-pearl", not "lizard". The wings must
read from below and from behind (the camera follows behind and above).

**2. boss_hollow_tide**
> A colossal sea serpent made of dark wet stone and pale glass crystal, segmented body like stacked stone plates, a
> crown-shaped crest of tall clear crystals on its head, hollow glowing core visible through cracks in its chest (cyan
> light), wide jaw with crystal teeth, small fins along the spine. Ancient, heavy, majestic. Body coiled, head raised,
> symmetric. Stylised semi-realistic, hand-painted PBR.

**3. weapon_loomblade**
> A slim elegant one-handed sword woven from glowing golden threads, the blade looks like tightly woven luminous fibres
> with a sharp edge, a ring-shaped guard like a small loom gate, wrapped dark leather grip, a pearl pommel. Fantasy,
> refined, light. Laid flat, full length visible.

**4. shoal_spire_set** (three spires in one scene, different heights)
> Three tall thin crystal spires, each a single narrow tapered blade shape rising to a sharp point, slightly flattened
> like a leaf blade, pale frosted glass with faint vertical striations, base slightly wider. Heights 1 : 0.75 : 0.5.

Keep exactly this shape (owner 13 Nov): one narrow tapered blade per spire, like the current arena spires, no
branches, no clusters.

**5. shoal_monolith_set** (three pieces)
> Three broken ancient stone monoliths, tall rectangular slabs leaning slightly, weathered slate stone with eroded
> edges and faint carved lines, one snapped in half with the top lying beside it. Wet look at the base.

**6. cliff_stone**
> A flat-topped large stone outcrop on a cliff edge, the top is a smooth platform big enough for a dragon to land,
> carved circular runes around its rim, moss in the cracks, weathered warm grey stone.

**7. lab_baker**
> A futuristic laboratory device on a metal desk: a glass dome chamber filled with tiny glowing particles, a brass and
> white ceramic ring around it, cables running to a small control panel with a red button, clean sci-fi with a warm
> handmade touch.

**8. teleport_gate**
> A large circular teleport gate on a round stone pedestal, the ring made of polished brass with engraved patterns and
> small crystal nodes, an empty slot at the base of the ring shaped for a small chip, steps leading up to it.

**9. last_chip**
> A small rectangular glowing data chip, dark glass body with golden circuit lines and a pearl core, slightly rounded
> corners, sci-fi artefact, close-up hero prop.

**10. dragon_saddle**
> A riding saddle and harness for a large dragon, dark leather with brass fittings, straps going around the chest,
> two small handles at the front, a short pearl-white blanket under it. Laid on a neutral form.

## After generation
- Send the GLB (or the Tripo share link) per id; the models seat checks the triangle count and the scale (metres:
  mount ~14 m wingspan, boss ~30 m long, spires 12–30 m, monoliths 5–8 m, gate 4 m, sword 1.1 m, chip 0.06 m).
- Animations: Tripo auto-rig gives the skeleton; the clips (glide, flap, slam…) are made by the models seat.
