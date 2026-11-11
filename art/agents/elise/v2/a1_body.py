"""Elise v2, stage A1: ONE continuous body from head to toes.
The CC0 MakeHuman base mesh (13 380 vertices, 13 378 quads, closed manifold, with its painted weights) is posed and
proportioned on Elise's skeleton, then fitted to the good shapes of the generated model: the face (a depth map of the
face skin behind the fringe; the eyelid and lip loops are laid on the painted eyes and mouth), the torso, arms, hips
and seat (the body shell, 2.5 mm under the cloth) and the legs. Hands and feet keep the base mesh's own shape.
    blender -b -P a1_body.py -- <work dir>      reads mh/, src.npz, tgt.npz; writes body.npz and r/a1_*.jpg"""
import bpy, bmesh, sys, json, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import rend
WD = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
unit = lambda v: np.asarray(v, float) / np.linalg.norm(v)
sstep = lambda t: (lambda u: u * u * (3 - 2 * u))(np.clip(t, 0, 1))
NB = 13380
# ---------------- the base mesh
V, VT, F, FT, g = [], [], [], [], None
for l in open(WD + '/mh/base.obj'):
    p = l.split()
    if not p: continue
    if p[0] == 'v': V.append([float(x) for x in p[1:4]])
    elif p[0] == 'vt': VT.append([float(x) for x in p[1:3]])
    elif p[0] == 'g': g = p[1]
    elif p[0] == 'f' and g == 'body': F.append([int(x.split('/')[0]) - 1 for x in p[1:]]); FT.append([int(x.split('/')[1]) - 1 for x in p[1:]])
V = np.array(V); A = np.stack([V[:, 0], -V[:, 2], V[:, 1]], 1) * 0.1; A[:, 2] -= A[:NB, 2].min()      # metres, Z up, front -Y, her left +X
F = np.array(F); FT = np.array(FT); VT = np.array(VT); X0 = A[:NB].copy()
sk = json.load(open(WD + '/mh/default.mhskel')); mw = json.load(open(WD + '/mh/default_weights.mhw'))['weights']
J = {k: A[v].mean(0) for k, v in sk['joints'].items()}
jh = lambda b: J[sk['bones'][b]['head']]; jt = lambda b: J[sk['bones'][b]['tail']]
def emap(b):
    s = b[-1] if b.endswith(('.L', '.R')) else ''; n = b[:-2] if s else b
    if n in ('clavicle', 'shoulder01'): return 'shoulder_' + s
    if n.startswith('upperarm'): return 'upperarm_' + s
    if n.startswith('lowerarm'): return 'forearm_' + s
    if n == 'wrist' or n.startswith('metacarpal'): return 'hand_' + s
    if n.startswith('finger1'): return 'thumb_' + s
    if n.startswith('finger2'): return 'index_' + s
    if n.startswith('finger'): return 'fingers_' + s
    if n.startswith('upperleg'): return 'thigh_' + s
    if n.startswith('lowerleg'): return 'shin_' + s
    if n == 'foot': return 'foot_' + s
    if n.startswith('toe'): return 'toe_' + s
    if n in ('root', 'pelvis', 'spine05'): return 'pelvis'
    if n in ('spine04', 'spine03'): return 'spine'
    if n in ('spine02', 'spine01', 'breast'): return 'chest'
    if n in ('neck01', 'neck02'): return 'neck'
    return 'head'
W = {}
for b, lst in mw.items():
    a = np.array([(i, w) for i, w in lst if i < NB]); k = emap(b)
    if len(a): W.setdefault(k, np.zeros(NB)); np.add.at(W[k], a[:, 0].astype(int), a[:, 1])
tot = sum(W.values()); W = {k: w / np.maximum(tot, 1e-9) for k, w in W.items()}
print('weights: groups', len(W), 'unweighted verts', int((tot < 1e-6).sum()))
e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 3]], F[:, [3, 0]]]); e = np.unique(np.sort(e, 1), axis=0); E0, E1 = e[:, 0], e[:, 1]
deg = np.bincount(np.r_[E0, E1], minlength=NB).astype(float)
def nsum(a):
    out = np.zeros_like(a); np.add.at(out, E0, a[E1]); np.add.at(out, E1, a[E0]); return out
def diffuse(d, valid, K):
    """Normalised convolution over the mesh: valid displacements spread, the rest follow."""
    num = d * valid[:, None]; den = valid.astype(float)
    for _ in range(K):
        num = (num + nsum(num)) / (deg + 1)[:, None]; den = (den + nsum(den)) / (deg + 1)
    return num / np.maximum(den, 1e-12)[:, None]
def normals(X):
    n = np.zeros_like(X); fn = np.cross(X[F[:, 2]] - X[F[:, 0]], X[F[:, 3]] - X[F[:, 1]])
    for k in range(4): np.add.at(n, F[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]
adj = [[] for _ in range(NB)]
for a_, b_ in e: adj[a_].append(b_); adj[b_].append(a_)
# ---------------- eye sockets and the mouth bag of the base mesh (found before posing)
bvh0 = BVHTree.FromPolygons([tuple(p) for p in A], [tuple(map(int, f)) for f in F] + [tuple(range(i, i + 0)) for i in []])
def pocket(c, rad, extra=None):
    """Vertices near c that cannot be seen from the front, as one connected set, and the loop around it."""
    tree = bvh0 if extra is None else extra
    near = np.nonzero(np.linalg.norm(X0 - c, axis=1) < rad)[0]; hid = set()
    for i in near:
        if tree.ray_cast(Vector(X0[i]) + Vector((0, -2e-4, 0)), Vector((0, -1, 0)), 0.2)[0] is not None: hid.add(int(i))
    seed = max(hid, key=lambda i: X0[i, 1] - 3 * np.hypot(X0[i, 0] - c[0], X0[i, 2] - c[2])); comp = set(); st = [seed]
    while st:
        i = st.pop()
        if i in comp: continue
        comp.add(i); st += [j for j in adj[i] if j in hid]
    rim = sorted({j for i in comp for j in adj[i]} - comp); return np.array(sorted(comp)), np.array(rim)
EYEV = {'L': range(14598, 14670), 'R': range(14670, 14742)}; PK = {}
hq = []
for l in open(WD + '/mh/base.obj'):
    p = l.split()
    if p and p[0] == 'g': g = p[1]
    elif p and p[0] == 'f' and g in ('helper-l-eye', 'helper-r-eye'): hq.append(tuple(int(x.split('/')[0]) - 1 for x in p[1:]))
bvh_eye = BVHTree.FromPolygons([tuple(p) for p in A], [tuple(map(int, f)) for f in F] + hq)
for sd in 'LR':
    c = A[list(EYEV[sd])].mean(0); r = np.linalg.norm(A[list(EYEV[sd])] - c, axis=1).mean()
    if (c[0] > 0) != (sd == 'L'): print('EYE SIDE SWAPPED')
    PK['eye' + sd] = pocket(c, 1.9 * r, bvh_eye); print('eye', sd, 'centre', c.round(3), 'r %.4f' % r, 'pocket', len(PK['eye' + sd][0]), 'rim', len(PK['eye' + sd][1]))
mc = (jh('oris05') + jh('oris01')) / 2
def mouth_bag():
    """The inner mouth: vertices no outside direction can see, connected to the point behind the lips."""
    near = np.nonzero(np.linalg.norm(X0 - (mc + [0, 0.02, 0]), axis=1) < 0.05)[0]; hid = set()
    dirs = [Vector((math.sin(a_) * math.cos(b_), -math.cos(a_) * math.cos(b_), math.sin(b_))) for a_, b_ in ((0, 0), (0.6, 0), (-0.6, 0), (0, 0.6), (0, -0.6), (0.4, 0.4), (-0.4, 0.4), (0.4, -0.4), (-0.4, -0.4), (0, 1.1), (0, -1.1), (1.1, 0), (-1.1, 0))]
    for i in near:
        if all(bvh0.ray_cast(Vector(X0[i]) + d_ * 2e-4, d_, 0.3)[0] is not None for d_ in dirs): hid.add(int(i))
    seed = min(hid, key=lambda i: np.linalg.norm(X0[i] - (mc + [0, 0.03, 0]))); comp = set(); st = [seed]
    while st:
        i = st.pop()
        if i in comp: continue
        comp.add(i); st += [j for j in adj[i] if j in hid]
    rim = sorted({j for i in comp for j in adj[i]} - comp); return np.array(sorted(comp)), np.array(rim)
PK['mouth'] = mouth_bag(); r_ = X0[PK['mouth'][1]]; print('mouth', mc.round(3), 'bag', len(PK['mouth'][0]), 'rim', len(r_), 'rim x %.3f..%.3f z %.3f..%.3f y %.3f..%.3f' % (r_[:, 0].min(), r_[:, 0].max(), r_[:, 2].min(), r_[:, 2].max(), r_[:, 1].min(), r_[:, 1].max()))
I_NOSE = np.nonzero((abs(X0[:, 0]) < 0.008) & (X0[:, 2] > mc[2] + 0.015) & (X0[:, 2] < 1.545))[0]; I_NOSE = int(I_NOSE[np.argmin(X0[I_NOSE, 1])]); print('nose tip of the base mesh', X0[I_NOSE].round(3))
# ---------------- pose and proportions on Elise's skeleton
S = np.load(WD + '/src.npz'); BN = [str(x) for x in S['bone_names']]; BH = dict(zip(BN, S['bone_head'])); BT = dict(zip(BN, S['bone_tail']))
def rot_between(a, b):
    a, b = unit(a), unit(b); v = np.cross(a, b); c = a @ b; K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + c)
def seg(hm, tm, he, te, kr, Rpre=None, uniform=None):
    """Map the segment hm..tm onto he..te: rotate, scale along by the length ratio and across by kr."""
    dm = unit(tm - hm); R = rot_between(dm, te - he); sl = np.linalg.norm(te - he) / np.linalg.norm(tm - hm)
    if uniform: sl = kr = uniform
    def T(p):
        q = p - hm; a = q @ dm; return he + (np.outer(a * sl, dm) + (q - np.outer(a, dm)) * kr) @ R.T
    return T, R
ZM = [0.0, 0.80, 0.865, 0.90, 1.05, 1.20, 1.341, 1.406, 1.514, 1.70]; ZE = [0.0, 0.855, 0.93, 0.96, 1.125, 1.30, 1.40, 1.465, 1.555, 1.741]
KZ = [0.80, 0.865, 1.05, 1.341, 1.406, 1.514]; KX = [0.80, 0.77, 0.72, 0.64, 0.75, 0.90]
def torso(p):
    k = np.interp(p[:, 2], KZ, KX); return np.stack([p[:, 0] * k, (p[:, 1] + 0.012) * k * 1.08 + 0.006, np.interp(p[:, 2], ZM, ZE)], 1)
HS = np.array([1.10, 0.86, 1.06]); HC_M = jh('head'); HC_E = np.array([0.0, 0.012, 1.555])
head_T = lambda p: HC_E + (p - HC_M) * HS
TF = {k: torso for k in ('pelvis', 'spine', 'chest', 'neck')}; TF['head'] = head_T; NEWB = {}
for sd in 'LR':
    s = '.' + sd; Sm, Em, Wm = jh('upperarm01' + s), jh('lowerarm01' + s), jh('wrist' + s); Km = jh('finger3-1' + s)
    Se, Ee, We = BH['upperarm_' + sd], BH['forearm_' + sd], BH['hand_' + sd]
    TF['shoulder_' + sd], _ = seg(jh('clavicle' + s), Sm, BH['shoulder_' + sd], Se, 0.74)
    TF['upperarm_' + sd], _ = seg(Sm, Em, Se, Ee, 0.90); TF['forearm_' + sd], Rf = seg(Em, Wm, Ee, We, 0.90)
    hd = unit(BT['hand_' + sd] - BH['hand_' + sd]); Rh = rot_between(Rf @ unit(Km - Wm), hd) @ Rf; KH = 0.90
    TF['hand_' + sd] = (lambda Wm, We, Rh: lambda p: We + KH * (p - Wm) @ Rh.T)(Wm, We, Rh)
    for k in ('thumb_', 'index_', 'fingers_'): TF[k + sd] = TF['hand_' + sd]
    hT = TF['hand_' + sd]; P1 = lambda b: hT(jh(b + s)[None])[0]; P2 = lambda b: hT(jt(b + s)[None])[0]
    NEWB['hand_' + sd] = (We, P1('finger3-1')); NEWB['thumb_' + sd] = (P1('finger1-2'), P2('finger1-3')); NEWB['index_' + sd] = (P1('finger2-1'), P2('finger2-2'))
    NEWB['fingers_' + sd] = (P1('finger4-1'), P2('finger4-2')); NEWB['prop_' + sd] = ((P1('finger3-1') + We) / 2 + Rh @ [0, 0, -0.02], P1('finger3-1') + Rh @ [0, 0, -0.02])
    Hm, Nm, Am = jh('upperleg01' + s), jh('lowerleg01' + s), jh('foot' + s); He, Ne, Ae = BH['thigh_' + sd], BH['shin_' + sd], BH['foot_' + sd]
    TF['thigh_' + sd], _ = seg(Hm, Nm, He, Ne, 0.97); TF['shin_' + sd], _ = seg(Nm, Am, Ne, Ae, 0.95)
    # the foot stands in a heel: the ankle keeps its place, the ball of the foot comes down to the floor
    KF = 0.88; Bm = np.mean([jh('toe%d-1' % i + s) for i in range(1, 6)], 0); Tm = Bm + [0, -0.056, 0]; Lf = np.linalg.norm(Bm - Am) * KF
    dz = Ae[2] - 0.0205; Be = Ae + [0, -math.sqrt(Lf * Lf - dz * dz), -dz]; Te = Be + [0, -0.05, -0.0085]
    TF['foot_' + sd], _ = seg(Am, Bm, Ae, Be, 0, uniform=KF); TF['toe_' + sd], _ = seg(Bm, Tm, Be, Te, 0, uniform=KF)
    NEWB['foot_' + sd] = (Ae, Be); NEWB['toe_' + sd] = (Be, Te)
X = sum(W[k][:, None] * TF[k](X0) for k in W)
print('posed: height %.3f' % X[:, 2].max(), 'foot L z min %.4f' % X[W['foot_L'] + W['toe_L'] > 0.5, 2].min(), 'ball/toe', {k: np.round(v, 3).tolist() for k, v in NEWB.items() if k.startswith(('foot_L', 'toe_L'))})
for k in ('foot_', 'toe_'):          # the sole of the shoe: both feet end exactly on the floor
    pass
# ---------------- targets
T = np.load(WD + '/tgt.npz'); hv, hf, hc = T['hv'], T['hf'], T['hc']; bv, bf, bc = T['bv'], T['bf'], T['bc']
bvh_h = BVHTree.FromPolygons([tuple(p) for p in hv], [tuple(map(int, f)) for f in hf])
bvh_b = BVHTree.FromPolygons([tuple(p) for p in bv], [tuple(map(int, f)) for f in bf]); btc = bc[bf].mean(1)
bvh_l = {sd: BVHTree.FromPolygons([tuple(p) for p in T['lv']], [tuple(map(int, f)) for f in T['lf' + sd]]) for sd in 'LR'}
def skin(c): return (c[..., 0] > 0.62) & (c[..., 1] > 0.45) & (c[..., 2] > 0.38) & (c[..., 0] - c[..., 2] < 0.42) & (c[..., 1] > 0.55 * c[..., 0])
ribbon = lambda c: (c[..., 0] > 0.3) & (c[..., 0] > 1.7 * c[..., 1]) & (c[..., 0] > 1.7 * c[..., 2])
# the face: depth of the deepest front-facing surface (the skin behind the fringe), 1 mm grid
GX0, GZ0, GS = -0.095, 1.46, 0.001; NX, NZ = 191, 251
HY = np.full((NZ, NX), np.nan); HCc = np.zeros((NZ, NX, 3))
for j in range(NZ):
    for i in range(NX):
        o = Vector((GX0 + i * GS, -0.3, GZ0 + j * GS)); d = Vector((0, 1, 0)); best = None
        for _ in range(40):
            loc, nor, fi, dist = bvh_h.ray_cast(o, d)
            if loc is None or loc.y > 0.03: break
            if nor.y < -0.3: best = (loc.y, fi)
            o = loc + d * 1e-4
        if best: HY[j, i] = best[0]; HCc[j, i] = hc[best[1]]
EF = json.load(open(WD + '/face_fit.json'))['eye']; MOUTH = (0.001, 1.522)
gx = GX0 + np.arange(NX) * GS; gz = GZ0 + np.arange(NZ) * GS; GXX, GZZ = np.meshgrid(gx, gz)
box = np.zeros((NZ, NX), bool)
for sd in 'LR':
    cx, cz, a_, b_ = EF[sd]; box |= ((GXX - cx) / (a_ * 1.5)) ** 2 + ((GZZ - cz) / (b_ * 1.9)) ** 2 < 1
box |= (abs(GXX - MOUTH[0]) < 0.022) & (abs(GZZ - MOUTH[1]) < 0.012)
sk_ = skin(HCc) & ~np.isnan(HY); ok = sk_ | (box & ~np.isnan(HY))
from PIL import Image
# non-skin pixels on the skin's own depth (brows, the nose line) belong to the face too
def boxmean(a, m, r):
    a = np.where(m, a, 0); c = np.cumsum(np.cumsum(np.pad(a, r + 1), 0), 1); n = np.cumsum(np.cumsum(np.pad(m.astype(float), r + 1), 0), 1)
    s = lambda q: q[2 * r + 1:-1, 2 * r + 1:-1] - q[:-2 * r - 2, 2 * r + 1:-1] - q[2 * r + 1:-1, :-2 * r - 2] + q[:-2 * r - 2, :-2 * r - 2]
    return s(c) / np.maximum(s(n), 1e-9), s(n)
mu, cnt = boxmean(np.nan_to_num(HY), sk_, 4); ok |= ~np.isnan(HY) & (cnt > 20) & (abs(HY - mu) < 0.002) & (GZZ < 1.64)
jump = np.zeros((NZ, NX), bool); Hn = np.where(ok, HY, np.nan)
jump[1:, :] |= abs(Hn[1:, :] - Hn[:-1, :]) > 0.0035; jump[:, 1:] |= abs(Hn[:, 1:] - Hn[:, :-1]) > 0.0035
for _ in range(2): jump[1:, :] |= jump[:-1, :]; jump[:-1, :] |= jump[1:, :]; jump[:, 1:] |= jump[:, :-1]; jump[:, :-1] |= jump[:, 1:]
ok &= ~jump
# keep the face only: the valid area connected to the cheeks (no neck under the chin, no ears behind the strands)
lab = np.zeros((NZ, NX), bool); st = [(int((1.555 - GZ0) / GS), int((0.03 - GX0) / GS)), (int((1.555 - GZ0) / GS), int((-0.03 - GX0) / GS))]
while st:
    j, i = st.pop()
    if j < 0 or i < 0 or j >= NZ or i >= NX or lab[j, i] or not ok[j, i]: continue
    lab[j, i] = True; st += [(j + 1, i), (j - 1, i), (j, i + 1), (j, i - 1)]
print('depth map: valid', int(ok.sum()), 'face component', int(lab.sum())); ok = lab
HYs = np.where(ok, HY, 0)
for _ in range(2):          # a light blur of the depth inside the valid area (the generated surface is noisy)
    mu, cnt = boxmean(HYs, ok, 1); HYs = np.where(ok, mu, 0)
Image.fromarray((np.clip(HCc, 0, 1) * 255 * ok[:, :, None]).astype(np.uint8)[::-1]).resize((NX * 3, NZ * 3)).save(WD + '/r/a1_facemap.png')
HF = HYs.copy(); known = ok.copy()          # the same depth continued over the unknown pixels (for the eye sockets)
for _ in range(400):
    P_ = np.pad(np.where(known, HF, 0), 1); C_ = np.pad(known.astype(float), 1); s_ = P_[2:, 1:-1] + P_[:-2, 1:-1] + P_[1:-1, 2:] + P_[1:-1, :-2]; c_ = C_[2:, 1:-1] + C_[:-2, 1:-1] + C_[1:-1, 2:] + C_[1:-1, :-2]
    new = ~ok & (c_ > 0); HF[new] = (s_ / np.maximum(c_, 1))[new]; known |= new
def Hfill(x, z):
    i = np.clip(np.round((np.asarray(x) - GX0) / GS).astype(int), 0, NX - 1); j = np.clip(np.round((np.asarray(z) - GZ0) / GS).astype(int), 0, NZ - 1); return HF[j, i]
def Hy(x, z):
    """Depth of the face skin at x, z and whether it is known there."""
    fx = (np.asarray(x) - GX0) / GS; fz = (np.asarray(z) - GZ0) / GS; i = np.clip(np.floor(fx).astype(int), 0, NX - 2); j = np.clip(np.floor(fz).astype(int), 0, NZ - 2); a = np.clip(fx - i, 0, 1); b = np.clip(fz - j, 0, 1)
    v = ok[j, i] & ok[j, i + 1] & ok[j + 1, i] & ok[j + 1, i + 1] & (fx > 0) & (fx < NX - 1) & (fz > 0) & (fz < NZ - 1)
    return (HYs[j, i] * (1 - a) + HYs[j, i + 1] * a) * (1 - b) + (HYs[j + 1, i] * (1 - a) + HYs[j + 1, i + 1] * a) * b, v
for z_ in (1.50, 1.52, 1.55, 1.585, 1.61, 1.64):
    j = int(round((z_ - GZ0) / GS)); m = ok[j]; print('face z %.3f: x %.3f..%.3f, front y %.3f' % (z_, gx[m].min(), gx[m].max(), np.nanmin(np.where(m, HY[j], np.nan))) if m.any() else ('face z %.3f none' % z_))
col = np.nanmin(np.where(ok & (abs(GXX) < 0.004), HY, np.nan), 1); jn = np.nanargmin(np.where((gz > 1.535) & (gz < 1.575), col, np.nan)); NOSE = np.array([0.0, col[jn], gz[jn]])
zc = gz[~np.isnan(col)]; CHIN_Z = zc.min(); print('nose tip', NOSE.round(4), 'chin (lowest face skin on the centre line)', CHIN_Z.round(4))
isH = W['head'] > 0.5; pk_all = np.concatenate([PK[k][0] for k in PK]); inpk = np.zeros(NB, bool); inpk[pk_all] = True
# ---------------- head: coarse depth fit, landmarks, sockets, fine depth fit
def face_step(X, K, gain=1.0, only=None):
    n = normals(X); y, v = Hy(X[:, 0], X[:, 2]); val = isH & v & (((n[:, 1] < -0.25) & ~inpk) | (only if only is not None else False))
    d = np.zeros_like(X); d[val, 1] = y[val] - X[val, 1]; D = diffuse(d, val | ~((W['head'] + W['neck']) > 0.02), K); X += gain * D * ((W['head'] + W['neck']) > 0.02)[:, None]; return val
for it in range(6): val = face_step(X, 60)
print('coarse face fit: verts on the depth map', int(val.sum()))
con = {}                                   # vertex -> target x, z
for sd in 'LR':
    pk, rim = PK['eye' + sd]; cx, cz, a_, b_ = EF[sd]; r = X[rim]; c0 = (r.max(0) + r.min(0)) / 2; h0 = (r.max(0) - r.min(0)) / 2
    ph = np.arctan2((r[:, 2] - c0[2]) / h0[2], (r[:, 0] - c0[0]) / h0[0])
    for i, p_ in zip(rim, ph): con[int(i)] = (cx + a_ * 1.04 * math.cos(p_), cz + b_ * 1.10 * math.sin(p_))
pk, rim = PK['mouth']; r = X[rim]; c0 = (r.max(0) + r.min(0)) / 2; h0x = (r[:, 0].max() - r[:, 0].min()) / 2; MW = 0.0125; i_nose = I_NOSE; con[i_nose] = (NOSE[0], NOSE[2])
for i in rim: con[int(i)] = (MOUTH[0] + MW * (X[i, 0] - c0[0]) / h0x, MOUTH[1] + 0.0008 * math.cos(1.5 * (X[i, 0] - c0[0]) / h0x))
print('landmarks:', len(con), 'nose', X[i_nose].round(3), '->', NOSE.round(3), 'mouth rim half width %.4f -> %.4f' % (h0x, MW))
ci = np.array(sorted(con)); d = np.zeros_like(X); d[ci, 0] = [con[i][0] - X[i, 0] for i in ci]; d[ci, 2] = [con[i][1] - X[i, 2] for i in ci]
cen = np.array([[EF['L'][0], EF['L'][1]], [EF['R'][0], EF['R'][1]], [MOUTH[0], MOUTH[1]], [0, NOSE[2]]])
far = np.min(np.linalg.norm(X[:, None, [0, 2]] - cen[None], axis=2), 1) > 0.062; far |= ~isH | (X[:, 1] > 0.0)
fix = far.copy(); fix[ci] = True; D = d.copy(); free = ~fix
for _ in range(1500):                      # harmonic interpolation of the landmark shifts over the face
    D[free] = (nsum(D) / deg[:, None])[free]
X += D
for key in PK:                             # sockets and mouth bag: a flat disc spread inside its loop
    pk, rim = PK[key]; m = np.zeros(NB, bool); m[pk] = True
    for _ in range(600): X[m] = (nsum(X) / deg[:, None])[m]
    if key == 'mouth':                     # the bag stays behind the lips
        y, v = Hy(X[pk, 0], X[pk, 2]); X[pk, 1] = np.where(v, y, X[pk, 1]) + 0.004 + 0.012 * sstep(1 - np.abs(X[pk, 0] - MOUTH[0]) / (MW * 0.95))
eyepk = np.zeros(NB, bool); eyepk[np.concatenate([PK['eyeL'][0], PK['eyeR'][0]])] = True
for it in range(14): val = face_step(X, [30, 20, 14, 10, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1][it], only=eyepk)
m = eyepk; X[m, 1] = Hfill(X[m, 0], X[m, 2])
print('fine face fit: verts on the depth map', int(val.sum()))
# ---------------- body: closest point on the generated shells
th = np.degrees(np.arctan2(X[:, 0], -X[:, 1]))
limb = lambda k: sum(W[k + sd] for sd in 'LR')
nofit = (limb('hand_') + limb('thumb_') + limb('index_') + limb('fingers_') + limb('foot_') + limb('toe_') > 0.35)
legw = {sd: W['thigh_' + sd] + W['shin_' + sd] for sd in 'LR'}
def body_step(X, K, maxd, gain=0.8):
    n = normals(X); d = np.zeros_like(X); val = np.zeros(NB, bool); zone = np.zeros(NB, int); z_all = X[:, 2]
    for i in range(NB):
        if nofit[i] or isH[i] or z_all[i] > 1.495: continue
        p = Vector(X[i]); z = X[i, 2]
        if z < 0.80:
            sd = 'L' if legw['L'][i] >= legw['R'][i] else 'R'
            if legw[sd][i] < 0.5 or z > 0.69 or z < 0.13: continue
            loc, nor, fi, dist = bvh_l[sd].find_nearest(p, maxd)
            if loc is None or nor @ Vector(n[i]) < 0.3: continue
            d[i] = np.array(loc) - X[i]; val[i] = True; zone[i] = 2; continue
        if z < 0.87 and abs(X[i, 0]) < 0.05: continue                      # between the thighs the cloth bridges
        if 0.78 < z < 1.0 and 8 < math.degrees(math.atan2(X[i, 0], -X[i, 1])) < 108 and math.hypot(X[i, 0], X[i, 1]) < 0.22: continue      # the lacing relief
        loc, nor, fi, dist = bvh_b.find_nearest(p, maxd)
        if loc is None or nor @ Vector(n[i]) < 0.4: continue
        c = btc[fi]
        if ribbon(c): continue
        off = 0.0 if skin(c) else -0.0025
        d[i] = np.array(loc) + np.array(nor) * off - X[i]; val[i] = True; zone[i] = 3
    D = diffuse(d, val | isH, K)
    for m_, b_ in RIG: D[m_] = D[b_].mean(0)          # hands and feet move as one piece
    X += gain * D; return val, zone, d
SCH = [(40, 0.06), (40, 0.06), (30, 0.05), (30, 0.05), (24, 0.04), (20, 0.04), (16, 0.03), (12, 0.03), (10, 0.025), (8, 0.02), (6, 0.02), (5, 0.015), (4, 0.015), (3, 0.012), (3, 0.012), (2, 0.012), (2, 0.01), (2, 0.01)]
RIG = []
for sd in 'LR':
    for ks in (('hand_', 'thumb_', 'index_', 'fingers_'), ('foot_', 'toe_')):
        m_ = sum(W[k + sd] for k in ks) > 0.35; b_ = np.zeros(NB, bool); b_[np.r_[E0[m_[E1]], E1[m_[E0]]]] = True; RIG.append((m_, b_ & ~m_))
for K, md in SCH:
    val, zone, d = body_step(X, K, md)
res = np.linalg.norm(d[val], axis=1); print('body fit: valid', int(val.sum()), 'by zone (legs, shell)', np.bincount(zone, minlength=4)[2:].tolist(), 'residual mean %.4f p95 %.4f' % (res.mean(), np.percentile(res, 95)))
# a light relax of the generated surface noise away from the face and the hands (volume kept by a back step)
relax = (~isH & ~nofit).astype(float)[:, None] * 0.5
for _ in range(3):
    L = nsum(X) / deg[:, None] - X; X += relax * 0.5 * L; L = nsum(X) / deg[:, None] - X; X -= relax * 0.52 * L
# feet on the floor
for sd in 'LR':
    m = (W['foot_' + sd] + W['toe_' + sd]) > 0.5; print('foot', sd, 'lowest %.4f' % X[m, 2].min(), 'y %.3f..%.3f' % (X[m, 1].min(), X[m, 1].max()))
ft = sum(W[k + sd] for k in ('foot_', 'toe_') for sd in 'LR') > 0.5; X[ft, 2] = np.maximum(X[ft, 2], 0.004)
zmin = X[:, 2].min(); print('lowest point %.4f; height of the body (no hair) %.3f' % (zmin, X[:, 2].max()))
np.savez_compressed(WD + '/body.npz', V=X, F=F, FT=FT, VT=VT, w_names=np.array(list(W)), w=np.stack([W[k] for k in W], 1).astype(np.float32),
                    **{'pk_' + k: v[0] for k, v in PK.items()}, **{'rim_' + k: v[1] for k, v in PK.items()}, newb_names=np.array(list(NEWB)), newb=np.array([np.r_[NEWB[k][0], NEWB[k][1]] for k in NEWB]),
                    landmarks=np.array([i_nose]))
# ---------------- check images
def mk(name, V_, F_, col):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in V_], [], [tuple(map(int, f)) for f in F_]); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.color = col
    for p in me.polygons: p.use_smooth = True
    return o
ob = mk('body', X, F, (0.86, 0.72, 0.66, 1)); src = mk('src', S['V'], S['F'], (0.45, 0.5, 0.62, 1)); cam = rend.setup()
bm = bmesh.new(); bm.from_mesh(ob.data); print('manifold check: boundary edges', sum(1 for e_ in bm.edges if e_.is_boundary), 'non-manifold', sum(1 for e_ in bm.edges if not e_.is_manifold), 'quads', sum(1 for f in bm.faces if len(f.verts) == 4), 'of', len(bm.faces)); bm.free()
rows = []; src.hide_render = True
rows.append([(n, rend.shot(cam, f'{WD}/r/_a{n}.png', v, 420, 800)) for n, v in (('front', [0, 0, 0.88, 1.8, 0, 0]), ('left', [0, 0, 0.88, 1.8, 90, 0]), ('back', [0, 0, 0.88, 1.8, 180, 0]), ('3q', [0, 0, 0.88, 1.8, 35, 5]))])
src.hide_render = False; src.location = (0.0, 0, 0); ob.hide_render = True
rows[0] += [(n, rend.shot(cam, f'{WD}/r/_a{n}.png', v, 420, 800)) for n, v in (('src front', [0, 0, 0.88, 1.8, 0, 0]), ('src left', [0, 0, 0.88, 1.8, 90, 0]))]
ob.hide_render = False
rows[0] += [(n, rend.shot(cam, f'{WD}/r/_a{n}.png', v, 420, 800)) for n, v in (('both front', [0, 0, 0.88, 1.8, 0, 0]), ('both left', [0, 0, 0.88, 1.8, 90, 0]))]
src.hide_render = True; rend.wire(ob); bpy.context.scene.display.shading.show_cavity = False
ob.data.materials.append(bpy.data.materials.new('m'));
def wshot(n, v, w, h):
    # wire overlay: a second render with a wireframe modifier copy
    return (n, rend.shot(cam, f'{WD}/r/_a{n}.png', v, w, h))
wo = ob.copy(); wo.data = ob.data.copy(); bpy.context.scene.collection.objects.link(wo); md = wo.modifiers.new('w', 'WIREFRAME'); md.thickness = 0.0006; md.use_replace = True; wo.color = (0.1, 0.1, 0.12, 1)
rows.append([wshot(n, v, 560, 560) for n, v in (('wface', [0, 0, 1.575, 0.24, 0, 0]), ('face 3q', [0, 0, 1.575, 0.26, 40, 5]), ('head left', [0, 0, 1.60, 0.34, 90, 0]), ('hand', [0.29, -0.02, 0.88, 0.2, 90, 0]), ('hand front', [0.29, -0.02, 0.88, 0.2, 0, 0]), ('hips back', [0, 0, 0.9, 0.6, 180, 0]))])
wo.hide_render = True
rows.append([wshot(n, v, 560, 560) for n, v in (('face', [0, 0, 1.575, 0.24, 0, 0]), ('face left', [0, 0, 1.575, 0.24, 90, 0]), ('torso', [0, 0, 1.25, 0.7, 30, 5]), ('shoulder back', [0, 0, 1.3, 0.7, 200, 10]), ('hips 3q', [0, 0, 0.85, 0.7, 40, 0]), ('hand s', [0.29, -0.02, 0.88, 0.2, 60, 10]))])
rend.montage(rows, WD + '/r/a1_body.jpg')
