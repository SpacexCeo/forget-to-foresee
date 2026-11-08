# Task U report: the first ten seconds (loading and first impression)

Branch `claude/first-seconds` (from `claude/loving-curie-ihasft` at 038c6cd). Files touched: `game/index.html`,
`game/src/main.js` (now a thin loader), new `game/src/boot-world.js` (the former body of `main.js` as a lazily imported
factory; the movement and play wiring inside is unchanged), new `game/src/ui/loading.js`, `game/src/render/streaming.js`,
`game/src/render/assets.js`, `game/vite.config.js`, new `game/tests/client/boot.test.mjs` and `boot-measure.mjs`,
`game/package.json` (test script), new `docs/first-seconds.md` and `docs/first-seconds/` (raw measurements, captures),
`README.md` (the "Judge in 5 minutes" sizes and times), one row in `docs/decisions.md`.

## Done

1. **Measured first** (`docs/first-seconds.md`, raw JSON in `docs/first-seconds/`): live site and a local production
   build, cold cache, Fast 4G and Slow 4G, lobby and direct-play URLs. Before: first paint gated by the render-blocking
   Google Fonts stylesheet (0.9 s / 1.9 s), the lobby after the whole game's JavaScript (440 KB gzipped, 2.2 s / 3.3 s),
   no art on the first paint, the two 20 MB heroes early in the model queue.
2. **An inline loading screen** painted from the HTML before any script (title, ink ring breathing, progress ring),
   non-blocking fonts, the lobby art preloaded; `loading.js` takes the ring over with real progress (chunks, then the
   first frame's model bytes), a trickle that never freezes, a cross-fade hand-off through the motion tokens.
3. **A thin boot**: `main.js` is 1.3 KB gzipped; the lobby mounts from the UI chunk, the world (three.js, scenes,
   render, physics) loads behind it, the play layer (86 KB gzipped) loads on entering; on the direct path the screen
   hands off when the first frame and the cheap visible models are in, or after six seconds. `index.html` preloads
   only the boot chunk.
4. **Byte-aware streaming**: visible assets ordered by apparent size weighted by file size, three downloads at once,
   a first-frame gate that skips files above 8 MB.
5. **Phones**: `_m` variants and the KTX2 transcoder confirmed in the phone run.
6. Tests: 7 new, `npm test` 391/391 after the merge of `claude/loving-curie-ihasft`, `npm run build` green.
7. **Chunk graph kept acyclic** (`vite.config.js`): the first smoke of the merged build failed at boot with a TDZ
   error because the `ui` and `play` chunks imported each other; the rules (`src/game/`) now live in `ui`,
   `play/logogram.js` in `client-core`. Documented in `docs/first-seconds.md`.
8. **Entry modules out of shared chunks** (the lead's merge blocker, lobby → island on the production build): the
   UI preview entry (`src/ui/preview.js`) was grouped into the `ui` chunk and so ran inside the game, mounting a
   second lobby into `#app` on top of the real one; its onboarding led to the preview's greybox HUD while the real
   lobby never closed. The chunk plan moved to `game/build/chunks.js` with an entry guard and unit tests; a new
   headless smoke `tests/client/boot-smoke.mjs` (production build, Chromium) walks `/?demo=judge` → ENTER THE WORLD
   → Play as guest → Skip tutorial → Begin → Step onto the island and the direct URL: one lobby, lobby gone,
   `body.in-world`, `window.__ftf.play`, no preview controls, zero console errors. Both pass.

## Checked

- Headless Chromium (SwiftShader, `vite preview` of the production build), zero console errors or warnings on both
  paths: lobby path marks `ui` 224 ms, `lobby` 302 ms, boot screen gone at 1037 ms, world not loaded yet at that
  point (streams behind the lobby); direct path (`?play=direct&mode=walk&demo=judge`) marks `world` 240 ms,
  `firstFrame` 1.6 s, `play` 4.3 s, byte gate 7.0 s, hand-off 11.0 s (game clock runs at about a third of wall time
  under SwiftShader). Capture: `docs/first-seconds/after-direct-1280x800.png`.
- After measurement: from the production build sizes (`docs/first-seconds.md`, "After" table): the lobby needs
  about 145 KB of gzipped JavaScript instead of 440 KB, the direct path about 395 KB before the world can render
  with the play layer arriving behind the gate, `index.html` preloads only the boot chunk, and the first paint no
  longer waits for the fonts stylesheet. The throttled (Fast 4G / Slow 4G) local re-measurement with
  `boot-measure.mjs` and the live re-measurement after the Pages deploy were dropped under the wrap-up order and
  are the first next steps.

## Quality bar

- Hostile review: `?play=direct`, `#play`, touch devices (direct path); the lobby path with a returning player
  (flow skips straight to the island: the world is already loading behind the lobby); a failed import shows a
  message on the loading screen instead of a blank page; reduced motion (no ring breathing, no cross-fade distance);
  `window.__ftf` still appears once the world exists (QA scripts), `__ftfBootMarks` records the timings.
- Could not verify here: real device timings (SwiftShader), the X in-app browser, the live site after the deploy
  (measure again once `main` publishes).

## Not done / for the lead

- Per-language lazy locales (84 KB gzipped today) need the locale index and `play/i18n.js` (Codex / play owner).
- The 20 MB `scroll_table.glb` and 19 MB `anchor.glb` are the next win (art task: a lighter runtime mesh or a desktop
  2048 variant).
