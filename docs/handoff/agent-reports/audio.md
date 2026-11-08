# audio: report

**Files**
- Sources: art/audio/synth.py, art/audio/build_audio.py (procedural, seeded per asset name). Rebuild: `python3 art/audio/build_audio.py`, about 1 min on CPU (run locally).
- 60 Ogg Opus files in game/public/assets/audio/, 5.77 MB in total (limit 12 MB):
  - 9 ambience loops: wind, Shell hum (mono, positional), Shell interior, 6 camp beds.
  - 3 synced 64 s music stems: calm, uneasy, crisis.
  - 9 Guest voice files: 4 strokes + 4 phrases + call.
  - 5 UI sounds, 20 footsteps (5 surfaces x 4), plus anchor_plant, storm_crack, gift_chime, vision_whoosh, memory_dissolve, 3 bid ticks, 3 vote stones and 3 stingers.
- Runtime: game/src/audio/audio.js (`createAudio`, plus `speakStrokes`, `setVolume`, `preload`), game/src/audio/mix.js (pure logic), game/src/audio/manifest.js (generated).
- Docs: docs/audio.md (names and integration lines).
- Tests: game/tests/client/audio.test.mjs (6 tests, including a fake-AudioContext runtime test), added to the npm test script.

**Verified**
- `npm test` passes (182/182) and `npm run build` passes.
- Decoded Opus lengths match the manifest sample counts exactly.
- Loop seam jumps sit within the signal's normal sample-to-sample differences. One small exception: amb_shell_hum shows 0.015 against a p99 of 0.003. It may click very faintly.

**Not done**
- No human listening pass yet; the mix levels need tuning in the running game.
- Ogg Opus does not play in Safari before 18.4. There it stays silent; nothing throws.
- main.js integration is left to the gameplay agent.

**Manifest row (for docs/art/manifest.md)**
| assets/audio/*.ogg (60) | Ambience, adaptive music stems, Guest voice, UI, footsteps, SFX, stingers | Claude Code (procedural synthesis, `art/audio/build_audio.py` + `synth.py`, numpy/scipy, Opus via ffmpeg/libopus) | own, MIT; no samples, no third-party audio | — | 5.77 MB Ogg Opus 48 kHz | review |
