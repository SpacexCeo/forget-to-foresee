# Audio

All sound is synthesized from scratch. There are no samples and no third-party audio.
- Sources: `art/audio/synth.py` (DSP toolkit) and `art/audio/build_audio.py` (one generator per sound). Seeds come from the crc32 of each asset name.
- Output: `game/public/assets/audio/*.ogg` (Ogg Opus, 48 kHz; 60 files, 5.8 MB) plus the generated `game/src/audio/manifest.js`.
- Rebuild: `python3 art/audio/build_audio.py` (numpy, scipy, ffmpeg with libopus; about 1 min on CPU). Use `--only <names>` for single assets and `--wav DIR` to keep the float masters.
- Runtime: `game/src/audio/audio.js` (WebAudio) and `game/src/audio/mix.js` (pure logic, tested in `tests/client/audio.test.mjs`).

## Integration (state on 08.11, branch `claude/audio-vfx-wiring`)

The runtime is wired into the play layer; nothing in `main.js` touches WebAudio directly.

| What | Where |
|---|---|
| Lazy load of `createAudio`, unlock on the first key or pointer | `src/play/game.js` |
| `setListener(camera, focus)` every frame (ears at Iris's chest, orientation from the camera) | `src/play/hooks.js` `Hooks.update` |
| `setTension(obs.season.tension)` on every observation; `speakStrokes` for the sign the Guest draws while Iris is inside | `src/play/game.js` `syncVisuals` |
| `setZone(inShell ? 'shell' : zoneAt(player.pos))` every frame (camp beds, balcony and bridge wind, the interior) | `src/play/presentation.js` |
| One positional `amb_shell_hum` per Shell (`setShellHums`, level follows the zone: full on the plaza and bridges, 0.8 at a camp, off inside) | `src/play/presentation.js` → `audio.js` |
| Footsteps: Iris non-positional, clan agents positional with distance gain (full within 6 m, silent beyond 30 m); surface by position (`step_grass` on camp plateaus, `step_stone` plaza and balcony, `step_wood` bridges, `step_glass` inside a Shell); cadence by distance walked (0.72 m per step walking, 1.1 m running) | `src/play/ambience.js` (pure, tested) + `presentation.js` |
| Event cues: room events → sounds (`AUDIO_MAP`, per-cue `AUDIO_OPTS`; positional when the cue has a place) | `src/play/hooks.js` |
| `ui_click` on every button in the play UI and world HUD, `ui_confirm` on the player's confirmed commands, `ui_error` on a rejected one | `presentation.js` (delegated click) + `game.js` (`command_ok` / `rejected`) |
| Steps and UI sounds preloaded right after unlock (every variant of a group) | `presentation.js` → `audio.preload` |
| Master / music / effects sliders in the scene settings dialog (Esc), persisted in `ftf.audio.v1`, labels in the five UI languages | `src/play/audio-settings.js`, mounted from `main.js` |

Cue table: every name in `CUE_NAMES` (`src/play/hooks.js`) is mapped to a sound and/or an effect or listed in
`SILENT_CUES` with its reason; `tests/client/audio.test.mjs` enforces it. The API as the play layer uses it:

```js
import { createAudio } from './audio/audio.js';
import { zoneAt } from './audio/mix.js';

const audio = createAudio();                          // nothing plays until unlock()
addEventListener('pointerdown', () => audio.unlock(), { once: true });   // also on keydown
audio.setShellHums(ANCHOR_ZONES.map((z) => z.shellPosition)); // one positional hum per Shell, queued until unlock

// every frame
audio.setListener(camera, player.position);           // ears at Iris, orientation from the camera
audio.setZone(insideShell ? 'shell' : zoneAt(player.position));  // no-op when unchanged
audio.setTension(state.tension);                      // 0..100, crossfades the music stems

// events
audio.play('step_stone', { pos: npc.position });      // a group name picks a random variant (never the same one twice in a row)
audio.play('anchor_plant', { pos: anchor.position });
audio.speakStrokes([{ stroke: 'arc', dur: 1.2 }, { stroke: 'drop', dur: 0.9 }], { pos: guest.position }); // voice follows the logogram pen
audio.play('sting_survived');                         // the voice and stingers duck music by -9 dB and ambience by -6 dB
audio.setVolume('music', 0.5);                        // master | music | sfx, 0..1, saved in localStorage 'ftf.audio.v1'
audio.preload(['step_stone', 'ui_click']);            // after unlock; a group name loads every variant
audio.dispose();
```

`play(name, { pos, loop, gain, rate, delay, duck })` returns a handle `{ stop(fade), setPosition(p), setGain(g), ended }`. With `pos` the sound goes through an HRTF `PannerNode` (inverse distance, `ref`/`rolloff` from the manifest). Without `pos` it plays non-positionally (Iris's own footsteps, UI). Before `unlock()`, one-shots are dropped and loops are queued. If a step, UI or sfx one-shot is still decoding after 300 ms it is skipped. The context suspends while the tab is hidden.

## Sound list

| Name | Kind | Use |
|---|---|---|
| `amb_wind` | amb loop 40 s | High wind over the cloud sea; always on, its level follows the zone (loudest on the balcony and bridges). |
| `amb_shell_hum` | amb loop 32 s, mono | Distant Shell hum with slow beating (partials on a 1/32 Hz grid). Play one per Shell with `pos`, ref 22 m. |
| `amb_shell_inside` | amb loop 32 s | Zone `shell`: deeper beating hum, singing nacre ribs, creaks, a 6 s hall. |
| `amb_camp_sol` / `_pepel` / `_moh` / `_yantar` / `_iney` / `_iris` | amb loop 24 s | Camp beds, crossfaded by `setZone`: Salt crystal chimes; Ash fire crackle; Moss crickets and a bubbling brook; Amber wooden creaks and coins; Frost glassy ice tinkles and singing cracks; Iris cloth flaps. |
| `mus_calm` / `mus_uneasy` / `mus_crisis` | music loop 64 s (60 bpm, 16 bars, Dm - Bbmaj7#11 - Gm9 - A7) | Synced stems mixed with equal power by tension: calm up to 30, calm→uneasy 30-55, uneasy 55-70, uneasy→crisis 70-90. |
| `guest_arc` / `_spike` / `_loop` / `_drop` | voice | One per logogram stroke: the pitch contour draws the stroke. Formant filtering with crossing formants, a subharmonic, an inharmonic partial, a granular cloud and a phase-vocoder spectral freeze. |
| `guest_phrase_1..4`, `guest_call` | voice | Longer phrases (3-4 strokes) and an attention call. |
| `ui_hover`, `ui_click`, `ui_confirm`, `ui_error`, `ui_notify` | ui | Interface. |
| `step_stone` / `step_wood` / `step_grass` / `step_glass` / `step_metal` | step group, 4 variants each | Footsteps by surface (heel plus toe). |
| `anchor_plant` | sfx | Stone thud plus a gold bell ring. |
| `storm_crack` | sfx | Electric zap, crack, crackle and rolling rumble. |
| `gift_chime` | sfx | Rising crystal arpeggio over a D major glow. |
| `vision_whoosh` | sfx | Rising band sweep with a reversed bell swell. |
| `memory_dissolve` | sfx | A chord crumbling into grains and sparkles (6 s, for the memory burn). |
| `bid_tick` | sfx group, 3 | Shard auction bid ticks. |
| `vote_stone` | sfx group, 3 | Vote stone dropped into a bowl (with bounces). |
| `sting_survived` / `sting_weapon` / `sting_gone` | sting | Outcome stingers: resolution with choir and bells; brass cluster, drum and metal scrape; the Shells leaving (the hum glides down while shimmer rises away). |

Loudness: each sound is normalized at render time (short-term RMS for one-shots, integrated RMS for loops) with a soft ceiling at -1 dBFS. A DynamicsCompressor on the master bus acts as a safety limiter.

## Known limits
- Ogg Opus decodes in Chrome, Edge and Firefox, and in Safari 18.4+. On older Safari `decodeAudioData` fails and the game simply stays silent: nothing throws.
- No listening QA by a human yet (the wiring was checked in headless Chromium: the graph, the zones, the hums, the step counts; not the mix). Levels were set from measurements only, and the mix between beds, hums, steps and music needs a pass in the running game. Footstep timing follows distance walked, not the animation's foot contacts.
- The volume sliders live in the scene controls dialog as an appended section (the dialog belongs to the UI shell); the request to move them into Settings proper is in `docs/collab-requests.md`.
