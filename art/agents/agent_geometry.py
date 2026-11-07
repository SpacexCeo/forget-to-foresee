"""Shared geometry for the clan agents: mesh primitives, ray-cast conforming,
the posable parametric humanoid base (hands, stylised head) and the garment
library.

Imported by build_agents.py (run inside Blender 4.5). Blender is Z-up with the
front facing -Y; metres throughout. The character's right hand is -X.

Round 2 (07.11): every clan has one static attitude (POSE: arm angles with an
elbow, forward lean, stance), real hands (palm, four fingers, thumb), a smooth
stylised face, smooth-shaded folded cloth, and garment UVs ("guv", metres
along the panel / up from the hem) that the master shader uses for panel
seams, hem stitching and frayed edges.
"""

import math
import random

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

CLEAR = 0.018                 # default clearance between garment layers (m)
THICK = 0.011                 # default garment thickness (m)
CLOTH_SHARP = 55.0            # cloth is smooth-shaded, split above this angle

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


def tube(bm, pts, radius, sides, closed=False, cap=True, phase=0.0, squash=1.0):
    """Swept circle (or ellipse, squash = minor/major) along a polyline."""
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
        rings.append([bm.verts.new(p + r * (math.cos(a) * u + squash * math.sin(a) * v))
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


def rbox(bm, center, size, M=None, bevel=0.15, segments=1):
    """Box with chamfered edges (bevel as a fraction of the smallest side)."""
    before = set(bm.verts)
    box(bm, (0, 0, 0), size)
    new = [v for v in bm.verts if v not in before]
    edges = list({e for v in new for e in v.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=min(size) * bevel, segments=segments,
                    affect="EDGES", profile=0.5)
    new = [v for v in bm.verts if v not in before]
    T = Matrix.Translation(center)
    bmesh.ops.transform(bm, verts=new, matrix=(M @ T) if M is not None else T)


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
    """Split, sharpened log: irregular hexagonal shaft with a faceted point.
    Returns the length of the sharpened tip so callers can add a charred cap."""
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
    scanning stops at an *entry* beyond r, so a garment point in free space is
    never pushed into a solid that only starts further out."""
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
            far = d
        elif d > r:
            break
        if travelled >= limit:
            break
    return far


def conform_grid(P, A, bvh, clear=CLEAR, push=0.10, closed_u=True, iters=6):
    """Push grid points P outward (along P - A) so they clear everything in bvh.
    The push is smoothed over the grid (never below the required push)."""
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