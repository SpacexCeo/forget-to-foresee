# Mobile play (phones)

State on 08.11.2026, branch `claude/mobile-play` (worker task E). Owner files: `game/src/ui/input.js`,
`game/src/render/quality.js`, `game/src/render/lookdev.js`, tests `game/tests/client/mobile-run.test.mjs` and
`game/tests/client/quality.test.mjs`.

## What a phone gets

- **Touch controls** (`input.js`): tap = walk there, one-finger drag = orbit, pinch = zoom (as before), plus
  **double-tap = run to that spot** (the next single tap walks again) and a **run toggle button**: 52 px round
  button at the bottom right, above the mobile dialogue bar and beside the gold prompt pill, shown only in the
  world and only on touch devices (coarse pointer, or once a touch is seen). It is sticky until tapped again and
  survives blur; the double-tap burst is dropped on blur and scene transitions. All three sources feed one flag:
  `input.running`, which `down('ShiftLeft', 'ShiftRight')` also reports, so `main.js` (`player.run = input.down(...)`)
  needed no change. Keyboard and gamepad behaviour is untouched. The button injects its own `<style>`
  (`.ftf-run-toggle`), no locale key (icon only, `aria-label="Run"`).
- **Phone render profile** (`quality.js`, `lookdev.js`): the tier names stay `ultra | high | low`, so the
  settings preference, the VFX `tierConfig(tier)` and the dev HUD keep working; a second *profile* chooses the knob set:

  | knob | desktop low (unchanged) | phone/high (also `ultra`) | phone/low |
  |---|---|---|---|
  | pixel ratio cap | 1 | **1.5** (the screen is small: sharpness buys more than effects) | 1 |
  | post stack | off | off | off |
  | sun shadow map | 1024 | 1024 | 512 |
  | grass blades / flowers | 5000 / 250 | 1800 / 90 | 700 / 30 |
  | grass fade distance | 40 | 32 | 24 |
  | cloud layers | 1 | 1 | 1 |
  | transmission / iridescence / point lights / baked HDR | off | off | off |

  The desktop tiers are not touched (`qualityFor(tier, 'desktop') === QUALITY[tier]`, tested).
- **Tier choice on phones** (`detectTier` with `mobile: true`): `low` when `deviceMemory <= 2` (browsers round
  to powers of two, so 3 GB phones report 2), `hardwareConcurrency <= 2`, a software renderer, Adreno below 610,
  Mali-T / Mali-G5x / G71 / G72 / Mali-400 or PowerVR SGX/GE/GX; everything else, including iPhones (no memory
  or core numbers exposed), starts on `high` and leaves the rest to the governor. Before this change every phone
  got `low`.
- **Profile choice** (`detectProfile`): a phone user agent (`Mobi|Android`), or a coarse primary pointer on a
  screen whose short side is at most 600 CSS px. Tablets with a desktop user agent stay on the desktop profile.
  `?profile=phone|desktop` overrides it (QA on a desktop), like `?tier=`.
- **Dynamic step-down** (`TierGovernor` with `GOVERNORS.phone`): budget 1000/30 ms, 6 s warm-up (asset
  streaming hitches), a 90-frame window (about three seconds at 30 fps), p75 above budget + 12 % steps the tier
  down once (`high → low`), after an 8 s cooldown it lowers the **render resolution** to 0.85 and then 0.7 of the
  tier's pixel ratio (`lookdev.setPixelScale`), then stops judging; it never steps up (no oscillation) and gives
  up after 120 s of play. Desktop keeps the old parameters (58 fps budget, 40 s, no resolution steps).
- Unchanged from the 08.11 fix: phones load the `_m` model variants (2048 textures) via `setModelVariant` in `main.js`.

## Measurements

Method: headless Chromium (Playwright, `devices['iPhone 13']` = 390×664 CSS at 3×, `devices['Pixel 7']` =
412×839 at 2.625×), `/?play=direct`, wait for the play layer and for streaming to settle, then 15 s, read
`window.__ftf.perf()` (rolling 240-frame window), `renderer.info`, the loaded textures (sum of the KTX2 mip
data, i.e. the GPU footprint of the transcoded textures) and `lookdev.stats()`. Script: the session scratchpad
`measure.mjs` (not in the repo; it is 60 lines of Playwright around `window.__ftf`).

**Frame times are not phone numbers.** The container has no GPU: Chromium renders through SwiftShader (CPU), at
120–190 ms per frame regardless of resolution, and `dt` is clamped at 250 ms. They only show that nothing got
slower; the device-independent numbers (draw calls, triangles, texture memory, pixel ratio, chosen tier) are
the real result. A run on a physical iPhone/Pixel is still owed (see below).

| | before (every phone = desktop `low`) | after, phone/high (`?tier=high`) | after, phone/low (`?tier=low`) |
|---|---|---|---|
| iPhone 13: tier / profile | low / – | high / phone | low / phone |
| iPhone 13: render size (pixel ratio) | 390×664 (1) | **585×996 (1.5)** | 390×664 (1) |
| iPhone 13: draw calls / triangles | 43 / 129,356 | 43 / 112,396 | 43 / 106,536 |
| iPhone 13: textures (count / MB / max side) | 61 / 175 MB / 2048 | 61 / 175 MB / 2048 | 61 / 175 MB / 2048 |
| iPhone 13: avg frame (SwiftShader) | 147 ms | 132 ms | 143 ms |
| Pixel 7: tier / render size | low / 412×839 (1) | high / **618×1258 (1.5)** | low (auto) / 412×839 → 0.85 → 0.7 |
| Pixel 7: draw calls / triangles | 42 / 126,910 | 42 / 109,950 | 42 / 104,090 |
| Desktop 1280×720 (`low` on SwiftShader) | 78 / 243,916 | 78 / 243,916 (unchanged) | – |

Governor, Pixel 7 emulation in auto mode (SwiftShader detects `low`, frames far over budget): tier `low` from
the start, `pixelScale` 0.85 at t = 25.8 s of game time and 0.7 at t = 53.3 s, no console errors. With
`?profile=phone` on a 1280×720 desktop window the phone knobs apply and the run button shows (QA path).

Budgets (spec §10, mobile): ≤ 65 draw calls ✓ (42–43), ≤ 180k triangles ✓ (104–112k). Texture memory is ruled by
the `_m` variants (decision of 08.11), 175 MB for the start area; this task did not change textures.

## QA on a desktop

- `/?play=direct&profile=phone` — phone knobs plus the run button in a desktop window; `&tier=low` for phone/low.
- F3 dev HUD shows `quality <tier>` and the pixel ratio (the profile is in `lookdev.stats().profile`;
  the HUD line itself belongs to `dev-hud.js`, not changed here).
- Chromium DevTools device toolbar: iPhone 13 / Pixel 7 presets give the phone profile through the user agent.

## Not done / open

- **No run on a physical phone yet.** The numbers above come from a software renderer; the 1.5× cap and the
  grass counts of phone/high are a judgement call to be confirmed on an iPhone 13 / Pixel 7 class device
  (expected: 30 fps; the governor covers the miss).
- VFX on phones: `game/src/play/game.js` creates the VFX with `lookdev.tier`, so a strong phone gets the VFX
  `high` preset. Request to task A in `docs/collab-requests.md`: cap VFX at `low` when `lookdev.profile === 'phone'`
  and re-apply on `lookdev.onQualityChange`.
- Haptics / a visible "running" state on the avatar beyond the existing run clip: not touched.
- `aoScale` / `raysScale` in the desktop tiers are declared but the post stack ignores them (the god-rays
  pass always runs at quarter res, GTAO at full res). Left as is: desktop tiers are out of this task's scope.
