# Forget to Foresee — Design Tokens (proposal v1)

Goal: ONE visual language across title, loading, name/gift, town, HUD, Shell, shard card, end screen, X art.
Strategy: **do not replace** the existing world-HUD tokens (`game/src/ui/world-hud/tokens.css`, `game/src/ui/motion/index.js`).
They are good. Add a thin **global layer** (`game/src/ui/tokens-global.css`) that (a) exposes the same values on `:root`,
so the legacy surfaces (`play/day1.js`, `boot-world.js` inline styles, `ui/postcard.js`, `scenes/town-flow.js`,
`play/hub-ui.js`, `play/map-ui.js`, `index.html` `#boot`) can use them, and (b) fixes the three off-palette colors
(teal loading, purple/rainbow gacha, hard-coded `#e9b44c`).

Everything is English. Existing token names stay valid; new names are prefixed `--ftf-`.

## 1. Palette (hex)

Rule: **cold, muted, 85 % of the pixels; amber is the only warm accent and means "a human decision / something to do".**
Violet is reserved for Iris (the player: her jacket, the backpack band, her nameplate) and for rare/NFT edge sheen.

| Token | Hex | Role | Source |
|---|---|---|---|
| `--ftf-ink-950` | `#0B1517` | deepest panel top | = existing HUD panel top `rgba(11,21,23)` |
| `--ftf-ink-900` | `#14171A` | Shell "INK", card body | `shell.js` INK |
| `--ftf-graphite-800` | `#1C2A2B` | panel mid | HUD tokens |
| `--ftf-graphite-700` | `#242C29` | panel bottom, tracks | `--wh-track-bg` |
| `--ftf-mist-600` | `#63676C` | far fog / disabled text | `shell.js` MIST_FAR |
| `--ftf-mist-400` | `#8E9092` | mid fog / secondary lines | MIST_MID |
| `--ftf-mist-200` | `#B9B7AE` | near fog / hairlines | MIST_NEAR |
| `--ftf-nacre-100` | `#E9E4D6` | body text on dark, shell ivory | proposal |
| `--ftf-nacre-50` | `#FAF7EE` | headings | = `--wh-text` |
| `--ftf-amber-300` | `#FFD08A` | amber highlight / light core | proposal |
| `--ftf-amber-400` | `#E4C272` | UI gold: titles, borders on focus | = `--wh-gold` |
| `--ftf-amber-500` | `#FFB45A` | **lamp / beacon light** (3D + glow only) | `shell.js` amber lights `0xffb45a` |
| `--ftf-amber-700` | `#6F501B` | primary button fill (top) | = `--wh-chip-active-bg` |
| `--ftf-amber-900` | `#4A3410` | primary button fill (bottom) | same |
| `--ftf-violet-400` | `#9A86D6` | Iris, backpack band, NFT edge sheen | proposal |
| `--ftf-violet-200` | `#C9BEEA` | Iris nameplate text | proposal |
| `--ftf-glass-300` | `#9FD0CC` | glass / proof ("verified") accent, replaces loading teal | softened from `#5fd3c6` |
| `--ftf-ok` | `#7FB38A` | verified check | proposal |
| `--ftf-warn` | `#E0A458` | warning | proposal |
| `--ftf-danger` | `#E07A6A` | error, failed | = `#ff8a7a` desaturated |

Banned in UI: purple→blue gradients (`#7a5cff`, `rgba(40,28,70)`), conic rainbow, `#ffe08a→#ffb238` candy buttons,
pure white `#fff` panel text, pure black `#000` panels (use ink-950).

Surface recipes:
```css
--ftf-panel:   linear-gradient(180deg, rgba(11,21,23,.92) 0%, rgba(24,34,34,.90) 55%, rgba(36,44,41,.88) 100%); /* = world HUD */
--ftf-hairline: 1px solid rgba(232,214,172,.55);             /* ivory-gold hairline, = --pl-frame */
--ftf-hairline-soft: 1px solid rgba(196,186,156,.28);
--ftf-shadow:  0 10px 30px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.06);
--ftf-glow-amber: 0 0 18px rgba(255,180,90,.35);
--ftf-primary: linear-gradient(180deg,#6f501b 0%,#5b4215 55%,#4a3410 100%);  /* text #fffcec, border #ffe78e */
```
Contrast (checked on #14171A): nacre-100 14.2:1, amber-400 10.5:1, mist-200 9.0:1, mist-400 5.6:1 (min for body),
mist-600 3.2:1 (decoration/disabled only, never copy).

## 2. Type scale

Fonts are already bundled (`@fontsource`): **Libre Caslon Text** (display/serif), **Source Sans 3** (UI/body),
**Atkinson Hyperlegible** (accessibility option), monospace for ids. Remove: `Georgia`/`system-ui` literals in
`day1.js`, `postcard.js`, `town-flow.js`, `hub-ui.js`, `map-ui.js`, `fun-ui.js`; and the Google Fonts
`Cormorant Garamond` link in `index.html` (it is a third serif and a network request) -> use Libre Caslon with a
`<link rel="preload">` for the 400 weight.

| Token | Size / line | Weight | Face | Tracking | Use |
|---|---|---|---|---|---|
| `--ftf-fs-display` | `clamp(40px, 5.2vw, 84px)` / 1.02 | 400 | Caslon | .01em | title screen, end-screen headline |
| `--ftf-fs-h1` | 32px / 1.15 | 400 | Caslon | .01em | modal headings ("What should the town call you?") |
| `--ftf-fs-h2` | 22px / 1.25 | 400 | Caslon | .02em | card titles, speaker names |
| `--ftf-fs-h3` | 17px / 1.3 | 400 | Caslon | .02em | HUD panel titles |
| `--ftf-fs-body` | 16px / 1.5 | 500 | Source Sans 3 | 0 | all copy (matches `docs/accessibility.md` "16 px body at 100 %") |
| `--ftf-fs-ui` | 14px / 1.35 | 600 | Source Sans 3 | .01em | buttons, rows |
| `--ftf-fs-small` | 12.5px / 1.4 | 500 | Source Sans 3 | .02em | captions, hints |
| `--ftf-fs-tag` | 11px / 1.2 | 600 | Source Sans 3 | .12em, UPPERCASE | kickers, key labels (floor: never below 11px — today `--wh-fs-tag` is 10px) |
| `--ftf-fs-mono` | 12px / 1.4 | 500 | `ui-monospace` | 0 | token ids, roots, account names |

Ratio 1.25 (major third) between display steps; line length 38-62 ch for dialogue.
Numbers in HUD: `font-variant-numeric: tabular-nums`.

## 3. Spacing, radius, elevation

Base unit 4 px. Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 72`. Panel padding 16/24. Gap between HUD islands 12.
Safe margin to the viewport edge: 18 u at desktop (already the HUD's value), `env(safe-area-inset-*)` on phones.

| Token | Value |
|---|---|
| radius button | 10px (existing `--pl-r-btn`) |
| radius panel | 14px |
| radius card (collectible) | 18px |
| radius pill | 999px |
| target size | 40px desktop / 48px phone (existing) |
| focus ring | `2px solid #E4C272`, offset 2px (existing) |
| hairline | 1px; **never** 2px+ borders (day1 uses 2px gold) |

## 4. Motion

Keep `MOTION` (ui/motion/index.js). Add two named sequences:

| Token | Value | Use |
|---|---|---|
| `--mo-fast` | 120ms | hover, press |
| `--mo-base` | 200ms | toasts, rows |
| `--mo-slow` | 320ms | panels |
| `--mo-screen` | 480ms | screen cross-fades |
| `--mo-seal` | 640ms | verified seal, stroke draw |
| `--mo-ease-out` | `cubic-bezier(.16,1,.3,1)` | everything that arrives |
| `--mo-ease-emphasized` | `cubic-bezier(.2,.9,.2,1)` | reveals |
| **NEW** `--ftf-dur-breath` | 4200ms ease-in-out infinite | beacon / diamond pulse (opacity .55↔1, scale 1↔1.06). Off in reduced motion |
| **NEW** `--ftf-dur-reveal` | 1400ms | shard card mint reveal: 0-320 card rises, 320-960 ink ring draws, 960-1400 sheen sweep (one pass) |
| **NEW** `--ftf-stagger` | 40ms, cap 320ms | lists (existing `--pl-stagger`) |

Rules: transform + opacity only; one moving thing at a time per region; no bounce on `.d1-card` (`cubic-bezier(.3,1.3,.5,1)` is the only overshoot curve outside seals — remove).
Reduced motion: every sequence -> 160ms cross-fade (already how the HUD behaves; extend to `day1.js`, `postcard.js`).

## 5. 3D atmosphere tokens (for lookdev / sky / fog)

These are starting values to A/B in the game. Rendering could not be verified on the review box (no GPU) — test on a real GPU.

| Where | Parameter | Today | Proposed |
|---|---|---|---|
| Town, judge path | hour | `afternoon` (sun el 43, clear) | `dusk` + `weather=overcast` (`?demo=judge&tod=dusk&weather=overcast` works today with no code) |
| Town dusk fog (`LOCATION_LOOKS.town.presets.dusk.fog`) | density / falloff / near / far / sunPower / aerial | .02 / .05 / 50 / 700 / 9 / .5 | **.032 / .05 / 36 / 520 / 9 / .6** (+`cool: .7`) |
| Town overcast multiplier (`WEATHER.overcast.fog`) | | 1.12 | 1.25 |
| Town lamps / windows at dusk | | 1.25 / 2.4 | 1.1 / 1.8 (amber must be restrained, not a christmas street) |
| Archipelago golden fog | density / near / far | .026 / 60 / 760 | .034 / 40 / 620 |
| Colour grade (`GRADE`) | saturation | 1.24 | **1.08** (muted; the scene is currently candy) |
| | contrast | .4 | .46 |
| | shadowTint / highlightTint | [.965,.985,1.03] / [1.04,1,.95] | [.95,.98,1.04] / [1.03,1.0,.96] (cooler shade, less orange highlight) |
| Shell interior | MIST_NEAR/MID/FAR | `#b9b7ae/#8e9092/#63676c` | keep (already on palette) |
| Shell interior | amber point lights | intensity 18, dist 16 | 14, dist 14 (let the glass be the brightest thing) |
| Shell interior | backlight `0xf2ead8` | intensity 34 | 40 + slow pulse ±8 % over 7 s |
| Vignette (`post.js` `uVignette`) | strength | .22 | .30 on town and island, .38 inside the Shell |
| Title / loading | amber progress colour | teal `#5fd3c6` | amber `#E4C272`, head dot `#FFD08A` |

## 6. Copy tokens (voice)

Calm, concrete, second person, no jargon in the first 3 minutes. Verbs: *read, forget, keep, anchor, seal.* Banned on the judge path: "slot", "Place/Action/Power/Delay" (use plain words: *Where / What / How strong / When*), "logogram", "leaf", "Merkle" (keep them in the proof panel behind a "How we verify" fold).
Button grammar: verb first, 1-3 words, sentence case ("Forget it for a vision" -> "Forget it. See ahead.").
