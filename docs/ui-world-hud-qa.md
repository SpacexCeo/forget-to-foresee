# World HUD — design-quality review (parity + audit)

Review of `game/src/ui/world-hud/` against the two owner mockups (`game/.scratch/ref/desktop.png`,
`game/.scratch/ref/mobile.png`) and against the Impeccable `audit` / `critique` / `polish` /
`craft-floor` playbooks, with the override that **the mockup is the brief**: nothing below
recommends moving away from the mockup's look; tensions with the playbooks are notes only.

Evidence: `node scripts/wh-compare.mjs` for desktop, mobile, mobile `--sheet`, each in `en` and
`ru` (six runs, outputs in `game/.scratch/cmp/`), plus 2× zoomed side-by-side crops of every
component made with PIL (kept in the session scratchpad, not committed). The review was cut
short by the owner; sections marked **not checked** were not exercised and should be run before
the next pass.

## 0. Status (08.11, after the fix pass)

All 15 items of §5 are applied, plus audit P3 #10 (batched fits), #11 (`wh.tiles.label`) and #13
(`aria-controls` on the carousel). Decisions taken:

- **#1 key art:** softened vector. The mockup PNGs are not in the repository (`game/.scratch/` is
  git-ignored), so no raster plate could be cut; `keyArt()` lost its orbits, arcs and sparks, the
  halo is stronger, and the banner/card apply `blur(.8px)` plus a warm drop-shadow.
- **#10 zoom:** `--wh-user-scale` from the new `prefs.hudScale` (Settings → Interface size: 0.9 /
  1 / 1.15 / 1.3), and body-copy tokens have a `.75rem` floor so browser font settings reach them.
- **#11 low effects:** `html[data-tier="low"]` (or `data-fx="low"`) drops every backdrop blur.
- **#13:** short/landscape phones hide the quest card (≤ 640 px tall), then the trial card and tiles
  (≤ 520 px); the 320 px trial bar shrinks instead of overflowing.
- **#15:** every package glyph is in `icons.js` (`menu-wide`, `info-i`, `chevron-slim`, `connector`,
  `bubble`, `braid`, `crosshair`; `ringSigil` is now the mockup ring); package CSS has no hex colour
  literals (`tests/wh-shared.test.mjs` enforces both).
- **Audit #9 (sign card as `<button>`) is not applied:** the card holds a `<dl>`, which is not
  allowed inside a button; it stays `div role="button"` with Enter/Space handling.

---

## 1. Summary scores

| Area | Score | One line |
|---|---|---|
| Pixel parity vs mockup (0–10) | **7.5** | Every component box is within ±2 u of the spec on desktop and within ±1 px on mobile; the remaining differences are art and type weight, not layout. |
| Audit — Accessibility (0–4) | 3 | Native buttons, focus ring, Esc/V, focus return, inert closed panels; gaps: carousel dots < 24 px, targets shrink below 24 px at the 0.6 u floor, text does not grow with browser zoom. |
| Audit — Performance (0–4) | 2 | 10 `backdrop-filter: blur()` surfaces on desktop and ~9 on mobile, all over a live WebGL canvas, with no low-effects switch. |
| Audit — Theming (0–4) | 3 | Tokens are used for the system; ~25 fitted literals (borders, gradients, glows) live in package CSS. |
| Audit — Responsive (0–4) | 2 | 1087–2445 px and 390×876 are right; compact desktop, short/landscape phones and 320 px phones are untested and partly broken by construction. |
| Audit — Implementation integrity (0–4) | 3 | Coherent, product-specific; some duplicated art (two ring sigils, two chevrons, two connectors). |
| **Audit total** | **13/20** | Acceptable — address Performance and Responsive. |
| Critique (Nielsen, 8 applicable heuristics) | 27/32 | see §4 |

Console errors: **none** in any of the six compare runs (the script fails on console errors).

---

## 2. Parity diffs per component

Severity: **H** = visible at normal viewing distance, **M** = visible when looking for it,
**L** = visible only in the 2× crop. Lengths are u (desktop) or px (mobile). Measurements are
from the 2× crops (so ±1 u).

### 2.1 Desktop

| Component | Difference | Sev | Fix |
|---|---|---|---|
| 6.2 Quest banner — key art | Mockup art is a soft, blurred, glowing key (indistinct silhouette, wide warm halo, ~100×100 at right 35). HUD draws a crisp vector key with orbit circles, dashed ring and sparks. The crispness is the single most noticeable difference on the whole screen. | H | Preferred: use the owner's raster. Crop `ref/desktop.png` x 1129–1229, y 23–124 (and the mobile crop x 577–576+... from `ref/mobile.png`) to PNG assets and render as `<img class="wh-quest__art">`; keep `keyArt()` as fallback. If vector must stay: in `icons.js keyArt()` drop the dashed orbit, the arcs and the sparks, raise the halo stops to `.8/.35/0`, and in `status.css .wh-quest .wh-quest__art` add `filter: blur(.8px) drop-shadow(0 0 calc(12 * var(--wh-px)) rgba(255,200,110,.6))`. Owner decision needed (the mockup art may itself be a render artefact). |
| Shared — serif weight | Mockup serif lettering (titles, trial rows, "Ash", prompt, anchor pill) is visibly darker than Caslon 400 + 0.3/0.18 px stroke. | H | `tokens.css .wh-root`: `--wh-stroke-title: .38px; --wh-stroke-text: .24px`. Re-check "Signs and Visions" and "Trial 13 of 17" crops after the change; do not exceed .4/.26. |
| 6.2 Quest tag "✦ MAIN QUEST" | HUD tag is ~20 u wider than the mockup (text 82 u vs 68 u; pill 112 u vs 92 u). | M | `tokens.css`: `--wh-fs-tag: calc(10 * var(--wh-px))` (desktop) and `10.5px` in the `max-width: 700px` block. Keep tracking. Then `status.css .wh-quest .wh-quest__tag { height: calc(17 * var(--wh-px)) }`. |
| 6.2 Quest banner — flourishes | HUD corner vines (top-left .55, bottom-left .28, top-right .3, bottom-right .2) read as clear loops; the mockup banner shows only a faint top-left filigree. | M | `status.css`: `.wh-root .wh-quest .wh-frame__corner { opacity: .32 }`, `--bl`, `--tr`, `--br` → `.12`; in `icons.js` `flourish` set `sw: .7`. |
| 6.6 Log — timestamps | Mockup "13:48" is ~34 u wide, bright; HUD is 27.5 u (`--wh-fs-small` 12 u) and dimmer. Clearly smaller than the row text in the HUD, equal to it in the mockup. | H | `log.css .wh-root .wh-log__time { font-size: calc(14 * var(--wh-px)); color: var(--wh-text); }` and `grid-template-columns: 23u 50u 1fr` so the text column stays at x 102. |
| 6.6 Log — bullets | Mockup bullets are small hollow diamonds (~6 u); HUD bullets are 8 u, stroke 5 → read as filled. | L | `log.js renderRows`: `strokeWidth: 2.4`; `log.css .wh-log__bullet { width/height: 7u; margin-top: 7u }`. |
| 6.6 Log — tab labels | Mockup "Log"/"Hints"/"Lore" ~7 % larger. | L | `log.css .wh-log__tab { font-size: calc(13.5 * var(--wh-px)) }`. |
| 6.4 Signs — braided left edge | Mockup runs a woven/chain ornament down the panel's left edge (visible from the header down); HUD draws the corner flourish instead. | M | Add `icon('braid')` to `icons.js`: a 10×24 unit of two interlocking ellipses (stroke .9, `currentColor`); `signs.css .wh-root .wh-signs::after { content:""; position:absolute; left: 3u; top: 64u; bottom: 64u; width: 10u; background: url("data:image/svg+xml,…") repeat-y center/10u 24u; opacity:.5; color: var(--wh-gold); pointer-events:none }`. Ask the owner for the original strip if one exists. |
| 6.4 Signs — chips | Inactive chip labels ~7 % smaller than the mockup ("Active" 34 u vs 36.5 u); the active chip's halo is much fainter than the mockup's wide orange glow (both layouts). | M | `signs.css .wh-root .wh-signs .wh-signs__chip { font-size: calc(14.5 * var(--wh-px)) }` (desktop only; mobile already matches). Shared `tokens.css`: `--wh-glow-chip: 0 0 18px rgba(255,190,90,.7), 0 0 36px rgba(255,170,70,.3), 0 0 0 1px rgba(255,231,142,.9)`. |
| 6.4 Signs — title weight | "Signs and Visions" lighter than mockup. | M | Covered by the shared stroke change. |
| 6.5 Sign card | Ring, stats, anchor pill and chevron all within ±1 u. Type pill 4 u wider than mockup; stat icons slightly heavier. | L | `signs.css .wh-sign__type { padding: 0 9u 0 8u }`; `.wh-sign__sicon { width/height: 17u }`. |
| 6.1 Trial card — icons | Mockup Phase icon is a plain crosshair + ring (no inner diamond); Skill Tier chart has 4 bars (HUD 3); mobile bookmark shows an arch, HUD a chevron. | L | `icons.js`: add `'crosshair'` (target without the diamond) for the desktop Phase row; `'bar-chart'` → four bars at x 3.5/8/12.5/17 widths 2.6; `'bookmark'` inner mark `M9.4 10.4a2.6 2.6 0 0 1 5.2 0`. `status.js` row('crosshair', …). |
| 6.1 Trial card — bar | Mockup segments have ~2 px dark gaps and look chunkier. | L | `tokens.css .wh-bar { gap: 2px }` (desktop only: wrap in `@media (min-width: 701px)`). |
| 6.1 Trial card — title | 1–2 u lower/lighter than the mockup. | L | Covered by the stroke change; no position change needed. |
| 6.3 Toast | Within 1 u in every measure; icon ring and text match. Background opacity could not be judged (HUD was shot over a dark backdrop). | L | None. Verify over the bright sky with `?ref=1` at full HUD opacity (**not checked**). |
| 6.7 Prompt | Within 1 u. Mockup kbd border a touch brighter; mockup fill more translucent. | L | `actions.css .wh-prompt .wh-prompt__kbd { border-color: var(--wh-kbd-border) }` is already there; optionally lower the fill alphas by .04. |
| 6.8 Dialogue | Within 1 u. HUD connector diamond larger/heavier than the mockup's small ◈. | L | `actions.js wh-a-connector`: outer diamond 4.2 half-size (from 5.8), stroke .9. |
| 6.9 Hotbar | Within 2 u on every button; gear 1 u larger. | L | `actions.css .wh-hotbar__gear { width/height: 19u }`. |
| RU desktop | Banner grows to 137 u (3 body lines), hotbar 648 u wide, dialogue lifts one row (`wh-dialogue--lifted`): intended behaviour, no overlap. Prompt 251 u. No clipping seen. | — | None. |

### 2.2 Mobile

| Component | Difference | Sev | Fix |
|---|---|---|---|
| 7.2 Quest card — key art | Same crisp-vs-blurred art difference as desktop; even more prominent at 98 px over 124 px card height. | H | Same fix as 6.2 (raster plate from `ref/mobile.png`, or softened vector). |
| 7.2 Quest card — tag | Tag 13 px wider than the mockup (120 vs 107). | M | `--wh-fs-tag: 10.5px` in the mobile token block (shared). |
| 7.1 Top bar — logo | Mockup "A" has a strong soft halo; HUD glow is faint. | M | `status.css .wh-topbar__logo-a { filter: drop-shadow(0 0 8px rgba(255,220,150,.9)) drop-shadow(0 0 18px rgba(255,200,120,.5)) }`. |
| 7.1 Top bar — icons | Menu, book, gear within 1 px. | L | None. |
| 7.3 Trial card | Text, bar (8 cells), dividers and stats within 1 px. Icon glyph differences as 6.1. | L | See 6.1 icon fixes. |
| 7.4 Tiles | Boxes, icons, labels and the unread dot within 1 px. Mockup tiles read lighter/greyer (translucent over the bridge); not judgeable over the dark backdrop. | L | Verify with `?ref=1` (**not checked**). |
| 7.5 Prompt pill | Box within 1 px; notch matches. The mockup's outer glow is wider and warmer than the HUD's. | M | `actions.css .wh-prompt--mobile { box-shadow: 0 0 14px rgba(255,190,90,.75), 0 0 32px rgba(255,170,70,.35), inset 0 -12px 18px -10px rgba(255,180,90,.25) }`. |
| 7.6 Dialogue bar | Within 1 px; chevron slightly thinner than mockup. | L | `actions.js`: `ic('chevron-up', …, { strokeWidth: 1.9 })`. |
| 7.7 Sheet — header | Handle, eye, title, subtitle and close within 1 px. Title weight lighter (shared stroke). | L | Shared stroke change. |
| 7.7 Sheet — chips | Positions match; active glow fainter (shared `--wh-glow-chip`). | M | Shared glow change. |
| 7.8 Sign card | Ring, title, pill, stats, anchor, chevron within 1 px on cards #10 and #11. | — | None. |
| RU mobile | Quest card grows upward to 139 px (top 394) as designed; trial title falls back to `titleShort`; anchor pills use `tiersShort`. No clipping seen in the sheet. | — | None. |

### 2.3 Viewports and states — **not checked**

Screenshots at 1280×720, 1000×700, 2560×1440, an iPhone viewport other than 390×876,
keyboard-only focus states, Signs open/closed transitions, Log tab switching, and the expanded
mobile dialogue were **not captured** in this pass. (Earlier P1-only runs at 1280 and 1000
exist in `.scratch/cmp/` but were not reviewed here.)

---

## 3. Audit findings (P0–P3)

No P0.

### P1

1. **Text does not resize with browser zoom (WCAG 1.4.4).** `tokens.css`: `--wh-px: clamp(0.6px, 100vw/1811, 1.35px)` is viewport-proportional, so zooming the browser to 200 % shrinks the CSS viewport and the HUD stays roughly the same physical size; at 1920 px, 200 % zoom lands in the compact range and text grows only ~13 %. The spec records this as the owner's choice (proportions over a floor). Mitigation that keeps the mockup proportions at 100 %: a user "HUD scale" preference multiplied into the unit — `--wh-px: calc(clamp(0.6px, 100vw/1811, 1.35px) * var(--wh-user-scale, 1))` set by the orchestrator from `prefs`, and a `rem`-based floor on the body roles (`font-size: max(var(--wh-fs-body), .75rem)`) so OS/browser font-size settings still reach the text. Owner: shared (`tokens.css`, `index.js`).

### P2

2. **Backdrop blur cost.** Desktop renders ten `backdrop-filter: blur(10px)` surfaces (trial, banner, toast, Signs panel 460×667 u, log tabs, log body, prompt, dialogue strip, reply, hotbar) plus `blur(8px)` on nine mobile surfaces (3 top buttons, quest, trial, 3 tiles, prompt pill, dialogue bar), all over a WebGL canvas that repaints every frame. On integrated/mobile GPUs this is the dominant HUD cost. Fix: keep the look but gate it — `html[data-fx="low"] .wh-root { --wh-panel-blur: 0px }` and the same for the 8 px literals (`.wh-btn-icon`, `.wh-tile`, `.wh-prompt--mobile`, `.wh-log__tabs` → use `var(--wh-panel-blur)`), with the orchestrator setting `data-fx` from `prefs` or from a frame-time probe. Owner: shared + P3 (`tokens.css`, `log.css`, `actions.css`).
3. **Touch/pointer targets below 24 px (WCAG 2.5.8).** (a) Quest carousel dots are 18×20 px with 18 px pitch, so neither the size nor the spacing exception holds; (b) at the 0.6 u floor (1087 px) the Signs `Close` is 17 px tall, chips 20 px, hotbar buttons 21 px. Fix: `status.css .wh-quest__dot { width: 24px; height: 24px }` with the 6 px dot centred (pitch becomes 24 px — 12 px total drift from the mockup, or keep 18 px pitch and accept the overlap only if the owner prefers the mockup) ; `tokens.css`: `.wh-root :where(.wh-chip, .wh-signs__close, .wh-hotbar__btn, .wh-kbd--lg) { min-height: 24px }` — invisible at 1811, active only below ~1270 px. Owner: P1 (dots), shared (floor).
4. **Short viewports break the mobile composition (by code reading, not screenshot).** Mobile positions are absolute px on an 876-tall frame: trial card `top: 562px`, quest card `bottom: calc(100% - 533px)`, tiles `bottom: 164px`, prompt `bottom: 96px`. On a 700×390 landscape phone or any height < ~640 px the quest card is pushed below the trial card and the bottom cluster overlaps it. Fix: in `status.css` and `log.css`, `@media (max-width: 700px) and (max-height: 640px)` → `.wh-quest--mobile, .wh-quest__dots, .wh-trial--mobile { display: none }` or stack them with a flex column; add a landscape note to the spec. Owner: P1 + P3.
5. **320 px phones (by code reading).** `.wh-trial--mobile` keeps a 104 px bar + "71 %" + 10 px margins in the main column; with two `max-content` stat columns the main column drops to ~110 px at 320 px and the bar row overflows. Fix: `status.css .wh-trial--mobile .wh-trial__bar { width: min(104px, 100%) }`, and `.wh-trial__barrow { flex-wrap: nowrap; min-width: 0 }` with the bar `flex: 1 1 60px`. Owner: P1. **Not checked** in a browser.
6. **Literal colours and glows in package CSS (theming/integrity).** `status.css` (toast border/icon `#f1e8cf`, mobile quest border, mobile bar gradient/track/border), `log.css` (active-tab gradients, notch `rgba(70,56,30,1)`, dot `#fff3b4`), `actions.css` (prompt gradient, mobile prompt border quad `#f8e6b2 #f1c878 #ebb35c`, notch `#ecb55e`, kbd `rgba(40,38,31,.9)`, dialogue border quad), `signs.js` ring gradient stops. These are mockup-fitted refinements, i.e. missing tokens, not errors. Fix: fold into `tokens.css` as `--wh-toast-border`, `--wh-tab-active-fill`, `--wh-prompt-border-mobile-*`, `--wh-bar-mobile-*`, `--wh-ring-gold-*` (the `signs.css` local `--wh-sg-*` block shows the intended pattern). Owner: shared.
7. **Gold icon contrast on the lightest tile case.** `--wh-tile-bg` rgba(52,58,54,.62) over a bright sky (#d0d8dc) composites to ≈ #727876; `--wh-text` passes (≈ 4.9:1) but the gold icon (#e4c272) is ≈ 2.4:1, under the 3:1 non-text minimum. In the mockup the tiles sit over the darker bridge, so this is a scene-dependent risk, not a mockup defect. Fix without changing the look over the mockup scene: `log.css .wh-tile { background: linear-gradient(rgba(10,18,20,.25), rgba(10,18,20,.25)), var(--wh-tile-bg) }` or raise `--wh-tile-bg` alpha to .72 (shared). Owner: P3 / shared. **Not measured in a browser** (computed from tokens).

### P3

8. **Duplicated art.** `signs.js signRing()` replaces `icons.js ringSigil()` (now dead); `signs.js CHEVRON`, `status.js st-menu/st-info-i`, `actions.js wh-a-connector/wh-a-bubble` duplicate or supersede `icons.js` entries (`chevron-right`, `menu`, `info`, `connector`, `chat-bubble`). Fold the package versions into `icons.js` and delete the shared originals they replace. Owner: shared.
9. **Sign cards are `div role="button"`** (spec §11 asks for native buttons). Works with Enter/Space; switch to `<button>` with `display:flex` and `text-align:left` for free form-submission/`disabled` semantics. Owner: P2.
10. **Layout reads inside write loops.** `status.js fit()` and `signs.js fitAnchors()` write text then read `scrollWidth` per node (one forced reflow per node; 1 and ≤ 4 nodes). Batch: write all long forms, read all widths, then write the short forms. Owner: P1, P2.
11. **Landmark names collide.** Mobile `nav` tiles and the desktop log `section` both use `wh.log.label` ("Journal"); the mobile top bar uses `wh.root.label`. Give the tiles their own key (`wh.tiles.label`: "Journal shortcuts"). Owner: P3 + locales.
12. **`.wh-dialogue__more` animates `grid-template-rows`** (layout property; 160 ms, mobile only). Allowed by the spec; note only. Reduced motion is handled globally (`transition: none`), and every state change survives it (visibility/`data-open` toggles), so the global kill is acceptable here.
13. **Carousel `role="tablist"` without a `tabpanel`.** Harmless for AT but technically incomplete; add `aria-controls` pointing at the quest card id. Owner: P1.

### Positive findings

Every interactive element except the sign card is a native `<button>` with an `aria-label` or
visible text from `wh.*`; `:focus-visible` ring uses `--wh-gold-bright` with offset; the Signs
sheet is a proper `role=dialog aria-modal` with Tab trapping, scrim, Esc, `inert` while closed
and focus return; hotkeys ignore inputs and modifiers and use `e.code` so RU layouts work;
`update()` compares sub-objects by reference and keeps focus; locale switch re-renders in place;
no console errors in six runs; RU strings never clip (short forms kick in on mobile).

---

## 4. Critique (heuristics, only where they do not fight the mockup)

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Progress bar, phase, toast, unread dot, active chip/tab all visible. |
| 2 | Match with the real world | 3 | Game vocabulary is consistent (Shell, Tier, Anchor); "Anchors" chip vs "Anchor:" pill is fine. |
| 3 | User control and freedom | 3 | Esc/Close/scrim/V everywhere; the toast has no dismiss affordance (caller's business per spec). |
| 4 | Consistency and standards | 3 | Two chevron drawings and three kbd sizes across packages; otherwise one voice. |
| 5 | Error prevention | n/a | No destructive actions in the HUD. |
| 6 | Recognition rather than recall | 4 | Every hotkey is printed on its control. |
| 7 | Flexibility and efficiency | 4 | Keyboard + pointer + touch paths for everything. |
| 8 | Aesthetic and minimalist design | 3 | Dense by brief; the two glass surfaces behind the log tabs and body are one surface too many visually (note only — mockup has them). |
| 9 | Recover from errors | n/a | No error states in scope. |
| 10 | Help and documentation | 3 | Help button and Hints tab exist; Help is a stub. |
| | **Total** | **27/32** | |

Craft-floor notes that conflict with the brief and are therefore **not** recommendations:
glow halos without offset (`--wh-glow-gold`, chip glow) and glass blur as a material are what
the mockup shows; the "✦ MAIN QUEST" eyebrow is in the mockup; the `-webkit-text-stroke` weight
hack is a deliberate substitute for a heavier Caslon cut.

---

## 5. Top-15 fixes, in priority order

| # | Fix | Owner |
|---|---|---|
| 1 | Key art: raster plate from the mockup (or softened vector) on banner and mobile card (§2.1 row 1, §2.2 row 1) | shared (`icons.js`) + P1 |
| 2 | Serif weight: `--wh-stroke-title .38px`, `--wh-stroke-text .24px` | shared |
| 3 | Log timestamps 14 u, `--wh-text`, 50 u column | P3 log |
| 4 | `--wh-fs-tag` 10 u / 10.5 px (tag width) | shared |
| 5 | `--wh-glow-chip` stronger halo (desktop + sheet) | shared |
| 6 | Signs panel braided left edge (`icon('braid')` + `.wh-signs::after`) | shared + P2 signs |
| 7 | Quest banner flourish opacity .32/.12, stroke .7 | P1 status + shared |
| 8 | Mobile prompt pill wider glow; top-bar logo halo | P3 actions, P1 status |
| 9 | Desktop chip label 14.5 u | P2 signs |
| 10 | HUD user scale / zoom mitigation (audit P1 #1) | shared |
| 11 | Low-effects switch for `backdrop-filter` (audit #2) | shared + P3 |
| 12 | 24 px minimum targets: carousel dots, floor `min-height` (audit #3) | P1 status + shared |
| 13 | Short-viewport and 320 px mobile guards (audit #4, #5) | P1 status + P3 log |
| 14 | Icon glyph corrections: crosshair, 4-bar chart, bookmark arch; log bullets hollow | shared + P3 log |
| 15 | Fold package literals into tokens and package art into `icons.js` (audit #6, #8) | shared |

---

## 6. Not checked in this pass

- Screenshots at 1280×720, 1000×700, 2560×1440 and other phone sizes.
- Keyboard-only focus-state walkthrough (code review only: ring is defined and offsets are set).
- Signs open/closed, Log tab switching and mobile dialogue expanded screenshots.
- Toast and tile translucency over the bright mockup sky (needs `?ref=1` with HUD at full opacity).
- 200 % text scaling in a browser (finding #1 is from the CSS, not a measurement).
- Compact desktop range 701–1086 px.
