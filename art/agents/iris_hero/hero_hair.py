"""Iris hair: a groomed master (Blender Hair Curves) and a game version (hair cards) built from it.

Style (owner brief 09.11): shoulder-length dark chestnut hair, a subtle parting a little off centre (her
left), soft layered face-framing strands, volume at the crown and back, waves that grow toward the ends
into slightly irregular curls, fine flyaways, a slim band set back behind the crown.

Master ("Hair_Master" collection, editable, not exported):
    guides     ~280 Bezier-free polyline guides grown on the scalp by a combed flow field, kept outside the
               head, ears, collar and capelet by BVH collision
    hair       ~30k strands: area-weighted roots on the scalp, interpolated from the 3 nearest guides,
               clumped toward clump guides, light frizz; thin roots, tapering tips; short fine wisps
               along the hairline
    material   Principled Hair BSDF (Chiang): melanin chestnut, lighter warm ends, random colour and
               roughness per strand
Game ("Hair_Game", exported as `hair`): one card per clump following the clump's mean path and spread,
plus fine cards for flyaways; the strand atlas is rendered from master-style strands (render_strand_atlas).
"""

import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

V = Vector
PTS = 20                     # points per strand / guide


def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


class Scalp:
    """Scalp faces of the body (MakeHuman 'scalp' group): sampling, normals, distance to the hairline."""

    def __init__(self, body, scalp_idx):
        mw = body.matrix_world
        sset = set(scalp_idx)
        me = body.data
        self.tris = []
        for p in me.polygons:
            if all(v in sset for v in p.vertices):
                vs = [mw @ me.vertices[i].co for i in p.vertices]
                for k in range(1, len(vs) - 1):
                    a, b, c = vs[0], vs[k], vs[k + 1]
                    area = (b - a).cross(c - a).length / 2
                    self.tris.append((a, b, c, area))
        # hairline: scalp vertices on the region boundary
        edge_count = {}
        for p in me.polygons:
            if all(v in sset for v in p.vertices):
                for e in p.edge_keys:
                    edge_count[e] = edge_count.get(e, 0) + 1
        border = {v for e, n in edge_count.items() if n == 1 for v in e}
        self.kd_border = KDTree(len(border))
        for i, v in enumerate(border):
            self.kd_border.insert(mw @ me.vertices[v].co, i)
        self.kd_border.balance()
        self.cum = np.cumsum([t[3] for t in self.tris])

    def sample(self, n, rnd):
        out = []
        for _ in range(n):
            i = int(np.searchsorted(self.cum, rnd.random() * self.cum[-1]))
            a, b, c, _ = self.tris[min(i, len(self.tris) - 1)]
            u, v = rnd.random(), rnd.random()
            if u + v > 1:
                u, v = 1 - u, 1 - v
            p = a + (b - a) * u + (c - a) * v
            nrm = (b - a).cross(c - a).normalized()
            out.append((p, nrm))
        return out

    def hairline_dist(self, p):
        return self.kd_border.find(p)[2]


class Collider:
    def __init__(self, objs, margin):
        verts, polys = [], []
        for o in objs:
            dg = bpy.context.evaluated_depsgraph_get()
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            off = len(verts)
            mw = o.matrix_world
            verts += [mw @ v.co for v in me.vertices]
            polys += [[off + i for i in p.vertices] for p in me.polygons]
            ev.to_mesh_clear()
        self.bvh = BVHTree.FromPolygons(verts, polys)
        self.margin = margin

    def push(self, p, margin=None):
        m = self.margin if margin is None else margin
        hit = self.bvh.find_nearest(p)
        if hit[0] is None:
            return p
        loc, nrm, _, d = hit
        side = (p - loc).dot(nrm)
        if side < m:
            return loc + nrm * m
        return p


# ===================================================================== groom

class Groom:
    def __init__(self, body, scalp_idx, head_c, head_r, colliders, seed=7, part_x=0.026):
        self.rnd = random.Random(seed)
        self.scalp = Scalp(body, scalp_idx)
        self.c = head_c
        self.r = head_r
        self.head_col, self.body_col = colliders
        self.part_x = part_x

    def flow(self, p, side):
        """Combed direction: away from the parting near the top, sweeping back at the temples, down below."""
        q = p - self.c
        n = q.normalized()
        top = smooth01(-0.1, 1.0, q.z / self.r[2])
        fwd = max(0.0, min(1.0, -q.y / self.r[1]))
        front = smooth01(-0.35, 0.35, -q.y / self.r[1])          # the parting only exists at the front
        d = V((side * (0.15 + 0.95 * top * front), 0.12 + 0.35 * fwd * top, -(1.2 - 0.8 * top)))
        if q.z > -self.r[2] * 0.25:
            d = d - n * d.dot(n)
        return d.normalized()

    def grow(self, root, nrm, length, lift, wave, ph, freq, curl, side):
        """One guide: integrate the flow on (and just above) the skull, then fall; waves toward the ends."""
        pts = [root + nrm * 0.002]
        p = pts[0].copy()
        step = length / (PTS - 1)
        base = [p.copy()]
        for i in range(1, PTS):
            t = i / (PTS - 1)
            g = self.flow(p, side)
            p = p + g * step
            off = 0.003 + lift * smooth01(0.0, 0.35, t)
            p = self.head_col.push(p, off)
            if p.z < self.c.z - self.r[2] * 0.2:
                p = self.body_col.push(p, 0.010 + 0.6 * lift)
            base.append(p.copy())
        out = []
        for i, p in enumerate(base):
            t = i / (PTS - 1)
            if i == 0:
                out.append(p)
                continue
            tan = (base[min(i + 1, PTS - 1)] - base[i - 1]).normalized()
            radial = V((p.x - self.c.x, p.y - self.c.y, 0.0))
            radial = (radial - tan * radial.dot(tan)).normalized() if radial.length > 1e-6 else V((1, 0, 0))
            sidev = tan.cross(radial).normalized()
            a = wave * smooth01(0.30, 1.0, t)
            c = curl * smooth01(0.65, 1.0, t)
            w = sidev * (a * math.sin(t * freq + ph)) + radial * (0.35 * a * math.cos(t * freq + ph))
            w += (sidev * math.cos(t * 13 + ph) + radial * math.sin(t * 13 + ph)) * c
            q = p + w
            if q.z > self.c.z - self.r[2] * 0.35:
                q = self.head_col.push(q, 0.003 + lift * 0.5)
            else:
                q = self.body_col.push(q, 0.010)
            out.append(q)
        return out

    def guide_params(self, root):
        q = root - self.c
        side = 1.0 if root.x > self.part_x else -1.0
        fwd = max(0.0, min(1.0, -q.y / self.r[1]))
        back = max(0.0, min(1.0, q.y / self.r[1]))
        top = max(0.0, q.z / self.r[2])
        rnd = self.rnd
        # tips about the shoulders: face-framing layers a little shorter, the back a touch longer
        length = (0.25 + 0.04 * back - 0.04 * fwd * (1 - top) + 0.05 * top) * rnd.uniform(0.9, 1.1)
        lift = (0.004 + 0.012 * top * (0.5 + back)) * rnd.uniform(0.7, 1.3)          # crown volume
        # waves: phase varies smoothly over the head so neighbours wave together, frequency a little free
        ph = 2.2 * math.sin(root.x * 31 + 0.4) + 1.6 * math.cos(root.y * 23) + rnd.uniform(-0.4, 0.4)
        freq = rnd.uniform(9.0, 12.5)
        wave = rnd.uniform(0.012, 0.022)
        curl = rnd.uniform(0.003, 0.009) if rnd.random() < 0.6 else 0.0
        return side, length, lift, wave, ph, freq, curl

    def guides(self, n=280):
        roots = self.scalp.sample(n * 3, self.rnd)
        picked = []
        kd_pts = []
        for p, nrm in roots:                                   # blue-noise thinning
            if all((p - q).length > 0.011 for q in kd_pts[-400:]):
                picked.append((p, nrm))
                kd_pts.append(p)
            if len(picked) >= n:
                break
        out = []
        for p, nrm in picked:
            prm = self.guide_params(p)
            side = prm[0]
            hl = self.scalp.hairline_dist(p)
            pts = self.grow(p, nrm, prm[1], prm[2], prm[3], prm[4], prm[5], prm[6], side)
            out.append(dict(root=p, nrm=nrm, pts=np.array([tuple(x) for x in pts]), side=side, hairline=hl))
        return out

    def strands(self, guides, n=30000, clump_every=2, clump=0.55, frizz=0.0012):
        """Interpolate from the 3 nearest guides on the same side of the parting, then clump and frizz."""
        rnd = self.rnd
        kd = KDTree(len(guides))
        for i, g in enumerate(guides):
            kd.insert(g["root"], i)
        kd.balance()
        clumps = guides[::clump_every]
        kdc = KDTree(len(clumps))
        for i, g in enumerate(clumps):
            kdc.insert(g["root"], i)
        kdc.balance()
        t = np.linspace(0, 1, PTS)[:, None]
        out, radius = [], []
        roots = self.scalp.sample(n, rnd)
        for p, nrm in roots:
            side = 1.0 if p.x > self.part_x else -1.0
            at_front = (p - self.c).y < self.r[1] * 0.1
            near = [(co, i, d) for co, i, d in kd.find_n(p, 6) if guides[i]["side"] == side or not at_front][:3] \
                or kd.find_n(p, 3)
            ws = np.array([1.0 / max(d, 1e-4) ** 2 for _, _, d in near])
            ws /= ws.sum()
            shape = sum(w * (guides[i]["pts"] - guides[i]["pts"][0]) for w, (_, i, _) in zip(ws, near))
            s = np.array(tuple(p))[None, :] + shape
            # clumping toward the nearest clump guide (strength grows along the strand, varies per strand)
            _, ci, cd = kdc.find(p)
            if (clumps[ci]["side"] == side or not at_front) and cd < 0.03:
                cg = clumps[ci]["pts"]
                k = clump * rnd.uniform(0.6, 1.0) * (t ** 0.8)
                target = cg + (s[:1] - cg[:1]) * (1 - k)
                s = s * (1 - k) + target * k
            s = s + np.random.normal(0, frizz, s.shape) * (t ** 1.5)
            # hairline: short, fine wisps
            hl = self.scalp.hairline_dist(p)
            if hl < 0.010:
                cut = int(PTS * (0.35 + 0.5 * hl / 0.010))
                s = np.vstack([s[:cut], np.repeat(s[cut - 1:cut], PTS - cut, 0)])
            out.append(s)
            r0 = (0.000085 if hl > 0.010 else 0.00005) * rnd.uniform(0.8, 1.2)
            radius.append(r0)
        # flyaways: a few long loose strands lifted off the surface
        for g in rnd.sample(guides, 40):
            s = g["pts"] + np.random.normal(0, 0.004, g["pts"].shape) * (t ** 1.2)
            s[:, :2] += (s[:, :2] - np.array([self.c.x, self.c.y])) * 0.06 * t
            out.append(s)
            radius.append(0.00004)
        return out, radius


def resample(poly, n=PTS):
    """Polyline -> n points evenly spaced by arc length."""
    poly = [V(p) for p in poly]
    cum = [0.0]
    for a, b in zip(poly, poly[1:]):
        cum.append(cum[-1] + (b - a).length)
    L = cum[-1] or 1e-6
    out, j = [], 0
    for i in range(n):
        d = L * i / (n - 1)
        while j < len(cum) - 2 and cum[j + 1] < d:
            j += 1
        seg = cum[j + 1] - cum[j] or 1e-6
        out.append(poly[j].lerp(poly[j + 1], (d - cum[j]) / seg))
    return np.array([tuple(p) for p in out])


class Tied(Groom):
    """Hair pulled back into a low tie at the nape: combed over the skull toward the tie, a tail that
    hangs from it in clumps with waves toward the ends, soft face-framing wisps at the temples and fine
    baby hairs along the hairline."""

    def setup(self):
        c, r = self.c, self.r
        self.T = V((0.004, c.y + r[1] * 0.88, c.z - r[2] * 0.42))           # the tie, low at the back
        rnd = self.rnd
        # tail centre line: out from the head a little, then down over the hood
        self.tail = [self.T + V((0.0, 0.030 * s ** 0.5 + 0.030 * s, -0.22 * s)) +
                     V((0.008 * math.sin(s * 4.0), 0, 0)) for s in np.linspace(0, 1, 12)]
        self.tail = [self.body_col.push(p, 0.040) if i > 2 else p for i, p in enumerate(self.tail)]
        self.clumps = [(rnd.uniform(0, math.tau), rnd.uniform(0.0, 1.0) ** 0.5) for _ in range(26)]

    def skull_path(self, root, nrm, lift):
        pts = [root + nrm * 0.0015]
        p = pts[0].copy()
        q0 = root - self.c
        side = 1.0 if root.x > self.part_x else -1.0
        near_part = max(0.0, 1.0 - abs(root.x - self.part_x) / 0.035) * smooth01(0.35, 0.75, q0.z / self.r[2]) \
            * smooth01(-0.2, 0.5, -q0.y / self.r[1])
        travelled = 0.0
        for _ in range(60):
            q = p - self.c
            n = q.normalized()
            d = (self.T - p).normalized()
            lateral = near_part * (1.0 - smooth01(0.0, 0.035, travelled))
            d = d * (1 - lateral) + V((side, 0.2, -0.3)).normalized() * lateral
            travelled += 0.008
            d = d * (self.T - p).length
            if d.length < 0.016:
                break
            d = d - n * d.dot(n) * 0.85
            p = p + d.normalized() * 0.008
            p = self.head_col.push(p, 0.0025 + lift)
            pts.append(p.copy())
        pts.append(self.T)
        return pts

    def tail_path(self, k, own, length):
        ang, rad = self.clumps[k]
        out = []
        for i, c in enumerate(self.tail):
            s = i / (len(self.tail) - 1)
            if s > length:
                break
            spread = 0.008 + 0.042 * math.sin(min(1.0, s * 1.6) * math.pi / 2) * (1 - 0.30 * s)
            a = ang + own[0] + 0.6 * s * math.sin(own[1] * 3)
            off = V((math.cos(a), 0.6 * math.sin(a), 0)) * (spread * (rad + own[2]))
            wave = 0.008 * smooth01(0.45, 1.0, s) * math.sin(s * 14 + own[1])
            out.append(c + off + V((wave, wave * 0.4, 0)))
        return out

    def strands(self, guides=None, n=30000):
        self.setup()
        rnd = self.rnd
        out, radius, reps = [], [], []
        roots = self.scalp.sample(n, rnd)
        for idx, (p, nrm) in enumerate(roots):
            hl = self.scalp.hairline_dist(p)
            q = p - self.c
            top = max(0.0, q.z / self.r[2])
            lift = 0.001 + 0.006 * top * rnd.uniform(0.5, 1.0)             # sleek, a little volume on top
            if hl < 0.006 and rnd.random() < 0.5:                          # baby hairs
                d = (self.T - p)
                d = (d - nrm * d.dot(nrm)).normalized()
                L = rnd.uniform(0.006, 0.016)
                poly = [p + nrm * 0.001, p + d * L * 0.5 + nrm * 0.002, p + d * L + nrm * 0.003 + V((0, 0, rnd.uniform(-0.003, 0.003)))]
                out.append(resample(poly))
                radius.append(0.00003)
                continue
            skull = self.skull_path(p, nrm, lift)
            k = rnd.randrange(len(self.clumps))
            own = (rnd.uniform(-0.3, 0.3), rnd.uniform(0, math.tau), rnd.uniform(-0.15, 0.15))
            tail = self.tail_path(k, own, rnd.uniform(0.80, 1.0))
            s = resample(skull + tail)
            s = s + np.random.normal(0, 0.0006, s.shape) * np.linspace(0, 1, PTS)[:, None] ** 2
            out.append(s)
            radius.append(0.00008 * rnd.uniform(0.8, 1.2))
            if idx % 140 == 0:
                reps.append(dict(root=p, pts=s, side=1.0, kind="main"))
        # face-framing wisps at the temples: loose, soft, waved, ending near the jaw
        for side in (1.0, -1.0):
            for w in range(1):
                base = self.c + V((side * self.r[0] * 0.78, -self.r[1] * 0.42, self.r[2] * 0.30))
                base = self.head_col.push(base, 0.002)
                ph = rnd.uniform(0, math.tau)
                Lw = rnd.uniform(0.09, 0.12)
                for j in range(90):
                    jit = V((rnd.gauss(0, 0.002), rnd.gauss(0, 0.002), rnd.gauss(0, 0.002)))
                    poly = []
                    for i in range(14):
                        t = i / 13
                        pp = base + jit * (1 + 2 * t) + V((side * 0.006 * t, -0.016 * t * t, -Lw * t))
                        pp += V((side * 0.006 * math.sin(t * 9 + ph), 0, 0)) * t
                        poly.append(self.head_col.push(pp, 0.003))
                    out.append(resample(poly))
                    radius.append(0.00006)
                reps.append(dict(root=base, pts=out[-1], side=side, kind="wisp"))
        return out, radius, reps


def hair_tie(T, axis, r=0.011, tube=0.0035):
    """The elastic that holds the tail: a small torus around the tail axis."""
    import agent_geometry as AG
    b = bmesh.new()
    AG.torus(b, V((0, 0, 0)), r, tube, n=16, m=6)
    rot = V((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(b, matrix=Matrix.Translation(T) @ rot, verts=b.verts)
    me = bpy.data.meshes.new("hair_tie")
    b.to_mesh(me)
    b.free()
    o = bpy.data.objects.new("hair_tie", me)
    bpy.context.scene.collection.objects.link(o)
    for p in me.polygons:
        p.use_smooth = True
    return o


def build_curves(name, strands, radii, mat, coll):
    cv = bpy.data.hair_curves.new(name)
    cv.add_curves([PTS] * len(strands))
    pos = np.concatenate(strands).astype(np.float32).ravel()
    cv.position_data.foreach_set("vector", pos)
    rad = cv.attributes.get("radius") or cv.attributes.new("radius", "FLOAT", "POINT")
    taper = np.array([r * (1.0 - 0.8 * (i / (PTS - 1)) ** 1.4) for r in radii for i in range(PTS)], np.float32)
    rad.data.foreach_set("value", taper)
    cv.materials.append(mat)
    o = bpy.data.objects.new(name, cv)
    coll.objects.link(o)
    return o


def hair_material(name="M_Iris_HairMaster"):
    """Dark chestnut: melanin with warm redness, lighter sun-touched ends, per-strand variation."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    h = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
    h.model = "CHIANG"
    h.parametrization = "MELANIN"
    info = nt.nodes.new("ShaderNodeHairInfo")
    ramp = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(info.outputs["Intercept"], ramp.inputs["Value"])
    ramp.inputs["To Min"].default_value = 0.80            # roots
    ramp.inputs["To Max"].default_value = 0.62            # ends
    nt.links.new(ramp.outputs["Result"], h.inputs["Melanin"])
    h.inputs["Melanin Redness"].default_value = 0.62
    h.inputs["Tint"].default_value = (1.0, 0.93, 0.88, 1)
    h.inputs["Roughness"].default_value = 0.32
    h.inputs["Radial Roughness"].default_value = 0.42
    h.inputs["Coat"].default_value = 0.08
    h.inputs["Random Color"].default_value = 0.16
    h.inputs["Random Roughness"].default_value = 0.22
    nt.links.new(info.outputs["Random"], h.inputs["Random"])
    nt.links.new(h.outputs[0], out.inputs["Surface"])
    return m


# ===================================================================== game cards

def cards_from_groom(guides, strands, card_cols=(0, 1, 2, 3), fine_cols=(4, 5, 6, 7), n_fine=60, seed=5,
                     head_col=None, head_c=V((0, 0, 1.60)), tie=None):
    """One card per guide clump: the centre line is the guide, the width is the local spread of the
    strands around it (tapering), the card lies tangent to the hair surface. Fine cards for flyaways."""
    rnd = random.Random(seed)
    b = bmesh.new()
    uv = b.loops.layers.uv.new("UVMap")
    cols = 8

    def card(pts, widths, col, normals):
        prev = None
        u0 = col / cols
        n = len(pts)
        for i, p in enumerate(pts):
            tan = V(pts[min(i + 1, n - 1)]) - V(pts[max(i - 1, 0)])
            tan.normalize()
            nrm = normals[i]
            side = tan.cross(nrm).normalized() * widths[i]
            row = (b.verts.new(V(p) - side), b.verts.new(V(p) + side))
            if prev:
                f = b.faces.new((prev[0], prev[1], row[1], row[0]))
                for lo, (uu, vv) in zip(f.loops, ((u0, 1 - (i - 1) / (n - 1)), (u0 + 1 / cols, 1 - (i - 1) / (n - 1)),
                                                  (u0 + 1 / cols, 1 - i / (n - 1)), (u0, 1 - i / (n - 1)))):
                    lo[uv].uv = (uu, vv)
            prev = row

    step = 2                                                   # cards use every other guide point (10 rows)
    for g in guides:
        pts = [V(x) for x in g["pts"][::step]] + [V(g["pts"][-1])]
        c = V((0, 0, 0))
        nrms = []
        phi = rnd.uniform(0, math.tau)
        for p in pts:
            if tie is not None and p.z < tie.z - 0.005 and p.y > tie.y - 0.03:
                nrms.append(V((math.cos(phi), 0.3 * math.sin(phi), 0.0)).normalized())
            else:
                nrms.append((p - head_c).normalized())
        n = len(pts)
        widths = [0.011 * (0.85 + 0.3 * rnd.random()) * (1.0 - 0.55 * (i / (n - 1)) ** 1.5) for i in range(n)]
        card(pts, widths, rnd.choice(card_cols), nrms)
        # a second, airier card a little outside the first breaks up the surface
        if rnd.random() < 0.55:
            pts2 = [p + nr * 0.004 for p, nr in zip(pts, nrms)]
            card(pts2, [w * 0.8 for w in widths], rnd.choice(fine_cols[:3]), nrms)
    for s in rnd.sample(strands[-40:], min(n_fine, 40)):
        pts = [V(tuple(x)) for x in s[::step]]
        nrms = [(p - head_c).normalized() for p in pts]
        card(pts, [0.0035] * len(pts), fine_cols[-1], nrms)
    me = bpy.data.meshes.new("hair")
    b.to_mesh(me)
    b.free()
    o = bpy.data.objects.new("hair", me)
    bpy.context.scene.collection.objects.link(o)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def render_strand_atlas(path, size=2048, seed=3):
    """The card texture: master-style strands laid flat in 8 columns (0-3 dense clumps, 4-6 airy,
    7 single strands), rendered top-down in Cycles with the hair material and a transparent film."""
    sc = bpy.context.scene
    keep = {o.name for o in sc.objects}
    rnd = random.Random(seed)
    coll = bpy.data.collections.new("_atlas")
    sc.collection.children.link(coll)
    strands, radii = [], []
    for col in range(8):
        dense = 260 if col < 4 else 120 if col < 7 else 14
        for k in range(dense):
            x0 = (col + 0.08 + 0.84 * rnd.random()) / 8
            if col >= 4:
                x0 = (col + 0.12 + 0.76 * rnd.random()) / 8
            lv = 1.0 - rnd.uniform(0.0, 0.18 if col < 7 else 0.35)
            ph = rnd.uniform(0, math.tau)
            pts = []
            for i in range(PTS):
                t = i / (PTS - 1)
                y = 1.0 - t * lv
                x = x0 + 0.004 * math.sin(t * 7 + ph) * t
                pts.append((x, y, 0.0))
            strands.append(np.array(pts))
            radii.append(0.0011 if col < 7 else 0.0008)
    mat = bpy.data.materials.get("M_Iris_HairMaster") or hair_material()
    o = build_curves("_atlas_strands", strands, radii, mat, coll)
    cam = bpy.data.objects.new("_atlas_cam", bpy.data.cameras.new("_atlas_cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.0
    cam.location = (0.5, 0.5, 2.0)
    coll.objects.link(cam)
    L = bpy.data.objects.new("_atlas_sun", bpy.data.lights.new("_atlas_sun", "SUN"))
    L.data.energy = 3.5
    L.rotation_euler = (0.5, 0.3, 0.0)
    coll.objects.link(L)
    old = (sc.camera, sc.render.film_transparent, sc.render.resolution_x, sc.render.resolution_y, sc.render.filepath)
    sc.camera = cam
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    hidden = []
    for ob in sc.objects:
        if ob.name not in {o.name, cam.name, L.name} and not ob.hide_render:
            ob.hide_render = True
            hidden.append(ob)
    bpy.ops.render.render(write_still=True)
    for ob in hidden:
        ob.hide_render = False
    sc.camera, sc.render.film_transparent, sc.render.resolution_x, sc.render.resolution_y, sc.render.filepath = old
    for ob in list(coll.objects):
        bpy.data.objects.remove(ob)
    bpy.data.collections.remove(coll)
    return path


def headband_fit(collider, head_c, tilt=0.45, hair=0.016, width=0.010, thick=0.004, n=40):
    """A slim band lying on the hair: each point is the skull (ray from inside the head) plus the hair."""
    import hero_costume as C
    rings = []
    for k in range(3):
        ring = []
        for i in range(n):
            a = math.pi * (0.10 + 0.80 * i / (n - 1))
            d = V((math.cos(a), math.sin(tilt) * math.sin(a), math.cos(tilt) * math.sin(a))).normalized()
            along = V((0, math.cos(tilt), -math.sin(tilt)))
            o = head_c + along * (width * (k - 1))
            hit = collider.bvh.ray_cast(o + d * 0.30, -d)
            p = hit[0] if hit[0] is not None else o + d * 0.1
            off = hair + thick * (k == 1)
            ring.append(p + d * off * (0.6 + 0.4 * math.sin(a)))
        rings.append(ring)
    ob = C.loft("headband", rings, closed_u=False)
    C.solidify(ob, thick, 0.0)
    C.smooth(ob)
    return ob
