import numpy as np, trimesh, json, sys
from scipy.spatial import cKDTree
sys.path.insert(0, 's'); import views
B = trimesh.load('a1_body.ply', process=False)
def load(p):
    m = trimesh.load(p, force='mesh', process=False); v = np.asarray(m.vertices)
    return trimesh.Trimesh(np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1), m.faces, process=False)
H = load('elise_head.glb')
bh = B.vertices[B.vertices[:, 2] > 1.53]; hh = H.vertices[H.vertices[:, 2] > -0.45]
rng = np.random.default_rng(1); bh = bh[rng.choice(len(bh), min(len(bh), 40000), replace=False)]; hs = hh[rng.choice(len(hh), 40000, replace=False)]
s = (bh[:, 0].max() - bh[:, 0].min()) / (hs[:, 0].max() - hs[:, 0].min()); t = bh.mean(0) - s * hs.mean(0); tree = cKDTree(bh)
for it in range(60):
    p = s * hs + t; d, i = tree.query(p); d2, j = cKDTree(p).query(bh)
    k1 = d < np.percentile(d, 80); k2 = d2 < np.percentile(d2, 80)
    X = np.concatenate([hs[k1], hs[j[k2]]]); Y = np.concatenate([bh[i[k1]], bh[k2]]); mx, my = X.mean(0), Y.mean(0)
    s = ((X - mx) * (Y - my)).sum() / ((X - mx) ** 2).sum(); t = my - s * mx
print('scale-only', s, t, np.median(d) * 1000)
json.dump({'s': float(s), 't': t.tolist()}, open('a2.json', 'w'))
Hm = s * H.vertices + t
for nm, V in (('body', B.vertices), ('head', Hm)):
    for z in np.arange(1.42, 1.56, 0.01):
        m = (abs(V[:, 2] - z) < 0.004) & (np.hypot(V[:, 0], V[:, 1] - 0.03) < 0.075)
        if m.sum() > 10: print(nm, 'z %.2f cx %.3f cy %.3f rx %.3f ry %.3f n %d' % (z, (V[m, 0].max() + V[m, 0].min()) / 2, (V[m, 1].max() + V[m, 1].min()) / 2, np.ptp(V[m, 0]) / 2, np.ptp(V[m, 1]) / 2, m.sum()))
for part, M, P in (('body', B, B.vertices), ('head', H, H.vertices)):
    cal = views.calibrate(part, P); zb = views.zbuffers(part, P, cal, 512 if part == 'body' else 1024)
    rgb, W, _ = views.project(part, P, M.vertex_normals, cal, zb, 0.006 * np.ptp(P[:, 2]))
    rgb[W < 1e-4] = (1, 0, 1); np.save(f'vc_{part}.npy', rgb.astype(np.float32))
    out = trimesh.Trimesh(P if part == 'body' else Hm, M.faces, vertex_colors=(np.clip(rgb, 0, 1) * 255).astype(np.uint8), process=False)
    out.export(f'a2_{part}_vc.ply'); print(part, 'unseen %.3f' % (W < 1e-4).mean())
