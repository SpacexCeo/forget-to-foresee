# The fun layer

Owner request of 10.11.2026 ("do it") after the concept review: six pieces that make the loop more rewarding. All
of them are presentation over facts the per-viewer observation already holds; no rule is evaluated or changed, the
engine and `prototype-2d/` are untouched. Logic: `game/src/play/fun.js` (pure). Screen: `game/src/play/fun-ui.js`.
Wired in `play/game.js` (`attachFun`), strings `fun.*` in the five play locales.

| Piece | What the player sees | Where the facts come from |
|---|---|---|
| Dictionary as a collection | a chip under the Shell row: a 4×4 grid that brightens with confidence, "known / 16 · understanding %"; a click opens the book with all 16 words | `obs.dictionary` through `reasons.js glossary`; `understanding()` is how far the guesses stand above one in four |
| Ask the Guests from the book | click a word that is not certain, pick a meaning, Ask (inside a Shell) | the room's own `ask_guests` action (1 attention, 5 silk); the layer walks Iris to the glass first |
| The "new word" moment | a banner with the stroke and its meaning, the cell pops in the chip and the book, a chime | a cell that became certain between two observations (`newWords`) |
| Streak | "Streak ×N" chip and banner; each right reading in a row earns 10 × N insight | the outcome reports of `outcome.js`: a staked reading that named the Shell and the trial of the event |
| The burning memory | the memory's picture and title, the picture burns from the bottom, "Gone for good." (a click skips; reduced motion shows the still card) | the memory that left `obs.memories` when `obs.iris.forgotten` grew |
| Who lied to me? | a case file in the book (each bought word: unproven, held true, a lie) and a banner when a lie comes out | `obs.dictionary.boughtWords` and the certain cells |
| Chapter one | a card when trial 8 begins, once per device for a first-time player: words, best streak, insight, silk, "Continue the season" / "Start a new season" | `obs.season.tick`; the flag `ftf.fun.chapter1.v1` in storage |

## What it is not

- **The streak does not multiply silk.** A silk multiplier is a rule change: the rules are frozen (`baseline-2d-1`
  parity with the prototype, Ash's phrases committed on testnet). Insight is a score shown to the player.
- **The season is still 17 trials.** The first-chapter card is a place to stop with a summary, not a shorter season;
  a real 7-trial season needs a rules mode and the owner's decision.
- **The sign on the glass is not redrawn with the translation.** The reading card already shows the certain word
  ("The Guests said yes"); the banner and the cell carry the moment.

## A finding worth the owner's attention

A player who only lets trials pass never gets a certain word: over the whole judge season the confidence of every
cell stays between 25 % and 67 %, and no word is pinned. Words become certain through **Ask the Guests**, and that
action existed only in the walking mode's glass panel, not in the Shell hub. The book now offers it, so the
collection can actually fill. If the first minutes should hand out a certain word without any action, that is a
season-design or rules decision.

## Phones

The chip and the book are hidden on the phone HUD (no free row there yet); banners, the burning memory and the
chapter card show. A phone entry point for the dictionary is open work.

## Tests and checks

`game/tests/client/fun.test.mjs` (9, over real local seasons): cells, new words, understanding, the ask question and
the room's answer, streak and insight, case file and lies, the forgotten memory, the chapter rule and summary.
`game/tests/client/fun-ui.test.mjs` (5, mini DOM): chip and book, asking from the book inside a Shell, the burn
overlay and the lie banner, the chapter card once, Russian without raw keys. Checked in headless Chromium: the book
and a real "yes" from the Guests inside Shell I in the game; the streak banner, the burn and the chapter card on a
light page (a software-rendered screenshot of the game takes about 40 s, too slow to catch a 4 s animation).
