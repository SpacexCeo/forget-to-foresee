# The first ten seconds (Task U: loading and first impression)

State on 08.11.2026, branch `claude/first-seconds`. Owner files: `game/index.html`, the boot in `game/src/main.js` (now a
1 KB loader) and the new `game/src/boot-world.js` (the world module), `game/src/ui/loading.js`, `game/src/render/streaming.js`,
`game/src/render/assets.js`, `game/vite.config.js`, tests `game/tests/client/boot.test.mjs`, the measurement script
`game/tests/client/boot-measure.mjs`, the raw measurements in `docs/first-seconds/`.

Goal (the task): a judge opening the live link sees something beautiful within one second and can play within five,
on a laptop and on a phone inside the X in-app browser.

## Method

`node game/tests/client/boot-measure.mjs <label> <baseUrl> <out.json>` drives headless Chromium with the cache
disabled and cleared, the network throttled through the DevTools protocol to Chrome's "Fast 4G" (4 Mbps, 20 ms) and
"Slow 4G" (1.6 Mbps, 150 ms), and records for the lobby URL (`/`) and the direct play URL
(`/?play=direct&mode=walk&demo=judge`): first contentful paint, the time the lobby (or the play layer) exists, the bytes
transferred by then (by type) and the largest resources. SwiftShader renders in this container, so frame times are not
meaningful; the network and script-arrival timings are. The live site is `https://spacexceo.github.io/forget-to-foresee/`
(what `main` publishes), the local build is `vite preview` of `npm run build`.

## Before (08.11, the build on `main` at the time)

| site | throttle / path | first contentful paint, ms | lobby or play exists, ms | KB by then | of which JS | models loaded by then |
|---|---|---|---|---|---|---|
| live (before) | fast4g/lobby | 944 | 2182 | 508 | 437 | 0 |
| live (before) | fast4g/play | 428 | 1742 | 536 | 437 | 0 |
| live (before) | slow4g/lobby | 1888 | 3332 | 508 | 437 | 0 |
| live (before) | slow4g/play | 1916 | 3349 | 536 | 437 | 0 |
| local build (before) | fast4g/lobby | 836 | 1517 | 545 | 467 | 0 |
| local build (before) | fast4g/play | 844 | 1471 | 567 | 468 | 0 |
| local build (before) | slow4g/lobby | 2148 | 3396 | 538 | 467 | 0 |
| local build (before) | slow4g/play | 2148 | 3443 | 566 | 467 | 0 |

What the numbers said:
- **The first paint waited for Google Fonts.** The `css2` stylesheet (61 KB, render-blocking) finished at 0.9 s on
  Fast 4G and 1.9 s on Slow 4G, and the first contentful paint is exactly that moment: until then the page was blank.
- **The lobby waited for the whole game.** `main.js` statically imported three.js (203 KB gzipped), the render and
  physics core, the play layer with the world HUD (55 KB), and the UI with all five locales (73 KB): about 440 KB of
  JavaScript, all of it before the first lobby pixel, at 2.2 s (Fast 4G) and 3.3 s (Slow 4G).
- **Nothing on the first paint was art.** The loading state was the body background and a small badge.
- **Models**: none had arrived by the time the lobby or the play layer existed; the streamer then loaded two at a
  time in order of apparent size, so the 20 MB `scroll_table.glb` and the 19 MB `anchor.glb` took the pipe early
  (40 s each on Fast 4G) while the camps that fill the first view waited.

## What changed

1. **An inline loading screen** in `index.html`: the title, an ink ring that breathes (CSS only) and a progress ring,
   painted from the HTML itself before any script; a tiny inline script trickles the ring until the module graph
   arrives. The web fonts load as `media="print"` and switch on arrival (`font-display: swap`), so they never block
   the paint; the lobby art is preloaded with high priority.
2. **A thin boot** (`main.js`, 1.3 KB gzipped + a 4.9 KB boot chunk): the loading module takes the ring over with
   real progress (code chunks, then the first frame's model bytes), mounts the lobby as soon as the UI chunk arrives
   (the world is not needed for it) and loads the world chunk behind the lobby; the play layer (room, engine, world
   HUD, hub, map: 99 KB gzipped) is imported only when the player enters the world. With `?play=direct`, `#play` or a
   touch device the world loads first and the screen hands off when the first frame is rendered and the cheap
   visible models are in (or after six seconds; greyboxes stand in), with a cross-fade through the motion tokens.
3. **Chunk plan** (`vite.config.js`): `boot` (static with the entry), `ui`, `locales`, `three`, `client-core`
   (render, physics, scenes), `play`; `index.html` preloads only the boot chunk now.
4. **Byte-aware streaming** (`streaming.js`, `assets.js`): among visible assets the priority is apparent size
   weighted by file size (full weight up to 4 MB, then falling with the square root: 20 MB → 0.45), so the camps and
   the terrain that fill the first view load before the two 20 MB heroes; three downloads at once instead of two.
   The first-frame gate (`firstFrameBudget`) takes the visible assets in priority order, skips any single file above
   8 MB and stops at 16 MB or six items.
5. Phones keep the `_m` model variants (2048 textures) and KTX2 (Basis Universal transcoder from `/basis/`); the
   measurement with an iPhone 13 user agent checks both.

## After (local production build, from the build output and a headless smoke; the throttled re-measurement is a next step)

| what | before | after |
|---|---|---|
| JavaScript before the first lobby pixel (gzipped) | about 440 KB (three.js, render/physics core, play layer, world HUD, UI, locales) | about 131 KB (`main` 1.3 KB + `boot` 4.9 KB + `ui` 40.7 KB + `locales` 84.3 KB); three.js, the world and the play layer load behind the lobby |
| JavaScript before the world can render (direct path) | the same 440 KB | about 380 KB (`boot`, `ui`, `locales`, `three` 206.5 KB, `client-core` 37.6 KB, `boot-world` 4.3 KB); the play layer (99 KB) arrives while the loading screen's byte gate runs |
| `index.html` preloads | every chunk of the game | `boot` only (the rest is imported on demand) |
| first paint | after the Google Fonts stylesheet (0.9 s Fast 4G / 1.9 s Slow 4G) | the inline loading screen from the HTML itself; fonts no longer block |
| model order in the first view | by apparent size, two at a time: `scroll_table` (20 MB) and `anchor` (19 MB) early | by apparent size weighted by file size, three at a time: terrain and camps first, the heroes behind their stand-ins |

The owner's wrap-up order (08.11, token budget) stopped the throttled after-measurement mid-run; `node game/tests/client/boot-measure.mjs local-after http://localhost:<port> out.json` against `vite preview` reproduces it in a few minutes, and the live row needs the next Pages deploy of `main`.

## Tests

`game/tests/client/boot.test.mjs` (7): the boot plan per URL, the progress model (weights, clamps), the trickle
(never backwards, breathes while silent, tracks real progress within a second, holds the cap), the first-frame
budget (no file above 8 MB, cap 16 MB / 6 items, priority order), the byte-aware priority (a 6.6 MB camp before a
20 MB hero of similar apparent size; a hero that fills the screen still beats a pebble; off-screen prefetch stays
below every visible asset), three download slots, the screen controller without a DOM.

## Not done / open

- The live numbers after the change come from the next Pages deploy (`main`); the table above measures the local
  production build with the same script, and the live row should be re-measured once merged.
- The locale chunk (84 KB gzipped, five languages) still loads with the UI; per-language lazy loading needs the
  locale index (`src/locales/index.js`, Codex) and `play/i18n.js` to import languages on demand (a request can follow).
- `scroll_table.glb` (20 MB) and `anchor.glb` (19 MB) are the next win: an `_m`-like 2048 variant for desktop too, or
  a lighter runtime mesh with the detail in `_inspect` (art task).
