# GPT request: HUD tray icons (one consistent set)

For the owner: paste the **Prompt** blocks below into ChatGPT (image generation), one request per block. Bring the
results back as files named exactly as in the table.

## What exists today

- The tray in `game/src/rpg/hud.js` (`TRAY`) draws inline 24x24 SVGs (stroke 1.8, `currentColor`): `character`,
  `skills`, `journal`, `map`, `bag`, `market`, `menu` (gear on desktop, three lines on phone).
- A raster set lives in `game/public/assets/ui/icons/hud/<name>_{24,32,48,96}.{png,webp}` plus `<name>_glyph_*`
  (used by `scenes/player-hud.js`). It already has `bag`, `map`, `settings`, `profile`, `quest`, `nfts`, `chat`.
- Goal: one family that replaces the tray SVGs, same names everywhere.

## Style (all icons)

- Thin white line icons, outline only, no fill, no shading, no text.
- 24 px grid, 2 px stroke at 24 px (= 85 px stroke on the 1024 master), round caps and joins, 2 px safe margin.
- Optical size equal across the set: same visual weight, same corner radius (2 px at 24 px).
- Transparent background. Master 1024x1024 PNG. SVG (24x24 viewBox, single colour `currentColor`) if possible.
- Must read at 24 px on dark green-black `#101F1A`; gold `#C5A469` is applied by CSS, never baked in.

## List (file names)

| Tray id (`TRAY`) | File base | Motif |
|---|---|---|
| `bag` | `bag` | soft drawstring satchel, small flap |
| `character` | `character` | head-and-shoulders bust |
| `map` | `map` | folded map, three panels, small route dot |
| `journal` | `journal` | closed book with a ribbon bookmark |
| `menu` (desktop) | `settings` | 8-tooth gear, round hole |
| `menu` (phone) | `menu` | three horizontal lines |
| `skills` | `skills` | four-point star / spark |
| `market` | `market` | stall with a scalloped awning |

Deliver: `bag_1024.png`, `bag.svg`, and the same for each base name.

## Prompt 1 (raster set, paste as is)

> Create a set of 8 game UI icons on one transparent sheet, arranged in a 4x2 grid with generous spacing, each icon
> on its own 1024x1024 cell. Style: minimal thin white outline icons, uniform 2 px stroke at 24 px scale (very thin
> relative to the icon), rounded line caps and joins, no fill, no gradients, no shadow, no text, flat, consistent
> visual weight, designed on a 24 px pixel grid, crisp and legible at small size. Icons, in order:
> 1 bag: a soft drawstring satchel with a small flap; 2 character: a simple head-and-shoulders bust;
> 3 map: a folded three-panel map with a small route dot; 4 journal: a closed book with a ribbon bookmark;
> 5 settings: an eight-tooth gear with a round centre hole; 6 menu: three horizontal lines;
> 7 skills: a four-point star spark; 8 market: a small market stall with a scalloped awning.
> Fantasy RPG mood but clean modern line style. Transparent background, pure white strokes only.

If ChatGPT returns one sheet, ask: "Now give each icon as a separate 1024x1024 transparent PNG, same stroke".

## Prompt 2 (SVG code, paste after Prompt 1)

> Now write each of the 8 icons as SVG code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
> stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`, paths only, integer or .5 coordinates, at most
> 6 path/circle elements per icon, 2 px padding inside the 24 box. One code block per icon, titled with its name.

## How we import

1. Owner drops the files into `docs/art/requests/in/hud/` (or the GPU art board) and tells the lead.
2. A worker checks each SVG at 24 px against the PNG, then pastes the `<path>` content into `TRAY` in
   `game/src/rpg/hud.js` (keep `stroke-width` in the `SVG()` helper; 2 is fine). The `menu` entry keeps both groups
   `i-menu` and `i-gear`. That file belongs to the controls worker on `BOARD.md`; coordinate first.
3. Raster sizes for `scenes/player-hud.js`: from the 1024 master make `<name>_{24,32,48,96}.{png,webp}` and
   `<name>_glyph_*` into `game/public/assets/ui/icons/hud/` (sharp or ImageMagick on the server, not the laptop).
4. Check: `node --test game/tests/client/player-hud.test.mjs` (full `npm test` on the server) and a look at the tray at 100% and on a phone width.
