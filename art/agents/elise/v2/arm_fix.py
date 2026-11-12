#!/usr/bin/env python3
"""Elise: gives her arms and shoulders back (owner 12.11: "her shoulders are broken").

Cause: the export's decimation collapsed each bare arm, a straight smooth tube, into a fan of 17 triangles that run
from two points (one in the armpit, one on the collar) straight down to the wrist ring. There was no shoulder and no
arm surface at all, and nothing was weighted to the upper arm: the shoulder pinched, the elbow could not bend and
any twist of the arm wrung the whole fan.

Fix, on the shipped file (the Blender scene of v2 lived on a rented server that is gone): the fan is removed and each
arm is built again in the rest pose around her own joints:
  - a rounded shoulder (deltoid) over the shoulder joint, an upper arm, an elbow, a forearm with a soft swell, ending
    inside the wrist wrap; rings every `--ring` metres, `--segs` vertices around;
  - weights along shoulder -> upper arm -> forearm with smooth blends at the shoulder and the elbow (the cap follows
    the shoulder bone and the chest, so a raised arm lifts the shoulder line);
  - the same tube 2.5 mm wider with reversed faces in the ink-outline primitive;
  - flat skin colour (the fan's own texel), morph targets zero.
Skeleton, rest pose, textures and every other vertex are untouched, so her clips and the baked gown stay valid.

    art/agents/elise/v2/arm_fix.sh <in.glb> <out.glb> [--ring 0.028 --segs 12]      (dequantize, this script, meshopt)
"""
import argparse
import json
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'anim'))
from ftfanim.rig import Rig  # noqa: E402

CT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Glb:
    def __init__(self, path):
        b = open(path, 'rb').read(); n = struct.unpack_from('<I', b, 12)[0]
        self.j = json.loads(b[20:20 + n]); self.bin = bytearray(b[20 + n + 8:])

    def acc(self, i):
        a = self.j['accessors'][i]; v = self.j['bufferViews'][a['bufferView']]; k = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride', 0) or dt.itemsize * k
        raw = np.frombuffer(self.bin, np.uint8, st * (a['count'] - 1) + dt.itemsize * k, off)
        idx = (np.arange(a['count'])[:, None] * st + np.arange(dt.itemsize * k)[None]).ravel()
        return np.frombuffer(raw[idx].tobytes(), dt).reshape(a['count'], k).copy()

    def add(self, arr, typ, ctype, target=None, normalized=False, minmax=False):
        arr = np.ascontiguousarray(arr, dtype=np.dtype(CT[ctype]))
        while len(self.bin) % 4:
            self.bin.append(0)
        bv = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': arr.nbytes}
        if target:
            bv['target'] = target
        self.bin.extend(arr.tobytes()); self.j['bufferViews'].append(bv)
        a = {'bufferView': len(self.j['bufferViews']) - 1, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if normalized:
            a['normalized'] = True
        if minmax:
            a['min'] = [float(x) for x in arr.reshape(arr.shape[0], -1).min(0)]; a['max'] = [float(x) for x in arr.reshape(arr.shape[0], -1).max(0)]
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def save(self, path):
        self.j['buffers'][0]['byteLength'] = len(self.bin) + (-len(self.bin) % 4)
        js = json.dumps(self.j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4); bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        open(path, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(bn)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bn), b'BIN\0') + bn)


def rotm(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def smooth(u):
    u = np.clip(u, 0, 1); return u * u * (3 - 2 * u)


def arm_param(P, S, E, W):
    """For points P: distance along the arm from the shoulder joint (m, through the elbow) and from its axis."""
    l1 = np.linalg.norm(E - S); l2 = np.linalg.norm(W - E)
    u1 = (E - S) / l1; u2 = (W - E) / l2
    t1 = (P - S) @ u1; t2 = (P - E) @ u2
    c1 = S + np.clip(t1, -0.2, l1)[:, None] * u1; c2 = E + np.clip(t2, 0, l2 + 0.2)[:, None] * u2
    d1 = np.linalg.norm(P - c1, axis=1); d2 = np.linalg.norm(P - c2, axis=1)
    first = d1 <= d2
    return np.where(first, np.clip(t1, -0.2, l1), l1 + np.clip(t2, 0, l2 + 0.2)), np.where(first, d1, d2), l1, l2


# radius of the arm (m) at a distance along it, as fractions of the upper arm (0..1) and the forearm (1..2)
PROFILE = [(0.0, 0.0420), (0.12, 0.0415), (0.30, 0.0385), (0.55, 0.0355), (0.85, 0.0335), (1.0, 0.0325), (1.12, 0.0335), (1.28, 0.0335), (1.55, 0.0290), (1.80, 0.0245), (2.0, 0.0225)]


def build_arm(S, E, Wc, sd, ring, segs, grow=0.0):
    """Vertices (world), normals, triangles and the distance along the arm of a new arm: a shoulder cap over S, a tube
    through E to the wrist centre Wc."""
    l1 = np.linalg.norm(E - S); l2 = np.linalg.norm(Wc - E)
    u1 = (E - S) / l1; u2 = (Wc - E) / l2
    # a frame around the arm: `fwd` is her front, `side` completes it
    def frame(u):
        f = np.array([0, 0, 1.0]); f = f - u * (f @ u); f /= np.linalg.norm(f); return f, np.cross(u, f)
    n1 = max(3, int(round(l1 / ring))); n2 = max(3, int(round(l2 / ring)))
    stations = [(k / n1, S + u1 * l1 * k / n1, u1) for k in range(n1)]
    um = (u1 + u2) / np.linalg.norm(u1 + u2)
    stations.append((1.0, E, um))
    stations += [(1 + k / n2, E + u2 * l2 * k / n2, u2) for k in range(1, n2 + 1)]
    px = np.array([p[0] for p in PROFILE]); pr = np.array([p[1] for p in PROFILE])
    V, Nn, A = [], [], []
    ang = np.arange(segs) * 2 * np.pi / segs
    # the shoulder cap: a low dome over the joint, leaning up and inward toward the collar
    capn = 3
    r0 = float(np.interp(0, px, pr)) + grow
    f, sdir = frame(u1)
    for k in range(capn, 0, -1):
        th = (k / (capn + 0.35)) * np.pi / 2
        c = S - u1 * r0 * 0.92 * np.sin(th); rr = r0 * np.cos(th)
        for a in ang:
            d = f * np.cos(a) + sdir * np.sin(a)
            V.append(c + d * rr); nn = d * np.cos(th) - u1 * np.sin(th); Nn.append(nn / np.linalg.norm(nn)); A.append(-r0 * 0.92 * np.sin(th))
    for x, c, u in stations:
        f, sdir = frame(u); rr = float(np.interp(x, px, pr)) + grow
        for a in ang:
            d = f * np.cos(a) + sdir * np.sin(a)
            # the upper arm is a little deeper front to back than it is wide; the wrist is flatter
            e = 1.0 + (0.06 if x < 1 else -0.10 * max(0.0, x - 1.4) / 0.6) * abs(np.cos(a)) - (0.0 if x < 1 else 0.0)
            V.append(c + d * rr * e); Nn.append(d); A.append(l1 * x if x <= 1 else l1 + l2 * (x - 1))
    rings = capn + len(stations)
    top = len(V); V.append(S - u1 * r0 * 0.92 * np.sin((capn + 0.18) / (capn + 0.35) * np.pi / 2) - u1 * 0.002); Nn.append(-u1); A.append(-r0)
    T = []
    for k in range(rings - 1):
        for i in range(segs):
            a0, a1, b0, b1 = k * segs + i, k * segs + (i + 1) % segs, (k + 1) * segs + i, (k + 1) * segs + (i + 1) % segs
            T += [[a0, b0, a1], [a1, b0, b1]]
    for i in range(segs):
        T.append([top, i, (i + 1) % segs])
    V = np.array(V); Nn = np.array(Nn); T = np.array(T, int)
    # outward winding: face normals must agree with the vertex normals
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    if np.sum(fn * Nn[T].mean(1)) < 0:
        T = T[:, ::-1]
    return V, Nn, T, np.array(A), l1, l2


def fix_primitive(g, rig, prim, names, ibm, ring, segs, outline, log):
    A = prim['attributes']
    P = g.acc(A['POSITION']).astype(float); N = g.acc(A['NORMAL']).astype(float); UV = g.acc(A['TEXCOORD_0']).astype(float)
    J = g.acc(A['JOINTS_0']).astype(int); Wt = g.acc(A['WEIGHTS_0']).astype(float)
    idx = g.acc(prim['indices'])[:, 0].astype(int).reshape(-1, 3)
    targets = [g.acc(t['POSITION']).astype(float) for t in prim.get('targets', [])]
    # mesh space -> world (rest): every joint's bind gives the same matrix
    k0 = names.index('chest'); i0 = rig.index['chest']
    Mj = np.eye(4); Mj[:3, :3] = rotm(rig.rest_wr[i0]); Mj[:3, 3] = rig.rest_wp[i0]
    M = Mj @ ibm[k0]; Mi = np.linalg.inv(M)
    world = lambda p: p @ M[:3, :3].T + M[:3, 3]
    Wd = np.zeros((len(P), len(names)))
    for c in range(4):
        np.add.at(Wd, (np.arange(len(P)), J[:, c]), Wt[:, c])
    n0, t0 = len(P), len(idx)
    Pw = world(P)
    Nw = N @ M[:3, :3].T
    # which way this primitive's faces and normals look (the outline hull is turned inside out)
    fn = np.cross(Pw[idx[:, 1]] - Pw[idx[:, 0]], Pw[idx[:, 2]] - Pw[idx[:, 0]]); cen = Pw[idx].mean(1)
    head = cen[:, 1] > 1.55; out_dir = cen[head] - np.array([0, 1.62, 0.0])
    face_out = np.sign(np.sum(fn[head] * out_dir)); norm_out = np.sign(np.sum(Nw[idx[head]].mean(1) * out_dir))
    stats = {}
    for sd in 'LR':
        sg = 1 if sd == 'L' else -1
        S, E, Wr = (rig.rest_wp[rig.index[f'{b}_{sd}']] for b in ('upperarm', 'forearm', 'hand'))
        a, r, l1, l2 = arm_param(Pw, S, E, Wr)
        ta = a[idx]; tr = r[idx]
        fan = (ta.max(1) - ta.min(1) > 0.10) & (tr.max(1) < 0.085) & (np.sign(Pw[idx][:, :, 0].mean(1)) == sg)
        assert 8 <= fan.sum() <= 40, ('the collapsed arm was not found as expected', sd, int(fan.sum()))
        # skin texel: the middle of the fan's largest triangle
        T = Pw[idx[fan]]; area = np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1)
        uv = UV[idx[fan][area.argmax()]].mean(0)
        # the wrist: the fan's lower vertices
        low = np.unique(idx[fan]); low = low[a[low] > 0.3]
        Wc = Pw[low].mean(0)
        Wc = E + (Wc - E) * (1 + 0.012 / np.linalg.norm(Wc - E))            # ends a little inside the wrap
        V, Nn, Tn, Aa, l1, l2 = build_arm(S, E, Wc, sd, ring, segs, grow=0.0025 if outline else 0.0)
        if face_out < 0:
            Tn = Tn[:, ::-1]
        if norm_out < 0:
            Nn = -Nn
        ks, ku, kf, kc, kh = (names.index(n) for n in (f'shoulder_{sd}', f'upperarm_{sd}', f'forearm_{sd}', 'chest', f'hand_{sd}'))
        w_torso = 1 - smooth((Aa + 0.035) / 0.10)
        w_fore = smooth((Aa - (l1 - 0.05)) / 0.10)
        w_hand = 0.35 * smooth((Aa - (l1 + l2 - 0.05)) / 0.05)
        new = np.zeros((len(V), len(names)))
        new[:, ks] = w_torso * 0.75; new[:, kc] = w_torso * 0.25
        new[:, kf] = (1 - w_torso) * w_fore * (1 - w_hand); new[:, kh] = (1 - w_torso) * w_fore * w_hand; new[:, ku] = (1 - w_torso) * (1 - w_fore)
        idx = np.vstack([idx[~fan], Tn + len(P)])
        P = np.vstack([P, (V - M[:3, 3]) @ Mi[:3, :3].T]); Pw = np.vstack([Pw, V])
        Nl = Nn @ np.linalg.inv(M[:3, :3]).T; N = np.vstack([N, Nl / np.linalg.norm(Nl, axis=1, keepdims=True)])
        UV = np.vstack([UV, np.repeat(uv[None], len(V), 0)]); Wd = np.vstack([Wd, new])
        targets = [np.vstack([tg, np.zeros((len(V), 3))]) for tg in targets]
        stats[sd] = {'fan_triangles_removed': int(fan.sum()), 'vertices': len(V), 'triangles': len(Tn), 'wrist': [round(float(x), 3) for x in Wc]}
    # --- write the primitive again: four strongest joints per vertex
    order = np.argsort(-Wd, 1)[:, :4]; w4 = np.take_along_axis(Wd, order, 1); w4[w4 < 1e-4] = 0; order[w4 == 0] = 0
    w4 /= w4.sum(1, keepdims=True)
    A['POSITION'] = g.add(P, 'VEC3', 5126, 34962, minmax=True)
    A['NORMAL'] = g.add(N, 'VEC3', 5126, 34962)
    A['TEXCOORD_0'] = g.add(UV, 'VEC2', 5126, 34962)
    A['JOINTS_0'] = g.add(order, 'VEC4', 5121, 34962)
    A['WEIGHTS_0'] = g.add(w4, 'VEC4', 5126, 34962)
    prim['indices'] = g.add(idx.reshape(-1, 1), 'SCALAR', 5125, 34963)
    for tg, arr in zip(prim.get('targets', []), targets):
        tg['POSITION'] = g.add(arr, 'VEC3', 5126, 34962, minmax=True)
    log({'vertices': [n0, len(P)], 'triangles': [t0, len(idx)], 'faces_out': int(face_out), 'normals_out': int(norm_out), 'arms': stats})


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--ring', type=float, default=0.028); ap.add_argument('--segs', type=int, default=12)
    a = ap.parse_args()
    g = Glb(a.src); j = g.j
    assert 'EXT_meshopt_compression' not in j.get('extensionsUsed', []), 'dequantize the file first (gltf-transform dequantize)'
    rig = Rig(a.src)
    skin = j['skins'][0]; names = [j['nodes'][k]['name'] for k in skin['joints']]
    ibm = g.acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(float)
    for mesh in j['meshes']:
        for prim in mesh['primitives']:
            name = j['materials'][prim['material']]['name']
            fix_primitive(g, rig, prim, names, ibm, a.ring, a.segs, 'outline' in name, lambda s: print(name, json.dumps(s)))
    g.save(a.out)


if __name__ == '__main__':
    main()
