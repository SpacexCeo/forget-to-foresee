# Townsfolk NPCs and shops with interiors — task brief

Task IDs: **N-001 townsfolk** (design, models, animation, behaviour), **S-001…S-003 shops** (exterior + walkable
interior). Brief version 1, 10.11.2026. Owner: "animation and NPC design, the townsfolk — everything at the
highest level; shops with interiors, up to three." Builds on `docs/art/town-brief.md` (T-001) and its decisions.
Quality bar: the best character work in the game so far (Iris), not below it.

## N-001 townsfolk

**Cast (10–12 distinct people, own designs):** shopkeepers for each shop, a baker or market seller, a street sweeper,
a lamplighter, a guard at the gate, an elder on a bench, two children, a musician, a courier with a satchel, a
shrine keeper by the altar. Ages, builds and heights vary (children about 1.2–1.4 m, adults 1.55–1.95 m).

**Look:** the same world as Iris and the six clan agents (stylized PBR, readable from the game camera, holds up
close). Costumes from the town's palette: linen, wool, leather, dyed felt in terracotta, ochre, moss, indigo;
small details of our world (ring-sign brooches, amber beads, shell buttons). No costume, face or character copied
from any game, film or show.

**Technical:**
- One shared humanoid skeleton, compatible with the existing agent rig (`art/agents/agent_rig.py`) so clips are shared
  and retargeting is not needed; per-character proportions through the rig's parameters.
- Faces: the smooth-face pipeline of the agents (blink, look-at bones `head`, `neck`, `eye*`), hair cards as on Iris.
- Runtime up to 16k triangles per character, one 2048² texture set (4096² only for shopkeepers seen close),
  KTX2 + meshopt via `art/tools/compress-glb.sh`, a light `_m` variant like the other models.
- Body under costume removed where hidden (no poke-through in any clip).

**Animation (shared clips, each to the 12 principles in `docs/art/character-guide.md`):** three idles (calm,
weight-shift, look-around), walk, a slow elder walk, a child run, talk (two variants), wave/greet, shopkeeper
behind a counter (wipe, arrange goods, lean, beckon), sweep, carry a basket, sit on a bench (enter, loop, exit),
play an instrument, salute (guard), react to Iris passing (nod, turn to look). Loops seamless, feet locked on the
ground, no sliding; walk speeds match the motion in code.

**Behaviour (client, presentation only; no rule changes):** each townsperson has a daily loop on paths the town
exports (`npc_*` points/routes in the town data): walk, stop, do the activity, chat in pairs; look at Iris within
6 m; step aside on narrow streets; never walk through houses; seeded so the same season looks the same on every
machine (the agents' `IdleLife` pattern). 10–15 townsfolk on screen keep the frame rate on the minimum spec
(RTX 2060 Super): shared materials, LOD or animation rate drop at distance.

## S-001…S-003 shops

Lead defaults (the owner may change them): each shop opens something the game already has, so nothing is mock.

1. **S-001 Shard Exchange** — where forgotten memories are traded: glass cases with memory shards, an auction
   pedestal, a ledger; the shopkeeper opens the existing memory-shard / auction view.
2. **S-002 Scribe of Signs** — a scriptorium of round signs: drawing desks, rolled charts, a big ring-sign wall;
   the scribe opens Iris's dictionary book ("Ask the Guests").
3. **S-003 Inn** — the warm room where travellers wait for the Tournament: hearth, tables, a counter, the six clan
   banners; townsfolk sit and talk here; atmosphere only (no new game function claimed).

**Each shop:** a distinct exterior on the square or the main street with a hanging sign (an icon, no text in the
texture), an entrance Iris walks through (a short fade/door transition is fine), an interior of about 8 × 10 m to
10 × 14 m with a counter, shelves and dressed props, warm interior light, a shopkeeper at a `shopkeeper_stand`
point, collisions. Interiors load only when entered (streaming). Budget per interior up to 80k triangles.

## Split between workers

- **Town worker (`claude/town-v1`)**: S-001…S-003 exteriors and interiors (`art/town/`), shop entry/exit in the
  client, `npc_*` path points and `shopkeeper_stand` points in the town data.
- **Townsfolk worker (`claude/townsfolk-v1`, based on `claude/town-v1`)**: N-001 everything (`art/townsfolk/`,
  `game/public/assets/models/townsfolk/`, `game/src/play/townsfolk*.js`, tests). Reads the town's points; asks the
  town worker through the lead for any new point.
- Shared GPU server: heavy Cycles bakes one or two at a time across both workers; separate work folders
  (`/root/w/town`, `/root/w/townsfolk`); everything back in git, nothing only on the server.

## Acceptance

1. In the game: townsfolk walk their loops, react to Iris, chat; shopkeepers work behind counters; no sliding feet,
   no poke-through, no walking through walls. 2. Each shop: enter, look around, talk to the shopkeeper, the existing
   function opens (S-001, S-002), leave. 3. QA: a turnaround sheet per character, a clip contact sheet, in-game
   screenshots at 1280×800 and phone layout, a short capture of the square with townsfolk. 4. `npm test`,
   `npm run build` green; the jury path still works (`?demo=judge` → town → altar → Tournament).

## I-001 Iris to the final look

Owner (10.11): "bring our Iris model to perfection; she was in work all day yesterday and still did not get the
ideal look." Iris is the hero: the jury sees her in every shot.

- **Step 1, audit (no changes yet):** rebuild the current shipped Iris from the latest sources (`art/agents/iris_hero/`,
  large sources on branch `art-sources`), render a turnaround (front, 3/4, side, back), a face close-up (neutral,
  blink, smile, the `understand` wink), the idle, walk and run at 1080p, and in-game screenshots (town and
  archipelago). Write a defect list ranked by how much it hurts the look, using the owner's earlier complaints in
  `docs/decisions.md` (09.11 Iris rows) and `docs/art/character-guide.md`. Known open item: a dark band at the front
  of the waist above the leggings' band. Post the sheets on the board for GPT review; the lead takes the list to the
  owner, who picks the target.
- **Step 2, fix:** in the order the owner approves: face and hair first (read at every distance), then silhouette
  and proportions, costume (no poke-through in any clip), materials (skin, fabric, hair shading in the game's
  lights), animation polish (idle breathing, walk, run, the wink). Each change: before/after renders, the shipped
  `agent_iris.glb` rebuilt and compressed, checked in the game with no console errors.
- **Ownership:** the Iris worker owns `art/agents/iris_hero/**`, `game/public/assets/models/agent_iris*.glb`, Iris's
  own clips. Shared files (`art/agents/agent_rig.py`, `agent_anim.py` shared clips, `game/src/play/agents.js`) change
  only with the lead's approval, because the townsfolk use the same rig.
