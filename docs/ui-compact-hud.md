# The compact desktop HUD

Owner request and mockup of 10.11.2026 ("I want the menu compact and convenient"): the mockup-sized desktop HUD took
about a third of a 1684×934 window (a 229×159 trial card, a 667×111 quest banner, a 382×246 journal, a 340×279 Shell
panel). The compact skin shows the same information in thin pills and gives the world the rest.

It is a skin, not a second HUD: the same DOM and the same packages (`status.js`, `log.js`, `actions.js`, the hub dock in
`play/hub-ui.js`), restyled by `game/src/ui/world-hud/compact.css` under `body.wh-compact`. `index.js` sets the class
on the desktop layout; phones keep `mobile.js`; `?hud=classic` keeps the large panels.

| Element | Classic | Compact |
|---|---|---|
| status | card: title, Phase, Silk, Progress bar | one pill: "Trial 1 of 17 · Explore · Silk 63" (the progress is the trial number) |
| Shells | bottom-right panel with a title, two paragraphs, four 71×60 cells, "Let trial 1 pass" | a row under the status: I II III IV (a gold dot where a sign waits) and "T Pass" |
| quest | banner with tag, corners and key art | one pill, top centre: key, title, the first hint line |
| toast | two lines | one line with an ellipsis; the full text on hover or focus |
| journal | always open, 382×246 | a row of tabs bottom-left; a tab opens the body above it, the same tab closes it; the Log tab counts unread entries |
| Signs and Visions | open by default on wide windows | closed until V or the hotbar button |
| hotbar, Iris line | 57 px bar of boxed buttons | a 48 u pill with dividers; the line is a pill |
| recap `?`, Chronicle | 52 px buttons bottom-left | 34 px, on a third row under the Shells |
| "Local demo" label | a 340×43 badge bottom-left | one quiet line, bottom centre (the label stays: the README's real/mock rule) |
| reading card inside a Shell | starts 120 px down | starts under the top row and uses the freed height |

Below 1320 px the quest pill moves to the right of the status and the toast goes under it; below 900 px the quest
hint and the hotbar labels hide (keys and icons stay).

What changed outside CSS: `log.js` has a collapsed state and an unread count (only under the skin), `signs.js` starts
closed under the skin, the pass button carries a long label (kept for screen readers) and a short one
(`hub.dock.passShort`, five locales).

Tests: `game/tests/wh-compact.test.mjs` (journal collapse and count, the classic fallback, the short label in every
locale, every CSS rule scoped to `body.wh-compact`). Checked in headless Chromium at 1684×934, 1280×720 (Russian) and
860×640, on the island, with the journal open, with Signs open and inside a Shell; console clean.

Open: touch tablets get this skin too (their layout is "desktop"); the 32 px Shell buttons have 44 px hit zones, but
the recap and Chronicle buttons are 34 px. The prompt pill can touch the reading card at 860 px wide (it did before).
