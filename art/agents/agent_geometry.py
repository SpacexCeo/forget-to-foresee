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

SOFT_KINDS = ("cloth", "leather", "wool", "felt", "skin", "moss", "hair")
SHARP_DEG = 48.0              # soft parts: edges sharper than this stay creased (hems, rims)
PAINT_LO, PAINT_HI = 0.80, 1.14   # painted value range over a part's height (bottom .. top)
CLEAR = 0.016                 # default clearance between garment layers (m)
THICK = 0.008                 # default garment thickness (m); CLEAR - THICK > bake cage

SLOTS = ("body", "garment", "ornament")
KINDS = ("skin", "cloth", "metal", "wood", "crystal", "glass", "leather", "moss",
         "resin", "stone", "felt", "wool", "armor", "hair")   # append only: indices are baked


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
            collide=("all",), smooth=None, solid_offset=-1.0, paint=True):
        """smooth: True (smooth), False (flat facets) or None (default: soft kinds such as
        cloth, wool, leather, felt and skin are smooth with sharp edges above SHARP_DEG, the
        stylized hero look the owner asked for on 08.11; hard kinds stay faceted).
        paint: hand-painted value gradient over the part's height (lighter top, deeper
        bottom) plus a faint per-vertex variation, baked into the albedo."""
        if isinstance(color, str):
            color = self.pal[color]
        if smooth is None:
            smooth = "angle" if kind in SOFT_KINDS else False
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
        cols = list((*color, 1.0)) * n_l
        if paint and n_l:
            zs = [v.co.z for v in me.vertices]
            z0, z1 = min(zs), max(zs)
            span = max(z1 - z0, 0.05)
            rnd = random.Random(len(self.parts) * 7919 + n_l)
            jit = [1.0 + rnd.uniform(-0.035, 0.035) for _ in me.vertices]
            cols = []
            for lp in me.loops:
                h = (me.vertices[lp.vertex_index].co.z - z0) / span
                k = (PAINT_LO + (PAINT_HI - PAINT_LO) * smoothstep(h)) * jit[lp.vertex_index]
                cols += [min(1.0, color[0] * k), min(1.0, color[1] * k), min(1.0, color[2] * k), 1.0]
        c = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        c.data.foreach_set("color", cols)
        c = me.color_attributes.new("Prm", "FLOAT_COLOR", "CORNER")
        c.data.foreach_set("color", [rough, metal, 0.0, 1.0] * n_l)
        if smooth == "angle":
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
        elif smooth:
            me.shade_smooth()
        else:
            me.shade_flat()
        for which in collide or ():
            self.colliders[which].from_mesh(me)
            self._bvh.pop(which, None)
        self.parts.append(obj)
        self.part_tris[name] = self.part_tris.get(name, 0) + mesh_tris(obj)
        return obj

    def add_collider_bm(self, whiches, bm):
        me = bpy.data.meshes.new("tmp_collider")
        bm.to_mesh(me)
        bm.free()
        for which in whiches:
            self.colliders[which].from_mesh(me)
            self._bvh.pop(which, None)
        bpy.data.meshes.remove(me)

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
# Smooth stylised face (owner 08.11: the faceted mask read as crooked in close
# third-person view). The head is a lat-long egg whose columns and rings crowd
# into the face and whose face region is subdivided once more; eye sockets,
# brow, nose, muzzle and chin are smooth displacements of that one surface, shaded
# smooth. Eyes are eyeballs with iris and pupil caps seated in the sockets,
# under almond-edged lid shells; brows and lips are tapered sweeps. Every
# feature is built for the left side and mirrored exactly. Moving features are
# separate parts the rig skins rigidly to their face bone (agent_rig FACE_BONES);
# positions are shared with the rig through FACE.

# Round 3 proportions (owner 08.11 "Iris looks very bad"; checked against standard face-
# proportion guides): the eye line sits on the head's middle, the eyes are one eye width
# apart and about a fifth of the head's width (stylized: slightly larger), the nose ends
# halfway down the lower face, the mouth a third of the way from nose to chin, and the
# lower face is shorter with a tapered jaw (the old face read as a long, wide oval).
FACE = dict(
    eye=((0.0300, -0.0812, 1.6405), 0.0152),     # eyeball centre (L, +X), radius
    lid_r=0.0164,                                # upper lid shell radius
    brow=(0.0300, -0.0965, 1.6615),              # brow centre (L)
    jaw=((0.0, -0.020, 1.616), (0.0, -0.088, 1.586)),   # jaw bone head, tail
    mouth_z=1.5915,                              # lip line
    mouth_w=0.0152,                              # half width of the mouth
)

# per-clan iris colour (linear); others fall back to the clan accent
IRIS_COLOR = {
    "iris": (0.30, 0.07, 0.72),      # violet, the player clan's mark
    "sol": (0.46, 0.50, 0.52),       # salt-pale grey
    "pepel": (0.62, 0.16, 0.035),    # ember
    "moh": (0.16, 0.34, 0.06),       # moss green
    "yantar": (0.78, 0.36, 0.03),    # amber
    "iney": (0.40, 0.66, 0.90),      # ice blue
}
EYE_ACCENT = ("gem", "amber", "glass", "crystal", "moss", "brass", "metal")
LID_OPEN = (20.0, -27.0)     # lid edge elevation at the eye centre line (deg, rest): the upper
                             # lid rests on the top of the iris (a relaxed, not startled, look)
LID_CORNER = 62.0            # azimuth of the eye corners (deg)


def _shade(c, k):
    return tuple(max(0.0, min(1.0, v * k)) for v in c)


def _g(d, s):
    return math.exp(-(d / s) ** 2)


def _samples(n, lo, hi, dens, steps=4000):
    """n intervals from lo to hi, spaced inversely to the density function."""
    xs = [lo + (hi - lo) * i / steps for i in range(steps + 1)]
    cum = [0.0]
    for a, b in zip(xs, xs[1:]):
        cum.append(cum[-1] + dens(0.5 * (a + b)) * (b - a))
    out, j = [], 0
    for k in range(n + 1):
        tgt = cum[-1] * k / n
        while j < steps - 1 and cum[j + 1] < tgt:
            j += 1
        t = (tgt - cum[j]) / max(cum[j + 1] - cum[j], 1e-12)
        out.append(xs[j] + min(1.0, max(0.0, t)) * (xs[j + 1] - xs[j]))
    out[0], out[-1] = lo, hi
    return out


def _egg(x, y, z):
    """The shared egg deformation of the unit sphere (normalised head coords)."""
    if z < 0:                                      # jaw taper and a shorter lower face
        x *= 1.0 - 0.35 * (-z) ** 1.35
        y *= 1.0 - 0.10 * (-z)
        z *= 1.0 - 0.10 * (-z)
    if z > 0.25:                                   # cranium slightly back
        y += 0.06 * (z - 0.25)
    return x, y, z


def _face_relief(x, y, z):
    """Smooth face relief: forward offset (normalised, -y is out) at a point of the
    egg. Symmetric in x by construction."""
    front = smoothstep((-y - 0.35) / 0.55)
    ax = abs(x)
    ex = FACE["eye"][0][0] / BODY["head_r"][0]
    ez = (FACE["eye"][0][2] - BODY["head_c"][2]) / BODY["head_r"][2]
    mz = (FACE["mouth_z"] - BODY["head_c"][2]) / BODY["head_r"][2]
    # nose: bridge -> tip, narrow at the bridge, wider at the tip, quick undercut
    zt = ez - 0.27                                  # nose tip
    if z > zt:
        k = min(1.0, (z - zt) / (ez + 0.10 - zt))
        h = 0.17 * (1.0 - k) ** 1.6 + 0.030 * _g(z - (ez + 0.02), 0.12)
        w = 0.060 + 0.045 * (1.0 - k)              # narrow bridge, soft rounded tip
    else:
        h = 0.17 * _g(z - zt, 0.055)
        w = 0.115
    nose = h * _g(ax, w)
    alae = 0.060 * _g(ax - 0.105, 0.050) * _g(z - (zt - 0.015), 0.055)
    brow = 0.055 * _g(z - (ez + 0.165), 0.085) * (_g(ax - ex, 0.22) + 0.6 * _g(ax, 0.15))
    socket = -0.115 * _g(ax - ex * 1.02, 0.175) * _g(z - (ez + 0.01), 0.125)
    cheek = 0.075 * _g(ax - 0.54, 0.16) * _g(z - (ez - 0.15), 0.13)
    hollow = -0.030 * _g(ax - 0.52, 0.15) * _g(z - (mz + 0.04), 0.14)
    muzzle = 0.060 * _g(ax, 0.30) * _g(z - (mz + 0.02), 0.20)
    mouth = -0.030 * _g(ax, 0.20) * _g(z - mz, 0.055)
    chin = 0.075 * _g(ax, 0.20) * _g(z - (mz - 0.24), 0.11)
    # nasolabial fold: a soft groove from the nose wing down to the mouth corner
    t = max(0.0, min(1.0, (zt - 0.02 - z) / (zt - 0.02 - (mz - 0.05))))
    fold = -0.022 * _g(ax - (0.17 + 0.10 * t), 0.035) * (1.0 if 0.0 < t < 1.0 else 0.0) * \
        math.sin(math.pi * t) ** 0.5
    return front * (fold + nose + alae + brow + socket + cheek + hollow + muzzle + mouth + chin)


def face_head_bm(body=BODY):
    """Visual head: front-dense lat-long egg + face relief, smooth shaded."""
    cx, cy, cz = body["head_c"]
    rx, ry, rz = body["head_r"]
    half = _samples(13, 0.0, math.pi, lambda p: 1.0 + 2.6 * _g(p, 0.75))
    cols = [-half[i] for i in range(len(half) - 2, 0, -1)] + half      # -.. 0 .. pi
    rings = _samples(20, -math.pi / 2, math.pi / 2, lambda t: 1.0 + 2.2 * _g(t + 0.2, 0.62))
    bm = bmesh.new()
    grid = []
    for th in rings[1:-1]:
        grid.append([bm.verts.new((math.sin(p) * math.cos(th), -math.cos(p) * math.cos(th),
                                   math.sin(th))) for p in cols])
    bot = bm.verts.new((0, 0, -1))
    top = bm.verts.new((0, 0, 1))
    n = len(cols)
    for r0, r1 in zip(grid, grid[1:]):
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
    for j in range(n):
        k = (j + 1) % n
        bm.faces.new((bot, grid[0][k], grid[0][j]))
        bm.faces.new((top, grid[-1][j], grid[-1][k]))
    # one more subdivision over the face (front, brow to chin)
    sel = [f for f in bm.faces
           if all(-v.co.y > 0.55 and -0.82 < v.co.z < 0.42 for v in f.verts)]
    edges = list({e for f in sel for e in f.edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
    for v in bm.verts:
        v.co = v.co.normalized()
    for v in bm.verts:
        x, y, z = _egg(*v.co)
        y -= _face_relief(x, y, z)
        v.co = Vector((cx + x * rx, cy + y * ry, cz + z * rz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def face_hair_bm(body=BODY, cols=24, rows=6):
    """Close-cropped hair cap over the cranium, for agents whose hood leaves the top
    of the head open. Its hairline row hugs the skin, the rest stands 4 mm off."""
    cx, cy, cz = body["head_c"]
    rx, ry, rz = body["head_r"]
    c = Vector((cx, cy, cz))

    def point(ph, th, off):
        x, y, z = _egg(math.sin(ph) * math.cos(th), -math.cos(ph) * math.cos(th), math.sin(th))
        y -= _face_relief(x, y, z)
        p = Vector((cx + x * rx, cy + y * ry, cz + z * rz))
        return c + (p - c) * (1.0 + off / (p - c).length)

    def hairline(ph):
        a = abs(ph)
        return 0.13 + 0.42 * _g(a, 0.62) - 0.72 * smoothstep((a - 1.55) / 1.45) + \
            0.012 * math.cos(7 * ph)
    bm = bmesh.new()
    grid = []
    for j in range(cols):
        ph = -math.pi + 2 * math.pi * (j + 0.5) / cols
        th0 = hairline(ph)
        grid.append([bm.verts.new(point(ph, th0 + (math.pi / 2 - th0) * (k / rows) ** 0.9,
                                        0.0018 if k == 0 else 0.0042 - 0.0006 * (k == 1)))
                     for k in range(rows)])
    top = bm.verts.new(Vector((cx, cy + 0.06 * 0.75 * ry, cz + rz + 0.0042)))
    for j in range(cols):
        a, b = grid[j], grid[(j + 1) % cols]
        for k in range(rows - 1):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
        bm.faces.new((a[-1], b[-1], top))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    f0 = bm.faces[0]
    if f0.normal.dot(f0.calc_center_median() - c) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def _sweep_bm(pts, w, h, sides=8, side=1):
    """Closed tube along pts with an elliptical section; w(t), h(t) half sizes along
    the local 'out' (section x) and 'up' (section y) axes. Ends pinch shut."""
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    m = len(pts)
    rings = []
    for i, p in enumerate(pts):
        t = i / (m - 1)
        tan = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1))
        out = tan.cross(up).normalized()
        if out.y > 0:
            out = -out
        up = out.cross(tan).normalized()
        if up.z < 0:
            up = -up
        ww, hh = w(t), h(t)
        rings.append([bm.verts.new(p + out * (ww * math.cos(a)) + up * (hh * math.sin(a)))
                      for a in (2 * math.pi * s / sides for s in range(sides))])
    for r0, r1 in zip(rings, rings[1:]):
        for s in range(sides):
            q = (s + 1) % sides
            bm.faces.new((r0[s], r0[q], r1[q], r1[s]))
    c0 = bm.verts.new(pts[0] - (pts[1] - pts[0]).normalized() * 0.0004)
    c1 = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.0004)
    for s in range(sides):
        q = (s + 1) % sides
        bm.faces.new((c0, rings[0][q], rings[0][s]))
        bm.faces.new((c1, rings[-1][s], rings[-1][q]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def _lid_dir(a, b):
    """Direction on the eye sphere: azimuth a around Z from the front, then tilted by
    b around X (the lid bones rotate around X, so a lid edge is a curve b(a))."""
    return Vector((math.sin(a), -math.cos(a) * math.cos(b), math.cos(a) * math.sin(b)))


def _lid_edge(a_deg, upper):
    A = LID_CORNER
    s = max(0.0, math.cos(math.pi / 2 * min(1.0, abs(a_deg) / A))) ** 0.75
    if upper:
        return -3.0 + (LID_OPEN[0] + 3.0) * s
    return 3.0 + (LID_OPEN[1] - 3.0) * s


def _lid_bm(c, r, side, upper, rows=5, cols=14, roll=0.93):
    """Lid shell around eye centre c: from the almond edge over the eyeball to far
    behind it, with a rolled-in rim so the lid edge reads thick."""
    bm = bmesh.new()
    c = Vector(c)
    far = 160.0 if upper else -150.0
    grid = []
    for i in range(cols + 1):
        a = -84.0 + 168.0 * i / cols
        e = _lid_edge(a, upper)
        col = [c + _lid_dir(math.radians(a) * side, math.radians(e)) * (r * roll)]
        for k in range(rows + 1):
            b = e + (far - e) * (k / rows) ** 1.3
            col.append(c + _lid_dir(math.radians(a) * side, math.radians(b)) * r)
        grid.append([bm.verts.new(p) for p in col])
    for c0, c1 in zip(grid, grid[1:]):
        for k in range(len(c0) - 1):
            bm.faces.new((c0[k], c1[k], c1[k + 1], c0[k + 1]))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    f0 = bm.faces[len(bm.faces) // 2]
    if f0.normal.dot(f0.calc_center_median() - c) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def _cap_on(c, r, axis, half_deg, segs=16, rings=3):
    """Spherical cap shell (iris / pupil) on the sphere (c, r) around axis."""
    bm = bmesh.new()
    c, ax = Vector(c), Vector(axis).normalized()
    u = ax.cross(Vector((0, 0, 1))).normalized()
    w = ax.cross(u).normalized()
    top = bm.verts.new(c + ax * r)
    rows = []
    for i in range(1, rings + 1):
        th = math.radians(half_deg) * i / rings
        rows.append([bm.verts.new(c + (ax * math.cos(th) + (u * math.cos(p) + w * math.sin(p))
                                       * math.sin(th)) * r)
                     for p in (2 * math.pi * j / segs for j in range(segs))])
    for j in range(segs):
        bm.faces.new((top, rows[0][j], rows[0][(j + 1) % segs]))
    for r0, r1 in zip(rows, rows[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((r0[j], r1[j], r1[k], r0[k]))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.dot(ax) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def _surface_y(bvh, x, z, off=0.0):
    """Front surface of the head at (x, z), pushed out by off along -y."""
    hit = bvh.ray_cast(Vector((x, -0.3, z)), Vector((0, 1, 0)), 0.5)
    return (hit[0].y if hit[0] is not None else -0.09) - off


def build_face(ag, body=BODY, hair=None):
    pal = ag.pal
    skin = pal["skin"]
    acc = next((pal[k] for k in EYE_ACCENT if k in pal), (0.6, 0.5, 0.3))
    iris_col = IRIS_COLOR.get(ag.key, tuple(0.7 * a + 0.05 for a in acc))
    brow_col = pal.get("hair", _shade(skin, 0.30))
    lid_col = (skin[0] * 0.93, skin[1] * 0.88, skin[2] * 0.88)   # lids close to skin: no dark rings
    lip_col = (skin[0] * 0.82, skin[1] * 0.44, skin[2] * 0.46)
    head = face_head_bm(body)
    bvh = BVHTree.FromBMesh(head)
    (ex, ey, ez), er = FACE["eye"]
    for side, sfx in ((1, "L"), (-1, "R")):
        c = Vector((side * ex, ey, ez))
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=er)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.pi / 2, 3, "X"))   # poles front/back
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.45 * er], context="VERTS")
        bmesh.ops.translate(bm, verts=bm.verts, vec=c)
        ag.add(f"face_eye_{sfx}", bm, "body", "skin", (0.44, 0.40, 0.35), rough=0.25,
               collide=(), smooth=True)
        look = Vector((side * 0.06, -1.0, 0.0))          # a hair divergent, rests forward
        ag.add(f"face_iris_{sfx}", _cap_on(c, er * 1.012, look, 41, segs=16, rings=3), "body",
               "skin", iris_col, rough=0.2, collide=(), smooth=True, paint=False)
        ag.add(f"face_pupil_{sfx}", _cap_on(c, er * 1.022, look, 18, segs=12, rings=2), "body",
               "skin", (0.012, 0.010, 0.010), rough=0.15, collide=(), smooth=True, paint=False)
        # catchlight: one small bright dot, upper left as seen from the front on both eyes
        # (a shared light), so the eyes look alive at gameplay distance
        cl = c + (look.normalized() + Vector((-0.42, 0.0, 0.38))).normalized() * er * 1.03
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=er * 0.16)
        bmesh.ops.translate(bm, verts=bm.verts, vec=cl)
        ag.add(f"face_glint_{sfx}", bm, "body", "skin", (0.95, 0.95, 0.95), rough=0.05,
               collide=(), smooth=True, paint=False)
        ag.add(f"face_lidup_{sfx}", _lid_bm(c, FACE["lid_r"], side, True,
                                            roll=er * 1.04 / FACE["lid_r"]),
               "body", "skin", lid_col, rough=0.6, collide=(), smooth=True)
        ag.add(f"face_lidlo_{sfx}", _lid_bm(c, FACE["lid_r"] * 0.975, side, False, rows=4,
                                       roll=er * 1.04 / (FACE["lid_r"] * 0.975)),
               "body", "skin", lid_col, rough=0.6, collide=(), smooth=True)
        # lash line along the upper lid edge (reads the eye shape from afar)
        lash = []
        for i in range(11):
            a = -LID_CORNER * 1.02 + 2.04 * LID_CORNER * i / 10
            lash.append(c + _lid_dir(math.radians(a) * side,
                                     math.radians(_lid_edge(a, True) - 1.0)) * FACE["lid_r"] * 1.03)
        ag.add(f"face_lidup_{sfx}_lash", _sweep_bm(
            lash, lambda t: 0.00055, lambda t: 0.0006 + 0.0005 * math.sin(math.pi * t), sides=4),
            "body", "skin", _shade(brow_col, 0.8), rough=0.7, collide=(), smooth=True)
        # brow: arched tapered sweep on the brow ridge, heavy at the inner end
        bx, by, bz = FACE["brow"]
        pts = []
        for i in range(9):
            t = i / 8
            x = bx + (-0.0150 + 0.0315 * t)
            z = bz - 0.0004 - 0.0042 * t + 0.0034 * math.sin(math.pi * min(1.0, t * 1.15)) \
                - 0.0022 * (1 - t) ** 3
            pts.append(Vector((side * x, _surface_y(bvh, side * x, z, 0.0012), z)))
        ag.add(f"face_brow_{sfx}", _sweep_bm(
            pts, lambda t: 0.0017 * (1.0 - 0.5 * t), lambda t: 0.0027 * (1.0 - 0.62 * t) ** 0.8,
            sides=6), "body", "skin", brow_col, rough=0.85, collide=(), smooth=True)
    # lips: upper (head) with a cupid's bow, fuller lower lip (jaw)
    mz, mw = FACE["mouth_z"], FACE["mouth_w"]

    def lip(dz, out, bow):
        pts = []
        for i in range(11):
            x = -mw + 2 * mw * i / 10
            z = mz + dz + bow * _g(abs(x) - 0.0035, 0.0028) - 0.0012 * (abs(x) / mw) ** 2
            pts.append(Vector((x, _surface_y(bvh, x, z, out), z)))
        return pts
    prof = lambda t: math.sin(math.pi * t) ** 0.55          # noqa: E731
    ag.add("face_lipup", _sweep_bm(lip(0.0016, 0.0003, 0.0008),
                                   lambda t: 0.0012 * prof(t) + 0.0002,
                                   lambda t: 0.0023 * prof(t) + 0.0002, sides=6),
           "body", "skin", _shade(lip_col, 0.9), rough=0.5, collide=(), smooth=True)
    ag.add("face_jaw_lip", _sweep_bm(lip(-0.0026, 0.0005, 0.0),
                                     lambda t: 0.0015 * prof(t) + 0.0002,
                                     lambda t: 0.0033 * prof(t) + 0.0002, sides=6),
           "body", "skin", _shade(lip_col, 1.06), rough=0.45, collide=(), smooth=True)
    # mouth bag: dark sheet behind the lips; its top follows the head, its bottom the
    # jaw (agent_rig rule "mouth"), so it fills the gap when the jaw opens
    bm = bmesh.new()
    rows = []
    for zz, k in ((0.0030, 0.45), (0.0010, 0.74), (-0.0015, 0.74), (-0.0040, 0.45)):
        rows.append([bm.verts.new(Vector((x, _surface_y(bvh, x, mz + zz, 0.00025), mz + zz)))
                     for x in (mw * k * (-1 + 2 * i / 8) for i in range(9))])
    for r0, r1 in zip(rows, rows[1:]):
        for j in range(8):
            bm.faces.new((r0[j], r0[j + 1], r1[j + 1], r1[j]))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[4].normal.y > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    ag.add("face_mouth", bm, "body", "skin", (0.035, 0.012, 0.012), rough=0.9, collide=(),
           smooth=True)
    # upper teeth: a dim strip just behind the upper lip, seen when talking
    pts = [Vector((x, _surface_y(bvh, x, mz + 0.0013, 0.0006),
                   mz + 0.0013)) for x in (-mw * 0.62 + 1.24 * mw * i / 8 for i in range(9))]
    ag.add("face_teeth", _sweep_bm(pts, lambda t: 0.00035, lambda t: 0.0012, sides=4), "body",
           "skin", (0.36, 0.33, 0.27), rough=0.35, collide=(), smooth=True)
    if hair is not None:
        ag.add("face_hair", face_hair_bm(body), "body", "skin", hair, rough=0.9, collide=(),
               smooth=True)
    return head


def paint_face(obj, skin):
    """Hand-painted skin: a soft warm blush on the cheeks and the nose tip, slightly
    cooler eye sockets. Writes into the part's Col attribute (baked into the albedo)."""
    me = obj.data
    col = me.color_attributes["Col"]
    (ex, ey, ez), er = FACE["eye"]
    blush = (min(1.0, skin[0] * 1.10), skin[1] * 0.80, skin[2] * 0.80)
    for lp, cd in zip(me.loops, col.data):
        p = me.vertices[lp.vertex_index].co
        if p.y > -0.05:
            continue
        r = cd.color
        k = 0.55 * _g(abs(p.x) - 0.046, 0.016) * _g(p.z - (ez - 0.026), 0.014)      # cheeks
        k += 0.35 * _g(p.x, 0.008) * _g(p.z - (ez - 0.030), 0.008)                  # nose tip
        s = -0.10 * _g(abs(p.x) - ex, 0.014) * _g(p.z - (ez + 0.004), 0.012)        # sockets
        cd.color = (r[0] + (blush[0] - r[0]) * k + s * r[0], r[1] + (blush[1] - r[1]) * k + s * r[1],
                    r[2] + (blush[2] - r[2]) * k + s * r[2], 1.0)


def build_body(ag, body=BODY, suit_color="suit", hair=None):
    verts, edges, radii, root = body_skeleton(body)
    obj = skin_object(f"{ag.key}_body", verts, edges, radii, root, ag.col)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bpy.data.objects.remove(obj)
    ag.add("body", bm, "body", "skin", suit_color, rough=0.55, collide=("all",))
    # the smooth face head is visual only; garments keep conforming to the plain egg
    head = ag.add("head", build_face(ag, body, hair), "body", "skin", "skin", rough=0.5,
                  collide=(), smooth=True)
    paint_face(head, ag.pal["skin"])
    ag.add_collider_bm(("all", "core"), head_bm(body))
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
            mask=None, collide=("all",), iters=6, axis_fn=None, trim=None):
    """trim: None, or (color, rows, kind) for a hem band: the last `rows` rows of the
    garment repeated a few millimetres outside it, thicker, in another colour and
    material (sewn hem, embroidered edge). Reads as material breakup at any distance."""
    P = conform_grid(P, A, ag.bvh(against), clear=clear, push=push, closed_u=closed,
                     iters=iters)
    bm = build_grid(P, closed, mask, axis_fn)
    obj = ag.add(name, bm, slot, kind, color, rough, metal, solid=thick, collide=collide)
    if trim and mask is None:
        tcol, width, tkind = trim
        # a narrow band (width in metres) along the hem, a few millimetres outside the cloth
        up = [b + (a - b).normalized() * width if (a - b).length > 1e-6 else b.copy()
              for a, b in zip(P[-2], P[-1])]

        def outward(row, arow, off):
            return [p + (p - Vector((ax.x, ax.y, p.z))).normalized() * off
                    if (p - Vector((ax.x, ax.y, p.z))).length > 1e-6 else p.copy()
                    for p, ax in zip(row, arow)]
        T = [outward(up, A[-1], thick + 0.003), outward(P[-1], A[-1], thick + 0.003)]
        T.append([p + Vector((0, 0, -0.005)) for p in T[-1]])   # tucks under the edge
        tb = build_grid(T, closed, None, axis_fn)
        ag.add(name + "_trim", tb, slot, tkind, tcol, rough=0.6, metal=0.0, solid=0.005,
               collide=(), paint=False)
    return obj


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
    """Stylized tatters (owner 08.11: the paper zigzags read as cheap): a few broad,
    clean tongues of cloth with smooth notches between them, deterministic per seed.
    n keeps the old call signature: about n/6 tongues around the hem."""
    rnd = random.Random(seed)
    k = max(5, n // 6)
    vals = [rnd.uniform(0.35, 1.0) for _ in range(k)]

    def f(th):
        x = ((th + math.pi / 2) / (2 * math.pi)) % 1.0 * k
        i = int(x) % k
        u = x - int(x)
        tongue = math.sin(math.pi * u) ** 0.6      # rounded tongue, notch at the joins
        return -amp * vals[i] * tongue
    return f