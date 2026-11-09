# Phone HUD: Exploration and Command (`game/src/ui/world-hud/mobile.js`)

Owner brief, 09.11.2026: "redesign the mobile game HUD into a compact, premium, touch-first interface … do not
simply scale down the desktop UI", plus the owner's own split into two mobile modes. This file is the spec of
what was built; `docs/ui-world-hud.md` §7 (the earlier phone stack copied from the mockup) is superseded on
phones by this layout and stays only as the package-level reference for `status.js`, `log.js` and `actions.js`,
which still render it when mounted with `layout: 'mobile'` directly (unit tests, `hud-preview.html`).

## 1. Two modes

| Mode | What is on screen | How you get there |
|---|---|---|
| **Exploration** (default) | the 3D world; a slim top status bar (menu · "Trial n/17" with an 8-cell bar and % · Silk · Attention); the Shell selector I–IV under it; at the bottom one objective line, Iris's line only while she speaks, the contextual gold prompt only while an action exists; the bottom navigation | start of play; closing any sheet; a second tap on the open nav item; Escape |
| **Command** | a bottom sheet over the dimmed world (quests and Shells · journal · Signs and Visions · Memories · the map), the navigation still visible so the player moves between sheets without walking; the top bar stays, the world-facing stack hides | a nav item; the status bar (opens Quests); a Shell row in the Quests sheet flies and returns to Exploration |

`body.wh-m-command` is set while a Command sheet is open; `body.wh-m-card` while a decision card or the end
panel (true modals) is open, which hides the navigation and the Shell selector too. `.wh-m[data-mode]` carries the
mode on the HUD root for styling and tests.

The player never has to move the character to act: every verb of the Shell-first design is a tap away (fly into
a Shell, read and stake inside it, let a trial pass, answer a card, open Memories, Signs, the map, the journal).
Walking stays available (tap the ground) for the plaza and camp scenes.

## 2. Layout (CSS px; 390 wide portrait, measured visible height `--vvh`)

| Element | Class | Box | Notes |
|---|---|---|---|
| menu | `.wh-m-menu` | 44×44 at (12, safe-top + 8) | `onAction('top','menu')` → the settings / pause menu |
| status bar | `.wh-m-status` | the rest of the row, height 44 | `wh.trial.titleShort` + 8-cell bar + `%` · `✦ silk` · `⚑ attention`; attention appears with Novice layer L1 or in Pro (`showsAttention`). Tap opens the Quests sheet |
| Shell selector | `.wh-m-shells` | centred pill row under the top bar, 4 × 52×40 | `.wh-m-shell--wait` (a sign waits: gold ring, dot), `--quiet`, `--here` (inside that Shell, `aria-current="location"`); tap → `onAction('shell', n)`; disabled while the hub is busy or inside another Shell. Hidden without a hub (walk mode) or outside play |
| prompt | `.wh-m-prompt` | centred pill ≥ 44 high above the objective | only when `model.prompt.visible`; the key cap hides on coarse pointers |
| objective | `.wh-m-objective` | full-width card, head 46 high | tag + one-line title + chevron; tap expands the body in place (`grid-template-rows` 0fr → 1fr, 200 ms) with the full text and **Take me there** (`onAction('quest')`) |
| Iris | `.wh-m-iris` | full-width bar, 46 high | hidden while her line is the idle line (`irisVisible`); tap expands the full line and up to three replies; a question opens itself |
| navigation | `.wh-m-nav` | full width, 52 high, 6 above the safe area | Quests · Signs · Memories (once the hotbar has it, i.e. Novice L1) · Map (when wired) · Journal (unread dot); `aria-pressed` on the open one |
| own sheets | `.wh-m-sheet` | 6 px side gutter, bottom = nav + 6, max 66 % of `--vvh` | `role="dialog" aria-modal`, handle, title, close; scrim behind; `translateY` 220 ms; focus moves to the close button (with `preventScroll`) and returns to the opener |
| Signs sheet | `.wh-sheet` (signs.js) | restyled to the same box | `onAction('tile','signs')`; the orchestrator highlights the nav item |
| Memories, help, context menu, hub reading card, map | play layer / hub | re-anchored by `body.wh-mobile …` rules in `mobile.css` to the same bottom box; the map keeps its full-screen panel and stops above the nav |
| run toggle, Chronicle fab, recap `?` | input.js / chapters / all-ages | the run toggle sits mid-right (thumb height) and hides under any sheet; the two fabs join the Shell-selector row (recap left, Chronicle right); the map's own fab is gone (the nav has Map) |

Touch targets: 44 px minimum everywhere (an invisible `::before` pads anything drawn smaller); 48 on phones for
the hub's own buttons. Safe areas: `env(safe-area-inset-*)` on the top row, the nav and the side gutters.

### Short visible heights (`html[data-vh]`, index.js)

| Tier | Changes |
|---|---|
| short (< 620) | top bar 40, Shell pills 36, nav 50 with icons only, sheets up to 72 % |
| tiny (< 500) | top bar 38, pills 34, nav 46, the % row and Iris's bar leave, sheets fill the height minus the top row |

### Landscape phones (`orientation: landscape` and `max-height: 500px`)

The navigation becomes a 64 px rail on the right; the top bar and the Shell selector stop before it; the
objective and Iris stay bottom-left (max 420 wide); every sheet (own, Signs, Memories, the reading card) slides in
from the right as a 62 vw / 440 px panel the full height. `MOBILE_QUERY` in `index.js` is
`(max-width: 700px), ((pointer: coarse) and (max-height: 500px))`, so an 844×390 phone gets this layout rather
than the desktop HUD; `.wh-root[data-layout="mobile"]` pins `--wh-px: 1px` for that case.

## 3. Visual language

The shared tokens (`tokens.css`): charcoal panel gradient with 8 px blur, hairlines `rgba(226,214,186,.34)` /
`.6`, gold `#e4c272` only on the active Shell, the active nav item, the prompt ring and the tag; Libre Caslon
for titles and numerals, Source Sans for labels; radii 14 (top row), 16 (cards), 18 (nav), 22 (sheets), 999
(pills). No glow beyond the prompt pill's 10 px halo and the waiting Shell's 10 px ring. Transitions 150–250 ms
through `--wh-dur` / `--wh-ease-out`; none under `prefers-reduced-motion` or `html[data-motion="reduce"]`.

## 4. Wiring

- `index.js` mounts `mountMobileHud` + `mountSigns` for `layout: 'mobile'` (the four desktop packages otherwise),
  toggles `body.wh-mobile`, exposes `api.mobile`, and rebuilds the set when the media query flips.
- `from-obs.js` takes `hub` ({shells, inShell, shell, busy, canPass}) and puts a signed `model.hub` on the model.
- `play/world-hud.js` builds that from `play/hub.js` (`openSignsByShell`), routes `shell` → `handlers.onFly(n)`,
  `pass` → `handlers.onPass()`, `sheetOpen/sheetClose` → the panel arbiter (`m-quests`, `m-log`, modal), and mirrors
  the arbiter's state into the nav highlight and the body classes (`syncCommand`). `?layout=mobile|desktop` forces
  the layout for QA on a desktop.
- `play/game.js` passes the hub and the fly / pass handlers.
- Keys are unchanged (tablets with keyboards): V, M, N, T, H, Esc; Escape also closes an own sheet.

## 5. Tests and QA

- `tests/wh-mobile.test.mjs` (mini DOM, en + ru): Exploration render, Shell selector states and taps, objective
  expand and go, the Quests sheet as Command (nav highlight, Shells, pass, Escape, focus), the Journal tabs, host
  surfaces through `setActive`, in-place patches (prompt, idle Iris, inside a Shell, attention by layer), the
  orchestrator's layout switch; every new `wh.m.*` key exists in all five locales.
- `npm run hud:overlap` lists the new leaf boxes (`.wh-m-*`); re-run it with the dev server up before a release.
- Manual: `?play=direct&profile=phone&demo=judge` at 390×844, 390×560 and 844×390 (`&layout=mobile` on a desktop
  window), both languages, open each sheet, fly into Shell I, stake, leave, let a trial pass.

## 6. Not done / open

- The nav has no "Agents" item from the owner's mockup: the game has no deployable agents today (the clans act on
  their own); the Memories panel and the Quests sheet cover what a player does. Add it when the feature exists.
- The Chronicle fab and the recap `?` are repositioned, not redesigned; they could join the menu sheet later.
- A swipe-down gesture on the sheet handle is not implemented (tap the scrim, the close button, the nav item again,
  or Escape); the handle is decorative.
- The pixel-parity script `npm run wh:compare` still targets the mockup stack; it does not cover this layout.
