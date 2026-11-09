# Accessibility and clarity: playable and understandable from 12 to 95

Task Q (branch `claude/all-ages`, 08.11.2026). Target: WCAG 2.2 AA for everything the player reads and operates, plus
the game's own bar (48 px targets, 16 px body text at 100 %). Everything here is presentation: the rules, odds, costs
and the agent API are untouched. Every option lives in **Settings → Accessibility**, in the lobby and in the world
(Esc opens the controls dialog, which now carries the full Settings form), and persists on the device
(`ftf.prefs.v1`, with an in-memory fallback when storage is blocked).

| Area | Files | Tests |
|---|---|---|
| Narration | `game/src/play/narration.js` | `game/tests/a11y-narration.test.mjs` |
| Readability (scale, contrast, font, colours) | `game/src/ui/prefs.js`, `game/src/ui/a11y.css`, `game/src/ui/a11y.js`, `game/src/ui/settings.js` | `game/tests/a11y-readability.test.mjs` |
| "What is happening?" recap | `game/src/play/recap.js` | `game/tests/a11y-recap.test.mjs` |
| Simple mode | `game/src/play/simple.js` | `game/tests/a11y-simple.test.mjs` |
| Wiring | `game/src/play/all-ages.js` (one import and one call in `game/src/main.js`) | the Chromium run in §8 |
| Strings | `a11y.*`, `settings.a11y*`, `settings.hudMode.simple` in `game/src/locales/*.js`; `recap.*`, `simple.*` in `game/src/play/locales/*.js` (en, uk, ru, it, zh) | locale parity tests |

## 1. Narration (spoken lines)

`createNarration({ prefs, i18n })` wraps the Web Speech API. Off by default; Settings → Accessibility → *Read lines
aloud*, with a pace (0.75× to 1.3×) and a *Hear a sample* button that speaks even while narration is off.

- **What is spoken.** In the world (`all-ages.js`): Iris's and the clans' lines as they appear in the HUD dialogue
  strip, coaching toasts, the recap sheet, Simple-mode proposals. The tutorial (Task I) speaks its beats on the
  `tutorial` channel; chapter films (Task P) use the `film` channel. Subtitles never turn off: narration adds, never replaces.
- **Channels.** `film` and `tutorial` interrupt `line` and `hint`; `ui` (recap, settings sample) is next; `hint` never
  speaks over anything and is dropped first when the queue (4 items) is full. One speaker at a time, in order.
- **Language and voice.** `en-US`, `uk-UA`, `ru-RU`, `it-IT`, `zh-CN` from the UI locale; the best installed voice for the
  tag (exact tag, then language; local and "natural" voices preferred). Without a voice for the language the browser's
  fallback voice speaks with the tag set; `supports(locale)` tells callers. Switching language mid-season switches the voice.
- **Robustness.** Markup is stripped (`<kbd>V</kbd>` is read as "V"); long text is chunked at sentence ends because Chromium
  stops utterances after about 15 s; everything is a silent no-op where `speechSynthesis` is missing (Node, old browsers,
  kiosks); turning the pref off cancels speech at once.

## 2. Simple mode (the third interface level)

Settings → Interface → *Simple: Iris proposes one step at a time*. The same engine, hub and room commands as Novice and
Pro (`play/hub.js` → `PlaySession` → the room); only what is offered and how changes.

| State | Iris proposes | Buttons |
|---|---|---|
| A sign waits (silk ≥ 10, attention ≥ 1) | "Fly into Shell II and stake 10 silk on my reading", with her reading and how sure she is | **Stake 10 silk** · Let me read it first · Not this time |
| Inside a Shell, reading not staked | "Stake 10 silk on this reading and leave" (the reading card above still lets the player change a slot) | **Stake and leave** · Leave without staking |
| Inside, already staked / cannot stake | "We staked here. Leave and let the trial end" / why we cannot stake now | **Leave the Shell** |
| No sign waits, nothing to decide | "Let trial N pass": passes on its own after 1.6 s unless paused | **Let it pass** · Pause |
| Time passing (automatic trials) | "Trial N: time is passing. I will stop at a new sign or a question for you." | Stop here |
| A decision card (offer, fragment, speak the Key, vote) | the card's title and Iris's reason | **Do as Iris says: …** · Let me choose · Let it pass |
| Ash's Key (forget a memory) | "Only you choose which memory" | **Open memories** · Not now |
| Season over | Heir or memory, no recommendation | Keep the memory · Forget for an Heir (press and hold) |

Iris's policy (`recommendFor`, from the per-viewer observation only): free gift → accept; a word for sale → let it pass
(words are confirmed by what comes true); a loan → decline (a debt memory); a pact → accept (kept promises build trust);
fragment → give it to the Scroll (the honest cooperator wins in the v3 simulations, `docs/math/economy-report.md` §9);
the vote → gift if the revealed Gifts outnumber the Storms, otherwise weapon, with the counts in the reason. Never
delegated: forgetting a memory, the vote itself, the Heir.

Controls: one mouse button or one finger does everything; **Enter** (nothing focused) runs the proposal; **P** pauses and
resumes; **Escape** returns from "let me choose"; Tab and Enter work on every button. A headless season played only by
confirming proposals reaches the end with zero refused commands for two seeds (`a11y-simple.test.mjs`). Simple mode
needs the Shell hub (the default play mode); in `?mode=walk` the setting behaves like Novice.

## 3. Readability

| Option | Pref | How it is applied |
|---|---|---|
| Interface size 100 / 125 / 150 / 175 / 200 % | `uiScale` | `--ftf-ui-scale` on `<html>`; the world HUD multiplies its unit by `--wh-user-scale` (= hudScale × uiScale); every other panel (hub, play panels, map, prompt, toast, dialogs, the accessibility host) zooms by `--ftf-ui-scale`; the lobby and onboarding scale their type and reflow |
| High contrast | `contrast: 'high'` | `html[data-contrast="high"]`: opaque black surfaces, white text, bright gold, solid white frames, no blur; the `--ftf-*` and `--wh-*` tokens are redefined so every token-reading module is covered |
| Easy-to-read font | `font: 'readable'` | Atkinson Hyperlegible (Braille Institute, OFL, bundled through `@fontsource`, loaded on first use): distinct b d p q, 1 I l, 0 O; slightly wider letter and word spacing, line height 1.5; the serif stroke is zeroed |
| Colour-blind-safe colours | `palette: 'safe'` | `--a11y-good/bad/key/info` and the `--ftf-good/bad/key` tokens become sky blue / orange-vermilion / yellow / lilac (Okabe–Ito hues lightened for dark panels); verified ✓ and mismatch ✗ badges, chronicle tones and tells follow |
| Minimum body text | token | `--ftf-body-min: 16px`; the layer's own text uses `max(var(--ftf-body-min), …)` |

Measured contrast (WCAG 2.x ratio, `a11y.js` `contrast()`):

| Pair | Ratio |
|---|---|
| Default text `#faf7ee` on the HUD panel `#111a19` | 16.5 : 1 |
| Default muted `#c9c6b8` on `#18231f` | 9.4 : 1 |
| High contrast: white on black / muted `#e8e8e8` / gold `#ffd54a` / gold text `#ffe27a` | 21.0 / 17.1 / 14.9 / 16.4 : 1 (AAA; the test requires ≥ 7 for text, ≥ 4.5 for accents on every surface token) |
| Safe palette on `#111a19`: good `#8fd3ff` / bad `#ff8c6b` / key `#ffe27a` | 10.9 / 7.8 / 13.8 : 1 |

Colour-vision check (Machado 2009 matrices at full severity, CIE76 ΔE between the simulated colours):

| Pair | protan / deutan / tritan |
|---|---|
| Default good `#9fcfae` vs bad `#eba08f` | 11 / 14 / 60 (green and salmon collapse for red-green viewers: the reason the option exists) |
| Safe good `#8fd3ff` vs bad `#ff8c6b` | 57 / 72 / 93 |
| Safe bad `#ff8c6b` vs key `#ffe27a` | 35 / 22 / 45 |
| Safe good `#8fd3ff` vs key `#ffe27a` | 80 / 85 / 53 |

Colour is never the only tell: the existing glyphs on tells, the pattern on critical tension and the ✓/✗ labels stay
(`tests/ui-a11y.test.mjs`), and the Simple card and recap carry their meaning in words.

## 4. Motor

- Everything in the layer works with one pointer button or one finger; no chords, no double presses, no timed input.
  Automatic trials in Simple mode are the only thing that moves on its own, and Pause stops them.
- Targets: the layer's buttons are ≥ 48 × 48 px by stylesheet (`--ftf-target-min`); the recap button is 52 px.
- Hold-to-confirm (`holdToConfirm` in `a11y.js`): a destructive choice ("Forget for an Heir") needs a 700 ms press and hold
  (pointer, Enter or Space); a tap or click never confirms; releasing early cancels; the fill shows the progress. Other
  tasks can wrap the memory-burning and vote buttons with the same helper.
- Keyboard: Tab/Shift+Tab across every button; Enter and Space activate; **?** opens the recap; Escape closes it (and is
  consumed, so it does not also open the controls); Enter/P/Escape in Simple mode as above. Focus moves into a sheet when
  it opens and back to the opener (or the ? button) when it closes.
- Gamepad: menus and the play panels are navigable through `navigateGamepadMenu` (main.js); the recap and the Simple card
  need the one-line hook in `docs/collab-requests.md` §23 (lead) to join that routing.

## 5. "What is happening?"

Key **?** (any layout: `key === '?'`, also Shift+Slash and F1) or the round ? button (bottom left on desktop, bottom right
on phones, above the run button). Two sentences from Iris, built from the current observation and the session's goal:

- *Where we are*: trial and season, island or inside Shell N, silk, how many stakes came true; passing time; the vote;
  the season's outcome.
- *What to do next*: one sentence per goal (hub and walking modes), decision card, or Simple-mode proposal, in Iris's
  voice and without key letters.

A dialog with a scrim, Escape or Close, a polite live region for screen readers, *Read aloud* (always available; the
sheet also speaks itself when narration is on), and it re-renders live when the state or the language changes.

## 6. Motion

Every animation in the layer is eased and short (`--ftf-dur-fast` 120 ms, `--ftf-dur` 240 ms, `--ftf-dur-slow` 400 ms;
entrance rise and fade, scrim fade, hover lift, the ? button's two-pulse hello) and obeys the single switch
`<html data-motion="reduce">` set by Settings → Motion (page-wide rules in `a11y.css`, `styles.css`, `tokens.css`).
JS reads `prefs.reducedMotion()` or `reducedMotion()` from `a11y.js`. Announced to all tasks in `docs/collab-requests.md` §21.

## 7. Settings persistence

`prefs.js` validates every stored value against `PREF_OPTIONS` and falls back to the default; storage goes through
`createSafeStorage` (try/catch around every access, in-memory map when `localStorage` is missing or throws). Older
builds' string numbers are accepted.

## 8. Checks

Automated (part of `cd game && npm test`): narration 6 tests, readability 6 (prefs, stylesheet hooks, AAA contrast,
CVD distances, hold-to-confirm, the settings form in five locales), recap 3 (a whole hub season state by state in five
locales, every goal and card, the sheet), Simple mode 4 (two whole seasons by confirming every proposal, zero refused
commands; proposals per state; the recommendation policy; the card). The existing a11y and locale parity tests cover
the new strings.

Headless Chromium (SwiftShader, `element.click()` through `page.evaluate`, fixed seed `cc161d…`, Simple mode, five
locales × 1280×800 / 1920×1080 / 390×844 × 100 % and 200 %), screenshots in `docs/accessibility/`:

| Check | Result |
|---|---|
| Frames | 38 screenshots (five locales; en at 1280×800, 1920×1080 and 390×844 at 100 % and 200 %; uk/ru/it/zh at 1280×800 and 390×844 at 200 %): the Simple card, the recap sheet, the in-world Settings scrolled to Accessibility; plus three high-contrast + readable font + safe palette frames (en desktop 100 %, en phone 150 %, zh desktop 125 %) |
| Console | zero page errors; zero errors or warnings from the layer. Present in the log: Chromium's SwiftShader `GPU stall due to ReadPixels` performance warnings (every run, not ours) and one `404 (File not found)` on the uk and ru loads (a resource outside this layer; the page runs on; to be traced by its owner) |
| Full season in Simple mode at 200 %, each locale | en / uk / ru / it / zh all reach `phase: end` (`outcome: weapon` for the fixed seed): 20 proposals confirmed per season (10 stakes, 6 decision cards, 3 passes, 1 Key card), 5 stakes placed, **0 refused commands**, 119–129 s each with the hub's 1.4 s reveal pauses |
| Target sizes | every button of the layer ≥ 44 × 44 px at 100 % (the card's ? and Pause 44 px, the main buttons 48 px, the ? button 52 px); the Accessibility section's checkboxes and selects were 40 px (the shared form styles) and are now 44 px |
| High contrast + readable font | `<html>` carries `high/readable/safe`; the recap, the hub card and the world HUD all compute `"Atkinson Hyperlegible"` as the font family, `document.fonts.check` is true, the sheet background is `rgb(0, 0, 0)` with `rgb(250, 247, 238)` text |
| QA-020 | the in-world controls dialog carries the full Settings form (language, motion, subtitles, interface mode Simple / Novice / Pro, size, quality, accessibility); switching the language or the mode mid-season keeps the season (same tick and version), verified in the targeted re-shoot |

Frames in `docs/accessibility/` (JPEG): the Simple card and recap at 100 % and 200 % on desktop and phone, the 1920 frame, uk/ru/it/zh samples, the in-world Settings, high contrast.

## 9. WCAG 2.2 AA map (what is covered, what is not)

| Criterion | State |
|---|---|
| 1.4.3 Contrast (minimum) | tokens AA by test; high contrast AAA |
| 1.4.1 Use of colour | glyphs, patterns, labels; safe palette option |
| 1.4.4 Resize text / 1.4.10 Reflow | interface size to 200 %; phone layouts reflow; the lobby reflows |
| 1.4.12 Text spacing | readable font option widens spacing; no clipping observed in the layer's surfaces |
| 2.1.1 Keyboard | the layer: yes; the rest of the play UI: yes through existing bindings |
| 2.2.1 Timing adjustable | Simple mode: Pause stops automatic trials; no other timers decide anything |
| 2.5.8 Target size (minimum 24 px) | the layer ≥ 48 px; findings for the hub and HUD in `docs/collab-requests.md` §22 |
| 2.5.1 Pointer gestures / 2.5.2 Cancellation | single-pointer everywhere; hold-to-confirm cancels on release |
| 2.4.3 Focus order / 2.4.7 Focus visible | focus into and back out of sheets; 3 px gold ring (white halo in high contrast) |
| 3.1.1 Language of page | `<html lang>` follows the UI locale (existing) |
| 3.2.4 Consistent identification | the same words everywhere (Shell, sign, silk, trial, stake) |
| 4.1.3 Status messages | recap live region; Simple card is a polite live region |
| Not covered yet | gamepad navigation of the layer's sheets (hook requested); a screen-reader walkthrough by a human; the hub/HUD type and target sizes (Task F); native-speaker proofreading of the new uk/it/zh strings |
