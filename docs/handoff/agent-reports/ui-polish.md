# Report: Task F, UI polish ("this looks cheap"), 08.11.2026

Branch `claude/ui-polish` (base: `claude/loving-curie-ihasft` at `832ff68`, which contains `main`). Not merged; no pull
request (the lead merges). Full write-up with before/after screenshots: `docs/ui-polish.md`.

## What was done

1. **Reproduced the owner's screenshots** in headless Chromium (SwiftShader) at 1280×800, 390×844 and 1920×1080 on
   `/?demo=judge&play=direct`: <kbd>V</kbd> then <kbd>M</kbd> showed Memories over Signs & Visions with the sign cards
   reading through, the Shell dock over both, cramped buttons (hotbar 25 px tall, 9.5 px labels; "Forget it for a
   vision" 30 px; the MAIN QUEST pill 12 px tall with 7 px text touching the border), the canvas-sprite nameplate, and a
   stray "null" line in the Memories panel.
2. **Panel exclusivity** (`game/src/play/panels.js`, new, pure): one arbiter per overlay root shared by the play UI, the
   world HUD and the hub UI. Play panels, help, the Signs panel and the hub decision card are exclusive; modal ones set
   `body.pl-modal-open`, under which the hub dock and the reading card are not rendered (and the phone run toggle
   hides). The desktop Signs panel is not modal: it stays beside the dock and `body.hub-dock-on` caps its height so it
   never reaches the dock's corner (read the signs, then pick the Shell).
3. **Spacing and type scale**: 4/8/12/16/24 spacing, radii 10/14/16/999, 40 px targets on desktop and 48 px on phones,
   hover / pressed / focus / disabled states, across `index.html` (`.pl-*`), `hub-ui.js` (`.hub-*`) and the world HUD
   (`tokens.css`, `status.css`, `actions.css`, `signs.css`). Every `--wh-fs-*` role has a px floor (body 12, labels 11,
   titles 15–18); the mockup numbers are untouched at the 1811 reference.
4. **Opaque modal surfaces**: play panels use the HUD gradient on a solid base, hairline frame, Caslon titles and
   Source Sans body. On the low tier (phones) the backdrop blur was off, which is why the HUD cards read through the
   Memories panel; the solid base fixes it and the blur is gone.
5. **Nameplates** (`game/src/play/nameplate.js`, new, pure + DOM plates in `agents.js`): screen-space pills projected
   from the head point each frame, 30 → 60 m fade, 64 px safe band from the viewport edges, hidden inside a Shell, drawn
   under every HUD panel. The `THREE.Sprite` canvas is gone. `game.js` passes `camera` and `uiRoot` into
   `agents.update(...)` (one argument; the only edit outside the task's paths).
6. **Tests**: `game/tests/ui-polish.test.mjs`, 12 tests (exclusivity, modality, re-claims, throwing close handlers,
   the shared-arbiter body class, nameplate opacity / scale / projection / placement, stylesheet rules: targets,
   radii, opaque panel gradient, dock rules, type floors, no sprite left, hidden plates render nothing).
7. **Docs**: `docs/ui-polish.md` (audit, rules, before/after, re-check procedure, open items), a decisions row,
   collab request 7 to Codex (owner override of `game/src/ui/**` for this polish), this report.

## What was not done

- No occlusion test for nameplates: a plate can show over scenery that hides the agent (DOM has no depth). A raycast
  every few frames would fix it; not added to keep phones cheap.
- The greybox labels "Camp: Frost · not final art" / "Memory shard · not final art" (`game/src/render/greybox.js`,
  not in this task's paths) still float in the scene in `?mode=walk` and look like the debug label the owner disliked.
  Lead's call.
- Audit of every locale at 390 px: EN, UK and IT were screenshotted at 1280 and EN at 390 and 1920; RU and ZH only
  through the shared layout rules (the longest strings are UK and IT).
- `docs/HANDOFF.md` was not edited (no row of this task there; the lead may add one from this report).

## How it was checked

- `cd game && npm test`: 304/304 (292 before plus 12 new). `npm run build`: green.
- Headless Chromium runs (script below) on EN 1280×800, 390×844, 1920×1080 and UK/IT 1280×800: 0 console errors in every
  run; measured boxes: after <kbd>V</kbd> then <kbd>M</kbd> the Signs panel is closed, the Memories panel is the only
  panel, and the hub dock is not in the DOM (1280: panel 762,120 502×550; 390: panel 8,295 374×503 with scrim).
- Before/after JPEGs are committed under `docs/ui-polish/` and embedded in `docs/ui-polish.md`.

## Files touched

New: `game/src/play/panels.js`, `game/src/play/nameplate.js`, `game/tests/ui-polish.test.mjs`, `docs/ui-polish.md`,
`docs/ui-polish/*.jpg`, this report. Edited: `game/src/play/ui.js`, `hub-ui.js`, `world-hud.js`, `agents.js` (nameplate
code only: the `MindSprite` class became `Nameplate` + `placePlate()`; `play()`, `procedural()`, `updateIris()` untouched
for task G), `game/src/play/game.js` (one argument), `game/index.html` (`.pl-*` rules and the stacking comment),
`game/src/ui/world-hud/{tokens,status,actions,signs}.css`, `game/package.json` (test list), `docs/decisions.md` (one
row at the end of §4), `docs/collab-requests.md` (request 7).

## The screenshot script (Playwright with the pre-installed Chromium)

```js
// node shoot.mjs <outDir> <tag> <lang> <WxH,...> [states 1,2,3,4]; Vite on 127.0.0.1:5173
import pw from 'playwright'; const { chromium } = pw;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5173/?demo=judge&play=direct', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ftf?.play?.session?.obs, null, { timeout: 180000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: '1-world.jpg', type: 'jpeg', quality: 72, timeout: 240000 });
await page.evaluate(() => window.__ftf.play.handleKey('KeyV')); await page.waitForTimeout(1500);  // keys, not clicks: SwiftShader runs at a few FPS
await page.screenshot({ path: '2-signs.jpg', type: 'jpeg', quality: 72, timeout: 240000 });
await page.evaluate(() => window.__ftf.play.handleKey('KeyM')); await page.waitForTimeout(1500);
await page.screenshot({ path: '3-signs-memories.jpg', type: 'jpeg', quality: 72, timeout: 240000 });
// nameplate: ?mode=walk, then stand 2.2 m in front of Frost
await page.goto('http://127.0.0.1:5173/?demo=judge&play=direct&mode=walk', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ftf?.play?.session?.obs, null, { timeout: 180000 });
await page.evaluate(() => { const a = window.__ftf.play.agents.agents.get('frost'), p = window.__ftf.player, y = a.root.rotation.y;
  p.pos[0] = a.root.position.x + Math.sin(y) * 2.2; p.pos[2] = a.root.position.z + Math.cos(y) * 2.2; });
await page.waitForTimeout(2500);
await page.screenshot({ path: '4-nameplate.jpg', type: 'jpeg', quality: 72, timeout: 240000 });
```

At 1920 wide SwiftShader drops the tab after a screenshot or two; the full script reloads and replays the keys when
`window.__ftf` is gone.
