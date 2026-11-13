#!/usr/bin/env python3
"""Forget to Foresee: X/Twitter cut and teasers from one gameplay recording.

Usage: python3 edit.py [main|nomusic|teasers|all]
Needs ffmpeg, src.mp4 and music.mp3 next to this file; writes to out/.
Optional title.ttf next to this file sets the title font (Cinzel Decorative Bold, OFL, was used).
Music: "Computations in a Snowstorm" by Scott Buckley, CC BY 4.0 (scottbuckley.com.au).
"""
import os, subprocess, sys

D = os.path.dirname(os.path.abspath(__file__))
SRC, MUSIC, OUT = f"{D}/src.mp4", f"{D}/music.mp3", f"{D}/out"
FONT_T = f"{D}/title.ttf" if os.path.exists(f"{D}/title.ttf") else "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
URL = "spacexceo.github.io/forget-to-foresee"
CREDIT = 'Music: "Computations in a Snowstorm" by Scott Buckley  |  CC BY 4.0  |  scottbuckley.com.au'
XF = 0.25  # crossfade length, s
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-maxrate", "12M", "-bufsize", "24M",
       "-pix_fmt", "yuv420p", "-r", "60", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart"]

# (source in, source out, speed, caption or None)
SEGS = [
    (20, 24.5, 1, None),          # the square at night: title
    (24.5, 38, 2.5, None),        # fast-forward through the streets
    (38, 44, 1, None),            # the town gate
    (44, 50, 2, None),            # over the wall
    (50, 57.5, 1, None),          # the spell outside
    (57.5, 64, 2.5, None),        # back through the gate
    (64, 71, 1, "A town of 20 AI traders on NEAR"),
    (71, 98, 3.5, None),          # fast-forward across town
    (98, 113, 1, "18,000+ on-chain trades a day"),  # the market, Hatchkeeper
    (113, 131, 2, None),
    (131, 152, 4, None),
    (152, 160, 1, None),          # the banner
    (160, 166, 2, None),
    (166, 172, 1, None),          # the chase from above
    (172, 184, 3, None),
    (184, 188.5, 1, None),        # daylight
    (188.5, 195.5, 1, None),      # the wheel
    (195.5, 198, 1, None),
    (198, 207, 1, "Free to play in your browser"),  # another player, the profile card
    (207, 213, 3, None),
    (213, 220.5, 1, None),        # the fountain, the bounty
    (237.5, 243, 1, None),        # picking an egg
    (243, 257, 2, None),          # the shop
]
END = 7.0


def tf(name, text):
    p = f"{D}/txt_{name}.txt"
    open(p, "w").write(text)
    return p


def caption(name, text, t0, t1, size=64, y="h*0.80", font=None):
    a = f"if(lt(t,{t0+0.4}),(t-{t0})/0.4,if(gt(t,{t1-0.4}),({t1}-t)/0.4,1))"
    return (f"drawtext=fontfile={font or FONT}:textfile={tf(name, text)}:fontsize={size}:fontcolor=white:"
            f"borderw=4:bordercolor=black@0.85:shadowx=3:shadowy=3:shadowcolor=black@0.6:"
            f"x=(w-text_w)/2:y={y}:alpha='{a}':enable='between(t,{t0},{t1})'")


def run(cmd):
    print(" ".join(cmd)[:300], flush=True)
    subprocess.run(cmd, check=True)


def build(music):
    name = "ftf-cut-3min.mp4" if music else "ftf-cut-3min-nomusic.mp4"
    cmd, fc = ["ffmpeg", "-nostdin", "-v", "error", "-stats", "-y"], []
    for i, (a, b, sp, _) in enumerate(SEGS):
        cmd += ["-ss", str(a), "-t", str(b - a), "-i", SRC]
        f = f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps=60,scale=1920:1080,format=yuv420p,settb=AVTB"
        if sp > 1:
            f += (f",drawtext=fontfile={FONT}:textfile={tf('ff%d' % i, '>> x%g' % sp)}:fontsize=44:fontcolor=white@0.9:"
                  f"borderw=3:bordercolor=black@0.8:x=w-text_w-60:y=h-110")
        fc.append(f + f"[s{i}]")
    n = len(SEGS)
    cmd += ["-f", "lavfi", "-t", str(END), "-i", "color=c=0x0d1512:s=1920x1080:r=60"]
    end = (f"[{n}:v]format=yuv420p,settb=AVTB,"
           f"drawtext=fontfile={FONT_T}:textfile={tf('e1', 'Forget to Foresee')}:fontsize=120:fontcolor=0xf2d48a:x=(w-text_w)/2:y=300,"
           f"drawtext=fontfile={FONT}:textfile={tf('e2', 'Play now, free, in your browser')}:fontsize=48:fontcolor=white:x=(w-text_w)/2:y=500,"
           f"drawtext=fontfile={FONT}:textfile={tf('e3', URL)}:fontsize=64:fontcolor=0x7fe0c8:x=(w-text_w)/2:y=590")
    if music:
        end += f",drawtext=fontfile={FONT}:textfile={tf('e4', CREDIT)}:fontsize=28:fontcolor=white@0.75:x=(w-text_w)/2:y=960"
    fc.append(end + f"[s{n}]")
    # crossfade chain; remember where each segment starts on the output timeline
    cum, prev, starts = (SEGS[0][1] - SEGS[0][0]) / SEGS[0][2], "s0", [0.0]
    for i in range(1, n + 1):
        if i == n:
            d, kind = END, "fadeblack"
        else:
            a, b, sp, _ = SEGS[i]
            d = (b - a) / sp
            kind = "smoothleft" if sp > 1 else ("fadeblack" if a - SEGS[i - 1][1] > 5 else "fade")
        off = cum - XF
        fc.append(f"[{prev}][s{i}]xfade=transition={kind}:duration={XF}:offset={off:.3f}[x{i}]")
        starts.append(off)
        cum, prev = off + d, f"x{i}"
    total = cum
    caps = [caption("title", "Forget to Foresee", 0.4, 4.2, 130, "(h-text_h)/2-40", FONT_T)]
    for i, (a, b, sp, text) in enumerate(SEGS):
        if text:
            caps.append(caption(f"c{i}", text, starts[i] + 0.5, starts[i] + min((b - a) / sp, 6.5) - 0.3))
    fc.append(f"[{prev}]fade=t=in:st=0:d=0.6,{','.join(caps)},fade=t=out:st={total-0.8:.3f}:d=0.8[v]")
    if music:
        cmd += ["-i", MUSIC]
        fc.append(f"[{n+1}:a]atrim=0:{total:.3f},loudnorm=I=-14:TP=-1.5:LRA=11,"
                  f"afade=t=in:d=1,afade=t=out:st={total-3:.3f}:d=3,aresample=48000[a]")
    else:  # the recording has a silent audio track, so this version carries silence for the owner's own track
        cmd += ["-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        fc.append(f"[{n+1}:a]anull[a]")
    script = f"{D}/fc_{'m' if music else 'n'}.txt"
    open(script, "w").write(";\n".join(fc))
    run(cmd + ["-filter_complex_script", script, "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}"] + ENC + [f"{OUT}/{name}"])
    print("timeline:", [(round(s, 1), SEGS[i][:3] if i < n else "end card") for i, s in enumerate(starts)], "total", round(total, 1))


# vertical teasers: (name, top line, [(in, out, speed)...], music start)
TEASERS = [
    ("teaser-1-spell", "Forget to Foresee", [(50.5, 55.5, 1), (64.5, 68, 1), (213.5, 217, 1)], 60),
    ("teaser-2-traders", "20 AI traders. One town. On NEAR.", [(98, 103, 1), (113, 131, 4), (152.5, 156, 1)], 60),
    ("teaser-3-wheel", "Spin. Hatch. Trade.", [(188.5, 193.5, 1), (238.5, 242.5, 1), (243, 257, 4)], 60),
]


def teasers(tall=False):
    """4:5 teasers (1080x1350), or 9:16 (1080x1920) with the 4:5 frame over a blurred fill when tall."""
    for name, top, parts, ms in TEASERS:
        cmd, fc = ["ffmpeg", "-nostdin", "-v", "error", "-y"], []
        for i, (a, b, sp) in enumerate(parts):
            cmd += ["-ss", str(a), "-t", str(b - a), "-i", SRC]
            head = f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps=60,format=yuv420p"
            if tall:
                fc.append(f"{head},split[f{i}][b{i}];[b{i}]crop=608:1080,scale=1080:1920,gblur=sigma=30,eq=brightness=-0.18[g{i}];"
                          f"[f{i}]crop=864:1080,scale=1080:1350[h{i}];[g{i}][h{i}]overlay=0:285,settb=AVTB[s{i}]")
            else:
                fc.append(f"{head},crop=864:1080,scale=1080:1350,settb=AVTB[s{i}]")
        cum, prev = (parts[0][1] - parts[0][0]) / parts[0][2], "s0"
        for i in range(1, len(parts)):
            off = cum - XF
            fc.append(f"[{prev}][s{i}]xfade=transition=smoothleft:duration={XF}:offset={off:.3f}[x{i}]")
            cum, prev = off + (parts[i][1] - parts[i][0]) / parts[i][2], f"x{i}"
        size = 84 if len(top) < 20 else 54
        fc.append(f"[{prev}]fade=t=in:d=0.3,"
                  + caption(name + "a", top, 0.2, cum, size, "130" if tall else "110", FONT_T) + ","
                  + caption(name + "b", URL, 1.0, cum, 40, "h-210" if tall else "h-150") + ","
                  + f"drawtext=fontfile={FONT}:textfile={tf('tcred', 'Music: Scott Buckley, CC BY 4.0')}:fontsize=22:fontcolor=white@0.7:x=(w-text_w)/2:y=h-70,"
                  + f"fade=t=out:st={cum-0.4:.3f}:d=0.4[v]")
        cmd += ["-ss", str(ms), "-t", f"{cum:.3f}", "-i", MUSIC]
        fc.append(f"[{len(parts)}:a]loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:d=0.3,afade=t=out:st={cum-1:.3f}:d=1,aresample=48000[a]")
        script = f"{D}/fc_{name}.txt"
        open(script, "w").write(";\n".join(fc))
        run(cmd + ["-filter_complex_script", script, "-map", "[v]", "-map", "[a]", "-t", f"{cum:.3f}"] + ENC + [f"{OUT}/{name}{'-9x16' if tall else ''}.mp4"])


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("main", "all"): build(True)
    if what in ("nomusic", "all"): build(False)
    if what in ("teasers", "all"): teasers(); teasers(True)
    print("DONE", what)
