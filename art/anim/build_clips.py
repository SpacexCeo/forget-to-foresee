#!/usr/bin/env python3
"""Builds a side-car clip file from motion-capture takes (art/anim/clips.json).

    python3 art/anim/build_clips.py --char iris [--mocap <dir with data/<subject>/<take>.bvh>] [--only walk,run]

Output: game/public/assets/anim/<out>.glb and art/anim/out/<char>.json (the numbers of each clip).
Needs only numpy. The same sources and config always give the same file.
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftfanim import chains, layers, skirt        # noqa: E402
from ftfanim.bvh import Bvh                      # noqa: E402
from ftfanim.gltfio import write_clips_glb       # noqa: E402
from ftfanim.loco import build_action, build_cycle, fingers, replant    # noqa: E402
from ftfanim.retarget import retarget            # noqa: E402
from ftfanim.rig import Rig                      # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))


def hand_locals(rig, pose):
    """Finger local rotations of a named hand pose, {bone: quaternion}."""
    tmp = {}
    fingers(rig, tmp, 1, pose, False)
    return dict(tmp['__local'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--char', required=True)
    ap.add_argument('--mocap', default=os.environ.get('FTF_MOCAP', os.path.join(HERE, 'src')))
    ap.add_argument('--only', default='')
    ap.add_argument('--out', default='')
    ap.add_argument('--bake', action='store_true', help='simulate the cloth again (characters with a cloth rig) and store it; otherwise the stored bake is used')
    a = ap.parse_args()
    cfg = json.load(open(os.environ.get('FTF_CLIPS') or os.path.join(HERE, 'clips.json')))      # FTF_CLIPS, FTF_BAKE: a trial config and bake file (tuning a clip without touching the stored ones)
    ch = cfg['characters'][a.char]
    chains.use_character(ch)
    skirt.use_character(ch)
    rig = Rig(os.path.join(REPO, ch['model']))
    only = [x for x in a.only.split(',') if x]
    cloth = skirt.ClothRig(os.path.join(REPO, ch['cloth']['rig']), rig) if ch.get('cloth') else None
    bake_path = (os.environ.get('FTF_BAKE') or os.path.join(REPO, ch['cloth']['bake'])) if cloth else None
    baked = dict(np.load(bake_path)) if cloth and os.path.exists(bake_path) else {}
    failed = []
    takes, clips, report, built, todo = {}, [], {}, {}, []

    def take_rt(take):
        if take not in takes:
            takes[take] = retarget(Bvh(os.path.join(a.mocap, 'data', take.split('_')[0].zfill(3), take + '.bvh')), rig)
        return takes[take]

    for name, c in ch['clips'].items():
        spec = dict(cfg['clips'].get(c.get('use', name), {})); spec.update({k: v for k, v in c.items() if k != 'style'})
        style = dict(ch.get('style', {}))
        if spec['kind'] != 'cycle':
            style.update(ch.get('action_style', {}))
        style.update(cfg['clips'].get(c.get('use', name), {}).get('style', {})); style.update(c.get('style', {}))
        if only and name not in only and name != 'idle':
            continue
        take = spec['take']
        rt = take_rt(take)
        lay = spec.get('layers', [])
        if spec['kind'] == 'cycle':
            # cycles are keyed densely (the engine interpolates joint angles linearly between keys: at 30 keys a second
            # a planted foot of the run wanders by millimetres between them, which reads as slip)
            kf = spec.get('fps', 30)
            r = build_cycle(rt, spec['frames_src'][0], spec['frames_src'][1], spec['frames'] * kf // 30, spec['speed'], style, fps=kf, log=lambda *x: None)
            if spec.get('stairs'):      # climbing in place: the ankles rise with their forward offset, the legs are solved again
                r['local'] = skirt.stairs(rig, r['local'], r['pelvis'], spec['stairs']['slope'], spec['stairs'].get('lift', 0.04))
        elif spec['kind'] == 'action':
            def pre(rig_, wr, hip, feet, n, fps):
                for L in lay:
                    if L['type'] == 'pose':
                        layers.pose_from(rig_, wr, hip, feet, take_rt(L['take']), L['frame'], L.get('keep', 0.5), L.get('hip_keep', 0.3))
                    elif L['type'] == 'shift':
                        layers.weight_shift(rig_, wr, hip, L['keys'], fps, **{k: L[k] for k in ('side', 'shift', 'drop', 'roll', 'yaw') if k in L})

            def post(rig_, local, pel, n, fps):
                for L in lay:
                    if L['type'] == 'rotate':
                        layers.rotate(rig_, local, pel, L['bones'], L['keys'], fps)
                    elif L['type'] == 'reach':
                        pose = hand_locals(rig_, L.get('hand', 'open'))
                        pose = {b: q for b, q in pose.items() if b.endswith('_' + L['side'])}
                        layers.reach(rig_, local, pel, L['side'], L['target'], L['keys'], fps, rel=L.get('rel'), hand_pose=pose,
                                     **{k: L[k] for k in ('hand_tilt', 'elbow', 'arc', 'wrist_back') if k in L})
            r = build_action(rt, spec['frames_src'][0], spec['frames_src'][1], style, loop=spec.get('loop', 0), feet_mode=spec.get('feet', 'auto'), log=lambda *x: None, pre_layers=pre, post_layers=post)
        else:
            raise SystemExit('unknown clip kind ' + spec['kind'])
        loop = spec['kind'] == 'cycle' or bool(spec.get('loop'))
        if spec.get('ease') and 'idle' in built:      # a one-shot starts from and returns to the idle's first frame
            layers.ease_ends(r['local'], r['pelvis'], built['idle']['local'][0], built['idle']['pelvis'][0], spec['ease'][0], spec['ease'][1])
            if spec.get('feet') == 'planted' and (style.get('stance') or {}).get('feet') == 'rest':      # the blend lets the feet wander: back onto the stance
                r['local'], r['pelvis'] = replant(rig, r['local'], r['pelvis'], style)
        built[name] = r
        if only and name not in only:
            continue
        todo.append((name, spec, r, loop, take, rt))
    fresh = {}
    if cloth and a.bake:        # the cloth of every clip at once (a process each): a clip's cloth depends only on its own body motion
        fresh = skirt.bake_many(cloth, [(name, r['local'], r['pelvis'], spec.get('fps', 30) if spec['kind'] == 'cycle' else 30, loop, spec.get('speed', 0),
                                         np.array(spec['sim']['yaw'], float) if spec.get('sim') else None) for name, spec, r, loop, take, rt in todo], log=bool(os.environ.get('FTF_LOG')))
    for name, spec, r, loop, take, rt in todo:
        body = r['local'][:-1] if loop else r['local']
        chain = []
        if ch.get('chains', True):
            if not cloth:               # with a cloth bake every chain bone comes from the bake instead
                sim = chains.simulate(rig, body, r['pelvis'][:len(body)], fps=spec.get('fps', 30) if spec['kind'] == 'cycle' else 30, loop=loop, air_speed=spec.get('speed', 0))
                r['local'] = np.concatenate([sim, sim[:1]]) if loop else sim
                print(name, 'chain lag max (deg):', {k: round(v, 1) for k, v in chains.LAG.items()})
            chain = [rig.names[i] for _, bs in chains.chain_bones(rig) for i in bs]
        if cloth:
            fps_c = spec.get('fps', 30) if spec['kind'] == 'cycle' else 30
            key = np.round(r['local'][:, [i for i, b in enumerate(rig.names) if b not in chain]], 4)
            sig = float(np.abs(key).sum() + np.abs(rig.rest_wp).sum() + np.abs(cloth.grid).sum())      # the bake belongs to exactly this body motion, skeleton and gown
            cb = [i for i, b in enumerate(rig.names) if b in chain]
            if a.bake:
                r['local'] = fresh[name]
                baked[name + '/q'] = r['local'][:, cb].astype(np.float32); baked[name + '/sig'] = np.array(sig); baked['bones'] = np.array([rig.names[i] for i in cb])
            else:
                if name + '/q' not in baked or abs(float(baked[name + '/sig']) - sig) > 1e-6 * max(sig, 1) or [str(x) for x in baked['bones']] != [rig.names[i] for i in cb]:
                    raise SystemExit(f'{name}: the stored cloth bake is missing or belongs to another body motion; run build_clips.py --char {a.char} --bake')
                r['local'][:, cb] = baked[name + '/q']
            if True:
                n_c = len(r['local']) - (1 if loop else 0)
                dmin, who = cloth.distance(r['local'][:n_c], r['pelvis'][:n_c]); ins, thru = cloth.inside(r['local'][:n_c], r['pelvis'][:n_c])
                f = int(dmin.argmin())
                r['stats']['gown_min_m'] = round(float(dmin.min()), 4); r['stats']['gown_min_at'] = [f, who[f]]; r['stats']['gown_knee_in_slit_frames'] = int((~ins).sum()); r['stats']['gown_leg_through_cloth_frames'] = int(thru.sum())
                if dmin.min() < 0 or thru.any():
                    failed.append(name)
        bones = chain + [b for b in rig.names if b in rt.mapped or b.startswith(('toe_', 'thumb_', 'index_', 'fingers_'))]
        extras = {'take': 'CMU ' + take, 'speed': spec.get('speed', 0), 'loop': loop, 'pelvis_y': round(float(np.mean(r['pelvis'][:, 1])), 3)}
        extras.update(ch.get('extras', {}))      # per-character facts the game reads (e.g. `scale`: leg length over the shared reference's)
        for k in ('seat', 'note'):
            if k in spec:
                extras[k] = spec[k]
        if spec['kind'] == 'cycle':     # the planted intervals as fractions of the stride: [start, length] per foot
            n_c = len(r['local']) - 1
            extras['contact'] = {s: [round(r['stats']['contact'][s][0] / n_c, 4), round(r['stats']['contact'][s][1] / n_c, 4)] for s in 'LR'}
        clips.append({'fps': spec.get('fps', 30) if spec['kind'] == 'cycle' else 30, 'name': name, 'local': r['local'], 'pelvis': r['pelvis'] if ch.get('world_pelvis') else rig.pelvis_local(r['pelvis']), 'bones': bones, 'extras': extras})
        report[name] = {'take': take, **r['stats']}
        print(name, json.dumps(report[name]))
    if a.bake:
        np.savez_compressed(bake_path, **baked); print('wrote', bake_path)
    if os.environ.get('FTF_DUMP'):      # debugging: the final local rotations of every clip
        np.savez_compressed(os.environ['FTF_DUMP'], names=np.array(rig.names), rest_r=rig.rest_r, pelvis_rest=rig.rest_wp[rig.index['pelvis']], pelvis_rest_wr=rig.rest_wr[rig.index['pelvis']], **{k: v for c in clips for k, v in ((c['name'] + '/local', c['local']), (c['name'] + '/pelvis', built[c['name']]['pelvis']))})
    if failed and os.environ.get('FTF_ALLOW_FAIL'):      # debugging: write the clips anyway, to film what failed
        print('LEG-VS-GOWN CHECK FAILED (written anyway, FTF_ALLOW_FAIL): ' + ', '.join(failed))
    elif failed:      # a leg capsule cuts the gown (or the enclosed leg left it): nothing is written
        raise SystemExit('LEG-VS-GOWN CHECK FAILED: ' + ', '.join(failed))
    out = a.out or os.path.join(REPO, 'game/public/assets/anim', ch.get('out', a.char) + '.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_clips_glb(out, rig, clips, extras={'character': a.char, 'source': 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), retargeted by art/anim'})
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    if not only:
        json.dump(report, open(os.path.join(HERE, 'out', a.char + '.json'), 'w'), indent=1)
    print('wrote', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main()
