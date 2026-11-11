"""Elise stage B: Blender build from the cut parts (a3_parts.py): procedural hands and ribbon tails, the gown below
the hips as a clean loft (closed hem, side slit), her own armature (Iris's bone names and hierarchy, her proportions),
weights (bone heat on the torso and arms, analytic on the gown and legs), face patches, UVs. Saves elise_build.blend
and bake_in.npz for the texture bake.   blender -b -P b_build.py -- <work dir>"""
import bpy, bmesh, sys, json, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import ezones as Z
a = sys.argv[sys.argv.index("--") + 1:]; WD = a[0]; LOD = float(a[1]) if len(a) > 1 else 1.0
bpy.ops.wm.read_factory_settings(use_empty=True)
P = json.load(open(WD + '/parts.json'))
ramp = lambda x, a_, b_: np.clip((np.asarray(x) - a_) / (b_ - a_), 0, 1)
unit = lambda v: np.asarray(v, float) / np.linalg.norm(v)
GZ = [0.5, 0.858, 0.963, 1.068, 1.208, 1.25]; GX = [0.2, 0.2, 0.206, 0.162, 0.11, 0.108]

def read_ply(path):
    bpy.ops.wm.ply_import(filepath=path); o = bpy.context.selected_objects[0]; me = o.data
    V = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', V)
    F = np.empty(len(me.polygons) * 3, int); me.polygons.foreach_get('vertices', F)
    bpy.data.objects.remove(o); return V.reshape(-1, 3), F.reshape(-1, 3)

# ---------------- procedural pieces
class Geo:
    def __init__(self): self.v, self.f, self.g = [], [], []          # verts, faces, per-vertex {group: weight}
    def ring(self, c, u, v, w, h, n, g):
        i0 = len(self.v)
        for k in range(n):
            t = 2 * math.pi * k / n; self.v.append(np.asarray(c) + np.asarray(u) * w * math.cos(t) + np.asarray(v) * h * math.sin(t)); self.g.append(dict(g))
        return list(range(i0, i0 + n))
    def bridge(self, r0, r1):
        n = len(r0)
        for k in range(n): self.f.append((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
    def cap(self, r, g, push=None):
        c = np.mean([self.v[i] for i in r], 0) + (0 if push is None else np.asarray(push)); self.v.append(c); self.g.append(dict(g)); i = len(self.v) - 1
        for k in range(len(r)): self.f.append((r[k], r[(k + 1) % len(r)], i))

def hand(side):
    """Canonical hand: X thumb side, Y along the fingers, Z back of the hand; metres. Returns Geo and bone points."""
    G = Geo(); X, Y, Z = np.eye(3); H = 'hand_' + side
    prof = [(-0.012, 0.029, 0.029), (0.004, 0.027, 0.019), (0.025, 0.034, 0.015), (0.06, 0.040, 0.0125), (0.086, 0.039, 0.0105)]
    rs = [G.ring((0.002 if y > 0.01 else 0, y, 0), X, Z, w, h, 10, {H: 1}) for y, w, h in prof]
    for r0, r1 in zip(rs, rs[1:]): G.bridge(r0, r1)
    G.cap(rs[0], {H: 1}); G.cap(rs[-1], {H: 1})
    bones = {H: ((0, 0, 0), (0, 0.07, 0)), 'prop_' + side: ((0, 0.06, -0.02), (0, 0.11, -0.02))}
    def finger(base, d0, length, r, curls, grp, n=6):
        p = np.array(base, float); d = unit(d0); ax = unit(np.cross(d, Z)) if abs(d @ X) < 0.9 else Y
        ax = unit(np.cross(Z, d)); ax = ax if ax @ X > 0 else -ax       # hinge axis, about which the finger curls to the palm
        seg = np.array([0.45, 0.30, 0.25]) * length; prev = None
        for k in range(4):
            rr = r * (1 - 0.22 * k / 3); v = unit(np.cross(ax, d))
            ring = G.ring(p - d * (0.004 if k == 0 else 0), ax, v, rr * 1.05, rr * 0.92, n, {grp: 1.0} if k else {grp: 0.5, H: 0.5})
            if prev: G.bridge(prev, ring)
            prev = ring
            if k < 3:
                p = p + d * seg[k]; c = math.radians(curls[k]); d = unit(d * math.cos(c) + np.cross(ax, d) * math.sin(c) * (1 if np.cross(ax, d) @ Z < 0 else -1))
        G.cap(prev, {grp: 1}, push=d * r * 0.5)
        return np.array(base, float), p
    kn = [(0.027, 0.084, 0.001, 0.068, 'index_' + side), (0.009, 0.088, 0.002, 0.076, 'fingers_' + side), (-0.009, 0.086, 0.001, 0.070, 'fingers_' + side), (-0.026, 0.080, -0.001, 0.055, 'fingers_' + side)]
    for i, (x, y, z, L, grp) in enumerate(kn):
        b, t = finger((x, y, z), (0.06 * (1.5 - i), 1, -0.14), L, 0.0080 - 0.0004 * i, (14 + 3 * i, 20 + 3 * i, 14), grp)
        if i == 0: bones['index_' + side] = (b, b + unit(t - b) * 0.04)
        if i == 1: bones['fingers_' + side] = (b - np.array([0.013, 0.002, 0]), b - np.array([0.013, 0.002, 0]) + unit(t - b) * 0.04)
    b, t = finger((0.031, 0.022, -0.008), (0.62, 0.72, -0.32), 0.058, 0.0095, (10, 16, 0), 'thumb_' + side, 6)
    bones['thumb_' + side] = (b, b + unit(t - b) * 0.035)
    return G, bones

def ribbons(side, top, sg):
    """Two flat tails hanging from the wrist wrap (thin boxes, faces to the front and back)."""
    G = Geo(); R0, R1 = f'ribbon_{side}_0', f'ribbon_{side}_1'
    for k, (L, w, dx, dy) in enumerate(((0.30, 0.013, 0.0, -0.006), (0.235, 0.012, 0.012, 0.007))):
        prev = None; n = 7
        for i in range(n + 1):
            t = i / n; z = -L * t
            c = np.array(top) + [sg * (dx + 0.022 * t + 0.004 * math.sin(5 * t + k)), dy + 0.006 * math.sin(4 * t + 2 * k), z]
            ww = w * (1 + 0.25 * t); g1 = float(ramp(L * t, 0.10, 0.19)); g = {R0: 1 - g1, R1: g1} if i else {'forearm_' + side: 1}
            i0 = len(G.v); G.v += [c + [-ww, -0.0012, 0], c + [ww, -0.0012, 0], c + [ww, 0.0012, 0], c + [-ww, 0.0012, 0]]; G.g += [dict(g) for _ in range(4)]
            ring = list(range(i0, i0 + 4))
            if prev: G.bridge(prev, ring)
            else: G.f.append(tuple(ring))
            prev = ring
        G.f.append(tuple(prev))
    return G

def make_obj(name, V, F):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in V], [], [tuple(map(int, f)) for f in F]); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o
def recalc(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
def set_weights(o, W):
    for name, w in W.items():
        idx = np.nonzero(w > 0.004)[0]
        if not len(idx): continue
        vg = o.vertex_groups.new(name=name)
        for i in idx: vg.add([int(i)], float(w[i]), 'REPLACE')
def smooth_w(W, F, n_v, it, lock=None):
    names = list(W); M = np.stack([W[k] for k in names], 1)
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]])
    for _ in range(it):
        acc = np.zeros_like(M); cnt = np.zeros(n_v); np.add.at(acc, e[:, 0], M[e[:, 1]]); np.add.at(cnt, e[:, 0], 1)
        N = 0.5 * M + 0.5 * acc / np.maximum(cnt, 1)[:, None]
        if lock is not None: N[lock] = M[lock]
        M = N
    M /= np.maximum(M.sum(1, keepdims=True), 1e-9)
    return {k: M[:, i] for i, k in enumerate(names)}

# ---------------- joints
J = {}
KZ = 0.49
for sd, sg in (('L', 1), ('R', -1)):
    A = P['arm'][sd]; ax = np.array(P['leg'][sd]['axis']); at = lambda z: np.array([np.interp(z, ax[:, 0], ax[:, 1]), np.interp(z, ax[:, 0], ax[:, 2]), z])
    J['S' + sd], J['E' + sd], J['W' + sd] = np.array(A['shoulder']), np.array(A['elbow']), np.array(A['wrist'])
    J['hip' + sd] = np.array([sg * 0.085, 0.0, 0.93]); J['knee' + sd] = at(KZ); J['ank' + sd] = at(0.125) * [1, 1, 0] + [0, 0, 0.108]
    sl, sh = np.array(P['leg'][sd]['shoe_lo']), np.array(P['leg'][sd]['shoe_hi'])
    J['ball' + sd] = np.array([J['ank' + sd][0], sl[1] + 0.045, 0.02]); J['tip' + sd] = np.array([J['ank' + sd][0], sl[1], 0.012])
print({k: np.round(v, 3).tolist() for k, v in J.items()})

# ---------------- meshes
hv, hf = read_ply(WD + '/head_dec.ply')
bd = np.load(WD + '/body_dec.npz'); bv, bf, bpart = bd['V'], bd['F'], bd['part']
# body shell: cut at the hips (the gown below is rebuilt), the lacing relief smoothed
bm = bmesh.new(); vs = [bm.verts.new(tuple(map(float, p))) for p in bv]; LP = bm.faces.layers.int.new('part')
for f, p in zip(bf, bpart[bf].max(1)):
    try: fc = bm.faces.new([vs[i] for i in f])
    except ValueError: continue
    fc[LP] = {2: 4, 3: 5}.get(int(p), 0)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[LP] == 4 and min(v.co.z for v in f.verts) > 0.15], context='FACES')   # the left leg above the ankle is rebuilt clean below (the generated shell was tangled)
shell = [f for f in bm.faces if f[LP] == 0]
bmesh.ops.bisect_plane(bm, geom=shell + list({e for f in shell for e in f.edges}) + list({v for f in shell for v in f.verts}), dist=1e-5,
                       plane_co=(0, 0, Z.ZJ), plane_no=(0, 0, 1), clear_inner=True, clear_outer=False)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
def zone_w(v):
    th = float(Z.ang(v.co.x, v.co.y)); return max(0.0, min(1, (v.co.z - 0.80) / 0.03, (1.0 - v.co.z) / 0.04, (th - 12) / 12, (104 - th) / 12))
zone = [(v, zone_w(v)) for v in bm.verts if 0.80 < v.co.z < 1.0 and math.hypot(v.co.x, v.co.y) < 0.215 and not v.is_boundary and all(f[LP] == 0 for f in v.link_faces)]
zone = [(v, w) for v, w in zone if w > 0]
for _ in range(10):
    new = [v.co.lerp(sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges), 0.6 * w) for v, w in zone]
    for (v, w), c in zip(zone, new): v.co = c
for pid in (4, 5):                    # the generated legs and shoes: every open rim is filled, each leg is a closed mesh
    rim = [e for e in bm.edges if e.is_boundary and e.link_faces[0][LP] == pid]
    if rim:
        for f in bmesh.ops.holes_fill(bm, edges=rim, sides=0)['faces']: f[LP] = pid
    print('leg part', pid, 'open rim edges closed', len(rim))
bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.verts.index_update()
bv = np.array([v.co[:] for v in bm.verts]); bf = np.array([[v.index for v in f.verts] for f in bm.faces]); bfp = np.array([f[LP] for f in bm.faces]); bm.free()
nohull = np.zeros(len(bf), np.int32)
vleg = np.zeros(len(bv), int); vleg[bf[bfp == 4].ravel()] = 4; vleg[bf[bfp == 5].ravel()] = 5
print('shell', len(bv), 'verts', np.bincount(bfp).tolist(), 'faces by part; lacing zone verts smoothed', len(zone))
ENV = Z.envelope(np.load(WD + '/body_hi_pts.npy').astype(float), bv[(vleg >= 4) & (bv[:, 2] > 0.1)], bv[(vleg == 0) & (bv[:, 2] < 0.82)]); renv = lambda th, z: Z.env_at(ENV, th, z)
print('gown radius at 0.8 / 0.5 / 0.1: %.3f %.3f %.3f (mean), min clearance over the leg rows ok' % (ENV[80].mean(), ENV[50].mean(), ENV[10].mean()))
objs = {}
objs['head'] = make_obj('elise_head', hv, hf); objs['body'] = make_obj('elise_body', bv, bf)
def outward(o, V):
    """Faces of a tube around the body axis: wind them to face away from it."""
    me = o.data; flip = sum(1 for p in me.polygons if p.normal.x * p.center.x + p.normal.y * p.center.y < 0) > len(me.polygons) / 2
    if flip:
        b_ = bmesh.new(); b_.from_mesh(me); bmesh.ops.reverse_faces(b_, faces=b_.faces[:]); b_.to_mesh(me); b_.free()
g2 = lambda p: np.stack([np.asarray(p, float)[..., 0], np.asarray(p, float)[..., 2], -np.asarray(p, float)[..., 1]], -1)
def seg_d(p, a_, b_):
    ab = b_ - a_; t = np.clip(((p - a_) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a_ + t[:, None] * ab), axis=1), t
# leg capsules (thigh from the crotch down, shin, foot, heel), fitted to the generated legs; the gown is built clear of them
caps = []
for sd, pid in (('L', 4), ('R', 5)):
    pts = bv[vleg == pid]; pts = pts[pts[:, 2] < 0.72]; heel = pts[(pts[:, 2] < 0.012) & (pts[:, 1] > J['ank' + sd][1] - 0.01)]
    hb = heel.mean(0) if len(heel) else J['ank' + sd] * [1, 1, 0] + [0, 0.03, 0.005]
    top = np.array([float(v) for v in Z.leg_axis(P, sd, 0.66)[:2]] + [0.66])        # the capsules follow the leg's own axis and start where the leg leaves the hips (the crotch); above it the hips are skin-tight and skinned
    segs = [('thigh_' + sd, top, J['knee' + sd]), ('shin_' + sd, J['knee' + sd], J['ank' + sd]), ('foot_' + sd, J['ank' + sd] + [0, 0, -0.03], J['tip' + sd] + [0, 0.03, 0.02]), ('foot_' + sd, J['ank' + sd] + [0, 0, -0.03], hb + [0, 0, 0.02])]
    D = np.stack([seg_d(pts, a_, b_)[0] for _, a_, b_ in segs], 1); own = D.argmin(1)
    for q, (bn, a_, b_) in enumerate(segs):
        d_, t_ = seg_d(pts[own == q], a_, b_); pc = lambda v: float(np.percentile(v, 98)) if len(v) else float(np.percentile(d_, 98)); lo = pc(d_[t_ < 0.4]); hi = pc(d_[t_ > 0.6])
        r0 = pc(d_ - (hi - lo) * t_) + 0.002; caps.append((bn, a_, b_, r0, r0 + hi - lo, 0)); print('capsule', bn, np.round(a_, 3), np.round(b_, 3), 'radii %.3f %.3f' % (r0, r0 + hi - lo), 'verts', int((own == q).sum()))
def leg_sd(p):
    """Signed distance of points to the nearest leg capsule."""
    out = np.full(len(p), 9.0)
    for bn, a_, b_, r0, r1, st in caps:
        d_, t_ = seg_d(p, a_, b_); out = np.minimum(out, d_ - (r0 + (r1 - r0) * t_))
    return out
# the gown from the hips to the floor: a clean grid on the outer envelope, open along the slit, with a turned-in lip
# along the hem and the slit edges (a closed edge with thickness)
NU, NV = Z.NU, Z.NV; LV = []; gi = np.zeros((NV + 1, NU + 1), int)
for j in range(NV + 1):
    for i in range(NU + 1):
        u = i / NU; thl = 114.0 + u * (360 - 108.0); zh = 0.045 + 0.008 * math.cos(math.radians(thl)); z = Z.ZT + (zh - Z.ZT) * j / NV
        t1, t2 = (float(v) for v in Z.gown_slit(z)); th = math.radians(t2 + u * (360 - (t2 - t1))); r = float(renv(math.degrees(th), z)) + 0.002 * min(1, max(0, (z - 0.74) / 0.06)) + float(Z.gown_ease(math.degrees(th), z))
        while leg_sd(np.array([[r * math.sin(th), -r * math.cos(th), z]]))[0] < 0.014: r += 0.003      # never closer than 1.4 cm to a leg capsule at rest
        gi[j, i] = len(LV); LV.append((r * math.sin(th), -r * math.cos(th), z))
LF = [(gi[j, i], gi[j + 1, i], gi[j + 1, i + 1], gi[j, i + 1]) for j in range(NV) for i in range(NU)]
inn = {}
for j in range(NV + 1):
    for i in range(NU + 1):
        if j >= NV - 1 or i <= 1 or i >= NU - 1:
            p = np.array(LV[gi[j, i]]); rad = np.array([p[0], p[1], 0]) / math.hypot(p[0], p[1]); inn[gi[j, i]] = len(LV); LV.append(tuple(p - 0.003 * rad))
rim = [(gi[NV, i], gi[NV, i + 1]) for i in range(NU)] + [(gi[j + 1, 0], gi[j, 0]) for j in range(NV)] + [(gi[j, NU], gi[j + 1, NU]) for j in range(NV)]
LF += [(a_, b_, inn[b_], inn[a_]) for a_, b_ in rim]
LF += [(inn[gi[j, i]], inn[gi[j, i + 1]], inn[gi[j + 1, i + 1]], inn[gi[j + 1, i]]) for j in range(NV) for i in range(NU) if j == NV - 1 or i == 0 or i == NU - 1]
LV = np.array(LV); objs['loft'] = make_obj('elise_gown', LV, LF); recalc(objs['loft']); outward(objs['loft'], LV)
# both thighs continue up from the generated legs (they stop at 0.70) and are closed on top: each leg is its own closed mesh
NS = 16; tz = [0.66, 0.70, 0.735, 0.77, 0.80, 0.835]; TVs = {}
for sd in 'LR':
    TV, TF = [], []
    for k, z in enumerate(tz):
        ax, ay, ar = (float(v) for v in Z.leg_axis(P, sd, z)); ar *= 1.04 - 0.04 * min(1, max(0, (z - 0.70) / 0.07)); t1, t2 = Z.slit(z)   # the lower rings sleeve the ragged top of the generated leg
        for i in range(NS):
            t = 2 * math.pi * i / NS; p = np.array([ax + ar * math.sin(t), ay - ar * math.cos(t)]); r = math.hypot(*p); th = float(Z.ang(p[0], p[1])); rm = float(renv(th, z)) - 0.012
            if r > rm and not (sd == 'L' and t1 - 10 < th < t2 + 10): p *= rm / r          # kept under the hip shell, free where the laced opening shows it
            TV.append((p[0], p[1], z))
        if k: TF += [((k - 1) * NS + i, (k - 1) * NS + (i + 1) % NS, k * NS + (i + 1) % NS, k * NS + i) for i in range(NS)]
    top = np.mean(TV[-NS:], 0) + [0, 0, 0.012]; TV.append(tuple(top)); TF += [((len(tz) - 1) * NS + i, (len(tz) - 1) * NS + (i + 1) % NS, len(TV) - 1) for i in range(NS)]
    TVs[sd] = np.array(TV); objs['thigh' + sd] = make_obj('elise_thigh_' + sd, TVs[sd], TF); recalc(objs['thigh' + sd])
# face patches: grids laid on the face skin (found from the front, behind the fringe)
bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in hv], [tuple(map(int, f)) for f in hf])
def face_y(x, z):
    o = Vector((x, -0.3, z)); d = Vector((0, 1, 0)); best = None
    for _ in range(60):
        loc, nor, fi, dist = bvh.ray_cast(o, d)
        if loc is None or loc.y > 0.0: break
        if nor.y < -0.15: best = loc.y
        o = loc + d * 1e-4
    return best
PV, PF, PP = [], [], []
for k, name in enumerate(Z.PATCHES):
    cx, cz, hw, zlo, zhi, nx, nz, h = Z.patch_geo(name)
    ys = np.array([[face_y(cx - hw + 2 * hw * i / nx, cz + zlo + (zhi - zlo) * j / nz) or np.nan for i in range(nx + 1)] for j in range(nz + 1)])
    med = np.nanmedian(ys); ys[np.isnan(ys) | (abs(ys - med) > 0.025)] = med; b0 = len(PV)
    for j in range(nz + 1):
        for i in range(nx + 1): PV.append((cx - hw + 2 * hw * i / nx, ys[j, i] - h, cz + zlo + (zhi - zlo) * j / nz))
    g = lambda i, j: b0 + j * (nx + 1) + i
    for j in range(nz):
        for i in range(nx): PF += [(g(i, j), g(i + 1, j), g(i + 1, j + 1)), (g(i, j), g(i + 1, j + 1), g(i, j + 1))]; PP += [Z.PART0 + k] * 2
    print('patch', name, 'skin y at the centre %.4f, range %.4f %.4f' % (ys[nz // 2, nx // 2], ys.min(), ys.max()))
PV = np.array(PV); objs['patch'] = make_obj('elise_face', PV, PF)
bones_extra = {}
for sd, sg in (('L', 1), ('R', -1)):
    G, hb = hand(sd)
    d = unit(J['W' + sd] - J['E' + sd]); t = unit(np.array([0, -1, 0]) - d * (-d[1])); o = np.cross(t, d) * sg
    M = np.stack([t, d, o], 1); T = lambda p: J['W' + sd] + M @ np.asarray(p, float)
    ob = make_obj('elise_hand_' + sd, [T(v) for v in G.v], G.f); recalc(ob)
    set_weights(ob, {k: np.array([g.get(k, 0) for g in G.g]) for k in {k for g in G.g for k in g}}); objs['hand' + sd] = ob
    for k, (h_, t_) in hb.items(): bones_extra[k] = (T(h_), T(t_), 'hand_' + sd if k != 'hand_' + sd else 'forearm_' + sd)
    top = np.array(P['arm'][sd]['wrap_mid']) + [sg * (P['arm'][sd]['radius'] - 0.004), 0.004, -0.012]
    # the hanging ribbon tails are not built (owner, fix pass 2): the wrist wraps stay, the ribbon bones stay in the skeleton
    bones_extra[f'ribbon_{sd}_0'] = (top, top + [sg * 0.008, 0, -0.14], 'forearm_' + sd); bones_extra[f'ribbon_{sd}_1'] = (top + [sg * 0.008, 0, -0.14], top + [sg * 0.018, 0, -0.28], f'ribbon_{sd}_0')

# ---------------- weights: head
V = hv; x, y, z = V[:, 0], V[:, 1], V[:, 2]; n = len(V); W = {}
rax = np.hypot(x, y - 0.002)
neck = (1 - ramp(z, 1.49, 1.54)) * (rax < 0.062)
strand = (z < 1.525) & (rax > 0.058) & (y < 0.04)
for sd, sg in (('L', 1), ('R', -1)):
    m = strand & (x * sg > 0)
    if m.sum() < 3: print('no strand', sd); continue
    zt = z[m].min(); top = V[m & (z > 1.50)].mean(0) if (m & (z > 1.50)).sum() else V[m].mean(0); bot = V[m & (z < zt + 0.02)].mean(0)
    zm = (1.525 + zt) / 2; mid = V[m & (abs(z - zm) < 0.012)].mean(0) if (m & (abs(z - zm) < 0.012)).sum() else (top + bot) / 2
    h0 = np.array([top[0], top[1], 1.575])
    bones_extra[f'hair_{sd}_0'] = (h0, mid, 'head'); bones_extra[f'hair_{sd}_1'] = (mid, bot, f'hair_{sd}_0')
    w = m * ramp(1.535 - z, 0, 0.04); w1 = ramp(mid[2] + 0.012 - z, 0, 0.03)
    W[f'hair_{sd}_0'] = w * (1 - w1); W[f'hair_{sd}_1'] = w * w1
    print('strand', sd, int(m.sum()), np.round(h0, 3), np.round(mid, 3), np.round(bot, 3))
hair = sum(W.values()) if W else 0
W['neck'] = neck * (1 - hair); W['head'] = (1 - neck) * (1 - hair)
W = smooth_w(W, hf, n, 2)
set_weights(objs['head'], W)

# ---------------- armature
arm = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name); b.head = Vector(tuple(map(float, head))); b.tail = Vector(tuple(map(float, tail)))
    if parent: b.parent = arm.edit_bones[parent]
    return b
bone('root', (0, 0, 0), (0, 0.25, 0))
bone('pelvis', (0, 0.0, 0.95), (0, 0.02, 1.03), 'root'); bone('spine', (0, 0.005, 1.03), (0, 0.012, 1.20), 'pelvis'); bone('chest', (0, 0.012, 1.20), (0, 0.012, 1.44), 'spine')
bone('neck', (0, 0.008, 1.465), (0, 0.012, 1.555), 'chest'); bone('head', (0, 0.012, 1.555), (0, 0.012, 1.74), 'neck')
for sd, sg in (('L', 1), ('R', -1)):
    bone('thigh_' + sd, J['hip' + sd], J['knee' + sd], 'pelvis'); bone('shin_' + sd, J['knee' + sd], J['ank' + sd], 'thigh_' + sd)
    bone('foot_' + sd, J['ank' + sd], J['ball' + sd], 'shin_' + sd); bone('toe_' + sd, J['ball' + sd], J['tip' + sd], 'foot_' + sd)
    bone('shoulder_' + sd, (sg * 0.022, 0.02, 1.405), J['S' + sd], 'chest'); bone('upperarm_' + sd, J['S' + sd], J['E' + sd], 'shoulder_' + sd)
    bone('forearm_' + sd, J['E' + sd], J['W' + sd], 'upperarm_' + sd)
for c, col in enumerate(Z.CH_COLS):          # the gown's bone grid: one chain per fifth column, hanging from the pelvis
    for k in range(len(Z.CH_ROWS) - 1):
        bone(Z.bone_name(c, k), LV[gi[Z.CH_ROWS[k], col]], LV[gi[Z.CH_ROWS[k + 1], col]], Z.bone_name(c, k - 1) if k else 'pelvis')
order = sorted(bones_extra, key=lambda k: (k.startswith(('thumb', 'index', 'fingers', 'prop')), k.endswith('_1')))
for k in order:
    h_, t_, par = bones_extra[k]; bone(k, h_, t_, par)
for b in arm.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT')
# ---------------- weights: body
V = bv; x, y, z = V[:, 0], V[:, 1], V[:, 2]; n = len(V); W = {}
def add(k, w): W[k] = W.get(k, np.zeros(n)) + w
shm = vleg == 0
for sd, pid in (('L', 4), ('R', 5)):
    m = (vleg == pid).astype(float); ta = ramp(z, 0.085, 0.135); by = J['ball' + sd][1]; tk = Z.sstep((z - (KZ - 0.06)) / 0.12); wth = Z.sstep((0.93 - z) / 0.25)
    toe = ramp(-y, -by - 0.012, -by + 0.012) * (1 - ramp(z, 0.05, 0.09)); foot = 1 - ta
    add('thigh_' + sd, m * tk * wth); add('pelvis', m * tk * (1 - wth)); add('shin_' + sd, m * ta * (1 - tk)); add('foot_' + sd, m * foot * (1 - toe)); add('toe_' + sd, m * foot * toe)
side = abs(x); isarm = shm & (side > np.interp(z, GZ, GX)) & (z < 1.25); tor = shm & ~isarm
def analytic_shell():
    """The first pass's weights by region and height; the fallback when bone heat finds no solution."""
    A = {}
    def ad(k, w): A[k] = A.get(k, np.zeros(n)) + w
    a_sh = ramp(side, 0.075, 0.125) * ramp(z, 1.24, 1.30) * (1 - ramp(z, 1.45, 1.49)); shb = 0.5 * ramp(side, 0.03, 0.08) * (1 - a_sh) * ramp(z, 1.33, 1.40) * (1 - ramp(z, 1.45, 1.49))
    core = tor * (1 - a_sh - shb)
    ad('pelvis', core * (1 - ramp(z, 0.98, 1.06))); ad('spine', core * ramp(z, 0.98, 1.06) * (1 - ramp(z, 1.16, 1.24)))
    ad('chest', core * ramp(z, 1.16, 1.24) * (1 - ramp(z, 1.44, 1.49))); ad('neck', core * ramp(z, 1.44, 1.49))
    for sd, sg in (('L', 1), ('R', -1)):
        ms = (x * sg > 0); S, E, Wr = J['S' + sd], J['E' + sd], J['W' + sd]; u1 = unit(E - S); u2 = unit(Wr - E); L1 = np.linalg.norm(E - S); L2 = np.linalg.norm(Wr - E)
        fore = Z.sstep(((V - S) @ u1 - (L1 - 0.04)) / 0.08); hd = ramp((V - E) @ u2, L2 - 0.02, L2 + 0.02) * 0.6; am = (isarm & ms).astype(float)
        ad('upperarm_' + sd, am * (1 - fore) + tor * ms * a_sh); ad('forearm_' + sd, am * fore * (1 - hd)); ad('hand_' + sd, am * fore * hd); ad('shoulder_' + sd, tor * ms * shb)
    return A
HEAT = ['pelvis', 'spine', 'chest', 'neck'] + [b + s_ for b in ('shoulder_', 'upperarm_', 'forearm_', 'hand_', 'thigh_') for s_ in 'LR']
def heat_shell():
    """Blender's bone-heat weights of the torso and arms on a copy of the shell."""
    ids = np.nonzero(shm)[0]; rem = np.full(n, -1); rem[ids] = np.arange(len(ids)); fs = bf[(bfp == 0)]
    o = make_obj('tmp_heat', V[ids], rem[fs]); recalc(o)
    for b in arm.bones: b.use_deform = b.name in HEAT
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active = ao
    try: bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except Exception as ex: print('bone heat raised', ex)
    A = {g.name: np.zeros(n) for g in o.vertex_groups}; names = [g.name for g in o.vertex_groups]
    for v in o.data.vertices:
        for g in v.groups: A[names[g.group]][ids[v.index]] = g.weight
    for b in arm.bones: b.use_deform = True
    bpy.data.objects.remove(o)
    tot = sum(A.values()) if A else np.zeros(n); bad = shm & (tot < 0.5); print('bone heat: groups', len(A), 'unweighted shell verts', int(bad.sum()), 'of', int(shm.sum()))
    if not A or bad.sum() > 0.25 * shm.sum(): return None
    good = np.nonzero(shm & ~bad)[0]
    for i in np.nonzero(bad)[0]:
        j = good[np.argmin(((V[good] - V[i]) ** 2).sum(1))]
        for k in A: A[k][i] = A[k][j]
    tot = np.maximum(sum(A.values()), 1e-9)
    return {k: w / tot * shm for k, w in A.items()}
A = heat_shell(); print('shell weights:', 'bone heat' if A else 'ANALYTIC FALLBACK')
A = A or analytic_shell()
sL = np.clip((x + 0.045) / 0.03, 0, 1); wth = Z.sstep((0.93 - z) / 0.25) * ramp(z, 0.825, 0.875)      # the hips follow the thighs a little, and end on the pelvis alone: the gown hangs from it
SK = {'thigh_L': wth * sL, 'thigh_R': wth * (1 - sL), 'pelvis': 1 - wth}; bl = np.where(tor, Z.sstep((z - 0.86) / 0.12), 1.0)
for k in set(A) | set(SK): add(k, shm * (bl * A.get(k, 0) + (1 - bl) * SK.get(k, 0)))
lock = (tor & (z < 0.87)) | ~shm
W = smooth_w(W, bf, n, 3, lock)
set_weights(objs['body'], W)
GW = Z.grid_weights(); LW = {}                 # gown: skirt bones only; the turned-in lip copies its outer vertex
for nm, w in GW.items():
    a_ = np.zeros(len(LV)); a_[gi] = w
    for o_, i_ in inn.items(): a_[i_] = a_[o_]
    LW[nm] = a_
set_weights(objs['loft'], LW)
for sd in 'LR':
    wt = Z.sstep((0.86 - TVs[sd][:, 2]) / 0.14); set_weights(objs['thigh' + sd], {'thigh_' + sd: wt, 'pelvis': 1 - wt})
set_weights(objs['patch'], {'head': np.ones(len(PV))})
# ---------------- cloth rig: what the bake (cloth_bake.py), the build check (art/anim/ftfanim/skirt.py) and a later
# runtime solver need. glTF axes (Y up, +Z front). Capsules: the bone that carries them, two rest points, two radii.
for sd in 'LR':
    th_, sh_ = [c for c in caps if c[0] == 'thigh_' + sd][0], [c for c in caps if c[0] == 'shin_' + sd][0]
    caps.append((th_[0], th_[1], th_[2], th_[3] + 0.05, th_[4] + 0.06, 1)); caps.append((sh_[0], sh_[1], sh_[2], sh_[3] + 0.08, sh_[4] + 0.10, 1))
    S_, E_, W_ = J['S' + sd], J['E' + sd], J['W' + sd]
    caps += [('upperarm_' + sd, S_, E_, 0.045, 0.038, 1), ('forearm_' + sd, E_, E_ + (W_ - E_) * 0.8, 0.038, 0.030, 1)]
sx = np.hypot(hv[:, 0], hv[:, 1] - 0.012); hr = float(np.percentile(sx[(hv[:, 2] > 1.57) & (hv[:, 2] < 1.66) & (hv[:, 1] < 0.0)], 30))
caps += [('pelvis', np.array([-0.075, 0.01, 0.90]), np.array([0.075, 0.01, 0.90]), 0.115, 0.115, 1), ('spine', np.array([0, 0.0, 1.0]), np.array([0, 0.0, 1.16]), 0.105, 0.10, 1),
         ('chest', np.array([-0.055, -0.02, 1.30]), np.array([0.055, -0.02, 1.30]), 0.12, 0.12, 1), ('neck', np.array([0, 0.008, 1.44]), np.array([0, 0.012, 1.55]), 0.042, 0.042, 1),
         ('head', np.array([0, 0.012, 1.60]), np.array([0, 0.012, 1.66]), hr, hr, 1)]
gridv = LV[gi]; dmin = {}
for bn, a_, b_, r0, r1, st in caps:
    if st == 0:
        d_, t_ = seg_d(gridv.reshape(-1, 3), a_, b_); dmin[bn] = min(dmin.get(bn, 9), float((d_ - (r0 + (r1 - r0) * t_)).min()))
print('rest clearance, gown to leg capsules (m):', {k: round(v, 4) for k, v in dmin.items()})
bnames = [b.name for b in arm.bones]; tails = np.array([ao.matrix_world @ b.tail_local for b in arm.bones])
np.savez_compressed(WD + '/cloth_rig.npz', grid=g2(gridv), gw_names=np.array(list(GW)), gw=np.stack([GW[k] for k in GW], -1).astype(np.float32),
                    ch_cols=np.array(Z.CH_COLS), ch_rows=np.array(Z.CH_ROWS), cap_bone=np.array([c[0] for c in caps]), cap_p0=g2([c[1] for c in caps]), cap_p1=g2([c[2] for c in caps]),
                    cap_r=np.array([[c[3], c[4]] for c in caps]), cap_set=np.array([c[5] for c in caps]), tail_names=np.array(bnames), tail_pos=g2(tails))
# ---------------- join, modifiers, UV
part_id = {'body': 0, 'head': 1, 'handL': 2, 'handR': 2, 'ribbonL': 3, 'ribbonR': 3, 'loft': 6, 'thighL': 4, 'thighR': 5, 'patch': 0}
for k, o in objs.items():
    at = o.data.attributes.new('part', 'INT', 'FACE'); pv = np.full(len(o.data.polygons), part_id[k], np.int32)
    if k == 'body': pv[:] = bfp
    if k == 'patch': pv[:] = PP
    at.data.foreach_set('value', pv)
    nh = o.data.attributes.new('nohull', 'INT', 'FACE'); nh.data.foreach_set('value', nohull if k == 'body' else np.zeros(len(o.data.polygons), np.int32))
    for p in o.data.polygons: p.use_smooth = True
bpy.ops.object.select_all(action='DESELECT')
for o in objs.values(): o.select_set(True)
bpy.context.view_layer.objects.active = objs['body']; bpy.ops.object.join(); el = objs['body']; el.name = 'elise'; el.data.name = 'elise'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
me = el.data; nf = len(me.polygons); pa = np.empty(nf, np.int32); me.attributes['part'].data.foreach_get('value', pa)
fc = np.empty(nf * 3); me.polygons.foreach_get('center', fc); fx_, fy_, fz = fc.reshape(-1, 3).T; fth = Z.ang(fx_, fy_)
# texel density by zone; every zone is unwrapped on its own, so an island never mixes two densities
zone = np.zeros(nf, int); dens = {0: 1.0, 1: 1.5, 2: 2.6, 3: 0.8, 4: 3.0, 5: 0.6, 6: 0.9, 7: 3.5, 8: 5.0, 9: 1.1}
zone[pa == 1] = 1; zone[(pa == 1) & (fy_ < -0.03) & (fz > 1.49) & (fz < 1.68) & (abs(fx_) < 0.08)] = 2; zone[pa == 2] = 3
zone[pa == 4] = 9; zone[(pa == 4) & (fz > 0.59) & (fz < 0.85)] = 4; zone[pa == 5] = 5; zone[pa == 6] = 6
zone[(pa == 0) & (fz > 0.79) & (fz < 0.99) & (fth > 12) & (fth < 104) & (np.hypot(fx_, fy_) < 0.215)] = 7; zone[pa >= Z.PART0] = 8
me.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE')
for zid in sorted(set(zone.tolist())):
    b_ = bmesh.from_edit_mesh(me); b_.faces.ensure_lookup_table()
    for f in b_.faces: f.select_set(bool(zone[f.index] == zid))
    b_.select_flush_mode(); bmesh.update_edit_mesh(me)
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT'); bpy.ops.uv.average_islands_scale(); bpy.ops.object.mode_set(mode='OBJECT')
uv = me.uv_layers.active.data; lt = np.empty(len(me.loops) * 2); uv.foreach_get('uv', lt); lt = lt.reshape(-1, 2)
ls = np.array([p.loop_start for p in me.polygons]); k = np.array([dens[z_] for z_ in zone])
for j in range(3): lt[ls + j] *= k[:, None]
uv.foreach_set('uv', lt.ravel())
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin=0.0025, scale=True); bpy.ops.object.mode_set(mode='OBJECT')
el.parent = ao; md = el.modifiers.new('rig', 'ARMATURE'); md.object = ao
# ---------------- bake input
me.calc_loop_triangles(); nl = len(me.loops)
co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
no = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('normal', no); no = no.reshape(-1, 3)
lv = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', lv); lt = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', lt); lt = lt.reshape(-1, 2)
tl = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('loops', tl); tl = tl.reshape(-1, 3)
tp = np.empty(len(me.loop_triangles), np.int32); me.loop_triangles.foreach_get('polygon_index', tp)
np.savez(WD + '/bake_in.npz', P=co[lv[tl]], N=no[lv[tl]], UV=lt[tl], part=pa[tp])
print('ELISE tris', len(me.loop_triangles), 'verts', len(me.vertices), 'bones', len(arm.bones), 'by part', np.bincount(pa[tp]).tolist(), 'uv range', lt.min(0), lt.max(0))
bpy.ops.wm.save_as_mainfile(filepath=WD + '/elise_build.blend')
