# VFX system (`game/src/vfx/`)

GPU particles plus mesh and screen-space effects for game events. Dev page: `game/vfx.html`
(`npm run dev`, then `/vfx.html`; `?fx=<name>&t=<s>&tier=<tier>` plays one effect and freezes it at t).
QA captures (headless Chromium, SwiftShader): `docs/vfx-qa/`.

## API
```js
import { createVfx } from './vfx/index.js';
const vfx = createVfx(scene, camera, renderer, { tier: 'ultra', reducedMotion: false });
const h = vfx.play('anchor_plant', { position: [x, 0, z] }); // handle: { stop(), set(opts), done }
vfx.update(dt);       // every frame, before rendering
vfx.dispose();
```
Extra: `attachToComposer(composer)`, `setQuality(tier)`, `setReducedMotion(on)`, `stats()`,
`hooks.skyTint = (hexColor, amount) => {}` (called when the tension level changes), `names`.

Common opts: `position` ([x,y,z] or Vector3), `scale` (spatial), `count` (particle multiplier),
`follow` (Object3D tracked every frame, e.g. a hovering Shell), `seed`.

| name | duration | what | extra opts |
|---|---|---|---|
| `logogram` | 9.5 s | Guest sign drawn stroke by stroke (SDF ink field), glows gold-nacre, settles to dark ink with a gold rim | `forms` [4 ids 0..3, positions clockwise from the top], `dots` 0..3, `normal` (facing, default +Z), `persist` (keep after settling) |
| `vision` | 10 s | distortion + chromatic fringe + gold tint/desaturation; memory wisps and glyph motes rise from Iris | |
| `anchor_plant` | 3.2 s | dust burst, debris, two gold shockwave rings, gold motes, flash, screen shock | |
| `storm_hit` | 8 s | crackling steel-white arcs, sparks, flare, burnt scorch with cooling embers, smoke, ash | |
| `gift` | 5 s | warm gold motes rising, glow, chime ring and light | |
| `shard_auction` | 3.5 s | crystal glints and nacre veil, pulsing light | |
| `shell_mist` | loop | mist under a Shell and drips of light; `stop()` to end | `follow` |
| `shell_crack_pulse` | loop | gold light breathing from Shell IV's crack, glow and embers along it | `crackDir`, `crackLength`, `onPulse(level)` (drive the crack material's emissive) |
| `tension` | loop, singleton | ambient embers + warm haze around the focus, rust grade in the post pass, sky tint hook | `level` 0..1; call `play('tension', {level})` again or `h.set({level, position})` |
| `vote_finale` | 12 s | six gold beams rise from the camps (layout.js) and converge, burst, pillar of light, ring | `points` (beam sources), `target` (convergence, default [0,14,0]) |

Durations of vision and finale follow spec 6.

## Integration (state on 08.11, branch `claude/audio-vfx-wiring`)

| What | Where |
|---|---|
| `createVfx(scene, camera, renderer, { tier, reducedMotion })`, lazy-loaded | `src/play/game.js` |
| `attachToComposer(lookdev.post.composer)` at start and after every quality change (`lookdev.onQualityChange`; null composer on the low tier → direct rendering); `setQuality(lookdev.tier)` | `src/play/presentation.js` |
| `setReducedMotion` follows `lookdev.reducedMotion` (checked every frame) | `presentation.js` |
| `update(dt)` every frame before `lookdev.render()` | `src/play/hooks.js` `Hooks.update` (called from `play.update`, which `main.js` runs before the render) |
| `shell_mist` looping under each of the four Shells (`follow: shell root`, so it rides the hover) | `presentation.js` |
| `shell_crack_pulse` on Shell IV from an anchor on its front at mid-height, `crackDir` along the rib lines; `onPulse` breathes the emissive of the real model's crack/glow materials when it has any | `presentation.js` |
| `tension` singleton with `level = tensionLevel(season tension)` (0 below 10, then linear to 1 at 100), following Iris; `hooks.skyTint` warms the fog and the fill light a little (a `lookdev.sky.tint` hook is used instead when the look-dev offers one) | `src/play/ambience.js` + `presentation.js` |
| `logogram` on the Shell glass when the Guest draws a sign and Iris is inside (forms and dots of the visible sign, radius of the glass glyph, facing the visitor) | `presentation.js` |
| `vote_finale` on the finale with `points` from `layout.js` CAMPS and `target` [0, 14, 0]; event cues (`VFX_MAP`, `VFX_OPTS`) | `src/play/hooks.js` |

`attachToComposer` inserts `VfxPass` before bloom and reads the scene depth from
`composer.renderTarget1.depthTexture` (PostStack's target already has one). The post stack disposes every
pass when it is rebuilt on a tier change, so `VfxPass.dispose()` is a no-op and the pass is re-inserted into
the new composer; `createVfx().dispose()` releases it for real (`release()`).

Numbers for QA: `window.__ftf.vfx.stats()` and `window.__ftf.play.presentation.state()` (mists, crack,
tension level, glass sign, footsteps, hums, tier, reduced motion).

## Design
- **Particles** (`particles.js`, `shaders.js`): instanced quads, one draw call per (atlas, blend)
  batch (6 batches prewarmed). Stateless: position is closed-form in the vertex shader (velocity,
  exponential drag, gravity, curl-noise drift after Bridson 2007), so emission writes attributes
  once and the CPU does nothing per particle per frame. Ring-buffer slots (`core.js SlotRing`),
  sub-frame birth spread for streams, premultiplied blending (one blend state for additive and
  alpha sprites), flipbooks with frame blending and random flip, procedural sprites (dot, spark,
  mote, glyph, shard star).
- **Soft particles** ("off-screen particles", GPU Gems 3 ch. 23): with a composer attached,
  particles render into their own target (half resolution on high), test against and fade near
  the scene depth, and are composited by `VfxPass` together with distortion, chromatic fringe,
  shockwave, tint and the tension grade.
- **Tiers** (`core.js VFX_TIERS`): ultra 1.0x particles, 3 lights, soft, distortion; high 0.7x,
  2 lights, half-res soft; low 0.35x, no lights, no soft particles, no screen effects. Reduced
  motion: no distortion or shock, curl halved.
- **Presets as data** (`presets.js`), validated by `validatePresets()` in the unit tests.
- **Palette** follows the brief and the style addendum: restrained, desaturated, gold accents;
  storms cold steel and ash; Guest magic nacre edged in gold.

## Flipbooks
`game/public/assets/vfx/flipbook_{smoke,dust,fire,magic}.webp`: 8x8 frames of 128 px, Mantaflow
gas sims rendered by Cycles (OptiX, RTX 5090) via `art/vfx/bake_flipbooks.py`
(`blender -b -P art/vfx/bake_flipbooks.py -- <kind> <out_dir> 128`). Grey atlases are tinted at
runtime; fire keeps its colour.

Known state: the shipped atlases come from the first bake pass. The script now holds tuned
settings (larger smoke puff, wider dust spread, flame-only fire, emission-only magic) whose
re-bake failed with GPU out-of-memory while the servers were shared; the fire atlas was
trimmed to its 28 flame frames (re-timed to 64) with Pillow. Re-run the script to refresh.
`glyphmote_formation.json` in that folder belongs to another agent.

## Tests
`game/tests/client/vfx.test.mjs` (in `npm test`): preset validation, tier scaling, SlotRing
wrap/steal, ObjectPool, Timeline (one-shot and loop), envelope, lightning path, shape bounds,
logogram strokes, draw order and raster field.
