# Town team handoff (10.11.2026)

If any session stops (limits, crash), everything needed to continue is in git: this file, the briefs, the
decision log and each worker's branch with its own progress log.

## Who does what

| Task | Branch | Brief | Progress log |
|---|---|---|---|
| Lead (decisions with the owner) | `claude/intelligent-thompson-zgpep3` | this file, `docs/decisions.md` | this file |
| T-001 town, A-001 altar, S-001..S-003 shops, loading screen, start in town, ambient motion, performance | `claude/town-v1` | `docs/art/town-brief.md`, `docs/art/townsfolk-shops-brief.md` | `docs/town.md`, `docs/handoff/town-v1.md` |
| N-001 townsfolk (models, behaviour) | `claude/townsfolk-v1` | `docs/art/townsfolk-shops-brief.md` N-001 | `docs/handoff/townsfolk-v1.md` |
| I-001 Iris final look | `claude/iris-final` | same file, I-001 | `docs/handoff/iris-final.md` |
| R-001 rigs and animation (mocap base) | `claude/anim-rig` | same file, R-001 | `docs/handoff/anim-rig.md` |
| L-002 lighting, shadows, atmosphere, weather | `claude/atmosphere` | worker prompt summarised in `docs/decisions.md` (10.11) | `docs/atmosphere.md`, `docs/handoff/atmosphere.md` |

All branches start from `claude/town-v1`; the town branch is the base the others merge regularly.

## Owner decisions so far (details in `docs/decisions.md`, 10.11 rows)

Town on the ground is the start for every player; the air archipelago is a separate location; the current season
loop is the Tournament; the altar is open to everyone; temple → round shrine (option C); the GPT cast lineup of 13
townsfolk approved; town lit as a warm afternoon, archipelago at golden hour (lead default); every reference comes
from the owner's GPT chat through the board; loading screen before start; runs in phone and PC browsers.

## GPT board

Live on the rented GPU server at `/root/board/` (`board.md`, `refs/`, `renders/`); copied into git by the town
worker at `docs/art/town/board/` at each milestone. Requests to GPT: `docs/art/town/gpt-storyboard-request.md`,
`docs/art/town/gpt-request-02.md`. The server access lives only in the sessions, never in git.

## Merging

Nothing from these branches is in `main` yet. Merge order when the owner says so: `claude/town-v1` first (after its
in-engine flow is verified), then `claude/atmosphere`, `claude/anim-rig`, `claude/iris-final`, `claude/townsfolk-v1`;
`cd game && npm test && npm run build` after each; the jury path (`?demo=judge` → town → altar → Tournament) checked.

## GPU server

Clore order 2426592 (RTX 5090), started 16:05 UTC 10.11; cancelled at about 22:00 UTC unless the owner extends it.
Rule: nothing may exist only on the server.

## State at 10.11 22:10 UTC (after the merge into main)

All first-wave branches are merged into `main` (commit 18511f9 and later). The first-wave workers stopped before
finishing; their sessions are archived. Second wave (each pushes its branch and, when tests and build are green, `main`):

| Worker | Branch | Scope | Progress log |
|---|---|---|---|
| Characters v2 | `claude/characters-v2` | Iris audit fixes and look per GPT `I-001_01_target`, phone variant; mocap idle/walk/run/start/stop/turn/register/greet as default; 13 townsfolk from GPT sheets placed in the town | `docs/handoff/characters-v2.md` |
| Lighting v2 | `claude/lighting-v2` | start in the town + loading screen, spawn camera, shadows/sun/fog/grade polish, atmosphere and wind-driven life, weather and dusk presets, phone tiers | `docs/handoff/lighting-v2.md` |

**Still open after both (for future workers):** shop interiors refined to GPT sheets `S-001..S-003` (refs on the board)
and shop entry/exit in the client; the six clan agents on the mocap clips and rig correctives (twist bones,
shoulder/elbow/hip/knee); README real/mock rows for the town, altar, shops and townsfolk; GPT board entries left
open (`board.md`); full `npm test` and a check of the jury path by the owner.

**Server backup:** the whole server state (board with all GPT refs, uncommitted worker diffs, every `.blend`) is packed
on the server as `/root/ftf-server-backup.tar` by `/root/mkbackup.sh`; the owner downloads it locally. Re-run the script
before the rental ends (about 22:00 UTC 11.11). The download command with the access token lives outside git.
