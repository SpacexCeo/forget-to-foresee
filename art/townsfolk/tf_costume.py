"""Townsfolk costumes: garments fitted to any cast body from its own landmarks (Blender 4.5).

Built on the hero costume primitives (art/agents/iris_hero/hero_costume.py: loft, shell_from_body,
solidify, boots_from_body), with every height taken from the body's joints instead of fixed numbers, so
the same recipe dresses a child, a broad innkeeper and a stooped elder.

Three kinds of garment:
    shell   cut from the body surface and eased outward (shirts, bodices, trousers, wraps, caps)
    tube    a loft of horizontal rings on the support function of the body section (skirts, robes, tunic
            hems, aprons, tabards, capes): the fabric bridges every hollow and can never cut a corner
    band    a ring that follows a tilted plane round the body (belts, sashes, straps, necklaces)
Every garment carries the vertex attribute `trim` (0..1) and the custom properties `gcol`, `tcol` (palette
keys) and `mat` (cloth, leather, metal, wood, straw, hair, amber, skin) read by tf_shading.py.

Front is -Y, the person's left is +X; angles around the body are degrees from the front, 90 = left.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import build_iris_hero as IH
import hero_costume as C

V = Vector
TAU = 2 * math.pi
TORSO = ("pelvis", "spine", "chest")
ARMS = ("upperarm_L", "upperarm_R", "forearm_L", "forearm_R")
LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
HEAD = ("head", "jaw", "eye_L", "eye_R")


SOLID = True          # False in the game build: big garments stay single-sided (half the triangles)


def _solid(o, t, offset=-1.0, even=True):
    if SOLID or o.name.startswith(("hat", "shoes")):
        C.solidify(o, t, offset, even)


def sm01(a, b, x):
    return C.smooth01(a, b, x)


class Ctx:
    """The body, its probe and landmarks, and the garments built so far."""

    def __init__(self, bm, rig, key="x"):
        self.bm, self.rig, self.key = bm, rig, key
        self.dom = IH.dominant(bm)
        self.wts = IH.weights_of(bm)
        self.P = C.BodyProbe(bm, lambda i: self.dom[i])
        self.co = self.P.co
        self.polys = [list(p.vertices) for p in bm.data.polygons]
        self.tree = BVHTree.FromPolygons(self.co, self.polys)
        self.bones = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local)
                      for b in rig.data.bones}
        self.garments = {}
        self.rnd = random.Random(hash(key) % 9973)
        B = self.bones
        L = self.L = type("L", (), {})()
        L.neck = B["neck"][0].z
        L.head = B["head"][0].z
        L.sh = B["upperarm_L"][0].copy()
        L.elbow = B["forearm_L"][0].copy()
        L.wrist = B["hand_L"][0].copy()
        L.hip = B["thigh_L"][0].z
        L.knee = B["shin_L"][0].z
        L.ankle = B["foot_L"][0].z
        mid = [p.z for i, p in enumerate(self.co) if self.dom[i] == "pelvis" and abs(p.x) < 0.012]
        L.crotch = min(mid) if mid else L.hip - 0.08
        L.waist = B["spine"][0].z + 0.45 * (B["chest"][0].z - B["spine"][0].z)
        L.armpit = L.sh.z - 0.075
        L.bust = B["chest"][0].z + 0.42 * (L.neck - B["chest"][0].z)
        L.eye = (B["eye_L"][0] + B["eye_R"][0]) / 2
        hp = [p for i, p in enumerate(self.co) if self.dom[i] in HEAD and p.z > L.head + 0.03]
        xs, ys, zs = [p.x for p in hp], [p.y for p in hp], [p.z for p in hp]
        L.top = max(zs)
        self.head_c = V(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2))
        self.head_r = ((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, (max(zs) - min(zs)) / 2)
        if "lips" in bm.vertex_groups:
            lp = [self.co[i] for i in IH.group_verts(bm, "lips", 0.5)]
            L.mouth = sum(lp, V()) / len(lp)
        else:
            L.mouth = V((0, L.eye.y - 0.02, L.eye.z - 0.065))
        c, _, _ = self.P.section(L.hip, bones=TORSO + ("thigh_L", "thigh_R"))
        self.axis = V((0.0, c.y, 0.0))            # the vertical axis every ring is measured from
        # vertices sorted by height for the section queries
        self._byz = sorted(range(len(self.co)), key=lambda i: self.co[i].z)
        self._zs = [self.co[i].z for i in self._byz]

    # ------------------------------------------------------------ sections

    def support(self, z, bones, n=48, band=0.02):
        """Support function of the body section at height z around the axis: for each of n directions
        (0 = front, going to the person's left) the farthest extent of the section along it."""
        import bisect
        lo, hi = bisect.bisect_left(self._zs, z - band), bisect.bisect_right(self._zs, z + band)
        pts = [(self.co[i].x - self.axis.x, self.co[i].y - self.axis.y) for i in self._byz[lo:hi] if self.dom[i] in bones]
        if len(pts) < 6:
            return None
        out = []
        for k in range(n):
            th = -math.pi / 2 + TAU * k / n
            cx, sy = math.cos(th), math.sin(th)
            out.append(max(x * cx + y * sy for x, y in pts))
        return out

    def arm_s(self, p):
        """0 at the shoulder joint .. 1 at the wrist, for a point on either arm."""
        s = "L" if p.x > 0 else "R"
        S, W = self.bones[f"upperarm_{s}"][0], self.bones[f"hand_{s}"][0]
        ax = W - S
        return (p - S).dot(ax) / ax.length_squared

    # ------------------------------------------------------------ bookkeeping

    def add(self, o, gcol, tcol=None, mat="cloth", rule=None):
        o["gcol"], o["tcol"], o["mat"] = gcol, tcol or gcol, mat
        if rule:
            o["rule"] = rule
        self.garments[o.name] = o
        return o

    def outer_tree(self, objs):
        """BVH of the outward-facing faces of the given garments (to lay another layer over them)."""
        co, polys = [], []
        for o in objs:
            base = len(co)
            mw = o.matrix_world
            co.extend(mw @ v.co for v in o.data.vertices)
            for f in o.data.polygons:
                c = mw @ f.center
                r = V((c.x - self.axis.x, c.y - self.axis.y, 0))
                if abs(c.x) > 0.19 and c.z > self.L.wrist.z:              # sleeves: outward from the arm line
                    s = "L" if c.x > 0 else "R"
                    S, W = self.bones[f"upperarm_{s}"][0], self.bones[f"hand_{s}"][0]
                    t = max(0.0, min(1.0, (c - S).dot(W - S) / (W - S).length_squared))
                    r = c - (S + (W - S) * t)
                if f.normal.dot(r) > 0:
                    polys.append([base + i for i in f.vertices])
        return BVHTree.FromPolygons(co, polys) if polys else None

    def clear(self, o, gap=0.004, over=(), over_gap=0.004, iters=2):
        """Push the garment's vertices out of the body (and out of the garments listed in `over`)."""
        trees = [(self.tree, gap)]
        ot = self.outer_tree(over) if over else None
        if ot:
            trees.append((ot, over_gap))
        me = o.data
        for _ in range(iters):
            for tree, g in trees:
                for v in me.vertices:
                    loc, nrm, _, d = tree.find_nearest(v.co, 0.08)
                    if loc is None:
                        continue
                    side = (v.co - loc).dot(nrm)
                    if side < g:
                        v.co = v.co + nrm * (g - side)
        me.update()

    # ------------------------------------------------------------ shells

    def shell(self, name, keep, offset=0.008, thick=0.004, relax=0, trim=None, edges=None, decimate=None):
        o = C.shell_from_body(self.bm, name, keep, offset, thick if SOLID else 0.0, trim=trim, edges=edges, decimate=decimate,
                              relax=((lambda p: True), relax) if relax else None,
                              edge_relax=3 if edges else 0, loop_smooth=((lambda p: True), 14))
        return o

    def top(self, name, hem_z, sleeves="long", ease=0.010, neck="round", open_front=0.0, relax=6, thick=0.004,
            arm_ease=None):
        """Shirt, bodice, vest or coat body: the torso from the neckline down to hem_z, with sleeves.
        sleeves: none | cap | short | elbow | rolled | long.   neck: round | wide | vee | high."""
        L, dom, co = self.L, self.dom, self.co
        cut = {"none": -1.0, "cap": 0.16, "short": 0.30, "elbow": 0.52, "rolled": 0.60, "long": 0.965}[sleeves]
        nz = {"round": L.neck + 0.012, "wide": L.neck - 0.008, "vee": L.neck + 0.010, "high": L.neck + 0.045}[neck]
        c, rx, ry = self.P.section(L.bust, bones=("chest",))

        def keep(i, _):
            p, d = co[i], dom[i]
            if d in TORSO or d in ("neck", "shoulder_L", "shoulder_R"):
                if p.z < hem_z or p.z > nz:
                    return False
                if d == "neck" and neck == "wide" and p.z > L.neck - 0.02:
                    return False
                if neck == "vee" and p.y < c.y:
                    depth = 0.12 * (1 - abs(p.x) / 0.07)
                    if depth > 0 and p.z > nz - depth:
                        return False
                if open_front and p.y < c.y and abs(p.x) < open_front * (0.6 + 0.4 * (L.neck - p.z) / max(L.neck - hem_z, 0.1)):
                    return False
                return True
            if d in ARMS:
                if cut < 0:
                    return False
                return self.arm_s(p) < cut
            return False

        def edges(v):
            p = v.co
            if abs(p.z - hem_z) < 0.03 and abs(p.x) < rx + 0.06:
                p.z = hem_z
        off = (lambda p, n: (arm_ease if arm_ease is not None and abs(p.x) > rx + 0.02 else ease))
        o = C.shell_from_body(self.bm, name, keep, off, thick if SOLID else 0.0, edges=edges, edge_relax=3,
                              relax=((lambda p: True), relax) if relax else None,
                              trim=lambda p, n: 0.0, loop_smooth=((lambda p: abs(p.z - hem_z) > 0.004), 14))
        return o

    def cuff_rolls(self, name, s=0.60, r_add=0.016, w=0.03):
        """Rolled sleeve ends: a soft ring round each arm at arm parameter s."""
        b = bmesh.new()
        for sx in ("L", "R"):
            S, W = self.bones[f"upperarm_{sx}"][0], self.bones[f"hand_{sx}"][0]
            E = self.bones[f"forearm_{sx}"][0]
            cpt = S + (W - S) * s
            ax = ((W - E) if s > 0.5 else (E - S)).normalized()
            # the arm's radius there
            near = [(self.co[i] - cpt) for i in range(len(self.co)) if self.dom[i] in ARMS and abs((self.co[i] - cpt).dot(ax)) < 0.015
                    and (self.co[i].x > 0) == (sx == "L")]
            rr = max((d - ax * d.dot(ax)).length for d in near) if near else 0.045
            cpt = cpt + sum(((d - ax * d.dot(ax)) for d in near), V()) / max(len(near), 1)
            a = ax.orthogonal().normalized()
            c2 = ax.cross(a)
            rings = []
            for k in range(7):
                ph = math.pi * k / 6
                rad = rr + 0.004 + r_add * math.sin(ph)
                zz = -w / 2 + w * k / 6
                rings.append([b.verts.new(cpt + ax * zz + (a * math.cos(TAU * j / 16) + c2 * math.sin(TAU * j / 16)) * rad)
                              for j in range(16)])
            for r0, r1 in zip(rings, rings[1:]):
                for j in range(16):
                    b.faces.new((r0[j], r0[(j + 1) % 16], r1[(j + 1) % 16], r1[j]))
        o = C.new_obj(name, b)
        C.set_attr(o, "trim", lambda i, co: 0.0)
        C.smooth(o)
        return o

    def bell_sleeves(self, name, r0=0.012, r1=0.055, s_end=0.93, thick=0.004, drop=0.05):
        """Wide sleeves: a loft from the shoulder to the wrist whose mouth opens and hangs below the arm."""
        objs = []
        for sx in ("L", "R"):
            S, E, W = (self.bones[f"upperarm_{sx}"][0], self.bones[f"forearm_{sx}"][0], self.bones[f"hand_{sx}"][0])
            path = [S.lerp(E, t / 6) for t in range(1, 6)] + [E.lerp(W, s_end * t / 7) for t in range(8)]
            n = 20
            rings = []
            for i, p in enumerate(path):
                t = i / (len(path) - 1)
                d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
                near = [(q - p) for j, q in enumerate(self.co) if self.dom[j] in ARMS and (q.x > 0) == (sx == "L")
                        and abs((q - p).dot(d)) < 0.02]
                rr = max(((x - d * x.dot(d)).length for x in near), default=0.05)
                rad = rr + r0 + (r1 - r0) * t ** 1.6
                a = V((1 if sx == "L" else -1, 0, 0))
                a = (a - d * a.dot(d)).normalized()
                c2 = d.cross(a)
                ring = []
                for j in range(n):
                    ang = TAU * j / n
                    q = p + (a * math.cos(ang) + c2 * math.sin(ang)) * rad
                    q.z -= drop * t ** 2 * (0.5 - 0.5 * (q.z - p.z) / rad)      # the mouth hangs below the wrist
                    ring.append(q)
                rings.append(ring)
            o = C.loft(f"{name}_{sx}", rings)
            C.set_attr(o, "trim", lambda i, co, n=n, m=len(path): 1.0 if i >= n * (m - 2) else 0.0)
            _solid(o, thick, 1.0)
            C.smooth(o)
            objs.append(o)
        return objs

    def trousers(self, name, cut="ankle", ease=0.012, relax=8, thick=0.004, taper=0.74, width=1.06):
        """Trousers: a shell over the hips whose legs are widened to straight tubes (not leggings)."""
        L, dom, co = self.L, self.dom, self.co
        cz = {"ankle": L.ankle + 0.035, "cropped": L.ankle + 0.42 * (L.knee - L.ankle), "knee": L.knee - 0.05,
              "boot": L.ankle + 0.44 * (L.knee - L.ankle) - 0.03}[cut]
        top = L.waist + 0.015

        def keep(i, _):
            p, d = co[i], dom[i]
            return (d in LEGS or d in ("pelvis", "spine")) and cz < p.z < top

        def edges(v):
            p = v.co
            if abs(p.z - cz) < 0.03:
                p.z = cz
            elif abs(p.z - top) < 0.03:
                p.z = top
        o = C.shell_from_body(self.bm, name, keep, ease, 0.0, edges=edges, edge_relax=3, relax=((lambda p: True), relax),
                              trim=lambda p, n: 1.0 if p.z < cz + 0.02 else 0.0)
        for sx, side in (("L", 1), ("R", -1)):
            H, A = self.bones[f"thigh_{sx}"][0], self.bones[f"foot_{sx}"][0]
            ax = (A - H).normalized()
            zt = L.crotch - 0.05
            ring = [co[i] for i in range(len(co)) if dom[i] == f"thigh_{sx}" and abs(co[i].z - zt) < 0.02]
            r_top = max(((p - H) - ax * (p - H).dot(ax)).length for p in ring) * width + ease if ring else 0.10
            for v in o.data.vertices:
                p = v.co
                if p.x * side <= 0 or p.z > L.crotch:
                    continue
                t = (p - H).dot(ax)
                c = H + ax * t
                r = p - c
                u = sm01(L.crotch - 0.05, cz, p.z)
                want = r_top * (1 - (1 - taper) * u) * sm01(L.crotch, L.crotch - (0.10 if width < 1.1 else 0.22), p.z)
                if width >= 1.1 and p.z < cz + 0.10 and r.length > 1e-6:
                    # gathered into the boot: the full leg closes down onto the shin, just inside the boot shaft (the
                    # hem sits 3 cm inside the boot; it used to stay full width and poke through it as a flat disc)
                    g = sm01(cz + 0.10, cz + 0.015, p.z)
                    want = want * (1 - g) + max(r.length - 0.009, 0.01) * g
                    q = c + r * (want / r.length)
                    if q.x * side < 0.004:
                        q.x = 0.004 * side
                    v.co = q
                    continue
                if 1e-6 < r.length < want:
                    q = c + r * (want / r.length)
                    if q.x * side < 0.004:
                        q.x = 0.004 * side
                    v.co = q
        o.data.update()
        _solid(o, thick, 1.0, even=False)
        C.smooth(o, 50)
        return o

    # ------------------------------------------------------------ tubes

    def tube(self, name, z_top, z_hem, ease=0.012, flare=0.0, bones=TORSO + ("thigh_L", "thigh_R"), n=48, spans=None,
             folds=0.0, nfold=9, thick=0.005, trim_rows=1, flare_from=None, top_in=0.0, over=(), step=0.025,
             hem_wave=0.0, edge_trim=False):
        """A loft of rings from z_top down to z_hem. Above flare_from the rings follow the body section (its
        support function plus ease); below it they keep that shape and flare outward by `flare` at the hem.
        spans: [(centre_deg, half_width_deg)] keeps only those panels (aprons, tabards, stoles)."""
        L = self.L
        flare_from = L.crotch + 0.02 if flare_from is None else flare_from
        flare_from = min(flare_from, z_top - 0.01)
        rows = max(4, int(round((z_top - z_hem) / step)))
        zs = [z_top - (z_top - z_hem) * r / rows for r in range(rows + 1)]
        H = []
        last = None
        for z in zs:
            h = self.support(max(z, flare_from), bones, n) or last
            last = h
            H.append(list(h))
        # low-pass along the height (cloth tension), never inside the section
        for _ in range(2):
            S2 = [row[:] for row in H]
            for r in range(1, rows):
                for k in range(n):
                    S2[r][k] = max(H[r][k], (H[r - 1][k] + 2 * H[r][k] + H[r + 1][k]) / 4)
            H = S2
        ph = self.rnd.uniform(0, TAU)
        rings = []
        for r, z in enumerate(zs):
            f = 0.0 if z >= flare_from else (flare_from - z) / max(flare_from - z_hem, 1e-3)
            tin = top_in * (1 - min(1.0, r / 3))
            ring = []
            for k in range(n):
                th = -math.pi / 2 + TAU * k / n
                rad = H[r][k] + ease + flare * f ** 0.9 - tin
                if folds and f > 0:
                    rad += folds * math.sin(th * nfold + ph + z * 2.0) * f
                zz = z + (hem_wave * math.sin(th * nfold + ph) * f ** 2 if hem_wave else 0.0)
                ring.append(V((self.axis.x + rad * math.cos(th), self.axis.y + rad * math.sin(th), zz)))
            rings.append(ring)
        skip = None
        cols = None
        if spans:
            def inside(i):
                deg = 360.0 * (i + 0.5) / n
                return any(abs((deg - c + 180) % 360 - 180) <= hw for c, hw in spans)
            cols = [inside(i) for i in range(n)]
            skip = lambda r, i: not cols[i]
        o = C.loft(name, rings, faces_skip=skip)
        if spans:
            IH.delete_verts(o, lambda i, co: not (cols[i % n] or cols[(i - 1) % n]))
        self.clear(o, 0.004, over)
        nv = len(o.data.vertices)
        zcut = zs[-1 - trim_rows] + 1e-4 if trim_rows else -1e9
        if edge_trim and spans:
            bmx = bmesh.new()
            bmx.from_mesh(o.data)
            bnd = {v.index for v in bmx.verts if v.is_boundary}
            bmx.free()
            C.set_attr(o, "trim", lambda i, co: 1.0 if i in bnd else 0.0)
        else:
            C.set_attr(o, "trim", lambda i, co: 1.0 if co.z <= zcut + hem_wave else 0.0)
        _solid(o, thick, 1.0)
        C.smooth(o)
        return o

    def cape(self, name, z_hem, ease=0.02, open_deg=18, flare=0.03, thick=0.006, z_top=None, n=56, folds=0.008,
             over=()):
        """Capelet or shawl over the shoulders and upper arms, open at the front."""
        L = self.L
        z_top = L.neck + 0.015 if z_top is None else z_top
        bones = ("chest", "spine", "shoulder_L", "shoulder_R", "upperarm_L", "upperarm_R", "neck")
        rows = max(5, int(round((z_top - z_hem) / 0.025)))
        zs = [z_top - (z_top - z_hem) * r / rows for r in range(rows + 1)]
        H, last = [], None
        for z in zs:
            h = self.support(z, bones, n) or last
            last = h
            H.append(list(h))
        for r in range(1, rows + 1):              # a cape only widens downwards
            for k in range(n):
                H[r][k] = max(H[r][k], H[r - 1][k])
        neck = self.support(L.neck + 0.01, ("neck",), n) or H[0]
        ph = self.rnd.uniform(0, TAU)
        rings = []
        for r, z in enumerate(zs):
            t = r / rows
            ring = []
            gap = math.radians(open_deg * (0.6 + 0.8 * t))
            for i in range(n):
                th = -math.pi / 2 + gap + (TAU - 2 * gap) * i / (n - 1)
                k = (th + math.pi / 2) / TAU * n
                k0 = int(math.floor(k)) % n
                fr = k - math.floor(k)
                hh = H[r][k0] * (1 - fr) + H[r][(k0 + 1) % n] * fr
                nn = neck[k0] * (1 - fr) + neck[(k0 + 1) % n] * fr
                rad = (nn + 0.012) + (hh + ease + flare * t - nn - 0.012) * math.sin(min(1.0, t * 2.2) * math.pi / 2)
                rad += folds * math.sin(th * 8 + ph) * t
                zz = z - 0.02 * (0.5 + 0.5 * math.sin(th * 5 + ph)) * t ** 2
                ring.append(V((self.axis.x + rad * math.cos(th), self.axis.y + rad * math.sin(th), zz)))
            rings.append(ring)
        o = C.loft(name, rings, closed_u=False)
        self.clear(o, 0.005, over)
        C.set_attr(o, "trim", lambda i, co: 1.0 if i >= n * rows or (i % n) in (0, n - 1) else 0.0)
        _solid(o, thick, 1.0)
        C.smooth(o)
        return o

    # ------------------------------------------------------------ bands

    def band(self, name, z_of, width=0.04, ease=0.012, bones=TORSO, n=48, thick=0.006, over=(), tilt_w=None,
             round_=0.0, over_gap=0.003):
        """A ring round the body whose height follows z_of(theta) (theta = 0 at the front, radians)."""
        cache = {}

        def rad(z, k):
            key = round(z / 0.01)
            if key not in cache:
                cache[key] = self.support(key * 0.01, bones, n)
            h = cache[key]
            return h[k] if h else 0.12
        rings = []
        for row in range(4):
            w = -width / 2 + width * row / 3
            bulge = round_ * math.sin(math.pi * row / 3)
            ring = []
            for k in range(n):
                th = -math.pi / 2 + TAU * k / n
                z = z_of(TAU * k / n) - w
                r = rad(z, k) + ease + bulge
                ring.append(V((self.axis.x + r * math.cos(th), self.axis.y + r * math.sin(th), z)))
            rings.append(ring)
        o = C.loft(name, rings)
        self.clear(o, 0.004, over, over_gap)
        C.set_attr(o, "trim", lambda i, co: 0.0)
        _solid(o, thick, 1.0)
        C.smooth(o)
        return o

    # ------------------------------------------------------------ feet, head

    def shoes(self, kind):
        """Footwear lofted round each foot: a sole outline, an upper that follows the foot and, for boots, a
        shaft up the shin. No toes, a clean sole edge (trim)."""
        L = self.L
        h = {"boots": L.ankle + 0.44 * (L.knee - L.ankle), "boots_tall": L.knee - 0.07, "slippers": L.ankle - 0.012, "clogs": L.ankle - 0.008,
             "sandals": 0.014, "wraps": L.ankle + 0.03}[kind]
        ease = {"clogs": 0.010, "boots_tall": 0.008, "boots": 0.007}.get(kind, 0.005)
        n = 28
        outs = []
        for sx in ("L", "R"):
            b = bmesh.new()
            bones = (f"foot_{sx}", f"toe_{sx}", f"shin_{sx}")
            A = self.bones[f"foot_{sx}"][0]
            # only this leg's side: near the knees the other shin falls inside the slice and stretched the boot's
            # top ring toward it (a flat disc at every boot top)
            side = 1.0 if A.x > 0 else -1.0
            pts_all = [self.co[i] for i in range(len(self.co)) if self.dom[i] in bones and self.co[i].z < h + 0.03
                       and self.co[i].x * side > 0.004]

            def sup(z0, z1):
                pts = [(p.x - A.x, p.y - A.y) for p in pts_all if z0 <= p.z <= z1]
                if len(pts) < 5:
                    return None
                return [max(x * math.cos(-math.pi / 2 + TAU * k / n) + y * math.sin(-math.pi / 2 + TAU * k / n) for x, y in pts)
                        for k in range(n)]
            sole = sup(-1, 0.035)
            zs = [h - (h - 0.03) * r / max(1, int((h - 0.03) / 0.018)) for r in range(max(1, int((h - 0.03) / 0.018)) + 1)] if h > 0.03 else []
            # a slice with too few body points used to fall back to the previous ring, which for the top ring was the
            # sole outline: a foot-sized flat disc at every boot top. Widen the slice first, then take the nearest
            # valid ring by height.
            sec = {}
            for z in zs:
                for wdt in (0.012, 0.022, 0.035):
                    hh = sup(z - wdt, z + wdt)
                    if hh:
                        sec[z] = hh
                        break
            rows = []
            for z in zs:
                hh = sec.get(z) or (sec[min(sec, key=lambda zz: abs(zz - z))] if sec else sole)
                cuff = 0.007 if (kind.startswith("boots") and z > h - 0.045) else 0.0   # a turned-down cuff
                rows.append((z, [x + ease + cuff for x in hh]))
            # smooth the rings round and up the shaft: the per-slice support of the sparse body points was jagged
            for _ in range(2):
                rows = [(z, [0.25 * rr[k - 1] + 0.5 * rr[k] + 0.25 * rr[(k + 1) % n] for k in range(n)]) for z, rr in rows]
            if len(rows) > 2:
                rows = [rows[0]] + [(rows[i][0], [0.25 * a + 0.5 * b + 0.25 * c for a, b, c in zip(rows[i - 1][1], rows[i][1], rows[i + 1][1])])
                                    for i in range(1, len(rows) - 1)] + [rows[-1]]
            if os.environ.get("TF_SHOE_DEBUG"):
                print("SHOE", sx, kind, "A", tuple(round(c, 3) for c in A), "x", round(min(p.x for p in pts_all), 3), round(max(p.x for p in pts_all), 3), "y", round(min(p.y for p in pts_all), 3), round(max(p.y for p in pts_all), 3), "h", round(h, 3), [(round(z, 3), round(max(rr), 3), round(min(rr), 3)) for z, rr in rows[:6]], "npts", len(pts_all))
            lip = 0.006 if kind != "sandals" else 0.004
            rows.append((0.016, [x + ease + lip for x in sole]))
            rows.append((0.0, [x + ease + lip for x in sole]))
            if kind == "sandals":
                rows = rows[-2:]
            rings = [[b.verts.new(V((A.x + rr[k] * math.cos(-math.pi / 2 + TAU * k / n), A.y + rr[k] * math.sin(-math.pi / 2 + TAU * k / n), z)))
                      for k in range(n)] for z, rr in rows]
            for r0, r1 in zip(rings, rings[1:]):
                for k in range(n):
                    b.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
            b.faces.new(rings[-1])
            if kind == "sandals":
                b.faces.new(rings[0][::-1])
            b.normal_update()
            o = C.new_obj("shoes_" + sx, b)
            C.set_attr(o, "trim", lambda i, co: 1.0 if (co.z < 0.02 or (kind.startswith("boots") and co.z > h - 0.045)) else 0.0)
            C.smooth(o, 50)
            outs.append(o)
        return outs

    def straps(self, name, bands):
        """Sandal straps: thin shells over the feet in the given (y0, y1) bands relative to the ankle."""
        dom, co = self.dom, self.co
        Ay = self.bones["foot_L"][0].y
        return self.shell(name, lambda i, _: dom[i] in ("foot_L", "foot_R", "toe_L", "toe_R", "shin_L", "shin_R") and co[i].z > 0.012
                          and any(y0 < co[i].y - Ay < y1 for y0, y1 in bands) and co[i].z < self.L.ankle + 0.03, 0.003, 0.002)

    def leg_wraps(self, name, z0, z1, ease=0.006):
        dom, co = self.dom, self.co
        o = self.shell(name, lambda i, _: dom[i] in ("shin_L", "shin_R", "foot_L", "foot_R") and z0 < co[i].z < z1, ease, 0.003, relax=2)
        # wound bands: a diagonal ripple
        for v in o.data.vertices:
            n = v.normal
            v.co += V((n.x, n.y, 0)) * 0.0025 * math.sin(v.co.z * 180 + math.atan2(n.y, n.x) * 2)
        return o

    def head_shell(self, name, region, offset=0.008, thick=0.004, relax=3):
        idx = set(region)
        return self.shell(name, lambda i, _: i in idx, offset, thick, relax=relax)

    def hat(self, name, profile, line=None, pitch=0.0, roll=0.0, n=40, thick=0.004, crown_rows=0):
        """A lofted hat: profile = [(dr, dz)] rings from the brim edge inward and up, measured from the head
        section at the hat line (dr metres outside it, dz metres above it). The last ring closes the top."""
        L = self.L
        line = L.eye.z + 0.062 if line is None else line
        c, rx, ry = self.P.section(line, band=0.012, bones=HEAD)
        cen = V((c.x, c.y, line))
        rings = []
        for dr, dz in profile:
            rings.append([V((c.x + (rx + dr) * math.cos(TAU * i / n), c.y + (ry + dr) * math.sin(TAU * i / n), line + dz))
                          for i in range(n)])
        o = C.loft(name, rings)
        b = bmesh.new()                                  # close the crown
        b.from_mesh(o.data)
        b.verts.ensure_lookup_table()
        last = [b.verts[i] for i in range(len(b.verts) - n, len(b.verts))]
        cv = b.verts.new(sum((v.co for v in last), V()) / n + V((0, 0, 0.004)))
        for i in range(n):
            b.faces.new((last[i], last[(i + 1) % n], cv))
        b.normal_update()
        b.to_mesh(o.data)
        b.free()
        R = Matrix.Rotation(math.radians(pitch), 4, "X") @ Matrix.Rotation(math.radians(roll), 4, "Y")
        for v in o.data.vertices:
            v.co = cen + R @ (v.co - cen)
        C.set_attr(o, "trim", lambda i, co: 1.0 if crown_rows and n * crown_rows[0] <= i < n * crown_rows[1] else 0.0)
        _solid(o, thick, -1.0)
        C.smooth(o, 50)
        return o

    # ------------------------------------------------------------ the body under the costume

    def strip_covered(self, margin=0.30):
        """Delete body vertices that no one can see: a vertex goes when rays along its normal and four
        tilted directions all hit a garment. Skin near an opening (cuff, hem, neckline) keeps a ray free."""
        co_all, polys = [], []
        for o in self.garments.values():
            if o.get("mat") in ("hair",) or o.get("nocover"):
                continue
            base = len(co_all)
            co_all.extend(o.matrix_world @ v.co for v in o.data.vertices)
            polys.extend([base + i for i in f.vertices] for f in o.data.polygons)
        if not polys:
            return 0
        tree = BVHTree.FromPolygons(co_all, polys)
        hco, hpolys = [], []                             # the scalp under a hat, a scarf or the hair cap
        for o in self.garments.values():
            if o.get("rule") == "head" and not o.name.startswith(("hair_shape", "hat_pin", "hat_knot", "hat_visor")):
                base = len(hco)
                hco.extend(o.matrix_world @ v.co for v in o.data.vertices)
                hpolys.extend([base + i for i in f.vertices] for f in o.data.polygons)
        htree = BVHTree.FromPolygons(hco, hpolys) if hpolys else None
        keepers = IH.HAND_BONES | {"neck"}
        me = self.bm.data
        kill = set()
        for i, v in enumerate(me.vertices):
            if self.dom[i] in keepers or self.dom[i] in ("jaw", "eye_L", "eye_R"):
                continue
            p, n = self.co[i], v.normal
            a = n.orthogonal().normalized()
            b2 = n.cross(a)
            dirs = [n] + [(n * 0.64 + (a * math.cos(q) + b2 * math.sin(q)) * 0.77).normalized()
                          for q in (0.3, 0.3 + TAU / 4, 0.3 + TAU / 2, 0.3 + 3 * TAU / 4)]
            if self.dom[i] in HEAD:
                if htree and p.z > self.L.eye.z + 0.035 and all(htree.ray_cast(p + n * 0.0005, d, 0.035)[0] is not None for d in dirs):
                    kill.add(i)
                continue
            if all(tree.ray_cast(p + n * 0.0015, d, margin)[0] is not None for d in dirs):
                kill.add(i)
        IH.delete_verts(self.bm, lambda i, co: i in kill)
        return len(kill)


def strip_layers(ctx, keep_above_hem=0.12):
    """Remove the parts of a garment that a later (outer) garment covers: trousers under a skirt, a shirt under
    a vest, a skirt under an apron. Two layers that are both kept always fight after the reduction (patches of
    the inner one poke through), so only the outer one stays, with a margin kept round every opening and above
    every hem. -> number of faces removed."""
    L = ctx.L
    names = list(ctx.garments)
    removed = 0
    for gi, name in enumerate(names):
        o = ctx.garments[name]
        if o.get("mat") in ("hair", "metal", "amber", "shell", "wood", "straw", "bread") or str(o.get("rule", "")).startswith("rigid") \
                or o.get("rule") == "head" or len(o.data.polygons) < 60:
            continue
        outer = [ctx.garments[n] for n in names[gi + 1:]]
        outer = [q for q in outer if len(q.data.polygons) >= 60 and q.get("mat", "cloth") in ("cloth", "leather")
                 and not q.name.startswith(("shoes", "socks", "bracers", "pauldron"))
                 and not str(q.get("rule", "")).startswith("rigid") and q.get("rule") != "head"]
        if not outer:
            continue
        co, polys, owner = [], [], []
        for q in outer:
            base = len(co)
            co.extend(q.matrix_world @ v.co for v in q.data.vertices)
            hem = min(v.co.z for v in q.data.vertices)
            for f in q.data.polygons:
                polys.append([base + i for i in f.vertices])
                owner.append(hem)
        tree = BVHTree.FromPolygons(co, polys)
        legwear = name in ("trousers", "underskirt", "socks") or name.endswith("_skirt")
        me = o.data
        covered = set()
        for v in me.vertices:
            p, n = v.co, v.normal
            reach = 0.30 if legwear and p.z < L.waist else 0.06
            a = n.orthogonal().normalized()
            b2 = n.cross(a)
            dirs = [n] + [(n * 0.8 + (a * math.cos(q) + b2 * math.sin(q)) * 0.6).normalized()
                          for q in (0.3, 0.3 + TAU / 4, 0.3 + TAU / 2, 0.3 + 3 * TAU / 4)]
            ok = True
            for d in dirs:
                h = tree.ray_cast(p + n * 0.001, d, reach)
                if h[0] is None or p.z < owner[h[2]] + keep_above_hem:
                    ok = False
                    break
            if ok:
                covered.add(v.index)
        for _ in range(2):                           # keep a margin of the inner layer round every opening
            keep = set()
            for e in me.edges:
                a_, b_ = e.vertices
                if (a_ in covered) != (b_ in covered):
                    keep.add(a_)
                    keep.add(b_)
            covered -= keep
        if not covered:
            continue
        bmx = bmesh.new()
        bmx.from_mesh(me)
        dead = [f for f in bmx.faces if all(v.index in covered for v in f.verts)]
        removed += len(dead)
        bmesh.ops.delete(bmx, geom=dead, context="FACES")
        bmesh.ops.delete(bmx, geom=[v for v in bmx.verts if not v.link_faces], context="VERTS")
        bmx.to_mesh(me)
        bmx.free()
        me.update()
    return removed


# ===================================================================== small solid props (bmesh helpers)

def tube_path(b, path, radii, n=10, cap=True):
    """A tube along a polyline (parallel-transported frame); radii per point."""
    rings = []
    a = None
    for i, p in enumerate(path):
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        a = d.orthogonal().normalized() if a is None else (a - d * a.dot(d)).normalized()
        c2 = d.cross(a)
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        rings.append([b.verts.new(p + (a * math.cos(TAU * j / n) + c2 * math.sin(TAU * j / n)) * r) for j in range(n)])
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(n):
            b.faces.new((r0[j], r0[(j + 1) % n], r1[(j + 1) % n], r1[j]))
    if cap:
        for ring, flip in ((rings[0], True), (rings[-1], False)):
            try:
                b.faces.new(ring[::-1] if flip else ring)
            except ValueError:
                pass
    return rings


def ball(b, c, r, sx=1.0, sy=1.0, sz=1.0, u=12, v=8):
    geom = bmesh.ops.create_uvsphere(b, u_segments=u, v_segments=v, radius=r)
    for vert in geom["verts"]:
        vert.co = V((vert.co.x * sx, vert.co.y * sy, vert.co.z * sz)) + c
    return geom["verts"]


def torus(b, c, R, r, axis=V((0, 1, 0)), n=24, m=8, arc=TAU):
    axis = axis.normalized()
    a = axis.orthogonal().normalized()
    c2 = axis.cross(a)
    path = [c + (a * math.cos(arc * i / n) + c2 * math.sin(arc * i / n)) * R for i in range(n + (0 if arc >= TAU - 1e-6 else 1))]
    rings = []
    for i, p in enumerate(path):
        rad = (p - c).normalized()
        rings.append([b.verts.new(p + (rad * math.cos(TAU * j / m) + axis * math.sin(TAU * j / m)) * r) for j in range(m)])
    cnt = len(rings)
    for i in range(cnt if arc >= TAU - 1e-6 else cnt - 1):
        r0, r1 = rings[i], rings[(i + 1) % cnt]
        for j in range(m):
            b.faces.new((r0[j], r0[(j + 1) % m], r1[(j + 1) % m], r1[j]))


def box(b, c, sx, sy, sz, rot=None):
    geom = bmesh.ops.create_cube(b, size=1.0)
    for vert in geom["verts"]:
        p = V((vert.co.x * sx, vert.co.y * sy, vert.co.z * sz))
        vert.co = (rot @ p if rot else p) + c


def obj(name, b, smooth=True, angle=40):
    b.normal_update()
    o = C.new_obj(name, b)
    C.set_attr(o, "trim", lambda i, co: 0.0)
    if smooth:
        C.smooth(o, angle)
    return o
