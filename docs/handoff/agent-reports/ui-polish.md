# Report: Task F, UI polish ("this looks cheap"), 08.11.2026

Branch `claude/ui-polish` (contains `claude/loving-curie-ihasft` as of the last merge; see the branch log). Not merged;
no pull request (the lead merges). Full write-up with before/after screenshots: `docs/ui-polish.md`.

## What was done

1. **Reproduced the owner's screenshots** in headless Chromium (SwiftShader) at 1280×800, 390×844 and 1920×1080 on
   `/?demo=judge&play=direct`: Memories over Signs & Visions with the sign cards reading through, the Shell dock over
   both, cramped buttons (hotbar 25 px tall with 9.5 px labels; "Forget it for a vision" 30 px; the MAIN QUEST pill
   12 px tall with 7 px text touching the border), the canvas-sprite nameplate, a stray "null" line in Memories.
2. **One surface at a time** (`game/src/play/panels.js`, pure): the play panels, help, the Signs & Visions panel, the
   island map (task H) and the hub decision card share one arbiter per overlay root; opening one closes the other.
   Modal surfaces set `body.pl-modal-open`: the Shell dock and the reading card are not rendered, the phone HUD stack,
   run toggle and map button hide. The desktop Signs panel is not modal (read the signs, then pick the Shell): it stays
   beside the dock and `body.hub-dock-on` caps its height.
3. **Reserved regions, no overlaps** (`docs/ui-polish.md` §2.4): the dialogue strip one row above the hotbar, capped at
   the dock's column (long lines wrap) and centred in the free band when a right-column panel or the reading card is
   open; the context menu one row above it; the hub dock 12 px above the hotbar; help in the right panel column; the
   inspect hint and the transient row (hub status / info flash / greybox toast) under the quest banner; the map a
   centred modal that hides the centre column and stops above the hotbar. `npm run hud:overlap`
   (`game/scripts/hud-overlap.mjs`) walks 12 states at seven viewports in five locales and fails on any intersecting
   pair of visible HUD boxes; it also collects console errors and warnings.
4. **Spacing and type**: 4/8/12/16/24, radii 10/14/16/999, 40 px targets on desktop and 48 px on phones, hover /
   pressed / focus / disabled states, px floors on every world HUD type role (mockup numbers unchanged at 1811),
   opaque modal panels on a solid base (the phone blur was off, so the HUD read through).
5. **Nameplates**: screen-space DOM plates (`game/src/play/nameplate.js`, pure + `agents.js`), proximity only (within
   7 m of Iris, fading over the last 2 m), never under a HUD box, 64 px clear of the viewport edge, hidden inside a
   Shell. No world sprite is left for them.
6. **Short viewports (owner, top priority; in-app browsers)** (§2.5): the visible height is measured
   (`visualViewport.height` → `--vvh`, `html[data-vh]` = tall / short < 620 / tiny < 500); the phone stack compacts by
   tier (one-line quest card with an expand chevron, one-row trial card, 52/44 px tiles, 40/36 px prompt, one-line
   dialogue bar, slim five-cell Shell dock, sheets and panels sized by `--vvh`, the run toggle and map button in the
   top-bar row); `#ui` is as tall as the visible viewport; every control keeps a 44 px hit zone; the in-app UA is a hint
   only. Tested at 390×560, 375×500, 360×480 and 667×300.
7. **Motion** (§2.6): panels, context menu, info flash, hub boxes, list rows, sign cards, the newest log row, quest text,
   trial numbers (tick-ups) and nameplates animate at 120–400 ms with eased curves and staggers; reduced motion keeps
   cross-fades only. Timings are CSS variables (`--pl-dur-*`, `--wh-dur-*`) until Task S's tokens land.
8. **Requests and QA**: hotbar "Map · N" and the map under the one-panel rule (task H, collab requests 7/8); the NEAR
   testnet badge after the Verified pill (request 9: `createNearWatcher` in `play/world-hud.js`, `near.leafBadge(index)`
   on resolved cards, a link pill in `signs.js`); QA-003 (one Heir prompt; the Biography names the chosen outcome),
   QA-004 ("null" lines), QA-011 (compact dock on short phones), QA-014 (dock hidden under modals).
9. **Tests**: `game/tests/ui-polish.test.mjs` (17 tests: exclusivity and modality, nameplate maths and HUD avoidance,
   the stylesheet rules, the NEAR badge plumbing, the viewport tiers and UA hint). Docs: `docs/ui-polish.md`,
   decisions rows, collab requests 7 and 8 and the reply to H, this report.

## Next steps (wrap-up ordered by the owner at the token freeze)

1. Done (continuation worker, 08.11): `npm run hud:overlap -- --viewports 1280x800 --langs uk,ru,it,zh` is green,
   0 overlaps in 48 states. QA-031 fixed (815eca5): the Chronicle fab and the map host borrow `.wh-root`, whose
   `position: absolute; inset: 0; pointer-events: none` (tokens.css) won when Vite injected it after their styles on
   the lobby path, so the fab sat at the top-left corner over the trial card; their base rules now double the class.
   QA-005: the code already opens the HUD Signs & Visions panel after a vision sacrifice (1cf03e9, after the QA build
   6f2f288); verified in Chromium (hub and walk), README step 6 matches, wiring pinned by a test (f929e88).
2. Re-shoot the "after" frames at 1280×800, 390×844 and 1920×1080 for `docs/ui-polish.md` §3 (the committed ones
   predate the motion pass) with the script in this report.
3. QA retest by worker K on the merged branch: QA-003/004/005/006/009/011/012/014/019/021 are fixed in code.
4. Task T's "Copy proof" pill (slot described in `docs/collab-requests.md`), a phone map tile, nameplate occlusion.

## What was not done

- Occlusion for nameplates (DOM has no depth; a raycast every few frames would hide a plate behind a wall).
- A phone map tile in the HUD tile row (the map's own `.ftf-map-fab` stays, now in the top-bar row on short screens).
- Task S's shared motion tokens: not announced yet; the timings are variables ready to switch.
- The motion pass does not touch the lobby, onboarding or settings (Codex / task I files).
- See "Checks" for which viewport × locale combinations the overlap check covered.

## Checks

- `cd game && npm test`: 485/485 at `HEAD` (after the merge of claude/loving-curie-ihasft); `npm run build`: green.
- `npm run hud:overlap`: results per viewport and locale are in `docs/ui-polish.md` §3 (table "Overlap check").
- Headless Chromium screenshots before/after at 1280×800, 1920×1080, 390×844 and the four short sizes, committed under
  `docs/ui-polish/` and embedded in `docs/ui-polish.md`; console errors and warnings in every run: 0 (GL driver chatter
  from SwiftShader excluded).

## Files touched

New: `game/src/play/panels.js`, `game/src/play/nameplate.js`, `game/scripts/hud-overlap.mjs`,
`game/tests/ui-polish.test.mjs`, `docs/ui-polish.md`, `docs/ui-polish/*.jpg`, this report. Edited: `game/src/play/ui.js`,
`hub-ui.js`, `world-hud.js`, `agents.js` (nameplate code only), `game.js` (agents.update arguments, the map's arbiter
claim), `game/index.html` (`.pl-*` rules, overlay height, stacking), `game/src/ui/world-hud/{index.js, status.js,
signs.js, from-obs.js, tokens.css, status.css, actions.css, signs.css, log.css}`, `game/package.json` (test and
`hud:overlap` scripts), `docs/decisions.md`, `docs/collab-requests.md`.

## The screenshot and check procedure

```bash
cd game && npm run dev -- --host 127.0.0.1 --port 5173 &
npm run hud:overlap                       # all seven viewports, five locales, 12 states; exit 1 on any overlap
npm run hud:overlap -- --viewports 390x560,667x300 --langs en,uk --shots all --out .scratch/overlap/short
```

SwiftShader renders at a few FPS: the scripts drive the UI through `window.__ftf.play.handleKey(...)` and teleports,
wait 2 s after each key, treat a closing panel (`data-open="false"`) as hidden while its 160 ms transition drags, and
replay a state once when the tab reloads. Do not edit files under `game/` while a run is on: Vite reloads the page and
the run is invalid.
