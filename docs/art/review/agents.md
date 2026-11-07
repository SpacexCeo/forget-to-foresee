# Review: `agent_<clan>.glb` (six clan agent costumes)

| | |
|---|---|
| Branch / commit | `art/agent-costumes` @ `53c76ac`; renders `docs/art/qa/agents/` (lineup front + iso, per agent front / side / back / three-quarter / iso / collision), stats `docs/art/qa/agents/build-stats.json` |
| Review round | 1 (07.11) |
| Reviewed material | lineups, 6 x three-quarter, Iris back + iso, Salt front, Amber back, Frost front; all six `.glb` inspected with gltf-transform; `art/agents/*.py` |
| Verdict | **close** as a set — six clans are told apart at a glance from the isometric camera and Iris matches the owner's reference (charcoal cloak, violet scarf); individual costumes need shape fixes (Salt's crystals read as wings, Iris's scarf is a flat strip, Amber is one saturated orange), all faces are blank mannequin heads, and `agent_suit.glb` does not exist yet |

## Scores (1–10)

| Silhouette | Materials | Detail | Technical |
|---|---|---|---|
| 7 | 6 | 6 | 7 |

## Per agent

| Agent | Reads as | Height / tris / MB | Main problem |
|---|---|---|---|
| `agent_iris` | charcoal layered cloak, violet scarf, hair, iris pin | 1.76 m / 12,164 / 4.5 | scarf is a flat stiff band; cloak is three stacked capes (coachman look); hood-down is a flat disc behind the neck |
| `agent_sol` | white tiered robe, veil, shoulder crystals, brass balance | 1.86 m / 12,172 / 5.5 | shoulder crystals read as angel wings from the front and from the iso camera; tiers read as a wedding cake |
| `agent_pepel` | dark robe, radial stake collar, stake shield, ribbed bracer | 1.86 m / 9,666 / 5.1 | best silhouette of the set; stakes are uniform in length and angle (a crown) |
| `agent_moh` | green leaf cape, mushrooms, cauldron, beige robe | 1.76 m / 11,098 / 5.2 | fine; robe is a plain pleated cylinder, cape leaves are large flat polygons (acceptable in the hybrid direction) |
| `agent_yantar` | orange coat, flat hat, strong-box, padlocks, keys | 1.78 m / 9,698 / 5.4 | one saturated orange from hat to hem; the brightest thing in any scene it stands in |
| `agent_iney` | tall pointed hood, icicle mantle, armillary staff, sign tablet, vials | 2.02 m / 10,982 / 5.3 | fine; the staff is a 1 cm rod that will shimmer at 20 m; face is lost in the hood (acceptable) |

## What works

- Clan identity from the isometric camera (`lineup_iso.jpg`): colour + one large prop per clan. Nobody is confused with a neighbour. Palette (except Amber) is muted and sits in the brief's grey-green world.
- Iris matches `2.webp`: charcoal hooded cloak, long violet scarf, shoulder-length hair, human scale. The iris flower pin is a good small detail.
- Technical contract: one runtime mesh per file, 3 materials, 2048 textures, tangents, `agent_<clan>_col` capsule, `socket_head` (with `head_top_m`) and `socket_hand_r` (with `arm_dir_gltf`, `palm_normal_gltf`), root extras `clan`, `height_m`, `material_slots`. Budgets: all under 12.2k of 24k tris, 4.5–5.5 MB each.
- Baking pipeline is sound: no visible seams or black faces on any of the 18 renders inspected.

## Fixes, ranked

1. **Salt's crystals read as wings.** `agent_sol_front.jpg`, `lineup_front.jpg`: two symmetric white clusters flaring up and out from the shoulders — at 20 m this is an angel. Make them asymmetric (one large cluster on the left shoulder, a small one on the right hip or the satchel), angle them forward/down rather than up, make them denser and more compact (3–4 hex prisms, 8–14 cm), and tint them slightly cooler/greyer than the robe so they separate from the white cloth.
2. **Iris's scarf.** `agent_iris_back.jpg`: a flat 12 cm rectangle glued on the cloak; front: a straight stiff strip. Reference `2.webp`: the scarf wraps the neck twice and the long tail falls down the back with folds and a frayed end. Wrap it as a torus-like coil at the neck (two turns), let one tail fall over the shoulder in front and the long tail down the back with 2–3 bends and a tapered end; add a cloth normal (weave + fold ridges).
3. **Iris's cloak is three stacked capes.** `agent_iris_three_quarter.jpg`: shoulder cape, mid cape, long cloak with separate jagged hems, which reads as a Victorian coachman. The reference is one long cloak with one shoulder cape at most. Drop the middle tier, lengthen the main cloak to mid-calf, keep one frayed hem. The "hood down" is a flat disc behind the neck (`agent_iris_back.jpg`): make it a real folded hood (a crescent of cloth with two folds) or remove it.
4. **Amber is one saturated orange.** `agent_yantar_three_quarter.jpg`: coat, skirt and hat are the same hue and value. Desaturate the coat to a deep amber-brown (about 0.45, 0.22, 0.08 linear), keep the collar/cuffs as the bright amber accent, and add a dark leather belt/vest so the padlocks and keys read against something. The brief's accent colour is amber; it should be the detail, not the whole figure.
5. **Blank mannequin heads on all six.** Flat-shaded egg heads with a lighter face facet. For holograms behind the shader this may pass; if Iris is ever shown as the walking player (not a hologram), she needs a face read at 2–5 m: brow ridge, nose plane, eye sockets (6–8 faces), and hair that is not a ribbed helmet (`agent_iris_back.jpg`). Decide this with the lead before 11.11; a stylized face costs under 300 tris.
6. **Everyone stands in the same stiff pose.** Arms straight down, feet together, identical for all six. Give each clan one static attitude: Ash leans forward with the shield raised, Amber one hand on the strong-box strap, Frost both hands on the staff, Moss holding the cauldron with both hands, Salt one hand holding the balance up, Iris one hand on the scarf. No animation needed; it is a pose in the source.
7. **Ash's stakes are a uniform crown.** Vary stake length (0.4–0.7 m), tilt (10–25 deg) and spacing; let two cross. Charred tips (darker, slightly glossy) will sell "burnt wood".
8. **Thin props will shimmer at the isometric distance.** Frost's staff (about 1 cm), Salt's balance chains and beam, Amber's key ring. Thicken to 2–3 cm or accept that they vanish at 20 m (they can; they still read at inspect distance). Prefer thickening the staff: it is Frost's silhouette.
9. **Normal maps are JPEG.** All six `*_normal.jpg`; 8x8 block artefacts show on flat cloth at close range. Export normals as PNG (about +1.5 MB per agent) or at JPEG quality 95 and verify at 1 m.
10. **Texel density 317–420 px/m at 2048** is the lowest of all assets so far. Fine behind a hologram shader at 15 m; not enough for a close-up of the player character. If fix 5 applies to Iris, give her a 4096 garment texture or a separate `_inspect`.
11. **`agent_suit.glb` is missing** (the Shell-entry suit, reference `3.webp`: light grey segmented suit, helmet, violet backpack light). Not started in `art/agents/`; it is on the asset list for 11.11.
12. **Stats bug.** `bounds_gltf_yup` in `build-stats.json` is computed in lineup world space (Iris min x 5.66, max x 107.99). The `.glb` bounds are correct; fix the stats so the manifest does not inherit wrong numbers.
13. **Manifest rows missing** on the branch: `docs/art/manifest.md` has no `agent_*` rows yet.

## Reference check

- Iris vs `2.webp`: close in colour and attitude; fixes 2 and 3 take it the rest of the way.
- Palette vs the brief: five of six are in the cold muted range; Amber (fix 4) is not.
- Nothing from Arrival: confirmed (no hazmat suits, no heptapod motifs). The future `agent_suit` must stay away from the film's orange hazmat look; the owner's `3.webp` (grey hard-shell suit, violet light bar) is the reference.
- Isometric readability: good for all six; Salt's wings (fix 1) are the one misread.
