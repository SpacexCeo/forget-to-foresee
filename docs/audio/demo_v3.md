# Sound pass v3: weather candidates (owner review)

Recorded/produced SFX from licensed libraries, replacing the synthesized set that was not approved.
Listen to [`demo_v3.ogg`](demo_v3.ogg) and pick one alternative per category (for example: `step_stone B, step_wood A, ...`). Nothing is wired into the game until the picks are in.

How the demo is laid out: a two-note rising chime starts each category; then each alternative is announced by short beeps (one beep = A, two = B, three = C) and played in a small game-like pattern (walk then run for footsteps, a 3-hit combo for strikes, charge then release for casts, attack/hurt/hurt/death for mobs, a 7 s excerpt for rain beds). Rain beds will be made seamless (crossfaded loop) when wired; weather sounds follow the window event `ftf:weather` {state}.

Every candidate is trimmed, high-passed at 40 Hz, given short fades, loudness-matched within its category and limited to -1 dBTP. After the picks, the chosen files are mastered the same way into `game/public/assets/audio/` and credited in `docs/art/manifest.md` and the README.

Total length: 2:19.6.

These four categories supersede the weather entries in `demo_v2` (thunder now has three rolls per set).

| Time | Category | Alt | Candidate | Source files (pack:path) |
|---|---|---|---|---|
| 0:01.8 | **step_wet**: Footsteps: wet street in the rain (walk, then run) | A | Water steps, congusbongus/EminYILDIRIM (CC-BY 3.0) | `congus_footsteps:footsteps/water/0.ogg`<br>`congus_footsteps:footsteps/water/1.ogg`<br>`congus_footsteps:footsteps/water/2.ogg`<br>`congus_footsteps:footsteps/water/3.ogg`<br>`congus_footsteps:footsteps/water/4.ogg` |
| 0:11.3 |  | B | rubberduck wet steps (CC0) | `rubberduck_100v2:sfx100v2_footstep_wet_01.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wet_02.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wet_03.ogg` |
| 0:20.8 |  | C | Fantozzi stone + rubberduck wet layer (CC0) | `qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneL1.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wet_01.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneR1.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wet_02.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneL2.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wet_03.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneR2.ogg` |
| 0:31.1 | **rain_light**: Rain ambience: light (loop bed, 7 s excerpt) | A | kresiek-the-furry rain loop 1 (CC0) | `kresiek_rain:amb_rain_loop_1.wav` |
| 0:39.8 |  | B | ylmir soft rain (CC0) | `ylmir_rain:4.ogg` |
| 0:48.6 |  | C | Ove Melaa rainy (CC0) | `ovemelaa_rain:Ove Melaa - Rainy (NOT loopable) Long Version.ogg` |
| 0:58.0 | **rain_heavy**: Rain ambience: heavy / storm (loop bed, 7 s excerpt) | A | ylmir heavy rain (CC0) | `ylmir_rain:2.ogg` |
| 1:06.7 |  | B | kresiek-the-furry rain loop 2 (CC0) | `kresiek_rain:amb_rain2.flac` |
| 1:15.5 |  | C | wuxiascrub rain with thunder (CC0) | `wuxiascrub_rain:rain-thunder.ogg` |
| 1:24.9 | **thunder**: Distant thunder: three rolls per set (one-shots under the storm) | A | jerimee thunder sequence (CC-BY 3.0) | `jerimee_thunder:thunder-seq.wav` |
| 1:43.1 |  | B | Gregor Quendel field recording (CC-BY 4.0) | `quendel_thunder:gregor_quendel_-_free_thunder_ambience_-_mp3.mp3` |
| 2:01.5 |  | C | rubberduck + wuxiascrub thunder (CC0) | `rubberduck_100v2:sfx100v2_thunder_01.ogg`<br>`wuxiascrub_rain:rain-thunder.ogg` |

## Sources and licences

All packs are from OpenGameArt. CC0 packs need no credit (given anyway); CC-BY packs must be credited if picked.

| Pack id | Title | Author | Licence | Page |
|---|---|---|---|---|
| `congus_footsteps` | Footsteps on different surfaces | congusbongus | CC-BY 3.0 (gravel: CC0) | https://opengameart.org/content/footsteps-on-different-surfaces |
| | ↳ `wood` | derived from footstep-wood.wav by swuing (freesound.org/s/38876) | CC-BY 3.0 (gravel: CC0) | |
| | ↳ `grass` | derived from footstep-grass.wav by swuing (freesound.org/s/38874) | CC-BY 3.0 (gravel: CC0) | |
| | ↳ `boots` | derived from footstep-concrete.wav by swuing (freesound.org/s/38873) | CC-BY 3.0 (gravel: CC0) | |
| | ↳ `water` | derived from Water Footsteps by EminYILDIRIM (freesound.org/s/608663) and footstep-concrete.wav by swuing (freesound.org/s/38873) | CC-BY 3.0 (gravel: CC0) | |
| | ↳ `gravel` | CC0: derived from the Gravel Footsteps pack by Ali_6868 (freesound.org/people/Ali_6868/packs/21608) | CC-BY 3.0 (gravel: CC0) | |
| `rubberduck_100v2` | 100 CC0 SFX #2 | rubberduck | CC0 | https://opengameart.org/content/100-cc0-sfx-2 |
| `qubodup_fantozzi` | Fantozzi's Footsteps (Grass/Sand & Stone) | Fantozzi, qubodup | CC0 | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone |
| `kresiek_rain` | Amb rain loop 1 and 2 | kresiek-the-furry | CC0 | https://opengameart.org/content/amb-rain-loop-1 |
| `ylmir_rain` | Rain (loopable) | ylmir | CC0 | https://opengameart.org/content/rain-loopable |
| `ovemelaa_rain` | Rain ambient (not loopable) | Ove Melaa | CC0 | https://opengameart.org/content/rain-ambient-not-loopable-2-versions-available |
| `wuxiascrub_rain` | Rain, long thunder | wuxiascrub | CC0 | https://opengameart.org/content/rain-long-thunder |
| `jerimee_thunder` | Thunder | jerimee | CC-BY 3.0 | https://opengameart.org/content/thunder |
| `quendel_thunder` | Thunder & lightning ambience (field recording) | Gregor Quendel | CC-BY 4.0 | https://opengameart.org/content/thunder-lightning-ambience-field-recording |

Rebuild: `python3 art/audio/build_sfx_library.py` (downloads into `~/.cache/ftf-sfx`).
