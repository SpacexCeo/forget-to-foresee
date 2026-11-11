# Forget to Foresee — Design Review and Proposals

Reviewer: RAEN design pass · Date: 2026-11-11 (Kyiv) · Repo: `SpacexCeo/forget-to-foresee` @ `83465f6` (read-only clone) ·
Live: https://spacexceo.github.io/forget-to-foresee/ (judge path `?demo=judge`)
Companion files: `DESIGN-TOKENS.md` (palette / type / spacing / motion / fog values) · `concepts/INDEX.md` + 8 concept images.

## 0. How this review was done, and what it could not see

Seen directly: the 13 playtest screenshots (`/workspace/ftf-playtest/`), three headless captures of the live site (loading screen, the
name/gift modal, and the judge path while it was still streaming), the repo's own screenshots (`docs/screens/shard-nft/*`,
`docs/media/jury-sheet.jpg` = contact sheet of the jury video, `docs/accessibility/*`), and the source of: `index.html` (`#boot`), `ui/loading.js`,
`ui/onboarding.js`, `ui/world-hud/*` (tokens, status, shard-card), `play/day1.js`, `boot-world.js`, `render/{fog,grade,sky,weather,post}.js`,
`scenes/shell.js`, locales.

NOT seen: the live island HUD, the Shell interior and the town in motion on a real GPU (this box has no GPU; the town stayed in its streaming
state). For those I used the repo's own captures and the jury video sheet. Every numeric 3D value in section 5 / `DESIGN-TOKENS.md` is a **starting value to A/B on a real GPU**, not a verified result.
Nothing was pushed to the repo.

## 1. Verdict in one paragraph

The project has **three different visual identities that never meet**: (1) the *title / Shell / video* world — quiet, foggy, pearlescent, Arrival-like, exactly the owner's
direction and genuinely beautiful; (2) the *town and island you actually play first* — bright, warm, Mediterranean-medieval, high-key sunlight, candy-ish saturation (grade saturation 1.24);
(3) *legacy front-door UI* — the Day-1 name/gift flow (`play/day1.js`) is a purple-gradient, rainbow-card, `system-ui` + Georgia, "mobile gacha" skin, and the loading screen is a
teal sci-fi diagram with a glowing silhouette. The **world HUD itself is the best-engineered UI layer** (tokenised, serif+sans pairing, motion system, 48 px targets, reduced motion,
high-contrast, narration, simple mode — accessibility is a real strength). The cheapest, biggest win is not new art: it is **making the first 60 seconds look like the title screen
and the Shell**, and **making the NFT moment look like a collectible instead of a list row**.

## 2. Scorecard (0–10)

| Area | Score | One-line reason |
|---|---|---|
| First impression (judge path) | **5** | Loading is atmospheric (7) but the reveal lands on a bright generic fantasy town; if streaming is slow the player sees a lone purple capsule on a white void with "The town is taking shape…". |
| Visual identity | **4** | Three identities (see §1). The owner's Arrival-like direction exists only in the title art, Shell interior and video; the town/island that judges play for the first minutes contradicts it. |
| Readability | **7** | HUD serif/sans, panel opacity, 40/48 px targets, gold hairlines are clear. Deductions: 10 px tags, grey 12 px "Local demo" badge on a light sky, ring-sign glyph meaning not learned until tutorial. |
| UI consistency | **5** | World HUD / shard card / postcard share tokens; day1, boot-world inline overlays, hub, map, fun-ui use hard-coded `system-ui`, Georgia, `#ffd27a`, `#e9b44c`, 2 px borders (≥8 files, 13 `style.cssText` sites). |
| Onboarding | **5** | Judge path skips day-1 (good) and uses plain Novice labels; but the tutorial screens use "slot / Place / Action / Power / Delay", have a duplicate Begin and an empty hologram frame (also in `FTF-HACKATHON-TZ.md` P0). First line a judge sees in-game is "Walk to the Tournament altar" — no *why*. |
| Emotional beats | **6** | The jury video has real beats (glass, drawing, "forget a memory forever", seal). Playable path under-delivers: the Shell contact and the forget decision are not staged with the same restraint (no stillness, no subtitle bar, no sound-on-sight cue in the HUD). |
| NFT moment | **5** | Honest and verifiable (token id, link, verified SVG, preview vs minted) — a rare strength — but it is a 132 px card inside a scroll panel and a 420 px toast. The first NFT a non-judge sees is a **heroine "Elise" anime card** (`assets/cards/elise.webp`), stylistically unrelated to the memory-shard concept. |
| Loading | **7** | Copy is lovely ("Laying the town's stones…"), real progress, no freeze. Deductions: teal off-palette, glowing figure silhouette not the game's mood, duplicated log lines ("Raising houses and streets…" twice), stalls near 95 % with no reassurance. |
| Accessibility | **8** | Best-in-class for a jam: reduced motion, 3 contrast modes, HUD scale, narration, Simple mode, keyboard-first. Remaining: tag text 10 px, a few `pointer-events` overlays, colour-only verified state in places. |

Weighted for judges (first impression 30 %, identity 20 %, NFT moment 20 %, rest 30 %): **≈ 5.3 / 10**. With the quick wins below the realistic target is **≈ 7.5**.

## 3. Issues with evidence

| # | Issue | Evidence | Severity |
|---|---|---|---|
| I1 | Town does not match the owner's direction: bright, warm, high-key, saturated | `/workspace/ftf-playtest/09,11,12`: blue sky, terracotta roofs, cream stone; code: `LOCATION_LOOKS.town.default='afternoon'`, `GRADE.saturation 1.24`, `WEATHER` default `clear`, town fog density `.018`; judge path disables the day cycle (`boot-world.js:607`) so judges *always* get this look | High |
| I2 | Non-judge visitors (X link) open on a purple/rainbow "gacha" modal | live capture `shots/x.png`; `play/day1.js` `.d1-panel` (`linear-gradient(160deg, rgba(40,28,70), rgba(16,40,60))`, 2 px gold border, `800 17px system-ui` candy button), `.d1-back` conic rainbow | High |
| I3 | First NFT shown is an anime heroine card, not a memory shard | `game/public/assets/cards/elise.webp`, `nft/elise.webp`; `day1.mint.*` strings; concept mismatch with "Price of Memory" and with the judge-facing shard story | High |
| I4 | Shard NFT moment is small and list-like | `docs/screens/shard-nft/desktop-card.png`: card sits at the bottom of a panel, ring 132 px; toast 420 px, 4 lines of 12 px text | High |
| I5 | Streaming state exposes a purple capsule avatar over an empty white-cloud void | live capture `shots/long_judge.png` (software render; real-GPU users on slow links will hit the same state while 20 MB `anchor.glb`/`scroll_table.glb` stream) | High (cold loads) |
| I6 | Loading screen: off-palette teal, silhouette mood, duplicate log lines, title art unused | `index.html` `.boot` (`--teal:#5fd3c6`), live capture `ab_dusk.png` (two identical "Raising houses…" lines); `lobby_bg.jpg` (the best art in the repo) is only used with `?lobby=1` | Medium |
| I7 | Tutorial copy is jargon-first | `04-tutorial-four-slots.png`: "A sign has four slots. Click each stroke." chips `Place / Action / Power / Delay`; `08-hologram-pick.png`: two Begin buttons, empty-looking frame, "Customize" and "Randomize" at different sizes | Medium |
| I8 | Bottom-left badge is low contrast and jargon | `desktop-card.png`: "Local demo · the rules run in your browser through the same room as the agent API" — 12 px grey on pale sky | Medium |
| I9 | Inline/legacy overlays ignore tokens | `boot-world.js:221-224,378` (`#e9b44c`, `rgba(20,14,40,.78)`, `system-ui`); live capture shows the "Next Tournament round · Open now" pill in a navy-purple bold sans while all other HUD is graphite + Caslon | Medium |
| I10 | Third serif + a network font request | `index.html` loads Google Fonts *Cormorant Garamond* + *Noto Serif SC* while the game bundles Libre Caslon (flash of a different serif between loading and HUD; offline = fallback Georgia) | Low |
| I11 | Tag/kbd text floors at 10 px | `tokens.css` `--wh-fs-tag: max(10*px, 10px)`, `--wh-fs-kbd: max(11*px, 10px)` | Low |
| I12 | Tournament "altar" arrival has no emotional beat | judge path: town → press E → cover → archipelago; the "memory sacrifice" is told in text only | Medium |

## 4. Cheap, high-impact improvements

Order = recommended order of work. Effort in hours for Claude + owner review. Each prompt is self-contained: paste it into Claude Code in the repo, on a **new branch**, never `main`.
Common footer for every prompt (add it once): *"English only in code/docs/UI. Keep `npm test` in `game/` green. Reduced-motion and `data-motion="reduce"` must keep working. Do not change game rules or contracts. Commit small, push the branch, open a PR, do not merge to main."*

### D1 · One look: make the first 60 seconds Arrival-quiet (town blue-hour + overcast + muted grade)
- **Effort:** S (45–90 min incl. A/B on a real GPU) · **Impact:** ★★★★★ (fixes I1, the single biggest identity gap; zero new assets)
- **Try right now, no code:** `…/forget-to-foresee/?demo=judge&tod=dusk&weather=overcast` (both params already exist).
- **Files:** `game/src/render/sky.js` (`LOCATION_LOOKS.town.presets.dusk`), `render/weather.js` (`WEATHER.overcast`), `render/grade.js` (`GRADE`), `render/post.js` (`uVignette`), `boot-world.js` (judge default preset/weather).
- **Values (see DESIGN-TOKENS §5):** town dusk fog `{density:.032, falloff:.05, near:36, far:520, sunPower:9, aerial:.6, cool:.7}`; `WEATHER.overcast.fog 1.25`; `lamps 1.1 / windows 1.8`; `GRADE.saturation 1.08, contrast .46, shadowTint [.95,.98,1.04], highlightTint [1.03,1.0,.96]`; vignette `.30` (Shell `.38`).
- **Behaviour:** when `?demo=judge` (and when no `tod`/`weather` in the URL) start the town at `dusk` + `overcast`. Do **not** touch the day cycle for non-judge players yet.
- **Prompt:**
  > Branch `design/quiet-town`. Goal: the judge path (`?demo=judge`) must look like our title art and Shell interior: cold, foggy, muted, with amber only from lamps and windows. In `boot-world.js` default `lookdev.setPreset('dusk')` and `lookdev.setWeather('overcast')` when `judge` is true and the URL has no `tod`/`weather`. In `render/sky.js` set `LOCATION_LOOKS.town.presets.dusk.fog` to `{density:.032,falloff:.05,near:36,far:520,sunPower:9,aerial:.6,cool:.7}` and lamps 1.1 / windows 1.8. In `render/weather.js` set `WEATHER.overcast.fog = 1.25`. In `render/grade.js` set `GRADE = {saturation:1.08, contrast:.46, shadowTint:[.95,.98,1.04], highlightTint:[1.03,1.0,.96]}` and update the grade unit tests' expected values. In `render/post.js` raise `uVignette` to .30. Add a `?look=bright` URL param that restores the old values so we can A/B. Produce before/after screenshots of the start street, the stairs and the altar at 1280×800 in `docs/design/quiet-town/`. Check the beacon chevrons, nameplates and HUD text are still readable (contrast ≥ 4.5:1 on the darkest and brightest frames).

### D2 · Make the best art the first thing judges see (title/loading handoff)
- **Effort:** S (1–2 h) · **Impact:** ★★★★☆ (fixes I6; uses `assets/ui/lobby_bg.jpg` that today only `?lobby=1` shows) · Concept: `concepts/01-title-loading-screen.jpg`
- **Files:** `game/index.html` (`#boot`/`.boot` CSS and markup), `ui/loading.js`.
- **Values:** replace `--teal:#5fd3c6` with amber `#E4C272` (line), head dot `#FFD08A`, % text `#E9E4D6`; remove the glowing Iris silhouette; use `lobby_bg.jpg` as a full-bleed background (`background-size: cover; filter: saturate(.85) brightness(.8)`), left-aligned title (Libre Caslon, `clamp(40px,5.2vw,84px)`), tagline `THE FUTURE COSTS A MEMORY` (11 px, `letter-spacing:.24em`), 1 px progress line 360 px wide, log shows **one** line at a time (cross-fade 200 ms, never repeat the same key twice in a row). Hold the end state for 600 ms ("Ready"), then cross-fade 480 ms to the world.
- **Prompt:**
  > Branch `design/title-boot`. Rework the inline `#boot` screen in `game/index.html` and `ui/loading.js`: background = `assets/ui/lobby_bg.jpg` (preload it for every path, not only `?lobby=1`), replace the teal diagram + Iris silhouette with: title "Forget to Foresee" (Libre Caslon Text 400, clamp(40px,5.2vw,84px), #FAF7EE), tagline "THE FUTURE COSTS A MEMORY" (Source Sans 3 600, 11px, tracking .24em, #B9B7AE), a 1px amber progress line (#E4C272, head dot #FFD08A, glow 0 0 8px rgba(255,180,90,.5)) and ONE log line below it ("Laying the town's stones…") that cross-fades; de-duplicate consecutive identical log keys in `logKeysFromStats`. Keep real progress and the never-freeze trickle. Remove the Google Fonts Cormorant link (use the bundled Libre Caslon with `<link rel="preload" as="font">`). Respect `prefers-reduced-motion`. Add a unit test that the same log key is never shown twice in a row.

### D3 · Re-skin the Day-1 name/gift flow to the world HUD language, and make the first gift a memory
- **Effort:** M (3–4 h) · **Impact:** ★★★★★ (fixes I2 + I3; every non-judge visitor sees this first) · Concept: `concepts/08-name-and-gift-arrival.jpg`
- **Files:** `game/src/play/day1.js` (`CSS` const), `play/locales/en.js` (`day1.*`), `public/assets/cards/*`, optionally a new `assets/cards/first-memory.webp`.
- **Values:** `.d1-panel` → `background: var(--pl-panel); border:1px solid var(--pl-frame); border-radius:14px; box-shadow: var(--ftf-shadow)`; h2 Libre Caslon 32px 400 (not 700 system-ui); input: transparent, 1px bottom border `rgba(232,214,172,.55)`, 20px Source Sans; button = `--pl-primary` (`#6f501b→#4a3410`, text `#fffcec`, border `#ffe78e`), no `0 4px 0` candy shadow, radius 10px; card back = graphite with ivory hairline + nacre sheen (`linear-gradient(115deg, rgba(233,228,214,.0) 30%, rgba(233,228,214,.25) 50%, rgba(233,228,214,0) 70%)` animated once, not infinite `hue-rotate`); flip transition 640 ms `cubic-bezier(.2,.9,.2,1)` (no `1.3` overshoot). Copy: "What should the town call you?" ✔ keep; "Free mint" → "A gift from the town"; "Pick a card" → "Choose a memory to keep".
- **Product decision for the owner:** keep Elise as a *skin* (the K-key toggle already exists) but make the **gift = "Your first memory shard"** (concept 03/08). It aligns the first NFT with the story judges are told. If Elise must stay as the gift, at least reframe her card: dark graphite frame + shard sigil, not a pearl-white anime sheet.
- **Prompt:**
  > Branch `design/day1-skin`. In `game/src/play/day1.js` replace the legacy CSS with the world-HUD look (tokens in `DESIGN-TOKENS.md` §1–§4): panel = `var(--pl-panel)` + 1px `var(--pl-frame)` + 14px radius, headings Libre Caslon Text 400 32px, body Source Sans 3 16px, input with 1px ivory underline, primary button `var(--pl-primary)` (no candy gradient, no 4px bottom shadow), card back graphite with one nacre sheen sweep (no conic rainbow, no infinite hue-rotate), flip 640ms `cubic-bezier(.2,.9,.2,1)`. Remove all `system-ui`/Georgia literals. Rename strings: `day1.free` → "A gift from the town", `day1.pick` → "Choose a memory to keep". Keep every `aria-*`, focus ring `2px solid #E4C272`, and the reduced-motion branch. Add a screenshot test (or a static DOM test) that `day1.js` contains no `#7a5cff`, `conic-gradient` or `system-ui`.

### D4 · Shard card as a collectible + a real "mint reveal" beat
- **Effort:** M (3–5 h) · **Impact:** ★★★★★ (fixes I4; this is the NFT-track hero moment) · Concept: `concepts/03-shard-card-collectible.jpg` and `06-judge-end-screen-proof.jpg`
- **Files:** `ui/world-hud/shard-card.css`, `shard-card.js` (`renderShardCard`, toast), `ui/postcard.js` (share image should be the same card), `shard-card-model.js` untouched.
- **Layout (portrait 3:4, 360×480 desktop / 100%-24px phone):** frame 1px `rgba(232,214,172,.55)` + 3px nacre border (`linear-gradient(135deg,#E9E4D6,#B9B7AE 40%,#C9BEEA 60%,#E9E4D6)`), radius 18px, body `--ftf-panel`; header kicker `MEMORY SHARD` (tag style) + `Shard #7` (h1 Caslon 32px); art 240×240 = verified ink-ring SVG scaled up over a soft amber core (`radial-gradient(circle, rgba(255,180,90,.28), transparent 62%)`); three fact rows (Memory / Forgotten at / Sold to) 14 px; footer seal: ✓ `#7FB38A` + `Minted on NEAR testnet` + mono token id; button row `View on NEAR Explorer` (primary) · `Share postcard`. Preview state keeps the dashed frame and the word "Not minted yet".
- **Reveal choreography (`--ftf-dur-reveal` 1400 ms):** 0–320 card rises 12 px + fades; 320–960 ink ring strokes draw (existing `sh-draw`, 45 ms stagger); 960–1400 one nacre sheen sweep; audio: the existing seal sound at 320 ms. At trial 6 on the judge path, present it as a **centred modal over a 55 % scrim** (not the top toast), auto-focus "View on NEAR Explorer", `Esc` closes; the toast remains for later mints.
- **Prompt:**
  > Branch `design/shard-card`. Redesign `ui/world-hud/shard-card.css` + `shard-card.js` so a minted shard renders as a portrait collectible card exactly as in `concepts/03-shard-card-collectible.jpg` (spec in `DESIGN-REVIEW.md` D4): 360×480 desktop, full-width minus 24px on phones; nacre border gradient; ink-ring SVG scaled to 240px over an amber radial core; kicker `MEMORY SHARD`, title `Shard #N`, three fact rows, footer seal with check and token id in monospace, primary `View on NEAR Explorer`, secondary `Share postcard`. Keep the verified-SVG path, the preview (dashed, "not minted yet") and the existing tests. On the judge path at the trial-6 auction result open it as a centred modal with a 55% black scrim and the 1400ms reveal (rise 320 / draw 640 / sheen 440); `Esc` and a close button; focus trap; reduced motion = 160ms fade. Make `ui/postcard.js` render this same card layout (1200×630 with the card on the left and the season line on the right). Update/add DOM tests; produce desktop and 390px screenshots.

### D5 · "The season is sealed" end screen with proof (judge conclusion)
- **Effort:** M (3–4 h) · **Impact:** ★★★★☆ (turns the commit-reveal + testnet proof, the repo's strongest technical claim, into a visible final beat) · Concept: `concepts/06-judge-end-screen-proof.jpg`
- **Files:** new `ui/world-hud/season-seal.js` + `.css`, wired from `play/outcome-ui.js` when the season ends; data already exists in `proof-model.js` / `shard-card-model.js`.
- **Values:** panel 880×460, two columns; left three `h1`-size numerals; right "Verified on NEAR testnet" 4 rows with `✓ #7FB38A`; below the rows a mono line `root 83abd4587b…` (copy button); buttons "Open my memory shard" (primary), "View on NEAR Explorer"; footer timeline of 17 dots (filled `#E4C272` = verified, ring = not revealed on chain); everything a real link or real number — **no decorative claims** (if a row is not verified the row shows `—` and the word "not available").
- **Prompt:**
  > Branch `design/season-seal`. Add `ui/world-hud/season-seal.js/.css`: a modal shown once when the season ends, built only from existing models (`proof-model.js`, `shard-card-model.js`, observation): headline "The season is sealed.", subtitle "Every reveal was checked against the commitment made before trial 1.", left column Survived / Silk / Memories forgotten, right column "Verified on NEAR testnet" with 4 rows (season committed, N of N reveals match, shard minted, "Check it yourself, no wallet needed") each with a real explorer link or an honest "not available", a mono root line with Copy, buttons "Open my memory shard" and "View on NEAR Explorer", and a 17-dot timeline. Style per `DESIGN-TOKENS.md`. Never show a ✓ unless the underlying check is true. Tests: all-verified, partially verified, offline.

### D6 · Plain-language onboarding (fix the jargon, the double Begin, the empty frame)
- **Effort:** S (1–2 h) · **Impact:** ★★★☆☆ (fixes I7; overlaps `FTF-HACKATHON-TZ.md` P0 — do them together)
- **Files:** `ui/onboarding.js`, `locales/en.js` (`onb.*`, `tutorial.*`), `ui/styles.css`.
- **Copy:** chips `Place / Action / Power / Delay` → `Where · What · How strong · When`; "A sign has four slots. Click each stroke." → "Every message has four parts. Tap each one to read it."; "Cosmetic only. Pick a look; change it any time." keep; remove the top-right Begin (keep the one under the preview); make Customize and Randomize the same size (both secondary 40 px); give the preview frame a 2-line caption ("This is how your hologram looks in the town.") so it never reads as empty.
- **Prompt:**
  > Branch `design/onboarding-copy`. In `ui/onboarding.js` and `locales/en.js` replace the slot jargon with Where / What / How strong / When on every tutorial screen (keep the keys; add `ru` equivalents only if the locale-parity test requires it), remove the duplicate Begin on the hologram screen, make Customize/Randomize equal secondary buttons, add a one-line caption under the hologram preview, and ensure the progress dots, back button and Skip are all ≥40px targets. Update snapshot/DOM tests.

### D7 · HUD polish pass (type floor, badge, inline overlays)
- **Effort:** S (1–2 h) · **Impact:** ★★★☆☆ (fixes I8, I9, I11)
- **Files:** `ui/world-hud/tokens.css` (`--wh-fs-tag: max(calc(10*var(--wh-px)),11px)`, `--wh-fs-kbd: …, 11px`), `locales/en.js` (`play.badge`), `index.html` (`.pl-badge`), `boot-world.js:221-224, 378` (altar timer, "done" button), `play/hub-ui.js`, `play/map-ui.js`, `play/fun-ui.js`.
- **Values:** `.pl-badge` → `background: var(--pl-panel); border:1px solid var(--pl-frame-soft); color:#E9E4D6; font:500 12.5px Source Sans 3`; text "Demo season · runs in your browser · same rules as the agent API"; altar timer pill → HUD pill tokens (`--wh-pill-bg`, `--wh-pill-border`, Source Sans 3 600 13px) instead of `rgba(20,14,40,.78)`/`system-ui`; "done" button `#e9b44c` → `--pl-primary`.
- **Prompt:**
  > Branch `design/hud-polish`. Replace every hard-coded `system-ui`, `Georgia`, `#e9b44c`, `#ffd27a`, `rgba(20,14,40,…)` in `boot-world.js`, `play/hub-ui.js`, `play/map-ui.js`, `play/fun-ui.js`, `scenes/town-flow.js`, `ui/postcard.js` with the tokens from `DESIGN-TOKENS.md` (add `ui/tokens-global.css` that exposes them on `:root` and is imported once). Raise `--wh-fs-tag` and `--wh-fs-kbd` floors to 11px. Restyle `.pl-badge` as an opaque HUD panel with the shorter copy. Add a lint-style test that fails when those literals reappear in `game/src/play` and `game/src/ui`.

### D8 · Don't show the placeholder: hold the veil until the first frame is real
- **Effort:** S–M (1–3 h) · **Impact:** ★★★★☆ on cold/slow loads (fixes I5; judges on a phone or hotel Wi-Fi)
- **Files:** `render/streaming.js`, `ui/loading.js` (`bootPlan`), `play/iris-avatar.js`, `boot-world.js` (first `enterWorld`).
- **Behaviour:** keep `#boot` up until `town_terrain`, the first street's `town_*` and the Iris model are `loaded` (or 12 s elapsed → then show a fog-coloured veil, not white). Never render the capsule placeholder avatar — fade the real model in over 320 ms once loaded. Status text during any later streaming: pill "The town is taking shape…" (already exists) stays, but the scene behind it must be the dusk fog colour `#63676C → #14171A` gradient instead of the light sky.
- **Prompt:**
  > Branch `design/no-placeholder`. Gate the loading screen handoff on the streamer reporting `town_terrain`, the first street assets and the Iris model as loaded (timeout 12s, then proceed). Hide the capsule placeholder avatar until the real model is ready and fade it in 320ms. When streaming is still in flight after the handoff, set the scene background/sky fallback to the fog colour rather than the pale default so no white void is visible. Add a test with a slow fake streamer. Measure and report time-to-first-interactive on the 4G preset in the PR description.

### D9 · First-contact Shell beat (stillness, subtitle bar, glass breath)
- **Effort:** M (2–4 h) · **Impact:** ★★★★☆ (the emotional core; judges remember it) · Concept: `concepts/04-first-contact-glass.jpg`
- **Files:** `scenes/shell.js` (lights/mist), `ui/world-hud/status.css` (dialogue strip), `vfx/presets.js`, `audio/manifest.js`.
- **Values:** backlight `intensity 34 → 40` with a ±8 % sine over 7 s (the "breathing" behind the glass); amber point lights `18/16 → 14/14` so the glass is the brightest object; mist sprite opacity `.34+.16f` → add a slow drift `uv.x += t*0.004`; at first contact the HUD fades to 25 % over 480 ms (only the subtitle + `[E]` remain); subtitle bar = serif italic 22 px `#FAF7EE`, `text-shadow: 0 2px 12px rgba(0,0,0,.8)`, max 56 ch, bottom 9 vh, 480 ms fade; the drawn ring glyph draws over 1.4 s with `ease-in-out`. No UI chrome on screen while the Guest draws.
- **Prompt:**
  > Branch `design/first-contact`. In `scenes/shell.js` give the backlight a ±8% 7-second sine breathing (frozen under reduced motion), reduce the two amber point lights to intensity 14 / distance 14 and slowly drift the mist sprites. When a Guest starts drawing, fade every HUD island to 25% opacity over 480ms (restore after), show only a centred serif-italic subtitle bar (22px, #FAF7EE, soft shadow) and the `[E]` prompt, and draw the ring glyph over 1.4s. Add the same behaviour to `?demo=judge`. Document values in `docs/design/first-contact.md`.

### D10 · Town quest dialogue and markers
- **Effort:** M (3 h) · **Impact:** ★★★☆☆ (the owner's NPC-quest feature must look as good as it is) · Concept: `concepts/05-town-quest-dialogue.jpg`
- **Files:** `ui/world-hud/status.css` (`.wh-dialogue`), `ui/world-hud/index.js`, `scenes/town-quest.js`, `scenes/town-flow.js`.
- **Values:** dialogue panel 760×(auto) bottom 4 vh, `--ftf-panel`, portrait 72 px circle (1px ivory ring), speaker name Caslon 22 px `#FAF7EE`, text 16 px/1.5 `#E9E4D6`, replies = 2 secondary buttons with kbd chips `[1] [2]`; quest tracker pill top-left "Town quest · 1 of 3 talks" (13 px, pill tokens); NPC marker = amber diamond `#FFB45A` 14 px above the head with a `--ftf-dur-breath` pulse, only on the NPC the player should talk to next.
- **Prompt:**
  > Branch `design/quest-dialogue`. Restyle the dialogue strip: portrait circle left, serif speaker name, 16px body, reply buttons with `[1]`/`[2]` key chips (keyboard works), centred 760px max, bottom 4vh. Add the quest tracker pill "Town quest · n of 3 talks" and an amber diamond marker above the NPC to talk to next (breath animation 4.2s, off in reduced motion). Keep the existing quest logic in `scenes/town-quest.js` untouched. Tests for key bindings and for the marker target.

### D11 · X post / video key art and first frame
- **Effort:** S (30–60 min, mostly the owner) · **Impact:** ★★★★☆ for reach · Concept: `concepts/07-x-post-thumbnail.jpg`
- **Do:** first frame of the video = a still of the Shell/mist (not UI, not a logo screen); title card only at the end; pinned thumbnail uses concept 07 as the **style guide** — replace the generated heroine with a real in-game screenshot of D1's dusk town or Shell glass, keep the type lockup: `Forget to Foresee` Libre Caslon 400 ≈ 9 % of frame height, tagline `See the future. Pay with a memory.`, chips `Play in your browser` · `Verified on NEAR testnet`, safe margins 6 %. Export 1600×900 (X 16:9) and 1200×630 (link card). Add `<meta property="og:image">` + `twitter:card=summary_large_image` to `game/index.html` (verified: neither tag exists today, so a pasted link shows no preview card).
- **Prompt:**
  > Branch `design/og-meta`. Add Open Graph / Twitter card tags to `game/index.html` using `public/assets/ui/og-1200x630.jpg` (I will drop the image there), title "Forget to Foresee — see the future, pay with a memory", description ≤ 155 chars, and make sure the URL used in the tags is the GitHub Pages URL. No other changes.

### D12 · Palette hygiene for 3D props (optional, after D1)
- **Effort:** S–M · **Impact:** ★★☆☆☆ · Town banners are terracotta and teal (`09-first-gameplay-view.webp`) and the island Elise tint is `(0.78,0.6,1.0)`; recolour the banners to the palette (graphite-blue `#3E4C52`, ivory `#E9E4D6`, one amber-edged banner at the altar) so the altar is the only warm focal point. Files: `scenes/town-data.js` banner materials, `render/materials.js`.

## 5. Top 5 design quick wins

1. **D1** — start the judge path at blue-hour overcast with a muted grade (try `?demo=judge&tod=dusk&weather=overcast` now; 1 hour of code).
2. **D3** — re-skin the Day-1 name/gift modal and make the gift a *memory*, not an anime card.
3. **D4** — shard NFT as a portrait collectible with a 1.4 s mint reveal at trial 6.
4. **D2** — loading = the title painting + one amber line (teal diagram and silhouette gone).
5. **D8** — never show the capsule/white void; hold the veil until the first street is real.

## 6. Design direction (so Claude keeps making the same game)

- **Mood:** quiet, immense, restrained. Fog first, light second, UI last. Humans are tiny; Shells are huge; one warm light per frame.
- **Colour:** 85 % cold greys/graphite/ivory, 10 % amber (a decision to make), 5 % violet (Iris / NFT sheen). Never a second warm colour.
- **Chunky + readable:** keep the rounded low-poly toy shapes of the liked reference for characters and props (readable top-down), but shade them with the *cold* grade and fog. The reference is about **shape language**, not its saturated greens.
- **Shell interior:** dark, enclosed, pearlescent ribs, one huge luminous glass pane, silhouettes behind mist, unseen presence. Movie refs govern mood only: no film ship shapes, aliens or ink glyphs (current ring sign is original — keep it).
- **UI:** one panel recipe, one serif, one sans, one primary button, hairlines not borders, nothing bouncy.

## 7. Risks and honest caveats

- Dusk + overcast reduces brightness; verify the beacon chevrons, nameplates and quest text at the darkest frame, and the low tier (phones) where lights are cheaper.
- D3 changes the first-run for non-judge players; the owner should decide the Elise question (skin vs gift).
- Concept images are AI-generated mood/layout studies: their text is deliberately short and in English, but they are not pixel specs. Use `DESIGN-TOKENS.md` for exact values.
- I could not run the game with a GPU: numbers in §4 D1/D9 and tokens §5 need a real-GPU pass; keep the `?look=bright` switch to roll back instantly.
- Time: code freeze is 13 Nov 20:00 Kyiv. Suggested order if only a day is available: **D1 → D3 → D4 → D2 → D8**, then D6/D7, then D5/D9/D10 only if tests are green by 13 Nov 16:00.
