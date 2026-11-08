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
   render, physics) loads behind it, the play layer (99 KB gzipped) loads on entering; on the direct path the screen
   hands off when the first frame and the cheap visible models are in, or after six seconds. `index.html` preloads
   only the boot chunk.
4. **Byte-aware streaming**: visible assets ordered by apparent size weighted by file size, three downloads at once,
   a first-frame gate that skips files above 8 MB.
5. **Phones**: `_m` variants and the KTX2 transcoder confirmed in the phone run.
6. Tests: 7 new, `npm test` 386/386, `npm run build` green.

## Checked

- Headless Chromium: SMOKE_RESULT
- After measurement: AFTER_SUMMARY

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
