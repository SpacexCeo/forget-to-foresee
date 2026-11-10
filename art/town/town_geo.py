"""Geometry builder for the town (Blender 4.5): polygon soups per (piece, material) in GAME space
(Y up, +Z south), converted to Blender (x, -z, y) when the meshes are made.

Every primitive goes through a transform stack (`with tb.at(...)`), gets world-aligned UVs in metres
(continuous tiling across neighbouring faces) and a linear vertex colour that multiplies the tiling
base colour. Collision shapes are collected per piece as simple boxes, quads and prisms.
"""

import contextlib
import math

import bmesh
from mathutils import Matrix, Vector

import ftf
from ftf import Geo

WHITE = (1.0, 1.0, 1.0)


def bl(p):
    """Game space -> Blender space."""
    return (p[0], -p[2], p[1])


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def RY(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Y")


def RX(deg):
    return Matrix.Rotation(math.radians(deg), 4, "X")


def RZ(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


class TownBuilder:
    def __init__(self):
        self.geos = {}       # (piece, material) -> Geo
        self.cols = {}       # piece -> bmesh (Blender space)
        self.sockets = {}    # piece -> [(name, game position, rot_y_deg, props)]
        self.stack = [Matrix.Identity(4)]
        self.piece = None
        self.node = None     # current separate node (see `swing`); None = merged into the piece by material
        self.nodes = {}      # (piece, node) -> dict(pivot=game position, props)
        self.lights = {}     # piece -> [dict(pos, color, power, radius)]: bake-only lights of the interiors

    # ------------------------------------------------------------ transforms
    @property
    def M(self):
        return self.stack[-1]

    @contextlib.contextmanager
    def at(self, *mats):
        m = self.M
        for mm in mats:
            m = m @ mm
        self.stack.append(m)
        try:
            yield
        finally:
            self.stack.pop()

    def w(self, p):
        return self.M @ Vector(p)

    def geo(self, mat):
        key = (self.piece, mat, self.node)
        if key not in self.geos:
            self.geos[key] = Geo()
        return self.geos[key]

    @contextlib.contextmanager
    def swing(self, name, pivot, **props):
        """Everything built inside becomes its own node `swing_<name>` with its origin at `pivot` (a local
        point: the hook it hangs from), instead of being merged into the piece. The client swings it as a
        rigid body. props: hinge=(x, y, z) a local direction (the bar the thing hangs on; without it the
        thing swings freely like a lantern on a hook), length (m, hook to the centre of mass)."""
        if self.node is not None:
            raise RuntimeError("nested swing nodes")
        full = "swing_" + name
        if (self.piece, full) in self.nodes:
            raise RuntimeError("duplicate swing node " + full)
        hinge = props.pop("hinge", None)
        if hinge is not None:
            hv = (self.M.to_3x3() @ Vector(hinge)).normalized()
            props["hinge"] = [round(hv.x, 4), round(hv.y, 4), round(hv.z, 4)]   # game space, Y up
        self.nodes[(self.piece, full)] = {"pivot": tuple(self.w(pivot)), "props": props}
        self.node = full
        try:
            yield
        finally:
            self.node = None

    def light(self, pos, color, power, radius=0.08):
        """A bake-only light of an interior (never exported): local position, linear colour, watts."""
        self.lights.setdefault(self.piece, []).append({"pos": tuple(self.w(pos)), "color": tuple(color), "power": float(power), "radius": float(radius)})

    # ------------------------------------------------------------ faces
    def poly(self, mat, pts, col=WHITE, uv=None, uv_off=(0.0, 0.0), uv_dir=None):
        """A convex polygon, counter-clockwise seen from its front, points in local space.
        uv: None -> world-aligned (u horizontal, v up; top faces use x / z). uv_dir: a local direction
        the U axis follows where it lies in the face (wood grain along a beam, tile rows along a ridge)."""
        ws = [self.w(p) for p in pts]
        if uv is None:
            n = (ws[1] - ws[0]).cross(ws[2] - ws[0])
            if n.length < 1e-12:
                return
            n.normalize()
            if abs(n.y) > 0.85:
                ua, va = Vector((1, 0, 0)), Vector((0, 0, -1))
            else:
                ua = Vector((0, 1, 0)).cross(n)
                ua.normalize()
                va = n.cross(ua)
            if uv_dir is not None:
                g = self.M.to_3x3() @ Vector(uv_dir)
                g = g - n * g.dot(n)
                if g.length > 0.3:
                    ua = g.normalized()
                    va = n.cross(ua)
            uv = [(p.dot(ua) + uv_off[0], p.dot(va) + uv_off[1]) for p in ws]
        cols = col if isinstance(col[0], (tuple, list)) else [col] * len(ws)
        self.geo(mat).poly([bl(p) for p in ws], uv, cols)

    def quad(self, mat, a, b, c, d, col=WHITE, **kw):
        self.poly(mat, [a, b, c, d], col, **kw)

    def box(self, mat, c, s, col=WHITE, skip="", mats=None, uv_dir=None):
        """Axis-aligned box in local space: centre c, full size s. `skip` lists faces to leave out
        from "xXyYzZ" (lower case = negative side). `mats` overrides the material per face letter."""
        cx, cy, cz = c
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        x0, x1, y0, y1, z0, z1 = cx - hx, cx + hx, cy - hy, cy + hy, cz - hz, cz + hz
        faces = {
            "X": [(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)],
            "x": [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)],
            "Y": [(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)],
            "y": [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
            "Z": [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
            "z": [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)],
        }
        for k, pts in faces.items():
            if k in skip:
                continue
            self.poly((mats or {}).get(k, mat), pts, col, uv_dir=uv_dir)

    def beam(self, mat, a, b, w, h, col=WHITE, up=(0, 1, 0), skip=""):
        """A box from a to b (local points), cross-section w (sideways) x h (along `up`)."""
        a, b = Vector(a), Vector(b)
        d = b - a
        ln = d.length
        if ln < 1e-6:
            return
        zax = d / ln
        upv = Vector(up)
        xax = upv.cross(zax)
        if xax.length < 1e-6:
            xax = Vector((1, 0, 0)).cross(zax)
        xax.normalize()
        yax = zax.cross(xax)
        m = Matrix((
            (xax.x, yax.x, zax.x, a.x),
            (xax.y, yax.y, zax.y, a.y),
            (xax.z, yax.z, zax.z, a.z),
            (0, 0, 0, 1)))
        with self.at(m):
            self.box(mat, (0, 0, ln / 2), (w, h, ln), col, skip=skip, uv_dir=(0, 0, 1))

    def cyl(self, mat, base, r0, r1, h, n=12, col=WHITE, cap_top=True, cap_bot=False, top_mat=None, phase=0.0, col_top=None):
        """Frustum on the local Y axis from base (centre of the bottom) with radii r0 (bottom), r1 (top)."""
        bx, by, bz = base
        ring0, ring1 = [], []
        for i in range(n):
            a = phase + math.tau * i / n
            ring0.append((bx + math.cos(a) * r0, by, bz - math.sin(a) * r0))
            ring1.append((bx + math.cos(a) * r1, by + h, bz - math.sin(a) * r1))
        per = math.tau * max(r0, r1) / n
        g = self.geo(mat)
        ctop = col_top or col
        for i in range(n):
            j = (i + 1) % n
            pts = [ring0[i], ring0[j], ring1[j], ring1[i]]
            if r1 < 1e-5:
                pts = pts[:3]
            ws = [self.w(p) for p in pts]
            uv = [(i * per, 0.0), ((i + 1) * per, 0.0), ((i + 1) * per, h), (i * per, h)][:len(pts)]
            g.poly([bl(p) for p in ws], uv, [col, col, ctop, ctop][:len(pts)])
        if cap_top and r1 > 1e-5:
            self.poly(top_mat or mat, ring1, ctop)
        if cap_bot:
            self.poly(mat, list(reversed(ring0)), col)

    def ring(self, mat, center, r_out, r_in, thick, n=24, col=WHITE, axis="z"):
        """A flat-faced ring (annulus with thickness) around `center`; axis 'z' stands upright facing +Z,
        axis 'y' lies flat."""
        cx, cy, cz = center
        def pt(a, r, t):
            if axis == "z":
                return (cx + math.cos(a) * r, cy + math.sin(a) * r, cz + t)
            return (cx + math.cos(a) * r, cy + t, cz - math.sin(a) * r)
        h = thick / 2
        for i in range(n):
            a0, a1 = math.tau * i / n, math.tau * (i + 1) / n
            self.quad(mat, pt(a0, r_in, h), pt(a0, r_out, h), pt(a1, r_out, h), pt(a1, r_in, h), col)        # front
            self.quad(mat, pt(a1, r_in, -h), pt(a1, r_out, -h), pt(a0, r_out, -h), pt(a0, r_in, -h), col)   # back
            self.quad(mat, pt(a0, r_out, h), pt(a0, r_out, -h), pt(a1, r_out, -h), pt(a1, r_out, h), col)   # outer
            self.quad(mat, pt(a0, r_in, -h), pt(a0, r_in, h), pt(a1, r_in, h), pt(a1, r_in, -h), col)       # inner

    def lathe(self, mat, base, profile, n=12, col=WHITE, cap_top=False, cap_bot=False, cols=None):
        """A surface of revolution on the local Y axis: profile = [(radius, height above base), ...] bottom
        to top. cols: one colour per profile point (else `col`)."""
        bx, by, bz = base
        g = self.geo(mat)
        rings = [[(bx + math.cos(math.tau * i / n) * r, by + y, bz - math.sin(math.tau * i / n) * r) for i in range(n)] for r, y in profile]
        v = 0.0
        for k in range(len(profile) - 1):
            (r0, y0), (r1, y1) = profile[k], profile[k + 1]
            seg = math.hypot(r1 - r0, y1 - y0)
            per = math.tau * max(r0, r1, 0.01) / n
            c0, c1 = (cols[k], cols[k + 1]) if cols else (col, col)
            for i in range(n):
                j = (i + 1) % n
                pts, uv, cc = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], [(i * per, v), ((i + 1) * per, v), ((i + 1) * per, v + seg), (i * per, v + seg)], [c0, c0, c1, c1]
                if r1 < 1e-5:
                    pts, uv, cc = pts[:3], uv[:3], cc[:3]
                elif r0 < 1e-5:
                    pts, uv, cc = [pts[0], pts[2], pts[3]], [uv[0], uv[2], uv[3]], [cc[0], cc[2], cc[3]]
                g.poly([bl(self.w(q)) for q in pts], uv, cc)
            v += seg
        if cap_top and profile[-1][0] > 1e-5:
            self.poly(mat, rings[-1], cols[-1] if cols else col)
        if cap_bot and profile[0][0] > 1e-5:
            self.poly(mat, list(reversed(rings[0])), cols[0] if cols else col)

    def disc(self, mat, center, r, n=16, col=WHITE, axis="y"):
        """A flat disc facing +Y (axis 'y') or +Z (axis 'z')."""
        cx, cy, cz = center
        if axis == "y":
            self.poly(mat, [(cx + math.cos(math.tau * i / n) * r, cy, cz - math.sin(math.tau * i / n) * r) for i in range(n)], col)
        else:
            self.poly(mat, [(cx + math.cos(math.tau * i / n) * r, cy + math.sin(math.tau * i / n) * r, cz) for i in range(n)], col)

    def blob(self, mat, center, r, col=WHITE, seed=0, squash=0.8, sub=2, col_var=0.18):
        """A lumpy icosphere (tree crowns, bushes): vertex colour darker below, jittered per vertex."""
        import random
        rr = random.Random(seed)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        jit = {}
        for v in bm.verts:
            k = 1.0 + rr.uniform(-0.16, 0.16)
            jit[v.index] = rr.uniform(-col_var, col_var)
            v.co = Vector((v.co.x * k, v.co.y * k, v.co.z * k))
        g = self.geo(mat)
        for f in bm.faces:
            pts, cols, uvs = [], [], []
            for v in f.verts:
                # bmesh sphere is Z up: map to game Y up
                p = (center[0] + v.co.x * r, center[1] + v.co.z * r * squash, center[2] - v.co.y * r)
                shade = 0.62 + 0.38 * (v.co.z * 0.5 + 0.5) + jit[v.index]
                pts.append(bl(self.w(p)))
                cols.append((col[0] * shade, col[1] * shade, col[2] * shade))
                uvs.append((math.atan2(v.co.y, v.co.x) * r, v.co.z * r))
            g.poly(pts, uvs, cols)
        bm.free()

    def tube(self, mat, pts, radii, n=8, col=WHITE, cap_end=True):
        """A smooth tube through local points with a radius per point (0 closes it to a tip)."""
        P = [Vector(p) for p in pts]
        rings = []
        ref = Vector((0, 0, 1))
        for i, p in enumerate(P):
            d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            x = ref.cross(d)
            if x.length < 1e-4:
                x = Vector((1, 0, 0)).cross(d)
            x.normalize()
            y = d.cross(x)
            rings.append([p + (x * math.cos(math.tau * k / n) + y * math.sin(math.tau * k / n)) * radii[i] for k in range(n)])
        g = self.geo(mat)
        ln = 0.0
        for i in range(len(P) - 1):
            seg = (P[i + 1] - P[i]).length
            for k in range(n):
                k2 = (k + 1) % n
                quad = [rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]]
                if radii[i + 1] < 1e-5:
                    quad = quad[:3]
                uv = [(k / n, ln), ((k + 1) / n, ln), ((k + 1) / n, ln + seg), (k / n, ln + seg)][:len(quad)]
                g.poly([bl(self.w(q)) for q in quad], uv, [col] * len(quad))
            ln += seg
        if cap_end and radii[0] > 1e-5:
            self.poly(mat, list(reversed(rings[0])), col)

    # ------------------------------------------------------------ collision
    def colbm(self):
        if self.piece not in self.cols:
            self.cols[self.piece] = bmesh.new()
        return self.cols[self.piece]

    def col_poly(self, pts):
        bm = self.colbm()
        vs = [bm.verts.new(bl(self.w(p))) for p in pts]
        bm.faces.new(vs)

    def col_box(self, c, s):
        cx, cy, cz = c
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        x0, x1, y0, y1, z0, z1 = cx - hx, cx + hx, cy - hy, cy + hy, cz - hz, cz + hz
        for pts in ([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)],
                    [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)],
                    [(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)],
                    [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
                    [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)]):
            self.col_poly(pts)

    def col_cyl(self, base, r, h, n=10):
        bx, by, bz = base
        r0 = [(bx + math.cos(math.tau * i / n) * r, by, bz - math.sin(math.tau * i / n) * r) for i in range(n)]
        r1 = [(p[0], by + h, p[2]) for p in r0]
        for i in range(n):
            j = (i + 1) % n
            self.col_poly([r0[i], r0[j], r1[j], r1[i]])
        self.col_poly(r1)

    def socket(self, name, pos, rot_y_deg=0.0, **props):
        self.sockets.setdefault(self.piece, []).append((name, tuple(self.w(pos)), rot_y_deg, props))


def tint(c, k):
    return (c[0] * k, c[1] * k, c[2] * k)
