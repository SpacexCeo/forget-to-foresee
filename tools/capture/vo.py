#!/usr/bin/env python3
"""Voice-over for the jury video (owner 09.11: a local, male, native-English narrator; not a stock announcer voice).

Kokoro-82M through kokoro-onnx (CPU, no torch; model files next to the script or in $KOKORO_DIR). Each line of tools/capture/vo-lines.json is synthesised on its own and laid on the
timeline at its caption's start; a line longer than its window is sped up (at most 1.3x) and otherwise left alone.
Usage: python3 tools/capture/vo.py <out.wav> [--voice bm_fable] [--lines vo-lines.json] [--speed 1.0] [--sample "text"]
Voices tried for the owner: bm_fable, bm_george (British), am_fenrir, am_michael (American).
"""
import argparse, json, sys, os
import numpy as np, soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('--voice', default='bm_fable'); ap.add_argument('--lines', default=os.path.join(os.path.dirname(__file__), 'vo-lines.json'))
ap.add_argument('--speed', type=float, default=1.0); ap.add_argument('--sample', default=None); ap.add_argument('--duration', type=float, default=60.0)
ap.add_argument('--models', default=os.environ.get('KOKORO_DIR', os.path.dirname(__file__)))
a = ap.parse_args()
from kokoro_onnx import Kokoro
k = Kokoro(os.path.join(a.models, 'kokoro-v1.0.onnx'), os.path.join(a.models, 'voices-v1.0.bin'))
lang = 'en-gb' if a.voice.startswith('b') else 'en-us'
SR = 24000

def say(text, speed):
    x, sr = k.create(text, voice=a.voice, speed=speed, lang=lang)
    assert sr == SR
    return np.asarray(x, dtype=np.float32)

def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    return x[max(0, idx[0] - 600):idx[-1] + 2400] if len(idx) else x

if a.sample:
    sf.write(a.out, trim(say(a.sample, a.speed)), SR); print('sample', a.out); sys.exit(0)

lines = json.load(open(a.lines))
out = np.zeros(int(a.duration * SR) + SR, np.float32)
for i, L in enumerate(lines):
    nxt = lines[i + 1]['at'] if i + 1 < len(lines) else a.duration
    win = max(L['end'], nxt - 0.12) - L['at']   # the line may run past its caption, but not into the next line
    x = trim(say(L['text'], a.speed))
    if len(x) / SR > win:   # too long for its caption window: speak faster, up to 1.18x
        sp = min(1.3, a.speed * (len(x) / SR) / win * 1.02)
        x = trim(say(L['text'], sp))
    s0 = int(L['at'] * SR); s1 = min(len(out), s0 + len(x))
    out[s0:s1] += x[:s1 - s0]
    print(f"{L['at']:6.2f}s  {len(x) / SR:4.2f}s / {win:4.2f}s  {L['text']}")
peak = float(np.abs(out).max()) or 1.0
out = out / peak * 0.89
sf.write(a.out, out, SR); print('wrote', a.out)
