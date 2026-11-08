# Report: Task H, island map and no floating labels (08.11, branch `claude/island-map`)

Base: `main` at `07ddd60` plus the task docs (`eaeee91`). Owner feedback: the "Camp: Iris · not final art" labels floating
over the island cheapen the game; place names belong on a map. Doc: `docs/map.md`.

## What was done

| Area | Change |
|---|---|
| No text in the world | `game/src/render/greybox.js`: every greybox label sprite starts hidden; `setGreyboxLabels(on)` toggles them all. Play never turns them on. `?dev=1`, the F3 dev HUD (while visible) and the asset review page (`game/src/review/asset-review.js`, one line) do. Verified in Chromium: 0 of 18 label sprites visible in play, 18 with F3 or `?dev=1`, 0 again when F3 closes. |
| Map model | `game/src/play/map.js` (pure, no DOM/three): projection (±62 m → 400-unit square, +Z at the bottom), geometry from `scenes/layout.js` (platforms, bridges, anchor rings, Shells, the Scroll), 17 places with room routes, Shell state from the observation (quiet / waiting with the count / inside, staked trials), route decisions per mode and zone, goal and Iris markers, the view model. |
| Map panel | `game/src/play/map-ui.js`: self-contained (own styles, `.wh-root` tokens), SVG chart drawn to look hand-made (paper grain, cliff hatching, pillar shadows, cloud banks, Shell coil glyphs, Scroll medallion with six sectors, corner flourishes, compass rose, 10 m scale bar), clickable places with tooltips and keyboard access (Tab trap, Enter/Space), Iris's heading arrow, pulsing goal marker, agent dots, legend, hint; N / Esc / scrim / close button; a round 48 px tap target on coarse pointers (bottom-left, mirrors the run button). |
| Wiring | `game/src/play/game.js`: `play.map`, `handleKey` (N toggles; with the map open Esc closes and any other panel key closes it first), `onRoute` → `walkTo` (the G route) or `fly(n)` in the hub, one-panel-at-a-time both ways, dev-label sync. `game/src/main.js`: `KeyN` in `PLAY_KEYS` (one line). `handlers.onMap` passed to the world HUD for Task F. |
| Strings | `map.*` (24 keys) in `game/src/play/locales/{en,ru,uk,it,zh}.js`, translated by me (uk Мушля / ru Раковина / it Conchiglia / zh 贝壳, matching the existing hub terms). |
| Tests | `game/tests/client/map.test.mjs`, 9 tests (projection and orientation, geometry, places and routes reachable over the walk graph from the spawn, Shell states on a real judge-seed season through fly and stake, route decisions, goal and Iris markers, the view model, five-locale strings, the label default). `npm test`: 301/301. `npm run build`: green. |
| Docs | `docs/map.md` (what, how, style, before/after table, open items), `docs/map/*.jpg` (before/after at 1280×800, 1920×1080, 390×844; five locales at 390; low tier + reduced motion), decisions row, README (label lines, N in Controls), requests 7 (Task F: hotbar button) and 8 (Task G: `KeyN` in `WORLD_KEYS`) in `docs/collab-requests.md`. |

## Headless checks (Chromium + SwiftShader, `element.click()` through `page.evaluate`)

Run 1, behaviour (both modes, desktop 1280×800, iPhone 13, EN and UK): every line below is from the run log.

```
hub-desktop: greybox labels visible 0 of 18 (expect 0)
hub-desktop: N opens the map true · Esc closes the map true · N again opens/closes true
hub-desktop: places 17 (scroll balcony pedestal 6 camps 4 anchors 4 shells)
hub-desktop: hub dock while the map is open: hidden
hub-desktop: click Moss camp → map closed true, route active true
hub-desktop: opening Memories closes the map true; opening the map closes Memories true
hub-desktop: clicking the waiting Shell flew inside: zone shell; inside: iris marked on Shell 1, 14 island places without a route
walk-desktop: click Shell II → walking route true, zone island; click the Scroll → route true
walk-desktop: F3 → labels visible 18; F3 off → 0
dev-labels: ?dev=1 labels visible 18 of 18
hub-phone: tap target display flex; tap opens the map; panel 374×482 fits; close button closes
hub-desktop-uk: Мапа архіпелагу | Ірис | Сіль | Попіл | Мох | Бурштин | Іній
console errors: 0 in every session
```

Run 2, screenshots and layout (after the visual pass; `docs/map/*.jpg`, 1× pixel ratio, JPEG q68):

```
before: ?dev=1&view=overview at 1280×800, 1920×1080, 390×844 (the old look: labels over the island)
after 1280x800 / 1920x1080 / 390x844: map open true; labels outside the drawing: none
after 1280x800: camp label 21px, caption 17px, hint 16.9px · after 390x844: camp label 14px, caption 11px, hint 15.5px
locale uk/ru/it/zh at 390x844: open true, titles Мапа архіпелагу / Карта архипелага / Mappa dell’arcipelago / 群岛地图, labels outside: none
label overlaps (zh, 390 wide): only name × its own caption pairs (by design), no two places overlap
low tier + reduced motion: map open true, goal animation none, backdrop none
console errors+warnings: 0 in every session
```

Found in the screenshots and fixed afterwards: the Italian legend item "Conchiglia con un segno in attesa" clipped at the
panel edge at 390 px (legend items now wrap); the panel stayed 560 px wide at 1920×1080 (now `max(560px, 34vw)`, the
drawing grows to about 620 px). re-checked:

```
1920x1080: panel 653px, drawing 619px, legend overflow: none
390x844 uk / ru / it / zh: panel 374px, drawing 348px, legend overflow: none
recheck: console errors+warnings 0
```

Final state: `cd game && npm test` 301/301, `npm run build` green, every commit pushed to `claude/island-map`.

## Hostile self-review (what I looked for and fixed)

- The SVG had `role="img"`, which would have hidden the clickable places from screen readers: removed.
- Tab could leave the dialog: a focus trap cycles the close button and the places.
- The hub's decision card, status line, dock, reading card, spot menu, E prompt and the phone run button all stayed visible
  under the map: hidden by `body.ftf-map-open` while it is open (the run button overlapped the hint text on phones).
- Side labels were centred by the stylesheet despite the `text-anchor` attribute: inline style.
- Shell labels next to their discs collided with the balcony and Ash labels in long locales: moved to the four corners of
  the sea, next to their discs; the overlap check at 390 px in five locales is part of run 2.
- `KeyN` is not in `input.js`'s `WORLD_KEYS` (Task G's file), so `PLAY_KEYS` alone does nothing: the panel listens for N
  itself with a 400 ms de-dupe against the second path; request 8 asks Task G to forward it, then the listener goes.
- Inside a Shell: island places are disabled with "Leave the Shell first"; in walk mode Shells are disabled too (E leaves);
  in the hub other Shells fly. The current Shell is disabled.
- Reduced motion (media query and `html[data-motion=reduce]`) stops the goal pulse; the low tier drops the backdrop blur.

## Not done / left to others

- Hotbar "Map" button and a mobile HUD tile: Task F (request 7; `handlers.onMap` and `play.map` are ready).
- `KeyN` forwarded by `input.js`: Task G (request 8).
- Gamepad navigation inside the map (main.js only steers `.pl-panel` and dialogs).
- The clan agents' floating name plates ("Frost · fragment giver") are Task F's scope, not touched here.
- `game/index.html` still carries the lobby badge text "labeled objects are not final art" (hidden under the lobby and in
  the world; the file is not in my paths).
- Nobody has looked at the map on a real GPU or a physical phone; SwiftShader screenshots only.
