"""Iris hero costume, hair and props: separate meshes fitted to the MPFB body (Blender 4.5).

Each garment is a loft of rings sampled from the body's cross-sections, with real cloth thickness
(solidify), sewn trim bands (vertex attribute "trim", read by the shading bake), folds from low-frequency
displacement, and skin weights transferred from the body plus spring-chain weights for hems and tails.
Layout and proportions follow the owner's blockout (art/agents/reference/create_scrollkeeper_character.py).
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

V = Vector
TAU = 2 * math.pi


# ===================================================================== body sampling

class BodyProbe:
    """Cross-sections of the body (torso only) and a nearest-surface lookup."""

    def __init__(self, body, groups_of):
        self.co = [body.matrix_world @ v.co for v in body.data.vertices]
        self.groups_of = groups_of
        self.kd = KDTree(len(self.co))
        for i, p in enumerate(self.co):
            self.kd.insert(p, i)
        self.kd.balance()

    def section(self, z, band=0.02, bones=("pelvis", "spine", "chest", "neck", "thigh_L", "thigh_R")):
        pts = [p for i, p in enumerate(self.co) if abs(p.z - z) < band and self.groups_of(i) in bones]
        if not pts:
            return V((0, 0, z)), 0.1, 0.08
        xs = [p.x for p in pts]
        ys = [p.y for p in pts]
        c = V(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, z))
        return c, (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2


def ellipse(c, rx, ry, th, front_flat=0.0):
    """Point on a soft ellipse; front (-Y) slightly flattened like a garment over a chest."""
    y = math.sin(th)
    if y < 0:
        y *= 1.0 - front_flat
    return V((c.x + rx * math.cos(th), c.y + ry * y, c.z))


def loft(name, rings, closed_u=True, faces_skip=None):
    """rings: list of lists of Vectors (same length). Returns a mesh object with UV (u around, v down)."""
    me = bpy.data.meshes.new(name)
    b = bmesh.new()
    rows = []
    for ring in rings:
        rows.append([b.verts.new(p) for p in ring])
    n = len(rings[0])
    uv = b.loops.layers.uv.new("UVMap")
    for r in range(len(rows) - 1):
        span = n if closed_u else n - 1
        for i in range(span):
            j = (i + 1) % n
            if faces_skip and faces_skip(r, i):
                continue
            f = b.faces.new((rows[r][i], rows[r][j], rows[r + 1][j], rows[r + 1][i]))
            for lo, (uu, vv) in zip(f.loops, ((i, r), (i + 1, r), (i + 1, r + 1), (i, r + 1))):
                lo[uv].uv = (uu / n, 1 - vv / (len(rows) - 1))
    b.normal_update()
    b.to_mesh(me)
    b.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def set_attr(o, name, fn):
    """Per-vertex float attribute (0..1) from fn(index, co)."""
    a = o.data.attributes.get(name) or o.data.attributes.new(name, "FLOAT", "POINT")
    for i, v in enumerate(o.data.vertices):
        a.data[i].value = fn(i, v.co)


def solidify(o, t, offset=-1.0):
    m = o.modifiers.new("thick", "SOLIDIFY")
    m.thickness = t
    m.offset = offset
    m.use_even_offset = True
    m.use_rim = True
    m.use_quality_normals = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def smooth(o, angle=60):
    for p in o.data.polygons:
        p.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        pass


# ===================================================================== garments

def coat(P, hem=0.40, top=1.43):
    """Long open charcoal coat: body with an open front, a standing collar, set-in sleeves are separate."""
    n, zs = 56, []
    rows = 30
    for r in range(rows + 1):
        zs.append(top - (top - hem) * (r / rows) ** 1.0)
    rings = []
    hip_r = None
    for z in zs:
        c, rx, ry = P.section(max(z, 0.86))
        c = V((c.x, c.y, z))
        if z > 1.30:                             # over the shoulders: rounder, wider
            k = (z - 1.30) / (top - 1.30)
            rx = rx * (1 - 0.15 * k) + 0.03
            ry = ry + 0.03
        else:
            rx, ry = rx + 0.032, ry + 0.035
        if z < 0.95:                             # below the hips: an A-line flare
            hip_r = hip_r or (rx, ry)
            f = (0.95 - z) / (0.95 - hem)
            rx = hip_r[0] + 0.07 * f
            ry = hip_r[1] + 0.06 * f
        ring = []
        gap = math.radians(9 + 15 * (top - z) / (top - hem))     # the coat hangs open lower down
        for i in range(n):
            th = -math.pi / 2 + gap + (TAU - 2 * gap) * i / (n - 1)
            p = ellipse(c, rx, ry, th, 0.15)
            if z < 0.9:                          # soft vertical folds in the skirt
                fold = 0.010 * math.sin(th * 9 + z * 3) * (0.9 - z) / 0.5
                p += V((math.cos(th), math.sin(th), 0)) * fold
            ring.append(p)
        rings.append(ring)
    o = loft("coat", rings, closed_u=False)
    # trim band: the front edges and the hem (smoky lighter wool)
    nv = n
    set_attr(o, "trim", lambda i, co: 1.0 if (i % nv) in (0, 1, nv - 2, nv - 1) or i >= nv * (rows - 1) else 0.0)
    solidify(o, 0.012)
    smooth(o)
    return o


def collar(P, z0=1.40, z1=1.56):
    n = 40
    rings = []
    for k in range(6):
        z = z0 + (z1 - z0) * k / 5
        c, rx, ry = P.section(min(z, 1.50), bones=("neck", "chest"))
        flare = 0.020 + 0.012 * (k / 5) ** 1.5
        ring = []
        gap = math.radians(62 + 8 * k / 5)
        for i in range(n):
            th = -math.pi / 2 + gap + (TAU - 2 * gap) * i / (n - 1)
            ring.append(ellipse(c, rx + flare, ry + flare, th))
        rings.append(ring)
    o = loft("collar", rings, closed_u=False)
    set_attr(o, "trim", lambda i, co: 1.0 if i >= n * 5 else 0.0)
    solidify(o, 0.010)
    smooth(o)
    return o


def sleeve(rig_pts, side, name):
    """Coat sleeve along shoulder -> elbow -> wrist, a turned-back cuff at the end."""
    S, E, W = rig_pts
    n, rows = 18, 14
    path = [S.lerp(E, t / 6) for t in range(6)] + [E.lerp(W, t / 8) for t in range(9)]
    radii = [0.062 - 0.006 * t / 14 for t in range(len(path))]
    rings = []
    for i, (p, r) in enumerate(zip(path, radii)):
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        a = d.orthogonal().normalized()
        b2 = d.cross(a).normalized()
        cuff = 1.12 if i >= len(path) - 3 else 1.0
        rings.append([p + (a * math.cos(TAU * j / n) + b2 * math.sin(TAU * j / n)) * r * cuff for j in range(n)])
    o = loft(name, rings)
    set_attr(o, "trim", lambda i, co: 1.0 if i >= n * (len(path) - 3) else 0.0)
    solidify(o, 0.008)
    smooth(o)
    return o


def capelet(P, top=1.475, hem=1.17):
    n, rows = 64, 9
    rings = []
    for r in range(rows + 1):
        z = top - (top - hem) * r / rows
        c, rx, ry = P.section(1.36, bones=("chest",))
        k = r / rows
        rx2 = 0.11 + (rx + 0.115 - 0.11) * math.sin(min(1, k * 1.6) * math.pi / 2)
        ry2 = 0.10 + (ry + 0.07 - 0.10) * math.sin(min(1, k * 1.6) * math.pi / 2)
        ring = []
        gap = math.radians(14 + 16 * k)
        for i in range(n):
            th = -math.pi / 2 + gap + (TAU - 2 * gap) * i / (n - 1)
            zz = z - (0.025 * (0.5 + 0.5 * math.sin(th * 7 + 1.3)) * k ** 2)
            ring.append(ellipse(V((c.x, c.y + 0.01, zz)), rx2, ry2, th, 0.1))
        rings.append(ring)
    o = loft("capelet", rings, closed_u=False)
    set_attr(o, "trim", lambda i, co: 1.0 if i >= n * rows or (i % n) in (0, n - 1) else 0.0)
    solidify(o, 0.010)
    smooth(o)
    return o


def hood_down(P):
    """The hood folded down behind the neck: a thick rolled band, open at the front."""
    n = 30
    rings = []
    c0, rx, ry = P.section(1.47, bones=("neck",))
    for k in range(7):
        a = math.pi * k / 6
        rings.append([V((0, 0, 0))] * n)
        ring = []
        for i in range(n):
            th = math.radians(20) + math.radians(140) * i / (n - 1)            # behind the neck
            base = V((c0.x + (rx + 0.075) * math.cos(th), c0.y + 0.02 + (ry + 0.085) * math.sin(th), 1.475))
            out = V((math.cos(th), math.sin(th), 0))
            ring.append(base + out * (0.035 * math.cos(a)) + V((0, 0, 0.045 * math.sin(a))) + V((0, 0.02, 0)) * k / 6)
        rings[-1] = ring
    o = loft("hood", rings, closed_u=False)
    solidify(o, 0.008)
    smooth(o)
    return o


def dress(P, top=1.43, hem=0.17):
    n, rows = 44, 26
    rings = []
    hip = None
    for r in range(rows + 1):
        z = top - (top - hem) * r / rows
        c, rx, ry = P.section(max(z, 0.80))
        c = V((c.x, c.y, z))
        rx, ry = rx + 0.010, ry + 0.012
        if z < 0.95:
            hip = hip or (rx, ry)
            f = (0.95 - z) / (0.95 - hem)
            rx, ry = hip[0] + 0.05 * f, hip[1] + 0.06 * f
        ring = []
        for i in range(n):
            th = -math.pi / 2 + TAU * i / n
            p = ellipse(c, rx, ry, th)
            if z < 0.9:
                p += V((math.cos(th), math.sin(th), 0)) * 0.006 * math.sin(th * 7) * (0.9 - z) / 0.7
            ring.append(p)
        rings.append(ring)
    o = loft("dress", rings)
    set_attr(o, "trim", lambda i, co: 1.0 if i >= n * (rows - 1) else 0.0)
    solidify(o, 0.006)
    smooth(o)
    return o


def boots_from_body(body, keep_fn):
    """Boots: the body's feet and lower shins, duplicated, inflated and closed at the top."""
    o = body.copy()
    o.data = body.data.copy()
    o.name = "boots"
    if o.data.shape_keys:
        o.shape_key_clear()
    bpy.context.scene.collection.objects.link(o)
    b = bmesh.new()
    b.from_mesh(o.data)
    kill = [v for v in b.verts if not keep_fn(v.co)]
    bmesh.ops.delete(b, geom=kill, context="VERTS")
    for v in b.verts:
        v.co += v.normal * (0.009 if v.co.z > 0.02 else 0.004)
        if v.co.z < 0.012:
            v.co.z = 0.0
    b.to_mesh(o.data)
    b.free()
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    o.parent = None
    set_attr(o, "trim", lambda i, co: 1.0 if co.z < 0.03 else 0.0)        # the sole
    smooth(o)
    return o


def scarf(P, rig_pts):
    """Dusty-violet scarf: two wraps round the neck and a long fringed tail hanging on the left."""
    objs = []
    c, rx, ry = P.section(1.47, bones=("neck",))
    n = 36
    for k, (z, grow) in enumerate(((1.448, 0.026), (1.486, 0.020))):
        rings = []
        for t in range(5):
            a = TAU * t / 4
            ring = []
            for i in range(n):
                th = TAU * i / n
                tube = V((math.cos(th), math.sin(th), 0)) * (0.013 * math.cos(a)) + V((0, 0, 0.022 * math.sin(a)))
                ring.append(ellipse(V((c.x, c.y - 0.006, z + 0.006 * math.sin(th * 2 + k))), rx + grow, ry + grow + 0.008, th)
                            + tube)
            rings.append(ring)
        objs.append(loft(f"scarf_wrap_{k}", rings))
    # tail: a ribbon from the front of the wrap down the chest, gently waved
    top = V((0.045, c.y - ry - 0.05, 1.44))
    pts = [top + V((0.012 * math.sin(t * 2.2), -0.012 * t / 9 - 0.01 * math.sin(t * 1.3), -0.40 * t / 9)) for t in range(10)]
    rings = []
    for i, p in enumerate(pts):
        w = 0.040 - 0.004 * i / 9
        rings.append([p + V((-w, 0, 0)), p + V((0, -0.004, 0)), p + V((w, 0, 0))])
    tail = loft("scarf_tail", rings, closed_u=False)
    set_attr(tail, "trim", lambda i, co: 1.0 if co.z < pts[-1].z + 0.02 else 0.0)
    solidify(tail, 0.006, 0.0)
    objs.append(tail)
    # fringe: thin twisted strands under the tail end
    fb = bmesh.new()
    end = pts[-1]
    for j in range(11):
        x = -0.036 + 0.072 * j / 10
        L = 0.045 + 0.012 * ((j * 7) % 3) / 2
        a = V((end.x + x, end.y, end.z + 0.002))
        bm_strip(fb, a, a + V((0.002 * math.sin(j), -0.002, -L)), 0.0035)
    fr = new_obj("scarf_fringe", fb)
    objs.append(fr)
    for o in objs:
        smooth(o)
    return objs, pts


def bm_strip(b, a, c, w):
    d = (c - a)
    side = d.cross(V((0, -1, 0))).normalized() * w
    vs = [b.verts.new(a - side), b.verts.new(a + side), b.verts.new(c + side * 0.5), b.verts.new(c - side * 0.5)]
    b.faces.new(vs)
    vs2 = [b.verts.new(a - V((0, w, 0))), b.verts.new(a + V((0, w, 0))), b.verts.new(c + V((0, w * 0.5, 0))),
           b.verts.new(c - V((0, w * 0.5, 0)))]
    b.faces.new(vs2)


def new_obj(name, b):
    me = bpy.data.meshes.new(name)
    b.to_mesh(me)
    b.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def belt_and_props(P):
    objs = []
    c, rx, ry = P.section(1.03)
    n = 48
    rings = []
    for k in range(3):
        z = 1.015 + 0.03 * k / 2
        rings.append([ellipse(V((c.x, c.y, z)), rx + 0.020, ry + 0.022, TAU * i / n) for i in range(n)])
    belt = loft("belt", rings)
    solidify(belt, 0.004)
    objs.append(belt)
    # cognac pouch on her left hip, flap and a brass clasp
    b = bmesh.new()
    bmesh.ops.create_cube(b, size=1.0)
    for v in b.verts:
        v.co = V((v.co.x * 0.085, v.co.y * 0.040, v.co.z * 0.095))
    bmesh.ops.bevel(b, geom=list(b.edges), offset=0.012, segments=2, affect="EDGES")
    for v in b.verts:
        v.co += V((rx * 0.78 + 0.03, c.y - ry * 0.75 - 0.03, 0.975))
    pouch = new_obj("pouch", b)
    objs.append(pouch)
    # silver pendant on a dark cord
    b = bmesh.new()
    bmesh.ops.create_circle(b, cap_ends=True, segments=16, radius=0.016)
    bmesh.ops.rotate(b, verts=b.verts, cent=V(), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "X"))
    ext = bmesh.ops.extrude_face_region(b, geom=list(b.faces))
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += 0.005
    cc, crx, cry = P.section(1.33, bones=("chest",))
    for v in b.verts:
        v.co += V((0, cc.y - cry - 0.045, 1.33))
    objs.append(new_obj("pendant", b))
    for o in objs:
        smooth(o)
    return objs


# ===================================================================== hair

def hair_cards(scalp_pts, head_c, head_r, brow_z, seed=11, n_cards=260, length=0.25):
    """Chestnut shoulder-length wavy hair from cards. Each strand slides down the skull (an ellipsoid a
    little larger than the head) under gravity, then falls past the jaw with a soft outward flare and a
    wave; cards lie flat on that surface (UV v: root -> tip). Front roots form a fringe swept to her
    right that stops above the brows."""
    rnd = random.Random(seed)
    b = bmesh.new()
    uv = b.loops.layers.uv.new("UVMap")
    roots = rnd.sample(scalp_pts, min(n_cards, len(scalp_pts)))
    segs = 10

    def shell(p, off):
        q = p - head_c
        e = V((q.x / (head_r[0] + off), q.y / (head_r[1] + off), q.z / (head_r[2] + off)))
        return head_c + q * (1.0 / max(e.length, 1e-6)), e.length

    part_x = 0.022                                   # side parting, a little to her left
    roots = [r for r in roots if not ((r - head_c).y < -head_r[1] * 0.45 and (r - head_c).z < head_r[2] * 0.62)]
    for ci, r in enumerate(roots):
        out = (r - head_c).normalized()
        q = r - head_c
        side = 1.0 if r.x > part_x else -1.0
        front = q.y < -head_r[1] * 0.25 and q.z > head_r[2] * 0.55 and side < 0 and rnd.random() < 0.7
        layer = 0.008 + 0.010 * rnd.random()
        if front:                                    # fringe: swept across to her right, above the brows
            L = 0.11 + 0.04 * rnd.random()
            pull = V((-0.8, -0.35, -0.45)).normalized()
        else:
            L = length * (0.85 + 0.3 * rnd.random())
            fwd = max(0.0, -q.y / head_r[1])          # front roots fall to the side, off the face
            pull = V((side * (0.25 + 0.9 * fwd), 0.15 + 0.4 * fwd, -1.0)).normalized()
        pts = [shell(r, layer)[0]]
        p = pts[0].copy()
        for s in range(segs):
            t = (s + 1) / segs
            n = (p - head_c).normalized()
            g = pull - n * pull.dot(n)                         # gravity along the surface
            if g.length < 1e-3:
                g = V((0, 0, -1))
            p = p + g.normalized() * (L / segs)
            below = p.z < head_c.z - head_r[2] * 0.35
            if not below:
                p = shell(p, layer + 0.004 * t)[0]
            else:
                flare = V((p.x - head_c.x, p.y - head_c.y, 0)).normalized() * 0.012
                p = p + flare * (L / segs) * 4
            if front:
                p.z = max(p.z, brow_z + 0.012)
            wave = 0.006 * math.sin(t * 10 + ci * 1.7) * t
            pts.append(p + (p - head_c).normalized() * wave)
        w0 = (0.011 if front else 0.016) * (0.8 + 0.4 * rnd.random())
        prev = None
        u0 = (ci % 4) / 4
        for s, p in enumerate(pts):
            t = s / segs
            w = w0 * (1.0 - 0.6 * t)
            tang = (pts[min(s + 1, segs)] - pts[max(s - 1, 0)]).normalized()
            nrm = (p - head_c).normalized()
            side = tang.cross(nrm).normalized() * w
            row = (b.verts.new(p - side), b.verts.new(p + side))
            if prev:
                f = b.faces.new((prev[0], prev[1], row[1], row[0]))
                for lo, (uu, vv) in zip(f.loops, ((u0, 1 - (s - 1) / segs), (u0 + 0.25, 1 - (s - 1) / segs),
                                                  (u0 + 0.25, 1 - s / segs), (u0, 1 - s / segs))):
                    lo[uv].uv = (uu, vv)
            prev = row
    o = new_obj("hair", b)
    smooth(o, 80)
    return o


def scalp_points(body, scalp_idx, k_offset=0.004):
    out = []
    for i in scalp_idx:
        v = body.data.vertices[i]
        out.append(body.matrix_world @ (v.co + v.normal * k_offset))
    return out


def hair_cap(body, scalp_idx):
    """A thin hair-coloured shell over the scalp so no skin shows between the cards."""
    o = body.copy()
    o.data = body.data.copy()
    o.name = "hair_cap"
    if o.data.shape_keys:
        o.shape_key_clear()
    bpy.context.scene.collection.objects.link(o)
    b = bmesh.new()
    b.from_mesh(o.data)
    b.verts.ensure_lookup_table()
    keep = set(scalp_idx)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.index not in keep], context="VERTS")
    for v in b.verts:
        v.co += v.normal * 0.006
    b.to_mesh(o.data)
    b.free()
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    o.parent = None
    smooth(o)
    return o
