# Art review — summary

Visual QA of every asset against the owner's references (07.11: floating archipelago with nacre ammonite Shells, Iris's violet tent and the segmented stone table, the Shell interior with the glass wall) and `docs/art/brief.md`. One file per asset in this folder; verdicts are **meets reference / close / far**. Scores are silhouette / materials / detail / technical, 1–10. Only the owner sets `approved` in the manifest; this folder never does.

Renders are compared from the isometric camera (pitch 14–62 deg, 15–30 m) and at inspect distance (`inspectDistance` in `game/src/render/asset-catalog.js`).

Last pass: 07.11 (round 1, three fetches: anchor + shard, then scroll table + agents, then Shells + suit).

| Asset | Branch | Round | Verdict | Scores S/M/D/T | Top fix |
|---|---|---|---|---|---|
| `anchor.glb` | `main` (from `art/anchor-first`) | 1 | close | 7/6/6/6 | Black bake fringe along the cap rim and the suture step; fins read as straps with cube tips ([anchor.md](anchor.md)) |
| `shard.glb` | `art/scroll-table-shard` @ a23d346 | 1 | close on paper, far in the renders | 6/4/6/7 | Regular horizontal ripple on every facet (normal terracing); veins read as dry grass, glass goes black from above ([shard.md](shard.md)) |
| `scroll_table.glb` | `art/scroll-table-shard` @ ba9e039 | 1 | close | 6/5/5/5 | Stone reads as polished marble with Voronoi hairlines and terraced sides, not segmented weathered stone; 46 MB, no tangents, 45% UV fill ([scroll_table.md](scroll_table.md)) |
| `shell_1..4.glb` | `art/scroll-table-shard` @ 2786597 | 1 | far | 5/3/4/6 | No nacre: matte mid-grey, no iridescence; I is an uncoiled hose instead of a tall spire; IV's fragments are rectangular blocks; ribs are flat paper fans; black speckles and faces ([shells.md](shells.md)) |
| `island.glb`, `camp_*.glb` (6) | `art/island-camps` | — | branch not pushed yet | — | — |
| `shell_interior.glb`, `guest.glb` | `art/shell-interior` | — | branch not pushed yet | — | — |
| `agent_<clan>.glb` (6) | `art/agent-costumes` @ 53c76ac | 1 | close | 7/6/6/7 | Salt's shoulder crystals read as angel wings; Iris's scarf is a flat strip and the cloak is three stacked capes; Amber is one saturated orange ([agents.md](agents.md)) |
| `agent_suit.glb` | `art/agent-costumes` @ 3169730 | 1 | close | 7/5/5/8 | Matches `3.webp` in colour and parts, but no panel lines or surface detail; toy proportions (helmet-sized pauldrons, stick arms) ([agent_suit.md](agent_suit.md)) |

## Cross-asset notes (round 1)

- The three `ftf_pipeline.py` assets (anchor, shard, scroll table) share the same defects, so fix them once in `art/common/ftf_pipeline.py`:
  - **bake bleed / black fringes** at steps and overhangs (anchor cap rim, scroll table socket walls, shard clasp): bake with a cage and dilate by 16 px;
  - **8-bit normal terracing** on near-flat surfaces with sub-millimetre displacement (shard facets, scroll table socket floors): raise displacement scale or dither when writing PNG;
  - **"stacked tyres"**: equal horizontal bands with soft symmetric edges (anchor shaft, scroll table drum) instead of asymmetric shell growth ribs;
  - **flat ribbon parts and cube feet** (anchor fins and shoes, shard claws, scroll table buttress blocks);
  - **double-sided on closed meshes**, and **texture sizes chosen from the maximum allowed, not from the inspect distance** (anchor 36.7 MB, scroll table 46 MB; scroll table UV fill 45%).
- Contract side (names, `_inspect`, `_col`, `socket_*` extras, budgets) is clean on every asset; the scroll table is the only one without tangents.
- The agents pipeline (`art/agents/`) is cleaner on bakes and file size; its gaps are design (Salt's wings, Iris's scarf and cloak, Amber's colour, blank faces, one pose for all) and surface detail on the suit.
- **The Shells are the priority.** They are the only objects the owner's main reference shows directly and they are the farthest from it: no nacre (add `KHR_materials_iridescence` + clearcoat, brighten the base), Shell I is the wrong archetype (spire, not hose), Shell IV's break is placeholder blocks. Everything else can ship as "close"; the Shells cannot.
- Still unseen: the archipelago (`island.glb`), six camps, the Shell interior and the Guest. Branches `art/island-camps` and `art/shell-interior` have not been pushed; with 4 days left these and the Shells decide whether the game matches `2.webp` at all.

## Top 10 fixes across all assets (round 1)

1. Shells: nacre material — iridescence + clearcoat, base 0.8, rib-crest roughness 0.3 (`art/scroll-table-shard`).
2. Shell I: rebuild as a tall ribbed spire per `1.webp`, not an uncoiled hook (`art/scroll-table-shard`).
3. Shell IV: real wall fragments with thickness, break through the venter, septa visible (`art/scroll-table-shard`).
4. Shells: rounded ribs 0.4–0.6 m wide instead of flat fans; fix black speckles, umbilicus holes, flipped faces (`art/scroll-table-shard`).
5. Shard: remove the horizontal normal terracing on every facet; replace root-like tubes with planar fracture flakes; stop the glass going black (`art/scroll-table-shard`).
6. Pipeline: bake with a cage and 16 px dilation to kill the black fringes on the anchor cap, scroll table socket walls and shard clasp (`art/common/ftf_pipeline.py`, all three branches).
7. Scroll table: segmented weathered stone with radial block joints and flush inlay instead of marble veining and terraced sides; add tangents; cut 46 MB to under 15 MB (`art/scroll-table-shard`).
8. Anchor: fins as real buttresses with wedge shoes instead of straps with cubes; growth ridges instead of stacked rings; 36.7 MB to under 12 MB (`main` / `art/anchor-first`).
9. Agents: Salt's crystals asymmetric and compact (not wings); Iris's scarf wrapped with a falling tail and one cloak tier; Amber desaturated to amber-brown with a dark belt (`art/agent-costumes`).
10. Suit: panel seams and segment lines on every plate, flatter pauldrons, thicker limbs, brighter violet strip (`art/agent-costumes`).
