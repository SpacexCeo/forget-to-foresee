#!/usr/bin/env python3
"""Ambient music candidates (owner, 12.11: "a great ambient bed"): fetch, excerpt and build the owner review demo.

Only music we may redistribute and modify in a public repository, with credits: Scott Buckley's library and Kevin
MacLeod's incompetech catalogue, both Creative Commons Attribution 4.0. No famous copyrighted tracks, no unlicensed
remixes.

Writes docs/audio/music_demo.ogg (four scenes x four candidates, 40 s each, announced like the SFX demos: a two-note
chime per scene, then 1-4 beeps per candidate) and docs/audio/music_demo.md (timetable, sources, licences and the
credit line each track needs). Downloads go to FTF_SFX_CACHE/music (default ~/.cache/ftf-sfx/music). Nothing is
wired into the game until the owner picks. Requires numpy, scipy and ffmpeg with libopus.

Usage: python3 art/audio/build_music_demo.py
"""
import os
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

import numpy as np
from scipy.io import wavfile

SR = 48000
ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get("FTF_SFX_CACHE", Path.home() / ".cache" / "ftf-sfx")) / "music"
SB = "https://www.scottbuckley.com.au/library/wp-content/uploads/"
KM = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/"
EXCERPT = 40.0


def sb(title, path, start=None):
    return dict(title=title, artist="Scott Buckley", url=SB + path, start=start, licence="CC-BY 4.0",
                page="https://www.scottbuckley.com.au/library/",
                credit=f'"{title}" by Scott Buckley, released under CC-BY 4.0 (www.scottbuckley.com.au)')


def km(title, start=None, filename=None):
    return dict(title=title, artist="Kevin MacLeod", url=KM + urllib.parse.quote(filename or title + ".mp3"), start=start,
                licence="CC-BY 4.0", page="https://incompetech.com/music/royalty-free/music.html",
                credit=f'"{title}" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 '
                       "(http://creativecommons.org/licenses/by/4.0/)")


# scene -> (title, [candidates]); `start` (seconds) picks the excerpt, else 30% into the track
SCENES = [
    ("town_night", "The town at evening and night (calm bed under the streets)", [
        sb("Nightfall", "2019/05/sb_nightfall.mp3"),
        sb("Moonlight", "2022/07/Moonlight.mp3"),
        km("Dreams Become Real"),
        sb("Hiraeth", "2020/06/sb_hiraeth.mp3"),
    ]),
    ("rain", "Rain (the weather turns: drizzle, rain, storm)", [
        sb("Petrichor", "2019/05/sb_petrichor.mp3"),
        sb("Tears in Rain", "2019/07/sb_tearsinrain.mp3"),
        sb("Permafrost", "2022/08/Permafrost.mp3"),
        km("Floating Cities"),
    ]),
    ("archipelago", "The archipelago and the tournament (wonder, a little epic)", [
        sb("Adrift Among Infinite Stars", "2022/02/AdriftAmongInfiniteStars.mp3"),
        sb("Call to Adventure", "2023/01/CallToAdventure.mp3"),
        sb("Legionnaire", "2022/04/sb_legionnaire2022.mp3"),
        km("Frozen Star"),
    ]),
    ("combat", "Combat outside the walls (subtle drums, tension)", [
        km("Stormfront"),
        km("Drums of the Deep"),
        sb("Incantation", "2024/09/Incantation.mp3"),
        km("Lasting Hope"),
    ]),
]


def fetch(c):
    CACHE.mkdir(parents=True, exist_ok=True)
    local = CACHE / urllib.parse.unquote(c["url"].rsplit("/", 1)[1])
    if not local.exists():
        print("download", c["title"], file=sys.stderr)
        subprocess.run(["curl", "-sSfL", "-m", "300", "-o", str(local), c["url"]], check=True)
    return local


def decode(path, start, dur):
    """Stereo float excerpt, loudness-normalized by ffmpeg's EBU R128 filter to -20 LUFS (true peak -1.5 dBTP)."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(path),
                        "-af", "loudnorm=I=-20:TP=-1.5:LRA=11", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64).reshape(-1, 2)


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def tone(freq, dur, amp=0.16):
    t = np.arange(int(dur * SR)) / SR
    y = amp * np.sin(2 * np.pi * freq * t)
    f = int(0.006 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return np.stack([y, y], 1)


def gap(s):
    return np.zeros((int(s * SR), 2))


def mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def main():
    parts, rows, t = [gap(0.4)], [], 0.4
    for sid, title, cands in SCENES:
        parts += [tone(660, 0.12), gap(0.04), tone(990, 0.18), gap(0.6)]
        t += 0.94
        for i, c in enumerate(cands):
            for _ in range(i + 1):
                parts += [tone(1400, 0.06, 0.1), gap(0.09)]
                t += 0.15
            parts.append(gap(0.35))
            t += 0.35
            path = fetch(c)
            total = duration(path)
            start = c["start"] if c["start"] is not None else max(0.0, min(total * 0.3, total - EXCERPT))
            y = decode(path, start, EXCERPT)
            f = int(2.0 * SR)  # 2 s fades in and out
            y[:f] *= np.linspace(0, 1, f)[:, None]
            y[-f:] *= np.linspace(1, 0, f)[:, None]
            rows.append((sid, title, i + 1, c, t, start, total))
            parts += [y, gap(1.0)]
            t += len(y) / SR + 1.0
            print(f"{sid} {i + 1} {c['title']}: {mmss(start)} of {mmss(total)}", file=sys.stderr)
    track = np.concatenate(parts + [gap(0.5)])
    pk = np.max(np.abs(track))
    if pk > 10 ** (-1 / 20):
        track *= 10 ** (-1 / 20) / pk
    out = ROOT / "docs/audio/music_demo.ogg"
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "m.wav"
        wavfile.write(wav, SR, track.astype(np.float32))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libopus", "-b:a", "80k",
                        "-vbr", "on", "-compression_level", "10", "-map_metadata", "-1", str(out)], check=True)
    write_md(out.with_suffix(".md"), rows, len(track) / SR)


def write_md(path, rows, total):
    L = ["# Ambient music candidates (owner review)", "",
         "Music we may redistribute and modify in this public repository, with credits: Scott Buckley's library and "
         "Kevin MacLeod's incompetech catalogue, both Creative Commons Attribution 4.0. No famous copyrighted tracks "
         "and no unlicensed remixes.", "",
         "Listen to [`music_demo.ogg`](music_demo.ogg) and pick one track per scene (for example: `town_night 2, "
         "rain 1, archipelago 3, combat 1`). A two-note chime starts each scene; then 1-4 beeps announce the candidate, "
         "which plays a 40 s excerpt (2 s fades), loudness-matched to -20 LUFS.", "",
         "After the picks: each track is cut into a seamless loop, the beds crossfade by zone, weather and combat, "
         "duck under the sound effects and follow the music slider; the credits go into `docs/art/manifest.md` and "
         "the README.", "", f"Total length: {mmss(total)}.", "",
         "| Time | Scene | # | Track | Artist | Excerpt from | Licence |", "|---|---|---|---|---|---|---|"]
    last = None
    for sid, title, n, c, t, start, dur in rows:
        L.append(f"| {mmss(t)} | {f'**{sid}**: {title}' if sid != last else ''} | {n} | {c['title']} | {c['artist']} | "
                 f"{mmss(start)} of {mmss(dur)} | {c['licence']} |")
        last = sid
    L += ["", "## Sources and credit lines", "", "| Track | Download | Credit line (required if picked) |", "|---|---|---|"]
    for sid, title, n, c, t, start, dur in rows:
        L.append(f"| {c['title']} | {c['url']} | {c['credit']} |")
    L += ["", "Licence pages: Scott Buckley states \"All music is licensed under Creative Commons Attribution 4.0\" "
          "(https://www.scottbuckley.com.au/library/); incompetech: \"Licensed under Creative Commons: By Attribution "
          "4.0\" (https://incompetech.com/music/royalty-free/licenses/).", "",
          "Rebuild: `python3 art/audio/build_music_demo.py` (downloads into `~/.cache/ftf-sfx/music`).", ""]
    Path(path).write_text("\n".join(L))


if __name__ == "__main__":
    main()
