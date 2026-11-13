"""Elise v5: the owner's model (v4: ../v4/src) with BOTH legs alive under the dress.

What changed against v4 (s20_owner_rig.py), and why:
- Leg joints. v4 kept the leg joints of her older body: the knee sat 8 cm below the model's own knee (in the upper
  calf) and the bones ran outside the legs. The hips, knees, ankles and toes now sit where the file's own rig has
  them (made symmetric), so a leg bends at its knee and the leg bones run inside the legs.
- Leg weights. The file's own weights for both legs and shoes (cleaned: nothing of the other side's leg; above the
  hip joint the thigh hands over to the pelvis, because the dress is skin-tight on the hips). Nothing hangs a leg
  on the hips any more: v4 held the right leg at 85% to keep it inside the dress, so it did not walk.
- The cloth grid is cut from this dress itself (plane cuts, outer envelope, slit edge to slit edge) and starts at
  the height of the hip joints, where a turning thigh moves nothing. v4's grid started 14 cm lower, on a moving
  thigh, and its colliders were the older body's capsules shrunk until they fitted.
- Colliders are fitted to this body: both thighs, knees, calves, ankles, shoes and heels, and the hips. The clip
  build simulates the dress against all of them (art/anim/ftfanim/skirt.py).

    blender -b -P s30_two_legs.py -- <model.fbx> <texture.jpg> <work dir> <name> <base triangles> [outline mm 2.2]
Writes <name>.blend, <name>_raw.glb (toon material + inverted hull outline), cloth_rig.npz (grid, weights, colliders)
and skeleton.json (her 90 bones with the new leg joints).
"""
import bpy, bmesh, sys, os, json
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[sys.argv.index('--') + 1:]
SRC, TEX, WD, NAME, TRIS = a[0], a[1], a[2], a[3], int(a[4]); MM = float(a[5]) if len(a) > 5 else 2.2
HEIGHT = 1.741
V3RIG = os.path.join(HERE, '..', 'v3', 'out', 'cloth_rig.npz')      # the body shapes the ribbons and strands collide with
SK = json.load(open(os.path.join(HERE, '..', 'v3', 'skeleton.json')))
ss = lambda a_, b_, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a_) / (b_ - a_), 0, 1))
g2 = lambda p_: np.stack([np.asarray(p_, float)[..., 0], np.asarray(p_, float)[..., 2], -np.asarray(p_, float)[..., 1]], -1)   # Blender -> glTF axes

MAP = {'Hips': 'pelvis', 'Spine': 'spine', 'Spine1': 'chest', 'Spine2': 'chest', 'Neck': 'neck', 'Head': 'head'}
for s_, S_ in (('L', 'Left'), ('R', 'Right')):
    MAP.update({S_ + 'Shoulder': 'shoulder_' + s_, S_ + 'Arm': 'upperarm_' + s_, S_ + 'ForeArm': 'forearm_' + s_, S_ + 'Hand': 'hand_' + s_,
                S_ + 'UpLeg': 'thigh_' + s_, S_ + 'Leg': 'shin_' + s_, S_ + 'Foot': 'foot_' + s_, S_ + 'ToeBase': 'toe_' + s_})
    for f_, t_ in (('Index', 'index_'), ('Middle', 'fingers_'), ('Ring', 'fingers_'), ('Pinky', 'fingers_'), ('Thumb', 'thumb_')):
        for k_ in (1, 2, 3, 4): MAP[f'{S_}Hand{f_}{k_}'] = t_ + s_

# ---------------- the file: mesh, weights, its own leg joints
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=SRC)
el = next(o for o in bpy.data.objects if o.type == 'MESH'); me = el.data; n = len(me.vertices)
src_arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
M = el.matrix_world; co = np.array([(M @ v.co)[:] for v in me.vertices])
sc = HEIGHT / (co[:, 2].max() - co[:, 2].min()); z0 = co[:, 2].min() * sc; co *= sc; co[:, 2] -= z0
fj = {b.name.split(':')[-1]: np.array((src_arm.matrix_world @ b.head_local)[:]) * sc - np.array([0, 0, z0]) for b in src_arm.data.bones}
W0 = {}                                                # the file's weights under her bone names
gname = {g.index: g.name.split(':')[-1] for g in el.vertex_groups}
for v in me.vertices:
    for g in v.groups:
        k = MAP.get(gname[g.group])
        if k: W0.setdefault(k, np.zeros(n))[v.index] += g.weight
for o in [o for o in bpy.data.objects if o is not el]: bpy.data.objects.remove(o)
el.parent = None; el.matrix_world.identity()
for md in list(el.modifiers): el.modifiers.remove(md)
for vg in list(el.vertex_groups): el.vertex_groups.remove(vg)
me.vertices.foreach_set('co', co.ravel()); me.update()
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free(); me.update()
img = bpy.data.images.load(TEX); img.name = 'agent_elise_base'
mat = bpy.data.materials.new('elise_toon'); mat.use_nodes = True; bs = mat.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Metallic'].default_value = 0.0
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; mat.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color']); mat.use_backface_culling = False
me.materials.clear(); me.materials.append(mat)


def arrays():
    n_ = len(me.vertices); c = np.empty(n_ * 3); me.vertices.foreach_get('co', c); f = np.empty(len(me.polygons) * 3, np.int32); me.polygons.foreach_get('vertices', f); return n_, c.reshape(-1, 3), f.reshape(-1, 3)


def colours(n_):
    W_, H_ = img.size; px = np.array(img.pixels[:]).reshape(H_, W_, -1)[:, :, :3]
    uv = np.empty(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2); lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    c = px[np.clip((uv[:, 1] * H_).astype(int), 0, H_ - 1), np.clip((uv[:, 0] * W_).astype(int), 0, W_ - 1)]; s = np.zeros((n_, 3)); k = np.zeros(n_); np.add.at(s, lv, c); np.add.at(k, lv, 1); return s / np.maximum(k, 1)[:, None]


n, co, fv = arrays(); col = colours(n); x, y, z = co.T
get = lambda k: W0.get(k, np.zeros(n))
# the file is built of separate pieces: the body with both legs, the dress, the hair, the lacing, the ribbons, the eyes
par = np.arange(n)
def find(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for a_, b_ in np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]]]):
    ra, rb = find(a_), find(b_)
    if ra != rb: par[ra] = rb
comp = np.array([find(i) for i in range(n)]); ids, cnt = np.unique(comp, return_counts=True); order = ids[np.argsort(-cnt)]
BODY = comp == order[0]; zr = {c: (z[comp == c].min(), z[comp == c].max()) for c in order[:12]}
dress_id = next(c for c in order[1:12] if zr[c][1] - zr[c][0] > 1.0); DRESS = comp == dress_id
red = (col[:, 0] > 0.25) & (col[:, 0] > 1.8 * col[:, 1])
LACE = ~BODY & ~DRESS & ~red & (z < 1.12) & (z > 0.5) & (np.abs(x) < 0.2)          # the lacing and its bow ride the dress
armw = sum(get(p + s_) for s_ in 'LR' for p in ('upperarm_', 'forearm_', 'hand_', 'index_', 'fingers_', 'thumb_')); arm = armw > 0.5
print('pieces: %d; body %d vertices, dress %d, lacing %d, red %d, arm %d' % (len(ids), BODY.sum(), DRESS.sum(), LACE.sum(), red.sum(), arm.sum()))

# ---------------- her skeleton with the legs on this model's own joints (left and right made symmetric)
J = {}
for key, nm in (('hip', 'UpLeg'), ('knee', 'Leg'), ('ankle', 'Foot'), ('ball', 'ToeBase'), ('tip', 'ToeBase')):
    l_, r_ = fj['Left' + nm], fj['Right' + nm]
    J[key] = np.array([(abs(l_[0]) + abs(r_[0])) / 2, (l_[1] + r_[1]) / 2, (l_[2] + r_[2]) / 2])
tip_src = [k for k in fj if k.startswith('LeftToe') and k != 'LeftToeBase']
J['tip'] = J['ball'] + np.array([0, -0.045, -0.012]) if not tip_src else np.array([J['ball'][0], (fj[tip_src[0]][1] + fj[tip_src[0].replace('Left', 'Right')][1]) / 2, max(J['ball'][2] - 0.02, 0.012)])
SK = json.loads(json.dumps(SK))
for sd, sgn in (('L', 1.0), ('R', -1.0)):
    p = {k: (v * np.array([sgn, 1, 1])).tolist() for k, v in J.items()}
    for bone, h_, t_ in (('thigh_', 'hip', 'knee'), ('shin_', 'knee', 'ankle'), ('foot_', 'ankle', 'ball'), ('toe_', 'ball', 'tip')):
        SK[bone + sd]['head'] = p[h_]; SK[bone + sd]['tail'] = p[t_]
BH = {k: np.array(v['head']) for k, v in SK.items()}
print('leg joints (m): hip %s knee %s ankle %s ball %s; thigh %.3f shin %.3f' % (np.round(J['hip'], 3), np.round(J['knee'], 3), np.round(J['ankle'], 3), np.round(J['ball'], 3), np.linalg.norm(J['hip'] - J['knee']), np.linalg.norm(J['knee'] - J['ankle'])))

# ---------------- weights
W = {k: np.zeros(n) for k in SK}
upper = ('pelvis', 'spine', 'chest', 'neck', 'head') + tuple(p + s_ for s_ in 'LR' for p in ('shoulder_', 'upperarm_', 'forearm_', 'hand_', 'index_', 'fingers_', 'thumb_'))
legs = tuple(p + s_ for s_ in 'LR' for p in ('thigh_', 'shin_', 'foot_', 'toe_'))
for k in upper + legs: W[k] = get(k).copy()
# a leg never carries the other leg's skin (the file's weights leak across where the thighs touch)
for p in ('thigh_', 'shin_', 'foot_', 'toe_'):
    wl, wr_ = W[p + 'L'], W[p + 'R']; onR = x < -0.004; onL = x > 0.004
    wr_[onR] += wl[onR]; wl[onR] = 0; wl[onL] += wr_[onL]; wr_[onL] = 0
# above the hip joint the thigh hands over to the pelvis: the dress is skin-tight on the hips and rides the pelvis there
fade = ss(J['hip'][2] + 0.03, J['hip'][2] - 0.05, z)
for sd in 'LR':
    k = 'thigh_' + sd; W['pelvis'] += W[k] * (1 - fade); W[k] = W[k] * fade
# everything that is not the body (dress top, hair, lacing...) keeps off the legs unless the cloth grid takes it below
legw = sum(W[k] for k in legs); other = ~BODY
W['pelvis'][other] += legw[other]
for k in legs: W[k][other] = 0
for sd in 'LR':                                        # ribbon tails: with the hand, the tips sway on her ribbon bones
    tails_m = red & (z < 0.955) & ((x > 0) if sd == 'L' else (x < 0)) & (np.abs(x) > 0.2)
    u_r = 0.6 * ss(0.92, 0.78, z); u_1 = ss(0.84, 0.76, z)
    for k in upper + legs: W[k][tails_m] = 0
    W['hand_' + sd][tails_m] = (1 - u_r)[tails_m]; W['ribbon_%s_0' % sd][tails_m] = (u_r * (1 - u_1))[tails_m]; W['ribbon_%s_1' % sd][tails_m] = (u_r * u_1)[tails_m]

# ---------------- the cloth grid, cut from this dress
R_, C_ = 31, 61; CH_COLS = list(range(0, C_, 5)); CH_ROWS = [0, 6, 13, 21, 30]
Z_TOP = float(J['hip'][2]) - 0.007; Z_CUT = 0.105; Z_HEM = 0.035
dtri = fv[DRESS[fv[:, 0]]]


def cut_all(tris, h):
    """Every polyline of a mesh cut by the plane z = h, [(points [n, 3], length)] (segments are joined by the mesh
    edge they share, so a cut follows the surface and does not jump between the two legs)."""
    zz = co[tris][:, :, 2] - h; segs = []; pts = {}
    for t in np.nonzero((zz.min(1) < 0) & (zz.max(1) >= 0))[0]:
        ks = []
        for i_, j_ in ((0, 1), (1, 2), (2, 0)):
            va, vb = sorted((int(tris[t, i_]), int(tris[t, j_]))); za, zb = co[va, 2] - h, co[vb, 2] - h
            if (za < 0) != (zb < 0):
                ks.append((va, vb)); pts[(va, vb)] = co[va] + (co[vb] - co[va]) * (za / (za - zb))
        if len(ks) == 2: segs.append(ks)
    used = np.zeros(len(segs), bool); ends = {}
    for i_, (p_, q_) in enumerate(segs): ends.setdefault(p_, []).append((i_, 0)); ends.setdefault(q_, []).append((i_, 1))
    out = []
    for i_ in range(len(segs)):
        if used[i_]: continue
        used[i_] = True; ch = [segs[i_][0], segs[i_][1]]
        for fwd in (True, False):
            while True:
                nx = [(j_, e_) for j_, e_ in ends[ch[-1] if fwd else ch[0]] if not used[j_]]
                if not nx: break
                j_, e_ = nx[0]; used[j_] = True
                ch.append(segs[j_][1 - e_]) if fwd else ch.insert(0, segs[j_][1 - e_])
        ch = np.array([pts[k_] for k_ in ch]); out.append((ch, float(np.linalg.norm(np.diff(ch, axis=0), axis=1).sum())))
    return out


def cut(tris, h):
    """The longest polyline of a mesh cut by the plane z = h."""
    return max(cut_all(tris, h), key=lambda c: c[1])


def hull2(P):
    """Indices of the 2D convex hull of points [n, 2], counter-clockwise."""
    idx = np.lexsort((P[:, 1], P[:, 0])); cr = lambda o, a_, b_: (P[a_, 0] - P[o, 0]) * (P[b_, 1] - P[o, 1]) - (P[a_, 1] - P[o, 1]) * (P[b_, 0] - P[o, 0])
    lo = []
    for i_ in idx:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], i_) <= 0: lo.pop()
        lo.append(i_)
    up = []
    for i_ in idx[::-1]:
        while len(up) >= 2 and cr(up[-2], up[-1], i_) <= 0: up.pop()
        up.append(i_)
    return lo[:-1] + up[:-1]


def envelope(ch):
    """A cut of the dress from the side slit edge round the back and her right side to the front slit edge, on its
    outer envelope (the folds of the flare are bridged), resampled to C_ points; also the cut's own length."""
    if ch[0, 0] < ch[-1, 0]: ch = ch[::-1]             # start on the side edge (the larger x), end on the front edge
    L_real = float(np.linalg.norm(np.diff(ch, axis=0), axis=1).sum())
    h = hull2(ch[:, :2]); hs = sorted(set(h) | {0, len(ch) - 1})      # hull vertices in the order of the cut, with both ends
    P = ch[hs]; s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    u = np.linspace(0, s[-1], C_); out = np.stack([np.interp(u, s, P[:, k_]) for k_ in range(3)], -1)
    return out, L_real, float(s[-1])


zs = np.linspace(Z_TOP, Z_HEM, R_); Gn = np.zeros((R_, C_, 3)); slack = np.ones(R_); cut_rows = [i for i in range(R_) if zs[i] >= Z_CUT]
for i in cut_rows:
    row, L_real, L_env = envelope(cut(dtri, zs[i])[0]); row[:, 2] = zs[i]; Gn[i] = row; slack[i] = max(1.0, L_real / L_env)
for k_ in range(2):                                    # the columns run smoothly down the dress
    Gs = Gn.copy(); Gs[cut_rows[1]:cut_rows[-1]] = 0.25 * Gn[cut_rows[0]:cut_rows[-1] - 1] + 0.5 * Gn[cut_rows[1]:cut_rows[-1]] + 0.25 * Gn[cut_rows[2]:cut_rows[-1] + 1]; Gs[:, :, 2] = zs[:, None]; Gn = Gs
lo = cut_rows[-1]                                      # below the last clean cut the hem is scalloped: the flare is carried on down to it
for i in range(lo + 1, R_):
    Gn[i] = Gn[lo] + (Gn[lo] - Gn[lo - 2]) * (zs[lo] - zs[i]) / (zs[lo - 2] - zs[lo]); Gn[i, :, 2] = zs[i]; slack[i] = slack[lo]
perim = np.linalg.norm(np.diff(Gn, axis=1), axis=2).sum(1)
print('cloth grid on the dress: rows z %.3f..%.3f, row length m (top, knee, hem) %.3f %.3f %.3f, slit width %.3f..%.3f, slack of the flare up to x%.2f' % (
    zs[0], zs[-1], perim[0], perim[CH_ROWS[2]], perim[-1], np.linalg.norm(Gn[:, 0] - Gn[:, -1], axis=1).min(), np.linalg.norm(Gn[:, 0] - Gn[:, -1], axis=1).max(), slack.max()))
for c in range(len(CH_COLS)):                          # her 13 skirt chains on the grid
    for k_ in range(len(CH_ROWS) - 1):
        nm = 'skirt_%02d_%d' % (c, k_); SK[nm]['head'] = Gn[CH_ROWS[k_], CH_COLS[c]].tolist(); SK[nm]['tail'] = Gn[CH_ROWS[k_ + 1], CH_COLS[c]].tolist()
# grid weights: every grid vertex is held by at most two chains and two bones of each
jj = np.arange(R_)[:, None] * np.ones((1, C_)); ii = np.ones((R_, 1)) * np.arange(C_)[None, :]
bb = [np.ones_like(jj)] + [ss(0, 1, (jj - (r - 2.5)) / 5.0) for r in CH_ROWS[1:-1]] + [np.zeros_like(jj)]
GW = {}
for c, cc in enumerate(CH_COLS):
    hat = np.clip(1 - abs(ii - cc) / (CH_COLS[1] - CH_COLS[0]), 0, 1)
    for k_ in range(len(CH_ROWS) - 1): GW['skirt_%02d_%d' % (c, k_)] = hat * (bb[k_] - bb[k_ + 1])
gwn = list(GW); gw = np.stack([GW[k] for k in gwn], -1).reshape(-1, len(gwn)); gp = Gn.reshape(-1, 3)
# How the dress rides the body. A dress this close is carried by the legs, not only by the hips: every grid point is
# skinned to the pelvis and to both legs by how near it is to them at rest (a point beside a knee rides that knee
# almost wholly, a point between the legs is shared, the hem is carried gently by both). The cloth simulation then
# runs about this moving shape instead of about a tube hanging from the hips, so a leg carries the cloth with it
# instead of pushing through it; `skin_keep` leaves every point some slack, so nothing is nailed to a bone.
SKIN_B = ['pelvis', 'thigh_L', 'shin_L', 'thigh_R', 'shin_R']; SIG = 0.105; SKIN_KEEP = 0.85


def seg_d(P, a_, b_):
    ab = b_ - a_; t_ = np.clip(((P - a_) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - a_ - t_[:, None] * ab, axis=1), t_


skin = np.zeros((len(gp), len(SKIN_B))); raw = {}
for sd, sgn in (('L', 1.0), ('R', -1.0)):
    hip, knee, ank = (J[k] * np.array([sgn, 1, 1]) for k in ('hip', 'knee', 'ankle'))
    d = np.minimum(seg_d(gp, hip, knee)[0], seg_d(gp, knee, ank)[0]); raw[sd] = np.exp(-(d / SIG) ** 2)
tot = raw['L'] + raw['R']; a_leg = np.minimum(1.0, tot) * SKIN_KEEP * ss(Z_TOP - 0.02, Z_TOP - 0.12, gp[:, 2])
for sd in 'LR':
    sh = ss(float(J['knee'][2]) + 0.10, float(J['knee'][2]) - 0.10, gp[:, 2])        # thigh above the knee, shin below
    w_ = a_leg * raw[sd] / np.maximum(tot, 1e-9)
    skin[:, SKIN_B.index('thigh_' + sd)] = w_ * (1 - sh); skin[:, SKIN_B.index('shin_' + sd)] = w_ * sh
skin[:, 0] = 1.0 - skin[:, 1:].sum(1)
sr = skin.reshape(R_, C_, len(SKIN_B))
print('the dress rides the legs: at the hips %.2f pelvis, at the knee row %.2f near leg / %.2f far leg, at the hem %.2f + %.2f legs' % (
    sr[0, :, 0].mean(), sr[CH_ROWS[2], :, 1:3].sum(1).max(), sr[CH_ROWS[2], :, 3:].sum(1).min(), sr[-1, :, 1:3].sum(1).mean(), sr[-1, :, 3:].sum(1).mean()))
# the dress below the hip joints takes the grid's weights (three nearest grid points); a short band under the top row
# blends from the weights above it, so the seam between "rides the pelvis" and "rides the chains" does not show
skirt = DRESS & (z < Z_TOP)
band = ss(Z_TOP, Z_TOP - 0.05, z)
for i in np.nonzero(skirt)[0]:
    dd = np.linalg.norm(gp - co[i], axis=1); nn = np.argpartition(dd, 3)[:3]; ww = 1.0 / (dd[nn] + 1e-4) ** 2; wv = (gw[nn] * ww[:, None]).sum(0) / ww.sum()
    for k in upper + legs: W[k][i] *= (1 - band[i])
    for q_, nm in enumerate(gwn): W[nm][i] = wv[q_] * band[i]
# the lacing crosses the slit: each lace vertex blends the two slit edges by where it sits between them, so a lace
# stretches evenly when the slit opens instead of tearing in the middle
ia = np.argmin(np.abs(zs[:, None] - z[None, :]), 0)    # nearest grid row of every vertex
for i in np.nonzero(LACE & (z < Z_TOP))[0]:
    A_, B_ = Gn[ia[i], 0], Gn[ia[i], -1]; ab = B_ - A_; u_ = float(np.clip(((co[i] - A_) @ ab) / (ab @ ab), 0, 1))
    wv = gw[ia[i] * C_ + 0] * (1 - u_) + gw[ia[i] * C_ + C_ - 1] * u_
    for k in upper + legs: W[k][i] *= (1 - band[i])
    for q_, nm in enumerate(gwn): W[nm][i] = wv[q_] * band[i]

# ---------------- colliders fitted to this body (rest pose): tapered capsules along the legs, the shoes, the hips
btri = fv[BODY[fv[:, 0]] & ~arm[fv[:, 0]]]


def ring(h, sgn):
    """Centre and radius of one leg where the plane z = h cuts it: the body is cut, the loop on that side is taken
    (a cut follows the surface, so the two legs never mix), and the circle around its middle that holds all of it."""
    cs = [c for c, L in cut_all(btri, h) if len(c) > 6 and c[:, 0].mean() * sgn > 0 and abs(c[:, 0].mean()) < 0.2]
    P = max(cs, key=lambda c: len(c))
    c = np.array([0.5 * (P[:, 0].min() + P[:, 0].max()), 0.5 * (P[:, 1].min() + P[:, 1].max()), h])
    return c, float(np.hypot(P[:, 0] - c[0], P[:, 1] - c[1]).max())


caps = []
kz, az = float(J['knee'][2]), float(J['ankle'][2])
for sd, sgn in (('L', 1.0), ('R', -1.0)):
    hip = J['hip'] * np.array([sgn, 1, 1])
    hs = [kz + (hip[2] - 0.09 - kz) * t for t in (1.0, 0.62, 0.3, 0.0)]            # down the thigh, from under the hip to the knee
    rings = [ring(h, sgn) for h in hs]
    caps.append(('thigh_' + sd, hip, rings[0][0], rings[0][1], rings[0][1], 0))      # the hip joint down to the first ring
    for (c0, r0), (c1, r1) in zip(rings[:-1], rings[1:]): caps.append(('thigh_' + sd, c0, c1, r0, r1, 0))
    hs = [kz, kz - 0.11, kz - 0.24, az + 0.02]                                       # knee, calf, lower shin, ankle
    rings = [ring(h, sgn) for h in hs]
    for (c0, r0), (c1, r1) in zip(rings[:-1], rings[1:]): caps.append(('shin_' + sd, c0, c1, r0, r1, 0))
    ank = J['ankle'] * np.array([sgn, 1, 1]); ball = J['ball'] * np.array([sgn, 1, 1])
    ft = BODY & (z < az + 0.01) & (x * sgn > 0)
    tipy = float(y[ft & (z < 0.05)].min()); heely = float(y[ft].max()); halfw = float(0.5 * (x[ft & (z < 0.05)].max() - x[ft & (z < 0.05)].min()))
    caps.append(('foot_' + sd, rings[-1][0], np.array([ball[0], ball[1], max(ball[2], 0.035)]), rings[-1][1] + 0.004, halfw, 0))                    # instep
    caps.append(('foot_' + sd, np.array([ank[0], heely - 0.03, az - 0.03]), np.array([ank[0], heely - 0.022, 0.022]), 0.03, 0.02, 0))               # heel cup and heel
    caps.append(('toe_' + sd, np.array([ball[0], ball[1], 0.033]), np.array([ball[0], tipy + 0.028, 0.026]), halfw, 0.026, 0))                      # toe box
def cap_sd(p_, c_):
    ab = c_[2] - c_[1]; t_ = np.clip(((p_ - c_[1]) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p_ - c_[1] - t_[:, None] * ab, axis=1) - (c_[3] + (c_[4] - c_[3]) * t_)


# how well the leg capsules hold the leg skin (they must: the cloth only ever sees them)
lv_ = BODY & ~arm & (z < float(J['hip'][2])) & (np.abs(x) < 0.2); out_ = np.min([cap_sd(co[lv_], c_) for c_ in caps], 0)
rest_d = np.min([cap_sd(gp, c_) for c_ in caps], 0)
# the hips: a capsule under the dress's own top rows (set 2: the dress must not fall into the seat, but the hips are
# not a leg and are not part of the leg-through-the-dress check)
hz = float(J['hip'][2]) - 0.03
mh = BODY & ~arm & (np.abs(z - hz) < 0.015); cy = 0.5 * (y[mh].min() + y[mh].max()); rr = 0.5 * (y[mh].max() - y[mh].min()); hw = float(np.abs(x[mh]).max()) - rr
pel = ('pelvis', np.array([-hw, cy, hz]), np.array([hw, cy, hz]), rr, rr, 2)
near = float(cap_sd(gp[gp[:, 2] > hz - 0.14], pel).min())
if near < 0.004: pel = (pel[0], pel[1], pel[2], rr - (0.004 - near), rr - (0.004 - near), 2)       # shrunk until the dress clears it
caps.append(pel)
print('colliders: %d; leg skin outside them: max %.1f mm, 99th percentile %.1f mm; the dress at rest clears the legs by %.1f mm (lowest at row z %.2f), the hips by %.1f mm (capsule %.0f -> %.0f mm)' % (
    len(caps), out_.max() * 1000, np.percentile(out_, 99) * 1000, rest_d.min() * 1000, gp[rest_d.argmin(), 2], min(near, 0.004) * 1000, rr * 1000, pel[3] * 1000))
print('  rest clearance per leg capsule (mm): %s' % ' '.join('%s%d:%.0f' % (c_[0], i_, cap_sd(gp, c_).min() * 1000) for i_, c_ in enumerate(caps) if c_[5] == 0))
d3 = np.load(V3RIG)                                    # the body shapes the ribbon tails and face strands collide with (set 1)
g2b = lambda p_: np.stack([np.asarray(p_)[..., 0], -np.asarray(p_)[..., 2], np.asarray(p_)[..., 1]], -1)       # glTF -> Blender axes
for bn, p0, p1, r_, st in zip(d3['cap_bone'], d3['cap_p0'], d3['cap_p1'], d3['cap_r'], d3['cap_set']):
    if int(st) == 1 or (int(st) == 9 and r_[0] > 0.1): caps.append((str(bn), g2b(p0), g2b(p1), float(r_[0]), float(r_[1]), 1))
tails = {k: np.array(v['tail']) for k, v in SK.items()}
os.makedirs(WD, exist_ok=True)
np.savez_compressed(WD + '/cloth_rig.npz', grid=g2(Gn), gw_names=np.array(gwn), gw=gw.reshape(R_, C_, len(gwn)).astype(np.float32), ch_cols=np.array(CH_COLS), ch_rows=np.array(CH_ROWS),
                    skin_names=np.array(SKIN_B), skin=sr.astype(np.float32),
                    cap_bone=np.array([c[0] for c in caps]), cap_p0=g2([c[1] for c in caps]), cap_p1=g2([c[2] for c in caps]), cap_r=np.array([[c[3], c[4]] for c in caps]),
                    cap_set=np.array([c[5] for c in caps]), tail_names=np.array(list(tails)), tail_pos=g2([tails[k] for k in tails]), slack=slack)
json.dump(SK, open(WD + '/skeleton.json', 'w'), indent=0)

tot = sum(W.values()); bad = tot < 1e-4; W['pelvis'][bad & (z < 1.45)] = 1.0; W['head'][bad & (z >= 1.45)] = 1.0; tot = sum(W.values())
for k in W: W[k] = W[k] / tot
print('weights: unbound vertices fixed %d; bones used %d of %d; right leg on its own bones: thigh %.2f shin %.2f foot %.2f (mean weight in mid segment)' % (
    bad.sum(), sum(1 for k in W if W[k].max() > 0.01), len(W), W['thigh_R'][BODY & (x < -0.01) & (np.abs(z - 0.75) < 0.03)].mean(), W['shin_R'][BODY & (x < -0.01) & (np.abs(z - 0.38) < 0.03)].mean(), (W['foot_R'] + W['toe_R'])[BODY & (x < -0.01) & (z < 0.08)].mean()))
for k in SK:
    g = el.vertex_groups.new(name=k); w = W[k]
    for i in np.nonzero(w > 0.004)[0]: g.add([int(i)], float(w[i]), 'REPLACE')
arm_d = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm_d); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
for k, v in SK.items():
    b = arm_d.edit_bones.new(k); b.head = Vector(v['head']); b.tail = Vector(v['tail'])
    if v['parent']: b.parent = arm_d.edit_bones[v['parent']]
for b in arm_d.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT'); el.parent = ao; md = el.modifiers.new('rig', 'ARMATURE'); md.object = ao
el.name = 'elise'; me.name = 'elise'
for p in me.polygons: p.use_smooth = True

bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); bpy.context.view_layer.objects.active = el
now = len(me.polygons)
if TRIS < now:
    md = el.modifiers.new('dec', 'DECIMATE'); md.ratio = TRIS / now; md.use_collapse_triangulate = True; bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')
me = el.data

# ---------------- outline hull, the game file
mo = bpy.data.materials.new('elise_outline'); mo.use_nodes = True; bs = mo.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (0.012, 0.012, 0.016, 1); bs.inputs['Roughness'].default_value = 1.0; mo.use_backface_culling = True
me.materials.append(mo); n0, co, fv = arrays(); f0 = len(fv); no = np.array([v.normal[:] for v in me.vertices]); zz = co[:, 2]
k = np.ones(n0); k[zz > 1.47] = 0.5; k[(np.abs(co[:, 0]) > 0.2) & (zz < 1.0)] = 0.45; k[zz > 1.69] = 0.3
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); geom = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:]); vmap = geom['vert_map']
nf = [g for g in geom['geom'] if isinstance(g, bmesh.types.BMFace)]
for v in list(vmap):
    if v.index < n0 and vmap[v].index != v.index: vmap[v].co = (co[v.index] + no[v.index] * MM * 0.001 * k[v.index]).tolist()
for f in nf: f.material_index = 1
bmesh.ops.reverse_faces(bm, faces=nf); bm.to_mesh(me); bm.free(); me.validate(); me.update()
print('ELISE', NAME, 'tris', len(me.polygons), 'base', f0, 'verts', len(me.vertices), 'bones', len(arm_d.bones))
for i_ in [i_ for i_ in bpy.data.images if i_ is not img and i_.users == 0 or (i_ is not img and not os.path.exists(bpy.path.abspath(i_.filepath)))]: bpy.data.images.remove(i_)
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=f'{WD}/{NAME}.blend')
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{WD}/{NAME}_raw.glb', export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                          export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False, export_morph=False)
print('WROTE', f'{WD}/{NAME}_raw.glb', os.path.getsize(f'{WD}/{NAME}_raw.glb'), 'S30_DONE')
