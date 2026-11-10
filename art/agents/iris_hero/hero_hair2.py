"""Iris's hair, second build (the owner-approved target sheet of 10.11, docs/art/iris/refs/I-001_01_target.png).

The first build was about 250 alpha cards over a thin flat-coloured cap: jagged card ends, a stair-step
hairline, bald wedges and dark slits wherever two cards parted. This build is made the other way round:

1. a solid hair volume (`hair_cap`): the scalp region cut along a smooth hairline, lifted off the skull
   (thin at the hairline, full over the crown) and textured with opaque strands that all run to the tie,
   so the coverage is continuous by construction;
2. broad overlapping locks (`hair`): alpha cards with soft roots and tips that lie on that volume like
   shingles and follow the same flow; a gap between two locks shows hair, never scalp or a dark cap;
3. a low ponytail: an opaque strand-textured core with tip cards around it, on the `tail` spring chain.

Both materials read one atlas: the top half is the tileable opaque strand field (cap and tail core), the
bottom half holds eight lock strips with alpha. The flow is polar around the axis head centre -> tie:
a strand is a line of constant azimuth, so the cap's texture, the locks and the tail all agree.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector as V
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

STRIPS = 8                    # strips in the bottom half of the atlas: seven locks and the lashes (the last)
CAP_V = (0.53, 0.97)          # v range of the opaque strand field used by the cap (hairline .. tie)
TAIL_LEN = 0.215              # metres from the tie to the end of the tail core


def smooth01(a, b, x):
    if a == b:
        return 0.0
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hairline_f(q, r):
    """> 0 where hair grows; q is the point relative to the head centre, r the head half extents.
    A rounded forehead line, lower at the temples, over and behind the ears, down to the nape. The
    value is roughly the height above the hairline in units of the head's half height."""
    fy, sx, zz = q.y / r[1], abs(q.x) / r[0], q.z / r[2]
    nf = 0.55 - 0.29 * min(1.0, sx / 0.80) ** 2
    side = (0.15 - 0.40 * (fy + 0.35) / 0.35) if fy < 0 else (-0.25 - 0.50 * min(1.0, fy / 0.5))
    s = smooth01(-0.52, -0.30, fy)
    return zz - (nf * (1 - s) + side * s)


def tie_point(c, r):
    return V((0.004, c.y + r[1] * 0.88, c.z - r[2] * 0.42))          # low at the back (same as the first build)


class Flow:
    """Polar coordinates around the axis head centre -> tie: theta 0 at the tie, phi 0 over the top."""

    def __init__(self, c0, T):
        self.c0 = c0
        self.a = (T - c0).normalized()
        up = V((0, 0, 1))
        self.e1 = (up - self.a * up.dot(self.a)).normalized()
        self.e2 = self.a.cross(self.e1)

    def angles(self, p):
        d = (p - self.c0).normalized()
        return math.acos(max(-1.0, min(1.0, d.dot(self.a)))), math.atan2(d.dot(self.e2), d.dot(self.e1))

    def direction(self, theta, phi):
        return self.a * math.cos(theta) + (self.e1 * math.cos(phi) + self.e2 * math.sin(phi)) * math.sin(theta)


def _new_obj(name, b):
    me = bpy.data.meshes.new(name)
    b.to_mesh(me)
    b.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def build_cap(body, head_idx, ear_idx, c, r, T, flow, log=print):
    """The hair volume over the scalp. Returns (object, BVH of the cap, BVH of the bare head)."""
    full = bmesh.new()
    full.from_mesh(body.data)
    head_bvh = BVHTree.FromBMesh(full)
    full.verts.ensure_lookup_table()
    ear_kd = KDTree(max(len(ear_idx), 1))
    for k, i in enumerate(ear_idx):
        ear_kd.insert(full.verts[i].co, k)
    ear_kd.balance()
    f0 = lambda co: hairline_f(co - c, r)

    b = bmesh.new()
    b.from_mesh(body.data)
    for lay in list(b.verts.layers.shape.values()):
        b.verts.layers.shape.remove(lay)
    head = set(head_idx)
    ears = set(ear_idx)
    bmesh.ops.delete(b, geom=[v for v in b.verts if v.index not in head or v.index in ears or f0(v.co) < -0.14],
                     context="VERTS")
    bmesh.ops.subdivide_edges(b, edges=b.edges[:], cuts=1, use_grid_fill=True)
    bmesh.ops.delete(b, geom=[v for v in b.verts if f0(v.co) < 0.0], context="VERTS")
    bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context="VERTS")
    # loose islands (a few faces left on the far side of an ear) go: keep the largest connected part
    seen, parts = set(), []
    for v in b.verts:
        if v in seen:
            continue
        part, stack = [], [v]
        seen.add(v)
        while stack:
            x = stack.pop()
            part.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        parts.append(part)
    parts.sort(key=len, reverse=True)
    for part in parts[1:]:
        bmesh.ops.delete(b, geom=part, context="VERTS")

    def near_ear(co):
        return bool(ear_idx) and ear_kd.find(co)[2] < 0.010

    # the cut left a staircase: move each boundary vertex out onto the hairline itself, along the head
    eps = 1e-4
    for _ in range(3):
        for v in b.verts:
            if not v.is_boundary or near_ear(v.co):
                continue
            f = f0(v.co)
            g = V(((f0(v.co + V((eps, 0, 0))) - f0(v.co - V((eps, 0, 0)))) / (2 * eps),
                   (f0(v.co + V((0, eps, 0))) - f0(v.co - V((0, eps, 0)))) / (2 * eps),
                   (f0(v.co + V((0, 0, eps))) - f0(v.co - V((0, 0, eps)))) / (2 * eps)))
            if g.length_squared < 1e-9:
                continue
            step = g * (-f / g.length_squared)
            if step.length > 0.006:
                step = step.normalized() * 0.006
            hit = head_bvh.find_nearest(v.co + step)
            if hit[0] is not None:
                v.co = hit[0]
    for _ in range(4):                                 # and even the line out along itself
        new = {}
        for v in b.verts:
            if not v.is_boundary:
                continue
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                p = v.co * 0.5 + (nb[0].co + nb[1].co) * 0.25
                hit = head_bvh.find_nearest(p)
                new[v] = hit[0] if hit[0] is not None else p
        for v, p in new.items():
            v.co = p

    # volume: thin at the hairline and around the ears, full over the crown and the back of the head
    b.normal_update()
    for v in b.verts:
        q = v.co - c
        fy, zz = q.y / r[1], q.z / r[2]
        dist = max(0.0, f0(v.co)) * r[2]
        edge = smooth01(0.0, 0.040, dist)
        tmax = (0.0105 + 0.0055 * smooth01(-0.2, 0.6, fy) * smooth01(-0.4, 0.4, zz)
                + 0.0040 * smooth01(0.2, -0.7, fy) * smooth01(0.3, 0.8, zz))
        tmax *= 0.45 + 0.55 * smooth01(-0.75, -0.25, zz)
        t = 0.0010 + (tmax - 0.0010) * edge
        if ear_idx:
            t = min(t, 0.0010 + 0.6 * max(0.0, ear_kd.find(v.co)[2] - 0.004))
        n = (v.normal * 0.6 + q.normalized() * 0.4).normalized()
        gather = smooth01(0.045, 0.0, (v.co - T).length)             # the hair is drawn together at the tie
        v.co = v.co + n * t + flow.a * (0.010 * gather)
    inner = [v for v in b.verts if not v.is_boundary]
    for _ in range(3):
        bmesh.ops.smooth_vert(b, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)

    # polar UVs: u around the axis (the seam under the tie, faces across it get u + 1 and the texture
    # repeats), v from the hairline to the tie
    # the hairline: a 7 mm fringe on the skin all along the cap's edge (not round the ears), mapped to the
    # soft root of a lock strip, so the hair thins out strand by strand instead of ending in a cut line
    fringe = {}
    for v in [v for v in b.verts if v.is_boundary]:
        if ear_idx and ear_kd.find(v.co)[2] < 0.014:
            continue
        g = V(((f0(v.co + V((eps, 0, 0))) - f0(v.co - V((eps, 0, 0)))) / (2 * eps),
               (f0(v.co + V((0, eps, 0))) - f0(v.co - V((0, eps, 0)))) / (2 * eps),
               (f0(v.co + V((0, 0, eps))) - f0(v.co - V((0, 0, eps)))) / (2 * eps)))
        if g.length_squared < 1e-9:
            continue
        hit = head_bvh.find_nearest(v.co - g.normalized() * 0.0055)
        if hit[0] is not None:
            fringe[v] = hit[0] + hit[1] * 0.0007
    fringe_faces = set()
    made = {}
    for e in [e for e in b.edges if e.is_boundary]:
        a, d = e.verts
        if a in fringe and d in fringe:
            for x in (a, d):
                if x not in made:
                    made[x] = b.verts.new(fringe[x])
            f = b.faces.new((a, d, made[d], made[a]))
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - c) < 0:
                f.normal_flip()
            f.smooth = True
            fringe_faces.add(f)
    inner_of = {nv: v for v, nv in made.items()}
    uv = b.loops.layers.uv.verify()
    for f in fringe_faces:
        for lo in f.loops:
            outer = lo.vert in inner_of
            th, ph = flow.angles((inner_of[lo.vert] if outer else lo.vert).co)
            t = (ph * 3.0) % 2.0
            tri = t if t < 1.0 else 2.0 - t
            lo[uv].uv = ((2 + 0.30 + 0.40 * tri) / STRIPS, 0.4985 if outer else 0.440)
    for f in b.faces:
        if f in fringe_faces:
            continue
        us = []
        for lo in f.loops:
            th, ph = flow.angles(lo.vert.co)
            us.append((0.5 + ph / math.tau, CAP_V[1] - (CAP_V[1] - CAP_V[0]) * th / math.pi))
        wrap = max(u for u, _ in us) - min(u for u, _ in us) > 0.5
        for lo, (u, vv) in zip(f.loops, us):
            lo[uv].uv = (u + 1.0 if wrap and u < 0.5 else u, vv)
    log("hair cap", len(b.verts), "verts", len(b.faces), "faces")
    cap_bvh = BVHTree.FromBMesh(b)
    full.free()
    return _new_obj("hair_cap", b), cap_bvh, head_bvh


def _ribbon(b, uv, pts, widths, sides, strip, v0, v1, tilt, arch=0.0012):
    """One lock: a strip three vertices across along pts; sides[i] is the across direction, the lock is
    tilted like a shingle (one edge lower than the other) and arched a little across."""
    rows = []
    n = len(pts)
    for i, (p, w, sd) in enumerate(zip(pts, widths, sides)):
        up = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).cross(sd)
        up = up.normalized() if up.length > 1e-9 else V((0, 0, 1))
        s = i / (n - 1)
        row = []
        for k, x in enumerate((-1.0, 0.0, 1.0)):
            lift = arch * (1 - abs(x)) + tilt * x
            nv = b.verts.new(p + sd * (w * 0.5 * x) + up * lift)
            u = (strip + 0.5 + 0.44 * x) / STRIPS
            row.append((nv, (u, v0 + (v1 - v0) * s)))
        rows.append(row)
    for i in range(n - 1):
        for k in range(2):
            quad = (rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k])
            f = b.faces.new([q[0] for q in quad])
            for lo, q in zip(f.loops, quad):
                lo[uv].uv = q[1]


def build_locks(flow, cap_bvh, head_bvh, seed=11, log=print):
    """Broad overlapping locks over the cap: one ring rooted on the hairline (soft roots over the skin's
    edge), two more further back; every lock runs along a line of constant azimuth to the tie."""
    rnd = np.random.RandomState(seed)
    c0 = flow.c0

    def surf(theta, phi, lift):
        d = flow.direction(theta, phi)
        hit = cap_bvh.ray_cast(c0, d)
        on_cap = hit[0] is not None
        if not on_cap:
            hit = head_bvh.ray_cast(c0, d)
        if hit[0] is None:
            return None, False
        return hit[0] + d * lift, on_cap

    def hairline_theta(phi):
        th = math.pi * 0.985
        while th > 0.25:
            if cap_bvh.ray_cast(c0, flow.direction(th, phi))[0] is not None:
                return th
            th -= 0.012
        return 0.25

    b = bmesh.new()
    uv = b.loops.layers.uv.new("UVMap")
    count = 0
    #        n  root (fraction of the hairline angle)  width (rad)  lift (m)        end theta
    layers = ((38, (1.0, 1.0), (0.30, 0.40), (0.0010, 0.0022), (0.20, 0.30)),
              (28, (0.58, 0.82), (0.34, 0.46), (0.0018, 0.0032), (0.15, 0.24)),
              (18, (0.30, 0.52), (0.38, 0.52), (0.0026, 0.0042), (0.12, 0.18)))
    for li, (n, root, width, lift, end) in enumerate(layers):
        for k in range(n):
            phi0 = -math.pi + math.tau * (k + rnd.uniform(0.15, 0.85)) / n
            th_h = hairline_theta(phi0)
            th0 = th_h * rnd.uniform(*root) - (0.03 if li == 0 else 0.0)
            th1 = rnd.uniform(*end)
            if th0 - th1 < 0.25:
                continue
            dphi = rnd.uniform(*width)
            L = rnd.uniform(*lift)
            wav, ph = rnd.uniform(-0.05, 0.05), rnd.uniform(0, math.tau)
            nseg = max(4, int((th0 - th1) / 0.15))
            pts, widths, sides = [], [], []
            for i in range(nseg + 1):
                s = i / nseg
                th = th0 + (th1 - th0) * s
                phi = phi0 + wav * math.sin(s * 5.0 + ph)
                hump = math.sin(math.pi * min(1.0, s * 1.25)) ** 0.8
                p, on_cap = surf(th, phi, (0.0006 if li == 0 else 0.0012) + L * hump)
                if p is None:
                    break
                if not on_cap and i > 0:                 # a hole in the cap (an ear): the lock starts again behind it
                    pts, widths, sides = [], [], []
                    continue
                sd = (flow.e2 * math.cos(phi) - flow.e1 * math.sin(phi))
                R = (p - c0).length
                # narrower where the lock begins and where it enters the tie
                w = dphi * R * math.sin(th) * (0.55 + 0.45 * smooth01(0.0, 0.25, s))
                pts.append(p)
                widths.append(max(w, 0.006))
                sides.append(sd.normalized())
            if len(pts) < 4:
                continue
            _ribbon(b, uv, pts, widths, sides, rnd.randint(STRIPS - 1), 0.485, 0.075,
                    tilt=rnd.choice((-1, 1)) * rnd.uniform(0.0003, 0.0009), arch=0.0008)
            count += 1
    log("hair locks", count, "faces", len(b.faces))
    return _new_obj("hair", b)


def tail_line(T, s, push=None):
    p = T + V((0.008 * math.sin(s * 4.0), 0.012 + 0.026 * s ** 0.5 + 0.026 * s, -TAIL_LEN * s))
    return push(p) if push and s > 0.2 else p


def build_tail(T, colliders, seed=5, log=print):
    """The ponytail: an opaque core (strand field) and soft-tipped cards around and beyond it."""
    rnd = np.random.RandomState(seed)
    bvhs = []
    deps = bpy.context.evaluated_depsgraph_get()
    for o in colliders:
        bvhs.append(BVHTree.FromObject(o, deps))

    def push(p, margin=0.034):
        for t in bvhs:
            hit = t.find_nearest(p)
            if hit[0] is not None and hit[3] < margin:
                d = p - hit[0]
                d = d.normalized() if d.length > 1e-6 else V((0, 1, 0))
                if d.y < 0:                              # never through to the front of the neck
                    d = V((d.x, abs(d.y), d.z)).normalized()
                p = hit[0] + d * margin
        return p

    def frame(s):
        p = tail_line(T, s, push)
        t = (tail_line(T, s + 0.02, push) - tail_line(T, max(0.0, s - 0.02), push)).normalized()
        x = V((1, 0, 0))
        x = (x - t * x.dot(t)).normalized()
        return p, t, x, t.cross(x)

    def radius(s):
        return 0.0105 + 0.0105 * smooth01(0.0, 0.22, s) - 0.0125 * smooth01(0.45, 1.0, s)

    # core
    b = bmesh.new()
    uv = b.loops.layers.uv.new("UVMap")
    SIDES, RINGS = 12, 9
    rings = []
    for i in range(RINGS):
        s = 0.92 * i / (RINGS - 1)
        p, t, x, y = frame(s)
        rr = radius(s)
        ring = []
        for k in range(SIDES + 1):
            a = math.tau * k / SIDES + math.pi / 2          # the seam faces the neck
            co = p + x * (math.cos(a) * rr * 1.18) + y * (math.sin(a) * rr * 0.86)
            ring.append((b.verts.new(co) if k < SIDES else ring[0][0],
                         (0.30 * k / SIDES, CAP_V[1] - (CAP_V[1] - CAP_V[0] - 0.04) * s)))
        rings.append(ring)
    for i in range(RINGS - 1):
        for k in range(SIDES):
            quad = (rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k])
            f = b.faces.new([q[0] for q in quad])
            for lo, q in zip(f.loops, quad):
                lo[uv].uv = q[1]
    tip = b.verts.new(frame(1.0)[0])
    for k in range(SIDES):
        f = b.faces.new((rings[-1][k][0], rings[-1][k + 1][0], tip))
        for lo, q in zip(f.loops, (rings[-1][k][1], rings[-1][k + 1][1], (0.15, CAP_V[0]))):
            lo[uv].uv = q
    bmesh.ops.recalc_face_normals(b, faces=b.faces[:])
    core = _new_obj("hair_tail", b)

    # cards
    b = bmesh.new()
    uv = b.loops.layers.uv.new("UVMap")
    N = 14
    for k in range(N):
        a0 = math.tau * (k + rnd.uniform(0.2, 0.8)) / N
        s_end = rnd.uniform(1.0, 1.24)
        off = rnd.uniform(0.0015, 0.0050)
        twist = rnd.uniform(-0.5, 0.5)
        pts, widths, sides = [], [], []
        NSEG = 7
        for i in range(NSEG + 1):
            s = 0.04 + (s_end - 0.04) * i / NSEG
            p, t, x, y = frame(min(s, 1.0))
            if s > 1.0:
                p = p + t * ((s - 1.0) * TAIL_LEN)
            a = a0 + twist * s
            rr = max(radius(min(s, 0.92)) * (1.0 - 0.75 * smooth01(0.90, 1.24, s)), 0.0015) + off * (1 - 0.6 * smooth01(0.8, 1.2, s))
            rad = x * (math.cos(a) * 1.18) + y * (math.sin(a) * 0.86)
            pts.append(p + rad * rr)
            widths.append(0.021 * (0.55 + 0.45 * smooth01(0.0, 0.3, s)) * (1.0 - 0.55 * smooth01(0.6, 1.24, s)))
            sides.append((x * -math.sin(a) + y * math.cos(a)).normalized())
        _ribbon(b, uv, pts, widths, sides, rnd.randint(STRIPS - 1), 0.36, 0.012, tilt=rnd.uniform(-0.001, 0.001), arch=0.002)
    cards = _new_obj("hair_tail_cards", b)
    log("hair tail", len(core.data.polygons), "core faces", len(cards.data.polygons), "card faces")
    return core, cards


def build(body, head_idx, ear_idx, c, r, colliders=(), log=print):
    """All of the hair. Returns ({name: object}, tie point). After skinning the scalp locks and the tail's
    core are joined into `hair_cap` (alpha-tested, single-sided: at a grazing angle a lock's underside is
    culled and the volume shows, never a dark back face); the tail's cards become `hair` (double-sided)."""
    T = tie_point(c, r)
    # The axis runs from the tie through the head to a point just under the hairline over her left brow:
    # the strands leave that point like a side parting and sweep over the top and across the forehead
    # (straight through the middle of the face the hair would fan out of the forehead's centre).
    flow = Flow(c + V((0.015, 0.0, 0.0)), T)
    cap, cap_bvh, head_bvh = build_cap(body, head_idx, ear_idx, c, r, T, flow, log)
    locks = build_locks(flow, cap_bvh, head_bvh, log=log)
    core, cards = build_tail(T, [body, *colliders], log=log)
    locks.name = "hair_locks"
    return {"hair_cap": cap, "hair_locks": locks, "hair_tail": core, "hair_tail_cards": cards}, T


def scalp_attr(body, c, r, head_idx):
    """`scalpw` on the skin: 0 on the face, rising to 1 under the hair (the skin bake shades the scalp and a
    soft band below the hairline in the hair's own dark brown, so the cap's edge has no pale rim)."""
    a = body.data.attributes.get("scalpw") or body.data.attributes.new("scalpw", "FLOAT", "POINT")
    head = set(head_idx)
    for v in body.data.vertices:
        a.data[v.index].value = smooth01(-0.030, 0.04, hairline_f(v.co - c, r)) if v.index in head else 0.0


# ----------------------------------------------------------------------------------------------- textures

SHADOW = np.array((54, 35, 24), float)       # sRGB: between the locks
MID = np.array((112, 79, 55), float)         # light chestnut brown (the target sheet's hair chip): not ginger, not blonde
LIGHT = np.array((168, 130, 97), float)      # sun on the strands
SCALP = (0.110, 0.055, 0.030)                # linear: the skin under the hair and just below the hairline
LASH = 0.42                                  # the last strip is the lashes: the same strands, near black-brown


def _columns(W, rnd, scales=((1, 0.26), (2, 0.24), (4, 0.22), (16, 0.20), (64, 0.24), (256, 0.26))):
    """A tileable 1D strand profile in 0..1: random values at several scales along u."""
    x = np.arange(W)
    out = np.zeros(W)
    tot = 0.0
    for sc, amp in scales:
        n = W // sc
        vals = rnd.rand(n)
        i = (x // sc) % n
        fr = (x % sc) / sc
        fr = fr * fr * (3 - 2 * fr)
        out += amp * (vals[i] * (1 - fr) + vals[(i + 1) % n] * fr)
        tot += amp
    out /= tot
    lo, hi = np.percentile(out, 2), np.percentile(out, 98)
    return np.clip((out - lo) / (hi - lo), 0, 1)


def _field(W, Hh, rnd):
    """Strands running along v: three profiles blended along the length, each row shifted a little so
    the strands wander instead of standing as ruled lines."""
    A, B, C = _columns(W, rnd), _columns(W, rnd), _columns(W, rnd)
    v = np.linspace(0, 1, Hh)[:, None]
    x = np.arange(W)[None, :]
    dx = (7.0 * np.sin(v * 9.0 + rnd.uniform(0, 6)) + 4.0 * np.sin(v * 23.0 + rnd.uniform(0, 6))).astype(int)
    U = (x + dx) % W
    U2 = (x - dx) % W
    wa = np.cos(v * math.pi / 2) ** 2
    wc = np.sin(v * math.pi / 2) ** 2 * 0.6
    f = A[U] * wa + B[U2] * (1 - wa - wc * 0.5).clip(0, 1) + C[U] * wc
    f /= (wa + (1 - wa - wc * 0.5).clip(0, 1) + wc)
    return f


def _ramp(f):
    f = f[..., None]
    lo = SHADOW + (MID - SHADOW) * np.clip(f / 0.55, 0, 1)
    return lo + (LIGHT - MID) * np.clip((f - 0.55) / 0.45, 0, 1) ** 1.3


def write_textures(out_dir, size=2048, seed=3, name="agent_iris"):
    """The hair atlas: base colour (RGBA), ORM and a strand normal map. Rows are written v-up."""
    from PIL import Image, ImageFilter
    rnd = np.random.RandomState(seed)
    W = size
    Hh = size // 2
    top = _field(W, Hh, rnd)                                           # opaque strand field (cap, tail core)
    ws = W // STRIPS
    bot = np.zeros((Hh, W))
    alpha = np.zeros((Hh, W))
    y = (1.0 - np.linspace(0, 1, Hh))[:, None]                         # 0 at the root (top of the half), 1 at the tip
    for k in range(STRIPS):
        f = _field(ws * 2, Hh, rnd)[:, :ws]
        x = (np.arange(ws)[None, :] + 0.5) / ws
        e = 1.0 - np.abs(2 * x - 1)                                    # 0 at the strip's edges, 1 in the middle
        tone = rnd.uniform(0.80, 1.12) if k < STRIPS - 1 else 0.10
        bot[:, k * ws:(k + 1) * ws] = np.clip(f * tone * (0.66 + 0.34 * np.clip(e / 0.5, 0, 1)), 0, 1)
        # strands end one by one: each column has its own threshold; coverage falls toward the edges,
        # the root and (over a longer stretch) the tip
        r1 = rnd.rand(ws // 2).repeat(2)[:ws]
        r2 = rnd.rand(ws)
        thr = (0.6 * r1 + 0.4 * r2)[None, :]
        root = np.clip(y / 0.10, 0, 1)
        tip = np.clip((1.0 - y) / 0.22, 0, 1)
        cov = np.clip((e - 0.10) / 0.34, 0, 1) * root ** 0.8 * tip ** 0.9
        a = np.clip((cov - thr * 0.92) / 0.06 + 0.5, 0, 1)
        a[cov <= 0.0] = 0.0
        alpha[:, k * ws:(k + 1) * ws] = a
    f_all = np.concatenate([bot, top], axis=0)                         # v-up: cards at the bottom, field on top
    a_all = np.concatenate([alpha, np.ones((Hh, W))], axis=0)
    rgb = _ramp(f_all)
    rgb[:Hh, (STRIPS - 1) * ws:] *= LASH
    img = np.dstack([rgb, a_all[..., None] * 255.0]).clip(0, 255).astype(np.uint8)
    base = Image.fromarray(np.flipud(img), "RGBA")
    r_, g_, b_, a_ = base.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.7))                      # soft strand edges for alpha-to-coverage
    base = Image.merge("RGBA", (r_, g_, b_, a_))
    p_base = os.path.join(out_dir, f"{name}_hair_basecolor.png")
    base.save(p_base)
    # normal: the strands' relief across u (v-up arrays, flipped on save)
    h = f_all
    dxh = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 2.2
    nz = 1.0 / np.sqrt(1.0 + dxh * dxh)
    nrm = np.dstack([(-dxh * nz) * 0.5 + 0.5, np.full_like(h, 0.5), nz * 0.5 + 0.5])
    half = (size // 2, size // 2)
    p_nrm = os.path.join(out_dir, f"{name}_normal_hair.png")
    Image.fromarray(np.flipud((nrm * 255).clip(0, 255).astype(np.uint8)), "RGB").resize(half, Image.LANCZOS).save(p_nrm)
    low = np.array(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))) / 255.0
    orm = np.dstack([0.72 + 0.28 * low, 0.60 + 0.20 * (1.0 - h), np.zeros_like(h)])
    p_orm = os.path.join(out_dir, f"{name}_hair_orm.png")
    Image.fromarray(np.flipud((orm * 255).clip(0, 255).astype(np.uint8)), "RGB").resize(half, Image.LANCZOS).save(p_orm)
    return p_base, p_orm, p_nrm


def load_images(paths, name="agent_iris"):
    out = []
    for p, nm, cs in zip(paths, (f"{name}_hair_basecolor", f"{name}_hair_orm", f"{name}_normal_hair"),
                         ("sRGB", "Non-Color", "Non-Color")):
        im = bpy.data.images.load(p)
        im.name = nm
        im.colorspace_settings.name = cs
        out.append(im)
    return out
