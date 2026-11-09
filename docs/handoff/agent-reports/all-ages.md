# Task Q report: playable and understandable from 12 to 95 (branch `claude/all-ages`)

Status: **done**, 08.11 late evening. `cd game && npm test` 338/338 green, `npm run build` green. Full design and
measurements: `docs/accessibility.md`. Decisions row added at the end of `docs/decisions.md` §4. Requests and the
reduced-motion switch for the other tasks: `docs/collab-requests.md` §20–§26.

## What was done

1. **Narration API** `game/src/play/narration.js` (pushed first; Task I already calls it from the tutorial, Task P's
   films use the `film` channel). Web Speech wrapper with channels and a bounded queue, per-locale language (en-US,
   uk-UA, ru-RU, it-IT, zh-CN), the prefs rate, markup stripping, sentence chunking (Chromium's 15 s cut-off), a silent
   no-op where speech is missing. In the world it speaks the HUD dialogue strip and the coaching toasts (`all-ages.js`).
2. **Readability**: prefs `uiScale` 100–200 %, `contrast`, `font`, `palette`, `narration`, `narrationRate`, `hudMode`
   `simple`; `game/src/ui/a11y.css` + `a11y.js` (tokens `--ftf-ui-scale`, `--ftf-body-min`, `--ftf-target-min`,
   `--a11y-good/bad/key/info`; an opaque AAA high-contrast theme; Atkinson Hyperlegible as the easy-to-read font,
   bundled; Okabe-Ito state colours checked under protan/deutan/tritan simulation; hold-to-confirm; a target audit;
   pure colour math). Settings → Accessibility in every locale, in the lobby and, new, inside the world's controls dialog.
3. **Simple mode** `game/src/play/simple.js`: Iris proposes one action per trial over the hub API (stake / read first /
   skip, stake-and-leave, automatic pass unless paused, her recommendation with a reason on every decision card);
   forgetting, the vote and the Heir are never delegated; "Forget for an Heir" is press-and-hold; Enter / P / Escape;
   one button or one finger for everything. The engine and the hub are untouched.
4. **"What is happening?"** `game/src/play/recap.js`: key `?` and a button; two sentences from Iris (where we are, what
   to do next) for every goal, card and phase; read aloud; focus-trapped dialog with a live region.
5. **Motion** (owner directive via the lead): eased 120–400 ms animations on the layer's surfaces; the single switch
   `<html data-motion="reduce">` documented for everyone (`docs/collab-requests.md` §21); tokens Task S may redefine.
6. **Strings** in all five locales: `settings.a11y.*`, `settings.hudMode.simple`, `a11y.*` (game locales), `recap.*`,
   `simple.*` (play locales); parity tests green. Translations are mine (AI); a native pass is welcome.
7. **Wiring** `game/src/play/all-ages.js`, called once from `game/src/main.js` (one import + one call: the only edit
   outside Task Q's paths; append-only, trivially mergeable).

## How it was checked

- Node tests (19 new, all in `npm test`): `tests/a11y-narration.test.mjs` (6), `tests/a11y-readability.test.mjs` (6),
  `tests/a11y-recap.test.mjs` (3), `tests/a11y-simple.test.mjs` (4). Two whole seasons are played headless by confirming
  every Simple-mode proposal, with zero refused commands; every recap and proposal text renders in five locales without a
  missing key or a leftover key letter.
- Headless Chromium (SwiftShader, `element.click()` through `page.evaluate`, fixed seed, Simple mode):
| Check | Result |
|---|---|
| Frames | 38 screenshots (five locales; en at 1280×800, 1920×1080 and 390×844 at 100 % and 200 %; uk/ru/it/zh at 1280×800 and 390×844 at 200 %): the Simple card, the recap sheet, the in-world Settings scrolled to Accessibility; plus three high-contrast + readable font + safe palette frames (en desktop 100 %, en phone 150 %, zh desktop 125 %) |
| Console | zero page errors; zero errors or warnings from the layer. Present in the log: Chromium's SwiftShader `GPU stall due to ReadPixels` performance warnings (every run, not ours) and one `404 (File not found)` on the uk and ru loads (a resource outside this layer; the page runs on; to be traced by its owner) |
| Full season in Simple mode at 200 %, each locale | en / uk / ru / it / zh all reach `phase: end` (`outcome: weapon` for the fixed seed): 20 proposals confirmed per season (10 stakes, 6 decision cards, 3 passes, 1 Key card), 5 stakes placed, **0 refused commands**, 119–129 s each with the hub's 1.4 s reveal pauses |
| Target sizes | every button of the layer ≥ 44 × 44 px at 100 % (the card's ? and Pause 44 px, the main buttons 48 px, the ? button 52 px); the Accessibility section's checkboxes and selects were 40 px (the shared form styles) and are now 44 px |
| High contrast + readable font | `<html>` carries `high/readable/safe`; the recap, the hub card and the world HUD all compute `"Atkinson Hyperlegible"` as the font family, `document.fonts.check` is true, the sheet background is `rgb(0, 0, 0)` with `rgb(250, 247, 238)` text |
| QA-020 | the in-world controls dialog carries the full Settings form (language, motion, subtitles, interface mode Simple / Novice / Pro, size, quality, accessibility); switching the language or the mode mid-season keeps the season (same tick and version), verified in the targeted re-shoot |

Frames in `docs/accessibility/` (JPEG): the Simple card and recap at 100 % and 200 % on desktop and phone, the 1920 frame, uk/ru/it/zh samples, the in-world Settings, high contrast.

## Hostile self-review (found and fixed before the push)

- `?demo=judge` forces Novice in `main.js`, so the first Chromium run showed no Simple card: the check uses `?seed=` instead.
- At 200 % the floating ? button sat on top of the Simple card: the card now carries its own ? button and the floating one hides.
- At 200 % the world HUD's trial card and quest banner overlapped each other on a 1280-wide screen (the mockup layout has no
  room beyond 1.5×): the HUD now follows the interface size up to 150 %, every other panel the full 200 %; Task F may lift the cap.
- A reload in the check harness re-ran the init script and overwrote the prefs, so the "high contrast" shot showed the default
  theme: the high-contrast run got its own contexts (`hc.mjs`), and the screenshots in `docs/accessibility/` are from it.
- The Simple title had no full stop when the recap reused it: the recap now always ends both sentences (zh gets `。`).
- Dialogs inside the lobby inherited the scaled type and zoomed again: only the in-world scene dialog zooms.
- `prefs.set()` with an invalid value falls back to the default (the existing contract in `tests/wh-shared.test.mjs`), not to
  the previous value: my test asserts that contract.
- Focus: the recap returns focus to its opener, or to the ? button when it was opened by key; Tab is trapped inside the sheet.
- Mini-DOM selectors: unquoted attribute values are not supported there, so `settings.js` quotes them.

## Not done / left to others

- **Gamepad navigation of the recap and the Simple card** needs one line in `main.js` `handleInput` (request §23 to the lead);
  keyboard, mouse and touch are complete.
- **Hub and world HUD type and target sizes** (13.5 px body, 34 px "Let trial pass", 25 px hotbar buttons at 1280 wide):
  measured and handed to Task F with the tokens (§22); not mine to restyle.
- **Simple mode in `?mode=walk`** behaves like Novice (it needs the Shell hub, the default mode).
- **The tutorial's mode question** still offers Novice / Pro only; Simple is reachable from Settings (request §24 to Task I).
- **README**: no claim added; the lead may add one line under the judge table ("Settings → Accessibility: Simple mode,
  narration, size, contrast") once merged.
- **A human screen-reader walkthrough** and a native-speaker pass over the new uk/it/zh strings.
