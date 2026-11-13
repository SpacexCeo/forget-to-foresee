# Handoff: the Glass Shoal gameplay (boss gameplay seat, 13 Nov)

Branch `claude/glass-shoal`, flag `glassShoal` (off; `?ff=glassShoal` previews it, `&shoal=reach_stone` jumps the quest).
The default path loads nothing new: `scenes/glass-shoal.js` is imported only with the flag, `scenes/shoal-arena.js` only when the ride starts.

## Done (checked at d74ce52: npm test 1200/0, built page boots with and without the flag, the flow driven in Chromium)
- The main quest "The Call of the Shoal" unlocks at level 5. There is a gold ray over the Shardkeeper and a shimmering tracker line, and the offer card opens on E or a tap (never by itself).
- The Loomblade spot (town [-26,60]) and the cliff stone (town [24,106], on the flat beside the Crownrift lookout).
- The dragon landing, mount (E or a tap), and the leashed corridor ride (~47 s), with Skip; reduced motion skips straight to the landing.
- The arena scene graph and the Hollow Tide in three phases: slam ring, sweep band, lunge line, adds in phases 2 and 3, a weak point after a dodge, HP and stamina orbs, death back to the landing at the phase checkpoint.
- The reward: a legendary chest, 600 XP, the title Tidebreaker. Fly home from the chest or the landing.
- The fight HUD (boss bar with phase marks; health, stamina and mana bars; three tap-able skill buttons). Text in five locales.

## Half-done (in 9222dc9, NOT checked after the owner's stop: run npm test and the boot check before merging)
- The town HUD and the touch action buttons hide during the ride and the fight (`body.gs-owned`); the stick stays.
- A 3 s grace before the first slam; slam damage 24.
- `arena.debugWin()`, and a `glassShoal.arena` getter (A2 needs it; it is already here).

## Next
1. **Elise's kit** (owner addition, `glass-shoal-boss.md` section "Elise's kit"): casts, take-off and flight with air control, a stamina bar, an ultimate. Where it plugs in:
   - skills: `game/src/rpg/shoal-skills.js` (ELISE_SHOAL; add the flight and ultimate entries);
   - movement: `shoal-arena.js` `update()`, movement block (`me3.lift`, today only a hover during the dodge); add a held flight state that drains stamina via `game/shoal-rules.js` HERO / `heroTick`;
   - stamina bar: it already exists in the fight HUD (`.sa-st`). For the town, `scenes/player-hud.js` + `game/stamina.js`.
2. Put the Shoal skills on the RPG hotbar and skill tree (`game/src/rpg/index.js`, `skills-data.js`, `skill-tree-ui.js`); today they live only in the arena HUD.
3. Touch QA on a phone: ride steering with the stick, skill buttons, Skip.
4. A2's look (`render/shoal-arena-look.js` on claude/elise-v2) hides `look.floor/sun/fill` while the arena is up. Keep the `look` keys stable.
5. A ride home (today a cut back to the stone) and the tuning pass on boss numbers (`BOSS` in `shoal-rules.js`).

## File map
| File | What |
|---|---|
| `game/src/game/shoal-rules.js` | pure rules: quest steps, ride corridor, arena layout, hero, boss phases and attacks, adds, pickups, checkpoints |
| `game/src/rpg/shoal-skills.js` | Iris's Loomblade moves, Elise's gift (data) |
| `game/src/locales/shoal.js` | text, five locales |
| `game/src/scenes/glass-shoal.js` | town side: quest glow, tracker, prompts, offer card, blade, stone, dragon, ride; owns the heroine while riding or fighting |
| `game/src/scenes/shoal-arena.js` | arena scene graph (`look`, `spawns`), fight runtime, fight HUD |
| `game/src/boot-world.js` | mount behind the flag (`mountShoal`), input hand-off, avatar pose, E in town |
| `game/tests/client/glass-shoal.test.mjs` | 14 rule tests |

## Placeholders waiting for Fable's assets
Names in `MODELS` (`glass-shoal.js`): `shoal_dragon` (pearl dragon, saddle socket), `loomblade` (sword), `hollow_tide` (serpent). The loaders already call `hasModelFile`/`fetchGltf` and swap the placeholder when the file is in the catalog. Clips are not wired yet: the dragon's glide, flap, bank and land; the boss's rise, slam, lunge, sweep and death; Iris's sword moveset (today it reuses `strike1..3` and `dash`); Elise's flight and casts.
