# Task L report: look-dev pass (branch `claude/lookdev`)

**Status: stopped on the lead's wrap-up order, 08.11 ~18:05 UTC.** Branch merged with `origin/claude/loving-curie-ihasft`
(396fbfc), `cd game && npm test` 389/389, `npm run build` green, pushed.

## Done
- `docs/lookdev.md`: method (fixed reference cameras from a frozen production build, deterministic under reduced motion),
  audit of the previous look (8 findings), change table, before/after, low-tier / reduced-motion / phone notes, open items.
- `game/src/render/fog.js`: analytic height-fog integral along the view ray, aerial cool shift, warm sun lobe, slow
  drifting banks of mist; every parameter in shared typed-array uniforms (`FOG_UNIFORMS`), so presets and the tint reach
  all materials at once.
- `game/src/render/clouds.js`: a lit deck plus a raymarched cloud slab on ultra (28 steps) / high (16); deck only on low
  and phones. Billows about 70 m, sun shadow, Henyey-Greenstein scatter, powder term, jitter.
- `game/src/render/materials.js`: pure `slotForMaterial` (fixes two visible defects: the whole Amber camp rendered as an
  emissive blob, the Shell interior floor rendered as nacre), pearl rim and slow shimmer on nacre, quartz as glass,
  anisotropic filtering on loaded textures.
- `game/src/render/post.js`: bloom threshold 1.18 (emissives only), GTAO at the tier's scale, SMAA on ultra, god rays at
  `raysScale` in the sun colour, soft grade with vignette and grain; sprites and transparent meshes hidden from the AO
  g-buffer (the agent nameplates rendered as black boxes before).
- `game/src/render/foliage.js`: gust fronts in the world wind direction, drooping tips, backlight. `motes.js`: air specks
  (new tier knob `motes`; 0 on phone/low). `lookdev.js`: light rebalance (sun 5.0, dimmer fill, +0.25 EV), lantern flicker,
  `setPreset` at runtime, `sky.tint` (collab request §6 answered), `stats().preset`.
- `sky.js`: fog presets, warmer haze base, a second horizon cumulus band, darker cloud cores.
- Tests: `game/tests/client/lookdev.test.mjs` (10 node tests, in `npm test`). Tool: `game/tests/client/lookdev-capture.mjs`.
- Collab: `docs/collab-requests.md` §7 (look API for tasks J/K, tint hook) and §8 (task O: chamber exposure).

## Not done
- After-frames for bridge, camp, Shell exterior, inside and the 1920×1080 / 390×844 sets (about 50 minutes of SwiftShader
  rendering; the exact commands are in `docs/lookdev.md` §3); the phone re-measurement.
- Chamber exposure behind the Shell glass (task O's file), banner cloth wind (no banners placed yet), a GPU look at SMAA
  and anisotropy, the `docs/decisions.md` row is added (see below), no README change was needed.

## How it was checked
- `npm test` 389/389 after the merge; `npm run build` green; after-frames `docs/lookdev/after/` (overview, plaza, ultra
  1280×800) against `docs/lookdev/before/` (23 frames); intermediate frames confirmed the interior floor fix, the slab on
  ultra and the low tier with no console errors. Every frame was rendered with reduced motion (deterministic path).
