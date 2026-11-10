#!/usr/bin/env python3
"""Builds a character's side-car clip file from motion-capture takes (art/anim/clips.json).

    python3 art/anim/build_clips.py --char iris --mocap <dir with data/<subject>/<take>.bvh> [--only walk,run]

Output: game/public/assets/anim/<char>.glb and art/anim/out/<char>.json (the numbers of each clip).
Needs only numpy. The same sources and config always give the same file.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftfanim.bvh import Bvh                      # noqa: E402
from ftfanim.gltfio import write_clips_glb       # noqa: E402
from ftfanim.loco import build_cycle             # noqa: E402
from ftfanim.retarget import retarget            # noqa: E402
from ftfanim.rig import Rig                      # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--char', required=True)
    ap.add_argument('--mocap', default=os.environ.get('FTF_MOCAP', os.path.join(HERE, 'src')))
    ap.add_argument('--only', default='')
    ap.add_argument('--out', default='')
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, 'clips.json')))
    ch = cfg['characters'][a.char]
    rig = Rig(os.path.join(REPO, ch['model']))
    only = [x for x in a.only.split(',') if x]
    takes, clips, report = {}, [], {}
    for name, c in ch['clips'].items():
        if only and name not in only:
            continue
        spec = dict(cfg['clips'].get(c.get('use', name), {})); spec.update(c)
        take = spec['take']
        if take not in takes:
            takes[take] = retarget(Bvh(os.path.join(a.mocap, 'data', take.split('_')[0].zfill(3), take + '.bvh')), rig)
        rt = takes[take]
        style = dict(ch.get('style', {})); style.update(spec.get('style', {}))
        if spec['kind'] == 'cycle':
            r = build_cycle(rt, spec['frames_src'][0], spec['frames_src'][1], spec['frames'], spec['speed'], style, log=lambda *x: None)
        else:
            raise SystemExit('unknown clip kind ' + spec['kind'])
        bones = [b for b in rig.names if b in rt.mapped or b.startswith('toe_')]
        clips.append({'name': name, 'local': r['local'], 'pelvis': rig.pelvis_local(r['pelvis']), 'bones': bones,
                      'extras': {'take': 'CMU ' + take, 'speed': spec.get('speed', 0), 'loop': True}})
        report[name] = {'take': take, **r['stats']}
        print(name, json.dumps(report[name]))
    out = a.out or os.path.join(REPO, 'game/public/assets/anim', a.char + '.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_clips_glb(out, rig, clips, extras={'character': a.char, 'source': 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), retargeted by art/anim'})
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    json.dump(report, open(os.path.join(HERE, 'out', a.char + '.json'), 'w'), indent=1)
    print('wrote', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main()
