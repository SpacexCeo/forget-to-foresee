# Task I report: tutorial and onboarding (branch `claude/tutorial`, 08.11.2026)

Base: `main` + the 08.11 worker docs (`7f65be6`). Three commits, pushed; no pull request. Owned paths only, plus the
test that pinned the old onboarding order (`tests/client/play.test.mjs`), the locale copy-check allowlist
(`tests/ui-i18n-locales.test.mjs`, one proper name), the README judge table and `docs/decisions.md` (one row at the end
of §4). Design, audit and verification: `docs/tutorial.md`; screenshots before/after in `docs/tutorial/`.

## Done
- **Audit** of the first five minutes as a stranger (both modes, en/uk/ru/it/zh, 1280×800 / 1920×1080 / 390×844): 18
  numbered confusions. The serious one: the rules generate events only for trials 3–17 and resolve a stake only when an
  event lands on its trial, so the first stake of both judge paths (Iris's prior read the first sign as trial 2) was
  silently lost for the whole season. Rules untouched (parity); the onboarding now steers the first stake to trial 3.
- **Tutorial rebuilt** as five show-don't-tell beats over the spec example (Shell II · Gift · 20 · +2): tap the four
  slots → add the dot and watch the numbers turn → read the strokes in order → stake 10 silk and watch trials 1–3 pass
  to "Verified ✓" → forget a memory for a vision, then the Novice/Pro question (owner decision kept). One action and
  ≤ 12 words of body per beat (tested), "Skip tutorial" on every beat, resumes at the saved beat after a reload.
- **Around it:** the access card in one line (long text folded away), a hologram look picker (four complete looks, the
  full constructor behind "Customize"; spec §8 kept), first contact in one line, and a returning player goes from ENTER
  straight to the island.
- **In-world first loop** (`objectives.js`): hub fly → stake (trial 3) → leave → verified; walk stake at the pad
  (trial 3) → end trial → verified → Price of Memory → fragment → talk → ask. Titles ≤ 7 / hints ≤ 13 words, "trial"
  everywhere, five languages.
- **Tests:** `tests/tutorial.test.mjs` (15), `npm test` 307/307, `npm run build` green. README judge table re-verified
  step by step (headless replay) and the hub section updated.

## Not done / needs other owners (details in `docs/collab-requests.md` 7–9)
- Task F: hint toast overflow and stale untilDone hint; hub hint text to match the quest; "Iris · 25% sure" wording;
  stale Iris line inside the Shell.
- Lead: `hub.js` pre-fill Delay to trial 3 for the first reading; `interactions.js` make the trial-3 stake the E
  option while nothing has resolved; `game.js` pass `skipOnboarding` for a returning player; rename `opt.anchor*` and
  `meaning.3.*` from "tick" to "trial".
- Task J: the shot list follows the changed README table.
- No sound/VFX cue in the tutorial (the runtimes load with the play layer); AI translations of the new strings await a
  native pass; nothing was checked on a GPU or a physical phone.

## How it was checked
Headless Chromium drives (`element.click()` through `page.evaluate`): every beat, a wrong tap, a reload mid-tutorial,
skip, the look tiles and Customize, first contact, the returning-player path, in en at three viewports and in uk / ru /
it / zh at 1280; zero console errors or warnings beyond SwiftShader's ReadPixels notice. Both play modes replayed on the
judge seed with the new goals; the walk path also replayed headless against the room to collect the README texts.

## Follow-ups from the lead (later on 08.11)
- Merged `origin/claude/loving-curie-ihasft` (`17bf2de`) into `claude/tutorial`: conflicts in the test script, decisions table,
  collab requests (Task I requests renumbered to 10–12) and README counts resolved; 352 tests, build green.
- Device-aware copy for every goal and tutorial body in five languages (`{input, select, touch/gamepad/other}`), `args.input`
  on every goal, a test that touch and gamepad never show a key letter (QA-011, QA-013 copy side).
- Simple-mode variant of the hub stake hint; narration behind a guarded import; QA-016 and QA-017 fixed; plain-words pass
  (stake, seal, sign, trial, silk). New requests 15–17 (input flag for the lead, narration assumptions for Q, the film seam for P).


## First loop at the source (`claude/first-loop`, resumed after the pause)
Branch from `de4465d` with `claude/tutorial` and `2004418` merged. Done: `hub.js` pre-fills the Delay to trial 3 before the first
reveal; `interactions.js` makes the trial-3 stake the E option under the same condition; `game.js` writes `ftf.firstloop.v1` at
the first verified proof and passes `skipOnboarding` on later starts (judge/reset ignore it); `opt.anchorTick` / `opt.anchorVision`
and the Delay meanings say "trial" (Russian Delay meanings stay the engine's words for prototype parity); goal quotes, README
judge table (step 3 = Press E) and hub steps updated and replayed headless; 363 tests, build green; browser check with zero
console errors. Details: `docs/tutorial.md` §5. Not changed: `docs/submission/video-shot-list.md` (Task J) still says
"Anchor here for tick …" in shot 6; the lobby Profile → Reset does not clear `ftf.firstloop.v1` (lobby.js is Codex's).
