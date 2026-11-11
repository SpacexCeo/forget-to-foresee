"""Elise stage A1: similarity-ICP of the detailed head onto the body's coarse head; both to metres, Z-up, front -Y.
   python3 a1_align.py  (in /root/w/elise/work) -> a1_body.ply a1_head.ply a1.json"""
import numpy as np, trimesh, json
from scipy.spatial import cKDTree
def load(p):
    m = trimesh.load(p, force='mesh', process=False)
    v = np.asarray(m.vertices); v = np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)  # glTF Y-up -> Z-up, front -Y
    return trimesh.Trimesh(v, m.faces, process=False)
B = load('elise_body.glb'); H = load('elise_head.glb')
S = 1.75 / (B.vertices[:, 2].max() - B.vertices[:, 2].min())
B.vertices = (B.vertices - [0, 0, B.vertices[:, 2].min()]) * S
bh = B.vertices[B.vertices[:, 2] > 1.53]            # body's head (above the neck)
hh = H.vertices[H.vertices[:, 2] > -0.45]
rng = np.random.default_rng(1)
bh = bh[rng.choice(len(bh), min(len(bh), 40000), replace=False)]; hs = hh[rng.choice(len(hh), 40000, replace=False)]
s = (bh[:, 0].max() - bh[:, 0].min()) / (hs[:, 0].max() - hs[:, 0].min())
t = bh.mean(0) - s * hs.mean(0); R = np.eye(3)
tree = cKDTree(bh); tb = None
for it in range(60):
    p = s * hs @ R.T + t
    d, i = tree.query(p)
    d2, j = cKDTree(p).query(bh)
    k1 = d < np.percentile(d, 80); k2 = d2 < np.percentile(d2, 80)
    X = np.concatenate([hs[k1], hs[j[k2]]]); Y = np.concatenate([bh[i[k1]], bh[k2]])
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my
    U, D, Vt = np.linalg.svd(Yc.T @ Xc / len(X)); E = np.eye(3); E[2, 2] = np.sign(np.linalg.det(U @ Vt))
    R = U @ E @ Vt; s = np.trace(np.diag(D) @ E) / (Xc ** 2).sum(1).mean(); t = my - s * R @ mx
print('scale', s, 'R', np.round(R, 3).tolist(), 't', t, 'resid mm', np.median(d) * 1000, np.median(d2) * 1000)
H.vertices = s * H.vertices @ R.T + t
print('head bbox', H.vertices.min(0), H.vertices.max(0)); print('body bbox', B.vertices.min(0), B.vertices.max(0))
B.export('a1_body.ply'); H.export('a1_head.ply')
json.dump({'S': S, 's': s, 'R': R.tolist(), 't': t.tolist()}, open('a1.json', 'w'))
