# Art review — summary

Visual QA of every asset against the owner's references (07.11: floating archipelago with nacre ammonite Shells, Iris's violet tent and the segmented stone table, the Shell interior with the glass wall) and `docs/art/brief.md`. One file per asset in this folder; verdicts are **meets reference / close / far**. Scores are silhouette / materials / detail / technical, 1–10. Only the owner sets `approved` in the manifest; this folder never does.

Renders are compared from the isometric camera (pitch 14–62 deg, 15–30 m) and at inspect distance (`inspectDistance` in `game/src/render/asset-catalog.js`).

Last pass: 07.11 (round 1).

| Asset | Branch | Round | Verdict | Scores S/M/D/T | Top fix |
|---|---|---|---|---|---|
| `anchor.glb` | `main` (from `art/anchor-first`) | 1 | close | 7/6/6/6 | Black bake fringe along the cap rim and the suture step; fins read as straps with cube tips ([anchor.md](anchor.md)) |
| `shard.glb` | `art/scroll-table-shard` @ a23d346 | 1 | close on paper, far in the renders | 6/4/6/7 | Regular horizontal ripple on every facet (normal terracing); veins read as dry grass, glass goes black from above ([shard.md](shard.md)) |
| `scroll_table.glb` | `art/scroll-table-shard` | — | not yet rendered | — | Source `art/scroll_table/build_scroll_table.py` exists (3.4 m medallion, six sockets, bronze inlay); waiting for `docs/art/qa/scroll_table/final/` |
| `shell_1..4.glb` | `art/scroll-table-shard` | — | not yet rendered | — | Source `art/shells/build_shells.py` exists (ammonite family, I hook, II massive, III trochospiral, IV broken plates); waiting for renders |
| `island.glb`, `camp_*.glb` (6) | `art/island-camps` | — | branch not pushed yet | — | — |
| `shell_interior.glb`, `guest.glb` | `art/shell-interior` | — | branch not pushed yet | — | — |
| `agent_<clan>.glb` (6), `agent_suit.glb` | `art/agent-costumes` @ 8949120 | — | not yet rendered | — | Pipeline and costume sources exist (`art/agents/`); no `.glb`, no renders, `docs/art/qa/agents/` absent |

## Cross-asset notes (round 1)

- Both finished assets share the same pipeline (`art/common/ftf_pipeline.py`), so the same issues repeat: thin flat "ribbon" parts (anchor fins, shard claws), double-sided flags on closed meshes, and bake padding. Fixing these in the pipeline helps every later asset.
- Both are technically clean on the contract side: names, `_inspect`, `_col`, `socket_*` extras, tangents, budgets. The gaps are visual.
- Anchor file size (36.7 MB) is a pattern to stop before the Shells and the interior are baked at 4096: decide texture sizes per asset from the inspect distance, not from the maximum allowed.
