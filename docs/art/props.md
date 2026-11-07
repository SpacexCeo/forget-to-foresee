# Props and clan relics

Source: `art/props/build_props.py` (geometry per prop) and the shared kind-atlas pipeline in
`art/common/kindbake.py`: a GPU-baked atlas (colour, ORM, tangent normal, 2x supersampled), up to
two unbaked special materials (emission, glass, quartz, nacre), at most 3 materials, a convex `_col`
and `socket_*` empties for code-drawn VFX. `art/props/ship.sh` adds the scroll fragment's material
variants (`add_variants.mjs`) and compresses with `art/tools/compress-glb.sh` (KTX2 + meshopt).
Style: hybrid (faceted silhouettes + baked PBR) with the owner's 07.11 addendum: weathered stone with
lichen and moss in the crevices, ornate but worn metalwork (engraved filigree, patina in grooves),
frayed cloth, restrained palette with gold accents. Info colours stay code-drawn.

Axes: Y-up metres, front +Z, pivot on the ground at the planted point (base centre; pole foot for
banners). Socket roles are in each empty's `extras.socket`.

**Status 07.11 (end of session):** the generator covers every prop below, but GPU memory was
exhausted by parallel jobs from other agents, so only part of the set was baked and shipped. The table
says which `.glb` exists. Rebuild the rest with
`blender -b -P art/props/build_props.py -- build <name>` (one job at a time if the GPU is shared),
then `art/props/ship.sh <name>`.

| File | Purpose in gameplay | Sockets | Tris (budget) | Size (m, W x D x H) | Shipped |
|---|---|---|---|---|---|
| `prop_shard_pedestal.glb` | Memory-shard auction pedestal in the Iris camp; shard sits at 1.0 m (layout.js `SHARD`) | `socket_shard`, `socket_glow`, `socket_bid` (bid display, pad 0.19 x 0.10) | (8,000) | ~1.1 x 1.1 x 1.13 | see report |
| `prop_anchor_stake.glb` | The stake Iris plants in an anchor zone; amber crystal + gold cross vane read from the 90 m iso camera | `socket_glow`, `socket_beacon`, `socket_shell` (Shell number, pad 0.12) | 1,018 (4,000) | 0.67 x 0.67 x 2.56 | yes |
| `prop_anchor_pad.glb` | Anchor zone floor marker (r 1.5 m), recessed plaque for the Shell number facing the plaza | `socket_shell` (pad 0.34 x 0.19), `socket_anchor` (`zone_radius_m` 1.5), `socket_glow` | 1,599 (4,000) | 3.0 x 3.0 x 0.05 | yes |
| `prop_logogram_tablet.glb` | Stone stele with an engraved round Guest sign, emissive groove | `socket_glow`, `socket_logogram` (r 0.3) | (4,000) | 1.0 x 0.36 x 1.33 | see report |
| `prop_scroll_fragment.glb` | One of six wedges that slot into the Scroll (fits `scroll_table` sector sockets; place at `socket_sector_k`). Clan inlay via `KHR_materials_variants`: `dormant`, `iris`, `sol`, `pepel`, `moh`, `yantar`, `iney` | `socket_glow` | 295 (4,000) | 1.0 x 0.66 x 0.06 | yes (atlas bake came out flat: rebake) |
| `prop_lantern.glb` | Small hexagonal lantern, stands or hangs | `socket_flame`, `socket_glow`, `socket_hang` | 568 (4,000) | 0.23 x 0.27 x 0.43 | yes |
| `prop_bridge_torch.glb` | Rail-mounted iron brazier torch for the bridges | `socket_flame`, `socket_glow` | (4,000) | 0.38 x 0.38 x 1.65 | no |
| `prop_clan_banner_<clan>.glb` x6 | Clan banner on an L-pole: frayed swallowtail cloth with moth holes, gold/ember/silver thread sigil (iris petals, balance, palisade, leaf over cauldron, key, armillary). Skinned: `root` + 2-bone sway chain `cloth_upper` -> `cloth_lower`, looping action `idle` (4 s, 24 fps) | `socket_cloth`, `socket_top` | (4,000) | ~1.15 x 0.2 x 3.5 | iris: see report; others no |
| `prop_memory_vial.glb` | A forgotten memory as a glowing vial for auctions (glass with transmission, bronze cage, wax seal) | `socket_glow` | (4,000) | 0.13 x 0.13 x 0.28 | see report |
| `prop_vote_stone_accept.glb` / `prop_vote_stone_refuse.glb` | Final vote stones: whole stone with a closed ring (accept), split stone with a broken ring (refuse) | `socket_glow` | (4,000) | 0.22 x 0.17 x 0.08 | no |
| `prop_relic_ash_spear.glb` | Ash relic: stake spear, palisade collar, ember cracks, frayed red ribbons | `socket_grip`, `socket_glow`, `socket_flame` | (4,000) | ~0.25 x 0.25 x 2.14 | no |
| `prop_relic_frost_staff.glb` | Frost relic: armillary staff, silver and ice-glass rings around a cold core | `socket_grip`, `socket_glow` | (4,000) | ~0.3 x 0.3 x 1.97 | no |
| `prop_relic_salt_scales.glb` | Salt relic: balance blade, tilted gold balance crossguard, salt in one pan, quartz pommel | `socket_grip`, `socket_glow` | (4,000) | ~0.6 x 0.14 x 1.34 | no |
| `prop_relic_amber_keymace.glb` | Amber relic: mace with key-bit flanges, amber gem in a key bow, dangling padlock | `socket_grip`, `socket_glow` | (4,000) | ~0.22 x 0.22 x 1.0 | no |
| `prop_relic_moss_sickle.glb` | Moss relic: thorn sickle, vine-wrapped haft, moss, glowing spore caps | `socket_grip`, `socket_glow` | (4,000) | ~0.42 x 0.06 x 0.68 | no |
| `prop_relic_iris_lens.glb` | Iris relic: fragment lens, six violet glass wedges (echoing the Scroll) in a bronze ring with gold petals | `socket_grip`, `socket_glow` | (4,000) | ~0.42 x 0.05 x 1.0 | see report |
| `prop_guest_weapon.glb` | The Shells' offered artifact (the "weapon" outcome): twisted iridescent nacre spine, sail membranes, a halo of shards out of true, an inverted core | `socket_glow`, `socket_grip` | 794 (4,000) | 0.52 x 0.51 x 1.31 | yes |

Client notes: banners need skinned-mesh support and `AnimationMixer` playing `idle`; the scroll
fragment needs `KHR_materials_variants` (three's GLTFLoader exposes `userData.variants` via the
official extension plugin) or code can swap to the `M_ScrollFragment_Clan_<clan>` materials by name.
QA: `docs/art/qa/props/`.
