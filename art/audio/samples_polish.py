"""samples_polish.py <pack root> <audio dir> <manifest.js>: the trailer sound pass (14.11) on recorded CC0 sounds.

Sources (all CC0, OpenGameArt; the same archives art/audio/build_sfx_library.py fetches), unpacked under <pack root>:
  RPGsounds_Kenney.zip (Kenney), 80-CC0-RPG-SFX_0.zip, 80-CC0-creature-SFX_0.zip, 80-CC0-creature-sfx-2.zip,
  100-CC0-SFX_0.zip, sfx_100_v2.zip (rubberduck).
Two kinds of entries:
  * overrides of existing synthesized names (the melee impacts, the roll/dash whoosh): the game code stays the same;
  * new sounds (the boss's roar, inhale, breath and stagger, the spider's death, the chest, the NFT reveal, quests,
    the level-up) that the game cues by name.
Each output is one or more layers (file, pitch factor, gain dB, delay s), mixed to mono 48 kHz, trimmed of silence,
loudness-matched to a reference sound already in the game (RMS; a limiter holds the peak at -2 dBFS, under -1 after Opus) and encoded as Ogg Opus.
Writes game/src/audio/sample-polish.js (SAMPLE_POLISH = {sounds, groups}); audio.js withSamples merges it.
"""
import json
import os
import re
import subprocess
import sys

PACK, OUT, MANIFEST = sys.argv[1], sys.argv[2], sys.argv[3]

KEN = "Kenney RPG Audio"
RD_RPG, RD_CR, RD_CR2, RD_100, RD_100B = ("rubberduck 80 CC0 RPG SFX", "rubberduck 80 CC0 creature SFX",
                                         "rubberduck 80 CC0 creature SFX #2", "rubberduck 100 CC0 SFX", "rubberduck 100 CC0 SFX #2")
PACKS = {"RPGsounds_Kenney": KEN, "80-CC0-RPG-SFX_0": RD_RPG, "80-CC0-creature-SFX_0": RD_CR,
         "80-CC0-creature-sfx-2": RD_CR2, "100-CC0-SFX_0": RD_100, "sfx_100_v2": RD_100B}

# name -> (kind, reference sound for loudness, offset dB vs the reference, [layers (pack, file, rate, gain dB, delay s)], extra filter)
L = lambda pack, f, rate=1.0, gain=0.0, delay=0.0: (pack, f, rate, gain, delay)
SPEC = {
    # melee hits: recorded thuds instead of the synthesized impacts (overrides)
    **{f"strike_impact_{i + 1}": ("sfx", "strike_impact_1", 0, [L("100-CC0-SFX_0", f"hit_0{i + 1}.ogg"), L("RPGsounds_Kenney", "chop.ogg", 1.1, -9)], "highpass=f=60")
       for i in range(4)},
    # the roll / dash: a burst of air with a cloth flap (overrides)
    **{f"dash_whoosh_{i + 1}": ("sfx", "dash_whoosh_1", 1, [L("sfx_100_v2", f"sfx100v2_air_0{i + 1}.ogg"), L("RPGsounds_Kenney", f"cloth{i + 1}.ogg", 1.0, -8, 0.02)],
                                   "highpass=f=120,atrim=0:0.6,afade=t=out:st=0.4:d=0.2")
       for i in range(3)},
    # the ice serpent: a slowed roar (phase change), the inhale, the breath stream, the reel when its crest opens
    "boss_roar_1": ("sting", "strike_heavy_1", 2, [L("80-CC0-creature-sfx-2", "roar_05.ogg", 0.72), L("80-CC0-RPG-SFX_0", "creature_roar_01.ogg", 0.6, -6, 0.05)], "lowpass=f=6000"),
    "boss_roar_2": ("sting", "strike_heavy_1", 2, [L("80-CC0-creature-sfx-2", "roar_06.ogg", 0.72), L("80-CC0-RPG-SFX_0", "creature_roar_02.ogg", 0.6, -6, 0.05)], "lowpass=f=6000"),
    "boss_inhale": ("sfx", "cast_charge_frost", 2, [L("80-CC0-creature-sfx-2", "breath_02.ogg", 0.7)], "lowpass=f=7000"),
    "boss_breath": ("sfx", "strike_heavy_1", -2, [L("sfx_100_v2", "sfx100v2_air_01.ogg", 0.6), L("80-CC0-creature-SFX_0", "breath.ogg", 0.55, -3), L("sfx_100_v2", "sfx100v2_glass_03.ogg", 0.8, -10, 0.15)],
                    "atrim=0:2.4,afade=t=out:st=1.6:d=0.8"),
    "boss_stagger": ("sfx", "strike_heavy_1", -1, [L("80-CC0-creature-SFX_0", "hurt_05.ogg", 0.7), L("100-CC0-SFX_0", "slam_02.ogg", 0.9, -6)], ""),
    # the spider (skitter) dies with a chitter and squelch, on top of the memory-dissolve shimmer
    **{f"mob_death_bug_{i + 1}": ("sfx", "mob_hurt_small_1", 0, [L("80-CC0-creature-sfx-2", f, 1.08)], "highpass=f=90")
       for i, f in enumerate(["die_01.ogg", "die_03.ogg", "die_04.ogg"])},
    # loot and progress
    "chest_open": ("sfx", "gift_chime", 0, [L("RPGsounds_Kenney", "metalLatch.ogg"), L("100-CC0-SFX_0", "wooded_box_open.ogg", 1.0, 0, 0.12)], ""),
    "nft_reveal": ("sting", "gift_chime", 1, [L("100-CC0-SFX_0", "bell_02.ogg"), L("80-CC0-RPG-SFX_0", "item_gem_01.ogg", 1.0, -4, 0.05)], ""),
    "quest_accept": ("ui", "ui_confirm", 0, [L("RPGsounds_Kenney", "bookOpen.ogg"), L("RPGsounds_Kenney", "bookFlip1.ogg", 1.0, -4, 0.1)], ""),
    "quest_complete": ("sting", "gift_chime", 1, [L("80-CC0-RPG-SFX_0", "item_coins_02.ogg"), L("100-CC0-SFX_0", "bell_01.ogg", 1.0, -3, 0.1)], ""),
    "level_up": ("sting", "gift_chime", 2, [L("100-CC0-SFX_0", "bell_03.ogg"), L("80-CC0-RPG-SFX_0", "item_gem_03.ogg", 1.0, -3, 0.08)], ""),
}


def find(pack, name):
    for root, _, files in os.walk(os.path.join(PACK, pack)):
        if name in files:
            return os.path.join(root, name)
    raise SystemExit(f"missing {pack}/{name}")


def stats(path):
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-af", "astats=measure_perchannel=none", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    f = lambda v: -90.0 if v == "-inf" else float(v)
    return f(re.findall(r"RMS level dB:\s+(-?[\d.]+|-inf)", r)[-1]), f(re.findall(r"Peak level dB:\s+(-?[\d.]+|-inf)", r)[-1])


def ref_file(name):
    k = os.path.join(OUT, "k_" + name + ".ogg")  # an earlier recorded override is what the game plays now
    return k if os.path.exists(k) else os.path.join(OUT, name + ".ogg")


sounds, groups = {}, {}
for name, (kind, ref, off, layers, extra) in SPEC.items():
    target = max(-40.0, min(-8.0, stats(ref_file(ref))[0] + off))
    args, chains = [], []
    for k, (pack, f, rate, gain, delay) in enumerate(layers):
        args += ["-i", find(pack, f)]
        c = f"[{k}:a]aformat=channel_layouts=mono,aresample=48000"
        if rate != 1.0:
            c += f",asetrate={48000 * rate:.0f},aresample=48000"
        c += f",volume={gain}dB"
        if delay:
            c += f",adelay={int(delay * 1000)}"
        chains.append(c + f"[l{k}]")
    mix = "".join(f"[l{k}]" for k in range(len(layers)))
    post = ",".join(x for x in ["silenceremove=start_periods=1:start_threshold=-55dB", extra,
                                "areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse"] if x)
    fc = ";".join(chains) + f";{mix}amix=inputs={len(layers)}:normalize=0:duration=longest,{post}[o]"
    tmp = os.path.join(OUT, "_" + name + ".wav")
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", *args, "-filter_complex", fc, "-map", "[o]", tmp], check=True)
    cur, pk = stats(tmp)
    gain = target - cur  # the limiter below holds the peak at -2 dBFS (Opus overshoots by ~1 dB) when the source is peaky
    file = "p_" + name + ".ogg"
    dst = os.path.join(OUT, file)
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", tmp, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.79:attack=1:release=40:level=0",
                    "-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-map_metadata", "-1", dst], check=True)
    os.remove(tmp)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst],
                               capture_output=True, text=True).stdout.strip())
    src = "; ".join(f"{PACKS[p]} (CC0): {f}" for p, f, *_ in layers)
    sounds[name] = {"file": file, "kind": kind, "dur": round(dur, 3), "channels": 1, "source": src}
    m = re.match(r"(.+)_\d+$", name)
    if m:
        groups.setdefault(m.group(1), []).append(name)
    print(f"[polish] {name:18s} {cur:6.1f} -> {target:6.1f} dB RMS (gain {gain:+.1f}), {dur:.2f} s, {os.path.getsize(dst) // 1024} KB")

with open(MANIFEST, "w") as f:
    f.write("// GENERATED by art/audio/samples_polish.py; do not edit by hand. The trailer sound pass (CC0 recordings):\n"
            "// new sounds and overrides of synthesized ones of the same name (audio.js withSamples).\n"
            "export const SAMPLE_POLISH = " + json.dumps({"sounds": sounds, "groups": groups}, indent=2) + ";\n")
print("[polish] wrote", MANIFEST, len(sounds))
