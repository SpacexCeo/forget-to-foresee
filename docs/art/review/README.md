# Art review — summary

Visual QA of every asset against the owner's references (07.11: floating archipelago with nacre ammonite Shells, Iris's violet tent and the segmented stone table, the Shell interior with the glass wall) and `docs/art/brief.md`. One file per asset in this folder; verdicts are **meets reference / close / far**. Scores are silhouette / materials / detail / technical, 1–10. Only the owner sets `approved` in the manifest; this folder never does.

Renders are compared from the isometric camera (pitch 14–62 deg, 15–30 m) and at inspect distance (`inspectDistance` in `game/src/render/asset-catalog.js`).

Last pass: 07.11 (round 1).

| Asset | Branch | Round | Verdict | Scores S/M/D/T | Top fix |
|---|---|---|---|---|---|
| `anchor.glb` | `main` (from `art/anchor-first`) | 1 | close | 7/6/6/6 | Black bake fringe along the cap rim and the suture step; fins read as straps with cube tips ([anchor.md](anchor.md)) |
| `shard.glb` | `art/scroll-table-shard` @ a23d346 | 1 | close on paper, far in the renders | 6/4/6/7 | Regular horizontal ripple on every facet (normal terracing); veins read as dry grass, glass goes black from above ([shard.md](shard.md)) |
| `scroll_table.glb` | `art/scroll-table-shard` @ ba9e039 | 1 | close | 6/5/5/5 | Stone reads as polished marble with Voronoi hairlines and terraced sides, not segmented weathered stone; 46 MB, no tangents, 45% UV fill ([scroll_table.md](scroll_table.md)) |
| `shell_1..4.glb` | `art/scroll-table-shard` | — | not yet rendered | — | Source `art/shells/build_shells.py` exists (ammonite family, I hook, II massive, III trochospiral, IV broken plates); waiting for renders |
| `island.glb`, `camp_*.glb` (6) | `art/island-camps` | — | branch not pushed yet | — | — |
| `shell_interior.glb`, `guest.glb` | `art/shell-interior` | — | branch not pushed yet | — | — |
| `agent_<clan>.glb` (6) | `art/agent-costumes` @ 53c76ac | 1 | close | 7/6/6/7 | Salt's shoulder crystals read as angel wings; Iris's scarf is a flat strip and the cloak is three stacked capes; Amber is one saturated orange ([agents.md](agents.md)) |
| `agent_suit.glb` | `art/agent-costumes` | — | not started | — | No source in `art/agents/`; reference is `3.webp` (grey hard-shell suit, violet light bar) |

## Cross-asset notes (round 1)

- The three `ftf_pipeline.py` assets (anchor, shard, scroll table) share the same defects, so fix them once in `art/common/ftf_pipeline.py`:
  - **bake bleed / black fringes** at steps and overhangs (anchor cap rim, scroll table socket walls, shard clasp): bake with a cage and dilate by 16 px;
  - **8-bit normal terracing** on near-flat surfaces with sub-millimetre displacement (shard facets, scroll table socket floors): raise displacement scale or dither when writing PNG;
  - **"stacked tyres"**: equal horizontal bands with soft symmetric edges (anchor shaft, scroll table drum) instead of asymmetric shell growth ribs;
  - **flat ribbon parts and cube feet** (anchor fins and shoes, shard claws, scroll table buttress blocks);
  - **double-sided on closed meshes**, and **texture sizes chosen from the maximum allowed, not from the inspect distance** (anchor 36.7 MB, scroll table 46 MB; scroll table UV fill 45%).
- Contract side (names, `_inspect`, `_col`, `socket_*` extras, budgets) is clean on every asset; the scroll table is the only one without tangents.
- The agents pipeline (`art/agents/`) is cleaner on bakes and file size; its gaps are design (Salt's wings, Iris's scarf and cloak, Amber's colour, blank faces, one pose for all) and the missing `agent_suit.glb`.
- Still unseen: the four Shells (the most important silhouettes in the game), the archipelago, six camps, the Shell interior and the Guest. These should be the next renders to land; with 4 days left they decide whether the game matches `2.webp` at all.
