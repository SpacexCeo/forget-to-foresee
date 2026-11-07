"""Procedural source for the ambient alien fauna of Forget to Foresee.

Run headless with Blender 4.5 LTS (from the repository root):

    blender -b -P art/fauna/build_fauna.py -- build  [name ...]   # model, rig, animate, textures, raw .glb
    blender -b -P art/fauna/build_fauna.py -- render [name ...]   # GPU contact sheets of the post-processed .glb

Names: skyray, driftjelly, glyphmote, cloudwhale, moss_critter (default: all).
`build` writes art/fauna/out/fauna_<name>_raw.glb. Then `node art/fauna/post_fauna.mjs`
adds the material extensions (iridescence, transmission, volume, emissive strength),
checks the loops and writes art/fauna/out/fauna_<name>_ext.glb, which
art/tools/compress-glb.sh turns into game/public/assets/models/fauna_<name>.glb
(KTX2 + meshopt). art/fauna/run_all.sh chains the steps.

Design (owner direction 07.11 + style addendum): the fauna shares the Guests'
language - nacre-crystal bodies, sail/fin membranes with radiating spines and
Voronoi veins, iridescence, gold bioluminescence - and reads as ancient and
unknowable: weathered nacre with crazing and lichen, frayed and torn membranes,
slow majestic motion, a restrained desaturated palette with gold accents.
Nothing is copied from any film or game.

Every creature is a skinned mesh on one armature with baked clips (30 fps; loops
repeat their first pose on the last frame so LoopRepeat is seamless). Blender is
Z-up with the front -Y; the glTF exporter turns this into Y-up with the front +Z.
"""

import json
import math
import os
import random
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
sys.path.insert(0, HERE)
import ftf  # noqa: E402
import formation as FM  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")
QA = os.path.join(REPO, "docs", "art", "qa", "fauna")
FPS = 30
TAU = 2 * math.pi
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def log(*a):
    ftf.log("fauna", *a)


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def table(xs, ys, t):
    """Piecewise smooth interpolation through (xs, ys)."""
    if t <= xs[0]:
        return ys[0]
    for i in range(len(xs) - 1):
        if t <= xs[i + 1]:
            u = (t - xs[i]) / (xs[i + 1] - xs[i])
            return lerp(ys[i], ys[i + 1], smooth(u))
    return ys[-1]


def Q(axis, deg):
    return Quaternion(Vector(axis).normalized(), math.radians(deg))


QI = Quaternion()


# =================================================================== textures (numpy)

def _np():
    import numpy as np
    return np


def lowpass_noise(size, freq, seed):
    """Seamless band-limited noise in [0,1] (about `freq` features per tile)."""
    np = _np()
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((size, size)))
    k = np.fft.fftfreq(size) * size
    kk = np.sqrt(k[:, None] ** 2 + k[None, :] ** 2)
    f *= np.exp(-(kk / max(freq, 0.5)) ** 2)
    a = np.real(np.fft.ifft2(f))
    a = (a - a.mean()) / (a.std() + 1e-9)
    return np.clip(0.5 + 0.18 * a, 0, 1).astype(np.float32)


def fbm(size, base, octaves, seed):
    np = _np()
    acc = np.zeros((size, size), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        acc += amp * lowpass_noise(size, base * 2 ** o, seed + 17 * o)
        tot += amp
        amp *= 0.5
    return acc / tot


def uv_grid(size):
    np = _np()
    c = (np.arange(size, dtype=np.float32) + 0.5) / size
    return np.meshgrid(c, c)  # u (columns), v (rows, bottom-up)


def save_png(rgb, path, alpha=None):
    from PIL import Image
    np = _np()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    a = np.clip(rgb, 0, 1)[::-1]
    if alpha is not None:
        a = np.concatenate([a, np.clip(alpha, 0, 1)[::-1][..., None]], -1)
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGBA").save(path, optimize=True)
    else:
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGB").save(path, optimize=True)
    return path


def nacre_maps(size, seed, base=(0.78, 0.77, 0.73), bands=14, lichen=0.35, gold=0.4, grime=0.5,
               moss=None):
    """Weathered nacre: growth bands, crazing cracks (some filled with gold), faint
    pastel sheen, lichen in the low spots. Returns rgb, orm, normal arrays."""
    np = _np()
    u, v = uv_grid(size)
    warp = fbm(size, 3, 3, seed)
    band = 0.5 + 0.5 * np.sin(TAU * (v * bands + 1.2 * warp))
    band = band ** 3
    edge, cid = ftf.periodic_voronoi(size, 22, seed + 3)
    crack = 1 - ftf.smoothstep(0.0, 0.07, edge)
    big = fbm(size, 4, 4, seed + 9)
    crack *= ftf.smoothstep(0.35, 0.6, big)
    height = 0.35 * band + 0.35 * fbm(size, 24, 3, seed + 5) - 0.6 * crack
    ao = ftf.cavity_ao(height, 6, 2.5)
    hue = fbm(size, 5, 2, seed + 11)
    tint = np.stack([0.5 + 0.5 * np.sin(TAU * hue + p) for p in (0.0, 2.1, 4.2)], -1)
    col = np.array(base, np.float32)[None, None, :] * (0.92 + 0.08 * band[..., None])
    col = col * (1 - 0.06) + 0.06 * tint * col.mean(-1, keepdims=True) * 1.3
    dirt = ftf.smoothstep(0.45, 0.75, fbm(size, 6, 4, seed + 13)) * grime
    col = col * (1 - 0.35 * dirt[..., None]) * (0.6 + 0.4 * ao[..., None])
    lich = ftf.smoothstep(0.62, 0.7, fbm(size, 9, 4, seed + 21)) * lichen
    lich_col = np.array((0.42, 0.46, 0.36), np.float32)
    col = col * (1 - lich[..., None]) + lich_col * (0.8 + 0.4 * fbm(size, 60, 1, seed + 22))[..., None] * lich[..., None]
    if moss is not None:
        m = moss[..., None]
        mc = np.array((0.30, 0.36, 0.22), np.float32) * (0.7 + 0.6 * fbm(size, 90, 1, seed + 23))[..., None]
        col = col * (1 - m) + mc * m
    gfill = crack * ftf.smoothstep(0.55, 0.62, fbm(size, 3, 2, seed + 31)) * gold
    gold_col = np.array((0.78, 0.58, 0.26), np.float32)
    col = col * (1 - gfill[..., None]) + gold_col * gfill[..., None]
    rough = 0.26 + 0.25 * dirt + 0.45 * lich + 0.1 * (1 - band)
    if moss is not None:
        rough = rough * (1 - moss) + 0.85 * moss
    rough = rough * (1 - gfill) + 0.3 * gfill
    metal = 0.85 * gfill
    orm = np.stack([ao, np.clip(rough, 0, 1), metal], -1)
    nrm = ftf.normal_from_height(height + 0.3 * lich * fbm(size, 80, 1, seed + 41), 6.0)
    return col, orm, nrm


def membrane_maps(size, seed, cells=10, rays=8, base=(0.64, 0.66, 0.67), holes=0.18, fray=True,
                  alpha_cell=0.36):
    """Sail membrane: Voronoi vein net + radiating rays along u, translucent cells,
    worn holes and a frayed trailing edge (v -> 1). Returns rgba, orm, normal."""
    np = _np()
    u, v = uv_grid(size)
    edge, cid = ftf.periodic_voronoi(size, cells, seed)
    vein = 1 - ftf.smoothstep(0.015, 0.075, edge)
    ray = np.abs(np.sin(math.pi * rays * u))
    ray = 1 - ftf.smoothstep(0.0, 0.05, ray)
    veins = np.maximum(vein * 0.8, ray)
    rnd = np.random.default_rng(seed).random(cells * cells).astype(np.float32)[cid]
    tint = np.stack([0.5 + 0.5 * np.sin(TAU * rnd + p) for p in (0.0, 2.1, 4.2)], -1)
    col = np.array(base, np.float32)[None, None, :] * (0.9 + 0.2 * fbm(size, 8, 2, seed + 2))[..., None]
    col = col * 0.93 + 0.07 * tint
    vein_col = np.array((0.86, 0.80, 0.66), np.float32)
    col = col * (1 - veins[..., None]) + vein_col * veins[..., None]
    alpha = alpha_cell + 0.12 * fbm(size, 6, 3, seed + 4)
    alpha = alpha * (1 - veins) + 0.95 * veins
    wear = fbm(size, 7, 4, seed + 6)
    hole = ftf.smoothstep(1 - holes * 0.22, 1 - holes * 0.2, wear) * (1 - ray)
    rim = ftf.smoothstep(1 - holes * 0.3, 1 - holes * 0.22, wear) * (1 - hole)
    col = col * (1 - 0.5 * rim[..., None]) + np.array((0.55, 0.45, 0.3), np.float32) * 0.5 * rim[..., None]
    alpha = np.maximum(alpha, 0.8 * rim) * (1 - hole)
    if fray:
        ragged = 0.9 + 0.08 * lowpass_noise(size, 40, seed + 8) * 2 - 0.08
        cut = ftf.smoothstep(ragged - 0.004, ragged + 0.004, v) * (1 - ray * 0.7)
        alpha = alpha * (1 - cut)
    height = veins * 0.8 + 0.15 * fbm(size, 30, 2, seed + 9)
    rough = 0.32 + 0.25 * veins
    orm = np.stack([1 - 0.15 * veins, rough, np.zeros_like(rough)], -1)
    nrm = ftf.normal_from_height(height, 5.0)
    return col, np.clip(alpha, 0, 1), orm, nrm


def bell_maps(size, seed):
    """Jelly bell: radial canals (u = around), concentric ring canal near the rim."""
    np = _np()
    u, v = uv_grid(size)
    canals = 1 - ftf.smoothstep(0.0, 0.06, np.abs(np.sin(math.pi * 16 * u + 0.4 * fbm(size, 6, 2, seed))))
    ringc = np.exp(-((v - 0.82) / 0.02) ** 2)
    edge, _ = ftf.periodic_voronoi(size, 16, seed + 1)
    cells = (1 - ftf.smoothstep(0.0, 0.05, edge)) * 0.35
    k = np.clip(canals * 0.7 + ringc + cells, 0, 1)
    col = np.array((0.84, 0.86, 0.85), np.float32) * (1 - 0.25 * k[..., None]) + np.array((0.95, 0.78, 0.45), np.float32) * 0.25 * k[..., None]
    orm = np.stack([np.ones_like(k), 0.1 + 0.15 * k, np.zeros_like(k)], -1)
    nrm = ftf.normal_from_height(k * 0.6, 3.0)
    return col, orm, nrm


def moss_body_maps(size, seed):
    """Soft velvet hide with moss fuzz and gold freckles (the Moss critter)."""
    np = _np()
    fuzz = fbm(size, 70, 3, seed)
    clump = fbm(size, 8, 3, seed + 1)
    base = np.array((0.36, 0.39, 0.30), np.float32)
    tip = np.array((0.58, 0.60, 0.46), np.float32)
    t = ftf.smoothstep(0.35, 0.75, fuzz * 0.6 + clump * 0.4)
    col = base * (1 - t[..., None]) + tip * t[..., None]
    edge, cid = ftf.periodic_voronoi(size, 40, seed + 2)
    rnd = np.random.default_rng(seed).random(1600).astype(np.float32)[cid]
    freck = (1 - ftf.smoothstep(0.18, 0.3, 0.5 - edge * 0.5 + 0.0)) * (rnd > 0.86)
    freck = (edge > 0.25) * (rnd > 0.9) * 1.0
    col = col * (1 - freck[..., None]) + np.array((0.8, 0.62, 0.3), np.float32) * freck[..., None]
    h = fuzz * 0.6 + clump * 0.4
    orm = np.stack([ftf.cavity_ao(h, 4, 2.0), 0.82 - 0.4 * freck, np.zeros_like(h)], -1)
    nrm = ftf.normal_from_height(h, 9.0)
    return col, orm, nrm


# =================================================================== mesh builder

class MB:
    """bmesh builder with per-loop UVs, material index, vertex tags (for weights)
    and explicit or distance-based skin weights."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.dl = self.bm.verts.layers.deform.verify()
        self.tag = self.bm.verts.layers.int.new("tag")
        self.weld = []
        self.explicit = set()
        self.tags = {}

    def tag_id(self, name):
        if name not in self.tags:
            self.tags[name] = len(self.tags) + 1
        return self.tags[name]

    def vert(self, co, tag=None, w=None):
        v = self.bm.verts.new(Vector(co))
        if tag:
            v[self.tag] = self.tag_id(tag)
        if w:
            self.explicit.add(v)
            self._pending = getattr(self, "_pending", [])
            self._pending.append((v, w))
        return v

    def face(self, vs, uvs, mat=0, flip=False):
        if flip:
            vs, uvs = vs[::-1], uvs[::-1]
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = mat
        for lp, uv in zip(f.loops, uvs):
            lp[self.uv].uv = uv
        return f

    def grid(self, P, U, mat=0, tag=None, flip=False, w=None):
        """Open quad grid: P[i][j] points (rows i, columns j), U[i][j] uvs."""
        V = [[self.vert(P[i][j], tag, w(i, j) if w else None) for j in range(len(P[0]))] for i in range(len(P))]
        for i in range(len(P) - 1):
            for j in range(len(P[0]) - 1):
                self.face([V[i][j], V[i][j + 1], V[i + 1][j + 1], V[i + 1][j]],
                          [U[i][j], U[i][j + 1], U[i + 1][j + 1], U[i + 1][j]], mat, flip)
        return V

    def rings(self, R, mat=0, tag=None, v_of=None, u_span=1.0, flip=False, w=None, cap0=None, cap1=None):
        """Closed loft through rings R[i] (lists of points). UV u = around * u_span, v = v_of(i)."""
        n = len(R[0])
        m = len(R)
        V = []
        for i in range(m):
            row = [self.vert(R[i][j], tag, w(i, j) if w else None) for j in range(n)]
            dup = self.vert(R[i][0], tag, w(i, 0) if w else None)
            self.weld += [row[0], dup]
            V.append(row + [dup])
        vv = [v_of(i) if v_of else i / (m - 1) for i in range(m)]
        for i in range(m - 1):
            for j in range(n):
                uv = [(j / n * u_span, vv[i]), ((j + 1) / n * u_span, vv[i]),
                      ((j + 1) / n * u_span, vv[i + 1]), (j / n * u_span, vv[i + 1])]
                self.face([V[i][j], V[i][j + 1], V[i + 1][j + 1], V[i + 1][j]], uv, mat, flip)
        for cap, i, rev in ((cap0, 0, True), (cap1, m - 1, False)):
            if cap is None:
                continue
            c = self.vert(cap, tag, w(i, 0) if w else None)
            for j in range(n):
                vs = [V[i][j], V[i][j + 1], c]
                uv = [(j / n * u_span, vv[i]), ((j + 1) / n * u_span, vv[i]), ((j + 0.5) / n * u_span, vv[i] + (-0.02 if rev else 0.02))]
                self.face(vs, uv, mat, flip ^ (not rev))
        return V

    def tube(self, pts, radius, sides, mat=0, tag=None, squash=1.0, side_axis=None, v0=0.0, v_scale=1.0,
             u_span=1.0, w=None, cap0=True, cap1=True, twist=0.0, rmod=None, flip=False):
        """Swept tube along pts; radius(s) callable or number. w(s) -> weights."""
        pts = [Vector(p) for p in pts]
        m = len(pts)
        R = []
        u_prev, t_prev = None, None
        length = [0.0]
        for i in range(1, m):
            length.append(length[-1] + (pts[i] - pts[i - 1]).length)
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
            if side_axis is not None:
                uax = (Vector(side_axis) - t * Vector(side_axis).dot(t)).normalized()
            elif u_prev is None:
                ref = Z if abs(t.z) < 0.9 else X
                uax = t.cross(ref).normalized()
            else:
                uax = t_prev.rotation_difference(t) @ u_prev
                uax = (uax - t * uax.dot(t)).normalized()
            vax = t.cross(uax)
            s = i / (m - 1)
            r = radius(s) if callable(radius) else radius
            ring = []
            for k in range(sides):
                a = TAU * k / sides + twist * s
                rr = r * (rmod(s, a) if rmod else 1.0)
                ring.append(p + rr * (math.cos(a) * uax * squash + math.sin(a) * vax))
            R.append(ring)
            u_prev, t_prev = uax, t
        tot = max(length[-1], 1e-6)
        wf = (lambda i, j: w(i / (m - 1))) if w else None
        c0 = pts[0] - (pts[1] - pts[0]).normalized() * 0.4 * (radius(0) if callable(radius) else radius) if cap0 else None
        c1 = pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.4 * (radius(1) if callable(radius) else radius) if cap1 else None
        return self.rings(R, mat, tag, v_of=lambda i: v0 + length[i] * v_scale, u_span=u_span, w=wf,
                          cap0=c0, cap1=c1, flip=flip)

    def gem(self, center, axis, length, width, sides=6, mat=0, tag=None, w=None, side_axis=None, offset=0.0,
            squash=1.0):
        """Closed bipyramid crystal along axis (offset shifts the widest ring)."""
        c, a = Vector(center), Vector(axis).normalized()
        ref = Vector(side_axis) if side_axis is not None else (Z if abs(a.z) < 0.9 else X)
        u = a.cross(ref).normalized()
        v = a.cross(u)
        mid = c + a * offset * length
        ring = [self.vert(mid + width * (math.cos(TAU * k / sides) * u * squash + math.sin(TAU * k / sides) * v), tag, w)
                for k in range(sides)]
        top = self.vert(c + a * length * 0.5, tag, w)
        bot = self.vert(c - a * length * 0.5, tag, w)
        for k in range(sides):
            l = (k + 1) % sides
            uv0, uv1 = (k / sides, 0.5), ((k + 1) / sides, 0.5)
            self.face([ring[k], ring[l], top], [uv0, uv1, ((k + 0.5) / sides, 1.0)], mat)
            self.face([ring[l], ring[k], bot], [uv1, uv0, ((k + 0.5) / sides, 0.0)], mat)

    def finish(self, name, mats, col, arm=None, bone_tags=None, power=4.0, eps=0.02, max_infl=3):
        """Welds seams, assigns weights, builds the object (parented to arm)."""
        bm = self.bm
        pend = getattr(self, "_pending", [])
        if self.weld:
            bmesh.ops.remove_doubles(bm, verts=list(set(self.weld)), dist=1e-6)
        bm.verts.index_update()
        me = bpy.data.meshes.new(name)
        bm.normal_update()
        # weights
        if arm is not None:
            segs = {}
            for b in arm.data.bones:
                segs[b.name] = (b.head_local.copy(), b.tail_local.copy())
            names = [b.name for b in arm.data.bones]
            gid = {n: i for i, n in enumerate(names)}
            inv_tag = {v: k for k, v in self.tags.items()}
            pend_map = {}
            for v, w in pend:
                if v.is_valid:
                    pend_map[v.index] = w
            weights = []
            for v in bm.verts:
                if v.index in pend_map:
                    weights.append(pend_map[v.index])
                    continue
                tg = inv_tag.get(v[self.tag])
                cand = bone_tags.get(tg) if (bone_tags and tg) else None
                if not cand:
                    cand = names
                ws = []
                for bn in cand:
                    h, t = segs[bn]
                    d = (t - h)
                    L2 = max(d.length_squared, 1e-12)
                    s = max(0.0, min(1.0, (v.co - h).dot(d) / L2))
                    dist = (v.co - (h + d * s)).length
                    ws.append((1.0 / (dist * dist + eps * eps) ** (power / 2), bn))
                ws.sort(reverse=True)
                ws = ws[:max_infl]
                tot = sum(x for x, _ in ws)
                weights.append({bn: x / tot for x, bn in ws if x / tot > 0.02})
        bm.to_mesh(me)
        bm.free()
        for m in mats:
            me.materials.append(m)
        obj = ftf.link(bpy.data.objects.new(name, me), col)
        if arm is not None:
            groups = {}
            for i, w in enumerate(weights):
                tot = sum(w.values())
                for bn, x in w.items():
                    if bn not in groups:
                        groups[bn] = obj.vertex_groups.new(name=bn)
                    groups[bn].add([i], x / tot, "REPLACE")
            obj.parent = arm
            mod = obj.modifiers.new("Armature", "ARMATURE")
            mod.object = arm
        obj.data.shade_smooth()
        return obj


# =================================================================== rig + animation

def make_armature(name, bones, col):
    ad = bpy.data.armatures.new(name)
    arm = ftf.link(bpy.data.objects.new(name, ad), col)
    ftf.select_only([arm], arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for b in bones:
        e = ad.edit_bones.new(b[0])
        e.head = Vector(b[1])
        e.tail = Vector(b[2])
        e.roll = b[4] if len(b) > 4 else 0.0
        if b[3]:
            e.parent = eb[b[3]]
            e.use_connect = False
        eb[b[0]] = e
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


def chain(prefix, pts, parent, roll=0.0):
    out = []
    prev = parent
    for i in range(len(pts) - 1):
        nm = f"{prefix}_{i}"
        out.append((nm, tuple(pts[i]), tuple(pts[i + 1]), prev, roll))
        prev = nm
    return out


def bake_clip(arm, name, frames, pose_fn, step=1, mode="arm"):
    """Keys frames 0..frames (inclusive) into a new action `name`.
    pose_fn(u, t) -> {bone: (quat_arm, loc_arm, scale_local)} (mode "arm": rotation and
    location in the bone's rest frame expressed in armature axes) or
    {bone: Matrix4 armature-space pose matrix} (mode "matrix", parent-free bones)."""
    ad = arm.animation_data or arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    rq = {n: m.to_quaternion() for n, m in rest.items()}
    prev = {}
    t0 = time.time()
    for f in list(range(0, frames, step)) + [frames]:
        u = f / frames
        pose = pose_fn(u, f / FPS)
        for pb in arm.pose.bones:
            e = pose.get(pb.name)
            if mode == "matrix" and e is not None:
                basis = rest[pb.name].inverted() @ e
                loc, q, sc = basis.decompose()
            else:
                q_arm, loc_arm, sc = (e if e is not None else (QI, None, None))
                q_arm = q_arm or QI
                r = rq[pb.name]
                q = r.inverted() @ q_arm @ r
                loc = (rest[pb.name].to_3x3().inverted() @ Vector(loc_arm)) if loc_arm is not None else Vector()
                sc = Vector(sc) if sc is not None else Vector((1, 1, 1))
            q.normalize()
            if pb.name in prev and q.dot(prev[pb.name]) < 0:
                q.negate()
            prev[pb.name] = q.copy()
            pb.rotation_quaternion = q
            pb.location = loc
            pb.scale = sc
            pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
            pb.keyframe_insert("location", frame=f, group=pb.name)
            pb.keyframe_insert("scale", frame=f, group=pb.name)
    # make the keys linear so sampling between frames stays exact
    try:
        fcs = act.fcurves
    except AttributeError:
        fcs = []
    for fc in fcs:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    log(f"clip {name}: {frames} frames ({frames / FPS:.2f} s) keyed in {time.time() - t0:.1f}s")
    return act


def stash_clips(arm, acts):
    ad = arm.animation_data
    for act in acts:
        tr = ad.nla_tracks.new()
        tr.name = act.name
        st = tr.strips.new(act.name, 0, act)
        tr.mute = True
    ad.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = QI
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


# =================================================================== materials

def tex_material(asset, part, maps, double_sided=False, alpha=None, size=1024):
    """Writes the maps as PNG and returns a glTF-ready PBR material."""
    rgb, orm, nrm = maps
    d = os.path.join(OUT, "tex")
    nb = f"{asset}_basecolor_{part}"
    no = f"{asset}_orm_{part}"
    nn = f"{asset}_normal_{part}"
    save_png(rgb, os.path.join(d, nb + ".png"), alpha)
    save_png(orm, os.path.join(d, no + ".png"))
    save_png(nrm, os.path.join(d, nn + ".png"))
    imgs = []
    for nm, data in ((nb, False), (no, True), (nn, True)):
        im = bpy.data.images.load(os.path.join(d, nm + ".png"))
        im.name = nm
        if data:
            im.colorspace_settings.name = "Non-Color"
        imgs.append(im)
    mname = f"M_{asset.replace('fauna_', '').title().replace('_', '')}_{part.title()}"
    m = ftf.pbr_material(mname, *imgs, double_sided=double_sided)
    if alpha is not None:
        nt = m.node_tree
        tb = [n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image == imgs[0]][0]
        nt.links.new(tb.outputs["Alpha"], nt.nodes["Principled BSDF"].inputs["Alpha"])
        try:
            m.surface_render_method = "BLENDED"
        except AttributeError:
            m.blend_method = "BLEND"
    return m


def glow_material(asset, part="Glow", color=(1.0, 0.78, 0.42), strength=5.0, base=(0.9, 0.8, 0.6)):
    mname = f"M_{asset.replace('fauna_', '').title().replace('_', '')}_{part}"
    return ftf.simple_material(mname, base, rough=0.3, emit=color, emit_strength=strength)


# =================================================================== creatures

def spline(points, n):
    P = [Vector(p) for p in points]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    segs = len(P) - 3
    out = []
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = P[k], P[k + 1], P[k + 2], P[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out


# ------------------------------------------------------------------ skyray

def build_skyray(col):
    """Manta-like sky ray, 6.4 m span: nacre lens body with a dorsal ridge, two
    translucent swept wings with radiating nacre spines and a frayed, torn trailing
    edge, ammonite-curled cephalic horns, a whip tail; gold glow beads."""
    A = "fauna_skyray"
    rng = random.Random(311)
    m_nacre = tex_material(A, "nacre", nacre_maps(1024, 311, base=(0.74, 0.74, 0.71), bands=18, lichen=0.25))
    rgb, alpha, orm, nrm = membrane_maps(1024, 312, cells=12, rays=6)
    m_mem = tex_material(A, "membrane", (rgb, orm, nrm), double_sided=True, alpha=alpha)
    m_glow = glow_material(A)
    mats = [m_nacre, m_mem, m_glow]

    def wing_xyz(side, s, c):
        x = 0.36 + 2.86 * s
        yle = -0.9 + 1.5 * s ** 1.5 - 0.22 * math.sin(math.pi * s)
        chord = 2.0 * (1 - s) ** 0.85 + 0.03
        fr = 0.0
        if s > 0.12:
            fr = 0.05 * abs(math.sin(7.5 * math.pi * s)) * c ** 8
            for ts, tw in ((0.46, 0.035), (0.71, 0.025)):  # two old tears
                fr += 0.28 * math.exp(-((s - ts) / tw) ** 2) * c ** 6
        y = yle + chord * c - fr
        z = 0.09 * (1 - s) * math.sin(math.pi * c) + 0.16 * s ** 2.4 - 0.04 * s + 0.03
        return Vector((side * x, y, z))

    def wing_mid(side, s):
        return wing_xyz(side, s, 0.38)

    joints = [0.0, 0.25, 0.5, 0.75, 1.0]
    bones = [("root", (0, 0, 0), (0, 0, 0.4), None),
             ("spine_0", (0, -0.1, 0.05), (0, -1.25, 0.05), "root"),
             ("spine_1", (0, -0.1, 0.05), (0, 1.0, 0.05), "root")]
    tail_pts = [Vector((0, 1.0 + 3.4 * k / 6, 0.05 - 0.05 * k / 6)) for k in range(7)]
    bones += chain("tail", tail_pts, "spine_1")
    for side, sn in ((1, "L"), (-1, "R")):
        bones += chain(f"wing_{sn}", [wing_mid(side, s) * Vector((1, 1, 0)) + Vector((0, 0, 0.05)) for s in joints], "root")
        bones.append((f"horn_{sn}", (side * 0.26, -1.05, 0.06), (side * 0.36, -1.75, 0.1), "spine_0"))
    arm = make_armature(A + "_rig", bones, col)

    mb = MB()
    # body: lens with a dorsal ridge
    ts = [i / 17 for i in range(18)]
    R = []
    n = 18
    for t in ts:
        w = table([0, 0.1, 0.25, 0.45, 0.65, 0.85, 1.0], [0.08, 0.30, 0.47, 0.52, 0.44, 0.24, 0.07], t)
        h = table([0, 0.1, 0.25, 0.45, 0.65, 0.85, 1.0], [0.05, 0.13, 0.19, 0.21, 0.18, 0.11, 0.05], t)
        y = -1.3 + 2.4 * t
        ring = []
        for j in range(n):
            a = TAU * j / n
            ca, sa = math.cos(a), math.sin(a)
            z = h * (sa if sa > 0 else 0.5 * sa) + 0.06 * math.exp(-(ca / 0.18) ** 2) * (sa > 0) * math.sin(math.pi * t)
            plate = 1.0 + 0.025 * (1 if (int(t * 17) % 2) else -1) * (sa > 0)
            ring.append(Vector((w * ca * plate, y, 0.05 + z * plate)))
        R.append(ring)
    mb.rings(R, 0, "body", v_of=lambda i: ts[i] * 2.4, u_span=1.6,
             cap0=Vector((0, -1.36, 0.05)), cap1=Vector((0, 1.15, 0.05)))
    # wings
    S, C = 28, 12
    for side, sn in ((1, "L"), (-1, "R")):
        P = [[wing_xyz(side, i / (S - 1), j / (C - 1)) for j in range(C)] for i in range(S)]
        U = [[(i / (S - 1), j / (C - 1)) for j in range(C)] for i in range(S)]
        mb.grid(P, U, 1, f"wing_{sn}", flip=(side < 0))
        # nacre spines (radiating rays of the sail)
        for k, c0 in enumerate((0.06, 0.24, 0.42, 0.6, 0.78)):
            pts = []
            for i in range(14):
                s = 0.02 + 0.9 * (i / 13) * (1 - 0.25 * c0)
                c = c0 + (0.5 - c0) * 0.35 * s
                pts.append(wing_xyz(side, s, c) + Vector((0, 0, 0.012)))
            mb.tube(pts, lambda s: 0.03 * (1 - s) + 0.004, 3, 0, f"wing_{sn}", squash=1.6, side_axis=Z)
        # glow beads near the leading edge
        for i in range(6):
            s = 0.12 + 0.13 * i
            mb.gem(wing_xyz(side, s, 0.08) + Vector((0, 0, 0.02)), Vector((side, 0.3, 0)), 0.07, 0.025, 4, 2, f"wing_{sn}")
        # cephalic horn, curling into an ammonite whorl at the tip
        pts = []
        for i in range(22):
            s = i / 21
            if s < 0.45:
                p = Vector((side * (0.26 + 0.12 * s), -1.05 - 1.3 * s, 0.06 + 0.05 * s))
            else:
                a = (s - 0.45) / 0.55 * 1.7 * math.pi
                r = 0.16 * (1 - 0.75 * (s - 0.45) / 0.55)
                base = Vector((side * 0.315, -1.635, 0.083))
                p = base + Vector((side * (r - 0.16) * 0.2, -r * math.sin(a), 0.16 - r * math.cos(a) + 0.0))
                p.z = 0.083 + (0.16 - r * math.cos(a)) * 0.9 - 0.0
            pts.append(p)
        pts = spline(pts, 22)
        mb.tube(pts, lambda s: 0.06 * (1 - s) ** 0.8 + 0.006, 5, 0, f"horn_{sn}", squash=0.55, side_axis=Vector((side, 0, 0)))
    # dorsal glow beads
    for i in range(9):
        t = 0.15 + 0.08 * i
        y = -1.3 + 2.4 * t
        h = table([0, 0.1, 0.25, 0.45, 0.65, 0.85, 1.0], [0.05, 0.13, 0.19, 0.21, 0.18, 0.11, 0.05], t)
        mb.gem((0, y, 0.05 + h + 0.06 * math.sin(math.pi * t) + 0.01), Y, 0.08, 0.022, 4, 2, "body")
    # tail with a pair of small fins near the base and a frayed end filament
    tp = [Vector((0, 1.0 + 3.4 * s, 0.05 - 0.05 * s)) for s in [i / 23 for i in range(24)]]
    mb.tube(tp, lambda s: 0.08 * (1 - s) ** 1.4 + 0.006, 6, 0, "tail")
    for side, sn in ((1, "L"), (-1, "R")):
        P, U = [], []
        for i in range(5):
            s = i / 4
            row, urow = [], []
            for j in range(3):
                c = j / 2
                y = 1.25 + 0.55 * s + 0.15 * c
                x = side * (0.05 + 0.32 * c * (1 - s * 0.9))
                row.append(Vector((x, y, 0.06)))
                urow.append((0.85 + 0.15 * c, s * 0.3))
            P.append(row)
            U.append(urow)
        mb.grid(P, U, 1, "tail", flip=(side > 0))
    tags = {"body": ["spine_0", "spine_1", "tail_0"], "tail": [b[0] for b in bones if b[0].startswith("tail")] + ["spine_1"]}
    for sn in "LR":
        tags[f"wing_{sn}"] = [f"wing_{sn}_{i}" for i in range(4)] + ["spine_0", "spine_1"]
        tags[f"horn_{sn}"] = [f"horn_{sn}", "spine_0"]
    obj = mb.finish(A, mats, col, arm, tags, power=4.0, eps=0.05)

    WA = [6.0, 6.0, 6.5, 7.0]
    lag = 0.6

    def wings(phi, ampL=1.0, ampR=1.0, offL=0.0, offR=0.0):
        p = {}
        for k in range(4):
            aL = ampL * WA[k] * math.sin(phi - k * lag) + offL / 4
            aR = ampR * WA[k] * math.sin(phi - k * lag) + offR / 4
            twL = 3.0 * ampL * math.cos(phi - k * lag)
            twR = 3.0 * ampR * math.cos(phi - k * lag)
            p[f"wing_L_{k}"] = (Q(Y, -aL) @ Q(X, twL), None, None)
            p[f"wing_R_{k}"] = (Q(Y, aR) @ Q(X, twR), None, None)
        return p

    def tail(phi, bend=0.0):
        p = {}
        for k in range(6):
            p[f"tail_{k}"] = (Q(Z, 4.0 * math.sin(phi - 0.8 * k) + bend) @ Q(X, 2.5 * math.sin(2 * phi - 0.9 * k)), None, None)
        return p

    def glide(u, t):
        phi = TAU * u
        p = wings(phi)
        p.update(tail(phi))
        p["root"] = (Q(X, 1.5 * math.sin(phi + 0.6)), Vector((0, 0, -0.12 * math.sin(phi))), None)
        for sn, sd in (("L", 1), ("R", -1)):
            p[f"horn_{sn}"] = (Q(X, 6 * math.sin(phi + 1.0)) @ Q(Z, sd * 3 * math.sin(phi + 2.0)), None, None)
        p["spine_0"] = (Q(X, -1.5 * math.sin(phi + 0.3)), None, None)
        return p

    def bank(sign):
        def fn(u, t):
            phi = TAU * u
            inner, outer = 0.55, 1.35
            if sign > 0:   # left bank: left wing (+X) is the inner, lower wing
                p = wings(phi, inner, outer, offL=-8.0, offR=10.0)
            else:
                p = wings(phi, outer, inner, offL=10.0, offR=-8.0)
            p.update(tail(phi, bend=sign * 5.0))
            p["root"] = (Q(Y, sign * 26.0 + 2.0 * math.sin(phi)) @ Q(X, -3.0), Vector((0, 0, -0.1 * math.sin(phi))), None)
            for sn in "LR":
                p[f"horn_{sn}"] = (Q(Z, sign * 6.0) @ Q(X, 5 * math.sin(phi + 1.0)), None, None)
            return p
        return fn

    acts = [bake_clip(arm, "glide", 180, glide), bake_clip(arm, "bank", 180, bank(1)),
            bake_clip(arm, "bank_r", 180, bank(-1))]
    stash_clips(arm, acts)
    return {"objs": [arm, obj], "clips": {"glide": True, "bank": True, "bank_r": True}}


# ------------------------------------------------------------------ driftjelly

def jelly_c(u):
    """Contraction 0..1 over one pulse: quick squeeze, slow relax (C1 periodic)."""
    u = u % 1.0
    return math.sin(math.pi * u ** 0.6) ** 2


def build_driftjelly(col):
    """Small bioluminescent drifting jelly: transmissive scalloped bell with radial
    canals, a cluster of glowing nacre crystals inside, 8 marginal filaments with
    gold beads and 4 frilled oral arms (secondary motion)."""
    A = "fauna_driftjelly"
    rng = random.Random(4207)
    m_bell = tex_material(A, "bell", bell_maps(512, 4207))
    m_glow = glow_material(A, color=(1.0, 0.80, 0.48), strength=6.0)
    rgb, alpha, orm, nrm = membrane_maps(512, 4208, cells=8, rays=3, base=(0.82, 0.8, 0.72), holes=0.0, fray=False,
                                         alpha_cell=0.55)
    m_fil = tex_material(A, "filament", (rgb, orm, nrm), double_sided=True, alpha=alpha)
    mats = [m_bell, m_glow, m_fil]
    RB, HB = 0.18, 0.20
    NF = 8
    bones = [("root", (0, 0, -0.05), (0, 0, 0.05), None), ("bell", (0, 0, 0.0), (0, 0, 0.22), "root")]
    fil_paths, arm_paths = [], []
    for k in range(NF):
        th = TAU * k / NF
        d = Vector((math.cos(th), math.sin(th), 0))
        bones.append((f"rim_{k}", tuple(d * 0.09 + Vector((0, 0, 0.12))), tuple(d * 0.195 + Vector((0, 0, -0.03))), "bell"))
        L = rng.uniform(0.85, 1.2)
        pts = [d * (0.195 + 0.06 * math.sin(math.pi * s * 0.7)) + Vector((0, 0, -0.03 - L * s)) for s in [i / 20 for i in range(21)]]
        fil_paths.append(pts)
        bones += chain(f"fil_{k}", [pts[i] for i in (0, 4, 8, 12, 16, 20)], f"rim_{k}")
    for j in range(4):
        th = TAU * (j + 0.5) / 4
        d = Vector((math.cos(th), math.sin(th), 0))
        L = rng.uniform(0.45, 0.6)
        pts = [d * (0.02 + 0.05 * math.sin(math.pi * s)) + Vector((0, 0, 0.02 - L * s)) for s in [i / 18 for i in range(19)]]
        arm_paths.append(pts)
        bones += chain(f"arm_{j}", [pts[i] for i in (0, 5, 10, 14, 18)], "bell")
    arm = make_armature(A + "_rig", bones, col)

    mb = MB()
    # bell profile: outer top -> rim -> lip -> inner (subumbrella) back to the axis
    prof = []
    for i in range(11):
        a = math.radians(4 + 98 * i / 10)
        prof.append((RB * math.sin(a), HB * math.cos(a) - 0.0, i / 10 * 0.8))
    prof.append((RB * 0.97, -0.045, 0.86))
    for i in range(6):
        s = i / 5
        a = math.radians(95 - 85 * s)
        prof.append((RB * 0.86 * math.sin(a), 0.75 * HB * math.cos(a) - 0.03, 0.88 + 0.12 * s))
    NS = 32
    R = []
    for (r, z, v) in prof:
        ring = []
        rimness = max(0.0, (v - 0.55) / 0.35) if v <= 0.9 else max(0.0, 1 - (v - 0.88) / 0.12)
        for j in range(NS):
            th = TAU * j / NS
            lobe = math.cos(NF * th)
            rr = r * (1 + 0.07 * rimness ** 3 * lobe)
            zz = z - 0.02 * rimness ** 4 * (1 - lobe) * 0.5
            ring.append(Vector((rr * math.cos(th), rr * math.sin(th), zz)))
        R.append(ring)
    mb.rings(R, 0, "bell", v_of=lambda i: prof[i][2], u_span=1.0,
             cap0=Vector((0, 0, HB + 0.004)), cap1=Vector((0, 0, 0.75 * HB - 0.03 + 0.004)))
    # inner glowing crystal cluster
    for i in range(6):
        a = TAU * i / 6 + 0.3
        dirv = Vector((0.35 * math.cos(a), 0.35 * math.sin(a), 1)).normalized()
        mb.gem(Vector((0.025 * math.cos(a), 0.025 * math.sin(a), 0.07)) + dirv * 0.03, dirv, rng.uniform(0.07, 0.11),
               0.014, 5, 1, "bell", w={"bell": 1.0})
    mb.gem((0, 0, 0.08), Z, 0.12, 0.018, 6, 1, "bell", w={"bell": 1.0})
    tags = {"bell": ["bell"] + [f"rim_{k}" for k in range(NF)]}
    # filaments (flat ribbons facing outward so they catch light) + glow beads
    for k, pts in enumerate(fil_paths):
        tg = f"fil{k}"
        tags[tg] = [f"fil_{k}_{i}" for i in range(5)] + [f"rim_{k}"]
        mb.tube(pts, lambda s: 0.009 * (1 - s) + 0.002, 3, 2, tg, u_span=0.2, v_scale=0.4)
        for i in (3, 7, 11, 15, 19):
            mb.gem(pts[i], Z, 0.026, 0.009, 4, 1, tg)
    for j, pts in enumerate(arm_paths):
        tg = f"arm{j}"
        tags[tg] = [f"arm_{j}_{i}" for i in range(4)] + ["bell"]
        mb.tube(pts, lambda s: 0.028 * (1 - s) ** 0.7 + 0.004, 6, 2, tg, squash=0.3, twist=4 * math.pi,
                rmod=lambda s, a: 1 + 0.25 * math.sin(30 * s + 3 * a), u_span=0.3, v_scale=0.5)
    obj = mb.finish(A, mats, col, arm, tags, power=4.0, eps=0.015)

    def pulse(u, t):
        phi = TAU * u
        c = jelly_c(u)
        p = {"root": (QI, Vector((0, 0, 0.035 * math.sin(phi - 1.2))), None),
             "bell": (QI, None, (1 - 0.11 * c, 1 + 0.07 * c, 1 - 0.11 * c))}
        for k in range(NF):
            th = TAU * k / NF
            radial = Vector((math.cos(th), math.sin(th), 0))
            tang = Z.cross(radial)
            p[f"rim_{k}"] = (Q(tang, 22 * c - 4 * jelly_c(u - 0.3)), None, None)
            for i in range(5):
                lagu = u - 0.07 * (i + 1)
                ang = 9 * jelly_c(lagu) - 7 * jelly_c(lagu - 0.25) + 2.0
                sway = 4.5 * math.sin(phi + 0.8 * k - 0.7 * i)
                p[f"fil_{k}_{i}"] = (Q(tang, ang) @ Q(radial, sway), None, None)
        for j in range(4):
            th = TAU * (j + 0.5) / 4
            radial = Vector((math.cos(th), math.sin(th), 0))
            tang = Z.cross(radial)
            for i in range(4):
                lagu = u - 0.1 * (i + 1)
                p[f"arm_{j}_{i}"] = (Q(tang, -6 * jelly_c(lagu) + 3 * math.sin(phi - 0.9 * i + j)) @
                                     Q(Z, 8 * math.sin(phi - 0.6 * i + 1.3 * j)), None, None)
        return p

    acts = [bake_clip(arm, "pulse", 72, pulse)]
    stash_clips(arm, acts)
    return {"objs": [arm, obj], "clips": {"pulse": True}}


# ------------------------------------------------------------------ glyphmote

def mote_geometry():
    """One nacre shard, long axis +X (0.30 m), asymmetric facets. Returns (verts, faces)."""
    L, W, T = 0.30, 0.07, 0.032
    ring = []
    for k in range(6):
        a = TAU * k / 6 + 0.25
        ring.append((0.035 + 0.012 * math.cos(3 * a), W * 0.5 * math.cos(a) * (1.0 + 0.2 * (k % 2)), T * 0.5 * math.sin(a) * 1.6))
    v = ring + [(L * 0.55, 0.004, 0.003), (-L * 0.45, -0.006, 0.0)]
    f = []
    for k in range(6):
        l = (k + 1) % 6
        f.append((k, l, 6))
        f.append((l, k, 7))
    # a small chipped facet crystal grown on one side
    base = len(v)
    v += [(0.0, 0.018, 0.008), (0.05, 0.03, 0.006), (0.02, 0.05, 0.004), (0.01, 0.022, 0.016)]
    f += [(base, base + 1, base + 3), (base + 1, base + 2, base + 3), (base + 2, base, base + 3), (base, base + 2, base + 1)]
    return v, f


def gl_to_bl(p):
    return Vector((p[0], -p[2], p[1]))


def build_glyphmote(col):
    """Glyph motes: a single mote mesh for GPU instancing (`glyphmote`) plus a
    96-mote skinned demo swarm (`glyphmote_swarm`, one bone per mote) carrying the
    baked clips 'orbit' (24 s loop around a Shell) and 'assemble' (4 s, motes fly
    into the logogram ring of glyphmote_formation.json, example sign)."""
    A = "fauna_glyphmote"
    m = ftf.simple_material("M_Glyphmote_Nacre", (0.86, 0.84, 0.80), rough=0.18, metal=0.0,
                            emit=(1.0, 0.8, 0.5), emit_strength=0.6)
    mv, mf = mote_geometry()
    # instancing source
    me = bpy.data.meshes.new("glyphmote")
    me.from_pydata([Vector(p) for p in mv], [], mf)
    me.materials.append(m)
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (co.x / 0.3 + 0.5, co.y / 0.1 + 0.5)
    me.shade_flat()
    single = ftf.link(bpy.data.objects.new("glyphmote", me), col)
    single["ftf_role"] = "instancing source: one mote, long axis +X"

    N = FM.POOL
    targets = FM.formation([0, 1, 2, 3], 1, False)
    center = Vector(FM.FORMATION_CENTER_M)
    S = FM.FORMATION_SCALE_M

    def frame_from(dir_bl, up_bl, spin=0.0):
        by = dir_bl.normalized()
        bz = (up_bl - by * up_bl.dot(by)).normalized()
        if spin:
            bz = Quaternion(by, spin) @ bz
        bx = by.cross(bz)
        return Matrix((bx, by, bz)).transposed()

    def orbit_m(i, t):
        p, v = FM.orbit_position(i, t)
        o = FM.orbit_params(i)
        spin = TAU * o["spin_laps"] * t / FM.ORBIT["period_s"]
        R = frame_from(gl_to_bl(v), Z, spin)
        M = R.to_4x4()
        M.translation = gl_to_bl(p)
        return M

    def target_m(i):
        x, y, z, ang, used = targets[i]
        p_gl = center + Vector((x, y, z)) * S
        d_gl = Vector((math.cos(ang), math.sin(ang), 0))
        R = frame_from(gl_to_bl(d_gl), gl_to_bl((0, 0, 1)))
        M = R.to_4x4()
        M.translation = gl_to_bl(p_gl)
        return M

    bones = [("root", (0, 0, 0), (0, 0, 1.0), None)]
    rest = []
    for i in range(N):
        M = orbit_m(i, 0.0)
        h = M.translation
        rest.append(M)
        bones.append((f"mote_{i:02d}", tuple(h), tuple(h + M.col[1].to_3d() * 0.25), "root"))
    arm = make_armature(A + "_rig", bones, col)
    # align the mesh to each bone's actual rest frame (roll may differ from M)
    mb = MB()
    for i in range(N):
        b = arm.data.bones[f"mote_{i:02d}"]
        BM = b.matrix_local
        bx, by, bz = BM.col[0].to_3d(), BM.col[1].to_3d(), BM.col[2].to_3d()
        h = BM.translation
        vs = [mb.vert(h + p[0] * by - p[1] * bx + p[2] * bz, None, {f"mote_{i:02d}": 1.0}) for p in mv]
        for fc in mf:
            mb.face([vs[k] for k in fc], [(mv[k][0] / 0.3 + 0.5, mv[k][1] / 0.1 + 0.5) for k in fc], 0)
    swarm = mb.finish("glyphmote_swarm", [m], col, arm)
    swarm.data.shade_flat()

    def to_bone(M):
        # mesh motes are modelled along the bone's Y; build the pose matrix in that convention:
        # columns (bx, by, bz) = (-ly, lx, lz) of the mote frame where lx = mote long axis.
        lx, ly, lz = M.col[0].to_3d(), M.col[1].to_3d(), M.col[2].to_3d()
        R = Matrix((-ly, lx, lz)).transposed().to_4x4()
        R.translation = M.translation
        return R

    # frame_from returns columns (bx=by x bz, by=dir, bz=up): dir is the bone Y already.
    def orbit_pose(u, t):
        return {f"mote_{i:02d}": orbit_m(i, t) for i in range(N)}

    A_ = FM.ASSEMBLE

    def ease(x):
        x = min(1.0, max(0.0, x))
        return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2

    def assemble_pose(u, t):
        out = {}
        for i in range(N):
            d = FM.assemble_delay(i)
            if t <= d:
                out[f"mote_{i:02d}"] = orbit_m(i, t)
                continue
            M0 = orbit_m(i, d)
            M1 = target_m(i)
            p0, p1 = M0.translation, M1.translation
            dist = (p1 - p0).length
            v0 = M0.col[1].to_3d()
            c1 = p0 + v0 * dist * 0.3 + Z * dist * A_["arc_lift"]
            c2 = p1 + gl_to_bl((0, 0, 1)) * A_["approach_m"]
            x = (t - d) / A_["flight_s"]
            e = ease(x)
            w = 1 - e
            p = w ** 3 * p0 + 3 * w * w * e * c1 + 3 * w * e * e * c2 + e ** 3 * p1
            if x > 1.0:
                k = (t - d - A_["flight_s"])
                p = p1 + gl_to_bl((0, 0, 1)) * A_["settle_overshoot"] * math.sin(k * 9) * math.exp(-k * 4)
            q = M0.to_quaternion().slerp(M1.to_quaternion(), e)
            M = q.to_matrix().to_4x4()
            M.translation = p
            out[f"mote_{i:02d}"] = M
        if u >= 1.0:  # land exactly on the formation
            out = {f"mote_{i:02d}": target_m(i) for i in range(N)}
        return out

    acts = [bake_clip(arm, "orbit", int(FM.ORBIT["period_s"] * FPS), orbit_pose, step=2, mode="matrix"),
            bake_clip(arm, "assemble", int(A_["duration_s"] * FPS), assemble_pose, step=1, mode="matrix")]
    stash_clips(arm, acts)
    return {"objs": [single, arm, swarm], "clips": {"orbit": True, "assemble": False}, "frame_step": 2}


# ------------------------------------------------------------------ cloudwhale

def build_cloudwhale(col):
    """Colossal far-background silhouette (~140 m): a segmented nacre body like the
    Guests' torso plates, a coiled whorl crest on the head, two pairs of vast torn
    fin-sails, a trailing veil, crystal growths on the back and gold lanterns."""
    A = "fauna_cloudwhale"
    rng = random.Random(77)
    m_body = tex_material(A, "nacre", nacre_maps(1024, 77, base=(0.58, 0.61, 0.63), bands=30, lichen=0.4, gold=0.5, grime=0.7))
    rgb, alpha, orm, nrm = membrane_maps(1024, 78, cells=9, rays=5, base=(0.55, 0.58, 0.6), holes=0.3)
    m_fin = tex_material(A, "membrane", (rgb, orm, nrm), double_sided=True, alpha=alpha)
    m_glow = glow_material(A, color=(1.0, 0.75, 0.40), strength=8.0)
    mats = [m_body, m_fin, m_glow]
    Y0, Y1 = -70.0, 48.0
    sp = [Vector((0, lerp(Y0, 85, k / 8), 0)) for k in range(9)]
    bones = [("root", (0, 0, 0), (0, 0, 6), None)]
    bones += chain("spine", sp, "root")

    def spine_bone(y):
        k = int(min(7, max(0, (y - Y0) / (85 - Y0) * 8)))
        return f"spine_{k}"

    fins = {"FL": (1, -28.0, 46.0), "FR": (-1, -28.0, 46.0), "BL": (1, 6.0, 26.0), "BR": (-1, 6.0, 26.0)}

    def rad(t):
        return table([0, 0.05, 0.16, 0.32, 0.55, 0.78, 1.0], [2.5, 8.0, 11.5, 11.0, 8.5, 4.5, 1.2], t)

    def fin_xyz(side, y0, span, s, c):
        x = side * (rad((y0 - Y0) / (Y1 - Y0)) * 0.8 + span * s)
        chord = (1 - s) ** 0.7 * span * 0.42 + 0.6
        yle = y0 - span * 0.05 + span * 0.32 * s ** 1.4
        fr = 0.0
        if s > 0.1:
            fr = span * 0.025 * abs(math.sin(5.5 * math.pi * s)) * c ** 6
            fr += span * 0.12 * math.exp(-((s - 0.62) / 0.04) ** 2) * c ** 5
        y = yle + chord * c - fr
        z = -1.0 + span * (0.08 * s ** 2 - 0.02 * s) + 1.5 * math.sin(math.pi * c) * (1 - s)
        return Vector((x, y, z))

    for nm, (side, y0, span) in fins.items():
        pts = [fin_xyz(side, y0, span, s, 0.35) for s in (0.0, 0.5, 1.0)]
        bones += chain(f"fin_{nm}", pts, spine_bone(y0))
    veil = [Vector((0, 85 + 18 * k, -1.0 - 1.0 * k)) for k in range(4)]
    bones += chain("veil", veil, "spine_7")
    arm = make_armature(A + "_rig", bones, col)

    mb = MB()
    NR, NA = 24, 14
    R = []
    for i in range(NR):
        t = i / (NR - 1)
        y = lerp(Y0, Y1, t)
        r = rad(t) * (1.0 + (0.045 if i % 2 else -0.02))
        ring = []
        for j in range(NA):
            a = TAU * j / NA
            ca, sa = math.cos(a), math.sin(a)
            zz = r * (0.78 * sa if sa > 0 else 0.62 * sa) + 1.2 * math.exp(-(ca / 0.2) ** 2) * (sa > 0) * r / 10
            ring.append(Vector((r * ca, y, zz)))
        R.append(ring)
    tags = {"body": [f"spine_{k}" for k in range(8)]}
    mb.rings(R, 0, "body", v_of=lambda i: i / (NR - 1) * 3.0, u_span=1.0,
             cap0=Vector((0, Y0 - 2.5, -0.5)), cap1=Vector((0, Y1 + 3, 0)))
    # coiled crest on the head
    pts = []
    for i in range(30):
        s = i / 29
        a = s * 2.6 * math.pi
        r = 9.0 * math.exp(-0.38 * a)
        pts.append(Vector((0, Y0 + 14 - r * math.sin(a), 8.5 + 9.0 - r * math.cos(a) * 1.0)))
    mb.tube(pts, lambda s: 3.4 * (1 - s) ** 1.1 + 0.25, 8, 0, "body", u_span=1.0, v_scale=0.05,
            rmod=lambda s, a: 1 + 0.06 * math.sin(s * 40) ** 8)
    # fins with spines
    S, C = 11, 6
    for nm, (side, y0, span) in fins.items():
        tg = f"fin{nm}"
        tags[tg] = [f"fin_{nm}_0", f"fin_{nm}_1", spine_bone(y0)]
        P = [[fin_xyz(side, y0, span, i / (S - 1), j / (C - 1)) for j in range(C)] for i in range(S)]
        U = [[(i / (S - 1), j / (C - 1)) for j in range(C)] for i in range(S)]
        mb.grid(P, U, 1, tg, flip=(side < 0))
        for c0 in (0.05, 0.3, 0.55, 0.8):
            sp_pts = [fin_xyz(side, y0, span, 0.02 + 0.9 * i / 7 * (1 - 0.2 * c0), c0 + (0.4 - c0) * 0.3 * i / 7) + Vector((0, 0, 0.3))
                      for i in range(8)]
            mb.tube(sp_pts, lambda s: 0.7 * (1 - s) + 0.1, 3, 0, tg, cap0=False)
    # trailing veil ribbons
    tags["veil"] = [f"veil_{k}" for k in range(3)] + ["spine_7"]
    for r_i in range(5):
        off = (r_i - 2) * 2.2
        P, U = [], []
        for i in range(17):
            s = i / 16
            y = 40 + 55 * s + r_i * 1.5
            wdt = 2.2 * (1 - s) + 0.3
            row = [Vector((off - wdt / 2 + 1.5 * s * (r_i - 2), y, -1.0 - 3.0 * s)),
                   Vector((off + wdt / 2 + 1.5 * s * (r_i - 2), y, -1.0 - 3.0 * s))]
            P.append(row)
            U.append([(0.9, s), (1.0, s)])
        mb.grid(P, U, 1, "veil")
    # crystal growths and lanterns
    for i in range(12):
        t = rng.uniform(0.12, 0.7)
        y = lerp(Y0, Y1, t)
        a = math.pi / 2 + rng.uniform(-0.6, 0.6)
        r = rad(t)
        base = Vector((r * math.cos(a), y, r * 0.78 * math.sin(a)))
        dirv = Vector((math.cos(a) * 0.6, rng.uniform(-0.3, 0.3), 1)).normalized()
        mb.gem(base + dirv * 1.5, dirv, rng.uniform(4, 8), rng.uniform(0.8, 1.4), 5, 0, "body")
    for side in (1, -1):
        for i in range(10):
            t = 0.08 + 0.07 * i
            y = lerp(Y0, Y1, t)
            r = rad(t) * 0.93
            a = -0.35
            mb.gem(Vector((side * r * math.cos(a), y, r * 0.62 * math.sin(a))), Vector((side, 0, 0)), 1.6, 0.6, 4, 2, "body")
    obj = mb.finish(A, mats, col, arm, tags, power=4.0, eps=1.5)

    def swim(u, t):
        phi = TAU * u
        p = {"root": (Q(X, 1.2 * math.sin(phi + 0.5)), Vector((0, 0, 1.5 * math.sin(phi))), None)}
        for k in range(8):
            p[f"spine_{k}"] = (Q(X, 2.2 * math.sin(phi - 0.75 * k) * (0.4 + 0.15 * k)) @ Q(Z, 0.8 * math.sin(phi - 0.5 * k)), None, None)
        for nm, (side, y0, span) in fins.items():
            amp = 11.0 if nm[0] == "F" else 8.0
            ph = 0.0 if nm[0] == "F" else 1.3
            for i in range(2):
                a = amp * math.sin(2 * phi - ph - 0.7 * i)
                p[f"fin_{nm}_{i}"] = (Q(Y, -side * a) @ Q(X, 3 * math.cos(2 * phi - ph - 0.7 * i)), None, None)
        for k in range(3):
            p[f"veil_{k}"] = (Q(X, 6 * math.sin(phi - 1.2 - 0.9 * k)) @ Q(Z, 3 * math.sin(2 * phi - 0.8 * k)), None, None)
        return p

    acts = [bake_clip(arm, "swim", 720, swim, step=3)]
    stash_clips(arm, acts)
    return {"objs": [arm, obj], "clips": {"swim": True}, "frame_step": 3}


# ------------------------------------------------------------------ moss critter

def build_moss_critter(col):
    """Small shy creature of the Moss camp (0.3 m): a soft velvet body grown with
    moss fronds, six stubby legs, two feeler stalks with gold glow bulbs, little
    sail-fin ears, and a lichen-crusted nacre whorl shell on its back into which it
    hides (an echo of the Shells)."""
    A = "fauna_moss_critter"
    rng = random.Random(5150)
    m_shell = tex_material(A, "shell", nacre_maps(1024, 5150, base=(0.76, 0.74, 0.68), bands=26, lichen=0.75, gold=0.55))
    m_body = tex_material(A, "body", moss_body_maps(1024, 5151))
    m_glow = glow_material(A, color=(1.0, 0.78, 0.40), strength=6.0)
    mats = [m_shell, m_body, m_glow]
    BZ = 0.095
    feel = {}
    for side, sn in ((1, "L"), (-1, "R")):
        feel[sn] = spline([(side * 0.022, -0.105, 0.13), (side * 0.035, -0.13, 0.19), (side * 0.06, -0.16, 0.23), (side * 0.085, -0.2, 0.235)], 12)
    legs = {}
    for k, (sn, side, y) in enumerate((("FL", 1, -0.06), ("FR", -1, -0.06), ("ML", 1, 0.0), ("MR", -1, 0.0), ("BL", 1, 0.055), ("BR", -1, 0.055))):
        hip = Vector((side * 0.045, y, 0.065))
        knee = Vector((side * 0.075, y - 0.005, 0.045))
        foot = Vector((side * 0.085, y - 0.012, 0.004))
        legs[sn] = (hip, knee, foot)
    SH = Vector((0, 0.07, 0.15))   # shell coil centre
    bones = [("root", (0, 0, 0), (0, 0, 0.05), None),
             ("body", (0, 0.07, BZ), (0, -0.03, BZ), "root"),
             ("head", (0, -0.04, BZ + 0.01), (0, -0.14, BZ + 0.015), "body"),
             ("shell", tuple(SH - Vector((0, 0, 0.05))), tuple(SH + Vector((0, 0, 0.05))), "root")]
    for sn in "LR":
        pts = feel[sn]
        bones += chain(f"feeler_{sn}", [pts[i] for i in (0, 4, 8, 11)], "head")
        side = 1 if sn == "L" else -1
        bones.append((f"ear_{sn}", (side * 0.05, -0.085, 0.115), (side * 0.095, -0.07, 0.15), "head"))
    for sn, (hip, knee, foot) in legs.items():
        bones.append((f"leg_{sn}_0", tuple(hip), tuple(knee), "body"))
        bones.append((f"leg_{sn}_1", tuple(knee), tuple(foot), f"leg_{sn}_0"))
    arm = make_armature(A + "_rig", bones, col)

    mb = MB()
    # body
    NR, NA = 16, 16
    R = []
    for i in range(NR):
        t = i / (NR - 1)
        y = lerp(-0.15, 0.11, t)
        r = table([0, 0.08, 0.25, 0.38, 0.55, 0.8, 1.0], [0.012, 0.045, 0.06, 0.052, 0.072, 0.062, 0.03], t)
        zc = BZ + table([0, 0.3, 0.6, 1.0], [0.0, 0.012, 0.0, 0.03], t)
        ring = []
        for j in range(NA):
            a = TAU * j / NA
            ca, sa = math.cos(a), math.sin(a)
            ring.append(Vector((r * ca * 1.05, y, zc + r * (0.95 * sa if sa > 0 else 0.7 * sa))))
        R.append(ring)
    mb.rings(R, 1, "body", v_of=lambda i: i / (NR - 1), u_span=1.0, cap0=Vector((0, -0.153, BZ)), cap1=Vector((0, 0.115, BZ + 0.03)))
    # moss fronds on the back and head
    for i in range(40):
        t = rng.uniform(0.15, 0.75)
        y = lerp(-0.15, 0.11, t)
        r = table([0, 0.08, 0.25, 0.38, 0.55, 0.8, 1.0], [0.012, 0.045, 0.06, 0.052, 0.072, 0.062, 0.03], t)
        a = math.pi / 2 + rng.uniform(-1.1, 1.1)
        base = Vector((r * math.cos(a) * 1.0, y, BZ + r * 0.9 * math.sin(a)))
        nrm = Vector((math.cos(a), 0, math.sin(a))).normalized()
        tip = base + nrm * rng.uniform(0.015, 0.03) + Vector((rng.uniform(-0.005, 0.005), 0.01, 0))
        mb.tube([base - nrm * 0.004, base * 0.5 + tip * 0.5 + Vector((0, 0.004, 0)), tip], lambda s: 0.006 * (1 - s) + 0.001,
                3, 1, "body", cap0=False, u_span=0.1, v_scale=2)
    # legs
    for sn, (hip, knee, foot) in legs.items():
        tg = f"leg{sn}"
        mb.tube(spline([hip, knee, foot], 6), lambda s: 0.012 * (1 - 0.4 * s), 5, 1, tg, u_span=0.2, v_scale=3)
    # feelers + bulbs, ears
    for sn in "LR":
        side = 1 if sn == "L" else -1
        tg = f"feel{sn}"
        mb.tube(feel[sn], lambda s: 0.006 * (1 - 0.5 * s), 5, 1, tg, u_span=0.2, v_scale=3)
        tip = feel[sn][-1]
        d = (feel[sn][-1] - feel[sn][-2]).normalized()
        mb.gem(tip + d * 0.008, d, 0.03, 0.011, 6, 2, tg)
        # little fan ear (sail fin echo)
        P, U = [], []
        root_ = Vector((side * 0.048, -0.085, 0.113))
        for i in range(5):
            a = math.radians(-40 + 80 * i / 4)
            row, urow = [], []
            for j in range(3):
                rr = 0.045 * j / 2
                dirv = Vector((side * math.cos(a) * 0.8, -0.2 + 0.5 * math.sin(a) * 0.3, 0.55 + 0.4 * math.sin(a)))
                dirv.normalize()
                row.append(root_ + dirv * rr * (1.0 - 0.15 * (i % 2) * (j == 2)))
                urow.append((0.5 + 0.12 * j, i / 4 * 0.3))
            P.append(row)
            U.append(urow)
        mb.grid(P, U, 1, f"ear{sn}", flip=(side < 0))
        mb.grid(P, U, 1, f"ear{sn}", flip=(side > 0))
    # the shell: planispiral whorl, axis along X, aperture opening forward-down onto the body
    pts = []
    for i in range(46):
        s = i / 45
        a = 3.4 * math.pi * s
        r = 0.068 * math.exp(-0.30 * (3.4 * math.pi - a))
        # start in the middle of the coil, grow outward; aperture ends at the front-bottom
        ang = a + 0.35 * math.pi
        pts.append(SH + Vector((0.004 * (1 - s), -r * math.cos(ang) * 1.0, r * math.sin(ang))))
    pts = pts[::-1]
    mb.tube(pts, lambda s: 0.052 * math.exp(-2.9 * s) + 0.0015, 12, 0, "shell", u_span=1.0, v_scale=4.0,
            rmod=lambda s, a: 1 + 0.08 * max(0.0, math.sin(s * 70)) ** 6, cap0=False)
    tags = {"body": ["body", "head"], "shell": ["shell"]}
    for sn in legs:
        tags[f"leg{sn}"] = [f"leg_{sn}_0", f"leg_{sn}_1", "body"]
    for sn in "LR":
        tags[f"feel{sn}"] = [f"feeler_{sn}_{i}" for i in range(3)] + ["head"]
        tags[f"ear{sn}"] = [f"ear_{sn}", "head"]
    obj = mb.finish(A, mats, col, arm, tags, power=4.0, eps=0.006)

    def feelers(p, phi, extra=0.0, curl=0.0):
        for sn, sd in (("L", 1), ("R", -1)):
            for i in range(3):
                p[f"feeler_{sn}_{i}"] = (Q(X, 7 * math.sin(phi - 0.8 * i + sd) + extra + curl) @
                                         Q(Z, sd * 6 * math.sin(phi * 2 - 0.6 * i)), None, None)

    def idle(u, t):
        phi = TAU * u
        b = math.sin(2 * phi)
        p = {"body": (Q(X, 1.5 * math.sin(phi)), None, (1 + 0.03 * b, 1.0, 1 + 0.04 * b)),
             "head": (Q(Z, 12 * math.sin(phi)) @ Q(X, 4 * math.sin(2 * phi + 1)), None, None)}
        feelers(p, phi)
        flick = math.exp(-((((u - 0.62 + 0.5) % 1.0) - 0.5) / 0.04) ** 2)
        for sn, sd in (("L", 1), ("R", -1)):
            p[f"ear_{sn}"] = (Q(Y, sd * (-25 * flick + 4 * math.sin(phi))), None, None)
        return p

    def hop(u, t):
        phi = TAU * u
        z = 0.0
        crouch = math.exp(-((u - 0.12) / 0.07) ** 2) + math.exp(-((u - 0.85) / 0.07) ** 2) * 0.8
        if 0.2 <= u <= 0.7:
            z = 0.1 * math.sin(math.pi * (u - 0.2) / 0.5)
        air = 1.0 if 0.22 <= u <= 0.68 else 0.0
        air = math.sin(math.pi * min(1, max(0, (u - 0.2) / 0.5)))
        vz = math.cos(math.pi * min(1, max(0, (u - 0.2) / 0.5))) * air ** 0.2 if 0.2 <= u <= 0.7 else 0.0
        p = {"root": (QI, Vector((0, 0, z - 0.015 * crouch)), None),
             "body": (Q(X, -10 * vz * air + 6 * crouch), None, (1 + 0.1 * crouch - 0.05 * air, 1 + 0.08 * air, 1 - 0.14 * crouch + 0.06 * air)),
             "head": (Q(X, 6 * vz), None, None)}
        feelers(p, phi, extra=-18 * vz, curl=0.0)
        for sn, sd in (("L", 1), ("R", -1)):
            p[f"ear_{sn}"] = (Q(Y, sd * (-30 * air + 10 * crouch)), None, None)
        for sn in legs:
            sd = 1 if sn[1] == "L" else -1
            front = {"F": 1, "M": 0, "B": -1}[sn[0]]
            p[f"leg_{sn}_0"] = (Q(Y, sd * (25 * crouch - 15 * air)) @ Q(X, front * 20 * air), None, None)
            p[f"leg_{sn}_1"] = (Q(Y, sd * (-30 * crouch + 25 * air)), None, None)
        return p

    def hide(u, t):
        k = smooth(min(1.0, t / 0.45))
        settle = 0.0 if t < 0.45 else 0.004 * math.sin((t - 0.45) * 40) * math.exp(-(t - 0.45) * 6)
        p = {"root": (QI, Vector((0, 0, -0.01 * k)), None),
             "body": (Q(X, 20 * k), Vector((0, 0.07 * k, 0.03 * k)), (1 - 0.45 * k, 1 - 0.35 * k, 1 - 0.45 * k)),
             "head": (Q(X, 35 * k), Vector((0, 0.02 * k, 0.0)), (1 - 0.2 * k,) * 3),
             "shell": (Q(X, -24 * k) , Vector((0, -0.035 * k, -0.075 * k + settle)), None)}
        feelers(p, 0.0, extra=0, curl=-70 * k)
        for sn, sd in (("L", 1), ("R", -1)):
            p[f"ear_{sn}"] = (Q(Y, sd * -60 * k), None, None)
        for sn in legs:
            sd = 1 if sn[1] == "L" else -1
            p[f"leg_{sn}_0"] = (Q(Y, sd * -45 * k), None, None)
            p[f"leg_{sn}_1"] = (Q(Y, sd * 70 * k), None, None)
        return p

    acts = [bake_clip(arm, "idle", 120, idle), bake_clip(arm, "hop", 24, hop), bake_clip(arm, "hide", 36, hide)]
    stash_clips(arm, acts)
    return {"objs": [arm, obj], "clips": {"idle": True, "hop": True, "hide": False}}


CREATURES = {
    "skyray": build_skyray,
    "driftjelly": build_driftjelly,
    "glyphmote": build_glyphmote,
    "cloudwhale": build_cloudwhale,
    "moss_critter": build_moss_critter,
}


# =================================================================== export

def export_raw(name, info):
    path = os.path.join(OUT, f"fauna_{name}_raw.glb")
    os.makedirs(OUT, exist_ok=True)
    objs = info["objs"]
    ftf.select_only(objs, objs[0])
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
              export_yup=True, export_tangents=True, export_extras=True, export_image_format="AUTO",
              export_cameras=False, export_lights=False, export_skins=True, export_animations=True,
              export_animation_mode="ACTIONS", export_force_sampling=True,
              export_frame_step=info.get("frame_step", 1), export_optimize_animation_size=False,
              export_anim_single_armature=True, export_def_bones=False, export_all_influences=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as exc:
        log("export kw fallback:", exc)
        for k in ("export_anim_single_armature", "export_optimize_animation_size"):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    js = ftf.inspect_glb(path)
    log(name, "raw glb", js["bytes"], "bytes, tris", js["triangles_render"])
    return path, js


def stage_build(names):
    os.makedirs(OUT, exist_ok=True)
    summary = {}
    for nm in names:
        sc = ftf.reset_scene()
        sc.render.fps = FPS
        col = ftf.new_collection(nm)
        t = time.time()
        info = CREATURES[nm](col)
        path, js = export_raw(nm, info)
        summary[nm] = {"raw": os.path.relpath(path, REPO), "triangles": js["triangles_render"],
                       "nodes": js["nodes"], "clips": info["clips"], "seconds": round(time.time() - t, 1)}
        with open(os.path.join(OUT, f"fauna_{nm}_build.json"), "w") as fh:
            json.dump(summary[nm], fh, indent=1)
    log("build done", json.dumps({k: v["triangles"] for k, v in summary.items()}))


# =================================================================== QA renders

RENDER = {
    "skyray": {"clips": ["glide", "bank"], "view": (-0.55, -0.75, 0.55), "lens": 50},
    "driftjelly": {"clips": ["pulse"], "view": (0.6, -1.0, 0.25), "lens": 55},
    "glyphmote": {"clips": ["orbit", "assemble"], "view": (0.0, -1.0, 0.35), "lens": 35},
    "cloudwhale": {"clips": ["swim"], "view": (-0.8, -0.55, 0.35), "lens": 40},
    "moss_critter": {"clips": ["idle", "hop", "hide"], "view": (-0.75, -0.9, 0.5), "lens": 60, "ground": True},
}


def studio(sc, col, ground=False, center=Vector(), size=1.0):
    w = ftf.sky_world("Dusk", zenith=(0.10, 0.13, 0.18), horizon=(0.52, 0.46, 0.38), ground=(0.18, 0.2, 0.23), strength=0.9)
    sc.world = w
    ftf.add_sun(col, "Key", energy=4.0, color=(1.0, 0.82, 0.58), elev=24, azim=-50, angle=4)
    fill = ftf.add_sun(col, "Fill", energy=0.8, color=(0.62, 0.72, 0.9), elev=40, azim=140, angle=20)
    if ground:
        bpy.ops.mesh.primitive_circle_add(vertices=64, radius=size * 4, fill_type="NGON", location=(center.x, center.y, 0))
        g = bpy.context.active_object
        g.data.materials.append(ftf.simple_material("Ground", (0.16, 0.19, 0.13), rough=0.9))


def contact_sheet(name, frames_per_clip=6, res=(520, 360), samples=40):
    from PIL import Image, ImageDraw
    cfg = RENDER[name]
    sc = ftf.reset_scene()
    sc.render.fps = FPS
    ext = os.path.join(OUT, f"fauna_{name}_ext.glb")
    bpy.ops.import_scene.gltf(filepath=ext)
    col = ftf.new_collection("qa")
    arm = [o for o in sc.objects if o.type == "ARMATURE"][0]
    meshes = [o for o in sc.objects if o.type == "MESH"]
    if name == "glyphmote":
        for o in meshes:
            if o.name.startswith("glyphmote") and "swarm" not in o.name:
                o.hide_render = True
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks:
        tr.mute = True
    acts = {a.name: a for a in bpy.data.actions}
    log("imported actions", list(acts))
    ftf.use_gpu(sc, "fauna")
    ftf.setup_cycles(sc, res[0], res[1], samples)
    sc.cycles.max_bounces = 6
    sc.view_settings.look = "AgX - Medium High Contrast"
    cells = []
    # frame the union of the sampled poses
    plan = []
    for clip in cfg["clips"]:
        act = next((a for n, a in acts.items() if n == clip or n.startswith(clip + "_") or n.endswith("_" + clip)), None)
        if act is None:
            act = next(a for n, a in acts.items() if clip in n)
        f0, f1 = act.frame_range
        loop = clip not in ("assemble", "hide")
        k = frames_per_clip
        fr = [f0 + (f1 - f0) * (i / k if loop else i / (k - 1)) for i in range(k)]
        plan.append((clip, act, fr, f1 - f0))
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for clip, act, fr, _ in plan:
        ad.action = act
        if hasattr(ad, "action_slot") and act.slots:
            ad.action_slot = act.slots[0]
        for f in fr:
            sc.frame_set(int(round(f)))
            for o in meshes:
                if o.hide_render:
                    continue
                a, b = ftf.world_bounds([o.evaluated_get(bpy.context.evaluated_depsgraph_get())])
                lo = Vector(map(min, lo, a))
                hi = Vector(map(max, hi, b))
    center = (lo + hi) / 2
    size = max((hi - lo).length / 2, 0.05)
    studio(sc, col, cfg.get("ground", False), center, size)
    view = Vector(cfg["view"]).normalized()
    dist = size / math.tan(math.radians(36 / 2) * 50 / cfg["lens"]) * 1.05
    cam = ftf.add_camera("cam", center + view * dist, center, lens=cfg["lens"], col=col, clip_end=dist * 10)
    sc.camera = cam
    for clip, act, fr, length in plan:
        ad.action = act
        if hasattr(ad, "action_slot") and act.slots:
            ad.action_slot = act.slots[0]
        row = []
        for f in fr:
            sc.frame_set(int(round(f)))
            p = os.path.join(OUT, "qa", f"{name}_{clip}_{int(round(f)):04d}.jpg")
            ftf.render_to(sc, cam, p)
            row.append((p, (f - fr[0]) / FPS))
        cells.append((clip, row, length / FPS))
    pad, lab = 6, 26
    W = frames_per_clip * res[0] + (frames_per_clip + 1) * pad
    H = len(cells) * (res[1] + lab + pad) + pad + 30
    sheet = Image.new("RGB", (W, H), (22, 24, 28))
    dr = ImageDraw.Draw(sheet)
    dr.text((pad, 8), f"fauna_{name}.glb - clips rendered from the post-processed glb on the GPU (Cycles OPTIX)", fill=(230, 220, 200))
    y = 30
    for clip, row, length in cells:
        dr.text((pad, y + 6), f"{clip}  ({length:.2f} s)", fill=(240, 200, 120))
        for i, (p, tt) in enumerate(row):
            im = Image.open(p)
            x = pad + i * (res[0] + pad)
            sheet.paste(im, (x, y + lab))
            dr.text((x + 6, y + lab + 6), f"t={tt:.2f}s", fill=(255, 255, 255))
        y += res[1] + lab + pad
    sheet = sheet.resize((W * 2 // 3, H * 2 // 3), Image.LANCZOS)
    os.makedirs(QA, exist_ok=True)
    out = os.path.join(QA, f"{name}_contact.jpg")
    q = 85
    while True:
        sheet.save(out, quality=q, optimize=True)
        if os.path.getsize(out) < 290_000 or q < 50:
            break
        q -= 7
    log("sheet", out, os.path.getsize(out))
    return out


def stage_render(names):
    ftf.reset_scene()
    for nm in names:
        contact_sheet(nm)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    stage = argv[0] if argv else "build"
    names = argv[1:] or list(CREATURES)
    if stage in ("build", "all"):
        stage_build(names)
    if stage in ("render", "all"):
        stage_render(names)
