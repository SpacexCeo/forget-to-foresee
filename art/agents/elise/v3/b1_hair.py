"""Elise v3, stage 3: her hair, modelled part by part as on sheet 03 (nothing is taken from the earlier models).

Parts, each a clean mesh of its own inside `elise_hair`: a cap over the skull, the asymmetric fringe (tapered locks
with a ridge), two face-framing locks with cobalt ends, the cobalt underside at the nape, the bun with its braid
wreath, coil and two side braids, two stray hairs at the crown. `elise_pin`: the butterfly, the dark flower, the
earrings. Colours are flat materials here; the atlas is painted at the paint stage.
    blender -b <work dir>/body.blend -P b1_hair.py -- <work dir>      writes head.blend, r/b1.jpg
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import review
WD = sys.argv[sys.argv.index('--') + 1]
unit = lambda v: np.asarray(v, float) / max(np.linalg.norm(v), 1e-12)
sstep = lambda t: (lambda u: u * u * (3 - 2 * u))(np.clip(t, 0, 1))
body = bpy.data.objects['elise_body']; bme = body.data
BV = np.zeros(len(bme.vertices) * 3); bme.vertices.foreach_get('co', BV); BV = BV.reshape(-1, 3)
bvh = BVHTree.FromPolygons([Vector(v) for v in BV], [tuple(p.vertices) for p in bme.polygons])
CHIN, TOP, EYE_Z = body['chin_z'], body['top_z'], body['eye_z']
hv = BV[BV[:, 2] > CHIN + 0.02]
C = np.array([0.0, 0.5 * (hv[:, 1].min() + hv[:, 1].max()), CHIN + 0.56 * (TOP - CHIN)])
print('head: centre %s, front y %.3f, back y %.3f, half width %.3f' % (C.round(3), hv[:, 1].min(), hv[:, 1].max(), np.abs(hv[:, 0]).max()))


def dirv(a, e):
    """Azimuth a (degrees; 0 her front, +90 her left), elevation e."""
    a, e = math.radians(a), math.radians(e); return np.array([math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
_rc = {}
def radius(a, e):
    k = (round(a, 2), round(e, 2))
    if k not in _rc:
        hit = bvh.ray_cast(Vector(C), Vector(dirv(a, e)), 0.4); _rc[k] = hit[3] if hit[0] is not None else 0.09
    return _rc[k]
def skull(a, e):
    """The skull's radius in a direction, without the ears and without dents (the largest of a few rays, capped)."""
    r = max(radius(a + da, e + de) for da in (-6, 0, 6) for de in (-5, 0, 5)); return min(r, 0.112)
def P(a, e, off): return C + dirv(a, e) * (skull(a, e) + off)

# ---------------- a mesh builder: vertices, faces, a material per face
MATS = {'charcoal': (44, 44, 54), 'charcoal_lit': (66, 66, 82), 'blend': (38, 44, 112), 'cobalt': (30, 52, 190), 'butterfly': (40, 130, 250),
        'metal': (26, 26, 34), 'gold': (214, 176, 92), 'pearl': (240, 236, 228)}
class Mesh:
    def __init__(s): s.v = []; s.f = []; s.m = []
    def add(s, verts, faces, mats):
        n = len(s.v); s.v += [tuple(map(float, p)) for p in verts]; s.f += [tuple(n + i for i in f) for f in faces]
        s.m += list(mats) if not isinstance(mats, str) else [mats] * len(faces)
    def build(s, name):
        me = bpy.data.meshes.new(name); me.from_pydata(s.v, [], s.f); names = list(MATS)
        for k in names:
            m = bpy.data.materials.get('elise_' + k) or bpy.data.materials.new('elise_' + k); c = tuple((x / 255) ** 2.2 for x in MATS[k]) + (1,)
            m.diffuse_color = c; m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = c; me.materials.append(m)
        for p, k in zip(me.polygons, s.m): p.material_index = names.index(k); p.use_smooth = True
        import bmesh
        b = bmesh.new(); b.from_mesh(me); bmesh.ops.recalc_face_normals(b, faces=b.faces[:]); b.normal_update(); seen = set()
        for f0 in b.faces:                               # every part looks away from the head (the game culls back faces)
            if f0 in seen: continue
            isl = {f0}; st = [f0]
            while st:
                for e_ in st.pop().edges:
                    for g in e_.link_faces:
                        if g not in isl: isl.add(g); st.append(g)
            seen |= isl; cen = sum((f.calc_center_median() for f in isl), Vector()) / len(isl); ref = cen if all(e_.is_manifold for f in isl for e_ in f.edges) else Vector(C)
            if sum(f.normal.dot(f.calc_center_median() - ref) * f.calc_area() for f in isl) < 0: bmesh.ops.reverse_faces(b, faces=list(isl))
        b.to_mesh(me); b.free()
        me.update(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob


def lock(M, pts, ups, widths, thick, mats, ridge=0.5):
    """A lock of hair: a tapered strip with a raised ridge and a flat underside (4 faces around)."""
    pts = np.asarray(pts, float); n = len(pts); V = []; Fc = []; Mm = []
    for i in range(n):
        t = unit(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]); u = unit(ups[i] - t * (ups[i] @ t)); s = np.cross(t, u); w = max(widths[i], 0.0012); h = thick * (0.35 + 0.65 * min(1, w / max(widths)))
        V += [pts[i] - s * w / 2, pts[i] + u * h + s * w * (ridge - 0.5), pts[i] + s * w / 2, pts[i] - u * h * 0.35]
    for i in range(n - 1):
        a, b = 4 * i, 4 * i + 4
        Fc += [(a, a + 1, b + 1, b), (a + 1, a + 2, b + 2, b + 1), (a + 2, a + 3, b + 3, b + 2), (a + 3, a, b, b + 3)]; Mm += [mats[i]] * 4
    Fc += [(3, 2, 1, 0), (4 * n - 4, 4 * n - 3, 4 * n - 2, 4 * n - 1)]; Mm += [mats[0], mats[-1]]
    M.add(V, Fc, Mm)


def rope(M, pts, r, mats, seg=6, bump=0.26, pitch=0.022, closed=False):
    """A plait read as a rope: a tube whose radius swells once per plait."""
    pts = np.asarray(pts, float); n = len(pts); V = []; Fc = []; Mm = []
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]; ref = np.array([0.0, 0.0, 1.0])
    for i in range(n):
        t = unit(pts[(i + 1) % n if closed else min(i + 1, n - 1)] - pts[(i - 1) % n if closed else max(i - 1, 0)])
        u = unit(ref - t * (ref @ t)) if abs(ref @ t) < 0.95 else unit(np.cross(t, [1, 0, 0])); s = np.cross(t, u); ref = u
        ri = (r[i] if hasattr(r, '__len__') else r) * (1 - bump + 2 * bump * abs(math.sin(math.pi * d[i] / pitch)))
        tw = 2 * math.pi * d[i] / (pitch * 6)
        V += [pts[i] + ri * (math.cos(tw + 2 * math.pi * k / seg) * u + math.sin(tw + 2 * math.pi * k / seg) * s) for k in range(seg)]
    for i in range(n if closed else n - 1):
        a, b = seg * i, seg * ((i + 1) % n)
        for k in range(seg): Fc.append((a + k, a + (k + 1) % seg, b + (k + 1) % seg, b + k)); Mm.append(mats[i] if not isinstance(mats, str) else mats)
    if not closed: Fc += [tuple(range(seg))[::-1], tuple(range(seg * (n - 1), seg * n))]; Mm += [mats[0] if not isinstance(mats, str) else mats] * 2
    M.add(V, Fc, Mm)


def tone(z, lo, hi):
    """Charcoal above, cobalt below, one blended band between (heights in metres)."""
    return 'cobalt' if z < lo else 'blend' if z < hi else 'charcoal'

H = Mesh()
# ---------------- the cap: a grid over the skull from the hairline up, 9 mm off the skin, its rim turned in
def hairline(a):
    a = abs((a + 180) % 360 - 180)
    return 30 + (6 - 30) * sstep((a - 45) / 38) + (-44 - 6) * sstep((a - 97) / 13)
NA, NE = 32, 9; V = []; Fc = []; Mm = []
for j in range(NE + 1):
    for i in range(NA):
        a = 360 * i / NA; e0 = hairline(a)
        if j == 0: V.append(P(a, e0 - 3, 0.001))
        else: e = e0 + (86 - e0) * ((j - 1) / (NE - 1)) ** 0.9; V.append(P(a, e, 0.009 + 0.004 * math.sin(math.radians(max(e, 0)))))
V.append(C + np.array([0, 0, skull(0, 90) + 0.013]))
for j in range(NE):
    for i in range(NA):
        a, b = j * NA + i, j * NA + (i + 1) % NA; Fc.append((a, b, b + NA, a + NA)); Mm.append(tone(0.25 * (V[a][2] + V[b][2] + V[a + NA][2] + V[b + NA][2]), CHIN + 0.035, CHIN + 0.07) if abs((360 * i / NA + 180) % 360 - 180) > 95 else 'charcoal')
for i in range(NA): Fc.append((NE * NA + i, NE * NA + (i + 1) % NA, len(V) - 1)); Mm.append('charcoal')
H.add(V, Fc, Mm)

# ---------------- the fringe: locks from the crown over the forehead; the middle one falls between the eyes
FRINGE = [  # root azimuth, tip azimuth, tip elevation, width, lift of the tip off the skin
    (3, -2, -25, 0.034, 0.016), (-16, -22, -3, 0.046, 0.017), (17, 21, -2, 0.046, 0.017), (-36, -45, -7, 0.050, 0.017), (38, 46, -6, 0.050, 0.017),
    (-56, -68, -26, 0.044, 0.015), (58, 70, -28, 0.044, 0.015), (-8, -11, -1, 0.030, 0.019), (9, 10, 0, 0.030, 0.019), (-27, -33, -1, 0.034, 0.019), (28, 33, 0, 0.034, 0.019)]
for ar, at, et, w, lift in FRINGE:
    n = 12; pts = []; ups = []; ws = []
    for i in range(n):
        t = i / (n - 1); e = 74 + (et - 74) * t ** 1.15; a = ar + (at - ar) * t ** 1.5
        pts.append(P(a, e, 0.011 + (lift - 0.011) * t ** 2)); ups.append(dirv(a, e)); ws.append(w * (0.45 + 0.55 * math.sin(math.pi * min(t / 0.6, 1) / 2)) * (1 - sstep((t - 0.70) / 0.30)) ** 0.7)
    lock(H, pts, ups, ws, 0.006, ['charcoal'] * n, ridge=0.5 + 0.2 * np.sign(at - ar))

# ---------------- the face-framing locks: from the temples down past the jaw, cobalt at the ends
def face_y(x, z, last):
    hit = bvh.ray_cast(Vector((x, -0.4, z)), Vector((0, 1, 0)), 0.6); return hit[0].y if hit[0] is not None and hit[0].y < C[1] else last
for sg in (1, -1):
    n = 14; pts = []; ups = []; ws = []; mats = []; y = None
    top = P(sg * 62, 16, 0.013)
    for i in range(n):
        t = i / (n - 1); z = top[2] + (CHIN - 0.075 - top[2]) * t; x = sg * (abs(top[0]) - 0.012 * math.sin(math.pi * t) - 0.010 * t)
        ys = face_y(x, z, y if y is not None else top[1] + 0.012); y = ys if y is None else min(max(ys, y - 0.006), y + 0.006)
        yy = top[1] + (y - 0.012 - top[1]) * sstep(t / 0.25) if t < 0.25 else y - 0.012
        pts.append(top if i == 0 else np.array([x, yy, z])); ups.append(unit([sg * 0.55, -0.83, 0])); ws.append(0.023 * (0.5 + 0.5 * sstep(t / 0.2)) * (1 - 0.92 * sstep((t - 0.55) / 0.45)))
        mats.append(tone(z, CHIN - 0.03, CHIN + 0.02))
    lock(H, pts, ups, ws, 0.005, mats)

# ---------------- the bun at the back, low and wide, cobalt below; a braid wreath where it meets the head, a coil on it
B = C + np.array([-0.020, skull(180, 5) + 0.012, 0.004]); BR = np.array([0.092, 0.064, 0.084])
NA2, NE2 = 28, 14; V = []; Fc = []; Mm = []
for j in range(NE2 + 1):
    e = -math.pi / 2 + math.pi * j / NE2
    for i in range(NA2):
        a = 2 * math.pi * i / NA2; swell = 1 + 0.03 * math.sin(6 * a + 4 * e)
        V.append(B + BR * swell * np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)]))
for j in range(NE2):
    for i in range(NA2):
        a, b = j * NA2 + i, j * NA2 + (i + 1) % NA2; Fc.append((a, b, b + NA2, a + NA2)); Mm.append(tone(0.5 * (V[a][2] + V[a + NA2][2]), B[2] - 0.035, B[2] - 0.005))
H.add(V, Fc, Mm)
ring = [B + np.array([0.079 * math.cos(t), -0.020 + 0.012 * math.sin(t) ** 2, 0.074 * math.sin(t)]) for t in np.linspace(0, 2 * math.pi, 56, endpoint=False)]
rope(H, ring, 0.017, [tone(p[2], B[2] - 0.045, B[2] - 0.015) for p in ring], closed=True, pitch=0.026)
coil = [B + np.array([(0.052 - 0.040 * t) * math.cos(4.6 * math.pi * t), 0.040 + 0.026 * t, (0.050 - 0.038 * t) * math.sin(4.6 * math.pi * t)]) for t in np.linspace(0, 1, 60)]
rope(H, coil, 0.0135, [tone(p[2], B[2] - 0.04, B[2] - 0.012) for p in coil], pitch=0.024)
for sg in (1, -1):                                    # a braid along each side of the head into the bun
    br = [P(sg * (48 + 80 * t), 40 - 22 * t - 10 * math.sin(math.pi * t) * 0, 0.014) for t in np.linspace(0, 1, 26)]
    rope(H, br, [0.006 + 0.006 * sstep(t / 0.25) for t in np.linspace(0, 1, 26)], 'charcoal', pitch=0.020)

# ---------------- two stray hairs at the crown
crown = C + np.array([0, 0.0, skull(0, 90) + 0.010])
for ctrl, w in (([(0.004, -0.012, 0.0), (0.012, -0.018, 0.030), (0.036, -0.022, 0.036), (0.046, -0.024, 0.018)], 0.006), ([(-0.02, 0.01, 0.0), (-0.030, 0.010, 0.018), (-0.044, 0.012, 0.030), (-0.060, 0.014, 0.034)], 0.007)):
    ctrl = np.array(ctrl); n = 12; pts = []
    for t in np.linspace(0, 1, n): pts.append(crown + (1 - t) ** 3 * ctrl[0] + 3 * t * (1 - t) ** 2 * ctrl[1] + 3 * t * t * (1 - t) * ctrl[2] + t ** 3 * ctrl[3])
    lock(H, pts, [np.array([0, -1.0, 0.2])] * n, [w * (1 - 0.9 * t) for t in np.linspace(0, 1, n)], 0.003, ['charcoal'] * n)
hair = H.build('elise_hair')

# ---------------- the pin: a butterfly and a dark flower on her right; an earring on each ear
A = Mesh()
def plate(M, o, ex, ey, ez, poly, mat, th=0.0016):
    """A flat plate: an outline in the plane (ex, ey), given thickness along ez."""
    n = len(poly); V = [o + ex * p[0] + ey * p[1] + ez * th for p in poly] + [o + ex * p[0] + ey * p[1] - ez * th for p in poly]
    M.add(V, [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)], mat)
def frame(a, e, off):
    o = P(a, e, off); ez = dirv(a, e); ex = unit(np.cross([0, 0, 1], ez)); ey = np.cross(ez, ex); return o, ex, ey, ez
o, ex, ey, ez = frame(-56, 40, 0.019)
for wing in ([(0, 0), (0.012, 0.030), (0.030, 0.052), (0.040, 0.040), (0.036, 0.016), (0.020, 0.002)], [(0, 0), (0.022, -0.004), (0.034, -0.016), (0.028, -0.030), (0.012, -0.024)],
             [(0, 0), (-0.010, 0.032), (-0.004, 0.058), (0.006, 0.036)]):
    wing = np.array(wing); plate(A, o, ex, ey, ez, wing, 'metal'); c = wing.mean(0); plate(A, o + ez * 0.0012, ex, ey, ez, c + (wing - c) * 0.68, 'butterfly')
o, ex, ey, ez = frame(-64, 22, 0.022)
for k in range(8):
    t = 2 * math.pi * k / 8; d = np.array([math.cos(t), math.sin(t)]); q = np.array([-d[1], d[0]])
    plate(A, o + ez * 0.001 * (k % 2), ex, ey, ez, [d * 0.004, d * 0.014 + q * 0.0055, d * 0.024, d * 0.014 - q * 0.0055], 'metal', th=0.0013)
plate(A, o + ez * 0.003, ex, ey, ez, [(0.0035 * math.cos(t), 0.0035 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 8, endpoint=False)], 'gold', th=0.002)
for sg in (1, -1):
    ear = hv[hv[:, 0] * sg > np.abs(hv[:, 0]).max() - 0.016]; lobe = ear[ear[:, 2].argmin()]; print('ear lobe', sg, lobe.round(3))
    o = lobe + np.array([sg * 0.004, -0.002, -0.006]); ez = np.array([sg * 0.94, -0.34, 0]); ex = unit(np.cross([0, 0, 1], ez)); ey = np.cross(ez, ex)
    for k in range(5):
        t = 2 * math.pi * k / 5 + 0.3; d = np.array([math.cos(t), math.sin(t)]); q = np.array([-d[1], d[0]])
        plate(A, o, ex, ey, ez, [d * 0.0016, d * 0.0045 + q * 0.0026, d * 0.0085, d * 0.0045 - q * 0.0026], 'metal', th=0.001)
    plate(A, o + ez * 0.002, ex, ey, ez, [(0.0034 * math.cos(t), 0.0034 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 8, endpoint=False)], 'pearl', th=0.002)
pin = A.build('elise_pin')
for o_ in (hair, pin): o_.parent = body.parent
print('hair: %d faces, %d triangles; pin: %d triangles' % (len(hair.data.polygons), sum(len(p.vertices) - 2 for p in hair.data.polygons), sum(len(p.vertices) - 2 for p in pin.data.polygons)))
bpy.ops.wm.save_as_mainfile(filepath=WD + '/head.blend')
hz = 0.5 * (CHIN + TOP) + 0.01; S = 0.46
VIEWS = [[(n, [0, C[1], hz, S, az, el], 560, 560) for n, az, el in (('front', 0, 0), ('three quarter', 35, 5), ('her left', 90, 0), ('back', 180, 0))],
         [(n, [0, C[1], hz, S, az, el], 560, 560) for n, az, el in (('her right', 270, 0), ('three quarter right', -35, 5), ('top', 0, 75), ('low', 0, -25))]]
review.sheet(WD, VIEWS, 'b1.jpg')
