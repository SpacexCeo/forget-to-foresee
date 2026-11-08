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

## To the lead (play layer, `game/src/play/game.js`), from worker G / Task N (living NPCs, 08.11)

### 7. Two one-line hooks for the living agents
In `startPlay`, after `const agents = new ClanAgents(...)`:
- `agents.onSay = (l) => { if (worldHud) worldHud.say(l); };` lets a meeting's first beat and a contribution's line
  appear in the dialogue strip at the moment the agents actually meet or reach the Scroll (keys already exist:
  `line.walk.silk`, `line.mend`, `line.fragment`, `line.pact`, `line.escrow`). Without it the beats are silent.
- In `session.on('event', …)`: `agents.event(ev, state.now);` gives the director the public events a few seconds
  before the next observation and enables the "everyone looks up at the Shell of a reveal" moment (`fx.event`).
  Without it the director still works from observation diffs (contributions, silk transfers, mends, auctions, vote).

## To Task F (nameplates in `game/src/play/agents.js`), from worker G / Task N

### 8. The mind glyph sprite is floating text in the world
`MindSprite` (name, trust arc, glyph, label above each agent) is the kind of floating text the owner and Task H want
out of the 3D view. The agents now show their state in the body (look-at, gestures, errands, meetings), so the
sprite can become a small glyph disc that fades with distance, or the info can move to the HUD.
