# QA defects (Task K, the adversarial playtester)

Build under test: first pass on `claude/loving-curie-ihasft` `7f65be6` (= `main` `07ddd60` + docs); retest 2 on `2004418` (Tasks G, H, I, M, N and the QA-001/002 fixes); retest 3 on `5f94cbb` (QA-007/008/013/022 fixes, worker I's first loop, the motion system, the proof verifiers); retest 4 on `6f2f288` = `main` `1a17673` live on Pages (chapter films, round-5 agents, F's panel fixes), all merged into `claude/qa`, 08.11.2026.
Live site checked: https://spacexceo.github.io/forget-to-foresee/ (serves the same hub build as `main`).
Environment: headless Chromium 1243 (Playwright 1.63) on SwiftShader, 4 CPU cores, no GPU. Real-time input is
impractical at the resulting 7–15 fps, so unless a repro says otherwise the play layer was driven through
`window.__ftf.play.handleKey(code)` (the same function the keyboard calls) and `element.click()` via
`page.evaluate`. Every defect below reproduces with the real keyboard as well unless marked *harness only*.

Severity: **Blocker** = a judge would call the game broken or lying · **High** = loses state, soft-locks, or
contradicts the README · **Medium** = visible defect in the judge path · **Low** = polish, copy, consistency.
Status: open · fixed (commit) · won't fix (owner) · retest.

Each defect has an e2e check under `game/tests/e2e/` (run `cd game && npm run e2e`; not part of `npm test`),
named in the **Check** line, that fails while the defect is open and passes once it is fixed.

## Summary

| ID | Sev | Area | Title | Owner | Status |
|---|---|---|---|---|---|
| QA-001 | Blocker | i18n / HUD | The Guests say "The reveal does not match the root." on every verified reveal (all five locales) | F (UI) | **fixed** (lead, 17bf2de; verified on 2004418: `proof-line.e2e.mjs` green, the Guests say "The reveal matches the root.") |
| QA-002 | High | Shell hub | Keys and dock clicks are accepted during the 480 ms flight fade; a queued flight runs inside the auto-advance, a second F is swallowed | F (hub-ui) + lead (hub.js, game.js) | **fixed** (lead, 17bf2de; verified on 2004418: F then T within 120 ms keeps the trial and lands the flight; F then F runs one flight, the second press is dropped silently while the fade is up, a settled F stakes) |
| QA-003 | Medium | Shell hub / panels | Two Heir prompts at once at the season end (hub card over the Biography panel), different copy | F | **fixed** (verified on 6f2f288: one Heir prompt) |
| QA-004 | Medium | Play panels | Literal `null` text at the bottom of the Memories panel (the inspect panel did not reproduce it on 2004418) | F | **fixed** (verified on 6f2f288) |
| QA-005 | Low (was Medium) | Play panels / Novice | "Forget it for a vision" opened the legacy *Signs and visions* panel | F | legacy panel gone on 6f2f288; now **nothing opens** after the sacrifice while README step 6 still says "Signs & Visions opens with one to four new cards marked *vision*": fix the README or open the HUD panel |
| QA-006 | Medium | Hints | The hint toast "I read it as a Gift of 10 at Shell I, trial 2. Press V to see why." stays on screen through trial 4 | F (hints.js), copy I | **not reproduced on 5f94cbb** (walk, trial 4; `walk-panels.e2e.mjs` green) |
| QA-007 | Medium | Shell hub | A Shell stays gold ("2 signs") when every sign it holds points at a past trial; F flies there and the card says "That trial is already past" | lead (hub.js) | **fixed** (lead, a36fadf; verified on 5f94cbb over a whole hub season) |
| QA-008 | Medium | Camera | After leaving a Shell the camera keeps the Shell framing (distance ≤ 9 m, low pitch): the frame is mostly sky and Iris hides behind the decision card | G | **fixed** (G, 5563cfc; verified on 5f94cbb in `hub-input.e2e.mjs`), but see QA-028: in `motion.e2e.mjs`, after the map had been opened and closed before the flight, the distance was 9 m again |
| QA-009 | Medium | Layout | Overlaps on desktop: the main.js inspect prompt under the context menu and under the "Shell I opens…" flash; the "Local demo" badge over the dialogue strip; greybox labels poking out from behind the quest banner | F (a, b), H (c) | **fixed** (verified on 6f2f288 at 1280×800 and 1920×1080: no intersecting UI boxes, 0 greybox labels) |
| QA-010 | Medium | Layout / copy | Truncated text: quest title ellipsis, quest body under the key icon, hint toast cut at two lines (EN, ZH), log rows clipped at the bottom of the log box | F | **not reproduced on 5f94cbb** at the checked stops (EN, trial 1 / after the stake / trial 4); long locales not re-checked |
| QA-011 | Medium | Phone | At 390×844 the Shell dock covers the top of the MAIN QUEST card; the quest copy says "Press F or pick the gold Shell on the right" on a device with no F and the dock at the top | F (layout), I (copy) | layout **still open on 6f2f288** (dock 112–220 px over the quest card 197–321 px at 390 px); copy fixed |
| QA-012 | Low | HUD | Progress reads "16 / 17 · 94 %" once the season is over | F (from-obs) | open (reproduced again on 6f2f288) |
| QA-013 | Low | Objectives | Quest says "Anchor on Shell I for tick 3" while E's highlighted default anchors tick 2 | I | **fixed** (I, 73d4e72; verified on 5f94cbb: E = trial-3 stake) |
| QA-014 | Low | Shell hub | While the Memories panel is open (after the Key card's "Open memories") F and T are ignored but the dock buttons still work | F | open |
| QA-015 | Low | i18n zh | "Sign" is rendered as both 符印 (quest, dock) and 符号 (log "1 个新符号", hotbar "符号与幻象") | lead (locales) | open |
| QA-016 | Low | Onboarding | "Begin first contact" sits below the fold at 1280×800 (the constructor page needs a scroll before the primary button is visible) | I | **fixed** (I; verified on 2004418: "Begin" beside the title, above the fold) |
| QA-017 | Low | Copy | Season-end quest says "(panel below)" while the Biography panel is on the right | I | **fixed** (I; verified on 2004418: "Thank you for playing this local demo.") |
| QA-018 | Info | Movement | Walking the judge route with G took 156 s under SwiftShader (README: about 30 s) | G | not a defect: in-game speeds are 1.70 m/s walk and 3.51 m/s run; the wall-clock slowness is the software renderer stalling on texture uploads |
| QA-019 | High | i18n | Switching the language mid-season (L or Settings) leaves strings of the previous language inside the new one: in zh the hint reads "我把它读作：Мушля I，Дар 10，试炼 2" and the log rows keep the Ukrainian "В1" prefix; in EN "I read it as a Дар of 10". Lazily rendered args (`wh.raw`, `$meaning`, `$shell`, log tick labels) are cached in the locale they were first rendered in | F (world-hud / from-obs), lead | **fixed** (verified on 5f94cbb: zh and EN HUDs clean after cycling L five times) |
| QA-020 | Medium | Settings | The in-world Settings (hotbar, Esc) opens "Exploration controls" (key reference + volume) with no language and no Novice/Pro switch, while the README says "Settings switches Novice/Pro and the five UI languages"; those switches exist only in the lobby dialog, unreachable from the world | F (UI) / D (README) | **fixed** (verified on 6f2f288: Novice/Pro and the languages are in the in-world Settings) |
| QA-021 | Low | Help | H help in the hub lists the walk-mode keys only ("G walk to the current goal", "T end the tick"); F (fly / stake), N (map) and "T leaves the Shell" are missing | F / I | open (reproduced again on 6f2f288) |
| QA-022 | High | i18n / log | Rules-v3 log lines render as "Something happened that this build cannot describe yet." in every locale: the refunded question, held fragments, deferred prizes, the Shells leaving | engine-text adapter owner (F / lead) | **fixed** (lead, a36fadf; verified on 5f94cbb: `engine-text.e2e.mjs` green) |
| QA-023 | Low | Tutorial copy | Beat 3 reads the Delay stroke as "in 2 ticks" and the sentence below says "in 2 trials"; the world HUD says "trial" everywhere (Task I's open request to rename `meaning.3.*`) | I / lead | open |
| QA-025 | Low | Map | The shard pedestal glyph on the map (a small gold diamond on Iris's plateau) is the same shape as the legend's "Current goal" diamond, so at trial 1 the eye reads the goal at Iris's camp while the real goal pulse is on Shell I | H / F | open |
| QA-026 | Low | Map / phone | The map's footer on a phone reads "Click a Shell to fly into it, a place to walk there. N or Esc closes the map." (no N key, no click on touch); the rest of the HUD copy is device-aware since Task I | H / I | open |
| QA-027 | Medium (to confirm on a GPU) | Map / motion | On 5f94cbb, 1.5 s after N the whole map panel (`.ftf-map` and every place) still computes `opacity: 0` under SwiftShader; it was visible on 2004418 before the motion system. Either the enter animation is driven by a slow frame clock or it never completes (`motion.e2e.mjs` "map open") | G | **not a defect**: on 6f2f288 the map reaches opacity 1; the enter fade merely takes several seconds under SwiftShader (see QA-032) |
| QA-028 | Medium (to confirm) | Shell hub / motion | On 5f94cbb, after the map had been opened and closed, a flight and a leave left the camera at 9 m (QA-008 pattern) and after F pressed twice during the fade the `.hub-fade` cover still had `opacity: 1` 1.2 s after landing (`motion.e2e.mjs`, world test); the same steps without the map pass in `hub-input.e2e.mjs` | G / lead | **not a defect**: with more time the camera returns to 30 m (28.6 m at 1.5 s, 30 m at 8 s) and the fade clears; the check waited too briefly for the software renderer |
| QA-029 | Low | Console | Three warnings on every direct load (`?play=direct`, phones, `#play`, also on the live site): "The resource …/assets/ui/lobby_bg.jpg was preloaded using link preload but not used" (the lobby background is preloaded even when the lobby is skipped) | lead / F | open |
| QA-030 | Low | Loading | Iris is a blue greybox capsule for the first seconds after the HUD appears (`shots/r4-island-after-lobby.jpg`, 1.5 s after play-ready; her model arrives a few seconds later); the heroine should stream before the camps and props | lead (streaming priority) | open |
| QA-031 | Medium | Layout | A new square icon button at the top-left corner sits over the trial card and hides the "T" of "Trial 1 of 17" at 1280×800 (`shots/r4-island-after-lobby.jpg`; the round "?" recap button lower left is fine) | F | open |
| QA-032 | Low | Motion | Enter fades advance per frame rather than per wall-clock time: the hub dock needs about 5 s and the quest body about 3 s to reach opacity 1 at SwiftShader's 5 fps, so on a 30 fps phone every fade runs about twice as long as designed | G | open |
| QA-024 | Low | Season end | When the vote accepts a weapon the HUD shows Silk 0 and "the message was a weapon" with no line that says the weapon took the silk; the Biography lists the memories and "Thank you for playing" only | I / F | open |

Checked and fine on 6f2f288 (= `main` 1a17673, also on the live site): the chapter film on an iPhone 13 viewport keeps the title, "What matters now" and "Hold to skip" inside the screen, hides the whole HUD while it plays, ends on a 0.9 s key hold and brings the HUD back with nothing stuck transparent (`shots/r4-film-phone.jpg`); the loading path lobby → skip tutorial → look → first contact → island takes 18 s to the island and 54 s to a live HUD on the Pages build under SwiftShader (0 console errors); the round-5 agents load without errors (18 skinned meshes within 20 s); lobby and tutorial input is never blocked by the motion system and reduced motion stops every animation. Not defects (checked and fine on 2004418): `smoke.e2e.mjs` loads hub en/uk/ru/it/zh, walk en, reduced motion + low tier, `?hud=old` and the Pixel 7 profile with zero console errors, no raw keys, no unrendered placeholders; the new tutorial runs end to end (wrong taps, dot cycling, stake and seal in 2 s, forget, Novice, look picker, first contact, and a returning player goes from ENTER straight to the island); the map opens and closes with N and Esc, routes on click, closes when Memories opens, works on the phone sheet; the README judge table v2 matches (trial 2 silk 56 with the stake, trial 4 silk 72, Leaf #0 ✓, Resolved tab ✓). First pass: `npm test` 292/292, `server` 28/28, `cargo test --lib` 56 passed, `npm run build`
green, the agent example ends with `"rejected": 0, "firstProofVerified": true`; zero console errors or page errors in
the hub season, the walk judge path, the lobby flow, the phone profile and the zh locale; zero rejected commands over a
full hub season (92 commands); the README judge table lines 1–6 match the build word for word except where QA-005
and QA-013 say otherwise; the live site loads the hub build with the same first screen as the local build.

---

## QA-001 · Blocker · The Guests say "The reveal does not match the root." on every verified reveal

**Repro** (walk or hub, any locale): `/?demo=judge&mode=walk&play=direct` → press T twice until trial 3 (or in the
hub: fly into Shell I, stake, leave, let trials pass). Look at the dialogue strip at the bottom when the trial-3
event is revealed. Also at trials 5, 15, 16, 17 (`shots/hub-card-fragment-6.jpg`, `shots/hub-card-vote-17.jpg`).
**Expected:** "Shell II: Gift, power 20. The reveal matches the root." (the log row next to it says
"Leaf #0 checked against the root ✓", the hint says "the seal matches").
**Actual:** "Shell II: Gift, power 20. **The reveal does not match the root.**" Every reveal, all five locales
(ru "не совпало", uk "не збіглося", it "non corrisponde", zh "不符").
**Cause:** `src/ui/i18n/engine-adapter.js:264` passes `verified: !!fx.verified` (a boolean) into
`line.event`, whose ICU select has the branches `yes {…} other {…}`; `String(true)` is `"true"`, so the `other`
branch always wins. The unit tests render `LINE_KEYS` with placeholder args and never assert the branch.
**Why Blocker:** the one sentence a judge reads about the proof says the proof fails, right next to a ✓.
**Check:** `tests/e2e/proof-line.e2e.mjs` (renders `line.event` through the adapter with `verified: true` in all
five locales and reads the live dialogue strip at trial 3).

## QA-002 · High · Hub input accepted during the flight fade; a queued flight runs inside the auto-advance

**Repro A (F then T, ~150 ms apart; a player tapping two keys):** `/?demo=judge&play=direct` (hub). Press F (the
gold Shell), then T before the fade clears. Trace of the room commands: `end_tick` (T, trial 1 → 2) runs first,
then the flight's `move anchor_zone:1` + `enter_shell 1` run while `advance()` is still passing trials. Result
(`shots/hub-race-after.jpg`): Iris stands inside Shell I at trial 3 with the "Moss makes an offer" card on top of
nothing (the reading card is hidden by the card), the sign she sees is the one from trial 1, and the dock said
nothing was waiting. With the real keyboard: F, T within half a second.
**Repro B (F then F, the README's own sequence "fly … stake (F)"):** press F to fly, press F again ~300 ms later
(still under the fade) to stake. The second F is read on the island (`obs.you.zone` is still `island`) and starts
a second flight instead of the stake; the stake never happens and nothing tells the player.
**Expected:** while a flight is in progress every hub input is ignored or queued in order; `T` can never pass a
trial while a flight is pending; the second `F` stakes (or is ignored with the fade still up).
**Actual:** `fly()` in `src/play/game.js` awaits `hubUi.cover()` (480 ms) before `hub.flyTo()` sets `busy`, so
the dock buttons, F and T are live for half a second; `ShellHub.run()` checks `busy` but not `advancing`, so
`flyTo` runs concurrently with `advance()` (which checks `busy` only at its start).
**Check:** `tests/e2e/hub-race.e2e.mjs` (F then T within 150 ms: asserts the trial does not advance before the
flight lands and Iris is not inside a Shell during an advance; F then F: asserts a stake happened).

## QA-003 · Medium · Two Heir prompts at once at the season end

**Repro:** play the hub season to the vote (any seed), answer the vote card. `shots/hub-card-heir-17.jpg`.
**Expected:** one Heir decision.
**Actual:** the hub card "The season is over · 1 Forget for an Heir · 2 Keep the memory" opens on top of the
Biography panel, which carries its own "Forget everything for an Heir / Keep the memory" buttons (different
wording); the card hides the panel's memory list; the translucent panel lets the finale beams read through the
list rows. After the card is answered the Biography stays with "Thank you for playing this local demo." and no
line that says which choice was made.
**Check:** `tests/e2e/season-end.e2e.mjs` (at `phase === 'end'` at most one element offers the Heir choice).

## QA-004 · Medium · Literal `null` in the Memories panel and the inspect panel

**Repro:** `/?demo=judge&mode=walk&play=direct` → press M. The last line of the panel is the text "null"
(`shots/walk-4a.jpg`). Also: at the Scroll press E on "Read the chronicle" / at an anchor zone "Look at the zone":
the info panel ends with "null" when there are no signs to show.
**Cause:** `src/play/ui.js` `panelShell(title, ...body)` → `panelEl.replaceChildren(header, ...body)`; `forgotten`
(Memories) and the `signs` row (info) are `null` when empty, and `replaceChildren(null)` appends the string
"null". (`el()` filters nulls; `panelShell` does not.)
**Check:** `tests/e2e/panels.e2e.mjs` (no text node equal to "null" in `.pl-panel`).

## QA-005 · Medium · "Forget it for a vision" opens the legacy Signs panel; Novice sees Pro detail

**Repro:** README step 4, walk mode: M → "Forget it for a vision". `shots/walk-4b.jpg`.
**Expected (README):** "Signs & Visions opens with one to four new cards marked *vision*" (the HUD panel: one
plain line per sign in Novice).
**Actual:** the greybox-era `.pl-panel` "Signs and visions" opens: "Reading rule: try all starts / start at the top /
start where the dots point", "Dictionary: 0 of 16 words confident", and every sign with its four slots and
confidences. In Novice mode this is the Pro view (clarity layers §L0 hides it), styled unlike the HUD, and it is a
second, different "Signs" UI next to the HUD's V panel. The same legacy panel opens from the HUD sign cards
(`onAction('sign')`).
**Check:** `tests/e2e/panels.e2e.mjs` (after a vision sacrifice in Novice the HUD Signs panel is open and the
legacy `.pl-panel` is not).

## QA-006 · Medium · Stale hint toast

**Repro:** walk judge path through trial 4. The top-right toast keeps "A sign woke. I read it as a Gift of 10 at
Shell I, trial 2. Press V to see why." (`shots/walk-6.jpg`). The hub shows the same text with "Fly into a Shell (F)".
**Expected:** a hint about a sign whose trial has passed is withdrawn (or re-issued for the newest sign); in the hub
the hint also keeps "Press V" wording while the HUD's `Hint` row repeats it.
**Check:** `tests/e2e/hints.e2e.mjs` (no visible hint names a trial lower than the current one).

## QA-007 · Medium · Gold Shell with only expired signs

**Repro:** hub season, seed `?demo=judge`: at trial 13 the dock shows "I · 2 signs" and "III · 2 signs"; F flies into
Shell I; the reading card shows the sign drawn on trial 11 pointing at trial 12 with "That trial is already past:
change the Delay or wait for a new sign." and the Stake button disabled.
**Expected:** a Shell counts as waiting only while it holds a sign Iris can still stake on; otherwise it is "quiet"
and F does not fly there.
**Check:** `tests/e2e/hub-dock.e2e.mjs` (a dock button marked `hub-wait` implies an anchorable sign for that Shell).

## QA-008 · Medium · Camera after leaving a Shell

**Repro:** hub: fly in, leave (T). `shots/hub-card-offer-3.jpg`: the camera stays at the Shell distance and pitch; on
the island this frames the sky with the island at the bottom edge; Iris is behind the decision card.
**Expected:** leaving a Shell restores the island framing (or the framing the player had before the flight).
**Check:** `tests/e2e/camera.e2e.mjs` (after exit the rig distance returns to its pre-flight value ± 10 %).

## QA-009 · Medium · Overlaps on desktop

(a) The main.js `#prompt` ("I inspect Anchor (Shell I) up close") renders under the play context menu and shows
through between its rows (`shots/walk-6.jpg`), and under the `.pl-info` flash "Shell I opens…"
(`shots/hub-card-key-13.jpg`, `shots/hub-card-fragment-6.jpg`); it is also styled in the greybox grey while
everything around it is parchment and gold.
(b) The "Local demo · the rules run in your browser…" badge (bottom left, two lines) overlaps the dialogue strip's
speaker tag on every desktop screenshot.
(c) Greybox "Scroll table · not final art" / "Anchor · not final art" labels poke out from behind the quest banner
(`shots/hub-desktop.jpg`); Task H removes the labels.
**Check:** `tests/e2e/overlaps.e2e.mjs` (bounding boxes of visible UI elements do not intersect).

## QA-010 · Medium · Truncated text

Quest title "The Price of Memory: forget something to see the futu…" (`shots/walk-4a.jpg`); the quest body runs
under the key ornament ("Anchor on the hunch, or enter the Shell…", `shots/walk-4b.jpg`); the hint toast is cut after
two lines with an ellipsis in EN and ZH (`shots/hub-desktop.jpg`, `shots/zh-hub.jpg`); the log box clips its last row
mid-line (`shots/walk-6.jpg`).
**Check:** `tests/e2e/overflow.e2e.mjs` (no visible HUD text element with `scrollWidth > clientWidth` or
`scrollHeight > clientHeight + 2` unless it is a scroll container).

## QA-011 · Medium · Phone layout and copy

`shots/phone-hub.jpg` (iPhone 13 emulation, 390×664 viewport): the Shell dock sits over the top of the MAIN QUEST
card ("Let trial 1 pass" covers the eyebrow); the quest says "Press F or pick the gold Shell on the right" while the
dock is at the top and there is no F. The world is almost fully covered by UI on this screen (dock + quest + trial
card + three tiles + run button + dialogue strip).
**Check:** `tests/e2e/phone.e2e.mjs` (dock and quest card do not intersect; the quest copy on a coarse pointer does
not mention a key).

## QA-012 · Low · Progress 94 % at the season end

`shots/hub-final.jpg`: "Progress: 16 / 17 · 94 %" with "The season is over".
**Check:** `tests/e2e/season-end.e2e.mjs`.

## QA-013 · Low · Quest tick vs default anchor tick

Walk mode step 5: the quest reads "Anchor on Shell I for tick 3" (the vision), the context menu's E default is
"Anchor here for tick 2 (as your reading says)". Pressing E as the README says anchors tick 2; the quest then
moves on, so nothing is lost, but the two numbers disagree.

## QA-014 · Low · Keys ignored while the Memories panel is open, dock still clickable

After the Key card's "Open memories" the Memories panel opens; F and T do nothing (`!ui.panel` guard in
`game.js handleKey`) while the dock buttons and T-pass button remain enabled under the panel.

## QA-015 · Low · zh: two words for "sign"

符印 in the quest, dock and hint; 符号 in the log ("来客开口：1 个新符号") and the hotbar ("符号与幻象").

## QA-016 · Low · Onboarding primary button below the fold

`shots/lobby-desktop-ctor.jpg`: at 1280×800 the hologram page shows no "Begin first contact" button without
scrolling (it is below the particles section).

## QA-017 · Low · "(panel below)"

Season-end quest body: "Forget everything for an Heir, or keep the memory (panel below)." The Biography panel is on
the right.

## QA-022 · High · Untranslatable rules-v3 log lines

**Repro:** any season (`?demo=judge` hub, judge seed: trial 15; `tests/e2e/.shots/hub-season-end.png`), or
`node --test game/tests/e2e/engine-text.e2e.mjs` (2 s, no browser): it simulates 20 seeds × every sim strategy on
rules v3 and lists each engine feed line the adapter cannot parse. On 2004418:

| times | engine line |
|---|---|
| 159 | Гости вернули шёлк за вопрос без ответа. |
| 64 | Янтарь удержал фрагмент ради приза (N, выплата в финале). Его часть послания погасла. |
| 49 | Янтарь получает отложенный приз N шёлка: послание прочли без него. |
| 19 | Вы удержали фрагмент: приз N ждёт финала — если послание прочтут без вас. |
| 7 | Раковины ушли. Шёлк мира обесценился. |
| 32 | the same held-fragment / deferred-prize lines for Соль, Иней, Ирис |

**Actual:** the HUD log row reads "Something happened that this build cannot describe yet." (`log.unknown`), in all five
locales (seen at trial 15 of the judge seed in both the hub and the walk season); the Lore/Log tabs and the agent API's `log[].text` carry the same fallback.
**Cause:** `src/ui/i18n/engine-adapter.js` `LOG_PATTERNS` covers the v2 feed; the v3 lines (P2 refund, P1 deferred
prize, gone wipes silk) were added to `engine.js` without patterns, and the adapter test replays v2 seasons only.
**Check:** `tests/e2e/engine-text.e2e.mjs`.

## QA-023 · Low · "ticks" vs "trials" on one tutorial card

Beat 3 ("Read it") lists "4 Delay: in 2 ticks" and then "Gift of 20 at Shell II, in 2 trials." The HUD, the quest
and the README say "trial"; `meaning.3.*` and `opt.anchor*` still say "tick" (Task I asked the lead to rename them).

## QA-024 · Low · Weapon outcome leaves Silk 0 unexplained

Hub season, vote "A gift: accept" on a weapon season (`hub-season.e2e.mjs`, judge seed): the trial card shows Silk 0,
the quest "The season is over: the message was a weapon", the Biography the kept memories and "Thank you for playing
this local demo." Nothing says that accepting the weapon cost every clan its silk (and the log line that would, if it
is "Раковины ушли…"-like, is QA-022). The player cannot tell a bug from the rule.

## QA-018 · Info · Walk time of the judge route (not a defect)

README step 2: "Press G (Iris walks to the goal; about 30 s, hold Shift to run)". Under SwiftShader the walk balcony →
Scroll took 156 s with Shift held, but the controller's own velocity is right: 1.70 m/s walking, 3.51 m/s running
(`smoke.e2e.mjs` measures it). The frame loop stalls on model and texture uploads while Iris moves (0.5–3 fps), so game
time runs 3–5× slower than the wall clock here. Needs one run on a real GPU to confirm there are no upload hitches.

## QA-019 · High · Mixed languages after a language switch

**Repro:** `/?demo=judge&mode=walk&play=direct` → press L four times (uk, ru, it, zh), then once more (en).
**Actual:** zh HUD: hint "一个符号醒了。我把它读作：Мушля I，Дар 10，试炼 2。", log rows "В1 主人的钥匙已承诺…" (the
Ukrainian trial prefix); EN HUD after the full cycle: "I read it as a Дар of 10 at Shell I…", log rows "В1 …"
(`docs/qa/shots/misc-lang-3.jpg`, `misc-settings.jpg`). A fresh load in zh renders "试1" and "馈赠", so the strings
exist: the re-render on a locale change keeps args that were resolved in the previous locale.
**Expected:** spec §9 "switching language without a new season": every visible string in the new language.
**Check:** `tests/e2e/walk-panels.e2e.mjs` (no Cyrillic in the zh HUD, no Cyrillic or Han in the EN HUD after cycling).

## QA-020 · Medium · In-world Settings has no language or Novice/Pro switch

`docs/qa/shots/misc-settings.jpg`: the hotbar Settings opens "Exploration controls" (move / orbit / interact / …,
sound sliders, Resume exploration). README "Judge in 5 minutes": "**Settings** switches Novice/Pro and the five UI
languages" and `docs/decisions.md` ("Settings can switch any time") describe the lobby dialog (`src/ui/settings.js`),
which no longer opens once the player is in the world. L cycles languages; Pro is unreachable in-world.
**Check:** `tests/e2e/walk-panels.e2e.mjs`.

## QA-021 · Low · Help lacks the hub keys

H in hub mode: "G walk to the current goal · … · T end the tick"; no F, no "T leaves the Shell", no N (map, after Task H).
**Check:** `tests/e2e/walk-panels.e2e.mjs` (QA-022 in the test name; same item).
