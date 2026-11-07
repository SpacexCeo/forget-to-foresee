# Review: `agent_suit.glb` (Shell-entry suit)

| | |
|---|---|
| Branch / commit | `art/agent-costumes` @ `3169730` (docs `f72c114`); renders `docs/art/qa/agents/suit/`, stats `docs/art/qa/agents/build-stats.json` |
| Review round | 1 (07.11) |
| Reviewed material | front, back, three-quarter renders; `agent_suit.glb` inspected with gltf-transform |
| Verdict | **close** — the reading matches the owner's reference `3.webp` (light grey hard-shell suit, dark visor, backpack with a violet light bar); the surfaces are bare and the proportions are toy-like, so at inspect distance it reads as a plastic figure rather than an expedition suit |

## Scores (1–10)

| Silhouette | Materials | Detail | Technical |
|---|---|---|---|
| 7 | 5 | 5 | 8 |

## What works

- Colour and parts are right: light grey plates, dark soft joints at elbows, knees, waist and neck, a rounded helmet with a dark visor band, a back unit with one horizontal violet strip (`M_Suit_Light`, emissive 0.55/0.20/1.0 with `KHR_materials_emissive_strength`), utility belt with pouches, diagonal chest strap. Nothing from the film's orange hazmat look.
- Contract is the best of the set: `socket_backpack_light` with `strip_size_m` and the material name, `socket_head`, `socket_hand_r`, capsule `_col`, 8,120 tris, 3 materials, 3.3 MB, tangents.
- Height 1.80 m with helmet (1.75 body): consistent with the clan agents.

## Fixes, ranked

1. **No panel lines, no surface detail.** The normal map is 0.37 MB of near-nothing; every plate is a flat grey polygon. Reference `3.webp`: dense seams, segmented ribs on the limbs, small vents and fasteners. Add panel seams (1–2 mm grooves) along every plate edge, 3–4 segment lines on forearms and shins, a few bolts/vents on the chest plate and back unit, and a slight roughness variation (0.35–0.55) so the plates do not read as one flat material.
2. **Proportions read as a toy.** Spherical pauldrons the size of the helmet, thin stick arms, flat square boots. Make the pauldrons flatter and more forward-swept (ellipsoid 0.22 x 0.16 x 0.12 m), thicken forearms and shins by 20–30% (hard-shell over a soft suit), and give the boots a sole, a toe cap and an ankle ring.
3. **Helmet and visor.** The visor is a dark band on a sphere. Reference: a wrap-around visor that occupies the front third, with a defined rim; add the rim (5 mm proud), make the visor slightly reflective glass (roughness 0.1, metal 0, dark blue-grey base), and drop the helmet back 2 cm so the neck ring reads.
4. **Back unit is a flat box.** Give it depth (0.14 m), a top handle or valve, two cylindrical tanks or a ribbed heat panel beside the light strip, and let the straps actually run over the shoulders onto the chest plate (they stop at the shoulders now).
5. **Violet strip is the only readable mark at 20 m — make it work.** Keep it, but raise `emissive_strength` to 4–6 so it blooms in the dark interior, and add a second small violet indicator on the chest plate (left side) so the suit still reads as "the player in the Shell" from the front.
6. **JPEG normal** (same as the clan agents): export as PNG once fix 1 gives it content.
7. **Double-sided on a closed hard-shell**: set single-sided.

## Reference check

- Mood vs `3.webp`: palette and silhouette match; detail density is far below (fix 1, 2).
- Nothing from Arrival: confirmed.
- Isometric readability: a light grey figure on dark cracked stone reads; the violet strip is the only identity mark and must be bright enough (fix 5).
