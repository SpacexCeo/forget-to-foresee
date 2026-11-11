"""Elise stage B: Blender build from the cut parts (a3_parts.py): procedural hands and ribbon tails, her own
armature (Iris's bone names and hierarchy, her proportions), analytic weights, UVs. Saves elise_build.blend and
bake_in.npz for the texture bake.   blender -b -P b_build.py -- <work dir> <tris scale, 1 = main>"""
import bpy, bmesh, sys, json, math
import numpy as np
from mathutils import Vector
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
objs = {}
objs['head'] = make_obj('elise_head', hv, hf); objs['body'] = make_obj('elise_body', bv, bf)
bones_extra = {}
for sd, sg in (('L', 1), ('R', -1)):
    G, hb = hand(sd)
    d = unit(J['W' + sd] - J['E' + sd]); t = unit(np.array([0, -1, 0]) - d * (-d[1])); o = np.cross(t, d) * sg
    M = np.stack([t, d, o], 1); T = lambda p: J['W' + sd] + M @ np.asarray(p, float)
    ob = make_obj('elise_hand_' + sd, [T(v) for v in G.v], G.f); recalc(ob)
    set_weights(ob, {k: np.array([g.get(k, 0) for g in G.g]) for k in {k for g in G.g for k in g}}); objs['hand' + sd] = ob
    for k, (h_, t_) in hb.items(): bones_extra[k] = (T(h_), T(t_), 'hand_' + sd if k != 'hand_' + sd else 'forearm_' + sd)
    top = np.array(P['arm'][sd]['wrap_mid']) + [sg * (P['arm'][sd]['radius'] - 0.004), 0.004, -0.012]
    G = ribbons(sd, top, sg); ob = make_obj('elise_ribbon_' + sd, G.v, G.f); recalc(ob)
    set_weights(ob, {k: np.array([g.get(k, 0) for g in G.g]) for k in {k for g in G.g for k in g}}); objs['ribbon' + sd] = ob
    bones_extra[f'ribbon_{sd}_0'] = (top, top + [sg * 0.008, 0, -0.14], 'forearm_' + sd); bones_extra[f'ribbon_{sd}_1'] = (top + [sg * 0.008, 0, -0.14], top + [sg * 0.018, 0, -0.28], f'ribbon_{sd}_0')

# ---------------- weights: body
V = bv; x, y, z = V[:, 0], V[:, 1], V[:, 2]; n = len(V); W = {}
def add(k, w): W[k] = W.get(k, np.zeros(n)) + w
legm = bpart >= 2; body = ~legm
tk = ramp(z, KZ - 0.05, KZ + 0.05)
for sd, sg, pid in (('L', 1, 2), ('R', -1, 3)):
    m = (bpart == pid).astype(float); ta = ramp(z, 0.085, 0.135); by = J['ball' + sd][1]
    toe = ramp(-y, -by - 0.012, -by + 0.012) * (1 - ramp(z, 0.05, 0.09)); foot = 1 - ta
    add('thigh_' + sd, m * tk); add('shin_' + sd, m * ta * (1 - tk)); add('foot_' + sd, m * foot * (1 - toe)); add('toe_' + sd, m * foot * toe)
sL = ramp(x, -0.05, 0.05); side = abs(x)
isarm = body & (side > np.interp(z, GZ, GX)) & (z < 1.25)
tor = body & ~isarm
wth = ramp(0.93 - z, 0, 0.13)
def seg_dist(P_, A_, B_):
    ab = B_ - A_; t_ = np.clip(((P_ - A_) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P_ - A_ - np.outer(t_, ab), axis=1)
prox = {sd: 1 - ramp(np.minimum(seg_dist(V, J['hip' + sd], J['knee' + sd]), seg_dist(V, J['knee' + sd], J['ank' + sd])), 0.075, 0.105) for sd in 'LR'}
tot = np.maximum(prox['L'] + prox['R'], 1.0); prox = {k: v / tot for k, v in prox.items()}; rem = 1 - prox['L'] - prox['R']
rxy = np.maximum(np.hypot(x, y), 1e-6); ux, uy = x / rxy, y / rxy
sec = {'F': np.where(uy < 0, uy * uy, 0.0), 'B': np.where(uy > 0, uy * uy, 0.0), 'L': np.where(ux > 0, ux * ux, 0.0), 'R': np.where(ux < 0, ux * ux, 0.0)}
a_sh = ramp(side, 0.075, 0.125) * ramp(z, 1.24, 1.30) * (1 - ramp(z, 1.45, 1.49)); shb = 0.5 * ramp(side, 0.03, 0.08) * (1 - a_sh) * ramp(z, 1.33, 1.40) * (1 - ramp(z, 1.45, 1.49))
core = tor * (1 - a_sh - shb)
add('pelvis', core * (1 - ramp(z, 0.98, 1.06)) * (1 - wth)); add('spine', core * ramp(z, 0.98, 1.06) * (1 - ramp(z, 1.16, 1.24)))
add('chest', core * ramp(z, 1.16, 1.24) * (1 - ramp(z, 1.44, 1.49))); add('neck', core * ramp(z, 1.44, 1.49))
for nm in 'FB':
    add(f'skirt_{nm}_0', core * wth * rem * sec[nm] * tk); add(f'skirt_{nm}_1', core * wth * rem * sec[nm] * (1 - tk))
for sd, sg, s_ in (('L', 1, sL), ('R', -1, 1 - sL)):
    own = prox[sd] + rem * sec[sd]
    add('thigh_' + sd, core * wth * own * tk); add('shin_' + sd, core * wth * own * (1 - tk))
    ms = (x * sg > 0)
    S, E, Wr = J['S' + sd], J['E' + sd], J['W' + sd]; u1 = unit(E - S); u2 = unit(Wr - E); L1 = np.linalg.norm(E - S); L2 = np.linalg.norm(Wr - E)
    fore = ramp((V - S) @ u1, L1 - 0.04, L1 + 0.04); hd = ramp((V - E) @ u2, L2 - 0.02, L2 + 0.02) * 0.6
    am = (isarm & ms).astype(float)
    add('upperarm_' + sd, am * (1 - fore) + tor * ms * a_sh); add('forearm_' + sd, am * fore * (1 - hd)); add('hand_' + sd, am * fore * hd); add('shoulder_' + sd, tor * ms * shb)
W = smooth_w(W, bf, n, 3)
set_weights(objs['body'], W)
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
mid = lambda k: (J[k + 'L'] + J[k + 'R']) / 2
for nm in 'FB':     # skirt panels: pivots on the hip line and the knee line (art/anim/ftfanim/skirt.py drives them)
    bone(f'skirt_{nm}_0', mid('hip'), mid('knee'), 'pelvis'); bone(f'skirt_{nm}_1', mid('knee'), mid('ank'), f'skirt_{nm}_0')
order = sorted(bones_extra, key=lambda k: (k.startswith(('thumb', 'index', 'fingers', 'prop')), k.endswith('_1')))
for k in order:
    h_, t_, par = bones_extra[k]; bone(k, h_, t_, par)
for b in arm.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT')
# ---------------- join, modifiers, UV
part_id = {'body': 0, 'head': 1, 'handL': 2, 'handR': 2, 'ribbonL': 3, 'ribbonR': 3}
for k, o in objs.items():
    at = o.data.attributes.new('part', 'INT', 'FACE'); pv = np.full(len(o.data.polygons), part_id[k], np.int32)
    if k == 'body':
        fv = np.array([list(p.vertices)[:3] for p in o.data.polygons]); lp = bpart[fv].max(1); pv[lp == 2] = 4; pv[lp == 3] = 5
    at.data.foreach_set('value', pv)
    for p in o.data.polygons: p.use_smooth = True
bpy.ops.object.select_all(action='DESELECT')
for o in objs.values(): o.select_set(True)
bpy.context.view_layer.objects.active = objs['body']; bpy.ops.object.join(); el = objs['body']; el.name = 'elise'; el.data.name = 'elise'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale(); bpy.ops.object.mode_set(mode='OBJECT')
me = el.data; pa = np.empty(len(me.polygons), np.int32); me.attributes['part'].data.foreach_get('value', pa)
uv = me.uv_layers.active.data; lt = np.empty(len(me.loops) * 2); uv.foreach_get('uv', lt); lt = lt.reshape(-1, 2)
ls = np.array([p.loop_start for p in me.polygons]); fz = np.array([p.center.z for p in me.polygons]); fy_ = np.array([p.center.y for p in me.polygons]); fx_ = np.array([p.center.x for p in me.polygons])
k = np.ones(len(me.polygons)); k[pa == 1] = 1.5; k[(pa == 1) & (fy_ < -0.03) & (fz > 1.52) & (fz < 1.68) & (abs(fx_) < 0.08)] = 2.6; k[pa == 5] = 0.6; k[pa == 2] = 0.8
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
