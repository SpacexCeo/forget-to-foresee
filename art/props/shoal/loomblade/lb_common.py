"""Shared helpers for the Loomblade pipeline (art/props/shoal/loomblade): the part builders (one function per part of
parts.json, each for the high and the low mesh), small bmesh primitives, a node helper and the bake channel switch.

Run every step with Blender 4.5:  blender -b --python sNN_*.py -- [options]
Work files go to $LB_WORK (default: ./build next to the scripts).
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("LB_WORK", os.path.join(HERE, "build"))
os.makedirs(WORK, exist_ok=True)
SPEC = json.load(open(os.path.join(HERE, "parts.json")))
P = SPEC["parts"]
TAU = math.tau


def argv():
    a = sys.argv
    return a[a.index("--") + 1:] if "--" in a else []


def opt(name, default=None):
    a = argv()
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def log(*a):
    print("[loomblade]", *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))) if b != a else float(x >= b)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- bmesh primitives

def loft(bm, rings, closed=True, cap0=None, cap1=None, seam_col=None, seam_rings=()):
    """Quads between consecutive rings (lists of Vector, equal length). cap0/cap1: None, 'face' or a Vector (fan)."""
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    cols = range(n if closed else n - 1)
    for i in range(len(vr) - 1):
        for j in cols:
            a, b, c, d = vr[i][j], vr[i][(j + 1) % n], vr[i + 1][(j + 1) % n], vr[i + 1][j]
            bm.faces.new((a, b, c, d))
    bm.edges.index_update()
    if seam_col is not None:
        for i in range(len(vr) - 1):
            e = bm.edges.get((vr[i][seam_col], vr[i + 1][seam_col]))
            if e:
                e.seam = True
    for i in seam_rings:
        for j in cols:
            e = bm.edges.get((vr[i][j], vr[i][(j + 1) % n]))
            if e:
                e.seam = True
    for cap, ring, flip in ((cap0, vr[0], True), (cap1, vr[-1], False)):
        if cap is None:
            continue
        if cap == "face":
            bm.faces.new(ring[::-1] if flip else ring)
        else:
            c = bm.verts.new(cap)
            for j in range(n):
                a, b = ring[j], ring[(j + 1) % n]
                bm.faces.new((b, a, c) if flip else (a, b, c))
    return vr


def tube(bm, pts, radius, sides, cap=True, seam=False, radii=None):
    """A tube along a polyline with parallel-transported frames."""
    pts = [Vector(p) for p in pts]
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((0, 1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - t0 * ref.dot(t0)).normalized()
    rings = []
    for i, p in enumerate(pts):
        t = ((pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)])).normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized()
        bn = t.cross(nrm)
        r = radii[i] if radii else radius
        rings.append([p + (nrm * math.cos(TAU * k / sides) + bn * math.sin(TAU * k / sides)) * r for k in range(sides)])
    return loft(bm, rings, cap0="face" if cap else None, cap1="face" if cap else None, seam_col=0 if seam else None)


def lathe(bm, profile_rz, n, squash_y=1.0, seam=False, close=True):
    """Revolve an (r, z) profile about Z; `close` joins the last profile point back to the first."""
    prof = list(profile_rz) + ([profile_rz[0]] if close else [])
    rings = [[Vector((r * math.cos(TAU * k / n), r * math.sin(TAU * k / n) * squash_y, z)) for k in range(n)] for r, z in prof]
    return loft(bm, rings, seam_col=0 if seam else None, seam_rings=(0,) if (seam and close) else ())


def uv_sphere(bm, center, radius, seg, rings, scale=(1, 1, 1), seam=False):
    c = Vector(center)
    rr = []
    for i in range(1, rings):
        th = math.pi * i / rings
        rr.append([c + Vector((radius * math.sin(th) * math.cos(TAU * k / seg) * scale[0], radius * math.sin(th) * math.sin(TAU * k / seg) * scale[1],
                               -radius * math.cos(th) * scale[2])) for k in range(seg)])
    return loft(bm, rr, cap0=c + Vector((0, 0, -radius * scale[2])), cap1=c + Vector((0, 0, radius * scale[2])), seam_col=0 if seam else None)


def finish(bm, name, mat=None, sharp_deg=None, bevel=None):
    """bmesh -> object. sharp_deg marks hard edges sharp + seam; bevel = (width, segments) on those edges (high mesh)."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if sharp_deg is not None:
        lim = math.radians(sharp_deg)
        hard = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim]
        if bevel:
            bmesh.ops.bevel(bm, geom=hard, offset=bevel[0], segments=bevel[1], profile=0.5, affect="EDGES", clamp_overlap=True)
        else:
            for e in hard:
                e.smooth = False
                e.seam = True
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat:
        me.materials.append(mat)
    return ob


# ---------------------------------------------------------------- the parts (hi: bool)

def blade_dims(u):
    b = P["blade"]
    keys = b["width_keys_u_w"]
    tu = b["tip_from_u"]
    if u >= tu:
        w = keys[-1][1] * (1 - ((u - tu) / (1 - tu)) ** b["tip_power"])
    else:
        w = keys[-1][1]
        for (u0, w0), (u1, w1) in zip(keys, keys[1:]):
            if u0 <= u <= u1:
                w = w0 + (w1 - w0) * smooth(u0, u1, u)
    t = b["half_thick_base"] + (b["half_thick_end"] - b["half_thick_base"]) * min(u / tu, 1.0)
    if u > tu:
        t = b["half_thick_end"] * (1 - 0.82 * ((u - tu) / (1 - tu)) ** 1.3)
    f0, f1, f2, f3 = b["fuller_u"]
    fade = smooth(f0, f1, u) * (1 - smooth(f2, f3, u))
    return w, t, fade


def blade_z(u):
    return P["blade"]["z0"] + (P["blade"]["z1"] - P["blade"]["z0"]) * u


def build_blade(hi):
    b = P["blade"]
    bm = bmesh.new()
    if hi:
        us = [i / 220 * 0.9 for i in range(221)] + [0.9 + 0.1 * (i / 60) for i in range(1, 60)]
    else:
        us = [0, 0.05, 0.12, 0.22, 0.35, 0.48, 0.5, 0.62, 0.72, 0.80, 0.85, 0.90, 0.94, 0.97, 0.99]
    rings = []
    for u in us:
        w, t, fade = blade_dims(u)
        z = blade_z(u)
        f = b["fuller_half_width"] * fade
        d = b["fuller_depth"] * fade
        fl = max(w * 0.45, (b["fuller_half_width"] + 0.0016) * fade)
        fl = min(fl, w * 0.8)
        if hi:
            top = [(w, 0), (fl, t), (f + 0.0009 * fade, t), (f, t - d), (f * 0.5, t - d), (-f * 0.5, t - d), (-f, t - d), (-f - 0.0009 * fade, t), (-fl, t)]
        else:
            top = [(w, 0), (fl, t), (-fl, t)]
        sec = top + [(-x, -y) for x, y in top]
        rings.append([Vector((x, y, z)) for x, y in sec])
    n = len(rings[0])
    mid = us.index(0.5) if not hi else None
    loft(bm, rings, cap0="face" if hi else None, cap1=Vector((0, 0, b["z1"])), seam_rings=(mid,) if mid is not None else ())
    if not hi:  # islands: the two faces of the blade, split at mid-length; seams along both cutting edges
        for e in bm.edges:
            if abs(e.verts[0].co.y) < 1e-7 and abs(e.verts[1].co.y) < 1e-7 and e.verts[0].co.z != e.verts[1].co.z:
                e.seam = True
                e.smooth = False
    ob = finish(bm, "blade")
    return ob


def blade_face_materials(ob, flat, edge, floor):
    """High blade: the fuller floor, the woven flats and the polished bevels get their own materials."""
    me = ob.data
    for m in (flat, edge, floor):
        me.materials.append(m)
    b = P["blade"]
    for poly in me.polygons:
        c = poly.center
        u = (c.z - b["z0"]) / (b["z1"] - b["z0"])
        w, t, fade = blade_dims(max(0.0, min(1.0, u)))
        fl = min(max(w * 0.45, (b["fuller_half_width"] + 0.0016) * fade), w * 0.8)
        ax = abs(c.x)
        if ax > fl * 0.999 + 1e-6:
            poly.material_index = 1
        elif fade > 0.02 and ax < b["fuller_half_width"] * fade + 0.0005:
            poly.material_index = 2
        else:
            poly.material_index = 0


def build_braid():
    br, b = P["braid"], P["blade"]
    bm = bmesh.new()
    n = br["periods"] * 28
    for side in (1, -1):
        for k in range(br["strands"]):
            ph = TAU * k / br["strands"]
            pts, radii = [], []
            for i in range(n + 1):
                s = i / n
                u = br["u0"] + (br["u1"] - br["u0"]) * s
                _, t, fade = blade_dims(u)
                env = smooth(0, 0.035, s) * (1 - smooth(0.955, 1, s))
                th = TAU * br["periods"] * s + ph
                x = br["amp_x"] * math.sin(th) * env
                y = t - b["fuller_depth"] * fade + br["radius"] * 0.5 + br["amp_y"] * math.sin(2 * th) * env
                pts.append((x, side * y, blade_z(u)))
                radii.append(br["radius"] * (0.45 + 0.55 * env))
            tube(bm, pts, br["radius"], 8, radii=radii)
    return finish(bm, "braid")


def build_habaki(hi):
    h = P["habaki"]
    bm = bmesh.new()
    rings = []
    for z, w, t in ((h["z0"], h["half_width"][0], h["half_thick"][0]), (h["z1"], h["half_width"][1], h["half_thick"][1])):
        c = t * 0.55  # chamfered corners: an octagonal section
        rings.append([Vector(p + (z,)) for p in ((w, t - c), (w - c, t), (-w + c, t), (-w, t - c), (-w, -t + c), (-w + c, -t), (w - c, -t), (w, -t + c))])
    loft(bm, rings, cap0="face", cap1="face")
    return finish(bm, "habaki", sharp_deg=30, bevel=(0.0005, 2) if hi else None)


def build_ring(hi):
    r = P["ring"]
    seg, sides = (128, 28) if hi else (32, 10)
    bm = bmesh.new()
    rings = []
    for i in range(seg + 1):
        a = TAU * i / seg + math.pi / 2  # the seam sits at the top, hidden inside the habaki
        c = Vector((r["major"] * math.cos(a), 0, r["center_z"] + r["major"] * math.sin(a)))
        out = Vector((math.cos(a), 0, math.sin(a)))
        rings.append([c + (out * math.cos(TAU * k / sides) + Vector((0, 1, 0)) * math.sin(TAU * k / sides)) * r["minor"] for k in range(sides)])
    vr = loft(bm, rings, seam_col=sides // 2, seam_rings=(0,))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    return finish(bm, "ring")


def build_studs():
    r, s = P["ring"], P["studs"]
    bm = bmesh.new()
    for side in (1, -1):
        for i in range(s["count"]):
            a = TAU * (i + 0.5) / s["count"]
            uv_sphere(bm, (r["major"] * math.cos(a), side * r["minor"] * 0.95, r["center_z"] + r["major"] * math.sin(a)), s["radius"], 16, 10)
    return finish(bm, "studs")


def shuttle_frame(x):
    s = P["shuttle"]
    q = abs(x) / s["half_length"]
    # a guard with a silhouette (3D review 17): a full boss under the ring, slim arms that sweep up toward the
    # blade, and each arm ends in a flared tip like the point of a weaving shuttle, closing to a point
    t = min(1.0, max(0.0, (q - 0.93) / 0.07))
    close = math.sqrt(max(0.0, 1.0 - t * t * (3 - 2 * t)))
    flare = 1.0 + 1.05 * math.exp(-((q - 0.86) / 0.075) ** 2)
    arm = 0.46 + 0.54 * (1.0 - min(1.0, q / 0.55)) ** 1.6
    lift = s["upturn"] * (0.6 * q * q + 2.4 * q ** 4)
    return s["center_z"] + lift, s["half_height"] * arm * flare * close + 0.0006, s["half_thick"] * (0.5 + 0.5 * arm) * (0.75 + 0.25 * flare) * close + 0.0006


def build_shuttle(hi):
    s = P["shuttle"]
    L = s["half_length"]
    ns, nc = (96, 32) if hi else (20, 10)
    bm = bmesh.new()
    rings = []
    for i in range(1, ns):
        x = -L * math.cos(math.pi * i / ns)  # denser stations towards the tips
        zc, hz, hy = shuttle_frame(x)
        ring = []
        for k in range(nc):
            a = TAU * k / nc
            ca, sa = math.cos(a), math.sin(a)
            # a soft-cornered section: flat faces front and back, rounded top and bottom
            ey = math.copysign(abs(ca) ** 0.6, ca) * hy * (1.0 - 0.42 * max(0.0, sa) ** 1.5)   # pinched toward the top: a ridge
            ez = math.copysign(abs(sa) ** 0.85, sa) * hz
            ring.append(Vector((x, ey, zc + ez)))
        rings.append(ring)
    z0 = shuttle_frame(-L)[0]
    loft(bm, rings, cap0=Vector((-L, 0, z0)), cap1=Vector((L, 0, z0)), seam_col=nc // 4 * 3)
    return finish(bm, "shuttle")


def build_bobbins():
    bb = P["bobbins"]
    bm = bmesh.new()
    for sx in (1, -1):
        for sy in (1, -1):
            x = sx * bb["at_x"]
            zc, hz, hy = shuttle_frame(x)
            uv_sphere(bm, (0, 0, 0), 1.0, 32, 16)
            new = [v for v in bm.verts if not v.tag]
            for v in new:
                co = v.co
                v.co = Vector((x + co.z * bb["size"][0], sy * (hy * 0.86 + co.x * bb["size"][1]), zc + co.y * bb["size"][2]))
                v.tag = True
    return finish(bm, "bobbins")


def build_warp(hi):
    w = P["warp"]
    bm = bmesh.new()
    n = w["count"]
    for i in range(n):
        f = (i - (n - 1) / 2) / ((n - 1) / 2)
        p0 = (f * w["spread_bottom"], 0, w["z0"])
        p1 = (f * w["spread_top"], 0, w["z1"])
        if hi:
            pts = [tuple(a + (b - a) * (j / 12) for a, b in zip(p0, p1)) for j in range(13)]
            tube(bm, pts, w["radius"], 10)
        else:
            tube(bm, [p0, p1], w["radius_low"], 4, cap=False, seam=True)
    return finish(bm, "warp")


def grip_radius(z):
    g = P["grip"]
    v = (z - g["z0"]) / (g["z1"] - g["z0"])
    return g["radius_x"] + g["swell"] * math.sin(math.pi * v)


def build_grip(hi):
    g = P["grip"]
    nz, n = (90, 56) if hi else (6, 14)
    bm = bmesh.new()
    rings = []
    for i in range(nz + 1):
        z = g["z0"] + (g["z1"] - g["z0"]) * i / nz
        r = grip_radius(z)
        rings.append([Vector((r * math.cos(TAU * k / n), r * g["squash_y"] * math.sin(TAU * k / n), z)) for k in range(n)])
    cap = "face" if hi else None  # the low grip ends are hidden inside the ferrules
    loft(bm, rings, cap0=cap, cap1=cap, seam_col=n // 4)
    return finish(bm, "grip")


def build_wrap():
    wr, g = P["wrap"], P["grip"]
    bm = bmesh.new()
    n = wr["turns"] * 48
    for hand in (1, -1):
        pts = []
        for i in range(n + 1):
            s = i / n
            z = wr["z0"] + (wr["z1"] - wr["z0"]) * s
            a = hand * TAU * wr["turns"] * s
            r = grip_radius(z) + 0.0003
            pts.append((r * math.cos(a), r * g["squash_y"] * math.sin(a), z))
        tube(bm, pts, wr["radius"], 8)
    return finish(bm, "wrap")


def build_lathe(name, hi, n_hi=64, n_lo=14):
    p = P[name]
    prof = p["profile_rz"]
    bm = bmesh.new()
    if hi:  # subdivide the profile with a Catmull-Rom pass so the brass reads turned, not faceted
        pts = [Vector((r, z)) for r, z in prof]
        m = len(pts)
        out = []
        for i in range(m):
            p0, p1, p2, p3 = pts[(i - 1) % m], pts[i], pts[(i + 1) % m], pts[(i + 2) % m]
            for j in range(4):
                t = j / 4
                out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
        prof = [(max(v.x, 0.0005), v.y) for v in out]
    lathe(bm, prof, n_hi if hi else n_lo, squash_y=p.get("squash_y", 1.0), seam=not hi)
    return finish(bm, name, sharp_deg=None if hi else 50)


def build_pearl(hi):
    p = P["pearl"]
    bm = bmesh.new()
    uv_sphere(bm, (0, 0, p["center_z"]), p["radius"], *((64, 32) if hi else (20, 12)), seam=not hi)
    return finish(bm, "pearl")


def build_claws():
    c, p = P["claws"], P["pearl"]
    bm = bmesh.new()
    for i in range(c["count"]):
        a = TAU * (i + 0.5) / c["count"]
        pts = []
        for j in range(17):
            z = c["from_z"] + (c["to_z"] - c["from_z"]) * j / 16
            dz = z - p["center_z"]
            rs = math.sqrt(max(p["radius"] ** 2 - dz * dz, 0.0)) + 0.0003
            rr = max(rs, 0.0150 if j == 0 else 0)
            pts.append((rr * math.cos(a), rr * math.sin(a), z))
        tube(bm, pts, c["radius"], 8, radii=[c["radius"] * (1.5 - 0.9 * j / 16) for j in range(17)])
    return finish(bm, "claws")


HIGH_PARTS = ["pearl", "collar", "claws", "ferrule_bot", "grip", "wrap", "ferrule_top", "shuttle", "bobbins", "ring", "studs", "warp", "habaki", "blade", "braid"]
LOW_PARTS = [k for k in HIGH_PARTS if not P[k].get("hp_only")]


def build_part(name, hi):
    if name == "blade":
        return build_blade(hi)
    if name == "braid":
        return build_braid()
    if name == "habaki":
        return build_habaki(hi)
    if name == "ring":
        return build_ring(hi)
    if name == "studs":
        return build_studs()
    if name == "shuttle":
        return build_shuttle(hi)
    if name == "bobbins":
        return build_bobbins()
    if name == "warp":
        return build_warp(hi)
    if name == "grip":
        return build_grip(hi)
    if name == "wrap":
        return build_wrap()
    if name in ("collar", "ferrule_bot", "ferrule_top"):
        return build_lathe(name, hi)
    if name == "pearl":
        return build_pearl(hi)
    if name == "claws":
        return build_claws()
    raise KeyError(name)


# ---------------------------------------------------------------- checks

def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def gap(a, b):
    """0 when the two meshes intersect, else the smallest vertex-to-surface distance (m)."""
    def tree(o):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        t = BVHTree.FromBMesh(bm)
        return t, bm
    ta, ba = tree(a)
    tb, bb = tree(b)
    if ta.overlap(tb):
        g = 0.0
    else:
        g = min(min(tb.find_nearest(v.co)[3] for v in ba.verts), min(ta.find_nearest(v.co)[3] for v in bb.verts))
    ba.free()
    bb.free()
    return g


def bounds(objs):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


# ---------------------------------------------------------------- nodes

class NK:
    """A small shader-node helper: every method returns an output socket."""

    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.t = self.mat.node_tree
        self.bsdf = self.t.nodes["Principled BSDF"]
        tc = self.t.nodes.new("ShaderNodeTexCoord")
        self.obj = tc.outputs["Object"]

    def _set(self, sock, v):
        if hasattr(v, "is_output"):
            self.t.links.new(v, sock)
        elif v is not None:
            try:
                sock.default_value = v
            except (TypeError, ValueError):
                sock.default_value = (*v, 1.0) if len(v) == 3 else v

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.t.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for s, v in zip(n.inputs, (a, b, c)):
            self._set(s, v)
        return n.outputs[0]

    def xyz(self, vec=None):
        n = self.t.nodes.new("ShaderNodeSeparateXYZ")
        self._set(n.inputs[0], vec or self.obj)
        return n.outputs

    def noise(self, scale, detail=3.0, rough=0.55, vec=None, stretch=None):
        n = self.t.nodes.new("ShaderNodeTexNoise")
        v = vec or self.obj
        if stretch:
            m = self.t.nodes.new("ShaderNodeMapping")
            m.inputs["Scale"].default_value = stretch
            self.t.links.new(v, m.inputs["Vector"])
            v = m.outputs[0]
        self.t.links.new(v, n.inputs["Vector"])
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        return n.outputs["Fac"]

    def mix(self, fac, a, b):
        n = self.t.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        self._set(n.inputs[0], fac)
        self._set(n.inputs[6], a)
        self._set(n.inputs[7], b)
        return n.outputs[2]

    def ramp(self, fac, lo, hi):
        n = self.t.nodes.new("ShaderNodeMapRange")
        n.clamp = True
        self._set(n.inputs["Value"], fac)
        n.inputs["From Min"].default_value = lo
        n.inputs["From Max"].default_value = hi
        return n.outputs[0]

    def finish(self, base, rough, metal, emit=None, height=None, bump=0.5, dist=0.0005):
        b = self.bsdf
        self._set(b.inputs["Base Color"], base)
        self._set(b.inputs["Roughness"], rough)
        self._set(b.inputs["Metallic"], metal)
        if emit is not None:
            self._set(b.inputs["Emission Color"], emit)
            b.inputs["Emission Strength"].default_value = 1.0
        if height is not None:
            n = self.t.nodes.new("ShaderNodeBump")
            n.inputs["Strength"].default_value = bump
            n.inputs["Distance"].default_value = dist
            self.t.links.new(height, n.inputs["Height"])
            self.t.links.new(n.outputs[0], b.inputs["Normal"])
        return self.mat


CHANNEL_INPUT = {"base": "Base Color", "rough": "Roughness", "metal": "Metallic", "emit": "Emission Color"}


def set_channel(mat, ch):
    """Route one Principled input to an Emission shader (for EMIT bakes), or 'shaded' to put the BSDF back.
    Works on any material with a Principled BSDF, so a replacement source mesh with its own textures bakes too."""
    if not mat or not mat.use_nodes:
        return
    t = mat.node_tree
    out = next((n for n in t.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
    bsdf = next((n for n in t.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not out or not bsdf:
        return
    em = t.nodes.get("__bake_emit") or t.nodes.new("ShaderNodeEmission")
    em.name = "__bake_emit"
    for l in list(em.inputs["Color"].links):
        t.links.remove(l)
    if ch == "shaded":
        t.links.new(bsdf.outputs[0], out.inputs["Surface"])
        return
    inp = bsdf.inputs[CHANNEL_INPUT[ch]]
    strength = 1.0
    if ch == "emit":
        strength = min(bsdf.inputs["Emission Strength"].default_value, 1.0)
    em.inputs["Strength"].default_value = strength
    if inp.is_linked:
        t.links.new(inp.links[0].from_socket, em.inputs["Color"])
    else:
        v = inp.default_value
        em.inputs["Color"].default_value = (v, v, v, 1.0) if isinstance(v, float) else tuple(v)
    t.links.new(em.outputs[0], out.inputs["Surface"])


def use_gpu(sc):
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            devs = [d for d in prefs.devices if d.type == kind]
            if devs:
                for d in prefs.devices:
                    d.use = d.type == kind
                sc.cycles.device = "GPU"
                log("cycles device", kind, [d.name for d in devs])
                return kind
        except Exception as e:  # noqa: BLE001
            log("no", kind, e)
    sc.cycles.device = "CPU"
    return "CPU"
