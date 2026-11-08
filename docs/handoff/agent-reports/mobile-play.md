# Task E report: mobile play (touch run, phone quality tier)

Branch `claude/mobile-play` (based on `claude/loving-curie-ihasft` = `main` + worker docs), three commits.
Files touched: `game/src/ui/input.js`, `game/src/render/quality.js`, `game/src/render/lookdev.js`,
new `game/tests/client/mobile-run.test.mjs`, `game/tests/client/quality.test.mjs`, `game/package.json` (test
script), new `docs/mobile.md`, one row in `docs/decisions.md`, the Mobile item in `docs/HANDOFF.md`, a request
block in `docs/collab-requests.md`. `game/src/render/post.js` was not changed (phones take the direct render
path, so there was no post pass to cheapen; reasons in `docs/mobile.md`). No file outside task E's paths was edited.

## Done

1. **Measured first** (`docs/mobile.md` §Measurements): headless Chromium with `devices['iPhone 13']` and
   `devices['Pixel 7']` on `/?play=direct`. Before: every phone got the desktop `low` tier at pixel ratio 1,
   43 draw calls, 129k triangles, 175 MB of KTX2 texture data in the start area, no run control.
2. **Run on touch** (`input.js`): a 52 px run toggle button at the bottom right (above the mobile dialogue bar,
   beside the gold prompt pill; overlap-checked against every world-HUD element at 390×664) and double-tap-to-run
   (the next single tap walks again). Both feed the same flag Shift sets: `input.running`, which
   `down('ShiftLeft', 'ShiftRight')` also reports, so `main.js` (task A's file) needed no change. Keyboard and
   gamepad paths are untouched (tested: Shift still works, no fake key is injected, `down('KeyW')` unaffected).
3. **Phone tier** (`quality.js`, `lookdev.js`): a second quality *profile* that keeps the tier names so settings,
   VFX and the dev HUD keep working. phone/high: direct render at up to 1.5× pixel ratio, 1k shadows, 1800 grass
   blades; phone/low: 1×, 512 shadows, 700 blades. `detectTier` starts capable phones on `high` and sends weak
   ones (`deviceMemory <= 2`, `<= 2` cores, software renderer, Adreno < 610, Mali-T/G5x/G71/G72, PowerVR SGX) to
   `low`. `detectProfile` uses the user agent, a coarse pointer and the screen's short side (≤ 600 px);
   `?profile=phone|desktop` overrides for QA. Desktop tiers and the desktop governor are unchanged (tested).
4. **Dynamic step-down**: the phone governor targets 30 fps, steps `high → low` after a 90-frame window
   (about three seconds) with p75 over budget, then lowers the render resolution to 0.85 and 0.7 of the tier's
   pixel ratio, never steps up, stops after 120 s. A new `shadowMap: 0` knob turns the sun shadow off (not used
   by any tier yet).
5. **Tests**: 12 new tests (5 run-control, 7 quality), all pure / fake-DOM, no WebGL. `cd game && npm test`:
   272/272 green; `npm run build` green.
6. **Re-measured** after the change (`docs/mobile.md`): iPhone 13 phone/high renders 585×996 (was 390×664) with
   the same 43 draw calls and 112k triangles (was 129k); phone/low 106k. Pixel 7 the same picture. Desktop
   `/?play=direct` unchanged (78 draw calls, 243,916 triangles, same as before), `?tier=ultra` renders with the post
   stack, `?tier=low` and `?profile=phone` render; no console errors in any run.

## Not done

- **No run on a physical phone.** The container has no GPU, so Chromium renders through SwiftShader at 120–190 ms
  per frame whatever the resolution; the frame times in `docs/mobile.md` prove only that nothing got slower. The
  1.5× cap and the grass counts of phone/high are a judgement call to be confirmed on an iPhone 13 / Pixel 7
  class device; the governor covers a miss (it steps down within seconds and then drops the resolution).
- **VFX on phones** still follow `lookdev.tier` (`high` on a capable phone). The one-line cap for task A is in
  `docs/collab-requests.md` (task A owns `game/src/play/game.js`).
- "Lighter textures" (HANDOFF item 6, third part) were not in this task's steps; the `_m` variants from 08.11 stand.
- The F3 dev HUD does not print the profile (`dev-hud.js` is outside task E's paths); `lookdev.stats().profile`
  carries it and the request is noted in `docs/collab-requests.md`.

## How it was checked

- `cd game && npm test` 272/272 (was 260 before the task), `npm run build` ok.
- Browser (Playwright, Chromium + SwiftShader, iPhone 13 and Pixel 7 presets, `/?play=direct`): the button
  appears at (330, 516) 52×52 on the 390×664 iPhone viewport with no overlap against the HUD; a touch tap sets
  `aria-pressed="true"` and `player.run` becomes true, a second tap clears both; a synthetic touch double tap on
  the canvas sets `player.run`, a single tap elsewhere clears it (Playwright's own `touchscreen.tap` pairs arrive
  about 2.6 s apart under SwiftShader, outside the 350 ms window, so that part used in-page `PointerEvent`s).
- Governor watched live on Pixel 7 emulation in auto mode: `pixelScale` 1 → 0.85 (t = 25.8 s) → 0.7 (t = 53.3 s),
  render size follows, no errors.
- Screenshots of before/after sit in the session scratchpad only (not committed: no binaries in docs).
