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
