# Elise v3: rebuilt from zero (plan, 12.11)

Owner: "build her a body, a pretty face, nothing dotted or gaudy, then dress her" and "do not trace, redo
everything from scratch with the mistakes in mind".

## What went wrong before (and the rule that follows)

| Mistake | Rule for v3 |
|---|---|
| The head was a generated shell: hair fused to the face, triangles, holes | Every part is modelled; nothing is taken from a generated mesh |
| The face was paint projected from a small crop (specks, smears) | The face is drawn from shapes; skin is one flat colour |
| A new head was fitted to the old one (wrong size, old paint showing) | Nothing is fitted to the old model; sizes come from the sheets and the skeleton |
| Arms collapsed in decimation; legs came through the gown | Budgets are met by construction (no blind decimation); the gown check gates the export |
| Parts were patched one at a time | One pipeline, run end to end by one script, each stage with a check image |

## Fixed inputs

- Design: `docs/art/elise/refs/01..09`.
- Skeleton: `art/agents/elise/v3/skeleton.json` (her 90 bones, unchanged, so her clips, cloth bake and the game
  code keep working).
- Base human: the CC0 MakeHuman base mesh and its shaping targets (quads, closed, painted weights).

## Stages (each ends with a sheet; the owner reviews at A, B and C)

| # | Stage | Result | Check |
|---|---|---|---|
| 1 | Body | Base mesh shaped (young woman, slim, long legs) and posed on her skeleton, feet in a 5 cm heel | one closed mesh, 0 open edges, height 1.74 m, left = right |
| 2 | Face | Same mesh (no neck seam): small chin and nose, eye sockets closed, face drawn from shapes (burgundy eyes, lashes, brows, mouth, blush) | front / three-quarter / side / close-up against sheet 02 |
| **A** | **Review** | **body + face sheet** | |
| 3 | Hair | Separate modelled parts as on sheet 03: cap, asymmetric fringe, two face locks, cobalt underside, braided bun, ahoge, butterfly, flower, earrings | five views against sheet 03; no part cuts the face |
| **B** | **Review** | **head with hair** | |
| 4 | Outfit | Gown (one quad grid: halter, open back, laced slit), stockings, pumps, wrist wraps, lacing, built over the new body | four views against sheets 01 and 04 |
| 5 | Weights | Body from the base mesh's painted weights; garments from the body; gown on the skirt bone grid; locks on the hair bones | bend test: elbows, shoulders, knees, seated |
| 6 | Paint | One drawn atlas, flat tones, 2048 and 1024 | no specks at 4x zoom |
| 7 | Export | Toon material, outline hull, face morphs, main and phone models inside the budgets of `HANDOFF.md` | triangle and byte counts |
| 8 | Motion | Cloth re-bake, leg-through-gown check on every clip | check passes |
| **C** | **Review** | **dressed sheet + 60 fps film from the real game (idle, walk, run, strike, cast)** | `npm test`, built-page smoke |

The shipped model stays in the game until the owner approves stage C.
