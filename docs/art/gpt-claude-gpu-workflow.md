# GPT / Codex and Claude on a rented RTX 5090 — shared art workflow (draft)

Date: 10.11.2026. Status: **process draft from the owner**. The GPU server, the job service and the
independent storage are **not connected yet** (Clore `my_orders` returned no active orders on 10.11).
Nothing here changes the shipped hackathon build or its art direction until the owner approves it in
`docs/decisions.md`.

## Goal and roles

The owner works with GPT and Claude in parallel.

- **GPT / Codex:** visual references, task briefs, visual review of renders.
- **Claude:** builds and refines models, rigs and animations in Blender, integrates them into Three.js.
- Both read the same task and results. **The owner decides the art direction.**

First art reference (mood only): the owner's screenshots of a compact fantasy hill town from an older MMO
(dense housing, a temple on high ground, warm roofs, half-timbering, terraced terrain). As with the film
rule in `docs/decisions.md` §2, the game takes **no layout, names, assets or recognisable look** from that
source: its own plan, names and details. Characters and NPCs share proportion and material rules and one
compatible humanoid skeleton; costumes may differ.

## Notes on working with Claude (from Anthropic's prompting guide)

- For API work start at effort `high` and test other levels on real tasks.
- For long tasks, state explicitly that the work must reach a result and that routine errors are
  diagnosed and fixed.
- List permitted actions concretely. Piled-up restrictions and vague rules cause needless stops.
- Do not give the model open-ended ownership of the whole project: changes spread beyond the task.
- In an own API integration, keep history by appending messages, never rewriting its start.

These are interaction guidelines; asset quality is checked separately.

## Connection

- **RTX 5090 (rented):** Blender, processing and rendering tools, job runner. Claude Code can run here;
  the owner's UI can attach through supported Remote Control.
- **Persistent node outside the GPU rental:** job queue, message log, result catalogue, file links.
  A small API + SQLite on a persistent disk is enough to start.
- **Independent storage:** S3-compatible with object versioning, or another persistent service the owner picks.
- GPT/Codex and Claude reach it through what their clients support: MCP, API or SSH. Two open chats do
  not form a connection by themselves.
- Reacting to each other's messages automatically needs a running dispatcher/agent; a chat is not a
  long-running process. API automation is billed under API terms, separate from subscriptions.
- All connections are authenticated; keys go through secret settings, never into tasks, reference
  files or this repository.

## Exchange contract

Minimum operations of the future service: `create_task`, `claim_task`, `ask_peer`, `answer_peer`,
`attach_artifact`, `get_status`, `publish_checkpoint`, `verify_backup`.

- A task has: ID, assignee, version, goal, input files, acceptance criteria, status, events, results.
- A question to the other agent carries the task ID, the exact question and attached images. An answer
  is appended as a new event. Repeating a request with the same ID does not create a second job.
- One assignee edits a given asset at a time. Code uses separate branches/worktrees (see `docs/collab.md`).
- Long GPU work runs as a tracked job with a log; a client disconnect must not restart it automatically.

Example: Claude asks about a facade → GPT returns a reference sheet with notes → Claude saves a new model
version and renders → GPT returns concrete remarks → Claude fixes and publishes.

## Reference package for Claude

1. Asset ID and task version.
2. Purpose in the game, dimensions and camera distance.
3. One approved main concept; extra views with consistent geometry.
4. Palette, materials, silhouette, required details and allowed variants.
5. For a character: neutral pose, proportions, reference skeleton, clothing rules.
6. Output format; mesh, texture, collision and animation requirements; budgets set for the game
   (current budgets: `docs/decisions.md` §4, 07.11 "Minimum spec").
7. Acceptance criteria and examples of typical defects.

Generated views can contradict each other. Resolve contradictions explicitly before modelling and name
one view the main one. Concept art is not a precise blueprint.

## Safekeeping: required order

Each finished stage is a new immutable version: the `.blend` source, `.glb`/`.fbx` exports as needed,
all external textures, the scripts used, parameters, renders and a `manifest.json` with file sizes and
SHA-256. Textures are packed into the `.blend` where applicable and also kept as separate files.

Publishing order:

1. Finish writing files into a temporary folder; check the export reads back.
2. Build the manifest and checksums.
3. Upload the new version to the independent storage.
4. Confirm completeness and integrity with the storage's own checks or by reading back. An ETag is not
   a general substitute for SHA-256.
5. Only then record the backup and set status `backed_up`. `ready` also needs the technical check;
   `accepted` needs the owner's decision.
6. Show the owner the package link and a preview.

On upload failure: status `backup_failed`, local files kept, retries with a pause. The result is not
called saved. The log and the last confirmed version live outside the GPU server.

Checkpoints: after significant stages (geometry, materials, rig, animation) and periodically, at first
every 5 minutes when a new, cleanly saved version exists. Upload finished snapshots, never a `.blend`
mid-write. Unfinished computation and edits after the last snapshot can be lost on a sudden shutdown.

Also: the owner's computer downloads finished packages from the persistent storage automatically while
it is on and connected — a second independent copy. Large models live in file storage; Git holds code,
tasks and manifests.

## Recovery check before production

Before the first expensive run: make a test Blender asset, upload the full package, download it into a
clean folder, verify SHA-256, open the `.blend`, import the `.glb`, check textures and animations. Then
check queue recovery on another runner with no access to the original GPU disk. Working data is not
deleted for this test.

A new server gets code and config from the repository and the last confirmed versions from storage;
unfinished jobs are reconciled with the log before any rerun.

## Starter brief for Claude

You work with GPT on our game. You own Blender, game assets, rigs, animations and Three.js integration
within the current task. GPT prepares references and visual remarks. Read the shared task version; tie
questions and answers to its ID. If an art decision is unclear, ask and continue the independent work.
Do not edit assets claimed by another assignee.

Bring the task to a verifiable result; diagnose and fix routine errors. Modelling, test renders, export
and backup to the assigned storage are permitted within the task. New spending over budget, deleting
backups and changing the art direction need the owner's decision.

Keep sources and intermediate versions. Do not call an asset ready before the export is checked and the
external copy is confirmed. Return the package link, renders, technical parameters and open problems.
Follow the approved character proportions, materials and skeleton.

## Needed to connect

- Access to the rented server through its intended secure channel.
- The chosen independent storage and its access settings.
- Which clients are used (Claude Code / Desktop / web, GPT / Codex), to check the available route.
- Spending limits for rental, API and external generation.

## Fit with what the repository already does

- 07.11 rule: GitHub is the single source of truth; the rented GPU is compute only. Large binaries
  already go to branch `art-sources` (Git LFS, `SHA256SUMS`); `docs/art/server-inventory.md` lists
  server-only files. This draft adds versioned storage outside GitHub and a job service; until it
  exists, the 07.11 rule stays in force.
- Scripts for the earlier rented GPUs: `tools/gpu-server/` (Jupyter API, Blender setup, driver notes).
  Known trap (09.11): a server with driver 535 failed Cycles GPU bakes; check the driver before a long run.
- Hackathon timing: submission is 15.11.2026 01:59 Kyiv, code freeze 13.11 20:00. Building the job
  service and storage is not on the submission path; a new town art direction would be post-hackathon
  unless the owner decides otherwise.

## Sources

- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/remote-control

The architecture, reference rules and backup rules are project recommendations for this work, not
Anthropic requirements.
