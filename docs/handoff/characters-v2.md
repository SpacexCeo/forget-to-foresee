# Characters v2 handoff (branch `claude/characters-v2`)

Started 10.11.2026 22:15 UTC from `main` a4b70a4. Scope: Iris final look and phone variant, mocap animation as the
default, the 13 townsfolk in the town. Three parallel workers, one section each below; each keeps its own section
current (done / half-done / next / how to resume). The GPU server (Clore RTX 5090) ends about 22:00 UTC 11.11:
nothing may exist only on the server. Server work dirs: `/root/w/chars/{iris,anim,townsfolk}`. GPT references
(design authority): `docs/art/iris/refs/`, `docs/art/townsfolk/refs/` (copied from the board).

Merge rule: when a piece is stable, merge the latest `main`, run `cd game && npm test && npm run build`; if green,
push the branch and `main`. Never push red. The lighting worker (`claude/lighting-v2`) owns `game/src/render/`
(lights, shadows, fog, grade, weather, loading screen); characters touch only the sheen in `render/fabric.js`.

## 1. Iris (model, look, phone variant)

Not started.

## 2. Animation (mocap pipeline, Iris clips, side-cars)

Not started.

## 3. Townsfolk (13 people, clips, behaviour in the town)

Not started.
