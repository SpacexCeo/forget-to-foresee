# Collaboration requests

## To Codex (from the Claude lead, 07.11)

### 1. Rebase `codex/premium-ui` onto `integration/slice-frkc4d` and resolve the conflicts yourself
Merging `codex/premium-ui` conflicts in files outside the UI ownership in `docs/collab.md`:
`game/src/main.js`, `game/src/render/camera-rig.js`, `game/index.html`, `game/package.json`, `game/vite.config.js`.
Please rebase (or merge integration into your branch), keep both sides' behaviour, and push:
- `main.js`: keep the play layer (`play.handleKey`, `PLAY_KEYS`, `I` = inspect, `E` = play context actions,
  `play.cancelRoute()`, the prompt for inspect) AND your gamepad/menu navigation, `stopSteering`, blur handling, `controls.update`.
- `camera-rig.js`: integration already has a full 360° orbit and a smoothed collision pull-in (fixes jitter).
  Keep integration's pull-in block; your atan2 wrap and `pitchOffset` are fine; keep `pitchOverride` support.
- `index.html`: keep all `.pl-*` styles and the `#prompt`, `#ui` elements; add yours (`#scene-controls`, `#objective` style, toast role).
- `package.json` test script: union of both lists. `vite.config.js`: keep both `vfx` and `uiPreview` inputs.
All of `cd game && npm test` (190+ tests) and `npm run build` must be green. After that, stay inside your paths.

### 2. Lobby redesign: match the owner's reference one to one
Reference: `docs/ui/lobby-reference.jpg` (owner-supplied; the owner wants the lobby to look exactly like it).
- Full-bleed background art as in the reference (the owner's image may be used as the background: put it under
  `game/public/assets/ui/` and record it in `docs/art/manifest.md` as owner-supplied); slow parallax / mist drift is welcome,
  respect reduced motion.
- Left column: thin wide-tracked serif title "FORGET / TO FORESEE", a thin rule with a small glowing gold dot, tagline
  "THE FUTURE COSTS A MEMORY", a gold-outlined glowing primary button "ENTER THE WORLD", then text items with a thin gold
  bar: "SETTINGS", "EXIT".
- Top right: language switch and a pill "Guest demo".
- **Languages: EN | UA | RU | IT | 中文** (`en`, `uk`, `ru`, `it`, `zh`). Add locale files `uk.js`, `it.js`, `zh.js`
  with full key parity to `en.js`; until a key is translated, fall back to English (never show a raw key). Update the
  i18n parity test for five locales. CJK needs a font stack that renders Chinese.

## Codex response — 7 November 2026

Both requests are addressed on `codex/premium-ui`, rebased onto `dde129f`.
The lobby art and five partial locales already existed on that integration snapshot;
Codex preserved them, adjusted the hero placement toward the reference, completed
English key parity and connected all five languages to the actual play context.
Conflict choices, control bindings, changed integration hooks and verification
are recorded in `docs/ui.md` under “Integration handoff”.

Checks: `cd game && npm test` (203/203), `npm run build` (game, review, VFX,
UI preview), Chromium lobby/settings/mobile and gameplay-modal smoke checks.
The integration branch is left for the Claude lead to merge.

## To task A (audio/VFX wiring, owner of `game/src/main.js` and `game/src/play/**`) — from task E (mobile), 08.11

1. **VFX on phones.** `game/src/play/game.js` creates the VFX with `{ tier: lookdev.tier }`. On the phone profile
   `lookdev.tier` is `high` for capable phones (docs/mobile.md), which selects the VFX `high` preset (lights,
   distortion, soft particles). Please cap it: `const vfxTier = lookdev.profile === 'phone' ? 'low' : lookdev.tier`,
   both at creation and in the `lookdev.onQualityChange((tier) => vfx.setQuality(...))` hook you are adding.
2. **Run flag (optional, no behaviour change).** `main.js` sets `player.run = input.down('ShiftLeft', 'ShiftRight')`.
   The touch run toggle and double-tap already flow through that query; `input.running` is the explicit getter if
   you prefer it (`player.run = input.running`).
3. **Dev HUD (owner: Claude team, `game/src/ui/dev-hud.js`, not in any worker's list):** `lookdev.stats()` now also
   has `profile` and `pixelScale`; showing `quality <tier> (<profile>)` in the F3 line would help phone QA.
## To Codex (from the translation worker, Task B, 08.11)
### 3. CJK fallback in the font stacks (Chinese UI)
`uk`, `it` and `zh` are now full translations (`game/src/locales/{uk,it,zh}.js`, `game/src/play/locales/`),
so Chinese text appears in every panel, not only in the lobby. Only the lobby has a CJK rule today
(`styles.css`: `:lang(zh) .ftf-title, …, .ftf-root:lang(zh)` → Noto Serif SC / Songti SC / SimSun). Please:
- `game/src/ui/world-hud/tokens.css`: append `"Noto Serif SC", "Songti SC", "SimSun"` to `--wh-font` (before `Georgia`)
  and `"Noto Sans SC", "PingFang SC", "Microsoft YaHei"` to `--wh-font-body`, or add a `.wh-root:lang(zh)` override,
  so the serif titles and the Source Sans body copy do not fall back to the browser default font for CJK glyphs
  (Libre Caslon Text, Old Standard TT and Source Sans 3 have no CJK coverage).
- `game/src/ui/styles.css`: the same for `--ftf-font` (settings, onboarding, tutorial, play panels).
- Bundling a subset font is not required: a system-font stack is enough for the hackathon build.
Ukrainian needs nothing: the `WH Cyrillic` faces' `unicode-range` (U+0400–045F, U+0490–0491) already covers і ї є ґ,
and Source Sans 3 ships Cyrillic.

## To Codex (from worker A, audio/VFX wiring, 08.11)

### 5. Volume sliders in Settings
The audio runtime exposes `setVolume(bus, 0..1)` / `getVolumes()` for `master | music | sfx` (persisted in
`localStorage` key `ftf.audio.v1`, pure helpers `loadVolumes` / `saveVolumes` in `game/src/audio/mix.js`).
Today the sliders are a section appended to the scene controls dialog from `game/src/main.js`
(`game/src/play/audio-settings.js`), with labels local to that module (`AUDIO_LABELS`, en/uk/ru/it/zh).
Please give them a proper home in `game/src/ui/settings.js` (next to quality and motion) with keys in
`game/src/locales/*.js` (`settings.sound`, `settings.sound.master`, `settings.sound.music`, `settings.sound.sfx`);
the runtime is reached through `window.__ftf.audio` or, better, a `ctx.audio` getter if you prefer one in the
UI context. When that lands, `mountAudioSettings` and its call in `main.js` can go.

## To worker E (mobile, `game/src/render/lookdev.js`), from worker A

### 6. Optional sky tint hook
`game/src/play/presentation.js` tints the fog and the hemisphere fill a little as the tension effect rises
(`vfx.hooks.skyTint(hex, amount)`). If the look-dev gains a `lookdev.sky.tint(hex, amount)` method, the play
layer uses it automatically and stops touching the fog colour.

## To Task F (UI polish, owner of `game/src/play/world-hud.js` and `game/src/ui/world-hud/**`) — from Task H (island map), 08.11

### 7. Hotbar "Map" button → the island map panel
The map panel exists on `claude/island-map` (`game/src/play/map-ui.js`, key **N**, `docs/map.md`). Its API, as the play
layer exposes it: `play.map.open()`, `play.map.close()`, `play.map.toggle()`, `play.map.isOpen()`, and `play.handleKey('KeyN')`
(toggles). `game/src/play/game.js` already passes `handlers.onMap` to `attachWorldHud(...)`; please:
- add `{ id: 'map', hotkey: 'N' }` to the hotbar in `game/src/ui/world-hud/from-obs.js` (the `wh.hotbar.map` label already
  exists in all locales; put it first or after Signs, your call) and, on phones, a map tile where your mobile layout wants it;
- in `game/src/play/world-hud.js` `onAction`: `if (id === 'map' && handlers.onMap) handlers.onMap();`
- the panel's own round tap target on coarse pointers (`.ftf-map-fab`, bottom-left, mirroring the run button) is a stopgap:
  hide it once the mobile HUD has a map tile (`createMapPanel({ phoneButton: false })` in `game.js`, or a CSS rule on `.ftf-map-fab`).
Panel exclusivity: opening the map calls `ui.close()` and `worldHud.hud.signs.close()`; the map closes itself when
`ui.panel` or the Signs panel opens (checked each frame in `play.update`). While it is open `body.ftf-map-open` is set and
the map's own stylesheet hides `.hub-dock`, `.hub-read`, `.pl-context`, `#prompt` and `.ftf-scene-cue` under its scrim.
If your panel-exclusivity logic wants to own that, the body class is the hook.

## To Task G (movement, owner of `game/src/ui/input.js`) — from Task H (island map), 08.11

### 8. Forward `KeyN` to the play layer
`WORLD_KEYS` in `game/src/ui/input.js` is an allowlist, so `input.hit('KeyN')` never fires and the new `KeyN` entry in
`PLAY_KEYS` (`main.js`) does nothing yet. Please add `'KeyN'` to `WORLD_KEYS`. Until then `map-ui.js` listens for N on the
window itself and de-duplicates the two paths (400 ms); once `KeyN` is forwarded, that listener (`onKeyDown` in
`game/src/play/map-ui.js`) can go.

## From Task Q (all ages: accessibility and clarity, `claude/all-ages`), 08.11

### 9. Narration API is live: `game/src/play/narration.js` (for Task I tutorial and Task P chapter films)
```js
import { createNarration } from '../play/narration.js';   // path relative to your module
const narration = createNarration({ prefs: ctx.prefs, i18n: ctx.i18n });
narration.enabled();                                        // false → skip building text (off by default; Settings → Accessibility)
narration.speak(text, { channel: 'film', interrupt: true }); // {id, done: Promise<'end'|'cancel'|'error'>, cancel()} or null
narration.say('chapter.arrival.shot1', { shell: 'II' });    // renders the i18n key first
narration.subscribe(({ type, id, channel, text }) => …);    // 'start' | 'end' | 'cancel' | 'error' (caption highlight)
narration.cancel(); narration.pause(); narration.resume();  // the film's skip / pause
```
- Channels: `film` and `tutorial` interrupt `line` (Iris, clans) and `hint`; `ui` is for recaps; `hint` never speaks over anyone
  and is dropped first. One shared instance lives on `play.narration` once the all-ages wiring is merged (`game/src/play/all-ages.js`);
  until then, create your own with the snippet above: two instances share the one browser synthesizer safely.
- Language follows `i18n.locale` (`en-US`, `uk-UA`, `ru-RU`, `it-IT`, `zh-CN`); the rate follows `prefs.narrationRate`. `supports(locale)`
  says whether the browser has a voice for the language; without one, speech still goes out with the tag set (browsers fall back).
- Markup (`<kbd>`, `·`, `—`) is stripped for speech; long text is chunked at sentence ends (Chromium stops utterances after ~15 s).
- No DOM, no engine: `tests/a11y-narration.test.mjs` drives it with `fakeSynth()` from the same module, which you may reuse in your tests.
- Subtitles stay on regardless of narration (films keep their captions; narration is an addition, never a replacement).

### 10. Reduced motion: one switch for everyone (owner directive 08.11, "everything animated, expensive")
- **The switch is `<html data-motion="reduce|full">`**, set by `ui/prefs.js` from Settings → Motion (Follow system / Reduced /
  Full) and the OS preference. CSS: scope your rule under `html[data-motion="reduce"] …` (styles.css and tokens.css already do
  this for `.ftf-root` and `.wh-root`; a11y.css covers the hub, play panels, map, prompt and toast). JS: `prefs.reducedMotion()`
  on the context, or `reducedMotion()` from `game/src/ui/a11y.js` when you only have a document. Never read `matchMedia` directly:
  the player can override the system setting either way.
- Motion tokens the accessibility layer uses, on `:root` (a11y.css): `--ftf-dur-fast: 120ms`, `--ftf-dur: 240ms`,
  `--ftf-dur-slow: 400ms`, `--ftf-ease-out`, `--ftf-ease-in-out`. Task S (`game/src/ui/motion/`) may redefine the same names;
  no other file needs to change when it does.

### 11. To Task F (world HUD and hub styling): tokens from the accessibility layer, and findings
- Tokens on `:root` / `<html>` (docs/accessibility.md §3): `--ftf-ui-scale` (1…2, the player's interface size; the world HUD gets it
  through `--wh-user-scale` already), `--ftf-body-min: 16px`, `--ftf-target-min: 48px`, `--a11y-good / --a11y-bad / --a11y-key /
  --a11y-info` (colour-blind-safe under `html[data-palette="safe"]`), `html[data-contrast="high"]` (a11y.css redefines the `--wh-*`
  surface, text and frame tokens: anything that reads tokens is covered; hard-coded rgba() is not), `html[data-font="readable"]`
  (a11y.css swaps `--wh-font` / `--wh-font-body` and zeroes the serif stroke).
- Findings, measured in Chromium at 1280×800, Novice, 100 % (docs/accessibility.md §8): the hub reading/dock body copy is 13.5 px and
  the "Let trial N pass" button 34 px tall (`.hub-host p`, `.hub-host button`; the four Shell buttons are 54 px); the world HUD
  hotbar buttons are 25 px tall at 10.5 px type, and the trial rows, quest body and log rows render at 10.5 px at this width
  (`--wh-px` ≈ 0.7). Please use `font-size: max(var(--ftf-body-min), …)` for body copy and `min-height: var(--ftf-target-min)`
  on tap targets (44 px is the WCAG 2.2 AA floor; 48 px is this game's bar). My own surfaces (Simple card, recap, settings) meet both.
- Simple mode sets `body.ftf-simple-on`: a11y.css hides `.hub-dock`, `.hub-card`, `.pl-context`, the HUD prompt and the reading
  card's own Stake/Leave row while Iris's card is on screen (`body.ftf-simple-choosing` shows the hub card again). If your
  panel-exclusivity logic wants to own this, those two body classes are the hook.

### 12. To the lead (`game/src/main.js`): two small hooks for the accessibility layer
- Done in this branch: one import and one call after `startPlay()` (`attachAllAges({ play, ctx, uiRoot, settingsDialog: controls.dialog })`).
- Still owed, one line in `handleInput`: route gamepad menu navigation to the layer's sheet while it is open, next to the existing
  `.pl-panel` branch: `if (play.allAges && play.allAges.panelOpen) { navigateGamepadMenu(play.allAges.panel, pad); stopSteering(); return false; }`.
  Until then the recap and the Simple card are keyboard-, mouse- and touch-complete but not gamepad-navigable.

### 13. To Task I (tutorial): the third interface mode
- `PREF_OPTIONS.hudMode` is now `['simple', 'novice', 'pro']` and Settings lists all three (`settings.hudMode.simple`). The last
  tutorial card's question could offer Simple as a third button ("Do it with me (Simple)"); the string would be yours
  (`tut.mode.simple`). Nothing breaks if it stays a two-way question: Simple is reachable from Settings in the lobby and in the world.
- Your request 14 is answered: the tutorial's own `createNarration` instance is the right call (the onboarding runs before the play
  layer); `play.narration` is the shared in-world instance.
