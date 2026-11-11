# Handoff: loading screen v3 (branch `claude/loading-v3`)

Task: replace the loading screen and the altar cover ("The Tournament begins") with one dark terminal-style screen:
nebula and dust, line-art diagram of our world, a `> ` log driven by the real loader, letter-spaced LOADING, a thin
teal progress line with a head dot and a percentage, Iris as a rim-lit silhouette. Paused by the lead on 11.11.2026
(one agent at a time). Nothing in the game is changed yet: `main` is untouched and the old screen still runs.

## Done (pushed)

| What | Where |
|---|---|
| Iris silhouette: `idle` pose, near-black satin, teal rim lights, an amber bead in her right hand; transparent WebP 375 x 1086, 38 KB (limit 150 KB) | `game/public/assets/ui/loading_iris.webp`, `art/ui/loading/render_iris.py` |
| Decoder for the shipped model (meshopt and KTX2 are unreadable for Blender; textures are dropped) | `art/ui/loading/decode_glb.mjs` |
| Generator of the inline line-art: four Shells and the archipelago on an orbit line, rows of round signs (arc, spike, loop, drop forms as in `game/src/play/logogram.js`), and the halo behind Iris. **Written, never run**: `game/index.html` has no `<!-- loading-art:diagram -->` / `<!-- loading-art:halo -->` blocks yet | `art/ui/loading/build_diagram.mjs` |

## Not done

1. `game/index.html`: new inline CSS and markup (class `.boot`, id `boot` kept for the tests), the two `loading-art`
   blocks, the pre-module trickle script updated for the new bar (`--boot-p`, `.boot-pct`, `aria-valuenow`).
2. `game/src/ui/loading.js`: bind the new markup (bar, percentage, four-line log, title, subtitle), move
   `LOG_EN`, `logKeyFor`, `logKeysFromStats` here from `ink-bar.js`, export a `createVeil(doc, { sub, t })` that
   clones the pristine `#boot` for the altar cover; fade out over about 0.9 s (reduced motion: static, short fade).
3. `game/src/scenes/town-flow.js`: the cover becomes that veil (keep the classes `ftf-town-cover`, `is-on`,
   `is-plain`: the e2e and `tools/gpu-server/flow-cap.cjs` read them); remove the cream CSS.
4. Remove `game/src/ui/ink-bar.js`, `game/public/assets/ui/loading_bar.webp`, `art/ui/loading_bar/`, and its line in
   `game/build/chunks.js`; update imports in `game/src/main.js` and `game/src/boot-world.js`.
5. Locale keys in all five locales (the boot test checks every one): `loading.title`, the `loading.log.*` lines in
   the world's voice ("reading the Guests' signs", "raising the Shells", "warming the town", "opening the altar"),
   a separate warming line for the archipelago.
6. Tests: `game/tests/client/boot.test.mjs` (the ink-bar test), `game/tests/e2e/town.e2e.mjs` line 88 (the cover's
   text is now in `.boot-sub`), a check that `build_diagram.mjs --check` passes.
7. Screenshots `docs/loading/desktop.png` and `docs/loading/phone.png`, a row in `docs/decisions.md`, the row in
   `docs/handoff/lighting-v2.md`, then merge `main`, `cd game && npm test && npm run build`, push to `main`, and
   two lines to the lead (the main commit and the screenshot paths).

8. **Shell drawing must change (lead message, reported as an owner decision, 10.11 23:12 UTC):** all four Shells are
   one identical design, a long slender upright spiral seashell (auger or spindle-like: tight whorls tapering to a
   sharp apex, a flared aperture lip near the bottom, about 1 : 3.5 width to height). `shell()` in
   `art/ui/loading/build_diagram.mjs` still draws a round hull with a flat spiral: redraw it as four identical
   elongated spiral shells of that silhouette (clearly spiral, not smooth ovals). The 3D model is built by another
   worker on `claude/shells-v2`.

## Planned layout (not built)

Desktop: a 100 x 56.25 unit stage (`--u: min(1vw, 1.7778vh)`), diagram top left, log under it, Iris on the right
with the halo behind her and a teal ground glow, at the bottom centre the serif subtitle ("Forget to Foresee" on the
first load, "The Tournament begins" on the cover), LOADING, the bar and the percentage at its right end.
Phone (`max-aspect-ratio: 4/5`): one column: diagram, Iris, log, subtitle, LOADING, bar.
Dust and haze: two small data-URI SVGs with `feTurbulence` (no image files).

## How to resume

- Server (while rented): `/root/w/loading/` holds `iris_plain.glb` (decoded), `render_iris.py`, `out/`. Re-render:
  `blender -b -P render_iris.py -- iris_plain.glb out/loading_iris.webp`. The mood images are in
  `/root/board/refs/L-001_owner_mood_loading_{a,b}.webp` (mood only, never commit them).
- After writing the blocks in `index.html`: `node art/ui/loading/build_diagram.mjs`.
- Checks: `cd game && npm test && npm run build`, then open the built page once (`npx vite preview`).
