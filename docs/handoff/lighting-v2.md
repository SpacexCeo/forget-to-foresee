# Handoff: lighting and town start (branch `claude/lighting-v2`)

Task: finish the lighting and the start in the town (owner priority: shadows, atmosphere, weather, lighting).
A fresh session can continue from this file and git alone. Last update: 11.11.2026.

## Done (pushed)

| What | Where |
|---|---|
| Previous atmosphere worker's saved diff (`/root/save/_root_w_atmo_ftf.patch` on the server) compared with `main`: everything in it is already merged, nothing was lost | (no change) |
| Start in the town verified on real WebGL, desktop and phone layout: loading screen with real progress, lobby, the screen coming back while the town streams, first town frame complete, no pop-in | `tools/gpu-server/flow-cap.cjs` |
| Spawn camera: Iris starts 4.5 m up the street from the gate point, the gate arch no longer pushes the camera into her | `game/src/scenes/town-layout.js` (`SPAWN_ADVANCE`) |
| Altar transition cover shows real progress of the archipelago's first view | `game/src/scenes/town-flow.js`, `game/src/boot-world.js` (`islandProgress`) |
| Town `afternoon` hour (default), archipelago golden hour retuned, `sunWarm`, altar amber and hero light | `game/src/render/sky.js`, `lookdev.js`, `game/src/scenes/town.js` |
| Wind on banners, awnings and trees from computed weights; chimney smoke, birds, drifting sky islands | `game/src/render/weather.js` (`windWeights`), `game/src/scenes/town-life.js` |
| Weather (`?weather=overcast|rain`) and dusk (`?tod=dusk`) checked in the town; frame time per tier | `docs/atmosphere.md` section 3 |

## Half-done / not done

1. **Well water** (`M_Town_Water`) has no shimmer.
2. **Sun shafts in the town**: the post stack's rays exist (ultra, high) but were tuned on the archipelago; not
   re-tuned for the afternoon sun behind the camera. Dust motes run with the archipelago settings.
3. **Low and phone tiers have no hero point light** (`pointLights: false`): the altar glows but does not light the
   dais there. A cheap fix would be a decal or a vertex-colour tint under the altar.
4. **Banner shadows do not sway** (the shadow pass uses the unpatched depth material).
5. **Transition camera** lifts toward `altar_focus` and can clip the shrine roof for a few frames just before the
   cover is opaque.
6. Frame times are from the RTX 5090 server only; the minimum machine and a real phone are not measured.
7. The first metres inside the gate (behind the spawn point) lie in the gate tower's shadow with the afternoon sun
   in the south; the spawn frame itself is sunlit (`docs/atmosphere/v2/after-town-spawn.jpg`).
8. No GPT colour references (`L-001_*`) had arrived on the board when this pass was done.

## How to resume

- Server (while rented): work dir `/root/w/light/` (`ftf/` is a source copy without git, `shots/` the captures);
  NVIDIA GL libraries and Playwright are in `/root/w/atmo` (`. /root/w/atmo/env.sh`). Sync = tar of `game/`
  (without `public`, `node_modules`, `dist`) and `tools/gpu-server/`, then `npx vite build` and
  `npx vite preview --port 4195`. Host and token live only in the sessions.
- Look frames: `node tools/gpu-server/atmo-cap.cjs --url http://127.0.0.1:4195 --out shots/x --loc town,isle`
  (`--shots`, `--query "weather=rain"`, `--look '{…}'`, `--perf`, `--profile phone`).
- Start flow: `node tools/gpu-server/flow-cap.cjs --out shots/flow [--profile phone] [--throttle 20000]`.
- Without the server the same scripts run with `--swiftshader` on any machine (slow, look only).
- Checks: `cd game && npm test && npm run build`.
