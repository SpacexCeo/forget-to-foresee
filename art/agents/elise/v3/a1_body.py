"""Elise v3, stages 1 and 2: her body and her face, built from zero (see docs/art/elise/v3-plan.md).

Nothing is taken from the earlier models. The CC0 MakeHuman base mesh (13 380 vertices, quads, closed, with painted
weights) is shaped with its own targets (a slim young woman), posed and proportioned on her skeleton
(skeleton.json: her 90 bones, unchanged), and stands in a 5 cm heel. The face is part of the same mesh: a small
chin and nose, the eye sockets closed to a smooth surface, the face itself drawn from shapes (face_art.py).
    blender -b -P a1_body.py -- <work dir> [mpfb data dir]      writes body.blend, face.png, r/a1_shape.jpg, r/a1.jpg
"""
import bpy, sys, os, gzip, json, math
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'v2')); import rend
sys.path.insert(0, HERE); import face_art
args = sys.argv[sys.argv.index('--') + 1:]
WD = args[0]; MP = args[1] if len(args) > 1 else os.path.expanduser('~/.config/blender/4.5/extensions/user_default/mpfb/data')
bpy.ops.wm.read_factory_settings(use_empty=True)
unit = lambda v: np.asarray(v, float) / np.linalg.norm(v)
sstep = lambda t: (lambda u: u * u * (3 - 2 * u))(np.clip(t, 0, 1))
NB = 13380

# ---------------- the base mesh (obj axes: x her left, y up, z front, decimetres), its joint cubes and targets
V, VT, F, FT, g, GRP = [], [], [], [], None, {}
for l in open(MP + '/3dobjs/base.obj'):
    p = l.split()
    if not p: continue
    if p[0] == 'v': V.append([float(x) for x in p[1:4]])
    elif p[0] == 'vt': VT.append([float(x) for x in p[1:3]])
    elif p[0] == 'g': g = p[1]
    elif p[0] == 'f':
        if g == 'body': F.append([int(x.split('/')[0]) - 1 for x in p[1:]]); FT.append([int(x.split('/')[1]) - 1 for x in p[1:]])
        elif g.startswith('joint-'): GRP.setdefault(g, set()).update(int(x.split('/')[0]) - 1 for x in p[1:])
VA = np.array(V); F = np.array(F); FT = np.array(FT); VT = np.array(VT)


def target(name, w):
    path = None
    for root, _, files in os.walk(MP + '/targets'):
        if name + '.target.gz' in files: path = os.path.join(root, name + '.target.gz')
    assert path, name
    d = np.zeros((len(VA), 3))
    for l in gzip.open(path, 'rt'):
        p = l.split()
        if len(p) == 4 and not l.startswith('#') and int(p[0]) < len(VA): d[int(p[0])] = [float(x) for x in p[1:]]
    return d * w


FY = 'female-young-averagemuscle-averageweight-'
SHAPE = [  # the figure
    ('universal-female-young-averagemuscle-averageweight', 0.7), ('universal-female-young-averagemuscle-minweight', 0.3),
    ('caucasian-female-young', 0.5), ('asian-female-young', 0.5), (FY + 'idealproportions', 1.0),
    (FY + 'maxcup-averagefirmness', 0.6), (FY + 'averagecup-maxfirmness', 0.6),
    ('measure-waist-circ-decr', 0.4), ('stomach-tone-incr', 0.4), ('buttocks-volume-incr', 0.15),
    # the face
    ('head-oval', 0.5), ('head-triangular', 0.35), ('chin-width-decr', 0.6), ('chin-triangle', 0.4), ('chin-bones-decr', 0.5), ('chin-prominent-decr', 0.2),
    ('nose-scale-horiz-decr', 0.9), ('nose-scale-depth-decr', 0.7), ('nose-scale-vert-decr', 0.4), ('nose-point-up', 0.4), ('nose-nostrils-width-decr', 0.8), ('nose-hump-decr', 0.5), ('nose-flaring-decr', 0.6),
    ('mouth-scale-horiz-decr', 0.7), ('mouth-lowerlip-volume-decr', 0.4), ('mouth-upperlip-volume-decr', 0.4),
    ('l-cheek-bones-decr', 0.3), ('r-cheek-bones-decr', 0.3), ('forehead-temple-decr', 0.2)]
D = np.zeros((len(VA), 3))
for n, w in SHAPE:
    try: D += target(n, w)
    except AssertionError: print('NO TARGET', n)
A = VA + D; A = np.stack([A[:, 0], -A[:, 2], A[:, 1]], 1) * 0.1; A[:, 2] -= A[:NB, 2].min()      # metres, Z up, front -Y, her left +X
X0 = A[:NB].copy(); print('shaped base: height %.3f' % X0[:, 2].max())
rig = json.load(open(MP + '/rigs/standard/rig.default.json')); mw = json.load(open(MP + '/rigs/standard/weights.default.json'))['weights']
def jpos(e):
    if e['strategy'] == 'CUBE': return A[sorted(GRP[e['cube_name']])].mean(0)
    if e['strategy'] == 'MEAN': return A[e['vertex_indices']].mean(0)
    return A[e['vertex_index']]
jh = lambda b: jpos(rig[b]['head']); jt = lambda b: jpos(rig[b]['tail'])
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
print('weights: groups', len(W), 'unweighted vertices', int((tot < 1e-6).sum()))
e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 3]], F[:, [3, 0]]]); e = np.unique(np.sort(e, 1), axis=0); E0, E1 = e[:, 0], e[:, 1]
deg = np.bincount(np.r_[E0, E1], minlength=NB).astype(float)
def nmean(a):
    out = np.zeros_like(a); np.add.at(out, E0, a[E1]); np.add.at(out, E1, a[E0]); return out / np.maximum(deg, 1)[:, None]

# ---------------- pose and proportions on her skeleton
SK = json.load(open(HERE + '/skeleton.json')); BH = {k: np.array(v['head']) for k, v in SK.items()}; BT = {k: np.array(v['tail']) for k, v in SK.items()}
def rot_between(a, b):
    a, b = unit(a), unit(b); v = np.cross(a, b); c = a @ b; K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + c)
def seg(hm, tm, he, te, kr, uniform=None):
    """Map the segment hm..tm onto he..te: rotate, scale along by the length ratio and across by kr."""
    dm = unit(tm - hm); R = rot_between(dm, te - he); sl = np.linalg.norm(te - he) / np.linalg.norm(tm - hm)
    if uniform: sl = kr = uniform
    def T(p):
        q = p - hm; a = q @ dm; return he + (np.outer(a * sl, dm) + (q - np.outer(a, dm)) * kr) @ R.T
    return T, R
hipM = jh('upperleg01.L'); shM = jh('upperarm01.L'); nkM = jh('neck01'); hdM = jh('head'); topM = X0[:, 2].max()
print('base joints: hip %s shoulder %s neck z %.3f head z %.3f' % (hipM.round(3), shM.round(3), nkM[2], hdM[2]))
chinM = float(X0[(np.abs(X0[:, 0]) < 0.004) & (X0[:, 1] < hdM[1] - 0.03) & (X0[:, 2] > nkM[2]), 2].min())
HEAD_H = 0.244                                        # chin to crown (about 7.3 heads in 1.74 m)
hz = HEAD_H / (topM - chinM); HJ = 1.741 - hz * (topM - hdM[2])
ZM = [0.0, hipM[2], shM[2], nkM[2], hdM[2], topM]; ZE = [0.0, 0.93, 1.40, 1.465, HJ, 1.741]
u = lambda f: hipM[2] + f * (shM[2] - hipM[2])
KZ = [hipM[2] - 0.10, hipM[2], u(0.42), u(0.80), shM[2], nkM[2], hdM[2]]
KX = [1.02, 1.00, 0.92, 0.86, 0.84, 0.90, 1.00]; KY = [1.02, 1.02, 0.95, 0.92, 0.90, 0.92, 1.00]
def torso(p):
    return np.stack([p[:, 0] * np.interp(p[:, 2], KZ, KX), (p[:, 1] - hipM[1]) * np.interp(p[:, 2], KZ, KY), np.interp(p[:, 2], ZM, ZE)], 1)
HS = np.array([hz * 1.07, hz * 1.0, hz]); HC_E = np.array([0.0, 0.012, HJ])
print('head scale', HS.round(3))
head_T = lambda p: HC_E + (p - hdM) * HS
TF = {k: torso for k in ('pelvis', 'spine', 'chest', 'neck')}; TF['head'] = head_T
for sd in 'LR':
    s = '.' + sd; Sm, Em, Wm = jh('upperarm01' + s), jh('lowerarm01' + s), jh('wrist' + s); Km = jh('finger3-1' + s)
    Se, Ee, We = BH['upperarm_' + sd], BH['forearm_' + sd], BH['hand_' + sd]
    TF['shoulder_' + sd], _ = seg(jh('clavicle' + s), Sm, BH['shoulder_' + sd], Se, 0.9)
    TF['upperarm_' + sd], _ = seg(Sm, Em, Se, Ee, 0.98); TF['forearm_' + sd], Rf = seg(Em, Wm, Ee, We, 0.98)
    hd = unit(BT['hand_' + sd] - BH['hand_' + sd]); Rh = rot_between(Rf @ unit(Km - Wm), hd) @ Rf; KH = 1.0
    TF['hand_' + sd] = (lambda Wm, We, Rh: lambda p: We + KH * (p - Wm) @ Rh.T)(Wm, We, Rh)
    for k in ('thumb_', 'index_', 'fingers_'): TF[k + sd] = TF['hand_' + sd]
    Hm, Nm, Am = jh('upperleg01' + s), jh('lowerleg01' + s), jh('foot' + s); He, Ne, Ae = BH['thigh_' + sd], BH['shin_' + sd], BH['foot_' + sd]
    TF['thigh_' + sd], _ = seg(Hm, Nm, He, Ne, 1.02); TF['shin_' + sd], _ = seg(Nm, Am, Ne, Ae, 1.0)
    # the foot stands in a heel: the ankle keeps its place, the ball of the foot comes down to the floor
    KF = 0.98; Bm = np.mean([jh('toe%d-1' % i + s) for i in range(1, 6)], 0); Tm = Bm + [0, -0.056, 0]
    TF['foot_' + sd], _ = seg(Am, Bm, Ae, BH['toe_' + sd], 0, uniform=KF); TF['toe_' + sd], _ = seg(Bm, Tm, BH['toe_' + sd], BT['toe_' + sd], 0, uniform=KF)
X = sum(W[k][:, None] * TF[k](X0) for k in W)
EYE = {sd: head_T(A[sorted(GRP['joint-%s-eye' % sd.lower()])].mean(0)[None])[0] for sd in 'LR'}
# the blends between differently moved parts (shoulder, hip, wrist, ankle) are relaxed a little
mix = 1 - sum(w ** 2 for w in W.values()); soft = sstep(mix / 0.5)[:, None] * 0.5
for _ in range(4): X = X * (1 - soft) + nmean(X) * soft
foot = (W['foot_L'] + W['toe_L'] + W['foot_R'] + W['toe_R']) > 0.5
X[:, 2] -= X[foot, 2].min()
print('posed: height %.3f, widths: shoulders %.3f, waist %.3f, hips %.3f' % (X[:, 2].max(), *[2 * np.abs(X[(np.abs(X[:, 2] - z) < 0.01) & (W['chest'] + W['spine'] + W['pelvis'] > 0.6), 0]).max() for z in (1.36, 1.12, 0.93)]))

# ---------------- the face: sockets closed (her eyes are drawn), soft relief, a narrow jaw
head = W['head'] > 0.5; N = X
front = head & (N[:, 1] < np.percentile(N[head, 1], 45))
CHIN = float(N[head & (np.abs(N[:, 0]) < 0.004) & (N[:, 1] < np.median(N[head, 1])), 2].min()); TOP = float(N[head, 2].max())
from mathutils import Vector
from mathutils.bvhtree import BVHTree
bvh = BVHTree.FromPolygons([Vector(v) for v in N], [tuple(map(int, f)) for f in F])
# One closed, smooth face: the front surface of the head is read as a depth map, every narrow hollow in it (the eye
# sockets, the mouth, the nostrils) is filled by a grey opening, and whatever lies behind the filled surface is laid
# onto it. The pockets of the base mesh end up folded flat under the skin; topology and weights stay as they are.
eye_zm0 = 0.5 * (EYE['L'][2] + EYE['R'][2])
G = 0.0015; gx = np.arange(-0.085, 0.0851, G); gz = np.arange(CHIN - 0.004, TOP, G); DEP = np.full((len(gz), len(gx)), np.nan)
ymid = float(0.5 * (N[head, 1].min() + N[head, 1].max()))
for j, z_ in enumerate(gz):
    for i, x_ in enumerate(gx):
        loc = bvh.ray_cast(Vector((x_, -0.5, z_)), Vector((0, 1, 0)), 1.0)[0]
        if loc is not None and loc.y < ymid: DEP[j, i] = loc.y
def morph(a, r, fn):
    out = a.copy(); R = int(round(r / G))
    for dj in range(-R, R + 1):
        for di in range(-R, R + 1):
            if dj * dj + di * di > R * R: continue
            sh_ = np.full_like(a, np.nan); sj = slice(max(dj, 0), a.shape[0] + min(dj, 0)); tj = slice(max(-dj, 0), a.shape[0] + min(-dj, 0))
            si = slice(max(di, 0), a.shape[1] + min(di, 0)); ti = slice(max(-di, 0), a.shape[1] + min(-di, 0)); sh_[tj, ti] = a[sj, si]
            out = fn(out, sh_)
    return out
ENV = morph(morph(DEP, 0.010, np.fmin), 0.010, np.fmax)
whole = morph(np.isnan(DEP).astype(float), 0.021, np.fmax) < 0.5        # only where the whole neighbourhood is face: no effect at the outline
ENV = np.where(whole, ENV, DEP)
def blur(a, n):
    for _ in range(n): a = np.nanmean(np.stack([a, np.roll(a, 1, 0), np.roll(a, -1, 0), np.roll(a, 1, 1), np.roll(a, -1, 1)]), 0)
    return a
ENV = blur(ENV, 3); BASE = blur(ENV, 420)             # BASE: the face without its relief (nose, lips, brow)
fi = np.clip(((N[:, 0] - gx[0]) / G).round().astype(int), 0, len(gx) - 1); fj = np.clip(((N[:, 2] - gz[0]) / G).round().astype(int), 0, len(gz) - 1)
env_v = ENV[fj, fi]; inwin = head & (np.abs(N[:, 0]) < 0.062) & (N[:, 2] > CHIN + 0.016) & ~np.isnan(env_v) & whole[fj, fi] & (N[:, 1] < ymid + 0.01)
hidden = np.array([inwin[i] and N[i, 1] < env_v[i] + 0.03 and bvh.ray_cast(Vector(N[i]) + Vector((0, -3e-4, 0)), Vector((0, -1, 0)), 0.2)[0] is not None for i in range(NB)])
DEPTH = np.where(inwin, N[:, 1] - env_v, 0); low = inwin & (DEPTH > 0.0006)
N[low | hidden, 1] = env_v[low | hidden]
print('face closed: %d vertices laid onto the filled surface, %d kept under the skin' % (int(low.sum()), int((inwin & hidden).sum())))
# an anime-leaning face: the nose, the lips and the brow keep 55 % of their relief
fall = sstep((0.055 - np.abs(N[:, 0])) / 0.02)
mz_ = float(0.5 * (N[rig['oris05']['head']['vertex_index'], 2] + N[rig['oris01']['head']['vertex_index'], 2]))
BASE2 = blur(ENV, 110)                                 # below the eyes the face is one smooth egg with a small nose on it
wz = sstep((eye_zm0 - 0.012 - N[:, 2]) / 0.012)
keep = 0.62 * np.exp(-(N[:, 0] / 0.013) ** 2) * sstep((N[:, 2] - (mz_ + 0.010)) / 0.008)
N[inwin, 1] -= (fall * ((1 - wz) * 0.45 * (env_v - BASE[fj, fi]) + wz * (1 - keep) * (env_v - BASE2[fj, fi])))[inwin]
socket = np.zeros(NB, bool)
for sd in 'LR':
    c = EYE[sd]; socket |= inwin & (np.hypot((N[:, 0] - c[0]) / 0.0285, (N[:, 2] - c[2]) / 0.0200) < 1)
band = socket.copy()
for _ in range(4):
    grow = band.copy(); grow[E0[band[E1]]] = True; grow[E1[band[E0]]] = True; band = grow & inwin
for _ in range(90):                                   # no lid crease: the drawn eye lies on a smooth surface
    m = nmean(N); N[band, 1] = N[band, 1] * 0.5 + m[band, 1] * 0.5
sf = front & inwin
for _ in range(8):
    m = nmean(N); N[sf] = N[sf] * 0.6 + m[sf] * 0.4
lips = inwin & (np.abs(N[:, 0]) < 0.034) & (np.abs(N[:, 2] - mz_) < 0.024)
for _ in range(30):                                   # small, quiet lips
    m = nmean(N); N[lips, 1] = N[lips, 1] * 0.5 + m[lips, 1] * 0.5
g2 = lambda cz, sz, sx: np.exp(-0.5 * ((N[:, 2] - cz) / sz) ** 2 - 0.5 * (N[:, 0] / sx) ** 2)
prof_w = np.where(inwin | (head & (N[:, 1] < ymid) & (np.abs(N[:, 0]) < 0.06)), 1.0, 0.0)
N[:, 1] += prof_w * (-0.0015 * g2(CHIN + 0.012, 0.010, 0.020))      # a quiet profile: lips in, chin out
side = head & (N[:, 1] < ymid) & (np.abs(N[:, 0]) > 0.04) & (np.abs(N[:, 0]) < 0.085) & (N[:, 2] < eye_zm0 - 0.012) & (N[:, 2] > CHIN - 0.01)
for _ in range(14):                                   # cheeks and jaw: one even surface
    m = nmean(N); N[side] = N[side] * 0.5 + m[side] * 0.5
lowf = head & (N[:, 1] < ymid) & (np.abs(N[:, 0]) < 0.07) & (N[:, 2] < eye_zm0 - 0.02) & (N[:, 2] > CHIN + 0.004) & ~((np.abs(N[:, 0]) < 0.015) & (N[:, 2] > mz_ + 0.012))
lowf &= ~(hidden | low) & ~((np.abs(N[:, 0]) < 0.03) & (np.abs(N[:, 2] - mz_) < 0.009))
for _ in range(5):                                    # no folds from the mouth corners to the chin
    m = nmean(N); N[lowf, 1] = N[lowf, 1] * 0.5 + m[lowf, 1] * 0.5
KILL = hidden | (low & (DEPTH > 0.004))             # the pockets themselves: cut out below, the openings are patched
eye_zm = 0.5 * (EYE['L'][2] + EYE['R'][2])
t = sstep((eye_zm - 0.02 - N[:, 2]) / (eye_zm - 0.02 - CHIN))                       # 0 at the cheeks, 1 at the chin
jaw = head & (N[:, 1] < np.percentile(N[head, 1], 70))
N[jaw, 0] *= (1 - 0.22 * t[jaw] ** 1.3)

# ---------------- the mesh, its weights and her skeleton
import bmesh
me = bpy.data.meshes.new('elise_body'); me.from_pydata(X.tolist(), [], F.tolist()); me.update()
ob = bpy.data.objects.new('elise_body', me); bpy.context.scene.collection.objects.link(ob)
for k, w in W.items():
    vg = ob.vertex_groups.new(name=k)
    for i in np.nonzero(w > 1e-4)[0]: vg.add([int(i)], float(w[i]), 'REPLACE')
torso_w = W['pelvis'] + W['spine'] + W['chest'] + W['thigh_L'] + W['thigh_R']
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
L_head = bm.verts.layers.int.new('is_head'); L_sock = bm.verts.layers.int.new('is_socket'); L_tw = bm.verts.layers.float.new('torso_w')
for v in bm.verts: v[L_head] = int(head[v.index]); v[L_sock] = int(socket[v.index]); v[L_tw] = float(torso_w[v.index])
dead = [f for f in bm.faces if any(KILL[v.index] for v in f.verts)]
bmesh.ops.delete(bm, geom=dead, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
seen = set(); comps = []                                # what is left of a cut pocket inside the head goes too
for v in bm.verts:
    if v in seen: continue
    comp = {v}; st = [v]
    while st:
        for e_ in st.pop().link_edges:
            for o in e_.verts:
                if o not in comp: comp.add(o); st.append(o)
    seen |= comp; comps.append(comp)
comps.sort(key=len, reverse=True)
bmesh.ops.delete(bm, geom=[v for c_ in comps[1:] for v in c_], context='VERTS'); print('loose pocket pieces removed:', [len(c_) for c_ in comps[1:]])
rim = [e_ for e_ in bm.edges if e_.is_boundary]; patch = {v for e_ in rim for v in e_.verts}
res = bmesh.ops.holes_fill(bm, edges=rim, sides=0)
bmesh.ops.triangulate(bm, faces=res['faces'], quad_method='BEAUTY', ngon_method='BEAUTY')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bm.faces.ensure_lookup_table(); bm.normal_update()
for f in bm.faces:
    if len(f.verts) == 3 and all(v in patch for v in f.verts) and f.normal.y > 0: f.normal_flip()
for _ in range(12):                                   # the rims of the patched openings settle into the skin
    new = {v: sum((e_.other_vert(v).co.y for e_ in v.link_edges), 0.0) / len(v.link_edges) for v in patch}
    for v, y_ in new.items(): v.co.y = 0.5 * v.co.y + 0.5 * y_
print('pockets cut: %d faces, openings patched with %d faces; open edges left: %d' % (len(dead), len(res['faces']), sum(e_.is_boundary for e_ in bm.edges)))
for f in bm.faces: f.smooth = True
arm = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
for k, v in SK.items():
    b = arm.edit_bones.new(k); b.head = v['head']; b.tail = v['tail']
for k, v in SK.items():
    if v['parent']: arm.edit_bones[k].parent = arm.edit_bones[v['parent']]
bpy.ops.object.mode_set(mode='OBJECT')
ob.parent = ao; ob.modifiers.new('rig', 'ARMATURE').object = ao

# ---------------- the drawn face and the review paint (skin one flat colour; a plain base layer for the review sheet)
mid_x = 0.5 * (EYE['L'][0] + EYE['R'][0]); eye_z = eye_zm - 0.002; eye_dx = 0.5 * abs(EYE['L'][0] - EYE['R'][0]) - 0.0015
prof = N[head & (np.abs(N[:, 0] - mid_x) < 0.006)]; prof = prof[(prof[:, 2] < eye_z - 0.01) & (prof[:, 1] < np.median(N[head, 1]))]
mouth_z = float(0.5 * (N[rig['oris05']['head']['vertex_index'], 2] + N[rig['oris01']['head']['vertex_index'], 2]))      # between the lips
prof = prof[prof[:, 2] > mouth_z + 0.014]; nose_tip = prof[prof[:, 1].argmin()]
print('face: eyes z %.3f, +-%.3f; nose tip z %.3f; mouth z %.3f; chin %.3f; top %.3f' % (eye_z, eye_dx, nose_tip[2], mouth_z, CHIN, TOP))
art, (ax0, az1, S_) = face_art.draw(mid_x, eye_z, eye_dx, nose_tip, mouth_z); AW, AH = art.size
art.save(WD + '/face.png')
uvl = bm.loops.layers.uv.new('UVMap'); wear = []
for f in bm.faces:
    P = np.array([v.co[:] for v in f.verts]); c_ = P.mean(0)
    xs = (P[:, 0] - ax0) * S_ / AW; ys = 1 - (az1 - P[:, 2]) * S_ / AH
    inw = all(v[L_head] for v in f.verts) and (f.normal.y < -0.2 or any(v[L_sock] for v in f.verts)) and c_[1] < ymid and xs.min() > 0.02 and xs.max() < 0.98 and ys.min() > 0.02 and ys.max() < 0.98
    for k_, lp in enumerate(f.loops): lp[uvl].uv = (float(xs[k_]), float(ys[k_])) if inw else (0.004, 0.004)
    if min(v[L_tw] for v in f.verts) > 0.5 and (1.235 < c_[2] < 1.345 and abs(c_[0]) < 0.19 or 0.865 < c_[2] < 0.985): wear.append(f.index)
bm.to_mesh(me); bm.free(); me.update()
img = bpy.data.images.load(WD + '/face.png'); img.pack()
mat = bpy.data.materials.new('elise_skin'); mat.use_nodes = True; nt = mat.node_tree; bs = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; nt.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
me.materials.append(mat)
ob['eye_z'] = float(eye_z); ob['chin_z'] = float(CHIN); ob['top_z'] = float(TOP)
bpy.ops.wm.save_as_mainfile(filepath=WD + '/body.blend')

# ---------------- review sheets (the base layer exists only in these pictures)
wm = bpy.data.materials.new('review_wear'); wm.use_nodes = True
wimg = bpy.data.images.new('wear', 4, 4); wimg.generated_color = (0.03, 0.03, 0.04, 1)
wt = wm.node_tree.nodes.new('ShaderNodeTexImage'); wt.image = wimg; wm.node_tree.links.new(wt.outputs['Color'], wm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
me.materials.append(wm)
bm = bmesh.new(); bm.from_mesh(me); tw_l = bm.verts.layers.float['torso_w']
for z_ in (1.218, 1.352, 0.862, 0.988):               # straight edges for the base layer
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z_), plane_no=(0, 0, 1), dist=1e-5)
for f in bm.faces:
    c_ = f.calc_center_median()
    if min(v[tw_l] for v in f.verts) > 0.3 and abs(c_.x) < 0.2 and (1.218 < c_.z < 1.352 or 0.862 < c_.z < 0.988): f.material_index = 1
bm.to_mesh(me); bm.free()
os.makedirs(WD + '/r', exist_ok=True); hzc = 0.5 * (CHIN + TOP)
VIEWS = [[('front', [0, 0, 0.88, 1.9, 0, 0], 560, 1000), ('three quarter', [0, 0, 0.88, 1.9, 35, 5], 560, 1000), ('side', [0, 0, 0.88, 1.9, 90, 0], 560, 1000), ('back', [0, 0, 0.88, 1.9, 180, 0], 560, 1000)],
         [('face', [0, 0, hzc, 0.30, 0, 0], 746, 746), ('face three quarter', [0, 0, hzc, 0.30, 35, 0], 746, 746), ('face side', [0, 0, hzc, 0.30, 90, 0], 748, 746)]]
from PIL import Image
def sheet(name, shaded=True):
    """Flat colours with a soft form shade (the flat render times the brightness of a studio render of the same view)."""
    rows = []
    for row in VIEWS:
        out = []
        for n, v, w, h in row:
            f = WD + '/r/_%s.png' % n
            for o in list(bpy.data.objects):
                if o.name == 'shotcam': bpy.data.objects.remove(o)
            cam = rend.setup(True, bg=(0.86, 0.86, 0.88)); rend.shot(cam, f, v, w, h); flat = np.asarray(Image.open(f).convert('RGB'), float)
            if shaded:
                bpy.data.objects.remove(cam); cam = rend.setup(False, bg=(0.86, 0.86, 0.88)); bpy.context.scene.display.shading.show_cavity = False
                rend.shot(cam, f, v, w, h); g_ = np.asarray(Image.open(f).convert('L'), float) / 205.0
                flat = flat * (0.62 + 0.38 * np.clip(g_, 0, 1) ** 1.5)[:, :, None]
            Image.fromarray(flat.clip(0, 255).astype(np.uint8)).save(f); out.append((n, f))
        rows.append(out)
    rend.montage(rows, WD + '/r/' + name, bg=(219, 219, 224))
sheet('a1.jpg')
