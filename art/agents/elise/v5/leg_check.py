#!/usr/bin/env python3
"""Elise: her legs against her dress, measured on the game mesh itself (not on capsules).

    python3 art/agents/elise/v5/leg_check.py <model_raw.glb> <clips.glb> [--json out.json] [--only walk,run] [--every 1] [--tol 2.0]

`model_raw.glb` is the uncompressed export of the build (same vertices and weights as the shipped file), `clips.glb`
the uncompressed clip file. For every frame of every clip the model is skinned as the game skins it (linear blend,
four influences per vertex). Then every point of the dress below the waist (vertices, edge midpoints, face centres)
is tested against the body under it: a dress point that lies UNDER the skin is cloth inside a leg, and that is what
shows on screen as a leg through the cloth, from any camera. The depth under the skin is measured along the skin's
normal at the nearest body point; a point counts only when it is straight under that skin (within 8 mm sideways).

Where the source model already has the dress touching the body in its rest pose, that depth is the baseline: a frame
is charged only with what it adds to it. Shoes are reported apart: a floor-length hem lies on the shoes, and a shoe
showing under the hem is wanted.

Exit code 1 when a leg (thigh, knee, shin) is more than `--tol` mm through the dress in any frame.
Needs numpy and scipy.
"""
import argparse
import json
import os
import struct
import sys

import numpy as np
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'anim'))
from ftfanim.rig import Rig                       # noqa: E402
from ftfanim.skirt import qmat                    # noqa: E402
from ftfanim.quat import qinv, qmul               # noqa: E402
from iris_combat import read_clips                # noqa: E402

CT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_mesh(path):
    """The skinned mesh of a .glb without the outline hull: positions, triangles, joints (bone names), weights."""
    b = open(path, 'rb').read(); n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20 + n]); off = 20 + n + 8

    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; k = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
        start = off + v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride') or dt.itemsize * k
        raw = np.frombuffer(b, np.uint8, (a['count'] - 1) * stride + dt.itemsize * k, start)
        out = np.lib.stride_tricks.as_strided(raw, (a['count'], dt.itemsize * k), (stride, 1)).copy().view(dt).reshape(a['count'], k).astype(float)
        if a.get('normalized'):
            out /= {5121: 255.0, 5123: 65535.0}[a['componentType']]
        return out
    mesh = next(m for m in j['meshes'] if any('JOINTS_0' in p['attributes'] for p in m['primitives']))
    prim = next(p for p in mesh['primitives'] if 'outline' not in j['materials'][p['material']]['name'])
    names = [j['nodes'][k]['name'] for k in j['skins'][0]['joints']]
    w = acc(prim['attributes']['WEIGHTS_0']); w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
    return acc(prim['attributes']['POSITION']), acc(prim['indices']).astype(int).reshape(-1, 3), acc(prim['attributes']['JOINTS_0']).astype(int), w, names


def components(P, T):
    """Connected pieces of a triangle soup whose seams are split vertices: welded by position first."""
    _, weld = np.unique(np.round(P / 2e-5).astype(np.int64), axis=0, return_inverse=True); weld = weld.ravel()
    par = np.arange(weld.max() + 1)

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]; i = par[i]
        return i
    for a, b_ in np.concatenate([weld[T[:, [0, 1]]], weld[T[:, [1, 2]]]]):
        ra, rb = find(a), find(b_)
        if ra != rb:
            par[ra] = rb
    return np.array([find(i) for i in weld]), weld


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('model'); ap.add_argument('clips')
    ap.add_argument('--json', default=''); ap.add_argument('--only', default=''); ap.add_argument('--every', type=int, default=1)
    ap.add_argument('--tol', type=float, default=2.0, help='mm of cloth under the skin of a leg that fails the check')
    ap.add_argument('--dump', default='', help='write the worst frame of each failing clip as .npz (skinned body and dress) for a look')
    a = ap.parse_args()
    rig = Rig(a.model); P, T, JN, W, jnames = read_mesh(a.model)
    jb = np.array([rig.index[n] for n in jnames]); VB = jb[JN]                                   # [V, 4] rig bone per influence
    share = lambda pre: np.array([[rig.names[b].startswith(pre) for b in row] for row in VB]) * W
    w_skirt = share('skirt_').sum(1); w_leg = sum(share(p).sum(1) for p in ('thigh_', 'shin_', 'foot_', 'toe_')); w_foot = share('foot_').sum(1) + share('toe_').sum(1)
    w_arm = sum(share(p).sum(1) for p in ('upperarm_', 'forearm_', 'hand_', 'index_', 'fingers_', 'thumb_', 'ribbon_'))
    comp, weld = components(P, T)
    ids = np.unique(comp); dress_c = ids[np.argmax([w_skirt[comp == c].sum() for c in ids])]; body_c = ids[np.argmax([w_leg[comp == c].sum() for c in ids])]
    assert dress_c != body_c, 'the dress and the body are one piece in this file'
    # the body under the dress: its triangles below the chest, without the arms and hands
    bt = T[(comp[T[:, 0]] == body_c) & (P[T].max(1)[:, 1] < 1.10) & (w_arm[T].max(1) < 0.3)]
    bv = np.unique(bt); bmap = -np.ones(len(P), int); bmap[bv] = np.arange(len(bv)); btl = bmap[bt]
    dom = np.array([rig.names[VB[v, np.argmax(W[v])]] for v in bv])                              # the bone that mostly carries each body vertex
    dom_f = dom[btl[:, 0]]
    # the dress below the waist: vertices, edge midpoints, face centres
    dt = T[(comp[T[:, 0]] == dress_c) & (P[T].max(1)[:, 1] < 1.02)]
    dv = np.unique(dt); dmap = -np.ones(len(P), int); dmap[dv] = np.arange(len(dv)); dtl = dmap[dt]
    e = np.unique(np.sort(np.concatenate([dtl[:, [0, 1]], dtl[:, [1, 2]], dtl[:, [2, 0]]]), 1), axis=0)
    print('mesh: %d vertices; body under the dress %d triangles, dress below the waist %d triangles -> %d test points' % (len(P), len(bt), len(dt), len(dv) + len(e) + len(dt)))
    rest_M = qmat(qinv(rig.rest_wr)); LAT = 0.008

    def skin(wr, wp):
        """Skinned vertex positions of one pose [V, 3]."""
        M = qmat(qmul(wr, qinv(rig.rest_wr))); t = wp - np.einsum('bij,bj->bi', M, rig.rest_wp)
        out = np.zeros_like(P)
        for k in range(4):
            out += W[:, k, None] * (np.einsum('vij,vj->vi', M[VB[:, k]], P) + t[VB[:, k]])
        return out

    def depths(X):
        """Per dress test point: mm under the skin of the nearest body point (negative: clear of it), and that
        body point's bone."""
        B = X[bv]; tri = B[btl]; fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        vn = np.zeros_like(B)
        for k in range(3):
            np.add.at(vn, btl[:, k], fn)
        vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12); fnn = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
        bp = np.concatenate([B, tri.mean(1)]); bn = np.concatenate([vn, fnn]); bb = np.concatenate([dom, dom_f])
        D = X[dv]; dp = np.concatenate([D, 0.5 * (D[e[:, 0]] + D[e[:, 1]]), D[dtl].mean(1)])
        dist, idx = cKDTree(bp).query(dp, k=4, distance_upper_bound=0.06)
        best = np.full(len(dp), -99.0); who = np.zeros(len(dp), int)
        for k in range(4):
            ok = np.isfinite(dist[:, k]); i = np.where(ok, idx[:, k], 0)
            v = dp - bp[i]; s = np.sum(v * bn[i], 1); lat = np.linalg.norm(v - s[:, None] * bn[i], axis=1)
            d = np.where(ok & (lat < LAT), -s * 1000.0, -99.0)
            better = d > best; best = np.where(better, d, best); who = np.where(better, i, who)
        return best, bb[who], dp

    base, _, dp_rest = depths(P)
    print('rest pose: the source dress already lies up to %.1f mm under the skin (%d test points over 1 mm): the baseline' % (max(base.max(), 0), int((base > 1).sum())))
    base = np.maximum(base, 0)
    clips = read_clips(a.clips, rig); only = [x for x in a.only.split(',') if x]; report = {}; bad = []
    for name, c in clips.items():
        if only and name not in only:
            continue
        F = len(c['local']); lpos = np.repeat(rig.rest_t[None], F, 0)
        if c['pelvis'] is not None:
            lpos[:, rig.index['pelvis']] = c['pelvis']
        wr, wp = rig.fk(c['local'], None, lpos)
        worst = {'leg': (0.0, 0, ''), 'shoe': (0.0, 0, '')}; frames_bad = 0; pts_max = 0; where = None
        for f in range(0, F, a.every):
            d, bone, dp = depths(skin(wr[f], wp[f])); d = d - base
            shoe = np.array([b.startswith(('foot_', 'toe_')) for b in bone]); leg = ~shoe
            for key, m in (('leg', leg), ('shoe', shoe)):
                if m.any() and d[m].max() > worst[key][0]:
                    i = np.nonzero(m)[0][np.argmax(d[m])]; worst[key] = (float(d[i]), f, str(bone[i]))
            nb = int((d[leg] > a.tol).sum()); frames_bad += nb > 0
            if nb > pts_max:      # where on the dress (in its rest pose) the cloth is under the skin, at the worst frame
                pts_max = nb; m_ = leg & (d > a.tol); q = dp_rest[m_]; dq = d[m_]; bands = ((0.88, 9), (0.72, 0.88), (0.5, 0.72), (0.25, 0.5), (0, 0.25))
                where = 'by height at rest (points, deepest mm, where x / front z): ' + '; '.join('%.2f-%s: %d, %.1f, x %.2f z %.2f' % (lo, ('%.2f' % hi) if hi < 9 else 'up', int(((q[:, 1] >= lo) & (q[:, 1] < hi)).sum()), dq[(q[:, 1] >= lo) & (q[:, 1] < hi)].max(), *q[(q[:, 1] >= lo) & (q[:, 1] < hi)][np.argmax(dq[(q[:, 1] >= lo) & (q[:, 1] < hi)])][[0, 2]]) for lo, hi in bands if ((q[:, 1] >= lo) & (q[:, 1] < hi)).any())
        report[name] = {'frames': F, 'leg_through_mm': round(worst['leg'][0], 1), 'at_frame': worst['leg'][1], 'bone': worst['leg'][2], 'frames_over_tol': int(frames_bad), 'points_over_tol_max': pts_max,
                        'shoe_through_hem_mm': round(worst['shoe'][0], 1), 'shoe_at_frame': worst['shoe'][1]}
        ok = worst['leg'][0] <= a.tol
        if not ok:
            bad.append(name)
            if a.dump:
                f = worst['leg'][1]; X = skin(wr[f], wp[f]); np.savez_compressed(a.dump.replace('.npz', '_%s.npz' % name), body=X[bv], body_tris=btl, dress=X[dv], dress_tris=dtl, frame=f)
        print('%-14s %3d frames  leg through the dress %5.1f mm (frame %d, %s; %d frames over %.1f mm, %d points at worst)   shoe through the hem %5.1f mm  %s' % (
            name, F, worst['leg'][0], worst['leg'][1], worst['leg'][2], frames_bad, a.tol, pts_max, worst['shoe'][0], 'ok' if ok else 'FAIL'))
        if where and not ok:
            print('               on the dress at rest: ' + where)
    if a.json:
        json.dump({'model': os.path.basename(a.model), 'tolerance_mm': a.tol, 'rest_baseline_max_mm': round(float(base.max()), 1), 'clips': report}, open(a.json, 'w'), indent=1)
    print('LEG CHECK:', 'FAILED: ' + ', '.join(bad) if bad else 'passed: no leg through the dress in %d clips' % len(report))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
