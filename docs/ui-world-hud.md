# World HUD design spec (`game/src/ui/world-hud/`)

The in-world HUD that overlays the Three.js canvas. It reproduces the owner's two
mockups one-to-one (layout, proportions, colours, type, ornament, icons). Every number
below was measured on the reference PNGs with PIL; implementers build from these
numbers and do not re-derive them. Module prefix: `wh-`. Everything is scoped under
`.wh-root`. The old HUD (`hud.js`, `styles.css`) is untouched.

Shared files (already written, owned by the orchestrator, read-only for packages):

| File | Contents |
|---|---|
| `world-hud/tokens.css` | `--wh-*` custom properties, font loading hook, primitives `.wh-panel .wh-frame .wh-card .wh-pill .wh-chip .wh-kbd .wh-btn-icon .wh-divider .wh-bar .wh-tag` |
| `world-hud/icons.js` | `icon(name, {size})`, `ringSigil({size})`, `keyArt({size})` — inline SVG strings |
| `world-hud/model.js` | JSDoc view-model schema + `DEMO_MODEL` (mockup content) |
| `locales/en.js`, `locales/ru.js` | all `wh.*` keys (chrome and demo narrative) |

Packages write only their own files (section 9).

---

## 1. Reference frames and scale

| Layout | Reference image | CSS viewport | Image px → CSS px |
|---|---|---|---|
| desktop | `ref/desktop.png` 1811×868 | 1811×868 | ×1 |
| mobile | `ref/mobile.png` 1219×1290, left phone screen at image x 28–582, y 14–1261 | 390×876 | ÷1.4231, after subtracting (28, 14); right phone screen starts at image x 634 |

All desktop numbers in this document are CSS px at 1811 wide ("u"). The HUD scales
them with one unit:

```css
.wh-root { --wh-px: clamp(0.6px, calc(100vw / 1811), 1.35px); }   /* 1 u = 1 px at 1811; proportional from 1087 px up; 1.35 px cap at ≥ 2445 */
@media (max-width: 700px) { .wh-root { --wh-px: 1px; } }          /* mobile numbers are CSS px at 390 wide, no scaling */
```

Every length in a package stylesheet is written as `calc(N * var(--wh-px))`; the
shorthand used in this spec is `N u`. Font sizes scale the same way (section 3), so every
window from 1087 to 2445 px wide shows the desktop composition at exactly the mockup
proportions (1280 → 0.707×, 1440 → 0.795×, 1920 → 1.06×, 2560 → 1.35×). The price is
small type below ~1300 px (body 9.5 px at 1280); the owner chose proportions over a
floor. **Compact desktop range 701–1086 px:** the 0.6 u floor stops the top row fitting
side by side, so in this range the toast is hidden (`tokens.css`), the Signs panel starts
closed (`model.signs.open = false` is the orchestrator's default there) and overlays when
opened, and the quest banner keeps `max-width: calc(100vw - 2 * 290u)` so it clears the
trial card. Mobile layout switches at `max-width: 700px` (`layout === 'mobile'` in JS,
decided by the orchestrator from `matchMedia`, passed to every package and re-passed
through `update()` when it changes).

---

## 2. Design tokens (sampled)

All values were sampled from the PNGs (median of flat areas, brightest pixels for
text/gold, anti-aliased edge for hairlines). They are the `--wh-*` properties in
`tokens.css`; use the tokens, never literals.

### 2.1 Surfaces

| Token | Value | Sampled from |
|---|---|---|
| `--wh-panel-bg` | `linear-gradient(180deg, rgba(11,21,23,.90) 0%, rgba(24,34,34,.87) 55%, rgba(36,44,41,.84) 100%)` | trial card top `#0f1b1c`, middle `#1f2725`, bottom `#252d2a`; quest `#0f1b1d`; signs `#172325` |
| `--wh-panel-blur` | `10px` (`backdrop-filter: blur()`; drop silently when unsupported) | scene is softened behind every panel |
| `--wh-card-bg` | `rgba(8,18,21,.55)` | sign card interior `#101d20` on panel `#172325` (darker than its parent) |
| `--wh-card-bg-mobile` | `rgba(8,18,21,.50)` | sheet card `#121d1e` on sheet `#1f2727` |
| `--wh-sheet-bg` | `linear-gradient(180deg, rgba(44,48,44,.93) 0%, rgba(24,33,33,.96) 18%, rgba(16,26,27,.97) 100%)` | sheet top `#343832`, body `#1f2727` |
| `--wh-tile-bg` | `rgba(52,58,54,.62)` | mobile tile `#2d322e` |
| `--wh-btn-bg` | `rgba(10,22,23,.78)` | hotbar button `#162221`, mobile top button `#272f2e` (that one over bright sky) |
| `--wh-bar-bg` | `rgba(28,40,41,.80)` | hotbar outer `#222e2f` |
| `--wh-chip-bg` | `rgba(16,28,30,.82)` | inactive chip `#192425` |
| `--wh-chip-active-bg` | `linear-gradient(180deg, #6f501b 0%, #5b4215 55%, #4a3410 100%)` | active chip `#5b4215` |
| `--wh-kbd-bg` | `rgba(42,38,30,.92)` | kbd `[E]` fill `#28261f` |
| `--wh-tab-active-bg` | `linear-gradient(180deg, rgba(92,86,56,.60), rgba(56,54,40,.70))` | active tab `#3b3e30` |
| `--wh-tab-bg` | `rgba(18,30,32,.80)` | inactive tab `#182527` |
| `--wh-pill-bg` | `rgba(20,26,24,.70)` | type pill `#19221d`, MAIN QUEST pill `#1f2523` |
| `--wh-anchor-bg` | `rgba(38,34,22,.70)` | anchor pill interior (warm dark) |
| `--wh-track-bg` | `#242d2a` | empty progress track |
| `--wh-divider` | `rgba(255,255,255,.12)` | trial card rules (lum +35 on `#1f2725`) |
| `--wh-sep` | `rgba(255,255,255,.16)` | dialogue speaker separator `#4f4f46` |

### 2.2 Gold and hairlines

| Token | Value | Sampled from |
|---|---|---|
| `--wh-gold` | `#e4c272` | icons / sigils mid tone |
| `--wh-gold-bright` | `#fbe6a6` | sigil highlights `#fde5a1`, `#fff0b1`, `#ffe78e` |
| `--wh-gold-deep` | `#b48d3c` | shadow side of gold strokes |
| `--wh-gold-text` | `#f6df9b` | speaker "Ash" `#fcdf97`, MAIN QUEST `#f5e29e`, anchor text `#ffefa5` |
| `--wh-frame` | `rgba(232,214,172,.82)` | panel outer hairline `#e5d2a7` / `#dacca8` |
| `--wh-frame-soft` | `rgba(196,186,156,.45)` | inner hairline, card border `#9e947c`, chip/button border |
| `--wh-frame-dim` | `rgba(196,186,156,.28)` | hotbar button border, toast border |
| `--wh-pill-border` | `rgba(214,206,180,.62)` | type / MAIN QUEST pill outline `#86836d` (pale parchment, not gold) |
| `--wh-anchor-border` | `rgba(226,214,180,.80)` | anchor pill outline `#87897b`–`#aeaf9c` |
| `--wh-kbd-border` | `rgba(222,210,180,.85)` | kbd outlines `#b3a48d`, `#a19b8a`, `#ada691` |
| `--wh-prompt-border` | `rgba(216,200,160,.70)` | desktop prompt `#786b5c` (AA) |
| `--wh-prompt-border-mobile` | `#f5d788` | mobile prompt bright 2px border `#fbf5e2` |
| `--wh-bar-fill` | `linear-gradient(90deg, #cf9846 0%, #e2ac56 100%)` | segments `#d49d49` → `#dda754` |
| `--wh-bar-fill-mobile` | `linear-gradient(90deg, #e2ac56 0%, #f6c572 100%)` | mobile segments `#f8c571` |
| `--wh-bar-border` | `rgba(226,200,150,.45)` | track hairline |
| `--wh-tab-underline` | `#ffe084` | active tab rule |
| `--wh-notify` | `#ffb347` | log dot core `#fff3b4` with `0 0 8px #ffa63a` glow |
| `--wh-dot-off` | `rgba(150,160,158,.55)` | carousel inactive dots |
| `--wh-handle` | `rgba(190,196,194,.70)` | sheet grab handle `#949a99` |

### 2.3 Text

| Token | Value | Contrast on `#101d20` | Sampled from |
|---|---|---|---|
| `--wh-text` | `#faf7ee` | 17.5:1 | titles/body `#ffffff`, `#faf8ec`, `#fffbdf` |
| `--wh-text-2` | `#e6e3d7` | 14.7:1 | subtitles `#f2efe5`, `#e8eae9` |
| `--wh-text-muted` | `#c9c6b8` | 10.9:1 | timestamps `#cbc7b7`, inactive chip `#cdd0d0` |
| `--wh-gold-text` | `#f6df9b` | 13.4:1 | gold labels |
| `--wh-text-on-gold` | `#fffcec` | 7.6:1 on `#5b4215` | active chip text |
| `--wh-tab-active-text` | `#fff6d2` | 10.3:1 on `#3b3e30` | active tab label |
| `--wh-speaker-mobile` | `#ddc58a` | 9.6:1 | mobile dialogue bar speaker |
| `--wh-line-mobile` | `#ecedea` | 13.4:1 | mobile dialogue bar line |

All text/background pairs are ≥ 4.5:1 (the lightest background a text token sits on is
`#3b3e30` for the active tab: `--wh-gold-text` 7.9:1, `--wh-text` 10.5:1).

### 2.4 Shadows and glows

| Token | Value |
|---|---|
| `--wh-shadow` | `0 10px 30px rgba(0,0,0,.42), 0 1px 0 rgba(255,255,255,.04) inset` |
| `--wh-glow-gold` | `0 0 18px rgba(255,205,120,.22)` (quest banner, mobile prompt adds `0 0 10px rgba(255,205,120,.55)`) |
| `--wh-glow-chip` | `0 0 14px rgba(255,200,100,.45), 0 0 0 1px rgba(255,231,142,.9)` |
| `--wh-text-glow` | `0 0 8px rgba(255,236,190,.22)` (titles ≥ 20 u only) |

---

## 3. Typography

### 3.1 Family

**Latin: Libre Caslon Text** (OFL 1.1, `@fontsource/libre-caslon-text` 5.3.0) — owner decision
08.11. Of 15 free serifs rendered against mockup crops at matched cap height it is the closest in
letterforms and widths (width ratio 1.020 ± .051, x-height/cap 0.69 vs the mockup's 0.68–0.72,
round double-storey g/a, straight-tailed y, lining figures). It has no Cyrillic, so the RU locale
draws Cyrillic from a companion face:

**Cyrillic: Old Standard TT** (OFL 1.1, `@fontsource/old-standard-tt` 5.3.0), loaded only from
its `cyrillic-400/700` subset files under the family name `"WH Cyrillic"` with a Cyrillic
`unicode-range`, so it never draws a Latin glyph. Compared next to Caslon with real `wh.*` RU
strings (x-height, cap height, stem darkness, average lowercase advance, all at 100 px, then
size-adjusted to Caslon's x-height):

| Candidate | x/cap | size-adjust to Caslon x-height | caps after | lowercase width after | ink after | verdict |
|---|---|---|---|---|---|---|
| **Old Standard TT** | 0.64 | 1.15 (used: **1.12**) | 1.08 (1.05) | 1.06 (1.03) | 0.92 (0.87) | same transitional contrast and light colour as Caslon; traditional Russian serif forms |
| PT Serif | 0.71 | 1.06 | 0.96 | 1.07 | 1.12 | heavier, low-contrast, reads sans-like next to Caslon |
| Lora | 0.71 | 1.06 | 0.96 | 1.11 | 1.07 | wider, brushy modern terminals |
| Literata | 0.72 | 1.04 | 0.96 | 1.13 | 1.26 | widest and darkest |
| Alegreya | 0.71 | 1.15 | 0.97 | 1.07 | 1.05 | angular calligraphic forms clash with Caslon |

`tokens.css` declares the two `@font-face` rules (`size-adjust: 112%`, `ascent-override: 97%`,
`descent-override: 26%`, `line-gap-override: 0%` = Libre Caslon Text's font box), so a mixed
EN/RU line keeps exactly the Latin line box (verified: 27.59 px at 23 px/1.2 for Latin, Cyrillic
and mixed). The same faces are re-declared in `fonts.js` with Vite-bundled URLs for production
builds; the two copies must stay identical.

**Body copy: Source Sans 3 500** (OFL 1.1, `@fontsource/source-sans-3`, Latin and Cyrillic in
one family). Zoomed crops show the mockup is a two-face system: titles, trial rows, tabs,
hotbar labels, dialogue, prompt, pills and the Signs subtitle are serif, while the quest
body, toast, log rows, sign stats, timestamps, chips and the small mobile labels are a
humanist sans (serifless l/k/d, single-storey g, straight y, medium weight). Of PT Sans,
Alegreya Sans, Source Sans 3, Fira Sans and Open Sans, Source Sans 3 is the only one whose
width fit and cap-height fit agree (13.4–14.2 u by width, 12.9–14.4 u by cap for the body
strings) and whose letterforms match the crops. Roles that use it carry
`font-family: var(--wh-font-body); font-weight: var(--wh-font-body-weight)` (class
`.wh-body`); `.wh-chip` has it built in.

**Weight:** Libre Caslon Text 400 is lighter than the mockup lettering and 700 is far
heavier. Serif titles ≥ 20 u get `-webkit-text-stroke: var(--wh-stroke-title) currentColor`
(0.3 px, class `.wh-heavy`); serif labels 13–15 u get `--wh-stroke-text` (0.18 px,
`.wh-heavy-sm`). Rendered against the "Signs and Visions" crop, 0.3 px sits between the
mockup's weight and 0.4 px.

Loading: `index.js` imports `fonts.js` (the only file that imports fontsource):
`@fontsource/libre-caslon-text/400.css`, `/700.css`, `@fontsource/source-sans-3/400.css`,
`/500.css`, `/600.css` and the two Old Standard TT cyrillic woff2 files. Packages never import fonts. Stack: `--wh-font: "Libre Caslon Text", "WH Cyrillic",
"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`. The small-caps tag ("✦ MAIN
QUEST") is the same family, uppercase with tracking — no third family.

### 3.2 Roles (CSS px at 1811 desktop / 390 mobile; weight 400 unless noted)

Sizes were fitted to the measured string widths (Libre Caslon Text renders the mockup string at
exactly the mockup width at the size listed). Line heights are measured line pitches.

| Role | Token | Face | Desktop | Mobile | letter-spacing | line-height | colour |
|---|---|---|---|---|---|---|---|
| title-l (quest title) | `--wh-fs-title-l` | serif, `.wh-heavy` | 21 | 18.5 | 0 | 1.2 (mobile 1.05) | text, text-glow |
| title (Signs and Visions) | `--wh-fs-title` | serif, `.wh-heavy` | 23 | 23 | 0 | 1.2 | text, text-glow |
| card-title (Trial 13 of 17) | `--wh-fs-card-title` | serif, `.wh-heavy-sm` | 19 | 14.5 | 0 | 1.2 | text |
| sign-title (Sign #10) | `--wh-fs-sign-title` | serif | 14 | 14.5 | 0 | 1.2 | text |
| row (trial rows, Progress label) | `--wh-fs-row` | serif, `.wh-heavy-sm` | 14 | 13.5 (values) | 0 | 1.3 | text |
| subtitle (Signs panel / sheet) | `--wh-fs-subtitle` | serif | 12.75 | 12.75 | 0 | 1.4 | text-2 |
| body (quest body) | `--wh-fs-body` | sans 500 | 13.5 | 13.5 | 0 | 1.25 (mobile 15 px pitch) | text-2 |
| toast | `--wh-fs-toast` | sans 500 | 13.5 | 13.5 | 0 | 1.25 | text |
| ui (chips) | `--wh-fs-ui` | sans 500 | 13.5 | 13 | 0 | 1 | muted / on-gold |
| tab (tabs, hotbar labels, type pill) | `--wh-fs-tab` | serif | 12.5 | 12.5 | 0 | 1 | text / gold-text |
| close ("Close" in the Signs header) | `--wh-fs-close` | serif | 14 | 14 | 0 | 1 | text |
| stat (sign stats, log rows) | `--wh-fs-stat` | sans 500 | 13 | 12.5 | 0 | 19 u (stats) / 1.35 (log) | text |
| small (timestamps, Attempts / Skill Tier labels) | `--wh-fs-small` | sans 500 | 12 | 10.5 | 0 | 1.2 | muted / text-2 |
| caption ("Explore", "71%") | `--wh-fs-caption` | sans 500 | 11.5 | 11.5 | 0 | 1.2 | text-2 |
| tag (✦ MAIN QUEST) | `--wh-fs-tag` | serif | 11.5 | 11.5 | .03em (mobile .06em) | 1 | gold-text, uppercase |
| prompt | `--wh-fs-prompt` | serif | 15 | 14.5 | 0 | 1 | text |
| speaker (Ash) | `--wh-fs-speaker` | serif | 14 | 12 | 0 | 1 | gold-text / speaker-mobile |
| line / reply | `--wh-fs-line` / `--wh-fs-reply` | serif | 13 / 14 | 12 / 12 | 0 | 1 | text / line-mobile |
| anchor pill | `--wh-fs-anchor` | serif | 14 | 13 | 0 | 1 | gold-text |
| kbd / kbd-sm / kbd-lg | `--wh-fs-kbd` / `--wh-fs-kbd-sm` / `--wh-fs-kbd-lg` | serif | 11 / 11 / 14 | 11 / 11 / 14 | 0 | 1 | `#fef4e6` |
| tile label | `--wh-fs-tile` | serif | — | 12.5 | 0 | 1.15 | text |

Libre Caslon Text has tall capitals (cap 0.77 em, x 0.53 em), so its sizes are 5–10 % smaller
than a PT Serif fit would be; for serif roles widths, not cap heights, were matched (the two
agree for the sans roles). Russian strings run 1.7–1.9× the English width: mobile uses
`wh.trial.titleShort` when `wh.trial.title` overflows, and the mobile anchor pill renders `wh.sign.tiersShort` (the RU short form for "tiers 11–13") when
`wh.sign.tiers` overflows.

Numerals are lining (both faces' default). Values follow labels with a wide gap, as in the
mockup ("Shell stability:  34%"): render label and value as two spans with
`column-gap: .5em`, not with double spaces.

---

## 4. Primitives (in `tokens.css`)

| Class | Box | Notes |
|---|---|---|
| `.wh-root` | `position:absolute; inset:0; pointer-events:none; font-family; color` | children that take input set `pointer-events:auto` (panels, buttons) |
| `.wh-panel` | `background: var(--wh-panel-bg); backdrop-filter: blur(var(--wh-panel-blur)); border: 1px solid var(--wh-frame); border-radius: var(--wh-r-panel); box-shadow: var(--wh-shadow)` | the single pale hairline (trial card, toast, log panel, dialogue, hotbar) |
| `.wh-frame` | adds `::before` inner hairline: `inset: 5u; border: 1px solid var(--wh-frame-soft); border-radius: calc(var(--wh-r-panel) - 5u); pointer-events:none` and the corner flourish slots (`.wh-frame__corner`) | the double frame (quest banner, Signs panel, sheet) |
| `.wh-card` | `background: var(--wh-card-bg); border:1px solid var(--wh-frame-soft); border-radius: var(--wh-r-card)` | sign cards |
| `.wh-pill` | `display:inline-flex; align-items:center; gap:6u; height:21u; padding:0 10u; border:1px solid var(--wh-pill-border); border-radius:999px; background: var(--wh-pill-bg); color: var(--wh-gold-text); font-size: var(--wh-fs-ui)` | type pill "✦ Elemental"; `.wh-pill--anchor` is 28u high, 1px `--wh-anchor-border`, `--wh-anchor-bg`, 14u font |
| `.wh-tag` | like `.wh-pill` but `height:20u; padding:0 9u 0 8u; font-size: var(--wh-fs-tag); text-transform:uppercase; letter-spacing:.06em` | "✦ MAIN QUEST" |
| `.wh-chip` | `height:34u; padding:0 22u; border-radius:17u; border:1px solid var(--wh-frame-soft); background: var(--wh-chip-bg); color: var(--wh-text-muted); font-size: var(--wh-fs-ui)`; `[aria-pressed=true]` → `--wh-chip-active-bg`, `color: --wh-text-on-gold`, `border-color: #ffe78e`, `box-shadow: var(--wh-glow-chip)` | filter chips (mobile 31px high, padding 0 20px) |
| `.wh-kbd` | `display:inline-grid; place-items:center; min-width:24u; height:24u; padding:0 5u; border:1px solid var(--wh-kbd-border); border-radius:5u; background: var(--wh-kbd-bg); color:#fef4e6; font-size: var(--wh-fs-kbd); font-weight:400` ; `.wh-kbd--lg` = 38u×33u, radius 7u, 1.5px border, font 15u | hotkey boxes |
| `.wh-btn-icon` | `width:48px; height:35px; border-radius:14px; border:1px solid var(--wh-frame-soft); background: var(--wh-btn-bg); color: var(--wh-gold); display:grid; place-items:center`; `.wh-btn-icon--round` = 34px circle | mobile top bar buttons, sheet close |
| `.wh-divider` | `height:1px; background: var(--wh-divider)` | horizontal rules inside panels |
| `.wh-bar` | segmented progress: `height:11u; border:1px solid var(--wh-bar-border); border-radius:6u; background: var(--wh-track-bg); padding:1px; display:grid; grid-auto-flow:column; gap:1px`; `.wh-bar__seg` filled → `--wh-bar-fill`, empty → transparent; first/last segments inherit the radius | 17 segments, 12 filled |
| `.wh-icon` | `width:1em;height:1em; display:inline-block; vertical-align:-.15em; color: var(--wh-gold)` | wraps `icon()` output |
| `.wh-body` | `font-family: var(--wh-font-body); font-weight: var(--wh-font-body-weight)` | the sans body-copy roles of §3.2 |
| `.wh-heavy`, `.wh-heavy-sm` | `-webkit-text-stroke: var(--wh-stroke-title / --wh-stroke-text) currentColor` | serif weight correction (§3.1) |
| `.sr-only` | standard | screen-reader labels |

Radii tokens: `--wh-r-panel: 14u` (trial, log, toast body), `--wh-r-banner: 18u`
(quest banner, Signs panel), `--wh-r-card: 13u`, `--wh-r-pill: 999px`, `--wh-r-btn: 10u`
(hotbar buttons), `--wh-r-tile: 16px`, `--wh-r-sheet: 28px`, `--wh-r-mcard: 20px`
(mobile quest/trial cards: 22px / 16px — see component tables).

Focus: `:focus-visible { outline: 2px solid var(--wh-gold-bright); outline-offset: 2px }`.

Motion: transitions are 160 ms ease on opacity/transform/border-color only; under
`html[data-motion="reduce"]` or `prefers-reduced-motion: reduce` everything is
`transition: none; animation: none` (rule is in `tokens.css`; packages add no other
animation except the ones named in their sections, all opacity/transform).

---

## 5. Ornaments

### 5.1 Frames

* **Single hairline panel** (trial card, toast, log panel, dialogue strip, hotbar,
  mobile cards, tiles): 1px `--wh-frame` on a `.wh-panel`. The top edge of each panel
  reads a touch brighter in the mockup: add `box-shadow: inset 0 1px 0 rgba(255,255,255,.06)`
  (already in `--wh-shadow`).
* **Double frame** (quest banner, Signs panel, sheet): outer 1px `--wh-frame` + inner 1px
  `--wh-frame-soft` inset 5u (sheet: inset 6px, top only two corners). `.wh-frame`.
* **Corner flourish**: a filigree vine in the top-left corner of the quest banner and of
  the Signs panel (and faint in the banner's bottom-left and top-right). It is
  `icon('flourish', {size})` placed absolutely: `left: 6u; top: 6u; width: 54u; height: 54u;
  opacity: .55; color: var(--wh-gold)`; the bottom-left copy is flipped (`scaleY(-1)`)
  at `opacity: .28`; the banner's top-right copy is `scaleX(-1)` at `.35`. The sheet gets
  none. `pointer-events: none`.

### 5.2 Small ornaments

* **Prompt knots** (desktop prompt): a 14u×8u gold knot (`icon('knot')`) centred on the
  top edge and another on the bottom edge (`top: -4u` / `bottom: -4u`, `left: 50%`,
  translateX(-50%)); colour `--wh-gold`, opacity .9.
* **Dialogue connector**: between the speaker strip and the reply pill: `icon('connector')`
  34u×22u, vertically centred, overlapping the strip's right end by 20u (`margin-left: -20u`),
  `--wh-gold`, opacity .8. The strip and pill are separated by 7u (862−855).
* **Active tab notch**: 2px `--wh-tab-underline` rule across the active tab's bottom edge
  plus a 10u-wide, 6u-tall upward triangle (border trick) centred under the tab,
  `box-shadow: 0 0 8px rgba(255,224,132,.5)`.
* **Mobile prompt notch**: the pill's 2px gold border dips to a downward point at bottom
  centre: a 14px square `::after`, `rotate(45deg)`, `border-right/bottom: 2px solid
  var(--wh-prompt-border-mobile)`, background = pill fill, `bottom: -8px; left: 50%`,
  `translateX(-50%)`, same glow as the border.
* **Carousel dots**: 6px circles, gap 18px (centre to centre), active `--wh-gold-bright`
  with `0 0 6px rgba(255,220,140,.6)`, inactive `--wh-dot-off`.
* **Log notification dot**: 10px, `--wh-notify`, glow `0 0 8px #ffa63a`, at the tile's
  top-right (`top: 7px; right: 12px`).
* **Sheet handle**: 63×3px, radius 2px, `--wh-handle`, centred, `top: 13px`.

---

## 6. Desktop components (CSS u at 1811×868)

Positions are from the viewport edges. "pad" = padding (top right bottom left).

### 6.1 Trial status card — P1 — `.wh-trial`

| | |
|---|---|
| box | left 18, top 15, width 246, height auto (= 227 with the demo content), radius 14, `.wh-panel` |
| pad | 14 20 17 21 |
| header row | `.wh-trial__head`: icon `compass-star` 22u, gap 10u, title "Trial 13 of 17" card-title 20u; row height 34u; icon vertically centred |
| divider | `.wh-divider` margin 10u 0 11u |
| rows | `.wh-trial__row` ×4, pitch 28u (`height: 28u; align-items:center`): icon 18u (`target`, `bar-chart`, `bookmark`, `map-pin`) + gap 12u + text row 15u: `<span class="wh-trial__k">Phase:</span> <span class="wh-trial__v">Explore</span>` with `column-gap: .35em` |
| divider | margin 11u 0 10u |
| progress | `.wh-trial__progress`: label line "Progress: 12 / 17 • 71%" row 15u (the "•" is `--wh-gold`, margin 0 .5em); margin-bottom 7u; `.wh-bar` 11u high, width 100% (203u), 17 segments, 12 filled |

Text starts at x 71 (icon column 18u + gap 12u + pad 21u) for the rows and at x 70 for the title.

### 6.2 Main Quest banner — P1 — `.wh-quest`

| | |
|---|---|
| box | left 547 (centred: `left: 50%; transform: translateX(-50%)`), top 16, width 717, height 118, radius 18, `.wh-panel.wh-frame`, `box-shadow: var(--wh-shadow), var(--wh-glow-gold)` |
| flourish | top-left (full), bottom-left (flipped, .28), top-right (mirrored, .35) |
| key icon | `icon('key')` 34u, absolutely at left 27, top 32 (`color: --wh-gold`, `filter: drop-shadow(0 0 6px rgba(255,205,120,.45))`) |
| text column | `.wh-quest__body`: pad 11 0 0 86 (text left edge at x 633) |
| tag | `.wh-tag` "✦ MAIN QUEST": at y 27 (11 from top), height 20u; the sparkle is `icon('sparkle')` 10u |
| title | title-l 23u, margin-top 5u (cap top at y 52), colour text, text-glow, one line, `white-space: nowrap; overflow:hidden; text-overflow: ellipsis` (max width 560u) |
| body | body 13.5u, lh 17u, margin-top 9u (first cap top at y 87); two paragraphs/lines: line 1 "The key is lost, and Ash has withdrawn." line 2 "Find a way to restore it — a heavy memory lies within. You’ll need a dictionary of 8 key words."; max-width 600u (the second line may run under the art; the art is behind text) |
| key art | `keyArt({size:100})` absolutely at right 35, top 7, 100u×101u, `z-index: 0` (text column `z-index: 1`); it carries its own radial glow (gold, 0 at r 50u) |

### 6.3 Hint toast — P1 — `.wh-toast`

| | |
|---|---|
| box | right 14, top 12, width 338, height 50, radius 25 (stadium), `.wh-panel` but border `--wh-frame-dim` |
| pad | 9 20 9 11 |
| icon | `.wh-toast__icon`: 22u circle, 1.5px border `--wh-frame`, `icon('info')` 14u inside (`--wh-gold-bright` border tone: `rgba(224,214,175,.9)`), centred vertically |
| text | body 13u (toast is one notch smaller), lh 16.3u, colour `--wh-text`, two lines, left edge at x 1504 (gap 12u after the icon) |
| behaviour | `role="status"`; `visible:false` → `opacity:0; transform: translateY(-6u)`; auto-dismiss is the caller's business (`model.hint.visible`) |

### 6.4 Signs and Visions panel — P2 — `.wh-signs`

| | |
|---|---|
| box | right 11, top 94, width 460, height 667 (`max-height: calc(100% - 94u - 107u)`; list scrolls), radius 18, `.wh-panel.wh-frame`, flourish top-left only |
| header | `.wh-signs__head`: pad 16 17 0 15; grid `eye | text | close`; eye sigil 50u×51u (`icon('eye-sigil')`), gap 17u (title at x 1422) |
| title | title 24u, lh 1.2, margin-top 1u (cap top y 117), text-glow |
| subtitle | body 13.5u, lh 19u, colour text-2, margin-top 6u (first cap top y 150), wraps as in the mockup ("Read the signs, interpret their meaning, / and find what lies beyond."): max-width 250u |
| close | `.wh-signs__close`: button, height 29u, pad 0 11u 0 13u, radius 15u, border 1px `--wh-frame-soft`, bg `--wh-btn-bg`; content "Close" ui 14u `--wh-text` + gap 6u + `.wh-kbd` "Esc" (22u×19u, font 11u); positioned at top 17u (y 111), right 17u (x 1783) |
| chips | `.wh-signs__filters`: `role="tablist"` row at y 200 (margin-top 14u after the subtitle block), pad 0 19u 0 23u, gap 12u, chips 34u; labels "All Signs (4)", "Active", "Resolved", "Anchors"; one `aria-pressed=true` |
| list | `.wh-signs__list`: margin-top 17u (first card top y 251), pad 0 14u 15u 20u, `display:grid; row-gap: 10u`, `overflow-y:auto` (thin gold scrollbar: `scrollbar-color: var(--wh-gold-deep) transparent; scrollbar-width: thin`) |

### 6.5 Sign card — P2 — `.wh-sign`

| | |
|---|---|
| box | width 426 (panel inner), height 158, radius 13, `.wh-card`; `position:relative`; it is a `<button>`-like row: the whole card opens the sign (`role="button"`, `tabindex=0`, chevron is decorative) |
| ring | `ringSigil({size:70})` at left 18, top 30 (centre (53, 64)) |
| title row | at left 119, top 10: "Sign #10" sign-title 15u + gap 10u + `.wh-pill` "✦ Elemental" (sparkle 9u, pill height 21u, text 13u) — pill vertically centred on the title |
| stats | `.wh-sign__stats`: `<dl>` at left 123 (icon) / 147 (text), top 39; 4 rows, pitch 19u; each: icon 14u (`shield`, `link`, `bolt`, `clock`, `--wh-gold`) + gap 10u + `<dt>` stat 12.5u "Shell stability:" + `column-gap: .5em` + `<dd>` value "34%" |
| anchor pill | `.wh-pill.wh-pill--anchor` at left 108, top 123, height 28u, width auto (222u with demo text), pad 0 14u 0 10u, gap 8u: `icon('target')` 15u + "Anchor: Shell III, Tiers 11–13" anchor 14u gold-text |
| chevron | `icon('chevron-right')` 10u×16u at right 23, top 56 (centred on the ring/stats block), `--wh-gold` |
| hover/focus | border-color `--wh-frame`, background lightens to `rgba(14,26,29,.70)`; 160 ms |

### 6.6 Log / Hints / Lore panel — P3 — `.wh-log`

| | |
|---|---|
| tabs | `.wh-log__tabs` `role="tablist"`: left 18, top 522, height 40; tabs 113u (Log), 110u, 110u wide, each `.wh-log__tab`: top radius 12u, border 1px `--wh-frame-soft` (no bottom border), bg `--wh-tab-bg`; content centred: icon 18u (`chat-bubble`, `bulb`, `book`) + gap 10u + ui 13u; active: `--wh-tab-active-bg`, text `--wh-gold-text`, border `--wh-frame`, underline + notch (5.2) |
| body | `.wh-log__body`: left 18, top 562, width 409, height 224, radius 0 14 14 14, `.wh-panel`; `role="tabpanel"` |
| rows | pad 18 20 16 16; `<ol>`; row = `.wh-log__row` grid `6u 12u | 45u | 1fr` → bullet `icon('diamond')` 6u `--wh-gold` (at x 34), time small 11.5u `--wh-text-muted` (x 57), text stat 12.5u lh 17u `--wh-text` (x 102); `row-gap: 8.5u`; newest first; max 40 rows kept, the list scrolls (same thin scrollbar) |
| Hints / Lore | same body; Hints shows `model.hints[]` (bulb bullet), Lore shows `model.lore[]` (book bullet); tab switch is instant (no animation) |

### 6.7 Interaction prompt — P3 — `.wh-prompt`

| | |
|---|---|
| box | centred in the gap between the side panels: `left: calc(50% - 23u)`, `translateX(-50%)`; top 618; width auto (259 with demo text), height 58, radius 29, `.wh-panel` with border `--wh-prompt-border`; knots top/bottom (5.2) |
| pad | 0 19u 0 22u; `display:flex; align-items:center; gap: 12u` |
| kbd | `.wh-kbd.wh-kbd--lg` "E" (38u×33u) |
| text | prompt 16u `--wh-text`, `white-space: nowrap` |
| behaviour | `visible:false` → `opacity:0; transform: translate(-50%, 4u)`; `[E]` key press calls `onAction('prompt')` |

### 6.8 Dialogue strip + reply — P3 — `.wh-dialogue`

| | |
|---|---|
| group | `left: calc(50% - 45u)`, `translateX(-50%)`, bottom 38 (top 782); `display:flex; align-items:center` |
| strip | `.wh-dialogue__line`: height 46u, radius 23u, `.wh-panel`; pad 0 38u 0 29u; content: speaker 15u gold-text "Ash" + 16u gap + 1px×20u `--wh-sep` + 13u gap + line 14u `--wh-text` |
| connector | `icon('connector')` 34u×22u, `margin-left: -20u; margin-right: -7u`, z above the strip |
| reply | `.wh-dialogue__reply`: `<button>`, height 48u, radius 24u, `.wh-panel` with border `rgba(232,214,172,.75)` and `box-shadow: var(--wh-shadow), 0 0 12u rgba(255,205,120,.18)`; pad 0 30u 0 8u; content: `.wh-kbd.wh-kbd--lg` "A" (38u×39u here: `height: 39u`), gap 12u, 1px×22u `--wh-sep`, gap 12u, line 15u `--wh-text` "I am ready to speak to Merec." |
| behaviour | `[A]` → `onAction('reply', replyId)`; up to 3 replies stack vertically (gap 8u, keys A/S/D) — the demo has one; `aria-live="polite"` on the strip |

### 6.9 Hotkey bar — P3 — `.wh-hotbar`

| | |
|---|---|
| box | right 15, bottom 24 (top 792), width auto (570 with demo labels), height 52, radius 16, `.wh-panel` border `--wh-frame-dim`, pad 8u 9u 8u 10u, `display:flex; gap: 10u` |
| button | `.wh-hotbar__btn`: height 35u, radius 10u, border 1px `--wh-frame-dim`, bg `--wh-btn-bg`; pad 0 14u 0 10u; content: `.wh-kbd` 24u×24u (font 12u) + gap 8u + ui 12u label `--wh-text`; the Settings button shows `icon('gear')` 16u instead of a kbd |
| items | M Map · V Signs & Visions · I Inventory · H Help · ⚙ Settings; widths with the demo labels: 80 / 142 / 110 / 82 / 100 |
| behaviour | click/hotkey → `onAction('hotkey', id)`; V toggles the Signs panel (P2 listens for the same key; P3 only forwards the action; the orchestrator wires `onAction` to `signs.toggle()`) |

---

## 7. Mobile components (CSS px at 390×876)

> **Superseded on phones (09.11.2026).** The 3D client mounts the two-mode phone HUD of
> `docs/ui-mobile-hud.md` (`mobile.js`) for `layout: 'mobile'`; the components below are what `status.js`,
> `log.js` and `actions.js` still render when mounted with `layout: 'mobile'` directly (their unit tests and
> `hud-preview.html`). The Signs sheet (§7.7) is shared by both layouts.


Side gutter is 14px for cards and 18px for the dialogue bar; the safe area is added by
the orchestrator (`padding-top: env(safe-area-inset-top)` on `.wh-root`), the mockup's
status bar is 44px tall — so the top bar sits at `top: 58px` on a 44px status bar, i.e.
`top: calc(14px + env(safe-area-inset-top, 44px))`.

### 7.1 Top bar — P1 — `.wh-topbar`

| | |
|---|---|
| row | `left:12px; right:12px; top: 14px + safe-area`, height 35, `display:flex; align-items:center` |
| menu | `.wh-btn-icon` 48×35 at left, `icon('menu')` 26×12 (three 1.5px lines, gold) |
| logo | `icon('logo-a')` 31×33 centred (`position:absolute; left:50%; translateX(-50%)`), `--wh-gold-bright` with `filter: drop-shadow(0 0 6px rgba(255,220,150,.6))`; decorative, `aria-hidden` |
| book, gear | two `.wh-btn-icon` 48×35 at the right, gap 6; icons `book` 26×18 and `gear` 20×20 |

### 7.2 Quest card — P1 — `.wh-quest--mobile`

| | |
|---|---|
| box | left 15, right 15 (width 360), top 410, height 123, radius 22, `.wh-panel.wh-frame` (inner hairline inset 5px), gold glow; no flourish |
| pad | 12 24 11 30 |
| tag | `.wh-tag` at top 12 (height 20, font 13, letter-spacing .08em, pad 0 10 0 8) |
| title | title-l 20px, lh 1.05, margin-top 6px, two lines ("Ash Has Turned Away: / Learn Ash’s Key"), max-width 225px |
| body | body 14.5px, lh 17.6px, margin-top 5px, two lines, max-width 250px ("The key is lost, and Ash has withdrawn. / Restore it — a heavy memory lies within.") |
| key art | `keyArt({size:98})` at right 2, top 6, 98×115 (the SVG is 100×115 in its mobile variant: pass `{size:98, tall:true}` → same art, taller glow), behind text |
| chevron | `icon('chevron-right')` 7×13 at right 25, vertically centred (y 478); the card is a `<button>` (`onAction('quest')`) |
| dots | `.wh-quest__dots` below the card: top 542, centred, 3 dots (5.2); `role="tablist"` of quests, swipe is not required (P1 renders `model.quests[model.questIndex]` and the dots; tapping a dot calls `onAction('questDot', i)`) |

### 7.3 Trial card — P1 — `.wh-trial--mobile`

| | |
|---|---|
| box | left 13, right 13 (width 364 — same gutter as the quest card is fine: use 14), top 562, height 64, radius 16, `.wh-panel` |
| grid | `grid-template-columns: 22px 1fr auto auto; align-items:center; column-gap: 0`; pad 0 14 0 13 |
| icon | `icon('target')` 22px (crosshair with the diamond-eye) centred vertically |
| main | left margin 10px (text at x 57.6): "Trial 13 of 17" card-title 14.5px (cap top y 574); "Explore" small 11px `--wh-text-2` (y 592); `.wh-bar` 107×8 at y 610 (17 segments, 12 filled, `--wh-bar-fill-mobile`) with "71%" small 11px 6px to its right |
| divider | 1×31px `--wh-sep` at x 206 and x 293 (`.wh-trial__vr`) |
| attempts | `.wh-trial__stat`: pad 0 10 0 15: `icon('bookmark')` 13×15 + gap 10 + stack: label small 10px `--wh-text-2` "Attempts" (y 579) over value row 14.5px "3 / 3" (y 594) |
| skill | same: `icon('bar-chart')` 18×18, label "Skill Tier", value "12"; pad-right 10 |

### 7.4 Tiles — P3 — `.wh-tiles`

| | |
|---|---|
| row | left 21, right 21 (width 348), top 640, height 72, `display:grid; grid-template-columns: repeat(3,1fr); gap: 12px` |
| tile | `.wh-tile` `<button>`: radius 16, border 1px `--wh-frame-soft`, bg `--wh-tile-bg`, `backdrop-filter: blur(8px)`, pad 10 6 8; content centred: icon 25×20 (`eye` small variant: `icon('eye')`, `chat-bubble` 20×16, `book` 22×16) at top 10, label tile 13.5px lh 1.15 at top 36 ("Signs & / Visions" wraps to two lines, "Log", "Lore") |
| dot | `.wh-tile__dot` when `unread` (5.2) |
| actions | `onAction('tile', 'signs'|'log'|'lore')`; the orchestrator opens the sheet for `signs` |

### 7.5 Prompt pill — P3 — `.wh-prompt--mobile`

| | |
|---|---|
| box | centred (`left:50%`), top 731, height 48, radius 24, width auto (259 with demo text), background `rgba(30,32,27,.88)` (`--wh-kbd-bg` tone, sampled `#292b25`), border 2px `--wh-prompt-border-mobile`, `box-shadow: 0 0 10px rgba(255,205,120,.55), 0 0 26px rgba(255,190,100,.25)`; notch (5.2) |
| pad | 0 30 0 30; gap 14 |
| kbd | `.wh-kbd.wh-kbd--lg` 30×30, radius 7, border 1.5px, font 15 |
| text | prompt 15.5px `--wh-text` |

### 7.6 Dialogue bar — P3 — `.wh-dialogue--mobile`

| | |
|---|---|
| box | left 18, right 17 (width 355), top 798, height 41, radius 21, `.wh-panel`; `<button aria-expanded>` |
| pad | 0 16 0 20; `display:flex; align-items:center` |
| content | `icon('chat-bubble')` 20×16 gold + gap 18 + "Ash:" speaker 13px gold-text + gap 16 + line 13px `--wh-text` (ellipsis) + `icon('chevron-up')` 11×6 at the far right |
| expanded | the bar grows upward to show the full line and the reply list (same reply pill as desktop, 44px high, full width minus 16px); `aria-expanded` toggles; 160 ms height transition (none under reduced motion) |

### 7.7 Signs & Visions bottom sheet — P2 — `.wh-sheet`

| | |
|---|---|
| box | `left:0; right:0; top: 114px; bottom: 0` (height 762), radius 28 28 0 0, `.wh-panel.wh-frame` with `--wh-sheet-bg`, outer top hairline `--wh-frame`, inner hairline inset 6px (top corners only: `border-bottom: 0`), `box-shadow: 0 -12px 40px rgba(0,0,0,.5)` |
| handle | 5.2, `top: 13px` |
| header | pad 35 8 0 22: eye sigil 44×44 at left 22, top 149; title 24px at left 80, cap top y 154 (text-glow); subtitle 13.5px lh 17px `--wh-text-2`, max-width 250, two lines (y 185 / 202) |
| close | `.wh-btn-icon.wh-btn-icon--round` 34px circle at right 8, top 31 (y 145.5), `icon('close')` 13px `--wh-text` |
| chips | top 233 (margin-top 17 after the subtitle), left 18, gap 8, height 31, pad 0 20, font 12px; horizontally scrollable row (`overflow-x:auto; scrollbar-width:none`) |
| list | top 284.6 (margin-top 20), pad 0 7 24 13 → cards 370 wide; `row-gap: 10px`; scrolls (`overscroll-behavior: contain`) |
| open/close | opens with `transform: translateY(0)` from `translateY(100%)`, 220 ms ease-out (none under reduced motion); a backdrop `.wh-sheet__scrim` `rgba(0,0,0,.35)` behind it (tap closes); Esc closes; focus moves to the close button on open and returns to the opener on close; `role="dialog" aria-modal="true" aria-labelledby` |

### 7.8 Sign card (mobile) — P2 — `.wh-sign--mobile`

| | |
|---|---|
| box | width 370, height 157, radius 13, `.wh-card` with `--wh-card-bg-mobile` |
| ring | `ringSigil({size:62})` at left 20, top 27 |
| title row | left 110, top 12: "Sign #10" 15px + gap 12 + pill (height 20, font 13) |
| stats | icons 12px at left 113, text at left 140, top 42, pitch 16.9 → `line-height: 17px`, font 12.5 |
| anchor pill | left 96, top 114, height 22.5, pad 0 12 0 10, gap 8, `icon('target')` 14 + 13.5px text |
| chevron | 7×13 at right 17, top 57 |

---

## 8. View model (`model.js`)

`DEMO_MODEL` carries the mockup content; see the JSDoc in the file. Key points for
implementers:

* UI chrome text is **never** hard-coded: labels come from `wh.*` keys through
  `i18n.t()` / `tx()` / `h(..., {i18n})`, so a locale switch re-renders in place
  (`bindI18n` is called once by the orchestrator on `.wh-root`; packages only need to
  use `data-i18n` through `h()`/`tx()` and re-render their dynamic parts in `update()`).
* Narrative strings in the model are `{key, args}` objects (`TextRef`); render with
  `tx(el, i18n, ref.key, ref.args)`. Literal strings are allowed only for numbers and
  hashes (`text: '13:48'`).
* Numbers are formatted in the model's `format` helpers (`pct`, `signedPct`, `range`,
  `seconds`), so "20 – 51%" and "4.6 s – 47.6 s" come out identical in both layouts.
* `model.layout` is **not** in the model: layout is a mount option and an `update()`
  argument.

---

## 9. Packages

Three implementers work in parallel. A package owns exactly the files listed; it must not
edit `tokens.css`, `icons.js`, `model.js`, the locales, or another package's files. If a
package needs a new token or icon, it defines it locally in its own CSS/JS under its own
class/prefix and notes it in its report; the orchestrator folds it into the shared files.

| Package | Components | Files | Export |
|---|---|---|---|
| **P1 Status & Quest** | 6.1 trial card, 6.2 quest banner, 6.3 toast, 7.1 top bar, 7.2 quest card + dots, 7.3 mobile trial card | `world-hud/status.js`, `world-hud/status.css` | `mountStatus` |
| **P2 Signs & Visions** | 6.4 panel, 6.5 cards, 7.7 sheet, 7.8 mobile cards, chips, open/close/Esc/V | `world-hud/signs.js`, `world-hud/signs.css` | `mountSigns` |
| **P3 Log, prompt, dialogue, hotbar, tiles** | 6.6 log panel, 6.7 prompt, 6.8 dialogue, 6.9 hotbar, 7.4 tiles, 7.5 mobile prompt, 7.6 mobile dialogue bar | `world-hud/log.js`, `world-hud/log.css`, `world-hud/actions.js`, `world-hud/actions.css` | `mountLog`, `mountActions` |

### 9.1 Mount signature (identical for every package)

```js
/**
 * @param {HTMLElement} root            the `.wh-root` element (position:absolute; inset:0)
 * @param {object} o
 * @param {import('./model.js').WorldHudModel} o.model
 * @param {object} o.i18n               ctx.i18n (t, locale, subscribe)
 * @param {'desktop'|'mobile'} o.layout
 * @param {(action: string, ...args: any[]) => void} [o.onAction]  user intents, see table
 * @param {{reducedMotion(): boolean}} [o.prefs]
 * @returns {{ el: HTMLElement, update(model, layout?): void, destroy(): void }}
 */
export function mountStatus(root, o) {}
export function mountSigns(root, o) {}   // also returns { open(), close(), toggle(), isOpen() }
export function mountLog(root, o) {}      // also returns { setTab(id) }
export function mountActions(root, o) {}  // also returns { setDialogueExpanded(bool) }
```

Rules:

* `el` is one wrapper element per package (`.wh-status`, `.wh-signs-root`, `.wh-log-root`,
  `.wh-actions`) appended to `root`; `destroy()` removes it and every listener
  (keydown handlers on `window` included).
* `update(model, layout)` re-renders from the new model; it must be cheap when nothing
  changed (compare the sub-objects the package uses by reference) and must not lose
  focus or the open state. When `layout` changes the package re-renders its DOM for the
  other layout (desktop and mobile DOM differ; do not try to morph one into the other).
* Keyboard: P2 handles `V` (toggle) and `Escape` (close while open); P3 handles `E`
  (prompt), `A/S/D` (replies), `M I H` (hotkeys, forwarded) and never `V` (it forwards
  `onAction('hotkey','signs')`; the orchestrator calls `signs.toggle()`). Keys are
  ignored while focus is in an input/textarea or with modifiers.
* `onAction` names: `'prompt'`, `'reply'(id)`, `'hotkey'(id)`, `'tile'(id)`,
  `'quest'`, `'questDot'(i)`, `'tab'(id)`, `'filter'(id)`, `'sign'(id)`, `'top'(id)`
  (`'menu'|'journal'|'settings'`), `'dialogueToggle'(expanded)`, `'signsOpen'`, `'signsClose'`.
* No package imports another package. Shared imports: `../dom.js` (`h`, `tx`, `applyI18n`),
  `./icons.js`, `./model.js` (types + format helpers only).
* Styles: each package adds its stylesheet once via a `<link data-wh-css="status">`
  pointing at `new URL('./status.css', import.meta.url)` (copy the pattern of
  `ensureStyles` in `dom.js`); `tokens.css` is added by the orchestrator before any
  package mounts. Every selector starts with `.wh-root .wh-<package-prefix>` or a class
  the package owns; no element selectors, no `!important`.
* Each package ships a Node test file `game/tests/wh-<package>.test.mjs` that imports its
  module in a minimal DOM (see `tests/ui-logic.test.mjs` for the jsdom-free pattern used
  in this repo, or `linkedom` if already present — do not add dependencies) and checks:
  it mounts with `DEMO_MODEL` in both layouts, all demo texts appear, `destroy()` leaves
  `root` empty, and every `data-i18n` key exists in `en`. The orchestrator adds the file
  to the `npm test` script.

### 9.2 Integration (orchestrator, later)

`world-hud/index.js` — `mountWorldHud(root, {model, ctx, onAction})`: adds `tokens.css`,
imports the fontsource CSS, creates `.wh-root`, decides `layout` from
`matchMedia('(max-width: 700px)')`, mounts the three packages, binds i18n, forwards
actions, and returns `{update(model), setLayout(l), signs, log, actions, destroy()}`.
`game/hud-preview.html` + `world-hud/preview.js` render `DEMO_MODEL` with a language
toggle and the reference image behind the HUD (section 10).

---

## 10. Comparison procedure (pixel parity)

1. Reference PNGs are **not committed**. Put them at `game/.scratch/ref/desktop.png` and
   `game/.scratch/ref/mobile.png` (`.scratch/` is git-ignored). Vite serves them in dev
   at `/.scratch/ref/<name>.png`.
2. `hud-preview.html` accepts `?layout=desktop|mobile&ref=1&lang=en|ru&sheet=1&dim=.5`:
   `ref=1` places `<img class="wh-preview-ref">` (`position:fixed; inset:0; object-fit:fill`)
   behind `.wh-root`, cropped to the phone screen for mobile (`object-position` computed
   from the numbers in section 1: the page shows image rect x 28–582, y 14–1261 scaled to
   390×876); `dim` sets the image opacity; `sheet=1` opens the Signs sheet.
3. Script `game/scripts/wh-compare.mjs` (orchestrator writes it; implementers may run a
   copy from the scratch directory before it exists):

   ```bash
   cd game && npm run dev &            # Vite on 5173
   node scripts/wh-compare.mjs --layout desktop --out .scratch/cmp      # 1811×868, deviceScaleFactor 1
   node scripts/wh-compare.mjs --layout mobile  --out .scratch/cmp      # 390×876
   node scripts/wh-compare.mjs --layout mobile --sheet --out .scratch/cmp
   ```

   The script (Playwright, Chromium) screenshots `?layout=…&ref=0` and `?layout=…&ref=1&dim=1`,
   writes `hud-<layout>.png`, `overlay-<layout>.png` (HUD at 50 % over the reference) and
   a per-component diff table: for each box in section 6/7 it crops the HUD screenshot and
   the reference (mobile reference pre-cropped and resized to 390×876 with PIL or sharp-free
   canvas) and prints mean absolute difference per channel and the bounding box of the
   brightest pixels (text extents), so a 2 px drift in a title shows up as a number.
4. Acceptance: every component box within ±2 u of the spec, every text extent within ±3 u,
   no console errors, Lighthouse-style contrast check passes (`tests/wh-a11y` added by the
   orchestrator: parses `tokens.css`, repeats the contrast test on the `--wh-*` text/surface
   pairs of section 2.3).

---

## 11. Accessibility and behaviour summary

* Every interactive element is a native `<button>` with a visible label or `aria-label`
  from `wh.*`; hotkeys are hints, not the only path.
* Live regions: toast `role="status"`, dialogue strip `aria-live="polite"`, log list
  `aria-live="off"` (it is history).
* Panels that take input set `pointer-events:auto`; the root is `pointer-events:none` so
  the canvas receives everything else.
* Reduced motion: no transitions/animations; the sheet appears without sliding; the
  notification dot does not pulse (it never pulses anyway).
* Language switch: all chrome re-renders in place via `data-i18n`; packages keep state.
* Text never relies on colour alone: active chip/tab also change border and weight of the
  underline; the unread dot comes with an `sr-only` "New entries" label.
