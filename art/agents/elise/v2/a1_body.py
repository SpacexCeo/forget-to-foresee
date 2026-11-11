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
EYEC = {}
for sd in 'LR':
    c = A[list(EYEV[sd])].mean(0); r = np.linalg.norm(A[list(EYEV[sd])] - c, axis=1).mean(); EYEC[sd] = (c, r)
    if (c[0] > 0) != (sd == 'L'): print('EYE SIDE SWAPPED')
mc = (jh('oris05') + jh('oris01')) / 2
# cavities of the base mesh (inner mouth, nostrils): the outward normal meets the mesh again within 2.5 cm
n0 = None
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
HS = np.array([1.14, 0.90, 1.06]); HC_M = jh('head'); HC_E = np.array([0.0, 0.012, 1.555])
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
T2 = np.load(WD + '/tgt_head.npz'); hv, hf = T2['v'].astype(float), T2['f']; hc = T2['c'][hf].mean(1) / 255.0
bvh_h = BVHTree.FromPolygons([tuple(p) for p in hv], [tuple(map(int, f)) for f in hf])
bvh_b = BVHTree.FromPolygons([tuple(p) for p in bv], [tuple(map(int, f)) for f in bf]); btc = bc[bf].mean(1)
bvh_l = {sd: BVHTree.FromPolygons([tuple(p) for p in T['lv']], [tuple(map(int, f)) for f in T['lf' + sd]]) for sd in 'LR'}
def skin(c): return (c[..., 0] > 0.62) & (c[..., 1] > 0.45) & (c[..., 2] > 0.38) & (c[..., 0] - c[..., 2] < 0.42) & (c[..., 1] > 0.55 * c[..., 0])
ribbon = lambda c: (c[..., 0] > 0.3) & (c[..., 0] > 1.7 * c[..., 1]) & (c[..., 0] > 1.7 * c[..., 2])
# ---------------- the face of the first version, kept as it is: a depth map of its skin (the deepest front-facing
# surface, so the fringe in front of it does not count), 1 mm grid, from the full-resolution generated head
GX0, GZ0, GS = -0.095, 1.46, 0.001; NX, NZ = 191, 251
HY = np.full((NZ, NX), np.nan); HCc = np.zeros((NZ, NX, 3))
for j in range(NZ):
    for i in range(NX):
        o = Vector((GX0 + i * GS, -0.3, GZ0 + j * GS)); d = Vector((0, 1, 0)); best = None
        for _ in range(60):
            loc, nor, fi, dist = bvh_h.ray_cast(o, d)
            if loc is None or loc.y > 0.03: break
            if nor.y < -0.08: best = (loc.y, fi)
            o = loc + d * 1e-4
        if best: HY[j, i] = best[0]; HCc[j, i] = hc[best[1]]
EF = json.load(open(WD + '/face_fit.json'))['eye']; MOUTH = (0.001, 1.522); MW = 0.0125
gx = GX0 + np.arange(NX) * GS; gz = GZ0 + np.arange(NZ) * GS; GXX, GZZ = np.meshgrid(gx, gz)
box = np.zeros((NZ, NX), bool)
for sd in 'LR':
    cx, cz, a_, b_ = EF[sd]; box |= ((GXX - cx) / (a_ * 1.5)) ** 2 + ((GZZ - cz) / (b_ * 1.9)) ** 2 < 1
box |= (abs(GXX - MOUTH[0]) < 0.022) & (abs(GZZ - MOUTH[1]) < 0.012)
sk_ = skin(HCc) & ~np.isnan(HY); ok = sk_ | (box & ~np.isnan(HY))
from PIL import Image
def boxmean(a, m, r):
    a = np.where(m, a, 0); c = np.cumsum(np.cumsum(np.pad(a, r + 1), 0), 1); n = np.cumsum(np.cumsum(np.pad(m.astype(float), r + 1), 0), 1)
    s = lambda q: q[2 * r + 1:-1, 2 * r + 1:-1] - q[:-2 * r - 2, 2 * r + 1:-1] - q[2 * r + 1:-1, :-2 * r - 2] + q[:-2 * r - 2, :-2 * r - 2]
    return s(c) / np.maximum(s(n), 1e-9), s(n)
mu, cnt = boxmean(np.nan_to_num(HY), sk_, 4); ok |= ~np.isnan(HY) & (cnt > 20) & (abs(HY - mu) < 0.002) & (GZZ < 1.66)      # brows, lashes, the nose line: not skin-coloured but on the skin
jump = np.zeros((NZ, NX), bool); Hn = np.where(ok, HY, np.nan)
jump[1:, :] |= abs(Hn[1:, :] - Hn[:-1, :]) > 0.006; jump[:, 1:] |= abs(Hn[:, 1:] - Hn[:, :-1]) > 0.006
for _ in range(2): jump[1:, :] |= jump[:-1, :]; jump[:-1, :] |= jump[1:, :]; jump[:, 1:] |= jump[:, :-1]; jump[:, :-1] |= jump[:, 1:]
ok &= ~jump
lab = np.zeros((NZ, NX), bool); st = [(int((1.555 - GZ0) / GS), int((0.03 - GX0) / GS)), (int((1.555 - GZ0) / GS), int((-0.03 - GX0) / GS))]
while st:
    j, i = st.pop()
    if j < 0 or i < 0 or j >= NZ or i >= NX or lab[j, i] or not ok[j, i]: continue
    lab[j, i] = True; st += [(j + 1, i), (j - 1, i), (j, i + 1), (j, i - 1)]
print('depth map: valid', int(ok.sum()), 'face component', int(lab.sum())); ok = lab; real = ok.copy()
HYs = np.where(ok, HY, 0); mu, cnt = boxmean(HYs, ok, 1); HYs = np.where(ok, 0.5 * HYs + 0.5 * mu, 0)
# where a strand hides one cheek, the other cheek is used (mirror about the middle of the two eyes)
ic = int(round(((EF['L'][0] + EF['R'][0]) / 2 - GX0) / GS)); mi = np.clip(2 * ic - np.arange(NX), 0, NX - 1); mir = ~ok & ok[:, mi] & (2 * ic - np.arange(NX) >= 0)[None, :] & (2 * ic - np.arange(NX) < NX)[None, :]
wm = sstep((GXX - gx[ic] - 0.005) / 0.02) * sstep((1.575 - GZZ) / 0.01); both = ok & ok[:, mi]            # her left cheek below the eye had a strand lying on it: the right cheek's shape is used there
HYs = np.where(both, (1 - wm) * HYs + wm * HYs[:, mi], HYs); drop = ok & ~ok[:, mi] & (wm > 0.5); ok &= ~drop; mir = ~ok & ok[:, mi] & (2 * ic - np.arange(NX) >= 0)[None, :] & (2 * ic - np.arange(NX) < NX)[None, :]
HYs[mir] = HYs[:, mi][mir]; ok |= mir; band = mir.copy()
for _ in range(5): band[1:, :] |= band[:-1, :]; band[:-1, :] |= band[1:, :]; band[:, 1:] |= band[:, :-1]; band[:, :-1] |= band[:, 1:]
band &= ok
for _ in range(4): mu, cnt = boxmean(HYs, ok, 2); HYs = np.where(band, mu, HYs)          # the seam between the real and the mirrored cheek is smoothed
print('mirrored pixels', int(mir.sum()))
Image.fromarray((np.clip(HCc, 0, 1) * 255 * (0.35 + 0.65 * real[:, :, None]) * ~np.isnan(HY)[:, :, None]).astype(np.uint8)[::-1]).resize((NX * 3, NZ * 3)).save(WD + '/r/a1_facemap.png')
HF = HYs.copy(); known = ok.copy()          # the same depth continued over the unknown pixels
for _ in range(60):
    P_ = np.pad(np.where(known, HF, 0), 1); C_ = np.pad(known.astype(float), 1); s_ = P_[2:, 1:-1] + P_[:-2, 1:-1] + P_[1:-1, 2:] + P_[1:-1, :-2]; c_ = C_[2:, 1:-1] + C_[:-2, 1:-1] + C_[1:-1, 2:] + C_[1:-1, :-2]
    new = ~known & (c_ > 0); HF[new] = (s_ / np.maximum(c_, 1))[new]; known |= new
def bil(M, x, z):
    fx = np.clip((np.asarray(x) - GX0) / GS, 0, NX - 1.001); fz = np.clip((np.asarray(z) - GZ0) / GS, 0, NZ - 1.001); i = np.floor(fx).astype(int); j = np.floor(fz).astype(int); a = fx - i; b = fz - j
    return (M[j, i] * (1 - a) + M[j, i + 1] * a) * (1 - b) + (M[j + 1, i] * (1 - a) + M[j + 1, i + 1] * a) * b
Hfill = lambda x, z: bil(HF, x, z)
def Hy(x, z):
    v = bil(ok.astype(float), x, z) > 0.999; return bil(HYs, x, z), v
for z_ in (1.50, 1.52, 1.55, 1.585, 1.61, 1.64):
    j = int(round((z_ - GZ0) / GS)); m = ok[j]; print('face z %.3f: x %.3f..%.3f, front y %.3f' % (z_, gx[m].min(), gx[m].max(), np.nanmin(np.where(m, HY[j], np.nan))) if m.any() else ('face z %.3f none' % z_))
col = np.where(ok[:, ic - 3:ic + 4].all(1), HYs[:, ic - 3:ic + 4].min(1), np.nan); jn = np.nanargmin(np.where((gz > 1.535) & (gz < 1.575), col, np.nan)); NOSE = np.array([gx[ic], col[jn], gz[jn]])
CHIN_Z = gz[~np.isnan(col)].min(); print('nose tip', NOSE.round(4), 'chin (lowest face skin on the centre line)', CHIN_Z.round(4))
isH = W['head'] > 0.5
# cavities of the base mesh
n0 = normals(X0); n0 *= 1 if n0[np.argmax(X0[:, 2]), 2] > 0 else -1; NSIGN = 1 if normals(X0)[np.argmax(X0[:, 2]), 2] > 0 else -1
# cavities (the mouth bag behind the lips, the nostrils): vertices the front cannot see
CAV = np.zeros(NB, bool)
for i in np.nonzero((X0[:, 2] > 1.42) & (X0[:, 1] < -0.03))[0]:
    CAV[i] = bvh0.ray_cast(Vector(X0[i]) + Vector((0, -3e-4, 0)), Vector((0, -1, 0)), 0.3)[0] is not None
EDIST = {}
def eye_socket(sd):
    """Rings of vertices around the bottom of the eye socket; the lid loop is the first ring that faces the front."""
    c, r = EYEC[sd]; seed = int(np.argmin(np.linalg.norm(X0 - (c + [0, r * 1.05, 0]), axis=1))); dist = np.full(NB, -1); dist[seed] = 0; fr = [seed]; k = 0; tab = []
    while fr and k < 30:
        k += 1; nx_ = sorted({j for i in fr for j in adj[i] if dist[j] < 0})
        for j in nx_: dist[j] = k
        fr = nx_; ff = float((n0[fr, 1] < -0.35).mean()); tab.append((k, len(fr), round(ff, 2), round(float(np.linalg.norm(X0[fr] - c, axis=1).mean() / r), 2)))
        if ff > 0.9 and k > 3: break
    print('eye', sd, 'rings (k, verts, part facing front, distance / eyeball radius):', tab[-8:])
    EDIST[sd] = (dist.copy(), k); return np.nonzero((dist >= 0) & (dist < k))[0], np.array(fr)
for sd in 'LR': PK['eye' + sd] = eye_socket(sd)
def comp_of(seed_pt, mask):
    ids = np.nonzero(mask)[0]; seed = int(ids[np.argmin(np.linalg.norm(X0[ids] - seed_pt, axis=1))]); comp = set(); st = [seed]
    while st:
        i = st.pop()
        if i in comp: continue
        comp.add(i); st += [j for j in adj[i] if mask[j]]
    rim = sorted({j for i in comp for j in adj[i]} - comp); return np.array(sorted(comp)), np.array(rim)
PK['mouth'] = comp_of(mc + [0, 0.025, 0], CAV); r_ = X0[PK['mouth'][1]]
print('cavity verts', int(CAV.sum()), 'mouth', len(PK['mouth'][0]), 'rim', len(r_), 'rim x %.3f..%.3f z %.3f..%.3f y %.3f..%.3f' % (r_[:, 0].min(), r_[:, 0].max(), r_[:, 2].min(), r_[:, 2].max(), r_[:, 1].min(), r_[:, 1].max()))
bagm = np.zeros(NB, bool); bagm[PK['mouth'][0]] = True          # only the mouth bag and the nostrils count as cavities
CAV = bagm | (CAV & (abs(X0[:, 0]) < 0.024) & (X0[:, 2] > mc[2] + 0.012) & (X0[:, 2] < 1.535) & (X0[:, 1] < -0.12)); print('cavities kept: mouth bag', int(bagm.sum()), 'nostrils', int((CAV & ~bagm).sum()))
I_CHIN = np.nonzero((abs(X0[:, 0]) < 0.004) & (X0[:, 1] < -0.115) & (X0[:, 2] < mc[2] - 0.02) & (X0[:, 2] > 1.40))[0]; I_CHIN = int(I_CHIN[np.argmin(X0[I_CHIN, 2])]); print('chin of the base mesh', X0[I_CHIN].round(3))
# ---------------- head: coarse depth fit, landmark warp, then the whole face is laid out on the first version's surface
hn = (W['head'] + W['neck']) > 0.02
def stat(tag): print('  head bbox after', tag, X[isH].min(0).round(3), X[isH].max(0).round(3))
inpk = np.zeros(NB, bool); inpk[np.concatenate([PK[k][0] for k in PK])] = True; noface = CAV | inpk
def face_step(X, K, gain=1.0):
    n = normals(X) * NSIGN; y, v = Hy(X[:, 0], X[:, 2]); val = isH & v & (n[:, 1] < -0.25) & ~noface
    d = np.zeros_like(X); d[val, 1] = y[val] - X[val, 1]; D = diffuse(d, val | ~hn, K); X += gain * D * hn[:, None]; return val
for it in range(6): val = face_step(X, 60)
print('coarse face fit: verts on the depth map', int(val.sum())); stat('coarse')
# the face disc of the base mesh: everything in front of a plane before the ears, with its cavities
Sset = ((X0[:, 1] < -0.058) & (X0[:, 2] > 1.42)) | CAV | inpk; outside = np.zeros(NB, bool); st = [int(np.argmin(X0[:, 2]))]
while st:
    i = st.pop()
    if outside[i] or Sset[i]: continue
    outside[i] = True; st += adj[i]
REG = ~outside; keep = np.zeros(NB, bool); st = [I_NOSE]
while st:
    i = st.pop()
    if keep[i] or not REG[i]: continue
    keep[i] = True; st += adj[i]
REG = keep; outside = ~REG; bnd = REG & (nsum(outside.astype(float)) > 0); fin = np.array([REG[f].all() for f in F]); ne = len({tuple(sorted((int(f[k]), int(f[(k + 1) % 4])))) for f in F[fin] for k in range(4)})
print('face disc: verts', int(REG.sum()), 'border', int(bnd.sum()), 'quads', int(fin.sum()), 'Euler characteristic', int(len(np.unique(F[fin])) - ne + fin.sum()))
xc = gx[ic]; hw_row = np.array([np.abs(gx[ok[j]] - xc).max() if ok[j].any() else np.nan for j in range(NZ)])
con = {}                                   # vertex -> target x, z
vf = [[] for _ in range(NB)]
for fi_, f in enumerate(F):
    for i in f: vf[i].append(fi_)
def walk_loop(rim):
    """Order a ring of vertices that follow each other across shared faces."""
    rs = set(int(i) for i in rim); nb = {i: sorted({int(j) for fi_ in vf[i] for j in F[fi_] if int(j) in rs and int(j) != i}) for i in rs}
    order = [int(rim[0])]; prev = None
    while True:
        cand = [j for j in nb[order[-1]] if j != prev and j not in order[1:]]
        if not cand or cand[0] == order[0]: break
        prev = order[-1]; order.append(cand[0])
    return order, sorted(set(len(v) for v in nb.values()))
for sd, sg in (('L', 1), ('R', -1)):          # the lid loop goes onto the outline of the painted eye, in its own order, by arc length
    pk, rim = PK['eye' + sd]; cx, cz, a_, b_ = EF[sd]; order, nbc = walk_loop(rim); r = X[order]
    area = sum(r[k, 0] * r[(k + 1) % len(r), 2] - r[(k + 1) % len(r), 0] * r[k, 2] for k in range(len(r))); dr_ = 1 if area > 0 else -1
    k0 = int(np.argmin(r[:, 0] * sg)); seg_ = np.linalg.norm(np.roll(r, -1, 0) - r, axis=1); cum = np.cumsum(np.r_[0, seg_[:-1]]); cum = (cum - cum[k0]) % seg_.sum() / seg_.sum()
    kq = int(np.argmin(abs(cum - 0.25))); up = r[kq, 2] > r[:, 2].mean(); dr2 = (-1 if up else 1) * sg; print('   eye', sd, 'direction by area', dr_, 'by the quarter point', dr2, 'quarter z - mean %.4f' % (r[kq, 2] - r[:, 2].mean())); dr_ = dr2
    for i, f_ in zip(order, cum):
        t_ = (math.pi if sg > 0 else 0.0) + dr_ * 2 * math.pi * f_; con[int(i)] = (cx + a_ * 1.04 * math.cos(t_), cz + b_ * 1.10 * math.sin(t_))
    print('eye', sd, 'lid loop: verts', len(rim), 'ordered', len(order), 'ring neighbours per vert', nbc, 'direction', dr_)
pk, rim = PK['mouth']; r = X[rim]; c0 = (r.max(0) + r.min(0)) / 2; h0x = (r[:, 0].max() - r[:, 0].min()) / 2
for i in rim: con[int(i)] = (MOUTH[0] + MW * (X[i, 0] - c0[0]) / h0x, MOUTH[1] - 0.0012 * (1 - ((X[i, 0] - c0[0]) / h0x) ** 2))
con[I_NOSE] = (NOSE[0], NOSE[2]); con[I_CHIN] = (NOSE[0], CHIN_Z + 0.003)
nclamp = 0
for i in np.nonzero(bnd)[0]:               # the border of the disc stays just behind the first version's silhouette (her narrow jaw)
    j = int(round((X[i, 2] - GZ0) / GS))
    if 0 <= j < NZ and CHIN_Z + 0.012 < X[i, 2] < min(EF['L'][1], EF['R'][1]) - 0.022 and not np.isnan(hw_row[j]) and abs(X[i, 0] - xc) > hw_row[j] + 0.004:
        con[int(i)] = (xc + np.sign(X[i, 0] - xc) * (hw_row[j] + 0.004), X[i, 2]); nclamp += 1
print('landmarks:', len(con), 'nose', X[I_NOSE].round(3), '->', NOSE.round(3), 'chin z %.3f -> %.3f' % (X[I_CHIN, 2], CHIN_Z + 0.003), 'mouth rim half width %.4f -> %.4f' % (h0x, MW), 'border verts drawn in', nclamp)
ci = np.array(sorted(con)); d = np.zeros_like(X); d[ci, 0] = [con[i][0] - X[i, 0] for i in ci]; d[ci, 2] = [con[i][1] - X[i, 2] for i in ci]
fix = ~isH | (X[:, 1] > 0.03) | (X[:, 2] > 1.68); fix[ci] = True; D = d.copy(); free = ~fix
for _ in range(3000):                      # harmonic interpolation of the landmark shifts over the face and jaw
    D[free] = (nsum(D) / deg[:, None])[free]
X += D; stat('landmark warp')
for it in range(3): face_step(X, 20)
for i in ci: X[i, 0], X[i, 2] = con[int(i)]
# inside each loop (eye sockets, the mouth bag, nostrils) x, z of every vertex is the mean of its neighbours: a flat disc
# without folds (the mouth's disc closes to the lip line). The skin around keeps the smooth landmark warp.
pinm = bnd.copy(); pinm[[i for i in ci if REG[i]]] = True
cavm = np.zeros(NB, bool); cavm[np.concatenate([PK[k][0] for k in PK])] = True; cavm |= CAV & REG; cavm &= ~pinm
for _ in range(3000):
    Xn = nsum(X) / deg[:, None]; X[cavm, 0] = Xn[cavm, 0]; X[cavm, 2] = Xn[cavm, 2]
eyem = np.zeros(NB, bool); eyem[np.concatenate([PK['eyeL'][0], PK['eyeR'][0]])] = True; deep = cavm & ~eyem
def snap():
    y, v = Hy(X[:, 0], X[:, 2]); onf = REG & v & ~bnd & ~deep; X[onf, 1] = y[onf]; return onf
onf = snap(); fl = F[fin]; mfree = REG & ~pinm & ~deep; skinf = ~deep[fl].any(1)
film = REG & ~onf & ~bnd & ~deep
Xb = X.copy(); jt_ = np.nonzero(ok[:, ic - 15:ic + 16].any(1))[0].max(); ytop = float(np.median(HYs[jt_ - 3:jt_ + 1, ic - 15:ic + 16][ok[jt_ - 3:jt_ + 1, ic - 15:ic + 16]])); ztop = gz[jt_]
fh = isH & (X[:, 2] > ztop) & (X[:, 1] < 0.0) & ~onf; lim = ytop + 0.30 * (X[:, 2] - ztop) + 0.10 * np.abs(X[:, 0] - xc)       # the forehead under the fringe leans back from the brow
X[fh, 1] = np.maximum(X[fh, 1], lim[fh]); print('forehead: top of the known face z %.3f y %.3f, verts moved back' % (ztop, ytop), int((X[fh, 1] > Xb[fh, 1] + 1e-6).sum()), 'largest %.4f' % (X[:, 1] - Xb[:, 1]).max())
film &= ~fh
for _ in range(3000): X[film, 1] = (nsum(X) / deg[:, None])[film, 1]
X[deep, 1] = Hfill(X[deep, 0], X[deep, 2]) + 0.002          # the mouth bag and nostrils sit just behind the skin
mv = mfree
mb = deep
R = onf.copy(); fl = F[fin]; fn_ = np.cross(X[fl[:, 2]] - X[fl[:, 0]], X[fl[:, 3]] - X[fl[:, 1]]) * NSIGN; ar = np.linalg.norm(fn_, axis=1)
bw = (fn_[:, 1] > 0) & (ar > 1e-9) & skinf
for key in PK:
    m = np.zeros(NB, bool); m[PK[key][0]] = True; m[PK[key][1]] = True; inm = m[fl].all(1); print('   ', key, 'quads', int(inm.sum()), 'backwards', int((bw & inm).sum()), 'pocket bbox x %.3f..%.3f z %.3f..%.3f' % (X[PK[key][0], 0].min(), X[PK[key][0], 0].max(), X[PK[key][0], 2].min(), X[PK[key][0], 2].max()), 'rim bbox x %.3f..%.3f z %.3f..%.3f' % (X[PK[key][1], 0].min(), X[PK[key][1], 0].max(), X[PK[key][1], 2].min(), X[PK[key][1], 2].max()))
oth = ~np.any([np.isin(fl, np.r_[PK[k][0], PK[k][1]]).all(1) for k in PK], 0); cb = X[fl[bw & oth]].mean(1) if (bw & oth).any() else np.zeros((0, 3)); print('    elsewhere backwards', int((bw & oth).sum()), 'centres bbox', cb.min(0).round(3) if len(cb) else '', cb.max(0).round(3) if len(cb) else '', 'of them cavity', int(CAV[fl[bw & oth]].any(1).sum()))
from PIL import ImageDraw
im_ = Image.new('RGB', (1500, 1500), (255, 255, 255)); dr = ImageDraw.Draw(im_); px = lambda p_: ((p_[0] + 0.1) * 7500, (1.66 - p_[2]) * 7500)
for f_, b_ in zip(fl, bw):
    pts = [px(X[i]) for i in f_]
    if b_: dr.polygon(pts, fill=(255, 170, 170))
for f_ in fl:
    pts = [px(X[i]) for i in f_]; dr.line(pts + [pts[0]], fill=(60, 60, 60), width=1)
for i in np.nonzero(pinm)[0]: x_, y_ = px(X[i]); dr.ellipse((x_ - 3, y_ - 3, x_ + 3, y_ + 3), fill=(0, 90, 255))
im_.save(WD + '/r/a1_layout.png')
dx_ = np.abs(X - nsum(X) / deg[:, None])[mv][:, [0, 2]].max(); print('    layout convergence: max distance to the neighbours mean %.6f' % dx_)
print('face layout: verts exactly on the first version', int(onf.sum()), 'on the film', int(film.sum()), 'quads facing backwards', int(((fn_[:, 1] > 0) & (ar > 1e-9)).sum()), 'collapsed (the closed mouth)', int((ar <= 1e-9).sum())); stat('layout')
# ---------------- body: closest point on the generated shells
th = np.degrees(np.arctan2(X[:, 0], -X[:, 1]))
limb = lambda k: sum(W[k + sd] for sd in 'LR')
nofit = (limb('hand_') + limb('thumb_') + limb('index_') + limb('fingers_') + limb('foot_') + limb('toe_') > 0.35)
legw = {sd: W['thigh_' + sd] + W['shin_' + sd] for sd in 'LR'}
def body_step(X, K, maxd, gain=0.8):
    n = normals(X) * NSIGN; d = np.zeros_like(X); val = np.zeros(NB, bool); zone = np.zeros(NB, int); z_all = X[:, 2]
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
                    face_region=R, cav=CAV, **{'pk_' + k: v[0] for k, v in PK.items()}, **{'rim_' + k: v[1] for k, v in PK.items()}, newb_names=np.array(list(NEWB)), newb=np.array([np.r_[NEWB[k][0], NEWB[k][1]] for k in NEWB]),
                    landmarks=np.array([I_NOSE, I_CHIN]))
# ---------------- check images
def mk(name, V_, F_, col):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in V_], [], [tuple(map(int, f)) for f in F_]); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.color = col
    for p in me.polygons: p.use_smooth = True
    return o
ob = mk('body', X, F if NSIGN > 0 else F[:, ::-1], (0.86, 0.72, 0.66, 1)); src = mk('src', S['V'], S['F'], (0.45, 0.5, 0.62, 1)); cam = rend.setup()
v1 = mk('v1face', hv, hf, (0.86, 0.72, 0.66, 1)); v1.hide_render = True
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
wo = ob.copy(); wo.data = ob.data.copy(); bpy.context.scene.collection.objects.link(wo); b2 = bmesh.new(); b2.from_mesh(wo.data); b2.verts.ensure_lookup_table(); bmesh.ops.delete(b2, geom=[v for v in b2.verts if deep[v.index]], context='VERTS'); b2.to_mesh(wo.data); b2.free(); md = wo.modifiers.new('w', 'WIREFRAME'); md.thickness = 0.0006; md.use_replace = True; wo.color = (0.1, 0.1, 0.12, 1)
rows.append([wshot(n, v, 560, 560) for n, v in (('wface', [0, 0, 1.575, 0.24, 0, 0]), ('face 3q', [0, 0, 1.575, 0.26, 40, 5]), ('head left', [0, 0, 1.60, 0.34, 90, 0]), ('hand', [0.29, -0.02, 0.88, 0.2, 90, 0]), ('hand front', [0.29, -0.02, 0.88, 0.2, 0, 0]), ('hips back', [0, 0, 0.9, 0.6, 180, 0]))])
wo.hide_render = True
rows.append([wshot(n, v, 560, 560) for n, v in (('face', [0, 0, 1.575, 0.24, 0, 0]), ('face left', [0, 0, 1.575, 0.24, 90, 0]), ('torso', [0, 0, 1.25, 0.7, 30, 5]), ('shoulder back', [0, 0, 1.3, 0.7, 200, 10]), ('hips 3q', [0, 0, 0.85, 0.7, 40, 0]), ('hand s', [0.29, -0.02, 0.88, 0.2, 60, 10]))])
ob.hide_render = True; v1.hide_render = False; FV = (('front', [0, 0, 1.575, 0.24, 0, 0]), ('3q', [0, 0, 1.575, 0.26, 40, 5]), ('left', [0, 0, 1.575, 0.26, 90, 0]), ('3q right', [0, 0, 1.575, 0.26, -40, 5]), ('low', [0, 0, 1.56, 0.26, 20, -25]))
r1 = [wshot('v1 ' + n, v, 560, 560) for n, v in FV]; ob.hide_render = False; v1.hide_render = True
r2 = [wshot('new ' + n, v, 560, 560) for n, v in FV]; wo.hide_render = False; r3 = [wshot('new wire ' + n, v, 560, 560) for n, v in FV]
rend.montage([r1, r2, r3], WD + '/r/a1_face.jpg')
rend.montage(rows, WD + '/r/a1_body.jpg')
