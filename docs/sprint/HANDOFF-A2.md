# Hand-off: A2 (HUD, hotbar, skills, progression, skill tree, controls)

Branch `claude/elise-v2` (the lead merges to `main`). Every claim below has a test or an e2e check; what is not done is listed at the end.

## What exists

| Piece | Files | Tests |
|---|---|---|
| Progression: levels 1 to 20 on the ledger's curve (50·n·(n+1)), skill/stat points, Voice/Mind/Grit, derived HP, mana, regeneration, crit | `game/src/rpg/progression.js` | `tests/rpg/progression.test.mjs` (the whole 5.6 table) |
| Skills: 4 base skills (existing timings), 15 nodes, learn rules, respec (free, then 5 min), passives, cast validation order, own and global cooldown, mana, active effects, damage pipeline (brace, shield, unbroken), hotbar layout | `rpg/skills-data.js`, `rpg/skills.js` | `tests/rpg/skills.test.mjs` |
| HUD layer: frame, buffs, target, minimap, cast bar, hotbar with sweeps, XP bar, Log/Chat/Loot, silk chip, tray, level-up banner; phone layout | `rpg/index.js` (`mount(ctx)`), `rpg/hud.js`, `rpg/hud-style.js`, `rpg/minimap.js`, `rpg/silk-chip.js` | `tests/rpg/hud.test.mjs`, e2e `tests/e2e/rpg-hud.mjs` |
| Skill tree (N), character panel (C) | `rpg/skill-tree-ui.js`, `rpg/character-panel.js` | unit (states, tooltips) and e2e (learn, slot 5, respec, + stat) |
| Keys: hotbar 1-9, J M N C I B T X F1, fixed L and Tab; `rebind()` with reserved keys and the swap question; the rebind screen and the drawn keyboard | `ui/keybinds.js`, `ui/settings-popup.js`, `ui/keyboard-map.js` | `tests/client/settings-controls.test.mjs`, `tests/client/settings.test.mjs` |
| Float numbers of 5.13 (taken, heal, miss, crit "34!", "+3 silk", XP merge) | `ui/float-numbers-core.js`, `ui/float-numbers.js` | `tests/client/float-numbers.test.mjs` |
| English strings | `play/locales/en-hud.js` (fallback in `rpg/hud-text.js` until the seam merges it into `en.js`) | jargon and literal-price scan in `hud.test.mjs` |

E2E (`node game/tests/e2e/rpg-hud.mjs <out> <dev server url>`, GPU server, 13 Nov): E1 rectangles ±2 px and no overlap with the tracker slot; E2 slot 2 lance spends mana and cools down, slot 1 strikes; E3 level-up banner, log, max HP; E4 tree learn and slot 5; E5 respec; C panel stat point; E6 Strike rebound to G strikes in the field and is stored; E7 low-HP vignette; E9 phone 5 slots ≥ 44 px, no overlap. All green.

## Wiring (A5)

```js
if (flags.rpgHud) import('./rpg/index.js').then((m) => { rpg = m.mount({ ledger: townLedger, player, t: (k, a) => ctx.i18n.t(k, a), storage: ctx.storage,
  active: () => inTown, mobs: () => townMobs, base: import.meta.env.BASE_URL, silk, markers, bus, floatNumber: numbersHook,
  openSettings: (tab) => settingsPopup.open(tab), skin: () => irisAvatar && irisAvatar.hero.id, ui: { open: (id) => ..., openWallet: () => ... } }); });
// every frame: if (rpg) rpg.update(dt);
```

`en.js`: `Object.assign(EN, hud)` with `import hud from './en-hud.js'`.

## For the other agents

- A1: tray buttons `#rpg-tray-journal`, `#rpg-tray-map`; tracker slot 1576, 268, 320 × 420 is kept free. Without `ctx.ui.open` the HUD sends `ftf:open-window` {id}.
- A3: `#rpg-tray-bag`, `#rpg-tray-market`, the silk chip `#rpg-silk` (click → `ctx.ui.openWallet` or `ftf:open-window` {id: 'wallet'}); it reads `ctx.silk.silkView()` when given, else the shared model of `net/silk-core.js` (`silkView()`, Sync calls `syncSilkNow()`).
- A4: F1 opens Settings → Controls (the table and the keyboard) through `ctx.openSettings('controls')`.
- A5: e2e hook `window.__ftfTest.rpg` with `?test=1`: `grantXp(n)`, `setLevel(n)`, `learn(id)`, `cast(slot)`, `state()`.

## Not done or cut

- Voice and Clear Diction add their share of each fight hit as a follow-up hit (bus `mob.hit`, e2e checked). Insight's mark is applied to Echo and Babel only.
- Max HP above 100 works through scaling: the fight still counts 0..100, read as the share of her max HP, and each hit is applied in real HP through the defences.
- The phone hotbar shows slots 1 to 5; there is no swipe-up drawer for 6 to 9. The phone log is hidden under 480 px wide (the town market ticker sits where the one-line ticker would go).
- No buff icons art (text squares with the seconds left); no E8 e2e yet (the chip now reads the same `net/silk-core.js` view as the other surfaces; the cross-surface equality check is left for A5's first-ten e2e); E10 reduced motion is CSS only.
- The market ticker and the chat/online chip are moved by this layer's CSS while it is on (desktop: above the Log; phone: one row above the hotbar). The settings gear still touches the minimap's edge.
- F1 opens a read-only cheat sheet (`rpg/cheat-sheet.js`); E8 checks the chip against `net/silk-core.js` `silkView()`. The e2e now runs on the seam's own mount (`?ff=rpgHud,hotbar,skillTree,damageNumbers&test=1`): 15/15 green on the GPU server, 13 Nov morning.

## Glass Shoal arena look (13 Nov, flag `glassShoal`, off by default)

Nothing on the default path: the look lives on its own page `game/shoal.html` (a Vite input), and the game's main page does not import it. Boot check on the built page (`FTF_BASE=/forget-to-foresee/`, software GL): `shoal.html` shows the gate without the flag and renders with `?ff=glassShoal` (desktop and `?profile=phone`), 0 page errors. The main page reaches town-ready with and without `?ff=glassShoal`, 0 page errors.

**Done**
- `game/src/render/shoal-look-data.js` (pure): 16 parameters with ranges, presets `lowSun` (default), `pearlDawn`, `stormSilver`; `clampParams`, `lookJson`; light direction and colour; quality per tier/profile; the grade curve and its 16³ LUT strip; `lookFromQuery`. Tests: `game/tests/render/shoal-look.test.mjs` (5).
- `game/src/render/shoal-look.js`: `createShoalLook({renderer, scene, camera, tier, profile, params, reduced})`. It builds:
  - the sky dome, with no sun disc (owner 13.11: "light, no sun"), only a broad glow toward the light;
  - a hemisphere fill;
  - CSM on desktop (3 cascades high, 4 ultra) and a single shadowed directional light on phones;
  - FogExp2 and low mist sheets;
  - the flat: a planar `Reflector` with a ripple normal, a roughness blur, a wet/dry mask and a broad sheen on desktop; on phones a `MeshPhysicalMaterial` with a PMREM sky reflection, so the scene is never rendered twice;
  - the post chain: RenderPass → GodRaysPass (0 in every preset and skipped at 0) → bloom (HDR threshold 2.2, so only crystals glow) → OutputPass → LUT grade with vignette.
  - API: `attach(obj)` (shadows plus CSM material setup), `crystal(hex, k)`, `update(dt, focus)`, `render()`, `setSize()`, `set(params)`, `dispose()`.
- `game/src/render/shoal-panel.js`: the `?render=1` panel (sliders, presets, Copy JSON, Reset, fps/quality line; folds on Esc or a tap outside; starts folded on touch).
- `game/src/shoal-preview.js`: the preview scene. Placeholder monoliths, spires, rocks and a capsule stand in for the real layout; camera drift; `?tier=`, `?profile=`, `?still=1`, `?shoalLook=`.
- Still: `docs/art/shoal/nosun_lowSun_swiftshader.jpg` (software GL).

**Half-done**
- Tuned only under software GL. The look still needs a pass on a real GPU: exposure, haze amount, and the shoal colour against the rocks.
- No fps numbers yet. Phone light tier is designed for ≥ 30 fps but not measured.
- The "Light height / Light bearing" keys are still named `sunHeight` / `sunBearing` in the data and JSON.

**Next**
- GPU stills (desktop high, phone light, the three presets, the panel) and fps on the GPU server; retune exposure and haze there.
- Agree spawn points and the layout with the Glass Shoal gameplay seat (branch `claude/glass-shoal`). Its scene should call `createShoalLook(...)`, then `attach()` on its meshes, `update(dt, player.position)` and `render()` each frame. The preview dressing is not meant to ship.
- Hook the look into the level-5 boss island when the gameplay seat mounts it, behind the same flag.
