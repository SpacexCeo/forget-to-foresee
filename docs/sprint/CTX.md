# Sprint context contract (real field names)

`mountSprint(ctx)` is called once from `game/src/boot-world.js` when the town is set up (the line next to the player
HUD mount). Every module's `mount(ctx)` receives this object. Names are the real ones in the code today.

| Field | What it is |
|---|---|
| `THREE` | the three.js namespace |
| `scene`, `camera`, `renderer` | the world scene, the camera (follows `rig`), the WebGL renderer |
| `player` | the player body: `pos` [x, y, z] world, `heading`, `run`, `teleport(pos, heading)` |
| `ledger` | the town ledger (`game/town-economy.js`): `silk` (hundredths), `xp`, `level` {level, into, need, title}, `subscribe(fn)` |
| `town` | the town world: `world` (colliders), `ready`, `altar`, … |
| `chests` | the chest bag (`game/chests.js`): `sealed()`, `subscribe(fn)` |
| `t(key, args)` | translate (ICU); on touch devices `<key>.touch` wins when it exists |
| `toast(text)` | one toast (the HUD stack in the town) |
| `reduced()` | true under reduced motion (system or the in-game setting) |
| `storage` | the safe storage wrapper (`ui/storage.js`): `getItem`, `setItem`, `removeItem` |
| `keys` | the input (`ui/input.js`): `down(code)`, `hit(code)`, `moveAxes()`, `touchControls` |
| `flags` | feature flags (`features.js`): `on(name)`, `subscribe(fn)` |
| `i18n` | the i18n instance (`t`, `locale`, `subscribe`) |
| `bus` | `src/sprint/bus.js`: `emit`, `on`, `once`, `state` |
| `markers` | `src/sprint/markers.js`: `setMarkers`, `getMarkers`, `onMarkers` |
| `tooltip` | `src/sprint/tooltip.js`: `showTooltip`, `attachTooltip`, `hideTooltip` |
| `silk` | `src/sprint/silk-view.js` (A3): `silkView()`, `subscribeSilk`, `syncSilkNow` |

Not in `ctx` (import them): `autoWalkTo` from `src/sprint/auto-walk.js` (A1), `registerTip` / `showTip` from
`src/sprint/first-seen.js`, `retryImport` from `src/sprint/retry-import.js`. Each module runs its own `update(dt)`
from the sprint's frame loop (no edit to `boot-world.js` per frame). The portal fee comes from
`game/expedition-config.js` `portalFee()`, never a literal.

Locale seams: `game/src/play/locales/en-quests.js` (A1), `en-hud.js` (A2), `en-market.js` (A3), `en-npe.js` and
`en-tips.js` (A4), `en-video.js` (A5). `en.js` merges them; other locales fall back to English for those keys and the
parity tests skip them (`sprint-keys.js`).
