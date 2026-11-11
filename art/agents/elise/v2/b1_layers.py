"""Elise v2, stage B1: the layers over the body, each its own mesh, and her skeleton.
gown (one grid from the collar to the hem: halter front, open back, laced opening, slit, closed hem), stockings,
shoes, wrist ribbons, lacing, and the hair of the first version cut into fringe, back (bun and braids), two face
strands and the butterfly pin. Everything is skinned to one armature (the proven bone names and hierarchy).
    blender -b body.blend -P b1_layers.py -- <work dir>     writes layers.blend, cloth_rig.npz, r/b1_layers.jpg"""
import bpy, bmesh, sys, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import rend, ezones as Z
WD = sys.argv[sys.argv.index("--") + 1]
unit = lambda v: np.asarray(v, float) / np.linalg.norm(v)
ramp = lambda x, a_, b_: np.clip((np.asarray(x) - a_) / (b_ - a_), 0, 1)
sstep = Z.sstep
S = np.load(WD + '/src.npz'); FC = np.load(WD + '/face.npz')
body = bpy.data.objects['elise_body']; me = body.data; NBV = len(me.vertices)
for o in list(bpy.data.objects):
    if o is not body: bpy.data.objects.remove(o)
# seam cleanup: an edge with more than two faces loses its extra faces
bm = bmesh.new(); bm.from_mesh(me)
bad = [e for e in bm.edges if len(e.link_faces) > 2]
for e in bad:
    for f in sorted(e.link_faces, key=lambda f: f.calc_area())[:len(e.link_faces) - 2]:
        if f.is_valid: bm.faces.remove(f)
rim = [e for e in bm.edges if e.is_boundary]
if rim: bmesh.ops.holes_fill(bm, edges=rim, sides=0)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
print('body: non-manifold edges fixed', len(bad), '| open edges', sum(1 for e in bm.edges if e.is_boundary), 'non-manifold', sum(1 for e in bm.edges if not e.is_manifold), 'faces', len(bm.faces))
bm.to_mesh(me); bm.free(); me.update()
co = np.empty(NBV * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3); no = np.empty(NBV * 3); me.vertices.foreach_get('normal', no); no = no.reshape(-1, 3)
GN = [g.name for g in body.vertex_groups]; BW = np.zeros((NBV, len(GN)))
for v in me.vertices:
    for g in v.groups: BW[v.index, g.group] = g.weight
BW /= np.maximum(BW.sum(1, keepdims=True), 1e-9); gw = lambda n: BW[:, GN.index(n)]
polys = [tuple(p.vertices) for p in me.polygons]
kd = KDTree(NBV)
for i, p in enumerate(co): kd.insert(p, i)
kd.balance()
def body_w(P, drop=()):
    """Weights of the nearest body vertex for each point, as {group: array}; groups in `drop` are removed."""
    idx = np.array([kd.find(tuple(p))[1] for p in P]); Wm = BW[idx].copy()
    for i, n in enumerate(GN):
        if n.startswith(tuple(drop)): Wm[:, i] = 0
    Wm /= np.maximum(Wm.sum(1, keepdims=True), 1e-9); return {n: Wm[:, i] for i, n in enumerate(GN)}
def make_obj(name, V, F):
    m = bpy.data.meshes.new(name); m.from_pydata([tuple(map(float, v)) for v in V], [], [tuple(map(int, f)) for f in F]); m.update()
    o = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(o)
    for p in m.polygons: p.use_smooth = True
    return o
def set_weights(o, W):
    for name, w in W.items():
        idx = np.nonzero(np.asarray(w) > 0.004)[0]
        if not len(idx): continue
        vg = o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
        for i in idx: vg.add([int(i)], float(w[i]), 'REPLACE')
def outward(o, centre=None):
    """Wind a mesh's faces to look away from the body axis (or from a centre)."""
    b = bmesh.new(); b.from_mesh(o.data); bmesh.ops.recalc_face_normals(b, faces=b.faces[:]); b.normal_update()
    s_ = sum((f.normal.x * (f.calc_center_median().x - (centre[0] if centre is not None else 0)) + f.normal.y * (f.calc_center_median().y - (centre[1] if centre is not None else 0))) * f.calc_area() for f in b.faces)
    if s_ < 0: bmesh.ops.reverse_faces(b, faces=b.faces[:])
    b.to_mesh(o.data); b.free()
# ---------------- skeleton: the pass-3 bones, with the hands and feet of the new body
BN = [str(x) for x in S['bone_names']]; BH = dict(zip(BN, S['bone_head'].astype(float))); BT = dict(zip(BN, S['bone_tail'].astype(float))); BP = dict(zip(BN, [str(x) for x in S['bone_parent']]))
for n, v in zip([str(x) for x in FC['newb_names']], FC['newb']): BH[n], BT[n] = v[:3].astype(float), v[3:].astype(float)
J = {}
for sd in 'LR':
    J['hip' + sd], J['knee' + sd], J['ank' + sd], J['ball' + sd], J['tip' + sd] = BH['thigh_' + sd], BH['shin_' + sd], BH['foot_' + sd], BH['toe_' + sd], BT['toe_' + sd]
    J['S' + sd], J['E' + sd], J['W' + sd] = BH['upperarm_' + sd], BH['forearm_' + sd], BH['hand_' + sd]
legw = {sd: gw('thigh_' + sd) + gw('shin_' + sd) + gw('foot_' + sd) + gw('toe_' + sd) for sd in 'LR'}; armw = sum(gw(k + sd) for k in ('upperarm_', 'forearm_', 'hand_', 'thumb_', 'index_', 'fingers_') for sd in 'LR')
shw = gw('shoulder_L') + gw('shoulder_R')
def seg_d(p, a_, b_):
    ab = b_ - a_; t = np.clip(((p - a_) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a_ + t[:, None] * ab), axis=1), t
# leg capsules fitted to the new legs (the cloth is built and checked against them)
caps = []
for sd in 'LR':
    pts = co[(legw[sd] > 0.5) & (co[:, 2] < 0.672)]
    hb = np.array([J['ank' + sd][0], J['ank' + sd][1] + 0.045, 0.004])
    lx = co[(legw[sd] > 0.5) & (abs(co[:, 2] - 0.66) < 0.012)]; top = np.array([(lx[:, 0].max() + lx[:, 0].min()) / 2, (lx[:, 1].max() + lx[:, 1].min()) / 2, 0.66])
    segs = [('thigh_' + sd, top, J['knee' + sd]), ('shin_' + sd, J['knee' + sd], J['ank' + sd]), ('foot_' + sd, J['ank' + sd] + [0, 0, -0.03], J['tip' + sd] + [0, 0.02, 0.012]), ('foot_' + sd, J['ank' + sd] + [0, 0, -0.03], hb + [0, 0, 0.02])]
    D = np.stack([seg_d(pts, a_, b_)[0] for _, a_, b_ in segs], 1); own = D.argmin(1)
    for q, (bn, a_, b_) in enumerate(segs):
        d_, t_ = seg_d(pts[own == q], a_, b_); pc = lambda v: float(np.percentile(v, 98)) if len(v) else float(np.percentile(d_, 98)); lo = pc(d_[t_ < 0.4]); hi = pc(d_[t_ > 0.6])
        r0 = pc(d_ - (hi - lo) * t_) + 0.002; caps.append((bn, a_, b_, r0, r0 + hi - lo, 0)); print('capsule', bn, np.round(a_, 3), np.round(b_, 3), 'radii %.3f %.3f' % (r0, r0 + hi - lo), 'verts', int((own == q).sum()))
def leg_sd(p):
    out = np.full(len(p), 9.0)
    for bn, a_, b_, r0, r1, st in caps:
        d_, t_ = seg_d(p, a_, b_); out = np.minimum(out, d_ - (r0 + (r1 - r0) * t_))
    return out
# ---------------- gown: one grid, collar to hem
torso_f = [f for f in polys if max(armw[list(f)]) < 0.35 and max(shw[list(f)]) < 0.75]
bvh_t = BVHTree.FromPolygons([tuple(p) for p in co], torso_f)
def hull2(P):
    P = sorted(set(map(tuple, np.round(P, 5))))
    if len(P) < 3: return np.array(P)
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); lo = []; up = []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return np.array(lo[:-1] + up[:-1])
NTH = 144; TH = (np.arange(NTH) + 0.5) / NTH * 360 - 180
def row_env(z):
    """Radius of the convex outline of the body's cross-section at height z, by angle (cloth bridges the hollows)."""
    pts = []
    for t_ in np.radians(np.arange(0, 360, 1.5)):
        d = Vector((math.sin(t_), -math.cos(t_), 0)); loc = bvh_t.ray_cast(Vector((0, 0.005, z)) + d * 0.6, -d, 0.6)[0]
        if loc is not None and (z < 1.43 or math.hypot(loc.x, loc.y - 0.005) < 0.075): pts.append((loc.x, loc.y))      # above the shoulders only the neck counts
    if len(pts) < 8: return None
    H = hull2(np.array(pts)); out = np.zeros(NTH)
    for k, t_ in enumerate(np.radians(TH)):
        d = np.array([math.sin(t_), -math.cos(t_)]); o = np.array([0, 0.005]); best = 0.0
        for a_, b_ in zip(H, np.roll(H, -1, 0)):
            e = b_ - a_; den = d[0] * e[1] - d[1] * e[0]
            if abs(den) < 1e-12: continue
            s_ = ((a_[0] - o[0]) * e[1] - (a_[1] - o[1]) * e[0]) / den; u_ = ((a_[0] - o[0]) * d[1] - (a_[1] - o[1]) * d[0]) / den
            if s_ > 0 and -1e-9 <= u_ <= 1 + 1e-9: best = max(best, s_)
        out[k] = best
    return out
EZ = np.arange(0.10, 1.50, 0.01); ENV = [row_env(z) for z in EZ]; ENV = np.array([e if e is not None else np.full(NTH, np.nan) for e in ENV]); print('envelope rows without a section', int(np.isnan(ENV).any(1).sum())); ENV = np.where(np.isnan(ENV), np.nanmean(ENV), ENV); k5 = np.array([1, 4, 6, 4, 1]) / 16
for _ in range(1):
    Q = np.concatenate([ENV[:, -2:], ENV, ENV[:, :2]], 1); ENV = sum(k5[i] * Q[:, i:i + NTH] for i in range(5))
def renv(th, z):
    th = np.asarray(th, float); z = np.asarray(z, float); ft = ((th + 180) / 360 * NTH - 0.5) % NTH; t0 = np.floor(ft).astype(int); a = ft - t0
    fz = np.clip((z - EZ[0]) / 0.01, 0, len(EZ) - 1.001); z0 = np.floor(fz).astype(int); b = fz - z0
    g = lambda zz, tt: ENV[zz, tt % NTH]; return (g(z0, t0) * (1 - a) + g(z0, t0 + 1) * a) * (1 - b) + (g(z0 + 1, t0) * (1 - a) + g(z0 + 1, t0 + 1) * a) * b
# the skirt keeps the width of the first version's gown: the outer envelope of the generated dress (as in pass 3),
# never closer to the new legs than their own outline
ENVS = Z.envelope(np.load('/root/w/elise3/work/body_hi_pts.npy').astype(float), co[((legw['L'] + legw['R']) > 0.5) & (co[:, 2] > 0.1)], co[(co[:, 2] > 0.79) & (co[:, 2] < 0.83) & (armw < 0.3)])
print('gown envelope of the first version: mean radius at 0.8 / 0.5 / 0.1: %.3f %.3f %.3f; the new legs alone: %.3f %.3f %.3f' % (ENVS[80].mean(), ENVS[50].mean(), ENVS[10].mean(), renv(TH, 0.8).mean(), renv(TH, 0.5).mean(), renv(TH, 0.12).mean()))
def rskirt(th, z): return max(float(Z.env_at(ENVS, th, z)), float(renv(th, max(z, EZ[0]))) + 0.004)
ZC0, ZC1 = 1.438, 1.482                      # the collar band
def slit(z):
    t1, t2 = (float(v) for v in Z.gown_slit(min(z, 0.955)))
    if z > 0.955: k = min(1, (z - 0.955) / 0.02); t1, t2 = t1 + (50 - t1) * k, t2 + (50 - t2) * k
    return t1, t2
def edge_deg(z):
    """Half-angle of the gown's front panel at height z (180: closed all round). Open back V, then the halter line."""
    return float(np.interp(z, [1.10, 1.345, ZC0 - 0.004, ZC0], [180.0, 104.0, 40.0, 180.0]))
NU, NV = Z.NU, Z.NV; ZB = list(np.linspace(Z.ZT, 1.345, 23)[1:]) + list(np.linspace(1.345, ZC0, 6)[1:]) + [ZC0 + 0.022, ZC1]
rows_z = []; LV = []; NR = NV + len(ZB); gi = np.zeros((NR + 1, NU + 1), int); thn = np.zeros((NR + 1, NU + 1)); zrow = np.zeros(NR + 1)
for jj in range(NR + 1):
    j = NR - jj                              # grid row 0 is the collar top; the skirt rows keep their pass-3 order below
    for i in range(NU + 1):
        u = i / NU; thl = 114.0 + u * (360 - 108.0)
        if jj >= len(ZB): js = jj - len(ZB); zh = 0.045 + 0.008 * math.cos(math.radians(thl)); z = Z.ZT + (zh - Z.ZT) * js / NV
        else: z = ZB[len(ZB) - 1 - jj]
        t1, t2 = slit(z); th = t2 + u * (360 - (t2 - t1)); tn = (th + 180) % 360 - 180
        if z > 1.10 and z < ZC0 and abs(tn) > edge_deg(z) and abs(tn) < edge_deg(z) + 360 / NU * 1.01 * (360 - (t2 - t1)) / 360: tn = math.copysign(edge_deg(z), tn); th = tn      # the row's last vertex lies exactly on the edge
        r = float(renv(th, max(z, EZ[0])))
        if z < Z.ZT + 1e-6: r = rskirt(th, z) + 0.002 * min(1, max(0, (z - 0.74) / 0.06)) + float(Z.gown_ease(th, z))
        else: r += 0.004 + (0.004 if z >= ZC0 else 0.0)
        p = np.array([r * math.sin(math.radians(th)), 0.005 - r * math.cos(math.radians(th)), z])
        if z < 0.80:
            while leg_sd(p[None])[0] < 0.014: r += 0.003; p = np.array([r * math.sin(math.radians(th)), 0.005 - r * math.cos(math.radians(th)), z])
        gi[jj, i] = len(LV); LV.append(p); thn[jj, i] = tn; zrow[jj] = z
LV = np.array(LV); NB_ = len(ZB)               # grid rows 0..NB_ are the bodice (top down), NB_..NR the skirt
cov = np.ones((NR, NU), bool)
for jj in range(NR):
    zc = (zrow[jj] + zrow[jj + 1]) / 2
    if 1.10 < zc < ZC0:
        for i in range(NU):
            tc = math.degrees(math.atan2(math.sin(math.radians(thn[jj, i])) + math.sin(math.radians(thn[jj, i + 1])), math.cos(math.radians(thn[jj, i])) + math.cos(math.radians(thn[jj, i + 1]))))
            cov[jj, i] = abs(tc) < edge_deg(zc)
LF = [(gi[jj, i], gi[jj + 1, i], gi[jj + 1, i + 1], gi[jj, i + 1]) for jj in range(NR) for i in range(NU) if cov[jj, i]]
gown = make_obj('elise_gown', LV, LF)
bm = bmesh.new(); bm.from_mesh(gown.data); bm.verts.ensure_lookup_table(); GC = bm.verts.layers.float_vector.new('grid')
for jj in range(NR + 1):
    for i in range(NU + 1): bm.verts[int(gi[jj, i])][GC] = (i, jj, 1.0)
# the two edge columns close above the laced opening
seam = [bm.verts[int(gi[jj, c])] for jj in range(NR + 1) if zrow[jj] > 0.975 for c in (0, NU)]
bmesh.ops.remove_doubles(bm, verts=seam, dist=2e-4)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# a turned-in lip along every free edge (hem, slit, laced opening, armholes, back, collar): the cloth has thickness
bedges = [e for e in bm.edges if e.is_boundary]; bverts = list({v for e in bedges for v in e.verts}); bm.normal_update()
ext = bmesh.ops.extrude_edge_only(bm, edges=bedges)['geom']; nv = [g for g in ext if isinstance(g, bmesh.types.BMVert)]
for v in nv:
    src_ = [e.other_vert(v) for e in v.link_edges if e.other_vert(v) in bverts]; n_ = src_[0].normal if src_ else Vector((0, 0, 0)); v.co = v.co - n_ * 0.004; v[GC] = (src_[0][GC][0], src_[0][GC][1], 0.0) if src_ else (0, 0, 0)
bm.to_mesh(gown.data); bm.free(); outward(gown)
gm = gown.data; gco = np.array([v.co[:] for v in gm.vertices]); gcd = np.empty(len(gm.vertices) * 3); gm.attributes['grid'].data.foreach_get('vector', gcd); gcd = gcd.reshape(-1, 3)
gcol = np.clip(np.round(gcd[:, 0]).astype(int), 0, NU); grow = np.clip(np.round(gcd[:, 1]).astype(int), 0, NR)
GWs = Z.grid_weights(); Wg = body_w(gco, drop=('upperarm', 'forearm', 'hand', 'thumb', 'index', 'fingers', 'shin', 'foot', 'toe'))
sk = grow >= NB_; js = np.clip(grow - NB_, 0, NV); up = ramp(gco[:, 2], 0.825, 0.875)
for sd in 'LR': Wg['pelvis'] = Wg['pelvis'] + Wg['thigh_' + sd] * (1 - up); Wg['thigh_' + sd] = Wg['thigh_' + sd] * up
for n in list(Wg): Wg[n] = np.where(sk, 0.0, Wg[n])
for n, w in GWs.items(): Wg[n] = np.where(sk, w[js, gcol], 0.0)
set_weights(gown, Wg)
gridv = LV[gi[NB_:, :]]                        # [NV + 1, NU + 1, 3]: the skirt, as the cloth rig knows it
print('gown: verts', len(gm.vertices), 'faces', len(gm.polygons), 'rows', NR + 1, 'cols', NU + 1, '| hem z %.3f..%.3f, waist radius %.3f, hip %.3f, collar %.3f' % (gridv[-1, :, 2].min(), gridv[-1, :, 2].max(), renv(0, 1.12), renv(180, 0.93), renv(0, ZC0)))
# ---------------- stockings: the legs' own surface, lifted
def shell_of(mask_f, off, name, extra=None):
    fs = [f for f in polys if mask_f(f)]; used = sorted({i for f in fs for i in f}); idx = {v: k for k, v in enumerate(used)}
    V = co[used] + no[used] * (off(co[used]) if callable(off) else off)[:, None] if callable(off) else co[used] + no[used] * off
    o = make_obj(name, V, [[idx[i] for i in f] for f in fs]); set_weights(o, {n: BW[used, k] for k, n in enumerate(GN)}); return o, used
ZST = 0.672
stock, st_used = shell_of(lambda f: all(co[i, 2] < ZST for i in f) and min(legw['L'][list(f)] + legw['R'][list(f)]) > 0.5, lambda P: 0.0012 + 0.0010 * ramp(P[:, 2], 0.61, 0.66), 'elise_stockings')
print('stockings: verts', len(st_used), 'faces', len(stock.data.polygons))
# ---------------- shoes: closed-toe pumps lofted on the feet
def shoe(sd):
    m = (gw('foot_' + sd) + gw('toe_' + sd) > 0.4) & (co[:, 2] < J['ank' + sd][2] - 0.012); P = co[m]; y0, y1 = P[:, 1].min() - 0.010, P[:, 1].max() + 0.0035
    ys = np.r_[np.linspace(y0 + 0.004, y0 + 0.05, 5), np.linspace(y0 + 0.07, y1 - 0.004, 8)]; NRg = 12; V = []; F = []; W = {'foot_' + sd: [], 'toe_' + sd: []}; rings = []
    by = J['ball' + sd][1]
    for k, y in enumerate(ys):
        sl = P[abs(P[:, 1] - y) < 0.012]
        if len(sl) < 6: sl = P[np.argsort(abs(P[:, 1] - y))[:12]]
        c = np.array([sl[:, 0].mean(), (sl[:, 2].max() + sl[:, 2].min()) / 2]); ring = []
        H = hull2(sl[:, [0, 2]]); zsole = max(0.0, sl[:, 2].min() - 0.004)
        for a_ in range(NRg):
            t_ = 2 * math.pi * a_ / NRg - math.pi / 2; d = np.array([math.cos(t_), math.sin(t_)]); best = 0.004
            for p_, q_ in zip(H, np.roll(H, -1, 0)):
                e = q_ - p_; den = d[0] * e[1] - d[1] * e[0]
                if abs(den) < 1e-12: continue
                s_ = ((p_[0] - c[0]) * e[1] - (p_[1] - c[1]) * e[0]) / den; u_ = ((p_[0] - c[0]) * d[1] - (p_[1] - c[1]) * d[0]) / den
                if s_ > 0 and -1e-9 <= u_ <= 1 + 1e-9: best = max(best, s_)
            taper = 1.0 if k > 1 else (0.55, 0.85)[k]                     # the pointed toe
            q = c + d * (best * taper + 0.0045); ring.append(len(V)); V.append((q[0], y, max(q[1], zsole))); wt = float(ramp(by - y, -0.012, 0.012)); W['toe_' + sd].append(wt); W['foot_' + sd].append(1 - wt)
        rings.append(ring)
    vamp = 5                                   # rings behind this one are open on top (the foot goes in)
    for k in range(len(rings) - 1):
        for a_ in range(NRg):
            top = a_ in (5, 6, 7) or (k >= len(rings) - 3 and False)
            if k >= vamp and a_ in (4, 5, 6, 7): continue
            F.append((rings[k][a_], rings[k][(a_ + 1) % NRg], rings[k + 1][(a_ + 1) % NRg], rings[k + 1][a_]))
    tip = len(V); V.append((np.mean([V[i][0] for i in rings[0]]), y0, np.mean([V[i][2] for i in rings[0]]) * 0.8)); W['toe_' + sd].append(1.0); W['foot_' + sd].append(0.0)
    F += [(rings[0][(a_ + 1) % NRg], rings[0][a_], tip) for a_ in range(NRg)]
    back = len(V); V.append((np.mean([V[i][0] for i in rings[-1]]), y1 + 0.003, np.mean([V[i][2] for i in rings[-1][:5]]))); W['toe_' + sd].append(0.0); W['foot_' + sd].append(1.0)
    F += [(rings[-1][a_], rings[-1][(a_ + 1) % NRg], back) for a_ in list(range(0, 4)) + list(range(8, NRg))]
    # the heel: a tapered column from under the heel to the floor
    hc = np.array([V[back][0], y1 - 0.016, min(V[i][2] for i in rings[-2])]); prev = None
    for z_, r_ in ((hc[2] + 0.004, 0.0125), (hc[2] * 0.5, 0.0075), (0.0, 0.0055)):
        ring = []
        for a_ in range(6): t_ = 2 * math.pi * a_ / 6; ring.append(len(V)); V.append((hc[0] + r_ * math.cos(t_), hc[1] + r_ * 0.9 * math.sin(t_) + (hc[2] - z_) * 0.10, z_)); W['toe_' + sd].append(0.0); W['foot_' + sd].append(1.0)
        if prev: F += [(prev[a_], prev[(a_ + 1) % 6], ring[(a_ + 1) % 6], ring[a_]) for a_ in range(6)]
        prev = ring
    F.append(tuple(prev[::-1]))
    return np.array(V), F, {k: np.array(v) for k, v in W.items()}, hc
sv, sf, sw, hl = [], [], {}, {}
for sd in 'LR':
    V, F, W_, hc = shoe(sd); n0 = len(sv); sv += list(V); sf += [tuple(i + n0 for i in f) for f in F]; hl[sd] = hc
    for k, w in W_.items(): sw[k] = (np.r_[np.zeros(n0), w] if k not in sw else np.r_[sw[k], np.zeros(n0 - len(sw[k])), w])
sw = {k: np.r_[w, np.zeros(len(sv) - len(w))] for k, w in sw.items()}
shoes = make_obj('elise_shoes', sv, sf); set_weights(shoes, sw); b = bmesh.new(); b.from_mesh(shoes.data); bmesh.ops.recalc_face_normals(b, faces=b.faces[:]); b.to_mesh(shoes.data); b.free()
print('shoes: verts', len(sv), 'faces', len(sf), 'heel height L %.3f R %.3f' % (hl['L'][2], hl['R'][2]), 'lowest %.4f' % np.array(sv)[:, 2].min())
# ---------------- wrist ribbons: a wrap on the forearm and two hanging tails
bones_extra = {}; rv, rf, rw = [], [], []
def add_piece(V, F, Wd):
    n0 = len(rv); rv.extend([tuple(v) for v in V]); rf.extend([tuple(i + n0 for i in f) for f in F]); rw.extend(Wd)
for sd, sg in (('L', 1), ('R', -1)):
    E, Wr = J['E' + sd], J['W' + sd]; u = unit(Wr - E); L = np.linalg.norm(Wr - E); t = (co - E) @ u; d_ = np.linalg.norm(co - E - np.outer(t, u), axis=1)
    fw = gw('forearm_' + sd) + gw('hand_' + sd); band = lambda f: all((t[i] > L - 0.062) and (t[i] < L - 0.004) and fw[i] > 0.5 and d_[i] < 0.05 for i in f)
    fs = [f for f in polys if band(f)]; used = sorted({i for f in fs for i in f}); idx = {v: k for k, v in enumerate(used)}
    add_piece(co[used] + no[used] * 0.0026, [[idx[i] for i in f] for f in fs], [{n: float(BW[i, k]) for k, n in enumerate(GN) if BW[i, k] > 0.004} for i in used])
    rad = float(np.median(d_[used])); top = E + u * (L - 0.03) + np.array([sg * (rad + 0.004), 0.004, -0.008]); R0, R1 = f'ribbon_{sd}_0', f'ribbon_{sd}_1'
    for k, (Lr, w, dx, dy) in enumerate(((0.30, 0.013, 0.0, -0.006), (0.235, 0.012, 0.012, 0.007))):
        prev = None; n = 7; V = []; F = []; Wd = []
        for i in range(n + 1):
            tt = i / n; c = top + [sg * (dx + 0.022 * tt + 0.004 * math.sin(5 * tt + k)), dy + 0.006 * math.sin(4 * tt + 2 * k), -Lr * tt]; ww = w * (1 + 0.25 * tt); g1 = float(ramp(Lr * tt, 0.10, 0.19))
            g = {R0: 1 - g1, R1: g1} if i else {'forearm_' + sd: 1.0}; i0 = len(V); V += [c + [-ww, -0.0012, 0], c + [ww, -0.0012, 0], c + [ww, 0.0012, 0], c + [-ww, 0.0012, 0]]; Wd += [dict(g) for _ in range(4)]; ring = list(range(i0, i0 + 4))
            if prev: F += [(prev[a_], prev[(a_ + 1) % 4], ring[(a_ + 1) % 4], ring[a_]) for a_ in range(4)]
            else: F.append(tuple(ring))
            prev = ring
        F.append(tuple(prev[::-1])); add_piece(V, F, Wd)
    bones_extra[R0] = (top, top + [sg * 0.008, 0, -0.14], 'forearm_' + sd); bones_extra[R1] = (top + [sg * 0.008, 0, -0.14], top + [sg * 0.018, 0, -0.28], R0)
rib = make_obj('elise_ribbons', rv, rf); set_weights(rib, {k: np.array([g.get(k, 0) for g in rw]) for k in {k for g in rw for k in g}})
b = bmesh.new(); b.from_mesh(rib.data); bmesh.ops.recalc_face_normals(b, faces=b.faces[:]); b.to_mesh(rib.data); b.free(); print('ribbons: verts', len(rv), 'faces', len(rf))
# ---------------- lacing: flat cords crossing the opening between the gown's two edge columns, a bow and two ends
lv, lf = [], []
def cord(a_, b_, w=0.0022, lift=0.0025):
    a_, b_ = np.asarray(a_, float), np.asarray(b_, float); d = unit(b_ - a_); nrm = unit([(a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2 - 0.005, 0]); s_ = unit(np.cross(d, nrm)) * w; n0 = len(lv)
    for p in (a_, b_):
        for q in (p + nrm * lift - s_, p + nrm * lift + s_, p + nrm * (lift + 0.0016) + s_, p + nrm * (lift + 0.0016) - s_): lv.append(tuple(q))
    lf.extend([(n0 + a2, n0 + (a2 + 1) % 4, n0 + 4 + (a2 + 1) % 4, n0 + 4 + a2) for a2 in range(4)] + [(n0 + 3, n0 + 2, n0 + 1, n0), (n0 + 4, n0 + 5, n0 + 6, n0 + 7)])
def edge_pt(z, side):
    t1, t2 = slit(z); th = t2 if side == 0 else t1; r = float(renv(th, z)) + 0.004 if z > Z.ZT else rskirt(th, z) + 0.002 * min(1, max(0, (z - 0.74) / 0.06)) + float(Z.gown_ease(th, z)); return np.array([r * math.sin(math.radians(th)), 0.005 - r * math.cos(math.radians(th)), z])
zl = np.linspace(0.812, 0.948, 7)
for k in range(len(zl) - 1): cord(edge_pt(zl[k], 0), edge_pt(zl[k + 1], 1)); cord(edge_pt(zl[k], 1), edge_pt(zl[k + 1], 0))
bot = (edge_pt(zl[0], 0) + edge_pt(zl[0], 1)) / 2; cord(edge_pt(zl[0], 0), edge_pt(zl[0], 1))
rad_ = unit([bot[0], bot[1] - 0.005, 0]); side_ = unit(np.cross([0, 0, 1], rad_))
for sx in (-1, 1):                              # a small bow and two hanging ends
    cord(bot, bot + side_ * sx * 0.016 + [0, 0, -0.012], lift=0.004); cord(bot + side_ * sx * 0.016 + [0, 0, -0.012], bot + side_ * sx * 0.002 + [0, 0, -0.002], lift=0.0048)
    mid_ = bot + side_ * sx * 0.006 + [0, 0, -0.045]; cord(bot, mid_, lift=0.004); cord(mid_, bot + side_ * sx * 0.010 + [0, 0, -0.09], lift=0.004)
lace = make_obj('elise_lacing', lv, lf); set_weights(lace, body_w(np.array(lv), drop=('upperarm', 'forearm', 'hand', 'thumb', 'index', 'fingers', 'shin', 'foot', 'toe')))
b = bmesh.new(); b.from_mesh(lace.data); bmesh.ops.recalc_face_normals(b, faces=b.faces[:]); b.to_mesh(lace.data); b.free(); print('lacing: verts', len(lv), 'faces', len(lf))
# ---------------- the head of the first version, whole (face, hair, pin, its paint), set on the new body and sewn at
# the neck under the collar; the body's own head goes
hm = S['part'] == 1; hF = S['F'][hm]; hUV = S['UV'][hm].astype(float); used = np.unique(hF); hidx = -np.ones(len(S['V']), int); hidx[used] = np.arange(len(used)); HV = S['V'][used].astype(float); HF = hidx[hF]
x, y, z = HV.T; rax = np.hypot(x, y - 0.002); neckw = (1 - ramp(z, 1.49, 1.54)) * (rax < 0.062); strand = (z < 1.525) & (rax > 0.058) & (y < 0.04); HW = {}
for sd, sg in (('L', 1), ('R', -1)):
    m = strand & (x * sg > 0)
    if m.sum() < 3: print('no strand', sd); continue
    zt = z[m].min(); top = HV[m & (z > 1.50)].mean(0) if (m & (z > 1.50)).sum() else HV[m].mean(0); bot = HV[m & (z < zt + 0.02)].mean(0); zm = (1.525 + zt) / 2
    mid = HV[m & (abs(z - zm) < 0.012)].mean(0) if (m & (abs(z - zm) < 0.012)).sum() else (top + bot) / 2; h0 = np.array([top[0], top[1], 1.575])
    bones_extra[f'hair_{sd}_0'] = (h0, mid, 'head'); bones_extra[f'hair_{sd}_1'] = (mid, bot, f'hair_{sd}_0')
    w = m * ramp(1.535 - z, 0, 0.04); w1 = ramp(mid[2] + 0.012 - z, 0, 0.03); HW[f'hair_{sd}_0'] = w * (1 - w1); HW[f'hair_{sd}_1'] = w * w1
    print('strand', sd, int(m.sum()), np.round(h0, 3), np.round(mid, 3), np.round(bot, 3))
hairw = sum(HW.values()) if HW else 0; HW['neck'] = neckw * (1 - hairw); HW['head'] = (1 - neckw) * (1 - hairw)
for n in HW:
    if n not in body.vertex_groups: body.vertex_groups.new(name=n)
gidx = {g.name: g.index for g in body.vertex_groups}
bm = bmesh.new(); bm.from_mesh(me); LD = bm.verts.layers.deform.verify(); LU = bm.loops.layers.uv['UVMap']; LO = bm.loops.layers.uv.new('old'); LH = bm.verts.layers.int.new('v1head'); bm.verts.ensure_lookup_table()
ZCUT = 1.462; hn_ = gw('head') + gw('neck'); kill = [bm.verts[i] for i in range(NBV) if co[i, 2] > ZCUT and hn_[i] > 0.5]; bmesh.ops.delete(bm, geom=kill, context='VERTS')
for _ in range(6):
    bad = [v for v in bm.verts if sum(1 for e_ in v.link_edges if e_.is_boundary) > 2]
    if not bad: break
    bmesh.ops.delete(bm, geom=bad, context='VERTS')
def loops_of(vs_):
    """Boundary loops among the given vertices, ordered along the faces' winding."""
    vs_ = set(vs_); nxt = {}
    for e_ in bm.edges:
        if e_.is_boundary and e_.verts[0] in vs_ and e_.verts[1] in vs_:
            l = e_.link_loops[0]; nxt.setdefault(l.vert, []).append(l.link_loop_next.vert)
    out = []; seen = set()
    for v0 in list(nxt):
        if v0 in seen: continue
        lp = [v0]; seen.add(v0); cur = v0
        while True:
            cand = [w_ for w_ in nxt.get(cur, []) if w_ not in seen]
            if not cand: break
            cur = cand[0]; lp.append(cur); seen.add(cur)
        out.append(lp)
    return out
brims = loops_of(bm.verts[:]); brim = max(brims, key=len); print('body: head removed, verts', len(kill), '| neck rims', [len(l) for l in brims], 'rim z %.3f..%.3f' % (min(v.co.z for v in brim), max(v.co.z for v in brim)))
hv_new = [bm.verts.new(tuple(p_)) for p_ in HV]
for i, v in enumerate(hv_new):
    v[LH] = 1
    for n, w in HW.items():
        if w[i] > 0.004: v[LD][gidx[n]] = float(w[i])
nf = 0
for f, uvs in zip(HF, hUV):
    try: fc = bm.faces.new([hv_new[i] for i in f])
    except ValueError: continue
    fc.smooth = True; nf += 1
    for l, t in zip(fc.loops, uvs): l[LO].uv = tuple(t); l[LU].uv = (5.0 + t[0], t[1])
hrims = loops_of(hv_new); hrim = min(hrims, key=lambda l: np.mean([v.co.z for v in l]) + (0 if len(l) > 12 else 9)); print('head of the first version: verts', len(HV), 'tris', nf, '| open rims', sorted([len(l) for l in hrims], reverse=True)[:6], 'neck rim', len(hrim), 'z %.3f..%.3f' % (min(v.co.z for v in hrim), max(v.co.z for v in hrim)))
def prep_loop(lp):
    c = np.array([v.co[:] for v in lp]); area = sum(c[k, 0] * c[(k + 1) % len(c), 1] - c[(k + 1) % len(c), 0] * c[k, 1] for k in range(len(c)))
    if area < 0: lp = lp[::-1]; c = c[::-1]
    k0 = int(np.argmin(abs(np.arctan2(c[:, 1] - 0.005, c[:, 0])))); lp = lp[k0:] + lp[:k0]; c = np.roll(c, -k0, 0)
    an = np.unwrap(np.arctan2(c[:, 1] - 0.005, c[:, 0])); an = np.maximum.accumulate(an - an[0]); return lp, np.r_[an, 2 * math.pi] / (2 * math.pi)
A_, ta = prep_loop(brim); B_, tb = prep_loop(hrim); i = j = 0; na, nb_ = len(A_), len(B_); nz = 0
while i < na or j < nb_:
    if j >= nb_ or (i < na and ta[i + 1] <= tb[j + 1]): tri = (A_[i % na], A_[(i + 1) % na], B_[j % nb_]); i += 1
    else: tri = (B_[j % nb_], B_[(j + 1) % nb_], A_[i % na]); j += 1
    try: fc = bm.faces.new(tri)
    except ValueError: continue
    fc.smooth = True; nz += 1
    for l in fc.loops: l[LU].uv = (0.0, 0.0); l[LO].uv = (0.0, 0.0)
rest = [e_ for e_ in bm.edges if e_.is_boundary]; small = []
for lp in loops_of(bm.verts[:]):
    if len(lp) <= 40: small += [e_ for e_ in bm.edges if e_.is_boundary and e_.verts[0] in lp and e_.verts[1] in lp]
if small: bmesh.ops.holes_fill(bm, edges=small, sides=0)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.normal_update()
if sum(f.normal.dot(f.calc_center_median() - Vector((0, 0, 0.9))) * f.calc_area() for f in bm.faces) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
print('sewn at the neck: seam triangles', nz, 'small holes of the old head closed', len(small), '| whole body: verts', len(bm.verts), 'faces', len(bm.faces), 'quads', sum(1 for f in bm.faces if len(f.verts) == 4), 'open edges', sum(1 for e_ in bm.edges if e_.is_boundary), 'non-manifold edges', sum(1 for e_ in bm.edges if not e_.is_manifold))
bm.to_mesh(me); bm.free(); me.update(); HAIR = {}
# ---------------- armature
arm = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name); b.head = Vector(tuple(map(float, head))); b.tail = Vector(tuple(map(float, tail)))
    if parent: b.parent = arm.edit_bones[parent]
core = [n for n in BN if not n.startswith(('skirt_', 'ribbon_', 'hair_'))]
for n in core: bone(n, BH[n], BT[n], BP[n] or None)
for c, col in enumerate(Z.CH_COLS):
    for k in range(len(Z.CH_ROWS) - 1): bone(Z.bone_name(c, k), gridv[Z.CH_ROWS[k], col], gridv[Z.CH_ROWS[k + 1], col], Z.bone_name(c, k - 1) if k else 'pelvis')
for k in sorted(bones_extra, key=lambda k: k.endswith('_1')): bone(k, *bones_extra[k])
for b in arm.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT'); print('skeleton: bones', len(arm.bones), 'same order as pass 3:', [b.name for b in arm.bones][:len(core)] == core)
for o in [body, gown, stock, shoes, rib, lace]:
    o.parent = ao; md = o.modifiers.new('rig', 'ARMATURE'); md.object = ao
    for b in arm.bones:
        if b.name not in o.vertex_groups: pass
# ---------------- cloth rig file (the bake, the build check, a runtime solver)
g2 = lambda p: np.stack([np.asarray(p, float)[..., 0], np.asarray(p, float)[..., 2], -np.asarray(p, float)[..., 1]], -1)
for sd in 'LR':
    th_, sh_ = [c for c in caps if c[0] == 'thigh_' + sd][0], [c for c in caps if c[0] == 'shin_' + sd][0]
    caps.append((th_[0], th_[1], th_[2], th_[3] + 0.05, th_[4] + 0.06, 1)); caps.append((sh_[0], sh_[1], sh_[2], sh_[3] + 0.08, sh_[4] + 0.10, 1))
    caps += [('upperarm_' + sd, J['S' + sd], J['E' + sd], 0.045, 0.038, 1), ('forearm_' + sd, J['E' + sd], J['E' + sd] + (J['W' + sd] - J['E' + sd]) * 0.8, 0.038, 0.030, 1)]
caps += [('pelvis', np.array([-0.075, 0.01, 0.90]), np.array([0.075, 0.01, 0.90]), 0.115, 0.115, 1), ('spine', np.array([0, 0.0, 1.0]), np.array([0, 0.0, 1.16]), 0.105, 0.10, 1),
         ('chest', np.array([-0.055, -0.02, 1.30]), np.array([0.055, -0.02, 1.30]), 0.12, 0.12, 1), ('neck', np.array([0, 0.008, 1.44]), np.array([0, 0.012, 1.55]), 0.042, 0.042, 1),
         ('head', np.array([0, 0.012, 1.60]), np.array([0, 0.012, 1.66]), 0.085, 0.085, 1)]
dmin = {}
for bn, a_, b_, r0, r1, st in caps:
    if st == 0:
        d_, t_ = seg_d(gridv.reshape(-1, 3), a_, b_); dmin[bn] = min(dmin.get(bn, 9), float((d_ - (r0 + (r1 - r0) * t_)).min()))
print('rest clearance, gown to leg capsules (m):', {k: round(v, 4) for k, v in dmin.items()})
bnames = [b.name for b in arm.bones]; tails = np.array([ao.matrix_world @ b.tail_local for b in arm.bones])
np.savez_compressed(WD + '/cloth_rig.npz', grid=g2(gridv), gw_names=np.array(list(GWs)), gw=np.stack([GWs[k] for k in GWs], -1).astype(np.float32),
                    ch_cols=np.array(Z.CH_COLS), ch_rows=np.array(Z.CH_ROWS), cap_bone=np.array([c[0] for c in caps]), cap_p0=g2([c[1] for c in caps]), cap_p1=g2([c[2] for c in caps]),
                    cap_r=np.array([[c[3], c[4]] for c in caps]), cap_set=np.array([c[5] for c in caps]), tail_names=np.array(bnames), tail_pos=g2(tails))
bpy.ops.wm.save_as_mainfile(filepath=WD + '/layers.blend')
# ---------------- check image
cols = {'elise_body': (0.86, 0.72, 0.66, 1), 'elise_gown': (0.12, 0.12, 0.15, 1), 'elise_stockings': (0.35, 0.27, 0.26, 1), 'elise_shoes': (0.07, 0.07, 0.08, 1), 'elise_ribbons': (0.5, 0.12, 0.15, 1), 'elise_lacing': (0.05, 0.05, 0.06, 1)}
for o in bpy.data.objects:
    if o.name in cols: o.color = cols[o.name]
cam = rend.setup(); R = lambda n, v, w, h: (n, rend.shot(cam, f'{WD}/r/_b{n}.png', v, w, h))
rows = [[R(n, v, 420, 800) for n, v in (('front', [0, 0, 0.88, 1.8, 0, 0]), ('left', [0, 0, 0.88, 1.8, 90, 0]), ('back', [0, 0, 0.88, 1.8, 180, 0]), ('right', [0, 0, 0.88, 1.8, 270, 0]), ('3q', [0, 0, 0.88, 1.8, 35, 5]), ('3q back', [0, 0, 0.88, 1.8, 215, 5]))],
        [R(n, v, 504, 504) for n, v in (('head', [0, 0.02, 1.61, 0.36, 0, 0]), ('head 3q', [0, 0.02, 1.61, 0.36, 40, 5]), ('head back', [0, 0.05, 1.62, 0.38, 180, 10]), ('lacing', [0.12, -0.05, 0.86, 0.42, 45, 0]), ('feet', [0.02, -0.03, 0.12, 0.42, 60, 8]))]]
rend.montage(rows, WD + '/r/b1_layers.jpg')
