# Sound pass v2: library candidates (owner review)

Recorded/produced SFX from licensed libraries, replacing the synthesized set that was not approved.
Listen to [`demo_v2.ogg`](demo_v2.ogg) and pick one alternative per category (for example: `step_stone B, step_wood A, ...`). Nothing is wired into the game until the picks are in.

How the demo is laid out: a two-note rising chime starts each category; then each alternative is announced by short beeps (one beep = A, two = B, three = C) and played in a small game-like pattern (walk then run for footsteps, a 3-hit combo for strikes, charge then release for casts, attack/hurt/hurt/death for mobs).

Every candidate is trimmed, high-passed at 40 Hz, given short fades, loudness-matched within its category and limited to -1 dBTP. After the picks, the chosen files are mastered the same way into `game/public/assets/audio/` and credited in `docs/art/manifest.md` and the README.

Total length: 4:32.7.

| Time | Category | Alt | Candidate | Source files (pack:path) |
|---|---|---|---|---|
| 0:01.8 | **step_stone**: Footsteps: stone street (walk, then run) | A | Fantozzi stone (CC0) | `qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneL1.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneR1.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneL2.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneR2.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneL3.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-StoneR3.ogg` |
| 0:11.3 |  | B | Kenney leather boots (CC0) | `kenney_rpg:OGG/footstep00.ogg`<br>`kenney_rpg:OGG/footstep01.ogg`<br>`kenney_rpg:OGG/footstep03.ogg`<br>`kenney_rpg:OGG/footstep07.ogg`<br>`kenney_rpg:OGG/footstep08.ogg`<br>`kenney_rpg:OGG/footstep02.ogg` |
| 0:20.8 |  | C | Boots on concrete, congusbongus/swuing (CC-BY 3.0) | `congus_footsteps:footsteps/boots/0.ogg`<br>`congus_footsteps:footsteps/boots/1.ogg`<br>`congus_footsteps:footsteps/boots/2.ogg`<br>`congus_footsteps:footsteps/boots/3.ogg`<br>`congus_footsteps:footsteps/boots/4.ogg`<br>`congus_footsteps:footsteps/boots/5.ogg` |
| 0:30.9 | **step_wood**: Footsteps: wooden floor indoors (walk, then run) | A | Wood, congusbongus/swuing (CC-BY 3.0) | `congus_footsteps:footsteps/wood/0.ogg`<br>`congus_footsteps:footsteps/wood/1.ogg`<br>`congus_footsteps:footsteps/wood/2.ogg`<br>`congus_footsteps:footsteps/wood/3.ogg`<br>`congus_footsteps:footsteps/wood/4.ogg`<br>`congus_footsteps:footsteps/wood/5.ogg` |
| 0:40.4 |  | B | Kenney soft steps (CC0) | `kenney_rpg:OGG/footstep04.ogg`<br>`kenney_rpg:OGG/footstep05.ogg`<br>`kenney_rpg:OGG/footstep06.ogg`<br>`kenney_rpg:OGG/footstep09.ogg` |
| 0:49.9 |  | C | rubberduck wood (CC0) | `rubberduck_100v2:sfx100v2_footstep_wood_01.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wood_02.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wood_03.ogg`<br>`rubberduck_100v2:sfx100v2_footstep_wood_04.ogg` |
| 1:00.1 | **step_grass**: Footsteps: grass and dirt outside the walls (walk, then run) | A | Grass, congusbongus/swuing (CC-BY 3.0) | `congus_footsteps:footsteps/grass/0.ogg`<br>`congus_footsteps:footsteps/grass/1.ogg`<br>`congus_footsteps:footsteps/grass/2.ogg`<br>`congus_footsteps:footsteps/grass/3.ogg`<br>`congus_footsteps:footsteps/grass/4.ogg`<br>`congus_footsteps:footsteps/grass/5.ogg` |
| 1:09.5 |  | B | Gravel/dirt, congusbongus/Ali_6868 (CC-BY 3.0) | `congus_footsteps:footsteps/gravel/0.ogg`<br>`congus_footsteps:footsteps/gravel/3.ogg`<br>`congus_footsteps:footsteps/gravel/5.ogg`<br>`congus_footsteps:footsteps/gravel/6.ogg`<br>`congus_footsteps:footsteps/gravel/7.ogg`<br>`congus_footsteps:footsteps/gravel/9.ogg` |
| 1:19.0 |  | C | Fantozzi sand (CC0) | `qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-SandL1.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-SandR1.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-SandL2.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-SandR2.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-SandL3.ogg`<br>`qubodup_fantozzi:Fantozzi-footsteps/ogg/Fantozzi-SandR3.ogg` |
| 1:29.3 | **strike_swing**: Iris strikes: swing whooshes (3-hit combo) | A | artisticdude swishes (CC0) | `artisticdude_swish:swishes/swish-3.wav`<br>`artisticdude_swish:swishes/swish-7.wav`<br>`artisticdude_swish:swishes/swish-9.wav`<br>`artisticdude_swish:swishes/swish-4.wav` |
| 1:33.4 |  | B | artisticdude battle swings (CC0) | `artisticdude_rpg:RPG Sound Pack/battle/swing.wav`<br>`artisticdude_rpg:RPG Sound Pack/battle/swing2.wav`<br>`artisticdude_rpg:RPG Sound Pack/battle/swing3.wav` |
| 1:37.7 |  | C | StarNinjas sword attacks (CC0) | `starninjas_sword:sword - StarNinjas/sword.1.ogg`<br>`starninjas_sword:sword - StarNinjas/sword.3.ogg`<br>`starninjas_sword:sword - StarNinjas/sword.5.ogg`<br>`starninjas_sword:sword - StarNinjas/sword.7.ogg` |
| 1:43.0 | **strike_impact**: Iris strikes: hits landing on a mob (swing A + impact) | A | rubberduck hits/slams (CC0) | `rubberduck_100:hit_03.ogg`<br>`rubberduck_100:hit_04.ogg`<br>`rubberduck_100:slam_03.ogg` |
| 1:47.4 |  | B | rubberduck breaking/hit (CC0) | `rubberduck_bfh:bfh1_hit_07.ogg`<br>`rubberduck_bfh:bfh1_hit_06.ogg`<br>`rubberduck_bfh:bfh1_hit_02.ogg` |
| 1:52.2 |  | C | Kenney chop + knife slice (CC0) | `kenney_rpg:OGG/chop.ogg`<br>`kenney_rpg:OGG/knifeSlice.ogg`<br>`kenney_rpg:OGG/knifeSlice2.ogg` |
| 1:57.4 | **strike_heavy**: Iris strikes: heavy finisher | A | Stomp + slam layered, rubberduck (CC0) | `rubberduck_creature2:stomp_01.ogg`<br>`rubberduck_100:slam_02.ogg` |
| 2:00.8 |  | B | Earth blast, Leohpaz (CC-BY 4.0) | `leohpaz_magic:30_Earth_02.wav` |
| 2:05.0 |  | C | Low hit + slam layered, rubberduck (CC0) | `rubberduck_bfh:bfh1_hit_02.ogg`<br>`rubberduck_100:slam_03.ogg` |
| 2:09.3 | **dash**: Dash whoosh | A | rubberduck air (CC0) | `rubberduck_100v2:sfx100v2_air_03.ogg` |
| 2:13.8 |  | B | Wind burst, Leohpaz (CC-BY 4.0) | `leohpaz_magic:25_Wind_01.wav` |
| 2:18.8 |  | C | Slowed swish + cloth, artisticdude/Kenney (CC0) | `artisticdude_swish:swishes/swish-7.wav`<br>`kenney_rpg:OGG/cloth3.ogg` |
| 2:24.3 | **cast_frost**: Frost Lance: charge (0.42 s, phase 'start') then release | A | Leohpaz charge + ice explosion (CC-BY 4.0) | `leohpaz_magic:45_Charge_05.wav`<br>`leohpaz_magic:13_Ice_explosion_01.wav` |
| 2:29.7 |  | B | artisticdude freeze + qubodup ice (CC0 / CC-BY 3.0) | `artisticdude_freeze:freeze.wav`<br>`qubodup_iceelec:qubodupIceAndElectricitySpells/qubodupIceDamage03c.flac` |
| 2:34.9 |  | C | Bart ice + ignasd shatter (CC0) | `bart_ice:ice.wav`<br>`ignasd_ice:IceShatters/LedasLuzta5.ogg` |
| 2:40.7 | **cast_storm**: Storm Snare: charge (0.42 s, phase 'start') then release | A | Leohpaz charge + thunder (CC-BY 4.0) | `leohpaz_magic:45_Charge_05.wav`<br>`leohpaz_magic:18_Thunder_02.wav` |
| 2:46.3 |  | B | faxcorp electricity (CC0) | `faxcorp_elec:chargestart.wav`<br>`faxcorp_elec:hit.wav` |
| 2:51.8 |  | C | faxcorp charge + qubodup zap (CC0 / CC-BY 3.0) | `faxcorp_elec:charge.wav`<br>`qubodup_iceelec:qubodupIceAndElectricitySpells/qubodupElectricityDamage01.flac` |
| 2:57.5 | **mob_skitter**: Skitter (insectoid): telegraph/attack, hurt, death | A | rubberduck bugs (CC0) | `rubberduck_creature:bug_04.ogg`<br>`rubberduck_creature2:bug_08.ogg`<br>`rubberduck_creature2:die_04.ogg` |
| 3:02.6 |  | B | artisticdude beetle (CC0) | `artisticdude_rpg:RPG Sound Pack/NPC/beetle/bite-small.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/beetle/bite-small2.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/beetle/bite-small3.wav` |
| 3:07.7 |  | C | fvcalderan insects (CC0) | `fvcalderan_insect:insect1.ogg`<br>`fvcalderan_insect:insect3.ogg`<br>`fvcalderan_insect:insect0.ogg` |
| 3:13.7 | **mob_hulker**: Hulker (heavy): slam attack, hurt, death | A | artisticdude giant + stomp (CC0) | `artisticdude_rpg:RPG Sound Pack/NPC/giant/giant1.wav`<br>`rubberduck_creature2:stomp_01.ogg`<br>`artisticdude_rpg:RPG Sound Pack/NPC/giant/giant4.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/giant/giant2.wav` |
| 3:18.7 |  | B | artisticdude ogre + slam (CC0) | `artisticdude_rpg:RPG Sound Pack/NPC/ogre/ogre3.wav`<br>`rubberduck_100:slam_03.ogg`<br>`artisticdude_rpg:RPG Sound Pack/NPC/ogre/ogre5.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/ogre/ogre2.wav` |
| 3:23.8 |  | C | rubberduck troll/roar (CC0) | `rubberduck_creature:troll_02.ogg`<br>`rubberduck_creature2:stomp_01.ogg`<br>`rubberduck_creature:hurt_03.ogg`<br>`rubberduck_rpg:creature_die_01.ogg` |
| 3:29.8 | **mob_veilbell**: Veilbell (chime/magic): seed telegraph, hurt, death | A | pwl bell + artisticdude shade (CC0) | `pwl_bell:bell_ding2.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/shade/shade2.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/shade/shade12.wav` |
| 3:35.3 |  | B | rubberduck bells + alien (CC0) | `rubberduck_100:bell_02.ogg`<br>`rubberduck_creature:alien_03.ogg`<br>`rubberduck_100:bell_03.ogg`<br>`rubberduck_creature:alien_02.ogg` |
| 3:41.1 |  | C | rubberduck spell + gong (CC0) | `rubberduck_rpg:spell_01.ogg`<br>`rubberduck_rpg:creature_misc_05.ogg`<br>`rubberduck_100:gong_02.ogg`<br>`rubberduck_rpg:spell_02.ogg` |
| 3:47.2 | **mob_crownrift**: Crownrift (blade): blade attack, hurt, death | A | rubberduck blades + artisticdude beast (CC0) | `rubberduck_rpg:blade_02.ogg`<br>`artisticdude_rpg:RPG Sound Pack/NPC/gutteral beast/mnstr2.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/gutteral beast/mnstr14.wav` |
| 3:52.2 |  | B | artisticdude unsheathe + shade (CC0) | `artisticdude_rpg:RPG Sound Pack/battle/sword-unsheathe5.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/shade/shade14.wav`<br>`artisticdude_rpg:RPG Sound Pack/NPC/shade/shade9.wav` |
| 3:58.0 |  | C | Medicine Storm blade clash + rubberduck (CC0) | `medicinestorm_medieval:Sabre Katana Blade on Blade.wav`<br>`rubberduck_creature2:monster_10.ogg`<br>`rubberduck_creature2:die_02.ogg` |
| 4:03.7 | **iris_hurt**: Iris gets hit (3 hits), then goes down | A | Cici Fyre voice type 1 (CC0) | `cicifyre_voice:RPG Voice Starter Pack/Type 1/damaged1.wav`<br>`cicifyre_voice:RPG Voice Starter Pack/Type 1/damaged2.wav`<br>`cicifyre_voice:RPG Voice Starter Pack/Type 1/damaged3.wav`<br>`female_groans:female_hurt_grunts_groans_1.ogg` |
| 4:09.6 |  | B | Cici Fyre voice type 2 (CC0) | `cicifyre_voice:RPG Voice Starter Pack/Type 2/damaged1.wav`<br>`cicifyre_voice:RPG Voice Starter Pack/Type 2/damaged2.wav`<br>`cicifyre_voice:RPG Voice Starter Pack/Type 2/damaged3.wav`<br>`female_groans:female_hurt_grunts_groans_1.ogg` |
| 4:15.5 |  | C | Cici Fyre voice type 3 (CC0) | `cicifyre_voice:RPG Voice Starter Pack/Type 3/damaged1.wav`<br>`cicifyre_voice:RPG Voice Starter Pack/Type 3/damaged2.wav`<br>`cicifyre_voice:RPG Voice Starter Pack/Type 3/damaged3.wav`<br>`female_groans:female_hurt_grunts_groans_1.ogg` |
| 4:22.1 | **chest**: Chest: drop from a mob, then open | A | rubberduck gem + Kenney door/coins (CC0) | `rubberduck_rpg:item_gem_02.ogg`<br>`kenney_rpg:OGG/doorOpen_1.ogg`<br>`kenney_rpg:OGG/handleCoins.ogg` |
| 4:26.0 |  | B | rubberduck coins + wooden box (CC0) | `rubberduck_rpg:item_coins_03.ogg`<br>`rubberduck_100:wooded_box_open.ogg` |
| 4:29.5 |  | C | rubberduck bell + lock/wood (CC0) | `rubberduck_100:bell_02.ogg`<br>`rubberduck_rpg:lock_01.ogg`<br>`rubberduck_rpg:item_wood_02.ogg` |

## Sources and licences

All packs are from OpenGameArt. CC0 packs need no credit (given anyway); CC-BY packs must be credited if picked.

| Pack id | Title | Author | Licence | Page |
|---|---|---|---|---|
| `qubodup_fantozzi` | Fantozzi's Footsteps (Grass/Sand & Stone) | Fantozzi, qubodup | CC0 | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone |
| `kenney_rpg` | RPG Sound Pack (50 RPG sound effects) | Kenney (kenney.nl) | CC0 | https://opengameart.org/content/50-rpg-sound-effects |
| `congus_footsteps` | Footsteps on different surfaces | congusbongus | CC-BY 3.0 | https://opengameart.org/content/footsteps-on-different-surfaces |
| | ↳ `wood` | derived from footstep-wood.wav by swuing (freesound.org/s/38876) | CC-BY 3.0 | |
| | ↳ `grass` | derived from footstep-grass.wav by swuing (freesound.org/s/38874) | CC-BY 3.0 | |
| | ↳ `boots` | derived from footstep-concrete.wav by swuing (freesound.org/s/38873) | CC-BY 3.0 | |
| | ↳ `gravel` | derived from the Gravel Footsteps pack by Ali_6868 (freesound.org/people/Ali_6868/packs/21608) | CC-BY 3.0 | |
| `rubberduck_100v2` | 100 CC0 SFX #2 | rubberduck | CC0 | https://opengameart.org/content/100-cc0-sfx-2 |
| `artisticdude_swish` | Swishes Sound Pack | artisticdude | CC0 | https://opengameart.org/content/swishes-sound-pack |
| `artisticdude_rpg` | RPG Sound Pack | artisticdude | CC0 | https://opengameart.org/content/rpg-sound-pack |
| `starninjas_sword` | 20 Sword Sound Effects (Attacks and Clashes) | StarNinjas | CC0 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes |
| `rubberduck_100` | 100 CC0 SFX | rubberduck | CC0 | https://opengameart.org/content/100-cc0-sfx |
| `rubberduck_bfh` | 75 CC0 breaking/falling/hit SFX | rubberduck | CC0 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx |
| `rubberduck_creature2` | 80 CC0 creature SFX #2 | rubberduck | CC0 | https://opengameart.org/content/80-cc0-creture-sfx-2 |
| `leohpaz_magic` | 8 Magic Attacks (RPG battle magic SFX free samples) | Leohpaz | CC-BY 4.0 | https://opengameart.org/content/8-magic-attacks |
| `artisticdude_freeze` | Freeze Spell | artisticdude | CC0 | https://opengameart.org/content/freeze-spell-0 |
| `qubodup_iceelec` | Ice and Electricity Magic | qubodup | CC-BY 3.0 | https://opengameart.org/content/ice-electricity-magic |
| `bart_ice` | Ice spells | Bart Kelsey | CC0 | https://opengameart.org/content/ice-spells |
| `ignasd_ice` | Ice breaking/shattering | ignasd | CC0 | https://opengameart.org/content/ice-breakingshattering |
| `faxcorp_elec` | Electricity game sound pack | faxcorp | CC0 | https://opengameart.org/content/electricity-game-sound-pack |
| `rubberduck_creature` | 80 CC0 creature SFX | rubberduck | CC0 | https://opengameart.org/content/80-cc0-creature-sfx |
| `fvcalderan_insect` | Insect sounds | fvcalderan | CC0 | https://opengameart.org/content/insect-sounds |
| `rubberduck_rpg` | 80 CC0 RPG SFX | rubberduck | CC0 | https://opengameart.org/content/80-cc0-rpg-sfx |
| `pwl_bell` | Bell dings/chimes | pwl | CC0 | https://opengameart.org/content/bell-dingschimes |
| `medicinestorm_medieval` | Medieval Sound Effects: Weapon Impacts | Medicine Storm | CC0 | https://opengameart.org/content/medieval-sound-effects-weapon-impacts |
| `cicifyre_voice` | Female RPG Voice Starter Pack | Cici Fyre | CC0 | https://opengameart.org/content/female-rpg-voice-starter-pack |
| `female_groans` | Female hurt grunts & groans | (OpenGameArt upload) | CC0 | https://opengameart.org/content/female-hurt-grunts-groans |

Rebuild: `python3 art/audio/build_sfx_library.py` (downloads into `~/.cache/ftf-sfx`).
