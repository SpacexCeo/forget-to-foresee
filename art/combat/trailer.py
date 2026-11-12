"""The 60 s trailer draft from the game's own captures (docs/art/combat/*.mp4), with ffmpeg.

    python3 art/combat/trailer.py [out.mp4] [--vertical out_vertical.mp4]

Beats (docs/submission/video-recut-notes.md): the town and the title first, Elise, a shop, the fight beyond the walls,
the brute and the elite, a chest drop, the Tournament's archipelago, the open-case reveal, the end card with "Built at NEAR HACKATHON" and the URL.
Captions say only what the clips show. Music: the game's own track (game/public/assets/audio/mus_calm.ogg).
1280x720, 30 fps, H.264 + AAC. The vertical cut is 15 s, 720x1280 (centre crop), for X.
"""
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = os.path.join(ROOT, 'docs/art/combat')
MUSIC = os.path.join(ROOT, 'game/public/assets/audio/mus_calm.ogg')
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
URL = 'spacexceo.github.io/forget-to-foresee'

REVEAL = 22.5   # first_fight_v3.mp4: the open-case reel starts here (the chest preview, labelled "not on chain")
# (clip, start s, length s, caption or None)
SEGMENTS = [
    ('town_beauty.mp4', 0.0, 8.5, None),
    ('elise_orbit.mp4', 0.6, 5.0, 'Elise, the Day 1 heroine'),
    ('shop_interior.mp4', 2.2, 5.0, 'Walk-in shops'),
    ('first_fight_v2.mp4', 3.0, 3.5, 'Beyond the walls'),
    ('first_fight_v2.mp4', 8.5, 7.0, 'Real-time fights: strike combo, dash, casts'),
    ('elite_fight.mp4', 2.0, 4.0, 'Brutes telegraph their blows'),
    ('elite_fight.mp4', 18.0, 8.0, 'Elites are a real fight'),
    ('first_fight_v3.mp4', 16.0, 3.0, 'Beaten creatures drop chests'),
    ('archipelago.mp4', 2.6, 9.0, 'Then the Tournament: the floating archipelago'),
    ('first_fight_v3.mp4', REVEAL, 7.5, 'Open a chest: shards, items, NFTs (preview)'),
]
END_SECONDS = 5.0


def esc(t):
    return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", "’")


def run(args):
    subprocess.run(args, check=True)


def caption_filter(text, size=34, y='h-110'):
    return (f"drawtext=fontfile={SANS}:text='{esc(text)}':fontsize={size}:fontcolor=white:x=(w-text_w)/2:y={y}:"
            f"box=1:boxcolor=black@0.45:boxborderw=14:alpha='if(lt(t,0.25),t/0.25,1)'")


def build(out):
    tmp = tempfile.mkdtemp(prefix='trailer_')
    parts = []
    for i, (clip, ss, length, cap) in enumerate(SEGMENTS):
        vf = ['scale=1280:720:force_original_aspect_ratio=increase', 'crop=1280:720', 'fps=30', 'setsar=1']
        if i == 0:   # the title over the town
            vf.append(f"drawtext=fontfile={SERIF}:text='Forget to Foresee':fontsize=86:fontcolor=white:x=(w-text_w)/2:y=h*0.36:"
                      f"shadowcolor=black@0.6:shadowx=2:shadowy=2:alpha='if(lt(t,0.6),0,if(lt(t,1.4),(t-0.6)/0.8,if(lt(t,6.0),1,max(0,1-(t-6.0)/0.8))))'")
            vf.append(f"drawtext=fontfile={SANS}:text='{esc('Pay for prophecy with your memories.')}':fontsize=34:fontcolor=white:x=(w-text_w)/2:y=h*0.36+110:"
                      f"shadowcolor=black@0.6:shadowx=2:shadowy=2:alpha='if(lt(t,1.2),0,if(lt(t,2.0),(t-1.2)/0.8,if(lt(t,6.0),1,max(0,1-(t-6.0)/0.8))))'")
        elif cap:
            vf.append(caption_filter(cap))
        p = os.path.join(tmp, f'p{i:02d}.mp4'); parts.append(p)
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(ss), '-t', str(length), '-i', os.path.join(C, clip), '-an', '-vf', ','.join(vf),
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', p])
    end = os.path.join(tmp, 'end.mp4'); parts.append(end)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'color=c=0x0b0e14:s=1280x720:r=30:d={END_SECONDS}', '-vf',
         f"drawtext=fontfile={SERIF}:text='Forget to Foresee':fontsize=70:fontcolor=white:x=(w-text_w)/2:y=h*0.30,"
         f"drawtext=fontfile={SANS}:text='{esc('Built at NEAR HACKATHON')}':fontsize=40:fontcolor=0xffd9a0:x=(w-text_w)/2:y=h*0.30+110,"
         f"drawtext=fontfile={SANS}:text='{esc(URL)}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h*0.30+180,"
         f"fade=t=in:st=0:d=0.6", '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', end])
    lst = os.path.join(tmp, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    silent = os.path.join(tmp, 'video.mp4')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', silent])
    dur = sum(s[2] for s in SEGMENTS) + END_SECONDS
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', MUSIC, '-filter_complex',
         f"[1:a]atrim=0:{dur},afade=t=in:st=0:d=1.5,afade=t=out:st={dur - 3}:d=3,volume=0.9[a]", '-map', '0:v', '-map', '[a]',
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out])
    return dur


VERTICAL = [
    ('first_fight_v2.mp4', 8.5, 5.0, 'Fight beyond the walls'),
    ('elite_fight.mp4', 2.0, 4.0, 'Brutes and elites'),
    ('elite_fight.mp4', 19.0, 4.0, 'Brutes and elites'),
]


def vertical(_src, out):
    """A 15 s 720x1280 cut for X: each clip whole across the width over a blurred, zoomed copy of itself, short
    captions above and below, the end card line at the end."""
    tmp = tempfile.mkdtemp(prefix='vertical_')
    parts = []
    for i, (clip, ss, length, cap) in enumerate(VERTICAL):
        fc = (f"[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:2,eq=brightness=-0.12[bg];"
              f"[0:v]scale=720:-2[fg];[bg][fg]overlay=0:(H-h)/2,fps=30,setsar=1,"
              f"drawtext=fontfile={SERIF}:text='Forget to Foresee':fontsize=54:fontcolor=white:x=(w-text_w)/2:y=230:shadowcolor=black@0.6:shadowx=2:shadowy=2,"
              f"drawtext=fontfile={SANS}:text='{esc(cap)}':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=h-330:box=1:boxcolor=black@0.45:boxborderw=14")
        p = os.path.join(tmp, f'v{i}.mp4'); parts.append(p)
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(ss), '-t', str(length), '-i', os.path.join(C, clip), '-an', '-filter_complex', fc,
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', p])
    end = os.path.join(tmp, 'vend.mp4'); parts.append(end)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x0b0e14:s=720x1280:r=30:d=2', '-vf',
         f"drawtext=fontfile={SERIF}:text='Forget to Foresee':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=h*0.38,"
         f"drawtext=fontfile={SANS}:text='{esc('Built at NEAR HACKATHON')}':fontsize=38:fontcolor=0xffd9a0:x=(w-text_w)/2:y=h*0.38+100,"
         f"drawtext=fontfile={SANS}:text='{esc(URL)}':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=h*0.38+165,fade=t=in:st=0:d=0.4",
         '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p', end])
    lst = os.path.join(tmp, 'list.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    silent = os.path.join(tmp, 'v.mp4')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', silent])
    dur = sum(v[2] for v in VERTICAL) + 2
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-ss', '20', '-i', MUSIC, '-filter_complex',
         f"[1:a]atrim=0:{dur},afade=t=in:st=0:d=0.8,afade=t=out:st={dur - 1.5}:d=1.5[a]", '-map', '0:v', '-map', '[a]',
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out])


if __name__ == '__main__':
    a = sys.argv[1:]
    out = a[0] if a and not a[0].startswith('--') else os.path.join(ROOT, 'docs/submission/trailer_draft.mp4')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    d = build(out)
    print('trailer', out, '%.1f s' % d)
    if '--vertical' in a:
        v = a[a.index('--vertical') + 1]
        vertical(out, v); print('vertical', v)
