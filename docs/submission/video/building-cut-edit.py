#!/usr/bin/env python3
"""Forget to Foresee: the "what we are building" cut (v2) from clips recorded in the real game.

Usage: python3 cut2.py [draft|main|nomusic|all]
Clips come from scenes.cjs (clips/*.mp4, 1920x1080 60 fps). Each feature is: caption, footage, next.
Music: "Goliath" by Scott Buckley, CC BY 4.0 (www.scottbuckley.com.au).
"""
import os, subprocess, sys, urllib.request

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
CLIPS, MUSIC, OUT = f"{ROOT}/clips", f"{ROOT}/music/goliath.mp3", f"{ROOT}/out2"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_T = f"{ROOT}/title.ttf"
URL = "spacexceo.github.io/forget-to-foresee"
CREDIT = "Music: 'Goliath' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au"
MUSIC_FROM = 45.0   # the track's full entrance
END = 6.5
Z = (1.45, 962, 540)          # the game menu / ledger / wheel panel
ZC = (1.6, 960, 535)          # the tournament card
ZS = (1.4, 965, 535)          # the stall panel
ZR = (1.7, 960, 505)          # the chest reel and its card
ZCHAT = (1.5, 640, 720)       # the chat panel and both heroines

# (caption, [(clip, in, out, speed, zoom or None, extra caption or None), ...])
FEATURES = [
    (None, [("flyin", 0.2, 5.6, 1, None, None)]),                               # the title rides on the flight
    ("She wakes up in another world", [("wake", 6.0, 8.6, 1, None, None), ("wake", 25.5, 30.0, 1.5, None, None),
                                       ("wake", 31.0, 32.4, 1, None, None), ("wake", 39.6, 47.0, 1, None, None)]),
    ("The townsfolk talk to her", [("talk", 1.0, 4.3, 1, None, None), ("talk", 5.6, 9.0, 1, None, None)]),
    ("Monsters outside the walls", [("fight", 0.2, 5.2, 1, None, None)]),
    ("A shared town: other players, live chat", [("mp", 0.6, 5.0, 1, None, None), ("mp", 6.0, 9.0, 1, ZCHAT, None),
                                                 ("mp", 14.0, 16.6, 1, ZCHAT, None), ("mp", 18.2, 21.6, 1, None, None)]),
    ("Quests and a town map", [("quests", 1.3, 4.0, 1, None, None), ("quests", 6.2, 8.4, 1, None, None), ("quests", 11.6, 14.4, 1, None, None)]),
    ("The Tournament: agents can enter too", [("tournament", 0.3, 2.6, 1, None, None), ("tournament", 3.3, 5.3, 1, ZC, None), ("tournament", 7.2, 10.4, 1, ZC, None)]),
    ("A market of 20 traders, each a NEAR account", [("market", 1.3, 5.6, 1, ZS, None), ("ledger", 1.4, 5.0, 1, Z, "18,000+ on-chain trades a day"), ("ledger", 6.2, 9.4, 1, Z, None)]),
    ("Spin the wheel. Open chests.", [("wheel", 4.0, 7.2, 1, Z, None), ("wheel", 10.6, 13.0, 1, Z, None), ("chest", 1.3, 4.0, 1, ZR, None), ("chest", 8.6, 11.0, 1, ZR, None)]),
    ("NFTs you earn in play", [("menu", 1.3, 4.2, 1, Z, None), ("menu", 5.0, 7.6, 1, (1.25, 960, 540), None)]),
    ("Dragons", [("hatch", 1.6, 7.4, 1, (1.3, 900, 560), None), ("ride", 0.4, 3.2, 1, None, None)]),
    ("Boss one: the Crownrift", [("boss1", 0.3, 3.3, 1, None, None), ("boss1", 5.0, 7.0, 1, None, None), ("boss1", 18.5, 20.8, 1, None, None), ("boss1", 24.0, 27.2, 1, None, None)]),
    ("Boss two: the serpent of the Glass Shoal", [("boss2", 0.8, 3.2, 1, None, None), ("boss2", 4.2, 6.8, 1, None, None), ("boss2", 8.5, 10.5, 1, None, None),
                                                  ("boss2", 33.0, 36.0, 1, None, None), ("boss2", 45.5, 48.8, 1, None, None), ("boss2", 62.5, 64.0, 1, None, None),
                                                  ("boss2", 66.0, 69.6, 1, None, None)]),
]


def font_title():
    """Cinzel Decorative Bold (OFL) for the title; DejaVu Serif when it cannot be fetched."""
    if not os.path.exists(FONT_T):
        try:
            req = urllib.request.Request("https://github.com/google/fonts/raw/main/ofl/cinzeldecorative/CinzelDecorative-Bold.ttf", headers={"User-Agent": "curl/8.5.0", "Accept": "*/*"})
            open(FONT_T, "wb").write(urllib.request.urlopen(req, timeout=60).read())
        except Exception as e:
            print("title font not fetched:", e)
    return FONT_T if os.path.exists(FONT_T) and os.path.getsize(FONT_T) > 10000 else "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def tf(name, text):
    p = f"{OUT}/txt_{name}.txt"
    open(p, "w").write(text)
    return p


def alpha(t0, t1, f=0.25):
    return f"if(lt(t,{t0+f}),(t-{t0})/{f},if(gt(t,{t1-f}),({t1}-t)/{f},1))"


def text(name, s, t0, t1, size, y, font=FONT, color="white", box=False, x="(w-text_w)/2"):
    extra = ":box=1:boxcolor=0x0d1512@0.78:boxborderw=24" if box else ":borderw=4:bordercolor=black@0.85"
    return (f"drawtext=fontfile={font}:textfile={tf(name, s)}:fontsize={size}:fontcolor={color}{extra}:"
            f"x={x}:y={y}:alpha='{alpha(t0, t1)}':enable='between(t,{t0:.3f},{t1:.3f})'")


def run(cmd):
    print(" ".join(cmd)[:260], flush=True)
    subprocess.run(cmd, check=True)


def build(mode):
    music, draft = mode != "nomusic", mode == "draft"
    W, H = (960, 540) if draft else (1920, 1080)
    k = W / 1920
    ft = font_title()
    name = {"draft": "ftf-building-draft.mp4", "main": "ftf-building-v2.mp4", "nomusic": "ftf-building-v2-nomusic.mp4"}[mode]
    segs = [(fi, *s) for fi, (_, ss) in enumerate(FEATURES) for s in ss]
    cmd, fc = ["ffmpeg", "-nostdin", "-v", "error", "-stats", "-y"], []
    for i, (fi, clip, a, b, sp, zoom, _) in enumerate(segs):
        cmd += ["-ss", str(a), "-t", str(b - a), "-i", f"{CLIPS}/{clip}.mp4"]
        f = f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps=60"
        if zoom:
            z, cx, cy = zoom
            w, h = int(1920 / z) // 2 * 2, int(1080 / z) // 2 * 2
            f += f",crop={w}:{h}:{min(max(cx - w // 2, 0), 1920 - w)}:{min(max(cy - h // 2, 0), 1080 - h)}"
        fc.append(f + f",scale={W}:{H}:flags=lanczos,format=yuv420p,settb=AVTB[s{i}]")
    n = len(segs)
    cmd += ["-f", "lavfi", "-t", str(END), "-i", f"color=c=0x0d1512:s={W}x{H}:r=60"]
    S = lambda v: int(v * k)
    end = (f"[{n}:v]format=yuv420p,settb=AVTB,"
           f"drawtext=fontfile={ft}:textfile={tf('e1', 'Forget to Foresee')}:fontsize={S(120)}:fontcolor=0xf2d48a:x=(w-text_w)/2:y={S(270)},"
           f"drawtext=fontfile={FONT}:textfile={tf('e2', 'Work in progress. Play the live build, free, in your browser.')}:fontsize={S(42)}:fontcolor=white:x=(w-text_w)/2:y={S(480)},"
           f"drawtext=fontfile={FONT}:textfile={tf('e3', URL)}:fontsize={S(64)}:fontcolor=0x7fe0c8:x=(w-text_w)/2:y={S(570)},"
           f"drawtext=fontfile={FONT}:textfile={tf('e5', 'Built for the NEAR hackathon. Testnet, no real value.')}:fontsize={S(30)}:fontcolor=white@0.8:x=(w-text_w)/2:y={S(700)}")
    if music:
        end += f",drawtext=fontfile={FONT}:textfile={tf('e4', CREDIT)}:fontsize={S(26)}:fontcolor=white@0.75:x=(w-text_w)/2:y={S(960)}"
    fc.append(end + f"[s{n}]")
    # the chain: a short dissolve inside a feature, a whip between features, black into the end card
    dur = lambda i: (segs[i][3] - segs[i][2]) / segs[i][4]
    cum, prev, starts = dur(0), "s0", [0.0]
    for i in range(1, n + 1):
        if i == n: d, kind, xf = END, "fadeblack", 0.4
        elif segs[i][0] != segs[i - 1][0]: d, kind, xf = dur(i), ("smoothleft" if segs[i][0] % 2 else "smoothright"), 0.2
        else: d, kind, xf = dur(i), "fade", 0.1
        off = cum - xf
        fc.append(f"[{prev}][s{i}]xfade=transition={kind}:duration={xf}:offset={off:.3f}[x{i}]")
        starts.append(off)
        cum, prev = off + d, f"x{i}"
    total = cum
    caps = [text("title", "Forget to Foresee", 0.3, 5.2, S(132), "(h-text_h)/2-%d" % S(50), ft, "0xf2d48a"),
            text("sub", "WORK IN PROGRESS: WHAT WE ARE BUILDING", 1.0, 5.2, S(44), "(h/2)+%d" % S(70))]
    feats = [f for f in range(len(FEATURES)) if FEATURES[f][0]]
    timeline = []
    for f in feats:
        idx = [i for i in range(n) if segs[i][0] == f]
        t0, t1 = starts[idx[0]] + 0.2, starts[idx[-1]] + dur(idx[-1])
        timeline.append((round(starts[idx[0]], 1), FEATURES[f][0]))
        show = min(t1 - 0.3, t0 + 3.0)
        caps.append(text(f"n{f}", f"{feats.index(f) + 1:02d} / {len(feats):02d}", t0, show, S(30), f"h*0.735-{S(74)}", FONT, "0xf2d48a"))
        caps.append(text(f"c{f}", FEATURES[f][0].upper(), t0, show, S(54), "h*0.735", FONT, "white", True))
    for i in range(n):
        if segs[i][6]:
            caps.append(text(f"x{i}", segs[i][6].upper(), starts[i] + 0.25, starts[i] + dur(i) - 0.1, S(54), "h*0.735", FONT, "0x7fe0c8", True))
    fc.append(f"[{prev}]fade=t=in:st=0:d=0.5,{','.join(caps)},fade=t=out:st={total-0.7:.3f}:d=0.7[v]")
    if music:
        cmd += ["-ss", str(MUSIC_FROM), "-i", MUSIC]
        fc.append(f"[{n+1}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,loudnorm=I=-14:TP=-1.5:LRA=11,"
                  f"afade=t=in:d=0.6,afade=t=out:st={total-3.5:.3f}:d=3.5,aresample=48000[a]")
    else:
        cmd += ["-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        fc.append(f"[{n+1}:a]anull[a]")
    script = f"{OUT}/fc_{mode}.txt"
    open(script, "w").write(";\n".join(fc))
    enc = (["-c:v", "libx264", "-preset", "veryfast", "-crf", "26"] if draft else ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-maxrate", "14M", "-bufsize", "28M"])
    run(cmd + ["-filter_complex_script", script, "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}"] + enc +
        ["-pix_fmt", "yuv420p", "-r", "60", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", f"{OUT}/{name}"])
    print("TIMELINE", timeline, "end card", round(starts[n], 1), "total", round(total, 1))
    if draft or mode == "main":
        rows = -(-int(total) // 8)
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"{OUT}/{name}", "-vf", f"fps=1,scale=480:270,tile=8x{rows}", "-q:v", "4", f"{OUT}/{name[:-4]}-sheet.jpg"])


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "draft"
    for m in (["main", "nomusic"] if what == "all" else [what]):
        build(m)
    print("DONE", what)
