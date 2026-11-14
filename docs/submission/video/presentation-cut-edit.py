#!/usr/bin/env python3
"""Forget to Foresee: the presentation video (75-90 s). Left: the game. Right: what the server, the AI and NEAR do.

Usage: python3 cut3.py [draft|main|nomusic|all]
Left footage: clips recorded from the real game by scenes.cjs. Right panels: panels.cjs over data.json, which data.py
reads from the public relayer API and NEAR testnet RPC at render time (nothing typed by hand).
Music: "Goliath" by Scott Buckley, CC BY 4.0 (www.scottbuckley.com.au).
"""
import os, subprocess, sys

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
CLIPS, MUSIC, OUT = f"{ROOT}/clips", f"{ROOT}/music/goliath.mp3", f"{ROOT}/out3"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_T = f"{ROOT}/title.ttf" if os.path.exists(f"{ROOT}/title.ttf") and os.path.getsize(f"{ROOT}/title.ttf") > 10000 else "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
URL = "spacexceo.github.io/forget-to-foresee"
CREDIT = "Music: 'Goliath' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au"
MUSIC_FROM, END, LW = 45.0, 6.0, 1150   # LW: width of the game half

# section, split panel (or None), [(clip, in, out, (cx, cy, zoom))]
SECTIONS = [
    ("hook", None, [("wake", 30.4, 32.4, (960, 520, 1.15)), ("boss2_nh", 2.4, 5.0, None), ("boss1_nh", 3.0, 5.2, None),
                    ("boss2_nh", 12.2, 14.4, None), ("hatch_nh", 2.6, 4.8, (900, 560, 1.3))]),
    ("economy", "trades", [("flyin", 0.4, 3.0, None), ("market", 1.3, 4.6, (965, 540, 1)), ("ledger", 1.4, 5.4, (962, 540, 1)), ("ledger", 6.2, 10.2, (962, 540, 1))]),
    ("ai", "ai", [("wake", 42.5, 47.0, None), ("talk", 5.6, 9.0, (900, 540, 1)), ("ledger", 9.2, 12.4, (1150, 600, 1.45)), ("tournament", 7.2, 10.4, (960, 535, 1.3))]),
    ("nft", "nft", [("menu", 1.3, 4.4, (962, 540, 1)), ("menu", 5.0, 7.6, None), ("hatch", 2.0, 6.4, (900, 560, 1.15)), ("chest", 8.6, 11.0, (960, 505, 1.3)), ("menu", 13.2, 15.2, (962, 540, 1))]),
    ("fair", "fair", [("tournament", 0.3, 2.9, None), ("tournament", 3.3, 5.6, (960, 535, 1.2)), ("chest", 1.3, 5.0, (960, 505, 1.3)), ("wheel", 4.0, 7.4, (962, 540, 1)), ("wheel", 10.6, 12.8, (962, 540, 1))]),
    ("boss", None, [("boss2", 4.2, 6.8, None), ("boss2", 8.5, 10.5, None), ("boss2", 33.0, 36.0, None), ("boss2", 45.5, 48.8, None), ("boss2", 66.0, 69.6, None)]),
]


def tf(name, s):
    p = f"{OUT}/txt_{name}.txt"
    open(p, "w").write(s)
    return p


def alpha(t0, t1, f=0.3):
    return f"if(lt(t,{t0+f}),(t-{t0})/{f},if(gt(t,{t1-f}),({t1}-t)/{f},1))"


def text(name, s, t0, t1, size, y, font=FONT, color="white", box=False, x="(w-text_w)/2"):
    extra = ":box=1:boxcolor=0x0d1512@0.78:boxborderw=22" if box else ":borderw=4:bordercolor=black@0.85"
    return (f"drawtext=fontfile={font}:textfile={tf(name, s)}:fontsize={size}:fontcolor={color}{extra}:"
            f"x={x}:y={y}:alpha='{alpha(t0, t1)}':enable='between(t,{t0:.3f},{t1:.3f})'")


def run(cmd):
    print(" ".join(cmd)[:240], flush=True)
    subprocess.run(cmd, check=True)


def build(mode):
    music, draft = mode != "nomusic", mode == "draft"
    W, H = (960, 540) if draft else (1920, 1080)
    k = W / 1920
    S = lambda v: int(v * k)
    name = {"draft": "ftf-presentation-draft.mp4", "main": "ftf-presentation.mp4", "nomusic": "ftf-presentation-nomusic.mp4"}[mode]
    segs = [(si, sec[1], *s) for si, sec in enumerate(SECTIONS) for s in sec[2]]
    cmd, fc = ["ffmpeg", "-nostdin", "-v", "error", "-stats", "-y"], []
    for i, (si, panel, clip, a, b, crop) in enumerate(segs):
        cmd += ["-ss", str(a), "-t", str(b - a), "-i", f"{CLIPS}/{clip}.mp4"]
        f = f"[{i}:v]setpts=PTS-STARTPTS,fps=60"
        cx, cy, z = crop or (960, 540, 1)
        if panel:   # the game half: a 1150x1080 window of the frame, the right side left dark for the panel
            w, h = int(LW / z) // 2 * 2, int(1080 / z) // 2 * 2
            f += f",crop={w}:{h}:{min(max(cx - w // 2, 0), 1920 - w)}:{min(max(cy - h // 2, 0), 1080 - h)},scale={LW}:1080:flags=lanczos,pad=1920:1080:0:0:color=0x0a1210"
        elif crop:
            w, h = int(1920 / z) // 2 * 2, int(1080 / z) // 2 * 2
            f += f",crop={w}:{h}:{min(max(cx - w // 2, 0), 1920 - w)}:{min(max(cy - h // 2, 0), 1080 - h)}"
        fc.append(f + f",scale={W}:{H}:flags=lanczos,format=yuv420p,settb=AVTB[s{i}]")
    n = len(segs)
    cmd += ["-f", "lavfi", "-t", str(END), "-i", f"color=c=0x0d1512:s={W}x{H}:r=60"]
    end = (f"[{n}:v]format=yuv420p,settb=AVTB,"
           f"drawtext=fontfile={FONT_T}:textfile={tf('e1', 'Forget to Foresee')}:fontsize={S(124)}:fontcolor=0xf2d48a:x=(w-text_w)/2:y={S(250)},"
           f"drawtext=fontfile={FONT}:textfile={tf('e2', 'BUILT ON NEAR')}:fontsize={S(52)}:fontcolor=white:x=(w-text_w)/2:y={S(450)},"
           f"drawtext=fontfile={FONT}:textfile={tf('e3', URL)}:fontsize={S(62)}:fontcolor=0x7fe0c8:x=(w-text_w)/2:y={S(560)},"
           f"drawtext=fontfile={FONT}:textfile={tf('e5', 'Play free in your browser. NEAR testnet, no real value. Work in progress.')}:fontsize={S(30)}:fontcolor=white@0.8:x=(w-text_w)/2:y={S(690)}")
    if music:
        end += f",drawtext=fontfile={FONT}:textfile={tf('e4', CREDIT)}:fontsize={S(26)}:fontcolor=white@0.75:x=(w-text_w)/2:y={S(960)}"
    fc.append(end + f"[s{n}]")
    dur = lambda i: segs[i][4] - segs[i][3]
    cum, prev, starts = dur(0), "s0", [0.0]
    for i in range(1, n + 1):
        if i == n: d, kind, xf = END, "fadeblack", 0.5
        elif segs[i][0] != segs[i - 1][0]: d, kind, xf = dur(i), "fadeblack", 0.36
        else: d, kind, xf = dur(i), "fade", 0.12
        off = cum - xf
        fc.append(f"[{prev}][s{i}]xfade=transition={kind}:duration={xf}:offset={off:.3f}[x{i}]")
        starts.append(off)
        cum, prev = off + d, f"x{i}"
    total = cum
    sec_t = {}
    for si, sec in enumerate(SECTIONS):
        idx = [i for i in range(n) if segs[i][0] == si]
        sec_t[sec[0]] = (starts[idx[0]], starts[idx[-1]] + dur(idx[-1]))
    # the panels: each starts with its section, on the right
    pi = n + 1
    for si, sec in enumerate(SECTIONS):
        if not sec[1]: continue
        t0, t1 = sec_t[sec[0]]
        cmd += ["-i", f"{CLIPS}/panel_{sec[1]}.mp4"]
        fc.append(f"[{pi}:v]fps=60,scale={S(770)}:{H}:flags=lanczos,format=yuv420p,setpts=PTS-STARTPTS+{t0 + 0.3:.3f}/TB[p{pi}]")
        fc.append(f"[{prev}][p{pi}]overlay={S(LW)}:0:enable='between(t,{t0 + 0.3:.3f},{t1 - 0.2:.3f})':eof_action=pass[o{pi}]")
        prev = f"o{pi}"; pi += 1
    h0, h1 = sec_t["hook"]; b0, b1 = sec_t["boss"]
    caps = [text("h1", "WHAT WOULD YOU FORGET", h0 + 0.3, h0 + 3.1, S(96), "(h-text_h)/2-%d" % S(20)),
            text("h2", "TO SEE THE FUTURE?", h0 + 3.1, h0 + 6.2, S(96), "(h-text_h)/2-%d" % S(20), FONT, "0x7fe0c8"),
            text("h3", "Forget to Foresee", h0 + 6.5, h1 - 0.45, S(138), "(h-text_h)/2-%d" % S(40), FONT_T, "0xf2d48a"),
            text("h4", "AN RPG TOWN THAT LIVES ON NEAR", h0 + 7.2, h1 - 0.45, S(44), "(h/2)+%d" % S(80)),
            text("b1", "THE FINAL BOSS: THE SERPENT OF THE GLASS SHOAL", b0 + 0.3, b0 + 4.0, S(52), "h*0.76", FONT, "white", True)]
    for sec in SECTIONS:
        if sec[1]:
            t0 = sec_t[sec[0]][0]
            caps.append(text("g" + sec[0], "IN THE GAME", t0 + 0.4, t0 + 3.0, S(30), S(40), FONT, "0xf2d48a", True, str(S(46))))
    fc.append(f"[{prev}]fade=t=in:st=0:d=0.5,{','.join(caps)},fade=t=out:st={total-0.7:.3f}:d=0.7[v]")
    if music:
        cmd += ["-ss", str(MUSIC_FROM), "-i", MUSIC]
        fc.append(f"[{pi}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:d=0.6,afade=t=out:st={total-3.5:.3f}:d=3.5,aresample=48000[a]")
    else:
        cmd += ["-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        fc.append(f"[{pi}:a]anull[a]")
    script = f"{OUT}/fc_{mode}.txt"
    open(script, "w").write(";\n".join(fc))
    enc = (["-c:v", "libx264", "-preset", "veryfast", "-crf", "26"] if draft else ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-maxrate", "14M", "-bufsize", "28M"])
    run(cmd + ["-filter_complex_script", script, "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}"] + enc +
        ["-pix_fmt", "yuv420p", "-r", "60", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", f"{OUT}/{name}"])
    print("SECTIONS", {k: (round(a, 1), round(b, 1)) for k, (a, b) in sec_t.items()}, "total", round(total, 1))
    if mode in ("draft", "main"):
        rows = -(-int(total) // 8)
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"{OUT}/{name}", "-vf", f"fps=1,scale=480:270,tile=8x{rows}", "-q:v", "4", f"{OUT}/{name[:-4]}-sheet.jpg"])


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "draft"
    for m in (["main", "nomusic"] if what == "all" else [what]):
        build(m)
    print("DONE", what)
