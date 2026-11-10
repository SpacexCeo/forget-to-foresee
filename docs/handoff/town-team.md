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
