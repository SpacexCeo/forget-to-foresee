# Tutorial and onboarding: the first five minutes

Task I (`docs/handoff/worker-tasks.md`), branch `claude/tutorial`, 08.11.2026. Goal: a stranger, or a judge with
five minutes, understands the loop **Read → Anchor → Reveal → Verified** and **the Price of Memory** without reading
anything long, in both play modes (Shell hub by default, `?mode=walk`), in all five languages.

Part 1 is the audit of the build as it was (`main` + the 08.11 docs, commit `7f65be6`). Part 2 is the redesign.
Part 3 is what was built, how it was checked, and what is left.

## 1. Audit: playing the first five minutes as a stranger

Method: headless Chromium (SwiftShader, 1–4 fps) on `npm run dev`, `?demo=judge` (hub) and `?demo=judge&mode=walk`,
locales en / uk / ru / it / zh, viewports 1280×800, 1920×1080 and 390×844. Every screen's visible text was recorded
with its word count; the world HUD, the hub dock, the toast and Iris's line were dumped after every action; console
errors and warnings were counted. Walking is impractical at 4 fps, so in the walk mode the player was moved to the
spot and the keys were sent through `play.handleKey`, the same function the keyboard calls. Screenshots of the state
before the change: `docs/tutorial/before/`.

### 1.1 Numbers

| Measure | Hub (default) | Walk (`?mode=walk`) |
|---|---|---|
| Clicks from the lobby to the island | 8 (Enter, Continue as guest, Next ×3, Guide me, Begin first contact, Step onto the island) | 8 |
| Words to read before the island (visible text of the seven screens) | 431 | 431 |
| Largest single screen | hologram constructor: 117 words, 62 controls | same |
| Words on screen on arrival (HUD + dock + toast + Iris line + log + badge) | 126 | 101 |
| Words on screen inside the first Shell | 179 | — |
| Interactions in the tutorial | 0 (read and press Next) | 0 |
| Actions until the first "Verified ✓" | 4 (fly, stake, leave, one decision card) + 1 "let trial pass" | 7 (walk, E, M, forget, walk, E, T×6) |
| Time to "Verified ✓" at 4 fps with the hub's 1.4 s auto-trials | 125 s after arrival | n/a (walks replaced by teleports) |
| Console errors / warnings in the states touched | 0 errors; 2 SwiftShader "GPU stall due to ReadPixels" warnings (driver, not the game) | same |

### 1.2 Confusions, dead ends and walls of text (in play order)

Onboarding screens (both modes):

1. **"Demo access" is a legal note, not a first beat.** 67 words, the first of them "synthetic entitlement",
   "server", "seed phrase". Nothing is shown, nothing is done. The badge already says "testnet demo · no payment".
2. **The tutorial is four read-only cards.** No step asks the player to do anything; the ring is a picture. The
   numbers 1–4 appear on page 2 with no word on what they are. "1 dot: start one slot clockwise" repeats on pages
   2, 3 and 4, where it is noise. Page 3 ("Read one sign", 82 words) shows a monospace readout ("Place: loop →
   Shell II") that reads like a spec table; the player never reads anything, they are told the answer.
3. **Vocabulary before meaning.** "Anchor", "silk", "tick" (the HUD says "trial"), "shard", "slot", "stroke form"
   all appear before the player has seen one of them. The in-game term is *trial*; the tutorial says *ticks*.
4. **Two ideas on the last card.** The Price of Memory (the game's signature idea) shares a card with the
   Novice/Pro question; the question comes before the player has seen the HUD it describes.
5. **The hologram constructor blocks the path.** 117 words, 62 controls, a 64-character hash and a "Low-tier
   preview" checkbox, mandatory, before the player has played one second. On a 390 px phone it is four screens tall.
6. **A returning player repeats the ceremony.** Everything is done, yet Enter still shows the "First contact" card
   and one more click. The tutorial cannot be skipped; a reload during the tutorial restarts it at page 1.

Hub mode, in the world:

7. **Three voices say the same thing at once.** Quest banner "Fly into Shell I · A sign glows there. Press F or
   pick the gold Shell on the right.", toast "A sign woke. I read it as a Gift of 10 at Shell I, trial 2. Fly into a
   Shell (F) and read it with…", Iris's line "The Shells hang beyond the camps, and the Guests are drawing. Pick the
   gold Shell and we fly.", plus the dock's two-line paragraph. 126 words for one action.
8. **The toast is cut off** at 1280×800 ("…read it with…"): the hint is longer than the 338-unit toast.
9. **"Iris · 25% sure" four times** on the reading card. 25 % is the uniform prior; to a stranger it reads as a
   broken number, and the card then invites them to stake 10 silk on it.
10. **The first stake lands on a trial that cannot pay. (Defect.)** The judge season's first sign is published on
    trial 1; Iris's prior reads its Delay as "in 1 tick", so the pre-filled target is *Shell I, trial 2*. The rules
    generate events only for trials 3–17 (`docs/rules-baseline.md` §2.2), and the engine resolves anchors only
    when an event lands on that trial, so a stake on trial 1 or 2 is **never returned and never mentioned**: the
    anchor stays in the list for the rest of the season. The README's walk path (step 5, "Anchor here for tick 2
    (as your reading says)") has the same dead stake. The player loses 10 silk and learns nothing; "Leaving the
    Shell ends the trial … anything else returns it" on the card is not true for those trials. Rules stay untouched
    (parity); the onboarding must steer the first stake to trial 3, where the first Gift always lands.
11. **Iris's line goes stale.** "Pick the gold Shell and we fly." is still on screen inside the Shell.
12. **The reveal is not tied to the player's stake.** At trial 4 the toast says "It came true, and the seal
    matches", the log says "Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓", but nothing
    says what happened to *our* 10 silk on Shell I. The loop's last beat (Verified) has no goal of its own: the
    quest after leaving is already "A sign waits in Shell I".
13. **A decision card interrupts the first loop** (Moss's loan at trial 3) before the first reveal; fine later,
    noise now. Not changed here (hub autopilot, owner design), but the goal text now tells the player time is passing.
14. **Phone:** on 390×844 the dock sits under the top bar and the quest card under it; the dialogue line is cut
    ("The Shells hang beyond the camps, …"); the Shell dock and the quest both say "fly into Shell I".

Walk mode, in the world:

15. **The first five minutes teach the hardest ideas first.** Goal 1 walks to the Scroll (29 s), goal 2 is the
    fragment with a 40-word hint about hidden prizes and deadlines, goal 3 is forgetting a memory. The loop the
    judge must see (read → anchor → verified) starts at goal 4. The clarity design (`docs/design/clarity-layers.md`
    §1–2) puts fragments and memory in layer 1, after the first verified anchor.
16. **"Iris is only guessing (25% sure) … Anchor on the hunch, or enter the Shell and ask the Guests first."** 28
    words, two options, no recommendation; E then places the dead stake of item 10.
17. **The reveal has no goal.** After T the quest jumps to "Visit Moss's camp and talk" (trial 2) and "Enter a
    Shell and ask the Guests" (trial 4, 25 words) while the trial-3 reveal, the whole point, scrolls by in the log.
18. **Stale toast.** "A sign woke … trial 2. Press V to see why." stays until V is pressed, through trial 4, after
    the sign was revealed.

Locales (uk / ru / it / zh): the tutorial renders with no missing keys and no raw keys; Ukrainian and Italian run
15–25 % longer than English, so the 1280 cards wrap to one more line and the phone cards scroll; Chinese renders in
the system CJK fallback (request 3 in `docs/collab-requests.md`). The copy problems above are identical in every
language because they are structural.

### 1.3 What already works and is kept

The order lobby → access → tutorial → hologram → first contact (spec §1) and its gating (`flow.js`); the sign ring
drawing and the worked example "Shell II · Gift · 20 · +2"; the Novice/Pro question on the last tutorial card
(owner decision 08.11); the full hologram constructor with the canonical recipe hash (spec §8); the world HUD and
its hint engine (owned by Task F); the Shell hub's one-click decisions.

## 2. Redesign: show, don't tell

Principles (task brief): one idea per step; the player does it right away; immediate feedback; at most about
12 words per beat; skippable; resumable; never blocks a returning player; the judge path reaches "Verified ✓" in
under three minutes; the same words everywhere: **Shell, Guests, sign, slot, silk, stake, trial, vision, memory**.
"Anchor" stays for the pad and the engine action; the verb the player reads is *stake*.

### 2.1 Screens before the island

| Step | Before | After |
|---|---|---|
| Access | 67 words, "synthetic entitlement" | "Free guest demo. No wallet, no money. Testnet only." + the badge; the long text is behind a "Details" disclosure |
| Tutorial | 4 read-only cards | 5 interactive beats, each one action, each ≤ 12 words of body, with "Skip" and a progress row; the beat index is saved, so a reload resumes |
| Hologram | 117 words, 62 controls | 4 preset tiles with the live preview and one primary button; the full constructor opens behind "Customize" |
| First contact | 22 words, one click | one line and one button; skipped for a returning player (all steps done → straight to the island) |

The five tutorial beats (`flow.js` `TUTORIAL_BEATS`, rendered by `onboarding.js`):

| # | Beat | The player does | Feedback | Words |
|---|---|---|---|---|
| 1 | Four slots | taps the four strokes of the ring | each lights and names its slot: Place, Action, Power, Delay | 9 |
| 2 | The dots | taps the core until one dot shows | the numbers 1–4 turn: reading starts at the dot's slot, then clockwise | 11 |
| 3 | Read it | taps the strokes in reading order 1→4 | each meaning appears; the line "Gift of 20 at Shell II, in 2 trials" assembles | 8 |
| 4 | Stake and watch | presses "Stake 10 silk on Shell II, trial 3" | silk 63 → 53; trials 1, 2, 3 pass; the ring seals "Verified ✓"; silk → 73 | 10 |
| 5 | The Price of Memory | presses "Forget it for a vision" on a memory card | the card dissolves, a ghost sign appears; then the Novice/Pro question | 12 |

Beat 4 teaches two facts the player needs in the first minute of play: the first Gift always lands on trial 3
(a rule of the season, `docs/rules-baseline.md` §2.2), and the reveal is checked against a seal written before the
season began. Beat 5 is the signature idea on its own card; the mode question follows it, as the owner decided.

### 2.2 The first loop in the world (`objectives.js`)

Hub (default): **fly → stake → leave → verified**. The stake goal says "Iris guesses. Make Delay say trial 3,
then stake (F)." so the first stake can pay or return, never vanish. The new `verified` goal holds until the first
proof is checked ("Let trials pass. Trial 3 is sealed before you arrived.") and then the regular goals take over.

Walk: **reach the pad → stake → end the trial → verified → forget → fragment → talk → ask**. The first walk goes
from the balcony to the pad of the sign's Shell (about 29 s, the same length as the old walk to the Scroll); the
stake goal names trial 3; the Price of Memory comes right after the first verified reveal, when "seeing the next
sign early" means something; the fragment, talking and asking stay as soft goals that expire.

Both: titles ≤ 6 words, hints ≤ 12 words, enforced by a test; every goal text exists in five languages.

### 2.3 Out of scope here, requested from the owners of the files

See `docs/collab-requests.md` (requests 7–9): the toast length, the "25 % sure" wording and the stale Iris line
(Task F: `hints.js`, `hub-ui.js`, world HUD); pre-filling the Delay of the first reading to trial 3 in `hub.js`
(lead); the video shot list follows the README judge table (Task J).

## 3. Built, checked, left

Filled in below as the work lands (sections 3.1–3.3).
