# audio-vfx-wiring: report (Task A, branch `claude/audio-vfx-wiring`)

Worker A of four parallel workers (08.11.2026). Paths owned: `game/src/audio/**`, `game/src/vfx/**`,
`game/src/play/hooks.js`, `game/src/play/game.js`, `game/src/main.js`, new files under `game/src/play/`,
`game/tests/client/audio*.mjs`, `game/tests/client/vfx*.mjs`, `docs/audio.md`, `docs/vfx.md`.

## 1. Audit: the gap before this task (state of `main` at `cc6d9e2`)

What already ran (`game/src/play/game.js`, `game/src/play/hooks.js`):
- `createVfx` and `createAudio` lazy-loaded; audio unlocked on the first key or pointer.
- `audio.setListener(camera, focus)` every frame (`Hooks.update`), `audio.setTension(obs.season.tension)` on
  every observation, `audio.speakStrokes` for the sign the Guest draws while Iris stands inside, `audio.setZone`
  from the current hotspot (camp / plaza / bridge / shell).
- `vfx.update(dt)` every frame before `lookdev.render()`.
- Room events → cues (`cuesForEvent`); 11 cues mapped to VFX, 18 to sounds.

Missing against the integration sections of `docs/audio.md` and `docs/vfx.md`:

| # | Gap | Doc line |
|---|---|---|
| A1 | No `amb_shell_hum` loops: the four Shells were silent | audio.md "one per Shell with `pos`" |
| A2 | No footsteps at all (Iris or the clan agents); surfaces never classified | audio.md `step_*` groups |
| A3 | `ui_click` never played; `ui_confirm` only on two world events, not on the player's own confirmed commands | audio.md `ui_*` |
| A4 | No volume controls anywhere (the runtime has `setVolume` and persistence) | audio.md `setVolume` |
| A5 | Zone from the hotspot, not from `zoneAt(position)`: the balcony never got its wind level; a camp bed only inside the hotspot radius | audio.md `setZone(zoneAt(...))` |
| A6 | Step and UI sounds were not preloaded, so the first one of each variant was dropped by the 300 ms late rule | audio.md `preload` |
| V1 | `vfx.attachToComposer` never called: no soft particles, no vision distortion, no tension grade on any tier | vfx.md integration lines |
| V2 | `vfx.setQuality` never called after a tier change (the auto governor or settings); `setReducedMotion` set once at start only | vfx.md |
| V3 | `shell_mist` played once at Iris's feet on Shell entry instead of looping under each Shell with `follow` | vfx.md `shell_mist` |
| V4 | `shell_crack_pulse` never played (Shell IV) | vfx.md |
| V5 | `tension` singleton only triggered by the crisis / Shells-leave events at a fixed point, never driven by the season tension level; `hooks.skyTint` unset | vfx.md `tension`, `hooks.skyTint` |
| V6 | `logogram` effect never used; the glass sign was the 2D canvas only | vfx.md `logogram` |
| V7 | `vote_finale` played with default beam sources (they happen to equal `layout.js` CAMPS) and no target | vfx.md `vote_finale` |
| V8 | A tier change rebuilds the post stack, and `PostStack.dispose` calls `dispose()` on every pass: the `VfxPass` would lose its render target and material when re-attached | render/post.js + vfx/post.js |
| C1 | 12 of 29 cue names (`reveal_silence`, `reveal_call`, `fragment_dark`, `link_break`, `pact`, `escrow`, `silk_transfer`, `shell_exit`, `talk`, `crisis` audio, `vision` VFX, `double_ring` VFX intent) had no mapping and no "intentionally silent" note | worker-tasks.md step 4 |

Not a gap (checked): `vfx.update` runs before `lookdev.render()`; the listener sits at Iris's chest with the
camera's orientation; `speakStrokes` follows the sign's reading order; a missing or throwing module never
breaks the game (`Hooks.play` guards every call).

## 2. What was done (commits on `claude/audio-vfx-wiring`, in order)

1. **Report with the audit** (section 1).
2. **Audio runtime** (`game/src/audio/audio.js`): `setShellHums(positions)` creates one positional `amb_shell_hum`
   loop per Shell (queued until unlock) and follows the zone level (`zoneMix(zone).hum`: 1 on the plaza and
   bridges, 0.8 at a camp, 0 inside a Shell); `preload(names)` expands a group name into every variant.
   **VFX pass** (`game/src/vfx/post.js`, `index.js`): `VfxPass.dispose()` is a no-op (the look-dev post stack
   disposes every pass when it rebuilds on a tier change); `release()` does the real disposal from `vfx.dispose()`.
3. **Cue table** (`game/src/play/hooks.js`): every name in `CUE_NAMES` is mapped in `VFX_MAP` and/or `AUDIO_MAP` or
   listed in `SILENT_CUES` with its reason in a comment. New cues `command_ok` (a confirmed player command → `ui_confirm`)
   and `ui_click`. Per-cue options `AUDIO_OPTS` (gain/rate, e.g. a short quiet crack for `link_break`) and `VFX_OPTS`
   (`vote_finale` beams from `layout.js` CAMPS, target [0, 14, 0]). `shell_enter` no longer fires a mist at Iris's
   feet; `crisis` strikes the Ash camp with `storm_hit` and a crack; `reveal_call` speaks `guest_call`; `key_spoken`
   and `double_ring` glow gold. Fixed: audio cues passed `position` where the runtime reads `pos`, so no cue had ever
   been positional. **Pure ambience rules** (`game/src/play/ambience.js`, new): `surfaceAt`, `StepMeter`, `tensionLevel`,
   `humPositions`, `npcStepGain`.
4. **World-driven presentation** (`game/src/play/presentation.js`, new, wired from `game.js`):
   - VFX: `attachToComposer` + `setQuality` at start and on every `lookdev.onQualityChange` (null composer on the low
     tier); `setReducedMotion` follows `lookdev.reducedMotion`; `shell_mist` with `follow` under all four Shells;
     `shell_crack_pulse` on Shell IV from an anchor on its front (mid-height) with `crackDir` along the ribs and `onPulse`
     driving the emissive of crack/glow materials of the real model when present; the `tension` singleton with
     `level = tensionLevel(season tension)` following Iris and `hooks.skyTint` warming the fog and fill (or
     `lookdev.sky.tint` when it exists); the `logogram` ink effect on the Shell glass (forms and dots of the visible
     sign, the glass glyph's radius, facing the visitor) when the sign changes or Iris enters.
   - Audio: `setZone(zoneAt(pos))` every frame; Iris footsteps (non-positional) and clan-agent footsteps (positional,
     distance gain) by surface and distance walked; `ui_click` for every button in the play UI and world HUD (delegated
     click on the UI root, no edit of the UI files); preload of steps and UI sounds right after unlock.
   - **Volume sliders** (`game/src/play/audio-settings.js`, new): master / music / effects in the scene controls dialog
     (Esc), appended from `main.js` because the dialog is Codex-owned; labels in en/uk/ru/it/zh inside the module;
     values persist through the runtime's `ftf.audio.v1` even before the audio module has loaded.
   - `main.js`: mounts the sliders after the play layer starts; `window.__ftf.vfx` / `__ftf.audio` getters for QA.
5. **Docs**: `docs/audio.md` and `docs/vfx.md` integration sections rewritten to the real state; HANDOFF Audio/VFX rows
   and open item 2; a `docs/decisions.md` §4 row; `docs/collab-requests.md` requests 3 (Codex: sliders in Settings
   with locale keys) and 4 (worker E: optional `lookdev.sky.tint`).

## 3. What was not done
- **No human listening pass.** The mix between wind, beds, hums, steps and music was never heard; levels are the
  synthesis-time defaults plus the gains in `AUDIO_OPTS` / `presentation.js` (steps 0.7 walking, 0.9 running, agents
  0.8 within 6 m). Expect a balance pass once someone plays with headphones.
- Footstep timing follows distance walked, not the animation clips' foot contacts (would need clip events from
  `agents.js`, which Task A does not own).
- The sliders are an appended section in the controls dialog, not part of Settings proper (request 3 to Codex).
- The ink logogram on the glass draws over 4.2 s while the canvas sign draws over 7 s (`scenes/shell.js`, not owned
  here); both are gold, so the mismatch reads as the ink leading the glow. Aligning them is a one-line change in
  either file when both are owned by one worker.
- Shell IV's crack position is an estimate (front of the Shell, 45 % of its height); the real `shell_4.glb` has no
  named crack socket. `onPulse` finds emissive materials by name (`crack|glow|emit|core`); if the model has none,
  only the pulsing light shows.
- `double_ring` plays a gold `gift` glow at the Scroll (the logogram effect needs the key sign's forms, which the
  phase-change event does not carry).
- `package.json` was not touched (the new tests live in the existing `audio.test.mjs`).

## 4. How it was checked
- `cd game && npm test`: **265/265** (was 260; +5 in `tests/client/audio.test.mjs`: Shell hums and group preload on the
  fake AudioContext, the cue table coverage, positional cue options, footstep surfaces/cadence, tension level and
  hum positions). `npm run build`: green.
- Headless Chromium (Playwright, SwiftShader) against `npm run dev`, scripts in the session scratchpad:
  - `/?play=direct` (auto tier → ultra under SwiftShader in these runs, low in another) and `/?demo=judge&play=direct`
    (the judge path proper goes through the lobby; the direct entry runs the same season seed): **0 console errors,
    0 page errors** on every run; the only warning is Chromium's own "GPU stall due to ReadPixels".
  - After the first click: audio unlocked, zone `balcony`, 4 hums, music on; `presentation.state()` shows 4 mists and
    the crack pulse running; walking produced Iris steps and agent steps.
  - Shell visit through the room (`move` to `anchor_zone:2`, `enter_shell` 2): zone `shell`, bed `amb_shell_inside`,
    the Guest voice ducking the music, the ink logogram mesh at the glass (world z −5.66 against the glyph's −5.78,
    radius 3.22 m) with its draw progress advancing; `exit_shell` restores the island and stops the glass effect.
  - Tier switches low → high → ultra: `vfx.stats().tier` follows, the composer chain is
    `RenderPass, GodRaysPass, GTAOPass, VfxPass, UnrealBloomPass, OutputPass, ShaderPass` on high/ultra and direct
    rendering on low (no pass); `setReducedMotion(true)` reaches the VFX within a frame.
  - The three sliders mount in the controls dialog with the English labels.
  - Screenshots looked at: the plaza on ultra with the full post chain, the Shell interior on low (canvas sign drawing)
    and mid-draw with the ink's first dot on the glass. No rendering artifacts from the VFX pass.
- Not checked: real speakers (no audio device in the container), a real GPU, Safari.
