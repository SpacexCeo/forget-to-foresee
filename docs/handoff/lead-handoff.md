# Lead handoff — 11.11.2026 evening (continue from here)

## Rules from the owner
- Fable 5.2 only for 3D (Blender models, rigs, animation, renders); everything else on Opus 5.5 medium. Haiku for notes/backups.
- One agent at a time unless the owner says otherwise; every agent prompt: no subagents, no long docs, one line per finished stage in its handoff file, results pulled from the server into git immediately, branch only — the lead merges via PR after a local `cd game && npm test`.
- References and storyboards come from the owner's ChatGPT through the board on the GPU server (`/root/board/`); the lead writes requests there.
- Testnet keys are used now (rotated after the hackathon). Never commit keys; the relayer URL (server IP) stays out of git.
- Do not name any company or other project in code or docs.

## Where things are
- main = everything merged up to PR #40 (83465f6) + this handoff + the audit pack (docs/audit/2026-11-11).
- Server archive (GPT board with all refs, Blender sources < 95 MB, Elise work data): branch `archive/server-2026-11-11`.
- Plans: docs/hackathon-tz.md, docs/competitor-map.md, docs/agent-market-plan.md, docs/agent-rental-plan.md, docs/entry-wheel-items-plan.md, docs/day1-free-mint-plan.md, docs/companion-nft-plan.md, docs/agent-track-record-plan.md, docs/skills-hud-critters-plan.md, docs/ui-style-and-dialogue.md, docs/handoff/fable-queue.md, docs/handoff/town-v2.md.
- Audit (owner, 11.11): docs/audit/2026-11-11 — verdict 7.3/10; QUICK-WINS.md QW-1..QW-12 (README for the AI screener, Day-1 mint live on Pages, robust shard moment, link preview/favicon, no-GPU path, toolchain pinning, dev weight, CI, 60 s video, premise in 5 s, single source of numbers).

## Testnet (NEAR)
Coordinator `ftf-coordinator.testnet` (keys only in the lead's container `~/.near-credentials` and the owner's file). Contracts: `heroine.`, `companions.`, `guests.`, `agents.ftf-coordinator.testnet` (+ older `ftf-seasons`, `ftf-shards`). Guest key = create_guest-only function-call key (2 NEAR allowance, daily cap 200). Relayer runs on the owner's server; Pages needs the Actions **variable** `FTF_RELAYER_URL` (owner sets it) for the live free mint.

## GPU server
Clore order 2428619 (RTX 5090, US). Access via tools/gpu-server/jx.py; host/token are kept outside git (owner has them). Board at /root/board.

## Work in flight / stopped (continue)
1. Opus agent (claude/hackathon-tz): restore the two castable skills outside the town walls → agent track-record ledger (contract + verifier) → tabbed menu (Profile/Achievements/NFTs/Inventory/Agents/Log; GPT UI-004), entry nickname/menu/wheel/inventory in the bright style → skill bar + critters quest (GPT UI-003) → dragon companion contracts + client + 5 s cinematic → features 4–10 (sound CC0, intro fly-through, haptics, townsfolk barks, shard timeline, photo mode, narrator).
2. Fable: Elise rebuilt as one model end to end (claude/elise-v2, started 16:31 UTC).
3. Fable queue after Elise (docs/handoff/fable-queue.md): Iris seat cleft recess, shop interiors to GPT S-sheets + swinging signs, townsfolk round 2, clan agents refresh, collectible items (shards, mechanical parts, wheel prop, trading board), 3 dragons from GPT DRG-001 sheets.
4. GPT open: DRG-001 dragons, UI-004 menu, UI-003 icons, rest of LEAD Q03.
5. Owner actions: set `FTF_RELAYER_URL` variable; repo description; tag `hackathon-submission`, 60 s video, X post, apply form.
6. The Haiku notes job never produced claude/notes — check the routine or replace it.
