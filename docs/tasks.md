# Task board

Updated 2026-11-07. Status: `todo` · `doing` · `review` · `done` · `blocked`. Only the project owner sets art to `approved`.

Deadlines (Kyiv): models 11.11 evening · QA 12.11 · code freeze 13.11 20:00 · submission 15.11 01:59.

## Infrastructure
| Task | Owner / branch | Status |
|---|---|---|
| RTX 5090 #1 (Clore, port 1436): key auth, GPU verified (sm_120, fp16 220 TFLOPS), Blender 4.5.3 | lead | done |
| RTX 5090 #2 (Clore, port 3018): key auth, Blender 4.5.3 | lead | done |
| Rentals are temporary: every result goes to git right away | all | rule |

## Art (procedural Blender sources in `art/`, GPU bakes)
| Task | Owner / branch | Status |
|---|---|---|
| `anchor.glb` + QA renders + turntable | lead / `art/anchor-first` | review |
| anchor file size 36.7 MB (PNG normals) — KTX2/Basis at build time proposed | lead + owner | todo |
| `scroll_table.glb`, `shard.glb`, `shell_1..4.glb` (ammonite family, IV cracked, levitating) | agent / `art/scroll-table-shard` | doing |
| `island.glb` (floating archipelago) + six `camp_*.glb` | agent / `art/island-camps` | doing |
| `shell_interior.glb` + `guest.glb` | agent / `art/shell-interior` | doing |
| six `agent_<clan>.glb` costumes + `agent_suit.glb` | agent / `art/agent-costumes` | doing |
| Update `docs/art/brief.md` to the archipelago layout | lead | todo |

## Client
| Task | Owner / branch | Status |
|---|---|---|
| Three.js archipelago skeleton, iso camera, capsule collision 30 Hz, visibility streaming, review page | agent / `client/3d-skeleton` | review |
| Lobby, UI shell, EN/RU i18n, tournament card (simulation), hologram constructor | agent / `ui/lobby-i18n` | review |
| Integrate UI + engine season loop into the 3D client | lead | todo |
| Inside-a-Shell scene, logogram on the glass | — | todo |
| Camera occlusion fade for Shells, pathfinding, KTX2/Draco decoders | — | todo |
| S.fx staging of agent events, rare VFX events | — | todo |

## Rules, math, chain
| Task | Owner / branch | Status |
|---|---|---|
| Economy Monte Carlo, per-strategy expected return, six review findings (all reproduced) | agent (Fable) / `math/economy-sim` | review |
| Rules v3 proposals P1–P9 | owner decision | blocked on owner |
| NEAR season commit-reveal contract (Rust, near-sdk), JS↔Rust vectors, CI | agent / `contracts/season-commit` | review |
| Testnet deploy | owner (account) | blocked on owner |

## Submission
| Task | Owner / branch | Status |
|---|---|---|
| Merge reviewed branches into an integration branch, then `main` with owner OK | lead | doing |
| README real/mock table kept current | lead | ongoing |
| Demo video, tag `hackathon-submission` | owner + lead | todo |
