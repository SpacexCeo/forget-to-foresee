"""Elise: does a leg ever come through the gown? Skins the exported model with every clip of the
side-car file (plain linear blend skinning, as the engine does) and measures, per frame, how far each leg vertex
stands outside the nearest gown triangle (open slit and hem edges excluded). Exits 1 if any clip exceeds the limit.
    python3 skirt_check.py <model_raw.glb> <clips.glb> <model>_check.npz [limit m, default 0.004]"""
import json, struct, sys
import numpy as np, trimesh
from scipy.spatial import cKDTree
def glb(p):
    d = open(p, 'rb').read(); jl = struct.unpack_from('<I', d, 12)[0]; return json.loads(d[20:20 + jl]), d[28 + jl:]
def acc(J, B, i):
    a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    dt = {5120: 'i1', 5121: 'u1', 5122: 'i2', 5123: 'u2', 5125: 'u4', 5126: 'f4'}[a['componentType']]; o = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride', 0)
    if st and st != np.dtype(dt).itemsize * n: return np.stack([np.frombuffer(B, dt, n, o + k * st) for k in range(a['count'])])
    return np.frombuffer(B, dt, a['count'] * n, o).reshape(a['count'], n)
def qm(q):
    x, y, z, w = q; return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
J, B = glb(sys.argv[1]); C, CB = glb(sys.argv[2]); K = np.load(sys.argv[3]); LIM = float(sys.argv[4]) if len(sys.argv) > 4 else 0.004
node = next(n for n in J['nodes'] if 'mesh' in n); pr = J['meshes'][node['mesh']]['primitives'][0]; sk = J['skins'][node['skin']]
P = acc(J, B, pr['attributes']['POSITION']).astype(float); JN = acc(J, B, pr['attributes']['JOINTS_0']).astype(int); JW = acc(J, B, pr['attributes']['WEIGHTS_0']).astype(float); JW /= JW.sum(1, keepdims=True)
IB = acc(J, B, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(float); joints = sk['joints']; par = {c: i for i, n in enumerate(J['nodes']) for c in n.get('children', [])}
b2g = lambda p: np.stack([p[..., 0], p[..., 2], -p[..., 1]], -1); T = cKDTree(P)
dl, il = T.query(b2g(K['leg'])); dg, ig = T.query(b2g(K['gown']).reshape(-1, 3)); ig = ig.reshape(-1, 3); assert dl.max() < 1e-4 and dg.max() < 1e-4, (dl.max(), dg.max())
use = np.unique(np.r_[il, ig.ravel()]); rem = np.full(len(P), -1); rem[use] = np.arange(len(use)); il = rem[il]; ig = rem[ig]
e = np.sort(np.concatenate([ig[:, [0, 1]], ig[:, [1, 2]], ig[:, [2, 0]]]), 1); u, inv, cnt = np.unique(e, axis=0, return_inverse=True, return_counts=True); edge = (cnt[inv.ravel()] == 1).reshape(3, -1).any(0)
name2 = {n.get('name'): i for i, n in enumerate(J['nodes'])}; cname = {i: n.get('name') for i, n in enumerate(C['nodes'])}
def world(loc):
    W = {}
    def w(i):
        if i not in W:
            n = J['nodes'][i]; t, r, s = loc.get(i, (n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1])))
            M = np.eye(4); M[:3, :3] = qm(r) * np.asarray(s); M[:3, 3] = t; W[i] = (w(par[i]) @ M) if i in par else M
        return W[i]
    return np.stack([w(j) for j in joints])
bad = 0
for A in C['animations']:
    tr = {}; nk = 0
    for ch in A['channels']:
        s = A['samplers'][ch['sampler']]; i = name2.get(cname[ch['target']['node']])
        if i is not None and ch['target']['path'] in ('rotation', 'translation'): v = acc(C, CB, s['output']).astype(float); tr[(i, ch['target']['path'])] = v; nk = max(nk, len(v))
    worst = 0.0; nb = 0; fr = range(0, nk, 2); wv = None
    for f in fr:
        loc = {}
        for (i, path), v in tr.items():
            n = J['nodes'][i]; cur = loc.get(i, (n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1]))); val = v[min(f, len(v) - 1)]
            loc[i] = (val, cur[1], cur[2]) if path == 'translation' else (cur[0], val, cur[2])
        S = world(loc) @ IB; Mv = (S[JN[use]] * JW[use][:, :, None, None]).sum(1); D = (Mv[:, :3, :3] @ P[use][:, :, None])[:, :, 0] + Mv[:, :3, 3]
        gm = trimesh.Trimesh(D, ig, process=False); cp, dist, tid = trimesh.proximity.closest_point(gm, D[il]); out = ((D[il] - cp) * gm.face_normals[tid]).sum(1)
        same = abs(P[use][ig[tid]][:, :, 1].mean(1) - P[use][il][:, 1]) < 0.12       # the cloth of the vertex's own height, not a fold of the lower gown
        out = np.where(edge[tid] | (dist > 0.05) | ~same, 0, out); nb += out.max() > LIM
        if out.max() > worst: worst = float(out.max()); wv = P[use][il[out.argmax()]]
    print('%-10s frames %3d  worst leg-outside-gown %.4f m  frames over %.3f: %d' % (A['name'], len(fr), worst, LIM, nb), '' if wv is None else ' worst vertex at rest: height %.2f, side %.2f, front %.2f' % (wv[1], wv[0], wv[2])); bad += nb > 0
sys.exit(1 if bad else 0)
