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
from mathutils.bvhtree import BVHTree

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
# above the hip joint the thigh hands over to the pelvis (the file lets a thigh carry the hip up to the waist, and the
# lower belly: under a dress that is skin-tight there, that skin would turn out through it), and so does the strip
# along the middle above the crotch
hz_ = float(J['hip'][2])
fade = ss(hz_ + 0.01, hz_ - 0.06, z) * np.maximum(ss(0.0, 0.03, np.abs(x)), ss(hz_ - 0.06, hz_ - 0.12, z))
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

# ---------------- the fit of the dress on the hips
# The source dress lies on the hips with almost no air (in places it even dips under the skin). A thigh that turns
# moves its skin a few millimetres along the body, and skin that close to the cloth comes out through it. So across
# the hips the dress is let out to at least EASE of air over the body (a tailor's ease): its outline changes by
# millimetres, and the skin stays under the cloth when the legs move.
EASE = 0.012
hip_t = fv[(BODY & ~arm & (z > hz_ - 0.25) & (z < hz_ + 0.14))[fv].all(1)]
hip_bvh = BVHTree.FromPolygons([tuple(p_) for p_ in co], [tuple(int(i_) for i_ in t_) for t_ in hip_t])
let, let_max = 0, 0.0
for i in np.nonzero((DRESS | LACE) & (z > hz_ - 0.16) & (z < hz_ + 0.05))[0]:
    loc, nrm_, idx, dist = hip_bvh.find_nearest(Vector(co[i].tolist())); d_ = co[i] - np.array(loc); nn_ = np.array(nrm_)
    air_ = dist if d_ @ nn_ >= 0 else -dist
    want = EASE * ss(hz_ - 0.16, hz_ - 0.11, z[i]) * ss(hz_ + 0.05, hz_, z[i])
    if air_ < want:
        co[i] += (d_ / dist if air_ > 1e-4 else nn_) * (want - air_); let += 1; let_max = max(let_max, want - air_)
me.vertices.foreach_set('co', co.ravel()); me.update()
print('fit: %d dress vertices on the hips let out to %.0f mm of air (by up to %.1f mm)' % (let, EASE * 1000, let_max * 1000))

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
gwn = list(GW); gw_chain = np.stack([GW[k] for k in gwn], -1).reshape(-1, len(gwn)); gp = Gn.reshape(-1, 3)

# Where the dress is skin and where it is cloth. On the hips and the top of the thighs it lies on the body (a few
# millimetres of air): there it has to move exactly as the skin under it moves, or the skin shows through. Lower down
# it hangs free (centimetres of air): there it is cloth, on the skirt chains. `loose` (0 skin .. 1 cloth) is read from
# the air between the dress and the body in this rest pose; where it is skin, a point takes the weights of the body
# around it (a Gaussian over the nearest body vertices, so the two thighs blend smoothly across the middle).
BODY_B = ['pelvis', 'spine', 'thigh_L', 'shin_L', 'thigh_R', 'shin_R']; kz = float(J['knee'][2])
low = BODY & ~arm & (z < 1.15) & (z > float(J['ankle'][2]) + 0.04) & (np.abs(x) < 0.21)
bwf = np.stack([W[k] for k in BODY_B], -1); bwf /= np.maximum(bwf.sum(1, keepdims=True), 1e-9)
lowt = fv[low[fv].all(1)]; trees = {}
for sd, m_ in (('L', x > -0.004), ('R', x < 0.004)):          # each leg with the body's middle
    tr = lowt[m_[lowt].all(1)]; trees[sd] = (BVHTree.FromPolygons([tuple(p_) for p_ in co], [tuple(int(i_) for i_ in t_) for t_ in tr]), tr)


def body_at(P_, delta=0.015):
    """For points beside the body: the air to it [n]; the weights of the skin right under each point [n, bones] (the
    closest point of the body's surface on the nearer leg's side, its three vertices' weights blended: cloth over one
    thigh moves exactly as the skin it lies on, with nothing of the other thigh in it); and how much a point is shared
    by the two legs [n] (1: as near to one as to the other, and they are carried by different bones: there the cloth
    bridges from one leg to the other and cannot be skin)."""
    air = np.zeros(len(P_)); wb = np.zeros((len(P_), len(BODY_B))); mix = np.zeros(len(P_))
    for i_, p_ in enumerate(P_):
        near = {}
        for sd in 'LR':
            loc, _, idx, dist = trees[sd][0].find_nearest(Vector(p_.tolist())); t_ = trees[sd][1][idx]; a_, b_, c_ = co[t_]; q_ = np.array(loc)
            v0, v1, v2 = b_ - a_, c_ - a_, q_ - a_; d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1; den = max(d00 * d11 - d01 * d01, 1e-18)
            bv_ = (d11 * d20 - d01 * d21) / den; bw_ = (d00 * d21 - d01 * d20) / den
            w_ = np.clip([1 - bv_ - bw_, bv_, bw_], 0, 1); near[sd] = (dist, (w_[:, None] * bwf[t_]).sum(0) / w_.sum())
        u = float(np.clip((near['R'][0] - near['L'][0]) / delta, -1, 1))
        air[i_] = min(near['L'][0], near['R'][0]); wb[i_] = near['L'][1] if u > 0 else near['R'][1]
        mix[i_] = (1 - abs(u)) * 0.5 * np.abs(near['L'][1] - near['R'][1]).sum()
    return air, wb, mix


# At a hip crease the skin's weights change fast with height (pelvis above, thigh below), and when a thigh lifts, the
# skin of its top slides up under the cloth above it. So across the FRONT of the crease (a band below the hip joints)
# the dress takes the weights of the skin 3 cm LOWER than where it lies: it turns with the thigh before the skin under
# it does, and stays over it. The band ends below the joints: cloth at their height that turned with a thigh would
# turn into the belly. Across the BACK it is the other way round: a lifted thigh pulls its skin in under the seat, so
# there the dress takes the weights of the skin 4 cm HIGHER (it keeps the hips' shape instead of folding into the
# seat's cleft).
def lead(P_):
    q_ = P_.copy(); h_ = P_[:, 2]; front = ss(0.02, -0.03, P_[:, 1])        # (Blender: -Y is her front)
    on = ss(hz_ - 0.12, hz_ - 0.08, h_); crease = on * ss(hz_ - 0.01, hz_ - 0.05, h_)
    q_[:, 2] += 0.04 * on * (1 - front) - 0.03 * crease * front; return q_


air_g, _, mix_g = body_at(gp); _, wbody_g, _ = body_at(lead(gp))
loose = np.maximum(ss(0.020, 0.050, air_g), ss(0.0, 0.5, mix_g)).reshape(R_, C_)
for k_ in range(2):                                    # no speckle: the border between skin and cloth is a smooth line
    pad = np.pad(loose, 1, mode='edge'); loose = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:] + 4 * loose) / 8
loose = np.maximum(loose, ss(kz, kz - 0.12, zs)[:, None]); loose[0] = 0.0                          # below the knee it is all cloth; the top row is the hips'
# on the hips themselves it is all skin, whatever the air: the hollow of a hip crease is bridged by the dress with
# 3 to 4 cm of air, and cloth there would let the top of a lifted thigh come up through it
loose *= ss(hz_ - 0.07, hz_ - 0.13, zs)[:, None]; lf = loose.ravel()
# the grid's own weights: the chains where it is cloth, the body where it is skin (the clip build fits the chains and
# checks the legs against exactly this surface)
gw = np.concatenate([gw_chain * lf[:, None], wbody_g * (1 - lf)[:, None]], 1); gw_names = gwn + BODY_B
# What carries the cloth's own shape through a pose (the simulation swings about it): the skin's own weights where it
# is skin; where it is cloth, the hips alone, and upright (`pelvis^`: the hips' place and heading without their tilt:
# cloth hangs down from tilted hips, it does not swing out with them like a bell). No leg carries hanging cloth:
# a leg moves it only by touching it.
SKIN_B = BODY_B + ['pelvis^']
skin = np.concatenate([wbody_g * (1 - lf)[:, None], lf[:, None]], 1); sr = skin.reshape(R_, C_, len(SKIN_B))
# The folds of the flare. The grid is the dress's outer envelope; the cloth itself folds inward from it, up to a few
# centimetres near the hem. A leg must clear the cloth, not the envelope: every grid point carries how deep the real
# dress lies under it (`inset`), and the clip build keeps the legs that much further from the envelope there.
gnrm = np.cross(np.gradient(Gn, axis=1), np.gradient(Gn, axis=0)); gnrm /= np.maximum(np.linalg.norm(gnrm, axis=-1, keepdims=True), 1e-12)
ctr = Gn.mean(1, keepdims=True); gnrm *= np.sign(np.sum(gnrm[..., :2] * (Gn - ctr)[..., :2], -1, keepdims=True).mean(1, keepdims=True))       # outward
# The deepest folds are made shallower (beyond 2 cm under the envelope a fold keeps a quarter of its depth): the fit of
# the flare around a moving leg. A fold that lies 8 cm in holds the whole hem 8 cm off the foot that touches it, and
# the dress walks as a bell. The folds stay; the dress's outline (its envelope) does not change.
inset = np.zeros(R_ * C_); gn_ = gnrm.reshape(-1, 3); FOLD0, FOLDK = 0.020, 0.25; eased = 0
for i in np.nonzero(DRESS & (z < Z_TOP) & (z > Z_HEM - 0.02))[0]:
    g_ = int(np.argmin(np.linalg.norm(gp - co[i], axis=1))); d_ = float((gp[g_] - co[i]) @ gn_[g_])
    if d_ > FOLD0 and lf[g_] > 0.5:
        new_ = FOLD0 + (d_ - FOLD0) * FOLDK; co[i] += gn_[g_] * (d_ - new_); d_ = new_; eased += 1
    inset[g_] = max(inset[g_], d_)
me.vertices.foreach_set('co', co.ravel()); me.update()
inset = inset.reshape(R_, C_) * (loose > 0.5); pad = np.pad(inset, 1, mode='edge')
inset = np.max([pad[1 + a_:R_ + 1 + a_, 1 + b_:C_ + 1 + b_] for a_ in (-1, 0, 1) for b_ in (-1, 0, 1)], 0)             # a fold is as deep for its neighbours
print('folds: %d deep fold vertices eased; the dress lies under its envelope by up to %.0f mm (thigh rows %.0f, knee rows %.0f, shin rows %.0f, hem rows %.0f)' % (
    eased, inset.max() * 1000, inset[:CH_ROWS[1]].max() * 1000, inset[CH_ROWS[1]:CH_ROWS[2] + 2].max() * 1000, inset[CH_ROWS[2] + 2:CH_ROWS[3]].max() * 1000, inset[CH_ROWS[3]:].max() * 1000))
lz = [float(zs[np.argmin(np.abs(loose[:, c_] - 0.5))]) for c_ in (0, C_ // 4, C_ // 2, 3 * C_ // 4, C_ - 1)]
print('skin or cloth: the dress is skin (rides the body) down to z %.2f..%.2f (side slit edge, back, her right side, front, front slit edge: %s); %d of %d grid points are skin, %d cloth' % (
    min(lz), max(lz), ' '.join('%.2f' % v for v in lz), int((lf < 0.15).sum()), len(lf), int((lf > 0.85).sum())))

# the dress from just above the hip joints down: skin where it lies on the body (the weights of the body around each
# vertex: the very weights of the skin under it), cloth where it hangs (the grid's chain weights from its three
# nearest grid points); a short band above the top row blends from the file's own weights, so no seam shows there
ia = np.argmin(np.abs(zs[:, None] - z[None, :]), 0)    # nearest grid row of every vertex
skirt = (DRESS | LACE) & (z < Z_TOP + 0.06); band = ss(Z_TOP + 0.06, Z_TOP + 0.01, z); sk_i = np.nonzero(skirt)[0]; loose_v = np.zeros(n)
_, wbody_v, _ = body_at(lead(co[sk_i]))
for q, i in enumerate(sk_i):
    dd = np.linalg.norm(gp - co[i], axis=1); nn = np.argpartition(dd, 3)[:3]; ww = 1.0 / (dd[nn] + 1e-4) ** 2
    lo_ = float((lf[nn] * ww).sum() / ww.sum())
    if LACE[i]:                                        # a lace crosses the slit: it blends the two slit edges by where it sits between them, so it stretches evenly when the slit opens
        A_, B_ = Gn[ia[i], 0], Gn[ia[i], -1]; ab = B_ - A_; u_ = float(np.clip(((co[i] - A_) @ ab) / (ab @ ab), 0, 1))
        wv = gw_chain[ia[i] * C_ + 0] * (1 - u_) + gw_chain[ia[i] * C_ + C_ - 1] * u_
    else:
        wv = (gw_chain[nn] * ww[:, None]).sum(0) / ww.sum()
    for k in upper + legs: W[k][i] *= (1 - band[i])
    for q_, nm in enumerate(gwn): W[nm][i] = wv[q_] * lo_ * band[i]
    for q_, nm in enumerate(BODY_B): W[nm][i] += wbody_v[q, q_] * (1 - lo_) * band[i]
    loose_v[i] = lo_

# A last few millimetres of ease in front of each hip joint, where the top of a swinging thigh comes nearest the cloth
# (after the grid is cut and the weights are set: the cloth rig and every baked clip stay as they are).
for i in np.nonzero((DRESS | LACE) & (np.abs(z - hz_) < 0.035) & (np.abs(np.abs(x) - 0.09) < 0.035) & (y < 0))[0]:
    loc, nrm_, idx, dist = hip_bvh.find_nearest(Vector(co[i].tolist())); d_ = co[i] - np.array(loc)
    if dist > 1e-4 and d_ @ np.array(nrm_) > 0:
        co[i] += d_ / dist * 0.004 * float(ss(0.035, 0.015, abs(z[i] - hz_)) * ss(0.035, 0.015, abs(abs(x[i]) - 0.09)))
me.vertices.foreach_set('co', co.ravel()); me.update()

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
    cup = BODY & (x * sgn > 0) & (z > 0.06) & (z < az - 0.02) & (y > ank[1] - 0.02)                 # the shoe's heel cup behind the ankle
    cupc = np.array([0.5 * (x[cup].min() + x[cup].max()), 0.5 * (max(y[cup].min(), ank[1] - 0.02) + heely), 0.0]); cupr = float(max(0.5 * (x[cup].max() - x[cup].min()), 0.5 * (heely - cupc[1]) + 0.5 * (cupc[1] - (ank[1] - 0.02))))
    caps.append(('foot_' + sd, rings[-1][0], np.array([ball[0], ball[1], max(ball[2], 0.035)]), rings[-1][1] + 0.004, halfw, 0))                    # instep
    caps.append(('foot_' + sd, cupc + np.array([0, 0, az - 0.035]), cupc + np.array([0, 0, 0.075]), cupr, cupr, 0))                                  # heel cup
    caps.append(('foot_' + sd, np.array([ank[0], heely - 0.03, 0.07]), np.array([ank[0], heely - 0.035, 0.016]), 0.022, 0.016, 0))                  # heel
    caps.append(('toe_' + sd, np.array([ball[0], ball[1], 0.033]), np.array([ball[0], tipy + 0.028, 0.026]), halfw, 0.026, 0))                      # toe box


def cap_sd(p_, c_):
    ab = c_[2] - c_[1]; t_ = np.clip(((p_ - c_[1]) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p_ - c_[1] - t_[:, None] * ab, axis=1) - (c_[3] + (c_[4] - c_[3]) * t_)


# the hips and the seat (set 2: the dress must not fall into them; they are not a leg, so they are not part of the
# leg-through-the-dress check). The dress is skin-tight here: the clip build never asks the cloth for more air than it
# has in this rest pose, so the capsule is the body's own size and is not shrunk to fit under the dress.
hz = float(J['hip'][2]) - 0.03
mh = BODY & ~arm & (np.abs(z - hz) < 0.03); cy = 0.5 * (y[mh].min() + y[mh].max()); rr = 0.5 * (y[mh].max() - y[mh].min()); hw = float(np.abs(x[mh]).max()) - rr
caps.append(('pelvis', np.array([-hw, cy, hz]), np.array([hw, cy, hz]), rr, rr, 2))
# how well the capsules hold the skin (they must: the cloth only ever sees them), and how the dress sits on them at rest
lv_ = BODY & ~arm & (z < float(J['hip'][2])) & (np.abs(x) < 0.2); out_ = np.min([cap_sd(co[lv_], c_) for c_ in caps], 0); zl = z[lv_]
rest_d = np.min([cap_sd(gp, c_) for c_ in caps], 0)
print('colliders: %d; skin outside them (max mm): hips %.1f, thighs %.1f, knees and shins %.1f, shoes %.1f; the dress at rest: %.1f mm from them at its nearest (row z %.2f), %d of %d grid points nearer than 6 mm (tight on the hips: the build keeps each point\'s rest clearance)' % (
    len(caps), out_[zl > hz - 0.06].max() * 1000, out_[(zl <= hz - 0.06) & (zl > kz + 0.04)].max() * 1000, out_[(zl <= kz + 0.04) & (zl > az)].max() * 1000, out_[zl <= az].max() * 1000,
    rest_d.min() * 1000, gp[rest_d.argmin(), 2], int((rest_d < 0.006).sum()), len(gp)))
print('  rest clearance per capsule (mm): %s' % ' '.join('%s%d:%.0f' % (c_[0], i_, cap_sd(gp, c_).min() * 1000) for i_, c_ in enumerate(caps)))
d3 = np.load(V3RIG)                                    # the body shapes the ribbon tails and face strands collide with (set 1)
g2b = lambda p_: np.stack([np.asarray(p_)[..., 0], -np.asarray(p_)[..., 2], np.asarray(p_)[..., 1]], -1)       # glTF -> Blender axes
for bn, p0, p1, r_, st in zip(d3['cap_bone'], d3['cap_p0'], d3['cap_p1'], d3['cap_r'], d3['cap_set']):
    if int(st) == 1 or (int(st) == 9 and r_[0] > 0.1): caps.append((str(bn), g2b(p0), g2b(p1), float(r_[0]), float(r_[1]), 1))
tails = {k: np.array(v['tail']) for k, v in SK.items()}
os.makedirs(WD, exist_ok=True)
np.savez_compressed(WD + '/cloth_rig.npz', grid=g2(Gn), gw_names=np.array(gw_names), gw=gw.reshape(R_, C_, len(gw_names)).astype(np.float32), ch_cols=np.array(CH_COLS), ch_rows=np.array(CH_ROWS),
                    skin_names=np.array(SKIN_B), skin=sr.astype(np.float32), tight=(1 - loose).astype(np.float32), inset=inset.astype(np.float32),
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
# ---------------- the body under the tight part of the dress is never seen: its faces go
# When a thigh turns, the skin of the hip crease slides along the body under cloth that lies a few millimetres over it,
# and no weighting keeps every point of it under that cloth. A face of the body goes only where the dress covers all of
# it closely, the cloth there is skin (it rides the body: it cannot lift off and show what is missing), and no edge of
# the dress (the slit, the lacing, the open back) is near. What a camera can see stays: both legs, the left hip in the
# lacing, everything the slit can open on.
dress_bvh = BVHTree.FromPolygons([tuple(p_) for p_ in co], [tuple(int(i_) for i_ in t_) for t_ in dtri]); body_bvh = BVHTree.FromPolygons([tuple(p_) for p_ in co], [tuple(int(i_) for i_ in t_) for t_ in lowt])
ecount = {}
for t_ in dtri:
    for i_, j_ in ((0, 1), (1, 2), (2, 0)): k_ = (min(int(t_[i_]), int(t_[j_])), max(int(t_[i_]), int(t_[j_]))); ecount[k_] = ecount.get(k_, 0) + 1
rim = co[sorted({v_ for k_, c_ in ecount.items() if c_ == 1 for v_ in k_})]
nrm_v = np.array([v.normal[:] for v in me.vertices]); hidden = np.zeros(n, bool)
hipz = hz_ - 0.13                                       # from here up the dress is all skin (see `loose`)
for i in np.nonzero(BODY & ~arm & (z > 0.70) & (z < 1.06))[0]:
    # on the hips the dress also bridges hollows (the seat's cleft, a hip crease) with several centimetres of air:
    # the skin in them is enclosed all the same
    loc, _, idx, dist = dress_bvh.ray_cast(Vector((co[i] + nrm_v[i] * 0.0005).tolist()), Vector(nrm_v[i].tolist()), 0.10 if z[i] > hipz else 0.04)
    if loc is None:
        # between the tops of the thighs, under the dress: skin that faces the other thigh a finger away is enclosed too
        hidden[i] = z[i] > hipz and z[i] < hz_ and abs(x[i]) < 0.05 and body_bvh.ray_cast(Vector((co[i] + nrm_v[i] * 0.002).tolist()), Vector(nrm_v[i].tolist()), 0.05)[0] is not None
        continue
    q_ = np.array(loc)
    hidden[i] = (z[i] > hipz or loose_v[dtri[idx]].max() < 0.35) and float(np.linalg.norm(rim - q_, axis=1).min()) > 0.004
arm_d = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm_d); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
for k, v in SK.items():
    b = arm_d.edit_bones.new(k); b.head = Vector(v['head']); b.tail = Vector(v['tail'])
    if v['parent']: b.parent = arm_d.edit_bones[v['parent']]
for b in arm_d.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT'); el.parent = ao; md = el.modifiers.new('rig', 'ARMATURE'); md.object = ao
el.name = 'elise'; me.name = 'elise'
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
gone = [f for f in bm.faces if all(hidden[v.index] for v in f.verts)]; n_gone = len(gone)
bmesh.ops.delete(bm, geom=gone, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(me); bm.free(); me.update()
print('hidden body under the tight dress: %d of %d body vertices are covered, %d faces removed (hips, seat, lower belly, the outside of the right thigh)' % (int(hidden.sum()), int(BODY.sum()), n_gone))
for p in me.polygons: p.use_smooth = True

bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); bpy.context.view_layer.objects.active = el
now = len(me.polygons)
FULL = 30000                                           # the desktop model's triangles


def collapse(ratio):
    md = el.modifiers.new('dec', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = True; bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')


if TRIS < now and TRIS >= FULL:
    collapse(TRIS / now)
elif TRIS < now:
    # The phone model. A coarse triangle of the dress that spans a hip crease (one corner on the thigh, one on the hips)
    # lets the lifted thigh through its middle. So over the front of the hips and the tops of the thighs the model keeps
    # the desktop model's density, and only the rest of it is thinned further.
    collapse(FULL / now); me = el.data; n1, c1, f1 = arrays(); ctr = c1[f1].mean(1)
    keep = (ctr[:, 2] > hz_ - 0.17) & (ctr[:, 2] < hz_ + 0.02) & (np.abs(ctr[:, 0]) < 0.16) & (ctr[:, 1] < 0.04)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for p in me.polygons: p.select = not bool(keep[p.index])
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.decimate(ratio=max(TRIS - int(keep.sum()), 1000) / (len(f1) - int(keep.sum()))); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
    print('phone model: %d triangles over the hips keep the desktop density, %d in all' % (int(keep.sum()), len(el.data.polygons)))
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
