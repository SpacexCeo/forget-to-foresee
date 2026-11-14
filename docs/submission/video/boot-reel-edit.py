#!/usr/bin/env python3
"""The loading-screen reel (game/public/assets/video/boot-reel.mp4): the new fights, heroines and effects.

Usage: python3 reel.py
HUD-free clips from scenes.cjs (NOHUD=1). Output: 1280x720, 30 fps, H.264 High, no audio, under 3 MB (two-pass).
The page plays it muted, looped, dimmed and slightly blurred under the loading screen (index.html .boot-reel).
"""
import os, subprocess

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
CLIPS, OUT = f"{ROOT}/clips", f"{ROOT}/out2"
XF = 0.3
# (clip, in, out, zoom or None)
SEGS = [
    ("boss2_nh", 2.4, 5.8, None),      # the serpent rises, the first ring
    ("boss1_nh", 0.2, 3.2, None),      # ice lance at the Crownrift
    ("boss2_nh", 8.0, 11.2, None),     # the breath cone
    ("boss1_nh", 3.0, 6.0, None),      # lightning
    ("fight_nh", 0.2, 4.0, None),      # spiders in ice and storm
    ("boss2_nh", 12.0, 15.2, None),    # the slam
    ("hatch_nh", 2.2, 5.6, (1.3, 900, 560)),   # the Hatchkeeper's dragons
    ("boss1_nh", 7.0, 10.0, None),
    ("boss2_nh", 18.0, 21.4, None),
    ("wake", 25.6, 29.2, (1.25, 960, 440)),    # Iris at the resonator
    ("boss2_nh", 27.6, 31.0, None),    # crystals
    ("boss1_nh", 19.0, 22.2, None),
    ("boss2_nh", 33.6, 37.2, None),    # the sweep
]


def run(cmd):
    print(" ".join(cmd)[:200], flush=True)
    subprocess.run(cmd, check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    cmd, fc = ["ffmpeg", "-nostdin", "-v", "error", "-y"], []
    for i, (clip, a, b, zoom) in enumerate(SEGS):
        cmd += ["-ss", str(a), "-t", str(b - a), "-i", f"{CLIPS}/{clip}.mp4"]
        f = f"[{i}:v]setpts=PTS-STARTPTS,fps=30"
        if zoom:
            z, cx, cy = zoom
            w, h = int(1920 / z) // 2 * 2, int(1080 / z) // 2 * 2
            f += f",crop={w}:{h}:{min(max(cx - w // 2, 0), 1920 - w)}:{min(max(cy - h // 2, 0), 1080 - h)}"
        fc.append(f + ",scale=1280:720:flags=lanczos,format=yuv420p,settb=AVTB[s%d]" % i)
    cum, prev = SEGS[0][2] - SEGS[0][1], "s0"
    for i in range(1, len(SEGS)):
        off = cum - XF
        fc.append(f"[{prev}][s{i}]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]")
        cum, prev = off + SEGS[i][2] - SEGS[i][1], f"x{i}"
    # the loop point: fade through dark at both ends
    fc.append(f"[{prev}]fade=t=in:st=0:d=0.5,fade=t=out:st={cum-0.5:.3f}:d=0.5[v]")
    script = f"{OUT}/fc_reel.txt"
    open(script, "w").write(";\n".join(fc))
    mid = f"{OUT}/reel-master.mp4"
    run(cmd + ["-filter_complex_script", script, "-map", "[v]", "-t", f"{cum:.3f}", "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-r", "30", "-an", mid])
    kbps = int(2.85e6 * 8 / cum / 1000)          # under 3 MB with room for the container
    common = ["-c:v", "libx264", "-preset", "veryslow", "-profile:v", "high", "-b:v", f"{kbps}k", "-maxrate", f"{int(kbps*1.6)}k", "-bufsize", f"{kbps*3}k",
              "-pix_fmt", "yuv420p", "-r", "30", "-an", "-passlogfile", f"{OUT}/reel2p"]
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", mid] + common + ["-pass", "1", "-f", "null", "/dev/null"])
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", mid] + common + ["-pass", "2", "-movflags", "+faststart", f"{OUT}/boot-reel.mp4"])
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"{OUT}/boot-reel.mp4", "-vf", "fps=1/2,scale=320:180,tile=10x2", "-q:v", "4", f"{OUT}/boot-reel-sheet.jpg"])
    print("REEL", round(cum, 2), "s", os.path.getsize(f"{OUT}/boot-reel.mp4"), "bytes", kbps, "kbps")


if __name__ == "__main__":
    main()
