"""Elise stage C: base-colour atlas from the owner's sheet views (01 body, 02 head), projected orthographically;
the gown, the laced opening, the stockings and the face patches are painted procedurally from the texel positions.
    python3 c_bake.py [size]   (in the work dir; reads bake_in.npz, writes elise_base.png)"""
import numpy as np, json, sys, trimesh
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
sys.path.insert(0, 's'); import views, ezones as Z
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
legs = (pp == 4) | (pp == 5)
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
# ---------------- procedural zones
PJ = json.load(open('parts.json')); th = Z.ang(X[:, 0], X[:, 1]); zz = X[:, 2]; rr = np.hypot(X[:, 0], X[:, 1])
LACE = np.array([0.07, 0.06, 0.08]); LASH = np.array([0.13, 0.09, 0.11]); SHEER = np.array([0.36, 0.285, 0.295])
cov = lambda d, w, aa=0.0003: np.clip((w - d) / aa + 0.5, 0, 1)          # soft-edged stroke coverage, metres
over = lambda c, k, a_: c * (1 - a_[:, None]) + np.asarray(k, float) * a_[:, None]
def seg_d(p, a_, b_):
    a_ = np.asarray(a_, float); ab = np.asarray(b_, float) - a_; t = np.clip(((p - a_) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - a_ - t[:, None] * ab, axis=1)
# the gown: flat black with cel folds (a shadow wedge, a crisp line, a thin light edge), a side and a back seam, a light trim on the hem and the slit
m = pp == 6
if m.any():
    a_ = th[m]; z_ = zz[m]; c = np.tile(dress, (int(m.sum()), 1)); SHD = dress * 0.5; LINE = np.array([0.035, 0.035, 0.045]); HI = np.array([0.42, 0.40, 0.47]); dd = lambda t0: (a_ - t0 + 180) % 360 - 180
    for t0, z0, w, sg in ((-150, 0.50, 7, 1), (-115, 0.42, 5, -1), (-70, 0.55, 8, 1), (-35, 0.38, 6, -1), (-8, 0.60, 5, 1), (105, 0.50, 6, 1), (140, 0.40, 7, -1), (172, 0.55, 5, 1)):
        g = np.clip((z0 - z_) / z0, 0, 1); d = dd(t0 + 3 * np.sin(z_ * 9 + t0)) * sg; wd = np.maximum(w * g, 1e-6)
        c = over(c, SHD, (d > 0) * np.clip((wd - d) / 1.2, 0, 1) * (g > 0)); c = over(c, HI, np.clip(1 - abs(d + 0.9) / 0.5, 0, 1) * np.clip(g * 3, 0, 1) * 0.6); c = over(c, LINE, np.clip(1.5 - abs(d) / 0.3, 0, 1) * np.clip(g * 6, 0, 1))
    c = over(c, LINE, np.clip(1.5 - abs(dd(-90)) / 0.3, 0, 1)); c = over(c, LINE, np.clip(1.5 - abs(dd(180)) / 0.3, 0, 1) * (z_ > 0.3))
    t1, t2 = Z.slit(z_); e = np.minimum(abs(a_ - t1), abs(a_ - t2)); c = over(c, HI, np.clip(1.5 - e / 1.1, 0, 1) * (z_ < 0.80))
    c = over(c, HI, np.clip(1.5 - (z_ - (0.03 + 0.015 * np.cos(np.radians(a_)))) / 0.004, 0, 1)); col[m] = c
m = (pp == 0) & (zz < 0.94) & (rr < 0.215)             # the hips of the shell: the gown's flat black, so the join to the loft does not show
f = np.clip((0.94 - zz[m]) / 0.06, 0, 1)[:, None]; col[m] = col[m] * (1 - f) + dress * f
# edging on the upper dress: a light line on the cloth side wherever it meets a real area of skin (neckline, armholes, open back)
TRIM = np.array([0.42, 0.40, 0.47]); tor_ = (pp == 0) & (zz > 0.93) & (abs(X[:, 0]) < 0.17)
sk_ = np.nonzero(tor_ & (col[:, 0] > 0.6) & (col[:, 0] - col[:, 2] > 0.05))[0]; dk_ = np.nonzero(tor_ & (col.max(1) < 0.33))[0]
if len(sk_) > 100 and len(dk_):
    d20 = cKDTree(X[sk_[::2]]).query(X[dk_], k=20, distance_upper_bound=0.012)[0][:, -1]; hit = d20 < 0.0105
    col[dk_[hit]] = over(col[dk_[hit]], TRIM, np.clip((0.0105 - d20[hit]) / 0.0015, 0, 1)); print('edging texels', int(hit.sum()))
# the laced opening on the left hip: skin between the two edges, cross-lacing, a bow at the bottom
m = (pp == 0) & (zz > 0.79) & (zz < 1.045) & (th > 12) & (th < 104) & (rr < 0.215)
if m.any():
    z_ = zz[m]; a_ = th[m]; R0 = 0.125; t1, t2 = Z.slit(z_); s_ = np.radians(a_) * R0; din = np.minimum(s_ - np.radians(t1) * R0, np.radians(t2) * R0 - s_)
    op = (din > 0) & (z_ > 0.816) & (z_ < 0.957); c = np.where(op[:, None], skin, dress)
    c = over(c, skin * 0.8, op * np.clip(1 - din / 0.003, 0, 1) * 0.9)
    p = np.stack([s_, z_], 1); zl = np.linspace(0.948, 0.832, 6); e1 = lambda q: np.radians(Z.slit(q)[0]) * R0 - 0.003; e2 = lambda q: np.radians(Z.slit(q)[1]) * R0 + 0.003
    d = seg_d(p, [e1(zl[0]), zl[0]], [e2(zl[0]), zl[0]])
    for i in range(5):
        d = np.minimum(d, seg_d(p, [e1(zl[i]), zl[i]], [e2(zl[i + 1]), zl[i + 1]])); d = np.minimum(d, seg_d(p, [e2(zl[i]), zl[i]], [e1(zl[i + 1]), zl[i + 1]]))
    c = over(c, [0.42, 0.40, 0.47], cov(abs(din + 0.0020), 0.0015) * (z_ > 0.816) * (z_ < 0.957))            # edging of the opening
    c = over(c, LACE, cov(d, 0.0012)); sc = np.radians(54.3) * R0
    for sg in (-1, 1): c = over(c, LACE, cov(abs(np.hypot((s_ - sc - sg * 0.0075) / 0.0065, (z_ - 0.8265) / 0.0036) - 1) * 0.0036, 0.0009))
    c = over(c, LACE, cov(np.hypot(s_ - sc, z_ - 0.8255), 0.0024))
    f = np.clip(np.minimum.reduce([(1.045 - z_) / 0.02, (a_ - 12) / 8, (104 - a_) / 8]), 0, 1); f = np.maximum(f, din > -0.004)
    col[m] = col[m] * (1 - f[:, None]) + c * f[:, None]
# legs: skin above the stocking, a lace top (scalloped edge, flowers on a net), sheer stocking below
for sd, pid, sg in (('L', 4, 1), ('R', 5, -1)):
    m = (pp == pid) & (zz > 0.09)
    if not m.any(): continue
    z_ = zz[m]; ax, ay, ar = Z.leg_axis(PJ, sd, z_); ph = np.arctan2(sg * (X[m, 0] - ax), -(X[m, 1] - ay)); n = 18; ZB, ZC = 0.630, 0.659
    top = 0.684 + 0.006 * np.sqrt(np.abs(np.sin(n * ph / 2))); cu = ((ph * n / (2 * np.pi)) % 1.0 - 0.5) * (2 * np.pi * 0.064 / n); cv = z_ - ZC; rc = np.hypot(cu, cv); an = np.arctan2(cv, cu)
    pk = np.round(an / (np.pi / 3)) * (np.pi / 3); hole = np.maximum(cov(rc, 0.0017), cov(np.hypot((rc * np.cos(an - pk) - 0.0052) / 0.0026, rc * np.sin(an - pk) / 0.0015) * 0.0015, 0.0015)) * (rc < 0.0078)
    gy = z_ / (0.0028 * 0.866); row = np.round(gy); gx = ph * 0.064 / 0.0028 - 0.5 * (row % 2); dn = np.hypot((gx - np.round(gx)) * 0.0028, (gy - row) * 0.0028 * 0.866)
    hole = np.maximum(hole, cov(dn, 0.00095) * (rc > 0.0092)) * ~((z_ < ZB + 0.0025) | (z_ > top - 0.0022))
    lace = over(np.tile(LACE * 1.15, (len(z_), 1)), skin * 0.62 + LACE * 0.38, hole)
    c = np.where((z_ > top)[:, None], skin, np.where((z_ > ZB)[:, None], lace, SHEER))
    if sd == 'L':                                         # the two lace ends hanging from the bow onto the thigh
        for p0, ze in ((29.0, 0.722), (41.0, 0.706)):
            d = abs(ph - np.radians(p0 + 2.0 * np.sin(z_ * 60))) * ar
            c = over(c, LACE, np.maximum(cov(d, 0.0011) * (z_ > ze), cov(d, 0.0018) * (z_ > ze) * (z_ < ze + 0.006)) * (z_ > top))
    f = np.clip((z_ - 0.09) / 0.02, 0, 1); col[m] = col[m] * (1 - f[:, None]) + c * f[:, None]
# face patches: the skin under each patch with the painted eye or mouth filled over, then the new lids and mouths
hm = pp == 1; fit = {}
def eye_box(sd):
    cx0, cz0 = Z.EYE[sd]; q = hm & (X[:, 1] < -0.05) & (abs(X[:, 0] - cx0) < 0.027) & (abs(X[:, 2] - cz0) < 0.015)
    w = q & (col[:, 0] > 0.3) & (col[:, 0] > 1.6 * col[:, 1]) & (col[:, 2] < 0.5)          # the iris
    if w.sum() < 30: print('eye', sd, 'not found, defaults'); return cx0, cz0, 0.023, 0.0135
    return float(np.median(X[w, 0])), float(np.median(X[w, 2])) + 0.001, 0.023, 0.0135
fb = hm & (X[:, 1] < 0) & (zz > 1.48) & (zz < 1.65) & (abs(X[:, 0]) < 0.09); TF = cKDTree(X[fb]); CF = col[fb].copy()
def under(Q):
    d, i = TF.query(Q, k=4); w = 1 / (d + 1e-5) ** 2; return (CF[i] * w[..., None]).sum(1) / w.sum(1)[:, None]
MC = np.array([0.50, 0.26, 0.27]); MIN = np.array([0.40, 0.12, 0.14]); TEETH = np.array([0.97, 0.95, 0.93]); MLINE = np.array([0.25, 0.10, 0.12])
for k, name in enumerate(Z.PATCHES):
    m = pp == Z.PART0 + k
    if not m.any(): continue
    h = Z.patch_geo(name)[7]; Q = X[m] + [0, h, 0]; base = under(Q)
    if name.startswith('m_'): cx, cz = Z.MOUTH; a_, b_ = Z.MOUTH_AB; sg = 1
    else:
        sd = name[-1]; sg = 1 if sd == 'L' else -1
        if sd not in fit: fit[sd] = eye_box(sd); print('eye', sd, np.round(fit[sd], 4))
        cx, cz, a_, b_ = fit[sd]
    xm = sg * (Q[:, 0] - cx); zm = Q[:, 2] - cz; u = xm / a_; v = zm / b_; r = np.maximum(np.hypot(u, v), 1e-6)
    Qr = Q.copy(); Qr[:, 0] = cx + sg * u / r * 1.12 * a_; Qr[:, 2] = cz + v / r * 1.12 * b_; ring = under(Qr)
    lum = ring.mean(1); S = np.median(ring[lum > 0.6], 0) if (lum > 0.6).sum() > 20 else skin
    fill = S + (ring - S) * np.clip(r, 0, 1)[:, None] ** 3; c = base.copy()
    kind = name.split('_')[0] if not name.startswith('m_') else name
    if kind == 'blink':
        c = np.where((r < 1)[:, None], fill, c); z0 = b_ * (-0.5 + 0.55 * u * u)
        c = over(c, LASH, cov(abs(zm - z0), 0.0015 - 0.0006 * np.clip(-u, 0, 1)) * (abs(u) < 0.8))
        for uo in (0.45, 0.62, 0.78):
            xo = uo * a_; zo = b_ * (-0.5 + 0.55 * uo * uo); c = over(c, LASH, cov(seg_d(np.stack([xm, zm], 1), [xo, zo], [xo + 0.003, zo - 0.003]), 0.0005))
    elif kind in ('sad', 'angry'):
        zl = b_ * (0.30 - 0.32 * u) if kind == 'sad' else b_ * (0.12 + 0.45 * u)
        c = np.where(((zm > zl) & (r < 1.0))[:, None], fill, c); c = over(c, LASH, cov(abs(zm - zl), 0.0014) * (abs(u) < 0.9) * (r < 1.08))
        zb = b_ * (1.75 - 0.35 * u) if kind == 'sad' else b_ * (1.2 + 0.55 * u); span = (u > -0.9) & (u < 0.9) if kind == 'sad' else (u > -1.05) & (u < 0.75)
        c = over(c, [0.16, 0.14, 0.18], cov(abs(zm - zb), 0.0009 if kind == 'sad' else 0.0013) * span)
    else:
        c = np.where((r < 1)[:, None], fill, c); p2 = np.stack([xm, zm], 1)
        if kind == 'm_smile':
            Xn = xm / (0.62 * a_); c = over(c, MC, cov(abs(zm - b_ * (-0.28 + 0.5 * Xn * Xn)), 0.0007) * (abs(Xn) < 1))
        elif kind == 'm_M':
            c = over(c, MC, cov(abs(zm + 0.05 * b_), 0.0007) * (abs(u) < 0.5)); c = over(c, S * 0.86, cov(abs(zm + 0.45 * b_), 0.0005) * (abs(u) < 0.2))
        elif kind == 'm_sad':
            Xn = xm / (0.5 * a_); c = over(c, MC, cov(abs(zm - b_ * (0.02 - 0.42 * Xn * Xn)), 0.0007) * (abs(Xn) < 1))
        elif kind in ('m_A', 'm_O'):
            ea, eb, ec = (0.42 * a_, 0.60 * b_, -0.12 * b_) if kind == 'm_A' else (0.20 * a_, 0.42 * b_, -0.10 * b_)
            q = np.hypot(xm / ea, (zm - ec) / eb); c = over(c, MIN, cov(q - 1, 0, 0.04))
            if kind == 'm_A':
                c = over(c, TEETH, cov(q - 1, -0.08, 0.04) * (zm > ec + 0.42 * eb)); c = over(c, [0.82, 0.45, 0.45], cov(np.hypot(xm / (0.26 * a_), (zm + 0.52 * b_) / (0.30 * b_)) - 1, 0, 0.06) * (q < 0.95))
            c = over(c, MLINE, cov(abs(q - 1) * min(ea, eb), 0.0006))
        elif kind == 'm_angry':
            bx = np.maximum(abs(xm) - 0.50 * a_, abs(zm + 0.15 * b_) - 0.36 * b_); c = over(c, TEETH, cov(bx, 0)); c = over(c, [0.6, 0.58, 0.6], cov(abs(zm + 0.15 * b_), 0.0004) * (bx < 0))
            c = over(c, MLINE, cov(abs(bx), 0.0007))
    col[m] = c
json.dump({'eye': fit}, open('face_fit.json', 'w'))
img = np.zeros((R, R, 3)); img[ok] = np.clip(col, 0, 1)
ind = ndimage.distance_transform_edt(~ok, return_distances=False, return_indices=True); img = img[ind[0], ind[1]]
Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save('elise_base.png'); print('baked', R, 'texels', int(ok.sum()), 'unseen %.2f' % (1 - seen.mean()))
