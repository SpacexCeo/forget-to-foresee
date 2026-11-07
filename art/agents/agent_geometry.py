"""Shared geometry for the clan agents: mesh primitives, ray-cast conforming,
the parametric humanoid base and the garment library.

Imported by build_agents.py (run inside Blender 4.5). Blender is Z-up with the
front facing -Y; metres throughout. The character's right hand is -X.
"""

import math
import random

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

CLEAR = 0.016                 # default clearance between garment layers (m)
THICK = 0.008                 # default garment thickness (m); CLEAR - THICK > bake cage

SLOTS = ("body", "garment", "ornament")
KINDS = ("skin", "cloth", "metal", "wood", "crystal", "glass", "leather", "moss",
         "resin", "stone", "felt", "wool", "armor")


# ================================================================ utilities

def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mat_simple(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def select_only(objs, active):
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True,
                                         depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)


def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def frame(origin, zdir, xhint=(1, 0, 0)):
    """4x4 matrix whose local Z points along zdir, placed at origin."""
    z = Vector(zdir).normalized()
    x = Vector(xhint)
    x = x - z * x.dot(z)
    if x.length < 1e-6:
        x = Vector((0, 1, 0)) - z * z.y
    x.normalize()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(origin)
    return m


def basis(xv, yv, zv, origin):
    m = Matrix((Vector(xv), Vector(yv), Vector(zv))).transposed().to_4x4()
    m.translation = Vector(origin)
    return m


def placed(bm, M, fn, *a, **k):
    """Run a bmesh builder in local coordinates and move the new verts by M."""
    before = set(bm.verts)
    fn(bm, *a, **k)
    new = [v for v in bm.verts if v not in before]
    bmesh.ops.transform(bm, verts=new, matrix=M)
    return new


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ========================================================== mesh primitives

def revolve(bm, profile, n, rfunc=None, phase=0.0, cap_bottom=False, cap_top=False,
            sx=1.0, sy=1.0):
    """Surface of revolution. Profile (r, z) runs bottom to top along the outside."""
    rings = []
    for r, z in profile:
        ring = []
        for i in range(n):
            th = phase + 2 * math.pi * i / n
            rr = max(rfunc(th, z, r) if rfunc else r, 1e-5)
            ring.append(bm.verts.new((sx * rr * math.cos(th), sy * rr * math.sin(th), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    return rings


def tube(bm, pts, radius, sides, closed=False, cap=True, phase=0.0):
    """Swept circle along a polyline with parallel-transport frames."""
    pts = [Vector(p) for p in pts]
    m = len(pts)
    rings, u, prev_t = [], None, None
    for i, p in enumerate(pts):
        if closed:
            t = (pts[(i + 1) % m] - pts[(i - 1) % m]).normalized()
        else:
            t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
        if u is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(ref).normalized()
        else:
            u = prev_t.rotation_difference(t) @ u
            u = (u - t * u.dot(t)).normalized()
        v = t.cross(u)
        r = radius(i / (m - 1)) if callable(radius) else radius
        rings.append([bm.verts.new(p + r * (math.cos(a) * u + math.sin(a) * v))
                      for a in (phase + 2 * math.pi * k / sides for k in range(sides))])
        prev_t = t
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(sides):
            l = (k + 1) % sides
            bm.faces.new((a[k], a[l], b[l], b[k]))
    if cap and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return rings


def box(bm, center, size, M=None):
    m = Matrix.Translation(center) @ Matrix.Diagonal((*size, 1))
    if M is not None:
        m = M @ m
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def ico(bm, center, radius, subdiv=1, scale=(1, 1, 1)):
    r = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    bmesh.ops.transform(bm, verts=r["verts"], matrix=Matrix.Translation(center) @
                        Matrix.Diagonal((radius * scale[0], radius * scale[1],
                                         radius * scale[2], 1)))
    return r["verts"]


def torus(bm, center, R, r, n=24, m=6, M=None):
    pts = [(R * math.cos(2 * math.pi * i / n), R * math.sin(2 * math.pi * i / n), 0)
           for i in range(n)]
    T = Matrix.Translation(center) @ (M if M is not None else Matrix.Identity(4))
    placed(bm, T, lambda b: tube(b, pts, r, m, closed=True))


def crystal(bm, base, direction, length, radius, sides=6, tip=0.32, twist=0.0, xhint=(1, 0, 0)):
    """Faceted quartz crystal: hexagonal prism with a pointed termination."""
    prof = [(radius * 0.86, 0.0), (radius, length * 0.12), (radius * 0.97, length * (1 - tip)),
            (0.0, length)]
    placed(bm, frame(base, direction, xhint), lambda b: revolve(
        b, prof, sides, phase=twist, cap_bottom=True))


def stake(bm, base, direction, length, radius, sides=6, rnd=None, tip=0.22):
    """Split, sharpened log: irregular hexagonal shaft with a faceted point."""
    rnd = rnd or random.Random(1)
    jit = [1.0 + rnd.uniform(-0.18, 0.12) for _ in range(sides)]
    ph = rnd.uniform(0, 1)

    def rf(th, z, r):
        k = int(round((th - ph) / (2 * math.pi) * sides)) % sides
        return r * jit[k]
    prof = [(radius, 0.0), (radius * 1.03, length * 0.35), (radius * 0.96, length * (1 - tip)),
            (radius * 0.18, length * 0.985), (0.0, length)]
    placed(bm, frame(base, direction), lambda b: revolve(
        b, prof, sides, rfunc=rf, phase=ph, cap_bottom=True))


def grid_faces(bm, rows, closed_u, mask=None):
    """Quad faces between consecutive rows of verts (rows run top to bottom)."""
    nu = len(rows[0])
    faces = []
    for v in range(len(rows) - 1):
        for i in range(nu if closed_u else nu - 1):
            j = (i + 1) % nu
            if mask and not mask(v, i):
                continue
            q = list(dict.fromkeys((rows[v][i], rows[v + 1][i], rows[v + 1][j], rows[v][j])))
            if len(q) >= 3:
                faces.append(bm.faces.new(q))
    return faces


def orient_outward(bm, axis_fn):
    """Flip all faces if most of them face the garment's own axis."""
    score = 0.0
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        score += f.normal.dot(c - axis_fn(c)) * f.calc_area()
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.normal_update()


def finish_sheet(bm):
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bad = [f for f in bm.faces if f.calc_area() < 1e-9]
    if bad:
        bmesh.ops.delete(bm, geom=bad, context="FACES")
    return bm


# ============================================================== conforming

def furthest_hit(bvh, origin, direction, limit, r=None):
    """Distance of the surface a point at distance r along the ray must clear.

    Without r: the furthest surface crossing up to limit (outermost surface).
    With r: the furthest *exit* (surface facing along the ray) up to limit, but
    scanning stops at an *entry* beyond r, so a garment point that lies in free
    space is never pushed into a solid that only starts further out (an arm next
    to the torso, the torso next to a sleeve)."""
    far = 0.0
    origin = Vector(origin)
    travelled = 0.0
    for _ in range(16):
        hit = bvh.ray_cast(origin + direction * travelled, direction, limit - travelled)
        if hit[0] is None:
            break
        d = (hit[0] - origin).length
        travelled = d + 1e-4
        if r is None:
            far = d
        elif hit[1].dot(direction) > 0:
            far = d                                  # exit: surface beneath the point
        elif d > r:
            break                                    # entry beyond the point: stop
        if travelled >= limit:
            break
    return far


def conform_grid(P, A, bvh, clear=CLEAR, push=0.10, closed_u=True, iters=6):
    """Push grid points P outward (along P - A) so they clear everything in bvh.
    The push is smoothed over the grid (never below the required push) so the
    garment drapes instead of denting around single hits."""
    if bvh is None:
        return P
    nv, nu = len(P), len(P[0])
    dirs, R, need = [], [], []
    for v in range(nv):
        drow, rrow, nrow = [], [], []
        for u in range(nu):
            d = P[v][u] - A[v][u]
            r = d.length
            dn = d / r if r > 1e-9 else Vector((0, 0, 1))
            far = furthest_hit(bvh, A[v][u], dn, r + push, r)
            drow.append(dn)
            rrow.append(r)
            nrow.append(max(0.0, far + clear - r) if far > 0 else 0.0)
        dirs.append(drow)
        R.append(rrow)
        need.append(nrow)
    delta = [row[:] for row in need]
    for _ in range(iters):
        nd = [row[:] for row in delta]
        for v in range(nv):
            for u in range(nu):
                acc, cnt = 0.0, 0
                for dv, du in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    vv, uu = v + dv, u + du
                    if closed_u:
                        uu %= nu
                    if 0 <= vv < nv and 0 <= uu < nu:
                        acc += delta[vv][uu]
                        cnt += 1
                nd[v][u] = max(need[v][u], 0.5 * delta[v][u] + 0.5 * acc / max(cnt, 1))
        delta = nd
    return [[A[v][u] + dirs[v][u] * (R[v][u] + delta[v][u]) for u in range(nu)]
            for v in range(nv)]


def conform_verts_along_normals(bm, bvh, clear=CLEAR, reach=0.25, push=0.10):
    """Drape a free sheet (tails, leaves): push verts out along their normals."""
    bm.normal_update()
    for vtx in bm.verts:
        n = vtx.normal if vtx.normal.length > 0.5 else Vector((0, 0, 1))
        origin = vtx.co - n * reach
        far = furthest_hit(bvh, origin, n, reach + push, reach)
        if far > 0 and far + clear > reach:
            vtx.co = origin + n * (far + clear)


# ===================================================================== agent

class Agent:
    """Collects the parts of one agent. Each part has one export slot
    (body / garment / ornament) and one surface kind used by the master shader."""

    def __init__(self, key, title, palette, col):
        self.key = key
        self.title = title
        self.pal = palette
        self.col = col
        self.parts = []
        self.tmp_mats = [mat_simple(f"tmp_{s}", (0.5, 0.5, 0.5)) for s in SLOTS]
        self.colliders = {"core": bmesh.new(), "all": bmesh.new()}
        self._bvh = {}
        self.sockets = {}
        self.part_tris = {}
        self.emissive = None      # optional {"slot", "name", "color", "strength"}

    def bvh(self, which="all"):
        if which not in self._bvh:
            bm = self.colliders[which]
            self._bvh[which] = BVHTree.FromBMesh(bm) if len(bm.faces) else None
        return self._bvh[which]

    def add(self, name, bm, slot, kind, color, rough=0.7, metal=0.0, solid=None,
            collide=("all",), smooth=False, solid_offset=-1.0):
        if isinstance(color, str):
            color = self.pal[color]
        bm.normal_update()
        me = bpy.data.meshes.new(f"{self.key}_{name}")
        bm.to_mesh(me)
        bm.free()
        obj = link(bpy.data.objects.new(me.name, me), self.col)
        if solid:
            mod = obj.modifiers.new("solid", "SOLIDIFY")
            mod.thickness = solid
            mod.offset = solid_offset
            mod.use_rim = True
            mod.use_even_offset = True
            apply_modifiers(obj)
        me = obj.data
        me.materials.append(self.tmp_mats[SLOTS.index(slot)])
        n_f, n_l = len(me.polygons), len(me.loops)
        a = me.attributes.new("kind", "INT", "FACE")
        a.data.foreach_set("value", [KINDS.index(kind)] * n_f)
        # part index per vertex: used to explode the parts apart for clean bakes
        pa = me.attributes.new("part", "INT", "POINT")
        pa.data.foreach_set("value", [len(self.parts) + 1] * len(me.vertices))
        for an, val in (("Col", (*color, 1.0)), ("Prm", (rough, metal, 0.0, 1.0))):
            c = me.color_attributes.new(an, "FLOAT_COLOR", "CORNER")
            c.data.foreach_set("color", list(val) * n_l)
        if smooth:
            me.shade_smooth()
        else:
            me.shade_flat()
        for which in collide or ():
            self.colliders[which].from_mesh(me)
            self._bvh.pop(which, None)
        self.parts.append(obj)
        self.part_tris[name] = self.part_tris.get(name, 0) + mesh_tris(obj)
        return obj

    def add_collider_only(self, which, obj):
        self.colliders[which].from_mesh(obj.data)
        self._bvh.pop(which, None)


# ================================================================ body base

BODY = dict(
    pelvis=((0, 0, 0.955), (0.140, 0.100)),
    waist=((0, 0, 1.075), (0.124, 0.088)),
    chest=((0, 0, 1.235), (0.152, 0.102)),
    upper=((0, 0, 1.360), (0.148, 0.094)),
    neck0=((0, 0, 1.462), (0.056, 0.054)),
    neck1=((0, 0, 1.530), (0.049, 0.049)),
    shoulder_x=0.165, shoulder_z=1.405,
    arm_deg=14.0, upper_arm=0.28, forearm=0.25,   # relaxed stance (static holograms)
    hip=((0.090, 0.0, 0.905), 0.084),
    knee=((0.104, 0.0, 0.500), 0.058),
    ankle=((0.114, 0.0, 0.085), 0.042),
    ball=((0.118, -0.090, 0.036), (0.042, 0.030)),
    toe=((0.122, -0.150, 0.030), (0.034, 0.024)),
    head_c=(0.0, -0.008, 1.636), head_r=(0.080, 0.094, 0.113),
)


def arm(side, body=BODY):
    """Key points of one arm. side=+1 is the agent's left (+X), -1 the right."""
    a = math.radians(body["arm_deg"])
    d = Vector((side * math.sin(a), 0, -math.cos(a)))
    S = Vector((side * body["shoulder_x"], 0, body["shoulder_z"]))
    E = S + d * body["upper_arm"]
    W = E + d * body["forearm"]
    palm = W + d * 0.065
    tip = W + d * 0.175
    inward = Vector((-side * math.cos(a), 0, -math.sin(a)))  # palm normal (towards thigh)
    return dict(S=S, E=E, W=W, palm=palm, tip=tip, dir=d, inward=inward,
                grip=palm + inward * 0.028)


def leg(side, body=BODY):
    (hx, hy, hz), _ = body["hip"]
    (kx, ky, kz), _ = body["knee"]
    (ax, ay, az), _ = body["ankle"]
    return dict(H=Vector((side * hx, hy, hz)), K=Vector((side * kx, ky, kz)),
                A=Vector((side * ax, ay, az)))


def skin_object(name, verts, edges, radii, root, col, levels=1):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], edges, [])
    obj = link(bpy.data.objects.new(name, me), col)
    select_only([obj], obj)
    bpy.ops.object.modifier_add(type="SKIN")
    sk = me.skin_vertices[0].data
    for i, r in enumerate(radii):
        sk[i].radius = r
        sk[i].use_root = (i == root)
    mod = obj.modifiers["Skin"]
    mod.branch_smoothing = 0.35
    mod.use_x_symmetry = True
    mod.use_smooth_shade = False
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = levels
    apply_modifiers(obj)
    return obj


def body_skeleton(body=BODY, with_arms=True):
    verts, radii, edges = [], [], []

    def v(co, r):
        verts.append(Vector(co))
        radii.append(r if isinstance(r, tuple) else (r, r))
        return len(verts) - 1

    pel = v(*body["pelvis"])
    wai = v(*body["waist"])
    che = v(*body["chest"])
    upp = v(*body["upper"])
    n0 = v(*body["neck0"])
    n1 = v(*body["neck1"])
    edges += [(pel, wai), (wai, che), (che, upp), (upp, n0), (n0, n1)]
    for side in (-1, 1):
        if with_arms:
            A = arm(side, body)
            s = v(A["S"], 0.056)
            e = v(A["E"], 0.044)
            w = v(A["W"], 0.033)
            p = v(A["palm"], (0.040, 0.016))
            t = v(A["tip"], (0.032, 0.012))
            th = v(A["W"] + A["dir"] * 0.05 + Vector((0, -0.035, 0)) + A["inward"] * 0.01,
                   0.013)
            edges += [(upp, s), (s, e), (e, w), (w, p), (p, t), (w, th)]
        L = leg(side, body)
        hp = v(L["H"], body["hip"][1])
        kn = v(L["K"], body["knee"][1])
        an = v(L["A"], body["ankle"][1])
        (bx, by, bz), br = body["ball"]
        ba = v((side * bx, by, bz), br)
        (tx, ty, tz), tr = body["toe"]
        to = v((side * tx, ty, tz), tr)
        edges += [(pel, hp), (hp, kn), (kn, an), (an, ba), (ba, to)]
    return verts, edges, radii, pel


def head_bm(body=BODY):
    """Stylised mannequin head: egg with jaw taper, brow, nose ridge, eye planes."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
    cx, cy, cz = body["head_c"]
    rx, ry, rz = body["head_r"]
    for vtx in bm.verts:
        x, y, z = vtx.co
        front = max(0.0, -y)
        if z < 0:                                  # jaw taper and chin
            x *= 1.0 - 0.30 * (-z) ** 1.3
            y *= 1.0 - 0.10 * (-z)
        if z > 0.25:                               # cranium slightly back
            y += 0.06 * (z - 0.25)
        nose = math.exp(-((x / 0.16) ** 2) - ((z + 0.05) / 0.22) ** 2) * front ** 4
        brow = math.exp(-((z - 0.22) / 0.10) ** 2) * front ** 3 * (1 - abs(x) * 0.6)
        eyes = math.exp(-((abs(x) - 0.38) / 0.16) ** 2 - ((z - 0.08) / 0.12) ** 2) * front ** 2
        y -= 0.16 * nose + 0.05 * brow - 0.06 * eyes
        vtx.co = Vector((cx + x * rx, cy + y * ry, cz + z * rz))
    return bm


# ================================================================ face
# Readable, weathered faceted face. Every feature is a separate small part so the
# rig can skin it rigidly to its face bone (agent_rig FACE_BONES). Positions are
# shared with the rig through FACE.

FACE = dict(
    eye=((0.030, -0.079, 1.646), 0.0128),        # eyeball centre (L, +X), radius
    lid_r=0.0150,
    brow=(0.031, -0.090, 1.664),                 # brow ridge centre
    jaw=((0.0, -0.020, 1.616), (0.0, -0.088, 1.584)),   # jaw bone head, tail
    mouth_z=1.600,
)

EYE_ACCENT = ("gem", "amber", "glass", "crystal", "moss", "brass", "metal")


def _shade(c, k):
    return tuple(max(0.0, min(1.0, v * k)) for v in c)


def _cap_bm(center, r, axis_elev_deg, half_angle_deg, segs=8, rings=4):
    """Faceted spherical cap (a shell, open edge) around an axis in the YZ plane.
    axis_elev_deg: elevation of the cap axis seen from the front (-Y); 90 = up."""
    bm = bmesh.new()
    a = math.radians(axis_elev_deg)
    ax = Vector((0.0, -math.cos(a), math.sin(a)))
    ref = Vector((1.0, 0.0, 0.0))
    u = ref
    w = ax.cross(u).normalized()
    top = bm.verts.new(Vector(center) + ax * r)
    prev = None
    rows = []
    for i in range(1, rings + 1):
        th = math.radians(half_angle_deg) * i / rings
        row = []
        for j in range(segs):
            ph = 2 * math.pi * j / segs
            d = ax * math.cos(th) + (u * math.cos(ph) + w * math.sin(ph)) * math.sin(th)
            row.append(bm.verts.new(Vector(center) + d * r))
        rows.append(row)
    for j in range(segs):
        bm.faces.new((top, rows[0][j], rows[0][(j + 1) % segs]))
    for a_row, b_row in zip(rows, rows[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a_row[j], b_row[j], b_row[k], a_row[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # normals outward from the eye centre
    f0 = bm.faces[0]
    if f0.normal.dot(f0.calc_center_median() - Vector(center)) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def _box_bm(verts8):
    bm = bmesh.new()
    v = [bm.verts.new(Vector(p)) for p in verts8]
    for q in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([v[i] for i in q])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def _bar(c, sx, sy, sz, tilt=0.0, taper=1.0):
    """Faceted bar centred at c; tilt rotates around Y (inner end down), taper
    scales the +X end height."""
    cx, cy, cz = c
    pts = []
    for z in (-1, 1):
        for (x, y) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            h = sz * (taper if x > 0 else 1.0)
            px, pz = x * sx, z * h
            pz += x * sx * math.tan(tilt)
            pts.append((cx + px, cy + y * sy, cz + pz))
    return _box_bm(pts)


def build_face(ag, body=BODY):
    pal = ag.pal
    skin = pal["skin"]
    acc = next((pal[k] for k in EYE_ACCENT if k in pal), (0.6, 0.5, 0.3))
    eye_col = tuple(0.25 * a + 0.04 for a in acc)          # dark, alien-tinted iris
    brow_col = pal.get("hair", _shade(skin, 0.35))
    lid_col = _shade(skin, 0.80)
    (ex, ey, ez), er = FACE["eye"]
    for side, sfx in ((1, "L"), (-1, "R")):
        c = (side * ex, ey, ez)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=er)
        bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(c))
        ag.add(f"face_eye_{sfx}", bm, "body", "crystal", eye_col, rough=0.15, collide=())
        # upper lid: cap around an axis tilted up-back, open edge ~35 deg above centre
        ag.add(f"face_lidup_{sfx}", _cap_bm(c, FACE["lid_r"], 125, 92), "body", "skin",
               lid_col, rough=0.6, collide=())
        ag.add(f"face_lidlo_{sfx}", _cap_bm(c, FACE["lid_r"] * 0.97, -125, 100, rings=4),
               "body", "skin", lid_col, rough=0.6, collide=())
        bx, by, bz = FACE["brow"]
        ag.add(f"face_brow_{sfx}",
               _bar((side * bx, by, bz), 0.016, 0.006, 0.0042, tilt=math.radians(14 * side)),
               "body", "skin", brow_col, rough=0.8, collide=())
        # weathered cheekbone facet (alien-tinged, slightly high)
        ag.add(f"face_cheek_{sfx}",
               _bar((side * 0.046, -0.080, 1.626), 0.012, 0.010, 0.006,
                    tilt=math.radians(22 * side)),
               "body", "skin", _shade(skin, 0.92), rough=0.55, collide=())
    # nose: faceted wedge from bridge to tip
    pts = [(0, -0.094, 1.652), (0.0075, -0.096, 1.622), (0, -0.114, 1.619), (-0.0075, -0.096, 1.622),
           (0, -0.100, 1.612)]
    bm = bmesh.new()
    v = [bm.verts.new(Vector(p)) for p in pts]
    back = bm.verts.new(Vector((0, -0.086, 1.628)))
    for f in ((v[0], v[1], v[2]), (v[0], v[2], v[3]), (v[1], v[4], v[2]), (v[2], v[4], v[3]),
              (v[0], back, v[1]), (v[0], v[3], back), (v[1], back, v[4]), (v[3], v[4], back)):
        bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ag.add("face_nose", bm, "body", "skin", skin, rough=0.5, collide=())
    # mouth: dark cavity plate (head), upper lip (head), lower lip + chin plate (jaw)
    mz = FACE["mouth_z"]
    ag.add("face_mouth", _bar((0, -0.086, mz - 0.004), 0.016, 0.006, 0.0065), "body", "skin",
           (0.03, 0.012, 0.012), rough=0.9, collide=())
    ag.add("face_lipup", _bar((0, -0.0925, mz + 0.0028), 0.0155, 0.0035, 0.0024), "body", "skin",
           _shade(skin, 0.72), rough=0.6, collide=())
    ag.add("face_jaw_lip", _bar((0, -0.0915, mz - 0.0035), 0.014, 0.0035, 0.0025), "body",
           "skin", _shade(skin, 0.78), rough=0.6, collide=())
    ag.add("face_jaw_chin", _bar((0, -0.088, mz - 0.019), 0.017, 0.007, 0.007), "body", "skin",
           _shade(skin, 0.95), rough=0.55, collide=())


def build_body(ag, body=BODY, suit_color="suit"):
    verts, edges, radii, root = body_skeleton(body)
    obj = skin_object(f"{ag.key}_body", verts, edges, radii, root, ag.col)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bpy.data.objects.remove(obj)
    ag.add("body", bm, "body", "skin", suit_color, rough=0.55, collide=("all",))
    ag.add("head", head_bm(body), "body", "skin", "skin", rough=0.5, collide=("all", "core"))
    build_face(ag, body)
    # Core collider: torso and legs without arms (fitted garments ignore the arms).
    cv, ce, cr, croot = body_skeleton(body, with_arms=False)
    core = skin_object(f"{ag.key}_core", cv, ce, cr, croot, ag.col)
    ag.add_collider_only("core", core)
    bpy.data.objects.remove(core)
    hc = Vector(body["head_c"])
    ag.sockets["socket_head"] = (hc.copy(), {"socket": "head", "note": "head centre",
                                            "head_top_m": round(hc.z + body["head_r"][2], 3)})
    R = arm(-1, body)
    ag.sockets["socket_hand_r"] = (R["grip"].copy(), {
        "socket": "hand_r", "note": "right palm grip point",
        "arm_dir_gltf": [round(R["dir"].x, 4), round(R["dir"].z, 4), round(-R["dir"].y, 4)],
        "palm_normal_gltf": [round(R["inward"].x, 4), round(R["inward"].z, 4),
                             round(-R["inward"].y, 4)]})


# =========================================================== garment library

def vloft(n, rows, zf, rf, depth=1.0, th0=-math.pi / 2, span=2 * math.pi, closed=True,
          yshift=None):
    """Grid around the vertical axis. zf(t, th) and rf(t, th), t=0 top .. 1 bottom.
    Columns start at th0 (default: the front, -Y) and run counter-clockwise."""
    cols = n if closed else n + 1
    P, A = [], []
    for v in range(rows + 1):
        t = v / rows
        prow, arow = [], []
        for i in range(cols):
            th = th0 + span * i / n
            z = zf(t, th)
            r = rf(t, th)
            ys = yshift(t, th) if yshift else 0.0
            prow.append(Vector((r * math.cos(th), r * depth * math.sin(th) + ys, z)))
            arow.append(Vector((0, ys * 0.5, z)))
        P.append(prow)
        A.append(arow)
    return P, A


def build_grid(P, closed_u, mask=None, axis_fn=None):
    bm = bmesh.new()
    rows = [[bm.verts.new(p) for p in row] for row in P]
    grid_faces(bm, rows, closed_u, mask)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    orient_outward(bm, axis_fn or (lambda c: Vector((0, 0, c.z))))
    return bm


def pleat(th, count, phase=0.0):
    """Triangle wave in [-1, 1]: crisp faceted folds."""
    x = (th * count / (2 * math.pi) + phase) % 1.0
    return 4 * abs(x - 0.5) - 1


def garment(ag, name, P, A, slot="garment", kind="cloth", color="cloth", rough=0.85,
            metal=0.0, thick=THICK, clear=CLEAR, push=0.10, against="all", closed=True,
            mask=None, collide=("all",), iters=6, axis_fn=None):
    P = conform_grid(P, A, ag.bvh(against), clear=clear, push=push, closed_u=closed,
                     iters=iters)
    bm = build_grid(P, closed, mask, axis_fn)
    return ag.add(name, bm, slot, kind, color, rough, metal, solid=thick, collide=collide)


def robe(ag, name, z_top, z_hem, r_top, r_hem, n=32, rows=12, depth=0.85, hem=None,
         pleats=0, pleat_amp=0.0, flare=1.6, opening=0.0, yback=0.0, **kw):
    """Long garment from z_top to the hem; fitted at the top by conforming."""
    def zf(t, th):
        return lerp(z_top, z_hem + (hem(th) if hem else 0.0), t)

    def rf(t, th):
        r = lerp(r_top, r_hem, t ** flare)
        if pleats:
            r *= 1.0 + pleat_amp * smoothstep(t * 1.4) * pleat(th, pleats)
        return r

    def ys(t, th):
        return yback * t * max(0.0, math.sin(th))
    if opening > 0:
        P, A = vloft(n, rows, zf, rf, depth, th0=-math.pi / 2 + opening,
                     span=2 * math.pi - 2 * opening, closed=False, yshift=ys)
        return garment(ag, name, P, A, closed=False, **kw)
    P, A = vloft(n, rows, zf, rf, depth, yshift=ys)
    return garment(ag, name, P, A, closed=True, **kw)


def mantle(ag, name, z_neck, r_neck, drop, r_out, n=32, rows=10, depth=0.9, hem=None,
           front_short=0.0, back_long=0.0, span=None, th0=None, spread=1.9, **kw):
    """Shoulder mantle or cloak. drop: how far the hem hangs below the neck ring.
    With span set, the garment is open (a cloak open at the front)."""
    def length(th):
        s = math.sin(th)  # -1 front, +1 back
        L = drop + (back_long * s if s > 0 else front_short * s)
        return L + (hem(th) if hem else 0.0)

    def zf(t, th):
        return z_neck - length(th) * (t ** 1.15)

    def rf(t, th):
        return lerp(r_neck, r_out, min(1.0, t * spread) ** 0.65)
    closed = span is None
    P, A = vloft(n, rows, zf, rf, depth, th0=th0 if th0 is not None else -math.pi / 2,
                 span=span or 2 * math.pi, closed=closed)
    kw.setdefault("push", 0.16)
    return garment(ag, name, P, A, closed=closed, **kw)


def axis_tube(ag, name, S, W, r0, r1, n=12, rows=7, bell=1.8, end_drop=0.0, hem=None,
              against="all", clear=0.014, push=0.06, slot="garment", kind="cloth",
              color="cloth", rough=0.85, metal=0.0, thick=THICK, collide=("all",)):
    """Tube around the segment S..W (sleeves, bracers, boots), conformed outward."""
    S, W = Vector(S), Vector(W)
    d = (W - S).normalized()
    ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    u = d.cross(ref).normalized()
    w = d.cross(u).normalized()
    P, A = [], []
    for v in range(rows + 1):
        c = S + (W - S) * (v / rows)
        prow, arow = [], []
        for i in range(n):
            a = 2 * math.pi * i / n
            r = lerp(r0, r1, (v / rows) ** bell)
            off = math.cos(a) * u + math.sin(a) * w
            p = c + off * r
            if v == rows:
                p.z -= end_drop * max(0.0, -off.z) + (hem(a) if hem else 0.0)
            prow.append(p)
            arow.append(c.copy())
        P.append(prow)
        A.append(arow)
    P = conform_grid(P, A, ag.bvh(against), clear=clear, push=push, closed_u=True)
    bm = build_grid(P, True, axis_fn=lambda c: S + d * max(0.0, (c - S).dot(d)))
    return ag.add(name, bm, slot, kind, color, rough, metal, solid=thick, collide=collide)


def sleeve(ag, name, side, r0, r1, t0=0.0, t1=1.0, **kw):
    Ar = arm(side)
    S, W = Ar["S"], Ar["W"] + Ar["dir"] * 0.02
    return axis_tube(ag, name, S + (W - S) * t0, S + (W - S) * t1, r0, r1, **kw)


def hood(ag, name, rad=0.135, open_w=0.62, open_top=0.42, open_bot=1.85, tip=0.0,
         tip_dir=(0, 0.5, 0.85), tip_pow=6.0, cowl_r=0.22, cowl_z=1.40, n=24, rows=14,
         against="all", clear=CLEAR, push=0.08, slot="garment", kind="cloth", color="hood",
         rough=0.85, metal=0.0, thick=THICK, collide=("all",), hem=None):
    """Hood around the head that flares into a cowl on the shoulders.
    Rows run from the crown (polar angle ~0) down to the cowl."""
    hc = Vector(BODY["head_c"]) + Vector((0, 0.012, 0.01))
    td = Vector(tip_dir).normalized()
    P, A = [], []
    phi_end = 2.15
    for v in range(rows + 1):
        phi = lerp(0.12, phi_end, v / rows)
        prow, arow = [], []
        for i in range(n):
            th = -math.pi / 2 + 2 * math.pi * i / n
            d = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th), math.cos(phi)))
            r = rad * (1.0 + 0.10 * max(0.0, d.y))
            r *= 1.0 + tip * max(0.0, d.dot(td)) ** tip_pow
            p = hc + d * r
            k = smoothstep((phi - 1.45) / (phi_end - 1.45))
            if k > 0:
                cw = Vector((cowl_r * math.cos(th), cowl_r * 0.82 * math.sin(th), cowl_z))
                p = p.lerp(cw, k)
                if hem and v == rows:
                    p.z += hem(th)
            prow.append(p)
            arow.append(hc.lerp(Vector((0, 0, p.z)), k))
        P.append(prow)
        A.append(arow)

    def mask(v, i):
        phi = lerp(0.12, phi_end, (v + 0.5) / rows)
        th = -math.pi / 2 + 2 * math.pi * (i + 0.5) / n
        dth = math.atan2(math.sin(th + math.pi / 2), math.cos(th + math.pi / 2))
        return not (abs(dth) < open_w and open_top < phi < open_bot)
    P = conform_grid(P, A, ag.bvh(against), clear=clear, push=push, closed_u=True)
    bm = bmesh.new()
    top = bm.verts.new(sum((p for p in P[0]), Vector()) / n + Vector((0, 0, rad * 0.03)))
    rows_v = [[bm.verts.new(p) for p in row] for row in P]
    for i in range(n):
        bm.faces.new((top, rows_v[0][i], rows_v[0][(i + 1) % n]))
    grid_faces(bm, rows_v, True, mask)
    orient_outward(bm, lambda c: hc if c.z > 1.5 else Vector((0, 0, c.z)))
    return ag.add(name, bm, slot, kind, color, rough, metal, solid=thick, collide=collide)


def petal(bm, base, along, side, normal, length, width, cup=0.25, curl=0.0, nl=8, nw=6,
          tip_pow=0.75, droop=0.0):
    """Curved leaf/petal sheet. along: growth direction, side: width axis."""
    along, side, normal = (Vector(along).normalized(), Vector(side).normalized(),
                           Vector(normal).normalized())
    rows = []
    for a in range(nl + 1):
        s = a / nl
        half = width * 0.5 * math.sin(math.pi * min(1.0, s ** tip_pow)) if s < 1 else 0.0
        half = max(half, width * 0.04) if s < 1 else 0.0
        row = []
        for b in range(nw + 1):
            w = -1 + 2 * b / nw
            p = (Vector(base) + along * (length * s) + side * (half * w)
                 + normal * (cup * width * (w * w) * 0.5 + curl * length * s * s)
                 - Vector((0, 0, droop * length * s * s)))
            row.append(bm.verts.new(p))
        rows.append(row)
    for a in range(nl):
        for b in range(nw):
            bm.faces.new((rows[a][b], rows[a][b + 1], rows[a + 1][b + 1], rows[a + 1][b]))
    return rows


def band(ag, name, z0, z1, n=32, color="trim", kind="leather", rough=0.6, metal=0.0,
         thick=0.010, clear=0.010, slot="ornament", against="all", tilt=0.0):
    """Belt or ring band conformed tightly around the current outer layer."""
    def zf(t, th):
        return lerp(z1, z0, t) + tilt * math.sin(th)
    P, A = vloft(n, 1, zf, lambda t, th: 0.03, 1.0)
    return garment(ag, name, P, A, slot=slot, kind=kind, color=color, rough=rough,
                   metal=metal, thick=thick, clear=clear, push=0.45, against=against,
                   iters=2)


def surface_point(ag, z, th, which="all", depth=1.0, out=0.0):
    """Outermost surface point of the current agent at height z, angle th."""
    d = Vector((math.cos(th), math.sin(th) * depth, 0)).normalized()
    o = Vector((0, 0, z))
    far = furthest_hit(ag.bvh(which), o, d, 0.6)
    return o + d * (far + out), d


def hem_scallop(count, amp, phase=0.0):
    return lambda th: -amp * abs(math.sin((th * count / 2) + phase))


def hem_points(count, amp, phase=0.0, sharp=1.0):
    """Downward points (icicles): 0 between points, -amp at the tips."""
    def f(th):
        x = (th * count / (2 * math.pi) + phase) % 1.0
        return -amp * (1 - abs(2 * x - 1)) ** sharp
    return f


def hem_jagged(seed, n, amp):
    """Ragged, frayed or burnt hem: deterministic random drops per column."""
    rnd = random.Random(seed)
    vals = [rnd.uniform(0.0, 1.0) for _ in range(n)]

    def f(th):
        x = ((th + math.pi / 2) / (2 * math.pi)) % 1.0 * n
        return -amp * vals[int(x) % n]
    return f