#!/usr/bin/env python3
"""Downloads the CMU motion-capture takes named in clips.json (BVH conversion by B. Hahne, mirrored on GitHub).

    python3 art/anim/fetch_mocap.py [--dest art/anim/src] [take ...]

Licence: "This data is free for use in research and commercial projects worldwide" (mocap.cs.cmu.edu).
The files are not committed; this script fetches exactly what the clips need.
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/'


def main():
    args = sys.argv[1:]
    dest = os.path.join(HERE, 'src')
    if '--dest' in args:
        i = args.index('--dest'); dest = args[i + 1]; del args[i:i + 2]
    cfg = json.load(open(os.path.join(HERE, 'clips.json')))
    takes = set(args)
    if not takes:
        for c in cfg['clips'].values():
            takes.add(c['take'])
        for ch in cfg['characters'].values():
            for c in ch['clips'].values():
                if 'take' in c:
                    takes.add(c['take'])
    for t in sorted(takes):
        sub = t.split('_')[0].zfill(3)
        out = os.path.join(dest, 'data', sub, t + '.bvh')
        if os.path.exists(out):
            continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        urllib.request.urlretrieve(f'{BASE}{sub}/{t}.bvh', out)
        print('fetched', t, os.path.getsize(out))


if __name__ == '__main__':
    main()
