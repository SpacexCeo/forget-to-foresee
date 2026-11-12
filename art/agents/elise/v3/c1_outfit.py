"""Elise v3, stage 4: her outfit, each piece its own mesh built over the new body (see docs/art/elise/v3-plan.md).
Gown (ONE quad grid from the collar to the hem: halter front, open back, laced opening, slit, a turned-in lip on every
free edge), stockings, closed-toe pumps, wrist wraps with two tails, lacing cords with a bow. Everything is skinned to
one armature: her bones from skeleton.json, the skirt chains re-seated on the new gown grid. The skirt's width is a
designed profile; nothing is measured from the earlier models.
    blender -b <work dir>/head.blend -P c1_outfit.py -- <work dir>     writes dressed.blend, cloth_rig.npz, r/c1.jpg"""
import bpy, bmesh, sys, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
import json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'v2')); sys.path.insert(0, HERE); import ezones as Z, review
WD = sys.argv[sys.argv.index("--") + 1]
unit = lambda v: np.asarray(v, float) / np.linalg.norm(v)
ramp = lambda x, a_, b_: np.clip((np.asarray(x) - a_) / (b_ - a_), 0, 1)
sstep = Z.sstep
SK = json.load(open(HERE + '/skeleton.json'))
body = bpy.data.objects['elise_body']; me = body.data; NBV = len(me.vertices)
hair = bpy.data.objects['elise_hair']; pin = bpy.data.objects['elise_pin']
for o in list(bpy.data.objects):
    if o not in (body, hair, pin): bpy.data.objects.remove(o)
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
BN = list(SK); BH = {k: np.array(v['head'], float) for k, v in SK.items()}; BT = {k: np.array(v['tail'], float) for k, v in SK.items()}; BP = {k: v['parent'] for k, v in SK.items()}
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
    # the thigh capsule starts under the hip joint, not at the centre of the leg's cross section: that centre sits
    # 3 cm in towards the crotch, and a thinner capsule there sweeps the gown's front slit edge off the left thigh
    # and behind the right knee on the stairs (the radius below still covers the whole section)
    top = np.array([J['hip' + sd][0], J['hip' + sd][1], 0.66])
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
# the skirt's width is designed: the hips' own outline at the top, rounding out to an even bell below (the flare to the
# hem is added by gown_ease), never closer to the legs than their own outline
def rskirt(th, z):
    s_ = float(sstep((0.80 - z) / 0.40)); round_ = 0.150 + 0.028 * abs(math.sin(math.radians(th))) + 0.012 * max(0.0, -math.cos(math.radians(th)))
    return max(float(renv(th, max(z, EZ[0]))) + 0.004, float(renv(th, 0.80)) * (1 - s_) + round_ * s_)
ZC0, ZC1 = 1.438, 1.482                      # the collar band
def slit(z):
    t1, t2 = (float(v) for v in Z.gown_slit(min(z, 0.955)))
    if z > 0.955: k = min(1, (z - 0.955) / 0.02); t1, t2 = t1 + (50 - t1) * k, t2 + (50 - t2) * k
    return t1, t2
def edge_deg(z):
    """Half-angle of the gown's front panel at height z (180: closed all round). Open back V, then the halter line."""
    return float(np.interp(z, [1.10, 1.345, ZC0], [180.0, 104.0, 38.0]))
NU, NV = Z.NU, Z.NV; ZB = list(np.linspace(Z.ZT, 1.345, 23)[1:]) + list(np.linspace(1.345, ZC0, 8)[1:])
rows_z = []; LV = []; NR = NV + len(ZB); gi = np.zeros((NR + 1, NU + 1), int); thn = np.zeros((NR + 1, NU + 1)); zrow = np.zeros(NR + 1)
for jj in range(NR + 1):
    j = NR - jj                              # grid row 0 is the collar top; the skirt rows keep their pass-3 order below
    for i in range(NU + 1):
        u = i / NU; thl = 114.0 + u * (360 - 108.0)
        if jj >= len(ZB): js = jj - len(ZB); zh = 0.045 + 0.008 * math.cos(math.radians(thl)); z = Z.ZT + (zh - Z.ZT) * js / NV
        else: z = ZB[len(ZB) - 1 - jj]
        t1, t2 = slit(z); th = t2 + u * (360 - (t2 - t1)); tn = (th + 180) % 360 - 180
        if z > 1.10: tn = tn * edge_deg(z) / 180.0; th = tn      # the columns close in with the open back and the halter line: the cloth's edge is a grid line, not a staircase
        r = float(renv(th, max(z, EZ[0])))
        if z < Z.ZT + 1e-6: r = rskirt(th, z) + 0.002 * min(1, max(0, (z - 0.74) / 0.06)) + float(Z.gown_ease(th, z))
        else: r += 0.004 + 0.004 * float(sstep((z - 1.16) / 0.06))
        p = np.array([r * math.sin(math.radians(th)), 0.005 - r * math.cos(math.radians(th)), z])
        if z < 0.80:
            while leg_sd(p[None])[0] < 0.014: r += 0.003; p = np.array([r * math.sin(math.radians(th)), 0.005 - r * math.cos(math.radians(th)), z])
        gi[jj, i] = len(LV); LV.append(p); thn[jj, i] = tn; zrow[jj] = z
LV = np.array(LV); NB_ = len(ZB)               # grid rows 0..NB_ are the bodice (top down), NB_..NR the skirt
cov = np.ones((NR, NU), bool)
for jj in range(NR):
    zc = (zrow[jj] + zrow[jj + 1]) / 2
    if 1.10 < zc:
        for i in range(NU):
            tc = math.degrees(math.atan2(math.sin(math.radians(thn[jj, i])) + math.sin(math.radians(thn[jj, i + 1])), math.cos(math.radians(thn[jj, i])) + math.cos(math.radians(thn[jj, i + 1]))))
            cov[jj, i] = abs(tc) < edge_deg(zc) - 0.5 and abs(thn[jj, i] - thn[jj, i + 1]) < 90 and abs(thn[jj + 1, i] - thn[jj + 1, i + 1]) < 90
LF = [(gi[jj, i], gi[jj + 1, i], gi[jj + 1, i + 1], gi[jj, i + 1]) for jj in range(NR) for i in range(NU) if cov[jj, i]]
gown = make_obj('elise_gown', LV, LF)
bm = bmesh.new(); bm.from_mesh(gown.data); bm.verts.ensure_lookup_table(); GC = bm.verts.layers.float_vector.new('grid')
for jj in range(NR + 1):
    for i in range(NU + 1): bm.verts[int(gi[jj, i])][GC] = (i, jj, 1.0)
# the two edge columns close above the laced opening
bm.verts.ensure_lookup_table(); seam = [bm.verts[int(gi[jj, c])] for jj in range(NR + 1) if zrow[jj] > 0.975 for c in (0, NU)]
bmesh.ops.remove_doubles(bm, verts=seam, dist=2e-4)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# the collar: a band of its own around the neck, over the top of the halter panel
NCL = 28; crow = []
for z_, ex_ in ((ZC0 - 0.002, 0.0075), (ZC0 + 0.016, 0.0075), (ZC1, 0.0075)):
    ring_ = []
    for k in range(NCL):
        th_ = 360.0 * k / NCL - 180; r_ = float(renv(th_, z_)) + ex_; v_ = bm.verts.new((r_ * math.sin(math.radians(th_)), 0.005 - r_ * math.cos(math.radians(th_)), z_)); v_[GC] = (0, 0, 1.0); ring_.append(v_)
    crow.append(ring_)
for a_, b_ in zip(crow, crow[1:]):
    for k in range(NCL): bm.faces.new((a_[k], a_[(k + 1) % NCL], b_[(k + 1) % NCL], b_[k]))
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
# ---------------- hair and pin: on the head; the two face locks swing on their own bones
for o in (hair, pin):
    P_ = np.array([v.co[:] for v in o.data.vertices]); W_ = {'head': np.ones(len(P_))}
    if o is hair:
        for sd, sg in (('L', 1), ('R', -1)):
            h0, h1 = BH[f'hair_{sd}_0'], BH[f'hair_{sd}_1']; m = (P_[:, 0] * sg > 0.040) & (P_[:, 1] < 0.0) & (P_[:, 2] < h0[2] + 0.03)
            w = m * ramp(h0[2] + 0.03 - P_[:, 2], 0, 0.05); w1 = ramp(h1[2] + 0.012 - P_[:, 2], 0, 0.03)
            W_[f'hair_{sd}_0'] = w * (1 - w1); W_[f'hair_{sd}_1'] = w * w1; W_['head'] = W_['head'] - w
    set_weights(o, W_)
# ---------------- armature
arm = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name); b.head = Vector(tuple(map(float, head))); b.tail = Vector(tuple(map(float, tail)))
    if parent: b.parent = arm.edit_bones[parent]
core = [n for n in BN if not n.startswith(('skirt_', 'ribbon_'))]
for n in core: bone(n, BH[n], BT[n], BP[n] or None)
for c, col in enumerate(Z.CH_COLS):
    for k in range(len(Z.CH_ROWS) - 1): bone(Z.bone_name(c, k), gridv[Z.CH_ROWS[k], col], gridv[Z.CH_ROWS[k + 1], col], Z.bone_name(c, k - 1) if k else 'pelvis')
for k in sorted(bones_extra, key=lambda k: k.endswith('_1')): bone(k, *bones_extra[k])
for b in arm.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT'); print('skeleton: bones', len(arm.bones), 'same order as pass 3:', [b.name for b in arm.bones][:len(core)] == core)
for o in [body, gown, stock, shoes, rib, lace, hair, pin]:
    o.parent = ao
    for md in list(o.modifiers): o.modifiers.remove(md)
    md = o.modifiers.new('rig', 'ARMATURE'); md.object = ao
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
bpy.ops.wm.save_as_mainfile(filepath=WD + '/dressed.blend')
# ---------------- review sheet
COL = {'elise_gown': (30, 30, 37), 'elise_stockings': (84, 64, 64), 'elise_shoes': (18, 18, 22), 'elise_ribbons': (132, 36, 46), 'elise_lacing': (14, 14, 18)}
for n, c in COL.items():
    m = bpy.data.materials.new(n + '_flat'); m.diffuse_color = tuple((x / 255) ** 2.2 for x in c) + (1,); o = bpy.data.objects[n]; o.data.materials.clear(); o.data.materials.append(m)
V4 = lambda az, el=0: [0, 0, 0.88, 1.86, az, el]
VIEWS = [[(n, V4(az, el), 520, 960) for n, az, el in (('front', 0, 0), ('her left', 90, 0), ('back', 180, 0), ('her right', 270, 0))],
         [('three quarter', V4(35, 5), 520, 960), ('three quarter back', V4(215, 5), 520, 960), ('bust', [0, 0, 1.50, 0.62, 20, 3], 520, 960), ('slit and lacing', [0.10, -0.05, 0.62, 0.9, 50, 0], 520, 960)]]
review.sheet(WD, VIEWS, 'c1.jpg')
