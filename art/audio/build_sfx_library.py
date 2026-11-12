#!/usr/bin/env python3
"""Recorded SFX from licensed libraries (sound pass v2): fetch, pick, clean up, and build the owner review demo.

The synthesized combat/footstep/mob set from build_audio.py was not approved, so these categories are sourced from
recorded or produced sound libraries instead. Licence rules: CC0 first; CC-BY only with attribution; never NC, ND,
SA/GPL, ripped game audio or "royalty-free but no redistribution" bundles (the repository is public).

What this script does:
  1. downloads each source pack from OpenGameArt into a cache outside the repository
     (FTF_SFX_CACHE, default ~/.cache/ftf-sfx) and unpacks it;
  2. for every candidate sound: decode to 48 kHz mono, trim silence, high-pass, short fades, loudness-match to the
     category target (RMS of the active part) and limit to -1 dBTP (4x oversampled peak);
  3. writes docs/audio/demo_v2.ogg: every category with 2-3 alternatives (A/B/C), each announced by beeps
     (one beep = A, two = B, three = C) after a two-note category chime, and docs/audio/demo_v2.md with the
     timetable and the source/licence of every file.

Nothing here is wired into the game: the owner picks per category first. Requires numpy, scipy, py7zr and ffmpeg
with libopus.

Usage: python3 art/audio/build_sfx_library.py [--demo docs/audio/demo_v2.ogg]
"""
import argparse
import os
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get("FTF_SFX_CACHE", Path.home() / ".cache" / "ftf-sfx"))
OGA = "https://opengameart.org/sites/default/files/"

# ---------------------------------------------------------------- sources
# id -> pack metadata. `files` are the downloads (archives are unpacked into CACHE/ext/<id>/).
SOURCES = {
    "kenney_rpg": dict(title="RPG Sound Pack (50 RPG sound effects)", author="Kenney (kenney.nl)", licence="CC0",
                       page="https://opengameart.org/content/50-rpg-sound-effects", files=["RPGsounds_Kenney.zip"]),
    "artisticdude_rpg": dict(title="RPG Sound Pack", author="artisticdude", licence="CC0",
                             page="https://opengameart.org/content/rpg-sound-pack", files=["rpg_sound_pack.zip"]),
    "artisticdude_swish": dict(title="Swishes Sound Pack", author="artisticdude", licence="CC0",
                               page="https://opengameart.org/content/swishes-sound-pack", files=["swishes.zip"]),
    "artisticdude_freeze": dict(title="Freeze Spell", author="artisticdude", licence="CC0",
                                page="https://opengameart.org/content/freeze-spell-0", files=["freeze.wav"]),
    "rubberduck_rpg": dict(title="80 CC0 RPG SFX", author="rubberduck", licence="CC0",
                           page="https://opengameart.org/content/80-cc0-rpg-sfx", files=["80-CC0-RPG-SFX_0.zip"]),
    "rubberduck_creature": dict(title="80 CC0 creature SFX", author="rubberduck", licence="CC0",
                                page="https://opengameart.org/content/80-cc0-creature-sfx",
                                files=["80-CC0-creature-SFX_0.zip"]),
    "rubberduck_creature2": dict(title="80 CC0 creature SFX #2", author="rubberduck", licence="CC0",
                                 page="https://opengameart.org/content/80-cc0-creture-sfx-2",
                                 files=["80-CC0-creature-sfx-2.zip"]),
    "rubberduck_100": dict(title="100 CC0 SFX", author="rubberduck", licence="CC0",
                           page="https://opengameart.org/content/100-cc0-sfx", files=["100-CC0-SFX_0.zip"]),
    "rubberduck_100v2": dict(title="100 CC0 SFX #2", author="rubberduck", licence="CC0",
                             page="https://opengameart.org/content/100-cc0-sfx-2", files=["sfx_100_v2.zip"]),
    "rubberduck_bfh": dict(title="75 CC0 breaking/falling/hit SFX", author="rubberduck", licence="CC0",
                           page="https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx",
                           files=["sfx_breaking_and_falling.zip"]),
    "qubodup_fantozzi": dict(title="Fantozzi's Footsteps (Grass/Sand & Stone)", author="Fantozzi, qubodup",
                             licence="CC0", page="https://opengameart.org/content/fantozzis-footsteps-grasssand-stone",
                             files=["Fantozzi-footsteps.7z"]),
    "congus_footsteps": dict(title="Footsteps on different surfaces", author="congusbongus", licence="CC-BY 3.0",
                             page="https://opengameart.org/content/footsteps-on-different-surfaces",
                             files=["footsteps_0.zip"],
                             attribution={
                                 "wood": "derived from footstep-wood.wav by swuing (freesound.org/s/38876)",
                                 "grass": "derived from footstep-grass.wav by swuing (freesound.org/s/38874)",
                                 "boots": "derived from footstep-concrete.wav by swuing (freesound.org/s/38873)",
                                 "gravel": "derived from the Gravel Footsteps pack by Ali_6868 (freesound.org/people/Ali_6868/packs/21608)",
                             }),
    "starninjas_sword": dict(title="20 Sword Sound Effects (Attacks and Clashes)", author="StarNinjas", licence="CC0",
                             page="https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes",
                             files=["sword_-_starninjas_1.zip"]),
    "medicinestorm_medieval": dict(title="Medieval Sound Effects: Weapon Impacts", author="Medicine Storm",
                                   licence="CC0",
                                   page="https://opengameart.org/content/medieval-sound-effects-weapon-impacts",
                                   files=["medieval_sfx_weapon_on_weapon_1_of_2.7z"]),
    "leohpaz_magic": dict(title="8 Magic Attacks (RPG battle magic SFX free samples)", author="Leohpaz",
                          licence="CC-BY 4.0", page="https://opengameart.org/content/8-magic-attacks",
                          files=["8_rpg_battle_magic_sfx_free_samples.zip"]),
    "qubodup_iceelec": dict(title="Ice and Electricity Magic", author="qubodup", licence="CC-BY 3.0",
                            page="https://opengameart.org/content/ice-electricity-magic",
                            files=["qubodupIceAndElectricitySpells.7z"]),
    "bart_ice": dict(title="Ice spells", author="Bart Kelsey", licence="CC0",
                     page="https://opengameart.org/content/ice-spells", files=["icespells.zip"]),
    "ignasd_ice": dict(title="Ice breaking/shattering", author="ignasd", licence="CC0",
                       page="https://opengameart.org/content/ice-breakingshattering", files=["IceShatters_0.zip"]),
    "faxcorp_elec": dict(title="Electricity game sound pack", author="faxcorp", licence="CC0",
                         page="https://opengameart.org/content/electricity-game-sound-pack",
                         files=["charge.wav", "chargestart.wav", "hit.wav", "shieldhit.wav"]),
    "fvcalderan_insect": dict(title="Insect sounds", author="fvcalderan", licence="CC0",
                              page="https://opengameart.org/content/insect-sounds", files=["insect.zip"]),
    "pwl_bell": dict(title="Bell dings/chimes", author="pwl", licence="CC0",
                     page="https://opengameart.org/content/bell-dingschimes",
                     files=["bell_ding1.wav", "bell_ding2.wav", "bell_ding3.wav", "bell_ding4.wav"]),
    "cicifyre_voice": dict(title="Female RPG Voice Starter Pack", author="Cici Fyre", licence="CC0",
                           page="https://opengameart.org/content/female-rpg-voice-starter-pack",
                           files=["RPG%20Voice%20Starter%20Pack.zip"]),
    "female_groans": dict(title="Female hurt grunts & groans", author="(OpenGameArt upload)", licence="CC0",
                          page="https://opengameart.org/content/female-hurt-grunts-groans",
                          files=["female_hurt_grunts_groans_1.ogg"]),
}

VOICE = "RPG Voice Starter Pack"
RSP = "RPG Sound Pack"


def S(pack, path, **fx):
    """One source file (path inside the unpacked pack, '*' globs allowed) with optional processing:
    rate (resample factor, >1 = higher/shorter), start/len (seconds), gain (dB), env ('rise' for charges),
    seg (index of a sound inside a long take, split on silence)."""
    return dict(pack=pack, path=path, **fx)


# ---------------------------------------------------------------- candidates
# category -> (title, loudness target dBFS RMS, pattern, [alternatives]); an alternative is (label, {slot: [S...]}).
# Patterns say how the demo plays a set (see PATTERNS below).
FT = "footsteps"
CATEGORIES = [
    ("step_stone", "Footsteps: stone street (walk, then run)", -26, "steps", [
        ("Fantozzi stone (CC0)", {"step": [S("qubodup_fantozzi", f"*/ogg/Fantozzi-Stone{s}.ogg") for s in
                                           ("L1", "R1", "L2", "R2", "L3", "R3")]}),
        ("Kenney leather boots (CC0)", {"step": [S("kenney_rpg", f"OGG/footstep0{i}.ogg") for i in (0, 1, 3, 7, 8, 2)]}),
        ("Boots on concrete, congusbongus/swuing (CC-BY 3.0)", {"step": [S("congus_footsteps", f"{FT}/boots/{i}.ogg")
                                                                         for i in range(6)]}),
    ]),
    ("step_wood", "Footsteps: wooden floor indoors (walk, then run)", -26, "steps", [
        ("Wood, congusbongus/swuing (CC-BY 3.0)", {"step": [S("congus_footsteps", f"{FT}/wood/{i}.ogg") for i in range(6)]}),
        ("Kenney soft steps (CC0)", {"step": [S("kenney_rpg", f"OGG/footstep0{i}.ogg") for i in (4, 5, 6, 9)]}),
        ("rubberduck wood (CC0)", {"step": [S("rubberduck_100v2", f"sfx100v2_footstep_wood_0{i}.ogg") for i in (1, 2, 3, 4)]}),
    ]),
    ("step_grass", "Footsteps: grass and dirt outside the walls (walk, then run)", -27, "steps", [
        ("Grass, congusbongus/swuing (CC-BY 3.0)", {"step": [S("congus_footsteps", f"{FT}/grass/{i}.ogg") for i in range(6)]}),
        ("Gravel/dirt, congusbongus/Ali_6868 (CC-BY 3.0)", {"step": [S("congus_footsteps", f"{FT}/gravel/{i}.ogg")
                                                                    for i in (0, 3, 5, 6, 7, 9)]}),
        ("Fantozzi sand (CC0)", {"step": [S("qubodup_fantozzi", f"*/ogg/Fantozzi-Sand{s}.ogg") for s in
                                          ("L1", "R1", "L2", "R2", "L3", "R3")]}),
    ]),
    ("strike_swing", "Iris strikes: swing whooshes (3-hit combo)", -20, "combo_swing", [
        ("artisticdude swishes (CC0)", {"swing": [S("artisticdude_swish", f"swishes/swish-{i}.wav") for i in (3, 7, 9, 4)]}),
        ("artisticdude battle swings (CC0)", {"swing": [S("artisticdude_rpg", f"{RSP}/battle/swing{s}.wav") for s in ("", "2", "3")]}),
        ("StarNinjas sword attacks (CC0)", {"swing": [S("starninjas_sword", f"*/sword.{i}.ogg") for i in (1, 3, 5, 7)]}),
    ]),
    ("strike_impact", "Iris strikes: hits landing on a mob (swing A + impact)", -18, "combo_impact", [
        ("rubberduck hits/slams (CC0)", {"impact": [S("rubberduck_100", "hit_03.ogg"), S("rubberduck_100", "hit_04.ogg"),
                                                    S("rubberduck_100", "slam_03.ogg")]}),
        ("rubberduck breaking/hit (CC0)", {"impact": [S("rubberduck_bfh", "bfh1_hit_07.ogg"), S("rubberduck_bfh", "bfh1_hit_06.ogg"),
                                                      S("rubberduck_bfh", "bfh1_hit_02.ogg")]}),
        ("Kenney chop + knife slice (CC0)", {"impact": [S("kenney_rpg", "OGG/chop.ogg"), S("kenney_rpg", "OGG/knifeSlice.ogg"),
                                                        S("kenney_rpg", "OGG/knifeSlice2.ogg")]}),
    ]),
    ("strike_heavy", "Iris strikes: heavy finisher", -16, "single2", [
        ("Stomp + slam layered, rubberduck (CC0)", {"hit": [[S("rubberduck_creature2", "stomp_01.ogg"),
                                                             S("rubberduck_100", "slam_02.ogg", gain=-3)]]}),
        ("Earth blast, Leohpaz (CC-BY 4.0)", {"hit": [S("leohpaz_magic", "*/30_Earth_02.wav", len=1.1)]}),
        ("Low hit + slam layered, rubberduck (CC0)", {"hit": [[S("rubberduck_bfh", "bfh1_hit_02.ogg"),
                                                               S("rubberduck_100", "slam_03.ogg", gain=-2)]]}),
    ]),
    ("dash", "Dash whoosh", -20, "single3", [
        ("rubberduck air (CC0)", {"hit": [S("rubberduck_100v2", "sfx100v2_air_03.ogg")]}),
        ("Wind burst, Leohpaz (CC-BY 4.0)", {"hit": [S("leohpaz_magic", "*/25_Wind_01.wav", len=0.6)]}),
        ("Slowed swish + cloth, artisticdude/Kenney (CC0)", {"hit": [[S("artisticdude_swish", "swishes/swish-7.wav", rate=0.7),
                                                                       S("kenney_rpg", "OGG/cloth3.ogg", gain=-6)]]}),
    ]),
    ("cast_frost", "Frost Lance: charge (0.42 s, phase 'start') then release", -19, "cast", [
        ("Leohpaz charge + ice explosion (CC-BY 4.0)", {"charge": [S("leohpaz_magic", "*/45_Charge_05.wav", len=0.42, env="rise")],
                                                        "release": [S("leohpaz_magic", "*/13_Ice_explosion_01.wav", len=1.2)]}),
        ("artisticdude freeze + qubodup ice (CC0 / CC-BY 3.0)", {"charge": [S("artisticdude_freeze", "freeze.wav", len=0.42, env="rise")],
                                                                 "release": [S("qubodup_iceelec", "*/qubodupIceDamage03c.flac")]}),
        ("Bart ice + ignasd shatter (CC0)", {"charge": [S("bart_ice", "*ice.wav", len=0.42, env="rise")],
                                             "release": [S("ignasd_ice", "*/LedasLuzta5.ogg")]}),
    ]),
    ("cast_storm", "Storm Snare: charge (0.42 s, phase 'start') then release", -19, "cast", [
        ("Leohpaz charge + thunder (CC-BY 4.0)", {"charge": [S("leohpaz_magic", "*/45_Charge_05.wav", start=0.3, len=0.42, env="rise")],
                                                  "release": [S("leohpaz_magic", "*/18_Thunder_02.wav", len=1.4)]}),
        ("faxcorp electricity (CC0)", {"charge": [S("faxcorp_elec", "chargestart.wav", len=0.42, env="rise")],
                                       "release": [S("faxcorp_elec", "hit.wav", len=1.0)]}),
        ("faxcorp charge + qubodup zap (CC0 / CC-BY 3.0)", {"charge": [S("faxcorp_elec", "charge.wav", len=0.42, env="rise")],
                                                             "release": [S("qubodup_iceelec", "*/qubodupElectricityDamage01.flac")]}),
    ]),
    ("mob_skitter", "Skitter (insectoid): telegraph/attack, hurt, death", -21, "mob", [
        ("rubberduck bugs (CC0)", {"attack": [S("rubberduck_creature", "bug_04.ogg")], "hurt": [S("rubberduck_creature2", "bug_08.ogg")],
                                   "death": [S("rubberduck_creature2", "die_04.ogg")]}),
        ("artisticdude beetle (CC0)", {"attack": [S("artisticdude_rpg", f"{RSP}/NPC/beetle/bite-small.wav")],
                                       "hurt": [S("artisticdude_rpg", f"{RSP}/NPC/beetle/bite-small2.wav", rate=1.15)],
                                       "death": [S("artisticdude_rpg", f"{RSP}/NPC/beetle/bite-small3.wav", rate=0.8)]}),
        ("fvcalderan insects (CC0)", {"attack": [S("fvcalderan_insect", "*insect1.ogg")], "hurt": [S("fvcalderan_insect", "*insect3.ogg")],
                                      "death": [S("fvcalderan_insect", "*insect0.ogg")]}),
    ]),
    ("mob_hulker", "Hulker (heavy): slam attack, hurt, death", -18, "mob", [
        ("artisticdude giant + stomp (CC0)", {"attack": [[S("artisticdude_rpg", f"{RSP}/NPC/giant/giant1.wav"),
                                                          S("rubberduck_creature2", "stomp_01.ogg", gain=-2)]],
                                              "hurt": [S("artisticdude_rpg", f"{RSP}/NPC/giant/giant4.wav")],
                                              "death": [S("artisticdude_rpg", f"{RSP}/NPC/giant/giant2.wav")]}),
        ("artisticdude ogre + slam (CC0)", {"attack": [[S("artisticdude_rpg", f"{RSP}/NPC/ogre/ogre3.wav"),
                                                        S("rubberduck_100", "slam_03.ogg", gain=-4)]],
                                            "hurt": [S("artisticdude_rpg", f"{RSP}/NPC/ogre/ogre5.wav")],
                                            "death": [S("artisticdude_rpg", f"{RSP}/NPC/ogre/ogre2.wav")]}),
        ("rubberduck troll/roar (CC0)", {"attack": [[S("rubberduck_creature", "troll_02.ogg"),
                                                     S("rubberduck_creature2", "stomp_01.ogg", gain=-3)]],
                                         "hurt": [S("rubberduck_creature", "hurt_03.ogg")],
                                         "death": [S("rubberduck_rpg", "creature_die_01.ogg")]}),
    ]),
    ("mob_veilbell", "Veilbell (chime/magic): seed telegraph, hurt, death", -21, "mob", [
        ("pwl bell + artisticdude shade (CC0)", {"attack": [S("pwl_bell", "bell_ding2.wav", len=1.1)],
                                                 "hurt": [S("artisticdude_rpg", f"{RSP}/NPC/shade/shade2.wav")],
                                                 "death": [S("artisticdude_rpg", f"{RSP}/NPC/shade/shade12.wav")]}),
        ("rubberduck bells + alien (CC0)", {"attack": [S("rubberduck_100", "bell_02.ogg")],
                                            "hurt": [S("rubberduck_creature", "alien_03.ogg")],
                                            "death": [[S("rubberduck_100", "bell_03.ogg", gain=-4), S("rubberduck_creature", "alien_02.ogg")]]}),
        ("rubberduck spell + gong (CC0)", {"attack": [S("rubberduck_rpg", "spell_01.ogg")],
                                           "hurt": [S("rubberduck_rpg", "creature_misc_05.ogg")],
                                           "death": [[S("rubberduck_100", "gong_02.ogg"), S("rubberduck_rpg", "spell_02.ogg", gain=-4)]]}),
    ]),
    ("mob_crownrift", "Crownrift (blade): blade attack, hurt, death", -19, "mob", [
        ("rubberduck blades + artisticdude beast (CC0)", {"attack": [S("rubberduck_rpg", "blade_02.ogg")],
                                                          "hurt": [S("artisticdude_rpg", f"{RSP}/NPC/gutteral beast/mnstr2.wav")],
                                                          "death": [S("artisticdude_rpg", f"{RSP}/NPC/gutteral beast/mnstr14.wav")]}),
        ("artisticdude unsheathe + shade (CC0)", {"attack": [S("artisticdude_rpg", f"{RSP}/battle/sword-unsheathe5.wav")],
                                                  "hurt": [S("artisticdude_rpg", f"{RSP}/NPC/shade/shade14.wav")],
                                                  "death": [S("artisticdude_rpg", f"{RSP}/NPC/shade/shade9.wav")]}),
        ("Medicine Storm blade clash + rubberduck (CC0)", {"attack": [S("medicinestorm_medieval", "*/Sabre Katana Blade on Blade.wav", len=0.8)],
                                                           "hurt": [S("rubberduck_creature2", "monster_10.ogg")],
                                                           "death": [S("rubberduck_creature2", "die_02.ogg")]}),
    ]),
    ("iris_hurt", "Iris gets hit (3 hits), then goes down", -20, "hurt", [
        ("Cici Fyre voice type 1 (CC0)", {"hurt": [S("cicifyre_voice", f"{VOICE}/Type 1/damaged{i}.wav") for i in (1, 2, 3)],
                                          "down": [S("female_groans", "female_hurt_grunts_groans_1.ogg", seg=-1)]}),
        ("Cici Fyre voice type 2 (CC0)", {"hurt": [S("cicifyre_voice", f"{VOICE}/Type 2/damaged{i}.wav") for i in (1, 2, 3)],
                                          "down": [S("female_groans", "female_hurt_grunts_groans_1.ogg", seg=-1)]}),
        ("Cici Fyre voice type 3 (CC0)", {"hurt": [S("cicifyre_voice", f"{VOICE}/Type 3/damaged{i}.wav") for i in (1, 2, 3)],
                                          "down": [S("female_groans", "female_hurt_grunts_groans_1.ogg", seg=-1)]}),
    ]),
    ("chest", "Chest: drop from a mob, then open", -20, "chest", [
        ("rubberduck gem + Kenney door/coins (CC0)", {"drop": [S("rubberduck_rpg", "item_gem_02.ogg")],
                                                      "open": [[S("kenney_rpg", "OGG/doorOpen_1.ogg", len=0.8),
                                                                S("kenney_rpg", "OGG/handleCoins.ogg", gain=-4)]]}),
        ("rubberduck coins + wooden box (CC0)", {"drop": [S("rubberduck_rpg", "item_coins_03.ogg")],
                                                 "open": [S("rubberduck_100", "wooded_box_open.ogg")]}),
        ("rubberduck bell + lock/wood (CC0)", {"drop": [S("rubberduck_100", "bell_02.ogg", gain=-3)],
                                               "open": [[S("rubberduck_rpg", "lock_01.ogg"), S("rubberduck_rpg", "item_wood_02.ogg", gain=-3)]]}),
    ]),
]

# ---------------------------------------------------------------- fetching


def fetch():
    """Downloads and unpacks every source pack into CACHE (idempotent)."""
    dl, ext = CACHE / "dl", CACHE / "ext"
    dl.mkdir(parents=True, exist_ok=True)
    ext.mkdir(parents=True, exist_ok=True)
    for pid, src in SOURCES.items():
        out = ext / pid
        if (out / ".done").exists():
            continue
        out.mkdir(parents=True, exist_ok=True)
        for f in src["files"]:
            local = dl / urllib.request.unquote(f)
            if not local.exists():
                print("download", f, file=sys.stderr)
                with urllib.request.urlopen(OGA + f, timeout=180) as r:
                    local.write_bytes(r.read())
            if local.suffix == ".zip":
                with zipfile.ZipFile(local) as z:
                    z.extractall(out)
            elif local.suffix == ".7z":
                import py7zr
                with py7zr.SevenZipFile(local) as z:
                    z.extractall(out)
            else:
                (out / local.name).write_bytes(local.read_bytes())
        (out / ".done").write_text("ok")


def resolve(s):
    base = CACHE / "ext" / s["pack"]
    hits = sorted(p for p in base.rglob("*") if p.is_file() and "__MACOSX" not in p.parts and p.match(s["path"]))
    if not hits:
        raise FileNotFoundError(f"{s['pack']}: {s['path']}")
    return hits[0]


# ---------------------------------------------------------------- processing


def decode(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64)


def segments(x, floor_db=-36, min_gap=0.18, min_len=0.12):
    """Splits a long take into sounds on silence (envelope below floor relative to the peak)."""
    env = np.convolve(np.abs(x), np.ones(480) / 480, mode="same")
    on = env > env.max() * 10 ** (floor_db / 20)
    out, start, quiet = [], None, 0
    for i in range(0, len(on), 240):
        if on[i]:
            if start is None:
                start = i
            quiet = 0
        elif start is not None:
            quiet += 240
            if quiet > min_gap * SR:
                if i - quiet - start > min_len * SR:
                    out.append((start, i - quiet + 240))
                start, quiet = None, 0
    if start is not None:
        out.append((start, len(on)))
    return out


def true_peak(x):
    return np.max(np.abs(signal.resample_poly(x, 4, 1))) if len(x) else 0.0


def clean(s):
    """Decodes one source and applies its per-file processing; returns float64 mono at SR."""
    x = decode(resolve(s))
    if "seg" in s:
        seg = segments(x)
        # longest sound for seg=-1 (the most drawn-out groan), otherwise by index
        a, b = max(seg, key=lambda ab: ab[1] - ab[0]) if s["seg"] == -1 else seg[s["seg"]]
        x = x[a:b]
    if s.get("rate", 1.0) != 1.0:
        up, down = int(round(1000 / s["rate"])), 1000
        x = signal.resample_poly(x, up, down)
    # trim leading/trailing silence (relative to this file's peak)
    a = np.abs(x)
    nz = np.nonzero(a > a.max() * 10 ** (-42 / 20))[0]
    x = x[max(0, nz[0] - int(0.004 * SR)): nz[-1] + 1]
    if "start" in s:
        x = x[int(s["start"] * SR):]
    if "len" in s:
        x = x[: int(s["len"] * SR)]
    # gentle high-pass: rumble and DC out
    x = signal.sosfilt(signal.butter(2, 40, "highpass", fs=SR, output="sos"), x)
    if s.get("env") == "rise":  # a charge swells into the release
        t = np.linspace(0, 1, len(x))
        x = x * (0.25 + 0.75 * t ** 1.6)
    fi, fo = int(0.002 * SR), int(min(0.04, len(x) / SR * 0.2) * SR)
    x[:fi] *= np.linspace(0, 1, fi)
    if fo > 0:
        x[-fo:] *= np.linspace(1, 0, fo) ** 2
    return x * 10 ** (s.get("gain", 0) / 20)


def active_rms_db(x):
    a = np.abs(x)
    nz = np.nonzero(a > a.max() * 0.05)[0]
    seg = x[nz[0]: nz[-1] + 1] if len(nz) else x
    return 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12)


def master(x, target_db, ceiling_db=-1.0):
    """Loudness-match to target (active RMS) and keep the true peak at or under the ceiling."""
    x = x * 10 ** ((target_db - active_rms_db(x)) / 20)
    pk = true_peak(x)
    lim = 10 ** (ceiling_db / 20)
    if pk > lim:
        x = x * (lim / pk)
    return x


def build_sound(item, target):
    """An item is one S(...) or a list of them layered together; result is mastered."""
    layers = item if isinstance(item, list) else [item]
    ys = [clean(s) for s in layers]
    n = max(len(y) for y in ys)
    mix = np.zeros(n)
    for y in ys:
        mix[: len(y)] += y
    return master(mix, target)


# ---------------------------------------------------------------- demo


def tone(freq, dur, amp=0.18):
    t = np.arange(int(dur * SR)) / SR
    y = amp * np.sin(2 * np.pi * freq * t)
    f = int(0.006 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def gap(sec):
    return np.zeros(int(sec * SR))


def place(track, y, at):
    i = int(at * SR)
    if i + len(y) > len(track):
        track = np.concatenate([track, np.zeros(i + len(y) - len(track))])
    track[i: i + len(y)] += y
    return track


def pattern(kind, snd, ref_swing):
    """Lays out one alternative; snd is {slot: [mastered arrays]}. Returns a mono array."""
    tr = np.zeros(1)
    if kind == "steps":
        st = snd["step"]
        t = 0.0
        for i in range(8):  # walk: ~1.9 steps/s
            tr = place(tr, st[i % len(st)] * (0.85 + 0.15 * ((i * 7) % 3) / 2), t)
            t += 0.52
        t += 0.4
        for i in range(10):  # run: ~3 steps/s, a touch louder
            tr = place(tr, st[(i * 3) % len(st)] * 1.12, t)
            t += 0.33
    elif kind == "combo_swing":
        sw = snd["swing"]
        t = 0.0
        for rep in range(2):
            for i, dt in enumerate((0.0, 0.38, 0.76)):
                tr = place(tr, sw[(i + rep) % len(sw)], t + dt)
            t += 1.6
    elif kind == "combo_impact":
        im = snd["impact"]
        t = 0.0
        for rep in range(2):
            for i, dt in enumerate((0.0, 0.38, 0.76)):
                tr = place(tr, ref_swing[i % len(ref_swing)] * 0.7, t + dt)
                tr = place(tr, im[(i + rep) % len(im)], t + dt + 0.09)
            t += 1.7
    elif kind in ("single2", "single3"):
        h = snd["hit"]
        for i in range(2 if kind == "single2" else 3):
            tr = place(tr, h[i % len(h)], i * 1.3)
    elif kind == "cast":
        for rep in range(2):
            t0 = rep * 2.2
            tr = place(tr, snd["charge"][0], t0)
            tr = place(tr, snd["release"][0], t0 + 0.42)
    elif kind == "mob":
        tr = place(tr, snd["attack"][0], 0.0)
        tr = place(tr, snd["hurt"][0], 1.2)
        tr = place(tr, snd["hurt"][0], 1.9)
        tr = place(tr, snd["death"][0], 2.8)
    elif kind == "hurt":
        for i, h in enumerate(snd["hurt"]):
            tr = place(tr, h, i * 0.9)
        tr = place(tr, snd["down"][0], 3.0)
    elif kind == "chest":
        tr = place(tr, snd["drop"][0], 0.0)
        tr = place(tr, snd["open"][0], 1.4)
    return tr


def build_demo(out_ogg, out_md):
    track = gap(0.4)
    rows, credits = [], {}
    ref_swing = None
    for cid, title, target, kind, alts in CATEGORIES:
        cat_t = len(track) / SR
        # category chime: two rising notes
        track = np.concatenate([track, tone(660, 0.12), gap(0.04), tone(990, 0.18), gap(0.6)])
        for ai, (label, slots) in enumerate(alts):
            letter = "ABC"[ai]
            for _ in range(ai + 1):
                track = np.concatenate([track, tone(1400, 0.06, 0.12), gap(0.09)])
            track = np.concatenate([track, gap(0.35)])
            t = len(track) / SR
            snd = {k: [build_sound(it, target) for it in v] for k, v in slots.items()}
            if cid == "strike_swing" and ai == 0:
                ref_swing = snd["swing"]
            y = pattern(kind, snd, ref_swing)
            track = np.concatenate([track, y, gap(1.0)])
            files = []
            for v in slots.values():
                for it in v:
                    for s in (it if isinstance(it, list) else [it]):
                        rel = resolve(s).relative_to(CACHE / "ext" / s["pack"])
                        files.append(f"{s['pack']}:{rel.as_posix()}")
                        credits[s["pack"]] = SOURCES[s["pack"]]
            rows.append((cid, title, letter, label, t, files))
        print(f"{cid}: starts {cat_t:6.1f}s", file=sys.stderr)
    track = np.concatenate([track, gap(0.5)])
    pk = np.max(np.abs(track))
    if pk > 10 ** (-1 / 20):
        track *= 10 ** (-1 / 20) / pk
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "demo.wav"
        wavfile.write(wav, SR, track.astype(np.float32))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libopus", "-b:a", "96k",
                        "-vbr", "on", "-compression_level", "10", "-map_metadata", "-1", str(out_ogg)], check=True)
    write_md(out_md, rows, credits, len(track) / SR)


def mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def write_md(path, rows, credits, total):
    L = ["# Sound pass v2: library candidates (owner review)", "",
         "Recorded/produced SFX from licensed libraries, replacing the synthesized set that was not approved.",
         "Listen to [`demo_v2.ogg`](demo_v2.ogg) and pick one alternative per category (for example: "
         "`step_stone B, step_wood A, ...`). Nothing is wired into the game until the picks are in.", "",
         "How the demo is laid out: a two-note rising chime starts each category; then each alternative is announced "
         "by short beeps (one beep = A, two = B, three = C) and played in a small game-like pattern "
         "(walk then run for footsteps, a 3-hit combo for strikes, charge then release for casts, "
         "attack/hurt/hurt/death for mobs).", "",
         "Every candidate is trimmed, high-passed at 40 Hz, given short fades, loudness-matched within its category "
         "and limited to -1 dBTP. After the picks, the chosen files are mastered the same way into "
         "`game/public/assets/audio/` and credited in `docs/art/manifest.md` and the README.", "",
         f"Total length: {mmss(total)}.", "",
         "| Time | Category | Alt | Candidate | Source files (pack:path) |", "|---|---|---|---|---|"]
    last = None
    for cid, title, letter, label, t, files in rows:
        cat = f"**{cid}**: {title}" if cid != last else ""
        last = cid
        uniq = list(dict.fromkeys(files))
        L.append(f"| {mmss(t)} | {cat} | {letter} | {label} | {'<br>'.join('`' + f + '`' for f in uniq)} |")
    L += ["", "## Sources and licences", "",
          "All packs are from OpenGameArt. CC0 packs need no credit (given anyway); CC-BY packs must be credited "
          "if picked.", "", "| Pack id | Title | Author | Licence | Page |", "|---|---|---|---|---|"]
    for pid, s in credits.items():
        L.append(f"| `{pid}` | {s['title']} | {s['author']} | {s['licence']} | {s['page']} |")
        for k, v in s.get("attribution", {}).items():
            L.append(f"| | ↳ `{k}` | {v} | {s['licence']} | |")
    L += ["", "Rebuild: `python3 art/audio/build_sfx_library.py` (downloads into `~/.cache/ftf-sfx`).", ""]
    Path(path).write_text("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", default=str(ROOT / "docs/audio/demo_v2.ogg"))
    a = ap.parse_args()
    fetch()
    build_demo(Path(a.demo), Path(a.demo).with_suffix(".md"))


if __name__ == "__main__":
    main()
