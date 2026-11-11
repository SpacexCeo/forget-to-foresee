"""Elise stage C: base-colour atlas from the owner's sheet views (01 body, 02 head), projected orthographically.
    python3 c_bake.py [size]   (in the work dir; reads bake_in.npz, writes elise_base.png)"""
import numpy as np, json, sys, trimesh
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
sys.path.insert(0, 's'); import views
R = int(sys.argv[1]) if len(sys.argv) > 1 else 2048
d = np.load('bake_in.npz'); P, N, UV, part = d['P'], d['N'], d['UV'], d['part']
pos = np.zeros((R, R, 3), np.float32); nor = np.zeros((R, R, 3), np.float32); pid = np.full((R, R), -1, np.int16)
uvp = np.stack([UV[..., 0] * R - 0.5, (1 - UV[..., 1]) * R - 0.5], -1)
for t in range(len(P)):
    A, B, C = uvp[t]; x0, y0 = np.floor(uvp[t].min(0)).astype(int) - 1; x1, y1 = np.ceil(uvp[t].max(0)).astype(int) + 1
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, R - 1), min(y1, R - 1)
    if x1 < x0 or y1 < y0: continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1)); den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
    if abs(den) < 1e-9: continue
    w0 = ((B[1] - C[1]) * (gx - C[0]) + (C[0] - B[0]) * (gy - C[1])) / den; w1 = ((C[1] - A[1]) * (gx - C[0]) + (A[0] - C[0]) * (gy - C[1])) / den; w2 = 1 - w0 - w1
    e = -0.6 / max(np.sqrt(abs(den)), 1.0)
    m = (w0 >= e) & (w1 >= e) & (w2 >= e)
    if not m.any(): continue
    w = np.clip(np.stack([w0[m], w1[m], w2[m]], 1), 0, 1); w /= w.sum(1, keepdims=True)
    pos[gy[m], gx[m]] = w @ P[t]; nor[gy[m], gx[m]] = w @ N[t]; pid[gy[m], gx[m]] = part[t]
ok = pid >= 0; X = pos[ok].astype(float); Nn = nor[ok].astype(float); Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9); pp = pid[ok]
col = np.zeros((len(X), 3)); seen = np.zeros(len(X), bool)
# body frame
mb = pp != 1; hb = np.load('body_hi_pts.npy').astype(float); cal = json.load(open('cal_body.json')); zb = views.zbuffers('body', hb, cal, 512)
c, w, _ = views.project('body', X[mb], Nn[mb], cal, zb, 0.0105); col[mb] = c; seen[mb] = w > 0.02
# head frame
a2 = json.load(open('parts.json'))['head']; s, t = a2['s'], np.array(a2['t'])
m = trimesh.load('elise_head.glb', force='mesh', process=False); v = np.asarray(m.vertices); hr = np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)
cal = json.load(open('cal_head.json')); zb = views.zbuffers('head', hr, cal, 1024); mh = pp == 1
c, w, _ = views.project('head', (X[mh] - t) / s, Nn[mh], cal, zb, 0.012); col[mh] = c; seen[mh] = w > 0.02
# background leaks: light neutral samples are not the character (except the eye whites)
neutral = (col.min(1) > 0.78) & (col[:, 0] - col[:, 2] < 0.035)
eyes = mh & (X[:, 2] > 1.585) & (X[:, 2] < 1.665) & (X[:, 1] < -0.05) & (abs(X[:, 0]) < 0.07)
seen &= ~(neutral & ~eyes)
skin = np.median(col[seen & mb & (col[:, 0] > 0.85) & (col[:, 0] - col[:, 2] > 0.07)], 0)
dress = np.median(col[seen & (pp == 0) & (col.max(1) < 0.2) & (X[:, 2] > 0.9) & (X[:, 2] < 1.3)], 0)
bur = np.median(col[seen & (pp == 0) & (col[:, 0] > 0.3) & (col[:, 0] > 1.7 * col[:, 1])], 0)
print('skin', skin.round(3), 'dress', dress.round(3), 'burgundy', bur.round(3))
legs = pp >= 4
sk = (pp == 0) & (X[:, 2] < 0.78) & (abs(X[:, 0]) < 0.2)
bad = sk & seen & (col.max(1) > 0.30); col[bad] = dress
# legs above the lace band are skin only where the sheet shows it; a dress-black sample on a leg is a projection slip
def fill(mask, mirror=False):
    src = mask & seen; dst = mask & ~seen
    if not dst.any() or not src.any(): return
    q = lambda Z: np.c_[abs(Z[:, 0]), Z[:, 1:]] if mirror else Z
    idx = np.nonzero(src)[0]
    if len(idx) > 600000: idx = idx[::len(idx) // 600000 + 1]
    col[dst] = col[idx[cKDTree(q(X[idx])).query(q(X[dst]))[1]]]
fill(legs, True); fill(pp == 0); fill(mh)
col[pp == 2] = skin; col[pp == 3] = bur * 0.95
img = np.zeros((R, R, 3)); img[ok] = np.clip(col, 0, 1)
ind = ndimage.distance_transform_edt(~ok, return_distances=False, return_indices=True); img = img[ind[0], ind[1]]
Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save('elise_base.png'); print('baked', R, 'texels', int(ok.sum()), 'unseen %.2f' % (1 - seen.mean()))
