"""Procedural source for shell_1.glb .. shell_4.glb (Forget to Foresee Shells), round 2.

Four levitating Shells, 17-18.6 m tall, one family of iridescent nacre ammonites
(owner concept 07.11; review round 1 in docs/art/review/shells.md; style addendum:
the Shells are the luminous sacred landmark of the skyline, glowing gold/nacre).

  I   elongated: a tall helical turret spire (6.5 whorls, apex up) whose last whorl
      uncoils into a short hook; the aperture sits at the bottom, tilted ~20 deg.
  II  massive: tightly involute, inflated whorls, heavy rounded ribs with tubercles.
  III asymmetric: sinistral, tilted, a convex trochospiral bulge on one side and a
      one-sided flared lip.
  IV  cracked open: the venter of the last whorl is broken away along rib lines,
      showing the wall thickness, three glowing septa of the chambers inside, and
      ten curved wall fragments drifting around the break (two still half-attached).

How it is built (this replaces the round-1 densify-and-displace master):
  * every Shell is a centre-line table (rib coordinate u -> frame, section size);
  * the surface is an analytic function of (u, s): rounded raised-cosine ribs that
    follow the grid rings, the rings warped into a forward S-curve across the flank;
  * the runtime mesh samples that function at rib key points (base, shoulder,
    crest, shoulder, base, trough), 20-24 sides (the hybrid faceted silhouette);
  * the master samples the same function ~50x denser (multi-million triangles) plus
    growth-line and weathering displacement, so the bake only carries real detail
    and no rays are missed (cage 3 cm, rays 8 cm);
  * faces buried inside the neighbouring whorl are culled on both meshes (no hidden
    geometry in the atlas, no black inner-whorl faces);
  * the living chamber has a real 0.32 m wall (outer surface, inner nacre surface,
    rim) that ends in a septum; IV's chambers and break use the same solid wall.

Materials (max 3 per mesh, one shared 4096 atlas): M_Shell_Exterior (single-sided),
M_Shell_Nacre (double-sided), M_Shell_Glow (emissive septa). KHR_materials_iridescence,
KHR_materials_clearcoat and KHR_materials_emissive_strength are patched into the glb
after export (the iridescence thickness reads the ORM green channel, so the film
follows the rib crests / grooves at no texture cost).

Nothing is taken from the film Arrival or from any game. Pivot: bottom centre (the
game lifts the Shell). Blender Z-up, glTF Y-up, metres.

    blender -b --factory-startup -P build_shells.py -- build 2
    blender -b --factory-startup -P build_shells.py -- render 2
    blender -b --factory-startup -P build_shells.py -- scene        # all four, game camera
"""

import json
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "art", "common"))
import ftf_pipeline as P  # noqa: E402
import blender_kit as BK  # noqa: E402  (glb read/write for the extension patch)

TEX_SIZE = 4096
BAKE_SIZE = 8192
RUNTIME_TRI_BUDGET = 30000
WALL = 0.32
TAU = 2 * math.pi

# Glow: warm gold-nacre (style addendum: the Shells glow gold/nacre on the skyline).
GLOW = (1.0, 0.80, 0.52)

SPECS = {
    1: dict(numeral="I", kind="helix", whorls=6.5, W=1.24, ribs=15, sides=20, p=0.84,
            a_end=1.0, t_ratio=1.12, rh=1.12, pitch=2.05, rib_amp=0.16, tub=0.10, bend=0.22,
            hook=dict(r1=1.25, straight=0.6, r3=1.35, up_deg=20.0, grow=1.12),
            target_h=18.0, yaw=0.0, living=0.25, septa_back=(0.23,)),
    2: dict(numeral="II", kind="coil", W=3.0, a_ratio=0.66, t_ratio=0.98, whorls=3.4, ribs=22,
            sides=24, p=0.80, rib_amp=0.15, tub=0.12, bend=0.30, target_h=17.5,
            theta_end=-math.pi / 2, yaw=-32.0, living=0.21, septa_back=(0.20,)),
    3: dict(numeral="III", kind="coil", W=2.6, a_ratio=0.58, t_ratio=0.72, whorls=3.4, ribs=22,
            sides=24, p=0.82, rib_amp=0.13, tub=0.0, bend=0.36, target_h=17.0,
            theta_end=-math.pi * 0.35, troch=0.62, oval=0.24, flare=0.80,
            tilt=(math.radians(24), 0.0, math.radians(38)), mirror=True, yaw=0.0,
            living=0.21, septa_back=(0.20,)),
    4: dict(numeral="IV", kind="coil", W=2.8, a_ratio=0.62, t_ratio=0.88, whorls=3.4, ribs=22,
            sides=24, p=0.80, rib_amp=0.14, tub=0.10, bend=0.30, target_h=17.5,
            theta_end=-math.pi / 2, yaw=-28.0, living=0.84, septa_back=(0.83, 0.74, 0.645, 0.55),
            broken=True, break_back=0.62, break_half=0.17),
}

RUNTIME_RINGS = (0.0, 0.33, 0.415, 0.5, 0.585, 0.67)   # per rib: trough, base, shoulder, crest...
RIB_HALF = 0.17                                         # rib half-width (fraction of spacing)
MASTER_RINGS_PER_RIB = 56
MASTER_SIDES_MULT = 16


def paths(n):
    asset = f"shell_{n}"
    return dict(
        asset=asset,
        qa=os.path.join(REPO, "docs", "art", "qa", asset),
        tex=os.path.join(HERE, "textures"),
        glb=os.path.join(REPO, "game", "public", "assets", "models", f"{asset}.glb"),
        blend=os.path.join(HERE, f"{asset}.blend"),
        stats=os.path.join(REPO, "docs", "art", "qa", asset, "build-stats.json"))


# ------------------------------------------------------------- centre line

class Table:
    """Centre line sampled densely in the rib coordinate u (linear interpolation)."""

    def __init__(self, u, c, e1, e2, tan, a, t, rs, flare, th, axis):
        self.u, self.c, self.e1, self.e2, self.tan = u, c, e1, e2, tan
        self.a, self.t, self.rs, self.flare, self.th = a, t, rs, flare, th
        self.axis = axis            # coil axis ('Y' planar coil, 'Z' helix)
        coil = ~np.isnan(th)
        self.coil_u, self.coil_th = u[coil], th[coil]

    def at(self, uq):
        uq = np.clip(uq, self.u[0], self.u[-1])
        out = {}
        for k in ("c", "e1", "e2", "tan"):
            arr = getattr(self, k)
            out[k] = np.stack([np.interp(uq, self.u, arr[:, i]) for i in range(3)], -1)
        for k in ("a", "t", "rs", "flare"):
            out[k] = np.interp(uq, self.u, getattr(self, k))
        return out

    def scale(self, sc):
        self.c = self.c * sc
        self.a = self.a * sc
        self.t = self.t * sc


def _norm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def coil_table(spec, n_per_rib=60):
    W, nr = spec["W"], spec["ribs"]
    k = math.log(W) / TAU
    t_end = spec["theta_end"]
    t_start = t_end - spec["whorls"] * TAU
    u = np.linspace(0.0, spec["whorls"] * nr, int(spec["whorls"] * nr * n_per_rib) + 1)
    th = t_start + u * TAU / nr
    g = np.exp(k * (th - t_end))
    ov = spec.get("oval", 0.0)
    oval = 1.0 + ov * np.cos(th - 0.6)
    R = g * oval
    e1 = np.stack([np.cos(th), np.zeros_like(th), np.sin(th)], -1)
    # Trochospiral (III): inner whorls rise along the axis on a convex dome profile.
    yoff = spec.get("troch", 0.0) * np.power(np.clip(1.0 - g, 0, 1), 0.55)
    c = R[:, None] * e1 + np.stack([np.zeros_like(th), yoff, np.zeros_like(th)], -1)
    a = spec["a_ratio"] * g * (1.0 + ov * 0.5 * np.cos(th - 0.6))
    # Peristome: the last 0.07 whorl swells into a lip.
    wfe = (t_end - th) / TAU
    lip = 1.0 + 0.12 * np.clip(1.0 - wfe / 0.07, 0, 1) ** 2
    a = a * lip
    t = spec["t_ratio"] * a
    rs = np.clip((2.9 - wfe) / 0.6, 0, 1)                      # ribs fade on the innermost whorls
    flare = np.zeros_like(th)
    if spec.get("flare"):
        flare = spec["flare"] * np.clip(1.0 - wfe / 0.19, 0, 1) ** 2
    tan = np.gradient(c, axis=0)
    tan = _norm(tan)
    e1 = _norm(e1 - (e1 * tan).sum(-1, keepdims=True) * tan)
    e2 = _norm(np.cross(tan, e1))
    if e2[len(e2) // 2, 1] < 0:
        e2 = -e2
    return Table(u, c, e1, e2, tan, a, t, rs, flare, th, "Y")


def helix_table(spec, n_per_rib=60):
    """Shell I: a helical turret (apex up) plus an uncoiled hook at the bottom."""
    nr, W = spec["ribs"], spec["W"]
    k = math.log(W) / TAU
    th_end = spec["whorls"] * TAU
    u = np.linspace(0.0, spec["whorls"] * nr, int(spec["whorls"] * nr * n_per_rib) + 1)
    th = u * TAU / nr
    g = np.exp(k * (th - th_end))
    a = spec["a_end"] * g
    Rh = spec["rh"] * a
    z = -(spec["pitch"] * spec["a_end"] / TAU) * (g / k)          # integral of the pitch
    c = np.stack([Rh * np.cos(th), Rh * np.sin(th), z], -1)
    tan = _norm(np.gradient(c, axis=0))
    e1 = np.stack([np.cos(th), np.sin(th), np.zeros_like(th)], -1)
    e1 = _norm(e1 - (e1 * tan).sum(-1, keepdims=True) * tan)
    e2 = _norm(np.cross(e1, tan))
    if e2[len(e2) // 2, 2] < 0:
        e2 = -e2
    wfe = (th_end - th) / TAU
    rs = np.clip((6.2 - wfe) / 0.8, 0, 1)
    t = spec["t_ratio"] * a
    # Hook: rotate the heading toward straight down, run straight, then turn out and up.
    hk = spec["hook"]
    a0 = a[-1]
    pos, T = Vector(c[-1]), Vector(tan[-1]).normalized()
    E1 = Vector(e1[-1]).normalized()
    out_dir = Vector((math.cos(th_end), math.sin(th_end), 0.0))
    D3 = (out_dir * math.cos(math.radians(hk["up_deg"])) +
          Vector((0, 0, 1)) * math.sin(math.radians(hk["up_deg"]))).normalized()
    rib_len = TAU * Rh[-1] / nr
    ds = rib_len / n_per_rib
    phases = [("turn", Vector((0, 0, -1)), hk["r1"] * a0), ("straight", None, hk["straight"] * a0),
              ("turn", D3, hk["r3"] * a0)]
    hu, hc, he1, ht, ha = [], [], [], [], []
    uu, total, length_est = u[-1], 0.0, 0.0
    for kind, D, val in phases:
        left = val
        while True:
            if kind == "turn":
                ang = T.angle(D) if T.dot(D) < 0.99999 else 0.0
                if ang < 1e-3:
                    break
                step = min(ds / val, ang)
                axis = T.cross(D)
                if axis.length < 1e-6:
                    axis = E1.cross(T)
                Rm = Matrix.Rotation(step, 3, axis.normalized())
                T = (Rm @ T).normalized()
                E1 = (Rm @ E1).normalized()
            else:
                if left <= 0:
                    break
                left -= ds
            pos = pos + T * ds
            total += ds
            uu += 1.0 / n_per_rib
            hu.append(uu); hc.append(tuple(pos)); he1.append(tuple(E1)); ht.append(tuple(T))
    hu = np.array(hu); hc = np.array(hc); he1 = np.array(he1); htan = np.array(ht)
    frac = np.linspace(0, 1, len(hu))
    ha = a0 * (1.0 + (hk["grow"] - 1.0) * frac)
    ha = ha * (1.0 + 0.12 * np.clip((frac - 0.9) / 0.1, 0, 1) ** 2)    # peristome
    he1 = _norm(he1 - (he1 * htan).sum(-1, keepdims=True) * htan)
    he2 = _norm(np.cross(he1, htan))
    # keep e2 continuous with the helix part
    if (he2[0] * e2[-1]).sum() < 0:
        he2 = -he2
    U = np.concatenate([u, hu]); C = np.concatenate([c, hc]); E1a = np.concatenate([e1, he1])
    E2a = np.concatenate([e2, he2]); TAN = np.concatenate([tan, htan])
    A = np.concatenate([a, ha]); Tt = np.concatenate([t, spec["t_ratio"] * ha])
    RS = np.concatenate([rs, np.ones_like(hu)]); FL = np.zeros_like(U)
    TH = np.concatenate([th, np.full_like(hu, np.nan)])
    return Table(U, C, E1a, E2a, TAN, A, Tt, RS, FL, TH, "Z")


def make_table(spec):
    return helix_table(spec) if spec["kind"] == "helix" else coil_table(spec)


# -------------------------------------------------------------- surface fn

def rib_profile(u):
    d = np.abs((u % 1.0) - 0.5)
    return np.where(d < RIB_HALF, 0.5 + 0.5 * np.cos(np.pi * d / RIB_HALF), 0.0)


def bend_f(s):
    """Rib sweep across the flank: 0 at the venter, 1 at the dorsum, gentle S."""
    a = np.abs(np.angle(np.exp(1j * s)))            # 0..pi
    return (1.0 - np.cos(a)) / 2.0 + 0.10 * np.sin(2.0 * a)


def section(spec, tab, U, S, inner=False, detail=None):
    """Points of the shell surface for grid arrays U (rib coordinate) and S (section angle).
    Returns (P, attrs) with attrs: crest (rib profile * strength), centre, frame u."""
    ueff = U - spec["bend"] * bend_f(S)
    fr = tab.at(ueff)
    cs, sn = np.cos(S), np.sin(S)
    p = spec["p"]
    X = np.sign(cs) * np.abs(cs) ** p
    Y = np.sign(sn) * np.abs(sn) ** p
    ribw = 0.30 + 0.70 * np.maximum(0.0, cs) ** 0.6       # ribs strongest on the venter
    crest = rib_profile(U) * fr["rs"]
    m = 1.0 + spec["rib_amp"] * crest * ribw
    if spec.get("tub"):
        # Ventrolateral tubercles on every second rib crest.
        odd = (np.floor(U) % 2 == 0).astype(float)
        tb = np.exp(-((np.abs(np.angle(np.exp(1j * S))) - 0.62) / 0.16) ** 2)
        m = m + spec["tub"] * crest * tb * odd
    if inner:
        m = 1.0 + 0.22 * (m - 1.0)
    fl = 1.0 + fr["flare"] * np.maximum(0.0, sn) ** 1.5
    a = fr["a"] * m * fl
    t = fr["t"] * m * fl
    if inner:
        a = a - WALL
        t = t - WALL
    off = fr["e1"] * (a * X)[..., None] + fr["e2"] * (t * Y)[..., None]
    Pp = fr["c"] + off
    if detail is not None:
        Pp = Pp + _norm(off) * detail(Pp, U, S, crest)[..., None]
    return Pp, dict(crest=crest, c=fr["c"], tan=fr["tan"], ueff=ueff)


def inside_tube(spec, tab, Pts, th_from, delta, in0_u, margin=0.05):
    """True where points lie inside the whorl delta (+-2pi) away (cavity-adjusted:
    where that whorl is hollow its inner wall counts as the boundary)."""
    if tab.axis == "Y":
        phi = np.arctan2(Pts[..., 2], Pts[..., 0])
    else:
        phi = np.arctan2(Pts[..., 1], Pts[..., 0])
    base = th_from + delta
    thq = base + np.angle(np.exp(1j * (phi - base)))
    ok = (~np.isnan(th_from)) & (thq >= tab.coil_th[0]) & (thq <= tab.coil_th[-1])
    uq = np.interp(np.nan_to_num(thq), tab.coil_th, tab.coil_u)
    fr = tab.at(uq)
    d = Pts - fr["c"]
    a, t = fr["a"].copy(), fr["t"].copy()
    hollow = uq >= in0_u
    a = np.where(hollow, a - WALL, a)
    t = np.where(hollow, t - WALL, t)
    x = (d * fr["e1"]).sum(-1) / np.maximum(a, 1e-6)
    y = (d * fr["e2"]).sum(-1) / np.maximum(t, 1e-6)
    q = 2.0 / spec["p"]
    return ok & ((np.abs(x) ** q + np.abs(y) ** q) < (1.0 - margin))


def th_of_u(tab, U):
    if len(tab.coil_u) == 0:
        return np.full_like(U, np.nan)
    th = np.interp(U, tab.coil_u, tab.coil_th)
    return np.where(U <= tab.coil_u[-1] + 1e-9, th, np.nan)


# ------------------------------------------------------------ mesh builder

class MeshAcc:
    """Accumulates vertices / faces / per-face material / per-vertex attributes.
    Attributes: crest (rib profile), spiral (warped u in whorls, for the tint),
    gu (grid u in whorls, for seams), gs (grid s in turns, -1 off-grid)."""

    NAMES = ("crest", "spiral", "gu", "gs")

    def __init__(self):
        self.V, self.F, self.M = [], [], []
        self.attr = {k: [] for k in self.NAMES}
        self.nv = 0

    def add_verts(self, Pp, **attrs):
        Pp = np.asarray(Pp, dtype=np.float64).reshape(-1, 3)
        n = len(Pp)
        self.V.append(Pp)
        for k in self.NAMES:
            v = attrs.get(k)
            if v is None:
                v = np.full(n, -1.0 if k == "gs" else 0.0)
            self.attr[k].append(np.broadcast_to(np.asarray(v, dtype=np.float64), Pp.shape[:1] if np.ndim(v) == 0
                                                else np.shape(v)).reshape(-1))
        base = self.nv
        self.nv += n
        return base

    def allV(self):
        return np.concatenate(self.V)

    def add_faces(self, faces, mat):
        faces = np.asarray(faces, dtype=np.int64)
        if faces.size == 0:
            return
        self.F.append(faces)
        self.M.append(np.full(len(faces), mat, dtype=np.int32))

    def build(self, name, mats, col):
        V = np.concatenate(self.V)
        Fq = [f for f in self.F if f.shape[1] == 4]
        Ft = [f for f in self.F if f.shape[1] == 3]
        Mq = [m for f, m in zip(self.F, self.M) if f.shape[1] == 4]
        Mt = [m for f, m in zip(self.F, self.M) if f.shape[1] == 3]
        Fq = np.concatenate(Fq) if Fq else np.zeros((0, 4), np.int64)
        Ft = np.concatenate(Ft) if Ft else np.zeros((0, 3), np.int64)
        Mall = np.concatenate(Mq + Mt)
        used = np.unique(np.concatenate([Fq.ravel(), Ft.ravel()]))
        remap = np.full(len(V), -1, dtype=np.int64)
        remap[used] = np.arange(len(used))
        V = V[used]
        Fq, Ft = remap[Fq], remap[Ft]
        attrs = {k: np.concatenate(v)[used] for k, v in self.attr.items()}
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(V))
        me.vertices.foreach_set("co", V.astype(np.float32).ravel())
        nl = Fq.size + Ft.size
        me.loops.add(nl)
        me.loops.foreach_set("vertex_index", np.concatenate([Fq.ravel(), Ft.ravel()]).astype(np.int32))
        npoly = len(Fq) + len(Ft)
        me.polygons.add(npoly)
        starts = np.concatenate([np.arange(len(Fq)) * 4, Fq.size + np.arange(len(Ft)) * 3]).astype(np.int32)
        me.polygons.foreach_set("loop_start", starts)
        me.polygons.foreach_set("material_index", Mall.astype(np.int32))
        me.update(calc_edges=True)
        me.validate(clean_customdata=False)
        for k, arr in attrs.items():
            at = me.attributes.new(k, "FLOAT", "POINT")
            at.data.foreach_set("value", arr.astype(np.float32))
        for m in mats:
            me.materials.append(m)
        return P.link(bpy.data.objects.new(name, me), col)


def grid_quads(base, Pg, ref, closed=True, keep=None):
    """Quads of a grid of points Pg (nu, ns, 3) whose normals follow ref (nu, ns, 3).
    keep: optional bool cell mask (nu-1, ns or ns-1)."""
    nu, ns = Pg.shape[:2]
    nj = ns if closed else ns - 1
    i, j = np.meshgrid(np.arange(nu - 1), np.arange(nj), indexing="ij")
    jj = (j + 1) % ns
    p0, p1, p2, p3 = Pg[i, j], Pg[i + 1, j], Pg[i + 1, jj], Pg[i, jj]
    n = np.cross(p2 - p0, p3 - p1)
    r = ref[i, j] + ref[i + 1, jj]
    q = np.stack([base + i * ns + j, base + (i + 1) * ns + j, base + (i + 1) * ns + jj, base + i * ns + jj], -1)
    bad = (n * r).sum(-1) < 0
    q[bad] = q[bad][:, ::-1]
    if keep is not None:
        q = q[keep]
    return q.reshape(-1, 4)


def orient(faces, V, ref):
    """Flip faces whose normal opposes ref (array (n,3) or callable(centroids))."""
    faces = np.asarray(faces, dtype=np.int64)
    if faces.size == 0:
        return faces
    p = V[faces]
    if faces.shape[1] == 4:
        n = np.cross(p[:, 2] - p[:, 0], p[:, 3] - p[:, 1])
    else:
        n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    r = ref(p.mean(1)) if callable(ref) else ref
    bad = (n * r).sum(-1) < 0
    faces = faces.copy()
    faces[bad] = faces[bad][:, ::-1]
    return faces


def ring_u(spec, tab, master):
    """u values of the grid rings: rib key points (runtime, density by rib size) or
    uniform (master)."""
    if master:
        return np.linspace(0, tab.u[-1], int(tab.u[-1] * MASTER_RINGS_PER_RIB) + 1)
    us = []
    for kq in range(int(math.ceil(tab.u[-1]))):
        fr = tab.at(np.array([kq + 0.5]))
        width = 2 * RIB_HALF * rib_spacing(spec, fr)          # rib width on the venter, metres
        if width > 0.55:
            keys = RUNTIME_RINGS
        elif width > 0.22:
            keys = (0.0, 0.36, 0.5, 0.64)
        else:
            keys = (0.0, 0.5)
        us.extend(kq + x for x in keys)
    us.append(tab.u[-1])
    return np.array(sorted(set(round(x, 6) for x in us if x <= tab.u[-1] + 1e-9)))


def rib_spacing(spec, fr):
    """Distance between rib crests on the venter (m) at a frame."""
    if spec["kind"] == "helix":
        rad = fr["a"][0] * (spec["rh"] + 1.0)
    else:
        rad = fr["a"][0] * (1.0 / spec["a_ratio"] + 1.0)
    return TAU * rad / spec["ribs"]


def detail_fn(seed):
    """Master displacement (m): growth lines across the ribs, broad weathering."""
    rng = np.random.default_rng(seed)
    dirs = _norm(rng.normal(size=(14, 3)))
    freqs = np.geomspace(0.35, 6.0, 14)
    phases = rng.uniform(0, TAU, 14)

    def fn(Pp, U, S, crest):
        w = np.zeros(Pp.shape[:-1])
        for d, f, ph in zip(dirs, freqs, phases):
            w += np.sin((Pp @ d) * f + ph) / (1.0 + f)
        growth = 0.010 * np.sin(TAU * U * 9.0) + 0.004 * np.sin(TAU * U * 23.0 + 1.3)
        return growth * (0.4 + 0.6 * (1 - crest)) + 0.016 * w / 3.0
    return fn


def build_body(spec, tab, acc, master, info):
    """Main tube (outer surface, culled), hollow part (inner nacre wall, aperture rim,
    septa) and, for IV, the break with its wall-thickness rims."""
    ns = spec["sides"] * (MASTER_SIDES_MULT if master else 1)
    us = ring_u(spec, tab, master)
    S = TAU * np.arange(ns) / ns
    UU, SS = np.meshgrid(us, S, indexing="ij")
    det = detail_fn(11) if master else None
    Po, at = section(spec, tab, UU, SS, detail=det)
    th_ring = th_of_u(tab, at["ueff"])
    u_end = tab.u[-1]
    nr = spec["ribs"]
    in0 = u_end - spec["living"] * nr                 # start of the hollow part
    inside = (inside_tube(spec, tab, Po, th_ring, TAU, in0) |
              inside_tube(spec, tab, Po, th_ring, -TAU, in0))
    cell_in = inside[:-1] & inside[1:] & np.roll(inside[:-1], -1, 1) & np.roll(inside[1:], -1, 1)
    keep = ~cell_in
    hole = np.zeros_like(keep)
    if spec.get("broken"):
        hole = break_mask(spec, us, S, u_end, info)
        keep &= ~hole
    gu = UU / nr
    gs = SS / TAU
    base = acc.add_verts(Po, crest=at["crest"], spiral=at["ueff"] / nr, gu=gu, gs=gs)
    acc.add_faces(grid_quads(base, Po, Po - at["c"], True, keep), 0)
    info["outer_cells_culled"] = int(cell_in.sum())
    info["outer_cells_total"] = int(cell_in.size)
    # hollow part: inner wall from in0 to the aperture
    iin = int(np.searchsorted(us, in0))
    ui = us[iin:]
    Pi, ati = section(spec, tab, UU[iin:], SS[iin:], inner=True)
    th_i = th_of_u(tab, ati["ueff"])
    ins_i = inside_tube(spec, tab, Pi, th_i, -TAU, in0, margin=-0.02)
    celli = ins_i[:-1] & ins_i[1:] & np.roll(ins_i[:-1], -1, 1) & np.roll(ins_i[1:], -1, 1)
    keep_i = ~celli & ~hole[iin:]
    base_i = acc.add_verts(Pi, crest=ati["crest"] * 0.2, spiral=ati["ueff"] / nr, gu=gu[iin:], gs=gs[iin:])
    acc.add_faces(grid_quads(base_i, Pi, ati["c"] - Pi, True, keep_i), 1)
    # aperture rim
    V = acc.allV()
    j = np.arange(ns)
    jj = (j + 1) % ns
    lo = base + (len(us) - 1) * ns
    li = base_i + (len(ui) - 1) * ns
    rim = np.stack([lo + j, lo + jj, li + jj, li + j], -1)
    tan_end = at["tan"][-1].mean(0)
    acc.add_faces(orient(rim, V, np.broadcast_to(tan_end, (ns, 3))), 0)
    # IV: rims along the break (the 0.32 m wall shows)
    if spec.get("broken"):
        rims, hc = hole_rims(hole[iin:], base + iin * ns, base_i, ns, V)
        if len(rims):
            rims = orient(rims, V, hc - V[rims].mean(1))
            acc.add_faces(rims, 0)
        info["hole_rim_faces"] = int(len(rims))
    # septa
    V = acc.allV()
    for su in septa_positions(spec, u_end):
        ii = int(np.argmin(np.abs(ui - su)))
        build_septum(acc, V, base_i + ii * ns, ns, ati, ii, master)
    info["septa"] = len(septa_positions(spec, u_end))
    # start cap (umbilical plug, mostly buried)
    tan0 = at["tan"][0].mean(0)
    cap_c = acc.add_verts((at["c"][0].mean(0) - tan0 * tab.a[0] * 0.3)[None, :])
    fan = np.stack([np.full(ns, cap_c), base + jj, base + j], -1)
    V = acc.allV()
    acc.add_faces(orient(fan, V, np.broadcast_to(-tan0, (ns, 3))), 0)
    return dict(us=us, S=S, base=base, ns=ns, in0=in0)


def septa_positions(spec, u_end):
    nr = spec["ribs"]
    return [u_end - b * nr for b in spec["septa_back"]]


def build_septum(acc, V, ring, ns, ati, ii, master):
    """Dome across the inner section, concave toward the aperture, fluted suture."""
    j = np.arange(ns)
    rv = V[ring + j]
    c = ati["c"][ii].mean(0)
    tan = ati["tan"][ii].mean(0)
    tan = tan / np.linalg.norm(tan)
    rad = np.linalg.norm(rv - c, axis=1).mean()
    nrings = 8 if master else 2
    layers = [ring + j]
    for r in range(1, nrings + 1):
        f = 1.0 - r / (nrings + 1)
        depth = rad * 0.30 * (1.0 - f * f)
        flute = 1.0 + 0.05 * np.sin(8 * TAU * j / ns) * f * (1 - f) * 4
        pts = c + (rv - c) * (f * flute)[:, None] - tan * depth
        layers.append(acc.add_verts(pts) + j)
    centre = acc.add_verts((c - tan * rad * 0.30)[None, :])
    quads = np.concatenate([np.stack([a, np.roll(a, -1), np.roll(b, -1), b], -1)
                            for a, b in zip(layers[:-1], layers[1:])])
    last = layers[-1]
    tri = np.stack([last, np.roll(last, -1), np.full(ns, centre)], -1)
    Vn = acc.allV()
    acc.add_faces(orient(quads, Vn, np.broadcast_to(tan, (len(quads), 3))), 2)
    acc.add_faces(orient(tri, Vn, np.broadcast_to(tan, (len(tri), 3))), 2)


# ----------------------------------------------------------------- IV break

def break_mask(spec, us, S, u_end, info):
    """Cells removed by the break: whole rib cells (trough to trough), so the edge
    steps along rib lines; the s-extent changes per rib (stepped, jagged), through the
    venter and down both flanks, deepest on the front (-Y) flank."""
    nr = spec["ribs"]
    u_mid = u_end - spec["break_back"] * nr
    half = spec["break_half"] * nr
    rib0, rib1 = int(math.floor(u_mid - half)), int(math.ceil(u_mid + half))
    r = random.Random(4004)
    ext = {}
    for kq in range(rib0, rib1):
        fall = 1.0 - abs((kq + 0.5) - u_mid) / (half + 0.8)
        fall = max(0.0, fall) ** 0.55
        lo = -(0.30 + 1.45 * fall) - r.uniform(0.0, 0.40)
        hi = (0.15 + 1.10 * fall) + r.uniform(0.0, 0.35)
        ext[kq] = (lo, hi)
    cu = 0.5 * (us[:-1] + us[1:])
    cs = np.angle(np.exp(1j * TAU * (np.arange(len(S)) + 0.5) / len(S)))
    m = np.zeros((len(cu), len(S)), bool)
    rib_of = np.floor(cu).astype(int)
    for kq, (lo, hi) in ext.items():
        rows = rib_of == kq
        # inside a rib the crest half breaks a little further than the trough half
        fr = (cu[rows] % 1.0)[:, None]
        grow = np.where(fr > 0.5, 0.12, 0.0)
        m[rows] = (cs[None, :] > lo - grow) & (cs[None, :] < hi + grow * 0.5)
    info["break_ribs"] = [rib0, rib1]
    info["break_extent_rad"] = {str(k): [round(a, 2), round(b, 2)] for k, (a, b) in ext.items()}
    return m


def hole_rims(hole, base_o, base_i, ns, V):
    """Quads joining outer and inner grid edges on the border of the hole; also the
    centre of the hole cell each rim belongs to (for orientation)."""
    nu1 = hole.shape[0]
    hi, hj = np.nonzero(hole)
    rims, cen = [], []

    def vid(i, j):
        return i * ns + (j % ns)
    for i, j in zip(hi.tolist(), hj.tolist()):
        cell = [vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)]
        c = V[[base_o + x for x in cell]].mean(0)
        for (a, b), (v0, v1) in (((i - 1, j), (vid(i, j), vid(i, j + 1))),
                                 ((i + 1, j), (vid(i + 1, j), vid(i + 1, j + 1))),
                                 ((i, j - 1), (vid(i, j), vid(i + 1, j))),
                                 ((i, j + 1), (vid(i, j + 1), vid(i + 1, j + 1)))):
            if a < 0 or a >= nu1 or hole[a, b % ns]:
                continue
            rims.append((base_o + v0, base_o + v1, base_i + v1, base_i + v0))
            cen.append(c)
    return np.array(rims, dtype=np.int64).reshape(-1, 4), np.array(cen).reshape(-1, 3)


def fragment_specs(spec, rng_seed=77):
    """Ten curved wall pieces from the break: (u0, u1, s0, s1, outline, motion)."""
    r = random.Random(rng_seed)
    nr = spec["ribs"]
    out = []
    for n in range(10):
        ribs = r.choice((1, 1, 2, 2, 2))
        u_off = r.uniform(-spec["break_half"] * nr, spec["break_half"] * nr - ribs)
        s0 = r.uniform(-1.5, 0.7)
        ds = r.uniform(0.38, 0.72)
        attached = n < 2
        out.append(dict(u_off=u_off, ribs=ribs, s0=s0, s1=s0 + ds, attached=attached,
                        lobes=[r.uniform(0.62, 1.0) for _ in range(7)], lobe_phase=r.uniform(0, TAU),
                        dist=(r.uniform(0.3, 0.6) if attached else r.uniform(1.2, 6.0)),
                        axis=(r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1)),
                        ang=(r.uniform(0.20, 0.35) if attached else r.uniform(0.5, 2.6)),
                        lift=r.uniform(-1.0, 2.0), side=r.choice((-1.0, 1.0))))
    return out


def build_fragments(spec, tab, acc, frags, master):
    """Solid curved wall pieces with irregular outlines: ribbed exterior, nacre
    inside, a 0.32 m rim all round."""
    nr = spec["ribs"]
    u_mid = tab.u[-1] - spec["break_back"] * nr
    for fs in frags:
        u0 = math.floor(u_mid + fs["u_off"])
        u1 = u0 + fs["ribs"]
        if master:
            uu = np.linspace(u0, u1, fs["ribs"] * MASTER_RINGS_PER_RIB + 1)
            nsg = int((fs["s1"] - fs["s0"]) / (TAU / (spec["sides"] * MASTER_SIDES_MULT))) + 2
        else:
            uu = np.array([kq + x for kq in range(u0, u1) for x in RUNTIME_RINGS] + [u1], float)
            nsg = int((fs["s1"] - fs["s0"]) / (TAU / (spec["sides"] * 2))) + 2
        ss = np.linspace(fs["s0"], fs["s1"], nsg)
        UU, SS = np.meshgrid(uu, ss, indexing="ij")
        Po, at = section(spec, tab, UU, SS, detail=detail_fn(11) if master else None)
        Pi, _ = section(spec, tab, UU, SS, inner=True)
        # irregular outline in patch space (lobed polygon), evaluated per cell
        cu = (0.5 * (uu[:-1] + uu[1:]) - u0) / (u1 - u0) - 0.5
        cs_ = (0.5 * (ss[:-1] + ss[1:]) - fs["s0"]) / (fs["s1"] - fs["s0"]) - 0.5
        CU, CS = np.meshgrid(cu, cs_, indexing="ij")
        ang = np.arctan2(CS, CU) + fs["lobe_phase"]
        lob = np.array(fs["lobes"])
        k = (ang % TAU) / TAU * len(lob)
        i0 = np.floor(k).astype(int) % len(lob)
        rr = lob[i0] * 0.5                       # stepped lobes: a broken, angular outline
        keep = np.hypot(CU, CS) < rr
        if keep.sum() < 2:
            continue
        cen = Po[:-1, :-1][keep].reshape(-1, 3).mean(0)
        nout = _norm((Po - at["c"])[:-1, :-1][keep].reshape(-1, 3).mean(0)[None])[0]
        Rm = np.array(Matrix.Rotation(fs["ang"], 3, Vector(fs["axis"]).normalized()))
        if fs["attached"]:
            # hinge on the patch edge nearest the hole border, swing outward a little
            pivot = Po[0, :].mean(0)
            move = nout * fs["dist"]
        else:
            pivot = cen
            tang = _norm(at["tan"].reshape(-1, 3).mean(0)[None])[0]
            move = nout * fs["dist"] + tang * fs["side"] * fs["dist"] * 0.5 + np.array([0, 0, fs["lift"]])

        def tf(X):
            return (X.reshape(-1, 3) - pivot) @ Rm.T + pivot + move
        nu, nsv = UU.shape
        Pg_o = tf(Po).reshape(nu, nsv, 3)
        Pg_i = tf(Pi).reshape(nu, nsv, 3)
        Cg = tf(at["c"]).reshape(nu, nsv, 3)
        bo = acc.add_verts(Pg_o, crest=at["crest"], spiral=at["ueff"] / nr)
        bi = acc.add_verts(Pg_i, crest=at["crest"] * 0.2, spiral=at["ueff"] / nr)
        acc.add_faces(grid_quads(bo, Pg_o, Pg_o - Cg, False, keep), 0)
        acc.add_faces(grid_quads(bi, Pg_i, Cg - Pg_i, False, keep), 1)
        # rims where a kept cell borders a dropped cell or the patch edge
        rims, rc = [], []
        H, Wd = keep.shape
        for i, jx in zip(*np.nonzero(keep)):
            cell_c = Pg_o[i:i + 2, jx:jx + 2].reshape(-1, 3).mean(0)
            for (a, b), (v0, v1) in (((i - 1, jx), (i * nsv + jx, i * nsv + jx + 1)),
                                     ((i + 1, jx), ((i + 1) * nsv + jx, (i + 1) * nsv + jx + 1)),
                                     ((i, jx - 1), (i * nsv + jx, (i + 1) * nsv + jx)),
                                     ((i, jx + 1), (i * nsv + jx + 1, (i + 1) * nsv + jx + 1))):
                if 0 <= a < H and 0 <= b < Wd and keep[a, b]:
                    continue
                rims.append((bo + v0, bo + v1, bi + v1, bi + v0))
                rc.append(cell_c)
        V = acc.allV()
        rims = np.array(rims, dtype=np.int64)
        acc.add_faces(orient(rims, V, V[rims].mean(1) - np.array(rc)), 0)


# -------------------------------------------------------------- transform

def shell_transform(spec, tab):
    """Orientation (mirror, tilt, yaw) and scale so the body is target_h tall,
    pivot at the bottom centre. Computed from the centre-line table."""
    R = np.eye(3)
    if spec.get("mirror"):
        R = np.diag([-1.0, 1.0, 1.0])
    if spec.get("tilt"):
        rx, ry, rz = spec["tilt"]
        R = np.array(Matrix.Rotation(rz, 3, "Z") @ Matrix.Rotation(ry, 3, "Y") @
                     Matrix.Rotation(rx, 3, "X")) @ R
    if spec.get("yaw"):
        R = np.array(Matrix.Rotation(math.radians(spec["yaw"]), 3, "Z")) @ R
    return R


def apply_tf(acc, R, sc, shift):
    acc.V = [(v @ R.T) * sc - shift for v in acc.V]


# -------------------------------------------------------------- shading

def master_material(name, kind, nr):
    """kind: 'ext' | 'nacre' | 'glow'. Uses mesh attributes crest / spiral."""
    m, k, out = P.new_procedural(name)
    co = k.coord()
    a_crest = k.new("ShaderNodeAttribute"); a_crest.attribute_name = "crest"
    a_sp = k.new("ShaderNodeAttribute"); a_sp.attribute_name = "spiral"
    crest = a_crest.outputs["Fac"]
    spiral = a_sp.outputs["Fac"]
    # Low-frequency interference tint along the spiral (2.5 slow shifts per whorl).
    ph = k.math("SINE", k.math("MULTIPLY", spiral, TAU * 2.5))
    ph2 = k.math("SINE", k.math("ADD", k.math("MULTIPLY", spiral, TAU * 2.5), 2.1))
    tint_a = k.maprange(ph, -1, 1, 0, 1)
    tint_b = k.maprange(ph2, -1, 1, 0, 1)
    fine = k.noise(co, 2.2, 6.0, 0.6)
    pits = k.voronoi(co, 9.0)
    # growth lines: ~40 fine lines per rib across the spiral (spiral is in whorls)
    gl = k.maprange(k.math("SINE", k.math("MULTIPLY", spiral, TAU * nr * 40.0)), -1.0, 1.0)
    if kind == "ext":
        base = k.mix(tint_a, (0.80, 0.775, 0.785), (0.775, 0.80, 0.785))
        base = k.mix(k.math("MULTIPLY", tint_b, 0.6), base, (0.77, 0.785, 0.82))
        groove = k.math("SUBTRACT", 1.0, crest)
        c = k.mix(k.math("MULTIPLY", groove, 0.35), base, (0.60, 0.585, 0.56))
        c = k.mix(k.maprange(gl, 0.4, 1.0, 0.0, 0.10), c, (0.88, 0.87, 0.86))
        age = k.math("MULTIPLY", k.maprange(k.ao(0.9), 0.35, 0.9, 0.6, 0.0),
                     k.maprange(fine, 0.35, 0.65, 0.4, 1.0))
        c = k.mix(age, c, (0.30, 0.31, 0.27))
        rough = k.math("ADD", k.math("MULTIPLY", groove, 0.22), 0.28)
        rough = k.math("ADD", rough, k.math("MULTIPLY", age, 0.2), clamp=True)
        bump_h = k.math("ADD", k.math("MULTIPLY", gl, 0.6),
                        k.math("MULTIPLY", k.maprange(pits, 0.0, 0.12, -0.6, 0.0), 1.0))
        bump_h = k.math("ADD", bump_h, k.math("MULTIPLY", k.noise(co, 14.0, 4.0, 0.6), 0.35))
        return m, P.finish_procedural(k, out, c, rough, 0.0, bump_h, 0.30, 0.006)
    if kind == "nacre":
        plate = k.voronoi(co, 26.0, "F1", "Distance")
        base = k.mix(tint_a, (0.92, 0.89, 0.91), (0.88, 0.92, 0.91))
        c = k.mix(k.math("MULTIPLY", tint_b, 0.5), base, (0.88, 0.90, 0.95))
        rough = k.maprange(fine, 0.3, 0.7, 0.10, 0.18)
        bump_h = k.math("ADD", k.math("MULTIPLY", plate, 0.6), k.math("MULTIPLY", gl, 0.2))
        return m, P.finish_procedural(k, out, c, rough, 0.0, bump_h, 0.12, 0.004)
    flow = k.noise(co, 1.4, 5.0, 0.62)
    c = k.mix(k.maprange(flow, 0.35, 0.7), (0.95, 0.82, 0.62), (1.0, 0.93, 0.80))
    rough = 0.2
    bump_h = k.math("MULTIPLY", flow, 0.5)
    return m, P.finish_procedural(k, out, c, rough, 0.0, bump_h, 0.08, 0.004)


def final_material(name, tex):
    m = P.textured_material(name, tex["base"], tex["orm"], tex["normal"])
    m.use_backface_culling = name == "M_Shell_Exterior"
    return m


def patch_glb(path, n):
    """Write the physical-material extensions the Blender exporter does not."""
    js, binc = BK.read_glb(path)
    used = set(js.get("extensionsUsed", []))
    for mat in js.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        orm = pbr.get("metallicRoughnessTexture")
        base = pbr.get("baseColorTexture")
        ext = mat.setdefault("extensions", {})
        name = mat.get("name")
        if name in ("M_Shell_Exterior", "M_Shell_Nacre"):
            nac = name == "M_Shell_Nacre"
            iri = {"iridescenceFactor": 1.0, "iridescenceIor": 1.3,
                   "iridescenceThicknessMinimum": 200.0 if nac else 150.0,
                   "iridescenceThicknessMaximum": 460.0 if nac else 400.0}
            if orm:
                iri["iridescenceThicknessTexture"] = {"index": orm["index"]}
            ext["KHR_materials_iridescence"] = iri
            ext["KHR_materials_clearcoat"] = {"clearcoatFactor": 0.8 if nac else 0.6,
                                              "clearcoatRoughnessFactor": 0.08 if nac else 0.15}
            used.update(("KHR_materials_iridescence", "KHR_materials_clearcoat"))
            mat["doubleSided"] = nac
        elif name == "M_Shell_Glow":
            mat["emissiveFactor"] = list(GLOW)
            if base:
                mat["emissiveTexture"] = {"index": base["index"]}
            ext["KHR_materials_emissive_strength"] = {"emissiveStrength": 3.2 if n == 4 else 1.8}
            used.add("KHR_materials_emissive_strength")
            mat["doubleSided"] = True
        if not ext:
            mat.pop("extensions", None)
    js["extensionsUsed"] = sorted(used)
    BK.write_glb(path, js, binc)


# ------------------------------------------------------------ collision

def build_collision(col, runtime, n, spec, split_z=None):
    me = runtime.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    mi = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("material_index", mi)
    groups = [co]
    if split_z is not None:
        groups = [co[co[:, 2] >= split_z - 0.5], co[co[:, 2] <= split_z + 0.5]]
    objs = []
    for gi, pts in enumerate(groups):
        pts = pts[:: max(1, len(pts) // 1500)]
        bm = bmesh.new()
        vs = [bm.verts.new(tuple(p)) for p in pts]
        bmesh.ops.convex_hull(bm, input=vs)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(16), verts=bm.verts[:], edges=bm.edges[:])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        name = f"shell_{n}_hull{'_' + 'ab'[gi] if len(groups) > 1 else ''}_col"
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        objs.append(P.link(bpy.data.objects.new(name, mesh), col))
    return objs


# ---------------------------------------------------------------- build

def generate(n, master, tab, frags=None):
    spec = SPECS[n]
    acc = MeshAcc()
    info = {}
    body = build_body(spec, tab, acc, master, info)
    if spec.get("broken"):
        if frags is None:
            frags = fragment_specs(spec)
        build_fragments(spec, tab, acc, frags, master)
        info["fragments"] = len(frags)
    return acc, body, info, frags


def stage_build(n, geo_only=False):
    pa = paths(n)
    P.set_tag(pa["asset"])
    spec = SPECS[n]
    clock = P.StageClock()
    stats = {"asset": pa["asset"], "numeral": spec["numeral"], "blender": bpy.app.version_string,
             "round": 2, "stages": clock.stages}
    clock.start("model_runtime")
    sc_ = P.reset_scene()
    stats["cycles_device"] = P.use_gpu(sc_)
    sc_.render.engine = "CYCLES"
    work = P.new_collection("Work")
    tab = make_table(spec)
    R = shell_transform(spec, tab)
    # provisional scale from the centre line, so the wall / ring density work in metres
    ext = np.concatenate([tab.c + tab.e1 * tab.a[:, None], tab.c - tab.e1 * tab.a[:, None],
                          tab.c + tab.e2 * tab.t[:, None], tab.c - tab.e2 * tab.t[:, None]])
    ext = ext @ R.T
    sc0 = spec["target_h"] / (ext[:, 2].max() - ext[:, 2].min())
    tab.scale(sc0)
    acc, body, info, frags = generate(n, False, tab)
    Vr = np.concatenate(acc.V) @ R.T
    nbody = body["base"] + len(body["us"]) * body["ns"]
    vb = Vr[:nbody]
    sc1 = spec["target_h"] / (vb[:, 2].max() - vb[:, 2].min())
    shift = np.array([(vb[:, 0].max() + vb[:, 0].min()) / 2, (vb[:, 1].max() + vb[:, 1].min()) / 2,
                      vb[:, 2].min()]) * sc1
    acc.V = [(v @ R.T) * sc1 - shift for v in acc.V]
    if np.linalg.det(R) < 0:
        acc.F = [f[:, ::-1] for f in acc.F]
    stats["scale"] = round(sc0 * sc1, 4)
    m_tmp = [P.mat_simple("tmp_ext", (0.8, 0.8, 0.8)), P.mat_simple("tmp_nacre", (0.9, 0.9, 0.9)),
             P.mat_simple("tmp_glow", (1.0, 0.85, 0.6))]
    shell = acc.build(f"shell_{n}_rt", m_tmp, work)
    P.finish_shading(shell, angle=34)
    stats["geometry"] = info
    stats["runtime_triangles"] = P.mesh_tris(shell)
    stats["nonmanifold_edges"] = P.nonmanifold_edges(shell)
    P.log("runtime tris", stats["runtime_triangles"], json.dumps(info))
    if geo_only:
        preview(n, shell, sc_)
        return

    # aperture socket from the last frame
    c_end = (tab.c[-1] @ R.T) * sc1 - shift
    t_end = tab.tan[-1] @ R.T
    a_end = float(tab.a[-1] * sc1)

    clock.start("uv_unwrap")
    nr = spec["ribs"]
    me = shell.data
    gu = np.empty(len(me.vertices), np.float32); me.attributes["gu"].data.foreach_get("value", gu)
    gs = np.empty(len(me.vertices), np.float32); me.attributes["gs"].data.foreach_get("value", gs)
    K = 3 if spec["kind"] == "coil" else 4
    ev = np.empty(len(me.edges) * 2, np.int32); me.edges.foreach_get("vertices", ev)
    ev = ev.reshape(-1, 2)
    ua, ub = gu[ev[:, 0]] * nr, gu[ev[:, 1]] * nr
    ring = (np.abs(ua - ub) < 1e-4) & (np.abs(ua / K - np.round(ua / K)) < 1e-3) & (gs[ev[:, 0]] >= 0)
    dors = (np.abs(gs[ev[:, 0]] - 0.5) < 1e-4) & (np.abs(gs[ev[:, 1]] - 0.5) < 1e-4)
    seams = set(np.nonzero(ring | dors)[0].tolist())
    shell.data.uv_layers.new(name="UVMap")
    stats["uv_seams"] = P.seam_unwrap(shell, lambda e: e.index in seams, sharp_deg=42, margin=0.0012,
                                      scale_faces=(lambda f: f.material_index == 1, 0.55))
    stats["uv_exterior"] = P.uv_metrics(shell, TEX_SIZE, material_indices={0})
    stats["uv_nacre"] = P.uv_metrics(shell, TEX_SIZE, material_indices={1, 2})
    P.log("uv", json.dumps(stats["uv_exterior"]))

    clock.start("master_highpoly")
    macc, _, minfo, _ = generate(n, True, tab, frags=frags)
    macc.V = [(v @ R.T) * sc1 - shift for v in macc.V]
    if np.linalg.det(R) < 0:
        macc.F = [f[:, ::-1] for f in macc.F]
    h_ext, kit_e = master_material("H_Exterior", "ext", nr)
    h_nac, kit_n = master_material("H_Nacre", "nacre", nr)
    h_glw, kit_g = master_material("H_Glow", "glow", nr)
    master = macc.build(f"{pa['asset']}_master", [h_ext, h_nac, h_glw], work)
    master.data.shade_smooth()
    stats["master_triangles"] = P.mesh_tris(master)
    P.log("master triangles", stats["master_triangles"])

    clock.start("bake_gpu")
    orig = [s.material for s in shell.material_slots]
    for i, sl in enumerate(shell.material_slots):
        sl.material = P.bake_target_material(f"bake_{i}")
    imgs, stats["bakes"] = P.run_bakes(sc_, master, [kit_e, kit_n, kit_g], (
        ("normal", "NORMAL", shell, 24, "bsdf"),
        ("color", "EMIT", shell, 24, "color"),
        ("rough", "EMIT", shell, 12, "rough"),
        ("ao", "AO", shell, 384, "bsdf")), BAKE_SIZE, cage=0.035, ray=0.09)
    stats["bake"] = {"size": BAKE_SIZE, "supersample": BAKE_SIZE // TEX_SIZE, "cage_m": 0.035, "ray_m": 0.09}

    clock.start("textures")
    tex_paths, stats["texture_files"] = write_textures_dither(imgs, pa["tex"], pa["asset"])
    for img in imgs.values():
        bpy.data.images.remove(img)

    clock.start("materials")
    tex = P.load_textures(tex_paths)
    mats = [final_material("M_Shell_Exterior", tex), final_material("M_Shell_Nacre", tex),
            final_material("M_Shell_Glow", tex)]
    for sl, mat in zip(shell.material_slots, mats):
        sl.material = mat
    for a in ("crest", "spiral", "gu", "gs"):
        if a in shell.data.attributes:
            shell.data.attributes.remove(shell.data.attributes[a])
    master.hide_render = True
    master.hide_set(True)

    clock.start("assemble_export")
    out = P.new_collection("Export")
    shell.name = shell.data.name = pa["asset"]
    work.objects.unlink(shell)
    out.objects.link(shell)
    split = None
    if spec["kind"] == "helix":
        split = float((tab.c[np.where(~np.isnan(tab.th))[0][-1]] @ R.T)[2] * sc1 - shift[2])
    cols = build_collision(out, shell, n, spec, split)
    fwd = Vector(tuple(t_end)).normalized()
    sock = P.socket_empty("socket_aperture", out, tuple(c_end), socket="aperture",
                          radius_m=round(a_end, 3),
                          note="aperture centre; forward (glTF +Z of the node) looks out of the mouth")
    sock.rotation_mode = "QUATERNION"
    sock.rotation_quaternion = fwd.to_track_quat("-Y", "Z")
    stats["socket_aperture"] = {"position": [round(x, 3) for x in c_end], "forward": [round(x, 3) for x in fwd],
                                "radius_m": round(a_end, 3)}
    stats["collision_triangles"] = {o.name: P.mesh_tris(o) for o in cols}
    stats["materials"] = [s.material.name for s in shell.material_slots]
    lo, hi = P.world_bounds([shell])
    stats["bounds_blender_zup"] = {"min": [round(x, 3) for x in lo], "max": [round(x, 3) for x in hi]}
    stats["inward_facing_faces"] = inward_faces(shell)
    P.export_glb(pa["glb"], [shell] + cols + [sock], shell)
    patch_glb(pa["glb"], n)
    stats["glb_raw_bytes"] = os.path.getsize(pa["glb"])
    stats["glb"] = P.glb_summary(pa["glb"])
    clock.stop()
    stats["budget_ok"] = {"runtime": stats["runtime_triangles"] <= RUNTIME_TRI_BUDGET,
                          "materials_per_object": len(stats["materials"]) <= 3}
    bpy.ops.wm.save_as_mainfile(filepath=pa["blend"], relative_remap=True)
    os.makedirs(pa["qa"], exist_ok=True)
    with open(pa["stats"], "w") as fh:
        json.dump(stats, fh, indent=2)
    P.log("stats", json.dumps({k: v for k, v in stats.items() if k not in ("glb",)})[:3000])


def preview(n, obj, sc):
    """Fast shape check of the runtime mesh (flat materials, 24 spp)."""
    P.setup_render(sc, res=900, samples=24)
    golden_world(sc)
    sc.render.image_settings.file_format = "JPEG"
    lo, hi = P.world_bounds([obj])
    cz = (lo.z + hi.z) / 2
    out = os.path.join(HERE, "preview")
    os.makedirs(out, exist_ok=True)
    for name, loc, lens in (("tq", (30, -36, 25), 40), ("front", (0, -60, cz), 40),
                            ("top", (0.1, -0.1, 60), 40), ("ap", None, 40)):
        if loc is None:
            continue
        cam = P.add_camera("Cam" + name, loc, (0, 0, cz), None, lens)
        sc.camera = cam
        sc.render.filepath = os.path.join(out, f"shell_{n}_{name}.jpg")
        bpy.ops.render.render(write_still=True)


def inward_faces(obj):
    """Face-orientation check (review fix 5): cast a ray from each face centre
    along its normal; a front face hit from outside within 5 cm means the face
    points into the body. Returns the count over a sample of faces."""
    me = obj.data
    dg = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(dg)
    bad = 0
    sample = range(0, len(me.polygons), max(1, len(me.polygons) // 4000))
    n = 0
    for i in sample:
        p = me.polygons[i]
        if p.material_index != 0:
            continue
        n += 1
        o = p.center + p.normal * 0.002
        hit, loc, nor, idx = obj_eval.ray_cast(o, p.normal, distance=0.05)
        if hit and nor.dot(p.normal) > 0.5:
            bad += 1
    return {"checked": n, "suspect": bad}


def write_textures_dither(imgs, tex_dir, prefix):
    """Box-downsample the 8192 float bakes to 4096; 8-bit with triangular dither
    (kills normal-map terracing / banding)."""
    os.makedirs(tex_dir, exist_ok=True)
    f = BAKE_SIZE // TEX_SIZE
    A = {k: P.downsample(P.pixels(v), f)[..., :3] for k, v in imgs.items()}
    rng = np.random.default_rng(5)

    def dith(x):
        return x + (rng.random(x.shape) - rng.random(x.shape)) / 255.0
    paths = {}
    paths["base"] = P.save_rgb(dith(P.to_srgb(A["color"])), os.path.join(tex_dir, f"{prefix}_basecolor.jpg"), 93)
    ao = A["ao"][..., 0]
    paths["orm"] = P.save_rgb(dith(np.stack([ao, A["rough"][..., 0], np.zeros_like(ao)], -1)),
                              os.path.join(tex_dir, f"{prefix}_orm.jpg"), 93)
    nrm = A["normal"] * 2.0 - 1.0
    nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-6)
    paths["normal"] = P.save_rgb(dith(nrm * 0.5 + 0.5), os.path.join(tex_dir, f"{prefix}_normal.png"))
    files = {k: {"file": os.path.relpath(v, REPO).replace("\\", "/"), "bytes": os.path.getsize(v)}
             for k, v in paths.items()}
    return paths, files


# -------------------------------------------------------------- render

def physical_fix(objs):
    """Mirror the patched glTF extensions in Cycles for the QA renders (the Blender
    importer drops them): thin film from the ORM green channel, coat, emission."""
    for o in objs:
        for sl in o.material_slots:
            m = sl.material
            if not m or not m.node_tree:
                continue
            nt = m.node_tree
            b = next((x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"), None)
            if b is None:
                continue
            name = m.name
            if name.startswith("M_Shell_Exterior") or name.startswith("M_Shell_Nacre"):
                nac = name.startswith("M_Shell_Nacre")
                orm = next((x for x in nt.nodes if x.type == "TEX_IMAGE" and "orm" in (x.image.name if x.image else "")), None)
                lo_, hi_ = (200.0, 460.0) if nac else (150.0, 400.0)
                if orm is not None:
                    sep = nt.nodes.new("ShaderNodeSeparateColor")
                    nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
                    mr = nt.nodes.new("ShaderNodeMapRange")
                    mr.inputs[3].default_value, mr.inputs[4].default_value = lo_, hi_
                    nt.links.new(sep.outputs["Green"], mr.inputs[0])
                    nt.links.new(mr.outputs[0], b.inputs["Thin Film Thickness"])
                else:
                    b.inputs["Thin Film Thickness"].default_value = (lo_ + hi_) / 2
                b.inputs["Thin Film IOR"].default_value = 1.3
                b.inputs["Coat Weight"].default_value = 0.8 if nac else 0.6
                b.inputs["Coat Roughness"].default_value = 0.08 if nac else 0.15
                m.use_backface_culling = not nac
            elif name.startswith("M_Shell_Glow"):
                base = next((x for x in nt.nodes if x.type == "TEX_IMAGE" and "basecolor" in (x.image.name if x.image else "")), None)
                if base is not None:
                    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
                    mix.inputs["Factor"].default_value = 1.0
                    nt.links.new(base.outputs["Color"], mix.inputs["A"])
                    mix.inputs["B"].default_value = (*GLOW, 1)
                    nt.links.new(mix.outputs["Result"], b.inputs["Emission Color"])
                b.inputs["Emission Strength"].default_value = 3.2 if "4" in o.name else 1.8


def golden_world(sc, strength=0.9):
    """Golden-hour review sky: warm low sun, cool blue-grey fill (style addendum)."""
    w = bpy.data.worlds.new("Golden")
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(14)
    sky.sun_rotation = math.radians(215)
    sky.altitude = 800
    sky.air_density = 1.6
    sky.dust_density = 2.6
    nt.links.new(sky.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = strength * 0.12
    sc.world = w
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 4.2
    sun.angle = math.radians(1.5)
    sun.color = (1.0, 0.78, 0.55)
    o = P.link(bpy.data.objects.new("Sun", sun))
    o.rotation_euler = (math.radians(90 - 14), 0, math.radians(215 + 90))
    fill = bpy.data.lights.new("Fill", "SUN")
    fill.energy = 0.8
    fill.color = (0.62, 0.72, 0.92)
    o = P.link(bpy.data.objects.new("Fill", fill))
    o.rotation_euler = (math.radians(40), 0, math.radians(40))


def stage_render(n, res=1400, samples=256):
    pa = paths(n)
    P.set_tag(pa["asset"])
    clock = P.StageClock()
    clock.start("qa_renders")
    sc = P.reset_scene()
    P.setup_render(sc, res=res, samples=samples)
    device = P.use_gpu(sc)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 86
    golden_world(sc)
    env = P.new_collection("ReviewEnv")
    P.add_ground_and_scale(env, ground_r=40.0, ruler_h=20.0, ruler_seg=1.0, ruler_x=-11.0,
                           ruler_y=0.0, ruler_w=0.22,
                           marks=((5.0, "5 m"), (10.0, "10 m"), (18.0, "18 m")),
                           human_at=(11.0, 0.0), label_size=0.75, grid=(1.0, 5.0))
    bpy.ops.import_scene.gltf(filepath=pa["glb"])
    objs = {o.name: o for o in bpy.context.scene.objects}
    shell = objs[pa["asset"]]
    physical_fix([shell])
    cols = [o for nme, o in objs.items() if nme.endswith("_col")]
    sock = objs.get("socket_aperture")
    lo, hi = P.world_bounds([shell])
    cz = (lo.z + hi.z) / 2
    views = {
        "three_quarter": ((30, -36, 25), (0, 0, cz - 1.0), None, 40),
        "front": ((0, -80, cz), (0, 0, cz), 27.0, None),
        "top": ((0, 0, 80), (0, 0, 0), 25.0, None),
    }
    close = {}
    if sock:
        ap = sock.matrix_world.translation
        fwd = sock.matrix_world.to_3x3() @ Vector((0, -1, 0))
        cam = ap + fwd * 10.0 + Vector((0, 0, 2.0))
        close["close_aperture"] = (tuple(cam), tuple(ap - fwd * 1.5), None, 38)
    close["close_flank"] = ((4.0, lo.y - 9.0, cz + 3.0), ((lo.x + hi.x) / 2 + 1.0, 0, cz + 1.0), None, 42)
    if n == 4:
        close["close_break"] = ((2.0, -14.0, hi.z + 9.0), (0.0, 0.0, hi.z - 3.0), None, 40)
    out = os.path.join(pa["qa"], "final")
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".jpg"):
            os.remove(os.path.join(out, f))
    timings = {}
    for c in cols:
        c.hide_render = True
    P.shoot(sc, views, pa["asset"], out, timings, REPO)
    P.shoot(sc, close, pa["asset"], out, timings, REPO)
    clock.stop()
    with open(os.path.join(out, "render-stats.json"), "w") as fh:
        json.dump({"device": device, "resolution": res, "samples": samples, "lighting": "golden hour",
                   "seconds_per_render": timings, "stages": clock.stages}, fh, indent=2)


def stage_scene(res=1600, samples=256):
    """All four Shells at their layout positions, seen from the game camera."""
    P.set_tag("shells")
    sc = P.reset_scene()
    P.setup_render(sc, res=res, samples=samples)
    sc.render.resolution_y = int(res * 9 / 16)
    P.use_gpu(sc)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 86
    golden_world(sc)
    # layout.js: zone angles 45/135/225/315, places r/y; facePlaza yaw.
    places = [(52, 14), (50, 22), (54, 17), (50, 25)]
    objs = []
    for i, ang in enumerate((45, 135, 225, 315)):
        bpy.ops.import_scene.gltf(filepath=paths(i + 1)["glb"])
        sel = [o for o in bpy.context.selected_objects]
        root = None
        for o in sel:
            if o.name.endswith("_col"):
                o.hide_render = True
            if o.name.startswith(f"shell_{i + 1}") and not o.name.endswith("_col"):
                root = o
        physical_fix([root])
        r, y = places[i]
        gx, gz = math.cos(math.radians(ang)) * r, math.sin(math.radians(ang)) * r
        yaw = -math.radians(ang) - math.pi / 2              # facePlaza (glTF Y rotation)
        for o in sel:
            if o.parent is None:
                o.matrix_world = (Matrix.Translation((gx, -gz, y)) @ Matrix.Rotation(yaw, 4, "Z")
                                  @ o.matrix_world)
        objs.append(root)
    # Plaza disc and the camp ring as simple stand-ins for scale.
    m = P.mat_simple("Plaza", (0.25, 0.25, 0.23), 0.85)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=96, radius=9.0)
    P.bm_object("Plaza", bm, m, None)
    for ang in (270, 210, 150, 90, 30, 330):
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=6.5,
                                matrix=Matrix.Translation((30 * math.cos(math.radians(ang)),
                                                           -30 * math.sin(math.radians(ang)), 0)))
        P.bm_object(f"Camp{ang}", bm, m, None)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=5.0,
                            matrix=Matrix.Translation((46 * math.cos(math.radians(120)),
                                                       -46 * math.sin(math.radians(120)), 0)))
    P.bm_object("Balcony", bm, m, None)
    out = os.path.join(REPO, "docs", "art", "qa", "shells")
    os.makedirs(out, exist_ok=True)
    timings = {}
    # camera-rig.js: yaw 0 -> camera on +Z (glTF) of the focus = Blender -Y; pitch from zoom.
    bal = (46 * math.cos(math.radians(120)), -46 * math.sin(math.radians(120)), 1.0)

    def rig(dist, focus, fov):
        t = min(1, max(0, (dist - 4.5) / 85.5))
        pitch = math.radians(14 + 48 * t ** 0.6)
        loc = (focus[0], focus[1] - dist * math.cos(pitch), focus[2] + dist * math.sin(pitch))
        cam = P.add_camera("Cam", loc, focus, None, 36)
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = math.radians(fov)
        return cam
    for name, dist, focus in (("game_balcony_d30", 30, bal), ("game_overview_d90", 90, (0, 0, 0.6)),
                              ("game_plaza_d30", 30, (0, 0, 1.3))):
        t = min(1, max(0, (dist - 4.5) / 85.5))
        cam = rig(dist, focus, 50 - 18 * t ** 0.5)
        sc.camera = cam
        path = os.path.join(out, f"shells_{name}.jpg")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        P.log("rendered", path)
    # Upward look from the plaza toward the Shells (skyline read).
    cam = P.add_camera("CamUp", (0, 6, 2.0), (0, -60, 22), None, 24)
    sc.camera = cam
    path = os.path.join(out, "shells_skyline_from_plaza.jpg")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    if stage == "scene":
        stage_scene()
        sys.exit(0)
    nums = [int(x) for x in argv[1:]] or [1, 2, 3, 4]
    for num in nums:
        if stage == "geo":
            stage_build(num, geo_only=True)
        if stage in ("build", "all"):
            stage_build(num)
        if stage in ("render", "all"):
            stage_render(num)
